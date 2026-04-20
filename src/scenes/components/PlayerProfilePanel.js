/**
 * PlayerProfilePanel — Panel xem thông tin sơ bộ người chơi trong RoomScene
 * v3 — Đẹp hơn: thu chiều cao, header có trang trí, stat badge, thẻ to
 */
export default class PlayerProfilePanel {
  constructor(scene, { socket, depth = 500 }) {
    this.scene  = scene;
    this.socket = socket;
    this.depth  = depth;
    this._objs  = [];
    this._open  = false;
  }

  open(width, height, player, myUserId = null) {
    if (this._open) this.destroy();
    this._open   = true;
    this._player = player;

    const W  = 560;
    const H  = 340;
    const CX = width  / 2;
    const CY = height / 2;
    const L  = CX - W / 2;
    const T  = CY - H / 2;
    const R  = 16;
    const D  = this.depth;

    const push = o => { this._objs.push(o); return o; };

    // ── Overlay ───────────────────────────────────────────────────────
    push(this.scene.add.graphics().setDepth(D - 1))
      .fillStyle(0x000000, 0.6).fillRect(0, 0, width, height);
    push(this.scene.add.zone(width / 2, height / 2, width, height)
      .setInteractive().setDepth(D - 1))
      .on("pointerdown", () => this.destroy());

    // ── Bóng đổ ──────────────────────────────────────────────────────
    push(this.scene.add.graphics().setDepth(D))
      .fillStyle(0x000000, 0.32)
      .fillRoundedRect(L + 8, T + 8, W, H, R);

    // ── Nền chính ─────────────────────────────────────────────────────
    const bg = push(this.scene.add.graphics().setDepth(D + 1));
    bg.fillGradientStyle(0xfaf0d0, 0xfaf0d0, 0xe8d490, 0xe8d490, 1);
    bg.fillRoundedRect(L, T, W, H, R);
    bg.lineStyle(2.5, 0xf0d060, 1);
    bg.strokeRoundedRect(L, T, W, H, R);
    bg.lineStyle(1.5, 0xffffff, 0.55);
    bg.strokeRoundedRect(L + 3, T + 3, W - 6, H - 6, R - 2);
    bg.fillStyle(0xffffff, 0.22);
    bg.fillRoundedRect(L + 6, T + 4, W - 12, 18, 8);
    this._drawInnerDash(bg, L, T, W, H, R);

    push(this.scene.add.zone(L + W / 2, T + H / 2, W, H)
      .setInteractive().setDepth(D + 1));

    // ── Header ────────────────────────────────────────────────────────
    const HDR_H = 32;
    const hdrG  = push(this.scene.add.graphics().setDepth(D + 2));
    // hdrG.fillGradientStyle(0xc8940a, 0xc8940a, 0x8a6000, 0x8a6000, 1);
    hdrG.fillRoundedRect(L, T, W, HDR_H, { tl: R, tr: R, bl: 0, br: 0 });
    // hdrG.lineStyle(2, 0xf0d060, 0.8);
    hdrG.beginPath(); hdrG.moveTo(L + 12, T + HDR_H); hdrG.lineTo(L + W - 12, T + HDR_H); hdrG.strokePath();
    // hdrG.fillStyle(0xffffff, 0.18);
    hdrG.fillRoundedRect(L + 6, T + 3, W - 12, 14, 5);

    // ── Nút X ────────────────────────────────────────────────────────
    const closeX = L + W, closeY = T;
    const closeBtn = push(this.scene.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(44, 44).setDepth(D + 6));
    push(this.scene.add.zone(closeX, closeY, 50, 50)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7))
      .on("pointerover",  () => closeBtn.setAlpha(0.8))
      .on("pointerout",   () => closeBtn.setAlpha(1))
      .on("pointerdown",  () => this.destroy());

    // ── Layout 2 cột ─────────────────────────────────────────────────
    const BODY_T = T + HDR_H + 8;
    const BODY_H = H - HDR_H - 40;
    const PAD    = 24;
    const GAP    = 10;
    const COL_W  = (W - PAD * 2 - GAP) / 2;
    const IP     = 6;

