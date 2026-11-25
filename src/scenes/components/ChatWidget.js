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
  }

  build(x, y, w, h) {
    this._x = x; this._y = y; this._w = w; this._h = h;

    const SCROLL_W = 8;
    const INPUT_H  = 40;
    const MSG_H    = h - INPUT_H;
    const EMOJI_W  = 36;
    const SEND_W   = 52;
    const MIC_W    = this.enableMic ? 42 : 0;
    const MIC_GAP  = this.enableMic ? 4 : 0;
    const INPUT_W  = w - EMOJI_W - SEND_W - MIC_W - MIC_GAP;
    const D        = this.depth;

    this._MSG_H   = MSG_H;
    this._SCROLL_W = SCROLL_W;

    // ── Nền vùng tin nhắn ──────────────────────────────────────────
    const msgBg = this.scene.add.graphics().setDepth(D);
    msgBg.fillStyle(0x041428, 0.62);
    msgBg.fillRoundedRect(x, y, w, MSG_H, { tl: 0, tr: 10, bl: 0, br: 0 });
    msgBg.lineStyle(1.5, 0x2255aa, 0.5);
    msgBg.strokeRoundedRect(x, y, w, MSG_H, { tl: 0, tr: 10, bl: 0, br: 0 });
    this._push(msgBg);

    // ── Mask để clip tin nhắn ──────────────────────────────────────
    const maskGfx = this.scene.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(x + 4, y + 4, w - SCROLL_W - 12, MSG_H - 8);
    this._maskGfx = maskGfx;
    this._clipMask = maskGfx.createGeometryMask();

    // chatBox dimensions (LINE_H = 22 để emoji 20x20 sắc nét không bị cắt mép)
    const LINE_H = 22;
    this._chatBox = {
      x: x + 8,
      y: y + 6,
      w: w - SCROLL_W - 20,
      h: MSG_H - 12,
      lineH: LINE_H,
    };
    this._visibleLines = Math.floor(this._chatBox.h / LINE_H);

    // ── Scrollbar track ────────────────────────────────────────────
    const sbX = x + w - SCROLL_W - 2;
    const sbY = y + 4;
    const sbH = MSG_H - 8;
    this._sbX = sbX; this._sbY = sbY; this._sbH = sbH;

    const sbTrack = this.scene.add.graphics().setDepth(D + 1);
    sbTrack.fillStyle(0x0a1a33, 0.8);
    sbTrack.fillRoundedRect(sbX, sbY, SCROLL_W, sbH, 4);
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

    // ── Input ──────────────────────────────────────────────────────
    const inputY = y + MSG_H;
    const inputBg = this.scene.add.graphics().setDepth(D);
    inputBg.fillStyle(0x020d1e, 0.92);
    inputBg.fillRoundedRect(x, inputY, INPUT_W, INPUT_H, { tl: 0, tr: 0, bl: 0, br: 0 });
    inputBg.lineStyle(1.5, 0x2255aa, 0.6);
    inputBg.strokeRoundedRect(x, inputY, INPUT_W, INPUT_H, { tl: 0, tr: 0, bl: 0, br: 0 });
    this._push(inputBg);

    this._placeholder = this.scene.add.text(x + 12, inputY + INPUT_H / 2, "Nhập tin nhắn...", {
      fontFamily: "Signika", fontSize: "13px", color: "#4477aa"
    }).setOrigin(0, 0.5).setDepth(D + 1);
    this._push(this._placeholder);

    this._inputDisplay = this.scene.add.text(x + 12, inputY + INPUT_H / 2, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff"
    }).setOrigin(0, 0.5).setDepth(D + 1);
    this._push(this._inputDisplay);

    const inputZone = this.scene.add.zone(x + INPUT_W / 2, inputY + INPUT_H / 2, INPUT_W, INPUT_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 2);
    inputZone.on("pointerdown", () => this._focusInput());
    this._push(inputZone);

    // ── Nút chọn Emoji (50 emoji 96x96 sắc nét) ───────────────────
    const emojiX = x + INPUT_W;
    const emojiCX = emojiX + EMOJI_W / 2;
    const emojiCY = inputY + INPUT_H / 2;
    const emojiG = this.scene.add.graphics().setDepth(D);
    const drawEmojiBtn = (hover) => {
      emojiG.clear();
      emojiG.fillStyle(hover ? 0x163259 : 0x081a34, 0.95);
      emojiG.fillRect(emojiX, inputY, EMOJI_W, INPUT_H);
      emojiG.lineStyle(1.5, hover ? 0x38bdf8 : 0x2255aa, 0.7);
      emojiG.strokeRect(emojiX, inputY, EMOJI_W, INPUT_H);
    };
    drawEmojiBtn(false);
    this._push(emojiG);

    const emojiBtnKey = "chat_emoji_sm_50";
    let emojiBtnImg = null;
    const placeEmojiIcon = () => {
      if (emojiBtnImg || !emojiG?.active || !this.scene?.textures?.exists(emojiBtnKey)) return;
      emojiBtnImg = this.scene.add.image(emojiCX, emojiCY, emojiBtnKey)
        .setDisplaySize(24, 24).setDepth(D + 1);
      this._push(emojiBtnImg);
    };
    if (this.scene.textures.exists(emojiBtnKey)) {
      placeEmojiIcon();
    } else {
      this.scene.load.image(emojiBtnKey, "assets/resources/Emoji/PNG/thumbs_40/50.png");
      this.scene.load.once(`filecomplete-image-${emojiBtnKey}`, placeEmojiIcon);
      this.scene.load.start();
    }

    const emojiZone = this.scene.add.zone(emojiCX, emojiCY, EMOJI_W, INPUT_H)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 2);
    emojiZone.on("pointerover", () => { drawEmojiBtn(true); emojiBtnImg?.setDisplaySize(27, 27); });
    emojiZone.on("pointerout",  () => { drawEmojiBtn(false); emojiBtnImg?.setDisplaySize(24, 24); });
    emojiZone.on("pointerdown", (_ptr, _lx, _ly, ev) => {
      ev?.stopPropagation?.();
      this._toggleEmojiPicker();
    });
    this._push(emojiZone);

    // ── Nút Gửi ───────────────────────────────────────────────────
    const sendX = emojiX + EMOJI_W;
    const sendG = this.scene.add.graphics().setDepth(D);
    const drawSend = (hover) => {
      sendG.clear();
      sendG.fillGradientStyle(
        hover ? 0x22bbff : 0x0099ff, hover ? 0x22bbff : 0x0099ff,
        hover ? 0x0055cc : 0x0066cc, hover ? 0x0055cc : 0x0066cc, 1
      );
      sendG.fillRoundedRect(sendX, inputY, SEND_W, INPUT_H, { tl: 0, tr: 0, bl: 0, br: 0 });
      sendG.fillStyle(0xffffff, hover ? 0.3 : 0.18);
      sendG.fillRoundedRect(sendX + 4, inputY + 3, SEND_W - 8, INPUT_H * 0.38, 3);
    };
    drawSend(false);
    this._push(sendG);

    this._push(this.scene.add.text(sendX + SEND_W / 2, inputY + INPUT_H / 2, "Gửi", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 1));

    const sendZone = this.scene.add.zone(sendX + SEND_W / 2, inputY + INPUT_H / 2, SEND_W, INPUT_H)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 2);
    sendZone.on("pointerover",  () => drawSend(true));
    sendZone.on("pointerout",   () => drawSend(false));
    sendZone.on("pointerdown",  () => this._sendMessage());
    this._push(sendZone);

    // ── Nút Micro bên phải nút Gửi (đồng bộ chuẩn với voiceChat) ──
    if (this.enableMic) {
      const micX = sendX + SEND_W + MIC_GAP;
      const micCX = micX + MIC_W / 2;
      const micCY = inputY + INPUT_H / 2;
      const micG = this.scene.add.graphics().setDepth(D);
      const micBadgeTxt = this.scene.add.text(micCX + 11, micCY + 10, "×", {
        fontFamily: "Signika", fontSize: "12px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 3).setVisible(false);
      this._push(micG);
      this._push(micBadgeTxt);

      // Icon micro từ ảnh assets/ui/shared/microphone.png (nạp lười nếu scene chưa preload)
      let micImg = null;
      const MIC_ICON = 34;
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

        // Bóng đổ nhẹ phía dưới icon (không còn nền vuông)
        micG.fillStyle(0x000000, 0.28);
        micG.fillCircle(micCX + 1, micCY + 2.5, R - 1);

        // Viền sáng: xanh lá phát sáng khi đang nói, xanh nhạt khi mic mở
        if (speaking) {
          micG.lineStyle(6, 0x4ade80, 0.28);
          micG.strokeCircle(micCX, micCY, R + 3.5);
          micG.lineStyle(2.5, 0x86efac, 1);
          micG.strokeCircle(micCX, micCY, R + 1.5);
        } else if (on) {
          micG.lineStyle(1.8, 0x93e6ff, 0.6);
          micG.strokeCircle(micCX, micCY, R + 1.5);
        }

        // Icon micro chính là nút bấm
        ensureMicImg();
        if (micImg) {
          const sc = (micHovered ? 1.1 : 1) * (speaking ? 1.06 : 1);
          micImg.setDisplaySize(MIC_ICON * sc, MIC_ICON * sc);
          if (on) { micImg.clearTint(); micImg.setAlpha(1); }
          else    { micImg.setTint(0x9aa8bb); micImg.setAlpha(0.85); }
        }

        // Chấm tròn đỏ dấu × khi đang TẮT mic
        if (!on) {
          const bx = micCX + 12, by = micCY + 11, br = 6.5;
          micG.fillStyle(0x000000, 0.38);
          micG.fillCircle(bx + 1, by + 1.5, br);
          micG.fillStyle(0xef4444, 1);
          micG.fillCircle(bx, by, br);
          micG.lineStyle(1.5, 0xffffff, 0.95);
          micG.strokeCircle(bx, by, br);
          micBadgeTxt.setPosition(bx, by - 0.5).setVisible(true);
        } else {
          micBadgeTxt.setVisible(false);
        }
      };

      const micZone = this.scene.add.zone(micCX, micCY, MIC_W, INPUT_H)
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

      if (emojiRe.test(m.text)) {
        emojiRe.lastIndex = 0;
        let curX = cb.x;
        let lastIdx = 0;
        let match;
        while ((match = emojiRe.exec(m.text)) !== null) {
          const before = m.text.slice(lastIdx, match.index);
          if (before) {
            const tObj = this.scene.add.text(curX, lineY + 2, before, {
              fontFamily: "Signika", fontSize: "13px", color: m.color,
            }).setDepth(this.depth + 1).setMask(this._clipMask);
            this._msgObjs.push(tObj);
            curX += tObj.width;
          }
          const eid = Number(match[1]);
          if (eid >= 1 && eid <= 50) {
            const texKey = this._ensureEmojiTexture(eid);
            if (texKey) {
              const eImg = this.scene.add.image(curX + 11, lineY + cb.lineH / 2, texKey)
                .setDisplaySize(20, 20)
                .setDepth(this.depth + 1)
                .setMask(this._clipMask);
              this._msgObjs.push(eImg);
            }
            curX += 24;
          }
          lastIdx = match.index + match[0].length;
        }
        const after = m.text.slice(lastIdx);
        if (after) {
          const tAfter = this.scene.add.text(curX, lineY + 2, after, {
            fontFamily: "Signika", fontSize: "13px", color: m.color,
          }).setDepth(this.depth + 1).setMask(this._clipMask);
          this._msgObjs.push(tAfter);
        }
      } else {
        const msg = this.scene.add.text(cb.x, lineY + 2, m.text, {
          fontFamily: "Signika", fontSize: "13px", color: m.color,
          wordWrap: { width: maxTextW }
        }).setDepth(this.depth + 1).setMask(this._clipMask);
        this._msgObjs.push(msg);
      }

      if (m.tsStr) {
        const ts = this.scene.add.text(cb.x + cb.w, lineY + 3, m.tsStr, {
          fontFamily: "Signika", fontSize: "11px", color: "#6688aa"
        }).setOrigin(1, 0).setDepth(this.depth + 1).setMask(this._clipMask);
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
    this._placeholder?.setVisible(false);
    if (!this._keyListener) {
      this._keyListener = (e) => {
        if (!this._focused) return;
        if (e.key === "Enter")          { this._sendMessage(); }
        else if (e.key === "Backspace") { this._inputText = this._inputText.slice(0, -1); this._syncInput(); }
        else if (e.key === "Escape")    { this._focused = false; }
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
    this.socket.on(`chat:${this.channel}:message`, this._onMessage);
    this.socket.on(`chat:${this.channel}:history`, this._onHistory);
    this.socket.on("chat:error", this._onError);
    if (this.channel === "world") this.socket.emit("chat:world:join");
    if (this.channel === "room")  this.socket.emit("chat:room:history:get");
  }

  _unbindSocket() {
    if (!this.socket) return;
    if (this._onMessage) this.socket.off(`chat:${this.channel}:message`, this._onMessage);
    if (this._onHistory) this.socket.off(`chat:${this.channel}:history`, this._onHistory);
    if (this._onError)   this.socket.off("chat:error", this._onError);
  }
}
