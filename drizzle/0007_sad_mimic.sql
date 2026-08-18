CREATE TABLE `scheduled_entry_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`ist_trade_date` varchar(10) NOT NULL,
	`status` enum('started','opened','flattened','skipped','failed') NOT NULL DEFAULT 'started',
	`ce_symbol` varchar(96),
	`pe_symbol` varchar(96),
	`ce_product_id` bigint,
	`pe_product_id` bigint,
	`requested_lots` int NOT NULL,
	`ce_filled_lots` int NOT NULL DEFAULT 0,
	`pe_filled_lots` int NOT NULL DEFAULT 0,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_entry_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_entry_attempt_owner_date_unique` UNIQUE(`owner_id`,`ist_trade_date`)
);
--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `scheduled_entry_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `scheduled_entry_lots` int DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `scheduled_entry_premium_min` decimal(18,6) DEFAULT '85.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `scheduled_entry_premium_max` decimal(18,6) DEFAULT '120.000000' NOT NULL;--> statement-breakpoint
CREATE INDEX `scheduled_entry_attempt_status_idx` ON `scheduled_entry_attempts` (`status`,`created_at`);