import {
  bigint,
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  failedSignInCount: int("failed_sign_in_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  passwordChangedAt: timestamp("password_changed_at"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => [
  index("users_email_idx").on(table.email),
]);

export const localSessions = mysqlTable("local_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("local_sessions_token_hash_unique").on(table.tokenHash),
  index("local_sessions_user_expiry_idx").on(table.userId, table.expiresAt),
]);

export const localAuthBootstrap = mysqlTable("local_auth_bootstrap", {
  singletonKey: int("singleton_key").primaryKey(),
  firstAdminUserId: int("first_admin_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
  index("password_reset_tokens_user_expiry_idx").on(table.userId, table.expiresAt),
]);

export const deltaCredentials = mysqlTable("delta_credentials", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  environment: mysqlEnum("environment", ["demo", "live"]).notNull().default("demo"),
  baseUrl: varchar("base_url", { length: 255 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 32 }).notNull(),
  apiKeyTag: varchar("api_key_tag", { length: 32 }).notNull(),
  apiSecretCiphertext: text("api_secret_ciphertext").notNull(),
  apiSecretIv: varchar("api_secret_iv", { length: 32 }).notNull(),
  apiSecretTag: varchar("api_secret_tag", { length: 32 }).notNull(),
  keyFingerprint: varchar("key_fingerprint", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("delta_credentials_owner_unique").on(table.ownerId)]);

export const riskSettings = mysqlTable("risk_settings", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  usdInr: decimal("usd_inr", { precision: 10, scale: 2 }).notNull().default("83.00"),
  maxTradeLossInr: decimal("max_trade_loss_inr", { precision: 14, scale: 2 }).notNull().default("1200.00"),
  maxDailyLossInr: decimal("max_daily_loss_inr", { precision: 14, scale: 2 }).notNull().default("2400.00"),
  profitTrailStartInr: decimal("profit_trail_start_inr", { precision: 14, scale: 2 }).notNull().default("600.00"),
  profitTrailDrawdownInr: decimal("profit_trail_drawdown_inr", { precision: 14, scale: 2 }).notNull().default("300.00"),
  exitMode: mysqlEnum("exit_mode", ["manual", "auto"]).notNull().default("manual"),
  autoProfitTargetInr: decimal("auto_profit_target_inr", { precision: 14, scale: 2 }),
  manualOnlyMode: boolean("manual_only_mode").notNull().default(true),
  liveArmed: boolean("live_armed").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("risk_settings_owner_unique").on(table.ownerId)]);

export const tradePairs = mysqlTable("trade_pairs", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  mode: mysqlEnum("mode", ["manual", "bot"]).notNull().default("manual"),
  status: mysqlEnum("status", ["adopted", "closing", "closed", "emergency"]).notNull().default("adopted"),
  ceSymbol: varchar("ce_symbol", { length: 96 }).notNull(),
  peSymbol: varchar("pe_symbol", { length: 96 }).notNull(),
  ceProductId: bigint("ce_product_id", { mode: "number" }).notNull(),
  peProductId: bigint("pe_product_id", { mode: "number" }).notNull(),
  lots: int("lots").notNull(),
  remainingLots: int("remaining_lots").notNull().default(0),
  ceEntry: decimal("ce_entry", { precision: 18, scale: 6 }).notNull(),
  peEntry: decimal("pe_entry", { precision: 18, scale: 6 }).notNull(),
  ceStop: decimal("ce_stop", { precision: 18, scale: 6 }).notNull(),
  peStop: decimal("pe_stop", { precision: 18, scale: 6 }).notNull(),
  manualHold: boolean("manual_hold").notNull().default(false),
  profitHighInr: decimal("profit_high_inr", { precision: 14, scale: 2 }),
  protectionStatus: varchar("protection_status", { length: 64 }).notNull().default("NOT_CONFIGURED"),
  closeReason: text("close_reason"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("trade_pairs_owner_status_idx").on(table.ownerId, table.status),
  index("trade_pairs_created_at_idx").on(table.createdAt),
]);

export const tradeSnapshots = mysqlTable("trade_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  pairId: int("pair_id").notNull(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  spot: decimal("spot", { precision: 18, scale: 6 }).notNull(),
  ceMark: decimal("ce_mark", { precision: 18, scale: 6 }).notNull(),
  peMark: decimal("pe_mark", { precision: 18, scale: 6 }).notNull(),
  pnlUsd: decimal("pnl_usd", { precision: 14, scale: 2 }).notNull(),
  pnlInr: decimal("pnl_inr", { precision: 14, scale: 2 }).notNull(),
  feesInr: decimal("fees_inr", { precision: 14, scale: 2 }).notNull(),
  netInr: decimal("net_inr", { precision: 14, scale: 2 }).notNull(),
  status: varchar("status", { length: 64 }).notNull(),
}, table => [index("trade_snapshots_pair_time_idx").on(table.pairId, table.capturedAt)]);

