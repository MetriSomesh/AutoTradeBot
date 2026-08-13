CREATE TABLE `close_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair_id` int NOT NULL,
	`requested_by` int NOT NULL,
	`reason` varchar(128) NOT NULL,
	`status` enum('pending','processing','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`processed_at` timestamp,
	CONSTRAINT `close_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`pair_id` int,
	`kind` varchar(64) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`delivery_status` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
	`delivery_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`usd_inr` decimal(10,2) NOT NULL DEFAULT '83.00',
	`max_trade_loss_inr` decimal(14,2) NOT NULL DEFAULT '1200.00',
	`max_daily_loss_inr` decimal(14,2) NOT NULL DEFAULT '2400.00',
	`profit_trail_start_inr` decimal(14,2) NOT NULL DEFAULT '600.00',
	`profit_trail_drawdown_inr` decimal(14,2) NOT NULL DEFAULT '300.00',
	`manual_only_mode` boolean NOT NULL DEFAULT true,
	`live_armed` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risk_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `risk_settings_owner_unique` UNIQUE(`owner_id`)
);
--> statement-breakpoint
CREATE TABLE `trade_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`pair_id` int,
	`level` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`event_type` varchar(96) NOT NULL,
	`message` text NOT NULL,
	`payload` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trade_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_pairs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`mode` enum('manual','bot') NOT NULL DEFAULT 'manual',
	`status` enum('adopted','closing','closed','emergency') NOT NULL DEFAULT 'adopted',
	`ce_symbol` varchar(96) NOT NULL,
	`pe_symbol` varchar(96) NOT NULL,
	`ce_product_id` bigint NOT NULL,
	`pe_product_id` bigint NOT NULL,
	`lots` int NOT NULL,
	`ce_entry` decimal(18,6) NOT NULL,
	`pe_entry` decimal(18,6) NOT NULL,
	`ce_stop` decimal(18,6) NOT NULL,
	`pe_stop` decimal(18,6) NOT NULL,
	`manual_hold` boolean NOT NULL DEFAULT false,
	`profit_high_inr` decimal(14,2),
	`protection_status` varchar(64) NOT NULL DEFAULT 'NOT_CONFIGURED',
	`close_reason` text,
	`closed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trade_pairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair_id` int NOT NULL,
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	`spot` decimal(18,6) NOT NULL,
	`ce_mark` decimal(18,6) NOT NULL,
	`pe_mark` decimal(18,6) NOT NULL,
	`pnl_usd` decimal(14,2) NOT NULL,
	`pnl_inr` decimal(14,2) NOT NULL,
	`fees_inr` decimal(14,2) NOT NULL,
	`net_inr` decimal(14,2) NOT NULL,
	`status` varchar(64) NOT NULL,
	CONSTRAINT `trade_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_leases` (
	`name` varchar(64) NOT NULL,
	`holder_id` varchar(96) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_leases_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE INDEX `close_requests_pair_status_idx` ON `close_requests` (`pair_id`,`status`);--> statement-breakpoint
CREATE INDEX `notifications_owner_time_idx` ON `notifications` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `trade_events_owner_time_idx` ON `trade_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `trade_pairs_owner_status_idx` ON `trade_pairs` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `trade_pairs_created_at_idx` ON `trade_pairs` (`created_at`);--> statement-breakpoint
CREATE INDEX `trade_snapshots_pair_time_idx` ON `trade_snapshots` (`pair_id`,`captured_at`);