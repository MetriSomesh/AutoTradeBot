import "dotenv/config";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { dispatchOwnerAlert } from "./alerts";
import {
  assertLiveCloseArmed,
  closeShortPosition,
  describeDeltaConnectivityFailure,
  DeltaApiError,
  filledSize,
  getDeltaRuntime,
  getPosition,
  getTickers,
  placeOrder,
  selectScheduledBtcStrangle,
} from "./delta";
import {
  createClosedTrade,
  createAdoptedTradePair,
  createPartialClose,
  createNotification,
  getActiveTradePair,
  getPendingCloseRequestForPair,
  getOrCreateRiskSettings,
  getWatchdogState,
  listActiveTradePairs,
  listEnabledScheduledEntryTriggers,
  recordTradeEvent,
  recordTradeSnapshot,
  reserveScheduledEntryAttempt,
  tryAcquireWorkerLease,
  updateCloseRequest,
  updatePairRuntimeState,
  updateScheduledEntryAttempt,
  updateWatchdogState,
} from "./db";
import { calculatePairPnl, calculatePartialCloseLots, evaluateExit, shouldCloseAtAutoProfitTarget } from "./strategy";
import { getUserDeltaCredentials } from "./user-delta";
import { getUnderlyingDetails, underlyingFromOptionSymbol } from "../shared/option-underlying";
import { assertDemoScheduledEntryArmed, isScheduledEntryTriggerDue } from "./scheduled-entry";

const WORKER_ID = `tmt-watchdog-${process.pid}-${randomUUID().slice(0, 8)}`;
const LEASE_NAME = "tmt-btc-options-watchdog";
const POLL_MS = ENV.workerPollSeconds * 1_000;
let stopping = false;

const asNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const decimal = (value: number, places = 2) => (Number.isFinite(value) ? value : 0).toFixed(places);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function getPairSpotSymbol(ceSymbol: string) {
  const underlying = underlyingFromOptionSymbol(ceSymbol);
  if (!underlying) throw new DeltaApiError(`Unsupported option underlying in ${ceSymbol}.`);
  return getUnderlyingDetails(underlying).spotSymbol;
}

function pairExitValues(pair: {
  ceSymbol: string;
  ceEntry: string;
  peEntry: string;
  lots: number;
}, ceMark: number, peMark: number, spot: number, usdInr: number) {
  const underlying = underlyingFromOptionSymbol(pair.ceSymbol);
  if (!underlying) throw new DeltaApiError(`Unsupported option underlying in ${pair.ceSymbol}.`);
  return calculatePairPnl(
    {
      ceEntry: asNumber(pair.ceEntry),
      peEntry: asNumber(pair.peEntry),
      ceMark,
      peMark,
      spot,
      lots: pair.lots,
      contractValue: getUnderlyingDetails(underlying).contractValue,
    },
    usdInr,
  );
}

async function recordSafetyEvent(input: {
  ownerId: number;
  pairId?: number;
  level: "info" | "warning" | "critical";
  type: string;
  message: string;
  notify?: boolean;
  payload?: Record<string, unknown>;
}) {
  await recordTradeEvent({
    ownerId: input.ownerId,
    pairId: input.pairId,
    level: input.level,
    eventType: input.type,
    message: input.message,
    payload: input.payload,
  });
  if (input.notify) {
    const notification = await createNotification({
      ownerId: input.ownerId,
      pairId: input.pairId,
      kind: input.type,
      title: "TMT Watchdog Alert",
      body: input.message,
    });
    await dispatchOwnerAlert(notification);
  }
}

export async function markEmergency(ownerId: number, pairId: number, reason: string, error?: unknown) {
  const detail = error instanceof Error ? error.message : error ? String(error) : undefined;
  await updatePairRuntimeState(pairId, { status: "emergency", closeReason: reason });
  await updateWatchdogState(ownerId, {
    status: "emergency",
    closeRequested: false,
    lastError: detail ?? reason,
    lastPollAt: new Date(),
    workerId: WORKER_ID,
  });
  await recordSafetyEvent({
    ownerId,
    pairId,
    level: "critical",
    type: "EMERGENCY_STOP",
    message: detail ? `${reason}: ${detail}` : reason,
    notify: true,
  });
}

