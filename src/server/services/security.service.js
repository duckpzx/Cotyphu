import jwt from "jsonwebtoken";
import securityRepo from "../repositories/security.repo.js";
import logger from "../utils/logger.js";
import systemConsoleService from "./systemConsole.service.js";

/**
 * Chuẩn hóa địa chỉ IP thật từ Express req hoặc Socket.IO handshake.
 */
export function extractClientIp(reqOrHandshake) {
  const headers = reqOrHandshake?.headers || {};
  const xff = headers["x-forwarded-for"];
  let raw = "";
  if (typeof xff === "string" && xff.trim()) {
    raw = xff.split(",")[0].trim();
  } else {
    raw =
      reqOrHandshake?.ip ||
      reqOrHandshake?.socket?.remoteAddress ||
      reqOrHandshake?.connection?.remoteAddress ||
      reqOrHandshake?.address ||
      "unknown";
  }
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (raw === "::1") raw = "127.0.0.1";
  return raw || "unknown";
}

export function extractUserAgent(reqOrHandshake) {
  return String(reqOrHandshake?.headers?.["user-agent"] || "").slice(0, 512);
}

/**
 * Ẩn các trường nhạy cảm (password, token, secret) trước khi ghi nhật ký.
 */
export function sanitizeSummary(obj) {
  if (!obj) return null;
  if (typeof obj === "string") return obj.slice(0, 1200);
  try {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/pass|token|secret|auth|cookie/i.test(k)) {
        clean[k] = "[REDACTED]";
      } else if (typeof v === "string") {
        clean[k] = v.slice(0, 240);
      } else {
        clean[k] = v;
      }
    }
    return JSON.stringify(clean).slice(0, 1200);
  } catch {
    return null;
  }
}

// Bảng điểm rủi ro & mức độ mặc định theo từng loại sự kiện
const EVENT_PROFILES = {
  LOGIN_SUCCESS:      { severity: "INFO",     risk: 0  },
  SOCKET_CONNECT:     { severity: "INFO",     risk: 0  },
  LOGIN_FAIL:         { severity: "MEDIUM",   risk: 10 },
  ADMIN_AUTH_FAIL:    { severity: "HIGH",     risk: 25 },
  DEVTOOLS_OPEN:      { severity: "MEDIUM",   risk: 15 },
  DEVTOOLS_SHORTCUT:  { severity: "LOW",      risk: 8  },
  DEBUGGER_TRAP:      { severity: "HIGH",     risk: 25 },
  FETCH_TAMPER:       { severity: "HIGH",     risk: 35 },
  XHR_TAMPER:         { severity: "HIGH",     risk: 35 },
  STORAGE_TAMPER:     { severity: "HIGH",     risk: 30 },
  CONSOLE_INJECT:     { severity: "MEDIUM",   risk: 20 },
  SOCKET_FLOOD:       { severity: "HIGH",     risk: 25 },
  CHEAT_TURN_SPOOF:   { severity: "CRITICAL", risk: 40 },
  ILLEGAL_ACTION:     { severity: "HIGH",     risk: 30 },
  RATE_LIMIT_HIT:     { severity: "MEDIUM",   risk: 15 },
  IP_BLOCKED:         { severity: "HIGH",     risk: 20 },
};

// In-memory cache cho IP Blacklist để chặn O(1) ở mọi request/socket
const blacklistCache = new Map(); // ip -> { reason, expires_at }
const reportRateMap = new Map();  // ip -> timestamps[]
const socketRateMap = new Map();  // socket_id -> timestamps[]

function isIpCurrentlyBlocked(ip) {
  const entry = blacklistCache.get(ip);
  if (!entry) return null;
  if (entry.expires_at && new Date(entry.expires_at).getTime() <= Date.now()) {
    blacklistCache.delete(ip);
    return null;
  }
  return entry;
}

