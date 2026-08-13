import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveTradePair, getWatchdogState } from "./db";
import { getUserDeltaCredentialStatus } from "./user-delta";

vi.mock("./db", async importActual => {
  const actual = await importActual<typeof import("./db")>();
  return { ...actual, getActiveTradePair: vi.fn(), getWatchdogState: vi.fn() };
});

vi.mock("./user-delta", () => ({ getUserDeltaCredentialStatus: vi.fn(), getUserDeltaCredentials: vi.fn() }));

import { tradingRouter } from "./routers/trading";

const user = { id: 7, openId: "local:owner", username: "owner", name: "Owner", email: null, loginMethod: "local", passwordHash: null, failedSignInCount: 0, lockedUntil: null, passwordChangedAt: null, role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const caller = () => tradingRouter.createCaller({ user, req: {} as never, res: {} as never });

describe("watchdog status router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveTradePair).mockResolvedValue(undefined);
  });

  it("returns not_configured without a Delta credential or adopted pair", async () => {
    vi.mocked(getWatchdogState).mockResolvedValue(undefined);
    vi.mocked(getUserDeltaCredentialStatus).mockResolvedValue({ configured: false, environment: null, baseUrl: null, keyFingerprint: null, updatedAt: null });
    await expect(caller().watchdog.status()).resolves.toMatchObject({ state: { status: "not_configured" }, pair: undefined, snapshot: null });
  });

  it("returns idle for a configured account with no adopted pair", async () => {
    vi.mocked(getWatchdogState).mockResolvedValue(undefined);
    vi.mocked(getUserDeltaCredentialStatus).mockResolvedValue({ configured: true, environment: "demo", baseUrl: "https://cdn-ind.testnet.deltaex.org", keyFingerprint: "demo", updatedAt: new Date() });
    await expect(caller().watchdog.status()).resolves.toMatchObject({ state: { status: "idle" } });
  });

  it("overrides a stale offline state when no adopted pair exists", async () => {
    vi.mocked(getWatchdogState).mockResolvedValue({ id: 1, ownerId: 7, pairId: null, status: "offline", manualHold: false, closeRequested: false, profitHighInr: null, lastPollAt: null, lastSnapshotAt: null, lastError: "old error", workerId: "old-worker", updatedAt: new Date() } as never);
    vi.mocked(getUserDeltaCredentialStatus).mockResolvedValue({ configured: true, environment: "demo", baseUrl: "https://cdn-ind.testnet.deltaex.org", keyFingerprint: "demo", updatedAt: new Date() });
    await expect(caller().watchdog.status()).resolves.toMatchObject({ state: { status: "idle", lastError: null } });
  });
});
