import { SERVER_URL } from "../config.js";
import { setupClickSound } from "../utils/clickSound.js";
export default class LoginScene extends Phaser.Scene {

  constructor() {
    super("LoginScene");
  }

  preload() {
    this.load.image("bg_account", "assets/nen_24.png");
    this.load.image("icon", "assets/ui/cotyphu.png");
    this.load.audio("lobby_bgm", "assets/music/lobby/lobbyscene.mp3");
  }

  create() {
    const { width, height } = this.scale;
    setupClickSound(this);

    // ── Background ──────────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "bg_account");
    bg.setScale(Math.max(width / bg.width, height / bg.height));
    bg.setDepth(-10);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.30).setDepth(-5);
    this._spawnStars(width, height);

    // ── Panel chính ─────────────────────────────────────────────
    const PW = 440, PH = 360;
    const PX = width / 2, PY = height / 2 + 10;
    const px = PX - PW / 2, py = PY - PH / 2;
    const R  = 18;

    const panel = this.add.graphics().setDepth(2);
    // Bóng
    panel.fillStyle(0x000000, 0.28);
    panel.fillRoundedRect(px + 6, py + 8, PW, PH, R);
    // Nền vàng kem gradient
    panel.fillGradientStyle(0xf5e8c0, 0xf5e8c0, 0xeedd99, 0xeedd99, 1);
    panel.fillRoundedRect(px, py, PW, PH, R);
    // Viền trắng
    panel.lineStyle(3, 0xffffff, 1);
    panel.strokeRoundedRect(px, py, PW, PH, R);
    // Gloss
    panel.fillStyle(0xffffff, 0.18);
    panel.fillRoundedRect(px + 6, py + 4, PW - 12, 20, 8);
    // Nét đứt bên trong
    this._drawDashedBorderInner(panel, px + 14, py + 14, PW - 28, PH - 28, R - 4, 0xb8922e);

    // ── Header vàng đậm (title pill) ────────────────────────────
    const pillW = 260, pillH = 50, pillR = pillH / 2;
    const pillY = py - pillH / 2;
    const hdr = this.add.graphics().setDepth(5);
    hdr.fillStyle(0x000000, 0.20);
    hdr.fillRoundedRect(PX - pillW/2 + 4, pillY + 5, pillW, pillH, pillR);
    hdr.fillGradientStyle(0xf5c842, 0xf5c842, 0xd4960a, 0xd4960a, 1);
    hdr.fillRoundedRect(PX - pillW/2, pillY, pillW, pillH, pillR);
    hdr.fillStyle(0xffffff, 0.30);
    hdr.fillRoundedRect(PX - pillW/2 + 10, pillY + 7, pillW - 20, pillH * 0.38, pillR - 2);
    hdr.lineStyle(2.5, 0x8b6010, 1);
    hdr.strokeRoundedRect(PX - pillW/2, pillY, pillW, pillH, pillR);

    this.add.text(PX, pillY + pillH / 2, "Cờ Tỷ Phú", {
      fontFamily: "Signika", fontSize: "22px",
      color: "#3a1800", fontStyle: "bold",
      stroke: "#ffffff88", strokeThickness: 1,
    }).setOrigin(0.5).setDepth(6);

    // ── Input fields (Phaser + DOM) ──────────────────────────────
    this._injectStyles();
    this.form = document.createElement("div");
    this.form.style.cssText = `
      position:absolute; top:40%; left:50%;
      transform:translate(-50%, -38%);
      display:flex; flex-direction:column; gap:14px; width:320px;
    `;
    this.form.innerHTML = `
      <input id="username" class="gameInputFlat" placeholder="Tài khoản"/>
      <input id="password" class="gameInputFlat" type="password" placeholder="Mật khẩu"/>
    `;
    document.body.appendChild(this.form);
    this.form.addEventListener("keydown", (e) => { if (e.key === "Enter") this._handleLogin(); });
    this.events.once("shutdown", () => { if (this.form) this.form.remove(); });

