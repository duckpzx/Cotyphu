-- Migration: Tạo bảng chat_messages
-- Chạy 1 lần trong phpMyAdmin hoặc MySQL CLI

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel`    ENUM('world', 'room', 'game') NOT NULL DEFAULT 'world',
  `channel_id` INT UNSIGNED DEFAULT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `message`    VARCHAR(500) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_channel` (`channel`, `channel_id`, `created_at`),
  INDEX `idx_user`    (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
