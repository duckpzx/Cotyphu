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
  sprites: "[ ASSET & SPRITE STUDIO — NPC / SKIN / TAROT / PHÔNG NỀN ]",
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
  const res = await api("/overview");
  const s = res.stats || {};
  const logs = res.recent_logs || [];
  const onlinePct = s.total_users > 0 ? Math.min(100, Math.round((s.online_users / s.total_users) * 100)) : 0;

  setTabHtml(`
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">TỔNG NGƯỜI CHƠI</div>
        <div class="kpi-value">${fmtMoney(s.total_users)}</div>
        <div class="kpi-sub">admin: <span class="cyan-val">${s.total_admins || 0}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">ĐANG ONLINE</div>
        <div class="kpi-value accent-green">${s.online_users || 0}</div>
        <div class="kpi-sub">socket kết nối (${onlinePct}%)</div>
        <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${onlinePct}%"></div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">TRẬN ĐANG ĐẤU</div>
        <div class="kpi-value cyan-val">${s.active_matches || 0}</div>
        <div class="kpi-sub">bot ai tiếp quản: <span class="amber-val">${s.active_bots || 0}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">BAN / MUTE</div>
        <div class="kpi-value red-val">${s.banned_users || 0} <span class="muted">/</span> <span class="amber-val">${s.muted_users || 0}</span></div>
        <div class="kpi-sub">đang khóa / cấm chat</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CÂU HỎI QUIZ</div>
        <div class="kpi-value">${s.total_questions || 0}</div>
        <div class="kpi-sub">ngân hàng ô 18</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">THẺ / NHÂN VẬT</div>
        <div class="kpi-value">${s.total_tarots || 0} <span class="muted">/</span> ${s.total_characters || 0}</div>
        <div class="kpi-sub">trận đã lưu: <span class="cyan-val">${fmtMoney(s.total_matches)}</span></div>
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
let studioSubTab = "npcs"; // npcs | skins | tarots | backgrounds
let cacheSkins = [];
let cacheBackgrounds = [];

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

function stopSpritePreview() {
  if (spritePreviewTimer) {
    clearInterval(spritePreviewTimer);
    spritePreviewTimer = null;
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
    { key: "npcs", label: "01. NPC (Quái vật & Thầy giáo)" },
    { key: "skins", label: "02. Nhân vật & Trang phục" },
    { key: "tarots", label: "03. Ảnh Thẻ bài Tarot" },
    { key: "backgrounds", label: "04. Phông nền (Backgrounds)" },
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

  const slotCardsHtml = ["monster", "teacher"].map(slotKey => {
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
            <div class="muted" style="margin-top:4px;word-break:break-all">${npc.is_custom ? `📁 ${esc(npc.disk_folder)}/` : "Đang dùng asset mặc định"}</div>
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
            <button id="studioPlayToggleBtn" class="btn btn-ghost btn-sm">${spriteStudioState.playing ? "⏸" : "▶"}</button>
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
            <button id="studioSaveBtn" class="btn btn-primary">💾 LƯU &amp; GHI VÀO Ổ CỨNG DỰ ÁN</button>
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
    $("studioPlayToggleBtn").textContent = spriteStudioState.playing ? "⏸" : "▶";
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
    btn.disabled = true; btn.textContent = "⏳ ĐANG GHI FILE...";
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
      btn.disabled = false; btn.textContent = "💾 LƯU & GHI VÀO Ổ CỨNG DỰ ÁN";
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
              <button id="skinPlayBtn" class="btn btn-ghost btn-sm">${skinStudioState.playing ? "⏸" : "▶"}</button>
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
              <button id="skinSaveBtn" class="btn btn-primary">💾 LƯU TRANG PHỤC &amp; GIÁ VÀO GAME</button>
              <span class="muted">📁 <code>${esc(activeSkin.disk_folder)}</code></span>
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
    $("skinPlayBtn").textContent = skinStudioState.playing ? "⏸" : "▶";
  };

  $("skinSaveBtn").onclick = async () => {
    const btn = $("skinSaveBtn");
    btn.disabled = true; btn.textContent = "⏳ ĐANG GHI FILE...";
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
      btn.disabled = false; btn.textContent = "💾 LƯU TRANG PHỤC & GIÁ VÀO GAME";
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
        <button type="submit" class="btn btn-primary">💾 Lưu ảnh &amp; thông tin</button>
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
            <button class="btn btn-secondary btn-sm" data-act="edit-bg-asset" data-id="${bg.id}">🖼 Thay ảnh &amp; Sửa</button>
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
        <button type="submit" class="btn btn-primary">💾 Lưu phông nền</button>
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
