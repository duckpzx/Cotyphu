import crypto from "crypto";
import db from "../config/db.js";

const PAYOS_API_URL = "https://api-merchant.payos.vn/v2/payment-requests";
const VIETQR_GENERATE_URL = "https://vietqr.vn/api/vietqr/generate";

/**
 * Bảng gói nạp chuẩn mặc định — Mốc chuẩn: 50,000 VND = 350,000 Ecoin (7.0x)
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

export const SUPPORTED_BANKS = [
  { code: "MB",   name: "MB BANK" },
  { code: "VCB",  name: "VIETCOMBANK" },
  { code: "ICB",  name: "VIETINBANK" },
  { code: "BIDV", name: "BIDV" },
  { code: "TCB",  name: "TECHCOMBANK" },
  { code: "ACB",  name: "ACB" },
  { code: "VPB",  name: "VPBANK" },
  { code: "TPB",  name: "TPBANK" },
  { code: "STB",  name: "SACOMBANK" },
  { code: "VIB",  name: "VIB" },
  { code: "OCB",  name: "OCB" },
  { code: "MSB",  name: "MSB" },
];

const BANK_BIN_TO_NAME = {
  "970422": { code: "MB",   name: "MB BANK" },
  "970436": { code: "VCB",  name: "VIETCOMBANK" },
  "970415": { code: "ICB",  name: "VIETINBANK" },
  "970418": { code: "BIDV", name: "BIDV" },
  "970407": { code: "TCB",  name: "TECHCOMBANK" },
  "970416": { code: "ACB",  name: "ACB" },
  "970432": { code: "VPB",  name: "VPBANK" },
  "970423": { code: "TPB",  name: "TPBANK" },
  "970403": { code: "STB",  name: "SACOMBANK" },
  "970441": { code: "VIB",  name: "VIB" },
};

function maskSecret(val) {
  if (!val) return "";
  const s = String(val);
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 3)}${"•".repeat(Math.min(10, s.length - 7))}${s.slice(-4)}`;
}

export function findPackageByIdOrAmount(packageId, amountVnd, packagesList = TOPUP_PACKAGES) {
  const list = Array.isArray(packagesList) && packagesList.length ? packagesList : TOPUP_PACKAGES;
  if (packageId) {
    const byId = list.find(p => p.id === String(packageId));
    if (byId) return byId;
  }
  if (amountVnd) {
    const byAmt = list.find(p => Number(p.amount_vnd) === Number(amountVnd));
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
  const nowPart = Date.now() % 1000000000;
  const randPart = Math.floor(100 + Math.random() * 900);
  return Number(`${nowPart}${randPart}`);
}

function generateTransferCode() {
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

let _settingsCache = null;
let _settingsCacheAt = 0;

function sanitizePackages(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return TOPUP_PACKAGES;
  const cleaned = [];
  for (let i = 0; i < rawList.length; i++) {
    const p = rawList[i] || {};
    const amount = Math.round(Number(p.amount_vnd || 0));
    const ecoin = Math.round(Number(p.ecoin || 0));
    if (amount < 1000 || ecoin < 1000) continue;
    const id = String(p.id || `pkg_${amount}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
    const label = String(p.label || (amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}K`)).slice(0, 16);
    const bonus = String(p.bonus || "").slice(0, 20);
    cleaned.push({ id, amount_vnd: amount, ecoin, label, bonus });
  }
  return cleaned.length ? cleaned : TOPUP_PACKAGES;
}

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

      const [cols] = await db.query("SHOW COLUMNS FROM payment_orders LIKE 'transfer_code'");
      if (!cols || cols.length === 0) {
        await db.query("ALTER TABLE payment_orders ADD COLUMN transfer_code VARCHAR(32) NULL DEFAULT NULL AFTER order_code");
        await db.query("ALTER TABLE payment_orders ADD INDEX idx_pay_transfer_code (transfer_code)");
        console.log("💳 [PAYOS] Added transfer_code column to payment_orders");
      }

      // Bổ sung các cột ghi nhận giao dịch ngoại lệ (chỉ khi có tiền thật về qua Webhook nhưng không tự khớp)
      const [exCols] = await db.query("SHOW COLUMNS FROM payment_orders LIKE 'exception_reason'");
      if (!exCols || exCols.length === 0) {
        await db.query(`
          ALTER TABLE payment_orders
            ADD COLUMN exception_reason VARCHAR(48) NULL DEFAULT NULL AFTER status,
            ADD COLUMN exception_detail VARCHAR(255) NULL DEFAULT NULL AFTER exception_reason,
            ADD COLUMN paid_amount_vnd INT NULL DEFAULT NULL AFTER amount_vnd
        `);
        console.log("💳 [PAYOS] Added exception tracking columns to payment_orders");
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_settings (
          id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
          bank_code VARCHAR(16) NOT NULL DEFAULT 'MB',
          bank_name VARCHAR(64) NOT NULL DEFAULT 'MB BANK',
          bank_account VARCHAR(64) NOT NULL DEFAULT '0396605617',
          account_name VARCHAR(128) NOT NULL DEFAULT 'PHAM XUAN DUC',
          payos_client_id VARCHAR(128) NULL DEFAULT NULL,
          payos_api_key VARCHAR(128) NULL DEFAULT NULL,
          payos_checksum_key VARCHAR(128) NULL DEFAULT NULL,
          qr_expire_minutes INT NOT NULL DEFAULT 15,
          maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
          packages_json LONGTEXT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Đảm bảo luôn có dòng cấu hình id = 1
      await db.query(
        `INSERT IGNORE INTO payment_settings
          (id, bank_code, bank_name, bank_account, account_name, qr_expire_minutes, maintenance_mode)
         VALUES (1, ?, ?, ?, ?, 15, 0)`,
        [
          process.env.VIETQR_BANK_CODE || "MB",
          process.env.VIETQR_BANK_NAME || "MB BANK",
          process.env.VIETQR_BANK_ACCOUNT || "0396605617",
          process.env.VIETQR_ACCOUNT_NAME || "PHAM XUAN DUC",
        ]
      );

      console.log("💳 [PAYOS] Verified payment_orders & payment_settings tables");
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

  invalidateSettingsCache() {
    _settingsCache = null;
    _settingsCacheAt = 0;
  },

  /**
   * Lấy cấu hình thanh toán hiệu lực (ưu tiên DB payment_settings, fallback .env).
   */
  async getEffectiveConfig() {
    const now = Date.now();
    if (_settingsCache && now - _settingsCacheAt < 5000) {
      return _settingsCache;
    }

    const env = this.getEnvConfig();
    let row = null;
    try {
      const [rows] = await db.query("SELECT * FROM payment_settings WHERE id = 1 LIMIT 1");
      row = rows[0] || null;
    } catch {
      // Nếu bảng chưa tồn tại trong unit test không DB, fallback env
    }

    let packages = TOPUP_PACKAGES;
    if (row?.packages_json) {
      try {
        packages = sanitizePackages(JSON.parse(row.packages_json));
      } catch {
        packages = TOPUP_PACKAGES;
      }
    }

    const cfg = {
      bankCode: (row?.bank_code || env.bankCode || "MB").trim().toUpperCase(),
      bankName: (row?.bank_name || env.bankName || "MB BANK").trim().toUpperCase(),
      bankAccount: (row?.bank_account || env.bankAccount || "0396605617").trim(),
      userBankName: (row?.account_name || env.userBankName || "PHAM XUAN DUC").trim().toUpperCase(),
      clientId: (row?.payos_client_id || env.clientId || "").trim(),
      apiKey: (row?.payos_api_key || env.apiKey || "").trim(),
      checksumKey: (row?.payos_checksum_key || env.checksumKey || "").trim(),
      qrExpireMinutes: Math.max(3, Math.min(60, Number(row?.qr_expire_minutes || 15))),
      maintenanceMode: Boolean(row?.maintenance_mode),
      publicBaseUrl: env.publicBaseUrl,
      packages,
      updatedAt: row?.updated_at || null,
    };

    _settingsCache = cfg;
    _settingsCacheAt = now;
    return cfg;
  },

  async getPackages() {
    const cfg = await this.getEffectiveConfig();
    return cfg.packages;
  },

  async getAdminSettings() {
    const cfg = await this.getEffectiveConfig();
    return {
      success: true,
      settings: {
        bank_code: cfg.bankCode,
        bank_name: cfg.bankName,
        bank_account: cfg.bankAccount,
        account_name: cfg.userBankName,
        qr_expire_minutes: cfg.qrExpireMinutes,
        maintenance_mode: cfg.maintenanceMode,
        packages: cfg.packages,
        payos_configured: Boolean(cfg.clientId && cfg.apiKey && cfg.checksumKey),
        has_client_id: Boolean(cfg.clientId),
        has_api_key: Boolean(cfg.apiKey),
        has_checksum_key: Boolean(cfg.checksumKey),
        client_id_masked: maskSecret(cfg.clientId),
        api_key_masked: maskSecret(cfg.apiKey),
        checksum_key_masked: maskSecret(cfg.checksumKey),
        updated_at: cfg.updatedAt,
      },
      supported_banks: SUPPORTED_BANKS,
      default_packages: TOPUP_PACKAGES,
    };
  },

  async saveAdminSettings(payload = {}) {
    const cur = await this.getEffectiveConfig();
    const bankCode = String(payload.bank_code || cur.bankCode).trim().toUpperCase().slice(0, 16);
    const matchedBank = SUPPORTED_BANKS.find(b => b.code === bankCode);
    const bankName = String(payload.bank_name || matchedBank?.name || cur.bankName).trim().toUpperCase().slice(0, 64);
    const bankAccount = String(payload.bank_account ?? cur.bankAccount).replace(/\s+/g, "").slice(0, 64);
    const accountName = String(payload.account_name ?? cur.userBankName).trim().toUpperCase().slice(0, 128);
    const qrExpireMinutes = Math.max(3, Math.min(60, Math.round(Number(payload.qr_expire_minutes ?? cur.qrExpireMinutes) || 15)));
    const maintenanceMode = payload.maintenance_mode ? 1 : 0;

    if (!bankAccount) {
      return { success: false, message: "Số tài khoản ngân hàng không được để trống!" };
    }
    if (!accountName) {
      return { success: false, message: "Tên chủ tài khoản không được để trống!" };
    }

    let clientId = cur.clientId || null;
    let apiKey = cur.apiKey || null;
    let checksumKey = cur.checksumKey || null;

    if (payload.clear_payos_keys) {
      clientId = null;
      apiKey = null;
      checksumKey = null;
    } else {
      if (typeof payload.payos_client_id === "string" && payload.payos_client_id.trim()) {
        clientId = payload.payos_client_id.trim();
      }
      if (typeof payload.payos_api_key === "string" && payload.payos_api_key.trim()) {
        apiKey = payload.payos_api_key.trim();
      }
      if (typeof payload.payos_checksum_key === "string" && payload.payos_checksum_key.trim()) {
        checksumKey = payload.payos_checksum_key.trim();
      }
    }

    const packages = payload.reset_packages
      ? TOPUP_PACKAGES
      : (Array.isArray(payload.packages) ? sanitizePackages(payload.packages) : cur.packages);

    await db.query(
      `INSERT INTO payment_settings
         (id, bank_code, bank_name, bank_account, account_name, payos_client_id, payos_api_key, payos_checksum_key, qr_expire_minutes, maintenance_mode, packages_json)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bank_code = VALUES(bank_code),
         bank_name = VALUES(bank_name),
         bank_account = VALUES(bank_account),
         account_name = VALUES(account_name),
         payos_client_id = VALUES(payos_client_id),
         payos_api_key = VALUES(payos_api_key),
         payos_checksum_key = VALUES(payos_checksum_key),
         qr_expire_minutes = VALUES(qr_expire_minutes),
         maintenance_mode = VALUES(maintenance_mode),
         packages_json = VALUES(packages_json)`,
      [
        bankCode,
        bankName,
        bankAccount,
        accountName,
        clientId,
        apiKey,
        checksumKey,
        qrExpireMinutes,
        maintenanceMode,
        JSON.stringify(packages),
      ]
    );

    this.invalidateSettingsCache();
    return await this.getAdminSettings();
  },

  /**
   * Tạo đơn nạp tiền + mã VietQR tức thì (đọc cấu hình động từ Admin Dashboard).
   */
  async createPaymentOrder(userId, { package_id, amount_vnd } = {}) {
    const cfg = await this.getEffectiveConfig();
    if (cfg.maintenanceMode) {
      return { success: false, message: "Cổng nạp tiền đang tạm bảo trì. Vui lòng quay lại sau!" };
    }

    const pkg =
      findPackageByIdOrAmount(package_id, amount_vnd, cfg.packages) ||
      cfg.packages.find(p => p.id === "pkg_50k") ||
      cfg.packages[0];
    if (!pkg) {
      return { success: false, message: "Gói nạp không hợp lệ!" };
    }

    const orderCode = generateOrderCode();
    const transferCode = generateTransferCode();
    const expiresInSec = cfg.qrExpireMinutes * 60;

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
              name: `Goi ${pkg.label} (${Number(pkg.ecoin).toLocaleString("vi-VN")} Ecoin)`,
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
   * Phát sự kiện Socket.IO `payment:paid` về client đang online.
   */
  _emitPaidSocket(order, newEcoin, { io, onlineUserSockets } = {}) {
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
  },

  /**
   * Xử lý Webhook nhận thông tin thanh toán từ payOS.
   */
  async handleWebhook(body, { io, onlineUserSockets } = {}) {
    const { checksumKey } = await this.getEffectiveConfig();
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

    // 2. Xác thực chữ ký HMAC-SHA256 nếu đã cấu hình CHECKSUM_KEY
    if (checksumKey) {
      const valid = verifyPayosWebhookSignature(data, signature, checksumKey);
      if (!valid) {
        console.warn("⚠️ [PAYOS] Invalid webhook signature for orderCode:", data?.orderCode);
        return { httpStatus: 400, payload: { success: false, message: "Invalid signature" } };
      }
    }

    // 3. Chỉ cộng tiền khi giao dịch thành công
    const isSuccess = code === "00" && (success === true || success === undefined || data.code === "00");
    if (!isSuccess) {
      return { httpStatus: 200, payload: { success: true, message: "Ignored non-success webhook" } };
    }

    const orderCode = Number(data.orderCode || 0);
    const paidAmount = Number(data.amount || 0);
    const descText = String(data.description || "").toUpperCase();

    // 4. Tìm đơn nạp theo order_code hoặc mã nội dung CTPxxxxxx
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
      // Ngoại lệ 1: Có tiền thật vào ngân hàng qua Webhook nhưng sai/thiếu mã nội dung CK
      const exOrderCode = orderCode > 0 ? orderCode : generateOrderCode();
      await db.query(
        `INSERT IGNORE INTO payment_orders
           (order_code, transfer_code, user_id, package_id, amount_vnd, paid_amount_vnd, ecoin_amount, status, exception_reason, exception_detail, payos_reference, raw_webhook)
         VALUES (?, ?, 0, 'unmatched', ?, ?, 0, 'PENDING', 'UNMATCHED_CONTENT', ?, ?, ?)`,
        [
          exOrderCode,
          descText.slice(0, 30) || "KHONG_CO_MA",
          paidAmount,
          paidAmount,
          `Tiền đã vào (${paidAmount.toLocaleString("vi-VN")}đ) nhưng nội dung "${descText || "(trống)"}" không khớp mã đơn nào`,
          data.reference || null,
          JSON.stringify(body).slice(0, 3000),
        ]
      ).catch(() => {});
      console.warn(`⚠️ [PAYOS] Recorded UNMATCHED_CONTENT exception: orderCode=${orderCode}, desc="${descText}"`);
      return { httpStatus: 200, payload: { success: true, message: "Recorded unmatched exception" } };
    }

    if (order.status === "PAID") {
      return { httpStatus: 200, payload: { success: true, message: "Already processed" } };
    }

    // Ngoại lệ 2: Tiền về sau khi mã QR đã hết hạn (EXPIRED) hoặc đã bị hủy (CANCELLED)
    if (order.status === "EXPIRED" || order.status === "CANCELLED") {
      await db.query(
        `UPDATE payment_orders
         SET paid_amount_vnd = ?, exception_reason = 'EXPIRED_PAID',
             exception_detail = ?, payos_reference = ?, raw_webhook = ?
         WHERE id = ?`,
        [
          paidAmount,
          `Khách chuyển ${paidAmount.toLocaleString("vi-VN")}đ sau khi mã QR đã ${order.status}`,
          data.reference || null,
          JSON.stringify(body).slice(0, 3000),
          order.id,
        ]
      );
      console.warn(`⚠️ [PAYOS] Recorded EXPIRED_PAID exception for order ${order.order_code}`);
      return { httpStatus: 200, payload: { success: true, message: "Recorded expired payment exception" } };
    }

    // Ngoại lệ 3: Khách chuyển thiếu tiền so với mệnh giá gói nạp
    if (paidAmount < Number(order.amount_vnd)) {
      await db.query(
        `UPDATE payment_orders
         SET paid_amount_vnd = ?, exception_reason = 'UNDERPAID',
             exception_detail = ?, payos_reference = ?, raw_webhook = ?
         WHERE id = ?`,
        [
          paidAmount,
          `Chuyển thiếu tiền: nhận ${paidAmount.toLocaleString("vi-VN")}đ / yêu cầu ${Number(order.amount_vnd).toLocaleString("vi-VN")}đ`,
          data.reference || null,
          JSON.stringify(body).slice(0, 3000),
          order.id,
        ]
      );
      console.warn(`⚠️ [PAYOS] Underpaid order ${order.order_code}: paid=${paidAmount} < expected=${order.amount_vnd}`);
      return { httpStatus: 200, payload: { success: false, message: "Recorded underpaid exception" } };
    }

    // 5. Idempotent atomic update: tự động chuyển PENDING -> PAID
    const [upd] = await db.query(
      `UPDATE payment_orders
       SET status = 'PAID', paid_amount_vnd = ?, exception_reason = NULL, exception_detail = NULL,
           payos_reference = ?, paid_at = NOW(), raw_webhook = ?
       WHERE id = ? AND status = 'PENDING'`,
      [paidAmount, data.reference || null, JSON.stringify(body).slice(0, 3000), order.id]
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

    this._emitPaidSocket(order, newEcoin, { io, onlineUserSockets });

    return { httpStatus: 200, payload: { success: true, order_code: Number(order.order_code), ecoin: newEcoin } };
  },

  async _syncSingleOrderWithPayos(order, { io, onlineUserSockets } = {}) {
    if (!order || order.status !== "PENDING") return null;
    try {
      const cfg = await this.getEffectiveConfig();
      if (!cfg.clientId || !cfg.apiKey) return null;
      const lookupId = order.payment_link_id || order.order_code;
      const payRes = await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${lookupId}`, {
        method: "GET",
        headers: {
          "x-client-id": cfg.clientId,
          "x-api-key": cfg.apiKey,
        },
      });
      const payJson = await payRes.json().catch(() => null);
      const pData = payJson?.data;
      if (!payRes.ok || payJson?.code !== "00" || !pData) return null;

      const pStatus = String(pData.status || "").toUpperCase();
      const paidAmt = Number(pData.amountPaid || pData.amount || 0);
      if (pStatus === "PAID" && paidAmt >= Number(order.amount_vnd)) {
        const [upd] = await db.query(
          `UPDATE payment_orders
           SET status = 'PAID', paid_amount_vnd = ?, exception_reason = NULL, exception_detail = NULL,
               payos_reference = ?, paid_at = NOW()
           WHERE id = ? AND status = 'PENDING'`,
          [paidAmt, pData.transactions?.[0]?.reference || pData.id || null, order.id]
        );
        if (upd.affectedRows > 0) {
          await db.query(
            "UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?",
            [Number(order.ecoin_amount), Number(order.user_id)]
          );
          const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [Number(order.user_id)]);
          const newEcoin = Number(uRow?.ecoin || 0);
          console.log(
            `✅ [PAYOS-SYNC] PAID order #${order.order_code} (${order.transfer_code}) | user=${order.user_id} | +${Number(order.ecoin_amount).toLocaleString()} Ecoin -> balance=${newEcoin.toLocaleString()}`
          );
          this._emitPaidSocket(order, newEcoin, { io, onlineUserSockets });
          return { status: "PAID", ecoin: newEcoin, paid_at: new Date() };
        }
        return { status: "PAID" };
      }
      if (pStatus === "CANCELLED" || pStatus === "EXPIRED") {
        await db.query("UPDATE payment_orders SET status = ? WHERE id = ? AND status = 'PENDING'", [pStatus, order.id]).catch(() => {});
        return { status: pStatus };
      }
    } catch (err) {
      console.warn("⚠️ [PAYOS-SYNC] poll error:", err.message);
    }
    return null;
  },

  async syncRecentPendingOrders({ io, onlineUserSockets } = {}) {
    const [pending] = await db.query(
      `SELECT id, order_code, transfer_code, user_id, package_id, amount_vnd, ecoin_amount, status, payment_link_id
       FROM payment_orders
       WHERE status = 'PENDING' AND payment_link_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
       ORDER BY id DESC
       LIMIT 8`
    ).catch(() => [[]]);
    let synced = 0;
    for (const ord of pending || []) {
      const r = await this._syncSingleOrderWithPayos(ord, { io, onlineUserSockets });
      if (r?.status === "PAID") synced++;
    }
    return synced;
  },

  async getOrderStatus(userId, orderCode, { io, onlineUserSockets } = {}) {
    const [rows] = await db.query(
      "SELECT id, order_code, transfer_code, user_id, package_id, amount_vnd, ecoin_amount, status, payment_link_id, paid_at FROM payment_orders WHERE order_code = ? AND user_id = ? LIMIT 1",
      [Number(orderCode), Number(userId)]
    );
    const order = rows[0];
    if (!order) return { success: false, message: "Không tìm thấy đơn nạp" };

    // Dự phòng cực quan trọng khi chạy localhost (payOS không gọi được Webhook về localhost):
    // Chủ động đối soát trạng thái trực tiếp từ API payOS mỗi khi client polling!
    if (order.status === "PENDING") {
      const synced = await this._syncSingleOrderWithPayos(order, { io, onlineUserSockets });
      if (synced?.status) {
        order.status = synced.status;
        if (synced.paid_at) order.paid_at = synced.paid_at;
        if (synced.ecoin !== undefined) {
          return {
            success: true,
            status: "PAID",
            order_code: order.order_code,
            transfer_code: order.transfer_code,
            amount_vnd: Number(order.amount_vnd),
            ecoin_amount: Number(order.ecoin_amount),
            ecoin: synced.ecoin,
            paid_at: order.paid_at,
          };
        }
      }
    }

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

  /**
   * Thống kê doanh thu + lịch sử giao dịch + top nạp cho Admin Dashboard.
   */
  async getAdminOverviewAndOrders({ status = "all", search = "", limit = 100 } = {}) {
    // Chủ động đối soát nhanh các đơn PENDING vừa tạo (hữu ích khi chạy localhost không nhận được Webhook)
    await this.syncRecentPendingOrders().catch(() => {});

    // Tự động đánh dấu EXPIRED các đơn PENDING bình thường quá hạn (không động vào đơn đang là ngoại lệ có tiền về)
    const cfg = await this.getEffectiveConfig();
    const expireMin = Math.max(30, cfg.qrExpireMinutes * 2);
    await db.query(
      `UPDATE payment_orders
       SET status = 'EXPIRED'
       WHERE status = 'PENDING' AND exception_reason IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [expireMin]
    ).catch(() => {});

    const [[kpi]] = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_vnd ELSE 0 END), 0) AS total_revenue_vnd,
        COALESCE(SUM(CASE WHEN status = 'PAID' AND DATE(paid_at) = CURDATE() THEN amount_vnd ELSE 0 END), 0) AS today_revenue_vnd,
        COALESCE(SUM(CASE WHEN status = 'PAID' AND YEAR(paid_at) = YEAR(CURDATE()) AND MONTH(paid_at) = MONTH(CURDATE()) THEN amount_vnd ELSE 0 END), 0) AS month_revenue_vnd,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN ecoin_amount ELSE 0 END), 0) AS total_ecoin_issued,
        SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        COUNT(*) AS total_orders
      FROM payment_orders
    `);

    // Biểu đồ doanh thu 7 ngày gần nhất
    const [dailyRows] = await db.query(`
      SELECT
        DATE_FORMAT(paid_at, '%Y-%m-%d') AS day,
        COALESCE(SUM(amount_vnd), 0) AS revenue_vnd,
        COUNT(*) AS orders
      FROM payment_orders
      WHERE status = 'PAID' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE_FORMAT(paid_at, '%Y-%m-%d')
      ORDER BY day ASC
    `);

    // Top 5 người chơi nạp nhiều nhất
    const [topSpenders] = await db.query(`
      SELECT
        po.user_id,
        u.username,
        u.name AS display_name,
        COUNT(*) AS paid_orders,
        COALESCE(SUM(po.amount_vnd), 0) AS total_vnd,
        COALESCE(SUM(po.ecoin_amount), 0) AS total_ecoin
      FROM payment_orders po
      LEFT JOIN users u ON u.id = po.user_id
      WHERE po.status = 'PAID'
      GROUP BY po.user_id, u.username, u.name
      ORDER BY total_vnd DESC
      LIMIT 5
    `);

    // Danh sách đơn nạp theo bộ lọc
    const where = [];
    const params = [];
    if (status === "EXCEPTION") {
      where.push("po.exception_reason IS NOT NULL AND po.status <> 'PAID'");
    } else if (status && status !== "all") {
      where.push("po.status = ?");
      params.push(String(status).toUpperCase());
    }
    if (search && String(search).trim()) {
      const like = `%${String(search).trim()}%`;
      where.push("(CAST(po.order_code AS CHAR) LIKE ? OR po.transfer_code LIKE ? OR po.payos_reference LIKE ? OR u.username LIKE ? OR u.name LIKE ?)");
      params.push(like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const lim = Math.max(10, Math.min(300, Number(limit) || 100));

    const [orders] = await db.query(
      `SELECT
         po.id, po.order_code, po.transfer_code, po.user_id,
         po.package_id, po.amount_vnd, po.paid_amount_vnd, po.ecoin_amount, po.status,
         po.exception_reason, po.exception_detail,
         po.payos_reference, po.paid_at, po.created_at,
         u.username, u.name AS display_name
       FROM payment_orders po
       LEFT JOIN users u ON u.id = po.user_id
       ${whereSql}
       ORDER BY po.id DESC
       LIMIT ?`,
      [...params, lim]
    );

    // Danh sách riêng các giao dịch ngoại lệ cần Admin đối soát
    const [exceptions] = await db.query(
      `SELECT
         po.id, po.order_code, po.transfer_code, po.user_id,
         po.package_id, po.amount_vnd, po.paid_amount_vnd, po.ecoin_amount, po.status,
         po.exception_reason, po.exception_detail,
         po.payos_reference, po.created_at,
         u.username, u.name AS display_name
       FROM payment_orders po
       LEFT JOIN users u ON u.id = po.user_id
       WHERE po.exception_reason IS NOT NULL AND po.status <> 'PAID'
       ORDER BY po.id DESC
       LIMIT 30`
    );

    const totalOrders = Number(kpi?.total_orders || 0);
    const paidCount = Number(kpi?.paid_count || 0);

    return {
      success: true,
      stats: {
        total_revenue_vnd: Number(kpi?.total_revenue_vnd || 0),
        today_revenue_vnd: Number(kpi?.today_revenue_vnd || 0),
        month_revenue_vnd: Number(kpi?.month_revenue_vnd || 0),
        total_ecoin_issued: Number(kpi?.total_ecoin_issued || 0),
        paid_count: paidCount,
        pending_count: Number(kpi?.pending_count || 0),
        exception_count: exceptions.length,
        total_orders: totalOrders,
        conversion_rate: totalOrders > 0 ? Math.round((paidCount / totalOrders) * 100) : 0,
      },
      daily_chart: dailyRows || [],
      top_spenders: topSpenders || [],
      exceptions: exceptions || [],
      orders: orders || [],
    };
  },

  /**
   * Đối soát ngoại lệ: CHỈ cho phép Admin duyệt các đơn có `exception_reason` (đã có tiền thật vào qua Webhook).
   */
  async adminApproveOrder(orderCode, adminId, { io, onlineUserSockets } = {}) {
    const code = Number(orderCode);
    const [rows] = await db.query("SELECT * FROM payment_orders WHERE order_code = ? LIMIT 1", [code]);
    const order = rows[0];
    if (!order) return { success: false, message: "Không tìm thấy đơn nạp!" };
    if (order.status === "PAID") return { success: false, message: "Đơn này đã được cộng Ecoin trước đó!" };
    if (!order.exception_reason) {
      return { success: false, message: "Hệ thống nạp tự động — chỉ được duyệt thủ công các giao dịch NGOẠI LỆ có tiền vào!" };
    }
    if (!order.user_id || Number(order.user_id) <= 0) {
      return { success: false, message: "Đơn sai nội dung chưa gắn tài khoản người chơi — cần đối chiếu UID trước khi cộng!" };
    }

    const ref = order.payos_reference
      ? `${order.payos_reference} (ADMIN#${adminId})`
      : `ADMIN_EX_#${adminId}`;
    const [upd] = await db.query(
      `UPDATE payment_orders
       SET status = 'PAID', payos_reference = ?, paid_at = NOW()
       WHERE id = ? AND status <> 'PAID' AND exception_reason IS NOT NULL`,
      [ref, order.id]
    );
    if (upd.affectedRows === 0) {
      return { success: false, message: "Không thể duyệt đơn ngoại lệ này!" };
    }

    // Nếu là UNDERPAID thì quy đổi Ecoin theo số tiền thực nhận (tỷ lệ 7 Ecoin/1đ), còn lại cộng đúng ecoin_amount của đơn
    const ecoinToAdd = order.exception_reason === "UNDERPAID" && Number(order.paid_amount_vnd) > 0
      ? Math.round(Number(order.paid_amount_vnd) * 7)
      : Number(order.ecoin_amount);

    await db.query(
      "UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?",
      [ecoinToAdd, Number(order.user_id)]
    );
    const [[u]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [Number(order.user_id)]);
    const newEcoin = Number(u?.ecoin || 0);

    console.log(
      `✅ [ADMIN-EX] Admin #${adminId} resolved ${order.exception_reason} order #${code} | user=${order.user_id} | +${ecoinToAdd.toLocaleString()} Ecoin`
    );

    this._emitPaidSocket({ ...order, ecoin_amount: ecoinToAdd }, newEcoin, { io, onlineUserSockets });
    return {
      success: true,
      message: `Đã xử lý ngoại lệ #${code} (${order.exception_reason}) và cộng +${ecoinToAdd.toLocaleString("vi-VN")} Ecoin!`,
      order_code: code,
      ecoin: newEcoin,
    };
  },

  /**
   * Đóng/từ chối ngoại lệ (không cộng tiền — ví dụ đã hoàn tiền thủ công cho khách).
   */
  async adminCancelOrder(orderCode) {
    const code = Number(orderCode);
    const [upd] = await db.query(
      "UPDATE payment_orders SET status = 'CANCELLED', exception_reason = NULL WHERE order_code = ? AND exception_reason IS NOT NULL AND status <> 'PAID'",
      [code]
    );
    if (upd.affectedRows === 0) {
      return { success: false, message: "Chỉ có thể đóng các giao dịch ngoại lệ chưa xử lý!" };
    }
    return { success: true, message: `Đã đóng ngoại lệ #${code}` };
  },

  /**
   * Test ký HMAC-SHA256 & ping Webhook nội bộ cho Admin kiểm tra nhanh.
   */
  async adminTestWebhookPing() {
    const cfg = await this.getEffectiveConfig();
    const sampleData = {
      orderCode: 123,
      amount: 3000,
      description: "VQRIO123",
      accountNumber: cfg.bankAccount,
      reference: "TEST_PING_" + Date.now(),
      transactionDateTime: new Date().toISOString().slice(0, 19).replace("T", " "),
      currency: "VND",
      paymentLinkId: "test-ping",
      code: "00",
      desc: "Thanh cong",
    };
    const key = cfg.checksumKey || "demo_checksum_key";
    const sig = signPayosData(sampleData, key);
    const valid = verifyPayosWebhookSignature(sampleData, sig, key);
    const res = await this.handleWebhook({
      code: "00",
      desc: "success",
      success: true,
      data: sampleData,
      signature: sig,
    });
    return {
      success: res.httpStatus === 200 && valid,
      hmac_verified: valid,
      using_live_checksum: Boolean(cfg.checksumKey),
      signature_preview: sig.slice(0, 20) + "...",
      webhook_response: res.payload,
    };
  },
};

export default payosService;
