/**
 * Modal Bảng Xếp Hạng Chi Tiết (Top 20), Soi Hồ Sơ Đối Thủ (Kết bạn + Thả Tim + Tarot tủ),
 * và Quà Mốc Rank (Thương Gia / Triệu Phú / Tỷ Phú / Huyền Thoại).
 * Giao diện giấy kem vàng đồng bộ 100% với game Cờ Tỷ Phú, chặn click xuyên xuống Phaser.
 */

const TAB_META = {
  season:  { title: "🏆 CAO THỦ MÙA GIẢI",    accent: "#d97706", badgeBg: "#fef3c7", badgeTxt: "#92400e" },
  wealth:  { title: "💰 ĐẠI GIA TỶ PHÚ",      accent: "#15803d", badgeBg: "#dcfce7", badgeTxt: "#166534" },
  scholar: { title: "🎓 TRẠNG NGUYÊN TRÍ TUỆ", accent: "#7c3aed", badgeBg: "#f3e8ff", badgeTxt: "#6b21a8" },
  streak:  { title: "🔥 CHUỖI THẮNG BẤT BẠI",  accent: "#dc2626", badgeBg: "#fee2e2", badgeTxt: "#991b1b" },
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getToken(scene) {
  if (scene?.player?.token) return scene.player.token;
  try {
    const reg = scene?.registry?.get?.("playerData");
    if (reg?.token) return reg.token;
  } catch {}
  try {
    const pd = JSON.parse(localStorage.getItem("playerData") || "null");
    if (pd?.token) return pd.token;
  } catch {}
  return localStorage.getItem("token") || "";
}

function lockPhaserInput(scene, overlay) {
  if (scene?.input) scene.input.enabled = false;
  ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "wheel"].forEach((ev) => {
    overlay.addEventListener(ev, (e) => e.stopPropagation());
  });
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    overlay.remove();
    if (scene?.input) {
      setTimeout(() => {
        try {
          if (scene?.input && !document.querySelector(".rk-overlay")) {
            scene.input.enabled = true;
          }
        } catch {}
      }, 60);
    }
  };
}

