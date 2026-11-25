import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const CUSTOM_NPC_DIR = path.join(PROJECT_ROOT, "assets", "custom_npcs");
const CUSTOM_MAP_DIR = path.join(PROJECT_ROOT, "assets", "custom_maps");
const CUSTOM_LOBBY_DIR = path.join(PROJECT_ROOT, "assets", "custom_lobby");
const CUSTOM_SCENE_DIR = path.join(PROJECT_ROOT, "assets", "custom_scenes");
const BACKUP_DIR = path.join(PROJECT_ROOT, "assets", "_studio_backups");
const CONFIG_PATH = path.join(CUSTOM_NPC_DIR, "npc_config.json");
const MAP_CONFIG_PATH = path.join(CUSTOM_MAP_DIR, "map_config.json");
const LOBBY_CONFIG_PATH = path.join(CUSTOM_LOBBY_DIR, "lobby_config.json");
const SCENE_CONFIG_PATH = path.join(CUSTOM_SCENE_DIR, "scene_config.json");

const SCENE_DEFAULTS = {
  rating: {
    label: "Bảng Vàng Xếp Hạng",
    default_name: "BXH Mặc Định",
    default_image: "/assets/nen_23.png",
    default_spots: [
      { id: 1, x: 0.5000, y: 0.6053, label: "Hạng 1 (Quán Quân)" },
      { id: 2, x: 0.2411, y: 0.6478, label: "Hạng 2 (Trái)" },
      { id: 3, x: 0.7589, y: 0.6635, label: "Hạng 3 (Phải)" },
    ],
  },
  lab: {
    label: "Phòng Nghiên Cứu",
    default_name: "Nghiên Cứu Mặc Định",
    default_image: "/assets/nen_2.png",
    default_spots: [
      { id: 1, x: 0.1430, y: 0.5970, label: "Spot 1", flipX: false },
      { id: 2, x: 0.2000, y: 0.4390, label: "Spot 2", flipX: false },
      { id: 3, x: 0.4880, y: 0.4530, label: "Spot 3 (Phù Thủy)", flipX: false },
      { id: 4, x: 0.6570, y: 0.4030, label: "Spot 4", flipX: true },
      { id: 5, x: 0.8480, y: 0.5160, label: "Spot 5", flipX: true },
      { id: 6, x: 0.7130, y: 0.6060, label: "Spot 6", flipX: true },
    ],
  },
};

