/**
 * FriendPanel — Panel bạn bè cho LobbyScene
 * Phong cách: nền vàng kem BagScene, tab kiểu BagScene, nút X kiểu Chat (close_btn nhô góc)
 * Tabs: D.S Bạn Bè | Y.C Kết Bạn | Mời Bạn
 */
import PlayerProfilePanel from "./PlayerProfilePanel.js";
import { playTabSound } from "../../utils/clickSound.js";
import { renderAvatarBadge } from "../../utils/avatarBadge.js";
import { drawCreamModalPanel, drawCreamInnerBox } from "../../utils/creamPanel.js";

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

  /**
   * Tạo màu gradient ngẫu nhiên dựa trên tên người dùng
   * @param {string} name - Tên người dùng
   * @returns {{ color1: number, color2: number }} - 2 màu cho gradient
   */
  _getAvatarColors(name) {
    if (!name) name = "?";
    
    // Tạo hash từ tên để có màu nhất quán cho cùng 1 tên
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Tạo hue từ hash (0-360 độ)
    const hue = Math.abs(hash % 360);
    
    // Saturation cao (60-80%) để màu sắc rõ ràng
    const sat1 = 60 + (Math.abs(hash >> 8) % 20);
    const sat2 = 65 + (Math.abs(hash >> 16) % 15);
    
    // Lightness vừa phải (45-65%) để dễ đọc chữ trắng
    const light1 = 45 + (Math.abs(hash >> 12) % 20);
    const light2 = 50 + (Math.abs(hash >> 20) % 15);
    
    // Convert HSL to RGB
    const hslToRgb = (h, s, l) => {
      s /= 100;
      l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [
        Math.round(255 * f(0)),
        Math.round(255 * f(8)),
        Math.round(255 * f(4))
      ];
    };
    
    const [r1, g1, b1] = hslToRgb(hue, sat1, light1);
    const [r2, g2, b2] = hslToRgb(hue, sat2, light2);
    
    const color1 = (r1 << 16) | (g1 << 8) | b1;
    const color2 = (r2 << 16) | (g2 << 8) | b2;
    
    return { color1, color2 };
  }

  // ── PUBLIC ──────────────────────────────────────────────────────

  build(width, height) {
    this._width  = width;
    this._height = height;
    this._open   = true;

    const W      = 640;
    const H      = 480;
    const TAB_H  = 46; // chiều cao tab (giữ nguyên phong cách 3 tab)
    const TOTAL_H = H + TAB_H; // tổng chiều cao cả tab + panel
    const CX = width  / 2;
    const CY = height / 2;
    const L  = CX - W / 2;
    const T  = CY - TOTAL_H / 2 + TAB_H; // top của panel body, tab nằm phía trên
    const R  = 22;
    const D  = this.depth;

    this._panelL = L; this._panelT = T;
    this._panelW = W; this._panelH = H;

    const push = o => { this._objs.push(o); return o; };

    // ── Overlay tối toàn màn hình ─────────────────────────────────
    const overlay = push(this.scene.add.graphics().setDepth(D - 1));
    overlay.fillStyle(0x0c0a08, 0.62);
    overlay.fillRect(0, 0, width, height);
    // Click ra ngoài để đóng
    const overlayZone = push(this.scene.add.zone(width / 2, height / 2, width, height)
      .setInteractive().setDepth(D - 1));
    overlayZone.on("pointerdown", () => this.destroy());

    // ── Panel ngoài đồng bộ Nạp Tiền (tái sử dụng creamPanel.js) ──
    drawCreamModalPanel(this.scene, {
      left: L,
      top: T,
      width: W,
      height: H,
      radius: R,
      depth: D,
      title: null,
      onClose: () => this.destroy(),
      push,
    });

    // Zone chặn click lan xuống overlay
    push(this.scene.add.zone(L + W / 2, T + H / 2, W, H)
      .setInteractive().setDepth(D + 1));

    // ── Tabs (giữ nguyên phong cách 3 tab phía trên) ─────────────
    const TAB_LABELS = ["D.S Bạn Bè", "Y.C Kết Bạn", "Tìm Kiếm"];
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
          // Khi bấm tab Y.C Kết Bạn → xóa badge tab + thông báo lobby
          if (i === 1) {
            this.scene.events.emit("friendrequest:count", 0);
          }
          this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
          this._rebuildList();
        }
      });
    });
    this._drawTabs(TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP);
    this._tabMeta = { TAB_START, TAB_Y, TAB_W, TAB_H, TAB_GAP };

    // ── 2 khung nội dung kem sáng (tái sử dụng drawCreamInnerBox) ──
    const BOX_X    = L + 22;
    const BOX_W    = W - 44;
    const TOP_BOX_Y = T + 22;
    const TOP_BOX_H = 54;
    const MAIN_BOX_Y = TOP_BOX_Y + TOP_BOX_H + 12;
    const MAIN_BOX_H = H - (MAIN_BOX_Y - T) - 22;

    drawCreamInnerBox(this.scene, {
      left: BOX_X, top: TOP_BOX_Y, width: BOX_W, height: TOP_BOX_H,
      radius: 14, depth: D + 1, fillColor: 0xfffaea, fillAlpha: 0.88, borderAlpha: 0.48, push,
    });
    drawCreamInnerBox(this.scene, {
      left: BOX_X, top: MAIN_BOX_Y, width: BOX_W, height: MAIN_BOX_H,
      radius: 14, depth: D + 1, fillColor: 0xfffbee, fillAlpha: 0.92, borderAlpha: 0.52, push,
    });

    // ── Toolbar bên trong khung trên ─────────────────────────────
    const PAD   = 36;
    const BAR_H = 34;
    const BAR_Y = TOP_BOX_Y + (TOP_BOX_H - BAR_H) / 2;
    this._sortMode = "status"; // "status" | "alpha"
    this._buildToolbar(L, T, W, H, BAR_Y, BAR_H, PAD, D);

    // ── Vùng danh sách nằm gọn trong khung chính dưới ────────────
    this._listTop      = MAIN_BOX_Y + 14;
    this._listH        = MAIN_BOX_H - 42;
    this._listL        = BOX_X + 14;
    this._listW        = BOX_W - 28;
    this._listDashY    = null;

    // ── Footer đếm bạn nằm góc dưới phải khung chính ─────────────
    this._footerTxt = push(this.scene.add.text(BOX_X + BOX_W - 14, MAIN_BOX_Y + MAIN_BOX_H - 10, "", {
      fontFamily: "Signika", fontSize: "12.5px", color: "#7c4d14", fontStyle: "bold"
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
    // Khớp chuẩn CSS của bảng Nạp Tiền: inset 9px, border 1.8px dashed rgba(184,146,46,0.55), radius 15px
    const ins = 9;
    const cr  = Math.max(8, R - 7);
    const dashLen = 5.5;
    const step    = 10;
    g.lineStyle(1.8, 0xb8922e, 0.58);
    const drawD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += step) {
        g.beginPath();
        g.moveTo(x1 + Math.cos(ang) * d,                          y1 + Math.sin(ang) * d);
        g.lineTo(x1 + Math.cos(ang) * Math.min(d + dashLen, dist), y1 + Math.sin(ang) * Math.min(d + dashLen, dist));
        g.strokePath();
      }
    };
    const drawArc = (cx, cy, r, a1, a2) => {
      const arcLen = r * Math.abs(a2 - a1);
      const steps  = Math.max(2, Math.round(arcLen / step));
      for (let i = 0; i < steps; i++) {
        const s = a1 + (a2 - a1) * (i / steps);
        const e = a1 + (a2 - a1) * Math.min((i + dashLen / step) / steps, 1);
        g.beginPath(); g.arc(cx, cy, r, s, e); g.strokePath();
      }
    };
    drawD(L + ins + cr, T + ins, L + W - ins - cr, T + ins);
    drawD(L + W - ins, T + ins + cr, L + W - ins, T + H - ins - cr);
    drawD(L + W - ins - cr, T + H - ins, L + ins + cr, T + H - ins);
    drawD(L + ins, T + H - ins - cr, L + ins, T + ins + cr);
    drawArc(L + ins + cr,     T + ins + cr,     cr, Math.PI,       Math.PI * 1.5);
    drawArc(L + W - ins - cr, T + ins + cr,     cr, Math.PI * 1.5, Math.PI * 2);
    drawArc(L + W - ins - cr, T + H - ins - cr, cr, 0,             Math.PI * 0.5);
    drawArc(L + ins + cr,     T + H - ins - cr, cr, Math.PI * 0.5, Math.PI);
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

    // ── Badge đỏ trên tab "Y.C Kết Bạn" (index 1) ───────────────
    this._updateRequestTabBadge();
  }

  _updateRequestTabBadge() {
    // Xóa badge cũ
    if (this._reqTabBadgeG)   { try { this._reqTabBadgeG.destroy();   } catch(e){} this._reqTabBadgeG   = null; }
    if (this._reqTabBadgeTxt) { try { this._reqTabBadgeTxt.destroy(); } catch(e){} this._reqTabBadgeTxt = null; }

    const count = this._requests?.length || 0;
    // Chỉ hiện khi có request VÀ không đang ở tab Y.C Kết Bạn
    if (count <= 0 || this._tabIdx === 1) return;

    const { TAB_START, TAB_Y, TAB_W, TAB_GAP } = this._tabMeta || {};
    if (TAB_START === undefined) return;

    const D   = this.depth;
    const tx  = TAB_START + 1 * (TAB_W + TAB_GAP); // tab index 1
    const bR  = 10;
    const bX  = tx + TAB_W - bR + 2;
    const bY  = TAB_Y - bR + 2;
    const label = count > 99 ? "99+" : String(count);

    this._reqTabBadgeG = this.scene.add.graphics().setDepth(D + 8);
    this._reqTabBadgeG.fillStyle(0xdd2222, 1);
    this._reqTabBadgeG.fillCircle(bX, bY, bR);

    this._reqTabBadgeTxt = this.scene.add.text(bX, bY, label, {
      fontFamily: "Signika", fontSize: "10px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 9);

    // Thêm vào _objs để tự destroy khi panel đóng
    this._objs.push(this._reqTabBadgeG, this._reqTabBadgeTxt);
  }

  _buildToolbar(L, T, W, H, BAR_Y, BAR_H, PAD, D) {
    const push = o => { this._objs.push(o); return o; };

    // ── Label "Sắp xếp" ──────────────────────────────────────────
    push(this.scene.add.text(L + PAD, BAR_Y + BAR_H / 2, "Sắp xếp", {
      fontFamily: "Signika", fontSize: "13.5px", color: "#6b3b09", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── Nút sort pill xanh bóng (giống pill đang chọn của Nạp Tiền) ──
    const SORT_BW = 132, SORT_BH = 32;
    const SORT_X  = L + PAD + 66;
    const SORT_Y  = BAR_Y + (BAR_H - SORT_BH) / 2;
    const SORT_R  = SORT_BH / 2;

    const sortG = push(this.scene.add.graphics().setDepth(D + 2));
    const sortTxt = push(this.scene.add.text(SORT_X + SORT_BW / 2 - 7, SORT_Y + SORT_BH / 2, "", {
      fontFamily: "Signika", fontSize: "13px",
      color: "#ffffff", fontStyle: "bold",
      stroke: "#00375f", strokeThickness: 2.5
    }).setOrigin(0.5).setDepth(D + 3));
    const arrowTxt = push(this.scene.add.text(SORT_X + SORT_BW - 15, SORT_Y + SORT_BH / 2, "▶", {
      fontFamily: "Signika", fontSize: "12px",
      color: "#ffffff",
      stroke: "#00375f", strokeThickness: 2
    }).setOrigin(0.5).setDepth(D + 3));

    const drawSort = (hover = false) => {
      sortG.clear();
      // Bóng xanh dịu
      sortG.fillStyle(0x0284c7, 0.28);
      sortG.fillRoundedRect(SORT_X + 1, SORT_Y + 3, SORT_BW, SORT_BH, SORT_R);
      // Gradient xanh cyan bóng giống pill active Nạp Tiền
      sortG.fillGradientStyle(hover ? 0x62dcff : 0x4bd5ff, hover ? 0x62dcff : 0x4bd5ff, 0x0284c7, 0x0284c7, 1);
      sortG.fillRoundedRect(SORT_X, SORT_Y, SORT_BW, SORT_BH, SORT_R);
      // Gloss trắng trên
      sortG.fillStyle(0xffffff, 0.34);
      sortG.fillRoundedRect(SORT_X + 8, SORT_Y + 3, SORT_BW - 16, SORT_BH * 0.38, SORT_R - 4);
      // Viền xanh đậm
      sortG.lineStyle(1.8, 0x0284c7, 1);
      sortG.strokeRoundedRect(SORT_X, SORT_Y, SORT_BW, SORT_BH, SORT_R);
      sortTxt.setText(this._sortMode === "status" ? "TRẠNG THÁI" : "TÊN A-Z");
    };
    drawSort(false);

    const sortZone = push(this.scene.add.zone(SORT_X + SORT_BW / 2, SORT_Y + SORT_BH / 2, SORT_BW, SORT_BH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4));
    sortZone.on("pointerover", () => drawSort(true));
    sortZone.on("pointerout",  () => drawSort(false));
    sortZone.on("pointerdown", () => {
      this._sortMode = this._sortMode === "status" ? "alpha" : "status";
      drawSort(true);
      this._rebuildList();
    });

    // ── Ô tìm kiếm dạng pill kem sáng (đồng bộ Nạp Tiền) ─────────
    const SW = W * 0.42;
    const SX = L + W - PAD - SW;
    const SH = 32;
    const SY = BAR_Y + (BAR_H - SH) / 2;
    const SR = SH / 2;

    const sbg = push(this.scene.add.graphics().setDepth(D + 2));
    sbg.fillStyle(0x5a3200, 0.08);
    sbg.fillRoundedRect(SX + 1, SY + 2, SW, SH, SR);
    sbg.fillGradientStyle(0xfffdf5, 0xfffdf5, 0xf7ebd0, 0xf7ebd0, 1);
    sbg.fillRoundedRect(SX, SY, SW, SH, SR);
    sbg.lineStyle(1.6, 0xc9a76a, 0.9);
    sbg.strokeRoundedRect(SX, SY, SW, SH, SR);

    this._searchPh = push(this.scene.add.text(SX + 14, SY + SH / 2, "Tìm theo tên", {
      fontFamily: "Signika", fontSize: "13.5px", color: "#b08a42"
    }).setOrigin(0, 0.5).setDepth(D + 3));

    this._searchTxt = push(this.scene.add.text(SX + 14, SY + SH / 2, "", {
      fontFamily: "Signika", fontSize: "13.5px", color: "#3f1d00", fontStyle: "bold"
    }).setOrigin(0, 0.5).setDepth(D + 3));

    push(this.scene.add.image(SX + SW - 14, SY + SH / 2, "icon_search")
      .setDisplaySize(20, 20).setOrigin(0.9, 0.5).setDepth(D + 3));

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
    // Xóa scroll state
    if (this._scrollContainer) {
      try { this._scrollContainer.destroy(); } catch(e){}
      this._scrollContainer = null;
    }
    if (this._scrollMaskShape) {
      try { this._scrollMaskShape.destroy(); } catch(e){}
      this._scrollMaskShape = null;
    }
    if (this._scrollbar) {
      try { this._scrollbar.destroy(); } catch(e){}
      this._scrollbar = null;
    }
    if (this._scrollbarTrack) {
      try { this._scrollbarTrack.destroy(); } catch(e){}
      this._scrollbarTrack = null;
    }
    this.scene.input.off("wheel", this._onWheel);
    this._onWheel = null;
  }

  _rebuildList() {
    this._clearList();
    const D = this.depth;
    const L = this._listL, W = this._listW;
    const T = this._listTop;
    const ROW_H = 58;
    const ROW_GAP = 8;
    const q = (this._searchQuery || "").toLowerCase();

    // ── Sentinel để cắt rowObjs khi scroll (đã có 2 khung kem riêng biệt nên không cần nét đứt giữa) ──
    const dashG = this.scene.add.graphics().setDepth(D + 2);
    this._listObjs.push(dashG);

    // ── Lấy danh sách cần render ──────────────────────────────────
    let list = [];
    let emptyMsg = "";

    if (this._tabIdx === 0) {
      list = [...this._friends];
      if (q) list = list.filter(f => (f.name || "").toLowerCase().includes(q));
      if (this._sortMode === "status") {
        list.sort((a, b) => {
          const rank = f => f.online && !f.in_game && !f.in_room ? 3
                          : f.in_room ? 2 : f.in_game ? 1 : 0;
          return rank(b) - rank(a);
        });
      } else {
        list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
      }
      emptyMsg = "Chưa có bạn bè nào";
      this._footerTxt?.setText(`${this._friends.length}/100 bạn`);
    } else if (this._tabIdx === 1) {
      list = this._requests;
      emptyMsg = "Không có lời mời nào";
      this._footerTxt?.setText("");
    } else {
      list = this._search;
      emptyMsg = "Nhập tên để tìm kiếm";
      this._footerTxt?.setText("");
    }

    if (!list.length) {
      this._pushListText(L + W / 2, T + 60, emptyMsg, "#b8922e", D);
      return;
    }

    // ── Tính tổng chiều cao nội dung ──────────────────────────────
    const totalContentH = list.length * (ROW_H + ROW_GAP) - ROW_GAP;
    const visibleH      = this._listH;

    // ── Tạo scroll container ──────────────────────────────────────
    // Container đặt tại (0,0), các row render theo tọa độ tuyệt đối
    // rồi offset bằng container.y
    const container = this.scene.add.container(0, 0).setDepth(D + 1);
    this._scrollContainer = container;
    this._listObjs.push(container);

    // Render tất cả rows vào container (tọa độ local = tọa độ scene - offsetY)
    const renderRows = () => {
      // Xóa children cũ của container
      container.removeAll(true);

      list.forEach((item, i) => {
        const rowY = T + i * (ROW_H + ROW_GAP) + (container._scrollY || 0);
        if (this._tabIdx === 0) {
          this._buildFriendRow(L, rowY, W, ROW_H, item, D);
        } else if (this._tabIdx === 1) {
          this._buildRequestRow(L, rowY, W, ROW_H, item, D);
        } else {
          this._buildSearchRow(L, rowY, W, ROW_H, item, D);
        }
      });
    };

    // Dùng cách đơn giản hơn: render rows bình thường nhưng dùng mask để clip
    // và dịch chuyển tất cả objects theo scrollY

    // Render rows lần đầu
    container._scrollY = 0;
    list.forEach((item, i) => {
      const rowY = T + i * (ROW_H + ROW_GAP);
      if (this._tabIdx === 0)      this._buildFriendRow(L, rowY, W, ROW_H, item, D);
      else if (this._tabIdx === 1) this._buildRequestRow(L, rowY, W, ROW_H, item, D);
      else                         this._buildSearchRow(L, rowY, W, ROW_H, item, D);
    });

    // Lấy các row objects (tất cả objects được push sau dashG)
    const dashIdx = this._listObjs.indexOf(dashG);
    const rowObjs = this._listObjs.slice(dashIdx + 1);

    // ── Geometry Mask để clip vùng list ──────────────────────────
    const maskShape = this.scene.make.graphics({ add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(L - 2, T, W + 4, visibleH);
    const geomMask = maskShape.createGeometryMask();
    this._scrollMaskShape = maskShape;

    rowObjs.forEach(o => {
      try { o?.setMask?.(geomMask); } catch(e){}
    });

    // Nếu nội dung không vượt quá vùng hiển thị → không cần scroll
    if (totalContentH <= visibleH) return;

    // ── Scrollbar track ───────────────────────────────────────────
    const SB_W  = 6;
    const SB_X  = L + W + 8;
    const SB_TY = T;
    const SB_H  = visibleH;

    const trackG = this.scene.add.graphics().setDepth(D + 3);
    trackG.fillStyle(0x9d7d48, 0.25);
    trackG.fillRoundedRect(SB_X, SB_TY, SB_W, SB_H, 3);
    this._scrollbarTrack = trackG;
    this._listObjs.push(trackG);

    const thumbH   = Math.max(30, (visibleH / totalContentH) * SB_H);
    const thumbG   = this.scene.add.graphics().setDepth(D + 4);
    this._scrollbar = thumbG;
    this._listObjs.push(thumbG);

    let scrollY = 0;
    const maxScroll = totalContentH - visibleH;

    const drawThumb = () => {
      thumbG.clear();
      const ratio  = scrollY / maxScroll;
      const thumbY = SB_TY + ratio * (SB_H - thumbH);
      thumbG.fillStyle(0x9d7d48, 0.85);
      thumbG.fillRoundedRect(SB_X, thumbY, SB_W, thumbH, 3);
    };
    drawThumb();

    // ── Hàm scroll ───────────────────────────────────────────────
    const doScroll = (delta) => {
      scrollY = Phaser.Math.Clamp(scrollY + delta, 0, maxScroll);
      const offset = -scrollY;
      rowObjs.forEach(o => {
        if (!o || o._scrollBaseY === undefined) return;
        try { o.y = o._scrollBaseY + offset; } catch(e){}
      });
      drawThumb();
    };

    // Lưu base Y cho tất cả row objects TRƯỚC khi scroll
    rowObjs.forEach(o => {
      if (!o) return;
      try { o._scrollBaseY = o.y; } catch(e){}
    });

    // ── Mouse wheel ───────────────────────────────────────────────
    this._onWheel = (pointer, gameObjects, deltaX, deltaY) => {
      if (!this._open) return;
      // Chỉ scroll khi chuột trong vùng list
      if (pointer.x < L || pointer.x > L + W || pointer.y < T || pointer.y > T + visibleH) return;
      doScroll(deltaY * 0.5);
    };
    this.scene.input.on("wheel", this._onWheel);

    // ── Drag scroll (touch/mouse drag) ────────────────────────────
    let dragStartY = null;
    let dragStartScroll = 0;

    const listZone = this.scene.add.zone(L + W / 2, T + visibleH / 2, W, visibleH)
      .setInteractive({ draggable: true }).setDepth(D);
    this._listObjs.push(listZone);

    listZone.on("dragstart", (pointer) => {
      dragStartY      = pointer.y;
      dragStartScroll = scrollY;
    });
    listZone.on("drag", (pointer) => {
      if (dragStartY === null) return;
      const diff = dragStartY - pointer.y;
      scrollY = Phaser.Math.Clamp(dragStartScroll + diff, 0, maxScroll);
      const offset = -scrollY;
      rowObjs.forEach(o => {
        if (!o || o._scrollBaseY === undefined) return;
        try { o.y = o._scrollBaseY + offset; } catch(e){}
      });
      drawThumb();
    });
    listZone.on("dragend", () => { dragStartY = null; });
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

    // ── Nền row kem sáng thanh lịch (giống .topup-row của Nạp Tiền) ──
    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    const bx = L, by = rowY + 2, bw = W, bh = H - 4, br = 12;

    rowBg.fillStyle(0xf7eac6, 0.65);
    rowBg.fillRoundedRect(bx, by, bw, bh, br);
    rowBg.fillStyle(0xffffff, 0.22);
    rowBg.fillRoundedRect(bx + 3, by + 2, bw - 6, bh * 0.34, br - 2);
    rowBg.lineStyle(1.2, 0xc9a76a, 0.65);
    rowBg.strokeRoundedRect(bx, by, bw, bh, br);

    // ── Avatar tròn 96x96 + hào quang blur ánh xạ từ chính ảnh ──
    const avR = 22;
    const avX = L + 14 + avR;
    renderAvatarBadge(this.scene, {
      x: avX,
      y: midY,
      size: avR * 2,
      avatarId: friend.active_avatar_id || 1,
      depth: D + 2,
      push,
      glow: true,
    });

    // Chấm trạng thái
    const dotColor = friend.in_game ? 0xe05030
                   : friend.in_room ? 0xe8a020
                   : friend.online  ? 0x3db85a
                   : 0x8a7a60;
    const dotBorder = friend.in_game ? 0xb83820
                    : friend.in_room ? 0xc07810
                    : friend.online  ? 0x2a9444
                    : 0x6a5a40;
    const dotG = push(this.scene.add.graphics().setDepth(D + 5));
    dotG.fillStyle(dotColor, 1);
    dotG.fillCircle(avX + avR - 4, midY + avR - 4, 6);
    dotG.lineStyle(1.5, dotBorder, 1);
    dotG.strokeCircle(avX + avR - 4, midY + avR - 4, 6);

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
        user_id:          friend.friend_uid ?? friend.id,
        name:             friend.name,
        active_avatar_id: friend.active_avatar_id || 1,
        character_name:   friend.character_name || "Unknown",
        skin_id:          friend.skin_id || 1,
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

    // Nút Mời phòng (khi bạn rảnh) hoặc Xin vào phòng (khi bạn đang ở trong phòng chờ)
    if (friend.online && !friend.in_game && !friend.in_room) {
      this._buildImgIconBtn(btn2X, midY, iconSize, "fr_join", D, () => {
        const roomId = this.scene.registry.get("currentRoomId");
        if (!roomId) { this.scene._showToast?.("Bạn chưa ở trong phòng nào!"); return; }
        this.socket?.emit("room:invite", { to_id: friend.friend_uid ?? friend.id, room_id: roomId });
        this.scene._showToast?.(`Đã mời ${friend.name} vào phòng!`);
      });
    } else if (friend.online && friend.in_room && !friend.in_game) {
      this._buildImgIconBtn(btn2X, midY, iconSize, "fr_join", D, () => {
        this.socket?.emit("room:request_join", { friend_id: friend.friend_uid ?? friend.id });
        this.scene._showToast?.(`Đã gửi yêu cầu xin vào phòng của ${friend.name}!`);
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

    // Nền row đồng bộ .topup-row của Nạp Tiền
    const rowBg = push(this.scene.add.graphics().setDepth(D + 1));
    const bx = L, by = rowY + 2, bw = W, bh = H - 4, br = 12;
    rowBg.fillStyle(0xf7eac6, 0.65);
    rowBg.fillRoundedRect(bx, by, bw, bh, br);
    rowBg.fillStyle(0xffffff, 0.22);
    rowBg.fillRoundedRect(bx + 3, by + 2, bw - 6, bh * 0.34, br - 2);
    rowBg.lineStyle(1.2, 0xc9a76a, 0.65);
    rowBg.strokeRoundedRect(bx, by, bw, bh, br);

    // ── Avatar tròn 96x96 + hào quang blur ───────────────────────
    const avR = 22;
    const avX = L + 14 + avR;
    renderAvatarBadge(this.scene, {
      x: avX,
      y: midY,
      size: avR * 2,
      avatarId: req.active_avatar_id || 1,
      depth: D + 2,
      push,
      glow: true,
    });

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
        user_id:          req.from_id ?? req.user_id,
        name:             req.from_name,
        active_avatar_id: req.active_avatar_id || 1,
        character_name:   req.character_name || "Unknown",
        skin_id:          req.skin_id || 1,
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
    const bx = L, by = rowY + 2, bw = W, bh = H - 4, br = 12;
    rowBg.fillStyle(0xf7eac6, 0.65);
    rowBg.fillRoundedRect(bx, by, bw, bh, br);
    rowBg.fillStyle(0xffffff, 0.22);
    rowBg.fillRoundedRect(bx + 3, by + 2, bw - 6, bh * 0.34, br - 2);
    rowBg.lineStyle(1.2, 0xc9a76a, 0.65);
    rowBg.strokeRoundedRect(bx, by, bw, bh, br);

    // ── Avatar tròn 96x96 + hào quang blur ───────────────────────
    const avR = 22;
    const avX = L + 14 + avR;
    renderAvatarBadge(this.scene, {
      x: avX,
      y: midY,
      size: avR * 2,
      avatarId: user.active_avatar_id || 1,
      depth: D + 2,
      push,
      glow: true,
    });

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
      this._updateRequestTabBadge();
      this.scene.events.emit("friendrequest:count", this._requests.length);
    };
    this._onSearchResult = (data) => {
      this._search = data || [];
      if (this._tabIdx === 2) this._rebuildList();
    };
    this._onRequestIncoming = (data) => {
      this._requests.unshift(data);
      if (this._tabIdx === 1) this._rebuildList();
      this._updateRequestTabBadge();
      this.scene.events.emit("friendrequest:count", this._requests.length);
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
