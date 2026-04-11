// ═══════════════════════════════════════════════════════════════════════
//  CardPanelWidget.js — Panel thẻ bài nhỏ (quick-use + preview)
//
//  Layout:
//    [ Thẻ lớn preview ] [ Thẻ nhỏ 1 ] [ Thẻ nhỏ 2 ]
//
//  Cooldown overlay:
//    - Nền đen mờ (alpha 0.6) phủ toàn thẻ
//    - Số lượt còn lại căn giữa, rõ ràng
//    - Không làm méo ảnh (giữ aspect ratio)
//
//  Tích hợp:
//    this.cardPanel = new CardPanelWidget(scene, cardSystem, tarotModal);
//    this.cardPanel.create(minRatio);
//    this.cardPanel.refresh();   // gọi khi cooldown thay đổi
//    this.cardPanel.show() / hide()
// ═══════════════════════════════════════════════════════════════════════

export default class CardPanelWidget {
  constructor(scene, cardSystem, tarotModal) {
    this.scene      = scene;
    this.cardSystem = cardSystem;
    this.modal      = tarotModal;
    this._objs      = [];
    this._slots     = [];   // [{ card, bg, img, overlay, cdText, zone }]
    this._visible   = false;
    this._S         = 1;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────

  create(minRatio) {
    this._S = minRatio;
    this._build();
    this.hide();
  }

  show() {
    this._visible = true;
    this._objs.forEach(o => o?.setVisible?.(true));
    this.refresh();
  }

  hide() {
    this._visible = false;
    this._objs.forEach(o => o?.setVisible?.(false));
  }

  /**
   * Rebuild panel với cards mới (gọi khi nhận game:state_sync)
   */
  setCards(cards = []) {
    this._cards = cards.slice(0, 2);
    this._rebuildSlots();
    if (this._visible) this.refresh();
  }

  /**
   * Cập nhật cooldown overlay (gọi mỗi khi cooldown thay đổi)
   */
  refresh() {
    const sc    = this.scene;
    const myUid = sc._myUserId?.();
    if (!myUid || !this._cards?.length) return;

    this._slots.forEach((slot, i) => {
      const card = this._cards[i];
      if (!card || !slot) return;

      const turnsLeft  = this.cardSystem.getCooldown(myUid, card.id);
      const onCooldown = turnsLeft > 0;
      const usedTurn   = !!sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn;

      // Overlay
      if (slot.overlay) slot.overlay.setVisible(onCooldown || usedTurn);
      if (slot.cdText) {
        if (onCooldown) {
          slot.cdText.setText(`${turnsLeft}`).setVisible(true);
        } else if (usedTurn) {
          slot.cdText.setText('✓').setVisible(true);
        } else {
          slot.cdText.setVisible(false);
        }
      }

      // Tint ảnh
      if (slot.img) slot.img.setTint(onCooldown || usedTurn ? 0x555555 : 0xffffff);

      // Zone interactive
      if (slot.zone) slot.zone.setInteractive(!(onCooldown || usedTurn));
    });

    // Preview thẻ lớn
    this._refreshPreview();
  }

  destroy() {
    this._objs.forEach(o => { try { o?.destroy?.(); } catch {} });
    this._objs  = [];
    this._slots = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  //  BUILD
  // ─────────────────────────────────────────────────────────────────────

  _build() {
    const sc = this.scene;
    const { width, height } = sc.scale;
    const S  = this._S;
    const D  = 200;

    // Panel nằm góc dưới phải, trên bottom bar
    const panelW = 320 * S;
    const panelH = 110 * S;
    const panelX = width - panelW / 2 - 16 * S;
    const panelY = height - panelH / 2 - 140 * S;

    this._panelX = panelX;
    this._panelY = panelY;
    this._panelW = panelW;
    this._panelH = panelH;
    this._D      = D;

    // Nền panel
    const bg = sc.add.graphics().setDepth(D);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14 * S);
    bg.lineStyle(1.5, 0x4488cc, 0.6);
    bg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14 * S);
    this._objs.push(bg);

    // Label "THẺ BÀI"
    const lbl = sc.add.text(panelX - panelW / 2 + 10 * S, panelY - panelH / 2 + 6 * S, '🃏 THẺ BÀI', {
      fontFamily: 'Signika', fontSize: Math.floor(11 * S) + 'px',
      color: '#aaccff', fontStyle: 'bold'
    }).setDepth(D + 1);
    this._objs.push(lbl);

    // Preview thẻ lớn (bên trái)
    this._previewX = panelX - panelW / 2 + 52 * S;
    this._previewY = panelY;
    this._buildPreviewArea(S, D);

    // 2 slot thẻ nhỏ (bên phải)
    const slotSize = 80 * S;
    const slotGap  = 12 * S;
    const slot1X   = panelX - panelW / 2 + 120 * S + slotSize / 2;
    const slot2X   = slot1X + slotSize + slotGap;

    this._slotPositions = [
      { x: slot1X, y: panelY },
      { x: slot2X, y: panelY },
    ];
    this._slotSize = slotSize;
  }

