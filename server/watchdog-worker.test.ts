import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClosedTrade,
  createNotification,
  getOrCreateRiskSettings,
  getPendingCloseRequestForPair,
  getWatchdogState,
  recordTradeEvent,
  recordTradeSnapshot,
  updatePairRuntimeState,
  updateWatchdogState,
} from "./db";
import { dispatchOwnerAlert } from "./alerts";
import { assertLiveCloseArmed, closeShortPosition, getDeltaRuntime, getPosition, getTickers } from "./delta";
import { getUserDeltaCredentials } from "./user-delta";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return {
    ...actual,
    createClosedTrade: vi.fn(),
    createNotification: vi.fn(),
    getOrCreateRiskSettings: vi.fn(),
    getPendingCloseRequestForPair: vi.fn(),
    getWatchdogState: vi.fn(),
    recordTradeEvent: vi.fn(),
    recordTradeSnapshot: vi.fn(),
    updatePairRuntimeState: vi.fn(),
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
}));
vi.mock("./user-delta", () => ({ getUserDeltaCredentials: vi.fn() }));

import { closePair, getPairSpotSymbol, markEmergency, markWatchdogDegraded, runPairCycle } from "./watchdog-worker";

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
const risk = { usdInr: "83.00", maxTradeLossInr: "1200.00", profitTrailStartInr: "600.00", profitTrailDrawdownInr: "300.00", exitMode: "manual" as const, autoProfitTargetInr: null };

describe("watchdog fail-closed transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotification).mockResolvedValue({ id: 81, title: "TMT Watchdog Alert", body: "alert" } as never);
    vi.mocked(createClosedTrade).mockResolvedValue(undefined);
    vi.mocked(getOrCreateRiskSettings).mockResolvedValue(risk as never);
    vi.mocked(getPendingCloseRequestForPair).mockResolvedValue(undefined);
    vi.mocked(getUserDeltaCredentials).mockResolvedValue(credentials);
    vi.mocked(getWatchdogState).mockResolvedValue(undefined);
    vi.mocked(recordTradeEvent).mockResolvedValue(undefined);
    vi.mocked(recordTradeSnapshot).mockResolvedValue(undefined);
    vi.mocked(updatePairRuntimeState).mockResolvedValue(undefined);
    vi.mocked(updateWatchdogState).mockResolvedValue({} as never);
    vi.mocked(getDeltaRuntime).mockReturnValue({ mode: "demo", baseUrl: "https://demo", credentialsConfigured: true, liveTradingEnabled: false, nativeBracketsEnabled: false });
    vi.mocked(assertLiveCloseArmed).mockReturnValue(undefined);
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
