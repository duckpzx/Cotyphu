/**
 * PlayerProfilePanel — Panel xem thông tin sơ bộ người chơi trong RoomScene
 *
 * Style: giống FriendPanel (nền vàng kem, overlay tối, nút X nhô góc)
 *
 * Cách dùng:
 *   const panel = new PlayerProfilePanel(scene, { socket, depth: 500 });
 *   panel.open(width, height, player);   // player = { user_id, name, character_name, skin_id }
 *   panel.destroy();
 */
export default class PlayerProfilePanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ socket: any, depth?: number }} opts
   */
  constructor(scene, { socket, depth = 500 }) {
    this.scene  = scene;
    this.socket = socket;
    this.depth  = depth;
    this._objs  = [];
    this._open  = false;
  }

  // ── PUBLIC ──────────────────────────────────────────────────────────

  /**
   * Mở panel với dữ liệu player cơ bản (đã có từ slot),
   * sau đó fetch thêm stats từ server.
   * @param {number} width
   * @param {number} height
   * @param {{ user_id, name, character_name, skin_id }} player
   */
  open(width, height, player, myUserId = null) {
    if (this._open) this.destroy();
    this._open = true;
    this._player = player;

    const W  = 520;
    const H  = 340;
    const CX = width  / 2;
    const CY = height / 2;
    const L  = CX - W / 2;
    const T  = CY - H / 2;
    const R  = 14;
    const D  = this.depth;

    const push = o => { this._objs.push(o); return o; };

    // ── Overlay tối ──────────────────────────────────────────────────
    const overlay = push(this.scene.add.graphics().setDepth(D - 1));
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, width, height);
    const overlayZone = push(
      this.scene.add.zone(width / 2, height / 2, width, height)
        .setInteractive().setDepth(D - 1)
    );
    overlayZone.on("pointerdown", () => this.destroy());

    // ── Bóng đổ ──────────────────────────────────────────────────────
    const shadow = push(this.scene.add.graphics().setDepth(D));
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(L + 7, T + 7, W, H, R);

    // ── Nền vàng kem ─────────────────────────────────────────────────
    const bg = push(this.scene.add.graphics().setDepth(D + 1));
    bg.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xede0b0, 0xede0b0, 1);
    bg.fillRoundedRect(L, T, W, H, R);
    bg.lineStyle(3, 0xffffff, 1);
    bg.strokeRoundedRect(L, T, W, H, R);
    // Gloss
    bg.fillStyle(0xffffff, 0.18);
    bg.fillRoundedRect(L + 6, T + 4, W - 12, 22, 8);
    // Viền đứt nét bên trong
    this._drawInnerDash(bg, L, T, W, H, R);

    // Zone chặn click lan xuống overlay
    push(this.scene.add.zone(L + W / 2, T + H / 2, W, H)
      .setInteractive().setDepth(D + 1));

    // ── Chia 2 nửa với gap ở giữa ────────────────────────────────────
    const GAP_WIDTH = -34;
    const HALF_W = (W - GAP_WIDTH) / 2;
    const HALF_H = H - 76;
    const HALF_T = T + 38;
    const HALF_PAD = 22;  
    const CONTENT_PAD = 10; 
    const BORDER_COLOR = 0xe5c288;
    const BORDER_WIDTH = 1.1;
    const contentT = T + 58;  

    // Nửa trái (avatar)
    // Helper vẽ inset 3D — cạnh trên+trái tối, dưới+phải sáng
    const drawInset = (g, x, y, w, h, r) => {
      // Nền
      g.fillStyle(0xecd49a, 1);
      g.fillRoundedRect(x, y, w, h, r);

      // Viền ngoài định hình
      g.lineStyle(1.5, 0x9a7838, 0.7);
      g.strokeRoundedRect(x, y, w, h, r);

      // Cạnh TRÊN — tối đậm (shadow)
      for (let i = 0; i < 5; i++) {
        const alpha = 0.28 - i * 0.05;
        g.lineStyle(1, 0xfff8d0, alpha);
        g.beginPath();
        g.moveTo(x + r, y + i);
        g.lineTo(x + w - r, y + i);
        g.strokePath();
      }

      // Cạnh TRÁI — nhạt (highlight)
      for (let i = 0; i < 4; i++) {
        const alpha = 0.35 - i * 0.08;
        g.lineStyle(1, 0xfff8d0, alpha);
        g.beginPath();
        g.moveTo(x + i, y + r);
        g.lineTo(x + i, y + h - r);
        g.strokePath();
      }

      // Cạnh DƯỚI — nhạt (highlight)
      for (let i = 0; i < 4; i++) {
        const alpha = 0.3 - i * 0.07;
        g.lineStyle(1, 0xfff8d0, alpha);
        g.beginPath();
        g.moveTo(x + r, y + h - i);
        g.lineTo(x + w - r, y + h - i);
        g.strokePath();
      }

      // Cạnh PHẢI — đậm (shadow)
      for (let i = 0; i < 5; i++) {
        const alpha = 0.28 - i * 0.05;
        g.lineStyle(1, 0xfff8d0, alpha);
        g.beginPath();
        g.moveTo(x + w - i, y + r);
        g.lineTo(x + w - i, y + h - r);
        g.strokePath();
      }
    };

    // Nửa trái (avatar)
    const leftHalf = push(this.scene.add.graphics().setDepth(D + 1.5));
    drawInset(leftHalf, L + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);

    // Nửa phải (stats + tarot)
    const rightHalf = push(this.scene.add.graphics().setDepth(D + 1.5));
    drawInset(rightHalf, L + HALF_W + GAP_WIDTH + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);

    // ── Nút X nhô góc trên phải ──────────────────────────────────────
    const closeX = L + W;
    const closeY = T;
    const closeBtn = push(this.scene.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(44, 44).setDepth(D + 6));
    const closeZone = push(this.scene.add.zone(closeX, closeY, 50, 50)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7));
    closeZone.on("pointerover",  () => closeBtn.setAlpha(0.8));
    closeZone.on("pointerout",   () => closeBtn.setAlpha(1));
    closeZone.on("pointerdown",  () => this.destroy());

    // ── Nửa trái: Avatar + Tên nhân vật + Tên người chơi ──────────────
    const leftCX = L + HALF_PAD + CONTENT_PAD + (HALF_W - HALF_PAD * 2 - CONTENT_PAD * 2) / 2;
    const avatarSize = 120;
    
    const bgWidth = HALF_W - HALF_PAD * 2 - 10;  // Full width - 5px mỗi bên
    const bgHeight = 180;
    const bgTop = T + H - bgHeight - HALF_PAD - 25;  // Gần dưới cách 5px
    
    // Hiển thị hình background full với border-radius (không border)
    this._buildAvatarWithBorder(L + HALF_PAD + 5 + bgWidth / 2, bgTop + bgHeight / 2, bgWidth - 10, bgHeight, player, D + 4);

    // ── Ngôi sao bên trái + 2 text bên phải ────────────────────────────
    const starX = L + HALF_PAD + 30;
    const centerY = contentT + 12;
    const textStartX = starX + 32;
    
    // Ngôi sao (giữ tỷ lệ, không bóp méo)
    push(this.scene.add.image(starX, centerY + 5, "border")
      .setScale(0.5).setDepth(D + 4));

    // Tên người chơi (trên, lớn, gradient trắng-đen, viền đen nhẹ)
    push(this.scene.add.text(textStartX, centerY - 18, player.name || "Player", {
      fontFamily: "Signika", fontSize: "18px",
      fontStyle: "bold", padding: { x: 1, y: 1 },
      stroke: "#5a3200", strokeThickness: 4,
    }).setOrigin(0).setDepth(D + 4)
      .setFill("#ffffff")
      .setTint(0xffffff, 0xffffff, 0xe9e9e9, 0xe9e9e9));

    // Tên nhân vật (dưới, trắng, viền đen nhẹ)
    const charDisplay = (player.character_name || "").replace(/_/g, " ");
    push(this.scene.add.text(textStartX, centerY + 8, charDisplay, {
      fontFamily: "Signika", fontSize: "14px",
      color: "#ffffff", fontStyle: "bold", padding: { x: 1, y: 1 },
      stroke: "#5a3200", strokeThickness: 3,
    }).setOrigin(0).setDepth(D + 4));

    // ── Nửa phải: Stats + Tarot + Nút kết bạn ────────────────────────
    const rightL   = L + HALF_W + GAP_WIDTH + HALF_PAD + CONTENT_PAD;
    const rightCX  = L + HALF_W + GAP_WIDTH + HALF_PAD + (HALF_W - HALF_PAD * 2) / 2;
    const rightW   = HALF_W - HALF_PAD * 2 - CONTENT_PAD * 2;

    // Tính trước vị trí thẻ bài để stats thẳng hàng
    const CARD_GAP   = 4;
    const PAD_SIDE   = 2; // padding đều 2 bên
    const cardW      = Math.floor((rightW - CARD_GAP - PAD_SIDE * 2) / 2);
    const totalCardW = cardW * 2 + CARD_GAP;
    const cardStartX = rightL + PAD_SIDE;

    // Lưu lại để dùng trong _updateStats
    this._rightL      = rightL;
    this._rightW      = rightW;
    this._rightCX     = rightCX;
    this._cardStartX  = cardStartX;
    this._cardW       = cardW;

    // Stats — 2 cột thẳng hàng với 2 thẻ bài
    this._statsTxt = push(this.scene.add.text(cardStartX + 8, contentT, "Đang tải...", {
      fontFamily: "Signika", fontSize: "14px", color: "#5a3200",
    }).setOrigin(0, 0).setDepth(D + 4));
    this._statsTxt2 = push(this.scene.add.text(cardStartX + cardW + CARD_GAP + 8, contentT, "", {
      fontFamily: "Signika", fontSize: "14px", color: "#5a3200",
    }).setOrigin(0, 0).setDepth(D + 4));

    // Tarot anchor — ngay dưới stats 1 dòng
    this._tarotLabel = push(this.scene.add.text(rightL, contentT + 28, "", {
      fontFamily: "Signika", fontSize: "1px",
    }).setDepth(D + 4));
    this._tarotObjs = [];

    // ── Nút Kết Bạn — dưới cùng, căn giữa ───────────────────────────
    const isSelf = myUserId != null && Number(myUserId) === Number(player.user_id);
    if (!isSelf) {
    const btnW = 110, btnH = 34, btnR = 8;
    const btnX = rightCX;
    const btnY = HALF_T + HALF_H - btnH / 2 - 8;

    const btnG = push(this.scene.add.graphics().setDepth(D + 4));
    const drawBtn = (hover) => {
      btnG.clear();
      // Nền gradient xanh cyan
      btnG.fillGradientStyle(
        hover ? 0x22bbff : 0x0099ff,
        hover ? 0x22bbff : 0x0099ff,
        hover ? 0x0055cc : 0x0066cc,
        hover ? 0x0055cc : 0x0066cc, 1
      );
      btnG.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
      // Viền ngoài tối
      btnG.lineStyle(1, 0x006688, 0.3);
      btnG.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
      // Điểm sáng trắng góc trên phải
      btnG.fillStyle(0xffffff, hover ? 0.45 : 0.35);
      btnG.fillCircle(btnX + btnW / 2 - 8, btnY - btnH / 2 + 6, 6);
      // Gloss nửa trên
      btnG.fillStyle(0xffffff, hover ? 0.25 : 0.15);
      btnG.fillRoundedRect(btnX - btnW / 2 + 4, btnY - btnH / 2 + 3, btnW - 8, btnH * 0.42, btnR - 2);
    };
    drawBtn(false);

    push(this.scene.add.text(btnX, btnY, "Kết Bạn", {
      fontFamily: "Signika", fontSize: "15px",
      color: "#ffffff", fontStyle: "bold",
      stroke: "#003355", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 5));

    const btnZone = push(this.scene.add.zone(btnX, btnY, btnW, btnH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 6));
    btnZone.on("pointerover",  () => drawBtn(true));
    btnZone.on("pointerout",   () => drawBtn(false));
    btnZone.on("pointerdown",  () => {
      this.scene.tweens.add({ targets: btnG, alpha: 0.6, duration: 60, yoyo: true });
      this.socket?.emit("friend:request", { to_id: player.user_id });
    });
    } // end if (!isSelf)

    // ── Fetch profile từ server ───────────────────────────────────────
    this._bindProfileResult();
    this.socket?.emit("room:player:profile", { user_id: player.user_id });

    return this;
  }

  destroy() {
    this._unbindProfileResult();
    this._objs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._objs = [];
    this._tarotObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._tarotObjs = [];
    this._open = false;
  }

  // ── PRIVATE ─────────────────────────────────────────────────────────

  _buildAvatar(cx, cy, size, player, depth) {
    const push = o => { this._objs.push(o); return o; };
    const hasChar = player.character_name && player.character_name !== "Unknown" && player.skin_id;

    if (player.active_bg_id) {
      const bgKey = `bg_${player.active_bg_id}`;
      if (this.scene.textures.exists(bgKey)) {
        push(this.scene.add.image(cx, cy, bgKey)
          .setDisplaySize(size + 20, size + 20).setDepth(depth - 1));
      }
    }

    if (hasChar) {
      const frame0Key = `${player.character_name}_${player.skin_id}_idle_000`;
      if (this.scene.textures.exists(frame0Key)) {
        const animKey = `${player.character_name}_${player.skin_id}_idle`;
        const sprite  = push(this.scene.add.sprite(cx, cy, frame0Key)
          .setDisplaySize(size, size).setDepth(depth));
        if (this.scene.anims.exists(animKey)) sprite.play(animKey);
        return;
      }
    }
    // Fallback
    const img = push(this.scene.add.image(cx, cy, "avatar_default")
      .setDisplaySize(size * 0.75, size * 0.75).setAlpha(0.7).setDepth(depth));
    this.scene.tweens.add({
      targets: img, y: cy - 8,
      duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });
  }

  _buildAvatarWithBorder(cx, cy, width, height, player, depth) {
    const push = o => { this._objs.push(o); return o; };
    
    const borderRadius = 12;

    // Tạo mask dùng chung cho cả bg và sprite
    const mask = this.scene.make.graphics({ x: 0, y: 0, add: false });
    mask.fillStyle(0xffffff);
    mask.fillRoundedRect(cx - width / 2, cy - height / 2, width, height, borderRadius);
    const geomMask = mask.createGeometryMask();
    
    // Thêm nền (background) - load từ active_bg_id
    if (player.active_bg_id) {
      const bgKey = `bg_${player.active_bg_id}`;
      if (this.scene.textures.exists(bgKey)) {
        const bgImg = push(this.scene.add.image(cx, cy, bgKey)
          .setOrigin(0.5, 0.5).setDepth(depth));
        
        const texture = this.scene.textures.get(bgKey);
        const imgAspect = texture.source[0].width / texture.source[0].height;
        const frameAspect = width / height;
        
        let displayWidth, displayHeight;
        if (imgAspect > frameAspect) {
          displayHeight = height;
          displayWidth = displayHeight * imgAspect;
        } else {
          displayWidth = width;
          displayHeight = displayWidth / imgAspect;
        }
        
        bgImg.setDisplaySize(displayWidth, displayHeight);
        bgImg.setMask(geomMask);
      }
    }
    
    // Hiển thị nhân vật ở giữa - không bóp méo
    const hasChar = player.character_name && player.character_name !== "Unknown" && player.skin_id;
    if (hasChar) {
      const frame0Key = `${player.character_name}_${player.skin_id}_idle_000`;
      if (this.scene.textures.exists(frame0Key)) {
        const animKey = `${player.character_name}_${player.skin_id}_idle`;
        const charSize = Math.min(width, height) * 0.85;
        const sprite  = push(this.scene.add.sprite(cx, cy, frame0Key)
          .setDisplaySize(charSize, charSize).setDepth(depth + 1));
        if (this.scene.anims.exists(animKey)) sprite.play(animKey);
        return;
      }
    }
  }

  _updateStats(data) {
    if (!this._statsTxt || !this._statsTxt.active) return;

    const wins   = data.total_wins  || 0;
    const total  = data.total_games || 0;
    const rate   = total > 0 ? Math.round((wins / total) * 100) : 0;

    this._statsTxt.setText(`Số trận: ${total}`);
    if (this._statsTxt2?.active) this._statsTxt2.setText(`Thắng: ${wins}`);

    // Tarot cards
    this._tarotObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._tarotObjs = [];

    const cards = (data.tarot_cards || []).slice(0, 2);

    if (cards.length === 0) {
      const noCard = this.scene.add.text(
        this._tarotLabel.x, this._tarotLabel.y + 20,
        "Chưa trang bị thẻ bài", {
          fontFamily: "Signika", fontSize: "12px", color: "#9a7a40"
        }
      ).setDepth(this.depth + 4);
      this._tarotObjs.push(noCard);
      this._objs.push(noCard);
      return;
    }

    const GAP = 4;
    const startY = this._tarotLabel.y + 4;

    // Dùng lại vị trí đã tính từ open() để thẳng hàng với stats
    const availW    = (this._rightW || 180);
    const cardW     = this._cardW || Math.floor((availW - GAP) / 2);
    const cardH     = Math.floor(cardW * 1.4);
    const totalW    = cardW * 2 + GAP;
    const startX    = this._cardStartX || (this._tarotLabel.x + (availW - totalW) / 2);

    const renderCards = () => {
      // Nếu panel đã đóng thì không render
      if (!this._open) return;

      // Clear thẻ cũ trước khi render mới
      this._tarotObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._tarotObjs = [];

      cards.forEach((card, i) => {
        const tarotId = card.tarot_id || card.id;
        const key     = `tarot_${tarotId}`;
        const cx      = startX + i * (cardW + GAP) + cardW / 2;
        const cy      = startY + cardH / 2;

        // Khung card — bỏ viền vàng bên ngoài, chỉ giữ ảnh
        if (this.scene.textures.exists(key)) {
          const tex    = this.scene.textures.get(key);
          const srcW   = tex.source[0].width;
          const srcH   = tex.source[0].height;
          const aspect = srcW / srcH;
          let dw, dh;
          if (aspect > cardW / cardH) {
            dw = cardW; dh = cardW / aspect;
          } else {
            dh = cardH; dw = cardH * aspect;
          }
          const img = this.scene.add.image(cx, cy, key)
            .setDisplaySize(dw, dh)
            .setDepth(this.depth + 5);
          this._tarotObjs.push(img);
        } else {
          const ct = this.scene.add.text(cx, cy, (card.name || `#${tarotId}`), {
            fontFamily: "Signika", fontSize: "10px",
            color: "#ffe0a0", fontStyle: "bold",
            align: "center", wordWrap: { width: cardW - 6 }
          }).setOrigin(0.5).setDepth(this.depth + 5);
          this._tarotObjs.push(ct);
        }

        // Tên thẻ bên dưới
        const nameTxt = this.scene.add.text(cx, cy + cardH / 2 + 4, card.name || `#${tarotId}`, {
          fontFamily: "Signika", fontSize: "10px", color: "#5a3200",
          align: "center", wordWrap: { width: cardW + GAP - 4 }
        }).setOrigin(0.5, 0).setDepth(this.depth + 4);
        this._tarotObjs.push(nameTxt);
      });
    };

    // Load texture nếu chưa có, rồi render
    const toLoad = cards.filter(card => {
      const key = `tarot_${card.tarot_id || card.id}`;
      return !this.scene.textures.exists(key);
    });

    if (toLoad.length === 0) {
      renderCards();
      return;
    }

    let loaded = 0;
    const total2 = toLoad.length;
    const done = () => {
      if (++loaded >= total2) {
        this.scene.load.off("filecomplete", done);
        this.scene.load.off("loaderror",    done);
        renderCards();
      }
    };

    this.scene.load.on("filecomplete", done);
    this.scene.load.on("loaderror",    done);

    toLoad.forEach(card => {
      const tarotId = card.tarot_id || card.id;
      const key     = `tarot_${tarotId}`;
      this.scene.load.image(key, `assets/resources/Tarot/thebai_${tarotId}.png`);
    });
    this.scene.load.start();
  }

  _bindProfileResult() {
    this._onProfileResult = (data) => {
      if (data.user_id !== this._player?.user_id) return;
      if (data.error) { this._statsTxt?.setText(data.error); return; }
      this._updateStats(data);
    };
    this._onFriendSent = (data) => {
      this.scene._showToast?.(`Đã gửi lời mời kết bạn!`);
    };
    this._onFriendError = (data) => {
      this.scene._showToast?.(data.message);
    };
    this.socket?.on("room:player:profile:result", this._onProfileResult);
    this.socket?.on("friend:request:sent",        this._onFriendSent);
    this.socket?.on("friend:request:error",       this._onFriendError);
  }

  _unbindProfileResult() {
    if (this._onProfileResult) {
      this.socket?.off("room:player:profile:result", this._onProfileResult);
      this._onProfileResult = null;
    }
    if (this._onFriendSent)  { this.socket?.off("friend:request:sent",  this._onFriendSent);  this._onFriendSent  = null; }
    if (this._onFriendError) { this.socket?.off("friend:request:error", this._onFriendError); this._onFriendError = null; }
  }

  /** Vẽ viền đứt nét bên trong — giống BagScene.createStyledPanel */
  _drawInnerDash(g, L, T, W, H, R) {
    const ins     = 10;
    const cornerR = R - 4;
    g.lineStyle(1.5, 0xb8922e, 0.5);

    // Đoạn thẳng đứt
    const drawD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += 14) {
        g.beginPath();
        g.moveTo(x1 + Math.cos(ang) * d,                          y1 + Math.sin(ang) * d);
        g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist),      y1 + Math.sin(ang) * Math.min(d + 8, dist));
        g.strokePath();
      }
    };

    // Cung tròn đứt
    const drawArc = (acx, acy, r, startAngle, endAngle) => {
      const arcLength = r * Math.abs(endAngle - startAngle);
      const steps = Math.ceil(arcLength / 14);
      for (let i = 0; i < steps; i++) {
        const a1 = startAngle + (endAngle - startAngle) * (i / steps);
        const a2 = startAngle + (endAngle - startAngle) * Math.min((i + 0.57) / steps, 1);
        g.beginPath();
        g.arc(acx, acy, r, a1, a2);
        g.strokePath();
      }
    };

    // 4 cạnh thẳng
    drawD(L+ins+cornerR,   T+ins,           L+W-ins-cornerR, T+ins);
    drawD(L+W-ins,         T+ins+cornerR,   L+W-ins,         T+H-ins-cornerR);
    drawD(L+W-ins-cornerR, T+H-ins,         L+ins+cornerR,   T+H-ins);
    drawD(L+ins,           T+H-ins-cornerR, L+ins,           T+ins+cornerR);

    // 4 góc bo tròn đứt
    drawArc(L+ins+cornerR,   T+ins+cornerR,   cornerR, Math.PI,     Math.PI*1.5);
    drawArc(L+W-ins-cornerR, T+ins+cornerR,   cornerR, Math.PI*1.5, Math.PI*2);
    drawArc(L+W-ins-cornerR, T+H-ins-cornerR, cornerR, 0,           Math.PI*0.5);
    drawArc(L+ins+cornerR,   T+H-ins-cornerR, cornerR, Math.PI*0.5, Math.PI);
  }
}
