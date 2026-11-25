/**
 * Admin Dashboard Frontend Controller — Tactical NOC / Terminal HUD
 * Giao tiếp với REST API /api/admin/* qua JWT Bearer Token.
 */

const TOKEN_KEY = "cotyphu_admin_token";
let currentTab = "overview";
let currentAdmin = null;

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
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("adminProfile").textContent = `ADMIN: ${currentAdmin?.name || currentAdmin?.username || "ROOT"}`;
  loadTab(currentTab);
}

const TAB_TITLES = {
  overview: "[ TỔNG QUAN HỆ THỐNG ]",
  users: "[ QUẢN LÝ NGƯỜI CHƠI & BAN / MUTE ]",
  rooms: "[ GIÁM SÁT PHÒNG ĐẤU — LIVE & DB ]",
  questions: "[ NGÂN HÀNG CÂU HỎI QUIZ ]",
  tarots: "[ KHO THẺ TAROT ]",
  characters: "[ NHÂN VẬT & KỸ NĂNG ]",
  audit: "[ NHẬT KÝ QUẢN TRỊ — AUDIT LOG ]",
};

function setTabHtml(html) {
  const el = $("tabContent");
  el.classList.remove("hud-enter");
  void el.offsetWidth;
  el.innerHTML = html;
  el.classList.add("hud-enter");
}

async function loadTab(tab) {
  currentTab = tab;
  $("pageTitle").textContent = TAB_TITLES[tab] || "[ ADMIN ]";
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  $("tabContent").innerHTML = `<div class="empty-state">&gt; đang tải telemetry...</div>`;

  try {
    if (tab === "overview") await renderOverview();
    else if (tab === "users") await renderUsers();
    else if (tab === "rooms") await renderRooms();
    else if (tab === "questions") await renderQuestions();
    else if (tab === "tarots") await renderTarots();
    else if (tab === "characters") await renderCharacters();
    else if (tab === "audit") await renderAuditLogs();
  } catch (err) {
    setTabHtml(`<div class="error-box">[ERR] ${esc(err.message)}</div>`);
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
  } catch (err) {
    showToast(err.message || "Có lỗi xảy ra", "error");
  }
});

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => loadTab(btn.dataset.tab));
});

$("refreshBtn").onclick = () => loadTab(currentTab);
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
