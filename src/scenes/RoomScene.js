import { getActiveProfile } from "../server/utils/playerData.js";

export default class RoomScene extends Phaser.Scene {

  constructor() {
    super("RoomScene");
    this.roomData   = null;
    this._slots     = [];
    this._countdownTimer = null;
    this.socket = null;
    this.players = [];       // Array slot, index = slot_index, value = player | null
    this.isHost = false;
    this._allReadyStatus = { all_ready: false, ready_count: 0, total: 0 };
    this._startBtnRef = null; // tham chiếu nút Bắt Đầu để enable/disable
  }

  init(data) {
    console.log("🎮 RoomScene init data:", JSON.stringify(data));
    const raw = data?.roomData || {
      id: 167, bet: 5000000, playing: false, players: 1,
      password: false, match_mode: "solo_4"
    };

    // bet_ecoin (server DB) hoặc bet (đã map từ RoomListScene)
    // Dùng parseInt để tránh BigInt/string gây NaN
    const betRaw = raw.bet ?? raw.bet_ecoin ?? raw.betEcoin ?? 0;
    const betNum = parseInt(String(betRaw), 10);
    const bet    = isNaN(betNum) ? 0 : betNum;

    console.log("💰 bet raw:", betRaw, "→ parsed:", bet);

    this.roomData = {
      ...raw,
      bet,
      id:         raw.id,
      match_mode: raw.match_mode || "solo_4",
      password:   raw.is_private || raw.password || false,
    };

    const mode = this.roomData.match_mode || "solo_4";
    this._matchMode  = mode;
    this._isTeam     = mode === "team_2v2";
    this._maxPlayers = mode === "solo_2" ? 2
                    : mode === "solo_3" ? 3
                    : 4;

    // Khởi tạo mảng slot rỗng
    this.players = Array(this._maxPlayers).fill(null);
  }

  preload() {
    this.load.image("bg_room",       "assets/ui/nen_chung.png");
    this.load.image("map1",          "assets/nen_game_mini.png");
    this.load.image("coin",          "assets/ui/shared/coin.png");
    this.load.image("user_fill",     "assets/ui/shared/user0.png");
    this.load.image("user_empty",    "assets/ui/shared/user1.png");
    this.load.image("back",          "assets/ui/shared/return.png");
    this.load.image("icon_question", "assets/ui/shared/question.png");
    this.load.image("icon_reload",   "assets/ui/shared/reload.png");
    this.load.image("avatar_default","assets/ui/shared/user0.png");
    this.load.image("icon_info",     "assets/ui/shared/info.png");
    this.load.image("icon_setting",  "assets/ui/shared/setting.png");
    this.load.image("versus2",       "assets/ui/shared/versus3.png");

    // Pre-load idle frames của người chơi hiện tại từ localStorage
    const activeProfile = getActiveProfile(this);
    const myCharName = activeProfile.characterName;
    const mySkinId   = activeProfile.skin_id;
    this._myCharName = myCharName;
    this._mySkinId   = mySkinId;

    if (myCharName) {
      const image = myCharName + "_" + mySkinId;
      for (let i = 0; i < 18; i++) {
        const num  = String(i).padStart(3, "0");
        const key  = `${myCharName}_${mySkinId}_idle_${num}`;
        const path = `assets/characters/${myCharName}/${image}/PNG/PNG Sequences/Idle Blinking/0_${myCharName}_Idle Blinking_${num}.png`;
        if (!this.textures.exists(key)) {
          this.load.image(key, path);
        }
      }
    }

    // Pre-load background của mình từ localStorage
    const playerData = this.registry.get("playerData") || JSON.parse(localStorage.getItem("playerData") || "null");
    const myBgId   = playerData?.user?.active_bg_id || playerData?.active_bg_id;
    const myBgs    = playerData?.backgrounds || [];
    if (myBgId) {
      const bgKey  = `bg_${myBgId}`;
      const bgData = myBgs.find(b => Number(b.background_id || b.id) === Number(myBgId));
      const rawBgPath = bgData?.image_path;
      const bgPath = rawBgPath
        ? (rawBgPath.startsWith("assets/") ? rawBgPath : `assets/ui/bg/${rawBgPath}`)
        : null;
      if (bgPath && !this.textures.exists(bgKey)) {
        this.load.image(bgKey, bgPath);
      }
      this._myBgId   = myBgId;
      this._myBgPath = bgPath || null;
    }
  }

