import db from "../config/db.js";

const roomRepo = {
  async createRoom(roomData) {
    const [result] = await db.query(
      `
      INSERT INTO rooms (
        room_type,
        match_mode,
        bet_ecoin,
        max_players,
        current_players,
        host_user_id,
        room_status,
        is_private,
        room_password
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        roomData.room_type,
        roomData.match_mode,
        roomData.bet_ecoin,
        roomData.max_players,
        roomData.current_players,
        roomData.host_user_id,
        roomData.room_status,
        roomData.is_private,
        roomData.room_password
      ]
    );

    return result.insertId || null;
  },

  async getRoomById(roomId) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM rooms
      WHERE id = ?
      LIMIT 1
      `,
      [roomId]
    );

    return rows[0] || null;
  },

  async getVisibleRooms(roomType = null) {
    let query = `
      SELECT
        id,
        room_type,
        match_mode,
        bet_ecoin,
        max_players,
        current_players,
        host_user_id,
        room_status,
        is_private,
        created_at,
        updated_at
      FROM rooms
      WHERE room_status IN ('waiting', 'playing')
    `;
    const params = [];

    if (roomType) {
      query += ` AND room_type = ?`;
      params.push(roomType);
    }

    query += `
      ORDER BY
        CASE WHEN room_status = 'waiting' THEN 0 ELSE 1 END,
        created_at DESC
    `;

    const [rows] = await db.query(query, params);

    return rows;
  },

  async updateRoomStatus(roomId, status) {
    await db.query(
      `UPDATE rooms SET room_status = ?, updated_at = NOW() WHERE id = ?`,
      [status, roomId]
    );
  },

  async updateCurrentPlayers(roomId, count) {
    await db.query(
      `UPDATE rooms SET current_players = ?, updated_at = NOW() WHERE id = ?`,
      [count, roomId]
    );
  },

  async deleteRoom(roomId) {
    await db.query(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  },
};

export default roomRepo;