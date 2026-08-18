import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDeltaRuntime,
  getShortOptionCandidates,
  verifyShortOption,
} from "../delta";
import {
  createAdoptedTradePair,
  createExportJob,
  getActiveTradePair,
  getLatestTradeSnapshot,
  getOrCreateRiskSettings,
  getTradePairById,
  getWatchdogState,
  listClosedTrades,
  listNotifications,
  listRealizedPnlEvents,
  listRecentTradeSnapshots,
  queueCloseRequest,
  recordTradeEvent,
  setManualHold,
  upsertDeltaCredential,
  updateRiskSettings,
  updateExportJob,
} from "../db";
import { buildLiveMonitorWorkbook, buildTradeHistoryWorkbook } from "../excel-export";
import { credentialFingerprint, encryptCredential } from "../security";
import { getUserDeltaCredentialStatus, getUserDeltaCredentials } from "../user-delta";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveWorkspaceWatchdogState } from "../watchdog-status";
import { buildPnlAnalytics } from "../pnl-analytics";
import { getUnderlyingDetails, underlyingFromOptionSymbol } from "../../shared/option-underlying";

function asTrpcError(error: unknown) {
  if (error instanceof TRPCError) return error;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "The requested trading operation could not be completed.",
  });
}

const riskInput = z.object({
  usdInr: z.number().finite().positive().max(200).optional(),
  maxTradeLossInr: z.number().finite().positive().max(10_000_000).optional(),
  maxDailyLossInr: z.number().finite().positive().max(10_000_000).optional(),
  profitTrailStartInr: z.number().finite().nonnegative().max(10_000_000).optional(),
  profitTrailDrawdownInr: z.number().finite().positive().max(10_000_000).optional(),
  exitMode: z.enum(["manual", "auto"]).optional(),
  autoProfitTargetInr: z.number().finite().positive().max(10_000_000).nullable().optional(),
  manualOnlyMode: z.boolean().optional(),
  liveArmed: z.boolean().optional(),
  liveArmConfirmation: z.string().optional(),
});

