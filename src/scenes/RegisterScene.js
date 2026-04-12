import { SERVER_URL } from "../config.js";
export default class RegisterScene extends Phaser.Scene {

  constructor() {
    super("RegisterScene");
  }

  preload() {
    this.load.image("bg_account", "assets/nen_1.png");
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "bg_account");
    bg.setScale(Math.max(width / bg.width, height / bg.height));
    bg.setDepth(-10);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.30).setDepth(-5);
    this._spawnStars(width, height);

    // ── Panel chính ─────────────────────────────────────────────
    const PW = 440, PH = 420;
    const PX = width / 2, PY = height / 2;
    const px = PX - PW / 2, py = PY - PH / 2;
    const R  = 18;

    const panel = this.add.graphics().setDepth(2);
    panel.fillStyle(0x000000, 0.28);
    panel.fillRoundedRect(px + 6, py + 8, PW, PH, R);
    panel.fillGradientStyle(0xf5e8c0, 0xf5e8c0, 0xeedd99, 0xeedd99, 1);
    panel.fillRoundedRect(px, py, PW, PH, R);
    panel.lineStyle(3, 0xffffff, 1);
    panel.strokeRoundedRect(px, py, PW, PH, R);
    panel.fillStyle(0xffffff, 0.18);
    panel.fillRoundedRect(px + 6, py + 4, PW - 12, 20, 8);
    this._drawDashedBorderInner(panel, px + 14, py + 14, PW - 28, PH - 28, R - 4, 0xb8922e);

    // ── Header pill ──────────────────────────────────────────────
    const pillW = 220, pillH = 52, pillR = pillH / 2;
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
      fontFamily: "Signika", fontSize: "22px", color: "#3a1800", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(6);

    // ── DOM inputs ───────────────────────────────────────────────
    this._injectStyles();
    this.form = document.createElement("div");
    this.form.style.cssText = `
      position:absolute; top:39%; left:50%;
      transform:translate(-50%, -42%);
      display:flex; flex-direction:column; gap:14px; width:320px;
    `;
    this.form.innerHTML = `
      <input id="reg_username" class="gameInputFlat" placeholder="Tài khoản"/>
      <input id="reg_password" class="gameInputFlat" type="password" placeholder="Mật khẩu"/>
            <input id="reg_email"    class="gameInputFlat" placeholder="Email"/>
    `;
    document.body.appendChild(this.form);
    this.form.addEventListener("keydown", (e) => { if (e.key === "Enter") this._handleRegister(); });
    this.events.once("shutdown", () => { if (this.form) this.form.remove(); });

    // ── Nút Đăng ký (pill cam) ───────────────────────────────────
    const btnW = 200, btnH = 50, btnR2 = btnH / 2;
    const btnX = PX, btnY = py + PH - 125;
    const btnG = this.add.graphics().setDepth(6);
    const drawRegBtn = (hover = false) => {
      btnG.clear();
      btnG.fillStyle(0xff8800, 0.15);
      btnG.fillRoundedRect(btnX - btnW/2 - 4, btnY - btnH/2 - 4, btnW + 8, btnH + 8, btnR2 + 3);
      btnG.fillStyle(0x000000, 0.22);
      btnG.fillRoundedRect(btnX - btnW/2 + 3, btnY - btnH/2 + 5, btnW, btnH, btnR2);
      btnG.fillGradientStyle(0xffaa22, 0xffaa22, 0xdd6600, 0xdd6600, 1);
      btnG.fillRoundedRect(btnX - btnW/2, btnY - btnH/2, btnW, btnH, btnR2);
      btnG.fillStyle(0xffffff, hover ? 0.38 : 0.22);
      btnG.fillRoundedRect(btnX - btnW/2 + 10, btnY - btnH/2 + 6, btnW - 20, btnH * 0.35, btnR2 - 4);
      btnG.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
      btnG.strokeRoundedRect(btnX - btnW/2, btnY - btnH/2, btnW, btnH, btnR2);
    };
    drawRegBtn();
    this.add.text(btnX, btnY, "Đăng ký", {
      fontFamily: "Signika", fontSize: "22px", color: "#ffffff",
      fontStyle: "bold", stroke: "#663300", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(7);
    const regZone = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: "pointer" }).setDepth(8);
    regZone.on("pointerover",  () => drawRegBtn(true));
    regZone.on("pointerout",   () => drawRegBtn(false));
    regZone.on("pointerdown",  () => {
      this.tweens.add({ targets: btnG, alpha: 0.65, duration: 60, yoyo: true });
      this._handleRegister();
    });

    // ── Dòng Đăng nhập ───────────────────────────────────────────
    const linkY = py + PH - 50;
    const loginBtnW = 100, loginBtnH = 28, loginBtnR = loginBtnH / 2;
    const loginBtnX = PX + 70;

    this.add.text(PX - 50, linkY, "Bạn đã có tài khoản?", {
      fontFamily: "Signika", fontSize: "13px", color: "#7a5820",
    }).setOrigin(0.5).setDepth(6);

    const loginG = this.add.graphics().setDepth(6);
    loginG.fillGradientStyle(0xf5c842, 0xf5c842, 0xd4960a, 0xd4960a, 1);
    loginG.fillRoundedRect(loginBtnX - loginBtnW/2, linkY - loginBtnH/2, loginBtnW, loginBtnH, loginBtnR);
    loginG.lineStyle(1.5, 0x8b6010, 1);
    loginG.strokeRoundedRect(loginBtnX - loginBtnW/2, linkY - loginBtnH/2, loginBtnW, loginBtnH, loginBtnR);
    this.add.text(loginBtnX, linkY, "Đăng nhập", {
      fontFamily: "Signika", fontSize: "13px", color: "#3a1800", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(7);
    const loginZone = this.add.zone(loginBtnX, linkY, loginBtnW, loginBtnH).setInteractive({ cursor: "pointer" }).setDepth(8);
    loginZone.on("pointerdown", () => {
      if (this.form) this.form.remove();
      this.scene.start("LoginScene");
    });
  }

  async _handleRegister() {
    const username = document.getElementById("reg_username")?.value?.trim();
    const email    = document.getElementById("reg_email")?.value?.trim();
    const password = document.getElementById("reg_password")?.value;

    if (!username || !email || !password) {
      this.showAlert("Vui lòng nhập đầy đủ thông tin"); return;
    }
    if (username.includes(" ") || email.includes(" ") || password.includes(" ")) {
      this.showAlert("Thông tin không được chứa khoảng trắng"); return;
    }

    try {
      const res  = await fetch(`${SERVER_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      this.showAlert(data.message, data.success ? "#44ff88" : "#fff6d7");
      if (data.success) {
        this.time.delayedCall(1200, () => {
          if (this.form) this.form.remove();
          this.scene.start("LoginScene");
        });
      }
    } catch {
      this.showAlert("Không thể kết nối server");
    }
  }

  showAlert(message, color = "#fff6d7", duration = 2200) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height - 80, message, {
      fontFamily: "Signika", fontSize: "17px", color,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      backgroundColor: "#00000099", padding: { x: 16, y: 9 },
    }).setOrigin(0.5).setDepth(300).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, y: height - 100, duration: 200, ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(duration, () => {
          this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
        });
      }
    });
  }

  _spawnStars(width, height) {
    for (let i = 0; i < 55; i++) {
      const x    = Phaser.Math.Between(0, width);
      const y    = Phaser.Math.Between(0, height);
      const size = Phaser.Math.FloatBetween(3, 7);
      const g    = this.add.graphics().setDepth(-3);
      g.fillStyle(0xfff0c0, Phaser.Math.FloatBetween(0.4, 0.9));
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

  _injectStyles() {
    if (document.getElementById("loginStyles")) return;
    const style = document.createElement("style");
    style.id = "loginStyles";
    style.innerHTML = `
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
}
