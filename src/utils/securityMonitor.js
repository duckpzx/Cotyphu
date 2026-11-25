/**
 * Client-side Anti-Tamper & Security Telemetry Sensor
 * Phát hiện âm thầm các thao tác khả nghi phía trình duyệt:
 *  - Mở DevTools (F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U / thay đổi kích thước khung cửa sổ)
 *  - Gửi fetch/XHR bất thường tới API nhạy cảm hoặc chỉnh sửa tham số
 *  - Chỉnh sửa localStorage (playerData.ecoin / role)
 * Tự động gửi báo cáo kèm device_fingerprint về POST /api/security/report (có debounce chống spam).
 */
(function initSecurityMonitor() {
  if (typeof window === "undefined" || window.__securityMonitorLoaded) return;
  window.__securityMonitorLoaded = true;

  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const lastReportedAt = new Map(); // event_type -> timestamp
  const COOLDOWN_MS = 12000;

  function computeFingerprint() {
    try {
      const raw = [
        navigator.platform || "",
        navigator.language || "",
        screen.width + "x" + screen.height + "x" + screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        navigator.hardwareConcurrency || "",
      ].join("|");
      let hash = 5381;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
      }
      return "fp_" + (hash >>> 0).toString(16);
    } catch {
      return "fp_unknown";
    }
  }

  const FINGERPRINT = computeFingerprint();

  function getStoredUser() {
    try {
      const raw = localStorage.getItem("playerData");
      if (!raw) return { user_id: null, username: null, token: localStorage.getItem("token") || null };
      const parsed = JSON.parse(raw);
      return {
        user_id: parsed?.user?.id || null,
        username: parsed?.user?.username || parsed?.user?.name || null,
        token: parsed?.token || localStorage.getItem("token") || null,
      };
    } catch {
      return { user_id: null, username: null, token: null };
    }
  }

  function report(eventType, detail = {}) {
    const now = Date.now();
    const prev = lastReportedAt.get(eventType) || 0;
    if (now - prev < COOLDOWN_MS) return;
    lastReportedAt.set(eventType, now);

    const u = getStoredUser();
    const body = JSON.stringify({
      event_type: eventType,
      user_id: u.user_id,
      username: u.username,
      fingerprint: FINGERPRINT,
      page: window.location.pathname,
      detail,
    });

    try {
      if (nativeFetch) {
        const headers = { "Content-Type": "application/json" };
        if (u.token) headers.Authorization = `Bearer ${u.token}`;
        nativeFetch("/api/security/report", {
          method: "POST",
          headers,
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  }

  // ── 1. Phát hiện phím tắt mở DevTools (F12, Ctrl+Shift+I/J/C, Ctrl+U) ──
  window.addEventListener("keydown", (e) => {
    const key = (e.key || "").toUpperCase();
    const isF12 = key === "F12";
    const isInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(key);
    const isViewSource = (e.ctrlKey || e.metaKey) && key === "U";
    if (isF12 || isInspect || isViewSource) {
      report("DEVTOOLS_SHORTCUT", {
        key: isF12 ? "F12" : isViewSource ? "Ctrl+U" : `Ctrl+Shift+${key}`,
      });
    }
  }, true);

  // ── 2. Phát hiện cửa sổ DevTools đang mở (outer - inner > 165px) ──
  let devtoolsWasOpen = false;
  setInterval(() => {
    const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
    const heightDiff = Math.abs(window.outerHeight - window.innerHeight);
    const isOpen = widthDiff > 165 || heightDiff > 165;
    if (isOpen && !devtoolsWasOpen) {
      devtoolsWasOpen = true;
      report("DEVTOOLS_OPEN", { widthDiff, heightDiff });
    } else if (!isOpen) {
      devtoolsWasOpen = false;
    }
  }, 3000);

  // ── 3. Giám sát fetch() bất thường tới API nhạy cảm (vd: tự gọi /api/admin, POST /shop, /users từ Console) ──
  if (nativeFetch) {
    window.fetch = function monitoredFetch(input, init) {
      try {
        const url = typeof input === "string" ? input : (input?.url || "");
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        // Gọi vào /api/admin từ trang game chính là dấu hiệu thăm dò rõ rệt
        if (url.includes("/api/admin") && !window.location.pathname.startsWith("/admin")) {
          report("FETCH_TAMPER", { url, method, reason: "probe_admin_from_game" });
        }
        // Kiểm tra payload đáng ngờ khi sửa ecoin/role trực tiếp qua fetch
        if (init?.body && typeof init.body === "string" && /"role"\s*:\s*"admin"|is_banned|muted_until/i.test(init.body)) {
          report("FETCH_TAMPER", { url, method, reason: "suspicious_privilege_payload" });
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  // ── 4. Giám sát sửa trái phép localStorage (ecoin / role) từ tab Application/Console ──
  let lastSnapshot = null;
  function captureSnapshot() {
    try {
      const p = JSON.parse(localStorage.getItem("playerData") || "null");
      if (!p?.user) return null;
      return { id: p.user.id, role: p.user.role || "user", ecoin: Number(p.user.ecoin || 0) };
    } catch {
      return null;
    }
  }
  lastSnapshot = captureSnapshot();
  setInterval(() => {
    const cur = captureSnapshot();
    if (lastSnapshot && cur && cur.id === lastSnapshot.id) {
      if (cur.role !== lastSnapshot.role && cur.role === "admin") {
        report("STORAGE_TAMPER", { field: "role", from: lastSnapshot.role, to: cur.role });
      }
    }
    lastSnapshot = cur;
  }, 4000);
})();
