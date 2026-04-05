import db from "../config/db.js";

const characterRepo = {

  async getAllCharacters(){

    const [rows] = await db.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        s.skin_number,
        s.image
      FROM characters c
      LEFT JOIN character_skins s 
        ON s.character_id = c.id 
        AND s.is_default = 1
      ORDER BY c.id
    `);

    return rows;

  },

  async updateUserName(user_id, name){

    await db.query(
      "UPDATE users SET name=? WHERE id=?",
      [name, user_id]
    );

  },

  async setActiveCharacter(user_id, character_id){
    await db.query(
      "UPDATE users SET active_character_id = ? WHERE id = ?",
      [character_id, user_id]
    );
  },

  async setOldPlayer(user_id){
    await db.query(
      "UPDATE users SET is_new_player = 0 WHERE id = ?",
      [user_id]
    );
  },

  async insertUserCharacter(user_id, character_id){

  await db.query(`
    INSERT INTO user_characters (user_id, character_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE user_id = user_id
  `, [user_id, character_id]);

  },

  async getCharactersByUser(user_id){
    const [rows] = await db.query(`
      SELECT 
        uc.character_id AS id,
        c.name,
        COALESCE(uc.active_skin_id, defaultSkin.id) AS active_skin_id,
        COALESCE(activeSkin.skin_number, defaultSkin.skin_number, 1) AS active_skin_number,
        COALESCE(activeSkin.image, defaultSkin.image) AS image
      FROM user_characters uc
      JOIN characters c ON c.id = uc.character_id
      LEFT JOIN character_skins activeSkin ON activeSkin.id = uc.active_skin_id
      LEFT JOIN character_skins defaultSkin ON defaultSkin.character_id = c.id AND defaultSkin.is_default = 1
      WHERE uc.user_id = ?
    `, [user_id]);

    return rows;
  },

  async getOwnedCharactersForBag(user_id) {
      const [rows] = await db.query(`
        SELECT
          uc.character_id,
          c.name,
          c.description,
          COALESCE(uc.active_skin_id, defaultSkin.id) AS active_skin_id,
          COALESCE(activeSkin.skin_number, defaultSkin.skin_number, 1) AS active_skin_number,
          COALESCE(activeSkin.image, defaultSkin.image) AS image,
          CASE
            WHEN u.active_character_id = uc.character_id THEN 1
            ELSE 0
          END AS is_active_character
        FROM user_characters uc
        JOIN characters c
          ON c.id = uc.character_id
        JOIN users u
          ON u.id = uc.user_id
        LEFT JOIN character_skins activeSkin
          ON activeSkin.id = uc.active_skin_id
        LEFT JOIN character_skins defaultSkin
          ON defaultSkin.character_id = c.id
        AND defaultSkin.is_default = 1
        WHERE uc.user_id = ?
        ORDER BY uc.character_id ASC
      `, [user_id]);

      return rows;
    },

  async getOwnedSkinsForBag(user_id, character_id) {
    const [rows] = await db.query(`
      SELECT
        us.skin_id,
        cs.skin_number,
        cs.image,
        CASE
          WHEN uc.active_skin_id = us.skin_id THEN 1
          ELSE 0
        END AS is_active
      FROM user_skins us
      JOIN character_skins cs
        ON cs.id = us.skin_id
      JOIN user_characters uc
        ON uc.user_id = us.user_id
      AND uc.character_id = cs.character_id
      WHERE us.user_id = ?
        AND cs.character_id = ?
      ORDER BY cs.skin_number ASC
    `, [user_id, character_id]);

    return rows;
  }
};

export default characterRepo;