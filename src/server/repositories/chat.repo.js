import db from "../config/db.js";

let _lastWorldCleanAt = 0;

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
   * Riêng Chat Thế Giới (channel = 'world') chỉ lưu & hiển thị tin nhắn trong ngày hiện tại (CURDATE()).
   */
  async getHistory({ channel, channel_id = null, limit = 50 }) {
    const isWorld = channel === "world";
    if (isWorld && Date.now() - _lastWorldCleanAt > 60_000) {
      _lastWorldCleanAt = Date.now();
      this.cleanWorldChat().catch(() => {});
    }

    const dayFilter = isWorld ? "AND DATE(cm.created_at) = CURDATE()" : "";
    const [rows] = await db.query(
      `SELECT cm.id, cm.channel, cm.channel_id, cm.user_id, cm.message, cm.created_at,
              u.name AS user_name
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel = ? AND (cm.channel_id = ? OR (cm.channel_id IS NULL AND ? IS NULL))
       ${dayFilter}
       ORDER BY cm.created_at DESC
       LIMIT ?`,
      [channel, channel_id, channel_id, limit]
    );
    return rows.reverse(); // trả về thứ tự cũ → mới
  },

  /**
   * Xóa tin nhắn Chat Thế Giới của các ngày cũ (chỉ giữ lại trong ngày hiện tại)
   */
  async cleanWorldChat() {
    const [res] = await db.query(
      `DELETE FROM chat_messages WHERE channel = 'world' AND DATE(created_at) < CURDATE()`
    );
    return res?.affectedRows || 0;
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
