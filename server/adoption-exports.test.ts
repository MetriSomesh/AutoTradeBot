import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdoptedTradePair, createExportJob, getActiveTradePair, getLatestTradeSnapshot, listClosedTrades, recordTradeEvent, updateExportJob } from "./db";
import { getDeltaRuntime, verifyShortOption } from "./delta";
import { buildLiveMonitorWorkbook, buildTradeHistoryWorkbook } from "./excel-export";
import { getUserDeltaCredentials } from "./user-delta";

vi.mock("./db", async importActual => ({
  ...(await importActual<typeof import("./db")>()),
  createAdoptedTradePair: vi.fn(), createExportJob: vi.fn(), getActiveTradePair: vi.fn(), getLatestTradeSnapshot: vi.fn(), listClosedTrades: vi.fn(), recordTradeEvent: vi.fn(), updateExportJob: vi.fn(),
}));
vi.mock("./delta", async importActual => ({ ...(await importActual<typeof import("./delta")>()), getDeltaRuntime: vi.fn(), verifyShortOption: vi.fn() }));
vi.mock("./excel-export", async importActual => ({ ...(await importActual<typeof import("./excel-export")>()), buildLiveMonitorWorkbook: vi.fn(), buildTradeHistoryWorkbook: vi.fn() }));
vi.mock("./user-delta", () => ({ getUserDeltaCredentials: vi.fn(), getUserDeltaCredentialStatus: vi.fn() }));

import { tradingRouter } from "./routers/trading";

const account = { id: 7, openId: "local:owner", username: "owner", name: "Owner", email: null, loginMethod: "local", passwordHash: null, failedSignInCount: 0, lockedUntil: null, passwordChangedAt: null, role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const caller = (user = account) => tradingRouter.createCaller({ user, req: {} as never, res: {} as never });
const adoptedPair = { id: 44, ownerId: 7, ceSymbol: "C-BTC-65000-010126", peSymbol: "P-BTC-64000-010126", ceProductId: 41, peProductId: 42, lots: 120, remainingLots: 120 };

describe("manual pair adoption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDeltaRuntime).mockReturnValue({ mode: "demo", baseUrl: "https://demo", credentialsConfigured: true, liveTradingEnabled: false, nativeBracketsEnabled: false });
    vi.mocked(getUserDeltaCredentials).mockResolvedValue({ mode: "demo", baseUrl: "https://demo", apiKey: "key", apiSecret: "secret" });
  });

  it("requires two matching verified short legs before creating an adopted pair", async () => {
    vi.mocked(verifyShortOption).mockResolvedValueOnce({ productId: 41, symbol: adoptedPair.ceSymbol, lots: 120, entryPrice: 100, underlying: "BTC", contractValue: 0.001 }).mockResolvedValueOnce({ productId: 42, symbol: adoptedPair.peSymbol, lots: 120, entryPrice: 90, underlying: "BTC", contractValue: 0.001 });
    vi.mocked(createAdoptedTradePair).mockResolvedValue(adoptedPair as never);
    await expect(caller().trade.adoptManualPair({ ceProductId: 41, peProductId: 42, confirmed: true })).resolves.toMatchObject({ id: 44 });
    expect(createAdoptedTradePair).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, lots: 120, protectionStatus: "MANUAL_ADOPTED" }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "MANUAL_PAIR_ADOPTED", pairId: 44 }));
  });

  it("rejects unequal selected lot sizes without persisting a pair", async () => {
    vi.mocked(verifyShortOption).mockResolvedValueOnce({ productId: 41, symbol: adoptedPair.ceSymbol, lots: 120, entryPrice: 100, underlying: "BTC", contractValue: 0.001 }).mockResolvedValueOnce({ productId: 42, symbol: adoptedPair.peSymbol, lots: 60, entryPrice: 90, underlying: "BTC", contractValue: 0.001 });
    await expect(caller().trade.adoptManualPair({ ceProductId: 41, peProductId: 42, confirmed: true })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("sizes must match") });
    expect(createAdoptedTradePair).not.toHaveBeenCalled();
  });

  it("allows an authenticated local account to adopt only its own verified pair", async () => {
    const localUser = { ...account, id: 21, username: "other", openId: "local:other", role: "user" as const };
    vi.mocked(verifyShortOption).mockResolvedValueOnce({ productId: 41, symbol: adoptedPair.ceSymbol, lots: 120, entryPrice: 100, underlying: "BTC", contractValue: 0.001 }).mockResolvedValueOnce({ productId: 42, symbol: adoptedPair.peSymbol, lots: 120, entryPrice: 90, underlying: "BTC", contractValue: 0.001 });
    vi.mocked(createAdoptedTradePair).mockResolvedValue({ ...adoptedPair, ownerId: localUser.id } as never);
    await expect(caller(localUser).trade.adoptManualPair({ ceProductId: 41, peProductId: 42, confirmed: true })).resolves.toMatchObject({ ownerId: 21 });
  });

  it("rejects a matched-size BTC/XAUT selection before it can be adopted", async () => {
    vi.mocked(verifyShortOption).mockResolvedValueOnce({ productId: 41, symbol: "C-BTC-65000-010126", lots: 120, entryPrice: 100, underlying: "BTC", contractValue: 0.001 }).mockResolvedValueOnce({ productId: 42, symbol: "P-XAUT-4300-180826", lots: 120, entryPrice: 90, underlying: "XAUT", contractValue: 0.001 });
    await expect(caller().trade.adoptManualPair({ ceProductId: 41, peProductId: 42, confirmed: true })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("share one underlying") });
    expect(createAdoptedTradePair).not.toHaveBeenCalled();
  });
});

describe("account-scoped workbook export jobs", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(createExportJob).mockResolvedValue({ id: 33 } as never); vi.mocked(updateExportJob).mockResolvedValue(undefined); });

  it("records a completed history export and returns only workbook bytes", async () => {
    vi.mocked(listClosedTrades).mockResolvedValue([] as never);
    vi.mocked(buildTradeHistoryWorkbook).mockResolvedValue(Buffer.from("history"));
    await expect(caller().exports.tradeHistory()).resolves.toMatchObject({ fileName: "tmt_trade_history.xlsx", base64: Buffer.from("history").toString("base64") });
    expect(updateExportJob).toHaveBeenCalledWith(33, expect.objectContaining({ status: "completed" }));
  });

  it("records an export failure without exposing account data", async () => {
    vi.mocked(listClosedTrades).mockResolvedValue([] as never);
    vi.mocked(buildTradeHistoryWorkbook).mockRejectedValue(new Error("Workbook failure"));
    await expect(caller().exports.tradeHistory()).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Workbook failure" });
    expect(updateExportJob).toHaveBeenCalledWith(33, expect.objectContaining({ status: "failed", error: "Workbook failure" }));
  });

  it("scopes live-monitor export to the requesting local user", async () => {
    const localUser = { ...account, id: 21, username: "other", openId: "local:other", role: "user" as const };
    vi.mocked(getActiveTradePair).mockResolvedValue(undefined);
    vi.mocked(buildLiveMonitorWorkbook).mockResolvedValue(Buffer.from("monitor"));
    await expect(caller(localUser).exports.liveMonitor()).resolves.toMatchObject({ fileName: "tmt_trade_monitor.xlsx" });
    expect(getActiveTradePair).toHaveBeenCalledWith(21);
    expect(getLatestTradeSnapshot).not.toHaveBeenCalled();
  });
});
