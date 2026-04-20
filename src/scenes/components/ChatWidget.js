/**
 * ChatWidget — Widget chat với scrollable message area
 */
export default class ChatWidget {
  constructor(scene, { channel, socket, depth = 200, myId = null }) {
    this.scene   = scene;
    this.channel = channel;
    this.socket  = socket;
    this.depth   = depth;
    this.myId    = myId ? Number(myId) : null;

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
  }

  build(x, y, w, h) {
    this._x = x; this._y = y; this._w = w; this._h = h;

    const SCROLL_W = 8;
    const INPUT_H  = 40;
    const MSG_H    = h - INPUT_H;
    const SEND_W   = 52;
    const INPUT_W  = w - SEND_W;
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

    // chatBox dimensions
    const LINE_H = 18;
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

    // ── Nút Gửi ───────────────────────────────────────────────────
    const sendX = x + INPUT_W;
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

    this._bindSocket();
    return this;
  }

  addSystemMessage(msg) {
    this._appendLine(`[Hệ thống] ${msg}`, "#88ccff");
  }

  destroy() {
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

  _renderMessages() {
    // Xóa text objects cũ
    this._msgObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._msgObjs = [];

    const cb    = this._chatBox;
    const total = this._allMessages.length;
    const vis   = this._visibleLines;

    // Tính index bắt đầu hiển thị
    // scrollOffset=0 → hiện bottom, scrollOffset=max → hiện top
    const maxScroll  = Math.max(0, total - vis);
    const startIdx   = maxScroll - this._scrollOffset;
    const endIdx     = Math.min(total, startIdx + vis);

    for (let i = startIdx; i < endIdx; i++) {
      const m    = this._allMessages[i];
      const lineY = cb.y + (i - startIdx) * cb.lineH;

      const msg = this.scene.add.text(cb.x, lineY, m.text, {
        fontFamily: "Signika", fontSize: "13px", color: m.color,
        wordWrap: { width: cb.w - (m.tsStr ? 52 : 0) }
      }).setDepth(this.depth + 1).setMask(this._clipMask);
      this._msgObjs.push(msg);

      if (m.tsStr) {
        const ts = this.scene.add.text(cb.x + cb.w, lineY, m.tsStr, {
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
