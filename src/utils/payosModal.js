import { SERVER_URL } from "../config.js";

/**
 * Mở luồng thanh toán tiền thật qua payOS (VietQR + Checkout URL + Auto-check + Socket real-time).
 */
export async function openPayosTopUpFlow({
  scene,
  token,
  amountVnd,
  packageId = null,
  onPaid,
  onError,
}) {
  if (!token) {
    onError?.("Bạn chưa đăng nhập!");
    return;
  }

  // Tạo overlay DOM gọn đẹp nằm trên Phaser canvas
  const existing = document.getElementById("payos-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "payos-modal-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(6, 12, 24, 0.82); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    font-family: "Signika", "Segoe UI", sans-serif; padding: 16px;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width: 100%; max-width: 420px; background: #fff9ec; color: #3b2408;
    border: 3px solid #c9922c; border-radius: 16px; padding: 20px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.55); text-align: center; position: relative;
  `;
  card.innerHTML = `<div style="padding:36px 0;font-weight:700;font-size:16px">⏳ Đang khởi tạo mã QR payOS...</div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let pollTimer = null;
  let socketHandler = null;
  const cleanup = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (socketHandler && scene?.socket) {
      scene.socket.off("payment:paid", socketHandler);
      socketHandler = null;
    }
    overlay.remove();
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/payment/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ package_id: packageId, amount_vnd: amountVnd }),
    });
    const json = await res.json();
    if (!json.success || !json.order) {
      cleanup();
      onError?.(json.message || "Không thể tạo đơn thanh toán payOS!");
      return;
    }

    const order = json.order;
    const qrImgUrl = order.qr_code
      ? `https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=${encodeURIComponent(order.qr_code)}`
      : "";

    card.innerHTML = `
      <button id="payos-close-btn" style="
        position:absolute; top:10px; right:10px; width:30px; height:30px;
        border-radius:50%; border:none; background:#d94444; color:#fff;
        font-weight:700; font-size:15px; cursor:pointer;
      ">✕</button>
      <div style="font-size:18px;font-weight:800;color:#8a4f00;margin-bottom:4px">
        💳 QUÉT MÃ VIETQR (payOS)
      </div>
      <div style="font-size:13px;color:#6b4c1e;margin-bottom:12px">
        Nạp <b>${Number(order.amount_vnd).toLocaleString("vi-VN")}đ</b> → Nhận ngay
        <b style="color:#1b8a3e">+${Number(order.ecoin_amount).toLocaleString("vi-VN")} Ecoin</b>
      </div>
      ${qrImgUrl ? `
        <div style="background:#fff;display:inline-block;padding:10px;border-radius:12px;border:2px solid #e6c680;margin-bottom:12px">
          <img src="${qrImgUrl}" alt="VietQR payOS" style="width:210px;height:210px;display:block" />
        </div>
      ` : ""}
      <div style="background:#fff3d6;border:1px solid #e0bf73;border-radius:10px;padding:10px 12px;font-size:12px;text-align:left;margin-bottom:12px;line-height:1.6">
        <div><b>Mã đơn:</b> #${order.order_code}</div>
        ${order.account_number ? `<div><b>STK nhận:</b> ${order.account_number} (${order.account_name || ""})</div>` : ""}
        <div><b>Nội dung CK:</b> <span style="color:#b45309;font-weight:700">${order.description}</span></div>
        <div><b>Số tiền:</b> <span style="color:#c0392b;font-weight:700">${Number(order.amount_vnd).toLocaleString("vi-VN")} VND</span></div>
      </div>
      <div id="payos-status-text" style="font-size:13px;font-weight:700;color:#0e7490;margin-bottom:12px">
        🔄 Đang chờ ngân hàng xác nhận tự động...
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${order.checkout_url ? `
          <a href="${order.checkout_url}" target="_blank" rel="noopener" style="
            padding:9px 14px;border-radius:8px;background:#16a34a;color:#fff;
            font-weight:700;font-size:13px;text-decoration:none;
          ">🌐 Mở trang payOS</a>
        ` : ""}
        <button id="payos-cancel-btn" style="
          padding:9px 14px;border-radius:8px;background:#e5d3ad;color:#4a2b00;
          border:none;font-weight:700;font-size:13px;cursor:pointer;
        ">Đóng</button>
      </div>
    `;

    card.querySelector("#payos-close-btn").onclick = cleanup;
    card.querySelector("#payos-cancel-btn").onclick = cleanup;

    const handleSuccess = (newEcoin, added) => {
      if (!document.getElementById("payos-modal-overlay")) return;
      const st = card.querySelector("#payos-status-text");
      if (st) {
        st.style.color = "#15803d";
        st.textContent = `✅ NẠP THÀNH CÔNG +${Number(added).toLocaleString("vi-VN")} ECOIN!`;
      }
      onPaid?.(newEcoin, added);
      setTimeout(cleanup, 1600);
    };

    // Nghe sự kiện real-time từ Webhook qua Socket.IO
    if (scene?.socket) {
      socketHandler = (ev) => {
        if (Number(ev?.order_code) === Number(order.order_code)) {
          handleSuccess(ev.ecoin, ev.ecoin_added);
        }
      };
      scene.socket.on("payment:paid", socketHandler);
    }

    // Poll dự phòng mỗi 3 giây phòng trường hợp socket đang ở scene chưa kết nối
    pollTimer = setInterval(async () => {
      try {
        const sRes = await fetch(`${SERVER_URL}/api/payment/status/${order.order_code}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const sJson = await sRes.json();
        if (sJson.success && sJson.status === "PAID") {
          handleSuccess(sJson.ecoin, sJson.ecoin_amount);
        }
      } catch (_) {}
    }, 3000);
  } catch (err) {
    cleanup();
    onError?.("Lỗi kết nối server thanh toán!");
  }
}