function injectRankingModalStylesOnce() {
  if (document.getElementById("ranking-modal-styles")) return;
  const st = document.createElement("style");
  st.id = "ranking-modal-styles";
  st.textContent = `
    .rk-overlay {
      position: fixed; inset: 0; z-index: 99998;
      background: rgba(8, 12, 22, 0.68);
      backdrop-filter: blur(5px);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Signika', 'Segoe UI', system-ui, sans-serif;
      padding: 14px; box-sizing: border-box;
      animation: rkFade 0.18s ease-out;
    }
    @keyframes rkFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes rkPop  { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .rk-panel {
      position: relative;
      width: 780px; max-width: 96vw;
      height: 580px; max-height: 90vh;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #fcf4dc 0%, #f5e6be 58%, #ebd397 100%);
      border: 4px solid #ffffff;
      border-radius: 24px;
      box-shadow: 0 22px 54px rgba(0, 0, 0, 0.56), 0 0 0 2.5px rgba(154, 106, 26, 0.5);
      padding: 34px 20px 16px;
      box-sizing: border-box;
      color: #4a2400;
      animation: rkPop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .rk-panel.compact { width: 640px; height: auto; max-height: 90vh; }
    .rk-panel::before {
      content: ""; position: absolute; inset: 8px;
      border: 2px dashed rgba(184, 142, 42, 0.55);
      border-radius: 17px; pointer-events: none;
    }
    .rk-header-pill {
      position: absolute; top: -25px; left: 50%; transform: translateX(-50%);
      min-width: 280px; height: 48px; padding: 0 28px;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(180deg, #ffd966 0%, #e5a324 55%, #ba7810 100%);
      border: 3px solid #7d4a08; border-radius: 26px;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.32), inset 0 2px 1px rgba(255, 255, 255, 0.65);
      font-size: 18.5px; font-weight: 900; color: #4a2000;
      text-shadow: 0 1px 0 rgba(255, 248, 210, 0.85);
      white-space: nowrap;
    }
    .rk-close-btn {
      position: absolute; top: -16px; right: -16px;
      width: 44px; height: 44px; padding: 0; border: none; background: transparent;
      cursor: pointer; z-index: 5; transition: transform 0.14s ease;
    }
    .rk-close-btn img { width: 44px; height: 44px; display: block; }
    .rk-close-btn:hover { transform: scale(1.1) rotate(6deg); }

    .rk-list {
      flex: 1; min-height: 0; overflow-y: auto; position: relative; z-index: 2;
      background: linear-gradient(180deg, #fffdf6 0%, #faf1d9 100%);
      border: 2px solid #d4b162; border-radius: 15px;
      padding: 10px; display: flex; flex-direction: column; gap: 7px;
    }
    .rk-list::-webkit-scrollbar { width: 7px; }
    .rk-list::-webkit-scrollbar-thumb { background: #c9a152; border-radius: 99px; }

    .rk-row {
      display: flex; align-items: center; gap: 11px;
      background: #ffffff; border: 1.8px solid #e3cf99; border-radius: 13px;
      padding: 8px 12px; cursor: pointer;
      transition: transform 0.12s, border-color 0.12s;
    }
    .rk-row:hover { border-color: #1c85d6; transform: translateY(-1px); }
    .rk-row.top1 { background: linear-gradient(90deg, #fff9db 0%, #fffdf5 100%); border-color: #f59e0b; }
    .rk-row.top2 { background: linear-gradient(90deg, #faf5ff 0%, #ffffff 100%); border-color: #c084fc; }
    .rk-row.top3 { background: linear-gradient(90deg, #f0f9ff 0%, #ffffff 100%); border-color: #38bdf8; }
    .rk-row.is-me { box-shadow: 0 0 0 2px rgba(28, 133, 214, 0.35); }

    .rk-pos {
      width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 15px; color: #5c3104;
      background: #f6e7be; border: 1.5px solid #d4b162;
    }
    .rk-row.top1 .rk-pos { background: linear-gradient(180deg, #ffd966, #e59b1c); color: #4a2000; border-color: #9a5b08; }
    .rk-row.top2 .rk-pos { background: linear-gradient(180deg, #f3e8ff, #c084fc); color: #3b0764; border-color: #7e22ce; }
    .rk-row.top3 .rk-pos { background: linear-gradient(180deg, #e0f2fe, #38bdf8); color: #082f49; border-color: #0369a1; }

    .rk-avatar {
      width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
      object-fit: cover; border: 2px solid #d4a640; background: #1c2434;
    }
    .rk-info { flex: 1; min-width: 0; }
    .rk-name-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .rk-name { font-size: 14.5px; font-weight: 900; color: #3d1f02; }
    .rk-title-tag {
      font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 99px;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .rk-sub { font-size: 12px; color: #78501c; margin-top: 2px; }

    .rk-score-col { text-align: right; flex-shrink: 0; }
    .rk-primary { font-size: 14.5px; font-weight: 900; color: #b45309; }
    .rk-kudos-btn {
      margin-top: 3px; border: 1.5px solid #f472b6; background: #fdf2f8; color: #be185d;
      font-family: inherit; font-size: 11.5px; font-weight: 800;
      padding: 3px 9px; border-radius: 99px; cursor: pointer;
      transition: transform 0.12s, background 0.12s;
    }
    .rk-kudos-btn:hover { background: #fce7f3; transform: scale(1.06); }
    .rk-kudos-btn:disabled { opacity: 0.6; cursor: default; transform: none; }

    .rk-footer {
      margin-top: 10px; position: relative; z-index: 2;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
      background: linear-gradient(90deg, #fff6d6 0%, #ffefc0 100%);
      border: 1.8px solid #d4a640; border-radius: 12px;
      padding: 8px 13px; font-size: 12.5px; font-weight: 800; color: #4a2000;
    }

    /* Profile Modal */
    .rk-prof-head {
      display: flex; align-items: center; gap: 14px;
      background: #ffffff; border: 2px solid #dfca91; border-radius: 15px;
      padding: 12px 15px; margin-bottom: 10px; position: relative; z-index: 2;
    }
    .rk-prof-av {
      width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
      border: 3.5px solid #e5a324; box-shadow: 0 4px 12px rgba(180,120,10,0.35);
      background: #1c2434; flex-shrink: 0;
    }
    .rk-stat-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-bottom: 10px; position: relative; z-index: 2;
    }
    .rk-stat-card {
      background: #fffdf6; border: 1.8px solid #dfca91; border-radius: 12px;
      padding: 9px 8px; text-align: center;
    }
    .rk-stat-lbl { font-size: 11px; font-weight: 800; color: #8c6222; }
    .rk-stat-val { font-size: 16px; font-weight: 900; color: #3d1f02; margin-top: 2px; }
    .rk-tarot-box {
      background: #fffdf6; border: 1.8px solid #dfca91; border-radius: 13px;
      padding: 10px 12px; margin-bottom: 10px; position: relative; z-index: 2;
    }
    .rk-tarot-list { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    .rk-tarot-card {
      display: flex; align-items: center; gap: 8px;
      background: #fff; border: 1.5px solid #d8bc78; border-radius: 10px;
      padding: 6px 10px; font-size: 12.5px; font-weight: 800;
    }
    .rk-tarot-card img { width: 32px; height: 44px; object-fit: contain; border-radius: 4px; }

    .rk-btn {
      border: 2px solid #0f538c;
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 60%, #146bb3 100%);
      color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 800;
      padding: 8px 16px; border-radius: 12px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
      box-shadow: 0 3px 0 #0b4170;
    }
    .rk-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .rk-btn-gold {
      border-color: #8a5208; background: linear-gradient(180deg, #ffd65c, #d9820b);
      color: #4a2000; box-shadow: 0 3px 0 #7a4706;
    }
    .rk-btn-green {
      border-color: #176635; background: linear-gradient(180deg, #52d681, #1d8744);
      color: #fff; box-shadow: 0 3px 0 #13542b;
    }
    .rk-btn-pink {
      border-color: #9d174d; background: linear-gradient(180deg, #f472b6, #db2777);
      color: #fff; box-shadow: 0 3px 0 #831843;
    }
  `;
  document.head.appendChild(st);
}

