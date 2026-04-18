-- Thêm cột thống kê vào bảng users (chạy 1 lần)
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `total_games` INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `total_wins`  INT UNSIGNED NOT NULL DEFAULT 0;
