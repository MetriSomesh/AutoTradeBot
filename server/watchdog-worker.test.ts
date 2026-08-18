import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClosedTrade,
  createAdoptedTradePair,
  createNotification,
  getActiveTradePair,
  getOrCreateRiskSettings,
  getPendingCloseRequestForPair,
  getWatchdogState,
  listActiveTradePairs,
  listEnabledScheduledEntryTriggers,
  recordTradeEvent,
  recordTradeSnapshot,
  reserveScheduledEntryAttempt,
  tryAcquireWorkerLease,
  updatePairRuntimeState,
  updateScheduledEntryAttempt,
  updateWatchdogState,
} from "./db";
import { dispatchOwnerAlert } from "./alerts";
import { assertLiveCloseArmed, closeShortPosition, getDeltaRuntime, getPosition, getTickers, placeOrder, selectScheduledBtcStrangle } from "./delta";
import { getUserDeltaCredentials } from "./user-delta";
import { ENV } from "./_core/env";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return {
    ...actual,
    createAdoptedTradePair: vi.fn(),
    createClosedTrade: vi.fn(),
    createNotification: vi.fn(),
    getActiveTradePair: vi.fn(),
    getOrCreateRiskSettings: vi.fn(),
    getPendingCloseRequestForPair: vi.fn(),
    getWatchdogState: vi.fn(),
    listActiveTradePairs: vi.fn(),
    listEnabledScheduledEntryTriggers: vi.fn(),
    recordTradeEvent: vi.fn(),
    recordTradeSnapshot: vi.fn(),
    reserveScheduledEntryAttempt: vi.fn(),
    tryAcquireWorkerLease: vi.fn(),
    updatePairRuntimeState: vi.fn(),
    updateScheduledEntryAttempt: vi.fn(),
    updateWatchdogState: vi.fn(),
  };
});
vi.mock("./alerts", () => ({ dispatchOwnerAlert: vi.fn() }));
vi.mock("./delta", async importActual => ({
  ...(await importActual<typeof import("./delta")>()),
  assertLiveCloseArmed: vi.fn(),
  closeShortPosition: vi.fn(),
  getDeltaRuntime: vi.fn(),
  getPosition: vi.fn(),
  getTickers: vi.fn(),
  placeOrder: vi.fn(),
  selectScheduledBtcStrangle: vi.fn(),
}));
vi.mock("./user-delta", () => ({ getUserDeltaCredentials: vi.fn() }));

import { closePair, getPairSpotSymbol, markEmergency, markWatchdogDegraded, runCycle, runPairCycle, runScheduledEntryCycle } from "./watchdog-worker";

const credentials = { mode: "demo" as const, baseUrl: "https://demo", apiKey: "key", apiSecret: "secret" };
const goldPair = {
  id: 55,
  ownerId: 7,
  ceSymbol: "C-XAUT-4350-180826",
  peSymbol: "P-XAUT-4300-180826",
  ceProductId: 101,
  peProductId: 102,
  lots: 120,
  remainingLots: 120,
  ceEntry: "82.000000",
  peEntry: "61.000000",
  ceStop: "164.000000",
  peStop: "122.000000",
  manualHold: false,
  createdAt: new Date(),
  status: "adopted",
};
const risk = { usdInr: "83.00", maxTradeLossInr: "1200.00", profitTrailStartInr: "600.00", profitTrailDrawdownInr: "300.00", exitMode: "manual" as const, autoProfitTargetInr: null, manualOnlyMode: false };
const eveningTrigger = { id: 10, ownerId: 7, label: "Evening", timeIst: "22:00", weekdays: "1,2,3,4,5", enabled: true, lots: 120, premiumMin: "85", premiumMax: "120" };
const morningTrigger = { id: 11, ownerId: 7, label: "Morning", timeIst: "09:30", weekdays: "1,2,3,4,5", enabled: true, lots: 120, premiumMin: "85", premiumMax: "120" };

