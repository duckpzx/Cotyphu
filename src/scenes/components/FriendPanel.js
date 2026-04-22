/**
 * FriendPanel — Panel bạn bè cho LobbyScene
 * Phong cách: nền vàng kem BagScene, tab kiểu BagScene, nút X kiểu Chat (close_btn nhô góc)
 * Tabs: D.S Bạn Bè | Y.C Kết Bạn | Mời Bạn
 */
import PlayerProfilePanel from "./PlayerProfilePanel.js";
import { playTabSound } from "../../utils/clickSound.js";

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
    this._myUserId  = playerData?.user?.id || playerData?.id || null;
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
    // Cạnh dưới màu trắng nhẹ (đè lên border dưới)
    bg.lineStyle(3, 0xe9d5a8, 0.25);
    bg.beginPath();
    bg.moveTo(L + R, T + H);
    bg.lineTo(L + W - R, T + H);
    bg.strokePath();
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
          playTabSound(this.scene);
          this._tabIdx = i;
          this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
          this._rebuildList();
        }
      });
    });
    this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
    this._tabMeta = { TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP };

    // ── Nút X (close_btn nhô ra góc trên phải — kiểu Chat) ───────
    const closeR = 20;
    const closeX = L + W;
    const closeY = T;
    const closeBtn = push(this.scene.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(closeR * 2.2, closeR * 2.2).setDepth(D + 6));
    const closeZone = push(this.scene.add.zone(closeX, closeY, closeR * 2.6, closeR * 2.6)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7));
    closeZone.on("pointerover",  () => closeBtn.setAlpha(0.8));
    closeZone.on("pointerout",   () => closeBtn.setAlpha(1));
    closeZone.on("pointerdown",  () => this.destroy());

    // ── Toolbar: Sắp xếp + Tìm kiếm ─────────────────────────────
    const PAD   = 30; // padding cách viền đứt
    const BAR_Y = T + PAD;
    const BAR_H = 34;
    this._sortMode = "status"; // "status" | "alpha"
    this._buildToolbar(L, T, W, H, BAR_Y, BAR_H, PAD, D);

    // ── Vùng danh sách (cách viền đứt PAD mỗi bên) ───────────────
    this._listTop      = BAR_Y + BAR_H + 36;  // tăng gap để có chỗ cho nét đứt
    this._listH        = H - (BAR_Y - T) - BAR_H - 36 - PAD - 20;
    this._listL        = L + PAD;
    this._listW        = W - PAD * 2;
    this._listDashY    = BAR_Y + BAR_H + 18;  // giữa khoảng trống

    // ── Footer đếm bạn ───────────────────────────────────────────
    this._footerTxt = push(this.scene.add.text(L + W - PAD, T + H - 10, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#7a5a20"
    }).setOrigin(1, 1).setDepth(D + 2));

    // ── Bind socket ──────────────────────────────────────────────
    this._bindSocket();

    // ── Preload icon nút — đợi load xong mới emit để rebuildList có texture ──
    const iconsToLoad = [
      { key: "fr_chat",  path: "assets/ui/shared/f_chat.png"  },
      { key: "fr_close", path: "assets/ui/shared/f_close.png" },
      { key: "fr_join",  path: "assets/ui/shared/f_join.png"  },
    ];
    const missing = iconsToLoad.filter(i => !this.scene.textures.exists(i.key));

    const doEmit = () => {
      this.socket?.emit("friend:list");
      this.socket?.emit("friend:requests");
    };

    if (missing.length > 0) {
      let loaded = 0;
      const onOne = () => {
        loaded++;
        if (loaded >= missing.length) doEmit();
      };
      missing.forEach(i => {
        this.scene.load.once(`filecomplete-image-${i.key}`, onOne);
        this.scene.load.image(i.key, i.path);
      });
      this.scene.load.start();
    } else {
      doEmit();
    }

    return this;
  }

  destroy() {
    this._open = false;
    this._unbindSocket();
    this._clearList();
    this._profilePanel?.destroy();
    this._profilePanel = null;
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

  _buildToolbar(L, T, W, H, BAR_Y, BAR_H, PAD, D) {
    const push = o => { this._objs.push(o); return o; };

    // ── Label "Sắp xếp" ──────────────────────────────────────────
    push(this.scene.add.text(L + PAD, BAR_Y + BAR_H / 2, "Sắp xếp", {
      fontFamily: "Signika", fontSize: "14px", color: "#6b4a10", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── Nút sort toggle (TRẠNG THÁI ▶ / TÊN A-Z ▶) ───────────────
    const SORT_BW = 130, SORT_BH = BAR_H;
    const SORT_X  = L + PAD + 72;
    const SORT_Y  = BAR_Y;

    const sortG = push(this.scene.add.graphics().setDepth(D + 2));
    const sortTxt = push(this.scene.add.text(SORT_X + SORT_BW / 2 - 8, SORT_Y + SORT_BH / 2, "", {
      fontFamily: "Signika", fontSize: "14px",
      color: "#5a3200", fontStyle: "bold",
      stroke: "#f8e8b0", strokeThickness: 2
    }).setOrigin(0.5).setDepth(D + 3));
    const arrowTxt = push(this.scene.add.text(SORT_X + SORT_BW - 14, SORT_Y + SORT_BH / 2, "▶", {
      fontFamily: "Signika", fontSize: "16px",
      color: "#5a3200",
      stroke: "#f8e8b0", strokeThickness: 1.5
    }).setOrigin(0.5).setDepth(D + 3));

    const drawSort = () => {
        sortG.clear();
        // Bóng đổ
        sortG.fillStyle(0x5a3a00, 0.28);
        sortG.fillRoundedRect(SORT_X + 2, SORT_Y + 3, SORT_BW, SORT_BH, 10);
        // Nền gradient vàng nâu
        sortG.fillGradientStyle(0xf5d060, 0xf5d060, 0xc08820, 0xc08820, 1);
        sortG.fillRoundedRect(SORT_X, SORT_Y, SORT_BW, SORT_BH, 10);
        // Viền ngoài vàng nâu đậm
        sortG.lineStyle(1.5, 0x9d7d30, 1);
        sortG.strokeRoundedRect(SORT_X, SORT_Y, SORT_BW, SORT_BH, 10);
        // Gloss trên
        sortG.fillStyle(0xffffff, 0.32);
        sortG.fillRoundedRect(SORT_X + 4, SORT_Y + 3, SORT_BW - 8, SORT_BH * 0.38, 6);
        // Viền trong sáng
        sortG.lineStyle(1, 0xfff0a0, 0.4);
        sortG.strokeRoundedRect(SORT_X + 1, SORT_Y + 1, SORT_BW - 2, SORT_BH - 2, 9);
        sortTxt.setText(this._sortMode === "status" ? "TRẠNG THÁI" : "TÊN A-Z");
      };
    drawSort();

    const sortZone = push(this.scene.add.zone(SORT_X + SORT_BW / 2, SORT_Y + SORT_BH / 2, SORT_BW, SORT_BH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4));
    sortZone.on("pointerdown", () => {
      this._sortMode = this._sortMode === "status" ? "alpha" : "status";
      drawSort();
      this._rebuildList();
    });

    // ── Ô tìm kiếm (nửa phải) ────────────────────────────────────
    const SW = W * 0.40;
    const SX = L + W - PAD - SW;
    const SY = BAR_Y;
    const SH = BAR_H;

    const sbg = push(this.scene.add.graphics().setDepth(D + 2));
    // Bóng nhẹ
    sbg.fillStyle(0x5a3a00, 0.18);
    sbg.fillRoundedRect(SX + 2, SY + 3, SW, SH, 10);
    // Nền kem sáng
    sbg.fillGradientStyle(0xf5ead0, 0xf5ead0, 0xe8d4a8, 0xe8d4a8, 1);
    sbg.fillRoundedRect(SX, SY, SW, SH, 10);
    // Viền vàng nâu đồng bộ với nút sort
    sbg.lineStyle(1.5, 0x9d7d48, 0.9);
    sbg.strokeRoundedRect(SX, SY, SW, SH, 10);
    // Gloss nhẹ trên
    sbg.fillStyle(0xffffff, 0.30);
    sbg.fillRoundedRect(SX + 4, SY + 3, SW - 8, SH * 0.35, 6);
    // Viền trong sáng
    sbg.lineStyle(1, 0xfff0c0, 0.35);
    sbg.strokeRoundedRect(SX + 1, SY + 1, SW - 2, SH - 2, 9);

    this._searchPh = push(this.scene.add.text(SX + 12, SY + SH / 2, "Tìm theo tên", {
      fontFamily: "Signika", fontSize: "14px", color: "#b8922e"
    }).setOrigin(0, 0.5).setDepth(D + 3));

    this._searchTxt = push(this.scene.add.text(SX + 12, SY + SH / 2, "", {
      fontFamily: "Signika", fontSize: "14px", color: "#502700"
    }).setOrigin(0, 0.5).setDepth(D + 3));

    push(this.scene.add.image(SX + SW - 16, SY + SH / 2, "icon_search")
      .setDisplaySize(24, 24).setOrigin(0.9, 0.5).setDepth(D + 3));

    const zone = push(this.scene.add.zone(SX + SW / 2, SY + SH / 2, SW, SH)
      .setInteractive({ cursor: "text" }).setDepth(D + 4));
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
            if (this._tabIdx === 2) this.socket?.emit("friend:search", { query: this._searchQuery });
          } else if (e.key.length === 1) {
            this._searchQuery = (this._searchQuery || "") + e.key;
            this._searchTxt.setText(this._searchQuery);
            this._rebuildList();
          }
        };
        window.addEventListener("keydown", this._searchKeyListener);
      }
    });
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
    const ROW_GAP = 8; 
    const q = (this._searchQuery || "").toLowerCase();

    // ── Đường nét đứt phân cách toolbar / danh sách ──────────────
    const dashG = this.scene.add.graphics().setDepth(D + 2);
    dashG.lineStyle(1.65, 0x9d7d48, 0.7);
    const dashY      = this._listDashY ?? (T - 6);
    const dashLen    = 9, dashGap = 6;
    const dashTotalW = W * 0.69;
    const dashStartX = L + (W - dashTotalW) / 2;
    for (let x = dashStartX; x < dashStartX + dashTotalW; x += dashLen + dashGap) {
      dashG.beginPath();
      dashG.moveTo(x, dashY);
      dashG.lineTo(Math.min(x + dashLen, dashStartX + dashTotalW), dashY);
      dashG.strokePath();
    }
    this._listObjs.push(dashG);

    if (this._tabIdx === 0) {
      // ── D.S Bạn Bè ──────────────────────────────────────────────
      let list = [...this._friends];
      if (q) list = list.filter(f => (f.name || "").toLowerCase().includes(q));
      // Sắp xếp
      if (this._sortMode === "status") {
        // Online=3, Trong phòng=2, Trong trận=1, Offline=0
        list.sort((a, b) => {
          const rank = f => f.online && !f.in_game && !f.in_room ? 3
                          : f.in_room ? 2
                          : f.in_game ? 1
                          : 0;
          return rank(b) - rank(a);
        });
      } else {
        list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
      }

      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Chưa có bạn bè nào", "#b8922e", D);
      } else {
        list.forEach((f, i) => this._buildFriendRow(L, T + i * (ROW_H + ROW_GAP), W, ROW_H, f, D));
      }

      this._footerTxt?.setText(`${this._friends.length}/100 bạn`);

    } else if (this._tabIdx === 1) {
      // ── Y.C Kết Bạn ─────────────────────────────────────────────
      const list = this._requests;
      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Không có lời mời nào", "#b8922e", D);
      } else {
        list.forEach((r, i) => this._buildRequestRow(L, T + i * (ROW_H + ROW_GAP), W, ROW_H, r, D));
      }
      this._footerTxt?.setText("");

    } else {
      // ── Mời Bạn (tìm kiếm) ──────────────────────────────────────
      const list = this._search;
      if (!list.length) {
        this._pushListText(L + W / 2, T + 60, "Nhập tên để tìm kiếm", "#b8922e", D);
      } else {
        list.forEach((u, i) => this._buildSearchRow(L, T + i * (ROW_H + ROW_GAP), W, ROW_H, u, D));
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

  /** Row bạn bè: giống _buildRequestRow — avatar nhân vật + tên + online + nút Chat + Mời + Xóa */
  _buildFriendRow(L, rowY, W, H, friend, D) {
    const midY = rowY + H / 2;
    const push = o => { this._listObjs.push(o); return o; };

    // ── Nền row với chiều sâu ────────────────────────────────────
    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    const bx = L, by = rowY + 2, bw = W, bh = H - 4, br = 10;

    // Bóng đổ nhẹ phía dưới
    rowBg.fillStyle(0x7a5a20, 0.18);
    rowBg.fillRoundedRect(bx + 2, by + 3, bw, bh, br);

    // Nền gradient: sáng trên, tối dưới
    rowBg.fillGradientStyle(0xefd49a, 0xefd49a, 0xd4a85a, 0xd4a85a, 1);
    rowBg.fillRoundedRect(bx, by, bw, bh, br);

    // Viền ngoài vàng nâu đậm
    rowBg.lineStyle(1.5, 0x9d7d48, 0.95);
    rowBg.strokeRoundedRect(bx, by, bw, bh, br);

    // Highlight trên (trắng nhẹ tạo chiều sâu)
    rowBg.fillStyle(0xffffff, 0.22);
    rowBg.fillRoundedRect(bx + 4, by + 3, bw - 8, bh * 0.32, br - 2);

    // Viền trong sáng hơn (inset effect)
    rowBg.lineStyle(1, 0xfff0c0, 0.45);
    rowBg.strokeRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, br - 1);

    // ── Avatar circle với ảnh nhân vật ───────────────────────────
    const avR = 22;
    const avX = L + 14 + avR;

    const avCircle = push(this.scene.add.graphics().setDepth(D + 2));
    avCircle.lineStyle(2.5, 0x9d7d48, 1);
    avCircle.strokeCircle(avX, midY, avR);

    // Chấm trạng thái
    const dotColor = friend.in_game ? 0xe05030
                   : friend.in_room ? 0xe8a020
                   : friend.online  ? 0x3db85a
                   : 0x8a7a60;
    const dotBorder = friend.in_game ? 0xb83820
                    : friend.in_room ? 0xc07810
                    : friend.online  ? 0x2a9444
                    : 0x6a5a40;
    const dotG = push(this.scene.add.graphics().setDepth(D + 4));
    dotG.fillStyle(dotColor, 1);
    dotG.fillCircle(avX + avR - 4, midY + avR - 4, 6);
    dotG.lineStyle(1.5, dotBorder, 1);
    dotG.strokeCircle(avX + avR - 4, midY + avR - 4, 6);

    const charName = friend.character_name;
    const skinId   = friend.skin_id || 1;
    const frameKey = charName ? `${charName}_${skinId}_idle_000` : null;
    const imgPath  = charName
      ? `assets/characters/${charName}/${charName}_${skinId}/PNG/PNG Sequences/Idle Blinking/0_${charName}_Idle Blinking_000.png`
      : null;

    const renderAvatar = (key) => {
      if (key && this.scene.textures.exists(key)) {
        const maskG = this.scene.make.graphics({ add: false });
        maskG.fillStyle(0xffffff);
        maskG.fillCircle(avX, midY, avR - 1);
        const mask = maskG.createGeometryMask();
        const tex = this.scene.textures.get(key);
        const nat = tex.source[0];
        const scale = (avR * 2 / nat.width) * 2;
        const img = push(this.scene.add.image(avX, midY, key)
          .setOrigin(0.48, 0.45).setScale(scale).setDepth(D + 3));
        img.setMask(mask);
      } else {
        const avFill = push(this.scene.add.graphics().setDepth(D + 2));
        avFill.fillStyle(0xc4a865, 1);
        avFill.fillCircle(avX, midY, avR - 1);
        push(this.scene.add.text(avX, midY, (friend.name || "?").slice(0, 2).toUpperCase(), {
          fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(D + 3));
      }
    };

    if (frameKey && !this.scene.textures.exists(frameKey) && imgPath) {
      const onDone = () => {
        this.scene.load.off("filecomplete-image-" + frameKey, onDone);
        this.scene.load.off("loaderror", onDone);
        renderAvatar(frameKey);
      };
      this.scene.load.once("filecomplete-image-" + frameKey, onDone);
      this.scene.load.once("loaderror", onDone);
      this.scene.load.image(frameKey, imgPath);
      this.scene.load.start();
      const avFill = push(this.scene.add.graphics().setDepth(D + 2));
      avFill.fillStyle(0xc4a865, 1);
      avFill.fillCircle(avX, midY, avR - 1);
    } else {
      renderAvatar(frameKey);
    }

    // ── Tên + trạng thái ─────────────────────────────────────────
    push(this.scene.add.text(avX + avR + 12, midY - 9, friend.name || "?", {
      fontFamily: "Signika", fontSize: "15px", color: "#3a2000", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    push(this.scene.add.text(avX + avR + 12, midY + 9,
      friend.in_game ? "Trong trận"
    : friend.in_room ? "Trong phòng"
    : friend.online  ? "Online"
    : "Offline", {
      fontFamily: "Signika", fontSize: "12px",
      color: friend.in_game ? "#e05030"
           : friend.in_room ? "#c88010"
           : friend.online  ? "#2a9444"
           : "#7a6a50"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── Click avatar/tên → mở PlayerProfilePanel ─────────────────
    const openProfile = () => {
      if (this._profilePanel) { this._profilePanel.destroy(); this._profilePanel = null; }
      const { width, height } = this.scene.scale;
      this._profilePanel = new PlayerProfilePanel(this.scene, {
        socket: this.socket,
        depth:  this.depth + 50,
      });
      this._profilePanel.open(width, height, {
        user_id:        friend.friend_uid ?? friend.id,
        name:           friend.name,
        character_name: friend.character_name || "Unknown",
        skin_id:        friend.skin_id || 1,
      }, this._myUserId);
    };
    const clickW = avR * 2 + 12 + 120;
    push(this.scene.add.zone(L + 14 + clickW / 2, midY, clickW, H - 8)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 5))
      .on("pointerdown", openProfile);

    // ── Nút Chat (icon) + Mời (icon) + Xóa (icon) ───────────────
    const iconSize = 38;
    const btnGap = 10;

    // Xóa — sát phải
    const btn3X = L + W - 14 - iconSize / 2;
    // Mời — giữa
    const btn2X = btn3X - iconSize - btnGap;
    // Chat — trái nhất
    const btn1X = btn2X - iconSize - btnGap;

    // Nút Chat — chỉ active khi online
    if (friend.online) {
      this._buildImgIconBtn(btn1X, midY, iconSize, "fr_chat", D, () => {
        this.scene.events.emit("friend:open_pm", friend);
      });
    } else {
      this._buildImgIconBtn(btn1X, midY, iconSize, "fr_chat", D, null, true);
    }

    // Nút Mời phòng — chỉ active khi bạn online và không trong trận/phòng
    if (friend.online && !friend.in_game && !friend.in_room) {
      this._buildImgIconBtn(btn2X, midY, iconSize, "fr_join", D, () => {
        const roomId = this.scene.registry.get("currentRoomId");
        if (!roomId) { this.scene._showToast?.("Bạn chưa ở trong phòng nào!"); return; }
        this.socket?.emit("room:invite", { to_id: friend.friend_uid ?? friend.id, room_id: roomId });
        this.scene._showToast?.(`Đã mời ${friend.name} vào phòng!`);
      });
    } else {
      this._buildImgIconBtn(btn2X, midY, iconSize, "fr_join", D, null, true);
    }

    // Nút Xóa bạn — icon
    this._buildImgIconBtn(btn3X, midY, iconSize, "fr_close", D, () => {
      this.scene._showConfirm?.(`Xóa bạn ${friend.name}?`, () => {
        this.socket?.emit("friend:remove", { friend_id: friend.friend_uid ?? friend.id });
        this._friends = this._friends.filter(f => (f.friend_uid ?? f.id) !== (friend.friend_uid ?? friend.id));
        this._rebuildList();
      });
    });
  }

  /** Row lời mời kết bạn: avatar nhân vật + tên + nút Đồng ý + Từ chối */
  _buildRequestRow(L, rowY, W, H, req, D) {
    const midY = rowY + H / 2;
    const push = o => { this._listObjs.push(o); return o; };

    // Nền row
    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    rowBg.fillStyle(0xe0c089, 1);
    rowBg.fillRoundedRect(L, rowY + 2, W, H - 4, 8);

    // Border thủ công gradient: trên đậm (0x9d7d48 alpha 1), dưới trắng nhẹ (0xffffff alpha 0.45)
    const bx = L, by = rowY + 2, bw = W, bh = H - 4, br = 8;

    // -- Cạnh trên + 2 góc trên: màu đậm
    rowBg.lineStyle(2, 0x9d7d48, 1);
    rowBg.beginPath();
    rowBg.arc(bx + br,      by + br,      br, Math.PI,        Math.PI * 1.5, false); // góc trên trái
    rowBg.lineTo(bx + bw - br, by);                                                   // cạnh trên
    rowBg.arc(bx + bw - br, by + br,      br, Math.PI * 1.5,  0,             false); // góc trên phải
    rowBg.strokePath();

    rowBg.lineStyle(1, 0xffffff, 0.4); // mỏng + nhạt

    // -- Cạnh dưới + 2 góc dưới: màu trắng nhẹ
    rowBg.lineStyle(1.5, 0xffffff, 0.45);
    rowBg.beginPath();
    rowBg.arc(bx + bw - br, by + bh - br, br, 0,              Math.PI * 0.5, false); // góc dưới phải
    rowBg.lineTo(bx + br,   by + bh);                                                 // cạnh dưới
    rowBg.arc(bx + br,      by + bh - br, br, Math.PI * 0.5,  Math.PI,       false); // góc dưới trái
    rowBg.strokePath();

    const STEPS = 12;
    const sideTop = by + br, sideBot = by + bh, sideH = sideBot - sideTop;
    for (let i = 0; i < STEPS; i++) {
      const t0 = i / STEPS, t1 = (i + 1) / STEPS;
      const alpha = 1 - t0 * (1 - 0.0);
      const color = t0 < 0.5 ? 0x9d7d48 : 0xcfa975;
      const a     = t0 < 0.5 ? (1 - t0 * 2) * 1.0 + t0 * 2 * 0.45 : 0.45;
      rowBg.lineStyle(1.5, color, Math.max(0, 1 - t0 * (1 - 0.45) * 2));
      // cạnh trái
      rowBg.beginPath();
      rowBg.moveTo(bx, sideTop + t0 * sideH);
      rowBg.lineTo(bx, sideTop + t1 * sideH);
      rowBg.strokePath();
      // cạnh phải
      rowBg.beginPath();
      rowBg.moveTo(bx + bw, sideTop + t0 * sideH);
      rowBg.lineTo(bx + bw, sideTop + t1 * sideH);
      rowBg.strokePath();
    }

    // ── Avatar circle với ảnh nhân vật ───────────────────────────
    const avR = 22;
    const avX = L + 14 + avR;

    // Viền circle
    const avCircle = push(this.scene.add.graphics().setDepth(D + 2));
    avCircle.lineStyle(2.5, 0xaa8a54, 0.5);
    avCircle.strokeCircle(avX, midY, avR);

    const charName = req.character_name;
    const skinId   = req.skin_id || 1;
    // Key và path giống hệt RoomScene._preloadPlayerSkins
    const frameKey = charName ? `${charName}_${skinId}_idle_000` : null;
    const imgPath  = charName
      ? `assets/characters/${charName}/${charName}_${skinId}/PNG/PNG Sequences/Idle Blinking/0_${charName}_Idle Blinking_000.png`
      : null;

    const renderAvatar = (key) => {
      if (key && this.scene.textures.exists(key)) {
        const maskG = this.scene.make.graphics({ add: false });
        maskG.fillStyle(0xffffff);
        maskG.fillCircle(avX, midY, avR - 1);
        const mask = maskG.createGeometryMask();

        const tex = this.scene.textures.get(key);
        const nat = tex.source[0];
        const scale = (avR * 2 / nat.width) * 2;
        const img = push(this.scene.add.image(avX, midY, key)
          .setOrigin(0.48, 0.45).setScale(scale).setDepth(D + 3));
        img.setMask(mask);
      } else {
        const avFill = push(this.scene.add.graphics().setDepth(D + 2));
        avFill.fillStyle(0xc4a865, 1);
        avFill.fillCircle(avX, midY, avR - 1);
        push(this.scene.add.text(avX, midY, (req.from_name || "?").slice(0, 2).toUpperCase(), {
          fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(D + 3));
      }
    };

    if (frameKey && !this.scene.textures.exists(frameKey) && imgPath) {
      // Load ảnh rồi render
      const onDone = () => {
        this.scene.load.off("filecomplete-image-" + frameKey, onDone);
        this.scene.load.off("loaderror", onDone);
        renderAvatar(frameKey);
      };
      this.scene.load.once("filecomplete-image-" + frameKey, onDone);
      this.scene.load.once("loaderror", onDone);
      this.scene.load.image(frameKey, imgPath);
      this.scene.load.start();
      // Hiện fallback trong lúc chờ load
      const avFill = push(this.scene.add.graphics().setDepth(D + 2));
      avFill.fillStyle(0xc4a865, 1);
      avFill.fillCircle(avX, midY, avR - 1);
    } else {
      renderAvatar(frameKey);
    }

    // Tên
    push(this.scene.add.text(avX + avR + 12, midY, req.from_name || "?", {
      fontFamily: "Signika", fontSize: "15px", color: "#3a2000", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── Click avatar hoặc tên → mở PlayerProfilePanel ────────────
    const openProfile = () => {
      if (this._profilePanel) { this._profilePanel.destroy(); this._profilePanel = null; }
      const { width, height } = this.scene.scale;
      this._profilePanel = new PlayerProfilePanel(this.scene, {
        socket: this.socket,
        depth:  this.depth + 50,
      });
      this._profilePanel.open(width, height, {
        user_id:        req.from_id ?? req.user_id,
        name:           req.from_name,
        character_name: req.character_name || "Unknown",
        skin_id:        req.skin_id || 1,
      }, this._myUserId);
    };
    // Zone phủ avatar + tên (nửa trái row)
    const clickW = avR * 2 + 12 + 120;
    push(this.scene.add.zone(L + 14 + clickW / 2, midY, clickW, H - 8)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 5))
      .on("pointerdown", openProfile);

    // ── Nút Đồng ý + Từ chối (pill style) ───────────────────────
    const btnW = 88, btnH = 32, btnGap = 8;
    const btn2X = L + W - 14 - btnW / 2;
    const btn1X = btn2X - btnW - btnGap;

    this._buildPillBtnList(btn1X, midY, btnW, btnH, 0x18a84a, 0x24d166, "Đồng ý", D, () => {
      this.socket?.emit("friend:accept", { from_id: req.from_id ?? req.user_id });
      this._requests = this._requests.filter(r => (r.from_id ?? r.user_id) !== (req.from_id ?? req.user_id));
      this._rebuildList();
    });
    this._buildPillBtnList(btn2X, midY, btnW, btnH, 0xc63a4a, 0xef5b6a, "Từ chối", D, () => {
      this.socket?.emit("friend:decline", { from_id: req.from_id ?? req.user_id });
      this._requests = this._requests.filter(r => (r.from_id ?? r.user_id) !== (req.from_id ?? req.user_id));
      this._rebuildList();
    });
  }

  /** Pill button dùng trong list (giống RoomListScene._buildPillBtn) */
  _buildPillBtnList(bx, by, bw, bh, c1, c2, label, D, cb) {
    const push = o => { this._listObjs.push(o); return o; };
    const br = bh / 2;
    const g  = push(this.scene.add.graphics().setDepth(D + 2));
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(c1, 0.18);
      g.fillRoundedRect(bx - bw/2 - 3, by - bh/2 - 3, bw + 6, bh + 6, br + 2);
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(bx - bw/2 + 2, by - bh/2 + 4, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.38 : 0.22);
      g.fillRoundedRect(bx - bw/2 + 6, by - bh/2 + 4, bw - 12, bh * 0.35, br - 3);
      g.lineStyle(1.5, 0xffffff, hover ? 0.7 : 0.45);
      g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
    };
    draw(false);
    push(this.scene.add.text(bx, by, label, {
      fontFamily: "Signika", fontSize: "14px", color: "#ffffff",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 2.5,
    }).setOrigin(0.5).setDepth(D + 3));
    const zone = push(this.scene.add.zone(bx, by, bw, bh)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      this.scene.tweens?.add({ targets: g, alpha: 0.6, duration: 60, yoyo: true });
      cb();
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
      fontFamily: "Signika", fontSize: "15px", color: "#  3a2000", fontStyle: "bold"
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

  /** Nút icon dạng ảnh — không nền, chỉ icon + hover effect */
  _buildImgIconBtn(cx, cy, size, textureKey, D, cb, disabled = false) {
    const push = o => { this._listObjs.push(o); return o; };

    const img = push(this.scene.add.image(cx, cy, textureKey)
      .setDisplaySize(size, size)
      .setAlpha(disabled ? 0.35 : 1)
      .setDepth(D + 3));

    if (!disabled && cb) {
      const zone = push(this.scene.add.zone(cx, cy, size, size)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 4));
      zone.on("pointerover",  () => img.setAlpha(0.75));
      zone.on("pointerout",   () => img.setAlpha(1));
      zone.on("pointerdown",  () => {
        this.scene.tweens.add({ targets: img, alpha: 0.4, duration: 60, yoyo: true });
        cb();
      });
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