export const closeRequests = mysqlTable("close_requests", {
  id: int("id").autoincrement().primaryKey(),
  pairId: int("pair_id").notNull(),
  requestedBy: int("requested_by").notNull(),
  closePercent: int("close_percent").notNull().default(100),
  reason: varchar("reason", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "cancelled"]).notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, table => [index("close_requests_pair_status_idx").on(table.pairId, table.status)]);

export const partialCloses = mysqlTable("partial_closes", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  pairId: int("pair_id").notNull(),
  closeRequestId: int("close_request_id").notNull(),
  closePercent: int("close_percent").notNull(),
  ceLots: int("ce_lots").notNull(),
  peLots: int("pe_lots").notNull(),
  ceExit: decimal("ce_exit", { precision: 18, scale: 6 }).notNull(),
  peExit: decimal("pe_exit", { precision: 18, scale: 6 }).notNull(),
  pnlUsd: decimal("pnl_usd", { precision: 14, scale: 2 }).notNull(),
  feesInr: decimal("fees_inr", { precision: 14, scale: 2 }).notNull(),
  netInr: decimal("net_inr", { precision: 14, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 128 }).notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("partial_closes_request_unique").on(table.closeRequestId),
  index("partial_closes_pair_time_idx").on(table.pairId, table.completedAt),
]);

export const tradeEvents = mysqlTable("trade_events", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  pairId: int("pair_id"),
  level: mysqlEnum("level", ["info", "warning", "critical"]).notNull().default("info"),
  eventType: varchar("event_type", { length: 96 }).notNull(),
  message: text("message").notNull(),
  payload: json("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("trade_events_owner_time_idx").on(table.ownerId, table.createdAt)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  pairId: int("pair_id"),
  kind: varchar("kind", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  deliveryStatus: mysqlEnum("delivery_status", ["queued", "sent", "failed"]).notNull().default("queued"),
  deliveryError: text("delivery_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, table => [index("notifications_owner_time_idx").on(table.ownerId, table.createdAt)]);

export const workerLeases = mysqlTable("worker_leases", {
  name: varchar("name", { length: 64 }).primaryKey(),
  holderId: varchar("holder_id", { length: 96 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const watchdogStates = mysqlTable("watchdog_states", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  pairId: int("pair_id"),
  status: mysqlEnum("status", ["offline", "healthy", "degraded", "emergency"]).notNull().default("offline"),
  manualHold: boolean("manual_hold").notNull().default(false),
  closeRequested: boolean("close_requested").notNull().default(false),
  profitHighInr: decimal("profit_high_inr", { precision: 14, scale: 2 }),
  lastPollAt: timestamp("last_poll_at"),
  lastSnapshotAt: timestamp("last_snapshot_at"),
  lastError: text("last_error"),
  workerId: varchar("worker_id", { length: 96 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("watchdog_states_owner_unique").on(table.ownerId)]);

export const closedTrades = mysqlTable("closed_trades", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  pairId: int("pair_id").notNull(),
  ceSymbol: varchar("ce_symbol", { length: 96 }).notNull(),
  peSymbol: varchar("pe_symbol", { length: 96 }).notNull(),
  lots: int("lots").notNull(),
  ceEntry: decimal("ce_entry", { precision: 18, scale: 6 }).notNull(),
  peEntry: decimal("pe_entry", { precision: 18, scale: 6 }).notNull(),
  ceExit: decimal("ce_exit", { precision: 18, scale: 6 }).notNull(),
  peExit: decimal("pe_exit", { precision: 18, scale: 6 }).notNull(),
  pnlUsd: decimal("pnl_usd", { precision: 14, scale: 2 }).notNull(),
  feesInr: decimal("fees_inr", { precision: 14, scale: 2 }).notNull(),
  netInr: decimal("net_inr", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  closedAt: timestamp("closed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("closed_trades_pair_unique").on(table.pairId),
  index("closed_trades_owner_time_idx").on(table.ownerId, table.closedAt),
]);

export const exportJobs = mysqlTable("export_jobs", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  kind: mysqlEnum("kind", ["trade_history", "live_monitor", "csv"]).notNull(),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).notNull().default("queued"),
  fileName: varchar("file_name", { length: 180 }),
  fileUrl: text("file_url"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, table => [index("export_jobs_owner_time_idx").on(table.ownerId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TradePair = typeof tradePairs.$inferSelect;
export type TradeSnapshot = typeof tradeSnapshots.$inferSelect;
