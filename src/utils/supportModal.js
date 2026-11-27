/**
 * TRUNG TÂM HỖ TRỢ ĐA TẦNG (Tier 0 AI • Tier 1 Tự Chẩn Đoán • Tier 2 Ticket SLA & CSAT)
 * Thiết kế đồng bộ 100% phong cách game Cờ Tỷ Phú (giấy kem vàng, nút 3D bóng bẩy, mascot sp.png, thanh tiến trình 4 bước).
 */

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      hour12: false,
    });
  } catch {
    return String(d);
  }
}

function getAuthToken(scene = null) {
  if (scene?.player?.token) return scene.player.token;
  try {
    const reg = scene?.registry?.get?.("playerData");
    if (reg?.token) return reg.token;
  } catch {}
  try {
    const pd = JSON.parse(localStorage.getItem("playerData") || "null");
    if (pd?.token) return pd.token;
  } catch {}
  return localStorage.getItem("token") || localStorage.getItem("auth_token") || "";
}

function injectSupportStylesOnce() {
  const old = document.getElementById("support-modal-styles");
  if (old) old.remove();
  const style = document.createElement("style");
  style.id = "support-modal-styles";
  style.textContent = `
    #support-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 99998;
      background: rgba(10, 14, 24, 0.68);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Signika', 'Segoe UI', system-ui, sans-serif;
      padding: 14px;
      box-sizing: border-box;
      animation: supFadeIn 0.18s ease-out;
    }
    @keyframes supFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes supPopIn { from { transform: scale(0.92) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    .sup-panel {
      position: relative;
      width: 820px;
      max-width: 96vw;
      height: 600px;
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #fcf4dc 0%, #f5e6be 58%, #ebd397 100%);
      border: 4px solid #ffffff;
      border-radius: 24px;
      box-shadow: 0 22px 54px rgba(0, 0, 0, 0.56), 0 0 0 2.5px rgba(154, 106, 26, 0.5), inset 0 2px 0 rgba(255,255,255,0.85);
      padding: 34px 20px 16px;
      box-sizing: border-box;
      color: #4a2400;
      animation: supPopIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .sup-panel::before {
      content: "";
      position: absolute;
      inset: 8px;
      border: 2px dashed rgba(184, 142, 42, 0.55);
      border-radius: 17px;
      pointer-events: none;
    }

    /* Banner tiêu đề vàng kim 3D */
    .sup-header-pill {
      position: absolute;
      top: -25px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 280px;
      height: 48px;
      padding: 0 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      background: linear-gradient(180deg, #ffd966 0%, #e5a324 55%, #ba7810 100%);
      border: 3px solid #7d4a08;
      border-radius: 26px;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.32), inset 0 2px 1px rgba(255, 255, 255, 0.65);
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 0.6px;
      color: #4a2000;
      text-shadow: 0 1px 0 rgba(255, 248, 210, 0.85);
      user-select: none;
      white-space: nowrap;
    }
    .sup-header-pill img {
      width: 30px;
      height: 30px;
      object-fit: contain;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));
    }
    .sup-header-pill::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 16px;
      right: 16px;
      height: 14px;
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0));
      pointer-events: none;
    }

    .sup-close-btn {
      position: absolute;
      top: -16px;
      right: -16px;
      width: 44px;
      height: 44px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.14s ease;
      z-index: 5;
    }
    .sup-close-btn img { width: 44px; height: 44px; display: block; pointer-events: none; }
    .sup-close-btn:hover { transform: scale(1.1) rotate(6deg); }

    /* Thanh 3 Tab phong cách nút 3D Game */
    .sup-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 12px;
      position: relative;
      z-index: 2;
    }
    .sup-tab-btn {
      position: relative;
      border: 2px solid #c69a44;
      background: linear-gradient(180deg, #fffdf5 0%, #f5e5ba 100%);
      color: #5c3104;
      font-family: inherit;
      font-size: 14.5px;
      font-weight: 800;
      padding: 9px 10px;
      border-radius: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      transition: transform 0.12s ease, filter 0.12s ease;
      box-shadow: 0 3px 0 #b88c38, 0 4px 8px rgba(80, 48, 0, 0.14);
    }
    .sup-tab-btn:hover { transform: translateY(-1px); filter: brightness(1.03); }
    .sup-tab-btn:active { transform: translateY(1px); box-shadow: 0 1px 0 #b88c38; }
    .sup-tab-btn.active {
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 60%, #146bb3 100%);
      border-color: #0e4f87;
      color: #ffffff;
      text-shadow: 0 1.5px 2px rgba(0, 32, 70, 0.55);
      box-shadow: 0 3px 0 #0b4170, 0 5px 12px rgba(20, 107, 179, 0.38), inset 0 2px 1px rgba(255, 255, 255, 0.45);
    }
    .sup-tier-tag {
      font-size: 10px;
      font-weight: 900;
      padding: 2px 7px;
      border-radius: 99px;
      background: rgba(92, 49, 4, 0.11);
      letter-spacing: 0.3px;
    }
    .sup-tab-btn.active .sup-tier-tag {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }

    /* Khung nội dung gỗ sáng ấm */
    .sup-body {
      flex: 1;
      min-height: 0;
      position: relative;
      z-index: 2;
      background: linear-gradient(180deg, #fffdf6 0%, #faf1d9 100%);
      border: 2px solid #d4b162;
      border-radius: 16px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: inset 0 2px 8px rgba(130, 86, 18, 0.09);
    }

    /* Banner mascot chào mừng ở Tab AI */
    .sup-mascot-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(90deg, #fff6d6 0%, #ffefc0 100%);
      border: 1.5px solid #dec074;
      border-radius: 13px;
      padding: 7px 11px;
      margin-bottom: 9px;
      flex-shrink: 0;
    }
    .sup-mascot-bar img {
      width: 44px;
      height: 44px;
      object-fit: contain;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
    }

    .sup-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 9px;
      flex-shrink: 0;
    }
    .sup-chip {
      border: 1.5px solid #cfa346;
      background: linear-gradient(180deg, #ffffff 0%, #fff3cf 100%);
      color: #5a2e04;
      font-family: inherit;
      font-size: 12px;
      font-weight: 800;
      padding: 5px 11px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.13s;
      box-shadow: 0 2px 0 rgba(180, 130, 30, 0.25);
    }
    .sup-chip:hover {
      background: linear-gradient(180deg, #fff6d1 0%, #ffe08a 100%);
      border-color: #9e6a0e;
      transform: translateY(-1px);
    }

    /* Feed chat gọn sắc nét — flex-shrink:0 chống giãn bong bóng */
    .sup-chat-feed {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 6px 6px 2px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sup-chat-feed::-webkit-scrollbar { width: 7px; }
    .sup-chat-feed::-webkit-scrollbar-track { background: rgba(180,140,60,0.12); border-radius: 99px; }
    .sup-chat-feed::-webkit-scrollbar-thumb { background: #c9a152; border-radius: 99px; }

    .sup-msg-row {
      display: flex;
      align-items: flex-end;
      gap: 7px;
      flex-shrink: 0;
    }
    .sup-msg-row.user { justify-content: flex-end; }
    .sup-msg-row.system { justify-content: center; }

    .sup-avatar-mini {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #fff4cf;
      border: 1.5px solid #c99a3a;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      font-size: 15px;
    }
    .sup-avatar-mini img { width: 28px; height: 28px; object-fit: contain; }

    .sup-msg {
      max-width: 78%;
      padding: 8px 12px;
      border-radius: 15px;
      font-size: 13.5px;
      line-height: 1.45;
      word-break: break-word;
      flex-shrink: 0;
    }
    .sup-msg-text { white-space: pre-wrap; }
    .sup-msg.ai {
      background: #ffffff;
      border: 1.8px solid #dfc88f;
      border-bottom-left-radius: 4px;
      color: #3d1f02;
      box-shadow: 0 2px 6px rgba(90, 60, 10, 0.08);
    }
    .sup-msg.user {
      background: linear-gradient(180deg, #38abf5 0%, #1977c2 100%);
      color: #ffffff;
      border: 1.8px solid #125690;
      border-bottom-right-radius: 4px;
      box-shadow: 0 2px 6px rgba(25, 119, 194, 0.28);
    }
    .sup-msg.admin {
      background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
      border: 1.8px solid #48b86a;
      border-bottom-left-radius: 4px;
      color: #144d27;
      box-shadow: 0 2px 6px rgba(34, 150, 70, 0.12);
    }
    .sup-msg.system {
      max-width: 92%;
      background: #fff6d6;
      border: 1.5px dashed #cfa13a;
      color: #6b4306;
      font-size: 12px;
      text-align: center;
      padding: 7px 14px;
    }
    .sup-msg.receipt {
      max-width: 92%;
      background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%);
      border: 2px solid #22a055;
      color: #0f5132;
      font-size: 12.5px;
      font-weight: 700;
      text-align: center;
      padding: 8px 14px;
    }
    .sup-msg-meta {
      font-size: 10.5px;
      font-weight: 800;
      opacity: 0.72;
      margin-bottom: 2px;
    }

    /* Hiệu ứng đang nhập tin nhắn (...) */
    .sup-typing-dots {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 2px 2px;
    }
    .sup-typing-dots span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #c68a1e;
      display: inline-block;
      animation: supBounceDot 1.2s infinite ease-in-out;
    }
    .sup-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .sup-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes supBounceDot {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-5px); opacity: 1; }
    }

    /* Nút 3D Game chuẩn */
    .sup-btn {
      border: 2px solid #0f538c;
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 60%, #146bb3 100%);
      color: #fff;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 800;
      padding: 8px 16px;
      border-radius: 12px;
      cursor: pointer;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 3px 0 #0b4170, inset 0 1.5px 1px rgba(255,255,255,0.4);
      text-shadow: 0 1px 1px rgba(0,0,0,0.3);
      transition: transform 0.1s, filter 0.1s;
    }
    .sup-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
    .sup-btn:active { transform: translateY(1px); box-shadow: 0 1px 0 #0b4170; }
    .sup-btn:disabled { opacity: 0.58; cursor: not-allowed; }
    .sup-btn-gold {
      border-color: #8a5208;
      background: linear-gradient(180deg, #ffd65c 0%, #e59b1c 65%, #c77e0e 100%);
      color: #4a2000;
      text-shadow: 0 1px 0 rgba(255,248,200,0.7);
      box-shadow: 0 3px 0 #7a4706, inset 0 1.5px 1px rgba(255,255,255,0.55);
    }
    .sup-btn-green {
      border-color: #176635;
      background: linear-gradient(180deg, #52d681 0%, #27a356 65%, #1d8744 100%);
      color: #fff;
      box-shadow: 0 3px 0 #13542b, inset 0 1.5px 1px rgba(255,255,255,0.4);
    }
    .sup-btn-ghost {
      border: 1.8px solid #c99d44;
      background: linear-gradient(180deg, #fffdf4 0%, #f4e2b2 100%);
      color: #5c3104;
      text-shadow: none;
      box-shadow: 0 2px 0 #b58932;
    }

    .sup-escalate-btn {
      margin-top: 7px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1.8px solid #9e5608;
      background: linear-gradient(180deg, #ffce54 0%, #e58e15 100%);
      color: #4a1e00;
      font-family: inherit;
      font-size: 12px;
      font-weight: 800;
      padding: 5px 11px;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 2px 0 #8a4906;
    }
    .sup-escalate-btn:hover { filter: brightness(1.06); }

    .sup-input-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-shrink: 0;
    }
    .sup-input, .sup-select, .sup-textarea {
      font-family: inherit;
      font-size: 13.5px;
      color: #3c1f03;
      background: #ffffff;
      border: 2px solid #d1ae60;
      border-radius: 12px;
      padding: 8px 12px;
      outline: none;
      box-sizing: border-box;
    }
    .sup-input:focus, .sup-select:focus, .sup-textarea:focus {
      border-color: #1f82ce;
      box-shadow: 0 0 0 3px rgba(31, 130, 206, 0.18);
    }
    .sup-input-row .sup-input { flex: 1; }

    /* Stepper tiến trình Ticket 4 bước */
    .sup-stepper {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 9px;
      flex-shrink: 0;
    }
    .sup-step {
      text-align: center;
      font-size: 11px;
      font-weight: 800;
      padding: 5px 4px;
      border-radius: 9px;
      background: #f5e9c8;
      border: 1.5px solid #d6bc7c;
      color: #8c6a32;
    }
    .sup-step.done {
      background: #dcfce7;
      border-color: #48b86a;
      color: #166534;
    }
    .sup-step.current {
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 100%);
      border-color: #10558c;
      color: #fff;
    }

    /* Diagnostics */
    .sup-diag-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sup-diag-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: #ffffff;
      border: 1.8px solid #dfd0a6;
      border-radius: 13px;
      padding: 10px 13px;
      box-shadow: 0 2px 5px rgba(90, 60, 10, 0.05);
    }
    .sup-diag-card.ok { border-left: 6px solid #28a745; }
    .sup-diag-card.warn { border-left: 6px solid #e69d12; }
    .sup-diag-card.error { border-left: 6px solid #dc3545; }
    .sup-diag-title { font-size: 14px; font-weight: 800; color: #3d1f02; }
    .sup-diag-detail { font-size: 12.5px; color: #6b4820; margin-top: 2px; }
    .sup-badge {
      font-size: 11px;
      font-weight: 800;
      padding: 3px 9px;
      border-radius: 99px;
      white-space: nowrap;
    }
    .sup-badge.ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .sup-badge.warn { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .sup-badge.error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .sup-badge.high { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .sup-badge.medium { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .sup-badge.low { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }

    .sup-autofix-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1.8px dashed #d8bc78;
      flex-shrink: 0;
    }

    /* Tickets */
    .sup-ticket-split { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .sup-ticket-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
      flex-shrink: 0;
    }
    .sup-ticket-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .sup-ticket-item {
      background: #fff;
      border: 1.8px solid #dfd0a6;
      border-radius: 13px;
      padding: 10px 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: all 0.13s;
      box-shadow: 0 2px 4px rgba(90, 60, 10, 0.05);
    }
    .sup-ticket-item:hover { border-color: #1f82ce; background: #f4fbff; transform: translateY(-1px); }
    .sup-form { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; }
    .sup-form label { font-size: 12.5px; font-weight: 800; color: #5c3104; display: block; margin-bottom: 3px; }
    .sup-telemetry-pill {
      font-size: 11.5px;
      background: #fff6d9;
      border: 1.5px dashed #c89d38;
      border-radius: 10px;
      padding: 8px 11px;
      color: #6b4306;
    }
    .sup-csat-box {
      margin-top: 8px;
      background: linear-gradient(90deg, #fff8db 0%, #ffefc0 100%);
      border: 2px solid #d9a73a;
      border-radius: 12px;
      padding: 9px 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      flex-shrink: 0;
    }
    .sup-stars { display: flex; gap: 4px; }
    .sup-star-btn {
      border: none;
      background: transparent;
      font-size: 23px;
      cursor: pointer;
      transition: transform 0.12s;
      padding: 0 2px;
    }
    .sup-star-btn:hover { transform: scale(1.24); }
  `;
  document.head.appendChild(style);
}

