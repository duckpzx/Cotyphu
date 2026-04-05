// ============================================================
//  PowerDiceSystem.js  — v3.1
//
//  FIX:
//    1. Charge ring chạy liên tục qua lại (ping-pong), KHÔNG dừng
//    2. Khi hold/spin → dùng dice_blur_* để tạo cảm giác lắc mờ
//    3. Tốc độ blur đổi texture tăng dần khi charge cao hơn
// ============================================================

export default class PowerDiceSystem {
  constructor(scene) {
    this.scene        = scene;
    this.isHolding    = false;
    this.chargeLevel  = 0;
    this.chargeDir    = 1;      // +1 tăng, -1 giảm — KHÔNG bao giờ dừng
    this.chargeSpeed  = 1.6;
    this.active       = false;
    this.rolling      = false;
    this.minRatio     = 1;
    this._onRollFired = false;
    this._arcPoints   = [];
    this._particles   = [];
    this._glowAngle   = 0;

    // Blur dice: thời gian tích lũy để đổi frame
    this._blurFace      = 1;    // frame blur hiện tại (1-6)
    this._blurTimer     = 0;    // ms tích lũy
    this._blurInterval  = 120;  // ms mỗi frame khi mới hold
  }

  // ─────────────────────────────────────────────
  //  CREATE
  // ─────────────────────────────────────────────
  create(minRatio) {
    this.minRatio = minRatio;
    const sc = this.scene;
    const { width, height } = sc.scale;
    const S = minRatio;

    this.coinX = width  * 0.50;
    this.coinY = height * 0.44;

    this.COIN_R   = 88  * S;
    this.COIN_RIM = 11  * S;
    this.BTN_W    = 172 * S;
    this.BTN_H    = 54  * S;

    // ── GRAPHICS LAYERS ──────────────────────────────────────────
    this.coinGlowG     = sc.add.graphics().setDepth(196).setVisible(false);
    this.glowRingG     = sc.add.graphics().setDepth(197).setVisible(false);

    this.coinShadow    = sc.add.ellipse(
      this.coinX, this.coinY + this.COIN_R * 0.65,
      this.COIN_R * 2.4, this.COIN_R * 0.55,
      0x000000, 0.4
    ).setDepth(198).setVisible(false).setAlpha(0);

    // ── COIN ─────────────────────────────────────────────────────
    this.coinContainer = sc.add.container(this.coinX, this.coinY)
      .setDepth(199).setVisible(false).setAlpha(0);
    this._buildCoin(S);

    // ── CHARGE RING ───────────────────────────────────────────────
    this.chargeBarG    = sc.add.graphics().setDepth(200).setVisible(false);
    this.chargeBarFill = sc.add.graphics().setDepth(200).setVisible(false);

    // ── NÚT TUNG ─────────────────────────────────────────────────
    const btnY = this.coinY + this.COIN_R + this.COIN_RIM + 48 * S;
    this.btnContainer = sc.add.container(this.coinX, btnY)
      .setDepth(201).setVisible(false).setAlpha(0);
    this._buildButton(S);

    // ── ARC TRAIL ────────────────────────────────────────────────
    this.arcTrailG = sc.add.graphics().setDepth(202).setVisible(false);

    // ── PARTICLES ────────────────────────────────────────────────
    this._particleG = sc.add.graphics().setDepth(205);

    // ── INPUT ────────────────────────────────────────────────────
    this._kbDown = () => this._onPressDown();
    this._kbUp   = () => this._onPressUp();
    sc.input.keyboard.on('keydown-SPACE', this._kbDown);
    sc.input.keyboard.on('keyup-SPACE',   this._kbUp);

    // ── UPDATE ───────────────────────────────────────────────────
    sc.events.on('update', this._update, this);
  }

