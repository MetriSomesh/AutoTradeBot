CREATE TABLE `closed_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`pair_id` int NOT NULL,
	`ce_symbol` varchar(96) NOT NULL,
	`pe_symbol` varchar(96) NOT NULL,
	`lots` int NOT NULL,
	`ce_entry` decimal(18,6) NOT NULL,
	`pe_entry` decimal(18,6) NOT NULL,
	`ce_exit` decimal(18,6) NOT NULL,
	`pe_exit` decimal(18,6) NOT NULL,
	`pnl_usd` decimal(14,2) NOT NULL,
	`fees_inr` decimal(14,2) NOT NULL,
	`net_inr` decimal(14,2) NOT NULL,
	`note` text,
	`closed_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `closed_trades_id` PRIMARY KEY(`id`),
	CONSTRAINT `closed_trades_pair_unique` UNIQUE(`pair_id`)
);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`kind` enum('trade_history','live_monitor','csv') NOT NULL,
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`file_name` varchar(180),
	`file_url` text,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `export_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchdog_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`pair_id` int,
	`status` enum('offline','healthy','degraded','emergency') NOT NULL DEFAULT 'offline',
	`manual_hold` boolean NOT NULL DEFAULT false,
	`close_requested` boolean NOT NULL DEFAULT false,
	`profit_high_inr` decimal(14,2),
	`last_poll_at` timestamp,
	`last_snapshot_at` timestamp,
	`last_error` text,
	`worker_id` varchar(96),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watchdog_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchdog_states_owner_unique` UNIQUE(`owner_id`)
);
--> statement-breakpoint
CREATE INDEX `closed_trades_owner_time_idx` ON `closed_trades` (`owner_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `export_jobs_owner_time_idx` ON `export_jobs` (`owner_id`,`created_at`);