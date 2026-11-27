/**
 * ChatWidget — Widget chat với scrollable message area + nút Micro đồng bộ (tùy chọn)
 */
import voiceChat from "../../utils/voiceChatManager.js";

export function drawMicVectorIcon(g, cx, cy, scale = 1, active = false) {
  const col = active ? 0xffffff : 0xcbd5e1;
  const a = active ? 1 : 0.72;
  // Thân bầu micro
  const mw = 8 * scale;
  const mh = 13 * scale;
  g.fillStyle(col, a);
  g.fillRoundedRect(cx - mw / 2, cy - mh / 2 - 3 * scale, mw, mh, 4 * scale);

  // Vòng chữ U ôm micro
  g.lineStyle(2.1 * scale, col, a);
  g.beginPath();
  g.arc(cx, cy - 1 * scale, 7.5 * scale, 0.12 * Math.PI, 0.88 * Math.PI, false);
  g.strokePath();

  // Chân đứng & đế ngang
  g.beginPath();
  g.moveTo(cx, cy + 6.5 * scale);
  g.lineTo(cx, cy + 10.5 * scale);
  g.moveTo(cx - 4.8 * scale, cy + 10.5 * scale);
  g.lineTo(cx + 4.8 * scale, cy + 10.5 * scale);
  g.strokePath();
}

export default class ChatWidget {
  constructor(scene, { channel, socket, depth = 200, myId = null, enableMic = false, onEmojiMessage = null }) {
    this.scene     = scene;
    this.channel   = channel;
    this.socket    = socket;
    this.depth     = depth;
    this.myId      = myId ? Number(myId) : null;
    this.enableMic = !!enableMic;
    this.onEmojiMessage = typeof onEmojiMessage === "function" ? onEmojiMessage : null;

    this._objects     = [];
    this._msgObjs     = []; // text objects trong vùng chat (bị mask)
    this._allMessages = []; // { text, color, tsStr } — toàn bộ lịch sử
    this._scrollOffset = 0; // số dòng scroll từ dưới lên (0 = bottom)
    this._inputText   = "";
    this._keyListener = null;
    this._focused     = false;
    this._chatBox     = null;
    this._scrollBar   = null;
    this._scrollThumb = null;
    this._isDragging  = false;
    this._unsubVoice  = null;
    this._emojiPickerEl = null;
    this._emojiOutsideHandler = null;
    this._bannerTimer = null;
    this._bannerMaskGfx = null;
    this._bannerTextObj = null;
    this._onWorldAnnouncement = null;
  }

