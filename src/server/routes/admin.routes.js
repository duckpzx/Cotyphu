import express from "express";
import requireAdmin from "../middleware/adminAuth.js";
import { createAdminService } from "../services/admin.service.js";

/**
 * Tạo Express Router cho toàn bộ REST API của Admin Dashboard (/api/admin/*).
 */
export function createAdminRouter(deps) {
  const router = express.Router();
  const adminService = createAdminService(deps);

  // Public admin login (kiểm tra role = 'admin' trong service)
  router.post("/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const result = await adminService.login(username, password);
      res.status(result.success ? 200 : 401).json(result);
    } catch (err) {
      console.error("POST /api/admin/login error:", err);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  });

  // Tất cả routes phía dưới yêu cầu JWT Admin hợp lệ
  router.use(requireAdmin);

  router.get("/me", (req, res) => {
    res.json({ success: true, admin: req.adminUser });
  });

  router.get("/overview", async (req, res) => {
    try {
      res.json(await adminService.getOverview());
    } catch (err) {
      console.error("GET /api/admin/overview error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải thống kê tổng quan" });
    }
  });

  // ── USERS & MODERATION ───────────────────────────────────────────
  router.get("/users", async (req, res) => {
    try {
      res.json(await adminService.listUsers(req.query));
    } catch (err) {
      console.error("GET /api/admin/users error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách người chơi" });
    }
  });

  router.patch("/users/:id", async (req, res) => {
    try {
      const result = await adminService.updateUser(req.adminUser.id, req.params.id, req.body || {});
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("PATCH /api/admin/users/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi cập nhật người chơi" });
    }
  });

  router.post("/users/:id/ban", async (req, res) => {
    try {
      const result = await adminService.banUser(req.adminUser.id, req.params.id, req.body || {});
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/users/:id/ban error:", err);
      res.status(500).json({ success: false, message: "Lỗi khóa người chơi" });
    }
  });

  router.post("/users/:id/unban", async (req, res) => {
    try {
      const result = await adminService.unbanUser(req.adminUser.id, req.params.id);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/users/:id/unban error:", err);
      res.status(500).json({ success: false, message: "Lỗi mở khóa người chơi" });
    }
  });

  router.post("/users/:id/mute", async (req, res) => {
    try {
      const result = await adminService.muteUser(req.adminUser.id, req.params.id, req.body || {});
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/users/:id/mute error:", err);
      res.status(500).json({ success: false, message: "Lỗi cấm chat người chơi" });
    }
  });

  router.post("/users/:id/unmute", async (req, res) => {
    try {
      const result = await adminService.unmuteUser(req.adminUser.id, req.params.id);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/users/:id/unmute error:", err);
      res.status(500).json({ success: false, message: "Lỗi gỡ cấm chat" });
    }
  });

  // ── ROOMS ────────────────────────────────────────────────────────
  router.get("/rooms", async (req, res) => {
    try {
      res.json(await adminService.listRooms(req.query));
    } catch (err) {
      console.error("GET /api/admin/rooms error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách phòng" });
    }
  });

  router.post("/rooms/:id/close", async (req, res) => {
    try {
      res.json(await adminService.forceCloseRoom(req.adminUser.id, req.params.id));
    } catch (err) {
      console.error("POST /api/admin/rooms/:id/close error:", err);
      res.status(500).json({ success: false, message: "Lỗi buộc đóng phòng" });
    }
  });

  router.delete("/rooms/:id", async (req, res) => {
    try {
      res.json(await adminService.deleteRoom(req.adminUser.id, req.params.id));
    } catch (err) {
      console.error("DELETE /api/admin/rooms/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi xóa phòng" });
    }
  });

  // ── QUESTIONS (QUIZ) ─────────────────────────────────────────────
  router.get("/questions", async (req, res) => {
    try {
      res.json(await adminService.listQuestions(req.query));
    } catch (err) {
      console.error("GET /api/admin/questions error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải câu hỏi Quiz" });
    }
  });

  router.post("/questions", async (req, res) => {
    try {
      const result = await adminService.createQuestion(req.adminUser.id, req.body);
      res.status(result.success ? 201 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/questions error:", err);
      res.status(500).json({ success: false, message: "Lỗi thêm câu hỏi" });
    }
  });

  router.put("/questions/:id", async (req, res) => {
    try {
      const result = await adminService.updateQuestion(req.adminUser.id, req.params.id, req.body);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("PUT /api/admin/questions/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi sửa câu hỏi" });
    }
  });

  router.delete("/questions/:id", async (req, res) => {
    try {
      const result = await adminService.deleteQuestion(req.adminUser.id, req.params.id);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("DELETE /api/admin/questions/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi xóa câu hỏi" });
    }
  });

  // ── TAROTS ───────────────────────────────────────────────────────
  router.get("/tarots", async (req, res) => {
    try {
      res.json(await adminService.listTarots());
    } catch (err) {
      console.error("GET /api/admin/tarots error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải thẻ Tarot" });
    }
  });

  router.post("/tarots", async (req, res) => {
    try {
      const result = await adminService.createTarot(req.adminUser.id, req.body);
      res.status(result.success ? 201 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/tarots error:", err);
      res.status(500).json({ success: false, message: "Lỗi thêm thẻ Tarot" });
    }
  });

  router.put("/tarots/:id", async (req, res) => {
    try {
      const result = await adminService.updateTarot(req.adminUser.id, req.params.id, req.body);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("PUT /api/admin/tarots/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi cập nhật thẻ Tarot" });
    }
  });

  router.delete("/tarots/:id", async (req, res) => {
    try {
      const result = await adminService.deleteTarot(req.adminUser.id, req.params.id);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("DELETE /api/admin/tarots/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi xóa thẻ Tarot" });
    }
  });

  // ── CHARACTERS & SKILLS ──────────────────────────────────────────
  router.get("/characters", async (req, res) => {
    try {
      res.json(await adminService.listCharacters());
    } catch (err) {
      console.error("GET /api/admin/characters error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách nhân vật" });
    }
  });

  router.put("/characters/:id", async (req, res) => {
    try {
      const result = await adminService.updateCharacterAndSkill(req.adminUser.id, req.params.id, req.body || {});
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("PUT /api/admin/characters/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi cập nhật nhân vật" });
    }
  });

  // ── AUDIT LOGS ───────────────────────────────────────────────────
  router.get("/audit-logs", async (req, res) => {
    try {
      res.json(await adminService.getAuditLogs(req.query.limit));
    } catch (err) {
      console.error("GET /api/admin/audit-logs error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải nhật ký quản trị" });
    }
  });

  return router;
}

export default createAdminRouter;
