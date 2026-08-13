CREATE TABLE `local_auth_bootstrap` (
	`singleton_key` int NOT NULL,
	`first_admin_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_auth_bootstrap_singleton_key` PRIMARY KEY(`singleton_key`)
);
