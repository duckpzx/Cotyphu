import { SERVER_URL } from "../config.js";
export default class RoomListScene extends Phaser.Scene {

  constructor() {
    super("RoomListScene");
    this.rooms        = [];
    this.currentTab   = 0;
    this.currentPage  = 0;
    this.roomsPerPage = 9;
    this.tabGraphics  = [];
    this.cardObjects  = [];
    this.pageLabel    = null;
  }

  preload() {
    this.load.image("bg_room",     "assets/ui/nen_chung.png");
    this.load.image("room-card",   "assets/ui/room/card.png");
    this.load.image("map1",        "assets/nen_game_mini.png");
    this.load.image("back",        "assets/ui/shared/return.png");
    this.load.image("coin",        "assets/ui/shared/coin.png");
    this.load.image("user_fill",   "assets/ui/shared/user0.png");
    this.load.image("user_empty",  "assets/ui/shared/user1.png");
    this.load.image("versus",      "assets/ui/shared/versus2.png");
    this.load.image("arrow",       "assets/ui/shared/arrow.png");
    this.load.image("close",       "assets/ui/shared/close.png");
  }

  create() {
    const { width, height } = this.scale;

    // Khởi tạo rỗng, sẽ load từ API
    this.allRooms = [];

    const bg = this.add.image(width / 2, height / 2, "bg_room");
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    this._buildStarfield(width, height);
    this._buildBackBtn(width, height);
    this._buildTitle(width, height);
    this._buildTabs(width, height);
    this._buildMainPanel(width, height);
    this._renderRooms(width, height);
    this._buildPaginationArrows(width, height);
    this._buildBottomButtons(width, height);

    // Load rooms từ server
    const roomTypes = ["pho_thong", "tan_thu", "cao_thu", "bac_thay"];
    this.loadRoomsFromApi(width, height, roomTypes[this.currentTab]).catch(err => {
      console.error("Error loading rooms:", err);
    });
  }

  showAlert(message) {
    const { width, height } = this.scale;
    const container = this.add.container(width / 2, height / 2);
    const bg = this.add.rectangle(0, 0, 320, 150, 0x000000, 0.75)
      .setStrokeStyle(4, 0xffc66d).setOrigin(0.5);
    const text = this.add.text(0, -10, message, {
      fontFamily: "Signika", fontSize: "20px", color: "#fff6d7",
      align: "center", wordWrap: { width: 260 }
    }).setOrigin(0.5);
    const btn = this.add.text(0, 45, "OK", {
      fontFamily: "Signika", fontSize: "22px", color: "#3b1b00",
      backgroundColor: "#ffa63c", padding: { x: 20, y: 8 }
    }).setOrigin(0.5).setInteractive();
    btn.on("pointerdown", () => container.destroy());
    container.add([bg, text, btn]);
    container.setDepth(200);
  }

  async loadRoomsFromApi(width, height, roomType = null) {
    try {
      const url = roomType ? `${SERVER_URL}/rooms?room_type=${roomType}` : `${SERVER_URL}/rooms`;
      const res  = await fetch(url);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (e) {
        console.error("Rooms API không trả JSON:", text);
        this._renderRooms(width, height); return;
      }
      if (!data.success || !Array.isArray(data.rooms)) {
        console.error("Rooms API lỗi:", data);
        this._renderRooms(width, height); return;
      }
      this.allRooms = data.rooms.map(room => ({
        id:          room.id,
        bet:         Number(room.bet_ecoin) || 0,
        playing:     room.room_status === "playing",
        players:     Number(room.current_players) || 0,
        password:    Number(room.is_private) === 1,
        match_mode:  room.match_mode || "solo_4",
        max_players: Number(room.max_players) || (
          room.match_mode === "solo_2"   ? 2 :
          room.match_mode === "solo_3"   ? 3 :
          room.match_mode === "team_2v2" ? 4 : 4
        ),
        room_type:   room.room_type
      }));
      this.currentPage = 0;
      this._renderRooms(width, height);
    } catch (err) {
      console.error("Load rooms error:", err);
      this._renderRooms(width, height);
    }
  }

  _getRoomTypeByBet(bet) {
    const value = Number(bet) || 0;

    if (value === 5000 || value === 20000) {
      return "pho_thong";
    }

    if (value === 50000 || value === 200000) {
      return "tan_thu";
    }

    if (value === 500000 || value === 1000000) {
      return "cao_thu";
    }

    if (value === 5000000) {
      return "bac_thay";
    }

    return "pho_thong";
  }

