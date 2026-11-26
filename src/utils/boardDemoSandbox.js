/**
 * boardDemoSandbox.js — Chế độ Demo / UI Sandbox cho BoardScene (?demo=board)
 * Cho phép mở thẳng bàn cờ 1-click không cần chờ người chơi thứ 2 để xem & test
 * nhanh mọi giao diện và hiệu ứng trong trận (Đặt Tinh Cầu, Tarot, Chat, Emoji, Thời tiết...).
 */

export function createDemoMockSocket() {
  const listeners = new Map();
  const mock = {
    id: "demo_sock_p1",
    connected: true,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return mock;
    },
    once(event, fn) {
      const wrap = (...args) => {
        mock.off(event, wrap);
        fn(...args);
      };
      return mock.on(event, wrap);
    },
    off(event, fn) {
      if (!fn) listeners.delete(event);
      else listeners.get(event)?.delete(fn);
      return mock;
    },
    emit(event, payload) {
      // Phản hồi giả lập cho nút đóng / mua trong Demo
      if (event === "game:build_response" && payload?.accept) {
        const lv = Number(payload.level || 1);
        mock._trigger("game:cell_built", {
          mode: "build",
          is_upgrade: false,
          is_buyout: false,
          cell_index: payload.cell_index,
          owner_user_id: 1,
          owner_name: "Đức Phạm",
          planet_color: "orange",
          build_cost: lv === 2 ? 45000 : 25000,
          total_invested: lv === 2 ? 45000 : 25000,
          level: lv,
        });
      }
      return mock;
    },
    connect() { return mock; },
    disconnect() { return mock; },
    _trigger(event, ...args) {
      const set = listeners.get(event);
      if (!set) return;
      [...set].forEach(fn => {
        try { fn(...args); } catch (err) { console.error(`[DEMO] listener ${event} error:`, err); }
      });
    },
  };
  return mock;
}

