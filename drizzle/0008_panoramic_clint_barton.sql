CREATE TABLE `scheduled_entry_triggers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`label` varchar(64) NOT NULL,
	`time_ist` varchar(5) NOT NULL,
	`weekdays` varchar(32) NOT NULL DEFAULT '1,2,3,4,5',
	`enabled` boolean NOT NULL DEFAULT false,
	`lots` int NOT NULL DEFAULT 120,
	`premium_min` decimal(18,6) NOT NULL DEFAULT '85.000000',
	`premium_max` decimal(18,6) NOT NULL DEFAULT '120.000000',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_entry_triggers_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_entry_trigger_owner_time_unique` UNIQUE(`owner_id`,`time_ist`)
);
--> statement-breakpoint
ALTER TABLE `scheduled_entry_attempts` DROP INDEX `scheduled_entry_attempt_owner_date_unique`;--> statement-breakpoint
ALTER TABLE `scheduled_entry_attempts` ADD `trigger_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_entry_attempts` ADD `trigger_time_ist` varchar(5) DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_entry_attempts` ADD CONSTRAINT `scheduled_entry_attempt_owner_date_trigger_unique` UNIQUE(`owner_id`,`ist_trade_date`,`trigger_id`);--> statement-breakpoint
CREATE INDEX `scheduled_entry_trigger_enabled_idx` ON `scheduled_entry_triggers` (`enabled`,`time_ist`);