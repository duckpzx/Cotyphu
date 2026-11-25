-- Migration: Security Telemetry, Anti-Cheat Events, IP Blacklist & Session Tracking
-- Lưu ý: Server cũng tự chạy securityRepo.ensureSecuritySchema() an toàn khi khởi động.

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NULL DEFAULT NULL,
  username VARCHAR(100) NULL DEFAULT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(512) NULL DEFAULT NULL,
  device_fingerprint VARCHAR(128) NULL DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  severity ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'INFO',
  risk_score INT NOT NULL DEFAULT 0,
  endpoint VARCHAR(180) NULL DEFAULT NULL,
  payload_summary TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_sec_created (created_at),
  INDEX idx_sec_ip (ip_address),
  INDEX idx_sec_user (user_id),
  INDEX idx_sec_severity (severity),
  INDEX idx_sec_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INT NOT NULL AUTO_INCREMENT,
  ip_address VARCHAR(64) NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT 'Hành vi khả nghi',
  banned_by INT NULL DEFAULT NULL,
  expires_at DATETIME NULL DEFAULT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_blacklist_ip (ip_address),
  INDEX idx_blacklist_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_sessions_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  username VARCHAR(100) NULL DEFAULT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(512) NULL DEFAULT NULL,
  device_fingerprint VARCHAR(128) NULL DEFAULT NULL,
  login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_sess_user (user_id),
  INDEX idx_sess_ip (ip_address),
  INDEX idx_sess_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
