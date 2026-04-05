// ═══════════════════════════════════════════════════════════════════════
//  TarotModalSystem.js
//  Hệ thống modal thẻ bài Tarot — hoàn chỉnh, tối ưu
//  Tích hợp vào BoardScene qua: this.tarotModal = new TarotModalSystem(scene)
// ═══════════════════════════════════════════════════════════════════════

export default class TarotModalSystem {
  constructor(scene) {
    this.scene   = scene;
    this._objs   = [];       // tất cả game objects trong modal
    this._timer  = null;     // interval cập nhật cooldown live
    this._open   = false;
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────

  /** Mở modal chọn thẻ bài của player hiện tại */
  open() {
    if (this._open) { this.close(); return; }
    const sc = this.scene;
    const myUid = sc._myUserId();
    const me = (sc.gamePlayers || []).find(p => Number(p.user_id) === Number(myUid));
    if (!me) return;

    const activeIds = sc._normalizeTarotIds(me.active_tarot_ids);
    const allCards = sc.tarotCardsByUserId?.[myUid] || [];

    const cards = activeIds
      .map(id => allCards.find(c => Number(c.id) === Number(id)))
      .filter(Boolean);

    if (!cards.length) {
      sc._showToast("Bạn chưa được trang bị thẻ bài nào", "#ff9999", 1800);
      return;
    }

    this._build(cards, me, activeIds);
    this._open = true;
    this._startLiveCooldownTicker(cards, myUid);
  }

  close() {
    this._objs.forEach(o => { try { o?.destroy?.(); } catch {} });
    this._objs = [];
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._open = false;
    this._cardUIs = [];
  }

  isOpen() { return this._open; }

  // ─── BUILD MODAL ───────────────────────────────────────────────────────

  _build(cards, me, activeIds) {
    const sc = this.scene;
    const { width, height } = sc.scale;
    const S = sc.minRatio || 1;
    const D = 600; // depth cao để đè lên mọi thứ
    const push = o => { this._objs.push(o); return o; };

    this._cardUIs = [];

    // ── Backdrop mờ, click ra ngoài để đóng ──
    const backdrop = push(
      sc.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
        .setDepth(D)
        .setInteractive()
    );
    sc.tweens.add({ targets: backdrop, alpha: 0.75, duration: 220, ease: 'Power2' });
    backdrop.on("pointerdown", () => this.close());

    // ── Tiêu đề nổi ──
    const titleY = height / 2 - 290 * S;
    push(sc.add.text(width / 2, titleY,
      "✦  CHỌN THẺ BÀI ĐỂ SỬ DỤNG  ✦", {
      fontFamily: "Signika",
      fontSize: Math.floor(30 * S) + "px",
      color: "#ffe28a",
      fontStyle: "bold",
      stroke: "#3a1a00",
      strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 3, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(D + 2).setAlpha(0));

    sc.tweens.add({ targets: this._objs[this._objs.length - 1], alpha: 1, y: titleY - 6 * S, duration: 300, delay: 100, ease: 'Back.easeOut' });

    // ── Subtitle ──
    push(sc.add.text(width / 2, titleY + 38 * S,
      "Mỗi lượt chỉ dùng được 1 thẻ  •  Thẻ có cooldown sau khi sử dụng", {
      fontFamily: "Signika",
      fontSize: Math.floor(15 * S) + "px",
      color: "#c8a060",
      fontStyle: "italic"
    }).setOrigin(0.5).setDepth(D + 2).setAlpha(0));
    sc.tweens.add({ targets: this._objs[this._objs.length - 1], alpha: 1, duration: 300, delay: 150 });

    // ── Layout thẻ ──
    const CARD_W  = 290 * S;
    const CARD_H  = 400 * S;
    const GAP     = 60 * S;
    const totalW  = cards.length * CARD_W + (cards.length - 1) * GAP;
    const startX  = width / 2 - totalW / 2;
    const cardCY  = height / 2 + 10 * S;

    cards.forEach((card, index) => {
      const cardCX = startX + index * (CARD_W + GAP) + CARD_W / 2;
      const delay  = 120 + index * 80;
      const ui     = this._buildCard(card, cardCX, cardCY, CARD_W, CARD_H, S, D, push, delay, me);
      this._cardUIs.push({ card, ui, cx: cardCX, cy: cardCY });
    });

    // ── Nút Đóng ──
    this._buildCloseBtn(width / 2, height / 2 + 240 * S, S, D, push);
  }

  // ─── BUILD MỘT THẺ ────────────────────────────────────────────────────

  _buildCard(card, cx, cy, CW, CH, S, D, push, delay, me) {
    const sc = this.scene;
    const myUid = sc._myUserId();
    const runtime = sc.tarotStateByUserId?.[myUid]?.tarot_runtime?.[card.id] || {};
    const now = sc._estimateServerNowMs ? sc._estimateServerNowMs() : Date.now();
    const remaining = Math.max(0, Math.ceil((Number(runtime.next_available_at || 0) - now) / 1000));
    const onCooldown = remaining > 0;
    const usedThisTurn = !!(sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn);

    const left = cx - CW / 2;
    const top  = cy - CH / 2;
    const RAD  = 20 * S;

    const ui = {};

    // -- Bóng đổ card --
    const shadow = push(sc.add.graphics().setDepth(D + 1).setAlpha(0));
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(left + 8 * S, top + 12 * S, CW, CH, RAD);
    sc.tweens.add({ targets: shadow, alpha: 1, duration: 280, delay, ease: 'Power2' });

    // -- Nền card --
    const bg = push(sc.add.graphics().setDepth(D + 2).setAlpha(0));
    this._drawCardBg(bg, left, top, CW, CH, RAD, onCooldown, S);
    sc.tweens.add({ targets: bg, alpha: 1, y: `-=${8 * S}`, duration: 320, delay, ease: 'Back.easeOut' });
    ui.bg = bg;

    // -- Tên thẻ --
    const nameText = push(sc.add.text(cx, top + 26 * S,
      card.name || `Thẻ ${card.id}`, {
      fontFamily: "Signika",
      fontSize: Math.floor(20 * S) + "px",
      color: onCooldown ? "#999999" : "#fff2bf",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: CW - 28 * S },
      stroke: "#000000",
      strokeThickness: 3
    }).setOrigin(0.5, 0).setDepth(D + 5).setAlpha(0));
    sc.tweens.add({ targets: nameText, alpha: 1, duration: 280, delay: delay + 60 });
    ui.nameText = nameText;

    // -- Ảnh thẻ --
    const imgKey = `tarot_${card.id}`;
    if (sc.textures.exists(imgKey)) {
      const img = push(sc.add.image(cx, top + CH * 0.44, imgKey)
        .setDisplaySize(CW * 0.62, CH * 0.52)
        .setDepth(D + 5)
        .setAlpha(0)
        .setTint(onCooldown ? 0x555555 : 0xffffff));
      sc.tweens.add({ targets: img, alpha: 1, duration: 300, delay: delay + 80 });
      ui.img = img;
    }

    // -- Mô tả --
    const descText = push(sc.add.text(cx, top + CH * 0.72,
      card.description || "Không có mô tả", {
      fontFamily: "Signika",
      fontSize: Math.floor(14 * S) + "px",
      color: onCooldown ? "#777777" : "#dfe8ff",
      align: "center",
      wordWrap: { width: CW - 32 * S },
      lineSpacing: 4
    }).setOrigin(0.5, 0).setDepth(D + 5).setAlpha(0));
    sc.tweens.add({ targets: descText, alpha: 1, duration: 280, delay: delay + 100 });
    ui.descText = descText;

    // -- Cooldown label --
    const cdColor = onCooldown ? "#ff9966" : "#ffe28a";
    const cdText = push(sc.add.text(cx, top + CH - 68 * S,
      onCooldown ? `⏳ Hồi chiêu: ${remaining}s` : `⚡ CD: ${card.cooldown_seconds || 0}s`, {
      fontFamily: "Signika",
      fontSize: Math.floor(16 * S) + "px",
      color: cdColor,
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 5).setAlpha(0));
    sc.tweens.add({ targets: cdText, alpha: 1, duration: 280, delay: delay + 120 });
    ui.cdText = cdText;

    // -- Cooldown progress bar --
    const barW = CW - 32 * S;
    const barH = 8 * S;
    const barX = cx - barW / 2;
    const barY = top + CH - 50 * S;

    const barBg = push(sc.add.graphics().setDepth(D + 4).setAlpha(0));
    barBg.fillStyle(0x333333, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    sc.tweens.add({ targets: barBg, alpha: 1, duration: 280, delay: delay + 130 });

    const barFill = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
    const maxCd = Number(card.cooldown_seconds || 1);
    const pct = onCooldown ? (remaining / maxCd) : 0;
    this._drawCdBar(barFill, barX, barY, barW, barH, pct, onCooldown);
    sc.tweens.add({ targets: barFill, alpha: 1, duration: 280, delay: delay + 130 });
    ui.barFill = barFill;
    ui.barX = barX; ui.barY = barY; ui.barW = barW; ui.barH = barH;
    ui.maxCd = maxCd;

    // -- Nút DÙNG / disabled --
    if (!onCooldown && !usedThisTurn) {
      this._buildUseButton(card, cx, top + CH - 22 * S, CW, S, D, push, ui);
    } else {
      const reason = usedThisTurn ? "Đã dùng lượt này" : `Đang hồi: ${remaining}s`;
      const disabledBtn = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
      disabledBtn.fillStyle(0x444444, 1);
      disabledBtn.fillRoundedRect(cx - (CW * 0.7) / 2, top + CH - 38 * S, CW * 0.7, 34 * S, 17 * S);
      sc.tweens.add({ targets: disabledBtn, alpha: 1, duration: 280, delay: delay + 140 });

      const disText = push(sc.add.text(cx, top + CH - 21 * S, reason, {
        fontFamily: "Signika", fontSize: Math.floor(14 * S) + "px", color: "#888888", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
      sc.tweens.add({ targets: disText, alpha: 1, duration: 280, delay: delay + 140 });
      ui.disabledBtn = disabledBtn;
      ui.disText = disText;
    }

    // -- Overlay cooldown tối --
    if (onCooldown) {
      const overlay = push(sc.add.graphics().setDepth(D + 6).setAlpha(0));
      overlay.fillStyle(0x000000, 0.52);
      overlay.fillRoundedRect(left, top, CW, CH, RAD);
      sc.tweens.add({ targets: overlay, alpha: 1, duration: 280, delay });
      ui.overlay = overlay;

      // Số giây to ở giữa
      const bigCD = push(sc.add.text(cx, cy, `${remaining}`, {
        fontFamily: "Signika",
        fontSize: Math.floor(64 * S) + "px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(D + 7).setAlpha(0));
      sc.tweens.add({ targets: bigCD, alpha: 1, duration: 280, delay });
      ui.bigCD = bigCD;
    }

    return ui;
  }

  _drawCardBg(g, left, top, CW, CH, RAD, onCooldown, S) {
    g.clear();
    // Nền tối huyền bí
    g.fillStyle(onCooldown ? 0x1a1a2e : 0x0d1b3e, 1);
    g.fillRoundedRect(left, top, CW, CH, RAD);

    // Dải gradient màu trên đầu
    const topColor = onCooldown ? 0x333333 : 0x1a3a6e;
    g.fillStyle(topColor, 1);
    g.fillRoundedRect(left, top, CW, CH * 0.18, RAD);
    g.fillRect(left, top + CH * 0.12, CW, CH * 0.06);

    // Shine
    g.fillStyle(0xffffff, onCooldown ? 0.04 : 0.10);
    g.fillRoundedRect(left + 6 * S, top + 5 * S, CW - 12 * S, CH * 0.15, RAD - 4 * S);

    // Viền vàng / xám
    g.lineStyle(3 * S, onCooldown ? 0x555555 : 0xf5c542, 1);
    g.strokeRoundedRect(left, top, CW, CH, RAD);

    // Viền nội bộ nhỏ
    g.lineStyle(1 * S, onCooldown ? 0x333333 : 0xc8901a, 0.5);
    g.strokeRoundedRect(left + 5 * S, top + 5 * S, CW - 10 * S, CH - 10 * S, RAD - 3 * S);

    // Góc trang trí
    if (!onCooldown) {
      const cornerSize = 12 * S;
      [[left + 8 * S, top + 8 * S], [left + CW - 8 * S, top + 8 * S],
       [left + 8 * S, top + CH - 8 * S], [left + CW - 8 * S, top + CH - 8 * S]].forEach(([x, y]) => {
        g.fillStyle(0xf5c542, 0.6);
        g.fillCircle(x, y, cornerSize / 2);
      });
    }
  }

  _drawCdBar(g, barX, barY, barW, barH, pct, onCooldown) {
    g.clear();
    if (pct <= 0) {
      g.fillStyle(0x00cc44, 1);
      g.fillRoundedRect(barX, barY, barW, barH, barH / 2);
      return;
    }
    const fillW = barW * pct;
    const color = pct > 0.6 ? 0xff4444 : pct > 0.3 ? 0xff9900 : 0xffdd00;
    g.fillStyle(color, 1);
    g.fillRoundedRect(barX, barY, Math.max(fillW, 4), barH, barH / 2);
  }

  _buildUseButton(card, bx, by, CW, S, D, push) {
    const sc = this.scene;
    const BTN_W = CW * 0.72;
    const BTN_H = 38 * S;

    const g = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));

    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(bx - BTN_W / 2 + 3 * S, by - BTN_H / 2 + 5 * S, BTN_W, BTN_H, BTN_H / 2);
      g.fillGradientStyle(
        hover ? 0xffcc00 : 0xff9900,
        hover ? 0xffcc00 : 0xff9900,
        hover ? 0xff7700 : 0xcc5500,
        hover ? 0xff7700 : 0xcc5500, 1
      );
      g.fillRoundedRect(bx - BTN_W / 2, by - BTN_H / 2, BTN_W, BTN_H, BTN_H / 2);
      g.fillStyle(0xffffff, hover ? 0.35 : 0.20);
      g.fillRoundedRect(bx - BTN_W / 2 + 6 * S, by - BTN_H / 2 + 4 * S, BTN_W - 12 * S, BTN_H * 0.38, BTN_H / 2 - 3 * S);
      g.lineStyle(2 * S, 0xffffff, 0.8);
      g.strokeRoundedRect(bx - BTN_W / 2, by - BTN_H / 2, BTN_W, BTN_H, BTN_H / 2);
    };

    draw(false);
    sc.tweens.add({ targets: g, alpha: 1, duration: 280, delay: 200 });

    const txt = push(sc.add.text(bx, by + 50, "✨  DÙNG THẺ", {
      fontFamily: "Signika",
      fontSize: Math.floor(17 * S) + "px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#663300",
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
    sc.tweens.add({ targets: txt, alpha: 1, duration: 280, delay: 200 });

    // Pulse nhẹ
    sc.tweens.add({
      targets: [g, txt], scaleX: { from: 1, to: 1.04 }, scaleY: { from: 1, to: 1.04 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    const zone = push(sc.add.zone(bx, by, BTN_W + 10 * S, BTN_H + 10 * S)
      .setInteractive({ useHandCursor: true })
      .setDepth(D + 10));
    zone.on("pointerover", () => draw(true));
    zone.on("pointerout",  () => draw(false));
    zone.on("pointerdown", () => {
      sc.tweens.add({
        targets: [g, txt], scaleX: 0.92, scaleY: 0.92, duration: 60, yoyo: true,
        onComplete: () => this._useCard(card)
      });
    });
  }

  _buildCloseBtn(bx, by, S, D, push) {
    const sc = this.scene;
    const BW = 160 * S, BH = 42 * S;
    const g = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));

    const draw = (h) => {
      g.clear();
      g.fillStyle(h ? 0x884422 : 0x552211, 1);
      g.fillRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
      g.lineStyle(2 * S, h ? 0xff8866 : 0xff5533, 1);
      g.strokeRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, BH / 2);
    };

    draw(false);
    sc.tweens.add({ targets: g, alpha: 1, duration: 280, delay: 300 });

    const txt = push(sc.add.text(bx, by, "✕  Đóng", {
      fontFamily: "Signika", fontSize: Math.floor(16 * S) + "px",
      color: "#ff9988", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
    sc.tweens.add({ targets: txt, alpha: 1, duration: 280, delay: 300 });

    const zone = push(sc.add.zone(bx, by, BW + 10 * S, BH + 10 * S)
      .setInteractive({ useHandCursor: true }).setDepth(D + 10));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => this.close());
  }

  // ─── SỬ DỤNG THẺ ──────────────────────────────────────────────────────

  _useCard(card) {
    const sc = this.scene;
    sc.socket.emit("game:use_tarot", {
      room_id: sc.gameRoomId,
      tarot_id: card.id
    });
    // Hiệu ứng flash rồi đóng — server sẽ emit game:tarot_used
    this._flashEffect(() => this.close());
  }

  _flashEffect(onDone) {
    const sc = this.scene;
    const { width, height } = sc.scale;
    const flash = sc.add.rectangle(width / 2, height / 2, width, height, 0xffdd88, 0)
      .setDepth(900);
    sc.tweens.add({
      targets: flash, alpha: 0.4, duration: 80, yoyo: true,
      onComplete: () => {
        flash.destroy();
        if (onDone) onDone();
      }
    });
  }

  // ─── LIVE COOLDOWN TICKER ──────────────────────────────────────────────

  _startLiveCooldownTicker(cards, myUid) {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      if (!this._open) { clearInterval(this._timer); return; }
      this._updateCooldownDisplays(cards, myUid);
    }, 1000);
  }

  _updateCooldownDisplays(cards, myUid) {
    const sc = this.scene;
    const now = sc._estimateServerNowMs ? sc._estimateServerNowMs() : Date.now();

    (this._cardUIs || []).forEach(({ card, ui }) => {
      const runtime = sc.tarotStateByUserId?.[myUid]?.tarot_runtime?.[card.id] || {};
      const remaining = Math.max(0, Math.ceil((Number(runtime.next_available_at || 0) - now) / 1000));
      const maxCd = Number(card.cooldown_seconds || 1);
      const pct = remaining > 0 ? (remaining / maxCd) : 0;

      if (ui.cdText) {
        ui.cdText.setText(remaining > 0 ? `⏳ Hồi chiêu: ${remaining}s` : `⚡ CD: ${maxCd}s`);
        ui.cdText.setColor(remaining > 0 ? "#ff9966" : "#ffe28a");
      }
      if (ui.barFill) {
        this._drawCdBar(ui.barFill, ui.barX, ui.barY, ui.barW, ui.barH, pct, remaining > 0);
      }
      if (ui.bigCD) {
        ui.bigCD.setText(remaining > 0 ? `${remaining}` : '');
      }
    });
  }
}