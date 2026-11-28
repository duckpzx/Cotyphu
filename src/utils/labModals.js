/**
 * HỌC VIỆN TRÍ TUỆ (LabScene Modals) — Đồng bộ 100% phong cách giấy kem vàng Cờ Tỷ Phú:
 *  1) openQuizSprintModal  — Đấu Trường Luyện Trí Tuệ 60 Giây (Combo x1/x2/x3, IQ → BXH Trạng Nguyên, Ecoin + Bụi May Mắn Tarot)
 *  2) openCodexModal       — Bách Khoa Toàn Thư & Thư Viện Chiến Thuật (10 Tarot Lv1/Lv2, 7 Nhân vật, Cơ chế, Quà sưu tập)
 *  3) openLabBuffsModal    — Chế Tạo Bùa Trợ Chiến 1 Trận (Bùa Khởi Đầu, Bùa Bảo Hộ, Bùa Trí Tuệ 50/50)
 */

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

function syncLocalEcoin(newEcoin, onEcoinUpdated) {
  if (newEcoin === null || newEcoin === undefined) return;
  try {
    const pd = JSON.parse(localStorage.getItem("playerData") || "null");
    if (pd?.user) {
      pd.user.ecoin = Number(newEcoin);
      localStorage.setItem("playerData", JSON.stringify(pd));
    }
  } catch {}
  if (typeof onEcoinUpdated === "function") onEcoinUpdated(Number(newEcoin));
}

function lockPhaser(scene, overlay, onExtraCleanup = null) {
  if (scene?.input) scene.input.enabled = false;
  ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "wheel"].forEach((ev) => {
    overlay.addEventListener(ev, (e) => e.stopPropagation());
  });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try { onExtraCleanup?.(); } catch {}
    overlay.remove();
    if (scene?.input) {
      setTimeout(() => {
        try {
          if (scene?.input && !document.querySelector(".lab-overlay")) {
            scene.input.enabled = true;
          }
        } catch {}
      }, 60);
    }
  };
}

