/**
 * Production Structured Terminal Logger (ANSI, zero-emoji, SRE/NOC style)
 * Chuẩn hóa toàn bộ log hệ thống & định dạng lỗi gọn gàng (hỗ trợ AggregateError / MySQL2).
 */

const ANSI = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

const LEVEL_STYLE = {
  INFO: `${ANSI.blue}${ANSI.bold}INFO${ANSI.reset}`,
  OK:   `${ANSI.green}${ANSI.bold} OK ${ANSI.reset}`,
  WARN: `${ANSI.yellow}${ANSI.bold}WARN${ANSI.reset}`,
  ERR:  `${ANSI.red}${ANSI.bold} ERR${ANSI.reset}`,
};

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Trích xuất thông điệp lỗi rõ ràng, xử lý cả Node 22 AggregateError & MySQL2 errors.
 */
export function formatError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;

  const inner = Array.isArray(err.errors) && err.errors.length ? err.errors[0] : null;
  const code = err.code || inner?.code || "";
  const msg = (err.sqlMessage || err.message || inner?.message || "").trim();

  if (code === "ECONNREFUSED") {
    const host = err.address || inner?.address || "127.0.0.1";
    const port = err.port || inner?.port || 3306;
    return `ECONNREFUSED (${host}:${port}) — MySQL service is offline`;
  }
  if (code === "ER_ACCESS_DENIED_ERROR") {
    return `ER_ACCESS_DENIED_ERROR — invalid MySQL credentials`;
  }
  if (code === "ER_BAD_DB_ERROR") {
    return `ER_BAD_DB_ERROR — database does not exist (${msg})`;
  }
  if (code && msg && !msg.includes(code)) return `[${code}] ${msg}`;
  return msg || code || String(err);
}

/**
 * Loại bỏ các icon emoji rời rạc để log terminal & Admin Console luôn sạch sẽ.
 */
export function stripEmoji(str) {
  return String(str ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function writeLine(level, scope, message, meta = null) {
  const ts = `${ANSI.gray}${nowStamp()}${ANSI.reset}`;
  const lvl = LEVEL_STYLE[level] || LEVEL_STYLE.INFO;
  const mod = `${ANSI.cyan}[${String(scope || "SYS").toUpperCase().padEnd(8, " ").slice(0, 8)}]${ANSI.reset}`;
  const cleanMsg = stripEmoji(message);
  let tail = "";
  if (meta instanceof Error || (meta && typeof meta === "object" && (meta.code || meta.sqlMessage || Array.isArray(meta.errors)))) {
    tail = ` ${ANSI.dim}— ${formatError(meta)}${ANSI.reset}`;
  } else if (meta && typeof meta === "object") {
    const pairs = Object.entries(meta)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    if (pairs.length) tail = ` ${ANSI.gray}| ${pairs.join(" ")}${ANSI.reset}`;
  } else if (meta) {
    tail = ` ${ANSI.dim}— ${stripEmoji(meta)}${ANSI.reset}`;
  }

  const line = `${ts} ${lvl} ${mod} ${cleanMsg}${tail}`;
  if (level === "ERR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

const logger = {
  banner({ name = "COTYPHU SERVER", port = 3000, host = "0.0.0.0", env = process.env.NODE_ENV || "development" } = {}) {
    const bar = `${ANSI.gray}${"─".repeat(68)}${ANSI.reset}`;
    console.log("");
    console.log(bar);
    console.log(
      `  ${ANSI.bold}${ANSI.cyan}${name}${ANSI.reset}` +
      `  ${ANSI.gray}|${ANSI.reset}  HTTP + Socket.IO` +
      `  ${ANSI.gray}|${ANSI.reset}  ${ANSI.green}http://${host}:${port}${ANSI.reset}` +
      `  ${ANSI.gray}(${env})${ANSI.reset}`
    );
    console.log(bar);
  },
  info: (scope, msg, meta) => writeLine("INFO", scope, msg, meta),
  ok:   (scope, msg, meta) => writeLine("OK",   scope, msg, meta),
  warn: (scope, msg, meta) => writeLine("WARN", scope, msg, meta),
  err:  (scope, msg, meta) => writeLine("ERR",  scope, msg, meta),
  formatError,
  stripEmoji,
};

export default logger;
