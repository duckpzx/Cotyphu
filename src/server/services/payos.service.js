import crypto from "crypto";
import db from "../config/db.js";

const PAYOS_API_URL = "https://api-merchant.payos.vn/v2/payment-requests";
const VIETQR_GENERATE_URL = "https://vietqr.vn/api/vietqr/generate";

/**
 * Bảng gói nạp chuẩn — Mốc chuẩn: 50,000 VND = 350,000 Ecoin (7.0x)
 * Server là nguồn sự thật duy nhất (client không được tự truyền số Ecoin).
 */
export const TOPUP_PACKAGES = [
  { id: "pkg_10k",  amount_vnd: 10000,   ecoin: 65000,   label: "10K",  bonus: "" },
  { id: "pkg_20k",  amount_vnd: 20000,   ecoin: 135000,  label: "20K",  bonus: "" },
  { id: "pkg_50k",  amount_vnd: 50000,   ecoin: 350000,  label: "50K",  bonus: "Chuẩn" },
  { id: "pkg_100k", amount_vnd: 100000,  ecoin: 750000,  label: "100K", bonus: "+7%" },
  { id: "pkg_200k", amount_vnd: 200000,  ecoin: 1600000, label: "200K", bonus: "+14%" },
  { id: "pkg_500k", amount_vnd: 500000,  ecoin: 4250000, label: "500K", bonus: "+21%" },
  { id: "pkg_1m",   amount_vnd: 1000000, ecoin: 9000000, label: "1M",   bonus: "+28%" },
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

function generateTransferCode() {
  // Mã nội dung chuyển khoản ngắn gọn, dễ nhập, không nhầm 0/O/1/I (VD: CTP7K4M9)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `CTP${suffix}`;
}

export function buildVietQrFallbackUrl({ bankCode, bankAccount, amount, content, userBankName }) {
  const qs = new URLSearchParams({
    amount: String(amount),
    addInfo: String(content),
    accountName: String(userBankName),
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(bankAccount)}-qr_only.png?${qs.toString()}`;
}

/**
 * Gọi API https://vietqr.vn/api/vietqr/generate để tạo mã QR chuyển khoản,
 * tự động fallback sang img.vietqr.io (chuẩn VietQR QuickLink) nếu endpoint trả lỗi.
 */
export async function generateVietQrImage({ amount, bankAccount, bankCode, content, userBankName }) {
  const fallbackUrl = buildVietQrFallbackUrl({ bankCode, bankAccount, amount, content, userBankName });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(VIETQR_GENERATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        amount: String(amount),
        bankAccount: String(bankAccount),
        bankCode: String(bankCode),
        content: String(content),
        userBankName: String(userBankName),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json().catch(() => null);
      const dataUrl =
        json?.qrDataURL ||
        json?.data?.qrDataURL ||
        (typeof json?.qrCode === "string" && json.qrCode.startsWith("data:image") ? json.qrCode : null) ||
        (json?.imgId ? `https://vietqr.vn/img/${json.imgId}` : null);
      if (dataUrl) {
        return {
          qrImageUrl: dataUrl,
          qrRaw: typeof json?.qrCode === "string" ? json.qrCode : null,
          source: "vietqr.vn",
        };
      }
    }
  } catch {
    // Fallback gracefully to official VietQR QuickLink image
  }

  return {
    qrImageUrl: fallbackUrl,
    qrRaw: null,
    source: "img.vietqr.io",
  };
}

const BANK_BIN_TO_NAME = {
  "970422": { code: "MB", name: "MB BANK" },
  "970436": { code: "VCB", name: "VIETCOMBANK" },
  "970415": { code: "ICB", name: "VIETINBANK" },
  "970418": { code: "BIDV", name: "BIDV" },
  "970407": { code: "TCB", name: "TECHCOMBANK" },
  "970416": { code: "ACB", name: "ACB" },
  "970432": { code: "VPB", name: "VPBANK" },
  "970423": { code: "TPB", name: "TPBANK" },
  "970403": { code: "STB", name: "SACOMBANK" },
  "970441": { code: "VIB", name: "VIB" },
};

