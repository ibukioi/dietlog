ALTER TABLE `meal_item` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `my_product` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipe` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- 既存のお試しユーザー: 開始から 2 分以内に作られた行はサンプルとみなす(このマイグレーション以前は印がなかったため)
UPDATE `meal_item` SET `is_sample` = 1 WHERE EXISTS (SELECT 1 FROM `user` u WHERE u.`id` = `meal_item`.`user_id` AND u.`is_anonymous` = 1 AND `meal_item`.`created_at` <= u.`created_at` + 120000);--> statement-breakpoint
UPDATE `my_product` SET `is_sample` = 1 WHERE EXISTS (SELECT 1 FROM `user` u WHERE u.`id` = `my_product`.`user_id` AND u.`is_anonymous` = 1 AND `my_product`.`created_at` <= u.`created_at` + 120000);--> statement-breakpoint
UPDATE `recipe` SET `is_sample` = 1 WHERE EXISTS (SELECT 1 FROM `user` u WHERE u.`id` = `recipe`.`user_id` AND u.`is_anonymous` = 1 AND `recipe`.`created_at` <= u.`created_at` + 120000);--> statement-breakpoint
UPDATE `profile` SET `is_sample` = 1 WHERE EXISTS (SELECT 1 FROM `user` u WHERE u.`id` = `profile`.`user_id` AND u.`is_anonymous` = 1 AND `profile`.`updated_at` <= u.`created_at` + 120000);
