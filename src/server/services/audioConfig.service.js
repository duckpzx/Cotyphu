import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "assets", "music");
const CUSTOM_AUDIO_DIR = path.join(MUSIC_DIR, "custom");

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // 12MB

/**
 * Danh mục toàn bộ 19 file âm thanh & nhạc nền đang sử dụng trong game:
 *  - bgm    (2): Nhạc nền Sảnh Chờ, Nhạc nền Trong Trận Đấu
 *  - shared (5): Click, Chuyển Tab, Đóng/Thoát, Mua Shop, Trang bị/Dùng
 *  - board (12): Khai cuộc, Tung xúc xắc, Bước chân nhân vật, Nhận tiền/thuế,
 *                Mua đất/xây nhà, Nâng cấp, Quiz đúng, Lỗi/Sai, Thẻ Tarot,
 *                Kỹ năng nhân vật, Thợ Săn (Hunter), Thầy Giáo (Teacher)
 */
export const AUDIO_TRACKS = [
  // ── NHẠC NỀN (BGM) ─────────────────────────────────────────────
  { id: "lobby_bgm",      category: "bgm",    label: "Nhạc nền Sảnh Chờ",        desc: "Phát lặp lại ở màn hình đăng nhập, Sảnh Chờ, Cửa Hàng, Tủ Đồ", default_url: "assets/music/lobby/lobbyscene.mp3", default_volume: 0.56 },
  { id: "board_bgm",      category: "bgm",    label: "Nhạc nền Trong Trận Đấu",  desc: "Phát lặp lại trong suốt ván chơi Cờ Tỷ Phú",                    default_url: "assets/music/board/game.mp3",       default_volume: 0.44 },

  // ── ÂM THANH GIAO DIỆN DÙNG CHUNG (SHARED SFX) ────────────────
  { id: "click_sfx",      category: "shared", label: "Click nút chung",          desc: "Phát mỗi khi người chơi chạm/click vào giao diện",              default_url: "assets/music/shared/click.mp3",     default_volume: 0.90 },
  { id: "click2_sfx",     category: "shared", label: "Chuyển Tab",               desc: "Phát khi chuyển tab Cửa Hàng, Tủ Đồ, Bạn Bè",                   default_url: "assets/music/shared/click2.mp3",    default_volume: 1.00 },
  { id: "out_sfx",        category: "shared", label: "Đóng / Quay lại",          desc: "Phát khi bấm nút quay lại hoặc đóng hộp thoại",                 default_url: "assets/music/shared/out.mp3",       default_volume: 1.00 },
  { id: "buy_sfx",        category: "shared", label: "Mua vật phẩm (Shop)",      desc: "Phát khi mua thành công trang phục, avatar, vật phẩm",          default_url: "assets/music/shared/buy.mp3",       default_volume: 1.00 },
  { id: "use_sfx",        category: "shared", label: "Trang bị / Sử dụng",       desc: "Phát khi trang bị skin hoặc sử dụng vật phẩm trong Tủ Đồ",      default_url: "assets/music/shared/use.mp3",       default_volume: 1.00 },

  // ── ÂM THANH TRONG TRẬN ĐẤU (BOARD SFX) ───────────────────────
  { id: "board_start",    category: "board",  label: "Bắt đầu ván đấu",          desc: "Hiệu ứng âm thanh khai cuộc khi vào bàn cờ",                    default_url: "assets/music/board/start.mp3",      default_volume: 1.00 },
  { id: "board_dice",     category: "board",  label: "Tung xúc xắc",             desc: "Âm thanh lắc và thả xúc xắc mỗi lượt",                          default_url: "assets/music/board/dice2.mp3",      default_volume: 1.00 },
  { id: "board_footstep", category: "board",  label: "Bước chân nhân vật",       desc: "Phát lặp khi nhân vật di chuyển từng ô trên bàn cờ",            default_url: "assets/music/board/footstep3.mp3",  default_volume: 1.00 },
  { id: "board_coin",     category: "board",  label: "Nhận tiền / Thu tiền thuê", desc: "Hiệu ứng xu vang lên khi nhận tiền hoặc thu thuế",             default_url: "assets/music/board/coin2.mp3",      default_volume: 1.00 },
  { id: "board_buy",      category: "board",  label: "Mua đất / Xây công trình", desc: "Phát khi mua ô đất hoặc xây nhà trên bàn cờ",                   default_url: "assets/music/board/buy_1.mp3",      default_volume: 1.00 },
  { id: "board_increase", category: "board",  label: "Nâng cấp / Tăng giá trị",  desc: "Phát khi nâng cấp nhà hoặc tăng sức mạnh",                      default_url: "assets/music/board/increase.mp3",   default_volume: 1.00 },
  { id: "board_answer",   category: "board",  label: "Trả lời Quiz đúng",        desc: "Phát khi trả lời chính xác câu hỏi trắc nghiệm",                default_url: "assets/music/board/answer.mp3",     default_volume: 1.00 },
  { id: "board_err",      category: "board",  label: "Lỗi / Trả lời sai",        desc: "Phát khi trả lời sai, hết tiền hoặc thao tác không hợp lệ",     default_url: "assets/music/board/err.mp3",        default_volume: 1.00 },
  { id: "board_tarot",    category: "board",  label: "Rút / Dùng thẻ Tarot",     desc: "Hiệu ứng huyền bí khi mở hoặc kích hoạt thẻ Tarot",             default_url: "assets/music/board/tarot.mp3",      default_volume: 1.00 },
  { id: "board_skill",    category: "board",  label: "Tiếng kỹ năng nhân vật",   desc: "Phát khi nhân vật kích hoạt kỹ năng đặc biệt",                  default_url: "assets/music/board/skill.mp3",      default_volume: 1.00 },
  { id: "board_hunter",   category: "board",  label: "Tiếng Thợ Săn (Hunter)",   desc: "Âm thanh sự kiện Thợ Săn / chiến đấu NPC",                      default_url: "assets/music/board/hunter.mp3",     default_volume: 1.00 },
  { id: "board_teacher",  category: "board",  label: "Tiếng Thầy Giáo (Teacher)", desc: "Âm thanh sự kiện gặp Thầy Giáo / Quiz đặc biệt",               default_url: "assets/music/board/teacher.mp3",    default_volume: 1.00 },
];

