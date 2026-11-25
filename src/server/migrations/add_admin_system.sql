-- Migration: Admin Dashboard, Role RBAC, Ban/Mute & Audit Logs
-- Lưu ý: Server cũng tự chạy ensureAdminSchema() an toàn khi khởi động.

ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN ban_reason VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN banned_until DATETIME NULL DEFAULT NULL,
  ADD COLUMN muted_until DATETIME NULL DEFAULT NULL,
  ADD COLUMN mute_reason VARCHAR(255) NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INT NOT NULL AUTO_INCREMENT,
  admin_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(64) NULL DEFAULT NULL,
  detail TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_admin (admin_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
