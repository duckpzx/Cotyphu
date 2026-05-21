// ═══════════════════════════════════════════════════════════════════
//  config.js — Cấu hình URL server tập trung
//  Tự động dùng hostname của trình duyệt → hoạt động cả localhost
// ═══════════════════════════════════════════════════════════════════

const SERVER_PORT = 3000;
const SERVER_HOST = window.location.hostname;

export const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
// export const SERVER_URL = `https://objectives-indoor-biological-worked.trycloudflare.com`;


// cloudflared tunnel --url http://localhost:3000