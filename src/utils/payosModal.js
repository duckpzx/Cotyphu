/**
 * Modal nạp tiền tức thì (VietQR + payOS Webhook)
 * Giao diện đồng bộ 100% với bảng "Tạo Phòng" (giấy kem vàng, viền đứt nét vàng, pill chọn mệnh giá xanh/kem)
 * Kết hợp bố cục 2 cột chuyển khoản (Trái: Thông tin ngân hàng + Copy | Phải: Mã QR + Đếm ngược hết hạn)
 */

const DEFAULT_PACKAGES = [
  { id: "pkg_10k",  amount_vnd: 10000,   ecoin: 65000,   label: "10K" },
  { id: "pkg_20k",  amount_vnd: 20000,   ecoin: 135000,  label: "20K" },
  { id: "pkg_50k",  amount_vnd: 50000,   ecoin: 350000,  label: "50K" },
  { id: "pkg_100k", amount_vnd: 100000,  ecoin: 750000,  label: "100K" },
  { id: "pkg_200k", amount_vnd: 200000,  ecoin: 1600000, label: "200K" },
  { id: "pkg_500k", amount_vnd: 500000,  ecoin: 4250000, label: "500K" },
  { id: "pkg_1m",   amount_vnd: 1000000, ecoin: 9000000, label: "1M" },
];

const COPY_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

