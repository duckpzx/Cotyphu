import db from "../config/db.js";

const userRepo = {
  async register(username, email, password) {
    const [result] = await db.query(
      "INSERT INTO users (username,email,password) VALUES (?,?,?)",
      [username, email, password]
    );

    return result.insertId;
  },

  async findByUsername(username) {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=?",
      [username]
    );

    return rows[0];
  },

  async login(username, password) {
    const [users] = await db.query(
      "SELECT * FROM users WHERE username=? AND password=?",
      [username, password]
    );

    const user = users[0];
    if (!user) return null;

    if (user.active_tarot_ids) {
      user.active_tarot_ids =
        typeof user.active_tarot_ids === "string"
          ? JSON.parse(user.active_tarot_ids)
          : user.active_tarot_ids;
    } else {
      user.active_tarot_ids = [];
    }

    const [active] = await db.query(`
      SELECT 
        uc.character_id,
        c.name AS characterName,
        uc.active_skin_id
      FROM user_characters uc
      JOIN characters c ON c.id = uc.character_id
      WHERE uc.user_id = ? 
        AND uc.character_id = ?
    `, [user.id, user.active_character_id]);

    const [characters] = await db.query(`
      SELECT 
        uc.character_id AS id,
        c.name,
        uc.active_skin_id
      FROM user_characters uc
      JOIN characters c ON c.id = uc.character_id
      WHERE uc.user_id = ?
    `, [user.id]);

    const [skins] = await db.query(`
      SELECT skin_id 
      FROM user_skins 
      WHERE user_id = ?
    `, [user.id]);

    return {
      user,
      active: active[0] || null,
      characters,
      skins
    };
  },

  async findById(user_id) {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [user_id]
    );

    const user = rows[0];
    if (!user) return null;

    if (user.active_tarot_ids) {
      user.active_tarot_ids =
        typeof user.active_tarot_ids === "string"
          ? JSON.parse(user.active_tarot_ids)
          : user.active_tarot_ids;
    } else {
      user.active_tarot_ids = [];
    }

    return user;
  }
};

export default userRepo;