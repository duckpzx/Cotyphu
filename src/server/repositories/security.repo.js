import db from "../config/db.js";

const securityRepo = {
  /**
   * Tự động tạo 3 bảng an ninh (security_events, ip_blacklist, user_sessions_log) nếu chưa có.
   */
  async ensureSecuritySchema() {
    try {
      await db.query(`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log("🛡️ [SECURITY] Verified security_events, ip_blacklist, user_sessions_log tables");
    } catch (err) {
      console.error("ensureSecuritySchema error:", err.message);
    }
  },

  async insertEvent(ev) {
    await db.query(
      `INSERT INTO security_events
         (user_id, username, ip_address, user_agent, device_fingerprint,
          event_type, severity, risk_score, endpoint, payload_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.user_id ? Number(ev.user_id) : null,
        ev.username ? String(ev.username).slice(0, 100) : null,
        String(ev.ip_address || "unknown").slice(0, 64),
        ev.user_agent ? String(ev.user_agent).slice(0, 512) : null,
        ev.device_fingerprint ? String(ev.device_fingerprint).slice(0, 128) : null,
        String(ev.event_type || "UNKNOWN").slice(0, 64),
        ev.severity || "INFO",
        Number(ev.risk_score) || 0,
        ev.endpoint ? String(ev.endpoint).slice(0, 180) : null,
        ev.payload_summary ? String(ev.payload_summary).slice(0, 1500) : null,
      ]
    );
  },

  async upsertSession({ user_id, username, ip_address, user_agent, device_fingerprint = null }) {
    if (!user_id) return;
    await db.query(
      `INSERT INTO user_sessions_log (user_id, username, ip_address, user_agent, device_fingerprint)
       VALUES (?, ?, ?, ?, ?)`,
      [
        Number(user_id),
        username ? String(username).slice(0, 100) : null,
        String(ip_address || "unknown").slice(0, 64),
        user_agent ? String(user_agent).slice(0, 512) : null,
        device_fingerprint ? String(device_fingerprint).slice(0, 128) : null,
      ]
    );
  },

  async listEvents({ severity = "all", event_type = "all", search = "", limit = 100 } = {}) {
    const conditions = [];
    const params = [];

    if (severity && severity !== "all") {
      conditions.push("e.severity = ?");
      params.push(severity);
    }
    if (event_type && event_type !== "all") {
      conditions.push("e.event_type = ?");
      params.push(event_type);
    }
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      conditions.push(
        "(e.ip_address LIKE ? OR e.username LIKE ? OR e.user_agent LIKE ? OR e.endpoint LIKE ? OR e.payload_summary LIKE ? OR CAST(e.user_id AS CHAR) = ?)"
      );
      params.push(like, like, like, like, like, search.trim());
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

    const [rows] = await db.query(
      `SELECT e.id, e.user_id, COALESCE(e.username, u.username, u.name) AS username,
              e.ip_address, e.user_agent, e.device_fingerprint,
              e.event_type, e.severity, e.risk_score, e.endpoint, e.payload_summary, e.created_at
       FROM security_events e
       LEFT JOIN users u ON u.id = e.user_id
       ${whereSql}
       ORDER BY e.id DESC
       LIMIT ?`,
      [...params, safeLimit]
    );
    return rows;
  },

  async getSummary24h() {
    const [[counts]] = await db.query(`
      SELECT
        COUNT(*) AS total_24h,
        SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) AS high_critical_24h,
        SUM(CASE WHEN risk_score > 0 THEN 1 ELSE 0 END) AS suspicious_24h,
        COUNT(DISTINCT CASE WHEN risk_score > 0 THEN ip_address END) AS suspect_ips_24h
      FROM security_events
      WHERE created_at >= NOW() - INTERVAL 24 HOUR
    `);

    const [topIps] = await db.query(`
      SELECT ip_address,
             COUNT(*) AS event_count,
             SUM(risk_score) AS total_risk,
             MAX(created_at) AS last_seen,
             GROUP_CONCAT(DISTINCT event_type ORDER BY event_type SEPARATOR ', ') AS event_types
      FROM security_events
      WHERE created_at >= NOW() - INTERVAL 7 DAY AND risk_score > 0
      GROUP BY ip_address
      ORDER BY total_risk DESC, event_count DESC
      LIMIT 10
    `);

    const [topUsers] = await db.query(`
      SELECT e.user_id,
             COALESCE(MAX(u.name), MAX(u.username), MAX(e.username), CONCAT('User #', e.user_id)) AS display_name,
             COUNT(*) AS event_count,
             SUM(e.risk_score) AS total_risk,
             MAX(e.ip_address) AS last_ip,
             MAX(e.created_at) AS last_seen
      FROM security_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.user_id IS NOT NULL AND e.risk_score > 0 AND e.created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY e.user_id
      ORDER BY total_risk DESC, event_count DESC
      LIMIT 10
    `);

    const [[blRow]] = await db.query(`
      SELECT COUNT(*) AS active_blacklist
      FROM ip_blacklist
      WHERE expires_at IS NULL OR expires_at > NOW()
    `);

    const [multiAccountIps] = await db.query(`
      SELECT ip_address,
             COUNT(DISTINCT user_id) AS account_count,
             GROUP_CONCAT(DISTINCT COALESCE(username, CONCAT('#', user_id)) SEPARATOR ', ') AS accounts,
             MAX(last_seen_at) AS last_seen
      FROM user_sessions_log
      WHERE last_seen_at >= NOW() - INTERVAL 7 DAY
      GROUP BY ip_address
      HAVING COUNT(DISTINCT user_id) >= 2
      ORDER BY account_count DESC, last_seen DESC
      LIMIT 15
    `);

    return {
      total_24h: Number(counts?.total_24h || 0),
      high_critical_24h: Number(counts?.high_critical_24h || 0),
      suspicious_24h: Number(counts?.suspicious_24h || 0),
      suspect_ips_24h: Number(counts?.suspect_ips_24h || 0),
      active_blacklist: Number(blRow?.active_blacklist || 0),
      multi_account_ip_count: multiAccountIps.length,
      top_ips: topIps,
      top_users: topUsers,
      multi_account_ips: multiAccountIps,
    };
  },

  // ── IP BLACKLIST ─────────────────────────────────────────────────
  async getActiveBlacklist() {
    const [rows] = await db.query(`
      SELECT b.id, b.ip_address, b.reason, b.banned_by,
             COALESCE(u.name, u.username, 'SYSTEM') AS banned_by_name,
             b.expires_at, b.hit_count, b.created_at
      FROM ip_blacklist b
      LEFT JOIN users u ON u.id = b.banned_by
      ORDER BY b.id DESC
    `);
    return rows;
  },

  async addBlacklistIp({ ip_address, reason, banned_by = null, expires_at = null }) {
    await db.query(
      `INSERT INTO ip_blacklist (ip_address, reason, banned_by, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         banned_by = VALUES(banned_by),
         expires_at = VALUES(expires_at)`,
      [String(ip_address).trim(), String(reason || "Hành vi khả nghi").slice(0, 250), banned_by, expires_at]
    );
  },

  async removeBlacklistIp(id) {
    const [res] = await db.query("DELETE FROM ip_blacklist WHERE id = ?", [Number(id)]);
    return res.affectedRows > 0;
  },

  async incrementBlacklistHit(ip_address) {
    try {
      await db.query("UPDATE ip_blacklist SET hit_count = hit_count + 1 WHERE ip_address = ?", [ip_address]);
    } catch (_) {}
  },

  // ── SESSIONS ─────────────────────────────────────────────────────
  async listRecentSessions(limit = 60) {
    const [rows] = await db.query(
      `SELECT s.id, s.user_id, COALESCE(u.name, u.username, s.username) AS display_name,
              s.ip_address, s.user_agent, s.device_fingerprint, s.login_at, s.last_seen_at
       FROM user_sessions_log s
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC
       LIMIT ?`,
      [Math.min(200, Math.max(1, Number(limit) || 60))]
    );
    return rows;
  },
};

export default securityRepo;
