import db from "../config/db.js";
import logger from "../utils/logger.js";

const REQUIRED_USER_COLUMNS = [
  { name: "role", sql: "ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'" },
  { name: "is_banned", sql: "ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0" },
  { name: "ban_reason", sql: "ADD COLUMN ban_reason VARCHAR(255) NULL DEFAULT NULL" },
  { name: "banned_until", sql: "ADD COLUMN banned_until DATETIME NULL DEFAULT NULL" },
  { name: "muted_until", sql: "ADD COLUMN muted_until DATETIME NULL DEFAULT NULL" },
  { name: "mute_reason", sql: "ADD COLUMN mute_reason VARCHAR(255) NULL DEFAULT NULL" },
];

const adminRepo = {
  /**
   * Tự động đảm bảo các cột role/ban/mute và bảng admin_audit_logs tồn tại.
   * Nếu chưa có admin nào trong hệ thống, tự động gán quyền admin cho user đầu tiên (id nhỏ nhất).
   */
  async ensureAdminSchema() {
    try {
      const [cols] = await db.query("SHOW COLUMNS FROM users");
      const existing = new Set(cols.map(c => c.Field));

      for (const col of REQUIRED_USER_COLUMNS) {
        if (!existing.has(col.name)) {
          await db.query(`ALTER TABLE users ${col.sql}`);
          logger.info("ADMIN", `Added column users.${col.name}`);
        }
      }

      await db.query(`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Đảm bảo luôn có ít nhất 1 admin để đăng nhập lần đầu
      const [[{ adminCount }]] = await db.query(
        "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'admin'"
      );
      if (Number(adminCount) === 0) {
        const [firstRows] = await db.query("SELECT id, username FROM users ORDER BY id ASC LIMIT 1");
        if (firstRows[0]) {
          await db.query("UPDATE users SET role = 'admin' WHERE id = ?", [firstRows[0].id]);
          logger.info("ADMIN", `Promoted initial admin '${firstRows[0].username}' (id=${firstRows[0].id})`);
        }
      }
      logger.ok("ADMIN", "Verified tables: users(rbac), admin_audit_logs");
    } catch (err) {
      logger.err("ADMIN", "ensureAdminSchema failed", err);
    }
  },

  async logAudit(adminId, action, targetType, targetId = null, detail = null) {
    try {
      await db.query(
        `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, detail)
         VALUES (?, ?, ?, ?, ?)`,
        [
          Number(adminId),
          String(action),
          String(targetType),
          targetId !== null && targetId !== undefined ? String(targetId) : null,
          detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : null,
        ]
      );
    } catch (err) {
      logger.err("ADMIN", "logAudit failed", err);
    }
  },

  async getAuditLogs(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const [rows] = await db.query(
      `SELECT l.id, l.admin_id, COALESCE(u.name, u.username, CONCAT('Admin #', l.admin_id)) AS admin_name,
              l.action, l.target_type, l.target_id, l.detail, l.created_at
       FROM admin_audit_logs l
       LEFT JOIN users u ON u.id = l.admin_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ?`,
      [safeLimit]
    );
    return rows;
  },

  // ── OVERVIEW ─────────────────────────────────────────────────────
  async getOverviewStats() {
    const [[uRow]] = await db.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins,
        SUM(CASE WHEN is_banned = 1 AND (banned_until IS NULL OR banned_until > NOW()) THEN 1 ELSE 0 END) AS banned_users,
        SUM(CASE WHEN muted_until IS NOT NULL AND muted_until > NOW() THEN 1 ELSE 0 END) AS muted_users
      FROM users
    `);
    const [[qRow]] = await db.query("SELECT COUNT(*) AS total_questions FROM questions");
    const [[tRow]] = await db.query("SELECT COUNT(*) AS total_tarots FROM tarots");
    const [[cRow]] = await db.query("SELECT COUNT(*) AS total_characters FROM characters");
    const [[rRow]] = await db.query(`
      SELECT
        COUNT(*) AS total_rooms,
        SUM(CASE WHEN room_status = 'waiting' THEN 1 ELSE 0 END) AS waiting_rooms,
        SUM(CASE WHEN room_status = 'playing' THEN 1 ELSE 0 END) AS playing_rooms
      FROM rooms
    `);
    let totalMatches = 0;
    try {
      const [[mRow]] = await db.query("SELECT COUNT(*) AS cnt FROM game_results");
      totalMatches = Number(mRow?.cnt || 0);
    } catch (_) {}

    let payStats = { total_revenue_vnd: 0, today_revenue_vnd: 0, paid_orders: 0, pending_orders: 0 };
    try {
      const [[pRow]] = await db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_vnd ELSE 0 END), 0) AS total_revenue_vnd,
          COALESCE(SUM(CASE WHEN status = 'PAID' AND DATE(paid_at) = CURDATE() THEN amount_vnd ELSE 0 END), 0) AS today_revenue_vnd,
          SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_orders,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_orders
        FROM payment_orders
      `);
      payStats = {
        total_revenue_vnd: Number(pRow?.total_revenue_vnd || 0),
        today_revenue_vnd: Number(pRow?.today_revenue_vnd || 0),
        paid_orders: Number(pRow?.paid_orders || 0),
        pending_orders: Number(pRow?.pending_orders || 0),
      };
    } catch (_) {}

    let audioStats = { total_audio_tracks: 19, custom_audio_tracks: 0 };
    try {
      const [[aRow]] = await db.query(`
        SELECT
          COUNT(*) AS total_audio_tracks,
          SUM(CASE WHEN custom_url IS NOT NULL AND custom_url <> '' THEN 1 ELSE 0 END) AS custom_audio_tracks
        FROM audio_settings
      `);
      if (Number(aRow?.total_audio_tracks || 0) > 0) {
        audioStats = {
          total_audio_tracks: Number(aRow.total_audio_tracks),
          custom_audio_tracks: Number(aRow.custom_audio_tracks || 0),
        };
      }
    } catch (_) {}

    return {
      total_users: Number(uRow?.total_users || 0),
      total_admins: Number(uRow?.total_admins || 0),
      banned_users: Number(uRow?.banned_users || 0),
      muted_users: Number(uRow?.muted_users || 0),
      total_questions: Number(qRow?.total_questions || 0),
      total_tarots: Number(tRow?.total_tarots || 0),
      total_characters: Number(cRow?.total_characters || 0),
      total_rooms: Number(rRow?.total_rooms || 0),
      waiting_rooms: Number(rRow?.waiting_rooms || 0),
      playing_rooms: Number(rRow?.playing_rooms || 0),
      total_matches: totalMatches,
      ...payStats,
      ...audioStats,
    };
  },

  // ── USERS & MODERATION ───────────────────────────────────────────
  async listUsers({ search = "", status = "all", page = 1, limit = 30 } = {}) {
    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      conditions.push("(username LIKE ? OR name LIKE ? OR email LIKE ? OR CAST(id AS CHAR) = ?)");
      params.push(like, like, like, search.trim());
    }

    if (status === "banned") {
      conditions.push("is_banned = 1 AND (banned_until IS NULL OR banned_until > NOW())");
    } else if (status === "muted") {
      conditions.push("muted_until IS NOT NULL AND muted_until > NOW()");
    } else if (status === "admin") {
      conditions.push("role = 'admin'");
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const [[countRow]] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
    const [rows] = await db.query(
      `SELECT id, username, name, email, ecoin, role,
              is_banned, ban_reason, banned_until, muted_until, mute_reason
       FROM users
       ${whereSql}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset]
    );

    return {
      users: rows,
      total: Number(countRow?.total || 0),
      page: safePage,
      limit: safeLimit,
    };
  },

  async getUserModerationStatus(userId) {
    const [rows] = await db.query(
      `SELECT id, username, name, role, is_banned, ban_reason, banned_until, muted_until, mute_reason
       FROM users WHERE id = ? LIMIT 1`,
      [Number(userId)]
    );
    return rows[0] || null;
  },

  async updateUser(userId, { name, ecoin, role }) {
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(String(name).trim()); }
    if (ecoin !== undefined) { sets.push("ecoin = ?"); params.push(Math.max(0, Number(ecoin) || 0)); }
    if (role === "admin" || role === "user") { sets.push("role = ?"); params.push(role); }
    if (!sets.length) return false;
    params.push(Number(userId));
    const [res] = await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
    return res.affectedRows > 0;
  },

  async setUserBan(userId, { is_banned, ban_reason = null, banned_until = null }) {
    const [res] = await db.query(
      `UPDATE users
       SET is_banned = ?, ban_reason = ?, banned_until = ?
       WHERE id = ?`,
      [is_banned ? 1 : 0, is_banned ? (ban_reason || "Vi phạm quy định") : null, is_banned ? banned_until : null, Number(userId)]
    );
    return res.affectedRows > 0;
  },

  async setUserMute(userId, { muted_until = null, mute_reason = null }) {
    const [res] = await db.query(
      `UPDATE users
       SET muted_until = ?, mute_reason = ?
       WHERE id = ?`,
      [muted_until, muted_until ? (mute_reason || "Vi phạm quy tắc chat") : null, Number(userId)]
    );
    return res.affectedRows > 0;
  },

  // ── ROOMS ────────────────────────────────────────────────────────
  async listRooms({ status = "all", limit = 60 } = {}) {
    const params = [];
    let whereSql = "";
    if (status && status !== "all") {
      whereSql = "WHERE r.room_status = ?";
      params.push(status);
    }
    const [rows] = await db.query(
      `SELECT r.id, r.room_type, r.match_mode, r.bet_ecoin, r.max_players,
              r.current_players, r.host_user_id, r.room_status, r.is_private,
              r.created_at, r.updated_at,
              COALESCE(u.name, u.username, CONCAT('User #', r.host_user_id)) AS host_name
       FROM rooms r
       LEFT JOIN users u ON u.id = r.host_user_id
       ${whereSql}
       ORDER BY FIELD(r.room_status, 'playing', 'waiting', 'finished'), r.id DESC
       LIMIT ?`,
      [...params, Math.min(200, Number(limit) || 60)]
    );
    return rows;
  },

  // ── QUESTIONS (QUIZ) ─────────────────────────────────────────────
  async listQuestions({ search = "" } = {}) {
    const params = [];
    let whereSql = "";
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      whereSql = "WHERE question LIKE ? OR option_a LIKE ? OR option_b LIKE ? OR option_c LIKE ? OR option_d LIKE ?";
      params.push(like, like, like, like, like);
    }
    const [rows] = await db.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer
       FROM questions ${whereSql}
       ORDER BY id DESC`,
      params
    );
    return rows;
  },

  async createQuestion({ question, option_a, option_b, option_c, option_d, correct_answer }) {
    const [res] = await db.query(
      `INSERT INTO questions (question, option_a, option_b, option_c, option_d, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [question, option_a, option_b, option_c, option_d, correct_answer]
    );
    return res.insertId;
  },

  async updateQuestion(id, { question, option_a, option_b, option_c, option_d, correct_answer }) {
    const [res] = await db.query(
      `UPDATE questions
       SET question = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?
       WHERE id = ?`,
      [question, option_a, option_b, option_c, option_d, correct_answer, Number(id)]
    );
    return res.affectedRows > 0;
  },

  async deleteQuestion(id) {
    const [res] = await db.query("DELETE FROM questions WHERE id = ?", [Number(id)]);
    return res.affectedRows > 0;
  },

  // ── TAROTS ───────────────────────────────────────────────────────
  async listTarots() {
    const [rows] = await db.query(
      `SELECT id, name, description, cooldown_seconds, icon, effect_type
       FROM tarots ORDER BY id ASC`
    );
    return rows;
  },

  async createTarot({ name, description, cooldown_seconds, icon, effect_type }) {
    const [res] = await db.query(
      `INSERT INTO tarots (name, description, cooldown_seconds, icon, effect_type)
       VALUES (?, ?, ?, ?, ?)`,
      [name, description || "", Number(cooldown_seconds) || 0, icon || "", effect_type || ""]
    );
    return res.insertId;
  },

  async updateTarot(id, { name, description, cooldown_seconds, icon, effect_type }) {
    const [res] = await db.query(
      `UPDATE tarots
       SET name = ?, description = ?, cooldown_seconds = ?, icon = ?, effect_type = ?
       WHERE id = ?`,
      [name, description || "", Number(cooldown_seconds) || 0, icon || "", effect_type || "", Number(id)]
    );
    return res.affectedRows > 0;
  },

  async deleteTarot(id) {
    const [res] = await db.query("DELETE FROM tarots WHERE id = ?", [Number(id)]);
    return res.affectedRows > 0;
  },

  // ── CHARACTERS & SKILLS ──────────────────────────────────────────
  async listCharactersWithSkills() {
    const [rows] = await db.query(`
      SELECT
        c.id, c.name, c.price,
        cs.passive_name, cs.passive_desc, cs.passive_type, cs.passive_value,
        cs.active_name, cs.active_desc, cs.active_type, cs.active_value,
        cs.target_mode, cs.energy_cost, cs.fx_type
      FROM characters c
      LEFT JOIN character_skills cs ON cs.character_id = c.id
      ORDER BY c.id ASC
    `);
    return rows;
  },

  async updateCharacter(id, { name, price }) {
    const sets = [];
    const params = [];
    if (name !== undefined && String(name).trim()) { sets.push("name = ?"); params.push(String(name).trim()); }
    if (price !== undefined) { sets.push("price = ?"); params.push(Math.max(0, Number(price) || 0)); }
    if (!sets.length) return false;
    params.push(Number(id));
    const [res] = await db.query(`UPDATE characters SET ${sets.join(", ")} WHERE id = ?`, params);
    return res.affectedRows > 0;
  },

  async upsertCharacterSkill(characterId, data) {
    const [res] = await db.query(
      `INSERT INTO character_skills
         (character_id, passive_name, passive_desc, passive_type, passive_value,
          active_name, active_desc, active_type, active_value, target_mode, energy_cost, fx_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         passive_name = VALUES(passive_name),
         passive_desc = VALUES(passive_desc),
         passive_type = VALUES(passive_type),
         passive_value = VALUES(passive_value),
         active_name = VALUES(active_name),
         active_desc = VALUES(active_desc),
         active_type = VALUES(active_type),
         active_value = VALUES(active_value),
         target_mode = VALUES(target_mode),
         energy_cost = VALUES(energy_cost),
         fx_type = VALUES(fx_type)`,
      [
        Number(characterId),
        data.passive_name || "",
        data.passive_desc || "",
        data.passive_type || "",
        Number(data.passive_value) || 0,
        data.active_name || "",
        data.active_desc || "",
        data.active_type || "",
        Number(data.active_value) || 0,
        data.target_mode || "none",
        Number(data.energy_cost) || 100,
        data.fx_type || "fire_ball",
      ]
    );
    return res.affectedRows > 0;
  },
};

export default adminRepo;