  async createRoomRequest(roomConfig) {
    const playerData = this.registry.get("playerData")
      || JSON.parse(localStorage.getItem("playerData") || "null");
    if (!playerData?.token) { this.showAlert("Bạn chưa đăng nhập"); return; }

    const betValue = Number(roomConfig.bet) || 0;
    const roomType = this._getRoomTypeByBet(betValue);

    const payload = {
      room_type: roomType,
      match_mode:   roomConfig.mode === 2    ? "solo_2"   :
                    roomConfig.mode === 3    ? "solo_3"   :
                    roomConfig.mode === 4    ? "solo_4"   :
                    roomConfig.mode === "team" ? "team_2v2" : "solo_4",
      bet_ecoin:    Number(roomConfig.bet),
      is_private:   roomConfig.type === "free" ? 0 : 1,
      room_password: roomConfig.password || null,
    };

    try {
      const res  = await fetch(`${SERVER_URL}/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${playerData.token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        this.scene.start("RoomScene", { roomData: data.room });
      } else {
        this.showAlert(data.message || "Tạo phòng thất bại");
      }
    } catch (err) {
      console.error(err);
      this.showAlert("Không thể kết nối server");
    }
  }

  _buildStarfield(width, height) {
    for (let i = 0; i < 28; i++) {
      const x  = Phaser.Math.Between(0, width);
      const y  = Phaser.Math.Between(0, height * 0.65);
      const sz = Phaser.Math.FloatBetween(1, 2.5);
      const g  = this.add.graphics();
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.25, 0.7));
      g.fillCircle(x, y, sz);
      this.tweens.add({ targets: g, alpha: { from: g.alpha, to: 0.04 },
        duration: Phaser.Math.Between(900, 2200), yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 1800), ease: "Sine.easeInOut" });
    }
  }

  _buildBackBtn(width, height) {
    const backBtn = this.add.image(48, 48, "back").setScale(1).setInteractive({ cursor: "pointer" });
    backBtn.on("pointerdown", () => {
      this.tweens.add({ targets: backBtn, scale: 0.6, duration: 80, yoyo: true });
      this.time.delayedCall(160, () => this.scene.start("LobbyScene"));
    });
    this.add.text(105, 55, "ĐẤU TRƯỜNG", {
      fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
      stroke: "#003388", strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
    }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6);
  }

  _buildTitle(width, height) {
    [[230, 28], [310, 20], [350, 35]].forEach(([sx, sy]) => {
      this.add.text(sx, sy, "✦", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.6);
    });
  }

  _buildTabs(width, height) {
    const labels = ["PHỔ THÔNG", "TÂN THỦ", "CAO THỦ", "BẬC THẦY"];
    const tabW = 160, tabH = 46, gap = 8;
    const totalW = labels.length * tabW + (labels.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + 160;
    const tabY   = 70;
    this._tabGraphics = [];
    this._tabTexts    = [];
    labels.forEach((label, i) => {
      const tx = startX + i * (tabW + gap);
      const g  = this.add.graphics();
      this._tabGraphics.push(g);
      const txt = this.add.text(tx + tabW / 2, tabY + tabH / 2, label, {
        fontFamily: "Signika", fontSize: "18px", color: "#502700",
        fontStyle: "bold",
      }).setOrigin(0.5).setPadding(6, 4, 6, 4);
      this._tabTexts.push(txt);
      this.add.zone(tx + tabW / 2, tabY + tabH / 2, tabW, tabH)
        .setInteractive({ cursor: "pointer" })
        .on("pointerdown", () => {
          this.currentTab  = i; this.currentPage = 0;
          this._drawAllTabs(startX, tabY, tabW, tabH, gap);
          const roomTypes = ["pho_thong", "tan_thu", "cao_thu", "bac_thay"];
          this.loadRoomsFromApi(width, height, roomTypes[i]);
        });
    });
    this._drawAllTabs(startX, tabY, tabW, tabH, gap);
    this._tabMeta = { startX, tabY, tabW, tabH, gap };
  }

  _drawAllTabs(startX, tabY, tabW, tabH, gap) {
    this._tabGraphics.forEach((g, i) => {
      const tx = startX + i * (tabW + gap);
      const active = i === this.currentTab;
      g.clear();
      if (active) {
        g.fillStyle(0x000000, 0.2);
        g.fillRoundedRect(tx + 3, tabY - 2, tabW, tabH, { tl: 10, tr: 10, bl: 0, br: 0 });
        g.fillStyle(0xebe3c0, 1);
        g.fillRoundedRect(tx, tabY - 4, tabW, tabH + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
        g.lineStyle(2, 0xb89040, 1);
        g.strokeRoundedRect(tx, tabY - 4, tabW, tabH + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
        g.fillStyle(0xffffff, 0.28);
        g.fillRoundedRect(tx + 8, tabY, tabW - 16, 10, 4);
        this._tabTexts[i].setColor("#502700");
      } else {
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(tx + 3, tabY + 2, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
        g.fillStyle(0xc4a865, 1);
        g.fillRoundedRect(tx, tabY, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
        g.lineStyle(1.5, 0x8a6a20, 0.6);
        g.strokeRoundedRect(tx, tabY, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
        this._tabTexts[i].setColor("#502700");
      }
    });
  }

  _buildMainPanel(width, height) {
    const panelX = 45, panelY = 118;
    const panelW = width - 90, panelH = height - 220;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(panelX + 6, panelY + 6, panelW, panelH, 16);
    g.fillGradientStyle(0xf5e8c0, 0xf5e8c0, 0xeedd99, 0xeedd99, 1);
    g.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(panelX + 6, panelY + 4, panelW - 12, 20, 8);
    g.lineStyle(1.5, 0xb8922e, 0.5);
    const ins = 10;
    const cornerR = 16;
    
    // Hàm vẽ đường thẳng đứt nét
    const drawD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += 14) {
        g.beginPath();
        g.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
        g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
        g.strokePath();
      }
    };
    
    // Hàm vẽ cung tròn đứt nét cho góc
    const drawArc = (cx, cy, radius, startAngle, endAngle) => {
      const arcLength = radius * Math.abs(endAngle - startAngle);
      const steps = Math.ceil(arcLength / 14);
      for (let i = 0; i < steps; i++) {
        const a1 = startAngle + (endAngle - startAngle) * (i / steps);
        const a2 = startAngle + (endAngle - startAngle) * Math.min((i + 0.57) / steps, 1);
        g.beginPath();
        g.arc(cx, cy, radius, a1, a2);
        g.strokePath();
      }
    };
    
    // Vẽ 4 cạnh thẳng (không bao gồm góc)
    drawD(panelX+ins+cornerR, panelY+ins, panelX+panelW-ins-cornerR, panelY+ins); // top
    drawD(panelX+panelW-ins, panelY+ins+cornerR, panelX+panelW-ins, panelY+panelH-ins-cornerR); // right
    drawD(panelX+panelW-ins-cornerR, panelY+panelH-ins, panelX+ins+cornerR, panelY+panelH-ins); // bottom
    drawD(panelX+ins, panelY+panelH-ins-cornerR, panelX+ins, panelY+ins+cornerR); // left
    
    // Vẽ 4 góc bo tròn
    drawArc(panelX+ins+cornerR, panelY+ins+cornerR, cornerR, Math.PI, Math.PI*1.5); // top-left
    drawArc(panelX+panelW-ins-cornerR, panelY+ins+cornerR, cornerR, Math.PI*1.5, Math.PI*2); // top-right
    drawArc(panelX+panelW-ins-cornerR, panelY+panelH-ins-cornerR, cornerR, 0, Math.PI*0.5); // bottom-right
    drawArc(panelX+ins+cornerR, panelY+panelH-ins-cornerR, cornerR, Math.PI*0.5, Math.PI); // bottom-left
    this._panelBounds = { x: panelX, y: panelY, w: panelW, h: panelH };
  }

  _renderRooms(width, height) {
    this.cardObjects.forEach(c => c.destroy());
    this.cardObjects = [];
    const rooms = this.allRooms;
    const start = this.currentPage * this.roomsPerPage;
    const page  = rooms.slice(start, start + this.roomsPerPage);
    const cols = 3, rows = 3, pb = this._panelBounds;
    const padX = 18, padY = 16, gapX = 15, gapY = 13;
    const cardW = Math.floor((pb.w - padX * 2 - gapX * (cols - 1)) / cols);
    const cardH = Math.floor((pb.h - padY * 2 - gapY * (rows - 1)) / rows);
    page.forEach((room, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      const cx  = pb.x + padX + col * (cardW + gapX) + cardW / 2;
      const cy  = pb.y + padY + row * (cardH + gapY) + cardH / 2;
      this.cardObjects.push(this._buildRoomCard(cx, cy, cardW, cardH, room));
    });
  }

  _buildRoomCard(cx, cy, cw, ch, room) {
    const container = this.add.container(cx, cy);
    const hw = cw / 2, hh = ch / 2;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.18);
    bg.fillRoundedRect(-hw + 4, -hh + 4, cw, ch, 12);
    if (room.playing) {
      bg.fillGradientStyle(0xd8d8d8, 0xd8d8d8, 0xbfbfbf, 0xbfbfbf, 1);
      bg.fillRoundedRect(-hw, -hh, cw, ch, 12);
      bg.lineStyle(1.5, 0xe2e2e2, 1);
    } else {
      bg.fillGradientStyle(0xfffde8, 0xfffde8, 0xfff3c0, 0xfff3c0, 1);
      bg.fillRoundedRect(-hw, -hh, cw, ch, 12);
      bg.lineStyle(1.5, 0xc0b168, 1);
    }
    bg.strokeRoundedRect(-hw, -hh, cw, ch, 12);
    bg.fillStyle(0xffffff, 0.35);
    bg.fillRoundedRect(-hw + 4, -hh + 3, cw - 8, 12, 6);
    const thumbW = Math.floor(cw * 0.42);
    const thumbH = ch - 16;
    const thumbX = -hw + 8, thumbY = -hh + 8;
    const thumbBg = this.add.graphics();
    thumbBg.fillStyle(0x4d4e56, 1);
    thumbBg.fillRoundedRect(thumbX, thumbY, thumbW, thumbH, 8);
    const map = this.add.sprite(thumbX + thumbW / 2, thumbY + thumbH / 2, "map1");
    if (map.width > 0) map.setScale(Math.min(thumbW / map.width, thumbH / map.height));
    else map.setScale(0.55);
    const thumbLabelBg = this.add.graphics();
    thumbLabelBg.fillStyle(0x000000, 0.45);
    thumbLabelBg.fillRoundedRect(thumbX, thumbY + thumbH - 25, thumbW, 25, 6);
    const thumbLabel = this.add.text(thumbX + thumbW / 2, thumbY + thumbH - 11,
      room.password ? "Nội bộ" : "Tự do", {
        fontFamily: "Signika", fontSize: Math.max(14, Math.round(ch * 0.14)) + "px",
        color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5);
    const rightX  = -hw + thumbW + 16, rightW = cw - thumbW - 24;
    const rightCX = rightX + rightW / 2;
    const coinR   = Math.round(ch * 0.155), topY = -ch * 0.20;
    const coin = this.add.image(0, 0, "coin").setDisplaySize(coinR * 2.5, coinR * 2.5);
    const betStr = room.bet >= 1000000
      ? (room.bet / 1000000).toFixed(room.bet % 1000000 === 0 ? 0 : 1) + "m"
      : (room.bet / 1000) + "k";
    const betText = this.add.text(0, 0, betStr, {
      fontFamily: "Signika", fontSize: Math.round(ch * 0.22) + "px",
      color: "#333333", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 3,
    });
    const groupW = coinR * 2.5 + 6 + betText.width;
    const groupStartX = rightCX - groupW / 2;
    coin.setPosition(groupStartX + coinR * 1.25, topY);
    betText.setPosition(groupStartX + coinR * 2.5 + 6, topY - betText.height / 2);
    const botY = ch * 0.18, statusObjects = [];
    if (room.playing) {
      // ── Badge ĐANG CHƠI ─────────────────────────────────────────────────
      const playOverlay = this.add.graphics();
      playOverlay.fillStyle(0x000000, 0.18);
      playOverlay.fillRoundedRect(-hw, -hh, cw, ch, 12);
      statusObjects.push(playOverlay);

      // Tính size badge vừa khít trong vùng phải của card
      const badgeW = Math.round(rightW * 0.88);   // không tràn qua rightW
      const badgeH = Math.round(ch * 0.18);       // nhỏ gọn hơn
      const badgeX = rightCX - badgeW / 2;
      const badgeY = botY - badgeH / 2;
      const badgeR = 6;                           // bo góc vuông hơn, không pill

      const badgeG = this.add.graphics();
      // Shadow nhẹ
      badgeG.fillStyle(0x000000, 0.3);
      badgeG.fillRoundedRect(badgeX + 2, badgeY + 3, badgeW, badgeH, badgeR);
      // Thân badge
      badgeG.fillStyle(0xb84400, 1);
      badgeG.fillRoundedRect(badgeX, badgeY, badgeW, badgeH, badgeR);
      // Highlight strip trên cùng
      badgeG.fillStyle(0xff7733, 0.35);
      badgeG.fillRoundedRect(badgeX + 4, badgeY + 3, badgeW - 8, badgeH * 0.38, badgeR - 2);
      // Viền mỏng
      badgeG.lineStyle(0.8, 0xff9955, 0.9);
      badgeG.strokeRoundedRect(badgeX, badgeY, badgeW, badgeH, badgeR);
      statusObjects.push(badgeG);

      const badgeFs = Math.max(11, Math.round(ch * 0.12)) + "px";
      const badgeTxt = this.add.text(rightCX, botY, "ĐANG CHƠI", {
        fontFamily: "Signika",
        fontSize:   badgeFs,
        color:      "#ffe4d0",
        fontStyle:  "bold",
        stroke:     "#4a1500",
        strokeThickness: 2,
      }).setOrigin(0.5);
      statusObjects.push(badgeTxt);

    } else {
      // Xác định max players từ match_mode hoặc room.max_players
      const isTeam    = room.match_mode === "team_2v2" || room.mode === "team";
      const maxPlayer = room.max_players || (isTeam ? 4 : 4);
      const iconSize  = Math.round(ch * 0.20);
      const spacing   = iconSize + 4;

      if (isTeam) {
        // Mode team: 2 icon | VS | 2 icon
        const half    = maxPlayer / 2;   // 2
        const vsGap   = Math.round(iconSize * 0.9);
        const totalW  = half * spacing + vsGap + half * spacing - 4;
        let   startX  = rightCX - totalW / 2 + iconSize / 2;

        // Team A
        for (let i = 0; i < half; i++) {
          const icon = this.add.image(startX + i * spacing, botY,
            i < room.players ? "user_empty" : "user_fill");
          icon.setScale(iconSize / icon.height);
          statusObjects.push(icon);
        }

        // "VS" icon image giữa
        const vsX  = startX + half * spacing - spacing/2 + vsGap/2;
        const vsSize = Math.round(vsGap * 0.88);
        const vsImg = this.add.image(vsX, botY, "versus");
        vsImg.setDisplaySize(42, 42);
        statusObjects.push(vsImg);

        // Team B (bắt đầu sau VS)
        const teamBStartX = vsX + vsGap / 2 + spacing / 2;
        for (let i = 0; i < half; i++) {
          const pi = half + i;   // player index (tiếp theo sau team A)
          const icon = this.add.image(teamBStartX + i * spacing, botY,
            pi < room.players ? "user_empty" : "user_fill");
          icon.setScale(iconSize / icon.height);
          statusObjects.push(icon);
        }

      } else {
        // Mode thường: xếp icon theo maxPlayer
        const totalW      = maxPlayer * spacing - 4;
        const iconsStartX = rightCX - totalW / 2 + iconSize / 2;
        for (let i = 0; i < maxPlayer; i++) {
          const icon = this.add.image(iconsStartX + i * spacing, botY,
            i < room.players ? "user_empty" : "user_fill");
          icon.setScale(iconSize / icon.height);
          statusObjects.push(icon);
        }
      }
    }
    const badgeW = Math.max(String(room.id).length * 14 + 16, 38), badgeH = 28;
    const badge = this.add.graphics();
    badge.fillStyle(0xff4466, 1);
    badge.fillRoundedRect(-hw + 2, -hh + 2, badgeW, badgeH, { tl: 10, tr: 4, bl: 4, br: 10 });
    badge.lineStyle(1.5, 0xff88aa, 0.8);
    badge.strokeRoundedRect(-hw + 2, -hh + 2, badgeW, badgeH, { tl: 10, tr: 4, bl: 4, br: 10 });
    badge.fillStyle(0xffffff, 0.25);
    badge.fillRoundedRect(-hw + 5, -hh + 5, badgeW - 6, 8, 3);
    const badgeText = this.add.text(-hw + 2 + badgeW / 2, -hh + 2 + badgeH / 2, String(room.id), {
      fontFamily: "Signika", fontSize: Math.max(12, Math.round(ch * 0.145)) + "px",
      color: "#ffffff", fontStyle: "bold", stroke: "#880022", strokeThickness: 3,
    }).setOrigin(0.5);
    container.add([bg, thumbBg, map, thumbLabelBg, thumbLabel, coin, betText, ...statusObjects, badge, badgeText]);
    container.setSize(cw, ch).setInteractive({ cursor: "pointer" });
    container.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(0x000000, 0.20); bg.fillRoundedRect(-hw + 4, -hh + 4, cw, ch, 12);
      bg.fillGradientStyle(0xe8f6ff, 0xe8f6ff, 0xcfeeff, 0xcfeeff, 1);
      bg.fillRoundedRect(-hw, -hh, cw, ch, 12); bg.lineStyle(1.5, 0x82dcf2, 1);
      bg.strokeRoundedRect(-hw, -hh, cw, ch, 12);
      this.tweens.add({ targets: container, scaleX: 1.02, scaleY: 1.02, duration: 100 });
    });
    container.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(0x000000, 0.18); bg.fillRoundedRect(-hw + 4, -hh + 4, cw, ch, 12);
      if (room.playing) {
        bg.fillGradientStyle(0xd8d8d8, 0xd8d8d8, 0xbfbfbf, 0xbfbfbf, 1);
        bg.fillRoundedRect(-hw, -hh, cw, ch, 12); bg.lineStyle(1.5, 0xe2e2e2, 1);
      } else {
        bg.fillGradientStyle(0xfffde8, 0xfffde8, 0xfff3c0, 0xfff3c0, 1);
        bg.fillRoundedRect(-hw, -hh, cw, ch, 12); bg.lineStyle(1.5, 0xc0b168, 1);
      }
      bg.strokeRoundedRect(-hw, -hh, cw, ch, 12);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
    });
    container.on("pointerdown", () => {
      // Phòng đang chơi → không thể vào
      if (room.playing) {
        this._showRoomLockedAlert("Phòng này đang trong trận đấu!");
        return;
      }
      this.tweens.add({ targets: container, scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true });
      // Phòng có mật khẩu → hiện modal nhập mật khẩu
      if (room.password) {
        this._showPasswordModal(room);
        return;
      }
      // Phòng bình thường → vào thẳng
      this._enterRoom(room, null);
    });
    return container;
  }

  _buildPaginationArrows(width, height) {
    // Xóa arrows cũ nếu có
    if (this._arrowObjs) this._arrowObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._arrowObjs = [];

    const pb    = this._panelBounds;
    const midY  = pb.y + pb.h / 2;
    const total = Math.ceil(this.allRooms.length / this.roomsPerPage);

    [{ x: pb.x - 10, dir: -1, flipX: true },
     { x: pb.x + pb.w + 10, dir: +1, flipX: false }]
    .forEach(({ x, dir, flipX }) => {
      const atLimit = dir === -1 ? this.currentPage <= 0
                                 : this.currentPage >= total - 1;

      // Vòng tròn nền mờ
      const circle = this.add.graphics();
      circle.fillStyle(0xffffff, 0.15);
      circle.fillCircle(x, midY, 25);
      circle.lineStyle(1.5, 0xaaddff, 0.5);
      circle.strokeCircle(x, midY, 25);
      this._arrowObjs.push(circle);

      // Ảnh mũi tên — tối nếu hết trang
      const img = this.add.image(x, midY, "arrow")
        .setDisplaySize(44, 44)
        .setFlipX(flipX)
        .setAlpha(atLimit ? 0.25 : 0.9)
        .setTint(atLimit ? 0x333333 : 0xffffff);
      this._arrowObjs.push(img);

      if (atLimit) return; // không gắn event nếu hết trang

      const zone = this.add.zone(x, midY, 62, 62).setInteractive({ cursor: "pointer" });
      this._arrowObjs.push(zone);

      zone.on("pointerover",  () => img.setAlpha(1));
      zone.on("pointerout",   () => img.setAlpha(0.9));
      zone.on("pointerdown",  () => {
        img.setAlpha(0.6);
        this.time.delayedCall(120, () => img.setAlpha(0.9));
        this.currentPage = Phaser.Math.Clamp(this.currentPage + dir, 0, Math.max(0, total - 1));
        this._renderRooms(width, height);
        this._buildPaginationArrows(width, height); // rebuild để cập nhật trạng thái
      });
    });
  }

  _drawArrowBtn(g, x, y, color) {
    g.clear();
    g.fillStyle(color, 0.3); g.fillCircle(x, y, 30);
    g.fillStyle(color, 1);   g.fillCircle(x, y, 24);
    g.fillStyle(0xffffff, 0.22); g.fillEllipse(x, y - 7, 30, 14);
    g.lineStyle(2, 0xffffff, 0.5); g.strokeCircle(x, y, 24);
  }

  _buildBottomButtons(width, height) {
    const by = height - 50;

    const btnW = 200;
    const btnH = 56;
    const gap  = 40; // khoảng cách giữa 2 nút

    const totalW = btnW * 2 + gap;

    const startX = width / 2 - totalW / 2;

    // Nút 1
    this._buildPillBtn(
      startX + btnW / 2,
      by,
      btnW,
      btnH,
      0xff8800,
      0xffaa00,
      "Tạo Phòng",
      () => this._showCreateRoomModal(width, height)
    );

    // Nút 2
    this._buildPillBtn(
      startX + btnW + gap + btnW / 2,
      by,
      btnW,
      btnH,
      0x22aa44,
      0x44cc66,
      "Chơi Nhanh",
      () => this._showQuickPlayModal(width, height)
    );
  }
  // ══════════════════════════════════════════════════════════════════════
  // MODAL SHELL
  // DEPTH layers:
  //   100 = dimmer (graphics, no interaction blocking needed)
  //   101 = panel body
  //   103 = row bg
  //   104 = labels, input bg graphics  
  //   105 = btn graphics, pill title, close graphics
  //   106 = btn text, close text, DOM input (z-index:9999 in CSS)
  //   107 = btn zones, close zone  ← highest → always clickable
  //   outsideZone = depth 99 ← BELOW everything, only catches truly outside clicks
  // ══════════════════════════════════════════════════════════════════════
  _buildModalShell(width, height, title, modalW, modalH) {
    const cx = width / 2, cy = height / 2;
    const px = cx - modalW / 2, py = cy - modalH / 2;
    const R = 20, D = 100;

    // Dimmer — graphics only, không dùng zone
    const dimmer = this.add.graphics().setDepth(D);
    dimmer.fillStyle(0x000000, 0.62);
    dimmer.fillRect(0, 0, width, height);
    dimmer.setAlpha(0);
    this.tweens.add({ targets: dimmer, alpha: 1, duration: 200 });

    // Panel
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x000000, 0.35);
    panel.fillRoundedRect(px + 7, py + 9, modalW, modalH, R);
    panel.fillGradientStyle(0xfffae8, 0xfffae8, 0xf2e098, 0xf2e098, 1);
    panel.fillRoundedRect(px, py, modalW, modalH, R);
    panel.fillStyle(0xffffff, 0.32);
    panel.fillRoundedRect(px + 6, py + 6, modalW - 12, modalH * 0.10, R - 4);
    panel.lineStyle(4, 0x8b5e1a, 1);
    panel.strokeRoundedRect(px, py, modalW, modalH, R);
    this._modalDash(panel, px + 20, py + 20, modalW - 40, modalH - 40, R - 5, 0xc8a060);

    // Title pill
    const pillW = 290, pillH = 52, pillR = pillH / 2;
    const pillTop = py - pillH / 2;
    const titlePill = this.add.graphics().setDepth(D + 5);
    titlePill.fillStyle(0x000000, 0.22);
    titlePill.fillRoundedRect(cx - pillW/2 + 4, pillTop + 5, pillW, pillH, pillR);
    titlePill.fillGradientStyle(0xc87800, 0xc87800, 0xffcc20, 0xffcc20, 1);
    titlePill.fillRoundedRect(cx - pillW/2, pillTop, pillW, pillH, pillR);
    titlePill.fillStyle(0xffffff, 0.30);
    titlePill.fillRoundedRect(cx - pillW/2 + 10, pillTop + 7, pillW - 20, pillH * 0.38, pillR - 2);
    titlePill.lineStyle(3, 0x8b5e1a, 1);
    titlePill.strokeRoundedRect(cx - pillW/2, pillTop, pillW, pillH, pillR);

    const titleTxt = this.add.text(cx, pillTop + pillH / 2, title, {
      fontFamily: "Signika", fontSize: "24px", color: "#5a2d00",
      fontStyle: "bold", stroke: "#ffffffbb", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 5);

    // Close button — dùng ảnh close.png
    const closeR = 18;
    const closeX = px + modalW + 4, closeY = py - 4;
    const closeImg = this.add.image(closeX, closeY, "close")
      .setDisplaySize(closeR * 2.2, closeR * 2.2)
      .setDepth(D + 6);

    const closeZone = this.add.zone(closeX, closeY, closeR * 2.4, closeR * 2.4)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7);
    closeZone.on("pointerover",  () => closeImg.setAlpha(0.85));
    closeZone.on("pointerout",   () => closeImg.setAlpha(1));

    const allObjects = [dimmer, panel, titlePill, titleTxt, closeImg, closeZone];

    const destroy = () => {
      this.tweens.add({
        targets: dimmer, alpha: 0, duration: 150,
        onComplete: () => {
          allObjects.forEach(o => { try { o?.destroy?.(); } catch(e){} });
        }
      });
      // Fade panel ngay
      this.tweens.add({ targets: [panel, titlePill, titleTxt, closeImg],
        alpha: 0, scaleX: 0.9, scaleY: 0.9, duration: 120, ease: 'Quad.easeIn' });
    };

    closeZone.on("pointerdown", destroy);

    // outsideZone depth=99 (thấp hơn dimmer) — CHỈ bắt click bên ngoài panel
    // Phải đặt TRƯỚC khi tạo các zone khác để depth ordering đúng
    const outsideZone = this.add.zone(cx, cy, width, height)
      .setInteractive().setDepth(99);
    outsideZone.on("pointerdown", (p) => {
      const inside = p.x >= px && p.x <= px + modalW && p.y >= py && p.y <= py + modalH;
      if (!inside) destroy();
    });
    allObjects.push(outsideZone);

    return { px, py, cx, cy, modalW, modalH, D,
      allObjects, destroy, addObj: (o) => allObjects.push(o) };
  }

  _modalDash(g, left, top, w, h, r, color) {
    g.lineStyle(1.8, color, 0.65);
    const dash = 9, skip = 7;
    const seg = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2-x1, y2-y1), ax = (x2-x1)/len, ay = (y2-y1)/len;
      for (let d = 0; d < len; d += dash+skip) {
        const e = Math.min(d+dash, len);
        g.beginPath(); g.moveTo(x1+ax*d, y1+ay*d); g.lineTo(x1+ax*e, y1+ay*e); g.strokePath();
      }
    };
    seg(left+r, top, left+w-r, top); seg(left+w, top+r, left+w, top+h-r);
    seg(left+w-r, top+h, left+r, top+h); seg(left, top+h-r, left, top+r);
    [{ a:180,b:270,cx:left+r,cy:top+r }, { a:270,b:360,cx:left+w-r,cy:top+r },
     { a:0,b:90,cx:left+w-r,cy:top+h-r }, { a:90,b:180,cx:left+r,cy:top+h-r }]
    .forEach(c => {
      g.beginPath(); g.arc(c.cx, c.cy, r, Phaser.Math.DegToRad(c.a), Phaser.Math.DegToRad(c.b)); g.strokePath();
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // OPTION ROW — FIX: buttons căn TRÁI từ sau label, không căn giữa
  // ══════════════════════════════════════════════════════════════════════
  _buildOptionRow(shell, rowY, labelTxt, options, isMulti, defaultSel, linkedRow = null) {
    const { px, modalW, D } = shell;
    const LABEL_W = 110;
    const ROW_H  = 56;
    const ROW_R  = 10;
    // Row dịch vào trong 28px mỗi bên để cân với nét đứt
    const INS = 28;

    const rowBg = this.add.graphics().setDepth(D + 3);
    rowBg.fillStyle(0xd4a030, 0.09);
    rowBg.fillRoundedRect(px + INS, rowY - ROW_H/2, modalW - INS*2, ROW_H, ROW_R);
    rowBg.lineStyle(1.5, 0xc8a060, 0.28);
    rowBg.strokeRoundedRect(px + INS, rowY - ROW_H/2, modalW - INS*2, ROW_H, ROW_R);
    shell.addObj(rowBg);

    if (labelTxt) {
      const lbl = this.add.text(px + INS + 8, rowY, labelTxt, {
        fontFamily: "Signika", fontSize: "16px", color: "#5a2d00", fontStyle: "bold",
      }).setOrigin(0, 0.5).setDepth(D + 4);
      shell.addObj(lbl);
    }

    const BTN_START_X = px + INS + 8 + LABEL_W;
    const btnH = 38, btnR = btnH / 2, btnGap = 10;
    const ICON_SIZE = 25; // default, versus dùng 35

    let selected = new Set(
      Array.isArray(defaultSel) ? defaultSel : defaultSel != null ? [defaultSel] : []
    );
    const btnRefs = [];

    const redraw = () => {
      btnRefs.forEach(({ g, txt, iconImg, val, bxRef, bw }) => {
        const on = selected.has(val);
        g.clear();
        if (on) {
          g.fillStyle(0x000000, 0.20);
          g.fillRoundedRect(bxRef - bw/2 + 2, rowY - btnH/2 + 4, bw, btnH, btnR);
          g.fillGradientStyle(0x00aacc, 0x00aacc, 0x0077aa, 0x0077aa, 1);
          g.fillRoundedRect(bxRef - bw/2, rowY - btnH/2, bw, btnH, btnR);
          g.fillStyle(0xffffff, 0.28);
          g.fillRoundedRect(bxRef - bw/2 + 5, rowY - btnH/2 + 4, bw - 10, btnH * 0.38, btnR - 3);
          g.lineStyle(2, 0x88eeff, 0.9);
          g.strokeRoundedRect(bxRef - bw/2, rowY - btnH/2, bw, btnH, btnR);
          txt.setColor("#ffffff").setStroke("#005566", 3);
        } else {
          g.fillStyle(0x000000, 0.10);
          g.fillRoundedRect(bxRef - bw/2 + 2, rowY - btnH/2 + 4, bw, btnH, btnR);
          g.fillStyle(0xe4cfa0, 1);
          g.fillRoundedRect(bxRef - bw/2, rowY - btnH/2, bw, btnH, btnR);
          g.fillStyle(0xffffff, 0.36);
          g.fillRoundedRect(bxRef - bw/2 + 5, rowY - btnH/2 + 4, bw - 10, btnH * 0.38, btnR - 3);
          g.lineStyle(1.5, 0xb89040, 0.60);
          g.strokeRoundedRect(bxRef - bw/2, rowY - btnH/2, bw, btnH, btnR);
          txt.setColor("#6b3a00").setStroke("#ffffff66", 2);
        }
      });
    };

    let curX = BTN_START_X;
    options.forEach(opt => {
      const bw    = opt.w || 72;
      const btnCX = curX + bw / 2;
      const g     = this.add.graphics().setDepth(D + 4);

      let txt, iconImg = null;
      if (opt.icon) {
        const iconSize = opt.icon === "versus" ? 35 : 25;
        // Tạo text tạm để đo width
        const tmpTxt = this.add.text(0, -9999, opt.label, { fontFamily: "Signika", fontSize: "14px" });
        const textW  = tmpTxt.width;
        tmpTxt.destroy();
        const cw = iconSize + 4 + textW;
        const startIconX = btnCX - cw / 2 + iconSize / 2;
        iconImg = this.add.image(startIconX, rowY, opt.icon)
          .setDisplaySize(iconSize, iconSize).setDepth(D + 5);
        txt = this.add.text(startIconX + iconSize / 2 + 4, rowY, opt.label, {
          fontFamily: "Signika", fontSize: "14px", color: "#6b3a00", fontStyle: "bold",
        }).setOrigin(0, 0.5).setDepth(D + 5);
        shell.addObj(iconImg);
      } else {
        txt = this.add.text(btnCX, rowY, opt.label, {
          fontFamily: "Signika", fontSize: "14px", color: "#6b3a00", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(D + 5);
      }

      const zone = this.add.zone(btnCX, rowY, bw, btnH)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 6);

      // Click: chỉ flash sáng nhẹ, không dịch chuyển
      zone.on("pointerdown", () => {
        if (isMulti) {
          if (selected.has(opt.val)) selected.delete(opt.val);
          else selected.add(opt.val);
        } else {
          selected = new Set([opt.val]);
          // Nếu có linkedRow thì clear selection của row đó
          if (linkedRow) linkedRow.clearSelection();
        }
        redraw();
        this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true });
      });

      btnRefs.push({ g, txt, iconImg, val: opt.val, bxRef: btnCX, bw });
      shell.addObj(g); shell.addObj(txt); shell.addObj(zone);
      curX += bw + btnGap;
    });

    redraw();
    const rowApi = {
      getValue:       () => isMulti ? [...selected] : ([...selected][0] ?? null),
      clearSelection: () => { selected = new Set(); redraw(); },
      setLinked:      (other) => { linkedRow = other; },
      setValue:       (val) => { selected = new Set([val]); redraw(); },
    };
    return rowApi;
  }

  // ══════════════════════════════════════════════════════════════════════
  // MODAL: CHƠI NHANH
  // ══════════════════════════════════════════════════════════════════════
  _showQuickPlayModal(width, height) {
    // Tính modalH chính xác từ content
    const TOP    = 72;   // py → ROW1
    const RH     = 66;   // row height
    const R4G    = 56;   // row4 gần row3
    const HINT_H = 46;
    const BTN_H  = 70;
    const BOTTOM = 16;
    const modalH = Math.min(TOP + RH*3 + R4G + HINT_H + BTN_H + BOTTOM, height - 40);
    const modalW = 660;

    const shell = this._buildModalShell(width, height, "Chơi Nhanh", modalW, modalH);
    const { py, cx, D } = shell;

    const R1     = py + TOP;
    const R2     = R1 + RH;
    const R3     = R2 + RH;
    const R4     = R3 + R4G;
    const HINT_Y = R4 + HINT_H;
    const BTN_Y  = py + modalH - BTN_H / 2 - BOTTOM - 22;

    this._buildOptionRow(shell, R1, "Loại phòng", [
      { label: "Tự do",     val: "free",      w: 130 },
      { label: "Thách đấu", val: "challenge", w: 145 },
    ], false, "free");

    const modeRow = this._buildOptionRow(shell, R2, "Kiểu chơi", [
      { label: "2",     val: 2,      w: 68 },
      { label: "3",     val: 3,      w: 68 },
      { label: "4",     val: 4,      w: 68 },
      { label: "Team",  val: "team", w: 110, icon: "versus" },
    ], true, [2, 3, 4]);

    const betRow1 = this._buildOptionRow(shell, R3, "Mức cược", [
      { label: "5K",  val: 5000,  w: 100, icon: "coin" },
      { label: "20K", val: 20000, w: 100, icon: "coin" },
      { label: "50K", val: 50000, w: 100, icon: "coin" },
    ], true, [5000, 20000]);

    const betRow2 = this._buildOptionRow(shell, R4, "", [
      { label: "200K", val: 200000,  w: 100, icon: "coin" },
      { label: "500K", val: 500000,  w: 100, icon: "coin" },
      { label: "1M",   val: 1000000, w: 100, icon: "coin" },
    ], true, []);

    const hint = this.add.text(cx, HINT_Y,
      "Tick nhiều tùy chọn thời gian tìm đối thủ sẽ nhanh hơn!", {
        fontFamily: "Signika", fontSize: "13px", color: "#8b5e1a", fontStyle: "italic",
      }).setOrigin(0.5).setDepth(D + 4);
    shell.addObj(hint);

    this._buildModalBtn(shell, cx, BTN_Y, 230, 54, 0x1ea84b, 0x55dd70, "Bắt Đầu", () => {
      shell.destroy();
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // MODAL: TẠO PHÒNG
  // ══════════════════════════════════════════════════════════════════════
  _showCreateRoomModal(width, height) {
    const TOP    = 72;
    const RH     = 66;
    const R4G    = 56;
    const PW_H   = 70;   // mật khẩu row
    const BTN_H  = 70;
    const BOTTOM = 16;
    const modalH = Math.min(TOP + RH*3 + R4G + PW_H + BTN_H + BOTTOM, height - 40);
    const modalW = 660;

    const shell = this._buildModalShell(width, height, "Tạo Phòng", modalW, modalH);
    const { px, py, cx, D } = shell;

    const R1   = py + TOP;
    const R2   = R1 + RH;
    const R3   = R2 + RH;
    const R4   = R3 + R4G;
    const PW_Y = R4 + PW_H;
    const BTN_Y = py + modalH - BTN_H / 2 - BOTTOM - 22;

    const roomRow = this._buildOptionRow(shell, R1, "Loại phòng", [
      { label: "Tự do",  val: "free",    w: 130 },
      { label: "Nội bộ", val: "private", w: 130 },
    ], false, "free");

    const modeRow = this._buildOptionRow(shell, R2, "Kiểu chơi", [
      { label: "2",     val: 2,      w: 68 },
      { label: "3",     val: 3,      w: 68 },
      { label: "4",     val: 4,      w: 68 },
      { label: "Team",  val: "team", w: 110, icon: "versus" },
    ], false, 4);

    const betRow1 = this._buildOptionRow(shell, R3, "Mức cược", [
      { label: "5K",   val: 5000,   w: 92, icon: "coin" },
      { label: "20K",  val: 20000,  w: 92, icon: "coin" },
      { label: "50K",  val: 50000,  w: 92, icon: "coin" },
      { label: "200K", val: 200000, w: 100, icon: "coin" },
    ], false, 5000);

    // betRow2 dùng chung selectedBet với betRow1
    const betRow2 = this._buildOptionRow(shell, R4, "", [
      { label: "500K", val: 500000,  w: 92, icon: "coin" },
      { label: "1M",   val: 1000000, w: 92, icon: "coin" },
      { label: "5M",   val: 5000000, w: 92, icon: "coin" },
    ], false, null, betRow1);
    // Khi chọn ở betRow1 thì clear betRow2 và ngược lại
    betRow1.setLinked(betRow2);

    // ── Mật khẩu ──────────────────────────────────────────────────────
    const PW_ROW_H = 56;
    const pwBg = this.add.graphics().setDepth(D + 3);
    pwBg.fillStyle(0xd4a030, 0.09);
    pwBg.fillRoundedRect(px + 28, PW_Y - PW_ROW_H/2, modalW - 56, PW_ROW_H, 10);
    pwBg.lineStyle(1.5, 0xc8a060, 0.28);
    pwBg.strokeRoundedRect(px + 28, PW_Y - PW_ROW_H/2, modalW - 56, PW_ROW_H, 10);
    shell.addObj(pwBg);

    const pwLbl = this.add.text(px + 36, PW_Y, "Mật khẩu", {
      fontFamily: "Signika", fontSize: "16px", color: "#5a2d00", fontStyle: "bold",
    }).setOrigin(0, 0.5).setDepth(D + 4);
    shell.addObj(pwLbl);

    // Input graphics background — thu ngắn khớp với viền ngoài (INS=28)
    const INP_X = px + 134, INP_W = modalW - 134 - 36, INP_H = 38;
    const INP_Y = PW_Y - INP_H / 2;
    const inpBg = this.add.graphics().setDepth(D + 4);
    inpBg.fillStyle(0xffffff, 1);
    inpBg.fillRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
    inpBg.lineStyle(2, 0xb89040, 0.75);
    inpBg.strokeRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
    shell.addObj(inpBg);

    // Fake input bằng Phaser Text + keyboard (tránh DOM issues)
    let pwValue = "";
    const PLACEHOLDER = "Để trống nếu không cần mật khẩu";
    let inputActive = false;

    const pwText = this.add.text(INP_X + 12, PW_Y, PLACEHOLDER, {
      fontFamily: "Signika", fontSize: "14px",
      color: "#b09060",
    }).setOrigin(0, 0.5).setDepth(D + 5);
    shell.addObj(pwText);

    // Cursor blink
    const cursor = this.add.text(0, PW_Y, "|", {
      fontFamily: "Signika", fontSize: "15px", color: "#5a2d00",
    }).setOrigin(0, 0.5).setDepth(D + 5).setVisible(false);
    shell.addObj(cursor);
    let cursorTween = this.tweens.add({
      targets: cursor, alpha: 0, duration: 500, yoyo: true, repeat: -1, paused: true,
    });
    shell.addObj({ destroy: () => cursorTween.stop() });

    const updateDisplay = () => {
      const display = pwValue || (inputActive ? "" : PLACEHOLDER);
      const color   = pwValue ? "#5a2d00" : (inputActive ? "#5a2d00" : "#b09060");
      pwText.setText(display).setColor(color);
      // Update cursor position
      const textW = pwText.width < INP_W - 20 ? pwText.width : INP_W - 20;
      cursor.setPosition(INP_X + 12 + Math.min(textW, INP_W - 28), PW_Y);
    };

    // Click vào ô input → activate
    const inpZone = this.add.zone(INP_X + INP_W/2, PW_Y, INP_W, INP_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 6);
    inpZone.on("pointerdown", () => {
      inputActive = true;
      cursor.setVisible(true);
      cursorTween.resume();
      // Viền sáng khi active
      inpBg.clear();
      inpBg.fillStyle(0xffffff, 1);
      inpBg.fillRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
      inpBg.lineStyle(2.5, 0x00aacc, 1);
      inpBg.strokeRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
      updateDisplay();
    });
    shell.addObj(inpZone);

    // Keyboard input
    const onKey = (evt) => {
      if (!inputActive) return;
      const k = evt.key;
      if (k === "Backspace") {
        pwValue = pwValue.slice(0, -1);
      } else if (k === "Enter" || k === "Escape") {
        inputActive = false;
        cursor.setVisible(false);
        cursorTween.pause();
        inpBg.clear();
        inpBg.fillStyle(0xffffff, 1);
        inpBg.fillRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
        inpBg.lineStyle(2, 0xb89040, 0.75);
        inpBg.strokeRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
      } else if (k.length === 1 && pwValue.length < 20) {
        pwValue += k;
      }
      // Auto-select "Nội bộ" khi có mật khẩu, "Tự do" khi xóa hết
      if (pwValue.length > 0) roomRow.setValue("private");
      else roomRow.setValue("free");
      updateDisplay();
    };
    window.addEventListener("keydown", onKey);
    // Cleanup keyboard listener khi destroy
    shell.addObj({ destroy: () => window.removeEventListener("keydown", onKey) });

    // Dùng pwValue thay inputEl.value
    const getPassword = () => pwValue.trim();

    // ── Nút Tạo Phòng ─────────────────────────────────────────────────
    this._buildModalBtn(shell, cx, BTN_Y, 230, 54, 0xe07800, 0xffaa22, "Tạo Phòng", async () => {
      const pw = getPassword();

      const bet = betRow2.getValue() !== null
        ? betRow2.getValue()
        : betRow1.getValue() !== null
        ? betRow1.getValue()
        : 5000;

      const roomConfig = {
        type: roomRow.getValue(),
        mode: modeRow.getValue(),
        bet,
        password: pw || null,
      };

      console.log("Tạo phòng config:", roomConfig);

      await this.createRoomRequest(roomConfig);
      shell.destroy();
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // MODAL BUTTON — depth D+7 (cao nhất → luôn clickable)
  // ══════════════════════════════════════════════════════════════════════
  _buildModalBtn(shell, bx, by, bw, bh, c1, c2, label, cb) {
    const { D } = shell;
    const br = bh / 2;
    const g  = this.add.graphics().setDepth(D + 5);
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(c1, 0.18);
      g.fillRoundedRect(bx-bw/2-4, by-bh/2-4, bw+8, bh+8, br+3);
      g.fillStyle(0x000000, 0.24);
      g.fillRoundedRect(bx-bw/2+3, by-bh/2+6, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx-bw/2, by-bh/2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.34 : 0.22);
      g.fillRoundedRect(bx-bw/2+8, by-bh/2+5, bw-16, bh*0.36, br-3);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeRoundedRect(bx-bw/2, by-bh/2, bw, bh, br);
    };
    draw(false);
    const txt = this.add.text(bx, by, label, {
      fontFamily: "Signika", fontSize: "21px", color: "#ffffff",
      fontStyle: "bold", stroke: "#00000099", strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true },
    }).setOrigin(0.5).setDepth(D + 6);
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.84 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // Zone ở depth D+7 — cao nhất
    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" }).setDepth(D + 7);
    zone.on("pointerover",  () => { draw(true); });
    zone.on("pointerout",   () => { draw(false); });
    zone.on("pointerdown",  () => {
      this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true });
      cb();
    });
    shell.addObj(g); shell.addObj(txt); shell.addObj(zone);
  }

  _buildPillBtn(bx, by, bw, bh, c1, c2, label, cb) {
    const br = bh / 2;
    const g  = this.add.graphics();
    const draw = (hover = false) => {
      g.clear();
      // Viền mờ nhỏ hơn (+4 thay vì +8)
      g.fillStyle(c1, 0.18);
      g.fillRoundedRect(bx-bw/2-4, by-bh/2-4, bw+8, bh+8, br+3);
      // Shadow
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(bx-bw/2+3, by-bh/2+5, bw, bh, br);
      // Thân nút
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx-bw/2, by-bh/2, bw, bh, br);
      // Gloss sáng hơn khi hover
      g.fillStyle(0xffffff, hover ? 0.40 : 0.22);
      g.fillRoundedRect(bx-bw/2+8, by-bh/2+5, bw-16, bh/3, br-4);
      // Viền
      g.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
      g.strokeRoundedRect(bx-bw/2, by-bh/2, bw, bh, br);
    };
    draw(false);
    const txt = this.add.text(bx, by, label, {
      fontFamily: "Signika", fontSize: "22px", color: "#ffffff",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true },
    }).setOrigin(0.5);
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.85 }, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" });
    // Hover: chỉ redraw sáng hơn, không scale/dịch chuyển
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      // Chỉ flash alpha nhẹ, không scale
      this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true, repeat: 0 });
      cb();
    });
  }
  // ══════════════════════════════════════════════════════════════════════
  // ENTER ROOM (sau khi đã xác thực)
  // ══════════════════════════════════════════════════════════════════════
  _enterRoom(room, enteredPassword) {
    this.cameras.main.fadeOut(200);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("RoomScene", {
        roomData: { ...room, enteredPassword }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // ALERT: Phòng đang chơi
  // ══════════════════════════════════════════════════════════════════════
  _showRoomLockedAlert(msg) {
    const { width, height } = this.scale;
    const D  = 150;
    const bw = 300, bh = 140;
    const bx = width / 2 - bw / 2, by = height / 2 - bh / 2;

    const allObjs = [];
    const dismiss = () => allObjs.forEach(o => { try { o?.destroy?.(); } catch(e){} });

    // Dimmer nhẹ
    const dim = this.add.graphics().setDepth(D);
    dim.fillStyle(0x000000, 0.45);
    dim.fillRect(0, 0, width, height);
    allObjs.push(dim);

    // Box
    const box = this.add.graphics().setDepth(D + 1);
    box.fillStyle(0x000000, 0.25);
    box.fillRoundedRect(bx + 4, by + 6, bw, bh, 16);
    box.fillGradientStyle(0xfff9e8, 0xfff9e8, 0xf2e098, 0xf2e098, 1);
    box.fillRoundedRect(bx, by, bw, bh, 16);
    box.lineStyle(3, 0xcc4400, 1);
    box.strokeRoundedRect(bx, by, bw, bh, 16);
    allObjs.push(box);

    // Icon khoá
    const icon = this.add.text(width / 2, by + 34, "🔒", { fontSize: "28px" })
      .setOrigin(0.5).setDepth(D + 2);
    allObjs.push(icon);

    // Text
    const txt = this.add.text(width / 2, by + 68, msg, {
      fontFamily: "Signika", fontSize: "16px", color: "#5a2d00",
      fontStyle: "bold", align: "center", lineSpacing: 4,
    }).setOrigin(0.5).setDepth(D + 2);
    allObjs.push(txt);

    // Nút OK
    const okG = this.add.graphics().setDepth(D + 2);
    const okX = width / 2, okY = by + bh - 24;
    const okW = 100, okH = 34;
    okG.fillGradientStyle(0xff6600, 0xff6600, 0xff9900, 0xff9900, 1);
    okG.fillRoundedRect(okX - okW/2, okY - okH/2, okW, okH, okH/2);
    okG.fillStyle(0xffffff, 0.25);
    okG.fillRoundedRect(okX - okW/2 + 6, okY - okH/2 + 4, okW - 12, okH * 0.36, okH/2 - 3);
    allObjs.push(okG);

    const okTxt = this.add.text(okX, okY, "OK", {
      fontFamily: "Signika", fontSize: "17px", color: "#ffffff",
      fontStyle: "bold", stroke: "#662200", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    allObjs.push(okTxt);

    const okZone = this.add.zone(okX, okY, okW, okH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
    okZone.on("pointerdown", dismiss);
    allObjs.push(okZone);

    // Click ngoài cũng đóng
    const bg = this.add.zone(width/2, height/2, width, height)
      .setInteractive().setDepth(D);
    bg.on("pointerdown", (p) => {
      const inside = p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh;
      if (!inside) dismiss();
    });
    allObjs.push(bg);
  }

  // ══════════════════════════════════════════════════════════════════════
  // MODAL: NHẬP MẬT KHẨU PHÒNG
  // ══════════════════════════════════════════════════════════════════════
  _showPasswordModal(room) {
    const { width, height } = this.scale;
    const D   = 150;
    const mW  = 440, mH = 220;
    const px  = width / 2 - mW / 2, py = height / 2 - mH / 2;

    const allObjs = [];
    const dismiss = () => allObjs.forEach(o => { try { o?.destroy?.(); } catch(e){} });

    // Dimmer
    const dim = this.add.graphics().setDepth(D);
    dim.fillStyle(0x000000, 0.55);
    dim.fillRect(0, 0, width, height);
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 180 });
    allObjs.push(dim);

    // Panel
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x000000, 0.30);
    panel.fillRoundedRect(px + 5, py + 7, mW, mH, 16);
    panel.fillGradientStyle(0xfffae8, 0xfffae8, 0xf2e098, 0xf2e098, 1);
    panel.fillRoundedRect(px, py, mW, mH, 16);
    panel.fillStyle(0xffffff, 0.30);
    panel.fillRoundedRect(px + 5, py + 5, mW - 10, mH * 0.12, 12);
    panel.lineStyle(3.5, 0x8b5e1a, 1);
    panel.strokeRoundedRect(px, py, mW, mH, 16);
    allObjs.push(panel);

    // Title
    const titleTxt = this.add.text(width / 2, py + 28, "Nhập Mật Khẩu Phòng", {
      fontFamily: "Signika", fontSize: "18px", color: "#5a2d00", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 2);
    allObjs.push(titleTxt);

    // Input box
    const INP_X = px + 50, INP_Y = py + 60, INP_W = mW - 100, INP_H = 42;
    const inpBg = this.add.graphics().setDepth(D + 2);
    const drawInpBg = (active) => {
      inpBg.clear();
      inpBg.fillStyle(0xffffff, 1);
      inpBg.fillRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
      inpBg.lineStyle(active ? 2.5 : 1.8, active ? 0x00aacc : 0xb89040, active ? 1 : 0.75);
      inpBg.strokeRoundedRect(INP_X, INP_Y, INP_W, INP_H, 10);
    };
    drawInpBg(false);
    allObjs.push(inpBg);

    // Fake input state
    let pwVal = "";
    let active = false;
    const HOLDER = "Nhập mật khẩu...";
    const inpCY  = INP_Y + INP_H / 2;

    const pwTxt = this.add.text(INP_X + 12, inpCY, HOLDER, {
      fontFamily: "Signika", fontSize: "15px", color: "#b09060", fixedWidth: INP_W - 24,
    }).setOrigin(0, 0.5).setDepth(D + 3);
    allObjs.push(pwTxt);

    const cur = this.add.text(INP_X + 12, inpCY, "|", {
      fontFamily: "Signika", fontSize: "16px", color: "#5a2d00",
    }).setOrigin(0, 0.5).setDepth(D + 3).setVisible(false);
    allObjs.push(cur);

    const curTween = this.tweens.add({
      targets: cur, alpha: 0, duration: 500, yoyo: true, repeat: -1, paused: true,
    });
    allObjs.push({ destroy: () => curTween.stop() });

    const refreshDisplay = () => {
      const show = pwVal ? "•".repeat(pwVal.length) : (active ? "" : HOLDER);
      pwTxt.setText(show).setColor(pwVal ? "#5a2d00" : (active ? "#5a2d00" : "#b09060"));
      const tw = Math.min(pwTxt.width, INP_W - 28);
      cur.setPosition(INP_X + 12 + tw, inpCY);
    };

    // Click input
    const inpZone = this.add.zone(INP_X + INP_W/2, inpCY, INP_W, INP_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 4);
    inpZone.on("pointerdown", () => {
      active = true;
      cur.setVisible(true);
      curTween.resume();
      drawInpBg(true);
      refreshDisplay();
    });
    allObjs.push(inpZone);

    // Error text (ẩn ban đầu)
    const errTxt = this.add.text(width / 2, INP_Y + INP_H + 14, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#cc2200",
    }).setOrigin(0.5).setDepth(D + 3);
    allObjs.push(errTxt);

    // Keyboard
    const onKey = (e) => {
      if (!active) return;
      const k = e.key;
      if (k === "Backspace") pwVal = pwVal.slice(0, -1);
      else if (k === "Escape") { active = false; cur.setVisible(false); curTween.pause(); drawInpBg(false); }
      else if (k === "Enter") doJoin();
      else if (k.length === 1 && pwVal.length < 20) pwVal += k;
      refreshDisplay();
    };
    window.addEventListener("keydown", onKey);
    allObjs.push({ destroy: () => window.removeEventListener("keydown", onKey) });

    // Nút Vào Phòng + Huỷ — căn giữa cả hai
    const btnY   = py + mH - 58;
    const btnW   = 140, btnH2 = 42;
    const canW   = 60; // ước tính width chữ Huỷ
    const gap    = 35;
    const totalW = btnW + gap + canW;
    const groupX = width / 2 - totalW / 2; // điểm bắt đầu nhóm
    const btnCX  = groupX + btnW / 2;
    const canX   = groupX + btnW + gap;
    const btnG  = this.add.graphics().setDepth(D + 3);
    const drawBtn = (hover) => {
      btnG.clear();
      btnG.fillStyle(0x000000, 0.28);
      btnG.fillRoundedRect(btnCX - btnW/2 + 3, btnY - btnH2/2 + 5, btnW, btnH2, btnH2/2);
      btnG.fillGradientStyle(0x1ea84b, 0x1ea84b, 0x55dd70, 0x55dd70, 1);
      btnG.fillRoundedRect(btnCX - btnW/2, btnY - btnH2/2, btnW, btnH2, btnH2/2);
      btnG.fillStyle(0xffffff, hover ? 0.38 : 0.22);
      btnG.fillRoundedRect(btnCX - btnW/2 + 8, btnY - btnH2/2 + 5, btnW - 16, btnH2 * 0.36, btnH2/2 - 3);
      btnG.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
      btnG.strokeRoundedRect(btnCX - btnW/2, btnY - btnH2/2, btnW, btnH2, btnH2/2);
    };
    drawBtn(false);
    allObjs.push(btnG);

    const btnTxt = this.add.text(btnCX, btnY, "Vào Phòng", {
      fontFamily: "Signika", fontSize: "18px", color: "#ffffff",
      fontStyle: "bold", stroke: "#004422", strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true },
    }).setOrigin(0.5).setDepth(D + 4);
    allObjs.push(btnTxt);

    // Pulse animation
    this.tweens.add({ targets: btnG, alpha: { from: 1, to: 0.85 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    allObjs.push({ destroy: () => this.tweens.killTweensOf(btnG) });

    const doJoin = async () => {
      if (!pwVal.trim()) {
        errTxt.setText("Vui lòng nhập mật khẩu!"); return;
      }
      btnTxt.setText("Đang kiểm tra...");

      try {
        const pd = this.registry.get("playerData") || JSON.parse(localStorage.getItem("playerData") || "null");
        const res = await fetch(`${SERVER_URL}/rooms/${room.id}/verify-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pd?.token}` },
          body: JSON.stringify({ password: pwVal.trim() }),
        });
        const data = await res.json();
        if (data.success) {
          dismiss();
          this._enterRoom(room, pwVal.trim());
        } else {
          errTxt.setText(data.message || "Sai mật khẩu!");
          btnTxt.setText("Vào Phòng");
          // Toast đỏ giống LoginScene
          const { width: w, height: h } = this.scale;
          const toast = this.add.text(w / 2, h - 80, data.message || "Bạn đã nhập sai mật khẩu", {
            fontFamily: "Signika", fontSize: "17px", color: "#ff4444", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 3,
            backgroundColor: "#00000099", padding: { x: 16, y: 9 },
          }).setOrigin(0.5).setDepth(400).setAlpha(0);
          this.tweens.add({
            targets: toast, alpha: 1, y: h - 100, duration: 200, ease: "Back.easeOut",
            onComplete: () => this.time.delayedCall(2200, () => {
              this.tweens.add({ targets: toast, alpha: 0, duration: 300, onComplete: () => toast.destroy() });
            })
          });
        }
      } catch {
        errTxt.setText("Lỗi kết nối server!");
        btnTxt.setText("Vào Phòng");
      }
    };

    const btnZone = this.add.zone(btnCX, btnY, btnW, btnH2)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 5);
    btnZone.on("pointerover",  () => { drawBtn(true); });
    btnZone.on("pointerout",   () => { drawBtn(false); });
    btnZone.on("pointerdown",  () => {
      this.tweens.add({ targets: btnG, alpha: 0.65, duration: 60, yoyo: true });
      doJoin();
    });
    allObjs.push(btnZone);

    const canTxt = this.add.text(canX, btnY, "Huỷ", {
      fontFamily: "Signika", fontSize: "15px", color: "#886633",
      fontStyle: "bold",
    }).setOrigin(0, 0.5).setDepth(D + 4).setInteractive({ cursor: "pointer" });
    canTxt.on("pointerdown", dismiss);
    canTxt.on("pointerover",  () => canTxt.setColor("#cc4400"));
    canTxt.on("pointerout",   () => canTxt.setColor("#886633"));
    allObjs.push(canTxt);

    // Bounce in
    panel.setAlpha(0); panel.setScale(0.88);
    this.tweens.add({ targets: panel, alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: "Back.easeOut" });
  }
}