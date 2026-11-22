CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `cooking_coefficient` (
	`cooking_method_code` text NOT NULL,
	`food_category` text NOT NULL,
	`weight_change_rate` real NOT NULL,
	`oil_absorption_pct` real DEFAULT 0 NOT NULL,
	`retention_json` text,
	`basis` text NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`cooking_method_code`, `food_category`)
);
--> statement-breakpoint
CREATE TABLE `cooking_method` (
	`code` text PRIMARY KEY NOT NULL,
	`name_ja` text NOT NULL,
	`mext_keywords` text NOT NULL,
	`uses_oil` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dataset_version` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`version_label` text NOT NULL,
	`published_on` text,
	`errata_on` text,
	`file_sha256` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `day_status` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`is_complete` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dri_value` (
	`id` text PRIMARY KEY NOT NULL,
	`dri_version` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`sex` text NOT NULL,
	`age_min` integer NOT NULL,
	`age_max` integer NOT NULL,
	`life_stage` text DEFAULT 'none' NOT NULL,
	`ear` real,
	`rda` real,
	`ai` real,
	`dg_lower` real,
	`dg_upper` real,
	`ul` real,
	`source_ref` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dri_lookup_idx` ON `dri_value` (`nutrient_code`,`sex`,`age_min`);--> statement-breakpoint
CREATE TABLE `meal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`eaten_on` text NOT NULL,
	`meal_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_user_day_type_uq` ON `meal` (`user_id`,`eaten_on`,`meal_type`);--> statement-breakpoint
CREATE TABLE `meal_item` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`my_product_id` text,
	`recipe_id` text,
	`food_no` text,
	`name_snapshot` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`grams` real,
	`energy_kcal` real,
	`protein_g` real,
	`fat_g` real,
	`carb_g` real,
	`salt_g` real,
	`nutrients_json` text NOT NULL,
	`calc_trace_json` text,
	`is_estimate` integer DEFAULT false NOT NULL,
	`source_label` text,
	`dataset_version_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_item_meal_idx` ON `meal_item` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_item_user_idx` ON `meal_item` (`user_id`);--> statement-breakpoint
CREATE TABLE `mext_cooked_variant` (
	`raw_food_no` text NOT NULL,
	`cooking_method_code` text NOT NULL,
	`cooked_food_no` text NOT NULL,
	`weight_change_rate` real NOT NULL,
	`includes_oil` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`raw_food_no`, `cooking_method_code`, `cooked_food_no`)
);
--> statement-breakpoint
CREATE TABLE `mext_food` (
	`food_no` text PRIMARY KEY NOT NULL,
	`index_no` text,
	`group_code` text NOT NULL,
	`name_raw` text NOT NULL,
	`name_display` text NOT NULL,
	`search_text` text NOT NULL,
	`refuse_rate` real,
	`is_cooked` integer DEFAULT false NOT NULL,
	`cooking_method_code` text,
	`is_dish` integer DEFAULT false NOT NULL,
	`density_g_per_ml` real,
	`note` text,
	`dataset_version_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mext_food_group_idx` ON `mext_food` (`group_code`);--> statement-breakpoint
CREATE TABLE `mext_food_alias` (
	`food_no` text NOT NULL,
	`alias` text NOT NULL,
	PRIMARY KEY(`food_no`, `alias`),
	FOREIGN KEY (`food_no`) REFERENCES `mext_food`(`food_no`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alias_idx` ON `mext_food_alias` (`alias`);--> statement-breakpoint
CREATE TABLE `mext_food_nutrient` (
	`food_no` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`value` real,
	`flag` text NOT NULL,
	`raw_text` text,
	PRIMARY KEY(`food_no`, `nutrient_code`),
	FOREIGN KEY (`food_no`) REFERENCES `mext_food`(`food_no`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mfn_nutrient_value_idx` ON `mext_food_nutrient` (`nutrient_code`,`value`);--> statement-breakpoint
CREATE TABLE `my_product` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`external_ref` text,
	`name` text NOT NULL,
	`brand` text,
	`basis` text NOT NULL,
	`serving_size_g` real,
	`serving_label` text,
	`nutrients_json` text NOT NULL,
	`image_blob_url` text,
	`is_estimate` integer DEFAULT false NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `my_product_user_idx` ON `my_product` (`user_id`,`last_used_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `my_product_ext_uq` ON `my_product` (`user_id`,`source`,`external_ref`);--> statement-breakpoint
CREATE TABLE `nutrient` (
	`code` text PRIMARY KEY NOT NULL,
	`name_ja` text NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`display_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_goal` (
	`user_id` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`target` real NOT NULL,
	`direction` text NOT NULL,
	`upper` real,
	`source` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`show_on_home` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`user_id`, `nutrient_code`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `off_product_cache` (
	`off_code` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`normalized_json` text,
	`status` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `off_search_cache` (
	`query_norm` text PRIMARY KEY NOT NULL,
	`codes_json` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`birth_year_month` text NOT NULL,
	`sex` text NOT NULL,
	`height_cm` real NOT NULL,
	`weight_kg` real NOT NULL,
	`activity_level` text NOT NULL,
	`life_stage` text DEFAULT 'none' NOT NULL,
	`menstruation` integer DEFAULT false NOT NULL,
	`timezone` text DEFAULT 'Asia/Tokyo' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_limit_bucket` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`note` text,
	`color` text,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_user_idx` ON `recipe` (`user_id`);--> statement-breakpoint
CREATE TABLE `recipe_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`role` text NOT NULL,
	`food_no` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`grams` real NOT NULL,
	`weight_basis` text DEFAULT 'raw' NOT NULL,
	`cooking_method_code` text DEFAULT 'raw' NOT NULL,
	`consume_all` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredient_recipe_idx` ON `recipe_ingredient` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`is_anonymous` integer DEFAULT false,
	`guest_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