  // ─────────────────────────────────────────────
  //  BUILD COIN
  // ─────────────────────────────────────────────
  _buildCoin(S) {
    const sc = this.scene;
    const R  = this.COIN_R;
    const RM = this.COIN_RIM;

    // Rim metallic
    const rim = sc.add.graphics();
    rim.fillStyle(0x8b6000, 1); rim.fillCircle(0,  4*S, R + RM);
    rim.fillStyle(0xd4a000, 1); rim.fillCircle(0,  0,   R + RM);
    rim.fillStyle(0xffd700, 1); rim.fillCircle(0, -1*S, R + RM * 0.75);
    rim.fillStyle(0xffe966, 1); rim.fillCircle(0, -2*S, R + RM * 0.4);
    rim.fillStyle(0xffb800, 1); rim.fillCircle(0,  0,   R);
    this.coinContainer.add(rim);

    // Highlight
    const hl = sc.add.graphics();
    hl.fillStyle(0xffee88, 0.55);
    hl.fillEllipse(0, -R * 0.28, R * 1.15, R * 0.68);
    this.coinContainer.add(hl);

    // Dice image — scale vừa coin
    this.coinFace = sc.add.image(0, 0, 'dice_1');
    const diceTargetPx = R * 1.55;
    this.coinFace.setScale(diceTargetPx / 128); // 128 = giả sử sprite gốc
    this.coinContainer.add(this.coinFace);

    // Inner ring
    const ir = sc.add.graphics();
    ir.lineStyle(3.5 * S, 0xffe566, 0.85); ir.strokeCircle(0, 0, R * 0.93);
    ir.lineStyle(1.5 * S, 0xffffff, 0.35); ir.strokeCircle(0, 0, R * 0.78);
    this.coinContainer.add(ir);
  }

  // ─────────────────────────────────────────────
  //  BUILD BUTTON
  // ─────────────────────────────────────────────
  _buildButton(S) {
    const sc = this.scene;
    const W  = this.BTN_W, H = this.BTN_H, R = H / 2;

    const bg = sc.add.graphics();
    bg.fillStyle(0x5a2200, 0.7);  bg.fillRoundedRect(-W/2+2,  -H/2+6, W-4,  H-2,  R);
    bg.fillStyle(0xcc5500, 1);    bg.fillRoundedRect(-W/2,     -H/2+3, W,    H-3,  R);
    bg.fillStyle(0xff8000, 1);    bg.fillRoundedRect(-W/2,     -H/2,   W,    H-4,  R);
    bg.fillStyle(0xffaa44, 0.65); bg.fillRoundedRect(-W/2+6,  -H/2+4, W-12, H*0.44, R-3);
    bg.lineStyle(2.5 * S, 0xffdd88, 1); bg.strokeRoundedRect(-W/2, -H/2, W, H-4, R);
    this.btnContainer.add(bg);

    this.btnText = sc.add.text(0, -1, '🎲  TUNG XÚC XẮC', {
      fontFamily: '"Signika Negative", Signika, Arial Black, Arial',
      fontSize:   Math.floor(17 * S) + 'px',
      color:      '#ffffff', fontStyle: 'bold',
      stroke: '#5a2200', strokeThickness: 3.5,
      shadow: { offsetX:0, offsetY:2, color:'#000000aa', blur:4, fill:true }
    }).setOrigin(0.5);
    this.btnContainer.add(this.btnText);

    const hit = sc.add.rectangle(0, 0, W+24, H+24, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this._onPressDown());
    hit.on('pointerup',   () => this._onPressUp());
    hit.on('pointerout',  () => { if (this.isHolding) this._onPressUp(); });
    hit.on('pointerover', () => {
      if (!this.active || this.rolling) return;
      this.scene.tweens.add({ targets: this.btnContainer, scaleX: 1.07, scaleY: 1.07, duration: 80 });
    });
    hit.on('pointerout', () => {
      this.scene.tweens.add({ targets: this.btnContainer, scaleX: 1, scaleY: 1, duration: 80 });
    });
    this.btnContainer.add(hit);
  }

