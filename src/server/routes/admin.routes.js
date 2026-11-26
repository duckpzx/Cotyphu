import express from "express";
import requireAdmin from "../middleware/adminAuth.js";
import { createAdminService } from "../services/admin.service.js";
import securityService from "../services/security.service.js";
import adminRepo from "../repositories/admin.repo.js";
import assetUploadService from "../services/assetUpload.service.js";
import systemConsoleService from "../services/systemConsole.service.js";
import payosService from "../services/payos.service.js";
import audioConfigService from "../services/audioConfig.service.js";
import weatherConfigService from "../services/weatherConfig.service.js";

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

  // ── SECURITY TELEMETRY & SOC ─────────────────────────────────────
  router.get("/security/summary", async (req, res) => {
    try {
      res.json(await securityService.getSummary());
    } catch (err) {
      console.error("GET /api/admin/security/summary error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải tổng quan an ninh" });
    }
  });

  router.get("/security/events", async (req, res) => {
    try {
      res.json(await securityService.listEvents(req.query));
    } catch (err) {
      console.error("GET /api/admin/security/events error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải nhật ký an ninh" });
    }
  });

  router.get("/security/events/export", async (req, res) => {
    try {
      const { events } = await securityService.listEvents({ ...req.query, limit: 500 });
      const header = ["id", "created_at", "user_id", "username", "ip_address", "event_type", "severity", "risk_score", "endpoint", "user_agent", "payload_summary"];
      const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        header.join(","),
        ...events.map(ev => header.map(k => csvCell(ev[k])).join(",")),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="security_events_${Date.now()}.csv"`);
      res.send("\uFEFF" + lines.join("\n"));
    } catch (err) {
      console.error("GET /api/admin/security/events/export error:", err);
      res.status(500).json({ success: false, message: "Lỗi xuất CSV" });
    }
  });

  router.get("/security/blacklist", async (req, res) => {
    try {
      res.json(await securityService.listBlacklist());
    } catch (err) {
      console.error("GET /api/admin/security/blacklist error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách IP bị chặn" });
    }
  });

  router.post("/security/blacklist", async (req, res) => {
    try {
      const result = await securityService.addBlacklist(req.adminUser.id, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "BLOCK_IP", "ip", req.body?.ip_address, req.body);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/security/blacklist error:", err);
      res.status(500).json({ success: false, message: "Lỗi chặn IP" });
    }
  });

  router.delete("/security/blacklist/:id", async (req, res) => {
    try {
      const result = await securityService.removeBlacklist(req.params.id);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UNBLOCK_IP", "ip", req.params.id);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("DELETE /api/admin/security/blacklist/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi gỡ chặn IP" });
    }
  });

  router.get("/security/sessions", async (req, res) => {
    try {
      res.json(await securityService.listSessions(req.query.limit));
    } catch (err) {
      console.error("GET /api/admin/security/sessions error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải nhật ký phiên IP" });
    }
  });

  // ── NPC / SPRITE STUDIO (UPLOAD TRỰC TIẾP VÀO Ổ CỨNG DỰ ÁN) ──────
  router.get("/assets/npcs", (req, res) => {
    res.json({ success: true, npcs: assetUploadService.getNpcConfig() });
  });

  router.post("/assets/npcs/:slot/upload", async (req, res) => {
    try {
      const slot = req.params.slot;
      const result = assetUploadService.saveNpcSprites(slot, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPLOAD_NPC_SPRITE", "asset", slot, {
          name: req.body?.name,
          fps: req.body?.fps,
          scale: req.body?.scale,
          idle_count: req.body?.idle_frames?.length || 0,
          attack_count: req.body?.attack_frames?.length || 0,
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/npcs/:slot/upload error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu ảnh vào ổ cứng dự án" });
    }
  });

  router.post("/assets/npcs/:slot/reset", async (req, res) => {
    try {
      const slot = req.params.slot;
      const result = assetUploadService.resetNpcSlot(slot);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "RESET_NPC_SPRITE", "asset", slot);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/npcs/:slot/reset error:", err);
      res.status(500).json({ success: false, message: "Lỗi khôi phục sprite mặc định" });
    }
  });

  // ── CHARACTER SKINS STUDIO ───────────────────────────────────────
  router.get("/assets/skins", async (req, res) => {
    try {
      const skins = await assetUploadService.listCharacterSkins();
      res.json({ success: true, skins });
    } catch (err) {
      console.error("GET /api/admin/assets/skins error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách trang phục" });
    }
  });

  router.post("/assets/skins/:skinId/upload", async (req, res) => {
    try {
      const result = await assetUploadService.saveCharacterSkinSprites(req.params.skinId, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPLOAD_SKIN_SPRITE", "skin", req.params.skinId, {
          price: req.body?.price,
          idle: req.body?.idle_frames?.length || 0,
          run: req.body?.run_frames?.length || 0,
          hurt: req.body?.hurt_frames?.length || 0,
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/skins/:skinId/upload error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu trang phục vào ổ cứng" });
    }
  });

  router.post("/assets/skins/:skinId/reset", async (req, res) => {
    try {
      const result = await assetUploadService.resetCharacterSkinSprites(req.params.skinId);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "RESET_SKIN_SPRITE", "skin", req.params.skinId);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/skins/:skinId/reset error:", err);
      res.status(500).json({ success: false, message: "Lỗi khôi phục trang phục gốc" });
    }
  });

  // ── TAROT IMAGE UPLOAD ───────────────────────────────────────────
  router.post("/assets/tarots/:id/upload", async (req, res) => {
    try {
      const result = await assetUploadService.uploadTarotImage(req.params.id, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPLOAD_TAROT_IMAGE", "tarot", req.params.id, { icon: result.icon });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/tarots/:id/upload error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu ảnh thẻ Tarot" });
    }
  });

  // ── BACKGROUNDS STUDIO ───────────────────────────────────────────
  router.get("/assets/backgrounds", async (req, res) => {
    try {
      const backgrounds = await assetUploadService.listBackgrounds();
      res.json({ success: true, backgrounds });
    } catch (err) {
      console.error("GET /api/admin/assets/backgrounds error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách phông nền" });
    }
  });

  router.post("/assets/backgrounds", async (req, res) => {
    try {
      const result = await assetUploadService.saveBackground(null, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "CREATE_BACKGROUND", "background", result.id, { name: req.body?.name });
      }
      res.status(result.success ? 201 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/backgrounds error:", err);
      res.status(500).json({ success: false, message: "Lỗi thêm phông nền" });
    }
  });

  router.post("/assets/backgrounds/:id/upload", async (req, res) => {
    try {
      const result = await assetUploadService.saveBackground(req.params.id, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPDATE_BACKGROUND", "background", req.params.id, { name: req.body?.name });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/backgrounds/:id/upload error:", err);
      res.status(500).json({ success: false, message: "Lỗi cập nhật phông nền" });
    }
  });

  // ── ORBS (TINH CẦU LV.1 & LV.2) ──────────────────────────────────
  router.get("/assets/orbs", (req, res) => {
    res.json({ success: true, orbs: assetUploadService.listOrbs() });
  });

  router.post("/assets/orbs/:orbKey/upload", async (req, res) => {
    try {
      const result = assetUploadService.uploadOrbImage(req.params.orbKey, req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPLOAD_ORB_IMAGE", "orb", req.params.orbKey);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/orbs/:orbKey/upload error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu ảnh tinh cầu" });
    }
  });

  router.post("/assets/orbs/:orbKey/reset", async (req, res) => {
    try {
      const result = assetUploadService.resetOrbImage(req.params.orbKey);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "RESET_ORB_IMAGE", "orb", req.params.orbKey);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/orbs/:orbKey/reset error:", err);
      res.status(500).json({ success: false, message: "Lỗi khôi phục ảnh tinh cầu" });
    }
  });

  // ── SEASONAL GAME MAPS (UPLOAD + 37 CELL COORDINATE EDITOR) ──────
  router.get("/assets/maps", (req, res) => {
    res.json({ success: true, ...assetUploadService.listMaps() });
  });

  router.post("/assets/maps/save", async (req, res) => {
    try {
      const result = assetUploadService.saveCustomMap(req.body || {});
      if (result.success) {
        const activeMatches = Object.keys(deps?.gameStates || {}).length;
        if (activeMatches > 0 && result.active_map_id === result.map?.id) {
          result.message += ` (Hiện có ${activeMatches} trận đang đấu vẫn giữ map cũ để không gián đoạn)`;
        }
        result.active_matches = activeMatches;
        await adminRepo.logAudit(req.adminUser.id, "SAVE_GAME_MAP", "map", result.map?.id, {
          name: result.map?.name,
          activated: result.active_map_id === result.map?.id,
          active_matches: activeMatches,
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/maps/save error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu bản đồ game" });
    }
  });

  router.post("/assets/maps/:id/activate", async (req, res) => {
    try {
      const result = assetUploadService.activateMap(req.params.id);
      if (result.success) {
        const activeMatches = Object.keys(deps?.gameStates || {}).length;
        if (activeMatches > 0) {
          result.message += ` (Hiện có ${activeMatches} trận đang đấu vẫn giữ nguyên map cũ để tránh gián đoạn)`;
        }
        result.active_matches = activeMatches;
        await adminRepo.logAudit(req.adminUser.id, "ACTIVATE_GAME_MAP", "map", req.params.id, { active_matches: activeMatches });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/maps/:id/activate error:", err);
      res.status(500).json({ success: false, message: "Lỗi áp dụng bản đồ" });
    }
  });

  router.delete("/assets/maps/:id", async (req, res) => {
    try {
      const result = assetUploadService.deleteCustomMap(req.params.id);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "DELETE_GAME_MAP", "map", req.params.id);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("DELETE /api/admin/assets/maps/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi xóa bản đồ" });
    }
  });

  // ── LOBBY DAY / NIGHT THEMES & 24H ATMOSPHERE ────────────────────
  router.get("/assets/lobby", (req, res) => {
    res.json({ success: true, ...assetUploadService.listLobbyPresets() });
  });

  router.post("/assets/lobby/save", async (req, res) => {
    try {
      const result = assetUploadService.saveLobbyPreset(req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "SAVE_LOBBY_THEME", "lobby", result.preset?.id, { name: result.preset?.name });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/lobby/save error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu sảnh chờ" });
    }
  });

  router.post("/assets/lobby/:id/activate", async (req, res) => {
    try {
      const result = assetUploadService.activateLobbyPreset(req.params.id);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "ACTIVATE_LOBBY_THEME", "lobby", req.params.id);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/lobby/:id/activate error:", err);
      res.status(500).json({ success: false, message: "Lỗi áp dụng sảnh chờ" });
    }
  });

  router.post("/assets/lobby/time-mode", async (req, res) => {
    try {
      const result = assetUploadService.setLobbyTimeMode(req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "SET_LOBBY_TIME_MODE", "lobby", result.time_mode, { fixed_hour: result.fixed_hour });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/lobby/time-mode error:", err);
      res.status(500).json({ success: false, message: "Lỗi cài đặt khung giờ sảnh" });
    }
  });

  router.post("/assets/lobby/default/reset", async (req, res) => {
    try {
      const result = assetUploadService.resetDefaultLobby();
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "RESET_DEFAULT_LOBBY", "lobby", "default");
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/lobby/default/reset error:", err);
      res.status(500).json({ success: false, message: "Lỗi khôi phục Sảnh Mặc Định" });
    }
  });

  router.post("/assets/lobby/:id/islands", async (req, res) => {
    try {
      const result = assetUploadService.updateLobbyIslands(req.params.id, req.body?.islands);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPDATE_LOBBY_ISLANDS", "lobby", req.params.id);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/assets/lobby/:id/islands error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu vị trí khu vực sảnh" });
    }
  });

  router.delete("/assets/lobby/:id", async (req, res) => {
    try {
      const result = assetUploadService.deleteLobbyPreset(req.params.id);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "DELETE_LOBBY_THEME", "lobby", req.params.id);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("DELETE /api/admin/assets/lobby/:id error:", err);
      res.status(500).json({ success: false, message: "Lỗi xóa bộ sảnh" });
    }
  });

  // ── SYSTEM CONSOLE (LIVE ACTIVITY TAIL) ──────────────────────────
  router.get("/console/logs", (req, res) => {
    res.json(systemConsoleService.queryLogs(req.query));
  });

  router.post("/console/clear", (req, res) => {
    res.json(systemConsoleService.clearLogs());
  });

  // ── RATING (BXH) & LAB (NGHIÊN CỨU) VISUAL SCENE EDITOR ──────────
  router.get("/assets/scenes/:sceneType", (req, res) => {
    const r = assetUploadService.listScenePresets(req.params.sceneType);
    res.status(r.success ? 200 : 400).json(r);
  });

  router.post("/assets/scenes/:sceneType/save", async (req, res) => {
    try {
      const r = assetUploadService.saveScenePreset(req.params.sceneType, req.body || {});
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "SAVE_SCENE_THEME", req.params.sceneType, r.preset?.id, { name: r.preset?.name });
      }
      res.status(r.success ? 200 : 400).json(r);
    } catch (err) {
      res.status(500).json({ success: false, message: "Lỗi lưu cấu hình màn hình" });
    }
  });

  router.post("/assets/scenes/:sceneType/:id/activate", async (req, res) => {
    try {
      const r = assetUploadService.activateScenePreset(req.params.sceneType, req.params.id);
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "ACTIVATE_SCENE_THEME", req.params.sceneType, req.params.id);
      }
      res.status(r.success ? 200 : 400).json(r);
    } catch (err) {
      res.status(500).json({ success: false, message: "Lỗi áp dụng giao diện" });
    }
  });

  router.delete("/assets/scenes/:sceneType/:id", async (req, res) => {
    try {
      const r = assetUploadService.deleteScenePreset(req.params.sceneType, req.params.id);
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "DELETE_SCENE_THEME", req.params.sceneType, req.params.id);
      }
      res.status(r.success ? 200 : 400).json(r);
    } catch (err) {
      res.status(500).json({ success: false, message: "Lỗi xóa giao diện" });
    }
  });

  // ── PAYMENT / TOP-UP MANAGEMENT & CONFIGURATION ──────────────────
  router.get("/payments/summary", async (req, res) => {
    try {
      const [overview, settingsRes] = await Promise.all([
        payosService.getAdminOverviewAndOrders(req.query || {}),
        payosService.getAdminSettings(),
      ]);
      res.json({
        success: true,
        ...overview,
        settings: settingsRes.settings,
        supported_banks: settingsRes.supported_banks,
        default_packages: settingsRes.default_packages,
      });
    } catch (err) {
      console.error("GET /api/admin/payments/summary error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải dữ liệu thanh toán" });
    }
  });

  router.put("/payments/settings", async (req, res) => {
    try {
      const result = await payosService.saveAdminSettings(req.body || {});
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPDATE_PAYMENT_SETTINGS", "payment_settings", 1, {
          bank_code: result.settings?.bank_code,
          bank_account: result.settings?.bank_account,
          maintenance_mode: result.settings?.maintenance_mode,
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("PUT /api/admin/payments/settings error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu cấu hình thanh toán" });
    }
  });

  router.post("/payments/orders/:orderCode/approve", async (req, res) => {
    try {
      const result = await payosService.adminApproveOrder(req.params.orderCode, req.adminUser.id, {
        io: deps.io,
        onlineUserSockets: deps.onlineUserSockets,
      });
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "APPROVE_PAYMENT_ORDER", "payment_orders", req.params.orderCode, {
          ecoin: result.ecoin,
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/payments/orders/:orderCode/approve error:", err);
      res.status(500).json({ success: false, message: "Lỗi duyệt đơn nạp" });
    }
  });

  router.post("/payments/orders/:orderCode/cancel", async (req, res) => {
    try {
      const result = await payosService.adminCancelOrder(req.params.orderCode);
      if (result.success) {
        await adminRepo.logAudit(req.adminUser.id, "CANCEL_PAYMENT_ORDER", "payment_orders", req.params.orderCode);
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("POST /api/admin/payments/orders/:orderCode/cancel error:", err);
      res.status(500).json({ success: false, message: "Lỗi hủy đơn nạp" });
    }
  });

  router.post("/payments/test-webhook", async (req, res) => {
    try {
      const result = await payosService.adminTestWebhookPing();
      res.json(result);
    } catch (err) {
      console.error("POST /api/admin/payments/test-webhook error:", err);
      res.status(500).json({ success: false, message: "Lỗi test webhook" });
    }
  });

  // ── AUDIO STUDIO (QUẢN LÝ FILE NHẠC NỀN & ÂM THANH TRONG MYSQL) ──
  router.get("/assets/audio", async (req, res) => {
    try {
      res.json(await audioConfigService.listTracks({ bypassCache: true }));
    } catch (err) {
      console.error("GET /api/admin/assets/audio error:", err);
      res.status(500).json({ success: false, message: "Lỗi tải danh sách âm thanh" });
    }
  });

  router.post("/assets/audio/:trackId", async (req, res) => {
    try {
      const r = await audioConfigService.updateTrack(req.params.trackId, req.body || {});
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPDATE_AUDIO_TRACK", "audio_settings", req.params.trackId, {
          custom_name: r.track?.custom_name,
          volume: r.track?.volume,
          enabled: r.track?.enabled,
        });
      }
      res.status(r.success ? 200 : 400).json(r);
    } catch (err) {
      console.error("POST /api/admin/assets/audio/:trackId error:", err);
      res.status(500).json({ success: false, message: "Lỗi cập nhật file âm thanh" });
    }
  });

  router.delete("/assets/audio/:trackId", async (req, res) => {
    try {
      const r = await audioConfigService.resetTrack(req.params.trackId);
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "RESET_AUDIO_TRACK", "audio_settings", req.params.trackId);
      }
      res.status(r.success ? 200 : 400).json(r);
    } catch (err) {
      console.error("DELETE /api/admin/assets/audio/:trackId error:", err);
      res.status(500).json({ success: false, message: "Lỗi khôi phục âm thanh mặc định" });
    }
  });

  // ── WEATHER EFFECT CONFIG (TUYẾT RƠI / HOA ĐÀO TOÀN GAME) ────────
  router.get("/weather", async (req, res) => {
    try {
      res.json(await weatherConfigService.getConfig({ bypassCache: true }));
    } catch (err) {
      res.status(500).json({ success: false, message: "Lỗi tải cấu hình thời tiết" });
    }
  });

  router.put("/weather", async (req, res) => {
    try {
      const r = await weatherConfigService.saveConfig(req.body || {}, { io: deps.io });
      if (r.success) {
        await adminRepo.logAudit(req.adminUser.id, "UPDATE_WEATHER_EFFECT", "weather_settings", 1, {
          mode: r.mode,
          density: r.density,
        });
      }
      res.json(r);
    } catch (err) {
      console.error("PUT /api/admin/weather error:", err);
      res.status(500).json({ success: false, message: "Lỗi lưu hiệu ứng thời tiết" });
    }
  });

  return router;
}

export default createAdminRouter;
