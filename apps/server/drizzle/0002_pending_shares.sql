CREATE TABLE `pending_shares` (
	`node_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`node_id`, `email`),
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pending_shares_role" CHECK("pending_shares"."role" in ('edit', 'view'))
);
--> statement-breakpoint
CREATE INDEX `pending_shares_email` ON `pending_shares` (`email`);