function injectLabStylesOnce() {
  if (document.getElementById("lab-modals-styles")) return;
  const st = document.createElement("style");
  st.id = "lab-modals-styles";
  st.textContent = `
    .lab-overlay {
      position: fixed; inset: 0; z-index: 99998;
      background: rgba(8, 12, 24, 0.70);
      backdrop-filter: blur(5px);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Signika', 'Segoe UI', system-ui, sans-serif;
      padding: 14px; box-sizing: border-box;
      animation: labFade 0.18s ease-out;
    }
    @keyframes labFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes labPop  { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .lab-panel {
      position: relative;
      width: 820px; max-width: 96vw;
      height: 595px; max-height: 92vh;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #fcf4dc 0%, #f5e6be 58%, #ebd397 100%);
      border: 4px solid #ffffff; border-radius: 24px;
      box-shadow: 0 22px 54px rgba(0, 0, 0, 0.56), 0 0 0 2.5px rgba(154, 106, 26, 0.5);
      padding: 34px 20px 16px; box-sizing: border-box; color: #4a2400;
      animation: labPop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .lab-panel.compact { width: 700px; height: auto; max-height: 90vh; }
    .lab-panel::before {
      content: ""; position: absolute; inset: 8px;
      border: 2px dashed rgba(184, 142, 42, 0.55);
      border-radius: 17px; pointer-events: none;
    }
    .lab-header-pill {
      position: absolute; top: -25px; left: 50%; transform: translateX(-50%);
      min-width: 290px; height: 48px; padding: 0 28px;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(180deg, #ffd966 0%, #e5a324 55%, #ba7810 100%);
      border: 3px solid #7d4a08; border-radius: 26px;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.32), inset 0 2px 1px rgba(255, 255, 255, 0.65);
      font-size: 18.5px; font-weight: 900; color: #4a2000;
      text-shadow: 0 1px 0 rgba(255, 248, 210, 0.85);
      white-space: nowrap;
    }
    .lab-close-btn {
      position: absolute; top: -16px; right: -16px;
      width: 44px; height: 44px; padding: 0; border: none; background: transparent;
      cursor: pointer; z-index: 5; transition: transform 0.14s ease;
    }
    .lab-close-btn img { width: 44px; height: 44px; display: block; }
    .lab-close-btn:hover { transform: scale(1.1) rotate(6deg); }

    .lab-body {
      flex: 1; min-height: 0; overflow-y: auto; position: relative; z-index: 2;
      background: linear-gradient(180deg, #fffdf6 0%, #faf1d9 100%);
      border: 2px solid #d4b162; border-radius: 15px; padding: 14px;
    }
    .lab-body::-webkit-scrollbar { width: 7px; }
    .lab-body::-webkit-scrollbar-thumb { background: #c9a152; border-radius: 99px; }

    .lab-tabs { display: flex; gap: 8px; margin-bottom: 10px; position: relative; z-index: 2; flex-wrap: wrap; }
    .lab-tab {
      flex: 1; min-width: 130px; border: 2px solid #c69a44;
      background: linear-gradient(180deg, #fffdf5 0%, #f5e5ba 100%);
      color: #5c3104; font-family: inherit; font-size: 13.5px; font-weight: 800;
      padding: 8px 10px; border-radius: 12px; cursor: pointer;
      box-shadow: 0 2px 0 #b88c38;
    }
    .lab-tab.active {
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 100%);
      border-color: #0e4f87; color: #fff; box-shadow: 0 2px 0 #0b4170;
    }

    .lab-btn {
      border: 2px solid #0f538c;
      background: linear-gradient(180deg, #43b8ff 0%, #1c85d6 60%, #146bb3 100%);
      color: #fff; font-family: inherit; font-size: 14px; font-weight: 800;
      padding: 9px 18px; border-radius: 12px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      box-shadow: 0 3px 0 #0b4170;
    }
    .lab-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .lab-btn-gold {
      border-color: #8a5208; background: linear-gradient(180deg, #ffd65c, #d9820b);
      color: #4a2000; box-shadow: 0 3px 0 #7a4706;
    }
    .lab-btn-green {
      border-color: #176635; background: linear-gradient(180deg, #52d681, #1d8744);
      color: #fff; box-shadow: 0 3px 0 #13542b;
    }

    /* Quiz Sprint UI */
    .qz-hud {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
      background: #fff6d6; border: 1.8px solid #d8b55d; border-radius: 12px;
      padding: 8px 13px; margin-bottom: 10px; font-weight: 900; font-size: 14px;
    }
    .qz-bar-track { height: 9px; background: #e8d5a3; border-radius: 99px; overflow: hidden; margin-bottom: 12px; }
    .qz-bar-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #eab308, #ef4444); transition: width 0.25s linear; }
    .qz-question {
      background: #ffffff; border: 2px solid #d4b162; border-radius: 14px;
      padding: 16px; font-size: 16.5px; font-weight: 800; color: #3d1f02;
      line-height: 1.45; margin-bottom: 12px; min-height: 70px;
    }
    .qz-opts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .qz-opt {
      text-align: left; border: 2px solid #cfa346;
      background: linear-gradient(180deg, #ffffff 0%, #fff6dc 100%);
      color: #4a2400; font-family: inherit; font-size: 14px; font-weight: 800;
      padding: 12px 14px; border-radius: 13px; cursor: pointer;
      box-shadow: 0 3px 0 rgba(180, 130, 30, 0.3);
      transition: transform 0.1s, border-color 0.1s;
    }
    .qz-opt:hover:not(:disabled) { border-color: #1c85d6; transform: translateY(-1px); }
    .qz-opt.correct { background: #dcfce7; border-color: #16a34a; color: #14532d; }
    .qz-opt.wrong   { background: #fee2e2; border-color: #dc2626; color: #7f1d1d; }

    /* Codex & Buff Cards */
    .lab-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .lab-card {
      background: #ffffff; border: 1.8px solid #e0ca90; border-radius: 13px;
      padding: 10px 12px; display: flex; gap: 10px; align-items: flex-start;
    }
    .lab-card.owned { border-color: #48b86a; background: linear-gradient(180deg, #ffffff 0%, #f3fdf6 100%); }
    .lab-pill {
      display: inline-block; font-size: 10.5px; font-weight: 800; padding: 2px 8px;
      border-radius: 99px; background: #fef3c7; color: #92400e;
    }
    .lab-pill.ok { background: #dcfce7; color: #166534; }
    .lab-pill.purple { background: #f3e8ff; color: #6b21a8; }
  `;
  document.head.appendChild(st);
}