    const makeInset = (ix, iy, iw, ih) => {
      const g = push(this.scene.add.graphics().setDepth(D + 2));
      g.fillStyle(0xe8c87a, 1);
      g.fillRoundedRect(ix, iy, iw, ih, 8);
      g.lineStyle(1.5, 0x9a7020, 0.75);
      g.strokeRoundedRect(ix, iy, iw, ih, 8);
      for (let i = 0; i < 4; i++) {
        g.lineStyle(1, 0x5a3a00, 0.12 - i * 0.025);
        g.beginPath(); g.moveTo(ix + 8, iy + i + 1); g.lineTo(ix + iw - 8, iy + i + 1); g.strokePath();
        g.beginPath(); g.moveTo(ix + i + 1, iy + 8); g.lineTo(ix + i + 1, iy + ih - 8); g.strokePath();
      }
      for (let i = 0; i < 3; i++) {
        g.lineStyle(1, 0xfff0b0, 0.28 - i * 0.07);
        g.beginPath(); g.moveTo(ix + 8, iy + ih - i - 1); g.lineTo(ix + iw - 8, iy + ih - i - 1); g.strokePath();
        g.beginPath(); g.moveTo(ix + iw - i - 1, iy + 8); g.lineTo(ix + iw - i - 1, iy + ih - 8); g.strokePath();
      }
    };

    const leftX  = L + PAD;
    const rightX = L + PAD + COL_W + GAP;
    makeInset(leftX,  BODY_T, COL_W, BODY_H);
    makeInset(rightX, BODY_T, COL_W, BODY_H);

    // ── Cột trái: tên + avatar ────────────────────────────────────────
    push(this.scene.add.text(leftX + IP + 2, BODY_T + IP,
      player.name || "Player", {
        fontFamily: "Signika", fontSize: "15px", fontStyle: "bold",
      }).setDepth(D + 4)
        .setFill("#5a3200")
        .setTint(0xffffff, 0xffffff, 0xdddddd, 0xdddddd));

    const charDisplay = (player.character_name || "").replace(/_/g, " ");
    push(this.scene.add.text(leftX + IP + 2, BODY_T + IP + 20, charDisplay, {
      fontFamily: "Signika", fontSize: "12px", color: "#7a5010", fontStyle: "bold",
    }).setDepth(D + 4));

    const AVT_T = BODY_T + IP + 40;
    const AVT_H = BODY_H - IP - 40 - IP;
    const AVT_W = COL_W - IP * 2;
    this._buildAvatarWithBorder(
      leftX + IP + AVT_W / 2, AVT_T + AVT_H / 2,
      AVT_W, AVT_H, player, D + 4
    );

    // ── Cột phải: badge stats + thẻ + nút ────────────────────────────
    const isSelf   = myUserId != null && Number(myUserId) === Number(player.user_id);
    const CARD_GAP = 8;
    const cardW    = Math.floor((COL_W - IP * 2 - CARD_GAP) / 2);
    const cardH    = Math.floor(cardW * 1.55);  // to hơn
    const BADGE_H  = 26;
    const NAME_H   = 16;
    const BADGE_CARD_GAP = 10;  // khoảng cách cố định badge → thẻ
    const totalC   = BADGE_H + BADGE_CARD_GAP + cardH + NAME_H;
    const avail    = BODY_H - IP * 2;
    const vPad     = Math.max(4, (avail - totalC) / 2);
    const badgeY   = BODY_T + IP + vPad;
    const tarotImgY = badgeY + BADGE_H + BADGE_CARD_GAP + cardH / 2;

    const cardStartX = rightX + IP;
    const bw         = cardW - 2;
    const col1cx     = cardStartX + cardW / 2;
    const col2cx     = cardStartX + cardW + CARD_GAP + cardW / 2;

    // Stat badges
    const drawBadge = (cx, cy, label) => {
      const g = push(this.scene.add.graphics().setDepth(D + 3));
      g.fillGradientStyle(0xb87820, 0xb87820, 0x7a5000, 0x7a5000, 1);
      g.fillRoundedRect(cx - bw / 2, cy - BADGE_H / 2, bw, BADGE_H, 6);
      g.lineStyle(1.5, 0xf0d060, 0.9);
      g.strokeRoundedRect(cx - bw / 2, cy - BADGE_H / 2, bw, BADGE_H, 6);
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(cx - bw / 2 + 3, cy - BADGE_H / 2 + 3, bw - 6, BADGE_H * 0.4, 4);
      g.fillStyle(0xffffff, 0.45);
      g.fillCircle(cx + bw / 2 - 8, cy - BADGE_H / 2 + 7, 4);
      return push(this.scene.add.text(cx, cy, label, {
        fontFamily: "Signika", fontSize: "12px", color: "#fff8dc",
        fontStyle: "bold", stroke: "#3a2000", strokeThickness: 2.5,
      }).setOrigin(0.5).setDepth(D + 4));
    };

