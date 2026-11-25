import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const CUSTOM_NPC_DIR = path.join(PROJECT_ROOT, "assets", "custom_npcs");
const BACKUP_DIR = path.join(PROJECT_ROOT, "assets", "_studio_backups");
const CONFIG_PATH = path.join(CUSTOM_NPC_DIR, "npc_config.json");

const ALLOWED_SLOTS = {
  monster: {
    slot: "monster",
    label: "Quái vật (Ô 28)",
    default_name: "Devil Leader",
    default_fps: 12,
    default_scale: 1,
    animations: ["idle", "attack"],
    default_idle_dir: "assets/characters/Fantasy_Monster/Devil Leader/PNG/PNG Sequences/Front - Idle Blinking",
    default_attack_dir: "assets/characters/Fantasy_Monster/Devil Leader/PNG/PNG Sequences/Front - Attacking",
  },
  teacher: {
    slot: "teacher",
    label: "Thầy giáo (Ô 18)",
    default_name: "Sage",
    default_fps: 12,
    default_scale: 1,
    animations: ["idle"],
    default_idle_dir: "assets/characters/Fantasy_Teacher/Sage/PNG/PNG Sequences/Idle Blinking",
    default_attack_dir: null,
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (err) {
    console.warn("readNpcConfig error:", err.message);
  }
  return {};
}

function writeConfig(cfg) {
  ensureDir(CUSTOM_NPC_DIR);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

function decodeDataUrlImage(dataUrl) {
  const str = String(dataUrl || "");
  const match = str.match(/^data:image\/(png|webp|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > 6 * 1024 * 1024) return null;
  return { ext, buffer };
}

function cleanFolder(dir) {
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Quét toàn bộ file ảnh PNG/WebP/JPG trong 1 thư mục relative và trả về danh sách URL sắp xếp tự nhiên.
 */
function listFolderImageUrls(relDir) {
  if (!relDir) return [];
  const absDir = path.join(PROJECT_ROOT, relDir);
  if (!fs.existsSync(absDir)) return [];
  const files = fs
    .readdirSync(absDir)
    .filter(f => /\.(png|webp|jpe?g)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  return files.map(f => "/" + [relDir.replace(/\\/g, "/"), f].join("/").replace(/\/+/g, "/"));
}

function copyFolderFiles(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(dstDir);
  for (const f of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, f);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(dstDir, f));
    }
  }
}

function safeSlug(str) {
  return String(str || "").replace(/[^A-Za-z0-9_-]/g, "");
}

const assetUploadService = {
  // ═══════════════════════════════════════════════════════════════
  //  1. NPC (QUÁI VẬT Ô 28 & THẦY GIÁO Ô 18)
  // ═══════════════════════════════════════════════════════════════
  getNpcConfig() {
    const saved = readConfig();
    const result = {};
    for (const [slot, meta] of Object.entries(ALLOWED_SLOTS)) {
      const custom = saved[slot] || null;
      const defaultIdle = listFolderImageUrls(meta.default_idle_dir);
      const defaultAttack = listFolderImageUrls(meta.default_attack_dir);

      const idleFrames = custom?.idle_frames?.length ? custom.idle_frames : defaultIdle;
      const attackFrames = custom?.attack_frames?.length ? custom.attack_frames : defaultAttack;
      const ver = custom?.version || 0;

      result[slot] = {
        slot: meta.slot,
        label: meta.label,
        animations: meta.animations,
        is_custom: !!custom,
        name: custom?.name || meta.default_name,
        fps: Number(custom?.fps || meta.default_fps),
        scale: Number(custom?.scale || meta.default_scale),
        version: ver,
        updated_at: custom?.updated_at || null,
        disk_folder: custom ? `assets/custom_npcs/${slot}` : meta.default_idle_dir,
        idle_frames: custom ? (custom.idle_frames || []) : [],
        attack_frames: custom ? (custom.attack_frames || []) : [],
        // Danh sách đầy đủ frame để Live Demo chạy mượt ngay cả khi đang ở chế độ mặc định
        preview_idle_frames: idleFrames.map(u => (ver ? `${u}?v=${ver}` : u)),
        preview_attack_frames: attackFrames.map(u => (ver ? `${u}?v=${ver}` : u)),
        preview_url: idleFrames[0] ? (ver ? `${idleFrames[0]}?v=${ver}` : idleFrames[0]) : "",
      };
    }
    return result;
  },

  saveNpcSprites(slot, { name, fps = 12, scale = 1, idle_frames = [], attack_frames = [] }) {
    const meta = ALLOWED_SLOTS[slot];
    if (!meta) {
      return { success: false, message: `Slot '${slot}' không hợp lệ (chỉ hỗ trợ monster, teacher)` };
    }

    const hasIdle = Array.isArray(idle_frames) && idle_frames.length > 0;
    const hasAttack = Array.isArray(attack_frames) && attack_frames.length > 0;

    if (!hasIdle && !hasAttack) {
      return { success: false, message: "Vui lòng chọn ít nhất 1 ảnh Idle (hoặc Attack) trước khi lưu" };
    }
    if (idle_frames.length > 60 || attack_frames.length > 60) {
      return { success: false, message: "Tối đa 60 frames cho mỗi trạng thái animation" };
    }

    const cfg = readConfig();
    const prev = cfg[slot] || {};
    const slotDir = path.join(CUSTOM_NPC_DIR, slot);
    ensureDir(slotDir);

    let savedIdleUrls = prev.idle_frames || [];
    let savedAttackUrls = prev.attack_frames || [];

    if (hasIdle) {
      const idleDir = path.join(slotDir, "idle");
      cleanFolder(idleDir);
      savedIdleUrls = [];
      for (let i = 0; i < idle_frames.length; i++) {
        const decoded = decodeDataUrlImage(idle_frames[i]);
        if (!decoded) {
          return { success: false, message: `Ảnh Idle #${i + 1} không hợp lệ (PNG/WebP/JPG ≤ 6MB)` };
        }
        const filename = `frame_${String(i).padStart(3, "0")}.${decoded.ext}`;
        fs.writeFileSync(path.join(idleDir, filename), decoded.buffer);
        savedIdleUrls.push(`/assets/custom_npcs/${slot}/idle/${filename}`);
      }
    }

    if (meta.animations.includes("attack") && hasAttack) {
      const atkDir = path.join(slotDir, "attack");
      cleanFolder(atkDir);
      savedAttackUrls = [];
      for (let i = 0; i < attack_frames.length; i++) {
        const decoded = decodeDataUrlImage(attack_frames[i]);
        if (!decoded) {
          return { success: false, message: `Ảnh Attack #${i + 1} không hợp lệ (PNG/WebP/JPG ≤ 6MB)` };
        }
        const filename = `frame_${String(i).padStart(3, "0")}.${decoded.ext}`;
        fs.writeFileSync(path.join(atkDir, filename), decoded.buffer);
        savedAttackUrls.push(`/assets/custom_npcs/${slot}/attack/${filename}`);
      }
    }

    if (savedIdleUrls.length === 0) {
      return { success: false, message: "Cần có ít nhất 1 ảnh Idle để hiển thị nhân vật trên bàn cờ" };
    }

    const version = Date.now();
    cfg[slot] = {
      name: String(name || meta.default_name).trim().slice(0, 80),
      fps: Math.min(30, Math.max(4, Number(fps) || 12)),
      scale: Math.min(2.5, Math.max(0.3, Number(scale) || 1)),
      version,
      updated_at: new Date().toISOString(),
      idle_frames: savedIdleUrls,
      attack_frames: meta.animations.includes("attack")
        ? (savedAttackUrls.length > 0 ? savedAttackUrls : savedIdleUrls)
        : [],
    };

    writeConfig(cfg);
    return {
      success: true,
      message: `Đã lưu ${savedIdleUrls.length} ảnh Idle${cfg[slot].attack_frames.length ? ` + ${cfg[slot].attack_frames.length} ảnh Attack` : ""} vào assets/custom_npcs/${slot}/`,
      npc: this.getNpcConfig()[slot],
    };
  },

  resetNpcSlot(slot) {
    if (!ALLOWED_SLOTS[slot]) return { success: false, message: "Slot không hợp lệ" };
    const cfg = readConfig();
    delete cfg[slot];
    writeConfig(cfg);
    const slotDir = path.join(CUSTOM_NPC_DIR, slot);
    if (fs.existsSync(slotDir)) fs.rmSync(slotDir, { recursive: true, force: true });
    return {
      success: true,
      message: `Đã khôi phục ${ALLOWED_SLOTS[slot].label} về mặc định`,
      npc: this.getNpcConfig()[slot],
    };
  },

  // ═══════════════════════════════════════════════════════════════
  //  2. NHÂN VẬT & TRANG PHỤC (PLAYABLE CHARACTER SKINS)
  // ═══════════════════════════════════════════════════════════════
  async listCharacterSkins() {
    const [rows] = await db.query(`
      SELECT cs.id AS skin_id, cs.character_id, cs.skin_number, cs.image, cs.is_default, cs.price,
             c.name AS character_name
      FROM character_skins cs
      JOIN characters c ON c.id = cs.character_id
      ORDER BY cs.character_id ASC, cs.skin_number ASC
    `);

    const v = Date.now();
    return rows.map(r => {
      const charName = String(r.character_name || "").replace(/ /g, "_");
      const folderName = r.image || `${charName}_${r.skin_number}`;
      const baseRel = `assets/characters/${charName}/${folderName}/PNG/PNG Sequences`;

      const idleUrls = listFolderImageUrls(`${baseRel}/Idle`);
      const runUrls = listFolderImageUrls(`${baseRel}/Run Throwing`);
      const hurtUrls = listFolderImageUrls(`${baseRel}/Hurt`);
      const backupExists = fs.existsSync(path.join(BACKUP_DIR, `${charName}_${r.skin_number}`));

      return {
        skin_id: Number(r.skin_id),
        character_id: Number(r.character_id),
        character_name: charName,
        skin_number: Number(r.skin_number),
        folder_name: folderName,
        is_default: Number(r.is_default) === 1,
        price: Number(r.price || 0),
        has_backup: backupExists,
        disk_folder: baseRel,
        preview_url: idleUrls[0] ? `${idleUrls[0]}?v=${v}` : "",
        preview_idle_frames: idleUrls.map(u => `${u}?v=${v}`),
        preview_run_frames: runUrls.map(u => `${u}?v=${v}`),
        preview_hurt_frames: hurtUrls.map(u => `${u}?v=${v}`),
      };
    });
  },

  /**
   * Ghi đè trực tiếp các frame Idle (18), Run Throwing (12), Hurt (12) vào đúng thư mục game của nhân vật.
   * Tự động tạo backup lần đầu để có thể Khôi phục gốc 1 click!
   */
  async saveCharacterSkinSprites(skinId, { price, idle_frames = [], run_frames = [], hurt_frames = [] }) {
    const [[row]] = await db.query(
      `SELECT cs.id, cs.character_id, cs.skin_number, cs.image, c.name AS character_name
       FROM character_skins cs
       JOIN characters c ON c.id = cs.character_id
       WHERE cs.id = ? LIMIT 1`,
      [Number(skinId)]
    );
    if (!row) return { success: false, message: "Không tìm thấy trang phục nhân vật" };

    if (price !== undefined && price !== "") {
      await db.query("UPDATE character_skins SET price = ? WHERE id = ?", [Math.max(0, Number(price) || 0), Number(skinId)]);
    }

    const charName = safeSlug(String(row.character_name || "").replace(/ /g, "_"));
    const folderName = safeSlug(row.image || `${charName}_${row.skin_number}`);
    const seqRoot = path.join(PROJECT_ROOT, "assets", "characters", charName, folderName, "PNG", "PNG Sequences");
    const backupRoot = path.join(BACKUP_DIR, `${charName}_${row.skin_number}`);

    const writeSequence = (frames, subDir, filePrefix, targetCount) => {
      if (!Array.isArray(frames) || frames.length === 0) return 0;
      const dstDir = path.join(seqRoot, subDir);
      const bkpDir = path.join(backupRoot, subDir);
      // Sao lưu bản gốc lần đầu trước khi ghi đè
      if (fs.existsSync(dstDir) && !fs.existsSync(bkpDir)) {
        copyFolderFiles(dstDir, bkpDir);
      }
      ensureDir(dstDir);

      const decodedList = [];
      for (const f of frames.slice(0, 60)) {
        const d = decodeDataUrlImage(f);
        if (d) decodedList.push(d);
      }
      if (!decodedList.length) return 0;

      // Ghi đủ số frame game yêu cầu (18 cho Idle, 12 cho Run/Hurt) bằng cách lặp tuần hoàn nếu ít hơn
      const total = Math.max(targetCount, decodedList.length);
      for (let i = 0; i < total; i++) {
        const item = decodedList[i % decodedList.length];
        const filename = `${filePrefix}_${String(i).padStart(3, "0")}.png`;
        fs.writeFileSync(path.join(dstDir, filename), item.buffer);
      }
      return decodedList.length;
    };

    const nIdle = writeSequence(idle_frames, "Idle", `0_${charName}_Idle`, 18);
    const nRun = writeSequence(run_frames, "Run Throwing", `0_${charName}_Run Throwing`, 12);
    const nHurt = writeSequence(hurt_frames, "Hurt", `0_${charName}_Hurt`, 12);

    return {
      success: true,
      message: `Đã cập nhật ${charName} (Skin ${row.skin_number})` +
        (nIdle || nRun || nHurt ? ` — Idle:${nIdle}, Run:${nRun}, Hurt:${nHurt}` : " — đã lưu giá bán"),
    };
  },

  async resetCharacterSkinSprites(skinId) {
    const [[row]] = await db.query(
      `SELECT cs.id, cs.skin_number, cs.image, c.name AS character_name
       FROM character_skins cs
       JOIN characters c ON c.id = cs.character_id
       WHERE cs.id = ? LIMIT 1`,
      [Number(skinId)]
    );
    if (!row) return { success: false, message: "Không tìm thấy trang phục" };

    const charName = safeSlug(String(row.character_name || "").replace(/ /g, "_"));
    const folderName = safeSlug(row.image || `${charName}_${row.skin_number}`);
    const seqRoot = path.join(PROJECT_ROOT, "assets", "characters", charName, folderName, "PNG", "PNG Sequences");
    const backupRoot = path.join(BACKUP_DIR, `${charName}_${row.skin_number}`);

    if (!fs.existsSync(backupRoot)) {
      return { success: false, message: "Chưa có bản sao lưu gốc cho trang phục này" };
    }

    for (const sub of ["Idle", "Run Throwing", "Hurt"]) {
      const bkpSub = path.join(backupRoot, sub);
      if (fs.existsSync(bkpSub)) {
        const dstSub = path.join(seqRoot, sub);
        cleanFolder(dstSub);
        copyFolderFiles(bkpSub, dstSub);
      }
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
    return { success: true, message: `Đã khôi phục ảnh gốc cho ${charName} (Skin ${row.skin_number})` };
  },

  // ═══════════════════════════════════════════════════════════════
  //  3. ẢNH THẺ BÀI TAROT (Ghi trực tiếp vào Tarot_1 / Tarot_2 + resize)
  // ═══════════════════════════════════════════════════════════════
  async uploadTarotImage(tarotId, { image_data_url, level = 1, name, cooldown_seconds, description }) {
    const tid = Number(tarotId);
    const lv = Number(level) >= 2 ? 2 : 1;
    const [[existing]] = await db.query("SELECT * FROM tarots WHERE id = ? LIMIT 1", [tid]);
    if (!existing) return { success: false, message: "Không tìm thấy thẻ Tarot" };

    let iconPath = existing.icon || `assets/resources/Tarot/Tarot_1/thebai_${tid}.png`;
    if (image_data_url && String(image_data_url).startsWith("data:image/")) {
      const decoded = decodeDataUrlImage(image_data_url);
      if (!decoded) return { success: false, message: "Ảnh thẻ không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };

      const lvDir = path.join(PROJECT_ROOT, "assets", "resources", "Tarot", `Tarot_${lv}`);
      const resizeDir = path.join(lvDir, "resize");
      ensureDir(lvDir);
      ensureDir(resizeDir);

      const filename = `thebai_${tid}.png`;
      fs.writeFileSync(path.join(lvDir, filename), decoded.buffer);
      fs.writeFileSync(path.join(resizeDir, filename), decoded.buffer);
      if (lv === 1) {
        iconPath = `assets/resources/Tarot/Tarot_1/${filename}`;
      }
    }

    await db.query(
      `UPDATE tarots SET name = ?, cooldown_seconds = ?, description = ?, icon = ? WHERE id = ?`,
      [
        name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
        cooldown_seconds !== undefined ? Number(cooldown_seconds) || 0 : existing.cooldown_seconds,
        description !== undefined ? String(description).trim() : existing.description,
        iconPath,
        tid,
      ]
    );

    return { success: true, message: `Đã cập nhật thẻ Tarot #${tid} (Cấp ${lv})`, icon: iconPath };
  },

  // ═══════════════════════════════════════════════════════════════
  //  4. PHÔNG NỀN (BACKGROUNDS)
  // ═══════════════════════════════════════════════════════════════
  async listBackgrounds() {
    const [rows] = await db.query("SELECT * FROM backgrounds ORDER BY id ASC");
    const v = Date.now();
    return rows.map(r => {
      const raw = String(r.image_path || "");
      const url = raw.startsWith("assets/") || raw.startsWith("/assets/")
        ? (raw.startsWith("/") ? raw : `/${raw}`)
        : (raw ? `/assets/ui/bg/${raw}` : "");
      return {
        id: Number(r.id),
        name: r.name || `Background #${r.id}`,
        price_ecoin: Number(r.price_ecoin ?? r.price ?? 0),
        image_path: raw,
        preview_url: url ? `${url}?v=${v}` : "",
      };
    });
  },

  async saveBackground(bgId, { name, price_ecoin, image_data_url }) {
    let savedRelPath = null;
    if (image_data_url && String(image_data_url).startsWith("data:image/")) {
      const decoded = decodeDataUrlImage(image_data_url);
      if (!decoded) return { success: false, message: "Ảnh phông nền không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
      const bgDir = path.join(PROJECT_ROOT, "assets", "ui", "bg");
      ensureDir(bgDir);
      const filename = `custom_bg_${bgId || "new"}_${Date.now()}.${decoded.ext}`;
      fs.writeFileSync(path.join(bgDir, filename), decoded.buffer);
      savedRelPath = `assets/ui/bg/${filename}`;
    }

    if (bgId) {
      const [[existing]] = await db.query("SELECT * FROM backgrounds WHERE id = ? LIMIT 1", [Number(bgId)]);
      if (!existing) return { success: false, message: "Không tìm thấy phông nền" };
      await db.query(
        "UPDATE backgrounds SET name = ?, price_ecoin = ?, image_path = ? WHERE id = ?",
        [
          name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
          price_ecoin !== undefined ? Math.max(0, Number(price_ecoin) || 0) : Number(existing.price_ecoin || 0),
          savedRelPath || existing.image_path,
          Number(bgId),
        ]
      );
      return { success: true, message: `Đã cập nhật phông nền #${bgId}` };
    }

    if (!name?.trim() || !savedRelPath) {
      return { success: false, message: "Vui lòng nhập tên và chọn ảnh cho phông nền mới" };
    }
    const [res] = await db.query(
      "INSERT INTO backgrounds (name, image_path, price_ecoin) VALUES (?, ?, ?)",
      [name.trim(), savedRelPath, Math.max(0, Number(price_ecoin) || 0)]
    );
    return { success: true, id: res.insertId, message: `Đã thêm phông nền mới #${res.insertId}` };
  },
};

export default assetUploadService;
