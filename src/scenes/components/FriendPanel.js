/**
 * FriendPanel — Panel bạn bè cho LobbyScene
 * Phong cách: nền vàng kem BagScene, tab kiểu BagScene, nút X kiểu Chat (close_btn nhô góc)
 * Tabs: D.S Bạn Bè | Y.C Kết Bạn | Mời Bạn
 */
export default class FriendPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ socket: any, playerData: any, depth?: number }} opts
   */
  constructor(scene, { socket, playerData, depth = 150 }) {
    this.scene      = scene;
    this.socket     = socket;
    this.playerData = playerData;
    this.depth      = depth;
    this._objs      = [];
    this._tabIdx    = 0;
    this._friends   = [];
    this._requests  = [];
    this._search    = [];
    this._listObjs  = [];
    this._open      = false;
  }

  // ── PUBLIC ──────────────────────────────────────────────────────

  build(width, height) {
    this._width  = width;
    this._height = height;
    this._open   = true;

    const W      = 600;
    const H      = 480;
    const TAB_H  = 46; // chiều cao tab (giống BagScene)
    const TOTAL_H = H + TAB_H; // tổng chiều cao cả tab + panel
    const CX = width  / 2;
    const CY = height / 2;
    const L  = CX - W / 2;
    const T  = CY - TOTAL_H / 2 + TAB_H; // top của panel body, tab nằm phía trên
    const R  = 14;
    const D  = this.depth;

    this._panelL = L; this._panelT = T;
    this._panelW = W; this._panelH = H;

    const push = o => { this._objs.push(o); return o; };

    // ── Overlay tối toàn màn hình ─────────────────────────────────
    const overlay = push(this.scene.add.graphics().setDepth(D - 1));
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, width, height);
    // Click ra ngoài để đóng
    const overlayZone = push(this.scene.add.zone(width / 2, height / 2, width, height)
      .setInteractive().setDepth(D - 1));
    overlayZone.on("pointerdown", () => this.destroy());

    // ── Bóng đổ ──────────────────────────────────────────────────
    const shadow = push(this.scene.add.graphics().setDepth(D));
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(L + 7, T + 7, W, H, R);

    // ── Nền vàng kem (BagScene style) ────────────────────────────
    const bg = push(this.scene.add.graphics().setDepth(D + 1));
    bg.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xede0b0, 0xede0b0, 1);
    bg.fillRoundedRect(L, T, W, H, R);
    bg.lineStyle(3, 0xffffff, 1);
    bg.strokeRoundedRect(L, T, W, H, R);
    // Gloss
    bg.fillStyle(0xffffff, 0.18);
    bg.fillRoundedRect(L + 6, T + 4, W - 12, 22, 8);
    // Viền đứt nét vàng bên trong
    this._drawInnerDash(bg, L, T, W, H, R);

    // Zone chặn click lan xuống overlay
    push(this.scene.add.zone(L + W / 2, T + H / 2, W, H)
      .setInteractive().setDepth(D + 1));

    // ── Tabs (BagScene style: tabW=160, tabH=46, gap=8) ──────────
    const TAB_LABELS = ["D.S Bạn Bè", "Y.C Kết Bạn", "Mời Bạn"];
    const TAB_W = 160;
    const TAB_GAP = 8;
    const TAB_TOTAL = TAB_LABELS.length * TAB_W + (TAB_LABELS.length - 1) * TAB_GAP;
    const TAB_START = L + (W - TAB_TOTAL) / 2 - 20; // căn giữa theo panel
    const TAB_Y = T - TAB_H - 2.5;

    this._tabGfx  = [];
    this._tabTxts = [];

    TAB_LABELS.forEach((label, i) => {
      const tx = TAB_START + i * (TAB_W + TAB_GAP);
      const g  = push(this.scene.add.graphics().setDepth(D - 1));
      this._tabGfx.push(g);
      const txt = push(this.scene.add.text(tx + TAB_W / 2, TAB_Y + TAB_H / 2, label, {
        fontFamily: "Signika", fontSize: "16px", color: "#502700", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D));
      this._tabTxts.push(txt);
      const zone = push(this.scene.add.zone(tx + TAB_W / 2, TAB_Y + TAB_H / 2, TAB_W, TAB_H)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 1));
      zone.on("pointerdown", () => {
        if (this._tabIdx !== i) {
          this._tabIdx = i;
          this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
          this._rebuildList();
        }
      });
    });
    this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
    this._tabMeta = { TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP };

    // ── Nút X (close_btn nhô ra góc trên phải — kiểu Chat) ───────
    const closeR = 18;
    const closeX = L + W;
    const closeY = T;
    const closeBtn = push(this.scene.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(closeR * 2.2, closeR * 2.2).setDepth(D + 6));
    const closeZone = push(this.scene.add.zone(closeX, closeY, closeR * 2.6, closeR * 2.6)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7));
    closeZone.on("pointerover",  () => closeBtn.setAlpha(0.8));
    closeZone.on("pointerout",   () => closeBtn.setAlpha(1));
    closeZone.on("pointerdown",  () => this.destroy());

    // ── Thanh tìm kiếm (tab 0 & 2) ───────────────────────────────
    this._searchBarY = T + 14;
    this._buildSearchBar(L, T, W, D);

    // ── Vùng danh sách ───────────────────────────────────────────
    this._listTop  = T + 58;
    this._listH    = H - 58 - 28;
    this._listL    = L + 12;
    this._listW    = W - 24;

    // ── Footer đếm bạn ───────────────────────────────────────────
    this._footerTxt = push(this.scene.add.text(L + W - 14, T + H - 10, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#7a5a20"
    }).setOrigin(1, 1).setDepth(D + 2));

    // ── Bind socket ──────────────────────────────────────────────
    this._bindSocket();

    // ── Load dữ liệu tab đầu ─────────────────────────────────────
    this.socket?.emit("friend:list");
    this.socket?.emit("friend:requests");

    return this;
  }

  destroy() {
    this._open = false;
    this._unbindSocket();
    this._clearList();
    this._objs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._objs = [];
    this.scene._friendPanelOpen = false;
  }

  // ── PRIVATE: Panel style ────────────────────────────────────────

  _drawInnerDash(g, L, T, W, H, R) {
    const ins = 10;
    const cr  = R - 4;
    g.lineStyle(1.5, 0xb8922e, 0.5);
    const drawD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += 14) {
        g.beginPath();
        g.moveTo(x1 + Math.cos(ang) * d,                          y1 + Math.sin(ang) * d);
        g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist),      y1 + Math.sin(ang) * Math.min(d + 8, dist));
        g.strokePath();
      }
    };
    const drawArc = (cx, cy, r, a1, a2) => {
      const steps = Math.ceil(r * Math.abs(a2 - a1) / 14);
      for (let i = 0; i < steps; i++) {
        const s = a1 + (a2 - a1) * (i / steps);
        const e = a1 + (a2 - a1) * Math.min((i + 0.57) / steps, 1);
        g.beginPath(); g.arc(cx, cy, r, s, e); g.strokePath();
      }
    };
    drawD(L+ins+cr, T+ins, L+W-ins-cr, T+ins);
    drawD(L+W-ins, T+ins+cr, L+W-ins, T+H-ins-cr);
    drawD(L+W-ins-cr, T+H-ins, L+ins+cr, T+H-ins);
    drawD(L+ins, T+H-ins-cr, L+ins, T+ins+cr);
    drawArc(L+ins+cr,   T+ins+cr,   cr, Math.PI,     Math.PI*1.5);
    drawArc(L+W-ins-cr, T+ins+cr,   cr, Math.PI*1.5, Math.PI*2);
    drawArc(L+W-ins-cr, T+H-ins-cr, cr, 0,           Math.PI*0.5);
    drawArc(L+ins+cr,   T+H-ins-cr, cr, Math.PI*0.5, Math.PI);
  }

  _drawTabs(L, TAB_Y, TAB_W, TAB_H, GAP = 0) {
    this._tabGfx.forEach((g, i) => {
      const tx = L + i * (TAB_W + GAP);
      const active = this._tabIdx === i;
      g.clear();
      if (active) {
        // Bóng đổ nhẹ
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(tx + 3, TAB_Y - 2, TAB_W, TAB_H, { tl: 10, tr: 10, bl: 0, br: 0 });
        // Nền sáng hơn panel
        g.fillStyle(0xf0e4b8, 1);
        g.fillRoundedRect(tx, TAB_Y - 4, TAB_W, TAB_H + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
        // Viền vàng
        g.lineStyle(2, 0xb89040, 1);
        g.strokeRoundedRect(tx, TAB_Y - 4, TAB_W, TAB_H + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
        // Gloss
        g.fillStyle(0xffffff, 0.28);
        g.fillRoundedRect(tx + 8, TAB_Y, TAB_W - 16, 10, 4);
        this._tabTxts[i].setColor("#502700");
      } else {
        g.fillStyle(0x000000, 0.15);
        g.fillRoundedRect(tx + 3, TAB_Y + 2, TAB_W, TAB_H, { tl: 8, tr: 8, bl: 0, br: 0 });
        g.fillStyle(0xc4a865, 1);
        g.fillRoundedRect(tx, TAB_Y, TAB_W, TAB_H, { tl: 8, tr: 8, bl: 0, br: 0 });
        g.lineStyle(1.5, 0x8a6a20, 0.6);
        g.strokeRoundedRect(tx, TAB_Y, TAB_W, TAB_H, { tl: 8, tr: 8, bl: 0, br: 0 });
        this._tabTxts[i].setColor("#6b4a10");
      }
    });
  }

  _buildSearchBar(L, T, W, D) {
    const SY = T + 14;
    const SH = 32;
    const SW = W - 28;       // full width trừ padding 2 bên
    const SX = L + 14;       // bám sát trái panel

    const sbg = this.scene.add.graphics().setDepth(D + 2);
    sbg.fillStyle(0xfff8e8, 0.9);
    sbg.fillRoundedRect(SX, SY, SW, SH, 8);
    sbg.lineStyle(1.5, 0xb8922e, 0.6);
    sbg.strokeRoundedRect(SX, SY, SW, SH, 8);
    this._objs.push(sbg);

    this._searchPh = this.scene.add.text(SX + 10, SY + SH / 2, "Tìm theo tên", {
      fontFamily: "Signika", fontSize: "13px", color: "#b8922e"
    }).setOrigin(0, 0.5).setDepth(D + 3);
    this._objs.push(this._searchPh);

    this._searchTxt = this.scene.add.text(SX + 10, SY + SH / 2, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#502700"
    }).setOrigin(0, 0.5).setDepth(D + 3);
    this._objs.push(this._searchTxt);

    // Icon kính lúp
    const lens = this.scene.add.text(SX + SW - 10, SY + SH / 2, "🔍", {
      fontSize: "14px"
    }).setOrigin(1, 0.5).setDepth(D + 3);
    this._objs.push(lens);

    const zone = this.scene.add.zone(SX + SW / 2, SY + SH / 2, SW, SH)
      .setInteractive({ cursor: "text" }).setDepth(D + 4);
    zone.on("pointerover", () => { this.scene.game.canvas.style.cursor = "text"; });
    zone.on("pointerout",  () => { this.scene.game.canvas.style.cursor = "default"; });
    zone.on("pointerdown", () => {
      this._searchPh.setVisible(false);
      if (!this._searchKeyListener) {
        this._searchKeyListener = (e) => {
          if (e.key === "Escape") {
            this._searchQuery = "";
            this._searchTxt.setText("");
            this._searchPh.setVisible(true);
            this._rebuildList();
          } else if (e.key === "Backspace") {
            this._searchQuery = (this._searchQuery || "").slice(0, -1);
            this._searchTxt.setText(this._searchQuery);
            this._searchPh.setVisible(!this._searchQuery);
            this._rebuildList();
          } else if (e.key === "Enter") {
            if (this._tabIdx === 1) this.socket?.emit("friend:search", { query: this._searchQuery });
          } else if (e.key.length === 1) {
            this._searchQuery = (this._searchQuery || "") + e.key;
            this._searchTxt.setText(this._searchQuery);
            this._rebuildList();
          }
        };
        window.addEventListener("keydown", this._searchKeyListener);
      }
    });
    this._objs.push(zone);
  }

  // ── PRIVATE: List ───────────────────────────────────────────────

  _clearList() {
    this._listObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._listObjs = [];
  }

  _rebuildList() {
    this._clearList();
    const D = this.depth;
    const L = this._listL, W = this._listW;
    let T = this._listTop;
    const ROW_H = 58;
    const q = (this._searchQuery || "").toLowerCase();

    if (this._tabIdx === 0) {
      // ── D.S Bạn Bè ──────────────────────────────────────────────
      let list = this._friends;
      if (q) list = list.filter(f => (f.name || "").toLowerCase().includes(q));

      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Chưa có bạn bè nào", "#b8922e", D);
      } else {
        list.forEach((f, i) => this._buildFriendRow(L, T + i * ROW_H, W, ROW_H, f, D));
      }

      this._footerTxt?.setText(`${this._friends.length}/100 bạn`);

    } else if (this._tabIdx === 1) {
      // ── Y.C Kết Bạn ─────────────────────────────────────────────
      const list = this._requests;
      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Không có lời mời nào", "#b8922e", D);
      } else {
        list.forEach((r, i) => this._buildRequestRow(L, T + i * ROW_H, W, ROW_H, r, D));
      }
      this._footerTxt?.setText("");

    } else {
      // ── Mời Bạn (tìm kiếm) ──────────────────────────────────────
      const list = this._search;
      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Nhập tên để tìm kiếm", "#b8922e", D);
      } else {
        list.forEach((u, i) => this._buildSearchRow(L, T + i * ROW_H, W, ROW_H, u, D));
      }
      this._footerTxt?.setText("");
    }
  }

  _pushListText(x, y, text, color, D) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: "Signika", fontSize: "14px", color
    }).setOrigin(0.5).setDepth(D + 2);
    this._listObjs.push(t);
  }

  /** Row bạn bè: avatar circle + tên + online + nút Chat + nút Mời + nút Xóa */
  _buildFriendRow(L, rowY, W, H, friend, D) {
    const midY = rowY + H / 2;
    const push = o => { this._listObjs.push(o); return o; };

    // Nền row xen kẽ
    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    rowBg.fillStyle(0x000000, 0.04);
    rowBg.fillRoundedRect(L, rowY + 2, W, H - 4, 8);

    // Avatar circle
    const avR = 22;
    const avX = L + 14 + avR;
    const avCircle = push(this.scene.add.graphics().setDepth(D + 2));
    avCircle.fillStyle(friend.online ? 0x22aa55 : 0x888888, 1);
    avCircle.fillCircle(avX, midY, avR + 2);
    avCircle.fillStyle(0xc4a865, 1);
    avCircle.fillCircle(avX, midY, avR);

    // Chữ viết tắt tên trong avatar
    const initials = (friend.name || "?").slice(0, 2).toUpperCase();
    push(this.scene.add.text(avX, midY, initials, {
      fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 3));

    // Tên
    push(this.scene.add.text(avX + avR + 12, midY - 10, friend.name || "?", {
      fontFamily: "Signika", fontSize: "15px", color: "#3a2000", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // Online/Offline
    push(this.scene.add.text(avX + avR + 12, midY + 10, friend.online ? "Online" : "Offline", {
      fontFamily: "Signika", fontSize: "12px",
      color: friend.online ? "#22aa55" : "#aa4422"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // Nút Chat riêng
    const btnW = 36, btnH = 30;
    const btn1X = L + W - 14 - btnW * 3 - 8;
    this._buildIconBtn(btn1X, midY, btnW, btnH, "💬", "#1a6abf", D, () => {
      this.scene.events.emit("friend:open_pm", friend);
    });

    // Nút Mời phòng (chỉ hiện nếu online)
    const btn2X = btn1X + btnW + 4;
    if (friend.online) {
      this._buildIconBtn(btn2X, midY, btnW, btnH, "📨", "#1a8a3f", D, () => {
        const roomId = this.scene.registry.get("currentRoomId");
        if (!roomId) { this.scene._showToast?.("Bạn chưa ở trong phòng nào!"); return; }
        this.socket?.emit("room:invite", { to_id: friend.friend_uid ?? friend.id, room_id: roomId });
        this.scene._showToast?.(`Đã mời ${friend.name} vào phòng!`);
      });
    } else {
      // Nút mờ disabled
      this._buildIconBtn(btn2X, midY, btnW, btnH, "📨", "#888888", D, null, true);
    }

    // Nút Xóa bạn
    const btn3X = btn2X + btnW + 4;
    this._buildIconBtn(btn3X, midY, btnW, btnH, "✕", "#cc3333", D, () => {
      this.scene._showConfirm?.(`Xóa bạn ${friend.name}?`, () => {
        this.socket?.emit("friend:remove", { friend_id: friend.friend_uid ?? friend.id });
        this._friends = this._friends.filter(f => (f.friend_uid ?? f.id) !== (friend.friend_uid ?? friend.id));
        this._rebuildList();
      });
    });
  }

  /** Row lời mời kết bạn: tên + nút Đồng ý + Từ chối */
  _buildRequestRow(L, rowY, W, H, req, D) {
    const midY = rowY + H / 2;
    const push = o => { this._listObjs.push(o); return o; };

    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    rowBg.fillStyle(0x000000, 0.04);
    rowBg.fillRoundedRect(L, rowY + 2, W, H - 4, 8);

    const avR = 22, avX = L + 14 + avR;
    const avCircle = push(this.scene.add.graphics().setDepth(D + 2));
    avCircle.fillStyle(0x888888, 1);
    avCircle.fillCircle(avX, midY, avR + 2);
    avCircle.fillStyle(0xc4a865, 1);
    avCircle.fillCircle(avX, midY, avR);
    push(this.scene.add.text(avX, midY, (req.from_name || "?").slice(0, 2).toUpperCase(), {
      fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 3));

    push(this.scene.add.text(avX + avR + 12, midY, req.from_name || "?", {
      fontFamily: "Signika", fontSize: "15px", color: "#3a2000", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    const btnW = 70, btnH = 30;
    // Đồng ý
    this._buildTextBtn(L + W - 14 - btnW * 2 - 6, midY, btnW, btnH, "Đồng ý", 0x22aa55, D, () => {
      this.socket?.emit("friend:accept", { from_id: req.from_id });
      this._requests = this._requests.filter(r => r.from_id !== req.from_id);
      this._rebuildList();
    });
    // Từ chối
    this._buildTextBtn(L + W - 14 - btnW, midY, btnW, btnH, "Từ chối", 0xcc3333, D, () => {
      this.socket?.emit("friend:decline", { from_id: req.from_id });
      this._requests = this._requests.filter(r => r.from_id !== req.from_id);
      this._rebuildList();
    });
  }

  /** Row kết quả tìm kiếm: tên + nút Kết Bạn */
  _buildSearchRow(L, rowY, W, H, user, D) {
    const midY = rowY + H / 2;
    const push = o => { this._listObjs.push(o); return o; };

    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    rowBg.fillStyle(0x000000, 0.04);
    rowBg.fillRoundedRect(L, rowY + 2, W, H - 4, 8);

    const avR = 22, avX = L + 14 + avR;
    const avCircle = push(this.scene.add.graphics().setDepth(D + 2));
    avCircle.fillStyle(0x888888, 1);
    avCircle.fillCircle(avX, midY, avR + 2);
    avCircle.fillStyle(0xc4a865, 1);
    avCircle.fillCircle(avX, midY, avR);
    push(this.scene.add.text(avX, midY, (user.name || "?").slice(0, 2).toUpperCase(), {
      fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 3));

    push(this.scene.add.text(avX + avR + 12, midY - 8, user.name || "?", {
      fontFamily: "Signika", fontSize: "15px", color: "#3a2000", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));
    push(this.scene.add.text(avX + avR + 12, midY + 8, `@${user.username || ""}`, {
      fontFamily: "Signika", fontSize: "12px", color: "#8a6a30"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    this._buildTextBtn(L + W - 14 - 90, midY, 90, 30, "Kết Bạn", 0x1a6abf, D, () => {
      this.socket?.emit("friend:request", { to_id: user.id });
      this.scene._showToast?.(`Đã gửi lời mời tới ${user.name}!`);
    });
  }

  /** Nút icon nhỏ (emoji) */
  _buildIconBtn(cx, cy, w, h, icon, color, D, cb, disabled = false) {
    const push = o => { this._listObjs.push(o); return o; };
    const g = push(this.scene.add.graphics().setDepth(D + 2));
    const draw = (hover) => {
      g.clear();
      const c = Phaser.Display.Color.HexStringToColor(color).color;
      g.fillStyle(c, disabled ? 0.35 : (hover ? 0.9 : 0.75));
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
      g.lineStyle(1.5, 0xffffff, disabled ? 0.2 : 0.5);
      g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    };
    draw(false);
    push(this.scene.add.text(cx, cy, icon, { fontSize: "16px" }).setOrigin(0.5).setDepth(D + 3));
    if (!disabled && cb) {
      const zone = push(this.scene.add.zone(cx, cy, w, h).setInteractive({ cursor: "pointer" }).setDepth(D + 4));
      zone.on("pointerover",  () => draw(true));
      zone.on("pointerout",   () => draw(false));
      zone.on("pointerdown",  () => { this.scene.tweens.add({ targets: g, alpha: 0.5, duration: 60, yoyo: true }); cb(); });
    }
  }

  /** Nút text nhỏ */
  _buildTextBtn(x, cy, w, h, label, colorHex, D, cb) {
    const push = o => { this._listObjs.push(o); return o; };
    const g = push(this.scene.add.graphics().setDepth(D + 2));
    const draw = (hover) => {
      g.clear();
      g.fillStyle(colorHex, hover ? 1 : 0.8);
      g.fillRoundedRect(x, cy - h / 2, w, h, 6);
      g.lineStyle(1.5, 0xffffff, 0.4);
      g.strokeRoundedRect(x, cy - h / 2, w, h, 6);
    };
    draw(false);
    push(this.scene.add.text(x + w / 2, cy, label, {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 3));
    const zone = push(this.scene.add.zone(x + w / 2, cy, w, h).setInteractive({ cursor: "pointer" }).setDepth(D + 4));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => { this.scene.tweens.add({ targets: g, alpha: 0.5, duration: 60, yoyo: true }); cb(); });
  }

  // ── PRIVATE: Socket ─────────────────────────────────────────────

  _bindSocket() {
    if (!this.socket) return;

    this._onFriendList = (data) => {
      this._friends = data || [];
      if (this._tabIdx === 0) this._rebuildList();
    };
    this._onRequests = (data) => {
      this._requests = data || [];
      if (this._tabIdx === 1) this._rebuildList();
    };
    this._onSearchResult = (data) => {
      this._search = data || [];
      if (this._tabIdx === 2) this._rebuildList();
    };
    this._onRequestIncoming = (data) => {
      this._requests.unshift(data);
      if (this._tabIdx === 1) this._rebuildList();
    };
    this._onAcceptedNotify = (data) => {
      this.socket.emit("friend:list"); // refresh
    };
    this._onRemoved = ({ friend_id }) => {
      this._friends = this._friends.filter(f => (f.friend_uid ?? f.id) !== friend_id);
      if (this._tabIdx === 0) this._rebuildList();
    };

    this.socket.on("friend:list",             this._onFriendList);
    this.socket.on("friend:requests",         this._onRequests);
    this.socket.on("friend:search:result",    this._onSearchResult);
    this.socket.on("friend:request:incoming", this._onRequestIncoming);
    this.socket.on("friend:accepted:notify",  this._onAcceptedNotify);
    this.socket.on("friend:removed",          this._onRemoved);
  }

  _unbindSocket() {
    if (!this.socket) return;
    this.socket.off("friend:list",             this._onFriendList);
    this.socket.off("friend:requests",         this._onRequests);
    this.socket.off("friend:search:result",    this._onSearchResult);
    this.socket.off("friend:request:incoming", this._onRequestIncoming);
    this.socket.off("friend:accepted:notify",  this._onAcceptedNotify);
    this.socket.off("friend:removed",          this._onRemoved);
    if (this._searchKeyListener) {
      window.removeEventListener("keydown", this._searchKeyListener);
      this._searchKeyListener = null;
    }
  }
}