  create() {
    const { width, height } = this.scale;

    // PHẢI khởi tạo trước để _rebuildBottomPanel không crash
    this._bottomPanelGroup = [];
    this._slots = [];

    const bg = this.add.image(width / 2, height / 2, "bg_room");
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    this._buildStarfield(width, height);
    this._buildTopBar(width, height);

    if (this._isTeam) {
      this._buildVsBanner(width / 2, height * 0.35);
    }

    // Render slots rỗng ngay để thấy layout
    this._rebuildPlayerSlots();

    this._buildHostStatus(width, height);
    this._buildBottomPanel(width, height);
    this._buildChatLog(width, height);

    // Kết nối socket SAU khi build UI
    this.setupSocket();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SOCKET SETUP
  // ══════════════════════════════════════════════════════════════════════
  setupSocket() {
    const playerData = this.registry.get("playerData")
      || JSON.parse(localStorage.getItem("playerData") || "null");
    const token = playerData?.token || localStorage.getItem("token");

    console.log("🔑 Token found:", !!token, "| Room ID:", this.roomData?.id);

    if (!token) {
      console.error("No token found");
      this._showAlert("Bạn chưa đăng nhập!");
      return;
    }

    this.socket = io("http://localhost:3000", {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    this.socket.on("connect", () => {
      console.log("✅ Socket connected:", this.socket.id);
      console.log("📦 Full roomData:", JSON.stringify(this.roomData));
      const roomId = this.roomData?.id ?? this.roomData?.room_id;
      console.log("📤 room:join room_id:", roomId, "type:", typeof roomId);
      if (!roomId) {
        console.error("❌ room_id undefined!");
        this._showAlert("Lỗi: room_id không xác định!\n" + JSON.stringify(this.roomData));
        return;
      }
      this.socket.emit("room:join", { room_id: roomId });
    });

    this.socket.on("connect_error", (err) => {
      console.error("❌ Socket connect error:", err.message);
      this._showAlert("Không thể kết nối server!\n" + err.message);
    });

    this.socket.on("room:error", (data) => {
      console.error("❌ room:error from server:", data.message);
      this._showAlert(data.message || "Có lỗi xảy ra");
    });

    // ── Nhận danh sách phòng đầy đủ khi mới vào ──────────────────────
    this.socket.on("room:players", (data) => {
      console.log("📥 room:players received:", JSON.stringify(data));
      this.players = Array(this._maxPlayers).fill(null);
      data.players.forEach(p => {
        const slot = p.slot_index ?? 0;
        if (slot < this._maxPlayers) this.players[slot] = p;
      });
      this.isHost = data.players.find(p => p.socket_id === this.socket.id)?.is_host || false;
      console.log("👥 Players:", this.players.map(p => p ? `${p.name}(${p.character_name},skin${p.skin_id},slot${p.slot_index})` : "empty"));
      console.log("👑 isHost:", this.isHost);
      // Preload skin của tất cả players rồi mới rebuild
      this._preloadPlayerSkins(data.players, () => {
        this._rebuildPlayerSlots();
        this._rebuildBottomPanel();
      });
    });

    // ── Người mới vào ────────────────────────────────────────────────
    this.socket.on("room:player_joined", (player) => {
      const slot = player.slot_index ?? this._findFreeSlot();
      if (slot !== -1 && slot < this._maxPlayers) {
        this.players[slot] = player;
      }
      this._preloadPlayerSkins([player], () => {
        this._rebuildPlayerSlots();
      });
      this._showToast(`${player.name} đã vào phòng`);
    });

    // ── Người rời ────────────────────────────────────────────────────
    this.socket.on("room:player_left", (data) => {
      const slot = data.slot_index;
      if (slot !== undefined && slot < this._maxPlayers) {
        this.players[slot] = null;
      } else {
        // fallback: tìm theo socket_id
        const idx = this.players.findIndex(p => p?.socket_id === data.socket_id);
        if (idx !== -1) this.players[idx] = null;
      }
      this._rebuildPlayerSlots();
      this._rebuildBottomPanel();
    });

    // ── Cập nhật trạng thái sẵn sàng ─────────────────────────────────
    this.socket.on("room:player_ready", (data) => {
      const player = this._findPlayerBySocketId(data.socket_id);
      if (player) {
        player.is_ready = data.is_ready;
        this._rebuildPlayerSlots();
        this._rebuildBottomPanel();
      }
    });

    // ── Đổi slot ─────────────────────────────────────────────────────
    this.socket.on("room:slots_swapped", (data) => {
      const { socket_id_a, slot_a, socket_id_b, slot_b } = data;

      const playerA = this._findPlayerBySocketId(socket_id_a);
      const playerB = socket_id_b ? this._findPlayerBySocketId(socket_id_b) : null;

      // Xóa khỏi slot cũ
      if (playerA) {
        const oldIdxA = this.players.findIndex(p => p?.socket_id === socket_id_a);
        if (oldIdxA !== -1) this.players[oldIdxA] = null;
      }
      if (playerB) {
        const oldIdxB = this.players.findIndex(p => p?.socket_id === socket_id_b);
        if (oldIdxB !== -1) this.players[oldIdxB] = null;
      }

      // Đặt vào slot mới
      if (playerA && slot_a < this._maxPlayers) {
        if (playerA) playerA.slot_index = slot_a;
        this.players[slot_a] = playerA;
      }
      if (playerB && slot_b < this._maxPlayers) {
        if (playerB) playerB.slot_index = slot_b;
        this.players[slot_b] = playerB;
      }

      this._rebuildPlayerSlots();
    });

    // ── Yêu cầu đổi chỗ (người nhận thấy popup) ────────────────────
    this.socket.on("room:swap_request", (data) => {
      const { from_socket_id, from_name } = data;

      if (this._swapPromptUi) {
        this.socket.emit("room:swap_response", { from_socket_id, accepted: false });
        return;
      }

      this._showSwapPromptMini(
        `${from_name} muốn đổi chỗ với bạn`,
        () => {
          this.socket.emit("room:swap_response", { from_socket_id, accepted: true });
        },
        () => {
          this.socket.emit("room:swap_response", { from_socket_id, accepted: false });
        }
      );
    });

    // ── Đang chờ xác nhận ────────────────────────────────────────────
    this.socket.on("room:swap_pending", (data) => {
      this._showToast(`Đang chờ ${data.target_name} xác nhận đổi chỗ...`, 3000);
    });

    // ── Bị từ chối ───────────────────────────────────────────────────
    this.socket.on("room:swap_declined", (data) => {
      this._showToast(`${data.by_name} từ chối đổi chỗ.`, 2500);
    });

    // ── Trạng thái tất cả sẵn sàng (chỉ host nhận) ───────────────────
    this.socket.on("room:all_ready_status", (data) => {
      this._allReadyStatus = data;
      this._updateStartButton();
    });

    // ── Phòng bắt đầu đếm ngược ──────────────────────────────────────
    this.socket.on("room:starting", (data) => {
      const { width, height } = this.scale;
      this._triggerStartCountdown(width, height);
    });

    // ── Phòng bị đóng ────────────────────────────────────────────────
    this.socket.on("room:closed", (data) => {
      this._showAlert(data.message || "Phòng đã đóng", () => {
        this.scene.start("RoomListScene");
      });
    });

    // ── Lỗi ─────────────────────────────────────────────────────────
    this.socket.on("room:error", (data) => {
      this._showAlert(data.message || "Có lỗi xảy ra");
    });
  }

  _showSwapPromptMini(message, onAccept, onDecline) {
    this._destroySwapPromptMini();

    const { width } = this.scale;
    const D = 500;
    const w = 300;
    const h = 96;
    const x = width - w - 18;
    const y = 78;

    const ui = [];

    const box = this.add.graphics().setDepth(D);
    box.fillStyle(0x0b1f3a, 0.96);
    box.fillRoundedRect(x, y, w, h, 14);
    box.lineStyle(2, 0x5bc0ff, 0.9);
    box.strokeRoundedRect(x, y, w, h, 14);
    box.fillStyle(0xffffff, 0.08);
    box.fillRoundedRect(x + 6, y + 6, w - 12, 18, 8);
    ui.push(box);

    const txt = this.add.text(x + w / 2, y + 28, message, {
      fontFamily: "Signika",
      fontSize: "15px",
      color: "#ffffff",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: w - 28 }
    }).setOrigin(0.5, 0).setDepth(D + 1);
    ui.push(txt);

    const acceptX = x + 86;
    const declineX = x + 214;
    const btnY = y + 72;

    const makeBtn = (cx, label, c1, c2, cb) => {
      const g = this.add.graphics().setDepth(D + 1);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(cx - 48, btnY - 16, 96, 32, 16);
      g.fillStyle(0xffffff, 0.20);
      g.fillRoundedRect(cx - 42, btnY - 12, 84, 10, 8);
      g.lineStyle(1.5, 0xffffff, 0.35);
      g.strokeRoundedRect(cx - 48, btnY - 16, 96, 32, 16);

      const t = this.add.text(cx, btnY, label, {
        fontFamily: "Signika",
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#001122",
        strokeThickness: 2
      }).setOrigin(0.5).setDepth(D + 2);

      const z = this.add.zone(cx, btnY, 96, 32)
        .setInteractive({ cursor: "pointer" })
        .setDepth(D + 3);

      z.on("pointerdown", () => {
        this._destroySwapPromptMini();
        cb();
      });

      ui.push(g, t, z);
    };

    makeBtn(acceptX, "Đồng ý", 0x18a84a, 0x24d166, onAccept);
    makeBtn(declineX, "Từ chối", 0xc63a4a, 0xef5b6a, onDecline);

    this._swapPromptUi = ui;
  }

  _destroySwapPromptMini() {
    if (!this._swapPromptUi) return;
    this._swapPromptUi.forEach(o => {
      try { o?.destroy(); } catch (e) {}
    });
    this._swapPromptUi = null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _findPlayerBySocketId(socket_id) {
    return this.players.find(p => p?.socket_id === socket_id) || null;
  }

  _findFreeSlot() {
    return this.players.findIndex(p => p === null);
  }

  _getMyPlayer() {
    return this.players.find(p => p?.socket_id === this.socket?.id) || null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRELOAD IDLE ANIMATION CHO TẤT CẢ PLAYERS
  // Đường dẫn: assets/characters/{name}/{image}/PNG/PNG Sequences/Idle/
  // Key frame: {name}_{skin_number}_idle_{000..017}
  // ══════════════════════════════════════════════════════════════════════
  _preloadPlayerSkins(players, onDone) {
    const toLoad = [];

    players.forEach(p => {
      if (!p?.character_name || p.character_name === "Unknown" || !p.skin_id) return;
      const name       = p.character_name;
      const skinNumber = p.skin_id;
      const image      = name + "_" + skinNumber;
      const frameKey0  = `${name}_${skinNumber}_idle_000`;

      if (!this.textures.exists(frameKey0)) {
        for (let i = 0; i < 18; i++) {
          const num  = String(i).padStart(3, "0");
          const key  = `${name}_${skinNumber}_idle_${num}`;
          const path = `assets/characters/${name}/${image}/PNG/PNG Sequences/Idle Blinking/0_${name}_Idle Blinking_${num}.png`;
          toLoad.push({ key, path });
        }
      }

      // Preload background nếu có active_bg_id
      if (p.active_bg_id && p.active_bg_path) {
        const bgKey = `bg_${p.active_bg_id}`;
        if (!this.textures.exists(bgKey)) {
          // Đảm bảo path đầy đủ (DB lưu chỉ tên file)
          const bgPath = p.active_bg_path.startsWith("assets/")
            ? p.active_bg_path
            : `assets/ui/bg/${p.active_bg_path}`;
          toLoad.push({ key: bgKey, path: bgPath });
        }
      }
    });

    // Dedupe theo key trước khi load
    const uniqueLoad = [];
    const seenKeys = new Set();
    toLoad.forEach(item => {
      if (!seenKeys.has(item.key)) { seenKeys.add(item.key); uniqueLoad.push(item); }
    });

    if (uniqueLoad.length === 0) { onDone(); return; }

    const pendingKeys = new Set(uniqueLoad.map(t => t.key));
    const onComplete = (key) => {
      if (!pendingKeys.has(key)) return;
      pendingKeys.delete(key);
      if (pendingKeys.size === 0) {
        this.load.off("filecomplete", onComplete);
        this.load.off("loaderror",    onError);
        onDone();
      }
    };
    const onError = (fileObj) => {
      onComplete(fileObj?.key || fileObj);
    };
    this.load.on("filecomplete", onComplete);
    this.load.on("loaderror",    onError);
    uniqueLoad.forEach(({ key, path }) => this.load.image(key, path));
    this.load.start();
  }

  /** Tạo animation key idle nếu chưa có */
  _ensureIdleAnim(name, skinNumber) {
    const animKey = `${name}_${skinNumber}_idle`;
    if (this.anims.exists(animKey)) return animKey;

    const frames = [];
    for (let i = 0; i < 18; i++) {
      const num = String(i).padStart(3, "0");
      const key = `${name}_${skinNumber}_idle_${num}`;
      if (this.textures.exists(key)) frames.push({ key });
    }
    if (frames.length === 0) return null;

    this.anims.create({
      key:       animKey,
      frames,
      frameRate: 12,
      repeat:    -1,
    });
    return animKey;
  }

  // ══════════════════════════════════════════════════════════════════════
  // REBUILD PLAYER SLOTS
  // ══════════════════════════════════════════════════════════════════════
  _rebuildPlayerSlots() {
    this._slots.forEach(slot => { try { slot?.destroy(); } catch(e){} });
    this._slots = [];

    const { width, height } = this.scale;
    const topY = 100;
    const slotH = Math.floor(height * 0.51);
    const cy   = topY + slotH / 2;

    // Tính slotW sao cho tất cả slot vừa khít trong safe area (padding 24px mỗi bên)
    const safeW  = width - 48;
    const gap    = 14;
    let   slotW;
    let   positions = [];

    if (this._isTeam) {
      const vsW  = 5;
      const gapInTeam = 15; 

      slotW = Math.floor((safeW - vsW - gap * 2 - gapInTeam * 2) / 4);

      // Team trái: slot 0 và slot 1
      // Mép phải team trái = width/2 - vsW/2 - gap
      const teamLeftRight = width / 2 - vsW/2 - gap;
      const left2  = teamLeftRight - slotW/2;                    // slot 1 (gần VS)
      const left1  = teamLeftRight - slotW - gapInTeam - slotW/2; // slot 0 (xa VS)

      // Team phải: slot 2 và slot 3
      // Mép trái team phải = width/2 + vsW/2 + gap
      const teamRightLeft = width / 2 + vsW/2 + gap;
      const right1 = teamRightLeft + slotW/2;                     // slot 2 (gần VS)
      const right2 = teamRightLeft + slotW + gapInTeam + slotW/2; // slot 3 (xa VS)

      positions = [left1, left2, right1, right2];
    } else {
      // solo: LUÔN tính slotW như thể có 4 slots để kích thước nhất quán
      const FIXED_SLOTS = 4;
      const midGap = 15;
      slotW = Math.floor((safeW - midGap - gap * (FIXED_SLOTS - 1)) / FIXED_SLOTS);

      const half = Math.floor(this._maxPlayers / 2); // nhóm trái
      const rem  = this._maxPlayers - half;          // nhóm phải

      const centerX = width / 2;

      // Tổng chiều rộng từng nhóm
      const leftGroupW  = slotW * half + gap * Math.max(half - 1, 0);
      const rightGroupW = slotW * rem  + gap * Math.max(rem  - 1, 0);

      // Căn sao cho tâm của toàn bộ layout = centerX
      // Tổng layout = leftGroupW + midGap + rightGroupW
      const totalLayoutW = leftGroupW + midGap + rightGroupW;
      const layoutStartX = centerX - totalLayoutW / 2;

      // Tâm slot đầu tiên nhóm trái
      const leftGroupStart  = layoutStartX + slotW / 2;
      // Tâm slot đầu tiên nhóm phải
      const rightGroupStart = layoutStartX + leftGroupW + midGap + slotW / 2;

      for (let i = 0; i < half; i++) {
        positions.push(leftGroupStart + i * (slotW + gap));
      }
      for (let i = 0; i < rem; i++) {
        positions.push(rightGroupStart + i * (slotW + gap));
      }
    }

    // // Vẽ đường phân cách mờ ở giữa (solo: dấu gạch, team: không cần vì có VS)
    // if (!this._isTeam) {
    //   const divLine = this.add.graphics();
    //   divLine.lineStyle(1.5, 0xffffff, 0.12);
    //   const lineX = width / 2;
    //   const lineTop    = topY + 10;
    //   const lineBottom = topY + slotH - 10;
    //   // Vẽ dạng dashed
    //   const dashLen = 10, dashGap = 8;
    //   for (let y = lineTop; y < lineBottom; y += dashLen + dashGap) {
    //     divLine.beginPath();
    //     divLine.moveTo(lineX, y);
    //     divLine.lineTo(lineX, Math.min(y + dashLen, lineBottom));
    //     divLine.strokePath();
    //   }
    //   this._slots.push(divLine); // thêm vào slots để destroy khi rebuild
    // }

    for (let i = 0; i < this._maxPlayers; i++) {
      const player = this.players[i];
      this._slots[i] = player
        ? this._buildSlot(positions[i], cy, slotW, slotH, player, i)
        : this._buildEmptySlot(positions[i], cy, slotW, slotH, i);
    }
  }

  // Rebuild phần bottom panel (nút bắt đầu / sẵn sàng)
  _rebuildBottomPanel() {
    if (this._bottomPanelGroup) {
      this._bottomPanelGroup.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._bottomPanelGroup = [];

    const { width, height } = this.scale;
    const panelH = 108;
    const panelY = height - panelH - 8;
    const panelW = width - 16;
    const panelX = 8;
    const midY   = panelY + panelH / 2;

    const myPlayer = this._getMyPlayer();

    if (this.isHost) {
      // Nút Bắt Đầu
      const st         = this._allReadyStatus;
      const minP       = this._isTeam ? 4 : 2;
      const totalNow   = this.players.filter(p => p !== null).length;
      const hasMin     = totalNow >= minP;
      const allReady   = st.total > 0 && st.ready_count === st.total;
      const canStart   = hasMin && allReady;

      // Label nút thay đổi theo trạng thái
      let btnLabel = "Bắt Đầu";
      if (!hasMin) {
        const needed = minP - totalNow;
        btnLabel = this._isTeam
          ? `Cần ${needed} người nữa`
          : `Cần thêm ${needed} người`;
      } else if (!allReady && st.total > 0) {
        btnLabel = `Chờ sẵn sàng (${st.ready_count}/${st.total})`;
      }

      this._buildActionBtn(
        panelX + 160, midY, 220, 54,
        canStart ? 0xff7700 : 0x555566,
        canStart ? 0xffaa00 : 0x777788,
        btnLabel,
        canStart,
        () => {
          if (canStart) this.socket.emit("room:start");
          else if (!hasMin) this._showAlert(this._isTeam ? `Team 2v2 cần đủ 4 người!` : `Cần ít nhất 2 người để bắt đầu!`);
          else this._showAlert("Vẫn còn người chưa sẵn sàng!");
        },
        true // lưu tham chiếu
      );
    } else {
      // Nút Sẵn Sàng / Hủy
      const isReady = myPlayer?.is_ready || false;
      this._buildActionBtn(
        panelX + 160, midY, 200, 54,
        isReady ? 0x22cc55 : 0x1155cc,
        isReady ? 0x55ff88 : 0x3388ff,
        isReady ? "Hủy Sẵn Sàng" : "Sẵn Sàng",
        true,
        () => {
          this.socket.emit("room:ready", { is_ready: !isReady });
        }
      );
    }
  }

  _updateStartButton() {
    // Chỉ rebuild nút khi là host
    if (!this.isHost) return;
    this._rebuildBottomPanel();
  }

  // ══════════════════════════════════════════════════════════════════════
  // BUILD EMPTY SLOT
  // ══════════════════════════════════════════════════════════════════════
  _buildEmptySlot(cx, cy, sw, sh, slotIndex) {
    const container = this.add.container(cx, cy);
    const hw = sw / 2, hh = sh / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.15);
    bg.fillRoundedRect(-hw + 5, -hh + 5, sw, sh, 14);
    bg.fillStyle(0x0a1a33, 0.55);
    bg.fillRoundedRect(-hw, -hh, sw, sh, 14);
    bg.lineStyle(2, 0x2a4a6a, 0.6);
    bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);

    const plusTxt = this.add.text(0, -14, "+", {
      fontFamily: "Signika", fontSize: "52px",
      color: "#1a4a7a", fontStyle: "bold"
    }).setOrigin(0.5);

    const waitTxt = this.add.text(0, 26, "Chờ người chơi...", {
      fontFamily: "Signika", fontSize: "12px",
      color: "#2a5a8a"
    }).setOrigin(0.5);

    container.add([bg, plusTxt, waitTxt]);

    // Click vào slot trống → đổi chỗ (nếu đang ở slot khác)
    container.setSize(sw, sh).setInteractive({ cursor: "pointer" });
    container.on("pointerdown", () => {
      const myPlayer = this._getMyPlayer();
      if (!myPlayer) return;
      if (myPlayer.slot_index === slotIndex) return;
      // Phát sự kiện đổi sang slot trống này
      this.socket.emit("room:swap_slot", { target_slot: slotIndex });
    });
    container.on("pointerover", () => {
      bg.lineStyle(2, 0x44aaff, 0.8);
      bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);
    });
    container.on("pointerout", () => {
      bg.lineStyle(2, 0x2a4a6a, 0.6);
      bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);
    });

    return container;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BUILD FILLED SLOT
  // ══════════════════════════════════════════════════════════════════════
  _buildSlot(cx, cy, sw, sh, player, idx) {
    const container = this.add.container(cx, cy);
    const hw = sw / 2, hh = sh / 2;

    const isMe = player.socket_id === this.socket?.id;

    // ── Slot bg ──────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25);
    bg.fillRoundedRect(-hw + 5, -hh + 5, sw, sh, 14);

    // Màu khác biệt nếu là slot của mình
    if (isMe) {
      bg.fillGradientStyle(0x1a8a5a, 0x1a8a5a, 0x0d5a38, 0x0d5a38, 1);
    } else {
      bg.fillGradientStyle(0x1a5fa8, 0x1a5fa8, 0x0d3a72, 0x0d3a72, 1);
    }
    bg.fillRoundedRect(-hw, -hh, sw, sh, 14);
    bg.lineStyle(2.5, isMe ? 0x44ffaa : 0x4db6ff, 0.9);
    bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);

    // ── Avatar area ───────────────────────────────────────────────────────
    const avatarH  = Math.floor(sh * 0.72);
    const avatarW  = sw - 16;
    const avatarBg = this.add.graphics();
    avatarBg.fillStyle(0x0a2a55, 0.7);
    avatarBg.fillRoundedRect(-hw + 8, -hh + 22, avatarW, avatarH, 10);

    // ── Background image nếu player có active_bg_id ───────────────────
    let bgImgObj = null;
    if (player.active_bg_id) {
      const bgKey = `bg_${player.active_bg_id}`;
      if (this.textures.exists(bgKey)) {
        bgImgObj = this.add.image(0, -hh + 22 + avatarH / 2, bgKey);
        const wRatio = avatarW / bgImgObj.width;
        const hRatio = avatarH / bgImgObj.height;
        bgImgObj.setScale(Math.max(wRatio, hRatio));

        // Mask để không tràn ra ngoài khung
        const maskG = this.make.graphics({ add: false });
        maskG.fillStyle(0xffffff);
        maskG.fillRoundedRect(
          cx - hw + 8, cy - hh + 22, avatarW, avatarH, 10
        );
        bgImgObj.setMask(maskG.createGeometryMask());
      }
    }

    const avatarCY  = -hh + 22 + avatarH / 2;
    const avatarSize = Math.min(avatarW * 0.88, avatarH * 0.88);
    let   avatar;

    const hasChar = player.character_name && player.character_name !== "Unknown" && player.skin_id;

    if (hasChar) {
      const name       = player.character_name;
      const skinNumber = player.skin_id;
      const frame0Key  = `${name}_${skinNumber}_idle_000`;

      if (this.textures.exists(frame0Key)) {
        // Frames đã load → tạo sprite + chạy animation
        const animKey = this._ensureIdleAnim(name, skinNumber);
        avatar = this.add.sprite(0, avatarCY, frame0Key);
        avatar.setDisplaySize(avatarSize, avatarSize).setAlpha(0.95);
        if (animKey) avatar.play(animKey);
      } else {
        // Chưa load → dùng avatar_default tạm
        avatar = this.add.image(0, avatarCY, "avatar_default");
        avatar.setDisplaySize(avatarSize * 0.7, avatarSize * 0.7).setAlpha(0.6);
      }
    } else {
      avatar = this.add.image(0, avatarCY, "avatar_default");
      avatar.setDisplaySize(avatarSize * 0.7, avatarSize * 0.7).setAlpha(0.6);
    }

    // Floating tween (chỉ áp dụng cho image, sprite tự animate)
    if (!hasChar || avatar.type === "Image") {
      this.tweens.add({
        targets: avatar,
        y: avatarCY - 9,
        duration: 1400 + idx * 180,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut"
      });
    }

    // ── Tên nhân vật nhỏ bên dưới avatar ─────────────────────────────────
    const charDisplayName = hasChar
      ? player.character_name.replace(/_/g, " ")
      : "";
    const charLabel = this.add.text(0, -hh + 22 + avatarH + 6, charDisplayName, {
      fontFamily: "Signika", fontSize: "11px",
      color: isMe ? "#aaffcc" : "#88bbff",
      stroke: "#001133", strokeThickness: 2,
    }).setOrigin(0.5);

    // ── VIP badge (tên người chơi) ────────────────────────────────────────
    const vipItems = this._makeVipBadge(-hw, -hh + 2, sw, player.name, isMe);

    // ── Ready / Host badge ────────────────────────────────────────────────
    const readyY   = hh - 34;
    const readyItems = this._makeReadyBadge(0, readyY, sw, player, idx);

    // ── Info "i" ──────────────────────────────────────────────────────────
    const infoIcon = this.add.image(hw - 12, hh - 14, "icon_info")
      .setDisplaySize(45, 45)
      .setInteractive({ cursor: "pointer" });
    infoIcon.on("pointerdown", () => {
      this._showAlert(`Người chơi: ${player.name}\nSocket: ${player.socket_id}`);
    });

    container.add([bg, avatarBg, ...(bgImgObj ? [bgImgObj] : []), avatar, charLabel, ...vipItems, ...readyItems, infoIcon]);

    // ── Hover / click để đổi chỗ ─────────────────────────────────────────
    container.setSize(sw, sh).setInteractive({ cursor: "pointer" });

    container.on("pointerover", () => {
      bg.lineStyle(2.5, 0x88ddff, 1);
      bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);
    });
    container.on("pointerout", () => {
      bg.lineStyle(2.5, isMe ? 0x44ffaa : 0x4db6ff, 0.9);
      bg.strokeRoundedRect(-hw, -hh, sw, sh, 14);
    });
    container.on("pointerdown", () => {
      const myPlayer = this._getMyPlayer();
      if (!myPlayer) return;
      if (myPlayer.slot_index === idx) return; // đang ở slot này rồi
      // Yêu cầu đổi sang slot idx (có người → đổi chỗ; trống → chuyển)
      this.socket.emit("room:swap_slot", { target_slot: idx });
    });

    return container;
  }

