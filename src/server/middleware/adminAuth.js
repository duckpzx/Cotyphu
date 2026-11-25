import jwt from "jsonwebtoken";
import db from "../config/db.js";

/**
 * Middleware xác thực JWT và kiểm tra quyền Admin (RBAC).
 * Yêu cầu header: Authorization: Bearer <token>
 */
export async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ success: false, message: "Thiếu token xác thực quản trị viên" });
    }

    const secret = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    const userId = Number(decoded?.id);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Token không hợp lệ" });
    }

    const [rows] = await db.query(
      "SELECT id, username, name, role, is_banned, banned_until FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: "Tài khoản không tồn tại" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Bạn không có quyền truy cập trang quản trị" });
    }

    const isBannedNow =
      Number(user.is_banned) === 1 &&
      (!user.banned_until || new Date(user.banned_until).getTime() > Date.now());
    if (isBannedNow) {
      return res.status(403).json({ success: false, message: "Tài khoản quản trị đã bị khóa" });
    }

    req.adminUser = {
      id: Number(user.id),
      username: user.username,
      name: user.name || user.username,
      role: user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Phiên đăng nhập hết hạn hoặc không hợp lệ" });
  }
}

export default requireAdmin;
