import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotification, recordTradeEvent, updatePairRuntimeState, updateWatchdogState } from "./db";
import { dispatchOwnerAlert } from "./alerts";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return { ...actual, createNotification: vi.fn(), recordTradeEvent: vi.fn(), updatePairRuntimeState: vi.fn(), updateWatchdogState: vi.fn() };
});
vi.mock("./alerts", () => ({ dispatchOwnerAlert: vi.fn() }));

import { markEmergency, markWatchdogDegraded } from "./watchdog-worker";

describe("watchdog fail-closed transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotification).mockResolvedValue({ id: 81, title: "TMT Watchdog Alert", body: "alert" } as never);
    vi.mocked(recordTradeEvent).mockResolvedValue(undefined);
    vi.mocked(updatePairRuntimeState).mockResolvedValue(undefined);
    vi.mocked(updateWatchdogState).mockResolvedValue({} as never);
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
    expect(updateWatchdogState).toHaveBeenCalledWith(7, expect.objectContaining({ pairId: 44, status: "degraded", lastError: "BTCUSD quote unavailable" }));
    expect(recordTradeEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "WATCHDOG_ERROR", level: "critical" }));
    expect(dispatchOwnerAlert).toHaveBeenCalledWith(expect.objectContaining({ id: 81 }));
  });
});
