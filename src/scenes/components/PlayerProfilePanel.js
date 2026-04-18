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
    const H  = 360;
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
    const HALF_PAD = 24;  
    const CONTENT_PAD = 20; 
    const BORDER_COLOR = 0xefcd95;
    const BORDER_WIDTH = 1.5;
    const contentT = T + 50;  

    // Nửa trái (avatar)
    const leftHalf = push(this.scene.add.graphics().setDepth(D + 1.5));
    leftHalf.fillStyle(0xefcf91, 0.35);
    leftHalf.fillRoundedRect(L + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);
    leftHalf.lineStyle(BORDER_WIDTH, BORDER_COLOR, 1);
    leftHalf.strokeRoundedRect(L + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);

    // Nửa phải (stats + tarot)
    const rightHalf = push(this.scene.add.graphics().setDepth(D + 1.5));
    rightHalf.fillStyle(0xefcf91, 0.35);
    rightHalf.fillRoundedRect(L + HALF_W + GAP_WIDTH + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);
    rightHalf.lineStyle(BORDER_WIDTH, BORDER_COLOR, 1);
    rightHalf.strokeRoundedRect(L + HALF_W + GAP_WIDTH + HALF_PAD, HALF_T, HALF_W - HALF_PAD * 2, HALF_H, 8);

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
    const avatarBg = push(this.scene.add.graphics().setDepth(D + 4));
    avatarBg.fillStyle(0x0a2a55, 0.55);
    avatarBg.fillRoundedRect(leftCX - avatarSize / 2 - 4, contentT - 4, avatarSize + 8, avatarSize + 8, 10);
    avatarBg.lineStyle(2, 0xc8a84b, 0.7);
    avatarBg.strokeRoundedRect(leftCX - avatarSize / 2 - 4, contentT - 4, avatarSize + 8, avatarSize + 8, 10);

    this._buildAvatar(leftCX, contentT + avatarSize / 2, avatarSize, player, D + 5);

    // ── Tên nhân vật dưới avatar ──────────────────────────────────────
    const charDisplay = (player.character_name || "").replace(/_/g, " ");
    push(this.scene.add.text(leftCX, contentT + avatarSize + 14, charDisplay, {
      fontFamily: "Signika", fontSize: "14px",
      color: "#3a1a00", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 4));

    // Skin badge
    push(this.scene.add.text(leftCX, contentT + avatarSize + 32, `Trang phục #${player.skin_id || 1}`, {
      fontFamily: "Signika", fontSize: "12px", color: "#7a5a20",
    }).setOrigin(0.5).setDepth(D + 4));

    // ── Tên người chơi (to, nổi bật) ─────────────────────────────────
    push(this.scene.add.text(leftCX, contentT + avatarSize + 54, player.name || "Player", {
      fontFamily: "Signika", fontSize: "16px",
      color: "#5a3200", fontStyle: "bold",
      stroke: "#ffffff", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 4));

    // ── Nửa phải: Stats + Tarot + Nút kết bạn ────────────────────────
    const rightL = L + HALF_W + GAP_WIDTH + HALF_PAD + CONTENT_PAD;
    const rightCX = L + HALF_W + GAP_WIDTH + HALF_PAD + CONTENT_PAD + (HALF_W - HALF_PAD * 2 - CONTENT_PAD * 2) / 2;

    // Placeholder stats (sẽ update khi server trả về)
    this._statsTxt = push(this.scene.add.text(rightL, contentT, "Đang tải...", {
      fontFamily: "Signika", fontSize: "14px", color: "#5a3200",
      lineSpacing: 8,
    }).setDepth(D + 4));

    // Tarot cards placeholder
    this._tarotLabel = push(this.scene.add.text(rightL, contentT + 70, "Thẻ bài:", {
      fontFamily: "Signika", fontSize: "13px", color: "#7a5a20", fontStyle: "bold",
    }).setDepth(D + 4));
    this._tarotObjs = [];

    // ── Nút Kết Bạn (ẩn nếu đang xem chính mình) ────────────────────
    const isSelf = myUserId != null && Number(myUserId) === Number(player.user_id);
    if (!isSelf) {
    const btnW = 100, btnH = 36, btnR = btnH / 2;
    const btnX = rightCX;
    const btnY = T + H - 28;

    const btnG = push(this.scene.add.graphics().setDepth(D + 4));
    const drawBtn = (hover) => {
      btnG.clear();
      btnG.fillStyle(0x000000, 0.2);
      btnG.fillRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 5, btnW, btnH, btnR);
      btnG.fillGradientStyle(
        hover ? 0x2288ee : 0x1a6abf,
        hover ? 0x2288ee : 0x1a6abf,
        hover ? 0x0055bb : 0x0044aa,
        hover ? 0x0055bb : 0x0044aa, 1
      );
      btnG.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
      btnG.fillStyle(0xffffff, hover ? 0.35 : 0.2);
      btnG.fillRoundedRect(btnX - btnW / 2 + 8, btnY - btnH / 2 + 5, btnW - 16, btnH / 3, btnR - 4);
      btnG.lineStyle(2, 0xffffff, hover ? 0.8 : 0.55);
      btnG.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
    };
    drawBtn(false);

    push(this.scene.add.text(btnX, btnY, "Kết Bạn", {
      fontFamily: "Signika", fontSize: "14px",
      color: "#ffffff", fontStyle: "bold",
      stroke: "#003388", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 5));

    const btnZone = push(this.scene.add.zone(btnX, btnY, btnW, btnH)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 6));
    btnZone.on("pointerover",  () => drawBtn(true));
    btnZone.on("pointerout",   () => drawBtn(false));
    btnZone.on("pointerdown",  () => {
      this.scene.tweens.add({ targets: btnG, alpha: 0.6, duration: 60, yoyo: true });
      this.socket?.emit("friend:request", { to_id: player.user_id });
      // Feedback sẽ đến qua friend:request:sent hoặc friend:request:error
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
    this._tarotObjs = [];
    this._open = false;
  }

  // ── PRIVATE ─────────────────────────────────────────────────────────

  _buildAvatar(cx, cy, size, player, depth) {
    const push = o => { this._objs.push(o); return o; };
    const hasChar = player.character_name && player.character_name !== "Unknown" && player.skin_id;

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

  _updateStats(data) {
    if (!this._statsTxt || !this._statsTxt.active) return;

    const wins   = data.total_wins  || 0;
    const total  = data.total_games || 0;
    const rate   = total > 0 ? Math.round((wins / total) * 100) : 0;

    this._statsTxt.setText(
      `Số trận: ${total}\nThắng:   ${wins}\nTỉ lệ:   ${rate}%`
    );

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

    const CARD_W = 64, CARD_H = 84, GAP = 14;
    const startX = this._tarotLabel.x;
    const startY = this._tarotLabel.y + 22;

    const renderCards = () => {
      cards.forEach((card, i) => {
        const tarotId = card.tarot_id || card.id;
        const key     = `tarot_${tarotId}`;
        const cx      = startX + i * (CARD_W + GAP) + CARD_W / 2;
        const cy      = startY + CARD_H / 2;

        // Khung card
        const cg = this.scene.add.graphics().setDepth(this.depth + 4);
        cg.fillStyle(0x3a1a00, 0.5);
        cg.fillRoundedRect(cx - CARD_W / 2 - 2, cy - CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 7);
        cg.lineStyle(2, 0xffd700, 0.85);
        cg.strokeRoundedRect(cx - CARD_W / 2 - 2, cy - CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 7);
        this._tarotObjs.push(cg);
        this._objs.push(cg);

        if (this.scene.textures.exists(key)) {
          // Hiển thị ảnh thật
          const img = this.scene.add.image(cx, cy, key)
            .setDisplaySize(CARD_W, CARD_H)
            .setDepth(this.depth + 5);
          this._tarotObjs.push(img);
          this._objs.push(img);
        } else {
          // Fallback: tên thẻ
          const ct = this.scene.add.text(cx, cy, (card.name || `#${tarotId}`), {
            fontFamily: "Signika", fontSize: "10px",
            color: "#ffe0a0", fontStyle: "bold",
            align: "center", wordWrap: { width: CARD_W - 6 }
          }).setOrigin(0.5).setDepth(this.depth + 5);
          this._tarotObjs.push(ct);
          this._objs.push(ct);
        }

        // Tên thẻ bên dưới
        const nameTxt = this.scene.add.text(cx, cy + CARD_H / 2 + 10, card.name || `#${tarotId}`, {
          fontFamily: "Signika", fontSize: "10px", color: "#5a3200",
          align: "center", wordWrap: { width: CARD_W + GAP - 4 }
        }).setOrigin(0.5, 0).setDepth(this.depth + 4);
        this._tarotObjs.push(nameTxt);
        this._objs.push(nameTxt);
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
    const done = () => { if (++loaded >= total2) renderCards(); };

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