  _makeVipBadge(startX, startY, sw, name, isMe = false) {
    const bw = sw - 4, bh = 26;
    const g  = this.add.graphics();
    const shortName = name?.length > 18 ? name.slice(0, 18) + "..." : (name || "...");

    const t = this.add.text(startX + bw / 2 + 2, startY + bh / 1.5, shortName, {
      fontFamily: "Signika",
      fontSize:   "19px",
      color:      isMe ? "#aaffcc" : "#ffffff",
      fontStyle:  "bold",
      stroke:     "#040a2a",
      strokeThickness: 2
    }).setOrigin(0.5);

    return [g, t];
  }

  _makeReadyBadge(x, y, sw, player, idx) {
    const items = [];

    if (player.is_host) {
      const g = this.add.graphics();
      g.fillStyle(0xcc8800, 1);
      g.fillRoundedRect(x - 52, y - 14, 104, 28, 14);
      g.lineStyle(1.5, 0xffcc44, 0.8);
      g.strokeRoundedRect(x - 52, y - 14, 104, 28, 14);
      g.fillStyle(0xffffff, 0.18);
      g.fillRoundedRect(x - 46, y - 10, 92, 10, 6);
      const t = this.add.text(x, y, "👑 Chủ phòng", {
        fontFamily: "Signika",
        fontSize:   "13px",
        color:      "#ffffff",
        fontStyle:  "bold",
        stroke:     "#553300",
        strokeThickness: 3
      }).setOrigin(0.5);
      items.push(g, t);

    } else if (player.is_ready) {
      const g = this.add.graphics();
      g.fillStyle(0x22cc55, 1);
      g.fillRoundedRect(x - 48, y - 14, 96, 28, 14);
      g.lineStyle(1.5, 0x88ffaa, 0.8);
      g.strokeRoundedRect(x - 48, y - 14, 96, 28, 14);
      g.fillStyle(0xffffff, 0.2);
      g.fillRoundedRect(x - 42, y - 10, 84, 10, 6);
      const t = this.add.text(x, y, "✓ Sẵn sàng", {
        fontFamily: "Signika",
        fontSize:   "15px",
        color:      "#ffffff",
        fontStyle:  "bold",
        stroke:     "#005522",
        strokeThickness: 3
      }).setOrigin(0.5);
      this.tweens.add({
        targets: g, alpha: { from: 1, to: 0.72 },
        duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        delay: idx * 160
      });
      items.push(g, t);

    } else {
      const g = this.add.graphics();
      g.fillStyle(0x555566, 0.65);
      g.fillRoundedRect(x - 38, y - 13, 76, 26, 13);
      const t = this.add.text(x, y, "Đang chờ", {
        fontFamily: "Signika",
        fontSize:   "13px",
        color:      "#aabbcc",
        fontStyle:  "bold"
      }).setOrigin(0.5);
      items.push(g, t);
    }

    return items;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STARFIELD
  // ══════════════════════════════════════════════════════════════════════
  _buildStarfield(width, height) {
    for (let i = 0; i < 30; i++) {
      const x  = Phaser.Math.Between(0, width);
      const y  = Phaser.Math.Between(0, height * 0.7);
      const sz = Phaser.Math.FloatBetween(1, 3);
      const g  = this.add.graphics();
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.3, 0.8));
      g.fillCircle(x, y, sz);
      this.tweens.add({
        targets: g, alpha: { from: g.alpha, to: 0.05 },
        duration: Phaser.Math.Between(800, 2000),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 1600),
        ease: "Sine.easeInOut"
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // TOP BAR
  // ══════════════════════════════════════════════════════════════════════
  _buildTopBar(width, height) {
    const rd = this.roomData;

    const backBtn = this.add.image(48, 48, "back").setScale(1).setInteractive({ cursor: "pointer" });
    backBtn.on("pointerdown", () => {
      this.tweens.add({ targets: backBtn, scale: 0.6, duration: 80, yoyo: true });
      this.time.delayedCall(160, () => {
        if (this.isHost) {
          this._showConfirm(
            "Bạn là chủ phòng.\nRời phòng sẽ XÓA phòng này.\nBạn có chắc chắn muốn rời?",
            () => {
              this.socket?.emit("room:leave");
              this.time.delayedCall(300, () => this.scene.start("RoomListScene"));
            }
          );
        } else {
          this._showConfirm("Bạn có muốn rời phòng không?", () => {
            this.socket?.emit("room:leave");
            this.time.delayedCall(300, () => this.scene.start("RoomListScene"));
          });
        }
      });
    });

    const titleStr = `PHÒNG ${rd.password || rd.is_private ? "NỘI BỘ" : "TỰ DO"} #${rd.id}`;
    this.add.text(105, 55, titleStr, {
      fontFamily: "Signika",
      fontSize:   "30px",
      color:      "#ffffff",
      fontStyle:  "bold",
      stroke:     "#003388",
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
    }).setOrigin(0, 0.5);

    const gearIcon = this.add.image(width - 48, 48, "icon_setting")
      .setDisplaySize(60, 60)
      .setInteractive({ cursor: "pointer" });
    gearIcon.on("pointerdown", () => {
      this.tweens.add({ targets: gearIcon, angle: 90, duration: 200, yoyo: true });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // VS BADGE
  // ══════════════════════════════════════════════════════════════════════
  _buildVsBanner(cx, cy) {
    if (!this._isTeam) return;
    this.add.image(cx, cy - 110, "versus2").setOrigin(0.5).setDisplaySize(150, 150).setDepth(2);
  }

  // ══════════════════════════════════════════════════════════════════════
  // HOST STATUS / COUNTDOWN (phía trên bottom panel)
  // ══════════════════════════════════════════════════════════════════════
  _buildHostStatus(width, height) {
    const cx = width / 2;
    const cy = height - 175;

    const minP     = this._isTeam ? 4 : 2;
    const statusMsg = this._isTeam
      ? "Team 2v2: cần đủ 4 người và tất cả sẵn sàng"
      : `Solo: cần ít nhất ${minP} người và tất cả sẵn sàng`;

    this._hostStatusText = this.add.text(cx, cy, statusMsg, {
        fontFamily: "Signika",
        fontSize:   "14px",
        color:      "#cce8ff",
        fontStyle:  "bold",
        stroke:     "#002266",
        strokeThickness: 3,
        align:      "center"
      }).setOrigin(0.5);
  }

  // ══════════════════════════════════════════════════════════════════════
  // BOTTOM PANEL
  // ══════════════════════════════════════════════════════════════════════
  _buildBottomPanel(width, height) {
    const panelH = 108;
    const panelY = height - panelH - 8;
    const panelW = width - 16;
    const panelX = 8;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(panelX + 4, panelY + 4, panelW, panelH, 16);
    g.fillGradientStyle(0x1a4a8a, 0x1a4a8a, 0x0d2a55, 0x0d2a55, 1);
    g.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    g.lineStyle(2.5, 0x4db6ff, 0.7);
    g.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(panelX + 6, panelY + 4, panelW - 12, 16, 8);

    const midY = panelY + panelH / 2;

    // Map thumbnail
    const mapW = 132, mapH = 82;
    const mapX = panelX + panelW - mapW - 14;
    const mapY = panelY + (panelH - mapH) / 2;
    const mapBg = this.add.graphics();
    mapBg.fillStyle(0x0a1a33, 1);
    mapBg.fillRoundedRect(mapX, mapY, mapW, mapH, 10);
    mapBg.lineStyle(2, 0x4db6ff, 0.6);
    mapBg.strokeRoundedRect(mapX, mapY, mapW, mapH, 10);
    const mapImg = this.add.image(mapX + mapW / 2, mapY + mapH / 2, "map1");
    if (mapImg.width > 0) mapImg.setScale(Math.min(mapW / mapImg.width, mapH / mapImg.height));
    const mapLabelBg = this.add.graphics();
    mapLabelBg.fillStyle(0x000000, 0.55);
    mapLabelBg.fillRoundedRect(mapX, mapY + mapH - 24, mapW, 24, { bl: 8, br: 8 });
    this.add.text(mapX + mapW / 2, mapY + mapH - 12, "Bản đồ", {
      fontFamily: "Signika", fontSize: "12px", color: "#99ccff", fontStyle: "bold"
    }).setOrigin(0.5);

    // Bet
    const betX  = mapX - 80;
    const rd    = this.roomData;
    const betAmt = Number(rd.bet ?? rd.bet_ecoin ?? 0);
    const betStr = betAmt >= 1000000
      ? (betAmt / 1000000).toFixed(betAmt % 1000000 === 0 ? 0 : 1) + "M"
      : betAmt >= 1000
      ? (betAmt / 1000) + "K"
      : betAmt + "";
    this.add.image(betX - 20, midY + 8, "coin").setDisplaySize(30, 30);
    this.add.text(betX + 6, midY + 8, betStr, {
      fontFamily: "Signika",
      fontSize:   "24px",
      color:      "#ffd700",
      fontStyle:  "bold",
      stroke:     "#553300",
      strokeThickness: 3
    }).setOrigin(0, 0.5);

    this._buildCircleIconBtn(width - 118, midY, "icon_reload", () => {
      if (this.socket) this.socket.emit("room:join", { room_id: this.roomData.id });
    });
    this._buildCircleIconBtn(width - 58, midY, "icon_question", () => {
      this._showAlert("Phòng #" + this.roomData.id + "\nChế độ: " + this._matchMode);
    });

    // Nút động (sẵn sàng / bắt đầu) → sẽ được rebuild sau khi socket kết nối
    this._bottomPanelMidY = midY;
    this._bottomPanelX    = panelX;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ACTION BUTTON (dùng cho cả Bắt Đầu & Sẵn Sàng)
  // ══════════════════════════════════════════════════════════════════════
  _buildActionBtn(bx, by, bw, bh, c1, c2, label, enabled, cb) {
    const br = bh / 2;
    const g  = this.add.graphics();
    const alpha = enabled ? 1 : 0.5;

    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(c1, 0.22);
      g.fillRoundedRect(bx - bw/2 - 7, by - bh/2 - 7, bw + 14, bh + 14, br + 5);
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(bx - bw/2 + 4, by - bh/2 + 6, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.32 : 0.20);
      g.fillRoundedRect(bx - bw/2 + 8, by - bh/2 + 5, bw - 16, bh / 3, br - 4);
      g.lineStyle(2, 0xffffff, 0.45);
      g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
    };
    draw(false);
    g.setAlpha(alpha);

    const txt = this.add.text(bx, by, label, {
      fontFamily: "Signika",
      fontSize:   Math.round(bh * 0.42) + "px",
      color:      "#ffffff",
      fontStyle:  "bold",
      stroke:     "#000000",
      strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true }
    }).setOrigin(0.5).setAlpha(alpha);

    if (enabled) {
      this.tweens.add({
        targets: g, alpha: { from: 1, to: 0.82 },
        duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
      });
    }

    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: enabled ? "pointer" : "default" });
    if (enabled) {
      zone.on("pointerover",  () => { draw(true);  this.tweens.add({ targets: [g, txt], scaleX: 1.05, scaleY: 1.05, duration: 100 }); });
      zone.on("pointerout",   () => { draw(false); this.tweens.add({ targets: [g, txt], scaleX: 1,    scaleY: 1,    duration: 100 }); });
      zone.on("pointerdown",  () => {
        this.tweens.add({ targets: [g, txt], scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
        cb();
      });
    }

    if (this._bottomPanelGroup) {
      this._bottomPanelGroup.push(g, txt, zone);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CHAT LOG
  // ══════════════════════════════════════════════════════════════════════
  _buildChatLog(width, height) {
    const lines = [
      { name: "Hệ thống", msg: "Chào mừng bạn vào phòng chờ!" },
      { name: "Hệ thống", msg: "Nhấn Sẵn Sàng khi bạn đã chuẩn bị." },
    ];
    const logX = 18;
    const logY = height - 185;
    const lineH = 22;
    lines.forEach((line, i) => {
      const y    = logY + i * lineH;
      const full = `[${line.name}] ${line.msg}`;
      this.add.text(logX + 1, y + 1, full, {
        fontFamily: "Signika", fontSize: "13px", color: "#000000"
      }).setAlpha(0.45);
      this.add.text(logX, y, full, {
        fontFamily: "Signika",
        fontSize:   "13px",
        color:      "#cce8ff",
        stroke:     "#001133",
        strokeThickness: 2
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // START COUNTDOWN OVERLAY
  // ══════════════════════════════════════════════════════════════════════
  _triggerStartCountdown(width, height) {
    this._hostStatusText?.destroy();
    this._countdownTimer?.destroy();

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, width, height);

    let n = 3;
    const cTxt = this.add.text(width / 2, height / 2, String(n), {
      fontFamily: "Signika",
      fontSize:   "130px",
      color:      "#ffd700",
      fontStyle:  "bold",
      stroke:     "#553300",
      strokeThickness: 8,
      shadow: { offsetX: 4, offsetY: 5, color: "#220000", blur: 8, fill: true }
    }).setOrigin(0.5);

    const tick = () => {
      this.tweens.add({ targets: cTxt, scaleX: 1.4, scaleY: 1.4, duration: 250, yoyo: true });
      n--;
      this.time.delayedCall(1000, () => {
        if (n > 0) {
          cTxt.setText(String(n));
          tick();
        } else {
          cTxt.setText("BẮT ĐẦU!");
          cTxt.setStyle({ color: "#00ff88", stroke: "#005522" });
          this.tweens.add({ targets: cTxt, scaleX: 1.5, scaleY: 1.5, duration: 300, yoyo: true });
          this.time.delayedCall(700, () => {
            // Lưu socket vào registry để BoardScene tái sử dụng
            // Xóa current_room_id để handleLeaveRoom không chạy khi disconnect
            if (this.socket) {
              this.socket.current_room_id = null; // ngăn handleLeaveRoom xóa phòng
              this.registry.set("gameSocket", this.socket);
            }
            this.scene.start("BoardScene", { roomData: this.roomData });
          });
        }
      });
    };
    tick();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _buildPillBtn(bx, by, bw, bh, c1, c2, label, cb) {
    const br = bh / 2;
    const g  = this.add.graphics();
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(c1, 0.22);
      g.fillRoundedRect(bx - bw/2 - 7, by - bh/2 - 7, bw + 14, bh + 14, br + 5);
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(bx - bw/2 + 4, by - bh/2 + 6, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.32 : 0.20);
      g.fillRoundedRect(bx - bw/2 + 8, by - bh/2 + 5, bw - 16, bh / 3, br - 4);
      g.lineStyle(2, 0xffffff, 0.45);
      g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
    };
    draw(false);
    const txt = this.add.text(bx, by, label, {
      fontFamily: "Signika",
      fontSize:   Math.round(bh * 0.42) + "px",
      color:      "#ffffff",
      fontStyle:  "bold",
      stroke:     "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: g, alpha: { from: 1, to: 0.82 },
      duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });
    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" });
    zone.on("pointerover",  () => { draw(true);  this.tweens.add({ targets: [g, txt], scaleX: 1.05, scaleY: 1.05, duration: 100 }); });
    zone.on("pointerout",   () => { draw(false); this.tweens.add({ targets: [g, txt], scaleX: 1,    scaleY: 1,    duration: 100 }); });
    zone.on("pointerdown",  () => {
      this.tweens.add({ targets: [g, txt], scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
      cb();
    });
  }

  _buildCircleIconBtn(bx, by, iconKey, cb) {
    const icon = this.add.image(bx, by, iconKey).setInteractive({ cursor: "pointer" });
    icon.on("pointerover",  () => this.tweens.add({ targets: icon, scale: 1.08, duration: 100 }));
    icon.on("pointerout",   () => this.tweens.add({ targets: icon, scale: 1,    duration: 100 }));
    icon.on("pointerdown",  () => {
      this.tweens.add({ targets: icon, scale: 0.88, duration: 80, yoyo: true });
      cb();
    });
  }

  // ── Toast notification ────────────────────────────────────────────────
  _showToast(message, duration = 2200) {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height - 160, message, {
      fontFamily: "Signika", fontSize: "15px",
      color: "#ffffff",
      backgroundColor: "#00000099",
      padding: { x: 18, y: 10 },
      stroke: "#002244",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(300).setAlpha(0);
    this.tweens.add({
      targets: toast, alpha: 1, y: height - 170,
      duration: 200,
      onComplete: () => {
        this.time.delayedCall(duration, () => {
          this.tweens.add({ targets: toast, alpha: 0, duration: 300,
            onComplete: () => toast.destroy() });
        });
      }
    });
  }

  // ── Alert modal ────────────────────────────────────────────────────────
  _showAlert(message, onOk = null) {
    const { width, height } = this.scale;
    const D = 200;
    const bw = 360, bh = 160;
    const bx = width / 2 - bw / 2, by = height / 2 - bh / 2;
    const allObjs = [];
    const dismiss = () => {
      allObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      if (onOk) onOk();
    };

    const dim = this.add.graphics().setDepth(D);
    dim.fillStyle(0x000000, 0.55);
    dim.fillRect(0, 0, width, height);
    allObjs.push(dim);

    const box = this.add.graphics().setDepth(D + 1);
    box.fillStyle(0x000000, 0.25);
    box.fillRoundedRect(bx + 4, by + 6, bw, bh, 16);
    box.fillGradientStyle(0xfff9e8, 0xfff9e8, 0xf2e098, 0xf2e098, 1);
    box.fillRoundedRect(bx, by, bw, bh, 16);
    box.lineStyle(3, 0x8b5e1a, 1);
    box.strokeRoundedRect(bx, by, bw, bh, 16);
    allObjs.push(box);

    const txt = this.add.text(width / 2, by + 55, message, {
      fontFamily: "Signika", fontSize: "16px", color: "#5a2d00",
      fontStyle: "bold", align: "center", lineSpacing: 6,
      wordWrap: { width: bw - 40 }
    }).setOrigin(0.5).setDepth(D + 2);
    allObjs.push(txt);

    const okG = this.add.graphics().setDepth(D + 2);
    const okX = width / 2, okY = by + bh - 28;
    const okW = 110, okH = 38;
    okG.fillGradientStyle(0xff6600, 0xff6600, 0xff9900, 0xff9900, 1);
    okG.fillRoundedRect(okX - okW/2, okY - okH/2, okW, okH, okH/2);
    okG.fillStyle(0xffffff, 0.25);
    okG.fillRoundedRect(okX - okW/2 + 6, okY - okH/2 + 5, okW - 12, okH * 0.36, okH/2 - 3);
    allObjs.push(okG);

    const okTxt = this.add.text(okX, okY, "OK", {
      fontFamily: "Signika", fontSize: "18px", color: "#ffffff",
      fontStyle: "bold", stroke: "#662200", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    allObjs.push(okTxt);

    const okZone = this.add.zone(okX, okY, okW, okH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
    okZone.on("pointerdown", dismiss);
    allObjs.push(okZone);
  }

  // ── Confirm modal ─────────────────────────────────────────────────────
  _showConfirm(message, onConfirm, onCancel = null) {
    const { width, height } = this.scale;
    const D = 200;
    const bw = 380, bh = 170;
    const bx = width / 2 - bw / 2, by = height / 2 - bh / 2;
    const allObjs = [];
    const dismiss = () => allObjs.forEach(o => { try { o?.destroy(); } catch(e){} });

    const dim = this.add.graphics().setDepth(D);
    dim.fillStyle(0x000000, 0.58);
    dim.fillRect(0, 0, width, height);
    allObjs.push(dim);

    const box = this.add.graphics().setDepth(D + 1);
    box.fillStyle(0x000000, 0.25);
    box.fillRoundedRect(bx + 4, by + 6, bw, bh, 16);
    box.fillGradientStyle(0xfff9e8, 0xfff9e8, 0xf2e098, 0xf2e098, 1);
    box.fillRoundedRect(bx, by, bw, bh, 16);
    box.lineStyle(3, 0x8b5e1a, 1);
    box.strokeRoundedRect(bx, by, bw, bh, 16);
    allObjs.push(box);

    const txt = this.add.text(width / 2, by + 58, message, {
      fontFamily: "Signika", fontSize: "15px", color: "#5a2d00",
      fontStyle: "bold", align: "center", lineSpacing: 5,
      wordWrap: { width: bw - 40 }
    }).setOrigin(0.5).setDepth(D + 2);
    allObjs.push(txt);

    // Nút Có (đỏ)
    const btnY = by + bh - 30;
    const yesG = this.add.graphics().setDepth(D + 2);
    yesG.fillGradientStyle(0xcc1133, 0xcc1133, 0xff3355, 0xff3355, 1);
    yesG.fillRoundedRect(width/2 - 130, btnY - 18, 110, 36, 18);
    yesG.fillStyle(0xffffff, 0.22);
    yesG.fillRoundedRect(width/2 - 124, btnY - 14, 98, 14, 10);
    allObjs.push(yesG);

    const yesTxt = this.add.text(width/2 - 75, btnY, "Xác nhận", {
      fontFamily: "Signika", fontSize: "16px", color: "#ffffff",
      fontStyle: "bold", stroke: "#550011", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    allObjs.push(yesTxt);

    const yesZone = this.add.zone(width/2 - 75, btnY, 110, 36)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
    yesZone.on("pointerdown", () => { dismiss(); onConfirm(); });
    allObjs.push(yesZone);

    // Nút Không (xanh)
    const noG = this.add.graphics().setDepth(D + 2);
    noG.fillGradientStyle(0x1155cc, 0x1155cc, 0x3377ff, 0x3377ff, 1);
    noG.fillRoundedRect(width/2 + 20, btnY - 18, 110, 36, 18);
    noG.fillStyle(0xffffff, 0.22);
    noG.fillRoundedRect(width/2 + 26, btnY - 14, 98, 14, 10);
    allObjs.push(noG);

    const noTxt = this.add.text(width/2 + 75, btnY, "Hủy", {
      fontFamily: "Signika", fontSize: "16px", color: "#ffffff",
      fontStyle: "bold", stroke: "#002266", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    allObjs.push(noTxt);

    const noZone = this.add.zone(width/2 + 75, btnY, 110, 36)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
    noZone.on("pointerdown", () => { dismiss(); if (onCancel) onCancel(); });
    allObjs.push(noZone);
  }
}