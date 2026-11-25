import crypto from "crypto";
import db from "../config/db.js";

const PAYOS_API_URL = "https://api-merchant.payos.vn/v2/payment-requests";

/**
 * Bảng gói nạp chuẩn — Mốc chuẩn: 50,000 VND = 350,000 Ecoin (7.0x)
 * Server là nguồn sự thật duy nhất (client không được tự truyền số Ecoin).
 */
export const TOPUP_PACKAGES = [
  { id: "pkg_10k",  amount_vnd: 10000,   ecoin: 65000,   label: "10K",  icon: "🪙", color: 0x6a9fd4, bonus: "" },
  { id: "pkg_50k",  amount_vnd: 50000,   ecoin: 350000,  label: "50K",  icon: "💰", color: 0x44aa66, bonus: "Chuẩn" },
  { id: "pkg_100k", amount_vnd: 100000,  ecoin: 750000,  label: "100K", icon: "💎", color: 0x9966cc, bonus: "+7%" },
  { id: "pkg_200k", amount_vnd: 200000,  ecoin: 1600000, label: "200K", icon: "👑", color: 0xd4a030, bonus: "+14%" },
  { id: "pkg_500k", amount_vnd: 500000,  ecoin: 4250000, label: "500K", icon: "🔥", color: 0xcc4422, bonus: "+21%" },
  { id: "pkg_1m",   amount_vnd: 1000000, ecoin: 9000000, label: "1M",   icon: "⭐", color: 0xaa2288, bonus: "+28%" },
];

export function findPackageByIdOrAmount(packageId, amountVnd) {
  if (packageId) {
    const byId = TOPUP_PACKAGES.find(p => p.id === String(packageId));
    if (byId) return byId;
  }
  if (amountVnd) {
    const byAmt = TOPUP_PACKAGES.find(p => p.amount_vnd === Number(amountVnd));
    if (byAmt) return byAmt;
  }
  return null;
}

/**
 * Sắp xếp key theo thứ tự alphabet và tạo chuỗi query ký HMAC-SHA256 theo đúng chuẩn payOS.
 */
export function buildPayosSignatureString(dataObj) {
  const sortedKeys = Object.keys(dataObj || {}).sort();
  return sortedKeys
    .map(key => {
      let val = dataObj[key];
      if (val === null || val === undefined || val === "null" || val === "undefined") {
        val = "";
      } else if (Array.isArray(val)) {
        val = JSON.stringify(val);
      } else if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      return `${key}=${val}`;
    })
    .join("&");
}

export function signPayosData(dataObj, checksumKey) {
  const raw = buildPayosSignatureString(dataObj);
  return crypto.createHmac("sha256", checksumKey).update(raw).digest("hex");
}