  _buildPreviewArea(S, D) {
    const sc = this.scene;
    const pw = 90 * S, ph = 90 * S;
    const px = this._previewX, py = this._previewY;

    // Khung preview
    const frame = sc.add.graphics().setDepth(D + 1);
    frame.lineStyle(1.5, 0x6699cc, 0.5);
    frame.strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 8 * S);
    this._objs.push(frame);

    // Placeholder text
    this._previewPlaceholder = sc.add.text(px, py, '?', {
      fontFamily: 'Signika', fontSize: Math.floor(28 * S) + 'px',
      color: '#334466'
    }).setOrigin(0.5).setDepth(D + 2);
    this._objs.push(this._previewPlaceholder);

    this._previewImg  = null;
    this._previewName = sc.add.text(px, py + ph / 2 + 4 * S, '', {
      fontFamily: 'Signika', fontSize: Math.floor(10 * S) + 'px',
      color: '#aaddff', align: 'center', wordWrap: { width: pw }
    }).setOrigin(0.5, 0).setDepth(D + 2);
    this._objs.push(this._previewName);

    this._previewPW = pw;
    this._previewPH = ph;
  }

  _rebuildSlots() {
    // Xóa slot cũ
    this._slots.forEach(slot => {
      if (!slot) return;
      ['bg', 'img', 'overlay', 'cdText', 'zone', 'nameTxt'].forEach(k => {
        try { slot[k]?.destroy?.(); } catch {}
      });
    });
    this._slots = [];

    const sc   = this.scene;
    const S    = this._S;
    const D    = this._D;
    const size = this._slotSize;

    (this._cards || []).forEach((card, i) => {
      const pos  = this._slotPositions[i];
      if (!pos) return;
      const { x, y } = pos;
      const slot = {};

      // Nền slot
      slot.bg = sc.add.graphics().setDepth(D + 1);
      slot.bg.fillStyle(0x0a1a33, 0.9);
      slot.bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
      slot.bg.lineStyle(1.5, 0x3366aa, 0.7);
      slot.bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
      this._objs.push(slot.bg);

      // Ảnh thẻ (giữ aspect ratio)
      const imgKey = `tarot_${card.id}`;
      if (sc.textures.exists(imgKey)) {
        slot.img = sc.add.image(x, y - 8 * S, imgKey).setDepth(D + 2);
        const tex = sc.textures.get(imgKey).getSourceImage();
        const scale = Math.min((size - 12 * S) / tex.width, (size - 24 * S) / tex.height);
        slot.img.setScale(scale);
        this._objs.push(slot.img);
      }

      // Tên thẻ nhỏ
      slot.nameTxt = sc.add.text(x, y + size / 2 - 10 * S, card.name || '', {
        fontFamily: 'Signika', fontSize: Math.floor(9 * S) + 'px',
        color: '#cce8ff', align: 'center', wordWrap: { width: size - 4 * S }
      }).setOrigin(0.5, 1).setDepth(D + 3);
      this._objs.push(slot.nameTxt);

      // Overlay cooldown (nền đen mờ, phủ toàn slot)
      slot.overlay = sc.add.graphics().setDepth(D + 4);
      slot.overlay.fillStyle(0x000000, 0.62);
      slot.overlay.fillRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
      slot.overlay.setVisible(false);
      this._objs.push(slot.overlay);

      // Số cooldown căn giữa
      slot.cdText = sc.add.text(x, y, '', {
        fontFamily: 'Signika', fontSize: Math.floor(28 * S) + 'px',
        color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4
      }).setOrigin(0.5).setDepth(D + 5).setVisible(false);
      this._objs.push(slot.cdText);

      // Zone click
      slot.zone = sc.add.zone(x, y, size, size)
        .setInteractive({ useHandCursor: true })
        .setDepth(D + 6);

      slot.zone.on('pointerover', () => {
        if (!slot.bg) return;
        slot.bg.clear();
        slot.bg.fillStyle(0x1a3a6e, 0.95);
        slot.bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
        slot.bg.lineStyle(2, 0x55aaff, 1);
        slot.bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
        this._setPreviewCard(card);
      });

      slot.zone.on('pointerout', () => {
        if (!slot.bg) return;
        slot.bg.clear();
        slot.bg.fillStyle(0x0a1a33, 0.9);
        slot.bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
        slot.bg.lineStyle(1.5, 0x3366aa, 0.7);
        slot.bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 8 * S);
      });

      slot.zone.on('pointerdown', () => {
        const myUid = sc._myUserId?.();
        const onCd  = this.cardSystem.isOnCooldown(myUid, card.id);
        const used  = !!sc.tarotStateByUserId?.[myUid]?.used_tarot_this_turn;
        if (onCd || used) return;

        // Mở modal với focus vào thẻ này
        this.modal?.open?.(card.id);
      });

      this._objs.push(slot.zone);
      this._slots.push(slot);
    });
  }

  _setPreviewCard(card) {
    const sc = this.scene;
    const S  = this._S;
    const D  = this._D;
    const px = this._previewX, py = this._previewY;
    const pw = this._previewPW, ph = this._previewPH;

    // Xóa ảnh preview cũ
    if (this._previewImg) { this._previewImg.destroy(); this._previewImg = null; }

    this._previewPlaceholder?.setVisible(false);
    this._previewName?.setText(card.name || '');

    const imgKey = `tarot_${card.id}`;
    if (sc.textures.exists(imgKey)) {
      this._previewImg = sc.add.image(px, py, imgKey).setDepth(D + 2);
      const tex   = sc.textures.get(imgKey).getSourceImage();
      const scale = Math.min((pw - 8 * S) / tex.width, (ph - 8 * S) / tex.height);
      this._previewImg.setScale(scale);
      this._objs.push(this._previewImg);
    } else {
      this._previewPlaceholder?.setVisible(true);
    }

    // Cooldown overlay trên preview
    const myUid    = sc._myUserId?.();
    const turnsLeft = this.cardSystem.getCooldown(myUid, card.id);
    if (turnsLeft > 0) {
      if (this._previewImg) this._previewImg.setTint(0x555555);
    }
  }

  _refreshPreview() {
    // Hiển thị thẻ đầu tiên không cooldown, hoặc thẻ đầu tiên
    const sc    = this.scene;
    const myUid = sc._myUserId?.();
    if (!this._cards?.length) return;

    const active = this._cards.find(c => !this.cardSystem.isOnCooldown(myUid, c.id))
                || this._cards[0];
    if (active) this._setPreviewCard(active);
  }
}
