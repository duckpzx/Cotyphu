/**
 * ChatWidget — Widget chat dùng chung cho LobbyScene, RoomScene, BoardScene
 *
 * Cách dùng:
 *   this._chat = new ChatWidget(scene, { channel: "world" | "room" | "game", socket });
 *   this._chat.build(x, y, width, height);
 *   this._chat.destroy();
 */
export default class ChatWidget {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ channel: string, socket: import("socket.io-client").Socket, depth?: number }} opts
   */
  constructor(scene, { channel, socket, depth = 200 }) {
    this.scene   = scene;
    this.channel = channel; // "world" | "room" | "game"
    this.socket  = socket;
    this.depth   = depth;

    this._objects      = [];
    this._lines        = [];
    this._inputText    = "";
    this._keyListener  = null;
    this._chatBox      = null;
    this._inputDisplay = null;
    this._placeholder  = null;
    this._focused      = false;
  }

  // ── PUBLIC ──────────────────────────────────────────────────────────

  /**
   * Dựng UI chat tại vị trí (x, y) với kích thước (w, h)
   */
  build(x, y, w, h) {
    this._x = x; this._y = y; this._w = w; this._h = h;

    const INPUT_H  = 40;
    const MSG_H    = h - INPUT_H;
    const SEND_W   = 52;
    const INPUT_W  = w - SEND_W;
    const D        = this.depth;

    // ── Vùng tin nhắn ──────────────────────────────────────────────
    const msgBg = this.scene.add.graphics().setDepth(D);
    msgBg.fillStyle(0x041428, 0.62);
    msgBg.fillRoundedRect(x, y, w, MSG_H, { tl: 0, tr: 0, bl: 0, br: 0 });
    msgBg.lineStyle(1.5, 0x2255aa, 0.5);
    msgBg.strokeRoundedRect(x, y, w, MSG_H, { tl: 0, tr: 0, bl: 0, br: 0 });
    this._push(msgBg);

    this._chatBox = {
      x: x + 8, y: y + 6,
      w: w - 16, h: MSG_H - 10,
      lineH: 18, lines: []
    };

    // ── Ô input ─────────────────────────────────────────────────────
    const inputY = y + MSG_H;
    const inputBg = this.scene.add.graphics().setDepth(D);
    inputBg.fillStyle(0x020d1e, 0.92);
    inputBg.fillRoundedRect(x, inputY, INPUT_W, INPUT_H, { tl: 0, tr: 0, bl: 12, br: 0 });
    inputBg.lineStyle(1.5, 0x2255aa, 0.6);
    inputBg.strokeRoundedRect(x, inputY, INPUT_W, INPUT_H, { tl: 0, tr: 0, bl: 12, br: 0 });
    this._push(inputBg);

    this._placeholder = this.scene.add.text(x + 12, inputY + INPUT_H / 2, "Nhập tin nhắn...", {
      fontFamily: "Signika", fontSize: "13px", color: "#4477aa"
    }).setOrigin(0, 0.5).setDepth(D + 1);
    this._push(this._placeholder);

    this._inputDisplay = this.scene.add.text(x + 12, inputY + INPUT_H / 2, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff"
    }).setOrigin(0, 0.5).setDepth(D + 1);
    this._push(this._inputDisplay);

    // Zone click để focus input
    const inputZone = this.scene.add.zone(x + INPUT_W / 2, inputY + INPUT_H / 2, INPUT_W, INPUT_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 2);
    inputZone.on("pointerover", () => { this.scene.game.canvas.style.cursor = "text"; });
    inputZone.on("pointerout",  () => { this.scene.game.canvas.style.cursor = "default"; });
    inputZone.on("pointerdown", () => this._focusInput());
    this._push(inputZone);

    // ── Nút Gửi ─────────────────────────────────────────────────────
    const sendX = x + INPUT_W;
    const sendG = this.scene.add.graphics().setDepth(D);
    const drawSend = (hover) => {
      sendG.clear();
      sendG.fillGradientStyle(
        hover ? 0x22bbff : 0x0099ff, hover ? 0x22bbff : 0x0099ff,
        hover ? 0x0055cc : 0x0066cc, hover ? 0x0055cc : 0x0066cc, 1
      );
      sendG.fillRoundedRect(sendX, inputY, SEND_W, INPUT_H, { tl: 0, tr: 0, bl: 0, br: 8 });
      sendG.fillStyle(0xffffff, hover ? 0.3 : 0.18);
      sendG.fillRoundedRect(sendX + 4, inputY + 3, SEND_W - 8, INPUT_H * 0.38, 3);
    };
    drawSend(false);
    this._push(sendG);

    const sendTxt = this.scene.add.text(sendX + SEND_W / 2, inputY + INPUT_H / 2, "Gửi", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 1);
    this._push(sendTxt);

    const sendZone = this.scene.add.zone(sendX + SEND_W / 2, inputY + INPUT_H / 2, SEND_W, INPUT_H)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 2);
    sendZone.on("pointerover",  () => drawSend(true));
    sendZone.on("pointerout",   () => drawSend(false));
    sendZone.on("pointerdown",  () => this._sendMessage());
    this._push(sendZone);

    // ── Lắng nghe socket ────────────────────────────────────────────
    this._bindSocket();

    // ── Join world chat nếu cần ──────────────────────────────────────
    if (this.channel === "world") {
      this.socket?.emit("chat:world:join");
    }

    return this;
  }

  /** Thêm tin nhắn hệ thống (không gửi lên server) */
  addSystemMessage(msg) {
    this._appendLine(`[Hệ thống] ${msg}`, "#88ccff");
  }

  /** Dọn dẹp toàn bộ */
  destroy() {
    if (this.channel === "world") {
      this.socket?.emit("chat:world:leave");
    }
    this._unbindSocket();
    this._removeKeyListener();
    this._objects.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._objects = [];
    this._lines   = [];
  }

  // ── PRIVATE ─────────────────────────────────────────────────────────

  _push(obj) {
    this._objects.push(obj);
    return obj;
  }

  _focusInput() {
    this._focused = true;
    this._placeholder?.setVisible(false);
    if (!this._keyListener) {
      this._keyListener = (e) => {
        if (!this._focused) return;
        if (e.key === "Enter") {
          this._sendMessage();
        } else if (e.key === "Backspace") {
          this._inputText = this._inputText.slice(0, -1);
          this._syncInput();
        } else if (e.key === "Escape") {
          this._focused = false;
        } else if (e.key.length === 1) {
          if (this._inputText.length < 200) {
            this._inputText += e.key;
            this._syncInput();
          }
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
  }

  _bindSocket() {
    if (!this.socket) return;

    this._onMessage = (data) => {
      this._appendLine(`[${data.name}] ${data.message}`, "#ffffff", data.time);
    };
    this._onHistory = (history) => {
      history.forEach(d => this._appendLine(`[${d.name}] ${d.message}`, "#ffffff", d.time));
    };
    this._onError = (data) => {
      this._appendLine(`⚠ ${data.message}`, "#ff8888");
    };

    this.socket.on(`chat:${this.channel}:message`, this._onMessage);
    this.socket.on(`chat:${this.channel}:history`, this._onHistory);
    this.socket.on("chat:error", this._onError);
  }

  _unbindSocket() {
    if (!this.socket) return;
    if (this._onMessage) this.socket.off(`chat:${this.channel}:message`, this._onMessage);
    if (this._onHistory) this.socket.off(`chat:${this.channel}:history`, this._onHistory);
    if (this._onError)   this.socket.off("chat:error", this._onError);
  }

  _appendLine(text, color = "#ffffff", time = null) {
    if (!this._chatBox) return;
    const cb = this._chatBox;
    const maxLines = Math.floor(cb.h / cb.lineH);

    if (this._lines.length >= maxLines) {
      const old = this._lines.shift();
      try { old?.ts?.destroy(); old?.msg?.destroy(); } catch(e) {}
      this._lines.forEach(l => {
        l.msg.setY(l.msg.y - cb.lineH);
        l.ts?.setY(l.ts.y - cb.lineH);
      });
    }

    const lineY = cb.y + this._lines.length * cb.lineH;

    // Timestamp — format thông minh
    let tsStr = "";
    if (time) {
      const d   = new Date(time);
      const now = new Date();
      const diffMin = Math.floor((Date.now() - time) / 60000);
      if (diffMin < 1) {
        tsStr = "vừa xong";
      } else if (diffMin < 60) {
        tsStr = `${diffMin}ph`;
      } else if (d.toDateString() === now.toDateString()) {
        tsStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      } else {
        tsStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
      }
    }

    const msg = this.scene.add.text(cb.x, lineY, text, {
      fontFamily: "Signika", fontSize: "13px", color,
      wordWrap: { width: cb.w - (tsStr ? 52 : 0) }
    }).setDepth(this.depth + 1);

    let ts = null;
    if (tsStr) {
      ts = this.scene.add.text(cb.x + cb.w, lineY, tsStr, {
        fontFamily: "Signika", fontSize: "11px", color: "#6688aa"
      }).setOrigin(1, 0).setDepth(this.depth + 1);
      this._objects.push(ts);
    }

    const entry = { msg, ts };
    this._lines.push(entry);
    this._objects.push(msg);
  }
}
