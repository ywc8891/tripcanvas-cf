CREATE TABLE `users_allowed_markets` (
  `order` integer NOT NULL,
  `parent_id` integer NOT NULL,
  `value` text,
  `id` integer PRIMARY KEY NOT NULL,
  FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `users_allowed_markets_order_idx` ON `users_allowed_markets` (`order`);
CREATE INDEX `users_allowed_markets_parent_idx` ON `users_allowed_markets` (`parent_id`);
ALTER TABLE `users` ADD `role` text DEFAULT 'editor' NOT NULL;
INSERT INTO `payload_migrations` (`name`, `batch`) VALUES ('20260424_080945.ts', 2);
