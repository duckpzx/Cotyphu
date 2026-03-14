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

  async insertUserCharacter(user_id, character_id){

    await db.query(
      "INSERT INTO user_characters (user_id, character_id, created_at) VALUES (?,?,NOW())",
      [user_id, character_id]
    );

  }

};

export default characterRepo;