const payosService = {
  async ensurePaymentSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id BIGINT NOT NULL AUTO_INCREMENT,
          order_code BIGINT NOT NULL,
          transfer_code VARCHAR(32) NULL DEFAULT NULL,
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
          INDEX idx_pay_transfer_code (transfer_code),
          INDEX idx_pay_user (user_id),
          INDEX idx_pay_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Bổ sung cột transfer_code nếu bảng đã tạo từ bản cũ
      const [cols] = await db.query("SHOW COLUMNS FROM payment_orders LIKE 'transfer_code'");
      if (!cols || cols.length === 0) {
        await db.query("ALTER TABLE payment_orders ADD COLUMN transfer_code VARCHAR(32) NULL DEFAULT NULL AFTER order_code");
        await db.query("ALTER TABLE payment_orders ADD INDEX idx_pay_transfer_code (transfer_code)");
        console.log("💳 [PAYOS] Added transfer_code column to payment_orders");
      }

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
      bankCode: process.env.VIETQR_BANK_CODE || "MB",
      bankName: process.env.VIETQR_BANK_NAME || "MB BANK",
      bankAccount: process.env.VIETQR_BANK_ACCOUNT || "0396605617",
      userBankName: process.env.VIETQR_ACCOUNT_NAME || "PHAM XUAN DUC",
    };
  },

  /**
   * Tạo đơn nạp tiền + mã VietQR tức thì.
   * - Nếu có cấu hình payOS trong .env: tạo payment link trên payOS (để webhook payOS nhận theo orderCode & nội dung).
   * - Luôn tạo ảnh VietQR theo thông tin tài khoản MB (0396605617 - PHAM XUAN DUC) qua vietqr.vn/api/vietqr/generate (fallback img.vietqr.io).
   */
  async createPaymentOrder(userId, { package_id, amount_vnd } = {}) {
    const pkg = findPackageByIdOrAmount(package_id, amount_vnd) || TOPUP_PACKAGES.find(p => p.id === "pkg_50k");
    if (!pkg) {
      return { success: false, message: "Gói nạp không hợp lệ!" };
    }

    const cfg = this.getEnvConfig();
    const orderCode = generateOrderCode();
    const transferCode = generateTransferCode();
    const expiresInSec = 15 * 60;

    let bankCode = cfg.bankCode;
    let bankName = cfg.bankName;
    let accountNumber = cfg.bankAccount;
    let accountName = cfg.userBankName;
    let paymentLinkId = null;
    let checkoutUrl = null;
    let qrRaw = null;
    let finalDescription = transferCode;
    let provider = "vietqr";

    // Nếu đã cấu hình payOS đầy đủ, đăng ký thêm payment-request trên payOS
    if (cfg.clientId && cfg.apiKey && cfg.checksumKey) {
      try {
        const returnUrl = `${cfg.publicBaseUrl}/?payment=success&orderCode=${orderCode}`;
        const cancelUrl = `${cfg.publicBaseUrl}/?payment=cancel&orderCode=${orderCode}`;
        const signPayload = {
          amount: pkg.amount_vnd,
          cancelUrl,
          description: transferCode,
          orderCode,
          returnUrl,
        };
        const signature = signPayosData(signPayload, cfg.checksumKey);

        const requestBody = {
          orderCode,
          amount: pkg.amount_vnd,
          description: transferCode,
          items: [
            {
              name: `Goi ${pkg.label} (${pkg.ecoin.toLocaleString("vi-VN")} Ecoin)`,
              quantity: 1,
              price: pkg.amount_vnd,
            },
          ],
          cancelUrl,
          returnUrl,
          expiredAt: Math.floor(Date.now() / 1000) + expiresInSec,
          signature,
        };

        const response = await fetch(PAYOS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-client-id": cfg.clientId,
            "x-api-key": cfg.apiKey,
          },
          body: JSON.stringify(requestBody),
        });

        const json = await response.json().catch(() => null);
        if (response.ok && json?.code === "00" && json?.data) {
          const d = json.data;
          provider = "payos";
          paymentLinkId = d.paymentLinkId || null;
          checkoutUrl = d.checkoutUrl || null;
          qrRaw = d.qrCode || null;
          if (d.accountNumber) accountNumber = d.accountNumber;
          if (d.accountName) accountName = d.accountName;
          if (d.description) finalDescription = d.description;
          if (d.bin && BANK_BIN_TO_NAME[String(d.bin)]) {
            bankCode = BANK_BIN_TO_NAME[String(d.bin)].code;
            bankName = BANK_BIN_TO_NAME[String(d.bin)].name;
          }
        } else {
          console.warn("⚠️ [PAYOS] createPaymentLink fallback to direct VietQR:", json?.desc || response.status);
        }
      } catch (err) {
        console.warn("⚠️ [PAYOS] createPaymentLink network fallback to direct VietQR:", err.message);
      }
    }

    // Tạo ảnh VietQR sắc nét từ vietqr.vn/api/vietqr/generate (fallback img.vietqr.io)
    const qrRes = await generateVietQrImage({
      amount: pkg.amount_vnd,
      bankAccount: accountNumber,
      bankCode,
      content: finalDescription,
      userBankName: accountName,
    });

    await db.query(
      `INSERT INTO payment_orders
         (order_code, transfer_code, user_id, package_id, amount_vnd, ecoin_amount, status, payment_link_id, checkout_url, qr_code)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        orderCode,
        transferCode,
        Number(userId),
        pkg.id,
        pkg.amount_vnd,
        pkg.ecoin,
        paymentLinkId,
        checkoutUrl,
        qrRaw || qrRes.qrRaw || qrRes.qrImageUrl,
      ]
    );

    return {
      success: true,
      order: {
        order_code: orderCode,
        transfer_code: transferCode,
        package_id: pkg.id,
        amount_vnd: pkg.amount_vnd,
        ecoin_amount: pkg.ecoin,
        description: finalDescription,
        bank_code: bankCode,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        checkout_url: checkoutUrl,
        qr_code: qrRaw,
        qr_image_url: qrRes.qrImageUrl,
        qr_source: qrRes.source,
        expires_in_sec: expiresInSec,
        provider,
      },
    };
  },

  /**
   * Xử lý Webhook nhận thông tin thanh toán từ payOS:
   *  - Hỗ trợ ping xác thực Webhook URL trên my.payos.vn (orderCode = 123 / description = "VQRIO123")
   *  - Verify chữ ký HMAC-SHA256 trên object `data` theo đúng tài liệu payOS
   *  - Khớp đơn PENDING theo `data.orderCode` HOẶC mã nội dung `CTPxxxxxx` trong `data.description`
   *  - Cộng Ecoin idempotent (không bao giờ cộng trùng 2 lần)
   *  - Phát Socket.IO `payment:paid` real-time về client đang online
   */
  async handleWebhook(body, { io, onlineUserSockets } = {}) {
    const { checksumKey } = this.getEnvConfig();
    if (!body || typeof body !== "object") {
      return { httpStatus: 400, payload: { success: false, message: "Invalid body" } };
    }

    const { code, success, data, signature } = body;

    // 1. Ping xác thực Webhook URL từ payOS dashboard
    if (
      !data ||
      (Number(data.orderCode) === 123 && (data.description === "VQRIO123" || !data.amount))
    ) {
      console.log("💳 [PAYOS] Received payOS webhook verification ping");
      return { httpStatus: 200, payload: { success: true, message: "Webhook verified" } };
    }

    // 2. Xác thực chữ ký HMAC-SHA256 nếu đã cấu hình PAYOS_CHECKSUM_KEY
    if (checksumKey) {
      const valid = verifyPayosWebhookSignature(data, signature, checksumKey);
      if (!valid) {
        console.warn("⚠️ [PAYOS] Invalid webhook signature for orderCode:", data?.orderCode);
        return { httpStatus: 400, payload: { success: false, message: "Invalid signature" } };
      }
    }

    // 3. Chỉ cộng tiền khi giao dịch thành công (code === "00" và success === true)
    const isSuccess = code === "00" && (success === true || success === undefined || data.code === "00");
    if (!isSuccess) {
      return { httpStatus: 200, payload: { success: true, message: "Ignored non-success webhook" } };
    }

    const orderCode = Number(data.orderCode || 0);
    const paidAmount = Number(data.amount || 0);
    const descText = String(data.description || "").toUpperCase();

    // 4. Tìm đơn nạp theo order_code trước, nếu không khớp thì tìm theo mã nội dung CTPxxxxxx
    let order = null;
    if (orderCode > 0) {
      const [orders] = await db.query(
        "SELECT * FROM payment_orders WHERE order_code = ? LIMIT 1",
        [orderCode]
      );
      order = orders[0] || null;
    }

    if (!order && descText) {
      const match = descText.match(/CTP[A-Z0-9]{6}/);
      if (match) {
        const [orders] = await db.query(
          "SELECT * FROM payment_orders WHERE transfer_code = ? ORDER BY id DESC LIMIT 1",
          [match[0]]
        );
        order = orders[0] || null;
      }
    }

    if (!order) {
      console.warn(`⚠️ [PAYOS] Order not found: orderCode=${orderCode}, desc="${descText}"`);
      return { httpStatus: 200, payload: { success: true, message: "Order not found" } };
    }

    if (order.status === "PAID") {
      return { httpStatus: 200, payload: { success: true, message: "Already processed" } };
    }

    // Kiểm tra số tiền thực nhận >= số tiền đơn hàng
    if (paidAmount < Number(order.amount_vnd)) {
      console.warn(`⚠️ [PAYOS] Underpaid order ${order.order_code}: paid=${paidAmount} < expected=${order.amount_vnd}`);
      return { httpStatus: 200, payload: { success: false, message: "Insufficient amount" } };
    }

    // 5. Idempotent atomic update: chỉ cộng tiền nếu chuyển trạng thái PENDING -> PAID thành công
    const [upd] = await db.query(
      `UPDATE payment_orders
       SET status = 'PAID', payos_reference = ?, paid_at = NOW(), raw_webhook = ?
       WHERE id = ? AND status = 'PENDING'`,
      [data.reference || null, JSON.stringify(body).slice(0, 3000), order.id]
    );

    if (upd.affectedRows === 0) {
      return { httpStatus: 200, payload: { success: true, message: "Already processed" } };
    }

    // 6. Cộng Ecoin vào tài khoản người chơi
    await db.query(
      "UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?",
      [Number(order.ecoin_amount), Number(order.user_id)]
    );
    const [[userRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [Number(order.user_id)]);
    const newEcoin = Number(userRow?.ecoin || 0);

    console.log(
      `✅ [PAYOS] PAID order #${order.order_code} (${order.transfer_code || "-"}) | user=${order.user_id} | +${order.ecoin_amount.toLocaleString()} Ecoin (VND=${paidAmount.toLocaleString()}) -> balance=${newEcoin.toLocaleString()}`
    );

    // 7. Đẩy sự kiện real-time về tất cả các socket đang online của người chơi
    const payloadEvt = {
      order_code: Number(order.order_code),
      transfer_code: order.transfer_code || null,
      amount_vnd: Number(order.amount_vnd),
      ecoin_added: Number(order.ecoin_amount),
      ecoin: newEcoin,
    };
    const sockSet = onlineUserSockets?.get(Number(order.user_id));
    if (sockSet && io) {
      for (const sid of sockSet) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.emit("payment:paid", payloadEvt);
      }
    }

    return { httpStatus: 200, payload: { success: true, order_code: Number(order.order_code), ecoin: newEcoin } };
  },

  async getOrderStatus(userId, orderCode) {
    const [rows] = await db.query(
      "SELECT order_code, transfer_code, user_id, package_id, amount_vnd, ecoin_amount, status, paid_at FROM payment_orders WHERE order_code = ? AND user_id = ? LIMIT 1",
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
      transfer_code: order.transfer_code,
      amount_vnd: Number(order.amount_vnd),
      ecoin_amount: Number(order.ecoin_amount),
      ecoin: currentEcoin,
      paid_at: order.paid_at,
    };
  },
};

export default payosService;
