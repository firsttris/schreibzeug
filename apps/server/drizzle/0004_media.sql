CREATE TABLE `media` (
	`file_id` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`file_id`, `sha256`),
	FOREIGN KEY (`file_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
