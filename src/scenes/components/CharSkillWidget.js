export default class CharSkillWidget {
  constructor(scene) {
    this.scene = scene;
    this.myState = null;
    this.allPlayers = [];
    this.traps = {};
    this._objs = [];
    this._modalObjs = [];
    this._trapMarkers = {};
    this._tooltip = null;
    this._built = false;
  }

  _buildUI() {
    if (this._built) return;
    this._built = true;
    const sc = this.scene;
    const { width, height } = sc.scale;
    const S = Math.min(width / 1920, height / 1080);

    // Đặt bên phải màn hình, cách mép phải một khoảng nhỏ (đối xứng với nút Chat bên trái, không đè panel góc)
    const bw = Math.round(196 * S);
    const bh = Math.round(86 * S);
    const marginRight = Math.round(24 * S);
    const bx = width - marginRight - bw / 2;
    const by = height * 0.50;
    const D = 120;

    this._pos = { bx, by, bw, bh, S, D };

<<<<<<< HEAD
    // ── Khung & Icon Nội tại (phía trên) ──
    this._passiveFrameG = sc.add.graphics().setDepth(D);
    this._passiveIconImg = sc.add.image(bx, py, "skill_icon_28")
      .setDisplaySize(pSize - 6 * S, pSize - 6 * S)
      .setDepth(D + 1)
      .setVisible(false);
    this._passiveDimOverlay = sc.add.graphics().setDepth(D + 2);
    this._passiveCdTxt = sc.add.text(bx, py, "", {
      fontFamily: "Signika", fontSize: Math.max(14, Math.floor(18 * S)) + "px",
      color: "#38e8ff", fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(D + 3).setVisible(false);
    this._passiveZone = sc.add.zone(bx, py, pSize + 8 * S, pSize + 8 * S)
      .setDepth(D + 4).setInteractive({ cursor: "pointer" });
    this._passiveZone.on("pointerover", () => this._showTooltip("passive"));
    this._passiveZone.on("pointerout",  () => this._hideTooltip());
    this._passiveZone.on("pointerup",   () => this._onPassivePress());

    // ── Khung & Icon Kỹ năng Nộ (ở giữa, bấm để dùng) ──
=======
>>>>>>> parent of d9bda5a (Commit - mới)
    this._btnG = sc.add.graphics().setDepth(D);
    this._barG = sc.add.graphics().setDepth(D + 1);

    this._tagTxt = sc.add.text(bx, by - 26 * S, "⚡ KỸ NĂNG NỘ", {
      fontFamily: "Signika", fontSize: Math.max(10, Math.floor(11.5 * S)) + "px",
      color: "#7dd3fc", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 2);

    this._titleTxt = sc.add.text(bx, by - 5 * S, "KỸ NĂNG", {
      fontFamily: "Signika", fontSize: Math.max(13, Math.floor(16 * S)) + "px",
      color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      align: "center", wordWrap: { width: bw - 16 * S },
    }).setOrigin(0.5).setDepth(D + 2);

    this._energyTxt = sc.add.text(bx, by + 26 * S, "Nộ: 0/100", {
      fontFamily: "Signika", fontSize: Math.max(10, Math.floor(12 * S)) + "px",
      color: "#ffe9a8", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 3);

    this._zone = sc.add.zone(bx, by, bw, bh).setDepth(D + 4).setInteractive({ cursor: "pointer" });
    this._zone.on("pointerover", () => this._showTooltip());
    this._zone.on("pointerout",  () => this._hideTooltip());
    this._zone.on("pointerup",   () => this._onPress());

    this._objs.push(this._btnG, this._barG, this._tagTxt, this._titleTxt, this._energyTxt, this._zone);
    this._createAnims();
  }

  _createAnims() {
    const sc = this.scene;
    if (!sc.anims.exists("fx_water_ball")) {
      const f = [];
      for (let i = 1; i <= 12; i++) {
        const k = `water_ball_${String(i).padStart(2, "0")}`;
        if (sc.textures.exists(k)) f.push({ key: k });
      }
      if (f.length) sc.anims.create({ key: "fx_water_ball", frames: f, frameRate: 18, repeat: -1 });
    }
    if (!sc.anims.exists("fx_fire_ball")) {
      const f = [];
      for (let i = 1; i <= 8; i++) {
        const k = `fire_ball_${String(i).padStart(2, "0")}`;
        if (sc.textures.exists(k)) f.push({ key: k });
      }
      if (f.length) sc.anims.create({ key: "fx_fire_ball", frames: f, frameRate: 16, repeat: -1 });
    }
  }

  syncState(data) {
    if (!data) return;
    this._buildUI();
    this.allPlayers = data.players || [];
    this.traps = data.traps || {};

    const myUid = Number(this.scene._myUserId?.());
    this.myState = this.allPlayers.find(p => Number(p.user_id) === myUid) || null;
    this.refresh();
    this._renderTraps();
  }

  refresh() {
    if (!this._built || !this.myState) return;
    const sc = this.scene;
    const { bx, by, bw, bh, S } = this._pos;
    const skill = this.myState.skill;
    const energy = Number(this.myState.energy || 0);
    const maxE = Number(this.myState.max_energy || 100);
    const ready = energy >= maxE && !this.myState.used_skill_this_turn && sc.isMyTurn && sc.canRoll;

<<<<<<< HEAD
    // ── Icon Nội tại / Kỹ năng phụ (nhỏ phía trên, bấm để kích hoạt) ──
    const pIconId = PASSIVE_ICON_MAP[skill?.passive_type] || 28;
    const pKey = `skill_icon_${pIconId}`;
    const pCd = Number(this.myState.passive_cooldown_left || 0);
    const pActive = Number(this.myState.passive_active_turns || 0);
    const pReady = pCd <= 0 && pActive <= 0 && sc.isMyTurn && sc.canRoll;

    if (sc.textures.exists(pKey)) {
      this._passiveIconImg.setTexture(pKey)
        .setDisplaySize(pSize - 6 * S, pSize - 6 * S)
        .setVisible(true);
    }
    const pg = this._passiveFrameG;
    pg.clear();
    pg.fillStyle(0x000000, 0.45);
    pg.fillRoundedRect(bx - pSize / 2 + 2, py - pSize / 2 + 3, pSize, pSize, 10 * S);
    pg.fillStyle(0x0f172a, 0.9);
    pg.fillRoundedRect(bx - pSize / 2, py - pSize / 2, pSize, pSize, 10 * S);
    const pBorderCol = pActive > 0 ? 0xfacc15 : pReady ? 0x38bdf8 : 0x64748b;
    pg.lineStyle((pActive > 0 || pReady ? 2.5 : 2) * S, pBorderCol, 0.95);
    pg.strokeRoundedRect(bx - pSize / 2, py - pSize / 2, pSize, pSize, 10 * S);

    const pDim = this._passiveDimOverlay;
    if (pDim) {
      pDim.clear();
      if (pCd > 0) {
        pDim.fillStyle(0x000000, 0.62);
        pDim.fillRoundedRect(bx - pSize / 2 + 2 * S, py - pSize / 2 + 2 * S, pSize - 4 * S, pSize - 4 * S, 8 * S);
        this._passiveCdTxt?.setText(String(pCd)).setColor("#38e8ff").setVisible(true);
      } else if (pActive > 0) {
        this._passiveCdTxt?.setText("BẬT").setColor("#fde047").setVisible(true);
      } else {
        if (!pReady) {
          pDim.fillStyle(0x000000, 0.35);
          pDim.fillRoundedRect(bx - pSize / 2 + 2 * S, py - pSize / 2 + 2 * S, pSize - 4 * S, pSize - 4 * S, 8 * S);
        }
        this._passiveCdTxt?.setVisible(false);
      }
    }

    // ── Icon Kỹ năng Nộ (lớn ở dưới) ──
    const aIconId = ACTIVE_ICON_MAP[skill?.active_type] || 47;
    const aKey = `skill_icon_${aIconId}`;
    if (sc.textures.exists(aKey)) {
      this._activeIconImg.setTexture(aKey)
        .setDisplaySize(bw - 8 * S, bh - 8 * S)
        .setVisible(true);
    }

=======
>>>>>>> parent of d9bda5a (Commit - mới)
    const g = this._btnG;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(bx - bw / 2 + 2, by - bh / 2 + 4, bw, bh, 14 * S);
    if (ready) {
      g.fillGradientStyle(0xffc93c, 0xffc93c, 0xd46a10, 0xd46a10, 1);
      g.lineStyle(2.5, 0xfff5b0, 1);
    } else {
      g.fillGradientStyle(0x1f3c70, 0x1f3c70, 0x102244, 0x102244, 0.95);
      g.lineStyle(2, 0x5599dd, 0.85);
    }
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 14 * S);
    g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 14 * S);

    // Thanh năng lượng
    const barW = bw - 24 * S;
    const barH = 10 * S;
    const barX = bx - barW / 2;
    const barY = by + 10 * S;
    const ratio = Math.max(0, Math.min(1, energy / maxE));

    const bg = this._barG;
    bg.clear();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(barX, barY, barW, barH, 5 * S);
    if (ratio > 0) {
      bg.fillStyle(ready ? 0xffe066 : 0x44ccff, 1);
      bg.fillRoundedRect(barX, barY, Math.max(8 * S, barW * ratio), barH, 5 * S);
    }

    this._tagTxt?.setColor(ready ? "#fff3b0" : "#7dd3fc");
    this._titleTxt.setText(skill ? skill.active_name : "KỸ NĂNG");
    this._titleTxt.setColor(ready ? "#4a1800" : "#ffffff");
    if (ready) {
      this._energyTxt.setText("NHẤN ĐỂ DÙNG!");
      this._energyTxt.setColor("#fff7cc");
    } else if (energy >= maxE && !this.myState.used_skill_this_turn) {
      this._energyTxt.setText(`Nộ: ${energy}/${maxE} • Chờ lượt`);
      this._energyTxt.setColor("#fde047");
    } else {
      this._energyTxt.setText(`Nộ: ${energy}/${maxE}`);
      this._energyTxt.setColor("#e2e8f0");
    }
  }

  _showTooltip() {
    this._hideTooltip();
    const skill = this.myState?.skill;
    if (!skill) return;
    const sc = this.scene;
<<<<<<< HEAD
    const { bx, by, bw, py, S, D } = this._pos;
    const energy = Number(this.myState.energy || 0);
    const maxE = Number(this.myState.max_energy || 100);
    const ready = energy >= maxE && !this.myState.used_skill_this_turn && sc.isMyTurn && sc.canRoll;

    const tw = Math.round(340 * S);
    const padX = Math.round(14 * S);
    const padY = Math.round(12 * S);

    const pCd = Number(this.myState.passive_cooldown_left || 0);
    const pActive = Number(this.myState.passive_active_turns || 0);
    const passiveStatus = pActive > 0
      ? `🔥 Đang bật (còn ${pActive} lượt)`
      : pCd > 0
      ? `⏳ Hồi chiêu: ${pCd} lượt`
      : "⚡ Nhấn để bật (2 lượt)";
    const statusLine = ready
      ? "✅ Đủ Nộ — Nhấn để kích hoạt!"
      : energy >= maxE
      ? "⏳ Đủ Nộ — Chờ tới lượt tung xúc xắc"
      : `⚡ Nộ: ${energy}/${maxE}`;

    // Tạo text trước để đo chiều cao thực tế, tránh tràn khung
    const txt = sc.add.text(0, 0,
      `🛡 Nội tại — ${skill.passive_name} (${passiveStatus}):\n${skill.passive_desc}\n\n🔥 Nộ — ${skill.active_name} (${statusLine}):\n${skill.active_desc}`,
      {
        fontFamily: "Signika", fontSize: Math.max(11, Math.floor(13 * S)) + "px",
        color: "#eef6ff", wordWrap: { width: tw - padX * 2 }, lineSpacing: 3,
      }
    ).setOrigin(0, 0).setDepth(D + 21);

    const th = Math.max(Math.round(120 * S), Math.ceil(txt.height + padY * 2));
=======
    const { bx, by, bw, S, D } = this._pos;
    const tw = Math.round(320 * S), th = Math.round(145 * S);
    // Mở tooltip sang bên trái nút kỹ năng để không bị tràn mép phải
>>>>>>> parent of d9bda5a (Commit - mới)
    const tx = Math.max(tw / 2 + 12 * S, bx - bw / 2 - tw / 2 - 14 * S);
    const ty = Math.max(th / 2 + 12 * S, Math.min(sc.scale.height - th / 2 - 12 * S, by));

    const g = sc.add.graphics().setDepth(D + 20);
    g.fillStyle(0x0e1830, 0.94);
    g.fillRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12);
    g.lineStyle(2, 0xffe066, 0.9);
    g.strokeRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12);

    const txt = sc.add.text(tx - tw / 2 + 12, ty - th / 2 + 10,
      `Nội tại - ${skill.passive_name}:\n${skill.passive_desc}\n\nChủ động - ${skill.active_name}:\n${skill.active_desc}`,
      {
        fontFamily: "Signika", fontSize: Math.max(11, Math.floor(13 * S)) + "px",
        color: "#eef6ff", wordWrap: { width: tw - 24 }, lineSpacing: 2,
      }
    ).setOrigin(0, 0).setDepth(D + 21);

    this._tooltip = [g, txt];
  }

  _hideTooltip() {
    if (!this._tooltip) return;
    this._tooltip.forEach(o => { try { o.destroy(); } catch (e) {} });
    this._tooltip = null;
  }

  _onPassivePress() {
    const sc = this.scene;
    const st = this.myState;
    if (!st?.skill) return;
    if (!sc.isMyTurn || !sc.canRoll) return sc._showSkillToast?.("Chỉ bật kỹ năng trước khi tung xúc xắc!");
    if ((st.passive_active_turns || 0) > 0) return sc._showSkillToast?.(`${st.skill.passive_name} đang được bật!`);
    if ((st.passive_cooldown_left || 0) > 0) return sc._showSkillToast?.(`Đang hồi chiêu (còn ${st.passive_cooldown_left} lượt)!`);
    const roomId = sc.gameRoomId ?? sc.room_id;
    sc.socket?.emit("game:use_char_passive", { room_id: roomId });
  }

  _onPress() {
    const sc = this.scene;
    const st = this.myState;
    if (!st?.skill) return;
    if (!sc.isMyTurn || !sc.canRoll) return sc._showSkillToast?.("Chỉ dùng kỹ năng trước khi tung xúc xắc!");
    if (st.used_skill_this_turn) return sc._showSkillToast?.("Mỗi lượt chỉ dùng kỹ năng 1 lần!");
    if ((st.energy || 0) < (st.skill.energy_cost || 100)) {
      return sc._showSkillToast?.(`Chưa đủ Nộ (${st.energy || 0}/${st.skill.energy_cost || 100})!`);
    }

    const mode = st.skill.target_mode;
    if (mode === "self") {
      this._emitUse({});
    } else if (mode === "none" && st.skill.active_type === "dice_bias") {
      this._openSelectModal("Chọn tầm 2 xúc xắc lượt này", [
        { label: "Thấp (2 - 6)",  sub: "Đi bước ngắn, an toàn", val: { bias: "low" } },
        { label: "Cao (8 - 12)", sub: "Đi bước dài, bứt tốc",  val: { bias: "high" } },
      ]);
    } else if (mode === "enemy") {
      const myUid = Number(sc._myUserId?.());
      const myTeam = sc.gamePlayers?.find(p => Number(p.user_id) === myUid)?.team_id;
      const enemies = (sc.gamePlayers || []).filter(p => Number(p.user_id) !== myUid && (!myTeam || p.team_id !== myTeam));
      if (!enemies.length) return;
      this._openSelectModal(`Chọn mục tiêu: ${st.skill.active_name}`, enemies.map(e => ({
        label: e.name || "Đối thủ",
        sub: `Ô #${(Number(e.index) || 0) + 1}`,
        val: { target_user_id: e.user_id },
      })));
    } else if (mode === "enemy_cell") {
      const myUid = Number(sc._myUserId?.());
      const myTeam = sc.gamePlayers?.find(p => Number(p.user_id) === myUid)?.team_id;
      const cells = Object.entries(sc.cellStates || {})
        .filter(([, c]) => Number(c.owner_user_id) !== myUid && (!myTeam || !sc.gamePlayers?.some(p => Number(p.user_id) === Number(c.owner_user_id) && p.team_id === myTeam)))
        .map(([idx, c]) => {
          const owner = sc.gamePlayers?.find(p => Number(p.user_id) === Number(c.owner_user_id));
          return { label: `Ô #${Number(idx) + 1}`, sub: owner?.name || "Địch", val: { target_cell_index: Number(idx) } };
        });
      if (!cells.length) return sc._showSkillToast?.("Đối thủ chưa có tinh cầu nào!");
      this._openSelectModal(`Chọn tinh cầu phá giáp`, cells.slice(0, 8));
    } else if (mode === "any_cell") {
      const myIdx = Number(sc.gamePlayers?.find(p => Number(p.user_id) === Number(sc._myUserId?.()))?.index || 0);
      const total = sc.boardPath?.length || 24;
      const choices = [];
      for (let s = 2; s <= 11 && choices.length < 8; s++) {
        const idx = (myIdx + s) % total;
        if (![0, 6, 9, 12, 18].includes(idx)) {
          choices.push({ label: `Ô #${idx + 1}`, sub: `Cách +${s} ô`, val: { target_cell_index: idx } });
        }
      }
      this._openSelectModal("Chọn ô đặt Bẫy Độc (3 lượt)", choices);
    }
  }

  _openSelectModal(title, options) {
    this._closeModal();
    const sc = this.scene;
    const { width, height } = sc.scale;
    const D = 400;
    const push = (o) => { this._modalObjs.push(o); return o; };

    push(sc.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setDepth(D).setInteractive());
    const PW = Math.min(540, width - 40);
    const cols = 2;
    const rows = Math.ceil(options.length / cols);
    const PH = 120 + rows * 62;
    const px = width / 2 - PW / 2, py = height / 2 - PH / 2;

    const g = push(sc.add.graphics().setDepth(D + 1));
    g.fillStyle(0xf6eac6, 1); g.fillRoundedRect(px, py, PW, PH, 16);
    g.lineStyle(3, 0x8b5e1a, 1); g.strokeRoundedRect(px, py, PW, PH, 16);

    push(sc.add.text(width / 2, py + 28, title, {
      fontFamily: "Signika", fontSize: "20px", color: "#4a2000", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 2));

    const bw = Math.floor((PW - 54) / cols), bh = 50;
    options.forEach((opt, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = px + 20 + col * (bw + 14) + bw / 2;
      const by = py + 82 + row * 62;
      const bg = push(sc.add.graphics().setDepth(D + 2));
      bg.fillGradientStyle(0x1a8fc0, 0x1a8fc0, 0x0a4a7a, 0x0a4a7a, 1);
      bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
      bg.lineStyle(2, 0xffffff, 0.8);
      bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
      push(sc.add.text(bx, by - 7, opt.label, {
        fontFamily: "Signika", fontSize: "15px", color: "#ffffff", fontStyle: "bold",
      }).setOrigin(0.5).setDepth(D + 3));
      if (opt.sub) {
        push(sc.add.text(bx, by + 11, opt.sub, {
          fontFamily: "Signika", fontSize: "12px", color: "#ffe9a8",
        }).setOrigin(0.5).setDepth(D + 3));
      }
      const z = push(sc.add.zone(bx, by, bw, bh).setDepth(D + 4).setInteractive({ cursor: "pointer" }));
      z.on("pointerup", () => {
        this._closeModal();
        this._emitUse(opt.val);
      });
    });

    const cy = py + PH - 24;
    const closeBtn = push(sc.add.text(width / 2, cy, "Đóng", {
      fontFamily: "Signika", fontSize: "15px", color: "#b02020", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 3).setInteractive({ cursor: "pointer" }));
    closeBtn.on("pointerup", () => this._closeModal());
  }

  _closeModal() {
    this._modalObjs.forEach(o => { try { o.destroy(); } catch (e) {} });
    this._modalObjs = [];
  }

  _emitUse(extra) {
    const sc = this.scene;
    const roomId = sc.gameRoomId ?? sc.room_id;
    sc.socket?.emit("game:use_char_skill", { room_id: roomId, ...extra });
  }

  playSkillFX(data) {
    const sc = this.scene;
    if (data.message) sc._showSkillToast?.(data.message);

    // Tìm tọa độ xuất phát và đích
    const fromPlayer = sc.players?.[data.user_id] || sc.playerSprites?.[data.user_id];
    let sx = fromPlayer?.x ?? sc.scale.width / 2;
    let sy = fromPlayer?.y ?? sc.scale.height / 2;

    let tx = sx, ty = sy;
    if (data.target_user_id) {
      const tp = sc.players?.[data.target_user_id] || sc.playerSprites?.[data.target_user_id];
      if (tp) { tx = tp.x; ty = tp.y; }
    } else if (data.target_cell_index !== null && data.target_cell_index !== undefined && sc.boardPath?.[data.target_cell_index]) {
      const pt = sc.boardPath[data.target_cell_index];
      tx = pt.x; ty = pt.y;
    }

    const animKey = data.fx_type === "water_ball" && sc.anims.exists("fx_water_ball")
      ? "fx_water_ball"
      : (sc.anims.exists("fx_fire_ball") ? "fx_fire_ball" : null);
    if (!animKey) return;

    const tex0 = animKey === "fx_water_ball" ? "water_ball_01" : "fire_ball_01";
    const fx = sc.add.sprite(sx, sy - 20, tex0).setDepth(350).setScale(0.45);
    fx.play(animKey);
    fx.setRotation(Phaser.Math.Angle.Between(sx, sy, tx, ty));

    sc.tweens.add({
      targets: fx,
      x: tx,
      y: ty - 15,
      duration: sx === tx && sy === ty ? 550 : 650,
      ease: "Quad.easeOut",
      onComplete: () => {
        sc.cameras.main.shake(180, 0.004);
        sc.tweens.add({
          targets: fx, scale: 0.9, alpha: 0, duration: 240,
          onComplete: () => fx.destroy(),
        });
      },
    });
  }

  _renderTraps() {
    const sc = this.scene;
    Object.values(this._trapMarkers).forEach(o => { try { o.destroy(); } catch (e) {} });
    this._trapMarkers = {};
    if (!sc.boardPath) return;

    Object.entries(this.traps || {}).forEach(([idx]) => {
      const pt = sc.boardPath[Number(idx)];
      if (!pt) return;
      const m = sc.add.text(pt.x, pt.y - 8, "☠", {
        fontFamily: "Signika", fontSize: "22px", color: "#88ff44", stroke: "#000000", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(65);
      this._trapMarkers[idx] = m;
    });
  }
}