  _resetForNewTurn() {
    this.active       = false;
    this.rolling      = false;
    this.isHolding    = false;
    this._onRollFired = false;
    this.chargeLevel  = 0;
    this.chargeDir    = 1;

    this._stopAllTweensOnCoin();

    this.coinGlowG?.clear();
    this.glowRingG?.clear();
    this.chargeBarG?.clear();
    this.chargeBarFill?.clear();
    this.arcTrailG?.clear();
    this._particleG?.clear();

    this._particles = [];
    this._arcPoints = [];

    this.coinContainer?.setVisible(false).setAlpha(0);
    this.coinShadow?.setVisible(false).setAlpha(0);
    this.btnContainer?.setVisible(false).setAlpha(0);
    this.chargeBarG?.setVisible(false).setAlpha(1);
    this.chargeBarFill?.setVisible(false).setAlpha(1);
    this.arcTrailG?.setVisible(false).setAlpha(1);
  }

  // ─────────────────────────────────────────────
  //  SHOW khi đến lượt
  // ─────────────────────────────────────────────
  showForMyTurn() {
    this._resetForNewTurn();

    this.active       = true;
    this.rolling      = false;
    this.isHolding    = false;
    this._onRollFired = false;
    this._arcPoints   = [];

    this.chargeLevel = 0;
    this.chargeDir   = 1;

    this._blurFace     = 1;
    this._blurTimer    = 0;
    this._blurInterval = 120;

    const sc = this.scene;
    const S  = this.minRatio;

    this.coinFace.setTexture('dice_1').setAngle(0);
    this.coinContainer
      .setPosition(this.coinX, this.coinY - 60 * S)
      .setScale(0.5)
      .setAlpha(0);

    this.coinGlowG.setVisible(true).setAlpha(1);
    this.glowRingG.setVisible(true).setAlpha(1);
    this.coinShadow.setVisible(true).setAlpha(0);
    this.coinContainer.setVisible(true).setAlpha(0);
    this.chargeBarG.setVisible(true).setAlpha(1);
    this.chargeBarFill.setVisible(true).setAlpha(1);
    this.arcTrailG.setVisible(true).setAlpha(1);
    this.arcTrailG.clear();

    this.btnContainer.setVisible(false).setAlpha(0).setScale(1);

    // Vẽ lại vòng nền ngay khi tới lượt
    this._drawChargeRing(0);

    sc.tweens.add({
      targets: this.coinContainer,
      y: this.coinY,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 650,
      ease: 'Back.easeOut'
    });

    sc.tweens.add({
      targets: this.coinShadow,
      alpha: 0.38,
      duration: 600
    });

    sc.time.delayedCall(420, () => {
      this.btnContainer.setVisible(true).setAlpha(0).setScale(0.6);
      this.btnText.setText('🎲  TUNG XÚC XẮC');
      this.btnText.setColor('#ffffff');

      sc.tweens.add({
        targets: this.btnContainer,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 380,
        ease: 'Back.easeOut'
      });
    });

    this._startIdleAnimations();
  }

  // ─────────────────────────────────────────────
  //  HIDE
  // ─────────────────────────────────────────────
  hide() {
    if (!this.active) return;

    this.active    = false;
    this.rolling   = false;
    this.isHolding = false;
    this._onRollFired = false;
    this.chargeLevel  = 0;
    this.chargeDir    = 1;

    this._stopAllTweensOnCoin();

    const sc = this.scene;
    sc.tweens.add({
      targets: [this.coinContainer, this.btnContainer, this.coinGlowG, this.glowRingG],
      alpha: 0,
      duration: 300,
      onComplete: () => {
        [this.coinContainer, this.btnContainer, this.coinShadow,
        this.coinGlowG, this.glowRingG, this.chargeBarG,
        this.chargeBarFill, this.arcTrailG
        ].forEach(o => o?.setVisible(false));

        this.chargeBarG.clear();
        this.chargeBarFill.clear();
        this.arcTrailG.clear();
        this.coinGlowG.clear();
        this.glowRingG.clear();

        this._particles = [];
        this._particleG.clear();
      }
    });
  }

