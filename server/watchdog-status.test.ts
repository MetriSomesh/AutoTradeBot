import { describe, expect, it } from "vitest";
import { resolveWorkspaceWatchdogState, resolveWorkspaceWatchdogStatus } from "./watchdog-status";

describe("workspace watchdog status", () => {
  it("reports not configured before an account key is stored", () => {
    expect(resolveWorkspaceWatchdogStatus({ hasCredential: false, hasAdoptedPair: false })).toBe("not_configured");
  });

  it("reports idle for a configured account with no adopted pair", () => {
    expect(resolveWorkspaceWatchdogStatus({ hasCredential: true, hasAdoptedPair: false })).toBe("idle");
  });

  it("preserves a persisted monitoring status once an adopted pair exists", () => {
    expect(resolveWorkspaceWatchdogStatus({ persistedStatus: "healthy", hasCredential: true, hasAdoptedPair: true })).toBe("healthy");
  });

  it("overrides a stale persisted offline state when no adopted pair remains", () => {
    const state = resolveWorkspaceWatchdogState({
      persistedState: { status: "offline" as const, lastError: "old pair failure" },
      hasCredential: true,
      hasAdoptedPair: false,
    });
    expect(state).toMatchObject({ status: "idle", lastError: null });
  });

  it("returns a dashboard-safe not-configured state without a key or pair", () => {
    expect(resolveWorkspaceWatchdogState({ hasCredential: false, hasAdoptedPair: false })).toMatchObject({
      status: "not_configured",
      lastPollAt: null,
      lastSnapshotAt: null,
      lastError: null,
    });
  });
});