  build(x, y, w, h) {
    this._x = x; this._y = y; this._w = w; this._h = h;

    const SCROLL_W = 6;
    const PAD_X    = 10;
    const PAD_BOT  = 8;
    const PILL_H   = 32;
    const INPUT_H  = PILL_H + PAD_BOT + 6; // vùng đáy chứa ô pill + nút tròn
    const BANNER_H = this.channel === "world" ? 30 : 0;
    const MSG_H    = h - INPUT_H;
    const BTN_D    = 32;
    const BTN_GAP  = 7;
    const MIC_SLOT = this.enableMic ? (BTN_D + BTN_GAP) : 0;
    const RIGHT_BTNS_W = BTN_D + BTN_GAP + BTN_D + MIC_SLOT;
    const PILL_W   = Math.max(90, w - PAD_X * 2 - RIGHT_BTNS_W - 8);
    const D        = this.depth;

    this._MSG_H   = MSG_H;
    this._SCROLL_W = SCROLL_W;

    // ── Khung liền khối bo góc trên-phải (giống giao diện chuẩn) ────
    const panelBg = this.scene.add.graphics().setDepth(D);
    panelBg.fillStyle(0x041a34, 0.64);
    panelBg.fillRoundedRect(x, y, w, h, { tl: 0, tr: 16, bl: 0, br: 0 });
    panelBg.lineStyle(1.4, 0x3b7ec2, 0.48);
    panelBg.strokeRoundedRect(x, y, w, h, { tl: 0, tr: 16, bl: 0, br: 0 });
    // Mũi tên nhỏ góc trên-phải trang trí đồng bộ
    const chX = x + w - 14, chY = y + 10;
    panelBg.fillStyle(0x4fc3f7, 0.85);
    panelBg.fillTriangle(chX - 4, chY - 2, chX + 4, chY - 2, chX, chY + 3);
    this._push(panelBg);

    // ── Thanh Thông Báo Chạy Chữ Gradient Nổi (chỉ hiện ở Chat Thế Giới) ──
    if (BANNER_H > 0) {
      const bx = x + 6;
      const by = y + 5;
      const bw = w - 26;
      const bh = BANNER_H - 4;
      const bannerBg = this.scene.add.graphics().setDepth(D + 1);
      bannerBg.fillStyle(0x2e0814, 0.82);
      bannerBg.fillRoundedRect(bx, by, bw, bh, 8);
      bannerBg.lineStyle(1.2, 0xff5a36, 0.72);
      bannerBg.strokeRoundedRect(bx, by, bw, bh, 8);
      this._push(bannerBg);

      const bMaskG = this.scene.make.graphics({ add: false });
      bMaskG.fillStyle(0xffffff);
      bMaskG.fillRect(bx + 6, by, bw - 12, bh);
      this._bannerMaskGfx = bMaskG;
      const bMask = bMaskG.createGeometryMask();

      const defaultBanner = "🔥 [HỆ THỐNG] CHÀO MỪNG ĐẾN VỚI CHAT THẾ GIỚI — CỜ TỶ PHÚ ONLINE • GIAO LƯU VĂN MINH & CHÚC BẠN CHƠI VUI! 🔥";
      const bText = this.scene.add.text(bx + bw / 2, by + bh / 2, defaultBanner, {
        fontFamily: "Signika",
        fontSize: "13.5px",
        fontStyle: "bold",
        color: "#ff5c4d",
        stroke: "#2b0509",
        strokeThickness: 3.5,
      }).setOrigin(0, 0.5).setDepth(D + 2).setMask(bMask);
      bText.setShadow(0, 0, "#ff3b3b", 8, true, true);
      this._bannerTextObj = bText;
      this._push(bText);

      const applyGradientAndMarquee = (msg) => {
        if (!this._bannerTextObj?.active) return;
        const clean = String(msg || defaultBanner).trim() || defaultBanner;
        this._bannerTextObj.setText(clean);
        // Tạo chữ Gradient nổi Đỏ → Cam → Vàng Kim → Đỏ Hồng
        try {
          const tw = Math.max(180, this._bannerTextObj.width || 300);
          const grad = this._bannerTextObj.context.createLinearGradient(0, 0, tw, 0);
          grad.addColorStop(0,    "#ff3838");
          grad.addColorStop(0.28, "#ff9f1a");
          grad.addColorStop(0.55, "#fff200");
          grad.addColorStop(0.82, "#ff6b35");
          grad.addColorStop(1,    "#ff3838");
          this._bannerTextObj.setFill(grad);
        } catch {}

        // Đặt vị trí khởi đầu & chạy chữ mượt qua lại / marquee
        this._bannerTextObj.x = bx + bw - 10;
      };

      applyGradientAndMarquee(defaultBanner);
      this._setWorldBanner = applyGradientAndMarquee;

      this._bannerTimer = this.scene.time.addEvent({
        delay: 25,
        loop: true,
        callback: () => {
          if (!this._bannerTextObj?.active) return;
          this._bannerTextObj.x -= 1.25;
          if (this._bannerTextObj.x + this._bannerTextObj.width < bx + 6) {
            this._bannerTextObj.x = bx + bw - 6;
          }
        },
      });

      // Tải thông báo mới nhất từ Admin (nếu có)
      fetch("/api/world-announcement")
        .then(r => r.json())
        .then(d => { if (d?.success && d.message) applyGradientAndMarquee(d.message); })
        .catch(() => {});
    }

    // ── Mask để clip tin nhắn ──────────────────────────────────────
    const msgTopY = y + 6 + BANNER_H;
    const msgAreaH = Math.max(40, MSG_H - 8 - BANNER_H);
    const maskGfx = this.scene.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(x + 6, msgTopY, w - SCROLL_W - 18, msgAreaH);
    this._maskGfx = maskGfx;
    this._clipMask = maskGfx.createGeometryMask();

    // chatBox dimensions (LINE_H = 34 ở Chat Thế Giới để Emoji 32x32 to rõ, sắc nét)
    const LINE_H = this.channel === "world" ? 34 : 26;
    this._chatBox = {
      x: x + 10,
      y: msgTopY + 2,
      w: w - SCROLL_W - 24,
      h: msgAreaH - 4,
      lineH: LINE_H,
    };
    this._visibleLines = Math.max(1, Math.floor(this._chatBox.h / LINE_H));

    // ── Scrollbar track ────────────────────────────────────────────
    const sbX = x + w - SCROLL_W - 5;
    const sbY = msgTopY + 6;
    const sbH = Math.max(24, msgAreaH - 12);
    this._sbX = sbX; this._sbY = sbY; this._sbH = sbH;

    const sbTrack = this.scene.add.graphics().setDepth(D + 1);
    sbTrack.fillStyle(0x0a2240, 0.45);
    sbTrack.fillRoundedRect(sbX, sbY, SCROLL_W, sbH, 3);
    this._push(sbTrack);

    // Scrollbar thumb (sẽ được vẽ lại khi scroll)
    this._scrollThumb = this.scene.add.graphics().setDepth(D + 2);
    this._push(this._scrollThumb);

    // Zone scroll bằng wheel trên vùng chat
    const wheelZone = this.scene.add.zone(x + w / 2, y + MSG_H / 2, w, MSG_H)
      .setInteractive().setDepth(D + 3);
    wheelZone.on("wheel", (_ptr, _dx, dy) => {
      this._scroll(dy > 0 ? -1 : 1);
    });
    this._push(wheelZone);

    // Drag scrollbar thumb
    const thumbZone = this.scene.add.zone(sbX + SCROLL_W / 2, sbY + sbH / 2, SCROLL_W + 6, sbH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
    this._push(thumbZone);
    let dragStartY = 0, dragStartOffset = 0;
    thumbZone.on("pointerdown", (ptr) => {
      this._isDragging = true;
      dragStartY = ptr.y;
      dragStartOffset = this._scrollOffset;
    });
    this.scene.input.on("pointermove", (ptr) => {
      if (!this._isDragging) return;
      const totalLines = this._allMessages.length;
      const maxScroll  = Math.max(0, totalLines - this._visibleLines);
      if (maxScroll === 0) return;
      const dy = ptr.y - dragStartY;
      const ratio = dy / (sbH - this._thumbH());
      const delta = Math.round(ratio * maxScroll);
      this._scrollOffset = Math.max(0, Math.min(maxScroll, dragStartOffset - delta));
      this._renderMessages();
      this._updateScrollbar();
    });
    this.scene.input.on("pointerup", () => { this._isDragging = false; });

    // ── Ô nhập tin nhắn dạng viên thuốc (pill) nằm trong khung ─────
    const pillX = x + PAD_X;
    const pillY = y + h - PAD_BOT - PILL_H;
    const pillCY = pillY + PILL_H / 2;
    const pillR = PILL_H / 2;

    const inputBg = this.scene.add.graphics().setDepth(D + 1);
    const drawInputPill = (focused = false) => {
      inputBg.clear();
      inputBg.fillStyle(0x031122, 0.78);
      inputBg.fillRoundedRect(pillX, pillY, PILL_W, PILL_H, pillR);
      inputBg.lineStyle(1.4, focused ? 0x58b8ff : 0x4b7da8, focused ? 0.9 : 0.65);
      inputBg.strokeRoundedRect(pillX, pillY, PILL_W, PILL_H, pillR);
    };
    drawInputPill(false);
    this._drawInputPill = drawInputPill;
    this._push(inputBg);

    // Mask nội dung text trong ô input để không tràn sang nút tròn
    const inputMaskG = this.scene.make.graphics({ add: false });
    inputMaskG.fillStyle(0xffffff);
    inputMaskG.fillRoundedRect(pillX + 10, pillY + 2, PILL_W - 20, PILL_H - 4, 8);
    this._push(inputMaskG);
    const inputMask = inputMaskG.createGeometryMask();

    this._placeholder = this.scene.add.text(pillX + 14, pillCY, "Nhập tin nhắn...", {
      fontFamily: "Signika", fontSize: "13px", color: "#5d8db8"
    }).setOrigin(0, 0.5).setDepth(D + 2).setMask(inputMask);
    this._push(this._placeholder);

    this._inputDisplay = this.scene.add.text(pillX + 14, pillCY, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff"
    }).setOrigin(0, 0.5).setDepth(D + 2).setMask(inputMask);
    this._push(this._inputDisplay);

    const inputZone = this.scene.add.zone(pillX + PILL_W / 2, pillCY, PILL_W, PILL_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 3);
    inputZone.on("pointerdown", () => this._focusInput());
    this._push(inputZone);

    // Helper vẽ nút tròn bóng xanh dương kiểu glossy orb
    const drawBlueOrb = (g, cx, cy, r, hover) => {
      g.clear();
      // Bóng đổ nhẹ
      g.fillStyle(0x000000, 0.32);
      g.fillCircle(cx + 1, cy + 2, r);
      // Vòng nền xanh dương đậm
      g.fillStyle(hover ? 0x1696f2 : 0x0572d2, 1);
      g.fillCircle(cx, cy, r);
      // Lòng xanh cyan sáng phía trên
      g.fillStyle(hover ? 0x5ad4ff : 0x28b6ff, 0.92);
      g.fillCircle(cx, cy - 1.5, r - 2.2);
      // Vệt bóng kính trắng nửa trên
      g.fillStyle(0xffffff, hover ? 0.42 : 0.30);
      g.fillEllipse(cx, cy - r * 0.42, r * 1.15, r * 0.55);
      // Viền sáng mảnh
      g.lineStyle(1.4, hover ? 0xc2f0ff : 0x7dd8ff, 0.9);
      g.strokeCircle(cx, cy, r - 0.5);
    };

    // ── Nút tròn 1: Chọn Emoji ─────────────────────────────────────
    const orbR = BTN_D / 2;
    const emojiCX = pillX + PILL_W + 8 + orbR;
    const emojiCY = pillCY;
    const emojiG = this.scene.add.graphics().setDepth(D + 1);
    const drawEmojiBtn = (hover) => {
      drawBlueOrb(emojiG, emojiCX, emojiCY, orbR, hover);
      // Vẽ icon mặt cười trắng sắc nét trên nền xanh bóng
      emojiG.fillStyle(0xffffff, 0.96);
      emojiG.fillCircle(emojiCX, emojiCY, orbR - 5.5);
      emojiG.lineStyle(1.5, 0x0562b8, 0.95);
      emojiG.strokeCircle(emojiCX, emojiCY, orbR - 5.5);
      // 2 mắt
      emojiG.fillStyle(0x0562b8, 1);
      emojiG.fillCircle(emojiCX - 3.6, emojiCY - 2.5, 1.5);
      emojiG.fillCircle(emojiCX + 3.6, emojiCY - 2.5, 1.5);
      // Miệng cười
      emojiG.lineStyle(1.7, 0x0562b8, 1);
      emojiG.beginPath();
      emojiG.arc(emojiCX, emojiCY - 0.5, 5.2, 0.18 * Math.PI, 0.82 * Math.PI, false);
      emojiG.strokePath();
    };
    drawEmojiBtn(false);
    this._push(emojiG);

    const emojiZone = this.scene.add.zone(emojiCX, emojiCY, BTN_D, BTN_D)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 3);
    emojiZone.on("pointerover", () => drawEmojiBtn(true));
    emojiZone.on("pointerout",  () => drawEmojiBtn(false));
    emojiZone.on("pointerdown", (_ptr, _lx, _ly, ev) => {
      ev?.stopPropagation?.();
      this._toggleEmojiPicker();
    });
    this._push(emojiZone);