export async function markWatchdogDegraded(ownerId: number, pairId: number, error: unknown) {
  const message = describeDeltaConnectivityFailure(error);
  const prior = await getWatchdogState(ownerId);
  await updateWatchdogState(ownerId, {
    pairId,
    status: "degraded",
    lastPollAt: new Date(),
    workerId: WORKER_ID,
    lastError: message,
  });
  // Persist every failed poll, but avoid an event and notification flood while
  // an IP allowlist or connection problem remains unchanged.
  if (prior?.status !== "degraded" || prior.lastError !== message) {
    await recordSafetyEvent({
      ownerId,
      pairId,
      level: "critical",
      type: "WATCHDOG_ERROR",
      message: `Watchdog monitoring is paused until Delta read access recovers: ${message}`,
      notify: true,
    });
  }
}

export async function closePair(input: {
  ownerId: number;
  pair: Awaited<ReturnType<typeof getActiveTradePair>> & {};
  risk: Awaited<ReturnType<typeof getOrCreateRiskSettings>>;
  reason: string;
  requestId?: number;
  closePercent?: 25 | 50 | 75 | 100;
  credentials: Awaited<ReturnType<typeof getUserDeltaCredentials>>;
  prices?: { ceMark: number; peMark: number; spot: number };
}) {
  const pair = input.pair;
  if (!pair) return;
  const trackedLots = Math.max(1, pair.remainingLots || pair.lots);
  const closePercent = input.closePercent ?? 100;
  const lotsToClose = calculatePartialCloseLots(trackedLots, closePercent);
  if (closePercent === 100) await updatePairRuntimeState(pair.id, { status: "closing", closeReason: input.reason });
  if (input.requestId) await updateCloseRequest(input.requestId, "processing");

  try {
    assertLiveCloseArmed(input.risk, input.credentials);
    const [ceClose, peClose] = await Promise.all([
      closeShortPosition({ productId: pair.ceProductId, symbol: pair.ceSymbol, size: lotsToClose, credentials: input.credentials, clientOrderId: `tmtx${pair.id}ce${Date.now()}`.slice(0, 32) }),
      closeShortPosition({ productId: pair.peProductId, symbol: pair.peSymbol, size: lotsToClose, credentials: input.credentials, clientOrderId: `tmtx${pair.id}pe${Date.now()}`.slice(0, 32) }),
    ]);

    const quotes = input.prices ?? (() => undefined)();
    const spotSymbol = getPairSpotSymbol(pair.ceSymbol);
    const freshQuotes = quotes ? undefined : await getTickers([pair.ceSymbol, pair.peSymbol, spotSymbol], input.credentials);
    const ceMark = quotes?.ceMark ?? freshQuotes?.get(pair.ceSymbol)?.mark ?? 0;
    const peMark = quotes?.peMark ?? freshQuotes?.get(pair.peSymbol)?.mark ?? 0;
    const spot = quotes?.spot ?? freshQuotes?.get(spotSymbol)?.mark ?? 0;
    if (ceMark <= 0 || peMark <= 0 || spot <= 0) {
      throw new DeltaApiError("Unable to record valid exit marks after reduce-only close.");
    }

    const pnl = pairExitValues({ ...pair, lots: lotsToClose }, ceMark, peMark, spot, asNumber(input.risk.usdInr));
    if (closePercent < 100) {
      const remainingLots = Math.max(0, trackedLots - lotsToClose);
      await createPartialClose({
        ownerId: input.ownerId,
        pairId: pair.id,
        closeRequestId: input.requestId ?? 0,
        closePercent,
        ceLots: lotsToClose,
        peLots: lotsToClose,
        ceExit: decimal(ceMark, 6),
        peExit: decimal(peMark, 6),
        pnlUsd: decimal(pnl.pnlUsd),
        feesInr: decimal(pnl.feesInr),
        netInr: decimal(pnl.netInr),
        reason: input.reason,
      });
      await updatePairRuntimeState(pair.id, { status: "adopted", remainingLots, closeReason: `Partial ${closePercent}% close: ${input.reason}` });
      await updateWatchdogState(input.ownerId, { pairId: pair.id, status: "healthy", closeRequested: false, lastPollAt: new Date(), workerId: WORKER_ID, lastError: null });
      if (input.requestId) await updateCloseRequest(input.requestId, "completed");
      await recordSafetyEvent({ ownerId: input.ownerId, pairId: pair.id, level: "warning", type: "PARTIAL_CLOSE_COMPLETED", message: `${closePercent}% paired reduce-only close completed; ${remainingLots} lots remain per leg.`, notify: true, payload: { ceClose, peClose, lotsToClose, remainingLots, netInr: pnl.netInr } });
      return;
    }
    await createClosedTrade({
      ownerId: input.ownerId,
      pairId: pair.id,
      ceSymbol: pair.ceSymbol,
      peSymbol: pair.peSymbol,
      lots: trackedLots,
      ceEntry: pair.ceEntry,
      peEntry: pair.peEntry,
      ceExit: decimal(ceMark, 6),
      peExit: decimal(peMark, 6),
      pnlUsd: decimal(pnl.pnlUsd),
      feesInr: decimal(pnl.feesInr),
      netInr: decimal(pnl.netInr),
      note: input.reason,
      closedAt: new Date(),
    });
    await updatePairRuntimeState(pair.id, { status: "closed", remainingLots: 0, closeReason: input.reason, closedAt: new Date(), profitHighInr: null });
    await updateWatchdogState(input.ownerId, {
      pairId: null,
      status: "healthy",
      manualHold: false,
      closeRequested: false,
      profitHighInr: null,
      lastPollAt: new Date(),
      workerId: WORKER_ID,
      lastError: null,
    });
    if (input.requestId) await updateCloseRequest(input.requestId, "completed");
    await recordSafetyEvent({
      ownerId: input.ownerId,
      pairId: pair.id,
      level: "warning",
      type: "PAIR_CLOSED",
      message: `Paired reduce-only closure completed: ${input.reason}`,
      notify: true,
      payload: { ceClose, peClose, netInr: pnl.netInr },
    });
  } catch (error) {
    if (input.requestId) await updateCloseRequest(input.requestId, "failed", error instanceof Error ? error.message : String(error));
    await markEmergency(input.ownerId, pair.id, `Paired close failed after trigger: ${input.reason}`, error);
  }
}