    // ── Nút Đăng nhập (pill xanh lá) ────────────────────────────
    const btnW = 220, btnH = 52, btnR2 = btnH / 2;
    const btnX = PX, btnY = py + PH - 130;
    const btnG = this.add.graphics().setDepth(6);
    const drawLoginBtn = (hover = false) => {
      btnG.clear();
      btnG.fillStyle(0x22aa44, 0.18);
      btnG.fillRoundedRect(btnX - btnW/2 - 4, btnY - btnH/2 - 4, btnW + 8, btnH + 8, btnR2 + 3);
      btnG.fillStyle(0x000000, 0.25);
      btnG.fillRoundedRect(btnX - btnW/2 + 3, btnY - btnH/2 + 5, btnW, btnH, btnR2);
      btnG.fillGradientStyle(0x33cc55, 0x33cc55, 0x118833, 0x118833, 1);
      btnG.fillRoundedRect(btnX - btnW/2, btnY - btnH/2, btnW, btnH, btnR2);
      btnG.fillStyle(0xffffff, hover ? 0.38 : 0.22);
      btnG.fillRoundedRect(btnX - btnW/2 + 10, btnY - btnH/2 + 6, btnW - 20, btnH * 0.35, btnR2 - 4);
      btnG.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
      btnG.strokeRoundedRect(btnX - btnW/2, btnY - btnH/2, btnW, btnH, btnR2);
    };
    drawLoginBtn();
    this.add.text(btnX, btnY, "Đăng nhập", {
      fontFamily: "Signika", fontSize: "22px", color: "#ffffff",
      fontStyle: "bold", stroke: "#004422", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(7);

    const loginZone = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: "pointer" }).setDepth(8);
    loginZone.on("pointerover",  () => drawLoginBtn(true));
    loginZone.on("pointerout",   () => drawLoginBtn(false));
    loginZone.on("pointerdown",  () => {
      this.tweens.add({ targets: btnG, alpha: 0.65, duration: 60, yoyo: true });
      this._handleLogin();
    });

    // ── Dòng Đăng ký ────────────────────────────────────────────
    const regY = py + PH - 50;
    this.add.text(PX - 50, regY, "Bạn chưa có tài khoản?", {
      fontFamily: "Signika", fontSize: "13px", color: "#7a5820",
    }).setOrigin(0.5).setDepth(6);