export const tradingRouter = router({
  delta: router({
    runtime: protectedProcedure.query(async ({ ctx }) => {
      const status = await getUserDeltaCredentialStatus(ctx.user.id);
      return status.configured ? { ...getDeltaRuntime({ apiKey: "configured", apiSecret: "configured", baseUrl: status.baseUrl!, mode: status.environment! }), keyFingerprint: status.keyFingerprint, updatedAt: status.updatedAt } : { ...getDeltaRuntime(), credentialsConfigured: false, keyFingerprint: null, updatedAt: null };
    }),
    manualCandidates: protectedProcedure.query(async ({ ctx }) => {
      try {
        const candidates = await getShortOptionCandidates(await getUserDeltaCredentials(ctx.user.id));
        return {
          ce: candidates.filter(candidate => candidate.optionType === "CE"),
          pe: candidates.filter(candidate => candidate.optionType === "PE"),
        };
      } catch (error) {
        throw asTrpcError(error);
      }
    }),
  }),
  account: router({
    deltaCredentialStatus: protectedProcedure.query(({ ctx }) => getUserDeltaCredentialStatus(ctx.user.id)),
    saveDeltaCredential: protectedProcedure
      .input(z.object({
        environment: z.enum(["demo", "live"]),
        apiKey: z.string().trim().min(8).max(128),
        apiSecret: z.string().trim().min(16).max(256),
        confirmed: z.literal(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const baseUrl = input.environment === "live" ? "https://api.india.delta.exchange" : "https://cdn-ind.testnet.deltaex.org";
        const apiKey = encryptCredential(input.apiKey);
        const apiSecret = encryptCredential(input.apiSecret);
        const stored = await upsertDeltaCredential({
          ownerId: ctx.user.id,
          environment: input.environment,
          baseUrl,
          apiKeyCiphertext: apiKey.ciphertext,
          apiKeyIv: apiKey.iv,
          apiKeyTag: apiKey.tag,
          apiSecretCiphertext: apiSecret.ciphertext,
          apiSecretIv: apiSecret.iv,
          apiSecretTag: apiSecret.tag,
          keyFingerprint: credentialFingerprint(input.apiKey),
        });
        await recordTradeEvent({ ownerId: ctx.user.id, level: "warning", eventType: "DELTA_CREDENTIAL_STORED", message: `Encrypted ${input.environment} Delta credential stored for this account.`, payload: { keyFingerprint: stored.keyFingerprint } });
        return { configured: true, environment: stored.environment, baseUrl: stored.baseUrl, keyFingerprint: stored.keyFingerprint, updatedAt: stored.updatedAt };
      }),
  }),
  trade: router({
    active: protectedProcedure.query(async ({ ctx }) => {
      const pair = await getActiveTradePair(ctx.user.id);
      if (!pair) return { pair: null, snapshot: null };
      const snapshot = await getLatestTradeSnapshot(pair.id);
      return { pair, snapshot };
    }),
    adoptManualPair: protectedProcedure
      .input(z.object({ ceProductId: z.number().int().positive(), peProductId: z.number().int().positive(), confirmed: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const credentials = await getUserDeltaCredentials(ctx.user.id);
          const runtime = getDeltaRuntime(credentials);
          if (runtime.mode === "paper") throw new Error("Manual Delta positions cannot be adopted while the app is in paper mode.");
          const [ce, pe] = await Promise.all([
            verifyShortOption({ productId: input.ceProductId, optionType: "CE" }, credentials),
            verifyShortOption({ productId: input.peProductId, optionType: "PE" }, credentials),
          ]);
          if (ce.lots !== pe.lots) throw new Error(`Manual CE/PE sizes must match; CE=${ce.lots}, PE=${pe.lots}.`);
          if (ce.underlying !== pe.underlying) throw new Error(`Manual CE/PE pairs must share one underlying; CE=${ce.underlying}, PE=${pe.underlying}.`);
          const pair = await createAdoptedTradePair({
            ownerId: ctx.user.id,
            ceSymbol: ce.symbol,
            peSymbol: pe.symbol,
            ceProductId: ce.productId,
            peProductId: pe.productId,
            lots: ce.lots,
            ceEntry: ce.entryPrice.toFixed(6),
            peEntry: pe.entryPrice.toFixed(6),
            protectionStatus: "MANUAL_ADOPTED",
          });
          await recordTradeEvent({
            ownerId: ctx.user.id,
            pairId: pair.id,
            level: "info",
            eventType: "MANUAL_PAIR_ADOPTED",
            message: `Owner confirmed adoption of ${pair.ceSymbol} and ${pair.peSymbol}, ${pair.lots} lots each.`,
            payload: { ceProductId: pair.ceProductId, peProductId: pair.peProductId, underlying: ce.underlying },
          });
          return pair;
        } catch (error) {
          throw asTrpcError(error);
        }
      }),
    setManualHold: protectedProcedure
      .input(z.object({ pairId: z.number().int().positive(), manualHold: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const pair = await setManualHold(ctx.user.id, input.pairId, input.manualHold);
          if (!pair) throw new Error("The active adopted pair was not found.");
          await recordTradeEvent({
            ownerId: ctx.user.id,
            pairId: pair.id,
            level: "warning",
            eventType: input.manualHold ? "MANUAL_HOLD_ENABLED" : "MANUAL_HOLD_DISABLED",
            message: input.manualHold
              ? "Manual Hold enabled. Take-profit, profit-trailing, and time exits are suppressed; stop-loss and maximum-loss exits remain active."
              : "Manual Hold disabled. Standard bot exits are active again.",
          });
          return pair;
        } catch (error) {
          throw asTrpcError(error);
        }
      }),
    requestClose: protectedProcedure
      .input(z.object({ pairId: z.number().int().positive(), closePercent: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).default(100), confirmed: z.literal(true), reason: z.string().trim().min(3).max(128).default("Dashboard paired close") }))
      .mutation(async ({ ctx, input }) => {
        try {
          const request = await queueCloseRequest(ctx.user.id, input.pairId, input.closePercent, input.reason);
          await recordTradeEvent({
            ownerId: ctx.user.id,
            pairId: input.pairId,
            level: "warning",
            eventType: "CLOSE_REQUEST_QUEUED",
            message: `Confirmed ${input.closePercent}% reduce-only paired close request queued: ${input.reason}`,
            payload: { closePercent: input.closePercent },
          });
          return request;
        } catch (error) {
          throw asTrpcError(error);
        }
      }),
  }),
  watchdog: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const [state, pair, credential] = await Promise.all([getWatchdogState(ctx.user.id), getActiveTradePair(ctx.user.id), getUserDeltaCredentialStatus(ctx.user.id)]);
      const snapshot = pair ? await getLatestTradeSnapshot(pair.id) : undefined;
      return {
        state: resolveWorkspaceWatchdogState({ persistedState: state, hasCredential: credential.configured, hasAdoptedPair: Boolean(pair) }),
        pair,
        snapshot: snapshot ?? null,
      };
    }),
    history: protectedProcedure
      .input(z.object({ pairId: z.number().int().positive(), hours: z.number().int().min(1).max(24).default(6) }))
      .query(async ({ ctx, input }) => {
        if (!(await getTradePairById(ctx.user.id, input.pairId))) throw new TRPCError({ code: "NOT_FOUND", message: "This trade pair is not available in your account." });
        return listRecentTradeSnapshots(input.pairId, new Date(Date.now() - input.hours * 60 * 60 * 1_000));
      }),
  }),
  settings: router({
    get: protectedProcedure.query(({ ctx }) => getOrCreateRiskSettings(ctx.user.id)),
    update: protectedProcedure.input(riskInput).mutation(async ({ ctx, input }) => {
      if (input.liveArmed === true && input.liveArmConfirmation !== "ARM LIVE REDUCE-ONLY CLOSES") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type ARM LIVE REDUCE-ONLY CLOSES before enabling live close actions." });
      }
      if (input.exitMode === "auto" && (!input.autoProfitTargetInr || input.autoProfitTargetInr <= 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a positive INR net-profit target before enabling Auto exit mode." });
      }
      const { liveArmConfirmation: _liveArmConfirmation, ...settingsInput } = input;
      const settings = await updateRiskSettings(ctx.user.id, {
        ...settingsInput,
        usdInr: input.usdInr?.toFixed(2),
        maxTradeLossInr: input.maxTradeLossInr?.toFixed(2),
        maxDailyLossInr: input.maxDailyLossInr?.toFixed(2),
        profitTrailStartInr: input.profitTrailStartInr?.toFixed(2),
        profitTrailDrawdownInr: input.profitTrailDrawdownInr?.toFixed(2),
        autoProfitTargetInr: input.autoProfitTargetInr === undefined ? undefined : input.autoProfitTargetInr === null ? null : input.autoProfitTargetInr.toFixed(2),
      });
      await recordTradeEvent({
        ownerId: ctx.user.id,
        level: "info",
        eventType: "RISK_SETTINGS_UPDATED",
        message: "Owner updated server-side risk settings.",
      });
      return settings;
    }),
  }),
  history: router({
    closedTrades: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(250).default(100) })).query(({ ctx, input }) => listClosedTrades(ctx.user.id, input.limit)),
    analytics: protectedProcedure
      .input(z.object({ range: z.enum(["7d", "15d", "30d", "all"]).default("7d") }))
      .query(async ({ ctx, input }) => {
        const days = input.range === "all" ? null : Number.parseInt(input.range, 10);
        const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1_000) : undefined;
        return { range: input.range, ...buildPnlAnalytics(await listRealizedPnlEvents(ctx.user.id, since)) };
      }),
  }),
  exports: router({
    tradeHistory: protectedProcedure.mutation(async ({ ctx }) => {
      const job = await createExportJob(ctx.user.id, "trade_history");
      try {
        await updateExportJob(job.id, { status: "processing" });
        const trades = await listClosedTrades(ctx.user.id, 250);
        const workbook = await buildTradeHistoryWorkbook(trades);
        const fileName = "tmt_trade_history.xlsx";
        await updateExportJob(job.id, { status: "completed", fileName, completedAt: new Date() });
        return { fileName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: workbook.toString("base64") };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateExportJob(job.id, { status: "failed", error: message, completedAt: new Date() });
        throw asTrpcError(error);
      }
    }),
    liveMonitor: protectedProcedure.mutation(async ({ ctx }) => {
      const job = await createExportJob(ctx.user.id, "live_monitor");
      try {
        await updateExportJob(job.id, { status: "processing" });
        const pair = await getActiveTradePair(ctx.user.id);
        const snapshot = pair ? await getLatestTradeSnapshot(pair.id) : undefined;
        const workbook = await buildLiveMonitorWorkbook(pair && snapshot ? {
          capturedAt: snapshot.capturedAt,
          underlyingLabel: (() => { const underlying = underlyingFromOptionSymbol(pair.ceSymbol); return underlying ? getUnderlyingDetails(underlying).monitorLabel : "Underlying"; })(),
          spot: snapshot.spot,
          ceEntry: pair.ceEntry,
          peEntry: pair.peEntry,
          ceStop: pair.ceStop,
          peStop: pair.peStop,
          ceMark: snapshot.ceMark,
          peMark: snapshot.peMark,
          pnlUsd: snapshot.pnlUsd,
          pnlInr: snapshot.pnlInr,
          feesInr: snapshot.feesInr,
          netInr: snapshot.netInr,
          status: snapshot.status,
        } : null);
        const fileName = "tmt_trade_monitor.xlsx";
        await updateExportJob(job.id, { status: "completed", fileName, completedAt: new Date() });
        return { fileName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: workbook.toString("base64") };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateExportJob(job.id, { status: "failed", error: message, completedAt: new Date() });
        throw asTrpcError(error);
      }
    }),
  }),
  notifications: router({
    list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) })).query(({ ctx, input }) => listNotifications(ctx.user.id, input.limit)),
  }),
});