export function openSupportModal(opts = {}) {
  injectSupportStylesOnce();

  const existing = document.getElementById("support-modal-overlay");
  if (existing) existing.remove();

  const scene = opts.scene || null;
  const token = opts.token || getAuthToken(scene);
  const onEcoinSync = typeof opts.onEcoinSync === "function" ? opts.onEcoinSync : null;

  const state = {
    activeTab: opts.initialTab || "ai",
    ticketView: "list",
    activeTicketId: null,
    prefillTicket: null,
    lastPingMs: null,
    aiMessages: [
      {
        role: "ai",
        meta: "Trợ lý AI • Tra cứu dữ liệu thật & Kho tri thức",
        text: "Xin chào! Mình là Trợ lý CSKH của Cờ Tỷ Phú.\nHãy bấm nhanh câu hỏi gợi ý hoặc gõ vấn đề bạn đang gặp (nạp tiền, Ecoin, bị cấm chat, Tinh cầu Lv2, thẻ Tarot...) để mình tra cứu ngay nhé!",
      },
    ],
  };

  async function apiSupport(path, fetchOpts = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOpts.headers || {}),
    };
    const res = await fetch(`/api/support${path}`, { ...fetchOpts, headers });
    return res.json().catch(() => ({ success: false, message: "Lỗi kết nối máy chủ" }));
  }

  const overlay = document.createElement("div");
  overlay.id = "support-modal-overlay";
  overlay.innerHTML = `
    <div class="sup-panel" role="dialog" aria-modal="true" aria-label="Trung tâm hỗ trợ">
      <div class="sup-header-pill">
        <img src="assets/ui/shared/sp.png" alt="" />
        <span>TRUNG TÂM HỖ TRỢ</span>
      </div>
      <button class="sup-close-btn" id="supCloseBtn" title="Đóng">
        <img src="assets/ui/shared/close.png" alt="Đóng" />
      </button>

      <div class="sup-tabs">
        <button class="sup-tab-btn active" data-tab="ai">
          <span>Trợ Lý AI</span><span class="sup-tier-tag">TIER 0</span>
        </button>
        <button class="sup-tab-btn" data-tab="diag">
          <span>Tự Chẩn Đoán</span><span class="sup-tier-tag">TIER 1</span>
        </button>
        <button class="sup-tab-btn" data-tab="tickets">
          <span>Phiếu Hỗ Trợ</span><span class="sup-tier-tag">TIER 2</span>
        </button>
      </div>

      <div class="sup-body" id="supBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const bodyEl = overlay.querySelector("#supBody");
  const closeBtn = overlay.querySelector("#supCloseBtn");

  const worldSock = scene?._worldSocket || null;
  const onAdminReply = (payload) => {
    if (payload?.new_ecoin !== undefined && onEcoinSync) {
      onEcoinSync(Number(payload.new_ecoin));
    }
    if (state.activeTab === "tickets" && state.ticketView === "detail" && Number(payload?.ticket_id) === Number(state.activeTicketId)) {
      renderTicketDetail(state.activeTicketId);
    }
  };
  const onTicketResolved = (payload) => {
    if (state.activeTab === "tickets" && state.ticketView === "detail" && Number(payload?.ticket_id) === Number(state.activeTicketId)) {
      renderTicketDetail(state.activeTicketId);
    }
  };
  if (worldSock) {
    worldSock.on("support:admin_reply", onAdminReply);
    worldSock.on("support:ticket_resolved", onTicketResolved);
  }

  const cleanup = () => {
    if (worldSock) {
      worldSock.off("support:admin_reply", onAdminReply);
      worldSock.off("support:ticket_resolved", onTicketResolved);
    }
    overlay.remove();
  };

  closeBtn.addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });

  function switchTab(tab) {
    state.activeTab = tab;
    overlay.querySelectorAll(".sup-tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    if (tab === "ai") renderAITab();
    else if (tab === "diag") renderDiagTab();
    else renderTicketsTab();
  }

  overlay.querySelectorAll(".sup-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  function escalateToTicket(prefill) {
    state.prefillTicket = prefill || null;
    state.ticketView = "create";
    switchTab("tickets");
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB 1: TIER 0 — TRỢ LÝ AI TRA CỨU MYSQL + KHO TRI THỨC
  // ═══════════════════════════════════════════════════════════════
  function renderAITab() {
    let isAsking = false;

    bodyEl.innerHTML = `
      <div class="sup-mascot-bar">
        <img src="assets/ui/shared/sp.png" alt="CSKH" />
        <div style="font-size:12.5px;line-height:1.35;">
          <b style="color:#4a2000;font-size:13.5px;">Trợ Lý Hỗ Trợ AI 24/7 — Cờ Tỷ Phú Online</b><br/>
          <span style="color:#784d18;">Chỉ hỗ trợ các câu hỏi về <b>game Cờ Tỷ Phú</b> (luật chơi, Tinh cầu, Tarot, nạp Ecoin, tài khoản &amp; báo lỗi).</span>
        </div>
      </div>
      <div class="sup-chat-feed" id="supAiFeed"></div>
      <form class="sup-input-row" id="supAiForm">
        <input class="sup-input" id="supAiInput" type="text" placeholder="Nhập câu hỏi về game Cờ Tỷ Phú (VD: Cách chơi, nạp tiền, nâng cấp Tarot)..." maxlength="280" autocomplete="off" />
        <button class="sup-btn" type="submit" id="supAiSend">Gửi</button>
      </form>
    `;

    const feedEl = bodyEl.querySelector("#supAiFeed");
    const inputEl = bodyEl.querySelector("#supAiInput");
    const sendBtn = bodyEl.querySelector("#supAiSend");

    const drawFeed = () => {
      const msgsHtml = state.aiMessages
        .map((m, idx) => {
          const actionBtn = m.action
            ? `<div style="margin-top:6px"><button class="sup-escalate-btn" data-act-idx="${idx}">${escHtml(m.action.label || "🎫 Gửi phiếu cho Admin")}</button></div>`
            : "";
          if (m.role === "user") {
            return `<div class="sup-msg-row user"><div class="sup-msg user"><div class="sup-msg-meta">${escHtml(m.meta || "Bạn")}</div><div class="sup-msg-text">${escHtml(m.text)}</div></div></div>`;
          }
          return `<div class="sup-msg-row ai"><div class="sup-avatar-mini"><img src="assets/ui/shared/sp.png" alt="AI" /></div><div class="sup-msg ai"><div class="sup-msg-meta">${escHtml(m.meta || "Trợ lý AI")}</div><div class="sup-msg-text">${escHtml(m.text)}</div>${actionBtn}</div></div>`;
        })
        .join("");

      const typingHtml = isAsking
        ? `<div class="sup-msg-row ai" id="supTypingBubble"><div class="sup-avatar-mini"><img src="assets/ui/shared/sp.png" alt="AI" /></div><div class="sup-msg ai"><div class="sup-msg-meta">Trợ lý AI đang nhập...</div><div class="sup-typing-dots"><span></span><span></span><span></span></div></div></div>`
        : "";

      feedEl.innerHTML = msgsHtml + typingHtml;
      feedEl.querySelectorAll(".sup-escalate-btn").forEach((b) => {
        b.addEventListener("click", () => {
          const act = state.aiMessages[Number(b.dataset.actIdx)]?.action;
          if (act) escalateToTicket(act);
        });
      });
      feedEl.scrollTop = feedEl.scrollHeight;
    };
    drawFeed();

    const ask = async (q) => {
      if (isAsking) return;
      const text = String(q || "").trim();
      if (!text) return;
      isAsking = true;
      state.aiMessages.push({ role: "user", meta: "Bạn", text });
      inputEl.value = "";
      inputEl.disabled = true;
      sendBtn.disabled = true;
      sendBtn.textContent = "Đang nhập...";
      drawFeed();

      try {
        const res = await apiSupport("/ai-ask", {
          method: "POST",
          body: JSON.stringify({ question: text }),
        });
        if (res?.success) {
          const engineTag =
            String(res.ai_engine || "").startsWith("gemini") ? `Trợ lý AI • ${res.ai_engine}`
            : res.ai_engine === "policy-guard" ? "Hệ thống Kiểm duyệt CSKH"
            : res.ai_engine === "admin-knowledge-base" ? "Trợ lý AI • Kho Tri Thức CSKH"
            : "Trợ lý AI • Tra cứu MySQL";
          state.aiMessages.push({
            role: "ai",
            meta: engineTag,
            text: res.reply,
            action: res.suggested_action || null,
          });
        } else {
          state.aiMessages.push({
            role: "ai",
            meta: "Trợ lý AI",
            text: res?.message || "Xin lỗi, mình chưa thể tra cứu lúc này. Bạn có thể tạo Phiếu Hỗ Trợ ở tab bên cạnh nhé!",
          });
        }
      } catch {
        state.aiMessages.push({ role: "ai", meta: "Hệ thống", text: "Mất kết nối tới máy chủ hỗ trợ." });
      } finally {
        isAsking = false;
        inputEl.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = "Gửi";
        drawFeed();
        inputEl.focus();
      }
    };

    bodyEl.querySelector("#supAiForm").addEventListener("submit", (e) => {
      e.preventDefault();
      ask(inputEl.value);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB 2: TIER 1 — TỰ CHẨN ĐOÁN & TỰ PHỤC HỒI 1-CLICK
  // ═══════════════════════════════════════════════════════════════
  async function renderDiagTab() {
    bodyEl.innerHTML = `<div style="padding:28px;text-align:center;font-weight:800;color:#6b4306;">🩺 Đang quét kết nối mạng, Socket.IO, số dư Ecoin và giao dịch nạp tiền...</div>`;

    let pingMs = -1;
    try {
      const t0 = performance.now();
      await fetch(`/api/weather-config?ping=${Date.now()}`, { cache: "no-store" });
      pingMs = Math.round(performance.now() - t0);
      state.lastPingMs = pingMs;
    } catch {}

    const sockConnected = Boolean(worldSock?.connected);
    const res = await apiSupport("/diagnostics");

    const clientChecks = [
      {
        title: "Độ trễ mạng (Ping HTTP)",
        status: pingMs < 0 ? "error" : pingMs > 220 ? "warn" : "ok",
        detail: pingMs < 0 ? "Không thể kết nối máy chủ" : `Ping thực tế: ${pingMs} ms (${pingMs <= 120 ? "Rất mượt" : "Ổn định"})`,
      },
      {
        title: "Kết nối thời gian thực (Socket.IO)",
        status: sockConnected ? "ok" : "warn",
        detail: sockConnected ? `Đang kết nối ổn định (ID: ${worldSock.id})` : "Socket Sảnh chưa kết nối hoặc đang chờ khởi tạo",
      },
    ];

    const serverChecks = res?.success ? res.checks || [] : [
      { title: "Xác thực tài khoản", status: "error", detail: res?.message || "Vui lòng đăng nhập lại để quét dữ liệu tài khoản" },
    ];
    const allChecks = [...clientChecks, ...serverChecks];

    bodyEl.innerHTML = `
      <div class="sup-diag-list">
        ${allChecks
          .map((c, idx) => `
            <div class="sup-diag-card ${c.status || "ok"}">
              <div>
                <div class="sup-diag-title">${escHtml(c.title)}</div>
                <div class="sup-diag-detail">${escHtml(c.detail)}</div>
                ${c.action ? `<button class="sup-escalate-btn" data-diag-act="${idx}">🎫 Gửi phiếu đối soát ngay</button>` : ""}
              </div>
              <span class="sup-badge ${c.status || "ok"}">${c.status === "error" ? "CẦN XỬ LÝ" : c.status === "warn" ? "CHÚ Ý" : "TỐT"}</span>
            </div>
          `)
          .join("")}
      </div>

      <div class="sup-autofix-bar">
        <button class="sup-btn sup-btn-green" id="supSyncEcoinBtn">
          <img src="assets/ui/shared/coin.png" alt="" style="width:18px;height:18px" /> Đồng bộ Ecoin từ Server
        </button>
        <button class="sup-btn sup-btn-gold" id="supUnstuckBtn">🛠️ Sửa kẹt phòng (Unstuck)</button>
        <button class="sup-btn sup-btn-ghost" id="supRescanBtn">🔍 Quét lại</button>
      </div>
      <div id="supDiagFeedback" style="font-size:12.5px;font-weight:800;color:#1b6d34;margin-top:6px;min-height:18px;"></div>
    `;

    const fb = bodyEl.querySelector("#supDiagFeedback");

    bodyEl.querySelectorAll("[data-diag-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = allChecks[Number(btn.dataset.diagAct)];
        if (c?.action) {
          escalateToTicket({
            category: c.action.category || "PAYMENT",
            subject: c.action.subject || "Yêu cầu đối soát",
            message: c.detail || "",
          });
        }
      });
    });

    bodyEl.querySelector("#supSyncEcoinBtn")?.addEventListener("click", async () => {
      fb.style.color = "#5c3104";
      fb.textContent = "Đang đồng bộ số dư Ecoin từ MySQL...";
      const r = await apiSupport("/diagnostics");
      if (r?.success) {
        const latestEcoin = Number(r.ecoin || 0);
        try {
          const pd = JSON.parse(localStorage.getItem("playerData") || "null");
          if (pd?.user) {
            pd.user.ecoin = latestEcoin;
            localStorage.setItem("playerData", JSON.stringify(pd));
          }
        } catch {}
        if (onEcoinSync) onEcoinSync(latestEcoin);
        fb.style.color = "#1b6d34";
        fb.textContent = `✅ Đã đồng bộ thành công! Số dư hiện tại: ${latestEcoin.toLocaleString("vi-VN")} Ecoin.`;
      } else {
        fb.style.color = "#a31b26";
        fb.textContent = `❌ ${r?.message || "Không thể đồng bộ Ecoin"}`;
      }
    });

    bodyEl.querySelector("#supUnstuckBtn")?.addEventListener("click", () => {
      try {
        localStorage.removeItem("activeGame");
        localStorage.removeItem("gameState");
        localStorage.removeItem("currentRoomId");
        sessionStorage.removeItem("activeGame");
      } catch {}
      fb.style.color = "#1b6d34";
      fb.textContent = "✅ Đã xóa phiên phòng bị kẹt (Unstuck) thành công! Bạn có thể vào phòng mới bình thường.";
    });

    bodyEl.querySelector("#supRescanBtn")?.addEventListener("click", () => renderDiagTab());
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB 3: TIER 2 — PHIẾU HỖ TRỢ THÔNG MINH + AUTO-TELEMETRY + CSAT
  // ═══════════════════════════════════════════════════════════════
  function collectClientTelemetry() {
    return {
      scene: scene?.scene?.key || "LobbyScene",
      ping_ms: state.lastPingMs,
      socket_connected: Boolean(worldSock?.connected),
      resolution: `${window.innerWidth}x${window.innerHeight}`,
      user_agent: navigator.userAgent.slice(0, 140),
      url: window.location.pathname + window.location.search,
      captured_at: new Date().toISOString(),
    };
  }

  async function renderTicketsTab() {
    if (state.ticketView === "create") return renderCreateTicketForm();
    if (state.ticketView === "detail" && state.activeTicketId) return renderTicketDetail(state.activeTicketId);

    bodyEl.innerHTML = `
      <div class="sup-ticket-split">
        <div class="sup-ticket-bar">
          <div style="font-size:14.5px;font-weight:900;">📋 Phiếu hỗ trợ của bạn</div>
          <button class="sup-btn sup-btn-gold" id="supNewTicketBtn">+ Tạo phiếu mới</button>
        </div>
        <div class="sup-ticket-list" id="supTicketList">
          <div style="padding:18px;text-align:center;">Đang tải danh sách phiếu...</div>
        </div>
      </div>
    `;

    bodyEl.querySelector("#supNewTicketBtn").addEventListener("click", () => {
      state.prefillTicket = null;
      state.ticketView = "create";
      renderCreateTicketForm();
    });

    const listEl = bodyEl.querySelector("#supTicketList");
    const res = await apiSupport("/tickets");
    if (!res?.success) {
      listEl.innerHTML = `<div style="padding:18px;text-align:center;color:#a31b26;font-weight:700;">${escHtml(res?.message || "Không tải được danh sách phiếu")}</div>`;
      return;
    }

    const tickets = res.tickets || [];
    if (!tickets.length) {
      listEl.innerHTML = `
        <div style="padding:28px;text-align:center;color:#7a5422;">
          <img src="assets/ui/shared/sp.png" alt="" style="width:62px;height:62px;margin-bottom:6px;opacity:0.9;" />
          <div style="font-weight:900;font-size:15px;">Bạn chưa có phiếu hỗ trợ nào</div>
          <div style="font-size:12.5px;margin-top:4px;">Bấm <b>"+ Tạo phiếu mới"</b> nếu cần gặp CSKH Admin (tự động đính kèm thông số chẩn đoán &amp; cam kết SLA).</div>
        </div>
      `;
      return;
    }

    const statusLabel = { OPEN: "MỚI TIẾP NHẬN", IN_PROGRESS: "ĐANG XỬ LÝ", RESOLVED: "ĐÃ GIẢI QUYẾT", CLOSED: "ĐÃ ĐÓNG" };
    const statusCls = { OPEN: "warn", IN_PROGRESS: "low", RESOLVED: "ok", CLOSED: "ok" };

    listEl.innerHTML = tickets
      .map((t) => `
        <div class="sup-ticket-item" data-tid="${t.id}">
          <div style="min-width:0;">
            <div style="font-weight:800;font-size:13.5px;color:#3d1f02;">
              <span style="color:#1c7bc4;">${escHtml(t.ticket_code)}</span> • ${escHtml(t.subject)}
            </div>
            <div style="font-size:11.5px;color:#7a5422;margin-top:2px;">
              Loại: <b>${escHtml(t.category)}</b> • SLA: ${t.sla_minutes} phút • ${fmtTime(t.created_at)}
              ${t.csat_rating ? ` • ${"⭐".repeat(t.csat_rating)}` : ""}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="sup-badge ${String(t.priority || "MEDIUM").toLowerCase()}">${escHtml(t.priority)}</span>
            <span class="sup-badge ${statusCls[t.status] || "warn"}">${statusLabel[t.status] || t.status}</span>
          </div>
        </div>
      `)
      .join("");

    listEl.querySelectorAll(".sup-ticket-item").forEach((row) => {
      row.addEventListener("click", () => {
        state.activeTicketId = Number(row.dataset.tid);
        state.ticketView = "detail";
        renderTicketDetail(state.activeTicketId);
      });
    });
  }

  function renderCreateTicketForm() {
    const pf = state.prefillTicket || {};
    const tel = collectClientTelemetry();

    bodyEl.innerHTML = `
      <div class="sup-ticket-bar">
        <div style="font-size:14.5px;font-weight:900;">✍️ Tạo Phiếu Hỗ Trợ Mới (Auto-Triage &amp; SLA)</div>
        <button class="sup-btn sup-btn-ghost" id="supBackListBtn">← Quay lại</button>
      </div>
      <form class="sup-form" id="supCreateForm">
        <div>
          <label>Phân loại vấn đề (tự động áp dụng cam kết SLA)</label>
          <select class="sup-select" id="supCat" style="width:100%;">
            <option value="PAYMENT" ${pf.category === "PAYMENT" ? "selected" : ""}>💰 Nạp tiền &amp; Giao dịch (Ưu tiên HIGH)</option>
            <option value="ACCOUNT" ${pf.category === "ACCOUNT" ? "selected" : ""}>🔐 Tài khoản / Ban / Mute (Ưu tiên HIGH)</option>
            <option value="BUG" ${pf.category === "BUG" ? "selected" : ""}>🐞 Lỗi kỹ thuật / Game (Ưu tiên MEDIUM)</option>
            <option value="REPORT" ${pf.category === "REPORT" ? "selected" : ""}>🚨 Tố cáo gian lận (Ưu tiên MEDIUM)</option>
            <option value="OTHER" ${!pf.category || pf.category === "OTHER" ? "selected" : ""}>💬 Góp ý &amp; Khác (Ưu tiên LOW)</option>
          </select>
        </div>
        <div>
          <label>Tiêu đề ngắn gọn</label>
          <input class="sup-input" id="supSub" style="width:100%;" maxlength="160" placeholder="VD: Chưa nhận được Ecoin đơn nạp 50K..." value="${escHtml(pf.subject || "")}" required />
        </div>
        <div>
          <label>Mô tả chi tiết</label>
          <textarea class="sup-textarea" id="supMsg" rows="4" style="width:100%;resize:vertical;" maxlength="1800" placeholder="Mô tả chi tiết vấn đề bạn gặp phải..." required>${escHtml(pf.message || "")}</textarea>
        </div>
        <div class="sup-telemetry-pill">
          📡 <b>Auto-Telemetry sẽ tự đính kèm:</b> Scene <code>${escHtml(tel.scene)}</code> • Màn hình <code>${escHtml(tel.resolution)}</code> • Socket <code>${tel.socket_connected ? "OK" : "OFF"}</code> • Số dư &amp; đơn nạp gần nhất.
        </div>
        <div id="supCreateErr" style="color:#a31b26;font-size:12.5px;font-weight:700;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="sup-btn sup-btn-gold" type="submit" id="supCreateSubmit">🚀 Gửi phiếu hỗ trợ</button>
        </div>
      </form>
    `;

    bodyEl.querySelector("#supBackListBtn").addEventListener("click", () => {
      state.ticketView = "list";
      renderTicketsTab();
    });

    bodyEl.querySelector("#supCreateForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = bodyEl.querySelector("#supCreateSubmit");
      const errEl = bodyEl.querySelector("#supCreateErr");
      errEl.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang gửi...";

      const res = await apiSupport("/tickets", {
        method: "POST",
        body: JSON.stringify({
          category: bodyEl.querySelector("#supCat").value,
          subject: bodyEl.querySelector("#supSub").value.trim(),
          message: bodyEl.querySelector("#supMsg").value.trim(),
          telemetry: collectClientTelemetry(),
        }),
      });

      if (res?.success && res.ticket?.id) {
        state.prefillTicket = null;
        state.activeTicketId = res.ticket.id;
        state.ticketView = "detail";
        renderTicketDetail(res.ticket.id);
      } else {
        errEl.textContent = res?.message || "Không thể gửi phiếu hỗ trợ!";
        submitBtn.disabled = false;
        submitBtn.textContent = "🚀 Gửi phiếu hỗ trợ";
      }
    });
  }

  async function renderTicketDetail(ticketId) {
    bodyEl.innerHTML = `<div style="padding:20px;text-align:center;">Đang tải chi tiết phiếu...</div>`;
    const res = await apiSupport(`/tickets/${ticketId}`);
    if (!res?.success || !res.ticket) {
      state.ticketView = "list";
      return renderTicketsTab();
    }
    const t = res.ticket;
    const msgs = res.messages || [];

    const stepIdx = t.status === "OPEN" ? 0 : t.status === "IN_PROGRESS" ? 1 : t.status === "RESOLVED" ? 2 : 3;
    const stepCls = (i) => (i < stepIdx ? "done" : i === stepIdx ? "current" : "");

    const canRate = t.status === "RESOLVED" && !t.csat_rating;
    const isClosed = t.status === "CLOSED";

    bodyEl.innerHTML = `
      <div class="sup-ticket-bar">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <span style="color:#1c7bc4;">${escHtml(t.ticket_code)}</span> — ${escHtml(t.subject)}
          </div>
          <div style="font-size:11.5px;color:#7a5422;">
            Ưu tiên: <b>${escHtml(t.priority)}</b> • SLA: ${t.sla_minutes} phút
            ${t.csat_rating ? ` • Đánh giá: ${"⭐".repeat(t.csat_rating)}` : ""}
          </div>
        </div>
        <button class="sup-btn sup-btn-ghost" id="supDetailBack">← Danh sách</button>
      </div>

      <div class="sup-stepper">
        <div class="sup-step ${stepCls(0)}">1. Tiếp nhận</div>
        <div class="sup-step ${stepCls(1)}">2. CSKH Xử lý</div>
        <div class="sup-step ${stepCls(2)}">3. Đã giải quyết</div>
        <div class="sup-step ${stepCls(3)}">4. Đánh giá ⭐</div>
      </div>

      <div class="sup-chat-feed" id="supTicketFeed">
        ${msgs
          .map((m) => {
            if (m.sender_role === "USER") {
              return `<div class="sup-msg-row user"><div class="sup-msg user"><div class="sup-msg-meta">${escHtml(m.sender_name || "Bạn")} • ${fmtTime(m.created_at)}</div><div class="sup-msg-text">${escHtml(m.message)}</div></div></div>`;
            }
            if (m.sender_role === "ADMIN") {
              return `<div class="sup-msg-row admin"><div class="sup-avatar-mini"><img src="assets/ui/shared/sp.png" alt="CSKH" /></div><div class="sup-msg admin"><div class="sup-msg-meta">${escHtml(m.sender_name || "CSKH Admin")} • ${fmtTime(m.created_at)}</div><div class="sup-msg-text">${escHtml(m.message)}</div></div></div>`;
            }
            const isReceipt = String(m.message || "").includes("[BIÊN LAI CSKH]");
            return `<div class="sup-msg-row system"><div class="sup-msg ${isReceipt ? "receipt" : "system"}"><div class="sup-msg-meta">${escHtml(m.sender_name || "Hệ thống")} • ${fmtTime(m.created_at)}</div><div class="sup-msg-text">${escHtml(m.message)}</div></div></div>`;
          })
          .join("")}
      </div>

      ${canRate ? `
        <div class="sup-csat-box" id="supCsatBox">
          <div style="font-size:13px;font-weight:800;color:#5c3104;">⭐ Bạn hài lòng với chất lượng hỗ trợ này chứ?</div>
          <div class="sup-stars">
            ${[1, 2, 3, 4, 5].map((s) => `<button class="sup-star-btn" data-star="${s}" title="${s} sao">⭐</button>`).join("")}
          </div>
        </div>
      ` : ""}

      ${!isClosed ? `
        <form class="sup-input-row" id="supReplyForm">
          <input class="sup-input" id="supReplyInput" type="text" placeholder="Nhập phản hồi thêm cho CSKH..." maxlength="1500" autocomplete="off" />
          <button class="sup-btn" type="submit" id="supReplySend">Gửi</button>
        </form>
      ` : `<div style="text-align:center;font-size:12px;color:#166534;margin-top:8px;font-weight:800;">✓ Phiếu đã hoàn tất &amp; đóng. Cảm ơn bạn đã đánh giá!</div>`}
    `;

    const feed = bodyEl.querySelector("#supTicketFeed");
    feed.scrollTop = feed.scrollHeight;

    bodyEl.querySelector("#supDetailBack").addEventListener("click", () => {
      state.ticketView = "list";
      state.activeTicketId = null;
      renderTicketsTab();
    });

    bodyEl.querySelectorAll(".sup-star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const star = Number(btn.dataset.star);
        const r = await apiSupport(`/tickets/${t.id}/rate`, {
          method: "POST",
          body: JSON.stringify({ rating: star }),
        });
        if (r?.success) renderTicketDetail(t.id);
      });
    });

    bodyEl.querySelector("#supReplyForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inp = bodyEl.querySelector("#supReplyInput");
      const msg = inp.value.trim();
      if (!msg) return;
      const btn = bodyEl.querySelector("#supReplySend");
      btn.disabled = true;
      const r = await apiSupport(`/tickets/${t.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      if (r?.success) renderTicketDetail(t.id);
      else btn.disabled = false;
    });
  }

  switchTab(state.activeTab);
}