/**
 * 1. ĐẤU TRƯỜNG LUYỆN TRÍ TUỆ (QUIZ SPRINT 60 GIÂY)
 */
export async function openQuizSprintModal({ scene, onEcoinUpdated = null } = {}) {
  injectLabStylesOnce();
  document.getElementById("lab-quiz-overlay")?.remove();

  const token = getToken(scene);
  let timerId = null;

  const overlay = document.createElement("div");
  overlay.id = "lab-quiz-overlay";
  overlay.className = "lab-overlay";
  overlay.innerHTML = `
    <div class="lab-panel compact" role="dialog" aria-modal="true" aria-label="Thử thách Học Giả 60s">
      <div class="lab-header-pill">🎓 THỬ THÁCH HỌC GIẢ — QUIZ 60s</div>
      <button class="lab-close-btn" id="labQzClose"><img src="assets/ui/shared/close.png" alt="Đóng" /></button>
      <div class="lab-body" id="labQzBody" style="text-align:center;padding:28px;font-weight:800;">
        Đang chuẩn bị bộ câu hỏi từ Kho Tri Thức (120 câu)...
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaser(scene, overlay, () => { if (timerId) clearInterval(timerId); });
  overlay.querySelector("#labQzClose").addEventListener("click", cleanup);

  const body = overlay.querySelector("#labQzBody");
  const startRes = await fetch("/api/lab/quiz/start", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(r => r.json()).catch(() => null);

  if (!startRes?.success || !startRes.questions?.length) {
    body.textContent = startRes?.message || "Vui lòng đăng nhập để tham gia Thử Thách Học Giả!";
    return;
  }

  const questions = startRes.questions;
  let idx = 0, correctCount = 0, totalAnswered = 0, curCombo = 0, maxCombo = 0;
  let timeLeft = Number(startRes.duration_sec || 60);
  let finished = false;
  let locked = false;

  const finishRun = async () => {
    if (finished) return;
    finished = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    body.style.textAlign = "center";
    body.innerHTML = `<div style="padding:24px;font-weight:800;">⏳ Đang chấm điểm Học Giả &amp; cập nhật BXH Trạng Nguyên...</div>`;

    const sub = await fetch("/api/lab/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ correct_count: correctCount, total_answered: totalAnswered, max_combo: maxCombo }),
    }).then(r => r.json()).catch(() => null);

    if (sub?.success) {
      syncLocalEcoin(sub.new_ecoin, onEcoinUpdated);
      body.innerHTML = `
        <div style="font-size:24px;font-weight:900;color:#b45309;margin-bottom:6px;">🎉 HOÀN THÀNH THỬ THÁCH HỌC GIẢ!</div>
        <div style="font-size:13.5px;color:#78501c;margin-bottom:14px;">Điểm Học Giả đã được đồng bộ thẳng lên <b>BXH Trạng Nguyên Trí Tuệ</b>!</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">
          <div class="lab-card" style="flex-direction:column;align-items:center;"><span style="font-size:11px;color:#78501c">ĐÚNG</span><b style="font-size:20px;color:#15803d">${sub.correct_count}/${sub.total_answered}</b></div>
          <div class="lab-card" style="flex-direction:column;align-items:center;"><span style="font-size:11px;color:#78501c">MAX COMBO</span><b style="font-size:20px;color:#dc2626">x${sub.combo_mult} (${sub.max_combo})</b></div>
          <div class="lab-card" style="flex-direction:column;align-items:center;"><span style="font-size:11px;color:#78501c">ĐIỂM IQ</span><b style="font-size:20px;color:#7c3aed">+${sub.iq_gained}</b></div>
          <div class="lab-card" style="flex-direction:column;align-items:center;"><span style="font-size:11px;color:#78501c">ECOIN THƯỞNG</span><b style="font-size:18px;color:#b45309">+${Number(sub.ecoin_reward || 0).toLocaleString("vi-VN")}</b></div>
        </div>
        ${sub.luck_dust_gained > 0 ? `<div style="background:#f3e8ff;border:1.8px solid #a855f7;border-radius:11px;padding:8px 12px;margin-bottom:12px;font-size:13px;font-weight:800;color:#6b21a8;">✨ Đạt Combo ≥ 3! Bạn nhận được +${sub.luck_dust_gained} Bụi May Mắn Tarot (+10% tỉ lệ nâng cấp)</div>` : ""}
        ${sub.reward_capped ? `<div style="font-size:12px;color:#b45309;margin-bottom:10px;font-weight:700;">Hôm nay bạn đã nhận đủ ${sub.daily_reward_limit}/${sub.daily_reward_limit} lượt thưởng Ecoin — vẫn được cộng Điểm Học Giả (IQ)!</div>` : `<div style="font-size:12px;color:#15803d;margin-bottom:10px;font-weight:700;">Lượt nhận thưởng hôm nay: ${sub.runs_today}/${sub.daily_reward_limit}</div>`}
        <div style="display:flex;justify-content:center;gap:10px;">
          <button class="lab-btn lab-btn-gold" id="labQzReplay">🔄 Thi tiếp lượt mới</button>
          <button class="lab-btn" id="labQzDone">Đóng</button>
        </div>
      `;
      body.querySelector("#labQzReplay")?.addEventListener("click", () => {
        cleanup();
        openQuizSprintModal({ scene, onEcoinUpdated });
      });
      body.querySelector("#labQzDone")?.addEventListener("click", cleanup);
    } else {
      body.textContent = sub?.message || "Lỗi lưu kết quả!";
    }
  };

  const renderQuestion = () => {
    if (finished) return;
    if (idx >= questions.length) return finishRun();
    locked = false;
    const q = questions[idx];
    const mult = curCombo >= 6 ? 3 : curCombo >= 3 ? 2 : 1;

    body.style.textAlign = "left";
    body.innerHTML = `
      <div class="qz-hud">
        <span>⏱️ <b id="qzTimeVal" style="color:${timeLeft <= 10 ? "#dc2626" : "#15803d"}">${timeLeft}s</b></span>
        <span>Câu <b>${idx + 1}/${questions.length}</b> • Đúng: <b style="color:#15803d">${correctCount}</b></span>
        <span>🔥 Combo: <b style="color:#dc2626">${curCombo}</b> (Hệ số <b>x${mult}</b>)</span>
      </div>
      <div class="qz-bar-track"><div class="qz-bar-fill" id="qzBarFill" style="width:${Math.round((timeLeft / 60) * 100)}%"></div></div>
      <div class="qz-question">${esc(q.question)}</div>
      <div class="qz-opts">
        ${["A", "B", "C", "D"].map(k => `
          <button class="qz-opt" data-ans="${k}"><b>${k}.</b> ${esc(q[k])}</button>
        `).join("")}
      </div>
    `;

    body.querySelectorAll(".qz-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        if (locked || finished) return;
        locked = true;
        totalAnswered++;
        const pick = btn.dataset.ans;
        const isRight = pick === q.correct;
        if (isRight) {
          correctCount++;
          curCombo++;
          if (curCombo > maxCombo) maxCombo = curCombo;
          btn.classList.add("correct");
        } else {
          curCombo = 0;
          btn.classList.add("wrong");
          body.querySelector(`.qz-opt[data-ans="${q.correct}"]`)?.classList.add("correct");
        }
        setTimeout(() => {
          idx++;
          renderQuestion();
        }, 420);
      });
    });
  };

  // Màn hình giới thiệu trước khi bấm Bắt đầu
  body.style.textAlign = "center";
  body.innerHTML = `
    <div style="font-size:20px;font-weight:900;color:#4a2000;margin-bottom:6px;">Sẵn sàng chinh phục 15 câu hỏi trong 60 giây?</div>
    <div style="font-size:13.5px;color:#78501c;line-height:1.5;max-width:560px;margin:0 auto 16px;">
      • Trả lời đúng liên tiếp để tích <b>Combo x1 → x2 → x3</b> nhân thưởng Ecoin!<br/>
      • Cộng thẳng <b>Điểm Học Giả (IQ)</b> lên <b>BXH Trạng Nguyên Trí Tuệ</b>.<br/>
      • Đạt <b>Combo ≥ 3</b> nhận thêm <b>✨ Bụi May Mắn Tarot (+10% tỉ lệ nâng cấp)</b>.<br/>
      • Lượt nhận thưởng Ecoin hôm nay: <b>${startRes.runs_today}/${startRes.daily_reward_limit}</b> • IQ hiện tại: <b>${startRes.current_iq}</b>
    </div>
    <button class="lab-btn lab-btn-green" id="labQzStartBtn" style="font-size:16px;padding:11px 28px;">🚀 BẮT ĐẦU THI 60 GIÂY</button>
  `;

  body.querySelector("#labQzStartBtn").addEventListener("click", () => {
    renderQuestion();
    timerId = setInterval(() => {
      timeLeft -= 1;
      const tEl = body.querySelector("#qzTimeVal");
      const bEl = body.querySelector("#qzBarFill");
      if (tEl) {
        tEl.textContent = `${Math.max(0, timeLeft)}s`;
        if (timeLeft <= 10) tEl.style.color = "#dc2626";
      }
      if (bEl) bEl.style.width = `${Math.max(0, Math.round((timeLeft / 60) * 100))}%`;
      if (timeLeft <= 0) finishRun();
    }, 1000);
  });
}

/**
 * 2. BÁCH KHOA TOÀN THƯ & THƯ VIỆN CHIẾN THUẬT (CODEX)
 */
export async function openCodexModal({ scene, onEcoinUpdated = null } = {}) {
  injectLabStylesOnce();
  document.getElementById("lab-codex-overlay")?.remove();

  const token = getToken(scene);
  const overlay = document.createElement("div");
  overlay.id = "lab-codex-overlay";
  overlay.className = "lab-overlay";
  overlay.innerHTML = `
    <div class="lab-panel" role="dialog" aria-modal="true" aria-label="Bách Khoa Chiến Thuật">
      <div class="lab-header-pill">📖 BÁCH KHOA &amp; SỔ TAY CHIẾN THUẬT</div>
      <button class="lab-close-btn" id="labCodexClose"><img src="assets/ui/shared/close.png" alt="Đóng" /></button>
      <div class="lab-tabs" id="labCodexTabs">
        <button class="lab-tab active" data-ctab="tarots">🃏 10 Thẻ Tarot</button>
        <button class="lab-tab" data-ctab="chars">🧙 7 Nhân Vật</button>
        <button class="lab-tab" data-ctab="rules">🏰 Luật &amp; Tinh Cầu</button>
        <button class="lab-tab" data-ctab="rewards">🏆 Quà Sưu Tập</button>
      </div>
      <div class="lab-body" id="labCodexBody" style="text-align:center;padding:24px;font-weight:800;">Đang tải Bách Khoa Toàn Thư...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaser(scene, overlay);
  overlay.querySelector("#labCodexClose").addEventListener("click", cleanup);

  const body = overlay.querySelector("#labCodexBody");
  let activeSub = "tarots";
  let codexData = null;

  const loadData = async () => {
    const r = await fetch("/api/lab/codex", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(x => x.json()).catch(() => null);
    if (r?.success) codexData = r;
  };

  const renderSub = () => {
    if (!codexData) {
      body.textContent = "Vui lòng đăng nhập để xem Bách Khoa Toàn Thư!";
      return;
    }
    body.style.textAlign = "left";
    const p = codexData.progress;

    if (activeSub === "tarots") {
      body.innerHTML = `
        <div style="font-size:13px;font-weight:800;margin-bottom:10px;color:#5c3104;">
          Tiến độ sưu tập Thẻ Tarot: <b style="color:#15803d">${p.tarots_owned}/${p.tarots_total}</b> • Nâng cấp tại Phù Thủy giúp giảm mạnh hồi chiêu!
        </div>
        <div class="lab-grid-2">
          ${(codexData.tarots || []).map(t => `
            <div class="lab-card ${t.owned ? "owned" : ""}">
              ${t.icon ? `<img src="${esc(t.icon)}" alt="" style="width:48px;height:68px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none'" />` : ""}
              <div style="min-width:0;">
                <div style="font-weight:900;font-size:14px;">${esc(t.name)} <span class="lab-pill ${t.owned ? "ok" : ""}">${t.owned ? "Đã sở hữu" : "Chưa có"}</span></div>
                <div style="font-size:12px;color:#78501c;margin:3px 0;">${esc(t.description)}</div>
                <div style="font-size:11.5px;font-weight:800;">Lv.1: <b>${t.cd_lv1} lượt</b> → <span style="color:#7c3aed">Lv.2: ${t.cd_lv2} lượt</span></div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } else if (activeSub === "chars") {
      body.innerHTML = `
        <div style="font-size:13px;font-weight:800;margin-bottom:10px;color:#5c3104;">
          Tiến độ sưu tập Nhân vật: <b style="color:#15803d">${p.chars_owned}/${p.chars_total}</b>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${(codexData.characters || []).map(c => `
            <div class="lab-card ${c.owned ? "owned" : ""}" style="flex-direction:column;gap:4px;">
              <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                <b style="font-size:15px;">${esc(String(c.name).replace(/_/g, " "))}</b>
                <span class="lab-pill ${c.owned ? "ok" : ""}">${c.owned ? "Đã sở hữu" : `${Number(c.price || 0).toLocaleString("vi-VN")} Ecoin`}</span>
              </div>
              <div style="font-size:12px;color:#6b4820;line-height:1.45;">
                ${c.skills.length ? c.skills.map(sk => `• ${esc(sk)}`).join("<br/>") : "• Kỹ năng đặc trưng theo hệ nhân vật"}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } else if (activeSub === "rules") {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.5;">
          <div class="lab-card" style="flex-direction:column;">
            <b style="font-size:15px;color:#b45309;">🔮 Tinh Cầu Cấp 1 &amp; Cấp 2 (Có Cánh)</b>
            <div>• <b>Tinh cầu Cấp 1:</b> Đặt ngay trên ô đất trống (25K), thu phí 15K/lượt. Đối thủ có thể thâu tóm.</div>
            <div>• <b>Tinh cầu Cấp 2 (Miễn Thâu Tóm):</b> Mở khóa đặt trực tiếp khi <b>qua vòng 1</b> HOẶC <b>sở hữu ≥ 2 ô đất</b> — hoặc nâng cấp khi dừng lại ô Cấp 1 của chính mình!</div>
          </div>
          <div class="lab-card" style="flex-direction:column;">
            <b style="font-size:15px;color:#7c3aed;">🎓 Ô Thầy Giáo (Ô 18) &amp; Quái Vật (Ô 28)</b>
            <div>• <b>Ô 18 (Thầy Giáo):</b> Trả lời đúng câu hỏi Quiz để nhận thưởng tiền mặt và tích điểm Học Giả.</div>
            <div>• <b>Ô 28 (Quái Vật):</b> Gây sát thương tài sản nếu không có khiên hoặc thẻ bài hóa giải.</div>
          </div>
          <div class="lab-card" style="flex-direction:column;">
            <b style="font-size:15px;color:#15803d;">🤖 Hệ Thống Bot AI Tự Tiếp Quản (AFK Protection)</b>
            <div>• Nếu mất kết nối hoặc AFK quá thời gian lượt, Bot AI sẽ tự động tung xúc xắc, xây Tinh cầu thông minh và giữ trận đấu không bị đứt gãy.</div>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div style="font-size:13px;font-weight:800;margin-bottom:10px;color:#5c3104;">
          🎁 Nhận Ecoin thưởng 1 lần khi đạt các mốc sưu tập Tarot &amp; Nhân vật! <span id="codexFb" style="color:#15803d;margin-left:8px;"></span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${(codexData.milestones || []).map(m => `
            <div class="lab-card" style="align-items:center;justify-content:space-between;">
              <div>
                <b style="font-size:14.5px;">${esc(m.label)}</b>
                <div style="font-size:12px;color:#78501c;">Tiến độ: <b>${m.current}/${m.target}</b></div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <b style="color:#b45309;">+${m.reward_ecoin.toLocaleString("vi-VN")} Ecoin</b>
                ${m.claimed
                  ? `<button class="lab-btn" disabled style="background:#cbd5e1;border-color:#94a3b8;color:#475569;box-shadow:none;">✓ Đã nhận</button>`
                  : m.can_claim
                    ? `<button class="lab-btn lab-btn-green codex-claim-btn" data-key="${esc(m.key)}">🎁 Nhận</button>`
                    : `<button class="lab-btn" disabled style="background:#e2e8f0;border-color:#cbd5e1;color:#64748b;box-shadow:none;">🔒 Chưa đủ</button>`}
              </div>
            </div>
          `).join("")}
        </div>
      `;
      body.querySelectorAll(".codex-claim-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const r = await fetch("/api/lab/codex/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reward_key: btn.dataset.key }),
          }).then(x => x.json()).catch(() => null);
          if (r?.success) {
            syncLocalEcoin(r.new_ecoin, onEcoinUpdated);
            await loadData();
            renderSub();
            const fb = body.querySelector("#codexFb");
            if (fb) fb.textContent = r.message;
          } else {
            btn.disabled = false;
          }
        });
      });
    }
  };

  overlay.querySelectorAll(".lab-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      activeSub = tabBtn.dataset.ctab;
      overlay.querySelectorAll(".lab-tab").forEach(b => b.classList.toggle("active", b.dataset.ctab === activeSub));
      renderSub();
    });
  });

  await loadData();
  renderSub();
}

/**
 * 3. NGHIÊN CỨU & CHẾ TẠO BÙA TRỢ CHIẾN (LAB BUFFS — 1 TRẬN)
 */
export async function openLabBuffsModal({ scene, onEcoinUpdated = null } = {}) {
  injectLabStylesOnce();
  document.getElementById("lab-buffs-overlay")?.remove();

  const token = getToken(scene);
  const overlay = document.createElement("div");
  overlay.id = "lab-buffs-overlay";
  overlay.className = "lab-overlay";
  overlay.innerHTML = `
    <div class="lab-panel compact" role="dialog" aria-modal="true" aria-label="Chế Tạo Bùa Trợ Chiến">
      <div class="lab-header-pill">⚗️ CHẾ TẠO BÙA TRỢ CHIẾN (1 TRẬN)</div>
      <button class="lab-close-btn" id="labBuffClose"><img src="assets/ui/shared/close.png" alt="Đóng" /></button>
      <div class="lab-body" id="labBuffBody" style="text-align:center;padding:24px;font-weight:800;">Đang tải kho nguyên liệu &amp; công thức...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cleanup = lockPhaser(scene, overlay);
  overlay.querySelector("#labBuffClose").addEventListener("click", cleanup);

  const body = overlay.querySelector("#labBuffBody");

  const renderBuffs = async (feedbackMsg = "") => {
    const res = await fetch("/api/lab/buffs", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json()).catch(() => null);
    if (!res?.success) {
      body.textContent = res?.message || "Vui lòng đăng nhập để chế tạo Bùa Trợ Chiến!";
      return;
    }
    body.style.textAlign = "left";
    body.innerHTML = `
      <div class="qz-hud" style="font-size:13px;">
        <span>💰 Ecoin: <b style="color:#b45309">${Number(res.ecoin || 0).toLocaleString("vi-VN")}</b></span>
        <span>🎓 Điểm Học Giả: <b style="color:#7c3aed">${res.iq_score} IQ</b></span>
        <span>✨ Bụi May Mắn Tarot: <b style="color:#15803d">${res.tarot_luck_dust}</b></span>
      </div>
      ${feedbackMsg ? `<div style="font-size:12.5px;font-weight:800;color:#15803d;margin-bottom:8px;">${esc(feedbackMsg)}</div>` : ""}
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${(res.buffs || []).map(b => `
          <div class="lab-card" style="align-items:center;justify-content:space-between;border-left:5px solid ${b.color};">
            <div>
              <div style="font-size:15px;font-weight:900;">${b.icon} ${esc(b.name)} <span class="lab-pill ok">Đang có: ${b.charges}</span></div>
              <div style="font-size:12.5px;color:#6b4820;margin-top:2px;">${esc(b.effect)}</div>
              <div style="font-size:11.5px;color:#8c6222;margin-top:2px;">Yêu cầu: Tối thiểu <b>${b.min_iq} IQ</b> • Chi phí: <b>${b.cost_ecoin.toLocaleString("vi-VN")} Ecoin</b></div>
            </div>
            <button class="lab-btn lab-btn-gold lab-craft-btn" data-key="${esc(b.key)}">⚗️ Chế tạo</button>
          </div>
        `).join("")}
      </div>
    `;

    body.querySelectorAll(".lab-craft-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const r = await fetch("/api/lab/buffs/craft", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ buff_key: btn.dataset.key }),
        }).then(x => x.json()).catch(() => null);
        if (r?.success) {
          syncLocalEcoin(r.new_ecoin, onEcoinUpdated);
          renderBuffs(`✅ ${r.message}`);
        } else {
          renderBuffs(`❌ ${r?.message || "Không thể chế tạo bùa!"}`);
        }
      });
    });
  };

  renderBuffs();
}
