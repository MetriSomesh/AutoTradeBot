export type WorkspaceWatchdogStatus = "not_configured" | "idle" | "offline" | "healthy" | "degraded" | "emergency";

export function resolveWorkspaceWatchdogStatus(input: {
  persistedStatus?: "offline" | "healthy" | "degraded" | "emergency";
  hasCredential: boolean;
  hasAdoptedPair: boolean;
}): WorkspaceWatchdogStatus {
  if (input.persistedStatus) return input.persistedStatus;
  if (!input.hasCredential) return "not_configured";
  if (!input.hasAdoptedPair) return "idle";
  return "offline";
}

export function resolveWorkspaceWatchdogState<T extends { status: "offline" | "healthy" | "degraded" | "emergency"; lastPollAt?: Date | null; lastSnapshotAt?: Date | null; lastError?: string | null; manualHold?: boolean; closeRequested?: boolean; profitHighInr?: string | null; workerId?: string | null }>(input: {
  persistedState?: T;
  hasCredential: boolean;
  hasAdoptedPair: boolean;
}) {
  const status = resolveWorkspaceWatchdogStatus({
    persistedStatus: input.hasAdoptedPair ? input.persistedState?.status : undefined,
    hasCredential: input.hasCredential,
    hasAdoptedPair: input.hasAdoptedPair,
  });
  return {
    status,
    lastPollAt: input.persistedState?.lastPollAt ?? null,
    lastSnapshotAt: input.persistedState?.lastSnapshotAt ?? null,
    lastError: input.hasAdoptedPair ? input.persistedState?.lastError ?? null : null,
    manualHold: input.persistedState?.manualHold ?? false,
    closeRequested: input.persistedState?.closeRequested ?? false,
    profitHighInr: input.persistedState?.profitHighInr ?? null,
    workerId: input.persistedState?.workerId ?? null,
  };
}