    // ── Nút tròn 2: Gửi tin nhắn (bong bóng chat "...") ────────────
    const sendCX = emojiCX + BTN_D + BTN_GAP;
    const sendCY = pillCY;
    const sendG = this.scene.add.graphics().setDepth(D + 1);
    const drawSend = (hover) => {
      drawBlueOrb(sendG, sendCX, sendCY, orbR, hover);
      // Bong bóng thoại trắng có 3 dấu chấm ở giữa
      sendG.fillStyle(0xffffff, 0.96);
      sendG.fillEllipse(sendCX, sendCY - 1, 18, 13.5);
      sendG.fillTriangle(sendCX - 5, sendCY + 3.5, sendCX - 1, sendCY + 4.5, sendCX - 6.5, sendCY + 8.5);
      // 3 chấm xanh bên trong bong bóng
      sendG.fillStyle(0x0562b8, 1);
      sendG.fillCircle(sendCX - 4.2, sendCY - 1, 1.45);
      sendG.fillCircle(sendCX,       sendCY - 1, 1.45);
      sendG.fillCircle(sendCX + 4.2, sendCY - 1, 1.45);
    };
    drawSend(false);
    this._push(sendG);

    const sendZone = this.scene.add.zone(sendCX, sendCY, BTN_D, BTN_D)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 3);
    sendZone.on("pointerover",  () => drawSend(true));
    sendZone.on("pointerout",   () => drawSend(false));
    sendZone.on("pointerdown",  () => this._sendMessage());
    this._push(sendZone);

    // ── Nút tròn 3: Micro (đồng bộ cùng hàng trong khung) ──────────
    if (this.enableMic) {
      const micCX = sendCX + BTN_D + BTN_GAP;
      const micCY = pillCY;
      const micG = this.scene.add.graphics().setDepth(D + 1);
      const micBadgeTxt = this.scene.add.text(micCX + 10, micCY + 10, "×", {
        fontFamily: "Signika", fontSize: "11px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 4).setVisible(false);
      this._push(micG);
      this._push(micBadgeTxt);

      let micImg = null;
      const MIC_ICON = 30;
      const ensureMicImg = () => {
        if (micImg || !this.scene?.textures?.exists("icon_mic")) return;
        micImg = this.scene.add.image(micCX, micCY, "icon_mic")
          .setDisplaySize(MIC_ICON, MIC_ICON).setDepth(D + 2);
        this._push(micImg);
      };
      if (!this.scene.textures.exists("icon_mic")) {
        this.scene.load.image("icon_mic", "assets/ui/shared/microphone.png");
        this.scene.load.once("filecomplete-image-icon_mic", () => {
          if (!micG?.active) return;
          ensureMicImg();
          drawMic();
        });
        this.scene.load.start();
      }

      let micHovered = false;
      const drawMic = (snap = voiceChat.getSnapshot()) => {
        if (!micG?.active) return;
        const on = !!snap?.micEnabled;
        const speaking = on && !!snap?.isSpeaking;
        micG.clear();
        const R = MIC_ICON / 2;

        micG.fillStyle(0x000000, 0.28);
        micG.fillCircle(micCX + 1, micCY + 2, R - 1);

        if (speaking) {
          micG.lineStyle(5, 0x4ade80, 0.28);
          micG.strokeCircle(micCX, micCY, R + 3);
          micG.lineStyle(2.2, 0x86efac, 1);
          micG.strokeCircle(micCX, micCY, R + 1.2);
        } else if (on) {
          micG.lineStyle(1.6, 0x93e6ff, 0.65);
          micG.strokeCircle(micCX, micCY, R + 1.2);
        }

        ensureMicImg();
        if (micImg) {
          const sc = (micHovered ? 1.1 : 1) * (speaking ? 1.06 : 1);
          micImg.setDisplaySize(MIC_ICON * sc, MIC_ICON * sc);
          if (on) { micImg.clearTint(); micImg.setAlpha(1); }
          else    { micImg.setTint(0x9aa8bb); micImg.setAlpha(0.85); }
        }

        if (!on) {
          const bx = micCX + 10, by = micCY + 10, br = 6;
          micG.fillStyle(0x000000, 0.38);
          micG.fillCircle(bx + 1, by + 1.5, br);
          micG.fillStyle(0xef4444, 1);
          micG.fillCircle(bx, by, br);
          micG.lineStyle(1.4, 0xffffff, 0.95);
          micG.strokeCircle(bx, by, br);
          micBadgeTxt.setPosition(bx, by - 0.5).setVisible(true);
        } else {
          micBadgeTxt.setVisible(false);
        }
      };

      const micZone = this.scene.add.zone(micCX, micCY, BTN_D, BTN_D)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
      micZone.on("pointerover", () => { micHovered = true; drawMic(); });
      micZone.on("pointerout",  () => { micHovered = false; drawMic(); });
      micZone.on("pointerdown", () => { voiceChat.toggleMic(); });
      this._push(micZone);

      this._unsubVoice = voiceChat.onStateChange((snap) => drawMic(snap));
    }

    this._bindSocket();
    return this;
  }

  addSystemMessage(msg) {
    this._appendLine(`[Hệ thống] ${msg}`, "#88ccff");
  }

  destroy() {
    this._closeEmojiPicker();
    if (this._bannerTimer) {
      try { this._bannerTimer.remove(false); } catch {}
      this._bannerTimer = null;
    }
    if (this._bannerMaskGfx) {
      try { this._bannerMaskGfx.destroy(); } catch {}
      this._bannerMaskGfx = null;
    }
    if (this._unsubVoice) {
      try { this._unsubVoice(); } catch {}
      this._unsubVoice = null;
    }
    if (this.channel === "world") this.socket?.emit("chat:world:leave");
    this._unbindSocket();
    this._removeKeyListener();
    this.scene.input.off("pointermove");
    this.scene.input.off("pointerup");
    this._msgObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._msgObjs = [];
    this._objects.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._objects = [];
    this._maskGfx?.destroy();
  }

  // ── PRIVATE ─────────────────────────────────────────────────────

  _push(obj) { this._objects.push(obj); return obj; }

  _thumbH() {
    const total = this._allMessages.length;
    if (total <= this._visibleLines) return this._sbH;
    return Math.max(20, Math.floor(this._sbH * this._visibleLines / total));
  }

  _updateScrollbar() {
    const total    = this._allMessages.length;
    const maxScroll = Math.max(0, total - this._visibleLines);
    const thumbH   = this._thumbH();
    const sbTrackH = this._sbH - thumbH;
    const thumbY   = maxScroll > 0
      ? this._sbY + sbTrackH * (1 - this._scrollOffset / maxScroll)
      : this._sbY;

    this._scrollThumb.clear();
    if (total <= this._visibleLines) return; // không cần scrollbar
    this._scrollThumb.fillStyle(0x4488cc, 0.85);
    this._scrollThumb.fillRoundedRect(this._sbX, thumbY, this._SCROLL_W, thumbH, 4);
  }

  _scroll(delta) {
    const maxScroll = Math.max(0, this._allMessages.length - this._visibleLines);
    this._scrollOffset = Math.max(0, Math.min(maxScroll, this._scrollOffset + delta));
    this._renderMessages();
    this._updateScrollbar();
  }

  _ensureEmojiTexture(id) {
    const key = `chat_emoji_sm_${id}`;
    if (this.scene?.textures?.exists(key)) return key;
    if (!this._loadingEmojiKeys) this._loadingEmojiKeys = new Set();
    if (!this._loadingEmojiKeys.has(key) && this.scene?.load) {
      this._loadingEmojiKeys.add(key);
      this.scene.load.image(key, `assets/resources/Emoji/PNG/thumbs_40/${id}.png`);
      this.scene.load.once(`filecomplete-image-${key}`, () => {
        this._loadingEmojiKeys.delete(key);
        if (this._chatBox) this._renderMessages();
      });
      this.scene.load.start();
    }
    return null;
  }

  _toggleEmojiPicker() {
    if (this._emojiPickerEl) {
      this._closeEmojiPicker();
      return;
    }

    const canvas = this.scene?.game?.canvas;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 20, top: 20, width: window.innerWidth, height: window.innerHeight };
    const scaleX = rect.width / (this.scene?.scale?.width || rect.width || 1);
    const scaleY = rect.height / (this.scene?.scale?.height || rect.height || 1);

    const pickerW = 248;
    const pickerH = 226;
    const anchorLeft = rect.left + (this._x + this._w - 90) * scaleX - pickerW / 2;
    const anchorTop  = rect.top + (this._y + this._MSG_H) * scaleY - pickerH - 8;

    const clampedLeft = Math.max(8, Math.min(window.innerWidth - pickerW - 8, anchorLeft));
    const clampedTop  = Math.max(8, Math.min(window.innerHeight - pickerH - 8, anchorTop));

    const el = document.createElement("div");
    el.style.cssText = `
      position: fixed; left: ${clampedLeft}px; top: ${clampedTop}px;
      width: ${pickerW}px; max-height: ${pickerH}px; overflow-y: auto;
      background: rgba(6, 20, 42, 0.96); border: 1.5px solid #38bdf8;
      border-radius: 10px; padding: 8px; z-index: 99990;
      box-shadow: 0 14px 36px rgba(0,0,0,0.65);
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
      backdrop-filter: blur(6px);
    `;

    for (let id = 1; id <= 50; id++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = `Emoji #${id} (Click gửi ngay • Shift+Click chèn vào ô chat)`;
      btn.style.cssText = `
        background: rgba(255,255,255,0.04); border: 1px solid transparent;
        border-radius: 6px; padding: 3px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease;
      `;
      const img = document.createElement("img");
      img.src = `/assets/resources/Emoji/PNG/thumbs_40/${id}.png`;
      img.alt = `e${id}`;
      img.loading = "lazy";
      img.style.cssText = `
        width: 34px; height: 34px; object-fit: contain; display: block;
        image-rendering: -webkit-optimize-contrast;
      `;
      btn.appendChild(img);
      btn.onmouseenter = () => {
        btn.style.background = "rgba(56, 189, 248, 0.2)";
        btn.style.borderColor = "rgba(56, 189, 248, 0.65)";
        btn.style.transform = "scale(1.14)";
      };
      btn.onmouseleave = () => {
        btn.style.background = "rgba(255,255,255,0.04)";
        btn.style.borderColor = "transparent";
        btn.style.transform = "scale(1)";
      };
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const token = `[e:${id}]`;
        if (ev.shiftKey) {
          this._inputText = (this._inputText + " " + token).trim().slice(0, 200);
          this._syncInput();
          this._focusInput();
        } else {
          this.socket?.emit(`chat:${this.channel}:send`, { message: token });
          this._scrollOffset = 0;
          this._closeEmojiPicker();
        }
      };
      el.appendChild(btn);
    }

    document.body.appendChild(el);
    this._emojiPickerEl = el;

    this._emojiOutsideHandler = (ev) => {
      if (this._emojiPickerEl && !this._emojiPickerEl.contains(ev.target)) {
        this._closeEmojiPicker();
      }
    };
    setTimeout(() => window.addEventListener("pointerdown", this._emojiOutsideHandler), 60);
  }

  _closeEmojiPicker() {
    if (this._emojiOutsideHandler) {
      window.removeEventListener("pointerdown", this._emojiOutsideHandler);
      this._emojiOutsideHandler = null;
    }
    if (this._emojiPickerEl) {
      this._emojiPickerEl.remove();
      this._emojiPickerEl = null;
    }
  }

  _renderMessages() {
    // Xóa text/emoji objects cũ
    this._msgObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._msgObjs = [];

    const cb    = this._chatBox;
    const total = this._allMessages.length;
    const vis   = this._visibleLines;

    const maxScroll  = Math.max(0, total - vis);
    const startIdx   = maxScroll - this._scrollOffset;
    const endIdx     = Math.min(total, startIdx + vis);
    const emojiRe    = /\[e:(\d{1,2})\]/g;

    for (let i = startIdx; i < endIdx; i++) {
      const m     = this._allMessages[i];
      const lineY = cb.y + (i - startIdx) * cb.lineH;
      const maxTextW = cb.w - (m.tsStr ? 52 : 0);

      const emojiSize = this.channel === "world" ? 32 : 24;
      const lineMidY = lineY + cb.lineH / 2;

      if (emojiRe.test(m.text)) {
        emojiRe.lastIndex = 0;
        let curX = cb.x;
        let lastIdx = 0;
        let match;
        while ((match = emojiRe.exec(m.text)) !== null) {
          const before = m.text.slice(lastIdx, match.index);
          if (before) {
            const tObj = this.scene.add.text(curX, lineMidY, before, {
              fontFamily: "Signika", fontSize: "13.5px", color: m.color,
            }).setOrigin(0, 0.5).setDepth(this.depth + 1).setMask(this._clipMask);
            this._msgObjs.push(tObj);
            curX += tObj.width;
          }
          const eid = Number(match[1]);
          if (eid >= 1 && eid <= 50) {
            const texKey = this._ensureEmojiTexture(eid);
            if (texKey) {
              const eImg = this.scene.add.image(curX + emojiSize / 2 + 2, lineMidY, texKey)
                .setDisplaySize(emojiSize, emojiSize)
                .setDepth(this.depth + 1)
                .setMask(this._clipMask);
              this._msgObjs.push(eImg);
            }
            curX += emojiSize + 5;
          }
          lastIdx = match.index + match[0].length;
        }
        const after = m.text.slice(lastIdx);
        if (after) {
          const tAfter = this.scene.add.text(curX, lineMidY, after, {
            fontFamily: "Signika", fontSize: "13.5px", color: m.color,
          }).setOrigin(0, 0.5).setDepth(this.depth + 1).setMask(this._clipMask);
          this._msgObjs.push(tAfter);
        }
      } else {
        const msg = this.scene.add.text(cb.x, lineMidY, m.text, {
          fontFamily: "Signika", fontSize: "13.5px", color: m.color,
          wordWrap: { width: maxTextW }
        }).setOrigin(0, 0.5).setDepth(this.depth + 1).setMask(this._clipMask);
        this._msgObjs.push(msg);
      }

      if (m.tsStr) {
        const ts = this.scene.add.text(cb.x + cb.w, lineMidY, m.tsStr, {
          fontFamily: "Signika", fontSize: "11px", color: "#6688aa"
        }).setOrigin(1, 0.5).setDepth(this.depth + 1).setMask(this._clipMask);
        this._msgObjs.push(ts);
      }
    }
  }

  _appendLine(text, color = "#ffffff", time = null) {
    // Format timestamp
    let tsStr = "";
    if (time) {
      const d = new Date(time);
      const diffMin = Math.floor((Date.now() - time) / 60000);
      if (diffMin < 1)       tsStr = "vừa xong";
      else if (diffMin < 60) tsStr = `${diffMin}ph`;
      else if (d.toDateString() === new Date().toDateString())
        tsStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      else
        tsStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }

    this._allMessages.push({ text, color, tsStr });

    // Giới hạn 200 tin
    if (this._allMessages.length > 200) this._allMessages.shift();

    // Auto-scroll xuống bottom khi đang ở bottom
    if (this._scrollOffset === 0) {
      this._renderMessages();
    }
    this._updateScrollbar();
  }

  _focusInput() {
    this._focused = true;
    this._drawInputPill?.(true);
    this._placeholder?.setVisible(false);
    if (!this._keyListener) {
      this._keyListener = (e) => {
        if (!this._focused) return;
        if (e.key === "Enter")          { this._sendMessage(); }
        else if (e.key === "Backspace") { this._inputText = this._inputText.slice(0, -1); this._syncInput(); }
        else if (e.key === "Escape")    { this._focused = false; this._drawInputPill?.(false); }
        else if (e.key.length === 1 && this._inputText.length < 200) {
          this._inputText += e.key; this._syncInput();
        }
      };
      window.addEventListener("keydown", this._keyListener);
    }
  }

  _removeKeyListener() {
    if (this._keyListener) {
      window.removeEventListener("keydown", this._keyListener);
      this._keyListener = null;
    }
  }

  _syncInput() {
    this._inputDisplay?.setText(this._inputText);
    this._placeholder?.setVisible(this._inputText.length === 0);
  }

  _sendMessage() {
    const msg = this._inputText.trim();
    if (!msg) return;
    this.socket?.emit(`chat:${this.channel}:send`, { message: msg });
    this._inputText = "";
    this._syncInput();
    this._placeholder?.setVisible(true);
    // Scroll về bottom khi gửi
    this._scrollOffset = 0;
    this._renderMessages();
    this._updateScrollbar();
  }

  _bindSocket() {
    if (!this.socket) return;
    this._onMessage = (data) => {
      const isMe = this.myId && Number(data.user_id) === this.myId;
      const label = isMe ? `[Bạn] ${data.message}` : `[${data.name}] ${data.message}`;
      this._appendLine(label, isMe ? "#aaddff" : "#ffffff", data.time);
      const em = String(data.message || "").match(/\[e:(\d{1,2})\]/);
      if (em && this.onEmojiMessage) {
        this.onEmojiMessage(Number(data.user_id), Number(em[1]));
      }
    };
    this._onHistory = (history) => {
      history.forEach(d => {
        const isMe = this.myId && Number(d.user_id) === this.myId;
        const label = isMe ? `[Bạn] ${d.message}` : `[${d.name}] ${d.message}`;
        this._appendLine(label, isMe ? "#aaddff" : "#ffffff", d.time);
      });
    };
    this._onError = (data) => {
      this._appendLine(`⚠ ${data.message}`, "#ff8888");
    };
    this._onWorldAnnouncement = (data) => {
      if (this.channel === "world" && data?.message && this._setWorldBanner) {
        this._setWorldBanner(data.message);
      }
    };
    this.socket.on(`chat:${this.channel}:message`, this._onMessage);
    this.socket.on(`chat:${this.channel}:history`, this._onHistory);
    this.socket.on("chat:error", this._onError);
    if (this.channel === "world") this.socket.on("world:announcement", this._onWorldAnnouncement);
    if (this.channel === "world") this.socket.emit("chat:world:join");
    if (this.channel === "room")  this.socket.emit("chat:room:history:get");
  }

  _unbindSocket() {
    if (!this.socket) return;
    if (this._onMessage) this.socket.off(`chat:${this.channel}:message`, this._onMessage);
    if (this._onHistory) this.socket.off(`chat:${this.channel}:history`, this._onHistory);
    if (this._onError)   this.socket.off("chat:error", this._onError);
    if (this._onWorldAnnouncement) this.socket.off("world:announcement", this._onWorldAnnouncement);
  }
}
