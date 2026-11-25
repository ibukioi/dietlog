CREATE TABLE `meal_photo` (
	`meal_item_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`byte_size` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meal_item_id`) REFERENCES `meal_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_photo_user_idx` ON `meal_photo` (`user_id`);