function injectStylesOnce() {
  if (document.getElementById("topup-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "topup-modal-styles";
  style.textContent = `
    #payos-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(12, 10, 8, 0.62);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Signika', 'Segoe UI', system-ui, sans-serif;
      padding: 14px;
      box-sizing: border-box;
      animation: topupFadeIn 0.18s ease-out;
    }
    @keyframes topupFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes topupPopIn {
      from { transform: scale(0.92); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }

    /* Khung giấy kem vàng chuẩn Tạo Phòng */
    .topup-panel {
      position: relative;
      width: 680px;
      max-width: 96vw;
      background: linear-gradient(180deg, #faf1d6 0%, #f5e6be 55%, #edd9a3 100%);
      border: 3.5px solid #ffffff;
      border-radius: 22px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.52), 0 0 0 2px rgba(154, 106, 26, 0.45);
      padding: 32px 22px 20px;
      box-sizing: border-box;
      color: #4a2400;
      animation: topupPopIn 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    /* Viền đứt nét vàng bên trong */
    .topup-panel::before {
      content: "";
      position: absolute;
      inset: 9px;
      border: 1.8px dashed rgba(184, 146, 46, 0.55);
      border-radius: 15px;
      pointer-events: none;
    }

    /* Thanh tiêu đề pill vàng nổi lên trên mép */
    .topup-header-pill {
      position: absolute;
      top: -24px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 240px;
      height: 46px;
      padding: 0 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #f3c44d 0%, #d89b24 55%, #b57714 100%);
      border: 2.5px solid #8a5610;
      border-radius: 24px;
      box-shadow: 0 5px 12px rgba(0, 0, 0, 0.28), inset 0 2px 1px rgba(255, 255, 255, 0.5);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #4a2000;
      text-shadow: 0 1px 0 rgba(255, 245, 200, 0.75);
      user-select: none;
    }
    .topup-header-pill::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 14px;
      right: 14px;
      height: 14px;
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0));
      pointer-events: none;
    }

    /* Nút đóng X đỏ bóng đồng bộ với Chat (assets/ui/shared/close.png) */
    .topup-close-btn {
      position: absolute;
      top: -16px;
      right: -16px;
      width: 42px;
      height: 42px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
      transition: transform 0.14s ease, filter 0.14s ease;
      z-index: 5;
    }
    .topup-close-btn img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      pointer-events: none;
    }
    .topup-close-btn:hover {
      transform: scale(1.08);
      filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.45)) brightness(1.06);
    }

    /* Khung chọn mệnh giá (style Mức cược của Tạo Phòng) */
    .topup-amount-box {
      position: relative;
      z-index: 2;
      background: rgba(255, 250, 234, 0.82);
      border: 1.5px solid rgba(196, 154, 58, 0.45);
      border-radius: 14px;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .topup-amount-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .topup-amount-label {
      font-size: 13px;
      font-weight: 800;
      color: #6b3b09;
      letter-spacing: 0.2px;
    }
    .topup-ecoin-preview {
      font-size: 13px;
      font-weight: 800;
      color: #15803d;
      background: rgba(34, 197, 94, 0.13);
      border: 1px solid rgba(34, 197, 94, 0.35);
      padding: 2px 10px;
      border-radius: 999px;
    }
    .topup-pills-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .topup-pill {
      position: relative;
      flex: 1 1 auto;
      min-width: 66px;
      height: 32px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1.8px solid #c9a76a;
      background: linear-gradient(180deg, #f7ebd0 0%, #e5ce9c 100%);
      color: #5b3108;
      font-family: inherit;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: inset 0 2px 1px rgba(255, 255, 255, 0.65), 0 2px 4px rgba(90, 50, 0, 0.12);
      transition: transform 0.12s ease, filter 0.12s ease;
    }
    .topup-pill:hover {
      filter: brightness(1.04);
      transform: translateY(-1px);
    }
    .topup-pill.active {
      border-color: #0284c7;
      background: linear-gradient(180deg, #4bd5ff 0%, #0ea5e9 52%, #0284c7 100%);
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0, 55, 95, 0.55);
      box-shadow: inset 0 2px 2px rgba(255, 255, 255, 0.55), 0 3px 8px rgba(2, 132, 199, 0.35);
    }

    /* Khung nội dung chính 2 cột (như hình mẫu, phối màu giấy kem vàng) */
    .topup-main-box {
      position: relative;
      z-index: 2;
      background: rgba(255, 251, 238, 0.9);
      border: 1.5px solid rgba(196, 154, 58, 0.5);
      border-radius: 14px;
      padding: 12px 16px 14px;
    }
    .topup-notice {
      text-align: center;
      font-size: 12.5px;
      font-weight: 800;
      color: #a15c07;
      letter-spacing: 0.3px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px dashed rgba(184, 146, 46, 0.45);
    }

    .topup-grid {
      display: grid;
      grid-template-columns: 1.25fr 1px 0.95fr;
      gap: 16px;
      align-items: center;
    }
    .topup-divider {
      width: 1px;
      height: 100%;
      min-height: 210px;
      background: linear-gradient(180deg, transparent, rgba(184, 146, 46, 0.65) 25%, rgba(184, 146, 46, 0.65) 75%, transparent);
    }

    /* Cột trái: Thông tin chuyển khoản */
    .topup-info-col {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .topup-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 10px;
      background: rgba(247, 234, 198, 0.55);
      border: 1px solid rgba(201, 167, 106, 0.45);
      border-radius: 10px;
    }
    .topup-row-left {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .topup-field-label {
      width: 82px;
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 700;
      color: #7c4d14;
      padding-top: 2px;
    }
    .topup-field-val-wrap {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .topup-field-val {
      font-size: 15.5px;
      font-weight: 800;
      color: #3f1d00;
      word-break: break-all;
      line-height: 1.2;
    }
    .topup-field-val.amount {
      color: #c2410c;
      font-size: 17px;
    }
    .topup-field-val.code {
      color: #15803d;
      font-size: 17px;
      letter-spacing: 0.8px;
    }
    .topup-field-hint {
      font-size: 11px;
      font-weight: 700;
      color: #dc2626;
      margin-top: 2px;
    }
    .topup-copy-btn {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1.5px solid #c99738;
      background: linear-gradient(180deg, #fff6db 0%, #edd191 100%);
      color: #6b3b09;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    .topup-copy-btn:hover {
      transform: scale(1.06);
      background: linear-gradient(180deg, #fffbe8 0%, #f5dc9f 100%);
    }
    .topup-copy-btn.copied {
      border-color: #16a34a;
      background: linear-gradient(180deg, #4ade80 0%, #16a34a 100%);
      color: #ffffff;
    }

    /* Cột phải: Mã QR + Đếm ngược */
    .topup-qr-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .topup-qr-frame {
      position: relative;
      width: 204px;
      height: 204px;
      padding: 8px;
      background: #ffffff;
      border-radius: 14px;
      border: 2px solid #d4a438;
      box-shadow: 0 6px 18px rgba(90, 50, 0, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .topup-qr-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      border-radius: 6px;
    }
    .topup-qr-loading {
      font-size: 13px;
      font-weight: 700;
      color: #8a5a18;
    }
    .topup-countdown {
      margin-top: 9px;
      font-size: 12.5px;
      font-weight: 800;
      color: #dc2626;
    }
    .topup-status {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 700;
      color: #7c4d14;
      background: rgba(245, 224, 166, 0.7);
      border: 1px solid rgba(196, 154, 58, 0.45);
      border-radius: 999px;
      padding: 4px 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .topup-status.paid {
      color: #166534;
      background: rgba(34, 197, 94, 0.18);
      border-color: rgba(22, 163, 74, 0.5);
    }
    .topup-status.expired {
      color: #991b1b;
      background: rgba(239, 68, 68, 0.14);
      border-color: rgba(220, 38, 38, 0.4);
    }
    .topup-refresh-btn {
      margin-top: 8px;
      padding: 6px 16px;
      border-radius: 999px;
      border: 1.5px solid #9a5b0c;
      background: linear-gradient(180deg, #f7b733 0%, #d97706 100%);
      color: #ffffff;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 3px 8px rgba(180, 83, 9, 0.3);
      display: none;
    }
    .topup-refresh-btn:hover {
      filter: brightness(1.06);
    }

    @media (max-width: 640px) {
      .topup-grid {
        grid-template-columns: 1fr;
      }
      .topup-divider {
        width: 100%;
        height: 1px;
        min-height: 1px;
      }
    }
  `;
  document.head.appendChild(style);
}

async function copyText(text, btnEl) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(String(text));
  } catch {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  if (btnEl) {
    btnEl.classList.add("copied");
    btnEl.innerHTML = CHECK_SVG;
    clearTimeout(btnEl._copyT);
    btnEl._copyT = setTimeout(() => {
      btnEl.classList.remove("copied");
      btnEl.innerHTML = COPY_SVG;
    }, 1400);
  }
}

/**
 * Mở bảng Nạp Tiền tức thì (gộp chọn mệnh giá + VietQR + tự động nhận payOS webhook)
 */
export async function openPayosTopUpFlow({
  scene,
  token,
  amountVnd = 50000,
  packageId = "pkg_50k",
  onPaid,
  onError,
  onClose,
}) {
  if (!token) {
    onError?.("Bạn chưa đăng nhập!");
    return;
  }

  injectStylesOnce();

  const existing = document.getElementById("payos-modal-overlay");
  if (existing) existing.remove();

  // Tải danh sách gói nạp động từ Admin Dashboard (fallback DEFAULT_PACKAGES nếu lỗi)
  let packages = DEFAULT_PACKAGES;
  try {
    const pkgRes = await fetch("/api/payment/packages");
    const pkgJson = await pkgRes.json().catch(() => null);
    if (pkgJson?.maintenance_mode) {
      onError?.("Cổng nạp tiền đang tạm bảo trì. Vui lòng quay lại sau!");
      return;
    }
    if (pkgJson?.success && Array.isArray(pkgJson.packages) && pkgJson.packages.length > 0) {
      packages = pkgJson.packages;
    }
  } catch {}

  // Xác định gói mặc định
  let selectedPkg =
    packages.find(p => p.id === packageId) ||
    packages.find(p => Number(p.amount_vnd) === Number(amountVnd)) ||
    packages.find(p => p.id === "pkg_50k") ||
    packages[0];

  let activeOrder = null;
  let pollTimer = null;
  let countdownTimer = null;
  let remainingSec = 15 * 60;
  let closed = false;
  let requestSeq = 0;

  const overlay = document.createElement("div");
  overlay.id = "payos-modal-overlay";
  overlay.innerHTML = `
    <div class="topup-panel" role="dialog" aria-modal="true" aria-label="Nạp Tiền">
      <div class="topup-header-pill">NẠP TIỀN</div>
      <button class="topup-close-btn" id="topup-close-btn" title="Đóng"><img src="assets/ui/shared/close.png" alt="Đóng" /></button>

      <div class="topup-amount-box">
        <div class="topup-amount-top">
          <span class="topup-amount-label">Chọn mệnh giá nạp</span>
          <span class="topup-ecoin-preview" id="topup-ecoin-preview"></span>
        </div>
        <div class="topup-pills-row" id="topup-pills-row"></div>
      </div>

      <div class="topup-main-box">
        <div class="topup-notice">✦ CHUYỂN KHOẢN CHÍNH XÁC ĐỂ HỆ THỐNG CỘNG ECOIN TỨC THÌ ✦</div>
        <div class="topup-grid">
          <div class="topup-info-col">
            <div class="topup-row">
              <div class="topup-row-left">
                <div class="topup-field-label">Ngân Hàng:</div>
                <div class="topup-field-val-wrap">
                  <div class="topup-field-val" id="topup-bank-name">MB BANK</div>
                </div>
              </div>
            </div>

            <div class="topup-row">
              <div class="topup-row-left">
                <div class="topup-field-label">Số Tiền:</div>
                <div class="topup-field-val-wrap">
                  <div class="topup-field-val amount" id="topup-amount-val">...</div>
                  <div class="topup-field-hint">Chuyển ĐÚNG số tiền</div>
                </div>
              </div>
              <button class="topup-copy-btn" id="topup-copy-amount" title="Sao chép số tiền">${COPY_SVG}</button>
            </div>

            <div class="topup-row">
              <div class="topup-row-left">
                <div class="topup-field-label">Nội Dung:</div>
                <div class="topup-field-val-wrap">
                  <div class="topup-field-val code" id="topup-content-val">...</div>
                  <div class="topup-field-hint">Nhập ĐÚNG nội dung</div>
                </div>
              </div>
              <button class="topup-copy-btn" id="topup-copy-content" title="Sao chép nội dung">${COPY_SVG}</button>
            </div>

            <div class="topup-row">
              <div class="topup-row-left">
                <div class="topup-field-label">Số TK:</div>
                <div class="topup-field-val-wrap">
                  <div class="topup-field-val" id="topup-acc-num">0396605617</div>
                </div>
              </div>
              <button class="topup-copy-btn" id="topup-copy-acc" title="Sao chép số tài khoản">${COPY_SVG}</button>
            </div>

            <div class="topup-row">
              <div class="topup-row-left">
                <div class="topup-field-label">Tên TK:</div>
                <div class="topup-field-val-wrap">
                  <div class="topup-field-val" id="topup-acc-name">PHAM XUAN DUC</div>
                </div>
              </div>
            </div>
          </div>

          <div class="topup-divider"></div>

          <div class="topup-qr-col">
            <div class="topup-qr-frame" id="topup-qr-frame">
              <div class="topup-qr-loading">Đang tạo mã QR...</div>
            </div>
            <div class="topup-countdown" id="topup-countdown">QR code hết hạn sau 15:00s</div>
            <div class="topup-status" id="topup-status">🔄 Đang chờ thanh toán tự động...</div>
            <button class="topup-refresh-btn" id="topup-refresh-btn">Tạo mã QR mới</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const pillsRow = overlay.querySelector("#topup-pills-row");
  const ecoinPreviewEl = overlay.querySelector("#topup-ecoin-preview");
  const bankNameEl = overlay.querySelector("#topup-bank-name");
  const amountValEl = overlay.querySelector("#topup-amount-val");
  const contentValEl = overlay.querySelector("#topup-content-val");
  const accNumEl = overlay.querySelector("#topup-acc-num");
  const accNameEl = overlay.querySelector("#topup-acc-name");
  const qrFrameEl = overlay.querySelector("#topup-qr-frame");
  const countdownEl = overlay.querySelector("#topup-countdown");
  const statusEl = overlay.querySelector("#topup-status");
  const refreshBtn = overlay.querySelector("#topup-refresh-btn");

  const copyAmountBtn = overlay.querySelector("#topup-copy-amount");
  const copyContentBtn = overlay.querySelector("#topup-copy-content");
  const copyAccBtn = overlay.querySelector("#topup-copy-acc");

  // Lắng nghe sự kiện Socket.IO real-time từ server khi webhook payOS báo đã nhận tiền
  const socket = scene?._worldSocket || scene?.socket || null;
  const onSocketPaid = (payload) => {
    if (closed || !activeOrder) return;
    const matchOrder = Number(payload?.order_code) === Number(activeOrder.order_code);
    const matchCode =
      payload?.transfer_code &&
      activeOrder.transfer_code &&
      String(payload.transfer_code).toUpperCase() === String(activeOrder.transfer_code).toUpperCase();
    if (matchOrder || matchCode) {
      handleSuccess(payload.ecoin, payload.ecoin_added);
    }
  };
  if (socket) socket.on("payment:paid", onSocketPaid);

  const stopTimers = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    stopTimers();
    if (socket) socket.off("payment:paid", onSocketPaid);
    overlay.remove();
    onClose?.();
  };

  const handleSuccess = (newEcoin, added) => {
    stopTimers();
    statusEl.className = "topup-status paid";
    statusEl.textContent = `✅ Nạp thành công! +${Number(added || activeOrder?.ecoin_amount || 0).toLocaleString("vi-VN")} Ecoin`;
    countdownEl.style.color = "#15803d";
    countdownEl.textContent = "Giao dịch đã hoàn tất!";
    refreshBtn.style.display = "none";
    onPaid?.(newEcoin, added || activeOrder?.ecoin_amount || 0);
    setTimeout(cleanup, 2000);
  };

  const updatePreview = (pkg) => {
    ecoinPreviewEl.textContent = `${Number(pkg.amount_vnd).toLocaleString("vi-VN")}đ  →  +${Number(pkg.ecoin).toLocaleString("vi-VN")} Ecoin`;
  };

  const formatTimer = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}s`;
  };

  const startOrderTracking = (order) => {
    stopTimers();
    remainingSec = Number(order.expires_in_sec || 900);
    countdownEl.style.color = "#dc2626";
    countdownEl.textContent = `QR code hết hạn sau ${formatTimer(remainingSec)}`;
    statusEl.className = "topup-status";
    statusEl.textContent = "🔄 Đang chờ thanh toán tự động...";
    refreshBtn.style.display = "none";

    countdownTimer = setInterval(() => {
      if (closed) return;
      remainingSec -= 1;
      if (remainingSec <= 0) {
        stopTimers();
        countdownEl.textContent = "QR code đã hết hạn!";
        statusEl.className = "topup-status expired";
        statusEl.textContent = "⏳ Mã đã hết hạn — bấm Tạo mã mới";
        refreshBtn.style.display = "inline-block";
      } else {
        countdownEl.textContent = `QR code hết hạn sau ${formatTimer(remainingSec)}`;
      }
    }, 1000);

    // Polling dự phòng mỗi 3 giây (song song Socket.IO)
    pollTimer = setInterval(async () => {
      if (closed || !activeOrder) return;
      try {
        const stRes = await fetch(`/api/payment/status/${activeOrder.order_code}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const stJson = await stRes.json().catch(() => null);
        if (stJson?.success && stJson.status === "PAID") {
          handleSuccess(stJson.ecoin, stJson.ecoin_amount);
        }
      } catch {}
    }, 3000);
  };

  const renderQrImage = (order) => {
    const bankCode = encodeURIComponent(order.bank_code || "MB");
    const accNum = encodeURIComponent(order.account_number || "0396605617");
    const fallbackUrl = `https://img.vietqr.io/image/${bankCode}-${accNum}-qr_only.png?amount=${encodeURIComponent(order.amount_vnd)}&addInfo=${encodeURIComponent(order.description || order.transfer_code || "")}&accountName=${encodeURIComponent(order.account_name || "PHAM XUAN DUC")}`;
    const primaryUrl = order.qr_image_url || fallbackUrl;

    qrFrameEl.innerHTML = "";
    const img = document.createElement("img");
    img.alt = "VietQR thanh toán";
    img.src = primaryUrl;
    img.onerror = () => {
      if (img.src !== fallbackUrl) {
        img.src = fallbackUrl;
      } else {
        qrFrameEl.innerHTML = `<div class="topup-qr-loading">Không tải được ảnh QR.<br/>Vui lòng chuyển khoản thủ công.</div>`;
      }
    };
    qrFrameEl.appendChild(img);
  };

  const loadOrderForPackage = async (pkg) => {
    const seq = ++requestSeq;
    selectedPkg = pkg;
    updatePreview(pkg);

    // Cập nhật active pill
    pillsRow.querySelectorAll(".topup-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pkgId === pkg.id);
    });

    stopTimers();
    amountValEl.textContent = Number(pkg.amount_vnd).toLocaleString("en-US");
    contentValEl.textContent = "Đang tạo...";
    qrFrameEl.innerHTML = `<div class="topup-qr-loading">Đang tạo mã QR...</div>`;
    statusEl.className = "topup-status";
    statusEl.textContent = "🔄 Đang tạo đơn nạp...";
    refreshBtn.style.display = "none";

    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package_id: pkg.id, amount_vnd: pkg.amount_vnd }),
      });
      const json = await res.json().catch(() => null);
      if (closed || seq !== requestSeq) return;

      if (!res.ok || !json?.success || !json.order) {
        const msg = json?.message || "Không thể tạo đơn nạp tiền";
        statusEl.className = "topup-status expired";
        statusEl.textContent = `❌ ${msg}`;
        qrFrameEl.innerHTML = `<div class="topup-qr-loading">Lỗi tạo mã QR</div>`;
        refreshBtn.style.display = "inline-block";
        onError?.(msg);
        return;
      }

      const order = json.order;
      activeOrder = order;

      bankNameEl.textContent = order.bank_name || "MB BANK";
      amountValEl.textContent = Number(order.amount_vnd).toLocaleString("en-US");
      contentValEl.textContent = order.description || order.transfer_code || "";
      accNumEl.textContent = order.account_number || "0396605617";
      accNameEl.textContent = order.account_name || "PHAM XUAN DUC";

      renderQrImage(order);
      startOrderTracking(order);
    } catch (err) {
      if (closed || seq !== requestSeq) return;
      statusEl.className = "topup-status expired";
      statusEl.textContent = "❌ Lỗi kết nối máy chủ";
      qrFrameEl.innerHTML = `<div class="topup-qr-loading">Lỗi kết nối</div>`;
      refreshBtn.style.display = "inline-block";
      onError?.("Lỗi kết nối server thanh toán!");
    }
  };

  // Render các pill mệnh giá giống Tạo Phòng
  packages.forEach((pkg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "topup-pill" + (pkg.id === selectedPkg.id ? " active" : "");
    btn.dataset.pkgId = pkg.id;
    btn.textContent = pkg.label;
    btn.addEventListener("click", () => {
      if (selectedPkg.id === pkg.id && activeOrder && remainingSec > 0) return;
      loadOrderForPackage(pkg);
    });
    pillsRow.appendChild(btn);
  });

  // Sự kiện nút Copy
  copyAmountBtn.addEventListener("click", () => copyText(activeOrder?.amount_vnd || selectedPkg.amount_vnd, copyAmountBtn));
  copyContentBtn.addEventListener("click", () => copyText(activeOrder?.description || activeOrder?.transfer_code || "", copyContentBtn));
  copyAccBtn.addEventListener("click", () => copyText(activeOrder?.account_number || "0396605617", copyAccBtn));

  // Nút Tạo mã mới khi hết hạn / lỗi
  refreshBtn.addEventListener("click", () => loadOrderForPackage(selectedPkg));

  // Đóng modal
  overlay.querySelector("#topup-close-btn").addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });

  // Khởi tạo đơn nạp mặc định ngay lập tức
  loadOrderForPackage(selectedPkg);
}
