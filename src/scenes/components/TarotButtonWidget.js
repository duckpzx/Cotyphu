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

    // Label
    this._labelTxt = push(sc.add.text(bx, by, "THẺ BÀI", {
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
    const onCd = this._onCooldown; // tất cả thẻ đang hồi
    g.clear();
    // Bóng
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(bx - BW / 2 + 3 * S, by - BH / 2 + 5 * S, BW, BH, BH / 2);
    // Nền gradient — xám khi cooldown, vàng khi sẵn sàng
    if (onCd) {
      g.fillGradientStyle(0x888888, 0x888888, 0x555555, 0x555555, 1);
    } else {
      g.fillGradientStyle(
        hover ? 0xffdd55 : 0xffcc00,
        hover ? 0xffdd55 : 0xffcc00,
        hover ? 0xff9900 : 0xdd7700,
        hover ? 0xff9900 : 0xdd7700, 1
      );
    }
    g.fillRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
    // Shine
    g.fillStyle(0xffffff, hover ? 0.32 : 0.20);
    g.fillRoundedRect(bx - BW / 2 + 8 * S, by - BH / 2 + 4 * S, BW - 16 * S, BH * 0.38, BH / 2 - 4 * S);
    // Viền
    g.lineStyle(2 * S, onCd ? 0xaaaaaa : 0xffffff, 0.8);
    g.strokeRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
  }

  /**
   * Cập nhật trạng thái cooldown của nút dựa trên tarot runtime.
   * Gọi sau mỗi lần server emit tarot_state.
   */
  updateCooldownState() {
    const sc    = this.scene;
    const myUid = sc._myUserId?.();
    if (!myUid) return;

    const myState  = sc.tarotStateByUserId?.[myUid];
    const me       = (sc.gamePlayers || []).find(p => Number(p.user_id) === Number(myUid));
    const activeIds = sc._normalizeTarotIds?.(me?.active_tarot_ids) || [];
    const runtime  = myState?.tarot_runtime || {};

    // Tất cả thẻ đang hồi?
    const allOnCd = activeIds.length > 0 && activeIds.every(id => {
      return Number(runtime[id]?.cooldown_turns_left ?? 0) > 0;
    });

    this._onCooldown = allOnCd;
    this._drawBtn(false, this._S, this._BW, this._BH);

    // Cập nhật label
    if (this._labelTxt) {
      if (myState?.used_tarot_this_turn) {
        this._labelTxt.setText("THẺ BÀI ✓").setColor("#aaaaaa");
      } else if (allOnCd) {
        // Tìm cooldown thấp nhất
        let minCd = Infinity;
        activeIds.forEach(id => {
          const left = Number(runtime[id]?.cooldown_turns_left ?? 0);
          if (left > 0 && left < minCd) minCd = left;
        });
        this._labelTxt.setText(`THẺ BÀI ⏳${minCd}`).setColor("#cccccc");
      } else {
        this._labelTxt.setText("THẺ BÀI").setColor("#fff2bf");
      }
    }
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