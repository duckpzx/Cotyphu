import db from "../config/db.js";

const userRepo = {

  async register(username,email,password){

    const [result] = await db.query(
      "INSERT INTO users (username,email,password) VALUES (?,?,?)",
      [username,email,password]
    );

    return result.insertId;

  },

  async findByUsername(username){

    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=?",
      [username]
    );

    return rows[0];

  },

  // LOGIN
  async login(username,password){

    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=? AND password=?",
      [username,password]
    );

    return rows[0];

  }

};

export default userRepo;