    const regBtnW = 90, regBtnH = 30, regBtnR = regBtnH / 2;
    const regX = PX + 70;
    const regG = this.add.graphics().setDepth(6);
    regG.fillGradientStyle(0xf5c842, 0xf5c842, 0xd4960a, 0xd4960a, 1);
    regG.fillRoundedRect(regX - regBtnW/2, regY - regBtnH/2, regBtnW, regBtnH, regBtnR);
    regG.lineStyle(1.5, 0x8b6010, 1);
    regG.strokeRoundedRect(regX - regBtnW/2, regY - regBtnH/2, regBtnW, regBtnH, regBtnR);
    this.add.text(regX, regY, "Đăng ký", {
      fontFamily: "Signika", fontSize: "13px", color: "#3a1800", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(7);

    const regZone = this.add.zone(regX, regY, regBtnW, regBtnH).setInteractive({ cursor: "pointer" }).setDepth(8);
    regZone.on("pointerdown", () => {
      if (this.form) this.form.remove();
      this._goTo("RegisterScene");
    });
  }

  // ── Login logic ─────────────────────────────────────────────────
  async _handleLogin() {
    const username = document.getElementById("username")?.value?.trim();
    const password = document.getElementById("password")?.value;

    if (!username || !password) {
      this.showAlert("Vui lòng nhập đầy đủ thông tin"); return;
    }
    if (username.includes(" ") || password.includes(" ")) {
      this.showAlert("Thông tin không được chứa khoảng trắng"); return;
    }

    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Đang đăng nhập..."; }

    try {
      const res = await fetch(`${SERVER_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        const playerData = {
          user: data.user, characters: data.characters,
          skins: data.skins, token: data.token,
          active: {
            characterId: data.active?.character_id,
            characterName: data.active?.characterName,
            skin: data.active?.active_skin_id,
            active_skin_id: data.active?.active_skin_id
          }
        };
        this.registry.set("playerData", playerData);
        localStorage.setItem("playerData", JSON.stringify(playerData));

        this._playSuccessEffect();
        setTimeout(() => {
          if (this.form) this.form.remove();
          this._goTo(data.user.is_new_player ? "CreateCharacterScene" : "LobbyScene");
        }, 600);
      } else {
        this.showAlert(data.message);
        if (btn) { btn.disabled = false; btn.textContent = "Đăng nhập"; }
        this._shakeForm();
      }
    } catch {
      this.showAlert("Không thể kết nối server");
      if (btn) { btn.disabled = false; btn.textContent = "Đăng nhập"; }
    }
  }

  _goTo(sceneName, data = {}) {
    if (this.form) this.form.remove();

    // Play nhạc lobby ngay trong interaction context (user vừa click)
    if (sceneName === "LobbyScene" && !this.sound.get("lobby_bgm")) {
      try {
        const bgm = this.sound.add("lobby_bgm", { loop: true, volume: 0.4 });
        bgm.play();
      } catch(e) {}
    }

    // Flash trắng rồi fade đen
    const { width, height } = this.scale;
    const flash = this.add.rectangle(width/2, height/2, width, height, 0xffffff, 0).setDepth(500);
    this.tweens.add({
      targets: flash, alpha: 0.6, duration: 120, ease: "Quad.easeOut",
      onComplete: () => {
        this.cameras.main.fadeOut(280, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start(sceneName, data);
        });
      }
    });
  }

  // ── Panel style TarotScene ───────────────────────────────────────
  _createStyledPanel(x, y, w, h, radius) {
    const g = this.add.graphics().setDepth(2);
    const left = x - w / 2, top = y - h / 2;

    // Bóng đổ
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(left + 6, top + 8, w, h, radius);

    // Nền kem ấm
    g.fillStyle(0xfff0d0, 1);
    g.fillRoundedRect(left, top, w, h, radius);

    // Highlight trên
    g.fillStyle(0xffffff, 0.38);
    g.fillRoundedRect(left + 4, top + 4, w - 8, h * 0.16, radius);

    // Viền nâu đậm
    g.lineStyle(4, 0x8b5e1a, 1);
    g.strokeRoundedRect(left, top, w, h, radius);

    // Viền nét đứt vàng bên trong
    this._drawDashedBorder(g, left + 10, top + 10, w - 20, h - 20, radius - 4, 0xc8a060, 2);
  }

  _drawDashedBorderInner(g, left, top, w, h, r, color) {
    g.lineStyle(1.5, color, 0.55);
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

  _drawDashedBorder(g, left, top, w, h, r, color, lw) {
    g.lineStyle(lw, color, 0.7);
    const dash = 10, skip = 7;
    const drawSeg = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ax = (x2 - x1) / len, ay = (y2 - y1) / len;
      for (let d = 0; d < len; d += dash + skip) {
        const end = Math.min(d + dash, len);
        g.beginPath();
        g.moveTo(x1 + ax * d, y1 + ay * d);
        g.lineTo(x1 + ax * end, y1 + ay * end);
        g.strokePath();
      }
    };
    drawSeg(left + r, top, left + w - r, top);
    drawSeg(left + w, top + r, left + w, top + h - r);
    drawSeg(left + w - r, top + h, left + r, top + h);
    drawSeg(left, top + h - r, left, top + r);
    [
      { a: 180, b: 270, cx: left + r,     cy: top + r },
      { a: 270, b: 360, cx: left + w - r, cy: top + r },
      { a: 0,   b: 90,  cx: left + w - r, cy: top + h - r },
      { a: 90,  b: 180, cx: left + r,     cy: top + h - r },
    ].forEach(c => {
      g.beginPath();
      g.arc(c.cx, c.cy, r, Phaser.Math.DegToRad(c.a), Phaser.Math.DegToRad(c.b));
      g.strokePath();
    });
  }

  // ── Stars nền ───────────────────────────────────────────────────
  _spawnStars(width, height) {
    for (let i = 0; i < 55; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const size = Phaser.Math.FloatBetween(3, 7);
      const g = this.add.graphics().setDepth(-3);
      g.fillStyle(0xfff0c0, Phaser.Math.FloatBetween(0.4, 0.9));
      // Ngôi sao 4 cánh
      g.fillTriangle(x, y - size, x - size*0.35, y, x + size*0.35, y);
      g.fillTriangle(x, y + size, x - size*0.35, y, x + size*0.35, y);
      g.fillTriangle(x - size, y, x, y - size*0.35, x, y + size*0.35);
      g.fillTriangle(x + size, y, x, y - size*0.35, x, y + size*0.35);
      this.tweens.add({
        targets: g, alpha: 0.05,
        duration: Phaser.Math.Between(1200, 3000), yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000), ease: "Sine.easeInOut"
      });
    }
  }

  // ── Orbs trang trí bay lơ lửng ──────────────────────────────────
  _spawnOrbs(width, height) {
    const colors = [0xffd080, 0xff8844, 0x88ccff, 0xcc88ff];
    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(40, width - 40);
      const y = Phaser.Math.Between(40, height - 40);
      const r = Phaser.Math.Between(8, 18);
      const color = colors[i % colors.length];
      const orb = this.add.circle(x, y, r, color, 0.18).setDepth(-2);
      this.tweens.add({
        targets: orb,
        y: y - Phaser.Math.Between(20, 50),
        alpha: { from: 0.18, to: 0.06 },
        duration: Phaser.Math.Between(2500, 4500),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
        ease: "Sine.easeInOut"
      });
    }
  }

  // ── Particles nhỏ tỏa quanh panel ───────────────────────────────
  _spawnPanelParticles(px, py, pw, ph) {
    const corners = [
      { x: px - pw / 2, y: py - ph / 2 },
      { x: px + pw / 2, y: py - ph / 2 },
      { x: px - pw / 2, y: py + ph / 2 },
      { x: px + pw / 2, y: py + ph / 2 },
    ];
    corners.forEach(c => {
      const dot = this.add.circle(c.x, c.y, 3, 0xffd080, 0.7).setDepth(3);
      this.tweens.add({
        targets: dot, alpha: { from: 0.7, to: 0.15 },
        duration: 1200, yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 800), ease: "Sine.easeInOut"
      });
    });
  }

  // ── Hiệu ứng đăng nhập thành công ───────────────────────────────
  _playSuccessEffect() {
    const { width, height } = this.scale;
    for (let i = 0; i < 20; i++) {
      const colors = [0xffd700, 0xffffff, 0xff8800, 0x00ff88];
      const dot = this.add.circle(
        Phaser.Math.Between(width * 0.2, width * 0.8),
        Phaser.Math.Between(height * 0.2, height * 0.8),
        Phaser.Math.Between(3, 8), colors[i % colors.length], 0.9
      ).setDepth(200);
      this.tweens.add({
        targets: dot, y: dot.y - Phaser.Math.Between(60, 160),
        alpha: 0, duration: Phaser.Math.Between(600, 1000),
        delay: Phaser.Math.Between(0, 400), ease: "Quad.easeOut",
        onComplete: () => dot.destroy()
      });
    }
    this.showAlert("Đăng nhập thành công!", "#44ff88", 800);
  }

  // ── Shake form khi sai ───────────────────────────────────────────
  _shakeForm() {
    if (!this.form) return;
    const orig = this.form.style.transform;
    let count = 0;
    const shake = setInterval(() => {
      const dx = count % 2 === 0 ? 8 : -8;
      this.form.style.transform = `translate(calc(-50% + ${dx}px), -28%)`;
      count++;
      if (count >= 6) { clearInterval(shake); this.form.style.transform = orig; }
    }, 55);
  }

  // ── Alert ────────────────────────────────────────────────────────
  showAlert(message, color = "#fff6d7", duration = 2200) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height - 80, message, {
      fontFamily: "Signika", fontSize: "17px",
      color, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
      backgroundColor: "#00000099",
      padding: { x: 16, y: 9 },
    }).setOrigin(0.5).setDepth(300).setAlpha(0);

    this.tweens.add({
      targets: t, alpha: 1, y: height - 100,
      duration: 200, ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(duration, () => {
          this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
        });
      }
    });
  }

  // ── CSS ──────────────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById("loginStyles")) return;
    const style = document.createElement("style");
    style.id = "loginStyles";
    style.innerHTML = `
      .inputWrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .inputIcon {
        position: absolute;
        left: 12px;
        font-size: 16px;
        pointer-events: none;
        z-index: 1;
      }
      .gameInput {
        all: unset;
        width: 100%;
        padding: 12px 12px 12px 38px;
        box-sizing: border-box;
        color: #5b1f07;
        border-radius: 10px;
        border-top: 3px solid #a38643;
        border-left: 3px solid #a38643;
        border-bottom: 1px solid #a38643;
        border-right: 1px solid #a38643;
        background: #ecc383;
        font-family: Signika;
        font-size: 16px;
        font-weight: bold;
        box-shadow: inset 0 3px 6px rgba(0,0,0,0.2);
        transition: box-shadow 0.2s;
      }
      .gameInput:focus {
        box-shadow: inset 0 3px 6px rgba(0,0,0,0.2), 0 0 0 3px rgba(212,160,48,0.5);
      }
      .gameInput::placeholder { color: #fff6d7; }
      .gameBtn {
        padding: 13px;
        border-radius: 16px;
        border: 2.5px solid #6a3a10;
        background: linear-gradient(to bottom, #ffa63c, #f07e2a 60%, #d8611a);
        color: #3b1b00;
        font-family: Signika;
        font-size: 18px;
        font-weight: bold;
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.6), 0 5px 0 #5a2c0d;
        cursor: pointer;
        transition: 0.15s;
        letter-spacing: 1px;
      }
      .gameBtn:hover { filter: brightness(1.1); }
      .gameBtn:active {
        transform: translateY(4px);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.4), 0 1px 0 #5a2c0d;
      }
      .gameBtn:disabled { opacity: 0.6; cursor: not-allowed; }
      .gameInputFlat {
        all: unset;
        width: 100%;
        padding: 13px 16px;
        box-sizing: border-box;
        color: #5b1f07;
        border-radius: 12px;
        background: linear-gradient(to bottom, #e8d4a8, #f5e8c8);
        border: 2px solid #c8a060;
        font-family: Signika;
        font-size: 16px;
        font-weight: bold;
        box-shadow: inset 0 2px 5px rgba(0,0,0,0.15);
        transition: box-shadow 0.2s;
      }
      .gameInputFlat:focus {
        box-shadow: inset 0 2px 5px rgba(0,0,0,0.15), 0 0 0 3px rgba(0,170,204,0.45);
        outline: none;
      }
      .gameInputFlat::placeholder { color: #a07840; font-weight: normal; }
    `;
    document.head.appendChild(style);
  }

  // backward compat
  createDashedPanel(x, y, w, h, radius) {
    this._createStyledPanel(x, y, w, h, radius);
  }
}
