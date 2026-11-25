import { extractClientIp, sanitizeSummary } from "./security.service.js";

const MAX_LOGS = 1000;
let seqId = 0;
const logs = [];

const VALID_CATEGORIES = new Set([
  "AUTH", "CHAT", "SHOP", "PAYMENT", "GAME", "ROOM", "SECURITY", "ADMIN", "SYSTEM",
]);

function pushLog({
  category = "SYSTEM",
  level = "INFO", // INFO | OK | WARN | ERR
  user_id = null,
  username = null,
  ip = "server",
  action = "",
  detail = null,
}) {
  const cat = VALID_CATEGORIES.has(String(category).toUpperCase())
    ? String(category).toUpperCase()
    : "SYSTEM";

  const entry = {
    id: ++seqId,
    ts: Date.now(),
    category: cat,
    level: ["INFO", "OK", "WARN", "ERR"].includes(level) ? level : "INFO",
    user_id: user_id ? Number(user_id) : null,
    username: username ? String(username).slice(0, 60) : null,
    ip: String(ip || "server").slice(0, 64),
    action: String(action || "").slice(0, 140),
    detail: detail ? (typeof detail === "string" ? detail.slice(0, 400) : sanitizeSummary(detail)) : "",
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  return entry;
}

function classifyHttpCategory(urlPath) {
  const p = String(urlPath || "");
  if (p.startsWith("/login") || p.startsWith("/register")) return "AUTH";
  if (p.startsWith("/shop")) return "SHOP";
  if (p.startsWith("/api/payment")) return "PAYMENT";
  if (p.startsWith("/api/admin")) return "ADMIN";
  if (p.startsWith("/api/security")) return "SECURITY";
  if (p.startsWith("/rooms")) return "ROOM";
  return "SYSTEM";
}

function classifySocketCategory(eventName) {
  const e = String(eventName || "");
  if (e.startsWith("chat:")) return "CHAT";
  if (e.startsWith("room:")) return "ROOM";
  if (e.startsWith("game:")) return "GAME";
  if (e.startsWith("voice:")) return "SYSTEM";
  return "SYSTEM";
}

// Bỏ qua các event nhiễu liên tục (như gói âm thanh binary voice PCM hoặc polling admin)
const IGNORED_SOCKET_EVENTS = new Set([
  "voice:audio",
  "voice:pcm",
  "voice:signal",
  "voice:ice",
  "lab:move",
  "chat:world:join",
  "chat:world:leave",
  "chat:room:history:get",
  "chat:game:history:get",
]);

const systemConsoleService = {
  log: pushLog,

  /**
   * Express middleware tự động ghi mọi thao tác HTTP quan trọng (POST/PUT/PATCH/DELETE + lỗi 4xx/5xx).
   */
  httpLoggerMiddleware(req, res, next) {
    const p = req.path || "";
    // Bỏ qua file tĩnh và polling GET của chính Admin Console
    if (
      p.startsWith("/assets") ||
      p.startsWith("/src/") ||
      p.endsWith(".js") ||
      p.endsWith(".css") ||
      p.endsWith(".png") ||
      p.endsWith(".jpg") ||
      (req.method === "GET" && p.startsWith("/api/admin"))
    ) {
      return next();
    }

    const start = Date.now();
    const ip = extractClientIp(req);

    res.on("finish", () => {
      // Chỉ ghi GET nếu bị lỗi >= 400 hoặc là endpoint đặc biệt; luôn ghi POST/PUT/PATCH/DELETE
      const isMutation = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
      if (!isMutation && res.statusCode < 400) return;

      const ms = Date.now() - start;
      const cat = classifyHttpCategory(p);
      const level = res.statusCode >= 500 ? "ERR" : res.statusCode >= 400 ? "WARN" : "OK";
      const uid = req.adminUser?.id || req.body?.user_id || null;
      const uname = req.adminUser?.username || req.body?.username || null;

      pushLog({
        category: cat,
        level,
        user_id: uid,
        username: uname,
        ip,
        action: `${req.method} ${p} [${res.statusCode}] (${ms}ms)`,
        detail: isMutation ? req.body : null,
      });
    });

    next();
  },

  /**
   * Ghi log sự kiện Socket.IO từ người chơi (chat, mua nhà, tung xúc xắc, tạo phòng...).
   */
  logSocketEvent(socket, eventName, payload) {
    if (!eventName || IGNORED_SOCKET_EVENTS.has(eventName)) return;
    const cat = classifySocketCategory(eventName);
    pushLog({
      category: cat,
      level: "INFO",
      user_id: socket.user_id || null,
      username: socket.player_name || null,
      ip: socket.client_ip || "socket",
      action: eventName,
      detail: payload,
    });
  },

  queryLogs({ category = "all", search = "", after_id = 0, limit = 200 } = {}) {
    const catFilter = String(category || "all").toUpperCase();
    const q = String(search || "").trim().toLowerCase();
    const minId = Number(after_id) || 0;
    const maxItems = Math.min(500, Math.max(10, Number(limit) || 200));

    let filtered = logs;
    if (minId > 0) filtered = filtered.filter(l => l.id > minId);
    if (catFilter !== "ALL") filtered = filtered.filter(l => l.category === catFilter);
    if (q) {
      filtered = filtered.filter(l =>
        l.action.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q) ||
        l.ip.toLowerCase().includes(q) ||
        (l.username && l.username.toLowerCase().includes(q)) ||
        (l.user_id && String(l.user_id) === q)
      );
    }

    const slice = filtered.slice(-maxItems);
    return {
      success: true,
      total_buffered: logs.length,
      latest_id: seqId,
      logs: slice,
    };
  },

  clearLogs() {
    logs.length = 0;
    pushLog({ category: "SYSTEM", level: "WARN", action: "CONSOLE_CLEARED", detail: "Admin đã xóa bộ đệm console" });
    return { success: true, message: "Đã làm sạch bộ đệm Console" };
  },
};

export default systemConsoleService;