  // ─────────────────────────────────────────────
  //  IDLE
  // ─────────────────────────────────────────────
  _startIdleAnimations() {
    const sc = this.scene, S = this.minRatio;

    this._coinBobTween = sc.tweens.add({
      targets: this.coinContainer,
      y: this.coinY - 12 * S,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    sc.tweens.add({
      targets: this.coinShadow,
      scaleX: 0.72, alpha: 0.18,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    this._btnPulseTween = sc.tweens.add({
      targets: this.btnContainer,
      scaleX: 1.04, scaleY: 1.04,
      duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _stopAllTweensOnCoin() {
    if (this._coinBobTween)  { this._coinBobTween.stop();  this._coinBobTween  = null; }
    if (this._shakeTween)    { this._shakeTween.stop();    this._shakeTween    = null; }
    if (this._btnPulseTween) { this._btnPulseTween.stop(); this._btnPulseTween = null; }
  }

  // ─────────────────────────────────────────────
  //  PRESS DOWN
  // ─────────────────────────────────────────────
  _onPressDown() {
    if (!this.active || this.rolling || this.isHolding) return;
    this.isHolding = true;
    this._stopAllTweensOnCoin();

    const sc = this.scene, S = this.minRatio;

    // Text nút
    this.btnText.setText('⚡  THẢ ĐỂ TUNG!');
    this.btnText.setColor('#ffee44');

    // Scale up coin
    sc.tweens.add({
      targets: this.coinContainer,
      scaleX: 1.07, scaleY: 1.07,
      duration: 180, ease: 'Back.easeOut'
    });

    // Rung ngang
    this._shakeTween = sc.tweens.add({
      targets: this.coinContainer,
      x: { from: this.coinX - 4*S, to: this.coinX + 4*S },
      duration: 55, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // ── BẮT ĐẦU BLUR ngay khi hold ──────────────────────────────
    // Đổi sang blur texture ngay lập tức
    this.coinFace.setTexture('dice_blur_1');
    this._blurFace     = 1;
    this._blurTimer    = 0;
    this._blurInterval = 110;  // ms/frame — sẽ tăng tốc theo chargeLevel
  }

  // ─────────────────────────────────────────────
  //  PRESS UP
  // ─────────────────────────────────────────────
  _onPressUp() {
    if (!this.active || this.rolling || !this.isHolding) return;
    this.isHolding = false;
    if (!this._onRollFired) {
      this._onRollFired = true;
      this._fireArcThrow();
    }
  }

  // ─────────────────────────────────────────────
  //  UPDATE LOOP
  // ─────────────────────────────────────────────
  _update(time, delta) {
    if (!this.active) return;
    const dt = delta / 1000;
    const S  = this.minRatio;

    // ── FIX CHARGE RING: luôn chạy ping-pong khi đang hold ───────
    if (this.isHolding && !this.rolling) {
      this.chargeLevel += this.chargeDir * this.chargeSpeed * 2 * dt;

      // Bounce: khi chạm 1 → đổi chiều về 0, khi chạm 0 → đổi chiều lên 1
      if (this.chargeLevel >= 1) {
        this.chargeLevel = 1;
        this.chargeDir   = -1;   // đảo chiều → chạy ngược về 0
      }
      if (this.chargeLevel <= 0) {
        this.chargeLevel = 0;
        this.chargeDir   = 1;    // đảo chiều → chạy lên 1
      }

      this._drawChargeRing(this.chargeLevel);

      if (Math.random() < 0.35) this._spawnChargeParticle();

      // ── BLUR DICE: tốc độ blur tăng khi charge cao ─────────────
      this._blurTimer += delta;
      // chargeLevel cao → interval ngắn → blur nhanh hơn
      this._blurInterval = 110 - this.chargeLevel * 80; // 110ms → 30ms
      if (this._blurTimer >= this._blurInterval) {
        this._blurTimer = 0;
        this._blurFace  = (this._blurFace % 6) + 1;
        this.coinFace.setTexture(`dice_blur_${this._blurFace}`);
      }
    }

    // ── GLOW + RING (luôn chạy khi active, kể cả không hold) ─────
    if (!this.rolling) {
      this._glowAngle += 1.0 * dt;
      this._drawCoinGlow(time);
      this._drawGlowRing(time);
    }

    // Particles
    this._updateParticles(dt);
  }

  // ─────────────────────────────────────────────
  //  COIN GLOW
  // ─────────────────────────────────────────────
  _drawCoinGlow(time) {
    const R  = this.COIN_R;
    const coinCY = this.coinContainer.y;

    const base = this.isHolding
      ? 0.7  + 0.3  * Math.sin(time * 0.009)
      : 0.35 + 0.15 * Math.sin(time * 0.003);

    this.coinGlowG.clear();
    this.coinGlowG.fillStyle(0xffcc00, 0.06 * base);
    this.coinGlowG.fillCircle(this.coinX, coinCY, R * 2.6);
    this.coinGlowG.fillStyle(0xffdd00, 0.12 * base);
    this.coinGlowG.fillCircle(this.coinX, coinCY, R * 1.9);
    this.coinGlowG.fillStyle(0xffe866, 0.20 * base);
    this.coinGlowG.fillCircle(this.coinX, coinCY, R * 1.4);

    if (this.isHolding && this.chargeLevel > 0.3) {
      const ea = (this.chargeLevel - 0.3) / 0.7;
      this.coinGlowG.fillStyle(0xff8800, 0.28 * ea);
      this.coinGlowG.fillCircle(this.coinX, coinCY, R * (1.3 + 0.5 * this.chargeLevel));
    }
  }

  // ─────────────────────────────────────────────
  //  GLOW RING (tia xoay ngoài)
  // ─────────────────────────────────────────────
  _drawGlowRing(time) {
    const S   = this.minRatio;
    const R   = this.COIN_R + this.COIN_RIM;
    const cx  = this.coinX;
    const cy  = this.coinContainer.y;
    const NUM = 14;
    const ang = this._glowAngle;

    this.glowRingG.clear();
    for (let i = 0; i < NUM; i++) {
      const a      = ang + (i / NUM) * Math.PI * 2;
      const bright = 0.4 + 0.6 * Math.sin(time * 0.005 + i * 1.1);
      const alpha  = (this.isHolding ? 0.7 : 0.3) * bright;
      const color  = (i % 3 === 0) ? 0xffffff : (i % 3 === 1 ? 0xffee88 : 0xffcc00);
      const inR    = R + 3 * S;
      const outR   = R + (7 + 7 * bright) * S;

      this.glowRingG.lineStyle(2.5 * S, color, alpha);
      this.glowRingG.beginPath();
      this.glowRingG.moveTo(cx + Math.cos(a) * inR,  cy + Math.sin(a) * inR);
      this.glowRingG.lineTo(cx + Math.cos(a) * outR, cy + Math.sin(a) * outR);
      this.glowRingG.strokePath();

      this.glowRingG.fillStyle(color, Math.min(alpha * 1.4, 0.9));
      this.glowRingG.fillCircle(cx + Math.cos(a) * outR, cy + Math.sin(a) * outR, 2.2 * S);
    }
  }

  // ─────────────────────────────────────────────
  //  CHARGE RING — vẽ arc tròn ping-pong
  // ─────────────────────────────────────────────
  _drawChargeRing(level) {
    const S  = this.minRatio;
    // Ring nằm cố định ở coinX/coinY (không theo bob animation)
    const cx = this.coinX, cy = this.coinY;
    const R  = this.COIN_R + this.COIN_RIM + 16 * S;

    // Nền xám
    this.chargeBarG.clear();
    this.chargeBarG.lineStyle(6.5 * S, 0x222233, 0.55);
    this.chargeBarG.strokeCircle(cx, cy, R);

    this.chargeBarFill.clear();
    if (level <= 0.005) return;

    const color  = this._chargeColor(level);
    const startA = -Math.PI / 2;
    const endA   = startA + Math.PI * 2 * level;

    // Glow halo
    this.chargeBarFill.lineStyle(13 * S, color, 0.20);
    this.chargeBarFill.beginPath();
    this.chargeBarFill.arc(cx, cy, R, startA, endA, false);
    this.chargeBarFill.strokePath();

    // Arc chính
    this.chargeBarFill.lineStyle(7 * S, color, 0.95);
    this.chargeBarFill.beginPath();
    this.chargeBarFill.arc(cx, cy, R, startA, endA, false);
    this.chargeBarFill.strokePath();

    // Dot đầu arc (điểm sáng chạy)
    const dx = cx + Math.cos(endA) * R;
    const dy = cy + Math.sin(endA) * R;
    this.chargeBarFill.fillStyle(color,    0.55); this.chargeBarFill.fillCircle(dx, dy, 10 * S);
    this.chargeBarFill.fillStyle(0xffffff, 0.95); this.chargeBarFill.fillCircle(dx, dy, 4.5 * S);
  }

  _chargeColor(p) {
    const lerp = Phaser.Display.Color.Interpolate.ColorWithColor;
    const val  = Phaser.Display.Color.ValueToColor;
    if (p < 0.5)
      return lerp(val(0x00ddff), val(0x00ff88), 100, Math.floor(p * 200)).color;
    return lerp(val(0x00ff88), val(0xff2244), 100, Math.floor((p - 0.5) * 200)).color;
  }

  // ─────────────────────────────────────────────
  //  PARTICLES
  // ─────────────────────────────────────────────
  _spawnChargeParticle() {
    const S  = this.minRatio;
    const R  = this.COIN_R + this.COIN_RIM + 16 * S;
    const a  = -Math.PI / 2 + Math.PI * 2 * this.chargeLevel + (Math.random() - 0.5) * 0.5;
    const colors = [0x00ddff, 0x00ff88, 0xffdd00, 0xff8800];
    this._particles.push({
      x: this.coinX + Math.cos(a) * R,
      y: this.coinY + Math.sin(a) * R,
      vx: Math.cos(a) * (15 + Math.random() * 50) * S,
      vy: Math.sin(a) * (15 + Math.random() * 50) * S,
      life: 0.7 + Math.random() * 0.5,
      size: (1.5 + Math.random() * 3) * S,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  _spawnBurst(cx, cy, count = 28) {
    const S = this.minRatio;
    const colors = [0xffdd00, 0xff8800, 0xff4466, 0x00ffcc, 0xffffff, 0xffee44];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (70 + Math.random() * 170) * S;
      this._particles.push({
        x: cx + Math.cos(angle) * 16 * S,
        y: cy + Math.sin(angle) * 16 * S,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.8,
        size: (2.5 + Math.random() * 7) * S,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  _updateParticles(dt) {
    this._particleG.clear();
    this._particles = this._particles.filter(p => {
      p.life -= dt * 1.9;
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 115 * dt * this.minRatio;
      if (p.life <= 0) return false;
      this._particleG.fillStyle(p.color, Math.min(p.life, 1) * 0.88);
      this._particleG.fillCircle(p.x, p.y, p.size * Math.min(p.life, 1));
      return true;
    });
  }

  // ─────────────────────────────────────────────
  //  FIRE ARC THROW
  // ─────────────────────────────────────────────
  _fireArcThrow() {
    this.rolling = true;
    this._stopAllTweensOnCoin();

    const sc = this.scene, S = this.minRatio;

    // Ẩn nút + clear ring
    sc.tweens.add({ targets: this.btnContainer, alpha: 0, y: this.btnContainer.y + 14*S, duration: 200 });
    this.chargeBarG.clear();
    this.chargeBarFill.clear();

    // Burst particles
    this._spawnBurst(this.coinX, this.coinY, 30);
    this._doFlash(this.coinX, this.coinY);

    // Arc trail
    this.arcTrailG.setVisible(true);
    this._arcPoints = [];

    const peakX = this.coinX + 18 * S;
    const peakY = this.coinY - 225 * S;

    // PHASE 1: Phóng lên
    sc.tweens.add({
      targets: this.coinContainer,
      x: peakX, y: peakY,
      scaleX: 0.5, scaleY: 0.5,
      angle: 1080,
      duration: 490,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this._arcPoints.push({ x: this.coinContainer.x, y: this.coinContainer.y });
        if (this._arcPoints.length > 24) this._arcPoints.shift();
        this._renderArcTrail();
      },
      onComplete: () => {
        this.coinContainer.setAngle(0);
        // Bắt đầu spin blur
        this._startSpinLoop();

        // PHASE 2: Rơi xuống
        sc.tweens.add({
          targets: this.coinContainer,
          x: this.coinX, y: this.coinY,
          scaleX: 1, scaleY: 1,
          duration: 430,
          ease: 'Bounce.easeOut',
          onUpdate: () => {
            this._arcPoints.push({ x: this.coinContainer.x, y: this.coinContainer.y });
            if (this._arcPoints.length > 24) this._arcPoints.shift();
            this._renderArcTrail();
          },
          onComplete: () => {
            sc.time.delayedCall(120, () => {
              this.arcTrailG.clear();
              this.arcTrailG.setVisible(false);
              this._arcPoints = [];
            });
            // Gọi BoardScene
            this.scene._onPowerDiceRollRequested?.();
          }
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  //  ARC TRAIL (vệt xanh lá)
  // ─────────────────────────────────────────────
  _renderArcTrail() {
    const S   = this.minRatio;
    const pts = this._arcPoints;
    this.arcTrailG.clear();
    if (pts.length < 2) return;

    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const t  = i / pts.length;
      const w  = t * 9 * S;
      const a  = t * 0.75;
      const color = t > 0.75 ? 0xffffff : (t > 0.45 ? 0xaaffcc : 0x44ee88);
      this.arcTrailG.lineStyle(w, color, a);
      this.arcTrailG.beginPath();
      this.arcTrailG.moveTo(p0.x, p0.y);
      this.arcTrailG.lineTo(p1.x, p1.y);
      this.arcTrailG.strokePath();
    }

    const last = pts[pts.length - 1];
    this.arcTrailG.fillStyle(0xffffff, 0.9);
    this.arcTrailG.fillCircle(last.x, last.y, 5 * S);
    this.arcTrailG.fillStyle(0x88ffcc, 0.5);
    this.arcTrailG.fillCircle(last.x, last.y, 9 * S);
  }

  // ─────────────────────────────────────────────
  //  SPIN LOOP (chờ kết quả từ server)
  //  Dùng dice_blur_* để tạo cảm giác đang lắc/quay mờ
  // ─────────────────────────────────────────────
  _startSpinLoop() {
    if (this._spinTimer) { this._spinTimer.destroy(); this._spinTimer = null; }

    let face      = 1;
    let blurTimer = 0;
    const S       = this.minRatio;
    const INTERVAL = 65; // ms — nhanh hơn hold để cảm giác quay mạnh

    this._spinTimer = this.scene.time.addEvent({
      delay: INTERVAL, loop: true,
      callback: () => {
        face = (face % 6) + 1;
        // Dùng blur texture khi spin
        this.coinFace.setTexture(`dice_blur_${face}`);
        // Rung nhẹ
        this.coinContainer.setX(this.coinX + Phaser.Math.Between(-2, 2) * S);
        this.coinContainer.setY(this.coinY + Phaser.Math.Between(-2, 2) * S);
      }
    });
  }

  _stopSpinLoop() {
    if (this._spinTimer) { this._spinTimer.destroy(); this._spinTimer = null; }
    // Dừng rung
    this.coinContainer.setPosition(this.coinX, this.coinY);
  }

  // ─────────────────────────────────────────────
  //  PUBLIC: playResultAnimation
  // ─────────────────────────────────────────────
  playResultAnimation(result, onHandoff) {
    this._stopSpinLoop();

    const sc = this.scene, S = this.minRatio;

    // Đổi về texture thường (không blur) với đúng mặt
    this.coinFace.setTexture(`dice_${result}`).setAngle(0);

    // Bounce in
    sc.tweens.add({
      targets: this.coinContainer,
      scaleX: 1.28, scaleY: 1.28,
      duration: 170, ease: 'Back.easeOut',
      onComplete: () => {
        sc.tweens.add({
          targets: this.coinContainer,
          scaleX: 1.0, scaleY: 1.0,
          duration: 220, ease: 'Bounce.easeOut'
        });
      }
    });

    this._spawnBurst(this.coinX, this.coinY, 34);
    this._doFlash(this.coinX, this.coinY);

    // Số nổi to
    const numText = sc.add.text(
      this.coinX, this.coinY - this.COIN_R * 1.3,
      `${result}`,
      {
        fontFamily: '"Signika Negative", Signika, Arial Black',
        fontSize:   Math.floor(84 * S) + 'px',
        color:      '#ffee44', fontStyle: 'bold',
        stroke: '#7a3000', strokeThickness: 9,
        shadow: { offsetX:0, offsetY:5, color:'#ff8800', blur:18, fill:true }
      }
    ).setOrigin(0.5).setDepth(220).setAlpha(0);

    sc.tweens.add({
      targets: numText, alpha: 1,
      y: this.coinY - this.COIN_R * 2.1,
      duration: 430, ease: 'Back.easeOut',
      onComplete: () => {
        sc.time.delayedCall(880, () => {
          sc.tweens.add({
            targets: numText, alpha: 0,
            y: this.coinY - this.COIN_R * 2.8,
            duration: 370,
            onComplete: () => numText.destroy()
          });
        });
      }
    });

    // Handoff sau 1.6s
    sc.time.delayedCall(1600, () => this._handoffToBoardScene(onHandoff));
  }

  // ─────────────────────────────────────────────
  //  HANDOFF
  // ─────────────────────────────────────────────
  _handoffToBoardScene(onHandoff) {
    const sc = this.scene, S = this.minRatio;

    const tx = this.scene.diceSprite?.x ?? this.coinX;
    const ty = this.scene.diceSprite?.y ?? this.coinY;

    sc.tweens.add({
      targets: this.coinContainer,
      x: tx, y: ty,
      scaleX: 0.35, scaleY: 0.35, alpha: 0,
      duration: 420, ease: 'Cubic.easeIn'
    });
    sc.tweens.add({
      targets: [this.coinGlowG, this.glowRingG, this.coinShadow],
      alpha: 0, duration: 300
    });

    this.chargeBarG.clear();
    this.chargeBarFill.clear();

    sc.time.delayedCall(450, () => {
      [this.coinContainer, this.btnContainer, this.coinShadow,
       this.coinGlowG, this.glowRingG, this.chargeBarG,
       this.chargeBarFill, this.arcTrailG
      ].forEach(o => { if (o) { o.setVisible(false); if (o.setAlpha) o.setAlpha(0); } });

      this.coinGlowG.clear(); this.glowRingG.clear();
      this.chargeBarG.clear(); this.chargeBarFill.clear();

      // Reset cho lần sau
      this.coinContainer.setPosition(this.coinX, this.coinY).setScale(1).setAngle(0);
      this.btnContainer.setY(this.coinY + this.COIN_R + this.COIN_RIM + 48 * S);

      this.active  = false;
      this.rolling = false;

      if (onHandoff) onHandoff();
    });
  }

  // ─────────────────────────────────────────────
  //  FLASH
  // ─────────────────────────────────────────────
  _doFlash(cx, cy) {
    const sc = this.scene, S = this.minRatio;
    const fl = sc.add.circle(cx, cy, this.COIN_R * 2.2, 0xffffff, 0.65).setDepth(210);
    sc.tweens.add({
      targets: fl, alpha: 0, scaleX: 2.5, scaleY: 2.5,
      duration: 380, ease: 'Cubic.easeOut',
      onComplete: () => fl.destroy()
    });
  }

  // ─────────────────────────────────────────────
  //  DESTROY
  // ─────────────────────────────────────────────
  destroy() {
    this.scene.input.keyboard.off('keydown-SPACE', this._kbDown);
    this.scene.input.keyboard.off('keyup-SPACE',   this._kbUp);
    this.scene.events.off('update', this._update, this);
    if (this._spinTimer)    { this._spinTimer.destroy();    this._spinTimer    = null; }
    if (this._coinBobTween) { this._coinBobTween.stop();    this._coinBobTween = null; }
    if (this._shakeTween)   { this._shakeTween.stop();      this._shakeTween   = null; }
    if (this._btnPulseTween){ this._btnPulseTween.stop();   this._btnPulseTween = null; }
  }
}

if (typeof window !== 'undefined') window.PowerDiceSystem = PowerDiceSystem;