import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import adminRepo from "../repositories/admin.repo.js";
import userRepo from "../repositories/user.repo.js";
import assetUploadService from "./assetUpload.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

function countPngFiles(relDir) {
  try {
    const abs = path.join(PROJECT_ROOT, relDir);
    if (!fs.existsSync(abs)) return 0;
    return fs.readdirSync(abs).filter(f => /\.png$/i.test(f)).length;
  } catch {
    return 0;
  }
}
import roomRepo from "../repositories/room.repo.js";

/**
 * Helper chuyển số phút (hoặc null cho vĩnh viễn) thành Date object cho MySQL DATETIME.
 */
function computeExpiryDate(durationMinutes) {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes === "" || Number(durationMinutes) <= 0) {
    return null; // vĩnh viễn (ban) hoặc không đặt hạn
  }
  return new Date(Date.now() + Number(durationMinutes) * 60 * 1000);
}

/**
 * Tạo AdminService với Dependency Injection cho live runtime state (io, gameStates, onlineUserSockets).
 */
export function createAdminService({ io, gameStates, onlineUserSockets, clearRoomBotTimers }) {
  function disconnectUserSockets(userId, reason) {
    const uid = Number(userId);
    const sockSet = onlineUserSockets?.get(uid);
    if (!sockSet || sockSet.size === 0) return 0;
    let kicked = 0;
    for (const sid of [...sockSet]) {
      const s = io?.sockets?.sockets?.get(sid);
      if (s) {
        s.emit("auth:kicked", { message: reason || "Tài khoản của bạn đã bị khóa bởi quản trị viên." });
        s.disconnect(true);
        kicked++;
      }
    }
    return kicked;
  }

  function notifyUserSockets(userId, event, payload) {
    const uid = Number(userId);
    const sockSet = onlineUserSockets?.get(uid);
    if (!sockSet) return;
    for (const sid of sockSet) {
      const s = io?.sockets?.sockets?.get(sid);
      if (s) s.emit(event, payload);
    }
  }

  return {
    async login(username, password) {
      if (!username || !password) {
        return { success: false, message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu" };
      }
      const result = await userRepo.login(username, password);
      if (!result?.user) {
        return { success: false, message: "Sai tài khoản hoặc mật khẩu" };
      }
      const user = result.user;
      if (user.role !== "admin") {
        return { success: false, message: "Tài khoản này không có quyền quản trị viên (role != admin)" };
      }
      if (Number(user.is_banned) === 1 && (!user.banned_until || new Date(user.banned_until).getTime() > Date.now())) {
        return { success: false, message: "Tài khoản quản trị đã bị khóa" };
      }

      const token = jwt.sign(
        { id: user.id, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || "1d" }
      );

      await adminRepo.logAudit(user.id, "ADMIN_LOGIN", "auth", user.id, { username: user.username });
      return {
        success: true,
        token,
        admin: {
          id: user.id,
          username: user.username,
          name: user.name || user.username,
          role: user.role,
        },
      };
    },

    async getOverview() {
      const dbStats = await adminRepo.getOverviewStats();
      const activeGameIds = Object.keys(gameStates || {});
      let activeBotCount = 0;
      activeGameIds.forEach(rid => {
        const gs = gameStates[rid];
        (gs?.players || []).forEach(p => {
          if (p.is_bot_controlled) activeBotCount++;
        });
      });

      const recentLogs = await adminRepo.getAuditLogs(15);

      // Thống kê kho tài nguyên (Trang phục, Bản đồ, Sảnh, Giao diện BXH/Lab, Avatar, Emoji, NPC)
      let totalSkins = 0, totalMaps = 0, totalLobbies = 0, totalScenes = 0, totalNpcs = 0;
      try { totalSkins = ((await assetUploadService.listCharacterSkins?.()) || []).length; } catch {}
      try { totalMaps = (assetUploadService.listMaps?.()?.maps || []).length; } catch {}
      try { totalLobbies = (assetUploadService.listLobbyPresets?.()?.presets || []).length; } catch {}
      try {
        const rPresets = assetUploadService.listScenePresets?.("rating")?.presets || [];
        const lPresets = assetUploadService.listScenePresets?.("lab")?.presets || [];
        totalScenes = rPresets.length + lPresets.length;
      } catch {}
      try {
        const npcCfg = assetUploadService.getNpcConfig?.() || {};
        totalNpcs = Array.isArray(npcCfg) ? npcCfg.length : Object.keys(npcCfg).length;
      } catch {}

      const totalAvatars = countPngFiles("assets/resources/Avatar/PNG/thumbs_96");
      const totalEmojis = countPngFiles("assets/resources/Emoji/PNG/thumbs_40");

      return {
        success: true,
        stats: {
          ...dbStats,
          online_users: onlineUserSockets ? onlineUserSockets.size : 0,
          active_matches: activeGameIds.length,
          active_bots: activeBotCount,
          total_skins: totalSkins,
          total_maps: totalMaps,
          total_lobbies: totalLobbies,
          total_scenes: totalScenes,
          total_npcs: totalNpcs,
          total_avatars: totalAvatars,
          total_emojis: totalEmojis,
        },
        recent_logs: recentLogs,
      };
    },

    // ── USERS ──────────────────────────────────────────────────────
    async listUsers(query) {
      const data = await adminRepo.listUsers(query);
      const users = data.users.map(u => {
        const isOnline = !!(onlineUserSockets && onlineUserSockets.has(Number(u.id)));
        const banActive = Number(u.is_banned) === 1 && (!u.banned_until || new Date(u.banned_until).getTime() > Date.now());
        const muteActive = !!(u.muted_until && new Date(u.muted_until).getTime() > Date.now());
        return {
          ...u,
          is_online: isOnline,
          is_banned_active: banActive,
          is_muted_active: muteActive,
        };
      });
      return { success: true, ...data, users };
    },

    async updateUser(adminId, targetUserId, body) {
      const uid = Number(targetUserId);
      if (uid === Number(adminId) && body.role && body.role !== "admin") {
        return { success: false, message: "Không thể tự hạ quyền admin của chính mình" };
      }
      const ok = await adminRepo.updateUser(uid, {
        name: body.name,
        ecoin: body.ecoin,
        role: body.role,
      });
      if (!ok) return { success: false, message: "Không tìm thấy người chơi hoặc không có thay đổi" };
      await adminRepo.logAudit(adminId, "UPDATE_USER", "user", uid, body);
      return { success: true, message: "Cập nhật thông tin người chơi thành công" };
    },

    async banUser(adminId, targetUserId, { duration_minutes = null, reason = "Vi phạm quy định" }) {
      const uid = Number(targetUserId);
      if (uid === Number(adminId)) {
        return { success: false, message: "Không thể tự khóa tài khoản của chính mình" };
      }
      const bannedUntil = computeExpiryDate(duration_minutes);
      const ok = await adminRepo.setUserBan(uid, {
        is_banned: true,
        ban_reason: String(reason || "Vi phạm quy định").trim().slice(0, 250),
        banned_until: bannedUntil,
      });
      if (!ok) return { success: false, message: "Không tìm thấy người chơi" };

      const kicked = disconnectUserSockets(uid, `Tài khoản bị khóa: ${reason || "Vi phạm quy định"}`);
      await adminRepo.logAudit(adminId, "BAN_USER", "user", uid, { duration_minutes, reason, kicked_sockets: kicked });
      return {
        success: true,
        message: bannedUntil
          ? `Đã khóa người chơi đến ${bannedUntil.toLocaleString("vi-VN")}`
          : "Đã khóa vĩnh viễn người chơi",
        kicked_sockets: kicked,
      };
    },

    async unbanUser(adminId, targetUserId) {
      const uid = Number(targetUserId);
      const ok = await adminRepo.setUserBan(uid, { is_banned: false });
      if (!ok) return { success: false, message: "Không tìm thấy người chơi" };
      await adminRepo.logAudit(adminId, "UNBAN_USER", "user", uid);
      return { success: true, message: "Đã mở khóa tài khoản thành công" };
    },

    async muteUser(adminId, targetUserId, { duration_minutes = 60, reason = "Spam / ngôn từ không phù hợp" }) {
      const uid = Number(targetUserId);
      const mins = Math.max(1, Number(duration_minutes) || 60);
      const mutedUntil = computeExpiryDate(mins);
      const cleanReason = String(reason || "Vi phạm quy tắc chat").trim().slice(0, 250);

      const ok = await adminRepo.setUserMute(uid, { muted_until: mutedUntil, mute_reason: cleanReason });
      if (!ok) return { success: false, message: "Không tìm thấy người chơi" };

      notifyUserSockets(uid, "chat:error", {
        message: `Bạn đã bị quản trị viên cấm chat trong ${mins} phút. Lý do: ${cleanReason}`,
      });
      await adminRepo.logAudit(adminId, "MUTE_USER", "user", uid, { duration_minutes: mins, reason: cleanReason });
      return {
        success: true,
        message: `Đã cấm chat đến ${mutedUntil.toLocaleString("vi-VN")}`,
      };
    },

    async unmuteUser(adminId, targetUserId) {
      const uid = Number(targetUserId);
      const ok = await adminRepo.setUserMute(uid, { muted_until: null, mute_reason: null });
      if (!ok) return { success: false, message: "Không tìm thấy người chơi" };
      notifyUserSockets(uid, "chat:error", { message: "Quản trị viên đã gỡ cấm chat cho bạn." });
      await adminRepo.logAudit(adminId, "UNMUTE_USER", "user", uid);
      return { success: true, message: "Đã gỡ cấm chat thành công" };
    },

    // ── ROOMS ──────────────────────────────────────────────────────
    async listRooms(query) {
      const dbRooms = await adminRepo.listRooms(query);
      const rooms = dbRooms.map(r => {
        const gs = gameStates?.[r.id] || gameStates?.[String(r.id)] || null;
        return {
          ...r,
          live_in_memory: !!gs,
          live_phase: gs?.phase || null,
          live_turn: gs?.turn_number || null,
          live_players: gs
            ? (gs.players || []).map(p => ({
                user_id: p.user_id,
                name: p.name,
                cash: p.cash,
                is_bot: !!p.is_bot_controlled,
                is_connected: p.is_connected !== false,
              }))
            : [],
        };
      });
      return { success: true, rooms };
    },

    async forceCloseRoom(adminId, roomId) {
      const rid = Number(roomId);
      const gs = gameStates?.[rid];
      if (gs) {
        if (typeof clearRoomBotTimers === "function") clearRoomBotTimers(gs);
        delete gameStates[rid];
      }
      if (io) {
        io.to(`room_${rid}`).to(`game_${rid}`).emit("room:closed", {
          message: "Phòng đã bị quản trị viên đóng.",
        });
        try {
          const roomSocks = await io.in(`room_${rid}`).fetchSockets();
          roomSocks.forEach(s => { s.leave(`room_${rid}`); s.current_room_id = null; });
          const gameSocks = await io.in(`game_${rid}`).fetchSockets();
          gameSocks.forEach(s => { s.leave(`game_${rid}`); s.game_room_id = null; s.current_game_id = null; });
        } catch (_) {}
      }
      await roomRepo.updateRoomStatus(rid, "finished");
      await adminRepo.logAudit(adminId, "FORCE_CLOSE_ROOM", "room", rid);
      return { success: true, message: `Đã buộc đóng phòng #${rid}` };
    },

    async deleteRoom(adminId, roomId) {
      const rid = Number(roomId);
      await this.forceCloseRoom(adminId, rid);
      await roomRepo.deleteRoom(rid);
      await adminRepo.logAudit(adminId, "DELETE_ROOM", "room", rid);
      return { success: true, message: `Đã xóa phòng #${rid}` };
    },

    // ── QUESTIONS ──────────────────────────────────────────────────
    async listQuestions(query) {
      const questions = await adminRepo.listQuestions(query);
      return { success: true, questions };
    },

    async createQuestion(adminId, body) {
      const { question, option_a, option_b, option_c, option_d, correct_answer } = body || {};
      const correct = String(correct_answer || "").trim().toUpperCase();
      if (!question?.trim() || !option_a?.trim() || !option_b?.trim() || !option_c?.trim() || !option_d?.trim()) {
        return { success: false, message: "Vui lòng nhập đầy đủ nội dung câu hỏi và 4 đáp án A, B, C, D" };
      }
      if (!["A", "B", "C", "D"].includes(correct)) {
        return { success: false, message: "Đáp án đúng phải là A, B, C hoặc D" };
      }
      const id = await adminRepo.createQuestion({
        question: question.trim(),
        option_a: option_a.trim(),
        option_b: option_b.trim(),
        option_c: option_c.trim(),
        option_d: option_d.trim(),
        correct_answer: correct,
      });
      await adminRepo.logAudit(adminId, "CREATE_QUESTION", "question", id, { question: question.trim().slice(0, 80) });
      return { success: true, id, message: "Thêm câu hỏi thành công" };
    },

    async updateQuestion(adminId, id, body) {
      const { question, option_a, option_b, option_c, option_d, correct_answer } = body || {};
      const correct = String(correct_answer || "").trim().toUpperCase();
      if (!question?.trim() || !["A", "B", "C", "D"].includes(correct)) {
        return { success: false, message: "Dữ liệu câu hỏi không hợp lệ" };
      }
      const ok = await adminRepo.updateQuestion(id, {
        question: question.trim(),
        option_a: String(option_a || "").trim(),
        option_b: String(option_b || "").trim(),
        option_c: String(option_c || "").trim(),
        option_d: String(option_d || "").trim(),
        correct_answer: correct,
      });
      if (!ok) return { success: false, message: "Không tìm thấy câu hỏi" };
      await adminRepo.logAudit(adminId, "UPDATE_QUESTION", "question", id);
      return { success: true, message: "Cập nhật câu hỏi thành công" };
    },

    async deleteQuestion(adminId, id) {
      const ok = await adminRepo.deleteQuestion(id);
      if (!ok) return { success: false, message: "Không tìm thấy câu hỏi" };
      await adminRepo.logAudit(adminId, "DELETE_QUESTION", "question", id);
      return { success: true, message: "Đã xóa câu hỏi" };
    },

    // ── TAROTS ─────────────────────────────────────────────────────
    async listTarots() {
      const tarots = await adminRepo.listTarots();
      return { success: true, tarots };
    },

    async createTarot(adminId, body) {
      if (!body?.name?.trim()) return { success: false, message: "Tên thẻ không được để trống" };
      const id = await adminRepo.createTarot({
        name: body.name.trim(),
        description: String(body.description || "").trim(),
        cooldown_seconds: Number(body.cooldown_seconds) || 0,
        icon: String(body.icon || "").trim(),
        effect_type: String(body.effect_type || "").trim(),
      });
      await adminRepo.logAudit(adminId, "CREATE_TAROT", "tarot", id, { name: body.name.trim() });
      return { success: true, id, message: "Thêm thẻ Tarot thành công" };
    },

    async updateTarot(adminId, id, body) {
      if (!body?.name?.trim()) return { success: false, message: "Tên thẻ không được để trống" };
      const ok = await adminRepo.updateTarot(id, {
        name: body.name.trim(),
        description: String(body.description || "").trim(),
        cooldown_seconds: Number(body.cooldown_seconds) || 0,
        icon: String(body.icon || "").trim(),
        effect_type: String(body.effect_type || "").trim(),
      });
      if (!ok) return { success: false, message: "Không tìm thấy thẻ Tarot" };
      await adminRepo.logAudit(adminId, "UPDATE_TAROT", "tarot", id, { name: body.name.trim() });
      return { success: true, message: "Cập nhật thẻ Tarot thành công" };
    },

    async deleteTarot(adminId, id) {
      const ok = await adminRepo.deleteTarot(id);
      if (!ok) return { success: false, message: "Không tìm thấy thẻ Tarot" };
      await adminRepo.logAudit(adminId, "DELETE_TAROT", "tarot", id);
      return { success: true, message: "Đã xóa thẻ Tarot" };
    },

    // ── CHARACTERS & SKILLS ────────────────────────────────────────
    async listCharacters() {
      const characters = await adminRepo.listCharactersWithSkills();
      return { success: true, characters };
    },

    async updateCharacterAndSkill(adminId, characterId, body) {
      const cid = Number(characterId);
      if (body.name !== undefined || body.price !== undefined) {
        await adminRepo.updateCharacter(cid, { name: body.name, price: body.price });
      }
      if (body.passive_name !== undefined || body.active_name !== undefined) {
        await adminRepo.upsertCharacterSkill(cid, body);
      }
      await adminRepo.logAudit(adminId, "UPDATE_CHARACTER", "character", cid, {
        name: body.name,
        price: body.price,
        energy_cost: body.energy_cost,
      });
      return { success: true, message: "Cập nhật nhân vật & kỹ năng thành công" };
    },

    async getAuditLogs(limit = 80) {
      const logs = await adminRepo.getAuditLogs(limit);
      return { success: true, logs };
    },
  };
}

export default createAdminService;
