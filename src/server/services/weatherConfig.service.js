import db from "../config/db.js";
import logger from "../utils/logger.js";

const VALID_MODES = new Set(["none", "snow", "peach", "both"]);

let _cache = null;
let _cacheAt = 0;

const weatherConfigService = {
  async ensureWeatherSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS weather_settings (
          id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
          mode VARCHAR(16) NOT NULL DEFAULT 'snow',
          density INT NOT NULL DEFAULT 72,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await db.query(
        `INSERT IGNORE INTO weather_settings (id, mode, density) VALUES (1, 'snow', 72)`
      );
      logger.ok("WEATHER", "Verified table: weather_settings");
    } catch (err) {
      logger.err("WEATHER", "ensureWeatherSchema failed", err);
    }
  },

  invalidateCache() {
    _cache = null;
    _cacheAt = 0;
  },

  async getConfig({ bypassCache = false } = {}) {
    const now = Date.now();
    if (!bypassCache && _cache && now - _cacheAt < 5000) {
      return _cache;
    }
    let row = null;
    try {
      const [rows] = await db.query("SELECT mode, density, updated_at FROM weather_settings WHERE id = 1 LIMIT 1");
      row = rows[0] || null;
    } catch {}

    const mode = VALID_MODES.has(row?.mode) ? row.mode : "snow";
    const density = Math.max(25, Math.min(115, Number(row?.density || 72)));
    const result = {
      success: true,
      mode,
      density,
      updated_at: row?.updated_at || null,
    };
    _cache = result;
    _cacheAt = now;
    return result;
  },

  async saveConfig({ mode, density } = {}, { io } = {}) {
    const cleanMode = VALID_MODES.has(String(mode)) ? String(mode) : "snow";
    const cleanDensity = Math.max(25, Math.min(115, Math.round(Number(density || 72))));

    await db.query(
      `INSERT INTO weather_settings (id, mode, density)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), density = VALUES(density)`,
      [cleanMode, cleanDensity]
    );

    this.invalidateCache();
    const cfg = await this.getConfig({ bypassCache: true });

    // Phát real-time tới tất cả người chơi đang mở game
    if (io) {
      io.emit("weather:updated", { mode: cfg.mode, density: cfg.density });
    }
    return cfg;
  },
};

export default weatherConfigService;
