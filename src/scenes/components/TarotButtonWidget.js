// ═══════════════════════════════════════════════════════════════════════
//  TarotButtonWidget.js
//  Nút mở thẻ bài hiển thị ở góc màn hình khi đến lượt người chơi
//  Tích hợp: this.tarotBtn = new TarotButtonWidget(scene, tarotModal)
// ═══════════════════════════════════════════════════════════════════════

export default class TarotButtonWidget {
  constructor(scene, tarotModal) {
    this.scene      = scene;
    this.modal      = tarotModal;
    this._objs      = [];
    this._pulse     = null;
    this._visible   = false;
  }

  create(minRatio) {
    const sc = this.scene;
    const { width, height } = sc.scale;
    const S = minRatio;

    // Vị trí: phía trên cùng, giữa màn hình (trên info bar)
    this._bx = width / 2;
    this._by = 90 * S;

    this._buildButton(S);
    this.hide(); // ẩn ban đầu
  }

  _buildButton(S) {
    const sc = this.scene;
    const { width } = sc.scale;
    const D = 55;
    const bx = this._bx;
    const by = this._by;
    const BW = 210 * S;
    const BH = 46 * S;
    const push = o => { this._objs.push(o); return o; };

    // Glow xung quanh
    this._glowG = push(sc.add.graphics().setDepth(D));
    this._glowG.fillStyle(0xffcc44, 0.15);
    this._glowG.fillRoundedRect(bx - BW / 2 - 8 * S, by - BH / 2 - 8 * S, BW + 16 * S, BH + 16 * S, BH / 2 + 8 * S);

    // Nền nút
    this._btnG = push(sc.add.graphics().setDepth(D + 1));
    this._drawBtn(false, S, BW, BH);

    // Icon thẻ bài
    this._iconTxt = push(sc.add.text(bx - BW / 2 + 28 * S, by, "🃏", {
      fontSize: Math.floor(22 * S) + "px"
    }).setOrigin(0.5).setDepth(D + 3));

    // Label
    this._labelTxt = push(sc.add.text(bx + 10 * S, by, "THẺ BÀI", {
      fontFamily: "Signika",
      fontSize: Math.floor(18 * S) + "px",
      color: "#fff2bf",
      fontStyle: "bold",
      stroke: "#5a2d00",
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(D + 3));

    // Zone click
    this._zone = push(sc.add.zone(bx, by, BW + 10 * S, BH + 10 * S)
      .setInteractive({ useHandCursor: true })
      .setDepth(D + 5));

    this._zone.on("pointerover",  () => this._drawBtn(true, S, BW, BH));
    this._zone.on("pointerout",   () => this._drawBtn(false, S, BW, BH));
    this._zone.on("pointerdown",  () => {
      sc.tweens.add({
        targets: [this._btnG, this._labelTxt], scaleX: 0.93, scaleY: 0.93,
        duration: 60, yoyo: true,
        onComplete: () => this.modal.open()
      });
    });

    this._S   = S;
    this._BW  = BW;
    this._BH  = BH;
  }

  _drawBtn(hover, S, BW, BH) {
    const sc    = this.scene;
    const g     = this._btnG;
    const bx    = this._bx;
    const by    = this._by;
    if (!g) return;
    g.clear();
    // Bóng
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(bx - BW / 2 + 3 * S, by - BH / 2 + 5 * S, BW, BH, BH / 2);
    // Nền gradient vàng
    g.fillGradientStyle(
      hover ? 0xffdd55 : 0xffcc00,
      hover ? 0xffdd55 : 0xffcc00,
      hover ? 0xff9900 : 0xdd7700,
      hover ? 0xff9900 : 0xdd7700, 1
    );
    g.fillRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
    // Shine
    g.fillStyle(0xffffff, hover ? 0.32 : 0.20);
    g.fillRoundedRect(bx - BW / 2 + 8 * S, by - BH / 2 + 4 * S, BW - 16 * S, BH * 0.38, BH / 2 - 4 * S);
    // Viền
    g.lineStyle(2 * S, 0xffffff, 0.8);
    g.strokeRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
  }

  show() {
    if (this._visible) return;
    this._visible = true;
    this._objs.forEach(o => o?.setVisible?.(true));
    this._startPulse();
  }

  hide() {
    this._visible = false;
    this._objs.forEach(o => o?.setVisible?.(false));
    this._stopPulse();
  }

  _startPulse() {
    this._stopPulse();
    if (!this._glowG) return;
    this._pulse = this.scene.tweens.add({
      targets: this._glowG,
      alpha: { from: 0.6, to: 0.15 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _stopPulse() {
    if (this._pulse) { this._pulse.stop(); this._pulse = null; }
  }

  destroy() {
    this._stopPulse();
    this._objs.forEach(o => { try { o?.destroy?.(); } catch {} });
    this._objs = [];
  }
}