    this._badge1 = drawBadge(col1cx, badgeY + BADGE_H / 2, "Trận: ...");
    this._badge2 = drawBadge(col2cx, badgeY + BADGE_H / 2, "Thắng: ...");


    const divG = push(this.scene.add.graphics().setDepth(D + 3));
    divG.lineStyle(1, 0x9a7020, 0.4);
    divG.beginPath();
    divG.moveTo(rightX + IP, badgeY + BADGE_H + BADGE_CARD_GAP / 2);
    divG.lineTo(rightX + COL_W - IP, badgeY + BADGE_H + BADGE_CARD_GAP / 2);
    divG.strokePath();

    this._tarotLabel = push(this.scene.add.text(cardStartX, tarotImgY, "", {
      fontFamily: "Signika", fontSize: "1px",
    }).setDepth(D + 4));
    this._tarotObjs = [];

    // Proxy cho _updateStats
    this._statsTxt  = { active: true, setText: (t) => this._badge1?.setText?.(`Trận: ${t.replace("Số trận: ", "")}`) };
    this._statsTxt2 = { active: true, setText: (t) => this._badge2?.setText?.(`Thắng: ${t.replace("Thắng: ", "")}`) };

    this._cardStartX = cardStartX;
    this._cardW      = cardW;
    this._cardH      = cardH;
    this._cardGap    = CARD_GAP;
    this._rightL     = rightX + IP;
    this._rightW     = COL_W - IP * 2;
    this._rightCX    = rightX + COL_W / 2;

    // ── Nút Kết Bạn ──────────────────────────────────────────────────
    if (!isSelf) {
      const ICO_SIZE = 42;
      const icoX = leftX + COL_W - ICO_SIZE / 2 - IP + 4; 
      const nameAreaCY = BODY_T + IP + 18; 
      const icoY = nameAreaCY;

      const icoImg = push(this.scene.add.image(icoX, icoY, "add_friend")
        .setOrigin(0.5, 0.5)
        .setDepth(D + 6));
      // Giữ tỉ lệ gốc, scale theo ICO_SIZE
      const tex = this.scene.textures.get("add_friend");
      if (tex && tex.source[0]) {
        const nat = tex.source[0];
        const asp = nat.width / nat.height;
        if (asp >= 1) icoImg.setDisplaySize(ICO_SIZE, ICO_SIZE / asp);
        else          icoImg.setDisplaySize(ICO_SIZE * asp, ICO_SIZE);
      } else {
        icoImg.setDisplaySize(ICO_SIZE, ICO_SIZE);
      }

      // Toast nhỏ hiển thị ngay trong panel
      const showPanelToast = (msg, color = "#ffffff") => {
        const existing = this._panelToast;
        if (existing?.active) { try { existing.destroy(); } catch(e){} }
        const t = this.scene.add.text(L + W / 2, T + H - 18, msg, {
          fontFamily: "Signika", fontSize: "13px", color,
          fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
          backgroundColor: "#00000088", padding: { x: 10, y: 5 },
        }).setOrigin(0.5, 1).setDepth(D + 8).setAlpha(0);
        this._objs.push(t);
        this._panelToast = t;
        this.scene.tweens?.add({
          targets: t, alpha: 1, duration: 180,
          onComplete: () => {
            this.scene.time?.delayedCall(2000, () => {
              this.scene.tweens?.add({ targets: t, alpha: 0, duration: 300,
                onComplete: () => { try { t.destroy(); } catch(e){} }
              });
            });
          }
        });
      };

      let _sent = false;
      const _icoBaseScaleX = icoImg.scaleX, _icoBaseScaleY = icoImg.scaleY;

      const icoZone = push(this.scene.add.zone(icoX, icoY, ICO_SIZE + 8, ICO_SIZE + 8)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 7));

