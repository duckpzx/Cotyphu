// ═══════════════════════════════════════════════════════════════════════════
//  TarotModalSystem.js  — v2 (COMPLETE)
//  Hệ thống modal thẻ bài Tarot — hoàn chỉnh với validation + targeting
//
//  Tích hợp: this.tarotModal = new TarotModalSystem(scene)
import { playBoardTarotSound } from "../../utils/clickSound.js";
import { getTarotLevel, tarotLevelKey, ensureTarotLevelTexture } from "../../utils/tarotLevel.js";
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
      const myState = sc.tarotStateByUserId?.[myUid];
      const me2 = (sc.gamePlayers || []).find(p => Number(p.user_id) === Number(myUid));
      const activeIds = sc._normalizeTarotIds(me2?.active_tarot_ids);
      const runtime = myState?.tarot_runtime || {};

      // Tìm thẻ có cooldown thấp nhất để thông báo
      let minCd = Infinity;
      activeIds.forEach(id => {
        const left = Number(runtime[id]?.cooldown_turns_left ?? 0);
        if (left > 0 && left < minCd) minCd = left;
      });

      const reason = !sc.isMyTurn              ? "Chưa đến lượt của bạn"
                   : !sc.canRoll               ? "Không thể dùng thẻ sau khi đã tung xúc xắc"
                   : myState?.used_tarot_this_turn
                                               ? "Đã dùng thẻ trong lượt này"
                   : minCd !== Infinity        ? `Tất cả thẻ đang hồi chiêu — còn ${minCd} lần tung`
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
  }

  close() {
    this._hideCardTooltip();
    this._cleanupTargetingListeners();
    if (this._progressTween) {
      try { this._progressTween.stop(); } catch {}
      this._progressTween = null;
    }
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
  //  BUILD MODAL — Thiết kế gọn gàng chuẩn game:
  //  Banner ngang phát sáng + 2 thẻ bài lớn nổi trực tiếp + Thanh tiến độ xanh + Nút "Để sau" vàng cam
  // ─────────────────────────────────────────────────────────────────────────

  _build(cards, me, activeIds, focusTarotId) {
    const sc          = this.scene;
    const { width, height } = sc.scale;
    const S           = sc.minRatio || 1;
    const D           = 600;
    const push        = o => { this._objs.push(o); return o; };

    this._cardUIs = [];

    // ── Backdrop tối phủ toàn bàn cờ ───────────────────────────────────────
    const backdrop = push(
      sc.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72)
        .setDepth(D).setAlpha(0).setInteractive()
    );
    sc.tweens.add({ targets: backdrop, alpha: 1, duration: 200, ease: "Power2" });
    backdrop.on("pointerdown", () => this.close());

    // ── Bố cục căn giữa màn hình ──────────────────────────────────────────
    const CARD_W   = Math.round(264 * S);
    const CARD_H   = Math.round(384 * S);
    const GAP      = Math.round(36 * S);
    const BANNER_H = Math.round(62 * S);
    const BAR_H    = Math.round(8 * S);
    const BTN_H    = Math.round(50 * S);
    const TOTAL_H  = BANNER_H + 26 * S + CARD_H + 20 * S + BAR_H + 16 * S + BTN_H;

    const blockTop = Math.max(20 * S, height / 2 - TOTAL_H / 2);
    const bannerCY = blockTop + BANNER_H / 2;
    const cardCY   = blockTop + BANNER_H + 26 * S + CARD_H / 2;
    const barCY    = cardCY + CARD_H / 2 + 20 * S + BAR_H / 2;
    const closeBY  = barCY + BAR_H / 2 + 16 * S + BTN_H / 2;

    // ── Banner tiêu đề ngang mờ 2 đầu với đường viền sáng cyan ────────────
    const bannerW = Math.round(640 * S);
    const bannerKey = `tarot_modal_banner_${bannerW}x${BANNER_H}`;
    if (!sc.textures.exists(bannerKey)) {
      const cTex = sc.textures.createCanvas(bannerKey, bannerW, BANNER_H);
      const ctx = cTex.getContext();
      ctx.clearRect(0, 0, bannerW, BANNER_H);

      // Nền tối xanh đen mờ dần 2 đầu
      const bgGrad = ctx.createLinearGradient(0, 0, bannerW, 0);
      bgGrad.addColorStop(0,    "rgba(3, 16, 34, 0)");
      bgGrad.addColorStop(0.18, "rgba(3, 18, 38, 0.82)");
      bgGrad.addColorStop(0.5,  "rgba(5, 24, 52, 0.90)");
      bgGrad.addColorStop(0.82, "rgba(3, 18, 38, 0.82)");
      bgGrad.addColorStop(1,    "rgba(3, 16, 34, 0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, bannerW, BANNER_H);

      // Hai đường kẻ sáng cyan trên & dưới mờ dần 2 đầu
      const lineGrad = ctx.createLinearGradient(0, 0, bannerW, 0);
      lineGrad.addColorStop(0,    "rgba(56, 189, 248, 0)");
      lineGrad.addColorStop(0.22, "rgba(56, 189, 248, 0.72)");
      lineGrad.addColorStop(0.5,  "rgba(186, 230, 253, 0.95)");
      lineGrad.addColorStop(0.78, "rgba(56, 189, 248, 0.72)");
      lineGrad.addColorStop(1,    "rgba(56, 189, 248, 0)");
      ctx.fillStyle = lineGrad;
      ctx.fillRect(0, 0, bannerW, 2);
      ctx.fillRect(0, BANNER_H - 2, bannerW, 2);
      cTex.refresh();
    }

    const bannerImg = push(sc.add.image(width / 2, bannerCY, bannerKey).setDepth(D + 2).setAlpha(0));
    const bannerTxt = push(sc.add.text(width / 2, bannerCY, "Chọn vào thẻ bài để sử dụng", {
      fontFamily: "Signika",
      fontSize: Math.max(17, Math.round(22 * S)) + "px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#021329",
      strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(D + 3).setAlpha(0));
    sc.tweens.add({ targets: [bannerImg, bannerTxt], alpha: 1, duration: 220, delay: 40 });

    // ── 2 Thẻ bài lớn nổi giữa màn hình ──────────────────────────────────
    const totalW = cards.length * CARD_W + (cards.length - 1) * GAP;
    const startX = width / 2 - totalW / 2;

    cards.forEach((card, index) => {
      const cardCX = startX + index * (CARD_W + GAP) + CARD_W / 2;
      const delay  = 70 + index * 70;
      const ui     = this._buildCard(card, cardCX, cardCY, CARD_W, CARD_H, S, D, push, delay, me);
      this._cardUIs.push({ card, ui, cx: cardCX, cy: cardCY });
    });

    // ── Thanh thời gian màu xanh lá mỏng ngay dưới 2 thẻ ──────────────────
    const barW = Math.round(220 * S);
    const barX = width / 2 - barW / 2;
    const barTrack = push(sc.add.graphics().setDepth(D + 3).setAlpha(0));
    barTrack.fillStyle(0x0b1622, 0.85);
    barTrack.fillRoundedRect(barX, barCY - BAR_H / 2, barW, BAR_H, BAR_H / 2);
    barTrack.lineStyle(1, 0x475569, 0.7);
    barTrack.strokeRoundedRect(barX, barCY - BAR_H / 2, barW, BAR_H, BAR_H / 2);

    const barFill = push(sc.add.graphics().setDepth(D + 4).setAlpha(0));
    const drawTimeBar = (ratio) => {
      if (!barFill?.active) return;
      barFill.clear();
      const fw = Math.max(0, (barW - 2) * Phaser.Math.Clamp(ratio, 0, 1));
      if (fw < 2) return;
      barFill.fillGradientStyle(0xa3e635, 0xa3e635, 0x65a30d, 0x65a30d, 1);
      barFill.fillRoundedRect(barX + 1, barCY - BAR_H / 2 + 1, fw, BAR_H - 2, (BAR_H - 2) / 2);
    };
    drawTimeBar(1);
    sc.tweens.add({ targets: [barTrack, barFill], alpha: 1, duration: 240, delay: 160 });

    const timerObj = { ratio: 1 };
    this._progressTween = sc.tweens.add({
      targets: timerObj,
      ratio: 0,
      duration: 15000,
      ease: "Linear",
      onUpdate: () => drawTimeBar(timerObj.ratio),
      onComplete: () => {
        if (this._open && !this._targetingMode) this.close();
      },
    });

    // ── Nút "Để sau" màu vàng cam bóng ────────────────────────────────────
    this._buildCloseBtn(width / 2, closeBY, S, D, push);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BUILD CARD — Thẻ bài full-bleed nổi trực tiếp trên nền tối (không khung đen dày)
  // ─────────────────────────────────────────────────────────────────────────

  _buildCard(card, cx, cy, CW, CH, S, D, push, delay, me) {
    const sc      = this.scene;
    const myUid   = sc._myUserId();
    const runtime = sc.tarotStateByUserId?.[myUid]?.tarot_runtime?.[card.id] || {};
    const remaining    = Math.max(0, Number(runtime.cooldown_turns_left ?? 0));
    const onCooldown   = remaining > 0;
    const usedThisTurn = !!(sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn);

    const left = cx - CW / 2;
    const top  = cy - CH / 2;
    const RAD  = Math.round(14 * S);
    const ui   = {};

    // Bóng đổ mềm phía sau thẻ
    const shadow = push(sc.add.graphics().setDepth(D + 2).setAlpha(0));
    shadow.fillStyle(0x000000, 0.5);
    shadow.fillRoundedRect(left + 4 * S, top + 8 * S, CW, CH, RAD);
    sc.tweens.add({ targets: shadow, alpha: 1, duration: 240, delay, ease: "Power2" });

    // Hào quang vàng dịu khi di chuột vào thẻ sẵn sàng
    const hoverGlow = push(sc.add.graphics().setDepth(D + 3).setAlpha(0));
    hoverGlow.lineStyle(5 * S, 0xfacc15, 0.45);
    hoverGlow.strokeRoundedRect(left - 3 * S, top - 3 * S, CW + 6 * S, CH + 6 * S, RAD + 2 * S);
    hoverGlow.lineStyle(2 * S, 0xfff3b0, 0.95);
    hoverGlow.strokeRoundedRect(left - 1 * S, top - 1 * S, CW + 2 * S, CH + 2 * S, RAD);

    // Cấp thẻ chính xác (ưu tiên dữ liệu từ server, fallback playerData)
    const lv = card.level != null ? (Number(card.level) >= 2 ? 2 : 1) : getTarotLevel(sc, card.id);

    // Ảnh thẻ lớn full-bleed (để thẻ bài tự tỏa sáng đúng thiết kế gốc)
    const lvlKey = tarotLevelKey(card.id, lv, false);
    const fallbackKey = sc.textures.exists(lvlKey)
      ? lvlKey
      : (sc.textures.exists(`tarot_${card.id}`) && sc.textures.get(`tarot_${card.id}`).customData?.tarotLevel === lv
        ? `tarot_${card.id}`
        : null);

    const img = push(sc.add.image(cx, cy + 12 * S, fallbackKey || `tarot_${card.id}`)
      .setDepth(D + 5).setAlpha(0)
      .setTint(onCooldown ? 0x666666 : 0xffffff));

    let imgBaseScale = 1;
    const fitCardImage = (texKey) => {
      if (!img.scene || !sc.textures.exists(texKey)) return;
      img.setTexture(texKey);
      const nat = sc.textures.get(texKey).source[0];
      if (nat?.width && nat?.height) {
        imgBaseScale = Math.min(CW / nat.width, CH / nat.height);
        img.setScale(imgBaseScale);
      }
    };

    const popInCard = () => {
      sc.tweens.add({
        targets: img,
        alpha: 1,
        y: cy,
        duration: 260,
        delay,
        ease: "Back.easeOut",
      });
    };

    if (fallbackKey) {
      fitCardImage(fallbackKey);
      popInCard();
    } else {
      ensureTarotLevelTexture(sc, card.id, lv, false, (loadedKey) => {
        if (!img.scene) return;
        fitCardImage(loadedKey || `tarot_${card.id}`);
        popInCard();
      });
    }
    ui.img = img;

    // Badge cấp LV1 / LV2 gọn đẹp ở góc dưới trái thẻ
    const lvW = Math.round(44 * S), lvH = Math.round(20 * S);
    const lvX = left + 10 * S, lvY = top + CH - lvH - 10 * S;
    const lvBg = push(sc.add.graphics().setDepth(D + 6).setAlpha(0));
    lvBg.fillStyle(lv >= 2 ? 0x7c3aed : 0x0369a1, 0.92);
    lvBg.fillRoundedRect(lvX, lvY, lvW, lvH, 6 * S);
    lvBg.lineStyle(1.4 * S, lv >= 2 ? 0xfde047 : 0x7dd3fc, 0.95);
    lvBg.strokeRoundedRect(lvX, lvY, lvW, lvH, 6 * S);
    const lvTxt = push(sc.add.text(lvX + lvW / 2, lvY + lvH / 2, `LV.${lv}`, {
      fontFamily: "Signika",
      fontSize: Math.max(10, Math.round(11.5 * S)) + "px",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 7).setAlpha(0));
    sc.tweens.add({ targets: [lvBg, lvTxt], alpha: 1, duration: 240, delay: delay + 60 });

    // Zone tương tác: hover phóng nhẹ + tỏa hào quang vàng + hiện mô tả, click dùng ngay
    const canUse = !onCooldown && !usedThisTurn;
    const cardZone = push(sc.add.zone(cx, cy, CW, CH)
      .setInteractive({ useHandCursor: canUse }).setDepth(D + 10));

    cardZone.on("pointerover", () => {
      if (canUse) {
        sc.tweens.add({ targets: hoverGlow, alpha: 1, duration: 120 });
        sc.tweens.add({ targets: img, scaleX: imgBaseScale * 1.045, scaleY: imgBaseScale * 1.045, y: cy - 6 * S, duration: 130, ease: "Sine.easeOut" });
      }
      this._showCardTooltip(card, lv, cx, cy, CW, CH, onCooldown, remaining, S, D);
    });
    cardZone.on("pointerout", () => {
      if (canUse) {
        sc.tweens.add({ targets: hoverGlow, alpha: 0, duration: 120 });
        sc.tweens.add({ targets: img, scaleX: imgBaseScale, scaleY: imgBaseScale, y: cy, duration: 130, ease: "Sine.easeOut" });
      }
      this._hideCardTooltip();
    });
    if (canUse) {
      cardZone.on("pointerdown", () => {
        this._hideCardTooltip();
        sc.tweens.add({
          targets: img,
          scaleX: imgBaseScale * 0.94,
          scaleY: imgBaseScale * 0.94,
          duration: 65,
          yoyo: true,
          onComplete: () => this._useCard(card),
        });
      });
    }

    // Overlay tối + số lượt hồi chiêu lớn nếu thẻ đang cooldown
    if (onCooldown) {
      const overlay = push(sc.add.graphics().setDepth(D + 7).setAlpha(0));
      overlay.fillStyle(0x000000, 0.56);
      overlay.fillRoundedRect(left, top, CW, CH, RAD);
      sc.tweens.add({ targets: overlay, alpha: 1, duration: 240, delay });

      const bigCD = push(sc.add.text(cx, cy - 8 * S, `${remaining}`, {
        fontFamily: "Signika",
        fontSize: Math.floor(62 * S) + "px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(D + 8).setAlpha(0));

      const subCD = push(sc.add.text(cx, cy + 34 * S, `Còn ${remaining} lần tung`, {
        fontFamily: "Signika",
        fontSize: Math.max(12, Math.floor(14 * S)) + "px",
        color: "#fde68a",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(D + 8).setAlpha(0));

      sc.tweens.add({ targets: [bigCD, subCD], alpha: 1, duration: 240, delay });
      ui.bigCD = bigCD;
    }

    return ui;
  }

  _showCardTooltip(card, lv, cx, cy, CW, CH, onCooldown, remaining, S, D) {
    this._hideCardTooltip();
    const sc = this.scene;
    const { width, height } = sc.scale;
    const tw = Math.round(300 * S);
    const padX = Math.round(14 * S);
    const padY = Math.round(10 * S);

    const cdLine = onCooldown
      ? `⏳ Đang hồi chiêu: còn ${remaining} lần đổ`
      : `⚡ Hồi chiêu: ${card.cooldown_turns ?? card.cooldown_seconds ?? 0} lần đổ`;

    const txt = sc.add.text(0, 0,
      `${card.name || `Thẻ ${card.id}`} (LV${lv})\n${card.description || "Không có mô tả"}\n${cdLine}`,
      {
        fontFamily: "Signika",
        fontSize: Math.max(11, Math.floor(13.5 * S)) + "px",
        color: "#f8fafc",
        align: "center",
        wordWrap: { width: tw - padX * 2 },
        lineSpacing: 3,
      }
    ).setOrigin(0.5, 0).setDepth(D + 22);

    const th = Math.ceil(txt.height + padY * 2);
    const tx = Math.max(tw / 2 + 12 * S, Math.min(width - tw / 2 - 12 * S, cx));
    // Ưu tiên hiện phía trên lá bài nếu đủ chỗ, hoặc ngay phía dưới
    let ty = cy - CH / 2 - th / 2 - 10 * S;
    if (ty - th / 2 < 10 * S) ty = Math.min(height - th / 2 - 10 * S, cy + CH / 2 + th / 2 + 10 * S);

    txt.setPosition(tx, ty - th / 2 + padY);

    const g = sc.add.graphics().setDepth(D + 21);
    g.fillStyle(0x0b162c, 0.96);
    g.fillRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12 * S);
    g.lineStyle(2 * S, onCooldown ? 0xfb923c : 0xfacc15, 0.95);
    g.strokeRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12 * S);

    this._cardTooltipObjs = [g, txt];
  }

  _hideCardTooltip() {
    if (!this._cardTooltipObjs) return;
    this._cardTooltipObjs.forEach(o => { try { o?.destroy?.(); } catch {} });
    this._cardTooltipObjs = [];
  }

  _drawCardBg(g, left, top, CW, CH, RAD, onCooldown, S) {
    g.clear();
    g.fillStyle(onCooldown ? 0x1a1a2e : 0x0d1b3e, 0.95);
    g.fillRoundedRect(left, top, CW, CH, RAD);
    g.lineStyle(2.5 * S, onCooldown ? 0x555555 : 0xf5c542, 1);
    g.strokeRoundedRect(left, top, CW, CH, RAD);
    g.lineStyle(1 * S, onCooldown ? 0x333333 : 0xc8901a, 0.45);
    g.strokeRoundedRect(left + 4 * S, top + 4 * S, CW - 8 * S, CH - 8 * S, RAD - 3 * S);
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
    const BW  = Math.round(188 * S);
    const BH  = Math.round(48 * S);
    const BR  = BH / 2;

    const g = push(sc.add.graphics().setDepth(D + 5).setAlpha(0));
    const draw = (h) => {
      g.clear();
      // Hào quang vàng dịu ngoài nút
      g.fillStyle(0xffa000, h ? 0.30 : 0.16);
      g.fillRoundedRect(bx - BW/2 - 4*S, by - BH/2 - 4*S, BW + 8*S, BH + 8*S, BR + 3*S);
      // Bóng đổ
      g.fillStyle(0x000000, 0.32);
      g.fillRoundedRect(bx - BW/2 + 2*S, by - BH/2 + 4*S, BW, BH, BR);
      // Thân nút gradient vàng cam bóng chuẩn mẫu "Để sau"
      g.fillGradientStyle(
        h ? 0xffe066 : 0xffcc33, h ? 0xffe066 : 0xffcc33,
        h ? 0xff8c00 : 0xe67300, h ? 0xff8c00 : 0xe67300, 1
      );
      g.fillRoundedRect(bx - BW/2, by - BH/2, BW, BH, BR);
      // Vệt bóng sáng trắng phía trên
      g.fillStyle(0xffffff, h ? 0.45 : 0.32);
      g.fillRoundedRect(bx - BW/2 + 10*S, by - BH/2 + 4*S, BW - 20*S, BH * 0.38, BR - 4*S);
      // Viền sáng vàng kem
      g.lineStyle(2*S, 0xfff3b0, h ? 1 : 0.85);
      g.strokeRoundedRect(bx - BW/2, by - BH/2, BW, BH, BR);
    };
    draw(false);
    sc.tweens.add({ targets: g, alpha: 1, duration: 240, delay: 180 });

    const txt = push(sc.add.text(bx, by - 1 * S, "Để sau", {
      fontFamily: "Signika",
      fontSize: Math.max(16, Math.round(20 * S)) + "px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#8a3a00",
      strokeThickness: 3.5,
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(90,30,0,0.65)", blur: 3, fill: true },
    }).setOrigin(0.5).setDepth(D + 6).setAlpha(0));
    sc.tweens.add({ targets: txt, alpha: 1, duration: 240, delay: 180 });

    const zone = push(sc.add.zone(bx, by, BW + 10*S, BH + 10*S)
      .setInteractive({ useHandCursor: true }).setDepth(D + 10));
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      sc.tweens.add({ targets: [g, txt], alpha: 0.72, duration: 60, yoyo: true,
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

      // Bảo Vệ — chọn tinh cầu của mình để bọc khiên
      case 'protect_planet_turns':
        this._enterProtectTargeting(card);
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
    const bd = pushP(sc.add.rectangle(width/2, height/2, width, height, 0x000000, 0.72).setDepth(D).setInteractive());
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

  _addTargetingDarkBackdrop() {
    const sc = this.scene;
    const { width, height } = sc.scale;
    this._highlightObjs = this._highlightObjs || [];
    const dim = sc.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.58)
      .setDepth(450).setAlpha(0);
    sc.tweens.add({ targets: dim, alpha: 1, duration: 200, ease: 'Power2' });
    this._highlightObjs.push(dim);
  }

  _enterDestroyTargeting(card) {
    const sc    = this.scene;
    const myUid = sc._myUserId();
    this.close();

    this._addTargetingDarkBackdrop();

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
      this._clearHighlightObjs();
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

    this._addTargetingDarkBackdrop();

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
      this._clearHighlightObjs();
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
      this._addTargetingDarkBackdrop();

      const myCells = [];
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
        this._clearHighlightObjs();
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
  //  TARGETING: BẢO VỆ — chọn tinh cầu của mình để bọc khiên
  // ─────────────────────────────────────────────────────────────────────────

  _enterProtectTargeting(card) {
    const sc    = this.scene;
    const myUid = sc._myUserId();
    this.close();

    this._addTargetingDarkBackdrop();

    const myCells = [];
    Object.entries(sc.cellStates || {}).forEach(([idx, cell]) => {
      if (Number(cell.owner_user_id) === Number(myUid)) {
        myCells.push(Number(idx));
        const cellObj = sc.boardPath?.[Number(idx)];
        if (cellObj) {
          const x = cellObj.x * sc.scale.width;
          const y = cellObj.y * sc.scale.height;
          const S = sc.minRatio || 1;
          const ring = sc.add.graphics().setDepth(500);
          ring.lineStyle(3 * S, 0x33ccff, 1);
          ring.strokeCircle(x, y, 28 * S);
          ring.fillStyle(0x33ccff, 0.25);
          ring.fillCircle(x, y, 28 * S);
          this._highlightObjs.push(ring);
          sc.tweens.add({ targets: ring, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
        }
      }
    });

    if (!myCells.length) {
      this._clearHighlightObjs();
      sc._showToast("Bạn chưa có tinh cầu nào để bảo vệ!", "#ff8888");
      return;
    }

    sc._showToast("🛡 Chọn tinh cầu của bạn để bảo vệ (3 lượt)", "#66ddff", 0);

    this._targetingListener = (pointer) => {
      const hitCell = this._getCellAtPointer(pointer);
      if (!hitCell || !myCells.includes(hitCell.index)) return;

      sc.input.off("pointerdown", this._targetingListener);
      this._targetingListener = null;
      this._clearHighlightObjs();
      sc._clearToasts?.();

      sc.socket.emit('game:use_tarot', {
        room_id:           sc.gameRoomId,
        tarot_id:          card.id,
        target_cell_index: hitCell.index
      });
    };

    sc.input.on("pointerdown", this._targetingListener);
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
    const flash = sc.add.rectangle(width/2, height/2, width, height, 0xffdd88, 0.4).setDepth(900).setAlpha(0);
    sc.tweens.add({ targets: flash, alpha: 1, duration: 80, yoyo: true,
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