const MIME_TO_EXT = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function decodeDataUrlAudio(dataUrl, fallbackName = "") {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase().trim();
  let ext = MIME_TO_EXT[mime];
  if (!ext && fallbackName) {
    const fnExt = path.extname(fallbackName).replace(".", "").toLowerCase();
    if (["mp3", "wav", "ogg", "m4a", "webm"].includes(fnExt)) ext = fnExt;
  }
  if (!ext) return null;
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) return null;
  return { buffer, ext, mime, size: buffer.length };
}

function safeUnlinkCustom(relUrl) {
  if (!relUrl || !String(relUrl).startsWith("assets/music/custom/")) return;
  const abs = path.join(PROJECT_ROOT, relUrl);
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch {}
  }
}

let _audioCache = null;
let _audioCacheAt = 0;

const audioConfigService = {
  /**
   * Tạo bảng MySQL `audio_settings` và tự động seed đủ 19 âm thanh gốc của game.
   */
  async ensureAudioSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS audio_settings (
          track_id VARCHAR(48) NOT NULL PRIMARY KEY,
          category VARCHAR(24) NOT NULL,
          label VARCHAR(120) NOT NULL,
          description VARCHAR(255) NULL,
          default_url VARCHAR(255) NOT NULL,
          custom_url VARCHAR(255) NULL DEFAULT NULL,
          custom_name VARCHAR(160) NULL DEFAULT NULL,
          volume DECIMAL(4,2) NOT NULL DEFAULT 1.00,
          enabled TINYINT(1) NOT NULL DEFAULT 1,
          version BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_audio_cat (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      for (const t of AUDIO_TRACKS) {
        await db.query(
          `INSERT IGNORE INTO audio_settings
            (track_id, category, label, description, default_url, volume, enabled, version)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
          [t.id, t.category, t.label, t.desc, t.default_url, t.default_volume]
        );
      }

      logger.ok("AUDIO", `Verified table: audio_settings (${AUDIO_TRACKS.length} tracks)`);
    } catch (err) {
      logger.err("AUDIO", "ensureAudioSchema failed", err);
    }
  },

  invalidateCache() {
    _audioCache = null;
    _audioCacheAt = 0;
  },

  /**
   * Lấy toàn bộ danh sách âm thanh từ MySQL `audio_settings` (cache 5s cho client game).
   */
  async listTracks({ bypassCache = false } = {}) {
    const now = Date.now();
    if (!bypassCache && _audioCache && now - _audioCacheAt < 5000) {
      return _audioCache;
    }

    let dbMap = {};
    try {
      const [rows] = await db.query("SELECT * FROM audio_settings");
      for (const r of rows || []) dbMap[r.track_id] = r;
    } catch {
      // Fallback sang danh sách mặc định nếu bảng chưa tạo
    }

    const tracks = AUDIO_TRACKS.map((t) => {
      const r = dbMap[t.id] || {};
      const activeUrl = r.custom_url || t.default_url;
      const absPath = path.join(PROJECT_ROOT, activeUrl);
      let fileSize = 0;
      try {
        if (fs.existsSync(absPath)) fileSize = fs.statSync(absPath).size;
      } catch {}
      const volume = r.volume !== undefined && r.volume !== null
        ? Math.max(0, Math.min(1, Number(r.volume)))
        : t.default_volume;
      const enabled = r.enabled !== undefined && r.enabled !== null ? Boolean(Number(r.enabled)) : true;
      return {
        ...t,
        active_url: activeUrl,
        is_custom: Boolean(r.custom_url),
        custom_name: r.custom_name || null,
        volume,
        enabled,
        file_size: fileSize,
        version: Number(r.version || 1),
        updated_at: r.updated_at || null,
      };
    });

    const result = { success: true, tracks };
    _audioCache = result;
    _audioCacheAt = now;
    return result;
  },

  /**
   * Cập nhật file âm thanh mới hoặc âm lượng / bật-tắt vào bảng `audio_settings`.
   */
  async updateTrack(trackId, { data_url, file_name, volume, enabled } = {}) {
    const def = AUDIO_TRACKS.find((t) => t.id === String(trackId));
    if (!def) return { success: false, message: "Không tìm thấy mã âm thanh!" };

    const [rows] = await db.query("SELECT * FROM audio_settings WHERE track_id = ? LIMIT 1", [def.id]);
    const cur = rows[0] || {};

    let customUrl = cur.custom_url || null;
    let customName = cur.custom_name || null;

    if (data_url) {
      const dec = decodeDataUrlAudio(data_url, file_name);
      if (!dec) {
        return { success: false, message: "File âm thanh không hợp lệ (chỉ hỗ trợ MP3, WAV, OGG, M4A ≤ 12MB)!" };
      }
      ensureDir(CUSTOM_AUDIO_DIR);
      safeUnlinkCustom(customUrl);
      const outName = `${def.id}_${Date.now()}.${dec.ext}`;
      fs.writeFileSync(path.join(CUSTOM_AUDIO_DIR, outName), dec.buffer);
      customUrl = `assets/music/custom/${outName}`;
      customName = String(file_name || outName).slice(0, 150);
    }

    const nextVol = volume !== undefined && volume !== null && !Number.isNaN(Number(volume))
      ? Math.max(0, Math.min(1, Number(volume)))
      : (cur.volume !== undefined && cur.volume !== null ? Number(cur.volume) : def.default_volume);
    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (cur.enabled !== undefined ? Number(cur.enabled) : 1);
    const nextVersion = Date.now();

    await db.query(
      `INSERT INTO audio_settings
         (track_id, category, label, description, default_url, custom_url, custom_name, volume, enabled, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         custom_url = VALUES(custom_url),
         custom_name = VALUES(custom_name),
         volume = VALUES(volume),
         enabled = VALUES(enabled),
         version = VALUES(version)`,
      [def.id, def.category, def.label, def.desc, def.default_url, customUrl, customName, nextVol, nextEnabled, nextVersion]
    );

    this.invalidateCache();
    const list = await this.listTracks({ bypassCache: true });
    return {
      success: true,
      message: data_url
        ? `Đã thay file âm thanh "${def.label}" và lưu vào Database!`
        : `Đã cập nhật cấu hình "${def.label}"!`,
      track: list.tracks.find((t) => t.id === def.id),
    };
  },

  /**
   * Khôi phục 1 track về file mặc định gốc trong MySQL `audio_settings`.
   */
  async resetTrack(trackId) {
    const def = AUDIO_TRACKS.find((t) => t.id === String(trackId));
    if (!def) return { success: false, message: "Không tìm thấy mã âm thanh!" };

    const [rows] = await db.query("SELECT custom_url FROM audio_settings WHERE track_id = ? LIMIT 1", [def.id]);
    if (rows[0]?.custom_url) {
      safeUnlinkCustom(rows[0].custom_url);
    }

    await db.query(
      `UPDATE audio_settings
       SET custom_url = NULL, custom_name = NULL, volume = ?, enabled = 1, version = ?
       WHERE track_id = ?`,
      [def.default_volume, Date.now(), def.id]
    );

    this.invalidateCache();
    const list = await this.listTracks({ bypassCache: true });
    return {
      success: true,
      message: `Đã khôi phục "${def.label}" về âm thanh mặc định!`,
      track: list.tracks.find((t) => t.id === def.id),
    };
  },
};

export default audioConfigService;
