/**
 * boardDemoSandbox.js — Thanh công cụ UI Sandbox & Test AFK Bot AI (?demo=board)
 * Chạy trên trận 1v1 THẬT với đối thủ Bot AI từ server (có thể bật/tắt AFK Bot cho chính mình).
 */

export function mountBoardDemoSandbox(scene) {
  const existing = document.getElementById("board-demo-toolbar");
  if (existing) existing.remove();

  const myUid = Number(scene._myUserId?.() || 1);

  const bar = document.createElement("div");
  bar.id = "board-demo-toolbar";
  bar.style.cssText = [
    "position: fixed",
    "top: 6px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 99999",
    "display: flex",
    "flex-wrap: wrap",
    "align-items: center",
    "gap: 5px",
    "padding: 5px 9px",
    "background: rgba(8, 16, 30, 0.88)",
    "border: 1.5px solid rgba(56, 189, 248, 0.7)",
    "border-radius: 10px",
    "box-shadow: 0 6px 20px rgba(0,0,0,0.45)",
    "font-family: 'Signika', 'Segoe UI', sans-serif",
    "font-size: 12px",
    "color: #f8fafc",
    "max-width: 96vw",
  ].join(";");

  const btnStyle = [
    "padding: 4px 8px",
    "border-radius: 7px",
    "border: 1px solid rgba(148, 163, 184, 0.45)",
    "background: rgba(30, 41, 59, 0.92)",
    "color: #f8fafc",
    "font-family: inherit",
    "font-size: 11.5px",
    "font-weight: 700",
    "cursor: pointer",
    "white-space: nowrap",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "🧪 DEMO 1v1 BOT:";
  label.style.cssText = "color:#38bdf8;font-weight:800;margin-right:2px";
  bar.appendChild(label);

  let selfBotOn = false;
  let afkBtn = null;

  const actions = [
    {
      text: "🤖 Bật AFK Bot (Mình): TẮT",
      onMount: (b) => { afkBtn = b; },
      run: async () => {
        try {
          const res = await fetch("/api/demo/toggle-afk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: scene.gameRoomId, user_id: myUid }),
          });
          const j = await res.json();
          if (j.success) {
            selfBotOn = Boolean(j.is_bot_controlled);
            if (afkBtn) {
              afkBtn.textContent = selfBotOn ? "🤖 AFK Bot (Mình): ĐANG CHƠI" : "🤖 Bật AFK Bot (Mình): TẮT";
              afkBtn.style.background = selfBotOn ? "rgba(22, 163, 74, 0.9)" : "rgba(30, 41, 59, 0.92)";
            }
            scene._showToast?.(
              selfBotOn ? "🤖 Máy đã tiếp quản AFK — đang tự chơi thay bạn!" : "👤 Bạn đã lấy lại quyền điều khiển!",
              selfBotOn ? "#4ade80" : "#38bdf8",
              1800
            );
          }
        } catch {}
      },
    },
    {
      text: "🏗️ Xem Đặt Tinh Cầu (Khóa Lv2)",
      run: () => scene._showBuildPanel({
        mode: "build", cell_index: 5, build_cost: 25000, lv1_cost: 25000, lv2_cost: 45000,
        lv1_rent: 15000, lv2_rent: 35000, lv2_unlocked: false, lv2_unlock_reason: "Qua vòng 1 hoặc sở hữu 2 ô",
        player_cash: 100000, planet_color: "orange", current_level: 0, target_level: 1, can_afford: true, time_limit: 30,
      }),
    },
    {
      text: "🪽 Xem Đặt Tinh Cầu (Mở Lv2)",
      run: () => scene._showBuildPanel({
        mode: "build", cell_index: 5, build_cost: 25000, lv1_cost: 25000, lv2_cost: 45000,
        lv1_rent: 15000, lv2_rent: 35000, lv2_unlocked: true,
        player_cash: 100000, planet_color: "orange", current_level: 0, target_level: 1, can_afford: true, time_limit: 30,
      }),
    },
    {
      text: "🃏 Tarot",
      run: () => {
        scene.isMyTurn = true;
        scene.canRoll = true;
        scene.tarotModal?.open?.();
      },
    },
    {
      text: "💬 Chat",
      run: () => scene._showBoardHudChatBubble?.(myUid, "Test khung chat trong trận 🎉"),
    },
    {
      text: "😄 Emoji",
      run: () => scene._showBoardCharacterEmoji?.(myUid, Math.floor(1 + Math.random() * 20)),
    },
    {
      text: "❄️/🌸 Thời Tiết",
      run: () => {
        const order = ["snow", "peach", "both", "none"];
        const cur = window.__snowEffectInstance?.getConfig?.()?.mode || "snow";
        const next = order[(order.indexOf(cur) + 1) % order.length];
        window.__snowEffectInstance?.setConfig?.({ mode: next });
        scene._showToast?.(`Thời tiết: ${next.toUpperCase()}`, "#38bdf8", 1200);
      },
    },
    {
      text: "🏠 Về Game",
      run: () => { window.location.href = "/"; },
    },
  ];

  actions.forEach(a => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = a.text;
    btn.style.cssText = btnStyle;
    btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#38bdf8"; });
    btn.addEventListener("mouseleave", () => { btn.style.borderColor = "rgba(148,163,184,0.45)"; });
    btn.addEventListener("click", a.run);
    a.onMount?.(btn);
    bar.appendChild(btn);
  });

  document.body.appendChild(bar);
  scene.events.once("shutdown", () => bar.remove());
}
