CREATE TABLE `delta_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`environment` enum('demo','live') NOT NULL DEFAULT 'demo',
	`base_url` varchar(255) NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` varchar(32) NOT NULL,
	`api_key_tag` varchar(32) NOT NULL,
	`api_secret_ciphertext` text NOT NULL,
	`api_secret_iv` varchar(32) NOT NULL,
	`api_secret_tag` varchar(32) NOT NULL,
	`key_fingerprint` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delta_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `delta_credentials_owner_unique` UNIQUE(`owner_id`)
);
--> statement-breakpoint
CREATE TABLE `local_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `close_requests` ADD `close_percent` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `exit_mode` enum('manual','auto') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `auto_profit_target_inr` decimal(14,2);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_sign_in_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `local_sessions_user_expiry_idx` ON `local_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_expiry_idx` ON `password_reset_tokens` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);