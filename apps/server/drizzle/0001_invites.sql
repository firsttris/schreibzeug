CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invites_role" CHECK("invites"."role" in ('edit', 'view'))
);
--> statement-breakpoint
CREATE INDEX `invites_node` ON `invites` (`node_id`);