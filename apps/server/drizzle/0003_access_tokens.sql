CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "access_tokens_scope" CHECK("access_tokens"."scope" in ('read', 'write'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_tokens_hash` ON `access_tokens` (`hash`);--> statement-breakpoint
CREATE INDEX `access_tokens_user` ON `access_tokens` (`user_id`);