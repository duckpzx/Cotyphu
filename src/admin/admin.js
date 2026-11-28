/**
 * Admin Dashboard Frontend Controller — Tactical NOC / Terminal HUD
 * Giao tiếp với REST API /api/admin/* qua JWT Bearer Token.
 */

const TOKEN_KEY = "cotyphu_admin_token";
let currentTab = "overview";
let currentAdmin = null;
let autoRefreshEnabled = true;
let autoRefreshTimer = null;
let isTabFetching = false;

const TAB_POLL_MS = {
  overview: 3000,
  security: 3000,
  rooms: 3000,
  blacklist: 4000,
  audit: 4000,
  users: 5000,
  questions: 12000,
  tarots: 12000,
  characters: 12000,
  sprites: 60000,
  console: 2000,
  payments: 5000,
  support: 4000,
};

// Cache dữ liệu hiện tại để mở modal nhanh
let cacheUsers = [];
let cacheQuestions = [];
let cacheTarots = [];
let cacheCharacters = [];

const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("vi-VN");
  } catch {
    return String(d);
  }
}

function startHudClock() {
  const tick = () => {
    const el = $("hudClock");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-GB", { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

function showToast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = `${type === "error" ? "[ERR] " : "[OK] "}${message}`;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/admin${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({ success: false, message: "Phản hồi không hợp lệ" }));

  if (res.status === 401 && path !== "/login") {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error(data.message || "Phiên đăng nhập hết hạn");
  }
  return data;
}

function openModal(title, html) {
  $("modalTitle").textContent = `[ ${title} ]`;
  $("modalBody").innerHTML = html;
  $("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  $("modalOverlay").classList.add("hidden");
  $("modalBody").innerHTML = "";
}

function showLogin() {
  stopAutoRefresh();
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("adminProfile").textContent = `ADMIN: ${currentAdmin?.name || currentAdmin?.username || "ROOT"}`;
  loadTab(currentTab);
  scheduleAutoRefresh();
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

function updateLiveIndicator() {
  const intervalSec = Math.round((TAB_POLL_MS[currentTab] || 3000) / 1000);
  const label = $("liveToggleLabel");
  const btn = $("liveToggleBtn");
  if (label) label.textContent = autoRefreshEnabled ? `LIVE ${intervalSec}s` : "PAUSED";
  if (btn) btn.style.opacity = autoRefreshEnabled ? "1" : "0.55";
}

function markSyncedNow() {
  const el = $("syncStatusText");
  if (!el) return;
  const sec = Math.round((TAB_POLL_MS[currentTab] || 3000) / 1000);
  const t = new Date().toLocaleTimeString("en-GB", { hour12: false });
  el.textContent = autoRefreshEnabled
    ? `auto-sync: ${sec}s • synced ${t}`
    : `auto-sync: paused • synced ${t}`;
}

function isUserEditingFilter() {
  const active = document.activeElement;
  if (!active || !$("tabContent")?.contains(active)) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
}

function scheduleAutoRefresh() {
  stopAutoRefresh();
  updateLiveIndicator();
  if (!autoRefreshEnabled || !currentAdmin) return;

  const ms = TAB_POLL_MS[currentTab] || 3000;
  autoRefreshTimer = setTimeout(async () => {
    const modalOpen = !$("modalOverlay")?.classList.contains("hidden");
    if (!document.hidden && !modalOpen && !isUserEditingFilter() && !isTabFetching) {
      await loadTab(currentTab, { silent: true });
    }
    scheduleAutoRefresh();
  }, ms);
}

const TAB_TITLES = {
  overview: "[ TỔNG QUAN HỆ THỐNG ]",
  users: "[ QUẢN LÝ NGƯỜI CHƠI & BAN / MUTE ]",
  rooms: "[ GIÁM SÁT PHÒNG ĐẤU — LIVE & DB ]",
  questions: "[ NGÂN HÀNG CÂU HỎI QUIZ ]",
  tarots: "[ KHO THẺ TAROT ]",
  characters: "[ NHÂN VẬT & KỸ NĂNG ]",
  audit: "[ NHẬT KÝ QUẢN TRỊ — AUDIT LOG ]",
  security: "[ GIÁM SÁT AN NINH & CHỐNG GIAN LẬN — SOC ]",
  blacklist: "[ IP BLACKLIST & PHIÊN ĐĂNG NHẬP ]",
  sprites: "[ ASSET & SPRITE STUDIO — NPC / SKIN / TAROT / PHÔNG NỀN / TINH CẦU ]",
  console: "[ SYSTEM CONSOLE — LIVE TAIL TOÀN HỆ THỐNG ]",
  payments: "[ QUẢN LÝ NẠP TIỀN, TÀI KHOẢN GỐC & DOANH THU ]",
  support: "[ TRUNG TÂM HỖ TRỢ NGƯỜI CHƠI — AI / SLA / CSAT ]",
};

function setTabHtml(html, silent = _silentRender) {
  const el = $("tabContent");
  const prevScroll = window.scrollY;
  if (silent) {
    el.innerHTML = html;
    window.scrollTo(0, prevScroll);
    return;
  }
  el.classList.remove("hud-enter");
  void el.offsetWidth;
  el.innerHTML = html;
  el.classList.add("hud-enter");
}

let _silentRender = false;

async function loadTab(tab, { silent = false } = {}) {
  const prevTab = currentTab;
  currentTab = tab;
  $("pageTitle").textContent = TAB_TITLES[tab] || "[ ADMIN ]";
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  // Giữ nguyên bộ lọc hiện tại nếu đang silent refresh trên cùng 1 tab
  const keepFilters = silent && prevTab === tab;
  const userSearch = keepFilters ? ($("userSearchInput")?.value || "") : "";
  const userStatus = keepFilters ? ($("userStatusSelect")?.value || "all") : "all";
  const roomStatus = keepFilters ? ($("roomStatusSelect")?.value || "all") : "all";
  const qSearch    = keepFilters ? ($("qSearchInput")?.value || "") : "";
  const secSev     = keepFilters ? ($("secSevSelect")?.value || "all") : "all";
  const secType    = keepFilters ? ($("secTypeSelect")?.value || "all") : "all";
  const secSearch  = keepFilters ? ($("secSearchInput")?.value || "") : "";
  const conSearch  = keepFilters ? ($("consoleSearchInput")?.value || "") : "";
  const payStatus  = keepFilters ? ($("payStatusSelect")?.value || "all") : "all";
  const paySearch  = keepFilters ? ($("paySearchInput")?.value || "") : "";
  const supStatus  = keepFilters ? ($("supStatusSelect")?.value || "all") : "all";
  const supCat     = keepFilters ? ($("supCatSelect")?.value || "all") : "all";
  const supSearch  = keepFilters ? ($("supSearchInput")?.value || "") : "";

  // Không tự ghi đè DOM khi admin đang chỉnh cấu hình ngân hàng / gói nạp / tri thức AI / SLA
  if (silent && tab === "payments" && paymentSubTab !== "history") {
    return;
  }
  if (silent && tab === "support" && supportSubTab !== "queue") {
    return;
  }

  if (prevTab !== tab) stopSpritePreview();
  if (!silent) {
    $("tabContent").innerHTML = `<div class="empty-state">&gt; đang tải telemetry...</div>`;
  }

  isTabFetching = true;
  _silentRender = silent;
  try {
    if (tab === "overview") await renderOverview();
    else if (tab === "users") await renderUsers(userSearch, userStatus);
    else if (tab === "rooms") await renderRooms(roomStatus);
    else if (tab === "questions") await renderQuestions(qSearch);
    else if (tab === "tarots") await renderTarots();
    else if (tab === "characters") await renderCharacters();
    else if (tab === "audit") await renderAuditLogs();
    else if (tab === "security") await renderSecurity(secSev, secType, secSearch);
    else if (tab === "blacklist") await renderBlacklistAndSessions();
    else if (tab === "sprites") await renderSpriteStudio();
    else if (tab === "console") await renderSystemConsole(consoleCategory, conSearch);
    else if (tab === "payments") await renderPayments(payStatus, paySearch);
    else if (tab === "support") await renderSupport(supStatus, supCat, supSearch);
    markSyncedNow();
  } catch (err) {
    if (!silent) {
      setTabHtml(`<div class="error-box">[ERR] ${esc(err.message)}</div>`);
    }
  } finally {
    _silentRender = false;
    isTabFetching = false;
    if (!silent) scheduleAutoRefresh();
  }
}

// ═══════════════════════════════════════════════════════════════
//  1. OVERVIEW
// ═══════════════════════════════════════════════════════════════
async function renderOverview() {
  const [res, annRes] = await Promise.all([
    api("/overview"),
    api("/world-announcement").catch(() => ({ message: "" })),
  ]);
  const s = res.stats || {};
  const logs = res.recent_logs || [];
  const worldAnnMsg = annRes?.message || "";
  const onlinePct = s.total_users > 0 ? Math.min(100, Math.round((s.online_users / s.total_users) * 100)) : 0;

  setTabHtml(`
    <div class="kpi-grid">
      <div class="kpi-card" data-jump-tab="users" style="cursor:pointer" title="Xem quản lý người chơi">
        <div class="kpi-label">TỔNG NGƯỜI CHƠI</div>
        <div class="kpi-value">${fmtMoney(s.total_users)}</div>
        <div class="kpi-sub">admin: <span class="cyan-val">${s.total_admins || 0}</span></div>
      </div>
      <div class="kpi-card" data-jump-tab="rooms" style="cursor:pointer" title="Xem phòng đấu">
        <div class="kpi-label">ĐANG ONLINE</div>
        <div class="kpi-value accent-green">${s.online_users || 0}</div>
        <div class="kpi-sub">socket kết nối (${onlinePct}%)</div>
        <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${onlinePct}%"></div></div>
      </div>
      <div class="kpi-card" data-jump-tab="rooms" style="cursor:pointer" title="Xem phòng đấu">
        <div class="kpi-label">TRẬN ĐANG ĐẤU / ĐÃ LƯU</div>
        <div class="kpi-value cyan-val">${s.active_matches || 0} <span class="muted">/</span> ${fmtMoney(s.total_matches || 0)}</div>
        <div class="kpi-sub">bot ai tiếp quản: <span class="amber-val">${s.active_bots || 0}</span></div>
      </div>
      <div class="kpi-card" data-jump-tab="payments" style="cursor:pointer" title="Xem quản lý nạp tiền & doanh thu">
        <div class="kpi-label">DOANH THU NẠP TIỀN</div>
        <div class="kpi-value accent-green" style="font-size:22px">${fmtVnd(s.total_revenue_vnd || 0)}</div>
        <div class="kpi-sub">hôm nay: <span class="cyan-val">${fmtVnd(s.today_revenue_vnd || 0)}</span> • ${s.paid_orders || 0} đơn</div>
      </div>
      <div class="kpi-card" data-jump-tab="security" style="cursor:pointer" title="Xem an ninh & ban/mute">
        <div class="kpi-label">BAN / MUTE</div>
        <div class="kpi-value red-val">${s.banned_users || 0} <span class="muted">/</span> <span class="amber-val">${s.muted_users || 0}</span></div>
        <div class="kpi-sub">đang khóa / cấm chat</div>
      </div>

      <div class="kpi-card" data-jump-tab="characters" style="cursor:pointer" title="Xem nhân vật & trang phục">
        <div class="kpi-label">NHÂN VẬT / TRANG PHỤC</div>
        <div class="kpi-value">${s.total_characters || 0} <span class="muted">/</span> <span class="cyan-val">${s.total_skins || 0}</span></div>
        <div class="kpi-sub">nhân vật &amp; skin ngoại trang</div>
      </div>
      <div class="kpi-card" data-jump-tab="sprites" data-jump-sub="maps" style="cursor:pointer" title="Xem bản đồ & sảnh chờ">
        <div class="kpi-label">BẢN ĐỒ / SẢNH CHỜ</div>
        <div class="kpi-value">${s.total_maps || 0} <span class="muted">/</span> <span class="cyan-val">${s.total_lobbies || 0}</span></div>
        <div class="kpi-sub">giao diện BXH &amp; Lab: <span class="ok-txt">${s.total_scenes || 0}</span></div>
      </div>
      <div class="kpi-card" data-jump-tab="sprites" style="cursor:pointer" title="Kho ảnh đại diện & biểu cảm">
        <div class="kpi-label">AVATAR / EMOJI</div>
        <div class="kpi-value">${s.total_avatars || 0} <span class="muted">/</span> <span class="cyan-val">${s.total_emojis || 0}</span></div>
        <div class="kpi-sub">khung đại diện &amp; biểu cảm chat</div>
      </div>
      <div class="kpi-card" data-jump-tab="tarots" style="cursor:pointer" title="Xem thẻ Tarot & câu hỏi Quiz">
        <div class="kpi-label">TAROT / CÂU HỎI QUIZ</div>
        <div class="kpi-value">${s.total_tarots || 0} <span class="muted">/</span> <span class="cyan-val">${s.total_questions || 0}</span></div>
        <div class="kpi-sub">thẻ bài &amp; ngân hàng ô 18</div>
      </div>
      <div class="kpi-card" data-jump-tab="sprites" data-jump-sub="audio" style="cursor:pointer" title="Xem cấu hình âm thanh & NPC">
        <div class="kpi-label">ÂM THANH / NPC</div>
        <div class="kpi-value">${s.total_audio_tracks || 19} <span class="muted">/</span> <span class="cyan-val">${s.total_npcs || 0}</span></div>
        <div class="kpi-sub">tùy chỉnh: <span class="ok-txt">${s.custom_audio_tracks || 0}</span> • NPC &amp; Rương</div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="panel-head" style="flex-wrap:wrap;gap:8px">
        <h3>[ THÔNG BÁO CHẠY CHỮ GRADIENT — CHAT THẾ GIỚI ]</h3>
        <span class="muted">phát real-time tới tất cả người chơi đang online</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="ovWorldAnnInput" class="input-sm" style="flex:1;min-width:260px" maxlength="360" placeholder="Nhập thông báo sự kiện / bảo trì / chúc mừng..." value="${esc(worldAnnMsg)}" />
        <button type="button" id="ovWorldAnnSendBtn" class="btn btn-primary btn-sm">PHÁT NGAY</button>
        <button type="button" id="ovWorldAnnResetBtn" class="btn btn-ghost btn-sm">↩ MẶC ĐỊNH</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ LIVE AUDIT TAIL ]</h3>
        <span class="muted">$ tail -n 15 admin_audit_logs</span>
      </div>
      ${renderAuditTableHtml(logs)}
    </div>
  `);

  $("ovWorldAnnSendBtn")?.addEventListener("click", async () => {
    const msg = ($("ovWorldAnnInput")?.value || "").trim();
    const r = await api("/world-announcement", { method: "PUT", body: JSON.stringify({ message: msg }) });
    if (r?.success) showToast("Đã phát thông báo chạy chữ lên Chat Thế Giới!");
    else showToast(r?.message || "Lỗi phát thông báo", "error");
  });
  $("ovWorldAnnResetBtn")?.addEventListener("click", async () => {
    const r = await api("/world-announcement", { method: "PUT", body: JSON.stringify({ message: "" }) });
    if (r?.success) {
      if ($("ovWorldAnnInput")) $("ovWorldAnnInput").value = r.message || "";
      showToast("Đã khôi phục dòng chào mừng mặc định!");
    }
  });

  document.querySelectorAll("[data-jump-tab]").forEach(card => {
    card.addEventListener("click", () => {
      const targetTab = card.dataset.jumpTab;
      const targetSub = card.dataset.jumpSub;
      if (targetTab === "sprites" && targetSub) studioSubTab = targetSub;
      if (targetTab) loadTab(targetTab);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  2. USERS & BAN / MUTE
// ═══════════════════════════════════════════════════════════════
async function renderUsers(search = "", status = "all") {
  const qs = new URLSearchParams({ search, status, limit: 80 }).toString();
  const res = await api(`/users?${qs}`);
  cacheUsers = res.users || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <input id="userSearchInput" type="text" placeholder="tìm ID, username, tên, email..." value="${esc(search)}" />
          <select id="userStatusSelect">
            <option value="all" ${status === "all" ? "selected" : ""}>Tất cả trạng thái</option>
            <option value="banned" ${status === "banned" ? "selected" : ""}>Đang bị khóa (Ban)</option>
            <option value="muted" ${status === "muted" ? "selected" : ""}>Đang cấm chat (Mute)</option>
            <option value="admin" ${status === "admin" ? "selected" : ""}>Quản trị viên (Admin)</option>
          </select>
          <button id="userFilterBtn" class="btn btn-primary btn-sm">LỌC</button>
        </div>
        <div class="muted">${res.total || cacheUsers.length} entries</div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>NGƯỜI CHƠI</th>
              <th>ECOIN</th>
              <th>VAI TRÒ</th>
              <th>TRẠNG THÁI</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${cacheUsers.length === 0 ? `<tr><td colspan="6" class="empty-state">Không tìm thấy người chơi</td></tr>` : cacheUsers.map(u => `
              <tr>
                <td class="cyan-val">#${u.id}</td>
                <td>
                  <div><strong>${esc(u.name || u.username)}</strong> <span class="muted">@${esc(u.username)}</span></div>
                  <div class="muted">${esc(u.email || "")}</div>
                </td>
                <td class="cyan-val"><strong>${fmtMoney(u.ecoin)}</strong></td>
                <td>${u.role === "admin" ? `<span class="badge badge-admin">[ADMIN]</span>` : `<span class="badge badge-offline">[USER]</span>`}</td>
                <td>
                  ${u.is_online ? `<span class="badge badge-online">[ONLINE]</span>` : `<span class="badge badge-offline">[OFFLINE]</span>`}
                  ${u.is_banned_active ? `<span class="badge badge-ban" title="${esc(u.ban_reason)}">[BAN${u.banned_until ? "" : ":PERM"}]</span>` : ""}
                  ${u.is_muted_active ? `<span class="badge badge-mute" title="${esc(u.mute_reason)}">[MUTE]</span>` : ""}
                </td>
                <td class="actions-cell">
                  <button class="btn btn-secondary btn-sm" data-act="edit-user" data-id="${u.id}">Sửa</button>
                  ${u.is_banned_active
                    ? `<button class="btn btn-success btn-sm" data-act="unban-user" data-id="${u.id}">Mở khóa</button>`
                    : `<button class="btn btn-danger btn-sm" data-act="ban-user" data-id="${u.id}">Khóa</button>`}
                  ${u.is_muted_active
                    ? `<button class="btn btn-success btn-sm" data-act="unmute-user" data-id="${u.id}">Gỡ mute</button>`
                    : `<button class="btn btn-warning btn-sm" data-act="mute-user" data-id="${u.id}">Cấm chat</button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  $("userFilterBtn").onclick = () => renderUsers($("userSearchInput").value, $("userStatusSelect").value);
  $("userSearchInput").onkeydown = (e) => { if (e.key === "Enter") $("userFilterBtn").click(); };
}

function openEditUserModal(userId) {
  const u = cacheUsers.find(x => Number(x.id) === Number(userId));
  if (!u) return;
  openModal(`CHỈNH SỬA NGƯỜI CHƠI #${u.id}`, `
    <form id="editUserForm">
      <div class="field"><label>Tên hiển thị</label><input name="name" value="${esc(u.name || "")}" required /></div>
      <div class="form-grid-2">
        <div class="field"><label>Ecoin</label><input name="ecoin" type="number" min="0" value="${Number(u.ecoin || 0)}" required /></div>
        <div class="field">
          <label>Vai trò</label>
          <select name="role">
            <option value="user" ${u.role !== "admin" ? "selected" : ""}>User</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
      </div>
    </form>
  `);
  $("editUserForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await api(`/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: fd.get("name"), ecoin: Number(fd.get("ecoin")), role: fd.get("role") }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderUsers($("userSearchInput")?.value || "", $("userStatusSelect")?.value || "all");
  };
}

function openBanUserModal(userId) {
  const u = cacheUsers.find(x => Number(x.id) === Number(userId));
  if (!u) return;
  openModal(`KHÓA TÀI KHOẢN: ${u.name || u.username}`, `
    <form id="banUserForm">
      <div class="field">
        <label>Thời hạn khóa</label>
        <select name="duration_minutes">
          <option value="60">1 giờ</option>
          <option value="1440" selected>24 giờ (1 ngày)</option>
          <option value="10080">7 ngày</option>
          <option value="43200">30 ngày</option>
          <option value="">Vĩnh viễn</option>
        </select>
      </div>
      <div class="field">
        <label>Lý do khóa</label>
        <input name="reason" value="Vi phạm quy định cộng đồng" required />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-danger">Xác nhận khóa &amp; ngắt kết nối</button>
      </div>
    </form>
  `);
  $("banUserForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dur = fd.get("duration_minutes");
    const res = await api(`/users/${u.id}/ban`, {
      method: "POST",
      body: JSON.stringify({ duration_minutes: dur ? Number(dur) : null, reason: fd.get("reason") }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderUsers($("userSearchInput")?.value || "", $("userStatusSelect")?.value || "all");
  };
}

function openMuteUserModal(userId) {
  const u = cacheUsers.find(x => Number(x.id) === Number(userId));
  if (!u) return;
  openModal(`CẤM CHAT (MUTE): ${u.name || u.username}`, `
    <form id="muteUserForm">
      <div class="field">
        <label>Thời hạn cấm chat</label>
        <select name="duration_minutes">
          <option value="15">15 phút</option>
          <option value="60" selected>1 giờ</option>
          <option value="360">6 giờ</option>
          <option value="1440">24 giờ</option>
          <option value="10080">7 ngày</option>
        </select>
      </div>
      <div class="field">
        <label>Lý do cấm chat</label>
        <input name="reason" value="Spam / ngôn từ không phù hợp" required />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-warning">Xác nhận cấm chat</button>
      </div>
    </form>
  `);
  $("muteUserForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await api(`/users/${u.id}/mute`, {
      method: "POST",
      body: JSON.stringify({ duration_minutes: Number(fd.get("duration_minutes")), reason: fd.get("reason") }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderUsers($("userSearchInput")?.value || "", $("userStatusSelect")?.value || "all");
  };
}

// ═══════════════════════════════════════════════════════════════
//  3. ROOMS
// ═══════════════════════════════════════════════════════════════
async function renderRooms(status = "all") {
  const res = await api(`/rooms?status=${encodeURIComponent(status)}`);
  const rooms = res.rooms || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <select id="roomStatusSelect">
            <option value="all" ${status === "all" ? "selected" : ""}>Tất cả trạng thái</option>
            <option value="playing" ${status === "playing" ? "selected" : ""}>Đang chơi (playing)</option>
            <option value="waiting" ${status === "waiting" ? "selected" : ""}>Đang chờ (waiting)</option>
            <option value="finished" ${status === "finished" ? "selected" : ""}>Đã kết thúc (finished)</option>
          </select>
          <button id="roomFilterBtn" class="btn btn-primary btn-sm">LỌC</button>
        </div>
        <div class="muted">${rooms.length} rooms</div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PHÒNG</th>
              <th>CHỦ PHÒNG</th>
              <th>CHẾ ĐỘ / CƯỢC</th>
              <th>TRẠNG THÁI</th>
              <th>TRỰC TIẾP (IN-MEMORY)</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${rooms.length === 0 ? `<tr><td colspan="6" class="empty-state">Không có phòng nào</td></tr>` : rooms.map(r => `
              <tr>
                <td class="cyan-val"><strong>#${r.id}</strong> ${Number(r.is_private) === 1 ? "[LOCK]" : ""}</td>
                <td>${esc(r.host_name)}</td>
                <td>
                  <div>${esc(r.match_mode || "solo_4")} (${r.current_players}/${r.max_players})</div>
                  <div class="muted">cược: <span class="cyan-val">${fmtMoney(r.bet_ecoin)}</span></div>
                </td>
                <td><span class="badge badge-${esc(r.room_status)}">[${esc(r.room_status)}]</span></td>
                <td>
                  ${r.live_in_memory
                    ? `<div><span class="badge badge-online">[LIVE • T${r.live_turn} • ${esc(r.live_phase)}]</span></div>
                       <div class="muted">${(r.live_players || []).map(p => `${p.is_bot ? "[BOT] " : ""}${esc(p.name)} (${fmtMoney(p.cash)})`).join(" | ")}</div>`
                    : `<span class="muted">không có state live</span>`}
                </td>
                <td class="actions-cell">
                  ${r.room_status !== "finished" || r.live_in_memory
                    ? `<button class="btn btn-warning btn-sm" data-act="close-room" data-id="${r.id}">Buộc đóng</button>`
                    : ""}
                  <button class="btn btn-danger btn-sm" data-act="delete-room" data-id="${r.id}">Xóa</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);
  $("roomFilterBtn").onclick = () => renderRooms($("roomStatusSelect").value);
}

// ═══════════════════════════════════════════════════════════════
//  4. QUESTIONS (QUIZ)
// ═══════════════════════════════════════════════════════════════
async function renderQuestions(search = "") {
  const res = await api(`/questions?search=${encodeURIComponent(search)}`);
  cacheQuestions = res.questions || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <div class="toolbar">
          <input id="qSearchInput" type="text" placeholder="tìm nội dung câu hỏi..." value="${esc(search)}" />
          <button id="qSearchBtn" class="btn btn-secondary btn-sm">TÌM</button>
        </div>
        <button id="addQuestionBtn" class="btn btn-primary btn-sm">+ THÊM CÂU HỎI</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>CÂU HỎI</th>
              <th>CÁC ĐÁP ÁN</th>
              <th>ĐÚNG</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${cacheQuestions.length === 0 ? `<tr><td colspan="5" class="empty-state">Chưa có câu hỏi nào</td></tr>` : cacheQuestions.map(q => `
              <tr>
                <td class="cyan-val">#${q.id}</td>
                <td style="max-width:300px"><strong>${esc(q.question)}</strong></td>
                <td class="muted">
                  A: ${esc(q.option_a)} | B: ${esc(q.option_b)}<br/>
                  C: ${esc(q.option_c)} | D: ${esc(q.option_d)}
                </td>
                <td><span class="badge badge-online">[${esc(q.correct_answer)}]</span></td>
                <td class="actions-cell">
                  <button class="btn btn-secondary btn-sm" data-act="edit-question" data-id="${q.id}">Sửa</button>
                  <button class="btn btn-danger btn-sm" data-act="delete-question" data-id="${q.id}">Xóa</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  $("qSearchBtn").onclick = () => renderQuestions($("qSearchInput").value);
  $("qSearchInput").onkeydown = (e) => { if (e.key === "Enter") $("qSearchBtn").click(); };
  $("addQuestionBtn").onclick = () => openQuestionModal(null);
}

function openQuestionModal(id) {
  const q = id ? cacheQuestions.find(x => Number(x.id) === Number(id)) : null;
  openModal(q ? `SỬA CÂU HỎI #${q.id}` : "THÊM CÂU HỎI QUIZ MỚI", `
    <form id="questionForm">
      <div class="field"><label>Nội dung câu hỏi</label><textarea name="question" required>${esc(q?.question || "")}</textarea></div>
      <div class="form-grid-2">
        <div class="field"><label>Đáp án A</label><input name="option_a" value="${esc(q?.option_a || "")}" required /></div>
        <div class="field"><label>Đáp án B</label><input name="option_b" value="${esc(q?.option_b || "")}" required /></div>
        <div class="field"><label>Đáp án C</label><input name="option_c" value="${esc(q?.option_c || "")}" required /></div>
        <div class="field"><label>Đáp án D</label><input name="option_d" value="${esc(q?.option_d || "")}" required /></div>
      </div>
      <div class="field">
        <label>Đáp án đúng</label>
        <select name="correct_answer">
          ${["A", "B", "C", "D"].map(opt => `<option value="${opt}" ${q?.correct_answer === opt ? "selected" : ""}>${opt}</option>`).join("")}
        </select>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">${q ? "Lưu cập nhật" : "Thêm câu hỏi"}</button>
      </div>
    </form>
  `);
  $("questionForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    const res = await api(q ? `/questions/${q.id}` : "/questions", {
      method: q ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderQuestions($("qSearchInput")?.value || "");
  };
}

// ═══════════════════════════════════════════════════════════════
//  5. TAROTS
// ═══════════════════════════════════════════════════════════════
async function renderTarots() {
  const res = await api("/tarots");
  cacheTarots = res.tarots || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <div class="muted">${cacheTarots.length} tarot cards</div>
        <button id="addTarotBtn" class="btn btn-primary btn-sm">+ THÊM THẺ TAROT</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>TÊN THẺ</th>
              <th>EFFECT TYPE</th>
              <th>HỒI CHIÊU</th>
              <th>MÔ TẢ</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${cacheTarots.map(t => `
              <tr>
                <td class="cyan-val">#${t.id}</td>
                <td><strong>${esc(t.name)}</strong><div class="muted">${esc(t.icon || "")}</div></td>
                <td><code>${esc(t.effect_type || "")}</code></td>
                <td class="amber-val">${Number(t.cooldown_seconds || 0)} lượt</td>
                <td style="max-width:300px" class="muted">${esc(t.description || "")}</td>
                <td class="actions-cell">
                  <button class="btn btn-secondary btn-sm" data-act="edit-tarot" data-id="${t.id}">Sửa</button>
                  <button class="btn btn-danger btn-sm" data-act="delete-tarot" data-id="${t.id}">Xóa</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);
  $("addTarotBtn").onclick = () => openTarotModal(null);
}

function openTarotModal(id) {
  const t = id ? cacheTarots.find(x => Number(x.id) === Number(id)) : null;
  openModal(t ? `CHỈNH SỬA THẺ #${t.id}` : "THÊM THẺ TAROT MỚI", `
    <form id="tarotForm">
      <div class="form-grid-2">
        <div class="field"><label>Tên thẻ</label><input name="name" value="${esc(t?.name || "")}" required /></div>
        <div class="field"><label>Hồi chiêu (số lần tung)</label><input name="cooldown_seconds" type="number" min="0" value="${Number(t?.cooldown_seconds || 3)}" /></div>
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Effect Type</label><input name="effect_type" value="${esc(t?.effect_type || "")}" placeholder="vd: extra_roll, destroy_enemy_house..." /></div>
        <div class="field"><label>Đường dẫn Icon</label><input name="icon" value="${esc(t?.icon || "")}" placeholder="assets/..." /></div>
      </div>
      <div class="field"><label>Mô tả hiệu ứng</label><textarea name="description">${esc(t?.description || "")}</textarea></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu thẻ</button>
      </div>
    </form>
  `);
  $("tarotForm").onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await api(t ? `/tarots/${t.id}` : "/tarots", {
      method: t ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderTarots();
  };
}

// ═══════════════════════════════════════════════════════════════
//  6. CHARACTERS & SKILLS
// ═══════════════════════════════════════════════════════════════
async function renderCharacters() {
  const res = await api("/characters");
  cacheCharacters = res.characters || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head"><div class="muted">${cacheCharacters.length} characters</div></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>NHÂN VẬT</th>
              <th>GIÁ BÁN</th>
              <th>NỘI TẠI (PASSIVE)</th>
              <th>CHIÊU CUỐI (ACTIVE)</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${cacheCharacters.map(c => `
              <tr>
                <td class="cyan-val">#${c.id}</td>
                <td><strong>${esc(c.name)}</strong></td>
                <td class="cyan-val">${fmtMoney(c.price)}</td>
                <td>
                  <div><strong>${esc(c.passive_name || "Chưa có")}</strong></div>
                  <div class="muted"><code>${esc(c.passive_type || "none")}</code> (${c.passive_value ?? 0})</div>
                </td>
                <td>
                  <div><strong>${esc(c.active_name || "Chưa có")}</strong> <span class="amber-val">[${c.energy_cost ?? 100}E]</span></div>
                  <div class="muted"><code>${esc(c.active_type || "none")}</code> • target: ${esc(c.target_mode || "none")}</div>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-act="edit-char" data-id="${c.id}">Cấu hình</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

function openCharacterModal(id) {
  const c = cacheCharacters.find(x => Number(x.id) === Number(id));
  if (!c) return;
  openModal(`CẤU HÌNH NHÂN VẬT: ${c.name}`, `
    <form id="charForm">
      <div class="form-grid-2">
        <div class="field"><label>Tên nhân vật</label><input name="name" value="${esc(c.name || "")}" required /></div>
        <div class="field"><label>Giá bán (Ecoin)</label><input name="price" type="number" min="0" value="${Number(c.price || 0)}" /></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:12px 0" />
      <div class="form-grid-2">
        <div class="field"><label>Tên Nội tại</label><input name="passive_name" value="${esc(c.passive_name || "")}" /></div>
        <div class="field"><label>Passive Type</label><input name="passive_type" value="${esc(c.passive_type || "")}" /></div>
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Giá trị Nội tại (%)</label><input name="passive_value" type="number" value="${Number(c.passive_value || 0)}" /></div>
        <div class="field"><label>Mô tả Nội tại</label><input name="passive_desc" value="${esc(c.passive_desc || "")}" /></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:12px 0" />
      <div class="form-grid-2">
        <div class="field"><label>Tên Chiêu cuối</label><input name="active_name" value="${esc(c.active_name || "")}" /></div>
        <div class="field"><label>Active Type</label><input name="active_type" value="${esc(c.active_type || "")}" /></div>
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Giá trị Active</label><input name="active_value" type="number" value="${Number(c.active_value || 0)}" /></div>
        <div class="field"><label>Năng lượng yêu cầu</label><input name="energy_cost" type="number" value="${Number(c.energy_cost || 100)}" /></div>
      </div>
      <div class="form-grid-2">
        <div class="field">
          <label>Target Mode</label>
          <select name="target_mode">
            ${["none", "self", "enemy", "enemy_cell", "any_cell"].map(m => `<option value="${m}" ${c.target_mode === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Hiệu ứng (fx_type)</label><input name="fx_type" value="${esc(c.fx_type || "fire_ball")}" /></div>
      </div>
      <div class="field"><label>Mô tả Chiêu cuối</label><textarea name="active_desc">${esc(c.active_desc || "")}</textarea></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu cấu hình</button>
      </div>
    </form>
  `);
  $("charForm").onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await api(`/characters/${c.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderCharacters();
  };
}

// ═══════════════════════════════════════════════════════════════
//  7. AUDIT LOGS
// ═══════════════════════════════════════════════════════════════
function renderAuditTableHtml(logs) {
  if (!logs || logs.length === 0) {
    return `<div class="empty-state">Chưa có nhật ký quản trị nào</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>THỜI GIAN</th>
            <th>QUẢN TRỊ VIÊN</th>
            <th>HÀNH ĐỘNG</th>
            <th>ĐỐI TƯỢNG</th>
            <th>CHI TIẾT</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td class="muted">${fmtDate(l.created_at)}</td>
              <td><strong>${esc(l.admin_name)}</strong></td>
              <td><span class="badge badge-playing">[${esc(l.action)}]</span></td>
              <td class="cyan-val">${esc(l.target_type)} ${l.target_id ? `#${esc(l.target_id)}` : ""}</td>
              <td class="muted" style="max-width:340px;word-break:break-word">${esc(l.detail || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAuditLogs() {
  const res = await api("/audit-logs?limit=100");
  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <h3>[ AUDIT ARCHIVE ]</h3>
        <span class="muted">${(res.logs || []).length} entries</span>
      </div>
      ${renderAuditTableHtml(res.logs || [])}
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════
//  8. SECURITY TELEMETRY & ANTI-CHEAT SOC
// ═══════════════════════════════════════════════════════════════
async function renderSecurity(severity = "all", eventType = "all", search = "") {
  const qs = new URLSearchParams({ severity, event_type: eventType, search, limit: 120 }).toString();
  const [sumRes, evRes] = await Promise.all([
    api("/security/summary"),
    api(`/security/events?${qs}`),
  ]);
  const s = sumRes.summary || {};
  const events = evRes.events || [];
  const topIps = s.top_ips || [];
  const topUsers = s.top_users || [];
  const maxIpRisk = Math.max(1, ...topIps.map(x => Number(x.total_risk || 0)));
  const maxUserRisk = Math.max(1, ...topUsers.map(x => Number(x.total_risk || 0)));

  setTabHtml(`
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">SỰ KIỆN • 24H</div>
        <div class="kpi-value cyan-val">${fmtMoney(s.total_24h)}</div>
        <div class="kpi-sub">khả nghi: <span class="amber-val">${fmtMoney(s.suspicious_24h)}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">HIGH / CRITICAL • 24H</div>
        <div class="kpi-value red-val">${fmtMoney(s.high_critical_24h)}</div>
        <div class="kpi-sub">cảnh báo mức cao</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">IP KHẢ NGHI • 24H</div>
        <div class="kpi-value amber-val">${fmtMoney(s.suspect_ips_24h)}</div>
        <div class="kpi-sub">có phát sinh risk score</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">IP ĐANG CHẶN</div>
        <div class="kpi-value red-val">${fmtMoney(s.active_blacklist)}</div>
        <div class="kpi-sub">fail2ban active rules</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">MULTI-ACCOUNT IP</div>
        <div class="kpi-value amber-val">${fmtMoney(s.multi_account_ip_count)}</div>
        <div class="kpi-sub">cùng IP ≥ 2 tài khoản (7d)</div>
      </div>
    </div>

    <div class="split-grid-2">
      <div class="panel">
        <div class="panel-head">
          <h3>[ HALL OF SHAME — TOP IP KHẢ NGHI ]</h3>
          <span class="muted">7 ngày gần nhất</span>
        </div>
        ${topIps.length === 0 ? `<div class="empty-state">Chưa ghi nhận IP khả nghi</div>` : topIps.map((row, idx) => {
          const pct = Math.round((Number(row.total_risk || 0) / maxIpRisk) * 100);
          return `
            <div class="risk-row">
              <div class="risk-bar-wrap">
                <div>
                  <span class="muted">${String(idx + 1).padStart(2, "0")}</span>
                  <strong class="cyan-val" style="margin-left:6px">${esc(row.ip_address)}</strong>
                  <span class="muted" style="margin-left:8px">${esc(row.event_types || "")}</span>
                </div>
                <div class="risk-bar-track"><div class="risk-bar-fill" style="width:${pct}%"></div></div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div class="red-val"><strong>${Number(row.total_risk || 0)} pts</strong></div>
                <div class="muted">${row.event_count} hits</div>
              </div>
              <button class="btn btn-danger btn-sm" data-act="quick-block-ip" data-ip="${esc(row.ip_address)}">Chặn IP</button>
            </div>
          `;
        }).join("")}
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>[ TÀI KHOẢN RỦI RO CAO ]</h3>
          <span class="muted">theo điểm rủi ro 7d</span>
        </div>
        ${topUsers.length === 0 ? `<div class="empty-state">Chưa ghi nhận tài khoản rủi ro</div>` : topUsers.map((row, idx) => {
          const pct = Math.round((Number(row.total_risk || 0) / maxUserRisk) * 100);
          return `
            <div class="risk-row">
              <div class="risk-bar-wrap">
                <div>
                  <span class="muted">${String(idx + 1).padStart(2, "0")}</span>
                  <strong style="margin-left:6px">${esc(row.display_name)}</strong>
                  <span class="muted" style="margin-left:6px">(#${row.user_id} • ${esc(row.last_ip)})</span>
                </div>
                <div class="risk-bar-track"><div class="risk-bar-fill" style="width:${pct}%;background:var(--amber)"></div></div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div class="amber-val"><strong>${Number(row.total_risk || 0)} pts</strong></div>
                <div class="muted">${row.event_count} events</div>
              </div>
              <button class="btn btn-danger btn-sm" data-act="quick-ban-uid" data-id="${row.user_id}">Khóa TK</button>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ LIVE SECURITY TAIL ]</h3>
        <div class="toolbar">
          <input id="secSearchInput" type="text" placeholder="IP, user, UA, payload..." value="${esc(search)}" />
          <select id="secSevSelect">
            ${["all", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(lv => `<option value="${lv}" ${severity === lv ? "selected" : ""}>${lv === "all" ? "Tất cả mức độ" : lv}</option>`).join("")}
          </select>
          <select id="secTypeSelect">
            <option value="all" ${eventType === "all" ? "selected" : ""}>Tất cả loại sự kiện</option>
            ${["DEVTOOLS_OPEN", "DEVTOOLS_SHORTCUT", "FETCH_TAMPER", "STORAGE_TAMPER", "CHEAT_TURN_SPOOF", "SOCKET_FLOOD", "LOGIN_FAIL", "LOGIN_SUCCESS", "ADMIN_AUTH_FAIL", "IP_BLOCKED"].map(tp => `<option value="${tp}" ${eventType === tp ? "selected" : ""}>${tp}</option>`).join("")}
          </select>
          <button id="secFilterBtn" class="btn btn-primary btn-sm">LỌC</button>
          <button id="secExportCsvBtn" class="btn btn-secondary btn-sm">⬇ CSV</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>THỜI GIAN</th>
              <th>IP / FINGERPRINT</th>
              <th>NGƯỜI CHƠI</th>
              <th>SỰ KIỆN</th>
              <th>MỨC / RISK</th>
              <th>USER-AGENT</th>
              <th>CHI TIẾT</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${events.length === 0 ? `<tr><td colspan="8" class="empty-state">Chưa có sự kiện nào phù hợp bộ lọc</td></tr>` : events.map(ev => `
              <tr>
                <td class="muted">${fmtDate(ev.created_at)}</td>
                <td>
                  <div class="cyan-val"><strong>${esc(ev.ip_address)}</strong></div>
                  <div class="muted">${esc(ev.device_fingerprint || "—")}</div>
                </td>
                <td>${ev.user_id ? `<strong>${esc(ev.username || `#${ev.user_id}`)}</strong> <span class="muted">#${ev.user_id}</span>` : `<span class="muted">${esc(ev.username || "guest")}</span>`}</td>
                <td>
                  <code>${esc(ev.event_type)}</code>
                  <div class="muted">${esc(ev.endpoint || "")}</div>
                </td>
                <td>
                  <span class="badge badge-sev-${esc(ev.severity)}">[${esc(ev.severity)}]</span>
                  ${Number(ev.risk_score) > 0 ? `<span class="red-val" style="margin-left:4px">+${ev.risk_score}</span>` : ""}
                </td>
                <td class="ua-cell muted" title="${esc(ev.user_agent || "")}">${esc(ev.user_agent || "—")}</td>
                <td class="muted" style="max-width:240px;word-break:break-word">${esc(ev.payload_summary || "—")}</td>
                <td>
                  <button class="btn btn-danger btn-sm" data-act="quick-block-ip" data-ip="${esc(ev.ip_address)}">Chặn IP</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  $("secFilterBtn").onclick = () => renderSecurity($("secSevSelect").value, $("secTypeSelect").value, $("secSearchInput").value);
  $("secSearchInput").onkeydown = (e) => { if (e.key === "Enter") $("secFilterBtn").click(); };
  $("secExportCsvBtn").onclick = async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const exportQs = new URLSearchParams({
        severity: $("secSevSelect").value,
        event_type: $("secTypeSelect").value,
        search: $("secSearchInput").value,
      }).toString();
      const resp = await fetch(`/api/admin/security/events/export?${exportQs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Không thể xuất CSV");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security_events_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Đã tải file CSV nhật ký an ninh");
    } catch (err) {
      showToast(err.message, "error");
    }
  };
}

function openBlockIpModal(prefillIp = "") {
  openModal(`CHẶN ĐỊA CHỈ IP (BLACKLIST)`, `
    <form id="blockIpForm">
      <div class="field"><label>Địa chỉ IP</label><input name="ip_address" value="${esc(prefillIp)}" placeholder="vd: 192.168.1.55" required /></div>
      <div class="field">
        <label>Thời hạn chặn</label>
        <select name="duration_minutes">
          <option value="60">1 giờ</option>
          <option value="1440" selected>24 giờ</option>
          <option value="10080">7 ngày</option>
          <option value="">Vĩnh viễn</option>
        </select>
      </div>
      <div class="field"><label>Lý do chặn</label><input name="reason" value="Hành vi gian lận / tấn công API" required /></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-danger">Xác nhận chặn IP</button>
      </div>
    </form>
  `);
  $("blockIpForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dur = fd.get("duration_minutes");
    const res = await api("/security/blacklist", {
      method: "POST",
      body: JSON.stringify({
        ip_address: fd.get("ip_address"),
        reason: fd.get("reason"),
        duration_minutes: dur ? Number(dur) : null,
      }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    if (currentTab === "blacklist") renderBlacklistAndSessions();
    else renderSecurity();
  };
}

// ═══════════════════════════════════════════════════════════════
//  9. IP BLACKLIST & SESSIONS (MULTI-ACCOUNT DETECTION)
// ═══════════════════════════════════════════════════════════════
async function renderBlacklistAndSessions() {
  const [blRes, sessRes, sumRes] = await Promise.all([
    api("/security/blacklist"),
    api("/security/sessions?limit=80"),
    api("/security/summary"),
  ]);
  const blacklist = blRes.blacklist || [];
  const sessions = sessRes.sessions || [];
  const multiIps = sumRes.summary?.multi_account_ips || [];

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <h3>[ DANH SÁCH IP ĐANG BỊ CHẶN — FAIL2BAN ]</h3>
        <button id="addBlacklistIpBtn" class="btn btn-danger btn-sm">+ CHẶN IP MỚI</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IP ADDRESS</th>
              <th>LÝ DO</th>
              <th>NGƯỜI CHẶN</th>
              <th>HẾT HẠN</th>
              <th>LƯỢT CHẶN</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${blacklist.length === 0 ? `<tr><td colspan="6" class="empty-state">Chưa có IP nào trong danh sách chặn</td></tr>` : blacklist.map(b => `
              <tr>
                <td class="red-val"><strong>${esc(b.ip_address)}</strong></td>
                <td>${esc(b.reason)}</td>
                <td class="muted">${esc(b.banned_by_name)}</td>
                <td class="muted">${b.expires_at ? fmtDate(b.expires_at) : `<span class="badge badge-ban">[VĨNH VIỄN]</span>`}</td>
                <td class="amber-val"><strong>${Number(b.hit_count || 0)}</strong></td>
                <td><button class="btn btn-success btn-sm" data-act="unblock-ip" data-id="${b.id}">Gỡ chặn</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ PHÁT HIỆN MULTI-ACCOUNT — CÙNG IP ĐĂNG NHẬP NHIỀU TÀI KHOẢN ]</h3>
        <span class="muted">${multiIps.length} IP đáng chú ý (7 ngày)</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IP ADDRESS</th>
              <th>SỐ TÀI KHOẢN</th>
              <th>DANH SÁCH TÀI KHOẢN</th>
              <th>HOẠT ĐỘNG CUỐI</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${multiIps.length === 0 ? `<tr><td colspan="5" class="empty-state">Không phát hiện IP nào dùng chung nhiều tài khoản</td></tr>` : multiIps.map(m => `
              <tr>
                <td class="cyan-val"><strong>${esc(m.ip_address)}</strong></td>
                <td><span class="badge badge-mute">[${m.account_count} ACCOUNTS]</span></td>
                <td>${esc(m.accounts)}</td>
                <td class="muted">${fmtDate(m.last_seen)}</td>
                <td><button class="btn btn-danger btn-sm" data-act="quick-block-ip" data-ip="${esc(m.ip_address)}">Chặn IP</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ NHẬT KÝ PHIÊN ĐĂNG NHẬP — IP &amp; USER-AGENT ]</h3>
        <span class="muted">${sessions.length} phiên gần nhất</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>THỜI GIAN</th>
              <th>NGƯỜI CHƠI</th>
              <th>IP ADDRESS</th>
              <th>USER-AGENT</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.length === 0 ? `<tr><td colspan="4" class="empty-state">Chưa có lịch sử phiên</td></tr>` : sessions.map(ss => `
              <tr>
                <td class="muted">${fmtDate(ss.last_seen_at || ss.login_at)}</td>
                <td><strong>${esc(ss.display_name || `#${ss.user_id}`)}</strong> <span class="muted">#${ss.user_id}</span></td>
                <td class="cyan-val">${esc(ss.ip_address)}</td>
                <td class="ua-cell muted" title="${esc(ss.user_agent || "")}">${esc(ss.user_agent || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  $("addBlacklistIpBtn").onclick = () => openBlockIpModal("");
}

// ═══════════════════════════════════════════════════════════════
//  10. ASSET & SPRITE STUDIO (NPC / SKINS / TAROTS / BACKGROUNDS)
// ═══════════════════════════════════════════════════════════════
let spritePreviewTimer = null;
let studioSubTab = "npcs"; // npcs | skins | tarots | backgrounds | orbs | maps
let cacheSkins = [];
let cacheBackgrounds = [];
let cacheOrbs = [];
const MAP_BACKUP_KEY = "cotyphu_map_coords_backup";
let mapEditorState = {
  editingId: null,
  name: "",
  imageUrl: "/assets/nen_trochoi.jpg",
  pickedImageDataUrl: null,
  boardPath: [],
  defaultBoardPath: [],
  selectedCell: 0,
  autoAdvance: false,
  maps: [],
  activeMapId: "default",
  undoStack: [],
  redoStack: [],
};

function clonePath(arr) {
  return (arr || []).map(c => ({ ...c }));
}

function pushMapUndoSnapshot(reason = "") {
  if (!mapEditorState.boardPath?.length) return;
  mapEditorState.undoStack.push({
    boardPath: clonePath(mapEditorState.boardPath),
    selectedCell: mapEditorState.selectedCell,
    reason,
  });
  if (mapEditorState.undoStack.length > 60) mapEditorState.undoStack.shift();
  mapEditorState.redoStack = [];
  updateMapHistoryButtons();
}

function autoBackupMapCoords() {
  try {
    if (!mapEditorState.boardPath?.length) return;
    localStorage.setItem(MAP_BACKUP_KEY, JSON.stringify({
      saved_at: new Date().toISOString(),
      name: $("mapNameInput")?.value?.trim() || mapEditorState.name || "Auto-backup",
      board_path: clonePath(mapEditorState.boardPath),
    }));
  } catch (_) {}
}

function updateMapHistoryButtons() {
  if ($("mapUndoBtn")) {
    $("mapUndoBtn").disabled = mapEditorState.undoStack.length === 0;
    $("mapUndoBtn").textContent = `↶ Undo (${mapEditorState.undoStack.length})`;
  }
  if ($("mapRedoBtn")) {
    $("mapRedoBtn").disabled = mapEditorState.redoStack.length === 0;
    $("mapRedoBtn").textContent = `↷ Redo (${mapEditorState.redoStack.length})`;
  }
}

function performMapUndo() {
  if (!mapEditorState.undoStack.length) return showToast("Không có bước nào để hoàn tác", "error");
  mapEditorState.redoStack.push({
    boardPath: clonePath(mapEditorState.boardPath),
    selectedCell: mapEditorState.selectedCell,
  });
  const snap = mapEditorState.undoStack.pop();
  mapEditorState.boardPath = snap.boardPath;
  mapEditorState.selectedCell = snap.selectedCell;
  syncSelectedCellInputs();
  drawMapPinsAndPath();
  autoBackupMapCoords();
  updateMapHistoryButtons();
  showToast(`↶ Đã hoàn tác (Ctrl+Z) — còn ${mapEditorState.undoStack.length} bước`);
}

function performMapRedo() {
  if (!mapEditorState.redoStack.length) return;
  mapEditorState.undoStack.push({
    boardPath: clonePath(mapEditorState.boardPath),
    selectedCell: mapEditorState.selectedCell,
  });
  const snap = mapEditorState.redoStack.pop();
  mapEditorState.boardPath = snap.boardPath;
  mapEditorState.selectedCell = snap.selectedCell;
  syncSelectedCellInputs();
  drawMapPinsAndPath();
  autoBackupMapCoords();
  updateMapHistoryButtons();
  showToast("↷ Đã làm lại (Ctrl+Y)");
}
let lobbyStudioState = {
  presets: [],
  activeId: "default",
  previewId: null,
  editingId: null,
  editingName: "",
  timeMode: "auto",
  fixedHour: 12,
  simHour: new Date().getHours() + new Date().getMinutes() / 60,
  previewDayUrl: "/assets/ui/lobby/background_light.png",
  previewNightUrl: "/assets/ui/lobby/background_dark.png",
  pickedDayDataUrl: null,
  pickedNightDataUrl: null,
  islands: [],
  defaultIslands: [],
  selectedIslandKey: "play",
};
let sceneEditorState = {
  sceneType: "rating", // rating | lab
  editingId: null,
  name: "",
  imageUrl: "/assets/nen_23.png",
  pickedImageDataUrl: null,
  spots: [],
  defaultSpots: [],
  selectedSpotIdx: 0,
  presets: [],
  activeId: "default",
};

let spriteStudioState = {
  slot: "monster",
  mode: "idle", // idle | attack
  idleDataUrls: [],
  attackDataUrls: [],
  fps: 12,
  scale: 1,
  frameIdx: 0,
  playing: true,
};

let skinStudioState = {
  skinId: null,
  mode: "idle", // idle | run | hurt
  idleDataUrls: [],
  runDataUrls: [],
  hurtDataUrls: [],
  fps: 12,
  frameIdx: 0,
  playing: true,
};

let _weatherPreviewRaf = null;

function stopSpritePreview() {
  if (spritePreviewTimer) {
    clearInterval(spritePreviewTimer);
    spritePreviewTimer = null;
  }
  if (_weatherPreviewRaf) {
    cancelAnimationFrame(_weatherPreviewRaf);
    _weatherPreviewRaf = null;
  }
}

function naturalSortFiles(files) {
  return [...files].sort((a, b) =>
    (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function readFilesAsDataUrls(files) {
  return Promise.all(
    files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Không đọc được file ${file.name}`));
      reader.readAsDataURL(file);
    }))
  );
}

function startStudioAnimLoop(stateObj, getFramesFn, imgId = "studioPreviewImg", hudId = "studioFrameHud", useScale = true) {
  stopSpritePreview();
  const renderFrame = () => {
    const imgEl = $(imgId);
    const hudEl = $(hudId);
    if (!imgEl || !hudEl) return stopSpritePreview();

    const list = getFramesFn();
    if (!list || !list.length) {
      hudEl.textContent = "CHƯA CÓ ẢNH";
      return;
    }

    const idx = stateObj.frameIdx % list.length;
    imgEl.src = list[idx];
    if (useScale) imgEl.style.transform = `scale(${stateObj.scale || 1})`;
    hudEl.textContent = `${stateObj.mode.toUpperCase()} • ${String(idx + 1).padStart(2, "0")}/${String(list.length).padStart(2, "0")} • ${stateObj.fps} FPS`;

    if (stateObj.playing) {
      stateObj.frameIdx = (idx + 1) % list.length;
    }
  };

  renderFrame();
  const intervalMs = Math.max(33, Math.round(1000 / (stateObj.fps || 12)));
  spritePreviewTimer = setInterval(renderFrame, intervalMs);
}

function studioSubTabsHtml() {
  const tabs = [
    { key: "npcs", label: "01. NPC & Rương Kho Báu" },
    { key: "skins", label: "02. Nhân vật & Trang phục" },
    { key: "tarots", label: "03. Ảnh Thẻ bài Tarot" },
    { key: "backgrounds", label: "04. Phông nền" },
    { key: "orbs", label: "05. Tinh Cầu (Orbs)" },
    { key: "maps", label: "06. Bản đồ Game" },
    { key: "lobby", label: "07. Sảnh Chờ Ngày/Đêm" },
    { key: "scenes", label: "08. BXH & Nghiên Cứu" },
    { key: "audio", label: "09. Âm Thanh & Nhạc Nền" },
    { key: "weather", label: "10. Hiệu Ứng Thời Tiết" },
  ];
  return `
    <div class="subtab-bar">
      ${tabs.map(t => `
        <button class="btn ${studioSubTab === t.key ? "btn-primary" : "btn-secondary"} btn-sm" data-act="studio-subtab" data-sub="${t.key}">
          ${t.label}
        </button>
      `).join("")}
    </div>
  `;
}

async function renderSpriteStudio() {
  stopSpritePreview();
  if (studioSubTab === "npcs") return renderStudioNpcs();
  if (studioSubTab === "skins") return renderStudioSkins();
  if (studioSubTab === "tarots") return renderStudioTarots();
  if (studioSubTab === "backgrounds") return renderStudioBackgrounds();
  if (studioSubTab === "orbs") return renderStudioOrbs();
  if (studioSubTab === "maps") return renderStudioMaps();
  if (studioSubTab === "lobby") return renderStudioLobby();
  if (studioSubTab === "scenes") return renderStudioScenes();
  if (studioSubTab === "audio") return renderStudioAudio();
  if (studioSubTab === "weather") return renderStudioWeather();
}

// ── SUB-TAB 1: NPC (QUÁI VẬT & THẦY GIÁO) ───────────────────────
async function renderStudioNpcs() {
  const res = await api("/assets/npcs");
  const npcs = res.npcs || {};
  const activeNpc = npcs[spriteStudioState.slot] || npcs.monster;

  // Luôn nạp đủ toàn bộ frame (cả mặc định 16-18 frames lẫn custom) để Demo chạy hoạt ảnh mượt ngay!
  if (spriteStudioState.idleDataUrls.length === 0 && activeNpc) {
    spriteStudioState.fps = Number(activeNpc.fps || 12);
    spriteStudioState.scale = Number(activeNpc.scale || 1);
    spriteStudioState.idleDataUrls = [...(activeNpc.preview_idle_frames || [])];
    spriteStudioState.attackDataUrls = [...(activeNpc.preview_attack_frames || [])];
    spriteStudioState.frameIdx = 0;
  }

  const slotCardsHtml = ["monster", "teacher", "treasure"].map(slotKey => {
    const npc = npcs[slotKey];
    if (!npc) return "";
    const isSelected = spriteStudioState.slot === slotKey;
    return `
      <div class="panel" style="margin-bottom:0;${isSelected ? "border-color:var(--green)" : ""}">
        <div class="panel-head">
          <h3>[ ${esc(npc.label)} ]</h3>
          ${npc.is_custom
            ? `<span class="badge badge-online">[CUSTOM • ${npc.preview_idle_frames.length} IDLE${npc.preview_attack_frames.length ? ` / ${npc.preview_attack_frames.length} ATK` : ""}]</span>`
            : `<span class="badge badge-offline">[DEFAULT • ${npc.preview_idle_frames.length} FRAMES]</span>`}
        </div>
        <div style="display:flex;gap:14px;align-items:center">
          <div class="sprite-stage" style="width:92px;height:92px">
            <img src="${esc(npc.preview_url)}" alt="${esc(npc.name)}" />
          </div>
          <div style="flex:1;min-width:0">
            <div><strong>${esc(npc.name)}</strong></div>
            <div class="muted">FPS: ${npc.fps} • Scale: ${npc.scale}x</div>
            <div class="muted" style="margin-top:4px;word-break:break-all">${npc.is_custom ? `${esc(npc.disk_folder)}/` : "Đang dùng asset mặc định"}</div>
            <div class="actions-cell" style="margin-top:10px">
              <button class="btn ${isSelected ? "btn-primary" : "btn-secondary"} btn-sm" data-act="select-npc-slot" data-slot="${slotKey}">
                ${isSelected ? "ĐANG CHỈNH SỬA" : "CHỌN THAY ẢNH"}
              </button>
              ${npc.is_custom ? `<button class="btn btn-danger btn-sm" data-act="reset-npc-slot" data-slot="${slotKey}">Khôi phục gốc</button>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const hasAttackSlot = activeNpc?.animations?.includes("attack");

  setTabHtml(`
    ${studioSubTabsHtml()}
    <div class="sprite-card-grid">${slotCardsHtml}</div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ LIVE DEMO &amp; UPLOAD: ${esc(activeNpc?.label || spriteStudioState.slot)} ]</h3>
        <span class="muted">Tự nhận diện folder Idle / Attack và ghi file thật vào ổ cứng</span>
      </div>

      <div class="studio-layout">
        <div>
          <div class="sprite-stage">
            <img id="studioPreviewImg" src="${esc(activeNpc?.preview_url || "")}" alt="Live Demo" />
            <div class="sprite-stage-hud"><span id="studioFrameHud">LOADING...</span></div>
          </div>
          <div class="toolbar" style="margin-top:8px;justify-content:center">
            <button id="studioModeIdleBtn" class="btn ${spriteStudioState.mode === "idle" ? "btn-primary" : "btn-secondary"} btn-sm">IDLE (${spriteStudioState.idleDataUrls.length})</button>
            ${hasAttackSlot ? `<button id="studioModeAtkBtn" class="btn ${spriteStudioState.mode === "attack" ? "btn-primary" : "btn-secondary"} btn-sm">ATTACK (${spriteStudioState.attackDataUrls.length})</button>` : ""}
            <button id="studioPlayToggleBtn" class="btn btn-ghost btn-sm">${spriteStudioState.playing ? "" : "▶"}</button>
          </div>
        </div>

        <div class="studio-controls">
          <div class="drop-zone">
            <div style="font-weight:700;color:var(--green);margin-bottom:6px">CÁCH 1: CHỌN CẢ THƯ MỤC NHÂN VẬT</div>
            <div class="muted" style="margin-bottom:8px">Chọn thư mục chứa <code>Idle</code> / <code>Attacking</code> (hoặc chứa toàn ảnh Idle). Tự động tách và sắp xếp đúng thứ tự frame.</div>
            <input id="studioFolderInput" type="file" webkitdirectory directory multiple accept="image/png,image/webp,image/jpeg" />
          </div>

          <div class="form-grid-2">
            <div class="field">
              <label>CÁCH 2: CHỌN NHIỀU ẢNH IDLE (.PNG)</label>
              <input id="studioIdleFilesInput" type="file" multiple accept="image/png,image/webp,image/jpeg" />
            </div>
            ${hasAttackSlot ? `
              <div class="field">
                <label>CHỌN NHIỀU ẢNH ATTACK (.PNG)</label>
                <input id="studioAttackFilesInput" type="file" multiple accept="image/png,image/webp,image/jpeg" />
              </div>
            ` : `<div></div>`}
          </div>

          <div class="field">
            <label>TÊN HIỂN THỊ NPC</label>
            <input id="studioNpcNameInput" value="${esc(activeNpc?.name || "")}" />
          </div>

          <div class="form-grid-2">
            <div class="field">
              <label>TỐC ĐỘ FPS (<span id="studioFpsVal">${spriteStudioState.fps}</span>)</label>
              <input id="studioFpsRange" type="range" min="6" max="24" step="1" value="${spriteStudioState.fps}" />
            </div>
            <div class="field">
              <label>TỈ LỆ SCALE (<span id="studioScaleVal">${spriteStudioState.scale}</span>x)</label>
              <input id="studioScaleRange" type="range" min="0.4" max="2.0" step="0.05" value="${spriteStudioState.scale}" />
            </div>
          </div>

          <div class="toolbar">
            <button id="studioSaveBtn" class="btn btn-primary">LƯU &amp; GHI VÀO Ổ CỨNG DỰ ÁN</button>
            <span class="muted">Lưu vào <code>assets/custom_npcs/${esc(spriteStudioState.slot)}/</code></span>
          </div>
        </div>
      </div>
    </div>
  `);

  const getNpcFrames = () =>
    spriteStudioState.mode === "attack" && spriteStudioState.attackDataUrls.length > 0
      ? spriteStudioState.attackDataUrls
      : spriteStudioState.idleDataUrls;

  const refreshNpcBtns = () => {
    if ($("studioModeIdleBtn")) {
      $("studioModeIdleBtn").textContent = `IDLE (${spriteStudioState.idleDataUrls.length})`;
      $("studioModeIdleBtn").className = `btn ${spriteStudioState.mode === "idle" ? "btn-primary" : "btn-secondary"} btn-sm`;
    }
    if ($("studioModeAtkBtn")) {
      $("studioModeAtkBtn").textContent = `ATTACK (${spriteStudioState.attackDataUrls.length})`;
      $("studioModeAtkBtn").className = `btn ${spriteStudioState.mode === "attack" ? "btn-primary" : "btn-secondary"} btn-sm`;
    }
  };

  $("studioFolderInput").onchange = async (e) => {
    const allImages = naturalSortFiles([...(e.target.files || [])].filter(f => /\.(png|webp|jpe?g)$/i.test(f.name)));
    if (!allImages.length) return showToast("Không tìm thấy ảnh PNG/WebP/JPG trong thư mục!", "error");
    const idleFiles = [], atkFiles = [], fallbackFiles = [];
    for (const f of allImages) {
      const rel = (f.webkitRelativePath || f.name).toLowerCase();
      if (/attack|shoot|slash|cast|throw|greet/i.test(rel)) atkFiles.push(f);
      else if (/idle|stand|blink|breath/i.test(rel)) idleFiles.push(f);
      else fallbackFiles.push(f);
    }
    const finalIdle = idleFiles.length > 0 ? idleFiles.slice(0, 60) : fallbackFiles.slice(0, 60);
    const finalAtk = hasAttackSlot ? atkFiles.slice(0, 60) : [];
    spriteStudioState.idleDataUrls = await readFilesAsDataUrls(finalIdle);
    spriteStudioState.attackDataUrls = finalAtk.length ? await readFilesAsDataUrls(finalAtk) : [];
    spriteStudioState.frameIdx = 0;
    spriteStudioState.mode = "idle";
    refreshNpcBtns();
    startStudioAnimLoop(spriteStudioState, getNpcFrames);
    showToast(`Đã nạp Demo: ${spriteStudioState.idleDataUrls.length} Idle${finalAtk.length ? ` + ${spriteStudioState.attackDataUrls.length} Attack` : ""}`);
  };

  $("studioIdleFilesInput").onchange = async (e) => {
    const files = naturalSortFiles([...(e.target.files || [])]).slice(0, 60);
    if (!files.length) return;
    spriteStudioState.idleDataUrls = await readFilesAsDataUrls(files);
    spriteStudioState.frameIdx = 0;
    spriteStudioState.mode = "idle";
    refreshNpcBtns();
    startStudioAnimLoop(spriteStudioState, getNpcFrames);
  };

  if ($("studioAttackFilesInput")) {
    $("studioAttackFilesInput").onchange = async (e) => {
      const files = naturalSortFiles([...(e.target.files || [])]).slice(0, 60);
      if (!files.length) return;
      spriteStudioState.attackDataUrls = await readFilesAsDataUrls(files);
      spriteStudioState.frameIdx = 0;
      spriteStudioState.mode = "attack";
      refreshNpcBtns();
      startStudioAnimLoop(spriteStudioState, getNpcFrames);
    };
  }

  $("studioModeIdleBtn").onclick = () => {
    spriteStudioState.mode = "idle"; spriteStudioState.frameIdx = 0;
    refreshNpcBtns(); startStudioAnimLoop(spriteStudioState, getNpcFrames);
  };
  if ($("studioModeAtkBtn")) {
    $("studioModeAtkBtn").onclick = () => {
      spriteStudioState.mode = "attack"; spriteStudioState.frameIdx = 0;
      refreshNpcBtns(); startStudioAnimLoop(spriteStudioState, getNpcFrames);
    };
  }
  $("studioPlayToggleBtn").onclick = () => {
    spriteStudioState.playing = !spriteStudioState.playing;
    $("studioPlayToggleBtn").textContent = spriteStudioState.playing ? "" : "▶";
  };
  $("studioFpsRange").oninput = (e) => {
    spriteStudioState.fps = Number(e.target.value);
    $("studioFpsVal").textContent = spriteStudioState.fps;
    startStudioAnimLoop(spriteStudioState, getNpcFrames);
  };
  $("studioScaleRange").oninput = (e) => {
    spriteStudioState.scale = Number(e.target.value);
    $("studioScaleVal").textContent = spriteStudioState.scale;
    if ($("studioPreviewImg")) $("studioPreviewImg").style.transform = `scale(${spriteStudioState.scale})`;
  };

  $("studioSaveBtn").onclick = async () => {
    const idlePayload = spriteStudioState.idleDataUrls.filter(u => String(u).startsWith("data:image/"));
    const atkPayload = spriteStudioState.attackDataUrls.filter(u => String(u).startsWith("data:image/"));
    if (!idlePayload.length && !atkPayload.length) {
      return showToast("Hãy chọn thư mục hoặc ảnh PNG mới trước khi bấm Lưu!", "error");
    }
    const btn = $("studioSaveBtn");
    btn.disabled = true; btn.textContent = "ĐANG GHI FILE...";
    try {
      const saveRes = await api(`/assets/npcs/${spriteStudioState.slot}/upload`, {
        method: "POST",
        body: JSON.stringify({
          name: $("studioNpcNameInput").value.trim(),
          fps: spriteStudioState.fps,
          scale: spriteStudioState.scale,
          idle_frames: idlePayload,
          attack_frames: atkPayload,
        }),
      });
      if (!saveRes.success) return showToast(saveRes.message, "error");
      showToast(saveRes.message);
      spriteStudioState.idleDataUrls = [];
      spriteStudioState.attackDataUrls = [];
      renderStudioNpcs();
    } finally {
      btn.disabled = false; btn.textContent = "LƯU & GHI VÀO Ổ CỨNG DỰ ÁN";
    }
  };

  startStudioAnimLoop(spriteStudioState, getNpcFrames);
}

// ── SUB-TAB 2: NHÂN VẬT & TRANG PHỤC (SKINS 1-3) ────────────────
async function renderStudioSkins() {
  const res = await api("/assets/skins");
  cacheSkins = res.skins || [];
  if (!skinStudioState.skinId && cacheSkins.length) {
    skinStudioState.skinId = cacheSkins[0].skin_id;
  }
  const activeSkin = cacheSkins.find(s => s.skin_id === Number(skinStudioState.skinId)) || cacheSkins[0];

  if (activeSkin && skinStudioState.idleDataUrls.length === 0) {
    skinStudioState.idleDataUrls = [...(activeSkin.preview_idle_frames || [])];
    skinStudioState.runDataUrls = [...(activeSkin.preview_run_frames || [])];
    skinStudioState.hurtDataUrls = [...(activeSkin.preview_hurt_frames || [])];
    skinStudioState.frameIdx = 0;
  }

  setTabHtml(`
    ${studioSubTabsHtml()}

    ${activeSkin ? `
      <div class="panel">
        <div class="panel-head">
          <h3>[ LIVE DEMO &amp; THAY TRANG PHỤC: ${esc(activeSkin.character_name)} — SKIN ${activeSkin.skin_number} ]</h3>
          <div class="actions-cell">
            ${activeSkin.has_backup ? `<button class="btn btn-danger btn-sm" data-act="reset-skin-slot" data-id="${activeSkin.skin_id}">↩ Khôi phục ảnh gốc</button>` : ""}
          </div>
        </div>

        <div class="studio-layout">
          <div>
            <div class="sprite-stage">
              <img id="skinPreviewImg" src="${esc(activeSkin.preview_url)}" alt="${esc(activeSkin.character_name)}" />
              <div class="sprite-stage-hud"><span id="skinFrameHud">LOADING...</span></div>
            </div>
            <div class="toolbar" style="margin-top:8px;justify-content:center">
              <button id="skinModeIdleBtn" class="btn ${skinStudioState.mode === "idle" ? "btn-primary" : "btn-secondary"} btn-sm">IDLE (${skinStudioState.idleDataUrls.length})</button>
              <button id="skinModeRunBtn" class="btn ${skinStudioState.mode === "run" ? "btn-primary" : "btn-secondary"} btn-sm">RUN (${skinStudioState.runDataUrls.length})</button>
              <button id="skinModeHurtBtn" class="btn ${skinStudioState.mode === "hurt" ? "btn-primary" : "btn-secondary"} btn-sm">HURT (${skinStudioState.hurtDataUrls.length})</button>
              <button id="skinPlayBtn" class="btn btn-ghost btn-sm">${skinStudioState.playing ? "" : "▶"}</button>
            </div>
          </div>

          <div class="studio-controls">
            <div class="drop-zone">
              <div style="font-weight:700;color:var(--green);margin-bottom:6px">CHỌN CẢ THƯ MỤC SKIN (TỰ TÁCH IDLE / RUN / HURT)</div>
              <div class="muted" style="margin-bottom:8px">Chọn thư mục <code>PNG Sequences</code> của nhân vật bất kỳ — hệ thống tự nhận diện <code>Idle</code>, <code>Run Throwing</code>/<code>Running</code>, <code>Hurt</code> và tự sao lưu bản gốc trước khi ghi đè!</div>
              <input id="skinFolderInput" type="file" webkitdirectory directory multiple accept="image/png,image/webp,image/jpeg" />
            </div>

            <div class="form-grid-2">
              <div class="field"><label>HOẶC CHỌN ẢNH IDLE</label><input id="skinIdleInput" type="file" multiple accept="image/png,image/webp,image/jpeg" /></div>
              <div class="field"><label>HOẶC CHỌN ẢNH RUN</label><input id="skinRunInput" type="file" multiple accept="image/png,image/webp,image/jpeg" /></div>
            </div>
            <div class="form-grid-2">
              <div class="field"><label>HOẶC CHỌN ẢNH HURT</label><input id="skinHurtInput" type="file" multiple accept="image/png,image/webp,image/jpeg" /></div>
              <div class="field"><label>GIÁ BÁN SKIN (ECOIN)</label><input id="skinPriceInput" type="number" min="0" value="${activeSkin.price}" /></div>
            </div>

            <div class="toolbar">
              <button id="skinSaveBtn" class="btn btn-primary">LƯU TRANG PHỤC &amp; GIÁ VÀO GAME</button>
              <span class="muted"><code>${esc(activeSkin.disk_folder)}</code></span>
            </div>
          </div>
        </div>
      </div>
    ` : ""}

    <div class="panel">
      <div class="panel-head">
        <h3>[ DANH SÁCH TẤT CẢ NHÂN VẬT &amp; TRANG PHỤC (${cacheSkins.length}) ]</h3>
        <span class="muted">Bấm vào bất kỳ trang phục nào để xem hoạt ảnh &amp; thay hình</span>
      </div>
      <div class="asset-card-grid">
        ${cacheSkins.map(s => `
          <div class="asset-item-card ${s.skin_id === activeSkin?.skin_id ? "selected" : ""}">
            <div style="display:flex;gap:10px;align-items:center">
              <div class="sprite-stage" style="width:68px;height:68px">
                <img src="${esc(s.preview_url)}" alt="${esc(s.character_name)}" />
              </div>
              <div style="flex:1;min-width:0">
                <div><strong>${esc(s.character_name)}</strong></div>
                <div class="cyan-val">Skin #${s.skin_number} ${s.is_default ? "(Gốc)" : ""}</div>
                <div class="muted">Giá: ${fmtMoney(s.price)} Ecoin</div>
              </div>
            </div>
            <div class="actions-cell">
              <button class="btn ${s.skin_id === activeSkin?.skin_id ? "btn-primary" : "btn-secondary"} btn-sm" data-act="select-skin-slot" data-id="${s.skin_id}">
                ${s.skin_id === activeSkin?.skin_id ? "ĐANG CHỌN" : "DEMO / THAY ẢNH"}
              </button>
              ${s.has_backup ? `<span class="badge badge-online">[EDITED]</span>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `);

  if (!activeSkin) return;

  const getSkinFrames = () => {
    if (skinStudioState.mode === "run" && skinStudioState.runDataUrls.length) return skinStudioState.runDataUrls;
    if (skinStudioState.mode === "hurt" && skinStudioState.hurtDataUrls.length) return skinStudioState.hurtDataUrls;
    return skinStudioState.idleDataUrls;
  };
  const refreshSkinBtns = () => {
    $("skinModeIdleBtn").textContent = `IDLE (${skinStudioState.idleDataUrls.length})`;
    $("skinModeRunBtn").textContent = `RUN (${skinStudioState.runDataUrls.length})`;
    $("skinModeHurtBtn").textContent = `HURT (${skinStudioState.hurtDataUrls.length})`;
    $("skinModeIdleBtn").className = `btn ${skinStudioState.mode === "idle" ? "btn-primary" : "btn-secondary"} btn-sm`;
    $("skinModeRunBtn").className = `btn ${skinStudioState.mode === "run" ? "btn-primary" : "btn-secondary"} btn-sm`;
    $("skinModeHurtBtn").className = `btn ${skinStudioState.mode === "hurt" ? "btn-primary" : "btn-secondary"} btn-sm`;
  };

  $("skinFolderInput").onchange = async (e) => {
    const allImgs = naturalSortFiles([...(e.target.files || [])].filter(f => /\.(png|webp|jpe?g)$/i.test(f.name)));
    if (!allImgs.length) return showToast("Không tìm thấy ảnh trong thư mục!", "error");
    const idleF = [], runF = [], hurtF = [], otherF = [];
    for (const f of allImgs) {
      const rel = (f.webkitRelativePath || f.name).toLowerCase();
      if (/hurt|hit|damage/i.test(rel)) hurtF.push(f);
      else if (/run|walk/i.test(rel)) runF.push(f);
      else if (/idle|stand/i.test(rel)) idleF.push(f);
      else otherF.push(f);
    }
    if (idleF.length || otherF.length) skinStudioState.idleDataUrls = await readFilesAsDataUrls((idleF.length ? idleF : otherF).slice(0, 60));
    if (runF.length) skinStudioState.runDataUrls = await readFilesAsDataUrls(runF.slice(0, 60));
    if (hurtF.length) skinStudioState.hurtDataUrls = await readFilesAsDataUrls(hurtF.slice(0, 60));
    skinStudioState.frameIdx = 0; skinStudioState.mode = "idle";
    refreshSkinBtns();
    startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false);
    showToast(`Đã nạp Demo Skin: Idle=${idleF.length || otherF.length}, Run=${runF.length}, Hurt=${hurtF.length}`);
  };

  $("skinIdleInput").onchange = async (e) => {
    const files = naturalSortFiles([...(e.target.files || [])]).slice(0, 60);
    if (!files.length) return;
    skinStudioState.idleDataUrls = await readFilesAsDataUrls(files);
    skinStudioState.mode = "idle"; skinStudioState.frameIdx = 0;
    refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false);
  };
  $("skinRunInput").onchange = async (e) => {
    const files = naturalSortFiles([...(e.target.files || [])]).slice(0, 60);
    if (!files.length) return;
    skinStudioState.runDataUrls = await readFilesAsDataUrls(files);
    skinStudioState.mode = "run"; skinStudioState.frameIdx = 0;
    refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false);
  };
  $("skinHurtInput").onchange = async (e) => {
    const files = naturalSortFiles([...(e.target.files || [])]).slice(0, 60);
    if (!files.length) return;
    skinStudioState.hurtDataUrls = await readFilesAsDataUrls(files);
    skinStudioState.mode = "hurt"; skinStudioState.frameIdx = 0;
    refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false);
  };

  $("skinModeIdleBtn").onclick = () => { skinStudioState.mode = "idle"; skinStudioState.frameIdx = 0; refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false); };
  $("skinModeRunBtn").onclick  = () => { skinStudioState.mode = "run";  skinStudioState.frameIdx = 0; refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false); };
  $("skinModeHurtBtn").onclick = () => { skinStudioState.mode = "hurt"; skinStudioState.frameIdx = 0; refreshSkinBtns(); startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false); };
  $("skinPlayBtn").onclick = () => {
    skinStudioState.playing = !skinStudioState.playing;
    $("skinPlayBtn").textContent = skinStudioState.playing ? "" : "▶";
  };

  $("skinSaveBtn").onclick = async () => {
    const btn = $("skinSaveBtn");
    btn.disabled = true; btn.textContent = "ĐANG GHI FILE...";
    try {
      const saveRes = await api(`/assets/skins/${activeSkin.skin_id}/upload`, {
        method: "POST",
        body: JSON.stringify({
          price: Number($("skinPriceInput").value || 0),
          idle_frames: skinStudioState.idleDataUrls.filter(u => String(u).startsWith("data:image/")),
          run_frames: skinStudioState.runDataUrls.filter(u => String(u).startsWith("data:image/")),
          hurt_frames: skinStudioState.hurtDataUrls.filter(u => String(u).startsWith("data:image/")),
        }),
      });
      if (!saveRes.success) return showToast(saveRes.message, "error");
      showToast(saveRes.message);
      skinStudioState.idleDataUrls = []; skinStudioState.runDataUrls = []; skinStudioState.hurtDataUrls = [];
      renderStudioSkins();
    } finally {
      btn.disabled = false; btn.textContent = "LƯU TRANG PHỤC & GIÁ VÀO GAME";
    }
  };

  startStudioAnimLoop(skinStudioState, getSkinFrames, "skinPreviewImg", "skinFrameHud", false);
}

// ── SUB-TAB 3: ẢNH THẺ BÀI TAROT ────────────────────────────────
async function renderStudioTarots() {
  const res = await api("/tarots");
  cacheTarots = res.tarots || [];
  const v = Date.now();

  setTabHtml(`
    ${studioSubTabsHtml()}
    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO ẢNH THẺ BÀI TAROT (${cacheTarots.length}) ]</h3>
        <span class="muted">Ghi trực tiếp vào <code>assets/resources/Tarot/Tarot_1</code> &amp; <code>Tarot_2</code></span>
      </div>
      <div class="asset-card-grid">
        ${cacheTarots.map(t => {
          const lv1Url = `/assets/resources/Tarot/Tarot_1/thebai_${t.id}.png?v=${v}`;
          const lv2Url = `/assets/resources/Tarot/Tarot_2/thebai_${t.id}.png?v=${v}`;
          return `
            <div class="asset-item-card">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div style="text-align:center">
                  <img class="tarot-thumb" style="height:120px" src="${lv1Url}" alt="${esc(t.name)} Lv1" onerror="this.style.opacity='0.2'" />
                  <div class="muted">LV.1</div>
                </div>
                <div style="text-align:center">
                  <img class="tarot-thumb" style="height:120px" src="${lv2Url}" alt="${esc(t.name)} Lv2" onerror="this.style.opacity='0.2'" />
                  <div class="amber-val" style="font-size:11px">LV.2</div>
                </div>
              </div>
              <div><strong>#${t.id} ${esc(t.name)}</strong></div>
              <div class="muted">CD: ${Number(t.cooldown_seconds || 0)} lượt • <code>${esc(t.effect_type || "")}</code></div>
              <button class="btn btn-primary btn-sm" data-act="upload-tarot-img" data-id="${t.id}">THAY ẢNH &amp; SỬA</button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);
}

function openTarotImageModal(tarotId) {
  const t = cacheTarots.find(x => Number(x.id) === Number(tarotId));
  if (!t) return;
  const v = Date.now();
  const lv1Url = `/assets/resources/Tarot/Tarot_1/thebai_${t.id}.png?v=${v}`;
  const lv2Url = `/assets/resources/Tarot/Tarot_2/thebai_${t.id}.png?v=${v}`;
  let pickedDataUrl = null;

  openModal(`THAY ẢNH THẺ TAROT #${t.id}`, `
    <form id="tarotImgForm">
      <div style="text-align:center;margin-bottom:12px">
        <img id="tarotModalPreview" class="tarot-thumb" style="max-width:170px;height:200px;margin:0 auto" src="${lv1Url}" />
      </div>
      <div class="form-grid-2">
        <div class="field">
          <label>CHỌN CẤP THẺ CẦN THAY ẢNH</label>
          <select id="tarotLevelSelect" name="level">
            <option value="1" selected>Cấp 1 (Tarot_1 — Xanh)</option>
            <option value="2">Cấp 2 (Tarot_2 — Vàng)</option>
          </select>
        </div>
        <div class="field">
          <label>CHỌN ẢNH MỚI (PNG/WEBP/JPG)</label>
          <input id="tarotFileInput" type="file" accept="image/png,image/webp,image/jpeg" />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Tên thẻ</label><input name="name" value="${esc(t.name)}" required /></div>
        <div class="field"><label>Hồi chiêu (lượt)</label><input name="cooldown_seconds" type="number" min="0" value="${Number(t.cooldown_seconds || 0)}" /></div>
      </div>
      <div class="field"><label>Mô tả</label><textarea name="description">${esc(t.description || "")}</textarea></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu ảnh &amp; thông tin</button>
      </div>
    </form>
  `);

  $("tarotLevelSelect").onchange = (e) => {
    if (!pickedDataUrl) {
      $("tarotModalPreview").src = Number(e.target.value) === 2 ? lv2Url : lv1Url;
    }
  };

  $("tarotFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    pickedDataUrl = (await readFilesAsDataUrls([f]))[0];
    $("tarotModalPreview").src = pickedDataUrl;
  };

  $("tarotImgForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await api(`/assets/tarots/${t.id}/upload`, {
      method: "POST",
      body: JSON.stringify({
        level: Number(fd.get("level") || 1),
        name: fd.get("name"),
        cooldown_seconds: Number(fd.get("cooldown_seconds") || 0),
        description: fd.get("description"),
        image_data_url: pickedDataUrl,
      }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderStudioTarots();
  };
}

// ── SUB-TAB 4: PHÔNG NỀN (BACKGROUNDS) ──────────────────────────
async function renderStudioBackgrounds() {
  const res = await api("/assets/backgrounds");
  cacheBackgrounds = res.backgrounds || [];

  setTabHtml(`
    ${studioSubTabsHtml()}
    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO PHÔNG NỀN (BACKGROUNDS — ${cacheBackgrounds.length}) ]</h3>
        <button id="addNewBgBtn" class="btn btn-primary btn-sm">+ THÊM PHÔNG NỀN MỚI</button>
      </div>
      <div class="asset-card-grid">
        ${cacheBackgrounds.length === 0 ? `<div class="empty-state">Chưa có phông nền nào</div>` : cacheBackgrounds.map(bg => `
          <div class="asset-item-card">
            <img class="bg-thumb" src="${esc(bg.preview_url)}" alt="${esc(bg.name)}" onerror="this.style.opacity='0.25'" />
            <div><strong>#${bg.id} ${esc(bg.name)}</strong></div>
            <div class="cyan-val">Giá: ${fmtMoney(bg.price_ecoin)} Ecoin</div>
            <div class="muted" style="word-break:break-all">${esc(bg.image_path)}</div>
            <button class="btn btn-secondary btn-sm" data-act="edit-bg-asset" data-id="${bg.id}">Thay ảnh &amp; Sửa</button>
          </div>
        `).join("")}
      </div>
    </div>
  `);

  $("addNewBgBtn").onclick = () => openBackgroundModal(null);
}

function openBackgroundModal(bgId) {
  const bg = bgId ? cacheBackgrounds.find(x => Number(x.id) === Number(bgId)) : null;
  let pickedDataUrl = null;

  openModal(bg ? `SỬA PHÔNG NỀN #${bg.id}` : "THÊM PHÔNG NỀN MỚI", `
    <form id="bgAssetForm">
      <div style="margin-bottom:12px">
        <img id="bgModalPreview" class="bg-thumb" src="${esc(bg?.preview_url || "")}" />
      </div>
      <div class="field"><label>CHỌN ẢNH PHÔNG NỀN (PNG/WEBP/JPG)</label><input id="bgFileInput" type="file" accept="image/png,image/webp,image/jpeg" ${bg ? "" : "required"} /></div>
      <div class="form-grid-2">
        <div class="field"><label>Tên phông nền</label><input name="name" value="${esc(bg?.name || "")}" required /></div>
        <div class="field"><label>Giá bán (Ecoin)</label><input name="price_ecoin" type="number" min="0" value="${Number(bg?.price_ecoin || 10000)}" /></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu phông nền</button>
      </div>
    </form>
  `);

  $("bgFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    pickedDataUrl = (await readFilesAsDataUrls([f]))[0];
    $("bgModalPreview").src = pickedDataUrl;
  };

  $("bgAssetForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await api(bg ? `/assets/backgrounds/${bg.id}/upload` : "/assets/backgrounds", {
      method: "POST",
      body: JSON.stringify({
        name: fd.get("name"),
        price_ecoin: Number(fd.get("price_ecoin") || 0),
        image_data_url: pickedDataUrl,
      }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderStudioBackgrounds();
  };
}

// ── SUB-TAB 5: TINH CẦU (ORBS LV.1 → LV.2 NHÓM THEO TỪNG MÀU) ────
async function renderStudioOrbs() {
  const res = await api("/assets/orbs");
  cacheOrbs = res.orbs || [];

  const colorMeta = [
    { color: "red",    label: "TINH CẦU ĐỎ",         accent: "#FF4D4F" },
    { color: "blue",   label: "TINH CẦU XANH DƯƠNG", accent: "#00D8FF" },
    { color: "purple", label: "TINH CẦU TÍM",        accent: "#C084FC" },
    { color: "orange", label: "TINH CẦU CAM",        accent: "#F59E0B" },
  ];

  const renderOrbSlot = (o, lvTitle) => {
    if (!o) return "";
    return `
      <div class="orb-slot-box">
        <div class="sprite-stage" style="width:100%;height:126px">
          <img src="${esc(o.preview_url)}" alt="${esc(o.color_label)} Lv.${o.level}" style="max-height:96px" />
          <div class="sprite-stage-hud">
            <span>${lvTitle}</span>
            <span>${o.has_backup ? "[EDITED]" : "[DEFAULT]"}</span>
          </div>
        </div>
        <div class="actions-cell" style="justify-content:center">
          <button class="btn btn-primary btn-sm" data-act="upload-orb-img" data-key="${esc(o.key)}">Thay Lv.${o.level}</button>
          ${o.has_backup ? `<button class="btn btn-danger btn-sm" data-act="reset-orb-img" data-key="${esc(o.key)}">Gốc</button>` : ""}
        </div>
      </div>
    `;
  };

  setTabHtml(`
    ${studioSubTabsHtml()}
    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO ẢNH TINH CẦU — NHÓM CẶP TIẾN HÓA LV.1 → LV.2 ]</h3>
        <span class="muted">4 nhóm màu tinh cầu • mỗi nhóm liên kết trực tiếp Cấp 1 → Cấp 2 (Có Cánh)</span>
      </div>
      <div class="orb-pair-grid">
        ${colorMeta.map(cm => {
          const lv1 = cacheOrbs.find(o => o.color === cm.color && o.level === 1);
          const lv2 = cacheOrbs.find(o => o.color === cm.color && o.level === 2);
          return `
            <div class="orb-pair-card" style="border-top:2px solid ${cm.accent}">
              <div class="orb-pair-head">
                <strong style="color:${cm.accent}">[ ${cm.label} ]</strong>
                <span class="muted">${cm.color.toUpperCase()} • LV.1 → LV.2</span>
              </div>
              <div class="orb-pair-body">
                ${renderOrbSlot(lv1, "LV.1 CƠ BẢN")}
                <div class="orb-pair-arrow" title="Nâng cấp lên Lv.2"></div>
                ${renderOrbSlot(lv2, "LV.2 CÓ CÁNH")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);
}

function openOrbUploadModal(orbKey) {
  const o = cacheOrbs.find(x => x.key === orbKey);
  if (!o) return;
  let pickedDataUrl = null;

  openModal(`THAY ẢNH ${o.color_label.toUpperCase()} (LV.${o.level})`, `
    <form id="orbImgForm">
      <div style="display:flex;justify-content:center;margin-bottom:12px">
        <div class="sprite-stage" style="width:180px;height:180px">
          <img id="orbModalPreview" src="${esc(o.preview_url)}" />
        </div>
      </div>
      <div class="field">
        <label>CHỌN ẢNH TINH CẦU MỚI (PNG NỀN TRONG SUỐT KHUYẾN NGHỊ)</label>
        <input id="orbFileInput" type="file" accept="image/png,image/webp,image/jpeg" required />
      </div>
      <div class="muted">Đường dẫn ghi đè: <code>${esc(o.rel_path)}</code> (tự sao lưu bản gốc trước khi ghi).</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="document.getElementById('modalCloseBtn').click()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu ảnh tinh cầu</button>
      </div>
    </form>
  `);

  $("orbFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    pickedDataUrl = (await readFilesAsDataUrls([f]))[0];
    $("orbModalPreview").src = pickedDataUrl;
  };

  $("orbImgForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!pickedDataUrl) return showToast("Vui lòng chọn ảnh trước!", "error");
    const res = await api(`/assets/orbs/${o.key}/upload`, {
      method: "POST",
      body: JSON.stringify({ image_data_url: pickedDataUrl }),
    });
    if (!res.success) return showToast(res.message, "error");
    showToast(res.message);
    closeModal();
    renderStudioOrbs();
  };
}

// ── SUB-TAB 6: BẢN ĐỒ GAME THEO MÙA (VISUAL MAP EDITOR 37 Ô) ────
function drawMapPinsAndPath() {
  const stage = $("mapEditorStage");
  const svg = $("mapEditorSvg");
  if (!stage || !svg) return;

  // Xóa các pin cũ
  stage.querySelectorAll(".map-pin").forEach(el => el.remove());

  const pathArr = mapEditorState.boardPath || [];
  if (!pathArr.length) return;

  // Vẽ đường nối 0 -> 1 -> ... -> 36 -> 0
  const points = [...pathArr, pathArr[0]].map(c => `${(c.x * 100).toFixed(2)},${(c.y * 100).toFixed(2)}`).join(" ");
  svg.innerHTML = `<polyline points="${points}" fill="none" stroke="rgba(0, 216, 255, 0.55)" stroke-width="0.35" stroke-dasharray="0.9 0.6" />`;

  pathArr.forEach(c => {
    const pin = document.createElement("div");
    let cls = "map-pin";
    if (c.index === 0) cls += " pin-start";
    else if (c.index === 9) cls += " pin-chest";
    else if (c.index === 18) cls += " pin-teacher";
    else if (c.index === 28) cls += " pin-monster";
    if (c.index === mapEditorState.selectedCell) cls += " pin-selected";
    pin.className = cls;
    pin.style.left = `${(c.x * 100).toFixed(3)}%`;
    pin.style.top = `${(c.y * 100).toFixed(3)}%`;
    pin.textContent = c.index;
    pin.title = `Ô #${c.index} (${c.x}, ${c.y})`;
    pin.dataset.cellIndex = c.index;

    pin.onmousedown = (ev) => {
      ev.stopPropagation();
      mapEditorState.selectedCell = c.index;
      syncSelectedCellInputs();
      drawMapPinsAndPath();

      const beforeDrag = clonePath(mapEditorState.boardPath);
      let didDrag = false;
      const rect = stage.getBoundingClientRect();
      const onMove = (me) => {
        didDrag = true;
        const nx = Math.min(0.98, Math.max(0.02, (me.clientX - rect.left) / rect.width));
        const ny = Math.min(0.98, Math.max(0.02, (me.clientY - rect.top) / rect.height));
        c.x = Number(nx.toFixed(4));
        c.y = Number(ny.toFixed(4));
        syncSelectedCellInputs();
        drawMapPinsAndPath();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (didDrag) {
          mapEditorState.undoStack.push({ boardPath: beforeDrag, selectedCell: c.index, reason: `drag #${c.index}` });
          if (mapEditorState.undoStack.length > 60) mapEditorState.undoStack.shift();
          mapEditorState.redoStack = [];
          autoBackupMapCoords();
          updateMapHistoryButtons();
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    stage.appendChild(pin);
  });
}

function syncSelectedCellInputs() {
  const c = mapEditorState.boardPath?.[mapEditorState.selectedCell];
  if (!c) return;
  if ($("mapCellSelect")) $("mapCellSelect").value = String(c.index);
  if ($("mapCellXInput")) $("mapCellXInput").value = c.x;
  if ($("mapCellYInput")) $("mapCellYInput").value = c.y;
}

async function renderStudioMaps() {
  const res = await api("/assets/maps");
  mapEditorState.maps = res.maps || [];
  mapEditorState.activeMapId = res.active_map_id || "default";
  mapEditorState.defaultBoardPath = res.default_board_path || [];

  if (!mapEditorState.boardPath.length) {
    const activeObj = mapEditorState.maps.find(m => m.id === mapEditorState.activeMapId) || mapEditorState.maps[0];
    if (activeObj) {
      mapEditorState.editingId = null; // Luôn mặc định ở chế độ thêm map mới, tránh ghi đè map cũ
      mapEditorState.name = "";
      mapEditorState.imageUrl = activeObj.image_url + (activeObj.version ? `?v=${activeObj.version}` : "");
      mapEditorState.boardPath = (activeObj.board_path || mapEditorState.defaultBoardPath).map(c => ({ ...c }));
    }
  }

  const curCell = mapEditorState.boardPath[mapEditorState.selectedCell] || { index: 0, x: 0.24, y: 0.59 };

  setTabHtml(`
    ${studioSubTabsHtml()}

    <div class="panel">
      <div class="panel-head">
        <h3>[ TRÌNH CHỈNH BẢN ĐỒ &amp; TỌA ĐỘ 37 Ô (VISUAL MAP EDITOR) ]</h3>
        <span class="muted">
          <span class="accent-green">● 0:START</span> •
          <span class="amber-val">● 9:Rương</span> •
          <span class="cyan-val">● 18:Thầy giáo</span> •
          <span class="red-val">● 28:Quái vật</span>
        </span>
      </div>

      <div class="form-grid-2" style="margin-bottom:12px">
        <div class="field" style="margin-bottom:0">
          <label>TÊN BẢN ĐỒ (VD: GIÁNG SINH 2026, TẾT NGUYÊN ĐÁN...)</label>
          <input id="mapNameInput" value="${esc(mapEditorState.name)}" placeholder="Nhập tên bản đồ..." />
        </div>
        <div class="field" style="margin-bottom:0">
          <label>UPLOAD ẢNH BẢN ĐỒ MỚI (TỈ LỆ 16:9 — PNG/JPG/WEBP)</label>
          <input id="mapImageFileInput" type="file" accept="image/png,image/webp,image/jpeg" />
        </div>
      </div>

      <div class="toolbar" style="margin-bottom:10px;justify-content:space-between">
        <div class="toolbar">
          <label class="muted" style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input id="mapAutoAdvanceChk" type="checkbox" style="width:auto" ${mapEditorState.autoAdvance ? "checked" : ""} />
            <span style="color:var(--green);font-weight:700">CHẾ ĐỘ CLICK CHẤM NHANH (0 → 36)</span>
          </label>
          <select id="mapCellSelect" style="min-width:110px">
            ${mapEditorState.boardPath.map(c => `<option value="${c.index}" ${c.index === mapEditorState.selectedCell ? "selected" : ""}>Ô #${c.index}${c.index === 0 ? " (START)" : c.index === 9 ? " (Rương)" : c.index === 18 ? " (Thầy)" : c.index === 28 ? " (Quái)" : ""}</option>`).join("")}
          </select>
          <span class="muted">X:</span>
          <input id="mapCellXInput" type="number" step="0.001" min="0.02" max="0.98" value="${curCell.x}" style="width:86px;min-width:86px" />
          <span class="muted">Y:</span>
          <input id="mapCellYInput" type="number" step="0.001" min="0.02" max="0.98" value="${curCell.y}" style="width:86px;min-width:86px" />
        </div>
        <div class="toolbar">
          <button id="mapUndoBtn" class="btn btn-secondary btn-sm" title="Hoàn tác (Ctrl+Z)">↶ Undo (${mapEditorState.undoStack.length})</button>
          <button id="mapRedoBtn" class="btn btn-secondary btn-sm" title="Làm lại (Ctrl+Y)">↷ Redo (${mapEditorState.redoStack.length})</button>
          <button id="mapSaveBackupBtn" class="btn btn-ghost btn-sm" title="Lưu mốc Backup vị trí 37 ô">Lưu Backup</button>
          <button id="mapRestoreBackupBtn" class="btn btn-warning btn-sm" title="Khôi phục bản Backup vị trí 37 ô gần nhất">↺ Khôi phục Backup</button>
          <button id="mapExportJsonBtn" class="btn btn-ghost btn-sm" title="Tải file JSON backup tọa độ">⬇ JSON</button>
          <button id="mapImportJsonBtn" class="btn btn-ghost btn-sm" title="Nạp file JSON tọa độ đã backup">⬆ JSON</button>
          <input id="mapImportJsonFile" type="file" accept=".json,application/json" class="hidden" />
          <button id="mapResetCoordsBtn" class="btn btn-ghost btn-sm">↺ Tọa độ gốc</button>
        </div>
      </div>

      <div id="mapEditorStage" class="map-stage-wrap">
        <img id="mapStageImg" class="map-stage-img" src="${esc(mapEditorState.pickedImageDataUrl || mapEditorState.imageUrl)}" alt="Game Map" />
        <svg id="mapEditorSvg" class="map-stage-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      </div>

      <div class="toolbar" style="margin-top:12px;justify-content:space-between">
        <div class="muted">&gt; ${mapEditorState.editingId ? `Đang chỉnh sửa map ID: <b class="cyan-val">${esc(mapEditorState.editingId)}</b>` : `Chế độ: <b class="accent-green">THÊM MAP MỚI</b> (giữ nguyên toàn bộ map cũ)`}</div>
        <div class="toolbar">
          ${mapEditorState.editingId ? `<button id="mapUpdateExistingBtn" class="btn btn-secondary btn-sm">Cập nhật map này</button>` : ""}
          <button id="mapSaveOnlyBtn" class="btn btn-secondary btn-sm">+ Thêm vào kho</button>
          <button id="mapSaveActivateBtn" class="btn btn-primary btn-sm">THÊM MAP MỚI &amp; ÁP DỤNG</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO BẢN ĐỒ THEO MÙA (${mapEditorState.maps.length}) ]</h3>
        <span class="muted">Đang áp dụng: <b class="accent-green">${esc(mapEditorState.activeMapId)}</b></span>
      </div>
      <div class="asset-card-grid">
        ${mapEditorState.maps.map(m => {
          const isActive = m.id === mapEditorState.activeMapId;
          const isEditing = m.id === mapEditorState.editingId;
          const thumb = m.image_url + (m.version ? `?v=${m.version}` : "");
          return `
            <div class="asset-item-card ${isActive || isEditing ? "selected" : ""}" style="cursor:pointer" data-act="load-map-editor" data-id="${esc(m.id)}" title="Bấm vào thẻ để mở lên khung kéo thả tọa độ">
              <img class="bg-thumb" src="${esc(thumb)}" alt="${esc(m.name)}" />
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                <strong>${esc(m.name)}</strong>
                ${isActive ? `<span class="badge badge-online">[ĐANG DÙNG]</span>` : `<span class="badge badge-offline">[SẴN SÀNG]</span>`}
              </div>
              <div class="actions-cell">
                ${!isActive ? `<button class="btn btn-primary btn-sm" data-act="activate-map" data-id="${esc(m.id)}">Áp dụng</button>` : ""}
                ${m.is_custom ? `<button class="btn btn-danger btn-sm" data-act="delete-map" data-id="${esc(m.id)}">Xóa</button>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);

  drawMapPinsAndPath();

  // Click trực tiếp lên ảnh bản đồ để đặt tọa độ cho ô đang chọn
  $("mapEditorStage").onclick = (ev) => {
    if (ev.target.classList.contains("map-pin")) return;
    pushMapUndoSnapshot(`click #${mapEditorState.selectedCell}`);
    const rect = $("mapEditorStage").getBoundingClientRect();
    const nx = Math.min(0.98, Math.max(0.02, (ev.clientX - rect.left) / rect.width));
    const ny = Math.min(0.98, Math.max(0.02, (ev.clientY - rect.top) / rect.height));
    const cell = mapEditorState.boardPath[mapEditorState.selectedCell];
    if (!cell) return;
    cell.x = Number(nx.toFixed(4));
    cell.y = Number(ny.toFixed(4));

    if (mapEditorState.autoAdvance) {
      mapEditorState.selectedCell = (mapEditorState.selectedCell + 1) % mapEditorState.boardPath.length;
    }
    syncSelectedCellInputs();
    drawMapPinsAndPath();
    autoBackupMapCoords();
  };

  $("mapUndoBtn").onclick = performMapUndo;
  $("mapRedoBtn").onclick = performMapRedo;
  updateMapHistoryButtons();

  $("mapSaveBackupBtn").onclick = () => {
    autoBackupMapCoords();
    showToast("Đã lưu bản Backup 37 tọa độ thành công!");
  };

  $("mapRestoreBackupBtn").onclick = () => {
    try {
      const raw = localStorage.getItem(MAP_BACKUP_KEY);
      if (!raw) return showToast("Chưa có bản Backup tọa độ nào!", "error");
      const bkp = JSON.parse(raw);
      if (!Array.isArray(bkp?.board_path) || bkp.board_path.length !== 37) {
        return showToast("Dữ liệu Backup không hợp lệ!", "error");
      }
      pushMapUndoSnapshot("restore_backup");
      mapEditorState.boardPath = clonePath(bkp.board_path);
      syncSelectedCellInputs();
      drawMapPinsAndPath();
      showToast(`↺ Đã khôi phục Backup (${fmtDate(bkp.saved_at)})`);
    } catch {
      showToast("Lỗi đọc bản Backup tọa độ", "error");
    }
  };

  $("mapExportJsonBtn").onclick = () => {
    const data = {
      name: $("mapNameInput")?.value?.trim() || mapEditorState.name || "map_coords",
      exported_at: new Date().toISOString(),
      board_path: clonePath(mapEditorState.boardPath),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `map_coords_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("⬇ Đã tải file JSON backup 37 tọa độ!");
  };

  $("mapImportJsonBtn").onclick = () => $("mapImportJsonFile").click();
  $("mapImportJsonFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      const arr = Array.isArray(parsed) ? parsed : parsed?.board_path;
      if (!Array.isArray(arr) || arr.length !== 37) {
        return showToast("File JSON phải chứa đủ 37 tọa độ ô!", "error");
      }
      pushMapUndoSnapshot("import_json");
      mapEditorState.boardPath = mapEditorState.defaultBoardPath.map((def, i) => ({
        ...def,
        x: Number(Math.min(0.98, Math.max(0.02, Number(arr[i]?.x ?? def.x))).toFixed(4)),
        y: Number(Math.min(0.98, Math.max(0.02, Number(arr[i]?.y ?? def.y))).toFixed(4)),
      }));
      syncSelectedCellInputs();
      drawMapPinsAndPath();
      autoBackupMapCoords();
      showToast(`⬆ Đã nạp thành công 37 tọa độ từ ${f.name}!`);
    } catch {
      showToast("File JSON không đúng định dạng!", "error");
    }
    e.target.value = "";
  };

  $("mapAutoAdvanceChk").onchange = (e) => { mapEditorState.autoAdvance = e.target.checked; };
  $("mapCellSelect").onchange = (e) => {
    mapEditorState.selectedCell = Number(e.target.value);
    syncSelectedCellInputs();
    drawMapPinsAndPath();
  };
  $("mapCellXInput").oninput = (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && mapEditorState.boardPath[mapEditorState.selectedCell]) {
      pushMapUndoSnapshot(`edit_x #${mapEditorState.selectedCell}`);
      mapEditorState.boardPath[mapEditorState.selectedCell].x = Number(Math.min(0.98, Math.max(0.02, v)).toFixed(4));
      drawMapPinsAndPath();
      autoBackupMapCoords();
    }
  };
  $("mapCellYInput").oninput = (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && mapEditorState.boardPath[mapEditorState.selectedCell]) {
      pushMapUndoSnapshot(`edit_y #${mapEditorState.selectedCell}`);
      mapEditorState.boardPath[mapEditorState.selectedCell].y = Number(Math.min(0.98, Math.max(0.02, v)).toFixed(4));
      drawMapPinsAndPath();
      autoBackupMapCoords();
    }
  };
  $("mapResetCoordsBtn").onclick = () => {
    pushMapUndoSnapshot("reset_default");
    mapEditorState.boardPath = mapEditorState.defaultBoardPath.map(c => ({ ...c }));
    syncSelectedCellInputs();
    drawMapPinsAndPath();
    autoBackupMapCoords();
    showToast("Đã đặt lại 37 tọa độ về bản đồ gốc (có thể Ctrl+Z để quay lại)");
  };
  $("mapImageFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    mapEditorState.pickedImageDataUrl = (await readFilesAsDataUrls([f]))[0];
    $("mapStageImg").src = mapEditorState.pickedImageDataUrl;
    showToast("Đã nạp ảnh bản đồ mới — bấm 'Thêm map mới & Áp dụng' để lưu mà không mất map cũ!");
  };

  const doSaveMap = async ({ asNew = true, activate = true }) => {
    const name = $("mapNameInput").value.trim();
    if (!name) return showToast("Vui lòng nhập tên bản đồ!", "error");
    if (asNew && !mapEditorState.pickedImageDataUrl) {
      return showToast("Hãy chọn file ảnh cho bản đồ mới!", "error");
    }
    const resSave = await api("/assets/maps/save", {
      method: "POST",
      body: JSON.stringify({
        id: asNew ? null : mapEditorState.editingId,
        name,
        image_data_url: mapEditorState.pickedImageDataUrl,
        board_path: mapEditorState.boardPath,
        activate,
      }),
    });
    if (!resSave.success) return showToast(resSave.message, "error");
    showToast(resSave.message);
    mapEditorState.editingId = null;
    mapEditorState.name = "";
    mapEditorState.pickedImageDataUrl = null;
    mapEditorState.imageUrl = resSave.map?.image_url + (resSave.map?.version ? `?v=${resSave.map.version}` : "");
    renderStudioMaps();
  };

  if ($("mapUpdateExistingBtn")) {
    $("mapUpdateExistingBtn").onclick = () => doSaveMap({ asNew: false, activate: true });
  }
  $("mapSaveOnlyBtn").onclick = () => doSaveMap({ asNew: true, activate: false });
  $("mapSaveActivateBtn").onclick = () => doSaveMap({ asNew: true, activate: true });
}

// ── SUB-TAB 7: SẢNH CHỜ NGÀY/ĐÊM + MÔ PHỎNG KHÍ QUYỂN 24H ───────
function computeLobbyAtmosphereCss(hourFloat) {
  const h = ((hourFloat % 24) + 24) % 24;
  if (h >= 5 && h < 7.5) {
    const t = (h - 5) / 2.5, bell = Math.sin(t * Math.PI);
    return { nightAlpha: 0.85 * (1 - t), tintCss: `rgba(255, 170, 85, ${(0.18 * bell).toFixed(3)})`, blend: "normal", label: "BÌNH MINH (NẮNG SỚM DỊU)" };
  }
  if (h >= 7.5 && h < 10.5) {
    const t = (h - 7.5) / 3.0;
    return { nightAlpha: 0, tintCss: `rgba(255, 243, 204, ${(0.08 * (1 - t * 0.5)).toFixed(3)})`, blend: "screen", label: "BUỔI SÁNG (NẮNG NHẸ)" };
  }
  if (h >= 10.5 && h < 15.5) {
    const t = (h - 10.5) / 5.0, bell = Math.sin(t * Math.PI);
    return { nightAlpha: 0, tintCss: `rgba(255, 255, 255, ${(0.03 + 0.07 * bell).toFixed(3)})`, blend: "screen", label: "BUỔI TRƯA (SÁNG RỰC RỠ)" };
  }
  if (h >= 15.5 && h < 18.5) {
    const t = (h - 15.5) / 3.0, bell = Math.sin(t * Math.PI);
    return { nightAlpha: 0.55 * t, tintCss: `rgba(255, 107, 53, ${(0.24 * bell).toFixed(3)})`, blend: "normal", label: "HOÀNG HÔN (CHUYỂN TỐI DẦN)" };
  }
  if (h >= 18.5 && h < 20.5) {
    const t = (h - 18.5) / 2.0;
    return { nightAlpha: 0.55 + 0.45 * t, tintCss: `rgba(43, 30, 90, ${(0.16 * (1 - t * 0.4)).toFixed(3)})`, blend: "normal", label: "CHẠNG VẠNG (TỐI DẦN)" };
  }
  return { nightAlpha: 1, tintCss: "rgba(10, 25, 54, 0.10)", blend: "normal", label: "BAN ĐÊM" };
}

function fmtHourFloat(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function syncLobbyIslandInputs() {
  const item = (lobbyStudioState.islands || []).find(i => i.key === lobbyStudioState.selectedIslandKey) || lobbyStudioState.islands?.[0];
  if (!item) return;
  if ($("lobbyIslandSelect")) $("lobbyIslandSelect").value = item.key;
  if ($("lobbyIslandXInput")) $("lobbyIslandXInput").value = item.x;
  if ($("lobbyIslandYInput")) $("lobbyIslandYInput").value = item.y;
}

function drawLobbyIslandPins() {
  const stage = $("lobbySimStage");
  if (!stage) return;
  stage.querySelectorAll(".lobby-island-pin").forEach(el => el.remove());

  (lobbyStudioState.islands || []).forEach((item) => {
    const pin = document.createElement("div");
    pin.className = "lobby-island-pin" + (item.key === lobbyStudioState.selectedIslandKey ? " pin-selected" : "");
    pin.style.left = `${(item.x * 100).toFixed(3)}%`;
    pin.style.top = `${(item.y * 100).toFixed(3)}%`;
    pin.textContent = item.label;
    pin.title = `${item.label} (X=${item.x}, Y=${item.y}) — Kéo thả để di chuyển`;

    pin.onmousedown = (ev) => {
      ev.stopPropagation();
      lobbyStudioState.selectedIslandKey = item.key;
      syncLobbyIslandInputs();
      drawLobbyIslandPins();
      const rect = stage.getBoundingClientRect();
      const onMove = (me) => {
        item.x = Number(Math.min(0.96, Math.max(0.04, (me.clientX - rect.left) / rect.width)).toFixed(4));
        item.y = Number(Math.min(0.96, Math.max(0.04, (me.clientY - rect.top) / rect.height)).toFixed(4));
        syncLobbyIslandInputs();
        drawLobbyIslandPins();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    stage.appendChild(pin);
  });
}

async function renderStudioLobby() {
  const res = await api("/assets/lobby");
  lobbyStudioState.presets = res.presets || [];
  lobbyStudioState.activeId = res.active_lobby_id || "default";
  lobbyStudioState.timeMode = res.time_mode || "auto";
  lobbyStudioState.fixedHour = Number(res.fixed_hour ?? 12);
  lobbyStudioState.defaultIslands = res.default_islands || [
    { key: "play", label: "ĐẤU TRƯỜNG TRÍ TUỆ", x: 0.50, y: 0.5393 },
    { key: "shop", label: "CỬA HÀNG", x: 0.31, y: 0.23 },
    { key: "rank", label: "XẾP HẠNG", x: 0.12, y: 0.42 },
    { key: "lab",  label: "NGHIÊN CỨU", x: 0.84, y: 0.44 },
  ];

  const targetId = lobbyStudioState.previewId || lobbyStudioState.activeId;
  const previewObj = lobbyStudioState.presets.find(p => p.id === targetId)
    || lobbyStudioState.presets.find(p => p.id === lobbyStudioState.activeId)
    || lobbyStudioState.presets[0];

  if (previewObj) {
    lobbyStudioState.previewId = previewObj.id;
    if (!lobbyStudioState.pickedDayDataUrl && !lobbyStudioState.pickedNightDataUrl) {
      const ver = previewObj.version ? `?v=${previewObj.version}` : "";
      lobbyStudioState.previewDayUrl = previewObj.day_url + ver;
      lobbyStudioState.previewNightUrl = previewObj.night_url + ver;
    }
    if (!lobbyStudioState.islands.length) {
      lobbyStudioState.islands = (previewObj.islands || lobbyStudioState.defaultIslands).map(i => ({ ...i }));
    }
  }

  const curIsland = lobbyStudioState.islands.find(i => i.key === lobbyStudioState.selectedIslandKey)
    || lobbyStudioState.islands[0]
    || { key: "play", label: "ĐẤU TRƯỜNG TRÍ TUỆ", x: 0.5, y: 0.5393 };

  setTabHtml(`
    ${studioSubTabsHtml()}

    <div class="panel">
      <div class="panel-head">
        <h3>[ MÔ PHỎNG SẢNH 24H &amp; KÉO THẢ VỊ TRÍ 4 KHU VỰC ]</h3>
        <span class="badge ${lobbyStudioState.timeMode === "auto" ? "badge-online" : "badge-mute"}">
          ${lobbyStudioState.timeMode === "auto" ? "[CHẾ ĐỘ: TỰ ĐỘNG 24H]" : `[CỐ ĐỊNH DEMO: ${fmtHourFloat(lobbyStudioState.fixedHour)}]`}
        </span>
      </div>

      <div class="toolbar" style="margin-bottom:10px;justify-content:space-between">
        <div class="toolbar">
          <select id="lobbyIslandSelect" style="min-width:190px">
            ${lobbyStudioState.islands.map(it => `<option value="${esc(it.key)}" ${it.key === curIsland.key ? "selected" : ""}>${esc(it.label)}</option>`).join("")}
          </select>
          <span class="muted">X:</span>
          <input id="lobbyIslandXInput" type="number" step="0.001" min="0.04" max="0.96" value="${curIsland.x}" style="width:86px;min-width:86px" />
          <span class="muted">Y:</span>
          <input id="lobbyIslandYInput" type="number" step="0.001" min="0.04" max="0.96" value="${curIsland.y}" style="width:86px;min-width:86px" />
        </div>
        <div class="toolbar">
          <button id="lobbyResetIslandsBtn" class="btn btn-ghost btn-sm">↺ Vị trí gốc</button>
          <button id="lobbySaveIslandsBtn" class="btn btn-primary btn-sm">Lưu vị trí chữ (${esc(previewObj?.name || "Sảnh này")})</button>
        </div>
      </div>

      <div id="lobbySimStage" class="map-stage-wrap" style="max-width:680px;margin:0 auto;aspect-ratio:16/9">
        <img id="lobbySimDayImg" class="map-stage-img" style="object-fit:cover" src="${esc(lobbyStudioState.pickedDayDataUrl || lobbyStudioState.previewDayUrl)}" alt="Lobby Day" />
        <img id="lobbySimNightImg" class="map-stage-img" style="position:absolute;inset:0;object-fit:cover;transition:opacity 0.15s linear;pointer-events:none" src="${esc(lobbyStudioState.pickedNightDataUrl || lobbyStudioState.previewNightUrl)}" alt="Lobby Night" />
        <div id="lobbySimTint" style="position:absolute;inset:0;pointer-events:none;transition:background 0.15s linear"></div>
        <div class="sprite-stage-hud" style="font-size:11px;padding:4px 10px">
          <span id="lobbySimTimeLabel">--:--</span>
          <span id="lobbySimPhaseLabel">READY</span>
        </div>
      </div>

      <div style="margin-top:12px">
        <input id="lobbyHourSlider" type="range" min="0" max="23.75" step="0.25" value="${lobbyStudioState.simHour.toFixed(2)}" />
        <div class="toolbar" style="margin-top:8px;justify-content:space-between">
          <div class="toolbar">
            <button class="btn btn-ghost btn-sm" data-sim-hour="6.25">06:15 Bình minh</button>
            <button class="btn btn-ghost btn-sm" data-sim-hour="9">09:00 Sáng</button>
            <button class="btn btn-ghost btn-sm" data-sim-hour="12.5">12:30 Trưa</button>
            <button class="btn btn-ghost btn-sm" data-sim-hour="17.25">17:15 Hoàng hôn</button>
            <button class="btn btn-ghost btn-sm" data-sim-hour="19.5">19:30 Chạng vạng</button>
            <button class="btn btn-ghost btn-sm" data-sim-hour="22.5">22:30 Đêm</button>
          </div>
          <div class="toolbar">
            <button id="lobbyApplyAutoTimeBtn" class="btn ${lobbyStudioState.timeMode === "auto" ? "btn-primary" : "btn-secondary"} btn-sm">Bật Tự động 24h</button>
            <button id="lobbyApplyFixedTimeBtn" class="btn ${lobbyStudioState.timeMode === "fixed" ? "btn-warning" : "btn-secondary"} btn-sm">Ép giờ này để Demo</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel" id="lobbyEditFormPanel">
      <div class="panel-head">
        <h3>${lobbyStudioState.editingId
          ? `[ SỬA BỘ SẢNH ĐÃ UPLOAD: ${esc(lobbyStudioState.editingName)} ]`
          : `[ THÊM BỘ SẢNH NGÀY / ĐÊM MỚI (GIÁNG SINH, TẾT, MÙA HÈ...) ]`}</h3>
        <span class="muted">${lobbyStudioState.editingId
          ? "Bỏ trống ảnh nếu muốn giữ nguyên ảnh cũ — tự lưu kèm vị trí 4 chữ ở khung trên"
          : "Lưu kèm luôn vị trí 4 chữ khu vực đang kéo ở khung trên"}</span>
      </div>
      <div class="field">
        <label>TÊN BỘ SẢNH CHỜ</label>
        <input id="lobbyPresetNameInput" value="${esc(lobbyStudioState.editingName || "")}" placeholder="vd: Sảnh Giáng Sinh 2026, Sảnh Tết..." />
      </div>
      <div class="form-grid-2">
        <div class="field">
          <label>ẢNH BAN NGÀY (05:00 → 18:30) ${lobbyStudioState.editingId ? "<span class='muted'>(chọn để thay ảnh cũ)</span>" : ""}</label>
          <input id="lobbyDayFileInput" type="file" accept="image/png,image/webp,image/jpeg" />
        </div>
        <div class="field">
          <label>ẢNH BAN ĐÊM (18:30 → 05:00) ${lobbyStudioState.editingId ? "<span class='muted'>(chọn để thay ảnh cũ)</span>" : ""}</label>
          <input id="lobbyNightFileInput" type="file" accept="image/png,image/webp,image/jpeg" />
        </div>
      </div>
      <div class="toolbar">
        ${lobbyStudioState.editingId ? `
          <button id="lobbyUpdateExistingBtn" class="btn btn-primary btn-sm">CẬP NHẬT BỘ SẢNH NÀY</button>
          <button id="lobbyCancelEditBtn" class="btn btn-ghost btn-sm">✖ Hủy sửa</button>
        ` : `
          <button id="lobbySaveNewBtn" class="btn btn-primary btn-sm">THÊM BỘ SẢNH MỚI &amp; ÁP DỤNG</button>
          <button id="lobbySaveStockBtn" class="btn btn-secondary btn-sm">+ Lưu vào kho</button>
        `}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO BỘ SẢNH NGÀY / ĐÊM (${lobbyStudioState.presets.length}) ]</h3>
        <span class="muted">Đang dùng: <b class="accent-green">${esc(lobbyStudioState.activeId)}</b></span>
      </div>
      <div class="orb-pair-grid">
        ${lobbyStudioState.presets.map(p => {
          const isActive = p.id === lobbyStudioState.activeId;
          const isEditing = p.id === lobbyStudioState.editingId;
          const isPreview = p.id === lobbyStudioState.previewId;
          const v = p.version ? `?v=${p.version}` : "";
          return `
            <div class="orb-pair-card ${isActive || isEditing || isPreview ? "selected" : ""}" style="cursor:pointer" data-act="preview-lobby" data-id="${esc(p.id)}" title="Bấm vào thẻ để xem demo 24h & kéo thả vị trí chữ">
              <div class="orb-pair-head">
                <strong>${esc(p.name)}</strong>
                ${isActive ? `<span class="badge badge-online">[ĐANG DÙNG]</span>` : `<span class="badge badge-offline">[SẴN SÀNG]</span>`}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div>
                  <img class="bg-thumb" src="${esc(p.day_url + v)}" alt="Day" />
                  <div class="muted" style="text-align:center;margin-top:3px">BAN NGÀY</div>
                </div>
                <div>
                  <img class="bg-thumb" src="${esc(p.night_url + v)}" alt="Night" />
                  <div class="muted" style="text-align:center;margin-top:3px">BAN ĐÊM</div>
                </div>
              </div>
              <div class="actions-cell">
                ${!isActive ? `<button class="btn btn-primary btn-sm" data-act="activate-lobby" data-id="${esc(p.id)}">Áp dụng</button>` : ""}
                <button class="btn ${isEditing ? "btn-warning" : "btn-secondary"} btn-sm" data-act="edit-lobby" data-id="${esc(p.id)}">Sửa giao diện</button>
                ${p.id === "default" && p.has_override ? `<button class="btn btn-ghost btn-sm" data-act="reset-default-lobby">↩ Khôi phục gốc</button>` : ""}
                ${p.is_custom ? `<button class="btn btn-danger btn-sm" data-act="delete-lobby" data-id="${esc(p.id)}">Xóa</button>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);

  drawLobbyIslandPins();

  $("lobbySimStage").onclick = (ev) => {
    if (ev.target.classList.contains("lobby-island-pin")) return;
    const rect = $("lobbySimStage").getBoundingClientRect();
    const item = lobbyStudioState.islands.find(i => i.key === lobbyStudioState.selectedIslandKey);
    if (!item) return;
    item.x = Number(Math.min(0.96, Math.max(0.04, (ev.clientX - rect.left) / rect.width)).toFixed(4));
    item.y = Number(Math.min(0.96, Math.max(0.04, (ev.clientY - rect.top) / rect.height)).toFixed(4));
    syncLobbyIslandInputs();
    drawLobbyIslandPins();
  };

  $("lobbyIslandSelect").onchange = (e) => {
    lobbyStudioState.selectedIslandKey = e.target.value;
    syncLobbyIslandInputs();
    drawLobbyIslandPins();
  };
  $("lobbyIslandXInput").oninput = (e) => {
    const v = Number(e.target.value);
    const item = lobbyStudioState.islands.find(i => i.key === lobbyStudioState.selectedIslandKey);
    if (Number.isFinite(v) && item) {
      item.x = Number(Math.min(0.96, Math.max(0.04, v)).toFixed(4));
      drawLobbyIslandPins();
    }
  };
  $("lobbyIslandYInput").oninput = (e) => {
    const v = Number(e.target.value);
    const item = lobbyStudioState.islands.find(i => i.key === lobbyStudioState.selectedIslandKey);
    if (Number.isFinite(v) && item) {
      item.y = Number(Math.min(0.96, Math.max(0.04, v)).toFixed(4));
      drawLobbyIslandPins();
    }
  };
  $("lobbyResetIslandsBtn").onclick = () => {
    lobbyStudioState.islands = lobbyStudioState.defaultIslands.map(i => ({ ...i }));
    syncLobbyIslandInputs();
    drawLobbyIslandPins();
    showToast("Đã đặt lại vị trí 4 khu vực về mặc định");
  };
  $("lobbySaveIslandsBtn").onclick = async () => {
    const pid = lobbyStudioState.previewId || lobbyStudioState.activeId || "default";
    const r = await api(`/assets/lobby/${encodeURIComponent(pid)}/islands`, {
      method: "POST",
      body: JSON.stringify({ islands: lobbyStudioState.islands }),
    });
    showToast(r.message, r.success ? "success" : "error");
    if (r.success) {
      lobbyStudioState.islands = [];
      renderStudioLobby();
    }
  };

  const updateSimVisual = (hourVal) => {
    lobbyStudioState.simHour = Number(hourVal);
    const atm = computeLobbyAtmosphereCss(lobbyStudioState.simHour);
    if ($("lobbySimNightImg")) $("lobbySimNightImg").style.opacity = atm.nightAlpha;
    if ($("lobbySimTint")) {
      $("lobbySimTint").style.background = atm.tintCss;
      $("lobbySimTint").style.mixBlendMode = atm.blend;
    }
    if ($("lobbySimTimeLabel")) $("lobbySimTimeLabel").textContent = `GIỜ MÔ PHỎNG: ${fmtHourFloat(lobbyStudioState.simHour)} (night=${Math.round(atm.nightAlpha * 100)}%)`;
    if ($("lobbySimPhaseLabel")) $("lobbySimPhaseLabel").textContent = atm.label;
  };
  updateSimVisual(lobbyStudioState.simHour);

  $("lobbyHourSlider").oninput = (e) => updateSimVisual(e.target.value);
  document.querySelectorAll("[data-sim-hour]").forEach(btn => {
    btn.onclick = () => {
      const h = Number(btn.dataset.simHour);
      $("lobbyHourSlider").value = h;
      updateSimVisual(h);
    };
  });

  $("lobbyApplyAutoTimeBtn").onclick = async () => {
    const r = await api("/assets/lobby/time-mode", { method: "POST", body: JSON.stringify({ time_mode: "auto" }) });
    showToast(r.message, r.success ? "success" : "error");
    renderStudioLobby();
  };
  $("lobbyApplyFixedTimeBtn").onclick = async () => {
    const r = await api("/assets/lobby/time-mode", {
      method: "POST",
      body: JSON.stringify({ time_mode: "fixed", fixed_hour: lobbyStudioState.simHour }),
    });
    showToast(r.message, r.success ? "success" : "error");
    renderStudioLobby();
  };

  $("lobbyDayFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    lobbyStudioState.pickedDayDataUrl = (await readFilesAsDataUrls([f]))[0];
    if ($("lobbySimDayImg")) $("lobbySimDayImg").src = lobbyStudioState.pickedDayDataUrl;
    showToast("Đã nạp ảnh Sảnh Ban Ngày lên khung mô phỏng 24h!");
  };
  $("lobbyNightFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    lobbyStudioState.pickedNightDataUrl = (await readFilesAsDataUrls([f]))[0];
    if ($("lobbySimNightImg")) $("lobbySimNightImg").src = lobbyStudioState.pickedNightDataUrl;
    showToast("Đã nạp ảnh Sảnh Ban Đêm lên khung mô phỏng 24h!");
  };

  const doSaveLobby = async ({ asNew = true, activate = true }) => {
    const name = $("lobbyPresetNameInput").value.trim();
    if (!name) return showToast("Vui lòng nhập tên bộ sảnh chờ!", "error");
    if (asNew && (!lobbyStudioState.pickedDayDataUrl || !lobbyStudioState.pickedNightDataUrl)) {
      return showToast("Vui lòng chọn đủ cả 2 ảnh Ban Ngày và Ban Đêm!", "error");
    }
    const r = await api("/assets/lobby/save", {
      method: "POST",
      body: JSON.stringify({
        id: asNew ? null : lobbyStudioState.editingId,
        name,
        day_data_url: lobbyStudioState.pickedDayDataUrl,
        night_data_url: lobbyStudioState.pickedNightDataUrl,
        islands: lobbyStudioState.islands,
        activate,
      }),
    });
    if (!r.success) return showToast(r.message, "error");
    showToast(r.message);
    lobbyStudioState.pickedDayDataUrl = null;
    lobbyStudioState.pickedNightDataUrl = null;
    lobbyStudioState.editingId = null;
    lobbyStudioState.editingName = "";
    lobbyStudioState.previewId = r.preset?.id || null;
    lobbyStudioState.islands = [];
    renderStudioLobby();
  };

  if ($("lobbyUpdateExistingBtn")) {
    $("lobbyUpdateExistingBtn").onclick = () => doSaveLobby({ asNew: false, activate: true });
  }
  if ($("lobbyCancelEditBtn")) {
    $("lobbyCancelEditBtn").onclick = () => {
      lobbyStudioState.editingId = null;
      lobbyStudioState.editingName = "";
      lobbyStudioState.pickedDayDataUrl = null;
      lobbyStudioState.pickedNightDataUrl = null;
      renderStudioLobby();
    };
  }
  if ($("lobbySaveNewBtn")) $("lobbySaveNewBtn").onclick = () => doSaveLobby({ asNew: true, activate: true });
  if ($("lobbySaveStockBtn")) $("lobbySaveStockBtn").onclick = () => doSaveLobby({ asNew: true, activate: false });
}

// ── SUB-TAB 8: BẢNG XẾP HẠNG (3 BỤC) & PHÒNG NGHIÊN CỨU (6 SPOT) ─
function drawSceneEditorPins() {
  const stage = $("sceneEditorStage");
  if (!stage) return;
  stage.querySelectorAll(".map-pin").forEach(el => el.remove());

  (sceneEditorState.spots || []).forEach((s, idx) => {
    const pin = document.createElement("div");
    let cls = "map-pin";
    if (sceneEditorState.sceneType === "rating") {
      if (s.id === 1) cls += " pin-start";
      else if (s.id === 2) cls += " pin-teacher";
      else cls += " pin-chest";
    } else {
      if (s.id === 3) cls += " pin-monster"; // Phù Thủy
      else cls += " pin-teacher";
    }
    if (idx === sceneEditorState.selectedSpotIdx) cls += " pin-selected";
    pin.className = cls;
    pin.style.width = "28px";
    pin.style.height = "28px";
    pin.style.marginLeft = "-14px";
    pin.style.marginTop = "-14px";
    pin.style.left = `${(s.x * 100).toFixed(3)}%`;
    pin.style.top = `${(s.y * 100).toFixed(3)}%`;
    pin.textContent = sceneEditorState.sceneType === "lab" && s.id === 3 ? "W" : String(s.id);
    pin.title = `${s.label} (${s.x}, ${s.y})`;

    pin.onmousedown = (ev) => {
      ev.stopPropagation();
      sceneEditorState.selectedSpotIdx = idx;
      syncSceneSpotInputs();
      drawSceneEditorPins();
      const rect = stage.getBoundingClientRect();
      const onMove = (me) => {
        s.x = Number(Math.min(0.98, Math.max(0.02, (me.clientX - rect.left) / rect.width)).toFixed(4));
        s.y = Number(Math.min(0.98, Math.max(0.02, (me.clientY - rect.top) / rect.height)).toFixed(4));
        syncSceneSpotInputs();
        drawSceneEditorPins();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    stage.appendChild(pin);
  });
}

function syncSceneSpotInputs() {
  const s = sceneEditorState.spots?.[sceneEditorState.selectedSpotIdx];
  if (!s) return;
  if ($("sceneSpotSelect")) $("sceneSpotSelect").value = String(sceneEditorState.selectedSpotIdx);
  if ($("sceneSpotXInput")) $("sceneSpotXInput").value = s.x;
  if ($("sceneSpotYInput")) $("sceneSpotYInput").value = s.y;
}

async function renderStudioScenes() {
  const st = sceneEditorState.sceneType || "rating";
  const res = await api(`/assets/scenes/${st}`);
  if (!res || res.success === false || !Array.isArray(res.presets)) {
    showToast("Server chưa nạp API mới — hãy khởi động lại `node server.js` rồi tải lại trang!", "error");
    return;
  }
  sceneEditorState.presets = res.presets || [];
  sceneEditorState.activeId = res.active_id || "default";
  sceneEditorState.defaultSpots = res.default_spots || [];

  if (!sceneEditorState.spots.length) {
    const activeObj = sceneEditorState.presets.find(p => p.id === sceneEditorState.activeId) || sceneEditorState.presets[0];
    if (activeObj) {
      sceneEditorState.editingId = null;
      sceneEditorState.name = "";
      sceneEditorState.imageUrl = activeObj.image_url + (activeObj.version ? `?v=${activeObj.version}` : "");
      sceneEditorState.spots = (activeObj.spots || sceneEditorState.defaultSpots).map(s => ({ ...s }));
      sceneEditorState.selectedSpotIdx = 0;
    }
  }

  const curSpot = sceneEditorState.spots[sceneEditorState.selectedSpotIdx] || { id: 1, x: 0.5, y: 0.6, label: "Spot" };

  setTabHtml(`
    ${studioSubTabsHtml()}

    <div class="toolbar" style="margin-bottom:4px">
      <button class="btn ${st === "rating" ? "btn-primary" : "btn-secondary"} btn-sm" data-act="switch-scene-type" data-type="rating">Bảng Vàng Xếp Hạng (3 bục)</button>
      <button class="btn ${st === "lab" ? "btn-primary" : "btn-secondary"} btn-sm" data-act="switch-scene-type" data-type="lab">Phòng Nghiên Cứu (6 vị trí + Phù Thủy)</button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ TRÌNH CHỈNH NỀN &amp; TỌA ĐỘ: ${esc(res.label || st)} ]</h3>
        <span class="muted">${st === "rating" ? "Kéo thả 3 chốt #1 (Quán Quân), #2, #3 vào đúng tâm mặt bục" : "Kéo thả chốt W (Phù Thủy) và các chốt 1,2,4,5,6 vào đúng tảng đá"}</span>
      </div>

      <div class="form-grid-2" style="margin-bottom:12px">
        <div class="field" style="margin-bottom:0">
          <label>TÊN GIAO DIỆN MỚI</label>
          <input id="scenePresetNameInput" value="${esc(sceneEditorState.name)}" placeholder="vd: BXH Giáng Sinh, Nghiên Cứu Tết..." />
        </div>
        <div class="field" style="margin-bottom:0">
          <label>UPLOAD ẢNH NỀN MỚI (16:9 — PNG/JPG/WEBP)</label>
          <input id="sceneBgFileInput" type="file" accept="image/png,image/webp,image/jpeg" />
        </div>
      </div>

      <div class="toolbar" style="margin-bottom:10px;justify-content:space-between">
        <div class="toolbar">
          <select id="sceneSpotSelect" style="min-width:170px">
            ${sceneEditorState.spots.map((s, idx) => `<option value="${idx}" ${idx === sceneEditorState.selectedSpotIdx ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
          </select>
          <span class="muted">X:</span>
          <input id="sceneSpotXInput" type="number" step="0.001" min="0.02" max="0.98" value="${curSpot.x}" style="width:86px;min-width:86px" />
          <span class="muted">Y:</span>
          <input id="sceneSpotYInput" type="number" step="0.001" min="0.02" max="0.98" value="${curSpot.y}" style="width:86px;min-width:86px" />
        </div>
        <button id="sceneResetSpotsBtn" class="btn btn-ghost btn-sm">↺ Tọa độ gốc</button>
      </div>

      <div id="sceneEditorStage" class="map-stage-wrap" style="max-width:760px;margin:0 auto">
        <img id="sceneStageImg" class="map-stage-img" style="object-fit:cover" src="${esc(sceneEditorState.pickedImageDataUrl || sceneEditorState.imageUrl)}" alt="Scene Preview" />
      </div>

      <div class="toolbar" style="margin-top:12px;justify-content:space-between">
        <div class="muted">&gt; ${sceneEditorState.editingId ? `Đang sửa preset: <b class="cyan-val">${esc(sceneEditorState.editingId)}</b>` : `Chế độ: <b class="accent-green">THÊM MỚI</b> (giữ nguyên toàn bộ preset cũ)`}</div>
        <div class="toolbar">
          ${sceneEditorState.editingId ? `<button id="sceneUpdateBtn" class="btn btn-secondary btn-sm">Cập nhật preset này</button>` : ""}
          <button id="sceneSaveStockBtn" class="btn btn-secondary btn-sm">+ Thêm vào kho</button>
          <button id="sceneSaveActivateBtn" class="btn btn-primary btn-sm">THÊM MỚI &amp; ÁP DỤNG</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>[ KHO GIAO DIỆN ${esc((res.label || "").toUpperCase())} (${sceneEditorState.presets.length}) ]</h3>
        <span class="muted">Đang dùng: <b class="accent-green">${esc(sceneEditorState.activeId)}</b></span>
      </div>
      <div class="asset-card-grid">
        ${sceneEditorState.presets.map(p => {
          const isActive = p.id === sceneEditorState.activeId;
          const isEditing = p.id === sceneEditorState.editingId;
          const thumb = p.image_url + (p.version ? `?v=${p.version}` : "");
          return `
            <div class="asset-item-card ${isActive || isEditing ? "selected" : ""}" style="cursor:pointer" data-act="edit-scene-preset" data-id="${esc(p.id)}" title="Bấm vào thẻ để mở lên khung kéo thả vị trí">
              <img class="bg-thumb" src="${esc(thumb)}" alt="${esc(p.name)}" />
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                <strong>${esc(p.name)}</strong>
                ${isActive ? `<span class="badge badge-online">[ĐANG DÙNG]</span>` : `<span class="badge badge-offline">[SẴN SÀNG]</span>`}
              </div>
              <div class="actions-cell">
                ${!isActive ? `<button class="btn btn-primary btn-sm" data-act="activate-scene-preset" data-id="${esc(p.id)}">Áp dụng</button>` : ""}
                ${p.is_custom ? `<button class="btn btn-danger btn-sm" data-act="delete-scene-preset" data-id="${esc(p.id)}">Xóa</button>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);

  drawSceneEditorPins();

  $("sceneEditorStage").onclick = (ev) => {
    if (ev.target.classList.contains("map-pin")) return;
    const rect = $("sceneEditorStage").getBoundingClientRect();
    const s = sceneEditorState.spots[sceneEditorState.selectedSpotIdx];
    if (!s) return;
    s.x = Number(Math.min(0.98, Math.max(0.02, (ev.clientX - rect.left) / rect.width)).toFixed(4));
    s.y = Number(Math.min(0.98, Math.max(0.02, (ev.clientY - rect.top) / rect.height)).toFixed(4));
    syncSceneSpotInputs();
    drawSceneEditorPins();
  };

  $("sceneSpotSelect").onchange = (e) => {
    sceneEditorState.selectedSpotIdx = Number(e.target.value);
    syncSceneSpotInputs();
    drawSceneEditorPins();
  };
  $("sceneSpotXInput").oninput = (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && sceneEditorState.spots[sceneEditorState.selectedSpotIdx]) {
      sceneEditorState.spots[sceneEditorState.selectedSpotIdx].x = Number(Math.min(0.98, Math.max(0.02, v)).toFixed(4));
      drawSceneEditorPins();
    }
  };
  $("sceneSpotYInput").oninput = (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && sceneEditorState.spots[sceneEditorState.selectedSpotIdx]) {
      sceneEditorState.spots[sceneEditorState.selectedSpotIdx].y = Number(Math.min(0.98, Math.max(0.02, v)).toFixed(4));
      drawSceneEditorPins();
    }
  };
  $("sceneResetSpotsBtn").onclick = () => {
    sceneEditorState.spots = sceneEditorState.defaultSpots.map(s => ({ ...s }));
    syncSceneSpotInputs();
    drawSceneEditorPins();
    showToast("Đã đặt lại tọa độ gốc");
  };
  $("sceneBgFileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    sceneEditorState.pickedImageDataUrl = (await readFilesAsDataUrls([f]))[0];
    $("sceneStageImg").src = sceneEditorState.pickedImageDataUrl;
    showToast("Đã nạp ảnh nền mới — kéo các chốt vào đúng vị trí rồi bấm Lưu!");
  };

  const doSaveScene = async ({ asNew = true, activate = true }) => {
    const name = $("scenePresetNameInput").value.trim();
    if (!name) return showToast("Vui lòng nhập tên giao diện!", "error");
    if (asNew && !sceneEditorState.pickedImageDataUrl) {
      return showToast("Hãy chọn ảnh nền mới!", "error");
    }
    const r = await api(`/assets/scenes/${st}/save`, {
      method: "POST",
      body: JSON.stringify({
        id: asNew ? null : sceneEditorState.editingId,
        name,
        image_data_url: sceneEditorState.pickedImageDataUrl,
        spots: sceneEditorState.spots,
        activate,
      }),
    });
    if (!r.success) return showToast(r.message, "error");
    showToast(r.message);
    sceneEditorState.editingId = null;
    sceneEditorState.name = "";
    sceneEditorState.pickedImageDataUrl = null;
    sceneEditorState.spots = [];
    renderStudioScenes();
  };

  if ($("sceneUpdateBtn")) $("sceneUpdateBtn").onclick = () => doSaveScene({ asNew: false, activate: true });
  $("sceneSaveStockBtn").onclick = () => doSaveScene({ asNew: true, activate: false });
  $("sceneSaveActivateBtn").onclick = () => doSaveScene({ asNew: true, activate: true });
}

// ═══════════════════════════════════════════════════════════════
//  11. SYSTEM CONSOLE (LIVE TAIL MỌI TÁC ĐỘNG TOÀN HỆ THỐNG)
// ═══════════════════════════════════════════════════════════════
let consoleCategory = "ALL";
let cacheConsoleLogs = [];

async function renderSystemConsole(category = consoleCategory, search = "") {
  consoleCategory = category || "ALL";
  const qs = new URLSearchParams({ category: consoleCategory, search, limit: 250 }).toString();
  const res = await api(`/console/logs?${qs}`);
  cacheConsoleLogs = res.logs || [];

  const cats = ["ALL", "CHAT", "GAME", "ROOM", "SHOP", "PAYMENT", "AUTH", "SECURITY", "ADMIN"];
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour12: false });

  setTabHtml(`
    <div class="panel">
      <div class="panel-head">
        <h3>[ $ tail -f /var/log/cotyphu-system.log ]</h3>
        <div class="toolbar">
          <span class="muted">buffered: <b class="cyan-val">${res.total_buffered || 0}</b> / 1000</span>
          <button id="consoleExportBtn" class="btn btn-secondary btn-sm">⬇ Xuất .log</button>
          <button id="consoleClearBtn" class="btn btn-danger btn-sm">Xóa đệm</button>
        </div>
      </div>

      <div class="toolbar" style="margin-bottom:10px;justify-content:space-between">
        <div class="toolbar">
          ${cats.map(c => `
            <button class="btn ${consoleCategory === c ? "btn-primary" : "btn-ghost"} btn-sm" data-act="console-cat" data-cat="${c}">
              ${c}
            </button>
          `).join("")}
        </div>
        <div class="toolbar">
          <input id="consoleSearchInput" type="text" placeholder="lọc user, IP, chat, action..." value="${esc(search)}" />
          <button id="consoleSearchBtn" class="btn btn-secondary btn-sm">LỌC</button>
        </div>
      </div>

      <div id="consoleTerminalBox" class="console-terminal">
        ${cacheConsoleLogs.length === 0
          ? `<div class="empty-state">&gt; Chưa có sự kiện nào trong bộ đệm. Hãy thử chat, mua đồ, tung xúc xắc hoặc đăng nhập ở trang game...</div>`
          : [...cacheConsoleLogs].reverse().map(l => `
            <div class="console-line">
              <span class="console-ts">${fmtTime(l.ts)}</span>
              <span class="console-cat cat-${esc(l.category)}">[${esc(l.category)}]</span>
              <span class="cyan-val">${esc(l.ip)}</span>
              <span>${l.user_id ? `<strong>${esc(l.username || `u#${l.user_id}`)}</strong> <span class="muted">#${l.user_id}</span>` : `<span class="muted">${esc(l.username || "system")}</span>`}</span>
              <div>
                <span style="color:${l.level === "ERR" ? "var(--red)" : l.level === "WARN" ? "var(--amber)" : "var(--text)"}"><strong>${esc(l.action)}</strong></span>
                ${l.detail ? ` <span class="console-detail">→ ${esc(l.detail)}</span>` : ""}
              </div>
            </div>
          `).join("")}
      </div>
    </div>
  `);

  $("consoleSearchBtn").onclick = () => renderSystemConsole(consoleCategory, $("consoleSearchInput").value);
  $("consoleSearchInput").onkeydown = (e) => { if (e.key === "Enter") $("consoleSearchBtn").click(); };
  $("consoleClearBtn").onclick = async () => {
    const r = await api("/console/clear", { method: "POST" });
    showToast(r.message || "Đã xóa đệm Console");
    renderSystemConsole(consoleCategory, $("consoleSearchInput")?.value || "");
  };
  $("consoleExportBtn").onclick = () => {
    const lines = cacheConsoleLogs.map(l =>
      `${new Date(l.ts).toISOString()} [${l.category}] [${l.level}] ip=${l.ip} user=${l.user_id || "-"} ${l.action} ${l.detail ? "-> " + l.detail : ""}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotyphu_system_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("⬇ Đã tải file nhật ký .log!");
  };
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL EVENT DELEGATION & BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = Number(btn.dataset.id);

  try {
    if (act === "edit-user") openEditUserModal(id);
    else if (act === "ban-user") openBanUserModal(id);
    else if (act === "mute-user") openMuteUserModal(id);
    else if (act === "unban-user") {
      const res = await api(`/users/${id}/unban`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      renderUsers($("userSearchInput")?.value || "", $("userStatusSelect")?.value || "all");
    } else if (act === "unmute-user") {
      const res = await api(`/users/${id}/unmute`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      renderUsers($("userSearchInput")?.value || "", $("userStatusSelect")?.value || "all");
    } else if (act === "close-room") {
      if (!confirm(`Buộc đóng phòng #${id}?`)) return;
      const res = await api(`/rooms/${id}/close`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      renderRooms($("roomStatusSelect")?.value || "all");
    } else if (act === "delete-room") {
      if (!confirm(`Xóa vĩnh viễn phòng #${id}?`)) return;
      const res = await api(`/rooms/${id}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      renderRooms($("roomStatusSelect")?.value || "all");
    } else if (act === "edit-question") openQuestionModal(id);
    else if (act === "delete-question") {
      if (!confirm(`Xóa câu hỏi #${id}?`)) return;
      const res = await api(`/questions/${id}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      renderQuestions($("qSearchInput")?.value || "");
    } else if (act === "edit-tarot") openTarotModal(id);
    else if (act === "delete-tarot") {
      if (!confirm(`Xóa thẻ Tarot #${id}?`)) return;
      const res = await api(`/tarots/${id}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      renderTarots();
    } else if (act === "edit-char") openCharacterModal(id);
    else if (act === "quick-block-ip") openBlockIpModal(btn.dataset.ip || "");
    else if (act === "unblock-ip") {
      if (!confirm("Gỡ chặn địa chỉ IP này?")) return;
      const res = await api(`/security/blacklist/${id}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      renderBlacklistAndSessions();
    } else if (act === "quick-ban-uid") {
      if (!confirm(`Khóa tài khoản #${id} trong 24 giờ vì hành vi khả nghi?`)) return;
      const res = await api(`/users/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ duration_minutes: 1440, reason: "Phát hiện hành vi gian lận từ hệ thống SOC" }),
      });
      showToast(res.message, res.success ? "success" : "error");
      renderSecurity();
    } else if (act === "select-npc-slot") {
      spriteStudioState.slot = btn.dataset.slot || "monster";
      spriteStudioState.mode = "idle";
      spriteStudioState.idleDataUrls = [];
      spriteStudioState.attackDataUrls = [];
      spriteStudioState.frameIdx = 0;
      renderSpriteStudio();
    } else if (act === "reset-npc-slot") {
      const slot = btn.dataset.slot || "monster";
      if (!confirm(`Khôi phục ${slot} về sprite mặc định và xóa ảnh custom trên ổ cứng?`)) return;
      const res = await api(`/assets/npcs/${slot}/reset`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      spriteStudioState.idleDataUrls = [];
      spriteStudioState.attackDataUrls = [];
      renderSpriteStudio();
    } else if (act === "studio-subtab") {
      studioSubTab = btn.dataset.sub || "npcs";
      renderSpriteStudio();
    } else if (act === "select-skin-slot") {
      skinStudioState.skinId = id;
      skinStudioState.mode = "idle";
      skinStudioState.idleDataUrls = [];
      skinStudioState.runDataUrls = [];
      skinStudioState.hurtDataUrls = [];
      skinStudioState.frameIdx = 0;
      renderStudioSkins();
    } else if (act === "reset-skin-slot") {
      if (!confirm("Khôi phục ảnh gốc cho trang phục này?")) return;
      const res = await api(`/assets/skins/${id}/reset`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      skinStudioState.idleDataUrls = []; skinStudioState.runDataUrls = []; skinStudioState.hurtDataUrls = [];
      renderStudioSkins();
    } else if (act === "upload-tarot-img") {
      openTarotImageModal(id);
    } else if (act === "edit-bg-asset") {
      openBackgroundModal(id);
    } else if (act === "upload-orb-img") {
      openOrbUploadModal(btn.dataset.key);
    } else if (act === "reset-orb-img") {
      const k = btn.dataset.key;
      if (!confirm(`Khôi phục ảnh gốc cho tinh cầu ${k}?`)) return;
      const res = await api(`/assets/orbs/${k}/reset`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      renderStudioOrbs();
    } else if (act === "activate-map") {
      const mapId = btn.dataset.id;
      const res = await api(`/assets/maps/${encodeURIComponent(mapId)}/activate`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      renderStudioMaps();
    } else if (act === "load-map-editor") {
      const mapId = btn.dataset.id;
      const found = mapEditorState.maps.find(m => m.id === mapId);
      if (found) {
        mapEditorState.editingId = found.is_custom ? found.id : null;
        mapEditorState.name = found.is_custom ? found.name : "Bản sao từ Mặc định";
        mapEditorState.imageUrl = found.image_url + (found.version ? `?v=${found.version}` : "");
        mapEditorState.pickedImageDataUrl = null;
        mapEditorState.boardPath = (found.board_path || mapEditorState.defaultBoardPath).map(c => ({ ...c }));
        mapEditorState.selectedCell = 0;
        renderStudioMaps();
      }
    } else if (act === "delete-map") {
      const mapId = btn.dataset.id;
      if (!confirm("Xóa vĩnh viễn bản đồ này?")) return;
      const res = await api(`/assets/maps/${encodeURIComponent(mapId)}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      if (mapEditorState.editingId === mapId) mapEditorState.editingId = null;
      renderStudioMaps();
    } else if (act === "activate-lobby") {
      const lid = btn.dataset.id;
      const res = await api(`/assets/lobby/${encodeURIComponent(lid)}/activate`, { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      lobbyStudioState.pickedDayDataUrl = null;
      lobbyStudioState.pickedNightDataUrl = null;
      lobbyStudioState.previewId = btn.dataset.id;
      lobbyStudioState.islands = [];
      renderStudioLobby();
    } else if (act === "preview-lobby") {
      const lid = btn.dataset.id;
      const found = lobbyStudioState.presets.find(p => p.id === lid);
      if (found) {
        const v = found.version ? `?v=${found.version}` : "";
        lobbyStudioState.previewId = found.id;
        lobbyStudioState.pickedDayDataUrl = null;
        lobbyStudioState.pickedNightDataUrl = null;
        lobbyStudioState.previewDayUrl = found.day_url + v;
        lobbyStudioState.previewNightUrl = found.night_url + v;
        lobbyStudioState.islands = (found.islands || lobbyStudioState.defaultIslands).map(i => ({ ...i }));
        await renderStudioLobby();
        $("lobbySimStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (act === "edit-lobby") {
      const lid = btn.dataset.id;
      const found = lobbyStudioState.presets.find(p => p.id === lid);
      if (found) {
        const v = found.version ? `?v=${found.version}` : "";
        lobbyStudioState.editingId = found.id;
        lobbyStudioState.editingName = found.name;
        lobbyStudioState.previewId = found.id;
        lobbyStudioState.pickedDayDataUrl = null;
        lobbyStudioState.pickedNightDataUrl = null;
        lobbyStudioState.previewDayUrl = found.day_url + v;
        lobbyStudioState.previewNightUrl = found.night_url + v;
        lobbyStudioState.islands = (found.islands || lobbyStudioState.defaultIslands).map(i => ({ ...i }));
        await renderStudioLobby();
        $("lobbyEditFormPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (act === "reset-default-lobby") {
      if (!confirm("Khôi phục Sảnh Mặc Định về ảnh và vị trí gốc ban đầu?")) return;
      const res = await api("/assets/lobby/default/reset", { method: "POST" });
      showToast(res.message, res.success ? "success" : "error");
      lobbyStudioState.editingId = null;
      lobbyStudioState.editingName = "";
      lobbyStudioState.previewId = "default";
      lobbyStudioState.islands = [];
      renderStudioLobby();
    } else if (act === "delete-lobby") {
      const lid = btn.dataset.id;
      if (!confirm("Xóa vĩnh viễn bộ sảnh chờ này?")) return;
      const res = await api(`/assets/lobby/${encodeURIComponent(lid)}`, { method: "DELETE" });
      showToast(res.message, res.success ? "success" : "error");
      if (lobbyStudioState.editingId === lid) {
        lobbyStudioState.editingId = null;
        lobbyStudioState.editingName = "";
      }
      lobbyStudioState.previewId = null;
      lobbyStudioState.islands = [];
      renderStudioLobby();
    } else if (act === "console-cat") {
      consoleCategory = btn.dataset.cat || "ALL";
      renderSystemConsole(consoleCategory, $("consoleSearchInput")?.value || "");
    } else if (act === "switch-scene-type") {
      sceneEditorState.sceneType = btn.dataset.type || "rating";
      sceneEditorState.editingId = null;
      sceneEditorState.name = "";
      sceneEditorState.imageUrl = sceneEditorState.sceneType === "lab" ? "/assets/nen_2.png" : "/assets/nen_23.png";
      sceneEditorState.pickedImageDataUrl = null;
      sceneEditorState.spots = [];
      sceneEditorState.selectedSpotIdx = 0;
      renderStudioScenes();
    } else if (act === "activate-scene-preset") {
      const pid = btn.dataset.id;
      const r = await api(`/assets/scenes/${sceneEditorState.sceneType}/${encodeURIComponent(pid)}/activate`, { method: "POST" });
      showToast(r.message, r.success ? "success" : "error");
      sceneEditorState.spots = [];
      renderStudioScenes();
    } else if (act === "edit-scene-preset") {
      const pid = btn.dataset.id;
      const found = sceneEditorState.presets.find(p => p.id === pid);
      if (found) {
        sceneEditorState.editingId = found.is_custom ? found.id : null;
        sceneEditorState.name = found.is_custom ? found.name : "";
        sceneEditorState.imageUrl = found.image_url + (found.version ? `?v=${found.version}` : "");
        sceneEditorState.pickedImageDataUrl = null;
        sceneEditorState.spots = (found.spots || sceneEditorState.defaultSpots).map(s => ({ ...s }));
        sceneEditorState.selectedSpotIdx = 0;
        await renderStudioScenes();
        $("sceneEditorStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (act === "delete-scene-preset") {
      const pid = btn.dataset.id;
      if (!confirm("Xóa vĩnh viễn giao diện này?")) return;
      const r = await api(`/assets/scenes/${sceneEditorState.sceneType}/${encodeURIComponent(pid)}`, { method: "DELETE" });
      showToast(r.message, r.success ? "success" : "error");
      sceneEditorState.spots = [];
      renderStudioScenes();
    }
  } catch (err) {
    showToast(err.message || "Có lỗi xảy ra", "error");
  }
});

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => loadTab(btn.dataset.tab));
});

$("liveToggleBtn").onclick = () => {
  autoRefreshEnabled = !autoRefreshEnabled;
  updateLiveIndicator();
  markSyncedNow();
  if (autoRefreshEnabled) {
    loadTab(currentTab, { silent: true });
    scheduleAutoRefresh();
  } else {
    stopAutoRefresh();
  }
};
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && autoRefreshEnabled && currentAdmin) {
    loadTab(currentTab, { silent: true });
  }
});
$("modalCloseBtn").onclick = closeModal;
$("modalOverlay").onclick = (e) => { if (e.target === $("modalOverlay")) closeModal(); };
$("logoutBtn").onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  currentAdmin = null;
  showLogin();
};

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginError").classList.add("hidden");
  try {
    const res = await api("/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUsername").value.trim(),
        password: $("loginPassword").value,
      }),
    });
    if (!res.success) {
      $("loginError").textContent = res.message || "Đăng nhập thất bại";
      $("loginError").classList.remove("hidden");
      return;
    }
    localStorage.setItem(TOKEN_KEY, res.token);
    currentAdmin = res.admin;
    showApp();
  } catch (err) {
    $("loginError").textContent = err.message || "Không thể kết nối server";
    $("loginError").classList.remove("hidden");
  }
};

// Phím tắt toàn cục Ctrl+Z (Undo) và Ctrl+Y / Ctrl+Shift+Z (Redo) cho Visual Map Editor
document.addEventListener("keydown", (e) => {
  if (currentTab !== "sprites" || studioSubTab !== "maps") return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod) return;
  const key = (e.key || "").toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    performMapUndo();
  } else if (key === "y" || (key === "z" && e.shiftKey)) {
    e.preventDefault();
    performMapRedo();
  }
});

// ── SUB-TAB 9: ÂM THANH & NHẠC NỀN (AUDIO STUDIO) ────────────────
let audioCategoryFilter = "all"; // all | bgm | shared | board

function fmtFileSize(bytes) {
  const b = Number(bytes || 0);
  if (!b) return "—";
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

async function renderStudioAudio() {
  const res = await api("/assets/audio");
  const tracks = res.tracks || [];
  const filtered = audioCategoryFilter === "all"
    ? tracks
    : tracks.filter(t => t.category === audioCategoryFilter);

  const countBgm = tracks.filter(t => t.category === "bgm").length;
  const countShared = tracks.filter(t => t.category === "shared").length;
  const countBoard = tracks.filter(t => t.category === "board").length;
  const customCount = tracks.filter(t => t.is_custom).length;

  const catLabel = {
    bgm: "NHẠC NỀN (BGM)",
    shared: "GIAO DIỆN",
    board: "TRONG TRẬN",
  };

  setTabHtml(`
    ${studioSubTabsHtml()}
    <div class="panel hud-box" style="margin-top:12px">
      <div class="panel-head" style="flex-wrap:wrap;gap:10px">
        <h3>[ QUẢN LÝ FILE ÂM THANH &amp; NHẠC NỀN GAME ]</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn ${audioCategoryFilter === "all" ? "btn-primary" : "btn-ghost"} btn-sm" data-audio-cat="all">Tất cả (${tracks.length})</button>
          <button class="btn ${audioCategoryFilter === "bgm" ? "btn-primary" : "btn-ghost"} btn-sm" data-audio-cat="bgm">Nhạc nền (${countBgm})</button>
          <button class="btn ${audioCategoryFilter === "shared" ? "btn-primary" : "btn-ghost"} btn-sm" data-audio-cat="shared">Giao diện (${countShared})</button>
          <button class="btn ${audioCategoryFilter === "board" ? "btn-primary" : "btn-ghost"} btn-sm" data-audio-cat="board">Trong trận (${countBoard})</button>
          <span class="badge ${customCount > 0 ? "badge-ok" : "badge-warn"}">ĐÃ TÙY CHỈNH: ${customCount}/${tracks.length}</span>
        </div>
      </div>
      <p class="muted" style="font-size:12px;margin:0 0 14px">
        &gt; Tải file <code>.mp3</code> / <code>.wav</code> / <code>.ogg</code> / <code>.m4a</code> (≤ 12MB) để thay thế trực tiếp nhạc nền hoặc hiệu ứng âm thanh trong game. Có thể chỉnh âm lượng mặc định, tắt riêng từng âm thanh và khôi phục bản gốc bất cứ lúc nào.
      </p>

      <div class="audio-studio-grid">
        ${filtered.map(t => {
          const volPct = Math.round((t.volume ?? 1) * 100);
          const audioSrc = `/${t.active_url}?v=${t.version || 1}`;
          return `
            <div class="audio-track-card ${t.is_custom ? "selected" : ""}" data-track-card="${esc(t.id)}">
              <div class="audio-card-head">
                <div>
                  <div class="audio-card-title">${esc(t.label)}</div>
                  <div class="muted" style="font-size:11px">
                    <code class="cyan-val">${esc(t.id)}</code> • ${catLabel[t.category] || t.category} • ${fmtFileSize(t.file_size)}
                  </div>
                </div>
                <span class="badge ${t.is_custom ? "badge-ok" : "badge-warn"}">
                  ${t.is_custom ? "TÙY CHỈNH" : "MẶC ĐỊNH"}
                </span>
              </div>

              <div class="muted" style="font-size:11.5px;line-height:1.4">${esc(t.desc)}</div>
              ${t.custom_name ? `<div style="font-size:11px"><span class="muted">File đang dùng:</span> <span class="ok-txt">${esc(t.custom_name)}</span></div>` : ""}

              <audio class="audio-preview-player" controls preload="none" src="${esc(audioSrc)}"></audio>

              <div class="audio-controls-row">
                <label class="audio-vol-wrap">
                  <span class="muted" style="font-size:11px">Âm lượng: <b class="cyan-val audio-vol-val">${volPct}%</b></span>
                  <input type="range" class="audio-vol-slider" min="0" max="100" value="${volPct}" />
                </label>
                <label class="audio-enable-wrap">
                  <input type="checkbox" class="audio-enable-chk" ${t.enabled ? "checked" : ""} />
                  <span>Bật</span>
                </label>
                <button type="button" class="btn btn-primary btn-sm audio-save-cfg-btn">LƯU</button>
              </div>

              <div class="audio-upload-row">
                <input type="file" class="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.m4a" />
                <button type="button" class="btn btn-ghost btn-sm audio-upload-btn">TẢI LÊN &amp; ÁP DỤNG</button>
                ${t.is_custom ? `<button type="button" class="btn btn-danger btn-sm audio-reset-btn">KHÔI PHỤC GỐC</button>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);

  // Filter category buttons
  document.querySelectorAll("[data-audio-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      audioCategoryFilter = btn.dataset.audioCat || "all";
      renderStudioAudio();
    });
  });

  // Bind từng thẻ âm thanh
  document.querySelectorAll("[data-track-card]").forEach(card => {
    const trackId = card.dataset.trackCard;
    const slider = card.querySelector(".audio-vol-slider");
    const volVal = card.querySelector(".audio-vol-val");
    const chk = card.querySelector(".audio-enable-chk");
    const player = card.querySelector(".audio-preview-player");
    const fileInput = card.querySelector(".audio-file-input");

    if (player && slider) {
      player.volume = Number(slider.value) / 100;
      slider.addEventListener("input", () => {
        if (volVal) volVal.textContent = `${slider.value}%`;
        player.volume = Number(slider.value) / 100;
      });
    }

    card.querySelector(".audio-save-cfg-btn")?.addEventListener("click", async () => {
      try {
        const r = await api(`/assets/audio/${encodeURIComponent(trackId)}`, {
          method: "POST",
          body: JSON.stringify({
            volume: Number(slider?.value || 100) / 100,
            enabled: Boolean(chk?.checked),
          }),
        });
        showToast(r.message || "Đã lưu cấu hình âm thanh!");
      } catch (err) {
        showToast(err.message || "Lỗi lưu cấu hình âm thanh", "error");
      }
    });

    card.querySelector(".audio-upload-btn")?.addEventListener("click", async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        showToast("Vui lòng chọn file âm thanh (.mp3, .wav, .ogg, .m4a) trước!", "error");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        showToast("File âm thanh vượt quá giới hạn 12MB!", "error");
        return;
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error("Không đọc được file"));
          fr.readAsDataURL(file);
        });
        const r = await api(`/assets/audio/${encodeURIComponent(trackId)}`, {
          method: "POST",
          body: JSON.stringify({
            data_url: dataUrl,
            file_name: file.name,
            volume: Number(slider?.value || 100) / 100,
            enabled: Boolean(chk?.checked),
          }),
        });
        showToast(r.message || "Đã thay file âm thanh thành công!");
        renderStudioAudio();
      } catch (err) {
        showToast(err.message || "Lỗi tải file âm thanh", "error");
      }
    });

    card.querySelector(".audio-reset-btn")?.addEventListener("click", async () => {
      if (!confirm("Khôi phục âm thanh này về bản gốc mặc định?")) return;
      try {
        const r = await api(`/assets/audio/${encodeURIComponent(trackId)}`, { method: "DELETE" });
        showToast(r.message || "Đã khôi phục âm thanh gốc!");
        renderStudioAudio();
      } catch (err) {
        showToast(err.message || "Lỗi khôi phục âm thanh", "error");
      }
    });
  });
}

// ── SUB-TAB 10: HIỆU ỨNG THỜI TIẾT TOÀN GAME + LIVE PREVIEW ─────
let _weatherPreviewBg = "board"; // "board" | "day" | "night"

function buildWeatherPreviewSprites() {
  const crystal = document.createElement("canvas");
  crystal.width = 36; crystal.height = 36;
  const cg = crystal.getContext("2d");
  cg.translate(18, 18);
  cg.strokeStyle = "rgba(255,255,255,0.96)";
  cg.fillStyle = "rgba(255,255,255,0.96)";
  cg.shadowColor = "rgba(186,232,255,0.95)";
  cg.shadowBlur = 5;
  cg.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    cg.save();
    cg.rotate((i * Math.PI) / 3);
    cg.lineWidth = 1.4;
    cg.beginPath(); cg.moveTo(0, 0); cg.lineTo(0, -11); cg.stroke();
    cg.lineWidth = 1;
    cg.beginPath();
    cg.moveTo(0, -5); cg.lineTo(-3, -7.5);
    cg.moveTo(0, -5); cg.lineTo(3, -7.5);
    cg.moveTo(0, -8); cg.lineTo(-2, -10);
    cg.moveTo(0, -8); cg.lineTo(2, -10);
    cg.stroke();
    cg.restore();
  }
  cg.beginPath(); cg.arc(0, 0, 1.8, 0, Math.PI * 2); cg.fill();

  const soft = document.createElement("canvas");
  soft.width = 24; soft.height = 24;
  const sg = soft.getContext("2d");
  const sGrad = sg.createRadialGradient(12, 12, 0, 12, 12, 12);
  sGrad.addColorStop(0, "rgba(255,255,255,0.96)");
  sGrad.addColorStop(0.45, "rgba(232,246,255,0.75)");
  sGrad.addColorStop(1, "rgba(190,228,255,0)");
  sg.fillStyle = sGrad; sg.fillRect(0, 0, 24, 24);

  const makePetal = (light, mid, deep, glow) => {
    const c = document.createElement("canvas");
    c.width = 44; c.height = 44;
    const g = c.getContext("2d");
    g.translate(22, 22);
    g.shadowColor = glow; g.shadowBlur = 6;
    const gr = g.createRadialGradient(-2, -4, 1, 0, 2, 16);
    gr.addColorStop(0, light); gr.addColorStop(0.55, mid); gr.addColorStop(1, deep);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 12);
    g.bezierCurveTo(-11, 5, -12, -9, -3.5, -13);
    g.quadraticCurveTo(0, -9.5, 0, -8);
    g.quadraticCurveTo(0, -9.5, 3.5, -13);
    g.bezierCurveTo(12, -9, 11, 5, 0, 12);
    g.closePath();
    g.fill();
    return c;
  };
  const petals = [
    makePetal("#fff1f5", "#ff9ec2", "#e8548c", "rgba(255,150,190,0.7)"),
    makePetal("#ffe4ee", "#ff77ac", "#d63b78", "rgba(255,120,170,0.7)"),
    makePetal("#fff5f8", "#ffb6d1", "#f06d9f", "rgba(255,175,205,0.65)"),
  ];

  const blossom = document.createElement("canvas");
  blossom.width = 48; blossom.height = 48;
  const bg = blossom.getContext("2d");
  bg.translate(24, 24);
  bg.shadowColor = "rgba(255,130,175,0.75)"; bg.shadowBlur = 6;
  for (let i = 0; i < 5; i++) {
    bg.save();
    bg.rotate((i * Math.PI * 2) / 5);
    const gr = bg.createRadialGradient(0, -3, 1, 0, -9, 10);
    gr.addColorStop(0, "#fff0f5"); gr.addColorStop(0.5, "#ff8fb8"); gr.addColorStop(1, "#e84a86");
    bg.fillStyle = gr;
    bg.beginPath();
    bg.moveTo(0, -1);
    bg.bezierCurveTo(-7, -4, -7, -14, -2, -16);
    bg.quadraticCurveTo(0, -13, 2, -16);
    bg.bezierCurveTo(7, -14, 7, -4, 0, -1);
    bg.closePath();
    bg.fill();
    bg.restore();
  }
  bg.shadowBlur = 0;
  bg.fillStyle = "#fde047";
  bg.beginPath(); bg.arc(0, 0, 2.8, 0, Math.PI * 2); bg.fill();

  return { crystal, soft, petals, blossom };
}

async function renderStudioWeather() {
  stopSpritePreview();
  const [res, lobbyRes, mapRes] = await Promise.all([
    api("/weather"),
    api("/assets/lobby").catch(() => null),
    api("/assets/maps").catch(() => null),
  ]);
  const savedMode = res.mode || "snow";
  const savedDensity = Number(res.density || 46);

  const activeLobby = (lobbyRes?.presets || []).find(p => p.id === lobbyRes?.active_lobby_id) || lobbyRes?.presets?.[0] || null;
  const lobbyVer = activeLobby?.version ? `?v=${activeLobby.version}` : "";
  const activeDayUrl = activeLobby?.day_url ? `${activeLobby.day_url}${lobbyVer}` : "/assets/ui/lobby/background_light.png";
  const activeNightUrl = activeLobby?.night_url ? `${activeLobby.night_url}${lobbyVer}` : "/assets/ui/lobby/background_dark.png";

  const activeMap = (mapRes?.maps || []).find(m => m.id === mapRes?.active_map_id) || mapRes?.maps?.[0] || null;
  const mapVer = activeMap?.version ? `?v=${activeMap.version}` : "";
  const activeMapUrl = activeMap?.image_url ? `${activeMap.image_url}${mapVer}` : "/assets/ui/bg/0-ngocphumedia_0.png";
  const activeMapName = activeMap?.name || "Bàn Cờ";

  let previewMode = savedMode;
  let previewDensity = savedDensity;

  const weatherModes = [
    { id: "none",  label: "Tắt hiệu ứng", desc: "Không hiển thị hạt rơi trên mọi Scene" },
    { id: "snow",  label: "Tuyết Rơi (Giáng Sinh)", desc: "Tinh thể tuyết 6 cánh xoay nhẹ + hạt tuyết bokeh 3 tầng" },
    { id: "peach", label: "Hoa Đào (Mùa Xuân / Tết)", desc: "Cánh hoa đào lật 3D mềm + bông đào 5 cánh nhụy vàng" },
    { id: "both",  label: "Kết Hợp Cả Hai", desc: "Tuyết rơi lung linh hòa quyện cùng cánh hoa đào" },
  ];

  const bgOptions = [
    { id: "board", label: `${activeMapName}`, url: activeMapUrl },
    { id: "day",   label: "Sảnh Ngày (Đang dùng)", url: activeDayUrl },
    { id: "night", label: "Sảnh Đêm (Đang dùng)",  url: activeNightUrl },
  ];

  setTabHtml(`
    ${studioSubTabsHtml()}

    <div class="panel">
      <div class="panel-head" style="flex-wrap:wrap;gap:10px">
        <h3>[ HIỆU ỨNG THỜI TIẾT TOÀN GAME &amp; BẢN XEM TRƯỚC LIVE ]</h3>
        <span class="muted">đồng bộ tự động mọi Scene cho tất cả người chơi (MySQL weather_settings)</span>
      </div>

      <div style="display:grid;grid-template-columns:minmax(280px, 340px) 1fr;gap:18px;align-items:start;">
        <!-- Cột trái: Điều khiển -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:12px;color:var(--muted)">CHỌN CHẾ ĐỘ THỜI TIẾT (XEM TRƯỚC NGAY):</div>
          <div style="display:flex;flex-direction:column;gap:8px;" id="studioWeatherModeList">
            ${weatherModes.map(m => `
              <button type="button" class="btn ${previewMode === m.id ? "btn-primary" : "btn-ghost"}" data-sw-mode="${m.id}" style="text-align:left;padding:10px 12px;display:flex;flex-direction:column;gap:3px;">
                <span style="font-weight:700">${m.label}</span>
                <span style="font-size:11px;opacity:0.78;font-weight:400">${m.desc}</span>
              </button>
            `).join("")}
          </div>

          <div class="hud-box" style="padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;">
              <span class="muted">MẬT ĐỘ HẠT RƠI</span>
              <b id="swDensityVal" class="cyan-val">${previewDensity}</b>
            </div>
            <input id="swDensityRange" type="range" min="20" max="115" value="${previewDensity}" style="width:100%;accent-color:var(--cyan)" />
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-top:4px;">
              <span>Nhẹ (20)</span><span>Tối ưu FPS (46)</span><span>Dày (115)</span>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="swSaveBtn" class="btn btn-primary" style="flex:1">LƯU &amp; ÁP DỤNG TOÀN GAME</button>
          </div>
          <div id="swStatusHint" style="font-size:11.5px;color:var(--green);">
            ✓ Đang đồng bộ với cấu hình trực tiếp trên Server (${esc(savedMode)} • mật độ ${savedDensity})
          </div>
        </div>

        <!-- Cột phải: Bản Xem Trước Trực Tiếp -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:700;color:var(--cyan)">[ LIVE PREVIEW CANVAS — 30 FPS ]</span>
            <div style="display:flex;gap:6px;" id="swBgSwitcher">
              ${bgOptions.map(b => `
                <button type="button" class="btn ${_weatherPreviewBg === b.id ? "btn-primary" : "btn-ghost"} btn-sm" data-sw-bg="${b.id}">
                  ${b.label}
                </button>
              `).join("")}
            </div>
          </div>

          <div id="swPreviewStage" style="position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid #1e3a52;background:#09131f url('${(bgOptions.find(b => b.id === _weatherPreviewBg) || bgOptions[0]).url}') center/cover no-repeat;box-shadow:0 8px 28px rgba(0,0,0,0.45);">
            <canvas id="swPreviewCanvas" style="position:absolute;inset:0;width:100%;height:100%;display:block;"></canvas>
            <div id="swPreviewHud" style="position:absolute;left:10px;bottom:10px;background:rgba(6,12,20,0.72);border:1px solid rgba(56,189,248,0.35);padding:4px 10px;border-radius:6px;font-size:11px;color:#dff8ff;">
              Mode: <b>${esc(previewMode.toUpperCase())}</b> • Mật độ: <b>${previewDensity}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  const canvas = $("swPreviewCanvas");
  const stage = $("swPreviewStage");
  const hud = $("swPreviewHud");
  const statusHint = $("swStatusHint");
  const sprites = buildWeatherPreviewSprites();
  let particles = [];
  let cw = 720, ch = 405;

  const resizeCanvas = () => {
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    cw = Math.max(320, Math.round(rect.width || 720));
    ch = Math.max(180, Math.round(rect.height || 405));
    canvas.width = cw;
    canvas.height = ch;
  };
  resizeCanvas();

  const spawnParticle = (randomY = false) => {
    const isPeach = previewMode === "peach" || (previewMode === "both" && Math.random() < 0.52);
    const kind = isPeach
      ? (Math.random() < 0.24 ? "blossom" : "petal")
      : (Math.random() < 0.32 ? "crystal" : "soft");
    return {
      kind,
      x: Math.random() * cw,
      y: randomY ? Math.random() * ch : -24 - Math.random() * 60,
      size: kind === "blossom" ? 16 + Math.random() * 10 : kind === "petal" ? 13 + Math.random() * 9 : kind === "crystal" ? 12 + Math.random() * 9 : 7 + Math.random() * 8,
      vy: isPeach ? 26 + Math.random() * 28 : 28 + Math.random() * 34,
      vx: 10 + Math.random() * 18,
      swayAmp: isPeach ? 22 + Math.random() * 24 : 10 + Math.random() * 14,
      swaySpd: 0.9 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 1.8,
      flip: Math.random() * Math.PI * 2,
      flipSpd: 1.4 + Math.random() * 1.8,
      alpha: 0.65 + Math.random() * 0.35,
      petalIdx: Math.floor(Math.random() * sprites.petals.length),
    };
  };

  const rebuildParticles = () => {
    particles = [];
    if (previewMode === "none") return;
    const count = Math.max(12, Math.min(115, Math.round(previewDensity * 0.85)));
    for (let i = 0; i < count; i++) particles.push(spawnParticle(true));
  };
  rebuildParticles();

  let lastTs = performance.now();
  const loop = (ts) => {
    if (!document.body.contains(canvas)) {
      _weatherPreviewRaf = null;
      return;
    }
    _weatherPreviewRaf = requestAnimationFrame(loop);
    const dtMs = ts - lastTs;
    if (dtMs < 32) return; // ~30 FPS mượt & nhẹ CPU
    lastTs = ts;
    const dt = Math.min(0.06, dtMs / 1000);

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    if (previewMode === "none") return;

    const t = ts * 0.001;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * p.swaySpd + p.phase) * p.swayAmp) * dt;
      p.rot += p.rotSpd * dt;
      p.flip += p.flipSpd * dt;

      if (p.y > ch + 28 || p.x > cw + 36) {
        particles[i] = spawnParticle(false);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === "petal") {
        ctx.scale(1, 0.38 + 0.62 * Math.abs(Math.cos(p.flip)));
        ctx.drawImage(sprites.petals[p.petalIdx], -p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.kind === "blossom") {
        ctx.drawImage(sprites.blossom, -p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.kind === "crystal") {
        ctx.drawImage(sprites.crystal, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.drawImage(sprites.soft, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  };
  _weatherPreviewRaf = requestAnimationFrame(loop);

  const updateHudAndHint = () => {
    if (hud) hud.innerHTML = `Mode: <b>${esc(previewMode.toUpperCase())}</b> • Mật độ: <b>${previewDensity}</b>`;
    if (statusHint) {
      const dirty = previewMode !== savedMode || previewDensity !== savedDensity;
      statusHint.style.color = dirty ? "#f5c542" : "var(--green)";
      statusHint.textContent = dirty
        ? "● Đang xem trước thay đổi — bấm 'LƯU & ÁP DỤNG TOÀN GAME' để phát tới người chơi."
        : `✓ Đang đồng bộ với cấu hình trực tiếp trên Server (${savedMode} • mật độ ${savedDensity})`;
    }
  };

  document.querySelectorAll("[data-sw-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      previewMode = btn.dataset.swMode;
      document.querySelectorAll("[data-sw-mode]").forEach(b => {
        b.classList.toggle("btn-primary", b.dataset.swMode === previewMode);
        b.classList.toggle("btn-ghost", b.dataset.swMode !== previewMode);
      });
      rebuildParticles();
      updateHudAndHint();
    });
  });

  $("swDensityRange")?.addEventListener("input", (e) => {
    previewDensity = Number(e.target.value);
    if ($("swDensityVal")) $("swDensityVal").textContent = previewDensity;
    rebuildParticles();
    updateHudAndHint();
  });

  document.querySelectorAll("[data-sw-bg]").forEach(btn => {
    btn.addEventListener("click", () => {
      _weatherPreviewBg = btn.dataset.swBg;
      const found = bgOptions.find(b => b.id === _weatherPreviewBg) || bgOptions[0];
      if (stage) stage.style.backgroundImage = `url('${found.url}')`;
      document.querySelectorAll("[data-sw-bg]").forEach(b => {
        b.classList.toggle("btn-primary", b.dataset.swBg === _weatherPreviewBg);
        b.classList.toggle("btn-ghost", b.dataset.swBg !== _weatherPreviewBg);
      });
    });
  });

  $("swSaveBtn")?.addEventListener("click", async () => {
    const btn = $("swSaveBtn");
    btn.disabled = true;
    btn.textContent = "ĐANG LƯU...";
    try {
      const r = await api("/weather", {
        method: "PUT",
        body: JSON.stringify({ mode: previewMode, density: previewDensity }),
      });
      if (r.success) {
        showToast(`Đã áp dụng thời tiết toàn game: ${weatherModes.find(x => x.id === r.mode)?.label || r.mode} (mật độ ${r.density})`);
        renderStudioWeather();
      } else {
        showToast(r.message || "Lỗi lưu hiệu ứng thời tiết", "error");
        btn.disabled = false;
        btn.textContent = "LƯU & ÁP DỤNG TOÀN GAME";
      }
    } catch (err) {
      showToast(err.message || "Lỗi lưu hiệu ứng thời tiết", "error");
      btn.disabled = false;
      btn.textContent = "LƯU & ÁP DỤNG TOÀN GAME";
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  12. PAYMENT, BANK CONFIG, PACKAGES & REVENUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
let paymentSubTab = "history"; // "history" | "config" | "packages"
let _lastPaymentSummary = null;

function fmtVnd(n) {
  return `${Number(n || 0).toLocaleString("vi-VN")} đ`;
}

function buildAdminQrPreviewUrl({ bankCode, bankAccount, accountName, amount = 50000 }) {
  const qs = new URLSearchParams({
    amount: String(amount),
    addInfo: "CTPTEST01",
    accountName: String(accountName || ""),
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode || "MB")}-${encodeURIComponent(bankAccount || "")}-qr_only.png?${qs.toString()}`;
}

async function renderPayments(statusFilter = "all", searchQuery = "") {
  const qs = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") qs.set("status", statusFilter);
  if (searchQuery && searchQuery.trim()) qs.set("search", searchQuery.trim());

  const res = await api(`/payments/summary?${qs.toString()}`);
  _lastPaymentSummary = res;

  const s = res.stats || {};
  const settings = res.settings || {};
  const banks = res.supported_banks || [];
  const orders = res.orders || [];
  const exceptions = res.exceptions || [];
  const dailyChart = res.daily_chart || [];
  const topSpenders = res.top_spenders || [];

  const EX_LABELS = {
    UNDERPAID: "CHUYỂN THIẾU TIỀN",
    EXPIRED_PAID: "CHUYỂN SAU HẾT HẠN QR",
    UNMATCHED_CONTENT: "SAI NỘI DUNG CK",
  };

  const subtabBar = `
    <div class="subtab-bar" style="margin-bottom:14px">
      <button class="btn ${paymentSubTab === "history" ? "btn-primary" : "btn-ghost"} btn-sm" data-pay-sub="history">
        01. Doanh Thu &amp; Lịch Sử (${s.total_orders || 0})
      </button>
      <button class="btn ${paymentSubTab === "config" ? "btn-primary" : "btn-ghost"} btn-sm" data-pay-sub="config">
        02. Tài Khoản Gốc &amp; Webhook payOS
      </button>
      <button class="btn ${paymentSubTab === "packages" ? "btn-primary" : "btn-ghost"} btn-sm" data-pay-sub="packages">
        03. Gói Nạp &amp; Tỷ Giá (${(settings.packages || []).length})
      </button>
      <span style="margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-size:12px">
        <span class="badge ${settings.maintenance_mode ? "badge-danger" : "badge-ok"}">
          ${settings.maintenance_mode ? "CỔNG NẠP: BẢO TRÌ" : "CỔNG NẠP: HOẠT ĐỘNG"}
        </span>
        <span class="badge ${settings.payos_configured ? "badge-ok" : "badge-warn"}">
          ${settings.payos_configured ? "PAYOS: ĐÃ KẾT NỐI" : "VIETQR TRỰC TIẾP"}
        </span>
      </span>
    </div>
  `;

  let bodyHtml = "";

  if (paymentSubTab === "history") {
    // Xây dựng 7 ngày gần nhất cho biểu đồ cột
    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const found = dailyChart.find(r => r.day === iso);
      days7.push({
        day: iso.slice(5),
        revenue_vnd: Number(found?.revenue_vnd || 0),
        orders: Number(found?.orders || 0),
      });
    }
    const maxDayRev = Math.max(1, ...days7.map(d => d.revenue_vnd));

    bodyHtml = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">TỔNG DOANH THU (PAID)</div>
          <div class="kpi-value accent-green">${fmtVnd(s.total_revenue_vnd)}</div>
          <div class="kpi-sub">tháng này: <span class="cyan-val">${fmtVnd(s.month_revenue_vnd)}</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">DOANH THU HÔM NAY</div>
          <div class="kpi-value cyan-val">${fmtVnd(s.today_revenue_vnd)}</div>
          <div class="kpi-sub">tài khoản nhận: <b>${esc(settings.bank_code)} ${esc(settings.bank_account)}</b></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">ĐƠN THÀNH CÔNG / CHỜ</div>
          <div class="kpi-value">${s.paid_count || 0} <span class="muted">/ ${s.pending_count || 0}</span></div>
          <div class="kpi-sub">tỷ lệ hoàn tất: <span class="ok-txt">${s.conversion_rate || 0}%</span> (${s.total_orders || 0} đơn)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">TỔNG ECOIN ĐÃ PHÁT HÀNH</div>
          <div class="kpi-value">${fmtMoney(s.total_ecoin_issued || 0)}</div>
          <div class="kpi-sub">tự động qua payOS &amp; đối soát</div>
        </div>
      </div>

      <div class="pay-split-grid" style="margin-top:14px">
        <div class="panel hud-box">
          <div class="panel-head">
            <h3>[ BIỂU ĐỒ DOANH THU 7 NGÀY GẦN NHẤT ]</h3>
            <span class="muted">đơn vị: VNĐ (chỉ tính đơn PAID)</span>
          </div>
          <div class="pay-chart-bars">
            ${days7.map(d => {
              const pct = d.revenue_vnd > 0 ? Math.max(8, Math.round((d.revenue_vnd / maxDayRev) * 100)) : 2;
              const shortVal = d.revenue_vnd >= 1000000
                ? `${(d.revenue_vnd / 1000000).toFixed(1)}M`
                : d.revenue_vnd >= 1000
                  ? `${Math.round(d.revenue_vnd / 1000)}K`
                  : "0";
              return `
                <div class="pay-chart-col" title="${d.day}: ${fmtVnd(d.revenue_vnd)} (${d.orders} đơn)">
                  <div class="pay-chart-val">${shortVal}</div>
                  <div class="pay-chart-bar" style="height:${pct}%"></div>
                  <div class="pay-chart-day">${d.day}</div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="panel hud-box">
          <div class="panel-head">
            <h3>[ TOP 5 NGƯỜI CHƠI NẠP NHIỀU NHẤT ]</h3>
          </div>
          ${topSpenders.length ? `
            <table class="data-table">
              <thead>
                <tr><th>#</th><th>Người chơi</th><th>Đơn</th><th>Tổng VNĐ</th></tr>
              </thead>
              <tbody>
                ${topSpenders.map((u, idx) => `
                  <tr>
                    <td><span class="cyan-val">#${idx + 1}</span></td>
                    <td><b>${esc(u.display_name || u.username || `User #${u.user_id}`)}</b></td>
                    <td>${u.paid_orders}</td>
                    <td class="accent-green"><b>${fmtVnd(u.total_vnd)}</b></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-state">&gt; chưa có giao dịch thành công nào</div>`}
        </div>
      </div>

      <div class="panel hud-box" style="margin-top:14px;border-color:${exceptions.length ? "var(--amber)" : "var(--border)"}">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <h3>[ NGOẠI LỆ CẦN ĐỐI SOÁT THỦ CÔNG (${exceptions.length}) ]</h3>
          <span class="muted" style="font-size:11.5px">
            &gt; Hệ thống nạp tự động 100% qua Webhook payOS — CHỈ liệt kê &amp; cho phép duyệt các đơn đã có tiền vào ngân hàng nhưng gặp ngoại lệ (chuyển thiếu, quá hạn QR, sai nội dung).
          </span>
        </div>
        ${exceptions.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Người chơi</th>
                  <th>Loại ngoại lệ &amp; Lý do</th>
                  <th>Thực nhận / Yêu cầu</th>
                  <th>Mã GD Ngân hàng</th>
                  <th>Xử lý ngoại lệ</th>
                </tr>
              </thead>
              <tbody>
                ${exceptions.map(ex => {
                  const reasonLabel = EX_LABELS[ex.exception_reason] || ex.exception_reason;
                  const canResolve = Number(ex.user_id) > 0;
                  const estEcoin = ex.exception_reason === "UNDERPAID" && Number(ex.paid_amount_vnd) > 0
                    ? Math.round(Number(ex.paid_amount_vnd) * 7)
                    : Number(ex.ecoin_amount || 0);
                  return `
                    <tr>
                      <td>
                        <span class="cyan-val">#${esc(ex.order_code)}</span>
                        <div class="muted" style="font-size:11px"><code class="ok-txt">${esc(ex.transfer_code || "-")}</code></div>
                      </td>
                      <td>
                        <b>${esc(ex.display_name || ex.username || (ex.user_id ? `UID ${ex.user_id}` : "Chưa xác định"))}</b>
                        ${ex.user_id ? `<div class="muted" style="font-size:11px">@${esc(ex.username || "-")} (ID: ${ex.user_id})</div>` : ""}
                      </td>
                      <td>
                        <span class="badge badge-warn">${esc(reasonLabel)}</span>
                        <div class="muted" style="font-size:11.5px;margin-top:3px">${esc(ex.exception_detail || "Cần kiểm tra sao kê")}</div>
                      </td>
                      <td>
                        <b class="accent-green">${fmtVnd(ex.paid_amount_vnd || 0)}</b>
                        <span class="muted"> / ${fmtVnd(ex.amount_vnd)}</span>
                      </td>
                      <td class="muted" style="font-size:11.5px">${esc(ex.payos_reference || "—")}</td>
                      <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                          ${canResolve ? `<button class="btn btn-primary btn-sm" data-pay-approve="${esc(ex.order_code)}" data-pay-ecoin="${estEcoin}" data-pay-reason="${esc(reasonLabel)}">✓ Cộng +${fmtMoney(estEcoin)}</button>` : `<span class="muted" style="font-size:11px">Chưa khớp UID</span>`}
                          <button class="btn btn-danger btn-sm" data-pay-cancel="${esc(ex.order_code)}">✕ Đóng</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty-state">&gt; không có giao dịch ngoại lệ nào — toàn bộ giao dịch đang vận hành tự động 100%</div>`}
      </div>

      <div class="panel hud-box" style="margin-top:14px">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <h3>[ LỊCH SỬ GIAO DỊCH NẠP TỰ ĐỘNG ]</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="paySearchInput" type="text" placeholder="Mã đơn, mã CTP, username..." value="${esc(searchQuery)}" style="min-width:210px" />
            <select id="payStatusSelect">
              <option value="all" ${statusFilter === "all" ? "selected" : ""}>Tất cả trạng thái</option>
              <option value="PAID" ${statusFilter === "PAID" ? "selected" : ""}>PAID (Tự động thành công)</option>
              <option value="EXCEPTION" ${statusFilter === "EXCEPTION" ? "selected" : ""}>NGOẠI LỆ (Cần đối soát)</option>
              <option value="PENDING" ${statusFilter === "PENDING" ? "selected" : ""}>PENDING (Đang chờ CK)</option>
              <option value="EXPIRED" ${statusFilter === "EXPIRED" ? "selected" : ""}>EXPIRED (Hết hạn QR)</option>
              <option value="CANCELLED" ${statusFilter === "CANCELLED" ? "selected" : ""}>CANCELLED (Đã đóng)</option>
            </select>
            <button id="payFilterBtn" class="btn btn-primary btn-sm">LỌC</button>
            <button id="payExportCsvBtn" class="btn btn-ghost btn-sm">⬇ XUẤT CSV</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Người chơi</th>
                <th>Nội dung CK</th>
                <th>Số tiền</th>
                <th>Ecoin</th>
                <th>Trạng thái</th>
                <th>Tham chiếu</th>
                <th>Thời gian</th>
                <th>Cơ chế xử lý</th>
              </tr>
            </thead>
            <tbody>
              ${orders.length ? orders.map(o => {
                const isEx = Boolean(o.exception_reason && o.status !== "PAID");
                const stBadge = isEx
                  ? `<span class="badge badge-warn">NGOẠI LỆ</span>`
                  : o.status === "PAID"
                    ? `<span class="badge badge-ok">PAID</span>`
                    : o.status === "PENDING"
                      ? `<span class="badge badge-warn">PENDING</span>`
                      : `<span class="badge badge-danger">${esc(o.status)}</span>`;
                const noteCell = isEx
                  ? `<span class="amber-val" style="font-size:11.5px">${esc(EX_LABELS[o.exception_reason] || o.exception_reason)}</span>`
                  : o.status === "PAID"
                    ? (String(o.payos_reference || "").includes("ADMIN")
                        ? `<span class="cyan-val" style="font-size:11.5px">Đã đối soát ngoại lệ</span>`
                        : `<span class="ok-txt" style="font-size:11.5px">Tự động (payOS)</span>`)
                    : o.status === "PENDING"
                      ? `<span class="muted" style="font-size:11.5px">Chờ Webhook...</span>`
                      : `<span class="muted" style="font-size:11.5px">Hết hạn tự động</span>`;
                return `
                  <tr>
                    <td><span class="cyan-val">#${esc(o.order_code)}</span></td>
                    <td>
                      <b>${esc(o.display_name || o.username || (o.user_id ? `UID ${o.user_id}` : "Chưa khớp"))}</b>
                      ${o.user_id ? `<div class="muted" style="font-size:11px">@${esc(o.username || "-")} (ID: ${o.user_id})</div>` : ""}
                    </td>
                    <td><code class="ok-txt">${esc(o.transfer_code || "-")}</code></td>
                    <td><b>${fmtVnd(o.amount_vnd)}</b></td>
                    <td class="cyan-val">+${fmtMoney(o.ecoin_amount)}</td>
                    <td>${stBadge}</td>
                    <td class="muted" style="font-size:11px">${esc(o.payos_reference || "—")}</td>
                    <td class="muted" style="font-size:11px">
                      Tạo: ${fmtDate(o.created_at)}
                      ${o.paid_at ? `<br/>TT: <span class="ok-txt">${fmtDate(o.paid_at)}</span>` : ""}
                    </td>
                    <td>${noteCell}</td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="9" class="empty-state">&gt; không tìm thấy giao dịch nào</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (paymentSubTab === "config") {
    const webhookUrl = `${window.location.origin}/api/payment/payos-webhook`;
    const previewQrUrl = buildAdminQrPreviewUrl({
      bankCode: settings.bank_code,
      bankAccount: settings.bank_account,
      accountName: settings.account_name,
    });

    bodyHtml = `
      <form id="paymentSettingsForm" autocomplete="off">
        <div class="pay-split-grid">
          <div class="panel hud-box">
            <div class="panel-head">
              <h3>[ 01. TÀI KHOẢN NGÂN HÀNG GỐC NHẬN TIỀN (VIETQR) ]</h3>
            </div>
            <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="field">
                <label>NGÂN HÀNG NHẬN TIỀN</label>
                <select id="cfgBankCode" name="cfg_bank_code" autocomplete="off">
                  ${banks.map(b => `<option value="${esc(b.code)}" data-name="${esc(b.name)}" ${b.code === settings.bank_code ? "selected" : ""}>${esc(b.code)} — ${esc(b.name)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>SỐ TÀI KHOẢN GỐC</label>
                <input id="cfgBankAccount" name="cfg_bank_account" type="text" autocomplete="off" value="${esc(settings.bank_account || "")}" required />
              </div>
              <div class="field">
                <label>TÊN CHỦ TÀI KHOẢN (IN HOA KHÔNG DẤU)</label>
                <input id="cfgAccountName" name="cfg_account_name" type="text" autocomplete="off" value="${esc(settings.account_name || "")}" required />
              </div>
              <div class="field">
                <label>THỜI HẠN MÃ QR (PHÚT)</label>
                <input id="cfgQrExpire" name="cfg_qr_expire" type="number" min="3" max="60" value="${Number(settings.qr_expire_minutes || 15)}" />
              </div>
            </div>

            <div style="margin-top:12px;display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border:1px solid var(--border)">
              <input id="cfgMaintenance" name="cfg_maintenance" type="checkbox" ${settings.maintenance_mode ? "checked" : ""} style="width:18px;height:18px;cursor:pointer" />
              <label for="cfgMaintenance" style="margin:0;cursor:pointer">
                <b>Bật chế độ bảo trì cổng nạp tiền</b>
                <span class="muted" style="display:block;font-size:11px">Khi bật, người chơi trong game sẽ tạm không tạo được đơn nạp mới.</span>
              </label>
            </div>

            <div class="panel-head" style="margin-top:18px">
              <h3>[ 02. CẤU HÌNH KẾT NỐI PAYOS WEBHOOK TỰ ĐỘNG ]</h3>
            </div>
            <div class="pay-webhook-box" style="margin-bottom:12px">
              <span class="muted">WEBHOOK URL:</span>
              <code id="payWebhookUrlText" class="cyan-val" style="flex:1">${esc(webhookUrl)}</code>
              <button type="button" id="copyWebhookUrlBtn" class="btn btn-ghost btn-sm">COPY</button>
              <button type="button" id="testWebhookPingBtn" class="btn btn-primary btn-sm">TEST PING HMAC</button>
            </div>
            <div id="testWebhookResult" class="muted" style="font-size:12px;margin-bottom:10px"></div>

            <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:10px">
              <div class="field">
                <label>PAYOS CLIENT ID ${settings.has_client_id ? `<span class="ok-txt">(đã lưu: ${esc(settings.client_id_masked)})</span>` : `<span class="muted">(chưa cấu hình)</span>`}</label>
                <input id="cfgClientId" name="cfg_payos_cid" type="text" class="secret-input" placeholder="Để trống nếu giữ nguyên key cũ..." autocomplete="off" spellcheck="false" />
              </div>
              <div class="field">
                <label>PAYOS API KEY ${settings.has_api_key ? `<span class="ok-txt">(đã lưu: ${esc(settings.api_key_masked)})</span>` : `<span class="muted">(chưa cấu hình)</span>`}</label>
                <input id="cfgApiKey" name="cfg_payos_akey" type="text" class="secret-input" placeholder="Để trống nếu giữ nguyên key cũ..." autocomplete="off" spellcheck="false" />
              </div>
              <div class="field">
                <label>PAYOS CHECKSUM KEY ${settings.has_checksum_key ? `<span class="ok-txt">(đã lưu: ${esc(settings.checksum_key_masked)})</span>` : `<span class="muted">(chưa cấu hình)</span>`}</label>
                <input id="cfgChecksumKey" name="cfg_payos_ckey" type="text" class="secret-input" placeholder="Để trống nếu giữ nguyên key cũ..." autocomplete="off" spellcheck="false" />
              </div>
            </div>

            <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
              <button type="submit" class="btn btn-primary">LƯU CẤU HÌNH THANH TOÁN</button>
              ${settings.payos_configured ? `<button type="button" id="clearPayosKeysBtn" class="btn btn-danger btn-sm">XÓA KEY PAYOS</button>` : ""}
            </div>
          </div>

          <div class="panel hud-box">
            <div class="panel-head">
              <h3>[ XEM TRƯỚC MÃ VIETQR THỰC TẾ ]</h3>
            </div>
            <div class="pay-qr-preview-box">
              <img id="adminQrPreviewImg" class="pay-qr-preview-img" src="${esc(previewQrUrl)}" alt="VietQR Preview" />
              <div style="width:100%;font-size:12px;display:flex;flex-direction:column;gap:5px">
                <div><span class="muted">Ngân hàng:</span> <b id="prevBankLabel" class="cyan-val">${esc(settings.bank_name)}</b></div>
                <div><span class="muted">Số TK:</span> <b id="prevAccLabel">${esc(settings.bank_account)}</b></div>
                <div><span class="muted">Chủ TK:</span> <b id="prevNameLabel">${esc(settings.account_name)}</b></div>
                <div><span class="muted">Mẫu test:</span> <b class="accent-green">50.000 đ</b> • Nội dung: <code class="ok-txt">CTPTEST01</code></div>
              </div>
              <div class="muted" style="font-size:11px;text-align:center">
                &gt; Quét thử bằng app ngân hàng để kiểm tra đúng STK và tên chủ tài khoản trước khi lưu.
              </div>
            </div>
          </div>
        </div>
      </form>
    `;
  } else if (paymentSubTab === "packages") {
    const pkgs = settings.packages || [];
    bodyHtml = `
      <div class="panel hud-box">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <h3>[ CẤU HÌNH BẢNG GÓI NẠP &amp; TỶ GIÁ QUY ĐỔI ]</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" id="addPkgRowBtn" class="btn btn-ghost btn-sm">+ THÊM GÓI</button>
            <button type="button" id="resetPkgBtn" class="btn btn-danger btn-sm">KHÔI PHỤC MẶC ĐỊNH</button>
            <button type="button" id="savePkgBtn" class="btn btn-primary btn-sm">LƯU BẢNG GIÁ</button>
          </div>
        </div>
        <p class="muted" style="font-size:12px;margin:0 0 12px">
          &gt; Thay đổi tại đây sẽ áp dụng ngay lập tức cho bảng Nạp Tiền trong game (không cần khởi động lại server).
        </p>
        <div class="table-wrap">
          <table class="data-table" id="pkgConfigTable">
            <thead>
              <tr>
                <th>Mã gói (ID)</th>
                <th>Nhãn hiển thị</th>
                <th>Số tiền (VNĐ)</th>
                <th>Ecoin nhận</th>
                <th>Tỷ giá (Ecoin/1đ)</th>
                <th>Ghi chú / Bonus</th>
                <th>Xóa</th>
              </tr>
            </thead>
            <tbody id="pkgTableBody">
              ${pkgs.map((p, idx) => {
                const ratio = p.amount_vnd > 0 ? (p.ecoin / p.amount_vnd).toFixed(2) : "0";
                return `
                  <tr data-pkg-row="${idx}">
                    <td><input class="pkg-id" type="text" value="${esc(p.id)}" style="width:110px" /></td>
                    <td><input class="pkg-label" type="text" value="${esc(p.label)}" style="width:85px" /></td>
                    <td><input class="pkg-vnd" type="number" min="1000" step="1000" value="${Number(p.amount_vnd)}" style="width:125px" /></td>
                    <td><input class="pkg-ecoin" type="number" min="1000" step="1000" value="${Number(p.ecoin)}" style="width:135px" /></td>
                    <td class="cyan-val pkg-ratio">${ratio}x</td>
                    <td><input class="pkg-bonus" type="text" value="${esc(p.bonus || "")}" placeholder="VD: +15%" style="width:100px" /></td>
                    <td><button type="button" class="btn btn-danger btn-sm pkg-del-btn">✕</button></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  setTabHtml(subtabBar + bodyHtml);

  // Chuyển sub-tab
  document.querySelectorAll("[data-pay-sub]").forEach(btn => {
    btn.addEventListener("click", () => {
      paymentSubTab = btn.dataset.paySub;
      renderPayments(statusFilter, searchQuery);
    });
  });

  if (paymentSubTab === "history") {
    const doFilter = () => renderPayments($("payStatusSelect")?.value || "all", $("paySearchInput")?.value || "");
    $("payFilterBtn")?.addEventListener("click", doFilter);
    $("payStatusSelect")?.addEventListener("change", doFilter);
    $("paySearchInput")?.addEventListener("keydown", e => { if (e.key === "Enter") doFilter(); });

    // Duyệt thủ công đơn PENDING / EXPIRED
    document.querySelectorAll("[data-pay-approve]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.payApprove;
        const ecoin = Number(btn.dataset.payEcoin || 0).toLocaleString("vi-VN");
        if (!confirm(`Xác nhận đã nhận tiền và cộng +${ecoin} Ecoin cho đơn #${code}?`)) return;
        try {
          const r = await api(`/payments/orders/${code}/approve`, { method: "POST" });
          showToast(r.message || "Đã duyệt đơn thành công!");
          renderPayments(statusFilter, searchQuery);
        } catch (err) {
          showToast(err.message || "Lỗi duyệt đơn", "error");
        }
      });
    });

    // Hủy đơn PENDING
    document.querySelectorAll("[data-pay-cancel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.payCancel;
        if (!confirm(`Hủy đơn nạp #${code}?`)) return;
        try {
          const r = await api(`/payments/orders/${code}/cancel`, { method: "POST" });
          showToast(r.message || "Đã hủy đơn!");
          renderPayments(statusFilter, searchQuery);
        } catch (err) {
          showToast(err.message || "Lỗi hủy đơn", "error");
        }
      });
    });

    // Xuất CSV (UTF-8 BOM mở chuẩn Excel tiếng Việt)
    $("payExportCsvBtn")?.addEventListener("click", () => {
      const rows = [
        ["OrderCode", "TransferCode", "UserID", "Username", "DisplayName", "AmountVND", "Ecoin", "Status", "PayOSRef", "CreatedAt", "PaidAt"],
        ...orders.map(o => [
          o.order_code, o.transfer_code || "", o.user_id, o.username || "", o.display_name || "",
          o.amount_vnd, o.ecoin_amount, o.status, o.payos_reference || "",
          o.created_at || "", o.paid_at || "",
        ]),
      ];
      const csv = "\uFEFF" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lich_su_nap_tien_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Đã xuất báo cáo CSV!");
    });
  } else if (paymentSubTab === "config") {
    const updateQrPreview = () => {
      const sel = $("cfgBankCode");
      const code = sel?.value || "MB";
      const bankName = sel?.selectedOptions?.[0]?.dataset?.name || code;
      const acc = ($("cfgBankAccount")?.value || "").trim();
      const name = ($("cfgAccountName")?.value || "").trim().toUpperCase();
      if ($("prevBankLabel")) $("prevBankLabel").textContent = bankName;
      if ($("prevAccLabel")) $("prevAccLabel").textContent = acc || "—";
      if ($("prevNameLabel")) $("prevNameLabel").textContent = name || "—";
      if ($("adminQrPreviewImg") && acc) {
        $("adminQrPreviewImg").src = buildAdminQrPreviewUrl({ bankCode: code, bankAccount: acc, accountName: name });
      }
    };
    $("cfgBankCode")?.addEventListener("change", updateQrPreview);
    $("cfgBankAccount")?.addEventListener("input", updateQrPreview);
    $("cfgAccountName")?.addEventListener("input", updateQrPreview);

    $("copyWebhookUrlBtn")?.addEventListener("click", async () => {
      const url = $("payWebhookUrlText")?.textContent || "";
      try { await navigator.clipboard.writeText(url); showToast("Đã copy Webhook URL!"); } catch {}
    });

    $("testWebhookPingBtn")?.addEventListener("click", async () => {
      const box = $("testWebhookResult");
      if (box) box.textContent = "> đang gửi ping test ký HMAC-SHA256...";
      try {
        const r = await api("/payments/test-webhook", { method: "POST" });
        if (box) {
          box.innerHTML = r.success
            ? `<span class="ok-txt">✓ Webhook OK! HMAC-SHA256 hợp lệ (${esc(r.signature_preview)}) • ${r.using_live_checksum ? "dùng Checksum Key thật" : "dùng key test mẫu"}</span>`
            : `<span class="err-txt">✕ Test thất bại</span>`;
        }
        showToast(r.success ? "Webhook & chữ ký HMAC-SHA256 hoạt động chuẩn!" : "Test webhook lỗi", r.success ? "success" : "error");
      } catch (err) {
        if (box) box.innerHTML = `<span class="err-txt">✕ ${esc(err.message)}</span>`;
      }
    });

    $("clearPayosKeysBtn")?.addEventListener("click", async () => {
      if (!confirm("Xóa Client ID, API Key, Checksum Key khỏi DB và chuyển về chế độ VietQR trực tiếp?")) return;
      try {
        await api("/payments/settings", { method: "PUT", body: JSON.stringify({ clear_payos_keys: true }) });
        showToast("Đã xóa key payOS!");
        renderPayments(statusFilter, searchQuery);
      } catch (err) {
        showToast(err.message || "Lỗi xóa key", "error");
      }
    });

    $("paymentSettingsForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sel = $("cfgBankCode");
      const payload = {
        bank_code: sel?.value || "MB",
        bank_name: sel?.selectedOptions?.[0]?.dataset?.name || "MB BANK",
        bank_account: $("cfgBankAccount")?.value || "",
        account_name: $("cfgAccountName")?.value || "",
        qr_expire_minutes: Number($("cfgQrExpire")?.value || 15),
        maintenance_mode: Boolean($("cfgMaintenance")?.checked),
        payos_client_id: $("cfgClientId")?.value || "",
        payos_api_key: $("cfgApiKey")?.value || "",
        payos_checksum_key: $("cfgChecksumKey")?.value || "",
      };
      try {
        const r = await api("/payments/settings", { method: "PUT", body: JSON.stringify(payload) });
        if (r.success) {
          showToast("Đã lưu cấu hình tài khoản gốc & payOS!");
          renderPayments(statusFilter, searchQuery);
        }
      } catch (err) {
        showToast(err.message || "Lỗi lưu cấu hình", "error");
      }
    });
  } else if (paymentSubTab === "packages") {
    const bindRowEvents = (tr) => {
      const updateRatio = () => {
        const vnd = Number(tr.querySelector(".pkg-vnd")?.value || 0);
        const eco = Number(tr.querySelector(".pkg-ecoin")?.value || 0);
        const cell = tr.querySelector(".pkg-ratio");
        if (cell) cell.textContent = vnd > 0 ? `${(eco / vnd).toFixed(2)}x` : "0x";
      };
      tr.querySelector(".pkg-vnd")?.addEventListener("input", updateRatio);
      tr.querySelector(".pkg-ecoin")?.addEventListener("input", updateRatio);
      tr.querySelector(".pkg-del-btn")?.addEventListener("click", () => tr.remove());
    };
    document.querySelectorAll("#pkgTableBody tr").forEach(bindRowEvents);

    $("addPkgRowBtn")?.addEventListener("click", () => {
      const tbody = $("pkgTableBody");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="pkg-id" type="text" value="pkg_new_${Date.now().toString().slice(-3)}" style="width:110px" /></td>
        <td><input class="pkg-label" type="text" value="300K" style="width:85px" /></td>
        <td><input class="pkg-vnd" type="number" min="1000" step="1000" value="300000" style="width:125px" /></td>
        <td><input class="pkg-ecoin" type="number" min="1000" step="1000" value="2500000" style="width:135px" /></td>
        <td class="cyan-val pkg-ratio">8.33x</td>
        <td><input class="pkg-bonus" type="text" value="+18%" style="width:100px" /></td>
        <td><button type="button" class="btn btn-danger btn-sm pkg-del-btn">✕</button></td>
      `;
      tbody.appendChild(tr);
      bindRowEvents(tr);
    });

    $("resetPkgBtn")?.addEventListener("click", async () => {
      if (!confirm("Khôi phục bảng gói nạp về mặc định chuẩn (10K → 1M)?")) return;
      try {
        await api("/payments/settings", { method: "PUT", body: JSON.stringify({ reset_packages: true }) });
        showToast("Đã khôi phục bảng giá mặc định!");
        renderPayments(statusFilter, searchQuery);
      } catch (err) {
        showToast(err.message || "Lỗi khôi phục", "error");
      }
    });

    $("savePkgBtn")?.addEventListener("click", async () => {
      const list = [];
      document.querySelectorAll("#pkgTableBody tr").forEach(tr => {
        const id = (tr.querySelector(".pkg-id")?.value || "").trim();
        const label = (tr.querySelector(".pkg-label")?.value || "").trim();
        const amount_vnd = Number(tr.querySelector(".pkg-vnd")?.value || 0);
        const ecoin = Number(tr.querySelector(".pkg-ecoin")?.value || 0);
        const bonus = (tr.querySelector(".pkg-bonus")?.value || "").trim();
        if (amount_vnd >= 1000 && ecoin >= 1000) {
          list.push({ id, label, amount_vnd, ecoin, bonus });
        }
      });
      if (!list.length) {
        showToast("Cần ít nhất 1 gói nạp hợp lệ!", "error");
        return;
      }
      try {
        await api("/payments/settings", { method: "PUT", body: JSON.stringify({ packages: list }) });
        showToast(`Đã lưu ${list.length} gói nạp thành công!`);
        renderPayments(statusFilter, searchQuery);
      } catch (err) {
        showToast(err.message || "Lỗi lưu bảng gói nạp", "error");
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  13. TRUNG TÂM HỖ TRỢ NGƯỜI CHƠI (CSKH — AI / KB / SLA / COPILOT / ANALYTICS)
// ═══════════════════════════════════════════════════════════════
let supportSubTab = "queue"; // "queue" | "kb" | "sla" | "analytics"
let _cachedSupportMacros = [];

function supportSubTabsHtml() {
  const tabs = [
    { key: "queue",     label: "01. Hàng đợi Ticket & Xử lý 1-Click" },
    { key: "kb",        label: "02. Kho Tri Thức AI & Mẫu Phản Hồi (Macros)" },
    { key: "sla",       label: "03. Luật SLA & Tự động Phân loại" },
    { key: "analytics", label: "04. Phân Tích AI & Chất Lượng CSKH" },
  ];
  return `
    <div class="subtab-bar" style="margin-bottom:14px;">
      ${tabs.map(t => `
        <button class="btn ${supportSubTab === t.key ? "btn-primary" : "btn-secondary"} btn-sm" data-sup-sub="${t.key}">
          ${t.label}
        </button>
      `).join("")}
    </div>
  `;
}

function bindSupportSubTabs(statusFilter, categoryFilter, searchQuery) {
  document.querySelectorAll("[data-sup-sub]").forEach(btn => {
    btn.addEventListener("click", () => {
      supportSubTab = btn.dataset.supSub;
      renderSupport(statusFilter, categoryFilter, searchQuery);
    });
  });
}

function fmtSlaBadge(ticket) {
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    return `<span class="badge ok">HOÀN TẤT</span>`;
  }
  const dueMs = new Date(ticket.sla_due_at).getTime();
  if (!Number.isFinite(dueMs)) return `<span class="badge">—</span>`;
  const diffMin = Math.round((dueMs - Date.now()) / 60000);
  if (diffMin < 0) return `<span class="badge danger">QUÁ HẠN ${Math.abs(diffMin)}p</span>`;
  if (diffMin <= 10) return `<span class="badge warn">CÒN ${diffMin}p</span>`;
  return `<span class="badge info">CÒN ${diffMin}p</span>`;
}

async function renderSupport(statusFilter = "all", categoryFilter = "all", searchQuery = "") {
  if (supportSubTab === "kb") return renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery);
  if (supportSubTab === "sla") return renderSupportSlaRules(statusFilter, categoryFilter, searchQuery);

  const qs = new URLSearchParams({ status: statusFilter, category: categoryFilter, search: searchQuery });
  const res = await api(`/support/summary?${qs.toString()}`);
  const s = res.stats || {};
  const tickets = res.tickets || [];
  const analytics = res.analytics || { top_intents: [], csat_distribution: [] };
  _cachedSupportMacros = res.macros || [];

  if (supportSubTab === "analytics") {
    return renderSupportAnalytics(s, analytics, statusFilter, categoryFilter, searchQuery);
  }

  const prioBadge = (p) => {
    if (p === "HIGH") return `<span class="badge danger">HIGH</span>`;
    if (p === "MEDIUM") return `<span class="badge warn">MEDIUM</span>`;
    return `<span class="badge info">LOW</span>`;
  };
  const statusBadge = (st) => {
    if (st === "OPEN") return `<span class="badge warn">OPEN</span>`;
    if (st === "IN_PROGRESS") return `<span class="badge info">IN_PROGRESS</span>`;
    if (st === "RESOLVED") return `<span class="badge ok">RESOLVED</span>`;
    return `<span class="badge">CLOSED</span>`;
  };

  setTabHtml(`
    ${supportSubTabsHtml()}

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">AI DEFLECTION RATE (TIER 0)</div>
        <div class="kpi-value accent-green">${s.deflection_rate || 0}%</div>
        <div class="kpi-sub">AI tự giải quyết: <span class="cyan-val">${s.ai_resolved || 0}/${s.total_ai_queries || 0}</span> lượt hỏi</div>
        <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.min(100, s.deflection_rate || 0)}%"></div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">TỶ LỆ ĐẠT CAM KẾT SLA</div>
        <div class="kpi-value cyan-val">${s.sla_compliance ?? 100}%</div>
        <div class="kpi-sub">đang mở: <b>${s.active_tickets || 0}</b> • quá hạn: <b class="${s.sla_breached > 0 ? "danger-txt" : ""}">${s.sla_breached || 0}</b></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">ĐIỂM HÀI LÒNG CSAT</div>
        <div class="kpi-value" style="color:#f5c542">${s.avg_csat ? `${s.avg_csat} ★` : "—"}</div>
        <div class="kpi-sub">trên ${s.csat_count || 0} lượt đánh giá (thang 5.0)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">MTTR (PHẢN HỒI ĐẦU TB)</div>
        <div class="kpi-value">${s.avg_mttr_min || 0} <span style="font-size:15px">phút</span></div>
        <div class="kpi-sub">tổng ${s.total_tickets || 0} phiếu • đã xong ${s.resolved_tickets || 0}</div>
      </div>
    </div>

    <div class="hud-box panel-pad" style="margin-top:14px;">
      <div class="toolbar">
        <select id="supStatusSelect" class="input-sm">
          <option value="all" ${statusFilter === "all" ? "selected" : ""}>Tất cả trạng thái</option>
          <option value="OPEN" ${statusFilter === "OPEN" ? "selected" : ""}>OPEN (Mới)</option>
          <option value="IN_PROGRESS" ${statusFilter === "IN_PROGRESS" ? "selected" : ""}>IN_PROGRESS (Đang xử lý)</option>
          <option value="RESOLVED" ${statusFilter === "RESOLVED" ? "selected" : ""}>RESOLVED (Đã giải quyết)</option>
          <option value="CLOSED" ${statusFilter === "CLOSED" ? "selected" : ""}>CLOSED (Đã đóng)</option>
        </select>
        <select id="supCatSelect" class="input-sm">
          <option value="all" ${categoryFilter === "all" ? "selected" : ""}>Tất cả phân loại</option>
          <option value="PAYMENT" ${categoryFilter === "PAYMENT" ? "selected" : ""}>PAYMENT (Nạp tiền)</option>
          <option value="ACCOUNT" ${categoryFilter === "ACCOUNT" ? "selected" : ""}>ACCOUNT (Tài khoản)</option>
          <option value="BUG" ${categoryFilter === "BUG" ? "selected" : ""}>BUG (Lỗi kỹ thuật)</option>
          <option value="REPORT" ${categoryFilter === "REPORT" ? "selected" : ""}>REPORT (Tố cáo)</option>
          <option value="OTHER" ${categoryFilter === "OTHER" ? "selected" : ""}>OTHER (Khác)</option>
        </select>
        <input id="supSearchInput" class="input-sm" style="min-width:220px" placeholder="Tìm mã SUP-..., tiêu đề, người chơi..." value="${esc(searchQuery)}" />
        <button id="supFilterBtn" class="btn btn-primary btn-sm">LỌC</button>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>MÃ PHIẾU</th>
              <th>NGƯỜI CHƠI</th>
              <th>PHÂN LOẠI / TIÊU ĐỀ</th>
              <th>ƯU TIÊN</th>
              <th>SLA</th>
              <th>TRẠNG THÁI</th>
              <th>CSAT</th>
              <th>TẠO LÚC</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.length ? tickets.map(t => `
              <tr>
                <td><b class="cyan-val">${esc(t.ticket_code)}</b><div class="muted" style="font-size:11px">${t.msg_count || 0} tin nhắn</div></td>
                <td><b>${esc(t.user_name || t.username || ("UID #" + t.user_id))}</b><div class="muted" style="font-size:11px">@${esc(t.username || "—")}</div></td>
                <td style="max-width:260px">
                  <span class="badge">${esc(t.category)}</span>
                  <div style="margin-top:3px;font-weight:600">${esc(t.subject)}</div>
                </td>
                <td>${prioBadge(t.priority)}</td>
                <td>${fmtSlaBadge(t)}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${t.csat_rating ? `<span style="color:#f5c542">${"★".repeat(t.csat_rating)}</span>` : `<span class="muted">—</span>`}</td>
                <td style="font-size:12px">${fmtDate(t.created_at)}</td>
                <td>
                  <button class="btn btn-primary btn-sm sup-open-btn" data-id="${t.id}">XỬ LÝ</button>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="9" class="empty-state">&gt; chưa có phiếu hỗ trợ nào phù hợp bộ lọc.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `);

  bindSupportSubTabs(statusFilter, categoryFilter, searchQuery);
  const reload = () => renderSupport(
    $("supStatusSelect")?.value || "all",
    $("supCatSelect")?.value || "all",
    $("supSearchInput")?.value || ""
  );
  $("supFilterBtn")?.addEventListener("click", reload);
  $("supStatusSelect")?.addEventListener("change", reload);
  $("supCatSelect")?.addEventListener("change", reload);
  $("supSearchInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") reload(); });
  document.querySelectorAll(".sup-open-btn").forEach(btn => {
    btn.addEventListener("click", () => openSupportTicketModal(Number(btn.dataset.id)));
  });
}

// ── SUB-TAB 02: KHO TRI THỨC AI (KNOWLEDGE BASE) & MẪU PHẢN HỒI NHANH (MACROS) ──
async function renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery) {
  const [kbRes, macRes] = await Promise.all([api("/support/kb"), api("/support/macros")]);
  const articles = kbRes.articles || [];
  const macros = macRes.macros || [];
  _cachedSupportMacros = macros;

  setTabHtml(`
    ${supportSubTabsHtml()}

    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-head" style="flex-wrap:wrap;gap:8px;">
        <h3>[ KHO TRI THỨC AI TIER 0 (ADMIN DẠY TRỢ LÝ AI KHÔNG CẦN SỬA CODE) ]</h3>
        <button id="supAddKbBtn" class="btn btn-primary btn-sm">+ DẠY TRI THỨC MỚI CHO AI</button>
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:10px;">
        Khi người chơi hỏi trong game, Trợ lý AI tự động đối khớp từ khóa tại đây và trả lời tức thì (ghi nhận lượt dùng <code>hit_count</code> để đo hiệu quả).
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TIÊU ĐỀ / DANH MỤC</th>
              <th>TỪ KHÓA KÍCH HOẠT</th>
              <th>CÂU TRẢ LỜI CỦA AI</th>
              <th>LƯỢT DÙNG</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${articles.map(a => `
              <tr>
                <td><b>${esc(a.title)}</b><div><span class="badge">${esc(a.category)}</span></div></td>
                <td style="max-width:190px;font-size:12px;color:var(--cyan)">${esc(a.keywords)}</td>
                <td style="max-width:300px;font-size:12px">${esc(a.answer.slice(0, 140))}${a.answer.length > 140 ? "…" : ""}</td>
                <td><b class="accent-green">${a.hit_count || 0}</b></td>
                <td>${a.is_active ? `<span class="badge ok">BẬT</span>` : `<span class="badge">TẮT</span>`}</td>
                <td class="actions-cell">
                  <button class="btn btn-ghost btn-sm kb-edit-btn" data-id="${a.id}">SỬA</button>
                  <button class="btn btn-danger btn-sm kb-del-btn" data-id="${a.id}">XÓA</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head" style="flex-wrap:wrap;gap:8px;">
        <h3>[ MẪU PHẢN HỒI NHANH (MACROS) CHO NHÂN VIÊN CSKH ]</h3>
        <button id="supAddMacroBtn" class="btn btn-primary btn-sm">+ THÊM MẪU PHẢN HỒI</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TÊN MẪU</th>
              <th>PHÂN LOẠI</th>
              <th>NỘI DUNG CHÈN 1-CLICK</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${macros.map(m => `
              <tr>
                <td><b>${esc(m.title)}</b></td>
                <td><span class="badge">${esc(m.category)}</span></td>
                <td style="font-size:12px">${esc(m.content)}</td>
                <td class="actions-cell">
                  <button class="btn btn-ghost btn-sm mac-edit-btn" data-id="${m.id}">SỬA</button>
                  <button class="btn btn-danger btn-sm mac-del-btn" data-id="${m.id}">XÓA</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  bindSupportSubTabs(statusFilter, categoryFilter, searchQuery);

  const openKbForm = (art = null) => {
    openModal(art ? "SỬA TRI THỨC AI" : "DẠY TRI THỨC MỚI CHO TRỢ LÝ AI", `
      <form id="kbForm">
        <div class="form-grid-2">
          <div class="field"><label>TIÊU ĐỀ BÀI TRI THỨC</label><input id="kbTitle" value="${esc(art?.title || "")}" required /></div>
          <div class="field"><label>DANH MỤC</label>
            <select id="kbCat">
              ${["GENERAL", "PAYMENT", "GAMEPLAY", "ACCOUNT", "TECH"].map(c => `<option value="${c}" ${art?.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field"><label>TỪ KHÓA KÍCH HOẠT (cách nhau bằng dấu phẩy, không cần dấu)</label>
          <input id="kbKeywords" value="${esc(art?.keywords || "")}" placeholder="VD: tinh cau, cap 2, lv2, xay nha" required />
        </div>
        <div class="field"><label>NỘI DUNG AI SẼ TRẢ LỜI NGƯỜI CHƠI</label>
          <textarea id="kbAnswer" rows="4" required>${esc(art?.answer || "")}</textarea>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:12px;font-size:12.5px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input id="kbActive" type="checkbox" style="width:auto" ${art ? (art.is_active ? "checked" : "") : "checked"} /> Kích hoạt bài tri thức này</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input id="kbEsc" type="checkbox" style="width:auto" ${art?.escalate_allowed ? "checked" : ""} /> Hiện thêm nút chuyển phiếu Admin</label>
        </div>
        <button type="submit" class="btn btn-primary btn-block">LƯU VÀO KHO TRI THỨC AI</button>
      </form>
    `);
    $("kbForm").onsubmit = async (e) => {
      e.preventDefault();
      const r = await api("/support/kb", {
        method: "POST",
        body: JSON.stringify({
          id: art?.id || null,
          title: $("kbTitle").value,
          category: $("kbCat").value,
          keywords: $("kbKeywords").value,
          answer: $("kbAnswer").value,
          is_active: $("kbActive").checked ? 1 : 0,
          escalate_allowed: $("kbEsc").checked ? 1 : 0,
        }),
      });
      if (r.success) {
        showToast("Đã cập nhật Kho Tri Thức AI! Trợ lý trong game đã áp dụng ngay.");
        closeModal();
        renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery);
      } else showToast(r.message || "Lỗi lưu", "error");
    };
  };

  const openMacroForm = (mac = null) => {
    openModal(mac ? "SỬA MẪU PHẢN HỒI NHANH" : "THÊM MẪU PHẢN HỒI NHANH (MACRO)", `
      <form id="macForm">
        <div class="form-grid-2">
          <div class="field"><label>TÊN MẪU</label><input id="macTitle" value="${esc(mac?.title || "")}" required /></div>
          <div class="field"><label>PHÂN LOẠI</label>
            <select id="macCat">
              ${["PAYMENT", "ACCOUNT", "BUG", "REPORT", "GENERAL"].map(c => `<option value="${c}" ${mac?.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field"><label>NỘI DUNG MẪU</label><textarea id="macContent" rows="4" required>${esc(mac?.content || "")}</textarea></div>
        <button type="submit" class="btn btn-primary btn-block">LƯU MẪU PHẢN HỒI</button>
      </form>
    `);
    $("macForm").onsubmit = async (e) => {
      e.preventDefault();
      const r = await api("/support/macros", {
        method: "POST",
        body: JSON.stringify({ id: mac?.id || null, title: $("macTitle").value, category: $("macCat").value, content: $("macContent").value }),
      });
      if (r.success) {
        showToast("Đã lưu mẫu phản hồi nhanh!");
        closeModal();
        renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery);
      } else showToast(r.message || "Lỗi lưu", "error");
    };
  };

  $("supAddKbBtn")?.addEventListener("click", () => openKbForm(null));
  document.querySelectorAll(".kb-edit-btn").forEach(b => b.addEventListener("click", () => openKbForm(articles.find(x => x.id === Number(b.dataset.id)))));
  document.querySelectorAll(".kb-del-btn").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Xóa bài tri thức AI này?")) return;
    await api(`/support/kb/${b.dataset.id}`, { method: "DELETE" });
    showToast("Đã xóa bài tri thức AI!");
    renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery);
  }));

  $("supAddMacroBtn")?.addEventListener("click", () => openMacroForm(null));
  document.querySelectorAll(".mac-edit-btn").forEach(b => b.addEventListener("click", () => openMacroForm(macros.find(x => x.id === Number(b.dataset.id)))));
  document.querySelectorAll(".mac-del-btn").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Xóa mẫu phản hồi nhanh này?")) return;
    await api(`/support/macros/${b.dataset.id}`, { method: "DELETE" });
    showToast("Đã xóa mẫu phản hồi!");
    renderSupportKnowledgeBase(statusFilter, categoryFilter, searchQuery);
  }));
}

// ── SUB-TAB 03: CẤU HÌNH LUẬT SLA & TỰ ĐỘNG PHÂN LOẠI (AUTO-TRIAGE) ──
async function renderSupportSlaRules(statusFilter, categoryFilter, searchQuery) {
  const res = await api("/support/sla-rules");
  const rules = res.rules || [];

  setTabHtml(`
    ${supportSubTabsHtml()}

    <div class="panel">
      <div class="panel-head" style="flex-wrap:wrap;gap:8px;">
        <h3>[ CẤU HÌNH LUẬT SLA &amp; TỰ ĐỘNG ĐỊNH TUYẾN ƯU TIÊN (AUTO-TRIAGE) ]</h3>
        <button id="saveSlaRulesBtn" class="btn btn-primary btn-sm">LƯU CẤU HÌNH SLA</button>
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:12px;">
        Khi người chơi tạo phiếu mới, hệ thống tự động gán Mức Ưu Tiên, đếm ngược thời hạn SLA (phút) và gửi Tin nhắn xác nhận tự động theo bảng dưới đây.
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>MÃ LOẠI</th>
              <th>TÊN HIỂN THỊ</th>
              <th>MỨC ƯU TIÊN</th>
              <th>CAM KẾT SLA (PHÚT)</th>
              <th>TIN NHẮN XÁC NHẬN TỰ ĐỘNG</th>
            </tr>
          </thead>
          <tbody id="slaRulesBody">
            ${rules.map(r => `
              <tr data-cat="${esc(r.category)}">
                <td><b class="cyan-val">${esc(r.category)}</b></td>
                <td><input class="input-sm sla-label" value="${esc(r.label)}" style="width:170px" /></td>
                <td>
                  <select class="input-sm sla-prio">
                    <option value="HIGH" ${r.priority === "HIGH" ? "selected" : ""}>HIGH (Khẩn cấp)</option>
                    <option value="MEDIUM" ${r.priority === "MEDIUM" ? "selected" : ""}>MEDIUM (Trung bình)</option>
                    <option value="LOW" ${r.priority === "LOW" ? "selected" : ""}>LOW (Thấp)</option>
                  </select>
                </td>
                <td><input class="input-sm sla-min" type="number" min="5" max="1440" value="${Number(r.sla_minutes || 60)}" style="width:90px" /></td>
                <td><input class="input-sm sla-auto" value="${esc(r.auto_reply || "")}" style="width:100%;min-width:240px" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  bindSupportSubTabs(statusFilter, categoryFilter, searchQuery);
  $("saveSlaRulesBtn")?.addEventListener("click", async () => {
    const payload = [];
    document.querySelectorAll("#slaRulesBody tr").forEach(tr => {
      payload.push({
        category: tr.dataset.cat,
        label: tr.querySelector(".sla-label").value,
        priority: tr.querySelector(".sla-prio").value,
        sla_minutes: Number(tr.querySelector(".sla-min").value || 60),
        auto_reply: tr.querySelector(".sla-auto").value,
      });
    });
    const r = await api("/support/sla-rules", { method: "PUT", body: JSON.stringify({ rules: payload }) });
    if (r.success) showToast("Đã lưu luật SLA & Auto-Triage! Áp dụng ngay cho các phiếu mới.");
    else showToast(r.message || "Lỗi lưu SLA", "error");
  });
}

// ── SUB-TAB 04: PHÂN TÍCH AI & CHẤT LƯỢNG CSKH (ANALYTICS) ───────
function renderSupportAnalytics(s, analytics, statusFilter, categoryFilter, searchQuery) {
  const intents = analytics.top_intents || [];
  const maxIntent = Math.max(1, ...intents.map(i => Number(i.cnt || 0)));
  const csatMap = new Map((analytics.csat_distribution || []).map(c => [Number(c.star), Number(c.cnt)]));
  const totalCsat = Math.max(1, Number(s.csat_count || 0));

  setTabHtml(`
    ${supportSubTabsHtml()}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
      <div class="panel">
        <div class="panel-head">
          <h3>[ TOP CHỦ ĐỀ NGƯỜI CHƠI HỎI TRỢ LÝ AI ]</h3>
          <span class="muted">từ support_ai_logs</span>
        </div>
        ${intents.length ? intents.map(it => {
          const pct = Math.round((Number(it.cnt) / maxIntent) * 100);
          const aiRate = Number(it.cnt) > 0 ? Math.round((Number(it.resolved_cnt) / Number(it.cnt)) * 100) : 0;
          return `
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                <b class="cyan-val">${esc(it.intent)}</b>
                <span><b>${it.cnt}</b> lượt • AI tự xử lý: <b class="accent-green">${aiRate}%</b></span>
              </div>
              <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join("") : `<div class="empty-state">&gt; chưa có dữ liệu câu hỏi AI.</div>`}
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>[ PHÂN BỔ ĐÁNH GIÁ HÀI LÒNG CSAT (1–5 ★) ]</h3>
          <span class="cyan-val">TB: ${s.avg_csat ? `${s.avg_csat} ★` : "—"}</span>
        </div>
        ${[5, 4, 3, 2, 1].map(star => {
          const cnt = csatMap.get(star) || 0;
          const pct = s.csat_count ? Math.round((cnt / totalCsat) * 100) : 0;
          return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:12.5px;">
              <span style="width:58px;color:#f5c542;font-weight:700">${star} ★</span>
              <div class="kpi-bar-track" style="flex:1;margin:0"><div class="kpi-bar-fill" style="width:${pct}%;background:${star >= 4 ? "var(--green)" : star === 3 ? "#f5c542" : "var(--red)"}"></div></div>
              <span style="width:74px;text-align:right">${cnt} (${pct}%)</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `);

  bindSupportSubTabs(statusFilter, categoryFilter, searchQuery);
}

// ── MODAL XỬ LÝ TICKET: TELEMETRY + AI COPILOT + 1-CLICK ACTIONS + MACROS ──
async function openSupportTicketModal(ticketId) {
  openModal("ĐANG TẢI PHIẾU HỖ TRỢ...", `<div class="empty-state">&gt; đang đọc telemetry &amp; lịch sử hội thoại...</div>`);
  const res = await api(`/support/tickets/${ticketId}`);
  if (!res?.success || !res.ticket) {
    openModal("LỖI", `<div class="error-box">${esc(res?.message || "Không tìm thấy phiếu!")}</div>`);
    return;
  }
  const t = res.ticket;
  const msgs = res.messages || [];
  const tel = t.telemetry || {};

  const telHtml = `
    <div style="background:#081018;border:1px solid #1e3a52;border-radius:6px;padding:10px 12px;margin-bottom:10px;font-size:12px;">
      <div style="color:#38bdf8;font-weight:700;margin-bottom:6px;">[ AUTO-TELEMETRY SNAPSHOT ]</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 14px;">
        <div>Người chơi: <b>${esc(t.user_name || t.username)}</b> (ID #${t.user_id})</div>
        <div>Ecoin hiện tại: <b class="accent-green">${fmtMoney(t.user_ecoin ?? tel.server_ecoin)}</b></div>
        <div>Scene / Màn hình: <span class="cyan-val">${esc(tel.scene || "—")}</span> (${esc(tel.resolution || "—")})</div>
        <div>Ping / Socket: <span class="cyan-val">${tel.ping_ms ?? "—"} ms</span> • ${tel.socket_connected ? "OK" : "OFF"}</div>
        <div style="grid-column:1 / -1;">Đơn nạp gần nhất: ${tel.latest_order ? `<b>#${esc(tel.latest_order.order_code)}</b> (${esc(tel.latest_order.transfer_code)}) — <span class="cyan-val">${esc(tel.latest_order.status)}</span>${tel.latest_order.exception_reason ? ` <span class="badge danger">${esc(tel.latest_order.exception_reason)}</span>` : ""}` : `<span class="muted">Không có</span>`}</div>
      </div>
    </div>
  `;

  const actionBarHtml = `
    <div style="background:#0c1926;border:1px solid #224461;border-radius:6px;padding:8px 10px;margin-bottom:10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;">
      <span style="color:#f5c542;font-weight:700;">XỬ LÝ 1-CLICK:</span>
      <input id="supCompAmount" class="input-sm" type="number" min="1000" step="1000" placeholder="Số Ecoin bù..." style="width:125px" />
      <button type="button" id="supCompBtn" class="btn btn-primary btn-sm">CỘNG BÙ ECOIN + GỬI BIÊN LAI</button>
      <button type="button" id="supUnmuteBtn" class="btn btn-ghost btn-sm">GỠ CẤM CHAT</button>
      <button type="button" id="supCopilotBtn" class="btn btn-secondary btn-sm" style="margin-left:auto;">AI COPILOT SOẠN TRẢ LỜI</button>
    </div>
  `;

  const msgsHtml = msgs.map(m => {
    const color = m.sender_role === "ADMIN" ? "#22c55e" : m.sender_role === "USER" ? "#38bdf8" : "#f5c542";
    const bg = m.sender_role === "ADMIN" ? "rgba(34,197,94,0.08)" : m.sender_role === "USER" ? "rgba(56,189,248,0.08)" : "rgba(245,197,66,0.08)";
    return `
      <div style="border-left:3px solid ${color};background:${bg};padding:7px 10px;border-radius:4px;margin-bottom:7px;">
        <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:2px;">
          [${esc(m.sender_role)}] ${esc(m.sender_name || "")} • ${fmtDate(m.created_at)}
        </div>
        <div style="white-space:pre-wrap;font-size:12.5px;line-height:1.45;">${esc(m.message)}</div>
      </div>
    `;
  }).join("");

  openModal(`PHIẾU ${t.ticket_code} • ${t.priority} • ${t.status}`, `
    <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-weight:700;font-size:14px;">${esc(t.subject)}</div>
        <div class="muted" style="font-size:11.5px;">Phân loại: ${esc(t.category)} • SLA: ${t.sla_minutes}p • ${t.csat_rating ? `CSAT: ${"★".repeat(t.csat_rating)}` : "Chưa đánh giá"}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm sup-st-btn" data-st="IN_PROGRESS">ĐANG XỬ LÝ</button>
        <button class="btn btn-primary btn-sm sup-st-btn" data-st="RESOLVED">✓ ĐÃ GIẢI QUYẾT (MỜI CSAT)</button>
        <button class="btn btn-danger btn-sm sup-st-btn" data-st="CLOSED">ĐÓNG PHIẾU</button>
      </div>
    </div>

    ${telHtml}
    ${actionBarHtml}

    <div id="adminSupMsgList" style="max-height:210px;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
      ${msgsHtml}
    </div>

    ${_cachedSupportMacros.length ? `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <select id="adminSupMacroSel" class="input-sm" style="flex:1;font-size:12px;">
          <option value="">-- Chèn nhanh Mẫu Phản Hồi (Macro) --</option>
          ${_cachedSupportMacros.map(m => `<option value="${esc(m.content)}">[${esc(m.category)}] ${esc(m.title)}</option>`).join("")}
        </select>
      </div>
    ` : ""}

    <form id="adminSupReplyForm" style="display:flex;gap:8px;">
      <textarea id="adminSupReplyInput" class="input-sm" rows="2" style="flex:1;resize:vertical;" placeholder="Nhập câu trả lời hoặc bấm 'AI Copilot Soạn Trả Lời'..." required></textarea>
      <button type="submit" class="btn btn-primary btn-sm">GỬI PHẢN HỒI</button>
    </form>
  `);

  const list = $("adminSupMsgList");
  if (list) list.scrollTop = list.scrollHeight;

  $("adminSupMacroSel")?.addEventListener("change", (e) => {
    if (e.target.value && $("adminSupReplyInput")) {
      $("adminSupReplyInput").value = e.target.value;
      e.target.value = "";
    }
  });

  $("supCopilotBtn")?.addEventListener("click", async () => {
    const btn = $("supCopilotBtn");
    btn.disabled = true;
    btn.textContent = "AI đang soạn...";
    const r = await api(`/support/tickets/${ticketId}/copilot-draft`, { method: "POST" });
    if (r?.success && r.draft && $("adminSupReplyInput")) {
      $("adminSupReplyInput").value = r.draft;
      showToast("AI Copilot đã soạn xong gợi ý dựa trên dữ liệu thật của người chơi!");
    } else {
      showToast(r?.message || "Lỗi AI Copilot", "error");
    }
    btn.disabled = false;
    btn.textContent = "AI COPILOT SOẠN TRẢ LỜI";
  });

  $("supCompBtn")?.addEventListener("click", async () => {
    const amount = Number($("supCompAmount")?.value || 0);
    if (!amount || amount <= 0) return showToast("Nhập số Ecoin cần cộng bù!", "error");
    if (!confirm(`Xác nhận cộng bù +${amount.toLocaleString("vi-VN")} Ecoin cho ${t.user_name || t.username} và gửi biên lai vào phiếu?`)) return;
    const r = await api(`/support/tickets/${ticketId}/action`, {
      method: "POST",
      body: JSON.stringify({ action: "compensate_ecoin", amount, reason: `Đối soát phiếu ${t.ticket_code}` }),
    });
    if (r?.success) {
      showToast(r.message);
      openSupportTicketModal(ticketId);
      loadTab("support", { silent: true });
    } else showToast(r?.message || "Lỗi cộng bù Ecoin", "error");
  });

  $("supUnmuteBtn")?.addEventListener("click", async () => {
    if (!confirm(`Gỡ trạng thái cấm chat cho ${t.user_name || t.username}?`)) return;
    const r = await api(`/support/tickets/${ticketId}/action`, {
      method: "POST",
      body: JSON.stringify({ action: "unmute_user" }),
    });
    if (r?.success) {
      showToast(r.message);
      openSupportTicketModal(ticketId);
    } else showToast(r?.message || "Lỗi gỡ cấm chat", "error");
  });

  document.querySelectorAll(".sup-st-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nextStatus = btn.dataset.st;
      const r = await api(`/support/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (r?.success) {
        showToast(`Đã chuyển phiếu ${t.ticket_code} sang ${nextStatus}`);
        openSupportTicketModal(ticketId);
        loadTab("support", { silent: true });
      } else showToast(r?.message || "Lỗi cập nhật trạng thái", "error");
    });
  });

  $("adminSupReplyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = $("adminSupReplyInput");
    const message = (inp?.value || "").trim();
    if (!message) return;
    const r = await api(`/support/tickets/${ticketId}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    if (r?.success) {
      showToast(`Đã gửi phản hồi tới ${t.user_name || t.username}!`);
      openSupportTicketModal(ticketId);
      loadTab("support", { silent: true });
    } else showToast(r?.message || "Không thể gửi phản hồi", "error");
  });
}

// Khởi động đồng hồ HUD & khôi phục phiên đăng nhập
startHudClock();
(async function init() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showLogin();
  try {
    const res = await api("/me");
    if (res.success && res.admin) {
      currentAdmin = res.admin;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
})();