const securityService = {
  async init() {
    await securityRepo.ensureSecuritySchema();
    await this.reloadBlacklistCache();
  },

  async reloadBlacklistCache() {
    try {
      const rows = await securityRepo.getActiveBlacklist();
      blacklistCache.clear();
      const now = Date.now();
      for (const r of rows) {
        if (!r.expires_at || new Date(r.expires_at).getTime() > now) {
          blacklistCache.set(r.ip_address, {
            id: r.id,
            reason: r.reason,
            expires_at: r.expires_at,
          });
        }
      }
    } catch (err) {
      logger.err("SECURITY", "reloadBlacklistCache failed", err);
    }
  },

  isIpBlocked(ip) {
    return isIpCurrentlyBlocked(ip);
  },

  async recordEvent({
    user_id = null,
    username = null,
    ip_address = "unknown",
    user_agent = null,
    device_fingerprint = null,
    event_type = "UNKNOWN",
    severity = null,
    risk_score = null,
    endpoint = null,
    payload = null,
  }) {
    const profile = EVENT_PROFILES[event_type] || { severity: "LOW", risk: 5 };
    const finalSeverity = severity || profile.severity;
    const finalRisk = risk_score !== null && risk_score !== undefined ? Number(risk_score) : profile.risk;

    try {
      await securityRepo.insertEvent({
        user_id,
        username,
        ip_address,
        user_agent,
        device_fingerprint,
        event_type,
        severity: finalSeverity,
        risk_score: finalRisk,
        endpoint,
        payload_summary: sanitizeSummary(payload),
      });
      if (finalRisk > 0) {
        systemConsoleService.log({
          category: "SECURITY",
          level: finalSeverity === "CRITICAL" || finalSeverity === "HIGH" ? "ERR" : "WARN",
          user_id,
          username,
          ip: ip_address,
          action: `${event_type} [${finalSeverity} +${finalRisk}] ${endpoint || ""}`.trim(),
          detail: payload,
        });
      }
    } catch (err) {
      console.error("securityService.recordEvent error:", err.message);
    }
  },

  async recordSession({ user_id, username, ip_address, user_agent, device_fingerprint = null }) {
    try {
      await securityRepo.upsertSession({ user_id, username, ip_address, user_agent, device_fingerprint });
    } catch (err) {
      console.error("securityService.recordSession error:", err.message);
    }
  },

  /**
   * Express middleware: chặn IP nằm trong blacklist (trừ route /api/admin để tránh admin tự khóa nhầm localhost).
   */
  ipGuardMiddleware(req, res, next) {
    const ip = extractClientIp(req);
    if (req.path.startsWith("/api/admin") || req.path === "/admin" || req.path.startsWith("/src/admin")) {
      return next();
    }
    const blocked = isIpCurrentlyBlocked(ip);
    if (!blocked) return next();

    securityRepo.incrementBlacklistHit(ip);
    return res.status(403).json({
      success: false,
      blocked: true,
      message: `IP ${ip} đã bị chặn bởi hệ thống an ninh. Lý do: ${blocked.reason}`,
    });
  },

  /**
   * Kiểm tra rate limit cho endpoint /api/security/report (tránh attacker spam làm đầy bảng log).
   */
  isReportRateLimited(ip) {
    const now = Date.now();
    const list = (reportRateMap.get(ip) || []).filter(t => now - t < 10000);
    if (list.length >= 15) return true;
    list.push(now);
    reportRateMap.set(ip, list);
    return false;
  },

  /**
   * Kiểm tra flood event trên Socket.IO (> 30 gameplay events trong 3 giây).
   */
  checkSocketFlood(socket) {
    const now = Date.now();
    const list = (socketRateMap.get(socket.id) || []).filter(t => now - t < 3000);
    list.push(now);
    socketRateMap.set(socket.id, list);
    return list.length > 30;
  },

  clearSocketRate(socketId) {
    socketRateMap.delete(socketId);
  },

  /**
   * Xử lý báo cáo nghi vấn gian lận từ Client Sensor (POST /api/security/report).
   */
  async handleClientReport(req, res) {
    const ip = extractClientIp(req);
    if (this.isReportRateLimited(ip)) {
      return res.status(429).json({ success: false, message: "Too many reports" });
    }

    const ua = extractUserAgent(req);
    const body = req.body || {};

    // Thử giải mã JWT nếu client có gửi token để gắn user_id chính xác
    let userId = body.user_id ? Number(body.user_id) : null;
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : (body.token || "");
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) userId = Number(decoded.id);
      } catch (_) {}
    }

    const allowedClientTypes = new Set([
      "DEVTOOLS_OPEN",
      "DEVTOOLS_SHORTCUT",
      "DEBUGGER_TRAP",
      "FETCH_TAMPER",
      "XHR_TAMPER",
      "STORAGE_TAMPER",
      "CONSOLE_INJECT",
    ]);
    const eventType = allowedClientTypes.has(body.event_type) ? body.event_type : "ILLEGAL_ACTION";

    await this.recordEvent({
      user_id: userId,
      username: body.username || null,
      ip_address: ip,
      user_agent: ua,
      device_fingerprint: body.fingerprint || null,
      event_type: eventType,
      endpoint: body.page || req.headers.referer || "/",
      payload: body.detail || null,
    });

    return res.json({ success: true });
  },

  // ── ADMIN SOC QUERIES ────────────────────────────────────────────
  async getSummary() {
    const summary = await securityRepo.getSummary24h();
    return { success: true, summary };
  },

  async listEvents(query) {
    const events = await securityRepo.listEvents(query);
    return { success: true, events };
  },

  async listBlacklist() {
    const blacklist = await securityRepo.getActiveBlacklist();
    return { success: true, blacklist };
  },

  async addBlacklist(adminId, { ip_address, reason, duration_minutes }) {
    const ip = String(ip_address || "").trim();
    if (!ip || ip.length < 3) {
      return { success: false, message: "Địa chỉ IP không hợp lệ" };
    }
    const expiresAt =
      duration_minutes && Number(duration_minutes) > 0
        ? new Date(Date.now() + Number(duration_minutes) * 60 * 1000)
        : null;

    await securityRepo.addBlacklistIp({
      ip_address: ip,
      reason: reason || "Hành vi khả nghi / tấn công",
      banned_by: adminId,
      expires_at: expiresAt,
    });
    await this.reloadBlacklistCache();
    return {
      success: true,
      message: expiresAt
        ? `Đã chặn IP ${ip} đến ${expiresAt.toLocaleString("vi-VN")}`
        : `Đã chặn vĩnh viễn IP ${ip}`,
    };
  },

  async removeBlacklist(id) {
    const ok = await securityRepo.removeBlacklistIp(id);
    await this.reloadBlacklistCache();
    return ok
      ? { success: true, message: "Đã gỡ chặn IP" }
      : { success: false, message: "Không tìm thấy bản ghi IP" };
  },

  async listSessions(limit = 60) {
    const sessions = await securityRepo.listRecentSessions(limit);
    return { success: true, sessions };
  },
};

export default securityService;
