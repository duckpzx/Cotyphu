import db from "../config/db.js";

const tarotRepo = {
  async getAllTarots() {
    const [rows] = await db.query(`
      SELECT id, name, description, cooldown_seconds, icon, effect_type
      FROM tarots
      ORDER BY id ASC
    `);
    return rows;
  },

  async getTarotsByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.query(
      `
      SELECT id, name, description, cooldown_seconds, icon, effect_type
      FROM tarots
      WHERE id IN (${placeholders})
      `,
      ids
    );

    const orderMap = new Map(ids.map((id, index) => [Number(id), index]));
    rows.sort((a, b) => orderMap.get(Number(a.id)) - orderMap.get(Number(b.id)));

    return rows;
  },

  async saveActiveTarotIds(userId, tarotIds) {
    const [result] = await db.query(
      `
      UPDATE users
      SET active_tarot_ids = ?
      WHERE id = ?
      `,
      [JSON.stringify(tarotIds), userId]
    );

    return result.affectedRows > 0;
  },

  async getActiveTarotIds(userId) {
    const [rows] = await db.query(
      `
      SELECT active_tarot_ids
      FROM users
      WHERE id = ?
      `,
      [userId]
    );

    if (!rows[0]) return null;

    let tarotIds = [];

    if (rows[0].active_tarot_ids) {
      tarotIds =
        typeof rows[0].active_tarot_ids === "string"
          ? JSON.parse(rows[0].active_tarot_ids)
          : rows[0].active_tarot_ids;
    }

    return tarotIds;
  }
};

export default tarotRepo;