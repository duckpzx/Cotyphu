// ═══════════════════════════════════════════════════════════════════════════
//  TarotModalSystem.js  — v2 (COMPLETE)
//  Hệ thống modal thẻ bài Tarot — hoàn chỉnh với validation + targeting
//
//  Tích hợp: this.tarotModal = new TarotModalSystem(scene)
import { playBoardTarotSound } from "../../utils/clickSound.js";
//
//  Thay thế hoàn toàn file TarotModalSystem.js cũ.
// ═══════════════════════════════════════════════════════════════════════════

export default class TarotModalSystem {
  constructor(scene) {
    this.scene  = scene;
    this._objs  = [];
    this._timer = null;
    this._open  = false;

    
    // Targeting state
    this._targetingListener   = null;
    this._secondaryListener   = null;
    this._targetingMode       = null;
    this._selectedEnemyCell   = null;
    this._swapCard            = null;
    this._enemyCells          = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  open(focusTarotId = null) {
    if (this._open) { this.close(); return; }

    const sc    = this.scene;
    const myUid = sc._myUserId();
    const me    = (sc.gamePlayers || []).find(p => Number(p.user_id) === Number(myUid));
    if (!me) return;

    // ── Kiểm tra điều kiện chung ──────────────────────────────────────────
    if (!sc._canUseTarotNow()) {
      const reason = !sc.isMyTurn              ? "Chưa đến lượt của bạn"
                   : !sc.canRoll               ? "Không thể dùng thẻ sau khi đã tung xúc xắc"
                   : sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn
                                               ? "Đã dùng thẻ trong lượt này"
                   :                             "Không thể dùng thẻ lúc này";
      sc._showToast(`⚠️ ${reason}`, "#ff9999", 2000);
      return;
    }

    const activeIds = sc._normalizeTarotIds(me.active_tarot_ids);
    const allCards  = sc.tarotCardsByUserId?.[myUid] || [];
    const cards     = activeIds
      .map(id => allCards.find(c => Number(c.id) === Number(id)))
      .filter(Boolean);

    if (!cards.length) {
      sc._showToast("Bạn chưa được trang bị thẻ bài nào", "#ff9999", 1800);
      return;
    }

    this._build(cards, me, activeIds, focusTarotId);
    this._open = true;
    this._startLiveCooldownTicker(cards, myUid);
    
    // ── Bật hiệu ứng tối map giống khi đặt tinh cầu ──────────────
    sc._startDarkMapEffect?.();
  }

  close() {
    this._cleanupTargetingListeners();
    this._objs.forEach(o => { try { o?.destroy?.(); } catch {} });
    this._objs   = [];
    this._cardUIs = [];
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._open = false;
    // Tắt hiệu ứng tối map
    this.scene._stopDarkMapEffect?.();
  }

  isOpen() { return this._open; }

  // ─────────────────────────────────────────────────────────────────────────
  //  BUILD MODAL
  // ─────────────────────────────────────────────────────────────────────────

  _build(cards, me, activeIds, focusTarotId) {
    const sc          = this.scene;
    const { width, height } = sc.scale;
    const S           = sc.minRatio || 1;
    const D           = 600;
    const push        = o => { this._objs.push(o); return o; };

    this._cardUIs = [];

    // ── Làm tối map ───────────────────────────────────────────────────────
    sc._startDarkMapEffect?.();

    // ── Backdrop ──────────────────────────────────────────────────────────
    const backdrop = push(
      sc.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
        .setDepth(D).setInteractive()
    );
    sc.tweens.add({ targets: backdrop, alpha: 0.6, duration: 220, ease: 'Power2' });
    backdrop.on("pointerdown", () => this.close());

    // ── Tiêu đề — sẽ được vẽ lại trong layout block bên dưới ────────────
    const _titlePlaceholder1 = push(sc.add.text(-9999, -9999, ""));
    const _titlePlaceholder2 = push(sc.add.text(-9999, -9999, ""));

    // ── Layout thẻ — tính tổng chiều cao để căn giữa ────────────────────
    const CARD_W  = 310 * S;   // lớn hơn: 290 → 310
    const CARD_H  = 430 * S;   // lớn hơn: 400 → 430
    const GAP     = 40 * S;    // thu hẹp gap để thẻ gần mép hơn
    const TITLE_H = 80 * S;
    const CLOSE_H = 60 * S;
    const SPACING = 16 * S;    // giảm spacing
    const TOTAL_H = TITLE_H + SPACING + CARD_H + SPACING + CLOSE_H;

    const blockTop = height / 2 - TOTAL_H / 2;
    const titleCY  = blockTop + TITLE_H / 2;
    const cardCY   = blockTop + TITLE_H + SPACING + CARD_H / 2;
    const closeBY  = blockTop + TITLE_H + SPACING + CARD_H + SPACING + CLOSE_H / 2;

    const totalW = cards.length * CARD_W + (cards.length - 1) * GAP;
    const startX = width / 2 - totalW / 2;

    // Vẽ lại tiêu đề với vị trí đúng
    this._objs.pop()?.destroy(); // xóa subtitle placeholder
    this._objs.pop()?.destroy(); // xóa title placeholder

    push(sc.add.text(width / 2, titleCY - 18 * S, "✦  CHỌN THẺ BÀI ĐỂ SỬ DỤNG  ✦", {
      fontFamily: "Signika", fontSize: Math.floor(30 * S) + "px",
      color: "#ffe28a", fontStyle: "bold",
      stroke: "#3a1a00", strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 3, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(D + 2).setAlpha(0));
    sc.tweens.add({ targets: this._objs[this._objs.length - 1], alpha: 1, duration: 300, delay: 100 });

    push(sc.add.text(width / 2, titleCY + 18 * S,
      "Mỗi lượt chỉ dùng được 1 thẻ  •  Thẻ có cooldown sau khi sử dụng", {
      fontFamily: "Signika", fontSize: Math.floor(15 * S) + "px",
      color: "#c8a060", fontStyle: "italic"
    }).setOrigin(0.5).setDepth(D + 2).setAlpha(0));
    sc.tweens.add({ targets: this._objs[this._objs.length - 1], alpha: 1, duration: 300, delay: 150 });

    cards.forEach((card, index) => {
      const cardCX = startX + index * (CARD_W + GAP) + CARD_W / 2;
      const delay  = 120 + index * 80;
      const ui     = this._buildCard(card, cardCX, cardCY, CARD_W, CARD_H, S, D, push, delay, me);
      this._cardUIs.push({ card, ui, cx: cardCX, cy: cardCY });
    });

    this._buildCloseBtn(width / 2, closeBY, S, D, push);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BUILD CARD
  // ─────────────────────────────────────────────────────────────────────────

  _buildCard(card, cx, cy, CW, CH, S, D, push, delay, me) {
    const sc      = this.scene;
    const myUid   = sc._myUserId();
    const runtime = sc.tarotStateByUserId?.[myUid]?.tarot_runtime?.[card.id] || {};
    // Cooldown theo số lần đổ xúc xắc
    const remaining    = Math.max(0, Number(runtime.cooldown_turns_left ?? 0));
    const cdUnit       = 'lần đổ';
    const onCooldown   = remaining > 0;
    const usedThisTurn = !!(sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn);

    const left = cx - CW / 2;
    const top  = cy - CH / 2;
    const RAD  = 20 * S;
    const ui   = {};

    // Bóng đổ
    const shadow = push(sc.add.graphics().setDepth(D + 1).setAlpha(0));
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(left + 8 * S, top + 12 * S, CW, CH, RAD);
    sc.tweens.add({ targets: shadow, alpha: 1, duration: 280, delay, ease: 'Power2' });

    // Nền card
    const bg = push(sc.add.graphics().setDepth(D + 2).setAlpha(0));
    this._drawCardBg(bg, left, top, CW, CH, RAD, onCooldown, S);
    sc.tweens.add({ targets: bg, alpha: 1, duration: 280, delay, ease: 'Power2' });
    ui.bg = bg;

    // Tên thẻ
    const nameText = push(sc.add.text(cx, top + 26 * S,
      card.name || `Thẻ ${card.id}`, {
      fontFamily: "Signika", fontSize: Math.floor(20 * S) + "px",
      color: onCooldown ? "#999999" : "#fff2bf", fontStyle: "bold",
      align: "center", wordWrap: { width: CW - 28 * S },
      stroke: "#000000", strokeThickness: 3
    }).setOrigin(0.5, 0).setDepth(D + 5).setAlpha(0));
    sc.tweens.add({ targets: nameText, alpha: 1, duration: 280, delay: delay + 60 });
    ui.nameText = nameText;

    // Ảnh thẻ — giữ nguyên tỷ lệ, fit trong vùng ảnh (lớn hơn, gần chạm mép)
    const imgKey = sc.textures.exists(`tarot_large_${card.id}`) ? `tarot_large_${card.id}` : `tarot_${card.id}`;
    const IMG_AREA_W = CW * 0.90;   // tăng từ 0.78 → 0.90
    const IMG_AREA_H = CH * 0.62;   // tăng từ 0.46 → 0.62
    const IMG_CY     = top + CH * 0.22 + CH * 0.31; // điều chỉnh vị trí giữa
    if (sc.textures.exists(imgKey)) {
      const tex = sc.textures.get(imgKey);
      const nat = tex.source[0];
      const scaleX = IMG_AREA_W / nat.width;
      const scaleY = IMG_AREA_H / nat.height;
      const imgScale = Math.min(scaleX, scaleY);
      const img = push(sc.add.image(cx, IMG_CY, imgKey)
        .setScale(imgScale).setDepth(D + 5).setAlpha(0)
        .setTint(onCooldown ? 0x555555 : 0xffffff));
      sc.tweens.add({ targets: img, alpha: 1, duration: 300, delay: delay + 80 });
      ui.img = img;
    }

    // ── Xóa mô tả — không hiển thị descText ──────────────────────

    // Cooldown label
    const cdText = push(sc.add.text(cx, top + CH - 52 * S,
      onCooldown ? `⏳ Còn ${remaining} lần đổ` : `⚡ CD: ${card.cooldown_turns ?? card.cooldown_seconds ?? 0} lần`, {
      fontFamily: "Signika", fontSize: Math.floor(14 * S) + "px",
      color: onCooldown ? "#ff9966" : "#ffe28a", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 5).setAlpha(0));
    sc.tweens.add({ targets: cdText, alpha: 1, duration: 280, delay: delay + 120 });
    ui.cdText = cdText;

    // Cooldown bar
    const barW = CW - 32 * S, barH = 7 * S;
    const barX = cx - barW / 2, barY = top + CH - 30 * S;
    const barBg = push(sc.add.graphics().setDepth(D + 4).setAlpha(0));
    barBg.fillStyle(0x333333, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    sc.tweens.add({ targets: barBg, alpha: 1, duration: 280, delay: delay + 130 });

    const barFill = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
    const maxCd   = Number(card.cooldown_seconds || 1);
    this._drawCdBar(barFill, barX, barY, barW, barH, onCooldown ? remaining / maxCd : 0, onCooldown);
    sc.tweens.add({ targets: barFill, alpha: 1, duration: 280, delay: delay + 130 });
    ui.barFill = barFill;
    ui.barX = barX; ui.barY = barY; ui.barW = barW; ui.barH = barH; ui.maxCd = maxCd;

    // Click vào card để dùng thẻ (thay nút DÙNG THẺ)
    if (!onCooldown && !usedThisTurn) {
      const cardZone = push(sc.add.zone(cx, cy, CW, CH)
        .setInteractive({ useHandCursor: true }).setDepth(D + 10));
      
      // Overlay tối khi hover
      const hoverOverlay = push(sc.add.graphics().setDepth(D + 8).setAlpha(0));
      hoverOverlay.fillStyle(0x000000, 0.25);
      hoverOverlay.fillRoundedRect(left, top, CW, CH, RAD);
      
      cardZone.on("pointerover", () => {
        sc.tweens.add({ targets: hoverOverlay, alpha: 1, duration: 100 });
      });
      cardZone.on("pointerout", () => {
        sc.tweens.add({ targets: hoverOverlay, alpha: 0, duration: 100 });
      });
      cardZone.on("pointerdown", () => {
        sc.tweens.add({ targets: bg, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true,
          onComplete: () => this._useCard(card) });
      });
    }

    // Overlay cooldown
    if (onCooldown) {
      const overlay = push(sc.add.graphics().setDepth(D + 6).setAlpha(0));
      overlay.fillStyle(0x000000, 0.52);
      overlay.fillRoundedRect(left, top, CW, CH, RAD);
      sc.tweens.add({ targets: overlay, alpha: 1, duration: 280, delay });

      const bigCD = push(sc.add.text(cx, cy, `${remaining}`, {
        fontFamily: "Signika", fontSize: Math.floor(64 * S) + "px",
        color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 6
      }).setOrigin(0.5).setDepth(D + 7).setAlpha(0));
      sc.tweens.add({ targets: bigCD, alpha: 1, duration: 280, delay });
      ui.bigCD = bigCD;
    }

    return ui;
  }

  _drawCardBg(g, left, top, CW, CH, RAD, onCooldown, S) {
    g.clear();
    g.fillStyle(onCooldown ? 0x1a1a2e : 0x0d1b3e, 1);
    g.fillRoundedRect(left, top, CW, CH, RAD);
    g.fillStyle(onCooldown ? 0x333333 : 0x1a3a6e, 1);
    g.fillRoundedRect(left, top, CW, CH * 0.18, RAD);
    g.fillRect(left, top + CH * 0.12, CW, CH * 0.06);
    g.fillStyle(0xffffff, onCooldown ? 0.04 : 0.10);
    g.fillRoundedRect(left + 6 * S, top + 5 * S, CW - 12 * S, CH * 0.15, RAD - 4 * S);
    g.lineStyle(3 * S, onCooldown ? 0x555555 : 0xf5c542, 1);
    g.strokeRoundedRect(left, top, CW, CH, RAD);
    g.lineStyle(1 * S, onCooldown ? 0x333333 : 0xc8901a, 0.5);
    g.strokeRoundedRect(left + 5 * S, top + 5 * S, CW - 10 * S, CH - 10 * S, RAD - 3 * S);
    if (!onCooldown) {
      const cs = 12 * S;
      [[left + 8*S, top + 8*S],[left+CW-8*S, top+8*S],[left+8*S, top+CH-8*S],[left+CW-8*S, top+CH-8*S]].forEach(([x,y]) => {
        g.fillStyle(0xf5c542, 0.6); g.fillCircle(x, y, cs / 2);
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
    g.fillStyle(pct > 0.6 ? 0xff4444 : pct > 0.3 ? 0xff9900 : 0xffdd00, 1);
    g.fillRoundedRect(barX, barY, Math.max(fillW, 4), barH, barH / 2);
  }

  _buildUseButton(card, bx, by, CW, S, D, push) {
    const sc    = this.scene;
    const BTN_W = CW * 0.72;
    const BTN_H = 38 * S;

    const g = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
    const draw = (h) => {
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(bx - BTN_W/2 + 3*S, by - BTN_H/2 + 5*S, BTN_W, BTN_H, BTN_H/2);
      g.fillGradientStyle(
        h ? 0xffcc00 : 0xff9900, h ? 0xffcc00 : 0xff9900,
        h ? 0xff7700 : 0xcc5500, h ? 0xff7700 : 0xcc5500, 1
      );
      g.fillRoundedRect(bx - BTN_W/2, by - BTN_H/2, BTN_W, BTN_H, BTN_H/2);
      g.fillStyle(0xffffff, h ? 0.35 : 0.20);
      g.fillRoundedRect(bx - BTN_W/2 + 6*S, by - BTN_H/2 + 4*S, BTN_W - 12*S, BTN_H*0.38, BTN_H/2 - 3*S);
      g.lineStyle(2*S, 0xffffff, 0.8);
      g.strokeRoundedRect(bx - BTN_W/2, by - BTN_H/2, BTN_W, BTN_H, BTN_H/2);
    };
    draw(false);
    sc.tweens.add({ targets: g, alpha: 1, duration: 280, delay: 200 });

    const txt = push(sc.add.text(bx, by, "✨  DÙNG THẺ", {
      fontFamily: "Signika", fontSize: Math.floor(17 * S) + "px",
      color: "#ffffff", fontStyle: "bold", stroke: "#663300", strokeThickness: 3
    }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
    sc.tweens.add({ targets: txt, alpha: 1, duration: 280, delay: 200 });

    const zone = push(sc.add.zone(bx, by, BTN_W + 10*S, BTN_H + 10*S)
      .setInteractive({ useHandCursor: true }).setDepth(D + 10));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      sc.tweens.add({ targets: [g, txt], scaleX: 0.92, scaleY: 0.92, duration: 60, yoyo: true,
        onComplete: () => this._useCard(card) });
    });
  }

  _buildCloseBtn(bx, by, S, D, push) {
    const sc  = this.scene;
    const BW  = 180 * S, BH = 46 * S, BR = BH / 2;

    const g = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
    const draw = (h) => {
      g.clear();
      // Bóng
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(bx - BW/2 + 3*S, by - BH/2 + 5*S, BW, BH, BR);
      // Gradient đỏ
      g.fillGradientStyle(
        h ? 0xff4444 : 0xdd2222, h ? 0xff4444 : 0xdd2222,
        h ? 0xbb1111 : 0x991111, h ? 0xbb1111 : 0x991111, 1
      );
      g.fillRoundedRect(bx - BW/2, by - BH/2, BW, BH, BR);
      // Gloss
      g.fillStyle(0xffffff, h ? 0.35 : 0.22);
      g.fillRoundedRect(bx - BW/2 + 6*S, by - BH/2 + 4*S, BW - 12*S, BH * 0.38, BR - 3*S);
      // Viền
      g.lineStyle(2*S, 0xffffff, 0.7);
      g.strokeRoundedRect(bx - BW/2, by - BH/2, BW, BH, BR);
    };
    draw(false);
    sc.tweens.add({ targets: g, alpha: 1, duration: 280, delay: 300 });

    const txt = push(sc.add.text(bx, by, "Đóng", {
      fontFamily: "Signika", fontSize: Math.floor(18 * S) + "px",
      color: "#ffffff", fontStyle: "bold",
      stroke: "#660000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
    sc.tweens.add({ targets: txt, alpha: 1, duration: 280, delay: 300 });

    const zone = push(sc.add.zone(bx, by, BW + 10*S, BH + 10*S)
      .setInteractive({ useHandCursor: true }).setDepth(D + 10));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      sc.tweens.add({ targets: g, alpha: 0.6, duration: 60, yoyo: true,
        onComplete: () => this.close() });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  USE CARD — dispatcher
  // ─────────────────────────────────────────────────────────────────────────

  _useCard(card) {
    const sc         = this.scene;
    const effectType = card.effect_type;

    // Phát âm thanh dùng thẻ — chỉ cho người dùng
    playBoardTarotSound(sc);

    // ── Validation client-side trước khi gửi ──────────────────────────────
    if (!sc._canUseTarotNow()) {
      sc._showToast("⚠️ Không thể dùng thẻ lúc này", "#ff9999", 1800);
      this.close();
      return;
    }

    switch (effectType) {

      // Công An — chọn đối thủ mục tiêu
      case 'skip_turn_enemy':
        this._enterEnemyPlayerTargeting(card);
        return;

      // Giải Tỏa — chọn tinh cầu đối thủ để phá
      case 'destroy_enemy_house':
        this._enterDestroyTargeting(card);
        return;

      // Hoán Đổi — 2 bước: chọn tinh cầu đối thủ rồi tinh cầu mình
      case 'swap_planet':
        this._enterSwapTargeting(card);
        return;

      // Các thẻ không cần target: gửi thẳng
      // extra_roll | steal_cash_percent | move_forward_range |
      // tax_multiplier | recover_house_money
      default:
        this._sendTarotSimple(card);
        return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  GỬII ĐƠN GIẢN (không cần targeting)
  // ─────────────────────────────────────────────────────────────────────────

  _sendTarotSimple(card) {
    const sc = this.scene;
    sc.socket.emit('game:use_tarot', {
      room_id:  sc.gameRoomId,
      tarot_id: card.id
    });
    this._flashEffect(() => this.close());
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TARGETING: CÔNG AN — chọn người chơi đối thủ
  // ─────────────────────────────────────────────────────────────────────────

  _enterEnemyPlayerTargeting(card) {
    const sc    = this.scene;
    const myUid = sc._myUserId();
    this.close(); // đóng modal

    const enemies = (sc.gamePlayers || []).filter(p => Number(p.user_id) !== Number(myUid));
    if (!enemies.length) {
      sc._showToast("Không có đối thủ để chỉ định!", "#ff8888");
      return;
    }

    // Nếu chỉ có 1 đối thủ (1vs1) → gửi thẳng không cần chọn
    if (enemies.length === 1) {
      sc.socket.emit('game:use_tarot', {
        room_id:        sc.gameRoomId,
        tarot_id:       card.id,
        target_user_id: enemies[0].user_id
      });
      this._flashEffect(() => {});
      return;
    }

    // Team 2v2: hiển thị panel chọn người chơi
    this._showPlayerSelectPanel(card, enemies, (chosenUid) => {
      sc.socket.emit('game:use_tarot', {
        room_id:        sc.gameRoomId,
        tarot_id:       card.id,
        target_user_id: chosenUid
      });
      this._flashEffect(() => {});
    });
  }

  _showPlayerSelectPanel(card, enemies, onChoose) {
    const sc           = this.scene;
    const { width, height } = sc.scale;
    const S            = sc.minRatio || 1;
    const D            = 650;
    const panelObjs    = [];
    const pushP        = o => { panelObjs.push(o); this._objs.push(o); return o; };

    // Backdrop
    const bd = pushP(sc.add.rectangle(width/2, height/2, width, height, 0x000000, 0.6).setDepth(D).setInteractive());
    bd.on("pointerdown", () => { panelObjs.forEach(o => o?.destroy?.()); });

    pushP(sc.add.text(width/2, height/2 - 80*S, "Chọn đối thủ:", {
      fontFamily: "Signika", fontSize: Math.floor(24*S) + "px", color: "#ffe28a", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D+1));

    enemies.forEach((enemy, i) => {
      const bx  = width/2;
      const by  = height/2 - 20*S + i * 60*S;
      const BW  = 280*S, BH = 48*S;
      const bg  = pushP(sc.add.graphics().setDepth(D+1));

      const draw = (h) => {
        bg.clear();
        bg.fillStyle(h ? 0x7744aa : 0x441177, 1);
        bg.fillRoundedRect(bx-BW/2, by-BH/2, BW, BH, BH/2);
        bg.lineStyle(2*S, 0xff88ff, 1);
        bg.strokeRoundedRect(bx-BW/2, by-BH/2, BW, BH, BH/2);
      };
      draw(false);

      pushP(sc.add.text(bx, by, `👤 ${enemy.name}`, {
        fontFamily: "Signika", fontSize: Math.floor(18*S) + "px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D+2));

      const zone = pushP(sc.add.zone(bx, by, BW, BH).setInteractive({ useHandCursor: true }).setDepth(D+5));
      zone.on("pointerover",  () => draw(true));
      zone.on("pointerout",   () => draw(false));
      zone.on("pointerdown",  () => {
        panelObjs.forEach(o => { try { o?.destroy?.(); } catch {} });
        onChoose(enemy.user_id);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TARGETING: GIẢI TỎA — chọn tinh cầu đối thủ để phá
  // ─────────────────────────────────────────────────────────────────────────

  _enterDestroyTargeting(card) {
    const sc    = this.scene;
    const myUid = sc._myUserId();
    this.close();

    sc._startDarkMapEffect?.();

    const enemyCells = [];
    // Dùng overlay riêng — KHÔNG gọi paintCellGlowAnimated để không đổi màu gốc
    this._highlightObjs = this._highlightObjs || [];
    Object.entries(sc.cellStates || {}).forEach(([idx, cell]) => {
      if (Number(cell.owner_user_id) !== Number(myUid)) {
        enemyCells.push(Number(idx));
        const cellObj = sc.boardPath?.[Number(idx)];
        if (cellObj) {
          const x = cellObj.x * sc.scale.width;
          const y = cellObj.y * sc.scale.height;
          const S = sc.minRatio || 1;
          const ring = sc.add.graphics().setDepth(500);
          ring.lineStyle(3 * S, 0xff2200, 1);
          ring.strokeCircle(x, y, 28 * S);
          ring.fillStyle(0xff2200, 0.25);
          ring.fillCircle(x, y, 28 * S);
          this._highlightObjs.push(ring);
          // Pulse
          sc.tweens.add({ targets: ring, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
        }
      }
    });

    if (!enemyCells.length) {
      sc._showToast("Không có tinh cầu đối thủ để phá hủy!", "#ff8888");
      sc._stopDarkMapEffect?.();
      return;
    }

    sc._showToast("Chọn tinh cầu đối thủ để phá hủy", "#ff4444", 0);

    this._targetingListener = (pointer) => {
      const hitCell = this._getCellAtPointer(pointer);
      if (!hitCell || !enemyCells.includes(hitCell.index)) return;

      // Clean up highlights
      sc.input.off("pointerdown", this._targetingListener);
      this._targetingListener = null;
      this._clearHighlightObjs();
      sc._stopDarkMapEffect?.();
      sc._clearToasts?.();

      // Gửi server
      sc.socket.emit('game:use_tarot', {
        room_id:           sc.gameRoomId,
        tarot_id:          card.id,
        target_cell_index: hitCell.index
      });

      // Hiệu ứng phá hủy ở client
      this._playDestroyEffect(hitCell);
    };

    sc.input.on("pointerdown", this._targetingListener);
  }

  _playDestroyEffect(cell) {
    const sc   = this.scene;
    const x    = cell.x * sc.scale.width;
    const y    = cell.y * sc.scale.height;
    const S    = sc.minRatio || 1;

    // Rung ô
    sc.tweens.add({
      targets: { x: 0 }, x: 1, duration: 40, repeat: 5, yoyo: true,
      onUpdate: (tween) => {
        const ox = Math.sin(tween.totalProgress * Math.PI * 8) * 8 * S;
        // rung visual nếu cell có sprite
        if (cell.sprite) { cell.sprite.x = x + ox; }
      }
    });

    // Flash đỏ
    const flash = sc.add.circle(x, y, 60 * S, 0xff2200, 0.7).setDepth(800);
    sc.tweens.add({ targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 400,
      onComplete: () => flash.destroy() });

    // Particle-like stars
    for (let i = 0; i < 8; i++) {
      const angle  = (i / 8) * Math.PI * 2;
      const dist   = 70 * S;
      const star   = sc.add.text(x, y, "💥", { fontSize: Math.floor(20 * S) + "px" })
        .setOrigin(0.5).setDepth(801);
      sc.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: 500, ease: 'Quad.easeOut',
        onComplete: () => star.destroy()
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TARGETING: HOÁN ĐỔI — 2 bước
  // ─────────────────────────────────────────────────────────────────────────

  _enterSwapTargeting(card) {
    const sc    = this.scene;
    const myUid = sc._myUserId();
    this.close();

    this._targetingMode = 'swap_step1';
    this._swapCard      = card;

    sc._startDarkMapEffect?.();

    // Step 1: highlight tinh cầu đối thủ bằng overlay ring — không đổi màu gốc
    this._enemyCells = [];
    this._highlightObjs = this._highlightObjs || [];
    Object.entries(sc.cellStates || {}).forEach(([idx, cell]) => {
      if (Number(cell.owner_user_id) !== Number(myUid)) {
        this._enemyCells.push(Number(idx));
        const cellObj = sc.boardPath?.[Number(idx)];
        if (cellObj) {
          const x = cellObj.x * sc.scale.width;
          const y = cellObj.y * sc.scale.height;
          const S = sc.minRatio || 1;
          const ring = sc.add.graphics().setDepth(500);
          ring.lineStyle(3 * S, 0xffaa00, 1);
          ring.strokeCircle(x, y, 28 * S);
          ring.fillStyle(0xffaa00, 0.22);
          ring.fillCircle(x, y, 28 * S);
          this._highlightObjs.push(ring);
          sc.tweens.add({ targets: ring, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
        }
      }
    });

    if (!this._enemyCells.length) {
      sc._showToast("Không có tinh cầu đối thủ!", "#ff8888");
      sc._stopDarkMapEffect?.();
      return;
    }

    sc._showToast("Bước 1/2 — Chọn tinh cầu của đối thủ", "#ffaa00", 0);

    this._targetingListener = (pointer) => {
      const hitCell = this._getCellAtPointer(pointer);
      if (!hitCell || !this._enemyCells.includes(hitCell.index)) return;

      this._selectedEnemyCell = hitCell.index;
      this._targetingMode     = 'swap_step2';

      // Chuyển sang step 2: highlight tinh cầu của mình
      sc.input.off("pointerdown", this._targetingListener);
      this._clearHighlightObjs();
      sc._stopDarkMapEffect?.();
      sc._clearToasts?.();
      sc._startDarkMapEffect?.();

      const myCells = [];
      this._highlightObjs = [];
      Object.entries(sc.cellStates || {}).forEach(([idx, cell]) => {
        if (Number(cell.owner_user_id) === Number(myUid)) {
          myCells.push(Number(idx));
          const cellObj = sc.boardPath?.[Number(idx)];
          if (cellObj) {
            const x = cellObj.x * sc.scale.width;
            const y = cellObj.y * sc.scale.height;
            const S = sc.minRatio || 1;
            const ring = sc.add.graphics().setDepth(500);
            ring.lineStyle(3 * S, 0x44ff88, 1);
            ring.strokeCircle(x, y, 28 * S);
            ring.fillStyle(0x44ff88, 0.22);
            ring.fillCircle(x, y, 28 * S);
            this._highlightObjs.push(ring);
            sc.tweens.add({ targets: ring, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
          }
        }
      });

      if (!myCells.length) {
        sc._showToast("Bạn không có tinh cầu để hoán đổi!", "#ff8888");
        sc._stopDarkMapEffect?.();
        return;
      }

      sc._showToast("Bước 2/2 — Chọn tinh cầu của bạn", "#44ff88", 0);

      this._secondaryListener = (pointer2) => {
        const hitCell2 = this._getCellAtPointer(pointer2);
        if (!hitCell2 || !myCells.includes(hitCell2.index)) return;

        // Clean up
        sc.input.off("pointerdown", this._secondaryListener);
        this._secondaryListener = null;
        this._clearHighlightObjs();
        sc._stopDarkMapEffect?.();
        sc._clearToasts?.();

        // Gửi server
        sc.socket.emit('game:use_tarot', {
          room_id:           sc.gameRoomId,
          tarot_id:          card.id,
          target_cell_index: this._selectedEnemyCell,   // ô đối thủ
          my_cell_index:     hitCell2.index              // ô của mình
        });

        // Animation hoán đổi
        this._playSwapAnimation(
          sc.boardPath[this._selectedEnemyCell],
          hitCell2,
          () => {}
        );
      };

      sc.input.on("pointerdown", this._secondaryListener);
    };

    sc.input.on("pointerdown", this._targetingListener);
  }

  _playSwapAnimation(cellA, cellB, onDone) {
    const sc = this.scene;
    const ax = cellA.x * sc.scale.width,  ay = cellA.y * sc.scale.height;
    const bx = cellB.x * sc.scale.width,  by = cellB.y * sc.scale.height;
    const S  = sc.minRatio || 1;

    // Dùng icon trung tính thay vì màu cứng
    const iconA = sc.add.text(ax, ay, "⭐", { fontSize: Math.floor(28 * S) + "px" }).setOrigin(0.5).setDepth(900);
    const iconB = sc.add.text(bx, by, "⭐", { fontSize: Math.floor(28 * S) + "px" }).setOrigin(0.5).setDepth(900);

    sc.tweens.add({ targets: iconA, x: bx, y: by, duration: 600, ease: 'Quad.easeInOut' });
    sc.tweens.add({
      targets: iconB, x: ax, y: ay, duration: 600, ease: 'Quad.easeInOut',
      onComplete: () => {
        iconA.destroy(); iconB.destroy();
        if (onDone) onDone();
      }
    });

    [{ x: ax, y: ay }, { x: bx, y: by }].forEach(pos => {
      const fl = sc.add.circle(pos.x, pos.y, 50 * S, 0xffffff, 0.5).setDepth(899);
      sc.tweens.add({ targets: fl, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 500,
        onComplete: () => fl.destroy() });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  HIT TEST — tìm cell tại pointer
  // ─────────────────────────────────────────────────────────────────────────

  _getCellAtPointer(pointer) {
    const sc      = this.scene;
    const radius  = 50 * (sc.minRatio || 1);
    for (const cell of (sc.boardPath || [])) {
      const cx = cell.x * sc.scale.width;
      const cy = cell.y * sc.scale.height;
      if (Math.hypot(pointer.x - cx, pointer.y - cy) < radius) return cell;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CLEANUP
  // ─────────────────────────────────────────────────────────────────────────

  _cleanupTargetingListeners() {
    const sc = this.scene;
    if (this._targetingListener) {
      sc.input.off("pointerdown", this._targetingListener);
      this._targetingListener = null;
    }
    if (this._secondaryListener) {
      sc.input.off("pointerdown", this._secondaryListener);
      this._secondaryListener = null;
    }
    this._clearHighlightObjs();
    sc._stopDarkMapEffect?.();
    sc._clearToasts?.();
    this._targetingMode     = null;
    this._selectedEnemyCell = null;
    this._swapCard          = null;
    this._enemyCells        = [];
  }

  _clearHighlightObjs() {
    (this._highlightObjs || []).forEach(o => { try { o?.destroy?.(); } catch {} });
    this._highlightObjs = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  FLASH EFFECT
  // ─────────────────────────────────────────────────────────────────────────

  _flashEffect(onDone) {
    const sc              = this.scene;
    const { width, height } = sc.scale;
    const flash = sc.add.rectangle(width/2, height/2, width, height, 0xffdd88, 0).setDepth(900);
    sc.tweens.add({ targets: flash, alpha: 0.4, duration: 80, yoyo: true,
      onComplete: () => { flash.destroy(); if (onDone) onDone(); }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  LIVE COOLDOWN TICKER
  // ─────────────────────────────────────────────────────────────────────────

  _startLiveCooldownTicker(cards, myUid) {
    // Cooldown theo rolls — không cần ticker giây
    // Chỉ update 1 lần khi mở modal
    this._updateCooldownDisplays(cards, myUid);
  }

  _updateCooldownDisplays(cards, myUid) {
    const sc = this.scene;

    (this._cardUIs || []).forEach(({ card, ui }) => {
      const runtime   = sc.tarotStateByUserId?.[myUid]?.tarot_runtime?.[card.id] || {};
      const rollsLeft = Math.max(0, Number(runtime.cooldown_turns_left ?? 0));
      const maxCd     = Number(card.cooldown_turns ?? card.cooldown_seconds ?? 1);
      const pct       = rollsLeft > 0 ? rollsLeft / maxCd : 0;

      if (ui.cdText) {
        ui.cdText.setText(rollsLeft > 0
          ? `⏳ Còn ${rollsLeft} lần đổ`
          : `⚡ CD: ${Number(card.cooldown_turns ?? card.cooldown_seconds ?? 0)} lần`);
        ui.cdText.setColor(rollsLeft > 0 ? "#ff9966" : "#ffe28a");
      }
      if (ui.barFill) this._drawCdBar(ui.barFill, ui.barX, ui.barY, ui.barW, ui.barH, pct, rollsLeft > 0);
      if (ui.bigCD)   ui.bigCD.setText(rollsLeft > 0 ? `${rollsLeft}` : '');
    });
  }
}