/**
 * 1. POPUP BXH TOP 20 (Bấm vào bất kỳ hàng nào sẽ mở Popup Soi Hồ Sơ Chi Tiết!)
 */
export function openRankingTop20Modal({ scene, tab = "season", ranking = [], me = null, myUserId = null, onKudosUpdated = null } = {}) {
  injectRankingModalStylesOnce();
  document.getElementById("ranking-modal-overlay")?.remove();

  const meta = TAB_META[tab] || TAB_META.season;
  const token = getToken(scene);

  const overlay = document.createElement("div");
  overlay.id = "ranking-modal-overlay";
  overlay.className = "rk-overlay";
  overlay.innerHTML = `
    <div class="rk-panel" role="dialog" aria-modal="true" aria-label="Bảng xếp hạng Top 20">
      <div class="rk-header-pill">${esc(meta.title)} • TOP 20</div>
      <button class="rk-close-btn" id="rkCloseBtn" title="Đóng">
        <img src="assets/ui/shared/close.png" alt="Đóng" />
      </button>

      <div class="rk-list" id="rkList">
        ${ranking.length ? ranking.map((r) => {
          const topCls = r.rank === 1 ? "top1" : r.rank === 2 ? "top2" : r.rank === 3 ? "top3" : "";
          const meCls = myUserId && Number(r.user_id) === Number(myUserId) ? "is-me" : "";
          const avId = Math.max(1, Math.min(50, Number(r.active_avatar_id || 1)));
          const isSelf = myUserId && Number(r.user_id) === Number(myUserId);
          return `
            <div class="rk-row ${topCls} ${meCls}" data-inspect-uid="${r.user_id}" title="Bấm để soi hồ sơ chi tiết">
              <div class="rk-pos">#${r.rank}</div>
              <img class="rk-avatar" src="assets/resources/Avatar/thumbs_96/${avId}.png" alt="" onerror="this.src='assets/resources/Avatar/thumbs_96/1.png'" />
              <div class="rk-info">
                <div class="rk-name-line">
                  <span class="rk-name">${esc(r.username)}</span>
                  <span class="rk-title-tag" style="background:${meta.badgeBg};color:${meta.badgeTxt};">${esc(r.title_badge || r.tier_name)}</span>
                  ${isSelf ? `<span class="rk-title-tag" style="background:#dbeafe;color:#1d4ed8;">BẠN</span>` : ""}
                </div>
                <div class="rk-sub">${esc(r.secondary_label || "")} • <i>Bấm để soi hồ sơ</i></div>
              </div>
              <div class="rk-score-col">
                <div class="rk-primary" style="color:${meta.accent}">${esc(r.primary_label)}</div>
                <button class="rk-kudos-btn" data-uid="${r.user_id}" ${isSelf ? "disabled" : ""} title="${isSelf ? "Không thể tự thả tim" : "Thả tim vinh danh (1 lần/ngày)"}">
                  ❤️ <span class="rk-kudos-num">${Number(r.kudos_count || 0)}</span>
                </button>
              </div>
            </div>
          `;
        }).join("") : `<div style="padding:36px;text-align:center;font-weight:800;color:#7a5422;">Chưa có dữ liệu xếp hạng cho bảng này.</div>`}
      </div>

      <div class="rk-footer">
        <span>${me ? `Hạng của bạn: <b>#${me.rank}</b> • ${esc(me.primary_label)}${me.goal_hint ? ` • 🎯 ${esc(me.goal_hint)}` : ""}` : "Chưa có thứ hạng cá nhân"}</span>
        <span id="rkToast" style="font-size:12px;color:#15803d;"></span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaserInput(scene, overlay);

  overlay.querySelector("#rkCloseBtn").addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });

  const toastEl = overlay.querySelector("#rkToast");
  overlay.querySelectorAll(".rk-row[data-inspect-uid]").forEach((row) => {
    row.addEventListener("click", () => {
      const uid = Number(row.dataset.inspectUid);
      cleanup();
      openPlayerProfileModal({ scene, userId: uid, myUserId, onKudosUpdated });
    });
  });

  overlay.querySelectorAll(".rk-kudos-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const toId = Number(btn.dataset.uid);
      if (!token) {
        toastEl.style.color = "#b91c1c";
        toastEl.textContent = "Vui lòng đăng nhập để thả tim!";
        return;
      }
      btn.disabled = true;
      try {
        const res = await fetch("/api/ranking/kudos", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to_user_id: toId }),
        });
        const j = await res.json().catch(() => null);
        if (j?.success) {
          btn.querySelector(".rk-kudos-num").textContent = j.kudos_count;
          toastEl.style.color = "#15803d";
          toastEl.textContent = "❤️ Đã thả tim vinh danh thành công!";
          if (onKudosUpdated) onKudosUpdated(toId, j.kudos_count);
        } else {
          toastEl.style.color = "#b45309";
          toastEl.textContent = j?.message || "Hôm nay bạn đã thả tim rồi!";
        }
      } catch {
        toastEl.style.color = "#b91c1c";
        toastEl.textContent = "Lỗi kết nối máy chủ";
        btn.disabled = false;
      }
    });
  });
}