export async function runPairCycle(pair: NonNullable<Awaited<ReturnType<typeof getActiveTradePair>>>) {
  const ownerId = pair.ownerId;
  try {
    const [risk, credentials] = await Promise.all([getOrCreateRiskSettings(ownerId), getUserDeltaCredentials(ownerId)]);
    const pendingClose = await getPendingCloseRequestForPair(pair.id);
    if (pendingClose) {
      await closePair({ ownerId, pair, risk, credentials, closePercent: pendingClose.closePercent as 25 | 50 | 75 | 100, reason: `Confirmed ${pendingClose.closePercent}% close request: ${pendingClose.reason}`, requestId: pendingClose.id });
      return;
    }

    if (getDeltaRuntime(credentials).mode === "paper") throw new DeltaApiError("An adopted pair cannot be protected with a paper-mode Delta credential.");
    const spotSymbol = getPairSpotSymbol(pair.ceSymbol);
    const [cePosition, pePosition, quotes] = await Promise.all([
      getPosition(pair.ceProductId, credentials),
      getPosition(pair.peProductId, credentials),
      getTickers([pair.ceSymbol, pair.peSymbol, spotSymbol], credentials),
    ]);
    if (cePosition.size >= 0 || pePosition.size >= 0) {
      const side = cePosition.size >= 0 && pePosition.size >= 0 ? "both positions" : cePosition.size >= 0 ? "CE position" : "PE position";
      await closePair({ ownerId, pair, risk, credentials, reason: `Native bracket or external action made ${side} flat; reconciling the paired trade.` });
      return;
    }

    const ceMark = quotes.get(pair.ceSymbol)?.mark ?? 0;
    const peMark = quotes.get(pair.peSymbol)?.mark ?? 0;
    const spot = quotes.get(spotSymbol)?.mark ?? 0;
    if (ceMark <= 0 || peMark <= 0 || spot <= 0) throw new DeltaApiError(`A current CE, PE, or ${spotSymbol} mark is unavailable.`);
    const effectiveLots = Math.max(1, pair.remainingLots || pair.lots);
    const pnl = pairExitValues({ ...pair, lots: effectiveLots }, ceMark, peMark, spot, asNumber(risk.usdInr));
    const watchdog = await getWatchdogState(ownerId);
    const manualExitMode = risk.exitMode === "manual" || pair.manualHold;
    const decision = evaluateExit({
      pricing: { ceEntry: asNumber(pair.ceEntry), peEntry: asNumber(pair.peEntry), ceMark, peMark, spot, lots: effectiveLots },
      pnl,
      risk: { usdInr: asNumber(risk.usdInr), maxTradeLossInr: asNumber(risk.maxTradeLossInr), profitTrailStartInr: asNumber(risk.profitTrailStartInr), profitTrailDrawdownInr: asNumber(risk.profitTrailDrawdownInr) },
      manualHold: manualExitMode,
      priorProfitHighInr: asNumber(watchdog.profitHighInr) || null,
      positionOpenedAt: pair.createdAt,
    });
    const target = asNumber(risk.autoProfitTargetInr);
    const autoTargetReached = shouldCloseAtAutoProfitTarget({ exitMode: risk.exitMode, targetInr: target, netInr: pnl.netInr });

    await recordTradeSnapshot({ pairId: pair.id, spot: decimal(spot, 6), ceMark: decimal(ceMark, 6), peMark: decimal(peMark, 6), pnlUsd: decimal(pnl.pnlUsd), pnlInr: decimal(pnl.pnlInr), feesInr: decimal(pnl.feesInr), netInr: decimal(pnl.netInr), status: pnl.netInr > 0 ? "IN PROFIT" : pnl.netInr < 0 ? "IN LOSS" : "BREAK EVEN" });
    await updatePairRuntimeState(pair.id, { profitHighInr: decision.nextProfitHighInr === null ? null : decimal(decision.nextProfitHighInr) });
    await updateWatchdogState(ownerId, { pairId: pair.id, status: "healthy", manualHold: manualExitMode, closeRequested: false, profitHighInr: decision.nextProfitHighInr === null ? null : decimal(decision.nextProfitHighInr), lastPollAt: new Date(), lastSnapshotAt: new Date(), workerId: WORKER_ID, lastError: null });

    if (autoTargetReached || decision.shouldClose) {
      const reason = autoTargetReached ? `Auto net-profit target reached: ₹${target.toFixed(2)} (current net ₹${pnl.netInr.toFixed(2)}).` : decision.reason;
      const action = autoTargetReached ? "AUTO_PROFIT_TARGET" : decision.action;
      await recordSafetyEvent({ ownerId, pairId: pair.id, level: action === "coupled_sl" || action === "max_loss" ? "critical" : "warning", type: action.toUpperCase(), message: reason, notify: action === "coupled_sl" || action === "max_loss" || action === "AUTO_PROFIT_TARGET" });
      await closePair({ ownerId, pair, risk, credentials, reason, prices: { ceMark, peMark, spot } });
    }
  } catch (error) {
    await markWatchdogDegraded(ownerId, pair.id, error);
  }
}

