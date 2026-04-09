export default class LoginScene extends Phaser.Scene {

  constructor() {
    super("LoginScene");
  }

  preload() {
    this.load.image("bg_account", "assets/nen_1.png");
    this.load.image("icon", "assets/ui/cotyphu.png");
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "bg_account");
    bg.setScale(Math.max(width / bg.width, height / bg.height));
    bg.setDepth(-10);

    // ── Overlay tối nhẹ ─────────────────────────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35).setDepth(-5);

    // ── Stars nền ───────────────────────────────────────────────
    this._spawnStars(width, height);

    // ── Floating orbs trang trí ──────────────────────────────────
    this._spawnOrbs(width, height);

    // ── Panel ───────────────────────────────────────────────────
    const PW = 420, PH = 430;
    const PX = width / 2, PY = height / 2 + 10;
    this._createStyledPanel(PX, PY, PW, PH, 22);

    // ── Logo ────────────────────────────────────────────────────
    const logo = this.add.image(PX, PY - PH / 2 - 52, "icon")
      .setScale(0.85).setDepth(10);
    // Bounce nhẹ
    this.tweens.add({
      targets: logo, y: logo.y - 8,
      duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });
    // Glow dưới logo
    const glowG = this.add.graphics().setDepth(9);
    glowG.fillStyle(0xffd080, 0.18);
    glowG.fillEllipse(PX, PY - PH / 2 - 10, 160, 28);

    // ── Tiêu đề ─────────────────────────────────────────────────
    const titleY = PY - PH / 2 + 42;
    // Badge nền tiêu đề
    const titleBg = this.add.graphics().setDepth(5);
    // titleBg.fillStyle(0xd4a030, 1);
    // titleBg.fillRoundedRect(PX - 100, titleY - 16, 200, 32, 16);
    // titleBg.fillStyle(0xfff0a0, 0.4);
    // titleBg.fillRoundedRect(PX - 98, titleY - 14, 196, 14, 10);
    // titleBg.lineStyle(2, 0x8b5e1a, 1);
    // titleBg.strokeRoundedRect(PX - 100, titleY - 16, 200, 32, 16);

    this.add.text(PX, titleY, "ĐĂNG NHẬP", {
      fontFamily: "Signika", fontSize: "20px",
      color: "#3c2a12", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(6);

    // ── Divider trang trí ────────────────────────────────────────
    const divY = titleY + 22;
    const dg = this.add.graphics().setDepth(5);
    dg.lineStyle(1.5, 0xc8a060, 0.6);
    dg.lineBetween(PX - PW / 2 + 30, divY, PX - 16, divY);
    dg.lineBetween(PX + 16, divY, PX + PW / 2 - 30, divY);
    dg.fillStyle(0xc8a060, 0.9);
    dg.fillTriangle(PX, divY - 5, PX - 7, divY, PX, divY + 5);
    dg.fillTriangle(PX, divY - 5, PX + 7, divY, PX, divY + 5);

    // ── HTML Form ────────────────────────────────────────────────
    this._injectStyles();
    this.form = document.createElement("div");
    this.form.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%, -28%);
      display:flex; flex-direction:column; gap:16px; width:268px;
    `;
    this.form.innerHTML = `
      <div class="inputWrap">
        <span class="inputIcon">👤</span>
        <input id="username" class="gameInput" placeholder="Tài khoản"/>
      </div>
      <div class="inputWrap">
        <span class="inputIcon">🔒</span>
        <input id="password" class="gameInput" type="password" placeholder="Mật khẩu"/>
      </div>
      <button id="loginBtn" class="gameBtn">Đăng nhập</button>
    `;
    document.body.appendChild(this.form);

    document.getElementById("loginBtn").onclick = () => this._handleLogin();

    // Enter key
    this.form.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._handleLogin();
    });

    this.events.once("shutdown", () => { if (this.form) this.form.remove(); });

    // ── Particles nhỏ tỏa ra từ panel ───────────────────────────
    this._spawnPanelParticles(PX, PY, PW, PH);
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
      const res = await fetch("http://localhost:3000/login", {
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
          this.cameras.main.fadeOut(300);
          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start(data.user.is_new_player ? "CreateCharacterScene" : "LobbyScene");
          });
        }, 900);
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
      const r = Phaser.Math.FloatBetween(0.8, 2.2);
      const alpha = Phaser.Math.FloatBetween(0.3, 0.9);
      const star = this.add.circle(x, y, r, 0xfff0c0, alpha).setDepth(-3);
      this.tweens.add({
        targets: star, alpha: 0.1,
        duration: Phaser.Math.Between(1200, 3000),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
        ease: "Sine.easeInOut"
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
    this.showAlert("✅ Đăng nhập thành công!", "#44ff88", 800);
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
    `;
    document.head.appendChild(style);
  }

  // backward compat
  createDashedPanel(x, y, w, h, radius) {
    this._createStyledPanel(x, y, w, h, radius);
  }
}
