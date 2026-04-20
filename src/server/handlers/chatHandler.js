import chatRepo from "../repositories/chat.repo.js";
import db from "../config/db.js";

// Cache tên user để tránh query DB liên tục
const nameCache = new Map(); // user_id → name

async function getUserName(user_id, fallback) {
  // Ưu tiên fallback (socket.player_name) nếu đã có
  if (fallback && fallback !== "Player") return fallback;
  if (nameCache.has(user_id)) return nameCache.get(user_id);
  try {
    const [rows] = await db.query("SELECT name FROM users WHERE id = ? LIMIT 1", [user_id]);
    const name = rows[0]?.name || "Player";
    nameCache.set(user_id, name);
    // Xóa cache sau 5 phút để tránh stale
    setTimeout(() => nameCache.delete(user_id), 5 * 60 * 1000);
    return name;
  } catch {
    return "Player";
  }
}

// Rate limit đơn giản: max 3 tin/3 giây mỗi user
const rateLimitMap = new Map(); // user_id → [timestamps]
const RATE_LIMIT   = 3;
const RATE_WINDOW  = 3000; // ms
const MAX_LENGTH   = 200;

function isRateLimited(user_id) {
  const now  = Date.now();
  const list = (rateLimitMap.get(user_id) || []).filter(t => now - t < RATE_WINDOW);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  rateLimitMap.set(user_id, list);
  return false;
}

function sanitize(msg) {
  return String(msg || "").trim().slice(0, MAX_LENGTH);
}

/**
 * Đăng ký tất cả chat events cho một socket
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export function registerChatHandlers(socket, io) {
  const user_id = socket.user_id;

  // ── WORLD CHAT ────────────────────────────────────────────────────────
  socket.on("chat:world:send", async ({ message }) => {
    const msg = sanitize(message);
    if (!msg) return;
    if (isRateLimited(user_id)) {
      socket.emit("chat:error", { message: "Bạn gửi quá nhanh, hãy chờ chút!" });
      return;
    }

    try {
      await chatRepo.saveMessage({ channel: "world", channel_id: null, user_id, message: msg });
      const payload = {
        user_id,
        name:    await getUserName(user_id, socket.player_name),
        message: msg,
        time:    Date.now()
      };
      io.to("chat:world").emit("chat:world:message", payload);
    } catch (err) {
      console.error("chat:world:send error:", err);
    }
  });

  // ── ROOM CHAT ─────────────────────────────────────────────────────────
  socket.on("chat:room:send", async ({ message }) => {
    const room_id = socket.current_room_id;
    if (!room_id) return;

    const msg = sanitize(message);
    if (!msg) return;
    if (isRateLimited(user_id)) {
      socket.emit("chat:error", { message: "Bạn gửi quá nhanh!" });
      return;
    }

    try {
      await chatRepo.saveMessage({ channel: "room", channel_id: room_id, user_id, message: msg });
      const payload = {
        user_id,
        name:    await getUserName(user_id, socket.player_name),
        message: msg,
        time:    Date.now()
      };
      io.to(`room_${room_id}`).emit("chat:room:message", payload);
    } catch (err) {
      console.error("chat:room:send error:", err);
    }
  });

  // ── ROOM CHAT HISTORY ─────────────────────────────────────────────────
  socket.on("chat:room:history:get", async () => {
    const room_id = socket.current_room_id;
    if (!room_id) return;
    try {
      const history = await chatRepo.getHistory({ channel: "room", channel_id: room_id, limit: 30 });
      socket.emit("chat:room:history", history.map(r => ({
        user_id: r.user_id,
        name:    r.user_name,
        message: r.message,
        time:    new Date(r.created_at).getTime()
      })));
    } catch (err) {
      console.error("chat:room:history:get error:", err);
    }
  });

  // ── GAME CHAT ─────────────────────────────────────────────────────────
  socket.on("chat:game:send", async ({ message }) => {
    const game_id = socket.current_game_id;
    if (!game_id) return;

    const msg = sanitize(message);
    if (!msg) return;
    if (isRateLimited(user_id)) {
      socket.emit("chat:error", { message: "Bạn gửi quá nhanh!" });
      return;
    }

    try {
      await chatRepo.saveMessage({ channel: "game", channel_id: game_id, user_id, message: msg });
      const payload = {
        user_id,
        name:    await getUserName(user_id, socket.player_name),
        message: msg,
        time:    Date.now()
      };
      io.to(`room_${game_id}`).emit("chat:game:message", payload);
    } catch (err) {
      console.error("chat:game:send error:", err);
    }
  });

  // ── JOIN WORLD CHAT ROOM ──────────────────────────────────────────────
  socket.on("chat:world:join", async () => {
    socket.join("chat:world");
    try {
      const history = await chatRepo.getHistory({ channel: "world", channel_id: null, limit: 30 });
      socket.emit("chat:world:history", history.map(r => ({
        user_id:  r.user_id,
        name:     r.user_name,
        message:  r.message,
        time:     new Date(r.created_at).getTime()
      })));
    } catch (err) {
      console.error("chat:world:join history error:", err);
    }
  });

  // ── LEAVE WORLD CHAT ROOM ─────────────────────────────────────────────
  socket.on("chat:world:leave", () => {
    socket.leave("chat:world");
  });

  // ── PRIVATE MESSAGE (PM) — real-time only, không lưu DB ─────────────
  socket.on("chat:pm:send", async ({ to_id, message }) => {
    const msg = sanitize(message);
    if (!msg || !to_id) return;
    if (isRateLimited(user_id)) {
      socket.emit("chat:error", { message: "Gửi quá nhanh, chờ chút!" });
      return;
    }
    try {
      const name = await getUserName(user_id, socket.player_name);
      const payload = {
        from_id: user_id,
        to_id:   Number(to_id),
        name,
        message: msg,
        time:    Date.now(),
      };
      // Gửi cho tất cả socket của người nhận
      const allSockets = await io.fetchSockets();
      allSockets
        .filter(s => Number(s.user_id) === Number(to_id))
        .forEach(s => s.emit("chat:pm:message", payload));
      // Gửi lại cho người gửi
      socket.emit("chat:pm:message", payload);
    } catch (err) {
      console.error("chat:pm:send error:", err);
    }
  });
}

/**
 * Dọn dẹp world chat cũ — gọi mỗi giờ
 */
export function startChatCleanupJob() {
  setInterval(async () => {
    try {
      await chatRepo.cleanWorldChat();
      console.log("🧹 World chat cleaned");
    } catch (err) {
      console.error("Chat cleanup error:", err);
    }
  }, 60 * 60 * 1000); // mỗi 1 giờ
}