export function verifyPayosWebhookSignature(dataObj, receivedSignature, checksumKey) {
  if (!dataObj || !receivedSignature || !checksumKey) return false;
  const expected = signPayosData(dataObj, checksumKey);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(receivedSignature).trim().toLowerCase(), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateOrderCode() {
  // payOS yêu cầu orderCode là số nguyên dương <= 9007199254740991
  const nowPart = Date.now() % 1000000000; // 9 chữ số
  const randPart = Math.floor(100 + Math.random() * 900); // 3 chữ số
  return Number(`${nowPart}${randPart}`);
}

const payosService = {
  async ensurePaymentSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id BIGINT NOT NULL AUTO_INCREMENT,
          order_code BIGINT NOT NULL,
          user_id INT NOT NULL,
          package_id VARCHAR(32) NOT NULL,
          amount_vnd INT NOT NULL,
          ecoin_amount INT NOT NULL,
          status ENUM('PENDING', 'PAID', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
          payment_link_id VARCHAR(128) NULL DEFAULT NULL,
          checkout_url TEXT NULL,
          qr_code TEXT NULL,
          payos_reference VARCHAR(128) NULL DEFAULT NULL,
          paid_at DATETIME NULL DEFAULT NULL,
          raw_webhook TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_order_code (order_code),
          INDEX idx_pay_user (user_id),
          INDEX idx_pay_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("💳 [PAYOS] Verified payment_orders table");
    } catch (err) {
      console.error("ensurePaymentSchema error:", err.message);
    }
  },

  getEnvConfig() {
    return {
      clientId: process.env.PAYOS_CLIENT_ID || "",
      apiKey: process.env.PAYOS_API_KEY || "",
      checksumKey: process.env.PAYOS_CHECKSUM_KEY || "",
      publicBaseUrl: (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
    };
  },

  /**
   * Tạo link thanh toán + mã VietQR thật trên payOS.
   */
  async createPaymentOrder(userId, { package_id, amount_vnd }) {
    const pkg = findPackageByIdOrAmount(package_id, amount_vnd);
    if (!pkg) {
      return { success: false, message: "Gói nạp không hợp lệ!" };
    }

    const { clientId, apiKey, checksumKey, publicBaseUrl } = this.getEnvConfig();
    if (!clientId || !apiKey || !checksumKey) {
      return {
        success: false,
        message: "Server chưa cấu hình PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY trong file .env",
      };
    }

    const orderCode = generateOrderCode();
    // payOS description tối đa 25 ký tự (không dấu càng tốt cho ngân hàng)
    const description = `NAP ECOIN U${userId}`.slice(0, 25);
    const returnUrl = `${publicBaseUrl}/?payment=success&orderCode=${orderCode}`;
    const cancelUrl = `${publicBaseUrl}/?payment=cancel&orderCode=${orderCode}`;

    const signPayload = {
      amount: pkg.amount_vnd,
      cancelUrl,
      description,
      orderCode,
      returnUrl,
    };
    const signature = signPayosData(signPayload, checksumKey);

    const requestBody = {
      orderCode,
      amount: pkg.amount_vnd,
      description,
      items: [
        {
          name: `Goi ${pkg.label} (${pkg.ecoin.toLocaleString("vi-VN")} Ecoin)`,
          quantity: 1,
          price: pkg.amount_vnd,
        },
      ],
      cancelUrl,
      returnUrl,
      expiredAt: Math.floor(Date.now() / 1000) + 15 * 60, // hết hạn sau 15 phút
      signature,
    };

    const response = await fetch(PAYOS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": clientId,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json || json.code !== "00" || !json.data) {
      console.error("payOS createPaymentOrder failed:", json);
      return {
        success: false,
        message: json?.desc || "Không thể tạo mã thanh toán payOS",
      };
    }

    const d = json.data;
    await db.query(
      `INSERT INTO payment_orders
         (order_code, user_id, package_id, amount_vnd, ecoin_amount, status, payment_link_id, checkout_url, qr_code)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        orderCode,
        Number(userId),
        pkg.id,
        pkg.amount_vnd,
        pkg.ecoin,
        d.paymentLinkId || null,
        d.checkoutUrl || null,
        d.qrCode || null,
      ]
    );

    return {
      success: true,
      order: {
        order_code: orderCode,
        package_id: pkg.id,
        amount_vnd: pkg.amount_vnd,
        ecoin_amount: pkg.ecoin,
        description: d.description || description,
        checkout_url: d.checkoutUrl,
        qr_code: d.qrCode,
        account_number: d.accountNumber || "",
        account_name: d.accountName || "",
        bin: d.bin || "",
      },
    };
  },

  /**
   * Xử lý Webhook nhận thông tin thanh toán từ payOS:
   *  - Verify HMAC-SHA256 signature trên object `data`
   *  - Hỗ trợ webhook ping kiểm tra URL (orderCode = 123)
   *  - Cộng Ecoin idempotent (không bao giờ cộng trùng 2 lần)
   *  - Phát Socket.IO real-time về client đang online
   */
  async handleWebhook(body, { io, onlineUserSockets } = {}) {
    const { checksumKey } = this.getEnvConfig();
    if (!body || typeof body !== "object") {
      return { httpStatus: 400, payload: { success: false, message: "Invalid body" } };
    }

    const { code, success, data, signature } = body;

    // 1. Kiểm tra dữ liệu mẫu ping test khi admin xác thực Webhook URL trên my.payos.vn
    if (data && Number(data.orderCode) === 123 && data.description === "VQRIO123") {
      console.log("💳 [PAYOS] Received payOS webhook verification ping");
      return { httpStatus: 200, payload: { success: true, message: "Webhook verified" } };
    }

    // 2. Xác thực chữ ký HMAC-SHA256 nếu đã cấu hình CHECKSUM_KEY
    if (checksumKey) {
      const valid = verifyPayosWebhookSignature(data, signature, checksumKey);
      if (!valid) {
        console.warn("⚠️ [PAYOS] Invalid webhook signature for orderCode:", data?.orderCode);
        return { httpStatus: 400, payload: { success: false, message: "Invalid signature" } };
      }
    }

    // 3. Chỉ cộng tiền khi giao dịch thành công (code === "00" và success === true)
    if (code !== "00" || !success || !data?.orderCode) {
      return { httpStatus: 200, payload: { success: true, message: "Ignored non-success webhook" } };
    }

    const orderCode = Number(data.orderCode);
    const paidAmount = Number(data.amount || 0);

    const [orders] = await db.query(
      "SELECT * FROM payment_orders WHERE order_code = ? LIMIT 1",
      [orderCode]
    );
    const order = orders[0];
    if (!order) {
      console.warn(`⚠️ [PAYOS] Order not found: ${orderCode}`);
      return { httpStatus: 200, payload: { success: true, message: "Order not found" } };
    }

    if (order.status === "PAID") {
      return { httpStatus: 200, payload: { success: true, message: "Already processed" } };
    }

    // Kiểm tra số tiền thực nhận >= số tiền đơn hàng
    if (paidAmount < Number(order.amount_vnd)) {
      console.warn(`⚠️ [PAYOS] Underpaid order ${orderCode}: paid=${paidAmount} < expected=${order.amount_vnd}`);
      return { httpStatus: 200, payload: { success: false, message: "Insufficient amount" } };
    }

    // Idempotent atomic update: chỉ cộng tiền nếu chuyển trạng thái từ PENDING -> PAID thành công
    const [upd] = await db.query(
      `UPDATE payment_orders
       SET status = 'PAID', payos_reference = ?, paid_at = NOW(), raw_webhook = ?
       WHERE order_code = ? AND status = 'PENDING'`,
      [data.reference || null, JSON.stringify(body).slice(0, 3000), orderCode]
    );

    if (upd.affectedRows === 0) {
      return { httpStatus: 200, payload: { success: true, message: "Already processed" } };
    }

    // Cộng Ecoin vào tài khoản người chơi
    await db.query(
      "UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?",
      [Number(order.ecoin_amount), Number(order.user_id)]
    );
    const [[userRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [Number(order.user_id)]);
    const newEcoin = Number(userRow?.ecoin || 0);

    console.log(
      `✅ [PAYOS] PAID order #${orderCode} | user=${order.user_id} | +${order.ecoin_amount.toLocaleString()} Ecoin (VND=${paidAmount.toLocaleString()}) -> balance=${newEcoin.toLocaleString()}`
    );

    // Đẩy sự kiện real-time về các socket đang online của người chơi
    const sockSet = onlineUserSockets?.get(Number(order.user_id));
    if (sockSet && io) {
      for (const sid of sockSet) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.emit("payment:paid", {
            order_code: orderCode,
            amount_vnd: Number(order.amount_vnd),
            ecoin_added: Number(order.ecoin_amount),
            ecoin: newEcoin,
          });
        }
      }
    }

    return { httpStatus: 200, payload: { success: true, order_code: orderCode, ecoin: newEcoin } };
  },

  async getOrderStatus(userId, orderCode) {
    const [rows] = await db.query(
      "SELECT order_code, user_id, package_id, amount_vnd, ecoin_amount, status, paid_at FROM payment_orders WHERE order_code = ? AND user_id = ? LIMIT 1",
      [Number(orderCode), Number(userId)]
    );
    const order = rows[0];
    if (!order) return { success: false, message: "Không tìm thấy đơn nạp" };

    let currentEcoin = null;
    if (order.status === "PAID") {
      const [[u]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [Number(userId)]);
      currentEcoin = Number(u?.ecoin || 0);
    }

    return {
      success: true,
      status: order.status,
      order_code: order.order_code,
      amount_vnd: Number(order.amount_vnd),
      ecoin_amount: Number(order.ecoin_amount),
      ecoin: currentEcoin,
      paid_at: order.paid_at,
    };
  },
};

export default payosService;