async function flattenScheduledEntryLegs(input: { ceProductId: number; ceSymbol: string; peProductId: number; peSymbol: string; credentials: Awaited<ReturnType<typeof getUserDeltaCredentials>> }) {
  const closeIfShort = async (productId: number, symbol: string, clientOrderId: string) => {
    const position = await getPosition(productId, input.credentials, "BTC");
    if (position.size < 0) await closeShortPosition({ productId, symbol, credentials: input.credentials, clientOrderId });
  };
  const outcomes = await Promise.allSettled([
    closeIfShort(input.ceProductId, input.ceSymbol, `tmtflatce${Date.now()}`.slice(0, 32)),
    closeIfShort(input.peProductId, input.peSymbol, `tmtflatpe${Date.now()}`.slice(0, 32)),
  ]);
  const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  if (failures.length) throw failures[0].reason;
}

export async function runScheduledEntryCycle(now = new Date()) {
  const triggers = await listEnabledScheduledEntryTriggers();
  for (const trigger of triggers) {
    const schedule = isScheduledEntryTriggerDue({ timeIst: trigger.timeIst, weekdays: trigger.weekdays, now });
    if (!schedule.due) continue;
    const ownerId = trigger.ownerId;
    let attemptId: number | null = null;
    try {
      const requestedLots = trigger.lots;
      const reservation = await reserveScheduledEntryAttempt({ ownerId, triggerId: trigger.id, triggerTimeIst: trigger.timeIst, istTradeDate: schedule.istTradeDate, requestedLots });
      if (!reservation.reserved) continue;
      attemptId = reservation.attempt.id;
      const credentials = await getUserDeltaCredentials(ownerId);
      const settings = await getOrCreateRiskSettings(ownerId);
      assertDemoScheduledEntryArmed({
        enabled: trigger.enabled,
        manualOnlyMode: settings.manualOnlyMode,
        credentialMode: credentials.mode,
        serverEnabled: ENV.demoScheduledEntryEnabled,
        serverAcknowledgement: ENV.demoScheduledEntryAcknowledgement,
        expectedAcknowledgement: ENV.demoScheduledEntryAcknowledgementPhrase,
      });
      if (await getActiveTradePair(ownerId)) {
        await updateScheduledEntryAttempt(attemptId, { status: "skipped", error: "Skipped because an active adopted pair already exists for this account." });
        await recordSafetyEvent({ ownerId, level: "warning", type: "SCHEDULED_ENTRY_SKIPPED_ACTIVE_PAIR", message: `Scheduled ${trigger.timeIst} IST demo entry skipped because an active pair already exists.`, notify: false, payload: { attemptId, triggerId: trigger.id } });
        continue;
      }

      const selected = await selectScheduledBtcStrangle({
        premiumMin: asNumber(trigger.premiumMin),
        premiumMax: asNumber(trigger.premiumMax),
        credentials,
        now,
      });
      await updateScheduledEntryAttempt(reservation.attempt.id, {
        ceSymbol: selected.ce.symbol,
        peSymbol: selected.pe.symbol,
        ceProductId: selected.ce.productId,
        peProductId: selected.pe.productId,
      });
      const orderOutcomes = await Promise.allSettled([
        placeOrder({ productId: selected.ce.productId, symbol: selected.ce.symbol, side: "sell", size: requestedLots, orderType: "limit_order", limitPrice: selected.ce.bid, timeInForce: "ioc", credentials, clientOrderId: `tmtentce${reservation.attempt.id}`.slice(0, 32) }),
        placeOrder({ productId: selected.pe.productId, symbol: selected.pe.symbol, side: "sell", size: requestedLots, orderType: "limit_order", limitPrice: selected.pe.bid, timeInForce: "ioc", credentials, clientOrderId: `tmtentpe${reservation.attempt.id}`.slice(0, 32) }),
      ]);
      const ceFilledLots = orderOutcomes[0].status === "fulfilled" ? filledSize(orderOutcomes[0].value) : 0;
      const peFilledLots = orderOutcomes[1].status === "fulfilled" ? filledSize(orderOutcomes[1].value) : 0;
      await updateScheduledEntryAttempt(reservation.attempt.id, { ceFilledLots, peFilledLots });
      if (orderOutcomes.some(outcome => outcome.status === "rejected") || ceFilledLots !== requestedLots || peFilledLots !== requestedLots) {
        await flattenScheduledEntryLegs({ ceProductId: selected.ce.productId, ceSymbol: selected.ce.symbol, peProductId: selected.pe.productId, peSymbol: selected.pe.symbol, credentials });
        const orderError = orderOutcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected").map(outcome => outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)).join("; ");
        await updateScheduledEntryAttempt(reservation.attempt.id, { status: "flattened", error: `IOC entry did not fill both ${requestedLots}-lot legs equally (CE=${ceFilledLots}, PE=${peFilledLots})${orderError ? `; ${orderError}` : ""}; all detected short legs were flattened.` });
        await recordSafetyEvent({ ownerId, level: "critical", type: "SCHEDULED_ENTRY_FLATTENED", message: `Demo scheduled entry was flattened because IOC fills were not equal: CE=${ceFilledLots}, PE=${peFilledLots}.`, notify: true, payload: { attemptId: reservation.attempt.id, ce: selected.ce.symbol, pe: selected.pe.symbol } });
        continue;
      }
      const [cePosition, pePosition] = await Promise.all([
        getPosition(selected.ce.productId, credentials, "BTC"),
        getPosition(selected.pe.productId, credentials, "BTC"),
      ]);
      if (cePosition.size !== -requestedLots || pePosition.size !== -requestedLots) {
        await flattenScheduledEntryLegs({ ceProductId: selected.ce.productId, ceSymbol: selected.ce.symbol, peProductId: selected.pe.productId, peSymbol: selected.pe.symbol, credentials });
        await updateScheduledEntryAttempt(reservation.attempt.id, { status: "flattened", error: `Post-entry reconciliation failed (CE=${cePosition.size}, PE=${pePosition.size}); all detected short legs were flattened.` });
        await recordSafetyEvent({ ownerId, level: "critical", type: "SCHEDULED_ENTRY_RECONCILIATION_FAILED", message: "Demo scheduled entry was flattened because Delta positions did not match the requested paired size.", notify: true, payload: { attemptId: reservation.attempt.id } });
        continue;
      }
      const pair = await createAdoptedTradePair({
        ownerId,
        ceSymbol: selected.ce.symbol,
        peSymbol: selected.pe.symbol,
        ceProductId: selected.ce.productId,
        peProductId: selected.pe.productId,
        lots: requestedLots,
        ceEntry: (cePosition.entryPrice || selected.ce.bid).toFixed(6),
        peEntry: (pePosition.entryPrice || selected.pe.bid).toFixed(6),
        protectionStatus: "SCHEDULED_DEMO_ENTRY",
        mode: "bot",
      });
      await updateScheduledEntryAttempt(reservation.attempt.id, { status: "opened" });
      await recordSafetyEvent({ ownerId, pairId: pair.id, level: "warning", type: "SCHEDULED_DEMO_ENTRY_OPENED", message: `Demo 10:00 PM IST BTC short strangle opened and adopted: ${pair.ceSymbol} / ${pair.peSymbol}, ${requestedLots} lots each.`, notify: true, payload: { attemptId: reservation.attempt.id, expiry: selected.expiry, ceBid: selected.ce.bid, peBid: selected.pe.bid } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attemptId) {
        await updateScheduledEntryAttempt(attemptId, { status: "failed", error: message });
        await recordSafetyEvent({ ownerId, level: "critical", type: "SCHEDULED_ENTRY_FAILED", message: `Demo scheduled entry was not opened: ${message}`, notify: true, payload: { attemptId } });
      }
    }
  }
}

export async function runCycle() {
  if (!(await tryAcquireWorkerLease(LEASE_NAME, WORKER_ID))) return;
  await runScheduledEntryCycle();
  const pairs = await listActiveTradePairs();
  for (const pair of pairs) await runPairCycle(pair);
}

async function main() {
  console.log(`[Watchdog] ${WORKER_ID} started; polling every ${ENV.workerPollSeconds}s.`);
  while (!stopping) {
    const startedAt = Date.now();
    try {
      await runCycle();
    } catch (error) {
      console.error("[Watchdog] Unexpected cycle error:", error);
    }
    const remaining = Math.max(0, POLL_MS - (Date.now() - startedAt));
    if (!stopping) await wait(remaining);
  }
  console.log("[Watchdog] stopped.");
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

if (process.argv[1]?.includes("watchdog-worker")) void main();
