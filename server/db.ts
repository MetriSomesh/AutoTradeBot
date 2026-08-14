import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import {
  closedTrades,
  closeRequests,
  deltaCredentials,
  exportJobs,
  InsertUser,
  localAuthBootstrap,
  localSessions,
  notifications,
  partialCloses,
  passwordResetTokens,
  riskSettings,
  tradeEvents,
  tradePairs,
  tradeSnapshots,
  users,
  watchdogStates,
  workerLeases,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { configureMysqlUtcSession } from "./mysql-timezone";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Store and retrieve JavaScript Date values as UTC regardless of the
      // MacBook/MySQL host timezone. The UI converts those UTC instants to IST.
      const pool = createPool({ uri: process.env.DATABASE_URL, timezone: "Z" });
      // mysql2's `timezone` option controls Date serialization, but it does not
      // change the MySQL server session. TIMESTAMP values must be selected in
      // UTC too, otherwise a self-hosted MySQL server configured for IST sends
      // local clock values that are interpreted again as UTC by the browser.
      _db = drizzle({ client: configureMysqlUtcSession(pool) });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;

    for (const field of textFields) {
      const value = user[field];
      if (value !== undefined) {
        values[field] = value ?? null;
        updateSet[field] = value ?? null;
      }
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getLocalUserByUsername(username: string) {
  const db = await requireDb();
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function createLocalUser(input: { username: string; name: string; email: string; passwordHash: string }) {
  const db = await requireDb();
  const [result] = await db.insert(users).values({
    openId: `local:${input.username}`,
    username: input.username,
    name: input.name,
    email: input.email,
    loginMethod: "local",
    passwordHash: input.passwordHash,
    passwordChangedAt: new Date(),
    role: "user",
    lastSignedIn: new Date(),
  });
  const userId = Number(result.insertId);
  const [bootstrap] = await db
    .insert(localAuthBootstrap)
    .values({ singletonKey: 1, firstAdminUserId: userId })
    .onDuplicateKeyUpdate({ set: { firstAdminUserId: sql<number>`${localAuthBootstrap.firstAdminUserId}` } });
  if (Number(bootstrap.affectedRows) === 1) await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) throw new Error("Unable to create local user");
  return user[0];
}

export async function registerFailedLocalSignIn(userId: number) {
  const db = await requireDb();
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return;
  const failures = user[0].failedSignInCount + 1;
  await db.update(users).set({ failedSignInCount: failures, lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null }).where(eq(users.id, userId));
}

export async function resetLocalSignInFailures(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ failedSignInCount: 0, lockedUntil: null, lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function createLocalSession(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await requireDb();
  const [result] = await db.insert(localSessions).values({ userId, tokenHash, expiresAt });
  return Number(result.insertId);
}

export async function getLocalSessionUser(tokenHash: string) {
  const db = await requireDb();
  const result = await db.select({ session: localSessions, user: users }).from(localSessions).innerJoin(users, eq(localSessions.userId, users.id)).where(and(eq(localSessions.tokenHash, tokenHash), isNull(localSessions.revokedAt), gte(localSessions.expiresAt, new Date()))).limit(1);
  if (!result[0]) return undefined;
  await db.update(localSessions).set({ lastSeenAt: new Date() }).where(eq(localSessions.id, result[0].session.id));
  return result[0].user;
}

export async function revokeLocalSession(tokenHash: string) {
  const db = await requireDb();
  await db.update(localSessions).set({ revokedAt: new Date() }).where(and(eq(localSessions.tokenHash, tokenHash), isNull(localSessions.revokedAt)));
}

export async function createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await requireDb();
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

export async function upsertDeltaCredential(input: {
  ownerId: number;
  environment: "demo" | "live";
  baseUrl: string;
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyTag: string;
  apiSecretCiphertext: string;
  apiSecretIv: string;
  apiSecretTag: string;
  keyFingerprint: string;
}) {
  const db = await requireDb();
  await db.insert(deltaCredentials).values(input).onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });
  const credential = await db.select().from(deltaCredentials).where(eq(deltaCredentials.ownerId, input.ownerId)).limit(1);
  if (!credential[0]) throw new Error("Unable to store encrypted Delta credential");
  return credential[0];
}

export async function getDeltaCredential(ownerId: number) {
  const db = await requireDb();
  const result = await db.select().from(deltaCredentials).where(eq(deltaCredentials.ownerId, ownerId)).limit(1);
  return result[0];
}

export async function getOrCreateRiskSettings(ownerId: number) {
  const db = await requireDb();
  const existing = await db.select().from(riskSettings).where(eq(riskSettings.ownerId, ownerId)).limit(1);
  if (existing[0]) return existing[0];

  await db.insert(riskSettings).values({ ownerId });
  const created = await db.select().from(riskSettings).where(eq(riskSettings.ownerId, ownerId)).limit(1);
  if (!created[0]) throw new Error("Unable to initialize risk settings");
  return created[0];
}

export async function updateRiskSettings(
  ownerId: number,
  settings: Partial<{
    usdInr: string;
    maxTradeLossInr: string;
    maxDailyLossInr: string;
    profitTrailStartInr: string;
    profitTrailDrawdownInr: string;
    exitMode: "manual" | "auto";
    autoProfitTargetInr: string | null;
    manualOnlyMode: boolean;
    liveArmed: boolean;
  }>,
) {
  const db = await requireDb();
  await getOrCreateRiskSettings(ownerId);
  await db.update(riskSettings).set(settings).where(eq(riskSettings.ownerId, ownerId));
  return getOrCreateRiskSettings(ownerId);
}

export async function getActiveTradePair(ownerId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(tradePairs)
    .where(and(eq(tradePairs.ownerId, ownerId), inArray(tradePairs.status, ["adopted", "closing", "emergency"])))
    .orderBy(desc(tradePairs.createdAt))
    .limit(1);
  return result[0];
}

export async function listActiveTradePairs() {
  const db = await requireDb();
  return db.select().from(tradePairs).where(inArray(tradePairs.status, ["adopted", "closing", "emergency"])).orderBy(tradePairs.createdAt);
}

export async function getTradePairById(ownerId: number, pairId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(tradePairs)
    .where(and(eq(tradePairs.id, pairId), eq(tradePairs.ownerId, ownerId)))
    .limit(1);
  return result[0];
}

export async function createAdoptedTradePair(input: {
  ownerId: number;
  ceSymbol: string;
  peSymbol: string;
  ceProductId: number;
  peProductId: number;
  lots: number;
  ceEntry: string;
  peEntry: string;
  protectionStatus: string;
}) {
  const db = await requireDb();
  const active = await getActiveTradePair(input.ownerId);
  if (active) throw new Error("An active trade pair already exists and must be closed before another pair is adopted.");

  const [result] = await db.insert(tradePairs).values({
    ...input,
    ceStop: (Number(input.ceEntry) * 2).toFixed(6),
    peStop: (Number(input.peEntry) * 2).toFixed(6),
    remainingLots: input.lots,
    mode: "manual",
    status: "adopted",
  });
  const created = await getTradePairById(input.ownerId, Number(result.insertId));
  if (!created) throw new Error("Unable to create the adopted trade pair");
  await updateWatchdogState(input.ownerId, {
    pairId: created.id,
    status: "offline",
    manualHold: false,
    closeRequested: false,
    profitHighInr: null,
    lastError: null,
  });
  return created;
}

export async function setManualHold(ownerId: number, pairId: number, manualHold: boolean) {
  const db = await requireDb();
  await db
    .update(tradePairs)
    .set({ manualHold })
    .where(and(eq(tradePairs.id, pairId), eq(tradePairs.ownerId, ownerId), eq(tradePairs.status, "adopted")));
  await updateWatchdogState(ownerId, { manualHold });
  return getTradePairById(ownerId, pairId);
}

export async function updatePairRuntimeState(
  pairId: number,
  state: Partial<{
    status: "adopted" | "closing" | "closed" | "emergency";
    profitHighInr: string | null;
    protectionStatus: string;
    closeReason: string | null;
    closedAt: Date | null;
    remainingLots: number;
  }>,
) {
  const db = await requireDb();
  await db.update(tradePairs).set(state).where(eq(tradePairs.id, pairId));
}

export async function queueCloseRequest(ownerId: number, pairId: number, closePercent: 25 | 50 | 75 | 100, reason: string) {
  const db = await requireDb();
  const pair = await getTradePairById(ownerId, pairId);
  if (!pair || pair.status !== "adopted") throw new Error("Only an adopted active trade pair can be queued for closure.");
  if (![25, 50, 75, 100].includes(closePercent)) throw new Error("Close percentage must be 25, 50, 75, or 100.");

  const prior = await db
    .select()
    .from(closeRequests)
    .where(and(eq(closeRequests.pairId, pairId), inArray(closeRequests.status, ["pending", "processing"])))
    .limit(1);
  if (prior[0]) return prior[0];

  const [result] = await db.insert(closeRequests).values({ pairId, requestedBy: ownerId, closePercent, reason });
  if (closePercent === 100) await updatePairRuntimeState(pairId, { status: "closing" });
  await updateWatchdogState(ownerId, { closeRequested: true });
  const request = await db.select().from(closeRequests).where(eq(closeRequests.id, Number(result.insertId))).limit(1);
  if (!request[0]) throw new Error("Unable to queue close request");
  return request[0];
}

export async function createPartialClose(input: {
  ownerId: number;
  pairId: number;
  closeRequestId: number;
  closePercent: number;
  ceLots: number;
  peLots: number;
  ceExit: string;
  peExit: string;
  pnlUsd: string;
  feesInr: string;
  netInr: string;
  reason: string;
}) {
  const db = await requireDb();
  await db.insert(partialCloses).values(input).onDuplicateKeyUpdate({
    set: {
      ceLots: input.ceLots,
      peLots: input.peLots,
      ceExit: input.ceExit,
      peExit: input.peExit,
      pnlUsd: input.pnlUsd,
      feesInr: input.feesInr,
      netInr: input.netInr,
      reason: input.reason,
      completedAt: new Date(),
    },
  });
}

export async function getNextPendingCloseRequest() {
  const db = await requireDb();
  const result = await db
    .select()
    .from(closeRequests)
    .where(eq(closeRequests.status, "pending"))
    .orderBy(closeRequests.createdAt)
    .limit(1);
  return result[0];
}

export async function getPendingCloseRequestForPair(pairId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(closeRequests)
    .where(and(eq(closeRequests.pairId, pairId), eq(closeRequests.status, "pending")))
    .orderBy(closeRequests.createdAt)
    .limit(1);
  return result[0];
}

export async function updateCloseRequest(
  requestId: number,
  status: "pending" | "processing" | "completed" | "failed" | "cancelled",
  error?: string,
) {
  const db = await requireDb();
  await db
    .update(closeRequests)
    .set({ status, error: error ?? null, processedAt: status === "processing" || status === "pending" ? null : new Date() })
    .where(eq(closeRequests.id, requestId));
}

export async function recordTradeSnapshot(input: {
  pairId: number;
  spot: string;
  ceMark: string;
  peMark: string;
  pnlUsd: string;
  pnlInr: string;
  feesInr: string;
  netInr: string;
  status: string;
}) {
  const db = await requireDb();
  await db.insert(tradeSnapshots).values(input);
}

export async function getLatestTradeSnapshot(pairId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(tradeSnapshots)
    .where(eq(tradeSnapshots.pairId, pairId))
    .orderBy(desc(tradeSnapshots.capturedAt))
    .limit(1);
  return result[0];
}

export async function listRecentTradeSnapshots(pairId: number, since: Date) {
  const db = await requireDb();
  return db
    .select()
    .from(tradeSnapshots)
    .where(and(eq(tradeSnapshots.pairId, pairId), gte(tradeSnapshots.capturedAt, since)))
    .orderBy(tradeSnapshots.capturedAt);
}

export async function listClosedTradePairs(ownerId: number, limit = 100) {
  const db = await requireDb();
  return db
    .select()
    .from(tradePairs)
    .where(and(eq(tradePairs.ownerId, ownerId), eq(tradePairs.status, "closed")))
    .orderBy(desc(tradePairs.closedAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export async function createClosedTrade(input: {
  ownerId: number;
  pairId: number;
  ceSymbol: string;
  peSymbol: string;
  lots: number;
  ceEntry: string;
  peEntry: string;
  ceExit: string;
  peExit: string;
  pnlUsd: string;
  feesInr: string;
  netInr: string;
  note?: string;
  closedAt: Date;
}) {
  const db = await requireDb();
  await db.insert(closedTrades).values(input).onDuplicateKeyUpdate({
    set: {
      ceExit: input.ceExit,
      peExit: input.peExit,
      pnlUsd: input.pnlUsd,
      feesInr: input.feesInr,
      netInr: input.netInr,
      note: input.note ?? null,
      closedAt: input.closedAt,
    },
  });
}

export async function listClosedTrades(ownerId: number, limit = 100) {
  const db = await requireDb();
  return db
    .select()
    .from(closedTrades)
    .where(eq(closedTrades.ownerId, ownerId))
    .orderBy(desc(closedTrades.closedAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export type RealizedPnlEvent = {
  id: number;
  source: "full_close" | "partial_close";
  occurredAt: Date;
  netInr: string;
  feesInr: string;
};

/** Returns only persisted, account-owned realized P&L events; no mark-to-market estimates are mixed in. */
export async function listRealizedPnlEvents(ownerId: number, since?: Date) {
  const db = await requireDb();
  const fullCloseWhere = since
    ? and(eq(closedTrades.ownerId, ownerId), gte(closedTrades.closedAt, since))
    : eq(closedTrades.ownerId, ownerId);
  const partialCloseWhere = since
    ? and(eq(partialCloses.ownerId, ownerId), gte(partialCloses.completedAt, since))
    : eq(partialCloses.ownerId, ownerId);
  const [fullCloses, partialCloseRows] = await Promise.all([
    db.select({ id: closedTrades.id, occurredAt: closedTrades.closedAt, netInr: closedTrades.netInr, feesInr: closedTrades.feesInr }).from(closedTrades).where(fullCloseWhere),
    db.select({ id: partialCloses.id, occurredAt: partialCloses.completedAt, netInr: partialCloses.netInr, feesInr: partialCloses.feesInr }).from(partialCloses).where(partialCloseWhere),
  ]);
  return [
    ...fullCloses.map(row => ({ ...row, source: "full_close" as const })),
    ...partialCloseRows.map(row => ({ ...row, source: "partial_close" as const })),
  ].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()) satisfies RealizedPnlEvent[];
}

export async function recordTradeEvent(input: {
  ownerId: number;
  pairId?: number;
  level: "info" | "warning" | "critical";
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const db = await requireDb();
  await db.insert(tradeEvents).values(input);
}

export async function createNotification(input: {
  ownerId: number;
  pairId?: number;
  kind: string;
  title: string;
  body: string;
}) {
  const db = await requireDb();
  const [result] = await db.insert(notifications).values(input);
  const notification = await db.select().from(notifications).where(eq(notifications.id, Number(result.insertId))).limit(1);
  if (!notification[0]) throw new Error("Unable to create notification");
  return notification[0];
}

export async function updateNotificationDelivery(id: number, deliveryStatus: "queued" | "sent" | "failed", deliveryError?: string) {
  const db = await requireDb();
  await db
    .update(notifications)
    .set({ deliveryStatus, deliveryError: deliveryError ?? null, sentAt: deliveryStatus === "sent" ? new Date() : null })
    .where(eq(notifications.id, id));
}

export async function listNotifications(ownerId: number, limit = 50) {
  const db = await requireDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.ownerId, ownerId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getOrCreateWatchdogState(ownerId: number) {
  const db = await requireDb();
  const existing = await db.select().from(watchdogStates).where(eq(watchdogStates.ownerId, ownerId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(watchdogStates).values({ ownerId });
  const created = await db.select().from(watchdogStates).where(eq(watchdogStates.ownerId, ownerId)).limit(1);
  if (!created[0]) throw new Error("Unable to initialize watchdog state");
  return created[0];
}

export async function updateWatchdogState(
  ownerId: number,
  state: Partial<{
    pairId: number | null;
    status: "offline" | "healthy" | "degraded" | "emergency";
    manualHold: boolean;
    closeRequested: boolean;
    profitHighInr: string | null;
    lastPollAt: Date | null;
    lastSnapshotAt: Date | null;
    lastError: string | null;
    workerId: string | null;
  }>,
) {
  const db = await requireDb();
  await getOrCreateWatchdogState(ownerId);
  await db.update(watchdogStates).set(state).where(eq(watchdogStates.ownerId, ownerId));
  return getOrCreateWatchdogState(ownerId);
}

export async function getWatchdogState(ownerId: number) {
  return getOrCreateWatchdogState(ownerId);
}

export async function createExportJob(ownerId: number, kind: "trade_history" | "live_monitor" | "csv") {
  const db = await requireDb();
  const [result] = await db.insert(exportJobs).values({ ownerId, kind });
  const job = await db.select().from(exportJobs).where(eq(exportJobs.id, Number(result.insertId))).limit(1);
  if (!job[0]) throw new Error("Unable to create export job");
  return job[0];
}

export async function updateExportJob(
  id: number,
  state: Partial<{
    status: "queued" | "processing" | "completed" | "failed";
    fileName: string | null;
    fileUrl: string | null;
    error: string | null;
    completedAt: Date | null;
  }>,
) {
  const db = await requireDb();
  await db.update(exportJobs).set(state).where(eq(exportJobs.id, id));
}

export async function tryAcquireWorkerLease(name: string, holderId: string, leaseMs = 15_000) {
  const db = await requireDb();
  const expiresAt = new Date(Date.now() + leaseMs);
  await db
    .insert(workerLeases)
    .values({ name, holderId, expiresAt })
    .onDuplicateKeyUpdate({
      set: {
        holderId: sql<string>`IF(${workerLeases.expiresAt} < NOW() OR ${workerLeases.holderId} = ${holderId}, VALUES(${workerLeases.holderId}), ${workerLeases.holderId})`,
        expiresAt: sql<Date>`IF(${workerLeases.expiresAt} < NOW() OR ${workerLeases.holderId} = ${holderId}, VALUES(${workerLeases.expiresAt}), ${workerLeases.expiresAt})`,
      },
    });
  const lease = await db.select().from(workerLeases).where(eq(workerLeases.name, name)).limit(1);
  return lease[0]?.holderId === holderId && lease[0].expiresAt.getTime() > Date.now();
}