      // Hàm đổi icon sang grayscale (đã gửi / đã là bạn)
      const setGrayscale = () => {
        _sent = true;
        icoImg.setTint(0x888888);
        icoImg.setAlpha(0.6);
        icoZone.disableInteractive();
      };
      this._setFriendIconGrayscale = setGrayscale;

      icoZone
        .on("pointerover",  () => { if (!_sent) icoImg.setScale(_icoBaseScaleX * 1.05, _icoBaseScaleY * 1.05); })
        .on("pointerout",   () => icoImg.setScale(_icoBaseScaleX, _icoBaseScaleY))
        .on("pointerdown",  () => {
          if (_sent) return;
          this.scene.tweens?.add({ targets: icoImg, alpha: 0.5, duration: 60, yoyo: true });
          this.socket?.emit("friend:request", { to_id: player.user_id });
        });

      // Override callbacks để cập nhật icon + toast trong panel
      this._onFriendSent = () => {
        setGrayscale();
        showPanelToast("✓ Đã gửi lời mời kết bạn!", "#44ff88");
        this.scene._showToast?.("Đã gửi lời mời kết bạn!");
      };
      this._onFriendError = (d) => {
        // Nếu lỗi vì đã gửi rồi hoặc đã là bạn → grayscale icon
        if (d.message && (d.message.includes("Đã gửi") || d.message.includes("đã là bạn"))) {
          setGrayscale();
        }
        showPanelToast("✗ " + (d.message || "Lỗi"), "#ff6666");
        this.scene._showToast?.(d.message);
      };
    }

    this._bindProfileResult();
    this.socket?.emit("room:player:profile", { user_id: player.user_id });
    return this;
  }

  destroy() {
    this._unbindProfileResult();
    this._objs.forEach(o => { try { o?.destroy?.(); } catch(e){} });
    this._objs = [];
    this._tarotObjs.forEach(o => { try { o?.destroy?.(); } catch(e){} });
    this._tarotObjs = [];
    this._open = false;
  }

  // ── PRIVATE ─────────────────────────────────────────────────────────

  _buildAvatarWithBorder(cx, cy, width, height, player, depth) {
    const push = o => { this._objs.push(o); return o; };
    const mask = this.scene.make.graphics({ x: 0, y: 0, add: false });
    mask.fillStyle(0xffffff);
    mask.fillRoundedRect(cx - width / 2, cy - height / 2, width, height, 10);
    const geomMask = mask.createGeometryMask();

    // Lưu params để _onProfileResult có thể load bg sau
    this._avatarParams = { cx, cy, width, height, depth };
    this._avatarMask   = geomMask;

    // Bg sẽ được load sau khi nhận profile result (có active_bg_path)
    // Nếu texture đã có sẵn (mở từ RoomScene) thì render ngay
    if (player.active_bg_id) {
      const bgKey = `bg_${player.active_bg_id}`;
      if (this.scene.textures.exists(bgKey) && this.scene.textures.get(bgKey).key !== '__MISSING') {
        const bgImg = push(this.scene.add.image(cx, cy, bgKey).setOrigin(0.5).setDepth(depth));
        const tex   = this.scene.textures.get(bgKey);
        const ia    = tex.source[0].width / tex.source[0].height;
        const fa    = width / height;
        bgImg.setDisplaySize(ia > fa ? height * ia : width, ia > fa ? height : width / ia)
             .setMask(geomMask);
      }
    }

    const hasChar = player.character_name && player.character_name !== "Unknown" && player.skin_id;
    if (hasChar) {
      const fk = `${player.character_name}_${player.skin_id}_idle_000`;
      if (this.scene.textures.exists(fk)) {
        const ak = `${player.character_name}_${player.skin_id}_idle`;
        const sz = Math.min(width, height) * 0.85;
        const sp = push(this.scene.add.sprite(cx, cy, fk).setDisplaySize(sz, sz).setDepth(depth + 1));
        if (this.scene.anims.exists(ak)) sp.play(ak);
        this._avatarSprite = sp;
        return;
      }
    }
    const sz  = Math.min(width, height) * 0.7;
    const img = push(this.scene.add.image(cx, cy, "avatar_default")
      .setDisplaySize(sz, sz).setAlpha(0.7).setDepth(depth));
    this._avatarSprite = img;
    this.scene.tweens?.add({ targets: img, y: cy - 8, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  _updateStats(data) {
    const wins  = data.total_wins  || 0;
    const total = data.total_games || 0;
    this._statsTxt?.setText?.(`Số trận: ${total}`);
    this._statsTxt2?.setText?.(`Thắng: ${wins}`);

    this._tarotObjs.forEach(o => { try { o?.destroy?.(); } catch(e){} });
    this._tarotObjs = [];

    const cards = (data.tarot_cards || []).slice(0, 2);
    if (cards.length === 0) {
      const t = this.scene.add.text(
        this._tarotLabel.x + this._rightW / 2, this._tarotLabel.y,
        "Chưa trang bị thẻ bài",
        { fontFamily: "Signika", fontSize: "12px", color: "#9a7a40", align: "center" }
      ).setOrigin(0.5).setDepth(this.depth + 4);
      this._tarotObjs.push(t);
      return;
    }

    const GAP = this._cardGap || 8, cardW = this._cardW, cardH = this._cardH;
    const startX = this._cardStartX, startY = this._tarotLabel.y;

    const renderCards = () => {
      if (!this._open) return;
      this._tarotObjs.forEach(o => { try { o?.destroy?.(); } catch(e){} });
      this._tarotObjs = [];
      cards.forEach((card, i) => {
        const id  = card.tarot_id || card.id;
        const key = `tarot_${id}`;
        const cx  = startX + i * (cardW + GAP) + cardW / 2;
        const cy  = startY;

        // Bóng — offset nhỏ, sát thẻ hơn
        const sg = this.scene.add.graphics().setDepth(this.depth + 4);
        sg.fillStyle(0x000000, 0.28);
        sg.fillRoundedRect(cx - cardW / 2 + 1, cy - cardH / 2 + 1, cardW, cardH, 6);
        this._tarotObjs.push(sg);

        if (this.scene.textures.exists(key)) {
          const tex = this.scene.textures.get(key);
          const asp = tex.source[0].width / tex.source[0].height;
          let dw = cardW, dh = cardW / asp;
          if (dh > cardH) { dh = cardH; dw = cardH * asp; }
          this._tarotObjs.push(
            this.scene.add.image(cx, cy, key).setDisplaySize(dw, dh).setDepth(this.depth + 5)
          );
        } else {
          this._tarotObjs.push(
            this.scene.add.text(cx, cy, card.name || `#${id}`, {
              fontFamily: "Signika", fontSize: "10px", color: "#ffe0a0",
              fontStyle: "bold", align: "center", wordWrap: { width: cardW - 6 }
            }).setOrigin(0.5).setDepth(this.depth + 5)
          );
        }

        this._tarotObjs.push(
          this.scene.add.text(cx, cy + cardH / 2 + 8, card.name || `#${id}`, {
            fontFamily: "Signika", fontSize: "12px", color: "#5a3200",
            align: "center", wordWrap: { width: cardW + GAP - 4 }
          }).setOrigin(0.5, 0).setDepth(this.depth + 4)
        );
      });
    };

    const toLoad = cards.filter(c => !this.scene.textures.exists(`tarot_${c.tarot_id || c.id}`));
    if (toLoad.length === 0) { renderCards(); return; }
    let loaded = 0;
    const done = () => {
      if (++loaded >= toLoad.length) {
        this.scene.load.off("filecomplete", done);
        this.scene.load.off("loaderror",    done);
        renderCards();
      }
    };
    this.scene.load.on("filecomplete", done);
    this.scene.load.on("loaderror",    done);
    toLoad.forEach(c => {
      const id = c.tarot_id || c.id;
      this.scene.load.image(`tarot_${id}`, `assets/resources/Tarot/thebai_${id}.png`);
    });
    this.scene.load.start();
  }

  _bindProfileResult() {
    this._onProfileResult = (data) => {
      if (Number(data.user_id) !== Number(this._player?.user_id)) return;
      if (data.error) { this._badge1?.setText?.(data.error); return; }
      console.log("[Profile] bg_id:", data.active_bg_id, "| bg_path:", data.active_bg_path);
      if (data.friend_status === "pending_sent" || data.friend_status === "accepted") {
        this._setFriendIconGrayscale?.();
      }
      // Load bg nếu có và chưa được render
      if (data.active_bg_id && data.active_bg_path && this._avatarParams) {
        const { cx, cy, width, height, depth } = this._avatarParams;
        const bgKey  = `bg_${data.active_bg_id}`;
        const bgPath = data.active_bg_path;
        const geomMask = this._avatarMask;
        const push = o => { this._objs.push(o); return o; };

        const renderBg = () => {
          if (!this.scene.textures.exists(bgKey)) return;
          const tex = this.scene.textures.get(bgKey);
          if (tex.key === '__MISSING') return;
          const bgImg = push(this.scene.add.image(cx, cy, bgKey).setOrigin(0.5).setDepth(depth));
          const ia = tex.source[0].width / tex.source[0].height;
          const fa = width / height;
          bgImg.setDisplaySize(ia > fa ? height * ia : width, ia > fa ? height : width / ia);
          if (geomMask) bgImg.setMask(geomMask);
          // Đưa bg xuống dưới nhân vật
          bgImg.setDepth(depth);
          // Đưa sprite nhân vật lên trên
          this._avatarSprite?.setDepth(depth + 1);
        };

        if (this.scene.textures.exists(bgKey) && this.scene.textures.get(bgKey).key !== '__MISSING') {
          renderBg();
        } else {
          if (this.scene.textures.exists(bgKey)) this.scene.textures.remove(bgKey);
          this.scene.load.once(`filecomplete-image-${bgKey}`, renderBg);
          this.scene.load.image(bgKey, bgPath);
          this.scene.load.start();
        }
      }
      this._updateStats(data);
    };
    // _onFriendSent / _onFriendError được set từ open() nếu !isSelf,
    // fallback ở đây cho trường hợp isSelf (không dùng nhưng cần để unbind)
    if (!this._onFriendSent)  this._onFriendSent  = () => this.scene._showToast?.("Đã gửi lời mời kết bạn!");
    if (!this._onFriendError) this._onFriendError = (d) => this.scene._showToast?.(d.message);
    this.socket?.on("room:player:profile:result", this._onProfileResult);
    this.socket?.on("friend:request:sent",        this._onFriendSent);
    this.socket?.on("friend:request:error",       this._onFriendError);
  }

  _unbindProfileResult() {
    if (this._onProfileResult) { this.socket?.off("room:player:profile:result", this._onProfileResult); this._onProfileResult = null; }
    if (this._onFriendSent)    { this.socket?.off("friend:request:sent",  this._onFriendSent);  this._onFriendSent  = null; }
    if (this._onFriendError)   { this.socket?.off("friend:request:error", this._onFriendError); this._onFriendError = null; }
  }

  _drawInnerDash(g, L, T, W, H, R) {
    const ins = 10, cr = R - 4;
    g.lineStyle(1.5, 0xb8922e, 0.45);
    const dL = (x1,y1,x2,y2) => {
      const dist = Phaser.Math.Distance.Between(x1,y1,x2,y2);
      const ang  = Phaser.Math.Angle.Between(x1,y1,x2,y2);
      for (let d = 0; d < dist; d += 14) {
        g.beginPath();
        g.moveTo(x1 + Math.cos(ang) * d,                     y1 + Math.sin(ang) * d);
        g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
        g.strokePath();
      }
    };
    const dA = (ax,ay,r,s,e) => {
      const steps = Math.ceil(r * Math.abs(e - s) / 14);
      for (let i = 0; i < steps; i++) {
        const a1 = s + (e - s) * (i / steps);
        const a2 = s + (e - s) * Math.min((i + 0.57) / steps, 1);
        g.beginPath(); g.arc(ax, ay, r, a1, a2); g.strokePath();
      }
    };
    dL(L+ins+cr,T+ins,L+W-ins-cr,T+ins); dL(L+W-ins,T+ins+cr,L+W-ins,T+H-ins-cr);
    dL(L+W-ins-cr,T+H-ins,L+ins+cr,T+H-ins); dL(L+ins,T+H-ins-cr,L+ins,T+ins+cr);
    dA(L+ins+cr,T+ins+cr,cr,Math.PI,Math.PI*1.5); dA(L+W-ins-cr,T+ins+cr,cr,Math.PI*1.5,Math.PI*2);
    dA(L+W-ins-cr,T+H-ins-cr,cr,0,Math.PI*0.5);   dA(L+ins+cr,T+H-ins-cr,cr,Math.PI*0.5,Math.PI);
  }
}