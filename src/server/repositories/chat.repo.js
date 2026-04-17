import db from "../config/db.js";

const chatRepo = {
  /**
   * Lưu tin nhắn vào DB
   */
  async saveMessage({ channel, channel_id = null, user_id, message }) {
    const [result] = await db.query(
      `INSERT INTO chat_messages (channel, channel_id, user_id, message) VALUES (?, ?, ?, ?)`,
      [channel, channel_id, user_id, message]
    );
    return result.insertId;
  },

  /**
   * Lấy lịch sử chat (mới nhất trước)
   */
  async getHistory({ channel, channel_id = null, limit = 50 }) {
    const [rows] = await db.query(
      `SELECT cm.id, cm.channel, cm.channel_id, cm.user_id, cm.message, cm.created_at,
              u.name AS user_name
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel = ? AND (cm.channel_id = ? OR (cm.channel_id IS NULL AND ? IS NULL))
       ORDER BY cm.created_at DESC
       LIMIT ?`,
      [channel, channel_id, channel_id, limit]
    );
    return rows.reverse(); // trả về thứ tự cũ → mới
  },

  /**
   * Xóa tin nhắn world chat cũ hơn 24h (gọi định kỳ)
   */
  async cleanWorldChat() {
    await db.query(
      `DELETE FROM chat_messages WHERE channel = 'world' AND created_at < NOW() - INTERVAL 24 HOUR`
    );
  },

  /**
   * Xóa toàn bộ chat của 1 room/game khi kết thúc
   */
  async deleteChannelMessages({ channel, channel_id }) {
    await db.query(
      `DELETE FROM chat_messages WHERE channel = ? AND channel_id = ?`,
      [channel, channel_id]
    );
  }
};

export default chatRepo;
