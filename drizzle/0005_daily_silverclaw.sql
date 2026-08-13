CREATE TABLE `partial_closes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`pair_id` int NOT NULL,
	`close_request_id` int NOT NULL,
	`close_percent` int NOT NULL,
	`ce_lots` int NOT NULL,
	`pe_lots` int NOT NULL,
	`ce_exit` decimal(18,6) NOT NULL,
	`pe_exit` decimal(18,6) NOT NULL,
	`pnl_usd` decimal(14,2) NOT NULL,
	`fees_inr` decimal(14,2) NOT NULL,
	`net_inr` decimal(14,2) NOT NULL,
	`reason` varchar(128) NOT NULL,
	`completed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partial_closes_id` PRIMARY KEY(`id`),
	CONSTRAINT `partial_closes_request_unique` UNIQUE(`close_request_id`)
);
--> statement-breakpoint
CREATE INDEX `partial_closes_pair_time_idx` ON `partial_closes` (`pair_id`,`completed_at`);