export function mountBoardDemoSandbox(scene, mockSocket) {
  const myUid = Number(scene._myUserId?.() || 1);
  const myName = scene.playerName || "Đức Phạm";

  const demoPlayers = [
    {
      socket_id: "demo_sock_p1",
      user_id: myUid,
      name: myName,
      active_avatar_id: 1,
      turn_order: 1,
      planet_color: "orange",
      cash: 100000,
      index: 0,
      laps: 0,
      slot_index: 0,
      team_id: null,
      characterName: scene.characterName || "Dark_Oracle",
      skin: scene.mySkin || 1,
      active_tarot_ids: [1, 2],
      tarot_cards: [
        { id: 1, name: "Công An", description: "Khiến đối thủ mất lượt kế tiếp", cooldown_seconds: 6 },
        { id: 2, name: "Xúc Xắc Ma Thuật", description: "Chọn số điểm xúc xắc mong muốn", cooldown_seconds: 5 },
      ],
      tarot_runtime: { 1: { cooldown_turns_left: 0 }, 2: { cooldown_turns_left: 0 } },
      used_tarot_this_turn: false,
      energy: 65,
      is_connected: true,
    },
    {
      socket_id: "demo_sock_p2",
      user_id: 9992,
      name: "Vinh Tato",
      active_avatar_id: 8,
      turn_order: 2,
      planet_color: "blue",
      cash: 85000,
      index: 7,
      laps: 0,
      slot_index: 1,
      team_id: null,
      characterName: "Dark_Oracle",
      skin: 2,
      active_tarot_ids: [3, 4],
      tarot_cards: [
        { id: 3, name: "Giải Tỏa", description: "Phá hủy 1 tinh cầu của đối thủ", cooldown_seconds: 6 },
        { id: 4, name: "Hoán Đổi", description: "Hoán đổi tinh cầu với đối thủ", cooldown_seconds: 6 },
      ],
      tarot_runtime: { 3: { cooldown_turns_left: 0 }, 4: { cooldown_turns_left: 0 } },
      used_tarot_this_turn: false,
      energy: 40,
      is_connected: true,
    },
  ];

  // Khởi tạo bàn cờ ngay sau khi BoardScene gắn xong listener
  setTimeout(() => {
    mockSocket._trigger("game:init", {
      room_id: "demo_room",
      match_mode: "solo_2",
      bet_ecoin: 5000,
      build_cost: 25000,
      turn_number: 1,
      current_turn_socket_id: "demo_sock_p1",
      current_turn_user_id: myUid,
      server_now_ms: Date.now(),
      players: demoPlayers,
      cellStates: {
        7: { owner_user_id: 9992, planet_color: "blue", build_cost: 25000, total_invested: 25000, level: 1 },
      },
    });
    scene._hideLoadingScreen?.();
    scene.isMyTurn = true;
    scene.canRoll = true;
  }, 350);

  // ── Thanh công cụ nổi UI Sandbox (chỉ hiện khi mở ?demo=board) ──
  const existing = document.getElementById("board-demo-toolbar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "board-demo-toolbar";
  bar.style.cssText = [
    "position: fixed",
    "top: 8px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 99999",
    "display: flex",
    "flex-wrap: wrap",
    "align-items: center",
    "gap: 6px",
    "padding: 6px 10px",
    "background: rgba(8, 16, 30, 0.88)",
    "border: 1.5px solid rgba(56, 189, 248, 0.7)",
    "border-radius: 12px",
    "box-shadow: 0 8px 24px rgba(0,0,0,0.45)",
    "font-family: 'Signika', 'Segoe UI', sans-serif",
    "font-size: 12px",
    "color: #f8fafc",
    "max-width: 96vw",
  ].join(";");

  const btnStyle = [
    "padding: 4px 9px",
    "border-radius: 8px",
    "border: 1px solid rgba(148, 163, 184, 0.45)",
    "background: rgba(30, 41, 59, 0.92)",
    "color: #f8fafc",
    "font-family: inherit",
    "font-size: 12px",
    "font-weight: 700",
    "cursor: pointer",
    "white-space: nowrap",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "🧪 UI SANDBOX:";
  label.style.cssText = "color:#38bdf8;font-weight:800;margin-right:2px";
  bar.appendChild(label);

  const actions = [
    {
      text: "🏗️ Đặt Tinh Cầu (Khóa Lv2)",
      run: () => scene._showBuildPanel({
        mode: "build", cell_index: 5, build_cost: 25000, lv1_cost: 25000, lv2_cost: 45000,
        lv1_rent: 15000, lv2_rent: 35000, lv2_unlocked: false, lv2_unlock_reason: "Qua vòng 1 hoặc sở hữu 2 ô",
        player_cash: 100000, planet_color: "orange", current_level: 0, target_level: 1, can_afford: true, time_limit: 30,
      }),
    },
    {
      text: "🪽 Đặt Tinh Cầu (Mở Lv2)",
      run: () => scene._showBuildPanel({
        mode: "build", cell_index: 5, build_cost: 25000, lv1_cost: 25000, lv2_cost: 45000,
        lv1_rent: 15000, lv2_rent: 35000, lv2_unlocked: true,
        player_cash: 100000, planet_color: "orange", current_level: 0, target_level: 1, can_afford: true, time_limit: 30,
      }),
    },
    {
      text: "⬆️ Nâng Cấp Lv2",
      run: () => scene._showBuildPanel({
        mode: "upgrade", cell_index: 5, build_cost: 20000, lv1_cost: 25000, lv2_cost: 20000,
        lv1_rent: 15000, lv2_rent: 35000, lv2_unlocked: true,
        player_cash: 100000, planet_color: "orange", current_level: 1, target_level: 2, can_afford: true, time_limit: 30,
      }),
    },
    {
      text: "🃏 Chọn Tarot",
      run: () => {
        scene.isMyTurn = true;
        scene.canRoll = true;
        scene.tarotModal?.open?.();
      },
    },
    {
      text: "💬 Chat HUD",
      run: () => scene._showBoardHudChatBubble?.(myUid, "Xin chào! Test khung chat trong trận 🎉"),
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
      text: "🏠 Về Game Thật",
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
    bar.appendChild(btn);
  });

  document.body.appendChild(bar);
  scene.events.once("shutdown", () => bar.remove());
}