describe("watchdog fail-closed transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.demoScheduledEntryEnabled = false;
    ENV.demoScheduledEntryAcknowledgement = "";
    vi.mocked(createAdoptedTradePair).mockResolvedValue({ id: 77, ...goldPair } as never);
    vi.mocked(createNotification).mockResolvedValue({ id: 81, title: "TMT Watchdog Alert", body: "alert" } as never);
    vi.mocked(createClosedTrade).mockResolvedValue(undefined);
    vi.mocked(getOrCreateRiskSettings).mockResolvedValue(risk as never);
    vi.mocked(getActiveTradePair).mockResolvedValue(undefined);
    vi.mocked(getPendingCloseRequestForPair).mockResolvedValue(undefined);
    vi.mocked(getUserDeltaCredentials).mockResolvedValue(credentials);
    vi.mocked(getWatchdogState).mockResolvedValue(undefined);
    vi.mocked(listActiveTradePairs).mockResolvedValue([] as never);
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([] as never);
    vi.mocked(recordTradeEvent).mockResolvedValue(undefined);
    vi.mocked(recordTradeSnapshot).mockResolvedValue(undefined);
    vi.mocked(reserveScheduledEntryAttempt).mockResolvedValue({ attempt: { id: 91 }, reserved: true } as never);
    vi.mocked(tryAcquireWorkerLease).mockResolvedValue(true);
    vi.mocked(updatePairRuntimeState).mockResolvedValue(undefined);
    vi.mocked(updateScheduledEntryAttempt).mockResolvedValue(undefined);
    vi.mocked(updateWatchdogState).mockResolvedValue({} as never);
    vi.mocked(getDeltaRuntime).mockReturnValue({ mode: "demo", baseUrl: "https://demo", credentialsConfigured: true, liveTradingEnabled: false, nativeBracketsEnabled: false });
    vi.mocked(assertLiveCloseArmed).mockReturnValue(undefined);
  });

  it("opens and adopts an equal 120-lot BTC demo pair only in the 10 PM IST window", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([eveningTrigger] as never);
    vi.mocked(selectScheduledBtcStrangle).mockResolvedValue({ ce: { productId: 401, symbol: "C-BTC-65000-180826", bid: 100 }, pe: { productId: 402, symbol: "P-BTC-64000-180826", bid: 95 }, expiry: "180826" } as never);
    vi.mocked(placeOrder).mockResolvedValue({ size: 120, unfilled_size: 0 } as never);
    vi.mocked(getPosition).mockResolvedValueOnce({ size: -120, entryPrice: 100 } as never).mockResolvedValueOnce({ size: -120, entryPrice: 95 } as never);

    await runScheduledEntryCycle(new Date("2026-08-17T16:30:00.000Z"));

    expect(reserveScheduledEntryAttempt).toHaveBeenCalledWith({ ownerId: 7, triggerId: 10, triggerTimeIst: "22:00", istTradeDate: "2026-08-17", requestedLots: 120 });
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ productId: 401, side: "sell", size: 120, orderType: "limit_order", timeInForce: "ioc" }));
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ productId: 402, side: "sell", size: 120, orderType: "limit_order", timeInForce: "ioc" }));
    expect(createAdoptedTradePair).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, lots: 120, mode: "bot", protectionStatus: "SCHEDULED_DEMO_ENTRY" }));
    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ status: "opened" }));
  });

  it("runs a configured 09:30 AM trigger without firing an unrelated 10:00 PM trigger", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([morningTrigger, eveningTrigger] as never);
    vi.mocked(selectScheduledBtcStrangle).mockResolvedValue({ ce: { productId: 401, symbol: "C-BTC-65000-180826", bid: 100 }, pe: { productId: 402, symbol: "P-BTC-64000-180826", bid: 95 }, expiry: "180826" } as never);
    vi.mocked(placeOrder).mockResolvedValue({ size: 120, unfilled_size: 0 } as never);
    vi.mocked(getPosition).mockResolvedValueOnce({ size: -120, entryPrice: 100 } as never).mockResolvedValueOnce({ size: -120, entryPrice: 95 } as never);

    await runScheduledEntryCycle(new Date("2026-08-17T04:00:00.000Z"));

    expect(reserveScheduledEntryAttempt).toHaveBeenCalledTimes(1);
    expect(reserveScheduledEntryAttempt).toHaveBeenCalledWith({ ownerId: 7, triggerId: 11, triggerTimeIst: "09:30", istTradeDate: "2026-08-17", requestedLots: 120 });
  });

  it("runs scheduled entry evaluation through the shared worker cycle when no manual pair exists", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([morningTrigger] as never);
    vi.mocked(selectScheduledBtcStrangle).mockResolvedValue({ ce: { productId: 401, symbol: "C-BTC-65000-180826", bid: 100 }, pe: { productId: 402, symbol: "P-BTC-64000-180826", bid: 95 }, expiry: "180826" } as never);
    vi.mocked(placeOrder).mockResolvedValue({ size: 120, unfilled_size: 0 } as never);
    vi.mocked(getPosition).mockResolvedValueOnce({ size: -120, entryPrice: 100 } as never).mockResolvedValueOnce({ size: -120, entryPrice: 95 } as never);

    await runCycle(new Date("2026-08-17T04:00:00.000Z"));

    expect(tryAcquireWorkerLease).toHaveBeenCalledTimes(1);
    expect(reserveScheduledEntryAttempt).toHaveBeenCalledWith({ ownerId: 7, triggerId: 11, triggerTimeIst: "09:30", istTradeDate: "2026-08-17", requestedLots: 120 });
    expect(createAdoptedTradePair).toHaveBeenCalledWith(expect.objectContaining({ mode: "bot", ownerId: 7 }));
    expect(listActiveTradePairs).toHaveBeenCalledTimes(1);
  });

  it("does not submit a second entry when the same trigger already reserved its IST date", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([morningTrigger] as never);
    vi.mocked(reserveScheduledEntryAttempt).mockResolvedValue({ attempt: { id: 91 }, reserved: false } as never);

    await runScheduledEntryCycle(new Date("2026-08-17T04:00:00.000Z"));

    expect(reserveScheduledEntryAttempt).toHaveBeenCalledWith({ ownerId: 7, triggerId: 11, triggerTimeIst: "09:30", istTradeDate: "2026-08-17", requestedLots: 120 });
    expect(selectScheduledBtcStrangle).not.toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("records a visible failed attempt when a due trigger is blocked before order selection", async () => {
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([morningTrigger] as never);

    await runScheduledEntryCycle(new Date("2026-08-17T04:00:00.000Z"));

    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ status: "failed", error: expect.stringContaining("server-side demo entry gates") }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SCHEDULED_ENTRY_FAILED", payload: expect.objectContaining({ attemptId: 91 }) }));
  });

  it("records a visible skipped attempt when a due trigger finds an active pair", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([morningTrigger] as never);
    vi.mocked(getActiveTradePair).mockResolvedValue(goldPair as never);

    await runScheduledEntryCycle(new Date("2026-08-17T04:00:00.000Z"));

    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ status: "skipped", error: expect.stringContaining("active adopted pair") }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SCHEDULED_ENTRY_SKIPPED_ACTIVE_PAIR" }));
    expect(selectScheduledBtcStrangle).not.toHaveBeenCalled();
  });

  it("flattens a partial scheduled IOC fill and never adopts an orphaned BTC leg", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([eveningTrigger] as never);
    vi.mocked(selectScheduledBtcStrangle).mockResolvedValue({ ce: { productId: 401, symbol: "C-BTC-65000-180826", bid: 100 }, pe: { productId: 402, symbol: "P-BTC-64000-180826", bid: 95 }, expiry: "180826" } as never);
    vi.mocked(placeOrder).mockResolvedValueOnce({ size: 120, unfilled_size: 0 } as never).mockResolvedValueOnce({ size: 120, unfilled_size: 60 } as never);
    vi.mocked(getPosition).mockResolvedValueOnce({ size: -120 } as never).mockResolvedValueOnce({ size: -60 } as never);
    vi.mocked(closeShortPosition).mockResolvedValue({ skipped: false, order: {} } as never);

    await runScheduledEntryCycle(new Date("2026-08-17T16:30:00.000Z"));

    expect(closeShortPosition).toHaveBeenCalledWith(expect.objectContaining({ productId: 401, symbol: "C-BTC-65000-180826", credentials }));
    expect(closeShortPosition).toHaveBeenCalledWith(expect.objectContaining({ productId: 402, symbol: "P-BTC-64000-180826", credentials }));
    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ ceFilledLots: 120, peFilledLots: 60 }));
    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ status: "flattened" }));
    expect(createAdoptedTradePair).not.toHaveBeenCalled();
  });

  it("records a zero-fill scheduled attempt without adopting a BTC pair", async () => {
    ENV.demoScheduledEntryEnabled = true;
    ENV.demoScheduledEntryAcknowledgement = ENV.demoScheduledEntryAcknowledgementPhrase;
    vi.mocked(listEnabledScheduledEntryTriggers).mockResolvedValue([eveningTrigger] as never);
    vi.mocked(selectScheduledBtcStrangle).mockResolvedValue({ ce: { productId: 401, symbol: "C-BTC-65000-180826", bid: 100 }, pe: { productId: 402, symbol: "P-BTC-64000-180826", bid: 95 }, expiry: "180826" } as never);
    vi.mocked(placeOrder).mockResolvedValue({ size: 120, unfilled_size: 120 } as never);
    vi.mocked(getPosition).mockResolvedValue({ size: 0 } as never);

    await runScheduledEntryCycle(new Date("2026-08-17T16:30:00.000Z"));

    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ ceFilledLots: 0, peFilledLots: 0 }));
    expect(updateScheduledEntryAttempt).toHaveBeenCalledWith(91, expect.objectContaining({ status: "flattened" }));
    expect(closeShortPosition).not.toHaveBeenCalled();
    expect(createAdoptedTradePair).not.toHaveBeenCalled();
  });

  it("uses XAUTUSD rather than BTCUSD as the Gold/XAUT pair spot reference", () => {
    expect(getPairSpotSymbol("C-XAUT-4350-180826")).toBe("XAUTUSD");
    expect(getPairSpotSymbol("C-BTC-65000-010126")).toBe("BTCUSD");
  });

  it("records a healthy Gold/XAUT snapshot from Gold CE, PE, and XAUTUSD marks", async () => {
    vi.mocked(getWatchdogState).mockResolvedValue({ profitHighInr: null } as never);
    vi.mocked(getPosition).mockResolvedValueOnce({ size: -120 } as never).mockResolvedValueOnce({ size: -120 } as never);
    vi.mocked(getTickers).mockResolvedValue(new Map([
      [goldPair.ceSymbol, { mark: 80 }],
      [goldPair.peSymbol, { mark: 60 }],
      ["XAUTUSD", { mark: 4300 }],
    ]) as never);

    await runPairCycle(goldPair as never);

    expect(getTickers).toHaveBeenCalledWith([goldPair.ceSymbol, goldPair.peSymbol, "XAUTUSD"], credentials);
    expect(recordTradeSnapshot).toHaveBeenCalledWith(expect.objectContaining({ pairId: 55, spot: "4300.000000", ceMark: "80.000000", peMark: "60.000000" }));
    expect(updateWatchdogState).toHaveBeenCalledWith(7, expect.objectContaining({ pairId: 55, status: "healthy", lastError: null }));
  });

  it("routes a confirmed Gold/XAUT paired close only to the selected XAUT product symbols", async () => {
    vi.mocked(closeShortPosition).mockResolvedValue({ skipped: false, order: {} } as never);

    await closePair({ ownerId: 7, pair: goldPair as never, risk: risk as never, reason: "Gold paired close test", credentials, prices: { ceMark: 80, peMark: 60, spot: 4300 } });

    expect(closeShortPosition).toHaveBeenCalledWith(expect.objectContaining({ productId: 101, symbol: goldPair.ceSymbol, credentials }));
    expect(closeShortPosition).toHaveBeenCalledWith(expect.objectContaining({ productId: 102, symbol: goldPair.peSymbol, credentials }));
    expect(createClosedTrade).toHaveBeenCalledWith(expect.objectContaining({ pairId: 55, ceSymbol: goldPair.ceSymbol, peSymbol: goldPair.peSymbol }));
  });

  it("moves a pair to emergency and records a critical owner alert after a close failure", async () => {
    await markEmergency(7, 44, "Paired close failed", new Error("PE reduce-only close failed"));
    expect(updatePairRuntimeState).toHaveBeenCalledWith(44, expect.objectContaining({ status: "emergency", closeReason: "Paired close failed" }));
    expect(updateWatchdogState).toHaveBeenCalledWith(7, expect.objectContaining({ status: "emergency", lastError: "PE reduce-only close failed" }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "EMERGENCY_STOP", level: "critical" }));
    expect(dispatchOwnerAlert).toHaveBeenCalledWith(expect.objectContaining({ id: 81 }));
  });

  it("records a degraded worker health state and owner alert when a market-data cycle fails", async () => {
    await markWatchdogDegraded(7, 44, new Error("BTCUSD quote unavailable"));
    expect(updateWatchdogState).toHaveBeenCalledWith(7, expect.objectContaining({ pairId: 44, status: "degraded", lastError: expect.stringContaining("Delta monitoring request failed") }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "WATCHDOG_ERROR", level: "critical" }));
    expect(dispatchOwnerAlert).toHaveBeenCalledWith(expect.objectContaining({ id: 81 }));
  });

  it("does not flood alerts when the same degraded state repeats", async () => {
    const message = "Delta monitoring request failed: BTCUSD quote unavailable";
    vi.mocked(getWatchdogState).mockResolvedValue({ status: "degraded", lastError: message } as never);
    await markWatchdogDegraded(7, 44, new Error("BTCUSD quote unavailable"));
    expect(updateWatchdogState).toHaveBeenCalledWith(7, expect.objectContaining({ status: "degraded", lastError: message }));
    expect(recordTradeEvent).not.toHaveBeenCalled();
    expect(dispatchOwnerAlert).not.toHaveBeenCalled();
  });
});