export const DEFAULT_BOARD_PATH = [
  { index:0,  x:0.24,  y:0.59,  hw:0.022, hh:0.018, name:"START",   type:"skill" },
  { index:1,  x:0.304, y:0.62,  hw:0.027, hh:0.0266,name:"Cell 1",  type:"land"  },
  { index:2,  x:0.355, y:0.63,  hw:0.0199,hh:0.0149,name:"Cell 2",  type:"land"  },
  { index:3,  x:0.402, y:0.61,  hw:0.0115,hh:0.007, name:"Cell 3",  type:"land"  },
  { index:4,  x:0.447, y:0.597, hw:0.023, hh:0.0196,name:"Cell 4",  type:"land"  },
  { index:5,  x:0.487, y:0.626, hw:0.0248,hh:0.0266,name:"Cell 5",  type:"land"  },
  { index:6,  x:0.52,  y:0.662, hw:0.0256,hh:0.0297,name:"Cell 6",  type:"land"  },
  { index:7,  x:0.566, y:0.69,  hw:0.0256,hh:0.0235,name:"Cell 7",  type:"land"  },
  { index:8,  x:0.621, y:0.695, hw:0.0212,hh:0.0133,name:"Cell 8",  type:"land"  },
  { index:9,  x:0.68,  y:0.665, hw:0.022, hh:0.018, name:"Cell 9",  type:"skill" },
  { index:10, x:0.732, y:0.634, hw:0.022, hh:0.018, name:"Cell 10", type:"land"  },
  { index:11, x:0.767, y:0.592, hw:0.020, hh:0.017, name:"Cell 11", type:"land"  },
  { index:12, x:0.8,   y:0.557, hw:0.020, hh:0.017, name:"Cell 12", type:"land"  },
  { index:13, x:0.834, y:0.518, hw:0.018, hh:0.016, name:"Cell 13", type:"land"  },
  { index:14, x:0.86,  y:0.47,  hw:0.0102,hh:0.018, name:"Cell 14", type:"land"  },
  { index:15, x:0.847, y:0.415, hw:0.0225,hh:0.025, name:"Cell 15", type:"land"  },
  { index:16, x:0.809, y:0.39,  hw:0.0212,hh:0.0157,name:"Cell 16", type:"land"  },
  { index:17, x:0.765, y:0.409, hw:0.0225,hh:0.0227,name:"Cell 17", type:"land"  },
  { index:18, x:0.72,  y:0.425, hw:0.022, hh:0.018, name:"Cell 18", type:"skill" },
  { index:19, x:0.67,  y:0.43,  hw:0.0212,hh:0.0196,name:"Cell 19", type:"land"  },
  { index:20, x:0.635, y:0.405, hw:0.0217,hh:0.0227,name:"Cell 20", type:"land"  },
  { index:21, x:0.607, y:0.372, hw:0.0212,hh:0.0282,name:"Cell 21", type:"land"  },
  { index:22, x:0.594, y:0.325, hw:0.019, hh:0.025, name:"Cell 22", type:"land"  },
  { index:23, x:0.583, y:0.277, hw:0.0111,hh:0.0149,name:"Cell 23", type:"land"  },
  { index:24, x:0.574, y:0.230, hw:0.0181,hh:0.0235,name:"Cell 24", type:"land"  },
  { index:25, x:0.541, y:0.198, hw:0.0212,hh:0.0211,name:"Cell 25", type:"land"  },
  { index:26, x:0.501, y:0.189, hw:0.019, hh:0.0125,name:"Cell 26", type:"land"  },
  { index:27, x:0.46,  y:0.198, hw:0.0119,hh:0.0078,name:"Cell 27", type:"land"  },
  { index:28, x:0.416, y:0.212, hw:0.022, hh:0.018, name:"Cell 28", type:"skill" },
  { index:29, x:0.374, y:0.234, hw:0.018, hh:0.015, name:"Cell 29", type:"land"  },
  { index:30, x:0.335, y:0.261, hw:0.0248,hh:0.0235,name:"Cell 30", type:"land"  },
  { index:31, x:0.304, y:0.294, hw:0.018, hh:0.016, name:"Cell 31", type:"land"  },
  { index:32, x:0.289, y:0.343, hw:0.0199,hh:0.0235,name:"Cell 32", type:"land"  },
  { index:33, x:0.32,  y:0.382, hw:0.0239,hh:0.0219,name:"Cell 33", type:"land"  },
  { index:34, x:0.336, y:0.431, hw:0.0141,hh:0.0164,name:"Cell 34", type:"land"  },
  { index:35, x:0.314, y:0.476, hw:0.0261,hh:0.0227,name:"Cell 35", type:"land"  },
  { index:36, x:0.274, y:0.52,  hw:0.0261,hh:0.0258,name:"Cell 36", type:"land"  },
];

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
  treasure: {
    slot: "treasure",
    label: "Rương Kho Báu (Ô Cơ Hội)",
    default_name: "Rương Kho Báu",
    default_fps: 10,
    default_scale: 1,
    animations: ["idle"],
    default_idle_dir: null,
    default_attack_dir: null,
    default_single_file: "/assets/characters/Fantasy_Treasure/PNG/without background/47.png",
  },
};

