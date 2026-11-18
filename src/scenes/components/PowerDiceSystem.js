// ============================================================
//  PowerDiceSystem.js  — v4.2 (2 Dice Natural Staggered Edition)
//
//  - 2 xúc xắc đặt lệch chéo tự nhiên, khoảng cách thoáng không dính vòng,
//    bóng đổ co giãn theo độ cao, rung lắc hữu cơ theo lực sạc,
//    bay 3D xoay ngược chiều, blur liên tục trên không, shockwave tiếp đất
//    & hiệu ứng đặc biệt khi ra Đôi 1 / Đôi 6 (Đi tiếp!).
// ============================================================

export default class PowerDiceSystem {
  constructor(scene) {
    this.scene        = scene;
    this.isHolding    = false;
    this.chargeLevel  = 0;
    this.chargeDir    = 1;
    this.chargeSpeed  = 1.6;
    this.active       = false;
    this.rolling      = false;
    this.minRatio     = 1;
    this._onRollFired = false;
    this._arcPoints1  = [];
    this._arcPoints2  = [];
    this._particles   = [];
    this._glowAngle   = 0;

    this._blurFace1     = 1;
    this._blurFace2     = 4;
    this._blurTimer     = 0;
    this._blurInterval  = 120;
    this._airBlurTimer  = null;
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
    this.coinY = height * 0.43;

    this.COIN_R   = 56  * S;
    this.COIN_RIM = 8   * S;
    this.coin1X   = this.coinX - 94 * S;
    this.coin1Y   = this.coinY - 12 * S;
    this.coin2X   = this.coinX + 94 * S;
    this.coin2Y   = this.coinY + 12 * S;

    this.BTN_W    = 190 * S;
    this.BTN_H    = 52  * S;

    // ── GRAPHICS LAYERS ──────────────────────────────────────────
    this.coinGlowG     = sc.add.graphics().setDepth(196).setVisible(false);
    this.glowRingG     = sc.add.graphics().setDepth(197).setVisible(false);

    this.coinShadow    = sc.add.ellipse(
      this.coin1X, this.coin1Y + this.COIN_R * 0.74,
      this.COIN_R * 2.0, this.COIN_R * 0.46,
      0x000000, 0.40
    ).setDepth(198).setVisible(false).setAlpha(0);

    this.coinShadow2   = sc.add.ellipse(
      this.coin2X, this.coin2Y + this.COIN_R * 0.74,
      this.COIN_R * 2.0, this.COIN_R * 0.46,
      0x000000, 0.40
    ).setDepth(198).setVisible(false).setAlpha(0);

    // ── 2 COINS ──────────────────────────────────────────────────
    const c1 = this._buildCoinContainer(this.coin1X, this.coin1Y, S);
    this.coinContainer = c1.container;
    this.coinFace      = c1.face;

    const c2 = this._buildCoinContainer(this.coin2X, this.coin2Y, S);
    this.coinContainer2 = c2.container;
    this.coinFace2      = c2.face;

    // ── CHARGE RING ───────────────────────────────────────────────
    this.chargeBarG    = sc.add.graphics().setDepth(200).setVisible(false);
    this.chargeBarFill = sc.add.graphics().setDepth(200).setVisible(false);

    // ── NÚT TUNG ─────────────────────────────────────────────────
    const btnY = this.coin2Y + this.COIN_R + this.COIN_RIM + 52 * S;
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
  //  BUILD COIN CONTAINER
  // ─────────────────────────────────────────────
  _buildCoinContainer(x, y, S) {
    const sc = this.scene;
    const R  = this.COIN_R;
    const RM = this.COIN_RIM;

    const container = sc.add.container(x, y)
      .setDepth(199).setVisible(false).setAlpha(0);

    const rim = sc.add.graphics();
    rim.fillStyle(0x8b6000, 1); rim.fillCircle(0,  3.5*S, R + RM);
    rim.fillStyle(0xd4a000, 1); rim.fillCircle(0,  0,     R + RM);
    rim.fillStyle(0xffd700, 1); rim.fillCircle(0, -1*S,   R + RM * 0.75);
    rim.fillStyle(0xffe966, 1); rim.fillCircle(0, -2*S,   R + RM * 0.4);
    rim.fillStyle(0xffb800, 1); rim.fillCircle(0,  0,     R);
    container.add(rim);

    const hl = sc.add.graphics();
    hl.fillStyle(0xffee88, 0.55);
    hl.fillEllipse(0, -R * 0.28, R * 1.15, R * 0.68);
    container.add(hl);

    const face = sc.add.image(0, 0, 'dice_1');
    const diceTargetPx = R * 1.54;
    face.setScale(diceTargetPx / 128);
    container.add(face);

    const ir = sc.add.graphics();
    ir.lineStyle(3 * S, 0xffe566, 0.85);   ir.strokeCircle(0, 0, R * 0.93);
    ir.lineStyle(1.3 * S, 0xffffff, 0.35); ir.strokeCircle(0, 0, R * 0.78);
    container.add(ir);

    return { container, face };
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

    this.btnText = sc.add.text(0, -1, '🎲🎲  TUNG XÚC XẮC', {
      fontFamily: '"Signika Negative", Signika, Arial Black, Arial',
      fontSize:   Math.floor(15.5 * S) + 'px',
      color:      '#ffffff', fontStyle: 'bold',
      stroke: '#5a2200', strokeThickness: 3.5,
      shadow: { offsetX:0, offsetY:2, color:'#000000aa', blur:4, fill:true }
    }).setOrigin(0.5).setPadding(3, 2);
    this.btnContainer.add(this.btnText);

    const hit = sc.add.rectangle(0, 0, W+24, H+24, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this._onPressDown());
    hit.on('pointerup',   () => this._onPressUp());
    hit.on('pointerout',  () => {
      if (this.isHolding) this._onPressUp();
      this.scene.tweens.add({ targets: this.btnContainer, scaleX: 1, scaleY: 1, duration: 80 });
    });
    hit.on('pointerover', () => {
      if (!this.active || this.rolling) return;
      this.scene.tweens.add({ targets: this.btnContainer, scaleX: 1.07, scaleY: 1.07, duration: 80 });
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
    if (this._airBlurTimer) { this._airBlurTimer.destroy(); this._airBlurTimer = null; }

    this.coinGlowG?.clear();
    this.glowRingG?.clear();
    this.chargeBarG?.clear();
    this.chargeBarFill?.clear();
    this.arcTrailG?.clear();
    this._particleG?.clear();

    this._particles  = [];
    this._arcPoints1 = [];
    this._arcPoints2 = [];

    this.coinContainer?.setVisible(false).setAlpha(0);
    this.coinContainer2?.setVisible(false).setAlpha(0);
    this.coinShadow?.setVisible(false).setAlpha(0);
    this.coinShadow2?.setVisible(false).setAlpha(0);
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
    this._arcPoints1  = [];
    this._arcPoints2  = [];

    this.chargeLevel = 0;
    this.chargeDir   = 1;

    this._blurFace1    = 1;
    this._blurFace2    = 4;
    this._blurTimer    = 0;
    this._blurInterval = 120;

    const sc = this.scene;
    const S  = this.minRatio;

    this.coinFace.setTexture('dice_1').setAngle(0);
    this.coinFace2.setTexture('dice_5').setAngle(0);

    this.coinContainer
      .setPosition(this.coin1X, this.coin1Y - 60 * S)
      .setScale(0.45).setAngle(-18).setAlpha(0);
    this.coinContainer2
      .setPosition(this.coin2X, this.coin2Y - 60 * S)
      .setScale(0.45).setAngle(18).setAlpha(0);

    this.coinGlowG.setVisible(true).setAlpha(1);
    this.glowRingG.setVisible(true).setAlpha(1);
    this.coinShadow.setVisible(true).setAlpha(0).setScale(1);
    this.coinShadow2.setVisible(true).setAlpha(0).setScale(1);
    this.coinContainer.setVisible(true).setAlpha(0);
    this.coinContainer2.setVisible(true).setAlpha(0);
    this.chargeBarG.setVisible(true).setAlpha(1);
    this.chargeBarFill.setVisible(true).setAlpha(1);
    this.arcTrailG.setVisible(true).setAlpha(1);
    this.arcTrailG.clear();

    this.btnContainer.setVisible(false).setAlpha(0).setScale(1);

    this._drawChargeRing(0);

    sc.tweens.add({
      targets: this.coinContainer,
      y: this.coin1Y, scaleX: 1, scaleY: 1, angle: -7, alpha: 1,
      duration: 640, ease: 'Back.easeOut'
    });
    sc.tweens.add({
      targets: this.coinContainer2,
      y: this.coin2Y, scaleX: 1, scaleY: 1, angle: 8, alpha: 1,
      duration: 640, delay: 80, ease: 'Back.easeOut'
    });

    sc.tweens.add({
      targets: [this.coinShadow, this.coinShadow2],
      alpha: 0.38,
      duration: 600
    });

    sc.time.delayedCall(420, () => {
      this.btnContainer.setVisible(true).setAlpha(0).setScale(0.6);
      this.btnText.setText('🎲🎲  TUNG XÚC XẮC');
      this.btnText.setColor('#ffffff');

      sc.tweens.add({
        targets: this.btnContainer,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 380, ease: 'Back.easeOut'
      });
    });

    this._startIdleAnimations();
  }

  // ─────────────────────────────────────────────
  //  HIDE
  // ─────────────────────────────────────────────
  hide() {
    if (!this.active) return;

    this.active       = false;
    this.rolling      = false;
    this.isHolding    = false;
    this._onRollFired = false;
    this.chargeLevel  = 0;
    this.chargeDir    = 1;

    this._stopAllTweensOnCoin();
    if (this._airBlurTimer) { this._airBlurTimer.destroy(); this._airBlurTimer = null; }

    const sc = this.scene;
    sc.tweens.add({
      targets: [this.coinContainer, this.coinContainer2, this.btnContainer, this.coinGlowG, this.glowRingG],
      alpha: 0,
      duration: 300,
      onComplete: () => {
        [
          this.coinContainer, this.coinContainer2, this.btnContainer,
          this.coinShadow, this.coinShadow2, this.coinGlowG, this.glowRingG,
          this.chargeBarG, this.chargeBarFill, this.arcTrailG
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
      y: this.coin1Y - 10 * S,
      angle: -3,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    this._coinBobTween2 = sc.tweens.add({
      targets: this.coinContainer2,
      y: this.coin2Y - 10 * S,
      angle: 4,
      duration: 1300, delay: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    this._shadowTween1 = sc.tweens.add({
      targets: this.coinShadow,
      scaleX: 0.74, scaleY: 0.80, alpha: 0.18,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    this._shadowTween2 = sc.tweens.add({
      targets: this.coinShadow2,
      scaleX: 0.74, scaleY: 0.80, alpha: 0.18,
      duration: 1300, delay: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    this._btnPulseTween = sc.tweens.add({
      targets: this.btnContainer,
      scaleX: 1.04, scaleY: 1.04,
      duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _stopAllTweensOnCoin() {
    if (this._coinBobTween)  { this._coinBobTween.stop();  this._coinBobTween  = null; }
    if (this._coinBobTween2) { this._coinBobTween2.stop(); this._coinBobTween2 = null; }
    if (this._shadowTween1)  { this._shadowTween1.stop();  this._shadowTween1  = null; }
    if (this._shadowTween2)  { this._shadowTween2.stop();  this._shadowTween2  = null; }
    if (this._btnPulseTween) { this._btnPulseTween.stop(); this._btnPulseTween = null; }
  }

  // ─────────────────────────────────────────────
  //  PRESS DOWN
  // ─────────────────────────────────────────────
  _onPressDown() {
    if (!this.active || this.rolling || this.isHolding) return;
    this.isHolding = true;
    this._stopAllTweensOnCoin();

    const sc = this.scene;

    this.btnText.setText('⚡  THẢ ĐỂ TUNG!');
    this.btnText.setColor('#ffee44');

    sc.tweens.add({
      targets: [this.coinContainer, this.coinContainer2],
      scaleX: 1.08, scaleY: 1.08,
      duration: 160, ease: 'Back.easeOut'
    });

    this.coinFace.setTexture('dice_blur_1');
    this.coinFace2.setTexture('dice_blur_4');
    this._blurFace1    = 1;
    this._blurFace2    = 4;
    this._blurTimer    = 0;
    this._blurInterval = 110;
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

    if (this.isHolding && !this.rolling) {
      this.chargeLevel += this.chargeDir * this.chargeSpeed * 2 * dt;

      if (this.chargeLevel >= 1) {
        this.chargeLevel = 1;
        this.chargeDir   = -1;
      }
      if (this.chargeLevel <= 0) {
        this.chargeLevel = 0;
        this.chargeDir   = 1;
      }

      this._drawChargeRing(this.chargeLevel);

      const amp = (1.8 + this.chargeLevel * 5.0) * S;
      const rot = 2 + this.chargeLevel * 7;
      this.coinContainer.setPosition(
        this.coin1X + (Math.random() * 2 - 1) * amp,
        this.coin1Y + (Math.random() * 2 - 1) * amp * 0.7
      ).setAngle((Math.random() * 2 - 1) * rot);
      this.coinContainer2.setPosition(
        this.coin2X + (Math.random() * 2 - 1) * amp,
        this.coin2Y + (Math.random() * 2 - 1) * amp * 0.7
      ).setAngle((Math.random() * 2 - 1) * rot);

      if (Math.random() < 0.45) this._spawnChargeParticle();

      this._blurTimer += delta;
      this._blurInterval = 110 - this.chargeLevel * 82;
      if (this._blurTimer >= this._blurInterval) {
        this._blurTimer = 0;
        this._blurFace1 = (this._blurFace1 % 6) + 1;
        this._blurFace2 = ((this._blurFace2 + 1) % 6) + 1;
        this.coinFace.setTexture(`dice_blur_${this._blurFace1}`);
        this.coinFace2.setTexture(`dice_blur_${this._blurFace2}`);
      }
    }

    if (!this.rolling) {
      this._glowAngle += 1.0 * dt;
      this._drawCoinGlow(time);
      this._drawGlowRing(time);
    }

    this._updateParticles(dt);
  }

  // ─────────────────────────────────────────────
  //  COIN GLOW
  // ─────────────────────────────────────────────
  _drawCoinGlow(time) {
    const R = this.COIN_R;
    const base = this.isHolding
      ? 0.7  + 0.3  * Math.sin(time * 0.009)
      : 0.35 + 0.15 * Math.sin(time * 0.003);

    this.coinGlowG.clear();
    const coins = [
      { x: this.coin1X, y: this.coinContainer.y },
      { x: this.coin2X, y: this.coinContainer2.y },
    ];
    for (const c of coins) {
      this.coinGlowG.fillStyle(0xffcc00, 0.06 * base);
      this.coinGlowG.fillCircle(c.x, c.y, R * 2.2);
      this.coinGlowG.fillStyle(0xffdd00, 0.12 * base);
      this.coinGlowG.fillCircle(c.x, c.y, R * 1.65);
      this.coinGlowG.fillStyle(0xffe866, 0.20 * base);
      this.coinGlowG.fillCircle(c.x, c.y, R * 1.28);

      if (this.isHolding && this.chargeLevel > 0.3) {
        const ea = (this.chargeLevel - 0.3) / 0.7;
        this.coinGlowG.fillStyle(0xff8800, 0.28 * ea);
        this.coinGlowG.fillCircle(c.x, c.y, R * (1.22 + 0.42 * this.chargeLevel));
      }
    }
  }

  // ─────────────────────────────────────────────
  //  GLOW RING
  // ─────────────────────────────────────────────
  _drawGlowRing(time) {
    const S   = this.minRatio;
    const R   = this.COIN_R + this.COIN_RIM;
    const NUM = 12;

    this.glowRingG.clear();
    const coins = [
      { x: this.coin1X, y: this.coinContainer.y, ang: this._glowAngle },
      { x: this.coin2X, y: this.coinContainer2.y, ang: -this._glowAngle },
    ];

    for (const c of coins) {
      for (let i = 0; i < NUM; i++) {
        const a      = c.ang + (i / NUM) * Math.PI * 2;
        const bright = 0.4 + 0.6 * Math.sin(time * 0.005 + i * 1.1);
        const alpha  = (this.isHolding ? 0.7 : 0.3) * bright;
        const color  = (i % 3 === 0) ? 0xffffff : (i % 3 === 1 ? 0xffee88 : 0xffcc00);
        const inR    = R + 3 * S;
        const outR   = R + (5 + 5 * bright) * S;

        this.glowRingG.lineStyle(2 * S, color, alpha);
        this.glowRingG.beginPath();
        this.glowRingG.moveTo(c.x + Math.cos(a) * inR,  c.y + Math.sin(a) * inR);
        this.glowRingG.lineTo(c.x + Math.cos(a) * outR, c.y + Math.sin(a) * outR);
        this.glowRingG.strokePath();

        this.glowRingG.fillStyle(color, Math.min(alpha * 1.4, 0.9));
        this.glowRingG.fillCircle(c.x + Math.cos(a) * outR, c.y + Math.sin(a) * outR, 1.8 * S);
      }
    }
  }

  // ─────────────────────────────────────────────
  //  CHARGE RING
  // ─────────────────────────────────────────────
  _drawChargeRing(level) {
    const S  = this.minRatio;
    const R  = this.COIN_R + this.COIN_RIM + 11 * S;
    const centers = [
      { cx: this.coin1X, cy: this.coin1Y },
      { cx: this.coin2X, cy: this.coin2Y },
    ];

    this.chargeBarG.clear();
    this.chargeBarFill.clear();

    for (const { cx, cy } of centers) {
      this.chargeBarG.lineStyle(5 * S, 0x222233, 0.55);
      this.chargeBarG.strokeCircle(cx, cy, R);

      if (level <= 0.005) continue;

      const color  = this._chargeColor(level);
      const startA = -Math.PI / 2;
      const endA   = startA + Math.PI * 2 * level;

      this.chargeBarFill.lineStyle(10 * S, color, 0.20);
      this.chargeBarFill.beginPath();
      this.chargeBarFill.arc(cx, cy, R, startA, endA, false);
      this.chargeBarFill.strokePath();

      this.chargeBarFill.lineStyle(5.5 * S, color, 0.95);
      this.chargeBarFill.beginPath();
      this.chargeBarFill.arc(cx, cy, R, startA, endA, false);
      this.chargeBarFill.strokePath();

      const dx = cx + Math.cos(endA) * R;
      const dy = cy + Math.sin(endA) * R;
      this.chargeBarFill.fillStyle(color,    0.55); this.chargeBarFill.fillCircle(dx, dy, 8 * S);
      this.chargeBarFill.fillStyle(0xffffff, 0.95); this.chargeBarFill.fillCircle(dx, dy, 3.8 * S);
    }
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
    const R  = this.COIN_R + this.COIN_RIM + 11 * S;
    const useFirst = Math.random() < 0.5;
    const cx = useFirst ? this.coin1X : this.coin2X;
    const cy = useFirst ? this.coin1Y : this.coin2Y;
    const a  = -Math.PI / 2 + Math.PI * 2 * this.chargeLevel + (Math.random() - 0.5) * 0.5;
    const colors = [0x00ddff, 0x00ff88, 0xffdd00, 0xff8800];
    this._particles.push({
      x: cx + Math.cos(a) * R,
      y: cy + Math.sin(a) * R,
      vx: Math.cos(a) * (15 + Math.random() * 50) * S,
      vy: Math.sin(a) * (15 + Math.random() * 50) * S,
      life: 0.7 + Math.random() * 0.5,
      size: (1.5 + Math.random() * 2.8) * S,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  _spawnBurst(cx, cy, count = 24) {
    const S = this.minRatio;
    const colors = [0xffdd00, 0xff8800, 0xff4466, 0x00ffcc, 0xffffff, 0xffee44];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (70 + Math.random() * 170) * S;
      this._particles.push({
        x: cx + Math.cos(angle) * 12 * S,
        y: cy + Math.sin(angle) * 12 * S,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.8,
        size: (2.0 + Math.random() * 5.5) * S,
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

    sc.tweens.add({ targets: this.btnContainer, alpha: 0, y: this.btnContainer.y + 14*S, duration: 200 });
    this.chargeBarG.clear();
    this.chargeBarFill.clear();

    this._spawnBurst(this.coin1X, this.coin1Y, 22);
    this._spawnBurst(this.coin2X, this.coin2Y, 22);
    this._doFlash(this.coin1X, this.coin1Y);
    this._doFlash(this.coin2X, this.coin2Y);

    this.arcTrailG.setVisible(true);
    this._arcPoints1 = [];
    this._arcPoints2 = [];

    let airF1 = 1, airF2 = 4;
    if (this._airBlurTimer) this._airBlurTimer.destroy();
    this._airBlurTimer = sc.time.addEvent({
      delay: 55, loop: true,
      callback: () => {
        airF1 = (airF1 % 6) + 1;
        airF2 = ((airF2 + 1) % 6) + 1;
        this.coinFace.setTexture(`dice_blur_${airF1}`);
        this.coinFace2.setTexture(`dice_blur_${airF2}`);
      }
    });

    let landedCount = 0;
    const onCoinLanded = (tx, ty) => {
      this._doShockwave(tx, ty);
      landedCount++;
      if (landedCount < 2) return;
      if (this._airBlurTimer) { this._airBlurTimer.destroy(); this._airBlurTimer = null; }
      this._startSpinLoop();
      sc.time.delayedCall(120, () => {
        this.arcTrailG.clear();
        this.arcTrailG.setVisible(false);
        this._arcPoints1 = [];
        this._arcPoints2 = [];
      });
      this.scene._onPowerDiceRollRequested?.();
    };

    const launchCoin = (container, shadow, targetX, targetY, peakX, peakY, spinAngle, pts, delayMs) => {
      sc.tweens.add({
        targets: shadow,
        scaleX: 0.42, scaleY: 0.45, alpha: 0.14,
        duration: 460, delay: delayMs, ease: 'Cubic.easeOut',
        onComplete: () => {
          sc.tweens.add({
            targets: shadow,
            scaleX: 1, scaleY: 1, alpha: 0.40,
            duration: 410, ease: 'Bounce.easeOut'
          });
        }
      });

      sc.tweens.add({
        targets: container,
        x: peakX, y: peakY,
        scaleX: 1.24, scaleY: 1.24,
        angle: spinAngle,
        duration: 460,
        delay: delayMs,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          pts.push({ x: container.x, y: container.y });
          if (pts.length > 22) pts.shift();
          this._renderArcTrail();
        },
        onComplete: () => {
          sc.tweens.add({
            targets: container,
            x: targetX, y: targetY,
            scaleX: 1, scaleY: 1,
            angle: spinAngle > 0 ? 1440 : -1440,
            duration: 420,
            ease: 'Bounce.easeOut',
            onUpdate: () => {
              pts.push({ x: container.x, y: container.y });
              if (pts.length > 22) pts.shift();
              this._renderArcTrail();
            },
            onComplete: () => {
              container.setAngle(0);
              onCoinLanded(targetX, targetY);
            }
          });
        }
      });
    };

    launchCoin(
      this.coinContainer, this.coinShadow, this.coin1X, this.coin1Y,
      this.coin1X - 30 * S, this.coin1Y - 210 * S, -900,
      this._arcPoints1, 0
    );
    launchCoin(
      this.coinContainer2, this.coinShadow2, this.coin2X, this.coin2Y,
      this.coin2X + 32 * S, this.coin2Y - 225 * S, 1080,
      this._arcPoints2, 60
    );
  }

  // ─────────────────────────────────────────────
  //  ARC TRAIL
  // ─────────────────────────────────────────────
  _renderArcTrail() {
    const S = this.minRatio;
    this.arcTrailG.clear();

    const drawTrail = (pts) => {
      if (pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const t  = i / pts.length;
        const w  = t * 8 * S;
        const a  = t * 0.72;
        const color = t > 0.78 ? 0xffffff : (t > 0.45 ? 0xffe888 : 0x44ee88);
        this.arcTrailG.lineStyle(w, color, a);
        this.arcTrailG.beginPath();
        this.arcTrailG.moveTo(p0.x, p0.y);
        this.arcTrailG.lineTo(p1.x, p1.y);
        this.arcTrailG.strokePath();
      }
      const last = pts[pts.length - 1];
      this.arcTrailG.fillStyle(0xffffff, 0.9);
      this.arcTrailG.fillCircle(last.x, last.y, 4 * S);
      this.arcTrailG.fillStyle(0x88ffcc, 0.5);
      this.arcTrailG.fillCircle(last.x, last.y, 8 * S);
    };

    drawTrail(this._arcPoints1);
    drawTrail(this._arcPoints2);
  }

  // ─────────────────────────────────────────────
  //  SPIN LOOP
  // ─────────────────────────────────────────────
  _startSpinLoop() {
    if (this._spinTimer) { this._spinTimer.destroy(); this._spinTimer = null; }

    let face1 = 1;
    let face2 = 4;
    const S   = this.minRatio;
    const INTERVAL = 60;

    this._spinTimer = this.scene.time.addEvent({
      delay: INTERVAL, loop: true,
      callback: () => {
        face1 = (face1 % 6) + 1;
        face2 = ((face2 + 1) % 6) + 1;
        this.coinFace.setTexture(`dice_blur_${face1}`);
        this.coinFace2.setTexture(`dice_blur_${face2}`);
        this.coinContainer.setX(this.coin1X + Phaser.Math.Between(-2, 2) * S);
        this.coinContainer.setY(this.coin1Y + Phaser.Math.Between(-2, 2) * S);
        this.coinContainer2.setX(this.coin2X + Phaser.Math.Between(-2, 2) * S);
        this.coinContainer2.setY(this.coin2Y + Phaser.Math.Between(-2, 2) * S);
      }
    });
  }

  _stopSpinLoop() {
    if (this._spinTimer)    { this._spinTimer.destroy();    this._spinTimer    = null; }
    if (this._airBlurTimer) { this._airBlurTimer.destroy(); this._airBlurTimer = null; }
    this.coinContainer.setPosition(this.coin1X, this.coin1Y);
    this.coinContainer2.setPosition(this.coin2X, this.coin2Y);
  }

  // ─────────────────────────────────────────────
  //  PUBLIC: playResultAnimation
  // ─────────────────────────────────────────────
  playResultAnimation(resultData, onHandoff) {
    this._stopSpinLoop();

    const sc = this.scene, S = this.minRatio;

    let d1, d2, total;
    if (typeof resultData === 'object' && resultData !== null) {
      d1 = Number(resultData.dice1) || 1;
      d2 = Number(resultData.dice2) || 1;
      total = Number(resultData.dice) || (d1 + d2);
    } else {
      total = Math.max(2, Math.min(12, Number(resultData) || 2));
      d1 = Math.min(6, Math.max(1, Math.floor(total / 2)));
      d2 = Math.min(6, Math.max(1, total - d1));
    }

    const isLuckyDouble = (d1 === 1 && d2 === 1) || (d1 === 6 && d2 === 6);

    this.coinFace.setTexture(`dice_${d1}`).setAngle(0);
    this.coinFace2.setTexture(`dice_${d2}`).setAngle(0);
    this.coinContainer.setAngle(-10);
    this.coinContainer2.setAngle(10);

    sc.tweens.add({
      targets: this.coinContainer,
      scaleX: 1.28, scaleY: 1.28, angle: -4,
      duration: 180, ease: 'Back.easeOut',
      onComplete: () => {
        sc.tweens.add({
          targets: this.coinContainer,
          scaleX: 1.0, scaleY: 1.0,
          duration: 240, ease: 'Bounce.easeOut'
        });
      }
    });
    sc.tweens.add({
      targets: this.coinContainer2,
      scaleX: 1.28, scaleY: 1.28, angle: 5,
      duration: 180, delay: 75, ease: 'Back.easeOut',
      onComplete: () => {
        sc.tweens.add({
          targets: this.coinContainer2,
          scaleX: 1.0, scaleY: 1.0,
          duration: 240, ease: 'Bounce.easeOut'
        });
      }
    });

    const burstCount = isLuckyDouble ? 38 : 24;
    this._spawnBurst(this.coin1X, this.coin1Y, burstCount);
    this._spawnBurst(this.coin2X, this.coin2Y, burstCount);
    this._doFlash(this.coin1X, this.coin1Y);
    this._doFlash(this.coin2X, this.coin2Y);
    this._doShockwave(this.coin1X, this.coin1Y, isLuckyDouble ? 0x00ffcc : 0xffdd00);
    this._doShockwave(this.coin2X, this.coin2Y, isLuckyDouble ? 0x00ffcc : 0xffdd00);

    let label = `${total}`;
    if (isLuckyDouble) {
      label = `${total}  •  ĐÔI ${d1}! ĐI TIẾP!`;
    } else if (d1 === d2) {
      label = `${total}  (ĐÔI ${d1}!)`;
    }

    const numText = sc.add.text(
      this.coinX, this.coinY - this.COIN_R * 1.45,
      label,
      {
        fontFamily: '"Signika Negative", Signika, Arial Black',
        fontSize:   Math.floor((isLuckyDouble ? 44 : (d1 === d2 ? 56 : 74)) * S) + 'px',
        color:      isLuckyDouble ? '#00ffcc' : (d1 === d2 ? '#66ffaa' : '#ffee44'),
        fontStyle:  'bold',
        stroke:     '#4a1e00', strokeThickness: 9,
        shadow:     { offsetX:0, offsetY:5, color: isLuckyDouble ? '#00aa88' : '#ff8800', blur:18, fill:true }
      }
    ).setOrigin(0.5).setDepth(220).setAlpha(0);

    sc.tweens.add({
      targets: numText, alpha: 1,
      y: this.coinY - this.COIN_R * 2.25,
      duration: 430, ease: 'Back.easeOut',
      onComplete: () => {
        sc.time.delayedCall(920, () => {
          sc.tweens.add({
            targets: numText, alpha: 0,
            y: this.coinY - this.COIN_R * 2.95,
            duration: 370,
            onComplete: () => numText.destroy()
          });
        });
      }
    });

    sc.time.delayedCall(1650, () => this._handoffToBoardScene(onHandoff));
  }

  // ─────────────────────────────────────────────
  //  HANDOFF
  // ─────────────────────────────────────────────
  _handoffToBoardScene(onHandoff) {
    const sc = this.scene, S = this.minRatio;

    const tx1 = this.scene.diceSprite?.x  ?? this.coin1X;
    const ty1 = this.scene.diceSprite?.y  ?? this.coin1Y;
    const tx2 = this.scene.diceSprite2?.x ?? this.coin2X;
    const ty2 = this.scene.diceSprite2?.y ?? this.coin2Y;

    sc.tweens.add({
      targets: this.coinContainer,
      x: tx1, y: ty1,
      scaleX: 0.35, scaleY: 0.35, alpha: 0,
      duration: 420, ease: 'Cubic.easeIn'
    });
    sc.tweens.add({
      targets: this.coinContainer2,
      x: tx2, y: ty2,
      scaleX: 0.35, scaleY: 0.35, alpha: 0,
      duration: 420, ease: 'Cubic.easeIn'
    });
    sc.tweens.add({
      targets: [this.coinGlowG, this.glowRingG, this.coinShadow, this.coinShadow2],
      alpha: 0, duration: 300
    });

    this.chargeBarG.clear();
    this.chargeBarFill.clear();

    sc.time.delayedCall(450, () => {
      [
        this.coinContainer, this.coinContainer2, this.btnContainer,
        this.coinShadow, this.coinShadow2, this.coinGlowG, this.glowRingG,
        this.chargeBarG, this.chargeBarFill, this.arcTrailG
      ].forEach(o => { if (o) { o.setVisible(false); if (o.setAlpha) o.setAlpha(0); } });

      this.coinGlowG.clear(); this.glowRingG.clear();
      this.chargeBarG.clear(); this.chargeBarFill.clear();

      this.coinContainer.setPosition(this.coin1X, this.coin1Y).setScale(1).setAngle(0);
      this.coinContainer2.setPosition(this.coin2X, this.coin2Y).setScale(1).setAngle(0);
      this.btnContainer.setY(this.coin2Y + this.COIN_R + this.COIN_RIM + 52 * S);

      this.active  = false;
      this.rolling = false;

      if (onHandoff) onHandoff();
    });
  }

  // ─────────────────────────────────────────────
  //  FLASH & SHOCKWAVE
  // ─────────────────────────────────────────────
  _doFlash(cx, cy) {
    const sc = this.scene;
    const fl = sc.add.circle(cx, cy, this.COIN_R * 2.0, 0xffffff, 0.55).setDepth(210);
    sc.tweens.add({
      targets: fl, alpha: 0, scaleX: 2.3, scaleY: 2.3,
      duration: 360, ease: 'Cubic.easeOut',
      onComplete: () => fl.destroy()
    });
  }

  _doShockwave(cx, cy, color = 0xffe066) {
    const sc = this.scene, S = this.minRatio;
    const ring = sc.add.circle(cx, cy, this.COIN_R * 0.9, color, 0)
      .setStrokeStyle(4 * S, color, 0.85)
      .setDepth(209);
    sc.tweens.add({
      targets: ring, scaleX: 2.15, scaleY: 2.15, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  // ─────────────────────────────────────────────
  //  DESTROY
  // ─────────────────────────────────────────────
  destroy() {
    this.scene.input.keyboard.off('keydown-SPACE', this._kbDown);
    this.scene.input.keyboard.off('keyup-SPACE',   this._kbUp);
    this.scene.events.off('update', this._update, this);
    if (this._spinTimer)     { this._spinTimer.destroy();     this._spinTimer     = null; }
    if (this._airBlurTimer)  { this._airBlurTimer.destroy();  this._airBlurTimer  = null; }
    if (this._coinBobTween)  { this._coinBobTween.stop();     this._coinBobTween  = null; }
    if (this._coinBobTween2) { this._coinBobTween2.stop();    this._coinBobTween2 = null; }
    if (this._shadowTween1)  { this._shadowTween1.stop();     this._shadowTween1  = null; }
    if (this._shadowTween2)  { this._shadowTween2.stop();     this._shadowTween2  = null; }
    if (this._btnPulseTween) { this._btnPulseTween.stop();    this._btnPulseTween = null; }
  }
}

if (typeof window !== 'undefined') window.PowerDiceSystem = PowerDiceSystem;
