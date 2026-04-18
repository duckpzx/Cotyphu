/**
 * friendHandler — Xử lý tất cả socket events liên quan đến bạn bè
 *
 * Bảng `friends`: id, user_id, friend_id, status (pending|accepted|declined), created_at
 */
import db from "../config/db.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getUserName(user_id) {
  const [rows] = await db.query("SELECT name FROM users WHERE id = ? LIMIT 1", [user_id]);
  return rows[0]?.name || "Player";
}

async function areFriends(a, b) {
  const [rows] = await db.query(
    `SELECT id FROM friends
     WHERE status = 'accepted'
       AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
     LIMIT 1`,
    [a, b, b, a]
  );
  return rows.length > 0;
}

async function hasPendingRequest(from, to) {
  const [rows] = await db.query(
    `SELECT id FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending' LIMIT 1`,
    [from, to]
  );
  return rows.length > 0;
}

// ── Register ──────────────────────────────────────────────────────────────────

/**
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export function registerFriendHandlers(socket, io) {
  const me = socket.user_id;

  // ── Lấy danh sách bạn bè ─────────────────────────────────────────────
  socket.on("friend:list", async () => {
    try {
      const [rows] = await db.query(
        `SELECT
           f.id, f.status, f.created_at,
           CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END AS friend_uid,
           u.name
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
         WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
         ORDER BY u.name ASC`,
        [me, me, me, me]
      );
      socket.emit("friend:list", rows);
    } catch (err) {
      console.error("friend:list error:", err);
    }
  });

  // ── Lấy danh sách lời mời đến ────────────────────────────────────────
  socket.on("friend:requests", async () => {
    try {
      const [rows] = await db.query(
        `SELECT f.id, f.user_id, u.name, f.created_at
         FROM friends f
         JOIN users u ON u.id = f.user_id
         WHERE f.friend_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [me]
      );
      socket.emit("friend:requests", rows);
    } catch (err) {
      console.error("friend:requests error:", err);
    }
  });

  // ── Gửi lời mời kết bạn ──────────────────────────────────────────────
  socket.on("friend:request", async ({ to_id }) => {
    const toId = Number(to_id);
    if (!toId || toId === me) return;

    try {
      // Đã là bạn rồi?
      if (await areFriends(me, toId)) {
        socket.emit("friend:request:error", { message: "Hai người đã là bạn bè." });
        return;
      }
      // Đã gửi lời mời rồi?
      if (await hasPendingRequest(me, toId)) {
        socket.emit("friend:request:error", { message: "Đã gửi lời mời rồi, chờ xác nhận." });
        return;
      }
      // Người kia đã gửi lời mời cho mình?
      if (await hasPendingRequest(toId, me)) {
        socket.emit("friend:request:error", { message: "Người này đã gửi lời mời cho bạn, hãy vào mục Y.C Kết Bạn." });
        return;
      }

      await db.query(
        `INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')`,
        [me, toId]
      );

      const myName = await getUserName(me);

      // Thông báo cho người nhận nếu đang online
      const sockets = await io.fetchSockets();
      const target  = sockets.find(s => s.user_id === toId);
      if (target) {
        target.emit("friend:request:incoming", {
          id:      null,
          user_id: me,
          name:    myName,
        });
      }

      socket.emit("friend:request:sent", { to_id: toId, message: "Đã gửi lời mời kết bạn!" });
    } catch (err) {
      console.error("friend:request error:", err);
    }
  });

  // ── Chấp nhận lời mời ────────────────────────────────────────────────
  socket.on("friend:accept", async ({ from_id }) => {
    const fromId = Number(from_id);
    if (!fromId) return;
    try {
      await db.query(
        `UPDATE friends SET status = 'accepted'
         WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
        [fromId, me]
      );

      const myName   = await getUserName(me);
      const sockets  = await io.fetchSockets();
      const sender   = sockets.find(s => s.user_id === fromId);
      if (sender) {
        sender.emit("friend:accepted:notify", { friend_id: me, name: myName });
      }

      socket.emit("friend:requests"); // trigger refresh
    } catch (err) {
      console.error("friend:accept error:", err);
    }
  });

  // ── Từ chối lời mời ──────────────────────────────────────────────────
  socket.on("friend:decline", async ({ from_id }) => {
    const fromId = Number(from_id);
    if (!fromId) return;
    try {
      await db.query(
        `DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
        [fromId, me]
      );
      socket.emit("friend:requests");
    } catch (err) {
      console.error("friend:decline error:", err);
    }
  });

  // ── Xóa bạn ──────────────────────────────────────────────────────────
  socket.on("friend:remove", async ({ friend_id }) => {
    const fid = Number(friend_id);
    if (!fid) return;
    try {
      await db.query(
        `DELETE FROM friends
         WHERE status = 'accepted'
           AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
        [me, fid, fid, me]
      );
      socket.emit("friend:removed", { friend_id: fid });
    } catch (err) {
      console.error("friend:remove error:", err);
    }
  });

  // ── Tìm kiếm bạn ─────────────────────────────────────────────────────
  socket.on("friend:search", async ({ query }) => {
    const q = String(query || "").trim();
    if (!q) return;
    try {
      const [rows] = await db.query(
        `SELECT id, name FROM users
         WHERE (name LIKE ? OR username LIKE ?) AND id != ?
         LIMIT 20`,
        [`%${q}%`, `%${q}%`, me]
      );
      socket.emit("friend:search:result", rows);
    } catch (err) {
      console.error("friend:search error:", err);
    }
  });
}