/**
 * 2. POPUP SOI HỒ SƠ CHI TIẾT ĐỐI THỦ (Avatar, Skin, Tỷ lệ thắng, IQ, Bộ thẻ Tarot tủ, Kết bạn, Thả Tim)
 */
export async function openPlayerProfileModal({ scene, userId, myUserId = null, onKudosUpdated = null } = {}) {
  injectRankingModalStylesOnce();
  document.getElementById("ranking-profile-overlay")?.remove();

  const token = getToken(scene);
  const overlay = document.createElement("div");
  overlay.id = "ranking-profile-overlay";
  overlay.className = "rk-overlay";
  overlay.innerHTML = `
    <div class="rk-panel compact" role="dialog" aria-modal="true" aria-label="Hồ sơ người chơi">
      <div class="rk-header-pill">🪪 HỒ SƠ CAO THỦ</div>
      <button class="rk-close-btn" id="rkProfCloseBtn" title="Đóng">
        <img src="assets/ui/shared/close.png" alt="Đóng" />
      </button>
      <div id="rkProfBody" style="position:relative;z-index:2;padding:24px;text-align:center;font-weight:800;">Đang tải hồ sơ người chơi...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaserInput(scene, overlay);

  overlay.querySelector("#rkProfCloseBtn").addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });

  const body = overlay.querySelector("#rkProfBody");
  try {
    const res = await fetch(`/api/ranking/profile/${userId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (!json?.success || !json.profile) {
      body.textContent = json?.message || "Không tìm thấy hồ sơ người chơi!";
      return;
    }
    const p = json.profile;
    const avId = Math.max(1, Math.min(50, Number(p.active_avatar_id || 1)));
    const isSelf = p.friend_status === "self" || (myUserId && Number(p.user_id) === Number(myUserId));
    const friendBtnLabel =
      p.friend_status === "friends" ? "✓ Đã là bạn bè"
      : p.friend_status === "pending_out" ? "⏳ Đã gửi lời mời"
      : p.friend_status === "pending_in" ? "🤝 Chấp nhận kết bạn"
      : "🤝 Kết bạn";

    body.style.padding = "0";
    body.style.textAlign = "left";
    body.innerHTML = `
      <div class="rk-prof-head">
        <img class="rk-prof-av" src="assets/resources/Avatar/thumbs_96/${avId}.png" alt="" onerror="this.src='assets/resources/Avatar/thumbs_96/1.png'" />
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:19px;font-weight:900;color:#3d1f02;">${esc(p.username)}</span>
            <span class="rk-title-tag" style="background:#fef3c7;color:#92400e;font-size:12px;">Hạng #${p.rank} • ${esc(p.tier_name)}</span>
          </div>
          <div style="font-size:12.5px;color:#78501c;margin-top:4px;">
            Nhân vật: <b>${esc(String(p.characterName || "Dark_Oracle").replace(/_/g, " "))}</b> (Skin #${p.skin_id || 1}) •
            Ecoin: <b style="color:#b45309">${Number(p.ecoin || 0).toLocaleString("vi-VN")}</b>
          </div>
        </div>
      </div>

      <div class="rk-stat-grid">
        <div class="rk-stat-card">
          <div class="rk-stat-lbl">ELO / HẠNG</div>
          <div class="rk-stat-val" style="color:#d97706">${p.elo}</div>
        </div>
        <div class="rk-stat-card">
          <div class="rk-stat-lbl">TỶ LỆ THẮNG</div>
          <div class="rk-stat-val" style="color:#15803d">${p.win_rate}%</div>
          <div style="font-size:10.5px;color:#78501c">${p.wins}/${p.matches} trận</div>
        </div>
        <div class="rk-stat-card">
          <div class="rk-stat-lbl">HỌC GIẢ (IQ)</div>
          <div class="rk-stat-val" style="color:#7c3aed">${p.iq_score}</div>
          <div style="font-size:10.5px;color:#78501c">Chuỗi ${p.best_quiz_streak} Quiz</div>
        </div>
        <div class="rk-stat-card">
          <div class="rk-stat-lbl">CHUỖI THẮNG</div>
          <div class="rk-stat-val" style="color:#dc2626">${p.max_streak}</div>
          <div style="font-size:10.5px;color:#78501c">❤️ ${p.kudos_count} lượt thích</div>
        </div>
      </div>

      <div class="rk-tarot-box">
        <div style="font-size:12.5px;font-weight:900;color:#5c3104;">🃏 BỘ THẺ TAROT TỦ ĐANG TRANG BỊ</div>
        <div class="rk-tarot-list">
          ${(p.active_tarots && p.active_tarots.length) ? p.active_tarots.map(t => `
            <div class="rk-tarot-card">
              ${t.icon ? `<img src="${esc(t.icon)}" alt="" onerror="this.style.display='none'" />` : ""}
              <div>
                <div>${esc(t.name)}</div>
                <div style="font-size:10.5px;color:#78501c;font-weight:700">CD: ${t.cooldown_seconds || 3} lượt</div>
              </div>
            </div>
          `).join("") : `<span style="font-size:12px;color:#78501c;">Chưa trang bị thẻ Tarot nào.</span>`}
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;position:relative;z-index:2;">
        <div id="rkProfFeedback" style="font-size:12.5px;font-weight:800;color:#15803d;"></div>
        <div style="display:flex;gap:8px;">
          ${!isSelf ? `
            <button class="rk-btn" id="rkAddFriendBtn" ${(p.friend_status === "friends" || p.friend_status === "pending_out") ? "disabled" : ""}>${friendBtnLabel}</button>
            <button class="rk-btn rk-btn-pink" id="rkProfKudosBtn">❤️ Thả Tim (<span id="rkProfKudosNum">${Number(p.kudos_count || 0)}</span>)</button>
          ` : `<span style="font-size:12.5px;font-weight:800;color:#1d4ed8;">Đây là hồ sơ của chính bạn!</span>`}
        </div>
      </div>
    `;

    const fb = body.querySelector("#rkProfFeedback");
    body.querySelector("#rkAddFriendBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const r = await fetch("/api/ranking/friend-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to_user_id: p.user_id }),
      }).then(x => x.json()).catch(() => null);
      if (r?.success) {
        btn.textContent = r.friend_status === "friends" ? "✓ Đã là bạn bè" : "⏳ Đã gửi lời mời";
        fb.style.color = "#15803d";
        fb.textContent = r.message || "Đã gửi lời mời kết bạn!";
      } else {
        fb.style.color = "#b91c1c";
        fb.textContent = r?.message || "Không thể gửi lời mời kết bạn";
        btn.disabled = false;
      }
    });

    body.querySelector("#rkProfKudosBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const r = await fetch("/api/ranking/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to_user_id: p.user_id }),
      }).then(x => x.json()).catch(() => null);
      if (r?.success) {
        body.querySelector("#rkProfKudosNum").textContent = r.kudos_count;
        fb.style.color = "#15803d";
        fb.textContent = "❤️ Đã thả tim vinh danh thành công!";
        if (onKudosUpdated) onKudosUpdated(p.user_id, r.kudos_count);
      } else {
        fb.style.color = "#b45309";
        fb.textContent = r?.message || "Hôm nay bạn đã thả tim rồi!";
      }
    });
  } catch {
    body.textContent = "Lỗi kết nối máy chủ khi tải hồ sơ!";
  }
}