const ORB_ITEMS = [
  { key: "orb_red",     color: "red",    color_label: "Tinh cầu Đỏ",         level: 1, rel_path: "assets/resources/Orb/iloveimg-resized/orb_red.png" },
  { key: "orb_red2",    color: "red",    color_label: "Tinh cầu Đỏ",         level: 2, rel_path: "assets/resources/Orb/orb_red2.png" },
  { key: "orb_blue",    color: "blue",   color_label: "Tinh cầu Xanh dương", level: 1, rel_path: "assets/resources/Orb/iloveimg-resized/orb_blue.png" },
  { key: "orb_blue2",   color: "blue",   color_label: "Tinh cầu Xanh dương", level: 2, rel_path: "assets/resources/Orb/orb_blue2.png" },
  { key: "orb_purple",  color: "purple", color_label: "Tinh cầu Tím",        level: 1, rel_path: "assets/resources/Orb/iloveimg-resized/orb_purple.png" },
  { key: "orb_purple2", color: "purple", color_label: "Tinh cầu Tím",        level: 2, rel_path: "assets/resources/Orb/orb_purple2.png" },
  { key: "orb_orange",  color: "orange", color_label: "Tinh cầu Cam",        level: 1, rel_path: "assets/resources/Orb/iloveimg-resized/orb_orange.png" },
  { key: "orb_orange2", color: "orange", color_label: "Tinh cầu Cam",        level: 2, rel_path: "assets/resources/Orb/orb_orange2.png" },
];

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
      const defaultIdle = meta.default_idle_dir
        ? listFolderImageUrls(meta.default_idle_dir)
        : (meta.default_single_file ? [meta.default_single_file] : []);
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

  // ═══════════════════════════════════════════════════════════════
  //  5. TINH CẦU (ORBS LV.1 & LV.2)
  // ═══════════════════════════════════════════════════════════════
  listOrbs() {
    const v = Date.now();
    const orbBackupDir = path.join(BACKUP_DIR, "orbs");
    return ORB_ITEMS.map(item => ({
      ...item,
      preview_url: `/${item.rel_path}?v=${v}`,
      has_backup: fs.existsSync(path.join(orbBackupDir, `${item.key}.png`)),
    }));
  },

  uploadOrbImage(orbKey, { image_data_url }) {
    const item = ORB_ITEMS.find(o => o.key === String(orbKey));
    if (!item) return { success: false, message: "Mã tinh cầu không hợp lệ" };
    const decoded = decodeDataUrlImage(image_data_url);
    if (!decoded) return { success: false, message: "Ảnh tinh cầu không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };

    const dstPath = path.join(PROJECT_ROOT, item.rel_path);
    const orbBackupDir = path.join(BACKUP_DIR, "orbs");
    const bkpPath = path.join(orbBackupDir, `${item.key}.png`);
    ensureDir(path.dirname(dstPath));
    if (fs.existsSync(dstPath) && !fs.existsSync(bkpPath)) {
      ensureDir(orbBackupDir);
      fs.copyFileSync(dstPath, bkpPath);
    }

    fs.writeFileSync(dstPath, decoded.buffer);
    return {
      success: true,
      message: `Đã cập nhật ảnh ${item.color_label} (Lv.${item.level}) vào ${item.rel_path}`,
    };
  },

  resetOrbImage(orbKey) {
    const item = ORB_ITEMS.find(o => o.key === String(orbKey));
    if (!item) return { success: false, message: "Mã tinh cầu không hợp lệ" };
    const dstPath = path.join(PROJECT_ROOT, item.rel_path);
    const bkpPath = path.join(BACKUP_DIR, "orbs", `${item.key}.png`);
    if (!fs.existsSync(bkpPath)) {
      return { success: false, message: "Tinh cầu này chưa có bản sao lưu gốc" };
    }
    fs.copyFileSync(bkpPath, dstPath);
    fs.unlinkSync(bkpPath);
    return {
      success: true,
      message: `Đã khôi phục ảnh gốc cho ${item.color_label} (Lv.${item.level})`,
    };
  },

  // ═══════════════════════════════════════════════════════════════
  //  6. BẢN ĐỒ GAME THEO MÙA (SEASONAL MAPS + 37 CELL COORDINATES)
  // ═══════════════════════════════════════════════════════════════
  _readMapConfig() {
    try {
      if (fs.existsSync(MAP_CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(MAP_CONFIG_PATH, "utf-8"));
        return {
          active_map_id: parsed.active_map_id || "default",
          maps: Array.isArray(parsed.maps) ? parsed.maps : [],
        };
      }
    } catch (err) {
      console.warn("_readMapConfig error:", err.message);
    }
    return { active_map_id: "default", maps: [] };
  },

  _writeMapConfig(cfg) {
    ensureDir(CUSTOM_MAP_DIR);
    fs.writeFileSync(MAP_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  },

  _normalizeBoardPath(rawPath) {
    if (!Array.isArray(rawPath) || rawPath.length !== DEFAULT_BOARD_PATH.length) {
      return DEFAULT_BOARD_PATH.map(c => ({ ...c }));
    }
    return DEFAULT_BOARD_PATH.map((def, idx) => {
      const inp = rawPath[idx] || {};
      const x = Math.min(0.98, Math.max(0.02, Number(inp.x)));
      const y = Math.min(0.98, Math.max(0.02, Number(inp.y)));
      return {
        ...def,
        x: Number.isFinite(x) ? Number(x.toFixed(4)) : def.x,
        y: Number.isFinite(y) ? Number(y.toFixed(4)) : def.y,
      };
    });
  },

  getActiveMapConfig() {
    const cfg = this._readMapConfig();
    if (cfg.active_map_id && cfg.active_map_id !== "default") {
      const found = cfg.maps.find(m => m.id === cfg.active_map_id);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          is_custom: true,
          image_url: found.image_url,
          version: found.version || 0,
          board_path: this._normalizeBoardPath(found.board_path),
        };
      }
    }
    return {
      id: "default",
      name: "Bản đồ Mặc định",
      is_custom: false,
      image_url: "/assets/nen_trochoi.jpg",
      version: 0,
      board_path: DEFAULT_BOARD_PATH.map(c => ({ ...c })),
    };
  },

  listMaps() {
    const cfg = this._readMapConfig();
    const defaultEntry = {
      id: "default",
      name: "Bản đồ Mặc định",
      is_custom: false,
      image_url: "/assets/nen_trochoi.jpg",
      version: 0,
      board_path: DEFAULT_BOARD_PATH.map(c => ({ ...c })),
    };
    return {
      active_map_id: cfg.active_map_id || "default",
      default_board_path: DEFAULT_BOARD_PATH,
      maps: [defaultEntry, ...cfg.maps],
    };
  },

  saveCustomMap({ id = null, name, image_data_url = null, board_path = null, activate = true }) {
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) {
      return { success: false, message: "Vui lòng nhập tên bản đồ (vd: Giáng Sinh 2026, Tết...)" };
    }

    const cfg = this._readMapConfig();
    const existingIdx = id && id !== "default" ? cfg.maps.findIndex(m => m.id === String(id)) : -1;
    const mapId = existingIdx >= 0 ? cfg.maps[existingIdx].id : `map_${Date.now()}`;
    let imageUrl = existingIdx >= 0 ? cfg.maps[existingIdx].image_url : null;

    if (image_data_url && String(image_data_url).startsWith("data:image/")) {
      const decoded = decodeDataUrlImage(image_data_url);
      if (!decoded) {
        return { success: false, message: "Ảnh bản đồ không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
      }
      ensureDir(CUSTOM_MAP_DIR);
      const filename = `${mapId}.${decoded.ext}`;
      fs.writeFileSync(path.join(CUSTOM_MAP_DIR, filename), decoded.buffer);
      imageUrl = `/assets/custom_maps/${filename}`;
    }

    if (!imageUrl) {
      return { success: false, message: "Vui lòng chọn ảnh bản đồ trước khi lưu!" };
    }

    const normalizedPath = this._normalizeBoardPath(board_path);
    const version = Date.now();
    const entry = {
      id: mapId,
      name: cleanName,
      is_custom: true,
      image_url: imageUrl,
      version,
      board_path: normalizedPath,
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) cfg.maps[existingIdx] = entry;
    else cfg.maps.unshift(entry);

    if (activate) cfg.active_map_id = mapId;
    this._writeMapConfig(cfg);

    return {
      success: true,
      message: activate
        ? `Đã lưu & áp dụng bản đồ "${cleanName}" vào game!`
        : `Đã lưu bản đồ "${cleanName}" vào kho!`,
      map: entry,
      active_map_id: cfg.active_map_id,
    };
  },

  activateMap(mapId) {
    const cfg = this._readMapConfig();
    if (mapId === "default") {
      cfg.active_map_id = "default";
      this._writeMapConfig(cfg);
      return { success: true, message: "Đã khôi phục Bản đồ Mặc định cho game!" };
    }
    const found = cfg.maps.find(m => m.id === String(mapId));
    if (!found) return { success: false, message: "Không tìm thấy bản đồ" };
    cfg.active_map_id = found.id;
    this._writeMapConfig(cfg);
    return { success: true, message: `Đã áp dụng bản đồ "${found.name}" vào game!` };
  },

  deleteCustomMap(mapId) {
    if (!mapId || mapId === "default") {
      return { success: false, message: "Không thể xóa bản đồ mặc định" };
    }
    const cfg = this._readMapConfig();
    const idx = cfg.maps.findIndex(m => m.id === String(mapId));
    if (idx === -1) return { success: false, message: "Không tìm thấy bản đồ" };

    const [removed] = cfg.maps.splice(idx, 1);
    if (cfg.active_map_id === removed.id) cfg.active_map_id = "default";
    this._writeMapConfig(cfg);

    if (removed.image_url?.startsWith("/assets/custom_maps/")) {
      const abs = path.join(PROJECT_ROOT, removed.image_url.slice(1));
      if (fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch (_) {}
      }
    }
    return { success: true, message: `Đã xóa bản đồ "${removed.name}"` };
  },

  // ═══════════════════════════════════════════════════════════════
  //  7. SẢNH CHỜ NGÀY / ĐÊM (LOBBY DAY/NIGHT PRESETS + 24H CYCLE)
  // ═══════════════════════════════════════════════════════════════
  _defaultLobbyIslands() {
    return [
      { key: "play", label: "ĐẤU TRƯỜNG TRÍ TUỆ", x: 0.50, y: 0.5393 },
      { key: "shop", label: "CỬA HÀNG", x: 0.31, y: 0.23 },
      { key: "rank", label: "XẾP HẠNG", x: 0.12, y: 0.42 },
      { key: "lab",  label: "NGHIÊN CỨU", x: 0.84, y: 0.44 },
    ];
  },

  _normalizeLobbyIslands(rawIslands) {
    const defs = this._defaultLobbyIslands();
    if (!Array.isArray(rawIslands) || rawIslands.length === 0) {
      return defs.map(d => ({ ...d }));
    }
    return defs.map(def => {
      const inp = rawIslands.find(item => item && item.key === def.key);
      if (!inp) return { ...def };
      const nx = Math.min(0.96, Math.max(0.04, Number(inp.x)));
      const ny = Math.min(0.96, Math.max(0.04, Number(inp.y)));
      return {
        ...def,
        x: Number.isFinite(nx) ? Number(nx.toFixed(4)) : def.x,
        y: Number.isFinite(ny) ? Number(ny.toFixed(4)) : def.y,
      };
    });
  },

  _readLobbyConfig() {
    try {
      if (fs.existsSync(LOBBY_CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(LOBBY_CONFIG_PATH, "utf-8"));
        return {
          active_lobby_id: parsed.active_lobby_id || "default",
          time_mode: parsed.time_mode === "fixed" ? "fixed" : "auto",
          fixed_hour: Number.isFinite(Number(parsed.fixed_hour)) ? Number(parsed.fixed_hour) : 12,
          default_islands: Array.isArray(parsed.default_islands) ? parsed.default_islands : null,
          default_override: parsed.default_override && typeof parsed.default_override === "object" ? parsed.default_override : null,
          presets: Array.isArray(parsed.presets) ? parsed.presets : [],
        };
      }
    } catch (err) {
      console.warn("_readLobbyConfig error:", err.message);
    }
    return { active_lobby_id: "default", time_mode: "auto", fixed_hour: 12, default_islands: null, default_override: null, presets: [] };
  },

  _writeLobbyConfig(cfg) {
    ensureDir(CUSTOM_LOBBY_DIR);
    fs.writeFileSync(LOBBY_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  },

  getActiveLobbyConfig() {
    const cfg = this._readLobbyConfig();
    if (cfg.active_lobby_id && cfg.active_lobby_id !== "default") {
      const found = cfg.presets.find(p => p.id === cfg.active_lobby_id);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          is_custom: true,
          day_url: found.day_url,
          night_url: found.night_url,
          version: found.version || 0,
          time_mode: cfg.time_mode,
          fixed_hour: cfg.fixed_hour,
          islands: this._normalizeLobbyIslands(found.islands),
        };
      }
    }
    const ov = cfg.default_override;
    const hasOverrideImg = Boolean(ov?.day_url || ov?.night_url);
    return {
      id: "default",
      name: ov?.name || "Sảnh Mặc Định",
      is_custom: hasOverrideImg,
      has_override: Boolean(ov),
      day_url: ov?.day_url || "/assets/ui/lobby/background_light.png",
      night_url: ov?.night_url || "/assets/ui/lobby/background_dark.png",
      version: ov?.version || 0,
      time_mode: cfg.time_mode,
      fixed_hour: cfg.fixed_hour,
      islands: this._normalizeLobbyIslands(cfg.default_islands),
    };
  },

  listLobbyPresets() {
    const cfg = this._readLobbyConfig();
    const ov = cfg.default_override;
    const defaultEntry = {
      id: "default",
      name: ov?.name || "Sảnh Mặc Định",
      is_custom: false,
      has_override: Boolean(ov),
      day_url: ov?.day_url || "/assets/ui/lobby/background_light.png",
      night_url: ov?.night_url || "/assets/ui/lobby/background_dark.png",
      version: ov?.version || 0,
      islands: this._normalizeLobbyIslands(cfg.default_islands),
    };
    const presets = cfg.presets.map(p => ({
      ...p,
      islands: this._normalizeLobbyIslands(p.islands),
    }));
    return {
      active_lobby_id: cfg.active_lobby_id,
      time_mode: cfg.time_mode,
      fixed_hour: cfg.fixed_hour,
      default_islands: this._defaultLobbyIslands(),
      presets: [defaultEntry, ...presets],
    };
  },

  saveLobbyPreset({ id = null, name, day_data_url = null, night_data_url = null, islands = null, activate = true }) {
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) return { success: false, message: "Vui lòng nhập tên bộ sảnh chờ!" };

    const cfg = this._readLobbyConfig();

    // Cho phép sửa trực tiếp Sảnh Mặc Định (vẫn giữ nguyên ảnh gốc trên đĩa để khôi phục bất cứ lúc nào)
    if (String(id) === "default") {
      const prevOv = cfg.default_override || {};
      let dayUrl = prevOv.day_url || "/assets/ui/lobby/background_light.png";
      let nightUrl = prevOv.night_url || "/assets/ui/lobby/background_dark.png";

      if (day_data_url && String(day_data_url).startsWith("data:image/")) {
        const dec = decodeDataUrlImage(day_data_url);
        if (!dec) return { success: false, message: "Ảnh Ban Ngày không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
        ensureDir(CUSTOM_LOBBY_DIR);
        const fn = `default_override_day.${dec.ext}`;
        fs.writeFileSync(path.join(CUSTOM_LOBBY_DIR, fn), dec.buffer);
        dayUrl = `/assets/custom_lobby/${fn}`;
      }
      if (night_data_url && String(night_data_url).startsWith("data:image/")) {
        const dec = decodeDataUrlImage(night_data_url);
        if (!dec) return { success: false, message: "Ảnh Ban Đêm không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
        ensureDir(CUSTOM_LOBBY_DIR);
        const fn = `default_override_night.${dec.ext}`;
        fs.writeFileSync(path.join(CUSTOM_LOBBY_DIR, fn), dec.buffer);
        nightUrl = `/assets/custom_lobby/${fn}`;
      }

      const normalizedIslands = this._normalizeLobbyIslands(islands || cfg.default_islands);
      cfg.default_islands = normalizedIslands;
      cfg.default_override = {
        name: cleanName,
        day_url: dayUrl,
        night_url: nightUrl,
        version: Date.now(),
        updated_at: new Date().toISOString(),
      };
      if (activate) cfg.active_lobby_id = "default";
      this._writeLobbyConfig(cfg);
      return {
        success: true,
        message: `Đã cập nhật "${cleanName}" (có thể bấm Khôi phục gốc bất cứ lúc nào)!`,
        preset: {
          id: "default",
          name: cleanName,
          is_custom: false,
          has_override: true,
          day_url: dayUrl,
          night_url: nightUrl,
          islands: normalizedIslands,
          version: cfg.default_override.version,
        },
        active_lobby_id: cfg.active_lobby_id,
      };
    }

    const existingIdx = id && id !== "default" ? cfg.presets.findIndex(p => p.id === String(id)) : -1;
    const presetId = existingIdx >= 0 ? cfg.presets[existingIdx].id : `lobby_${Date.now()}`;
    let dayUrl = existingIdx >= 0 ? cfg.presets[existingIdx].day_url : null;
    let nightUrl = existingIdx >= 0 ? cfg.presets[existingIdx].night_url : null;

    if (day_data_url && String(day_data_url).startsWith("data:image/")) {
      const dec = decodeDataUrlImage(day_data_url);
      if (!dec) return { success: false, message: "Ảnh Ban Ngày không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
      ensureDir(CUSTOM_LOBBY_DIR);
      const fn = `${presetId}_day.${dec.ext}`;
      fs.writeFileSync(path.join(CUSTOM_LOBBY_DIR, fn), dec.buffer);
      dayUrl = `/assets/custom_lobby/${fn}`;
    }

    if (night_data_url && String(night_data_url).startsWith("data:image/")) {
      const dec = decodeDataUrlImage(night_data_url);
      if (!dec) return { success: false, message: "Ảnh Ban Đêm không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
      ensureDir(CUSTOM_LOBBY_DIR);
      const fn = `${presetId}_night.${dec.ext}`;
      fs.writeFileSync(path.join(CUSTOM_LOBBY_DIR, fn), dec.buffer);
      nightUrl = `/assets/custom_lobby/${fn}`;
    }

    if (!dayUrl || !nightUrl) {
      return { success: false, message: "Vui lòng chọn đủ cả 2 ảnh: Ban Ngày và Ban Đêm!" };
    }

    const normalizedIslands = this._normalizeLobbyIslands(
      islands || (existingIdx >= 0 ? cfg.presets[existingIdx].islands : null)
    );

    const entry = {
      id: presetId,
      name: cleanName,
      is_custom: true,
      day_url: dayUrl,
      night_url: nightUrl,
      islands: normalizedIslands,
      version: Date.now(),
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) cfg.presets[existingIdx] = entry;
    else cfg.presets.unshift(entry);
    if (activate) cfg.active_lobby_id = presetId;
    this._writeLobbyConfig(cfg);

    return {
      success: true,
      message: existingIdx >= 0
        ? `Đã cập nhật bộ sảnh "${cleanName}"!`
        : (activate ? `Đã thêm & áp dụng sảnh "${cleanName}" (Ngày + Đêm)!` : `Đã lưu sảnh "${cleanName}" vào kho!`),
      preset: entry,
      active_lobby_id: cfg.active_lobby_id,
    };
  },

  resetDefaultLobby() {
    const cfg = this._readLobbyConfig();
    const ov = cfg.default_override;
    if (ov) {
      for (const u of [ov.day_url, ov.night_url]) {
        if (u?.startsWith("/assets/custom_lobby/default_override_")) {
          const abs = path.join(PROJECT_ROOT, u.slice(1));
          if (fs.existsSync(abs)) {
            try { fs.unlinkSync(abs); } catch (_) {}
          }
        }
      }
    }
    cfg.default_override = null;
    cfg.default_islands = null;
    this._writeLobbyConfig(cfg);
    return { success: true, message: "Đã khôi phục Sảnh Mặc Định về ảnh & vị trí gốc!" };
  },

  updateLobbyIslands(presetId, islands) {
    const cfg = this._readLobbyConfig();
    const normalized = this._normalizeLobbyIslands(islands);
    if (!presetId || presetId === "default") {
      cfg.default_islands = normalized;
      this._writeLobbyConfig(cfg);
      return {
        success: true,
        message: "Đã lưu vị trí 4 khu vực (Đấu Trường, Cửa Hàng, Xếp Hạng, Nghiên Cứu) cho Sảnh Mặc Định!",
        islands: normalized,
      };
    }
    const found = cfg.presets.find(p => p.id === String(presetId));
    if (!found) return { success: false, message: "Không tìm thấy bộ sảnh" };
    found.islands = normalized;
    found.updated_at = new Date().toISOString();
    this._writeLobbyConfig(cfg);
    return {
      success: true,
      message: `Đã lưu vị trí 4 khu vực cho sảnh "${found.name}"!`,
      islands: normalized,
    };
  },

  activateLobbyPreset(presetId) {
    const cfg = this._readLobbyConfig();
    if (presetId === "default") {
      cfg.active_lobby_id = "default";
      this._writeLobbyConfig(cfg);
      return { success: true, message: "Đã khôi phục Sảnh Mặc Định!" };
    }
    const found = cfg.presets.find(p => p.id === String(presetId));
    if (!found) return { success: false, message: "Không tìm thấy bộ sảnh" };
    cfg.active_lobby_id = found.id;
    this._writeLobbyConfig(cfg);
    return { success: true, message: `Đã áp dụng sảnh "${found.name}"!` };
  },

  setLobbyTimeMode({ time_mode = "auto", fixed_hour = 12 }) {
    const cfg = this._readLobbyConfig();
    cfg.time_mode = time_mode === "fixed" ? "fixed" : "auto";
    cfg.fixed_hour = Math.min(23.99, Math.max(0, Number(fixed_hour) || 12));
    this._writeLobbyConfig(cfg);
    return {
      success: true,
      message: cfg.time_mode === "auto"
        ? "Đã bật chế độ chuyển cảnh tự động 24 giờ theo giờ thực!"
        : `Đã cố định khung giờ sảnh tại ${String(Math.floor(cfg.fixed_hour)).padStart(2, "0")}:${String(Math.round((cfg.fixed_hour % 1) * 60)).padStart(2, "0")} để demo!`,
      time_mode: cfg.time_mode,
      fixed_hour: cfg.fixed_hour,
    };
  },

  deleteLobbyPreset(presetId) {
    if (!presetId || presetId === "default") {
      return { success: false, message: "Không thể xóa sảnh mặc định" };
    }
    const cfg = this._readLobbyConfig();
    const idx = cfg.presets.findIndex(p => p.id === String(presetId));
    if (idx === -1) return { success: false, message: "Không tìm thấy bộ sảnh" };
    const [removed] = cfg.presets.splice(idx, 1);
    if (cfg.active_lobby_id === removed.id) cfg.active_lobby_id = "default";
    this._writeLobbyConfig(cfg);

    for (const u of [removed.day_url, removed.night_url]) {
      if (u?.startsWith("/assets/custom_lobby/")) {
        const abs = path.join(PROJECT_ROOT, u.slice(1));
        if (fs.existsSync(abs)) {
          try { fs.unlinkSync(abs); } catch (_) {}
        }
      }
    }
    return { success: true, message: `Đã xóa bộ sảnh "${removed.name}"` };
  },

  // ═══════════════════════════════════════════════════════════════
  //  8. BẢNG XẾP HẠNG (RATING) & PHÒNG NGHIÊN CỨU (LAB) VISUAL EDITOR
  // ═══════════════════════════════════════════════════════════════
  _readSceneConfig() {
    try {
      if (fs.existsSync(SCENE_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(SCENE_CONFIG_PATH, "utf-8"));
      }
    } catch (err) {
      console.warn("_readSceneConfig error:", err.message);
    }
    return {};
  },

  _writeSceneConfig(cfg) {
    ensureDir(CUSTOM_SCENE_DIR);
    fs.writeFileSync(SCENE_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  },

  _normalizeSceneSpots(sceneType, rawSpots) {
    const def = SCENE_DEFAULTS[sceneType];
    if (!def) return [];
    if (!Array.isArray(rawSpots) || rawSpots.length !== def.default_spots.length) {
      return def.default_spots.map(s => ({ ...s }));
    }
    return def.default_spots.map((d, i) => {
      const inp = rawSpots[i] || {};
      const x = Math.min(0.98, Math.max(0.02, Number(inp.x)));
      const y = Math.min(0.98, Math.max(0.02, Number(inp.y)));
      return {
        ...d,
        x: Number.isFinite(x) ? Number(x.toFixed(4)) : d.x,
        y: Number.isFinite(y) ? Number(y.toFixed(4)) : d.y,
      };
    });
  },

  getActiveSceneConfig(sceneType) {
    const def = SCENE_DEFAULTS[sceneType];
    if (!def) return null;
    const all = this._readSceneConfig();
    const bucket = all[sceneType] || { active_id: "default", presets: [] };
    if (bucket.active_id && bucket.active_id !== "default") {
      const found = (bucket.presets || []).find(p => p.id === bucket.active_id);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          is_custom: true,
          image_url: found.image_url,
          version: found.version || 0,
          spots: this._normalizeSceneSpots(sceneType, found.spots),
        };
      }
    }
    return {
      id: "default",
      name: def.default_name,
      is_custom: false,
      image_url: def.default_image,
      version: 0,
      spots: def.default_spots.map(s => ({ ...s })),
    };
  },

  listScenePresets(sceneType) {
    const def = SCENE_DEFAULTS[sceneType];
    if (!def) return { success: false, message: "Loại scene không hợp lệ" };
    const all = this._readSceneConfig();
    const bucket = all[sceneType] || { active_id: "default", presets: [] };
    const defaultEntry = {
      id: "default",
      name: def.default_name,
      is_custom: false,
      image_url: def.default_image,
      version: 0,
      spots: def.default_spots.map(s => ({ ...s })),
    };
    return {
      success: true,
      scene_type: sceneType,
      label: def.label,
      active_id: bucket.active_id || "default",
      default_spots: def.default_spots,
      presets: [defaultEntry, ...(bucket.presets || [])],
    };
  },

  saveScenePreset(sceneType, { id = null, name, image_data_url = null, spots = null, activate = true }) {
    const def = SCENE_DEFAULTS[sceneType];
    if (!def) return { success: false, message: "Loại scene không hợp lệ" };
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) return { success: false, message: "Vui lòng nhập tên giao diện!" };

    const all = this._readSceneConfig();
    const bucket = all[sceneType] || { active_id: "default", presets: [] };
    const presets = Array.isArray(bucket.presets) ? bucket.presets : [];
    const existingIdx = id && id !== "default" ? presets.findIndex(p => p.id === String(id)) : -1;
    const presetId = existingIdx >= 0 ? presets[existingIdx].id : `${sceneType}_${Date.now()}`;
    let imageUrl = existingIdx >= 0 ? presets[existingIdx].image_url : null;

    if (image_data_url && String(image_data_url).startsWith("data:image/")) {
      const dec = decodeDataUrlImage(image_data_url);
      if (!dec) return { success: false, message: "Ảnh nền không hợp lệ (PNG/WebP/JPG ≤ 6MB)" };
      ensureDir(CUSTOM_SCENE_DIR);
      const fn = `${presetId}.${dec.ext}`;
      fs.writeFileSync(path.join(CUSTOM_SCENE_DIR, fn), dec.buffer);
      imageUrl = `/assets/custom_scenes/${fn}`;
    }

    if (!imageUrl) {
      return { success: false, message: "Vui lòng chọn ảnh nền mới trước khi lưu!" };
    }

    const entry = {
      id: presetId,
      name: cleanName,
      is_custom: true,
      image_url: imageUrl,
      version: Date.now(),
      spots: this._normalizeSceneSpots(sceneType, spots),
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) presets[existingIdx] = entry;
    else presets.unshift(entry);
    bucket.presets = presets;
    if (activate) bucket.active_id = presetId;
    all[sceneType] = bucket;
    this._writeSceneConfig(all);

    return {
      success: true,
      message: activate
        ? `Đã lưu & áp dụng nền "${cleanName}" cho ${def.label}!`
        : `Đã lưu "${cleanName}" vào kho!`,
      preset: entry,
      active_id: bucket.active_id,
    };
  },

  activateScenePreset(sceneType, presetId) {
    const def = SCENE_DEFAULTS[sceneType];
    if (!def) return { success: false, message: "Loại scene không hợp lệ" };
    const all = this._readSceneConfig();
    const bucket = all[sceneType] || { active_id: "default", presets: [] };
    if (presetId === "default") {
      bucket.active_id = "default";
      all[sceneType] = bucket;
      this._writeSceneConfig(all);
      return { success: true, message: `Đã khôi phục mặc định cho ${def.label}!` };
    }
    const found = (bucket.presets || []).find(p => p.id === String(presetId));
    if (!found) return { success: false, message: "Không tìm thấy preset" };
    bucket.active_id = found.id;
    all[sceneType] = bucket;
    this._writeSceneConfig(all);
    return { success: true, message: `Đã áp dụng "${found.name}" cho ${def.label}!` };
  },

  deleteScenePreset(sceneType, presetId) {
    if (!presetId || presetId === "default") return { success: false, message: "Không thể xóa preset mặc định" };
    const all = this._readSceneConfig();
    const bucket = all[sceneType];
    if (!bucket) return { success: false, message: "Không tìm thấy dữ liệu" };
    const idx = (bucket.presets || []).findIndex(p => p.id === String(presetId));
    if (idx === -1) return { success: false, message: "Không tìm thấy preset" };
    const [removed] = bucket.presets.splice(idx, 1);
    if (bucket.active_id === removed.id) bucket.active_id = "default";
    all[sceneType] = bucket;
    this._writeSceneConfig(all);
    if (removed.image_url?.startsWith("/assets/custom_scenes/")) {
      const abs = path.join(PROJECT_ROOT, removed.image_url.slice(1));
      if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch (_) {} }
    }
    return { success: true, message: `Đã xóa "${removed.name}"` };
  },
};

export default assetUploadService;