/**
 * 3. POPUP QUÀ MỐC RANK MÙA GIẢI (Tập Sự → Thương Gia → Triệu Phú → Tỷ Phú → Huyền Thoại)
 */
export async function openRankRewardsModal({ scene, onRewardClaimed = null } = {}) {
  injectRankingModalStylesOnce();
  document.getElementById("ranking-rewards-overlay")?.remove();

  const token = getToken(scene);
  const overlay = document.createElement("div");
  overlay.id = "ranking-rewards-overlay";
  overlay.className = "rk-overlay";
  overlay.innerHTML = `
    <div class="rk-panel compact" role="dialog" aria-modal="true" aria-label="Quà Mốc Rank">
      <div class="rk-header-pill">🎁 QUÀ MỐC RANK MÙA GIẢI</div>
      <button class="rk-close-btn" id="rkRewCloseBtn" title="Đóng">
        <img src="assets/ui/shared/close.png" alt="Đóng" />
      </button>
      <div id="rkRewBody" style="position:relative;z-index:2;padding:20px;text-align:center;font-weight:800;">Đang tải mốc thưởng Rank...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaserInput(scene, overlay);

  overlay.querySelector("#rkRewCloseBtn").addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });

  const body = overlay.querySelector("#rkRewBody");

  const renderRewards = async () => {
    const res = await fetch("/api/ranking/rewards", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.json()).catch(() => null);

    if (!res?.success) {
      body.textContent = res?.message || "Vui lòng đăng nhập để nhận Quà Mốc Rank!";
      return;
    }

    body.style.padding = "0";
    body.style.textAlign = "left";
    body.innerHTML = `
      <div class="rk-footer" style="margin-top:0;margin-bottom:10px;">
        <span>Bậc Rank hiện tại: <b style="color:#b45309">${esc(res.tier_name)}</b> (${res.elo} ELO${res.rank ? ` • Hạng #${res.rank}` : ""})</span>
        <span id="rkRewFb" style="color:#15803d;"></span>
      </div>
      <div class="rk-list" style="max-height:380px;">
        ${(res.milestones || []).map(m => `
          <div class="rk-row" style="cursor:default;border-left:5px solid ${m.color};">
            <div style="flex:1;min-width:0;">
              <div style="font-size:14.5px;font-weight:900;color:#3d1f02;">
                ${esc(m.name)} <span style="font-size:12px;color:#78501c;font-weight:700">(Từ ${m.min_elo.toLocaleString("vi-VN")} ELO)</span>
              </div>
              <div style="font-size:12px;color:#78501c;margin-top:2px;">${esc(m.desc)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
              <div style="display:flex;align-items:center;gap:4px;font-weight:900;color:#b45309;font-size:14px;">
                <img src="assets/ui/shared/coin.png" alt="" style="width:20px;height:20px;" />
                +${m.reward_ecoin.toLocaleString("vi-VN")}
              </div>
              ${m.claimed
                ? `<button class="rk-btn" disabled style="background:#cbd5e1;border-color:#94a3b8;color:#475569;box-shadow:none;">✓ Đã nhận</button>`
                : m.can_claim
                  ? `<button class="rk-btn rk-btn-green rk-claim-btn" data-key="${esc(m.key)}">🎁 Nhận ngay</button>`
                  : `<button class="rk-btn" disabled style="background:#e2e8f0;border-color:#cbd5e1;color:#64748b;box-shadow:none;">🔒 Chưa đạt</button>`}
            </div>
          </div>
        `).join("")}
      </div>
    `;

    const fb = body.querySelector("#rkRewFb");
    body.querySelectorAll(".rk-claim-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Đang nhận...";
        const r = await fetch("/api/ranking/rewards/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ milestone_key: btn.dataset.key }),
        }).then(x => x.json()).catch(() => null);
        if (r?.success) {
          try {
            const pd = JSON.parse(localStorage.getItem("playerData") || "null");
            if (pd?.user) {
              pd.user.ecoin = r.new_ecoin;
              localStorage.setItem("playerData", JSON.stringify(pd));
            }
          } catch {}
          if (onRewardClaimed) onRewardClaimed(r.new_ecoin, r.reward_ecoin);
          await renderRewards();
          const fb2 = body.querySelector("#rkRewFb");
          if (fb2) fb2.textContent = r.message;
        } else {
          if (fb) { fb.style.color = "#b91c1c"; fb.textContent = r?.message || "Không thể nhận quà"; }
          btn.disabled = false;
          btn.textContent = "🎁 Nhận ngay";
        }
      });
    });
  };

  renderRewards();
}
