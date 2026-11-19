// Map icon (assets/resources/Skin/PNG/1..50.png) phù hợp với từng loại kỹ năng
const PASSIVE_ICON_MAP = {
  start_bonus_percent:    35, // Tia lướt tốc độ xanh dương — Bước Chân Thần / Thưởng qua START
  build_discount_percent: 38, // Vòng đá kiến tạo nâu vàng — Giảm chi phí xây dựng
  rent_bonus_percent:     20, // Quả cầu vàng rực tài phú — Tăng tiền thuê thu được
  rent_discount_percent:  16, // Xoáy gió xanh bảo hộ — Giảm tiền thuê phải trả
  touch_tax_percent:      48, // Quả cầu điện vàng — Thuế va chạm
  revive_cash_percent:     4, // Ngọn lửa xanh hồi sinh — Hồi sinh / cứu nguy
  siphon_rent_percent:    28, // Hố đen tím hút năng lượng — Hút lợi tức
};

const ACTIVE_ICON_MAP = {
  weaken_cell_rent: 27, // Mũi tên xanh phát sáng — Mũi Tên Phá Thuế
  dice_bias:        43, // Ma pháp nguyên tử xanh — Định mệnh xúc xắc
  rent_shield:      19, // Quả cầu hộ thuẫn xanh — Khiên chắn tiền thuê
  push_back_enemy:  46, // Lốc xoáy xanh dương — Đẩy lùi đối thủ
  curse_enemy:      45, // Vòng xoáy ma thuật tím — Yểm lời nguyền
  soul_mark:        49, // Ấn ký sao tím rực — Dấu ấn linh hồn
  poison_trap:      31, // Vũng độc xanh bốc khói — Đặt bẫy độc
};

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

    // Đặt bên phải màn hình, gọn gàng kiểu ô icon RPG (Nội tại phía trên, Kỹ năng Nộ phía dưới)
    const pSize = Math.round(62 * S);
    const aSize = Math.round(86 * S);
    const marginRight = Math.round(28 * S);
    const bx = width - marginRight - aSize / 2;
    const by = height * 0.54;
    const py = by - aSize / 2 - pSize / 2 - Math.round(28 * S);
    const D = 120;

    this._pos = { bx, by, bw: aSize, bh: aSize, aSize, py, pSize, S, D };

    // ── Ô Icon Kỹ năng phụ / Nội tại (phía trên) ──
    this._passiveFrameG = sc.add.graphics().setDepth(D);
    this._passiveIconImg = sc.add.image(bx, py, "skill_icon_35")
      .setDisplaySize(pSize - 6 * S, pSize - 6 * S)
      .setDepth(D + 1)
      .setVisible(false);
    this._passiveDimOverlay = sc.add.graphics().setDepth(D + 2);
    this._passiveBorderG = sc.add.graphics().setDepth(D + 3);
    this._passiveCdTxt = sc.add.text(bx, py, "", {
      fontFamily: "Signika", fontSize: Math.max(13, Math.floor(17 * S)) + "px",
      color: "#38e8ff", fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(D + 4).setVisible(false);
    this._passiveSubTxt = sc.add.text(bx, py + pSize / 2 + 10 * S, "Nội tại", {
      fontFamily: "Signika", fontSize: Math.max(10, Math.floor(11.5 * S)) + "px",
      color: "#7dd3fc", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 4);
    this._passiveZone = sc.add.zone(bx, py, pSize + 8 * S, pSize + 18 * S)
      .setDepth(D + 5).setInteractive({ cursor: "pointer" });
    this._passiveZone.on("pointerover", () => this._showTooltip("passive"));
    this._passiveZone.on("pointerout",  () => this._hideTooltip());
    this._passiveZone.on("pointerup",   () => this._onPassivePress());

    // ── Ô Icon Kỹ năng Nộ (phía dưới) ──
    this._btnG = sc.add.graphics().setDepth(D);
    this._activeIconImg = sc.add.image(bx, by, "skill_icon_27")
      .setDisplaySize(aSize - 8 * S, aSize - 8 * S)
      .setDepth(D + 1)
      .setVisible(false);
    this._activeDimG = sc.add.graphics().setDepth(D + 2);
    this._activeBorderG = sc.add.graphics().setDepth(D + 3);
    this._barG = sc.add.graphics().setDepth(D + 4);

    this._energyTxt = sc.add.text(bx, by + aSize / 2 + 19 * S, "Nộ: 0/100", {
      fontFamily: "Signika", fontSize: Math.max(10, Math.floor(12 * S)) + "px",
      color: "#ffe9a8", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 4);

    // Mask bo góc cho 2 icon để nằm gọn trong khung RPG
    const pMaskG = sc.make.graphics({ add: false });
    pMaskG.fillStyle(0xffffff);
    pMaskG.fillRoundedRect(bx - (pSize - 6 * S) / 2, py - (pSize - 6 * S) / 2, pSize - 6 * S, pSize - 6 * S, 9 * S);
    this._passiveIconImg.setMask(pMaskG.createGeometryMask());

    const aMaskG = sc.make.graphics({ add: false });
    aMaskG.fillStyle(0xffffff);
    aMaskG.fillRoundedRect(bx - (aSize - 8 * S) / 2, by - (aSize - 8 * S) / 2, aSize - 8 * S, aSize - 8 * S, 12 * S);
    this._activeIconImg.setMask(aMaskG.createGeometryMask());

    this._zone = sc.add.zone(bx, by, aSize + 8 * S, aSize + 24 * S)
      .setDepth(D + 5).setInteractive({ cursor: "pointer" });
    this._zone.on("pointerover", () => this._showTooltip("active"));
    this._zone.on("pointerout",  () => this._hideTooltip());
    this._zone.on("pointerup",   () => this._onPress());

    this._objs.push(
      this._passiveFrameG, this._passiveIconImg, this._passiveDimOverlay, this._passiveBorderG,
      this._passiveCdTxt, this._passiveSubTxt, this._passiveZone, pMaskG,
      this._btnG, this._activeIconImg, this._activeDimG, this._activeBorderG,
      this._barG, this._energyTxt, this._zone, aMaskG
    );
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
    if (!sc.anims.exists("fx_water4_impact")) {
      const f = [];
      for (let i = 0; i <= 15; i++) {
        const k = `fx_water4_${String(i).padStart(2, "0")}`;
        if (sc.textures.exists(k)) f.push({ key: k });
      }
      if (f.length) sc.anims.create({ key: "fx_water4_impact", frames: f, frameRate: 24, repeat: 0 });
    }
    if (!sc.anims.exists("fx_flame2_impact")) {
      const f = [];
      for (let i = 0; i <= 15; i++) {
        const k = `fx_flame2_${String(i).padStart(2, "0")}`;
        if (sc.textures.exists(k)) f.push({ key: k });
      }
      if (f.length) sc.anims.create({ key: "fx_flame2_impact", frames: f, frameRate: 24, repeat: 0 });
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
    const { bx, by, aSize, py, pSize, S } = this._pos;
    const skill = this.myState.skill;
    const energy = Number(this.myState.energy || 0);
    const maxE = Number(this.myState.max_energy || 100);
    const ready = energy >= maxE && !this.myState.used_skill_this_turn && sc.isMyTurn && sc.canRoll;

    // ── Icon Nội tại / Kỹ năng phụ (phía trên) ──
    const pIconId = PASSIVE_ICON_MAP[skill?.passive_type] || 35;
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
    if (pg) {
      pg.clear();
      pg.fillStyle(0x000000, 0.48);
      pg.fillRoundedRect(bx - pSize / 2 + 2, py - pSize / 2 + 3, pSize, pSize, 12 * S);
      pg.fillStyle(0x0b1224, 0.96);
      pg.fillRoundedRect(bx - pSize / 2, py - pSize / 2, pSize, pSize, 12 * S);
    }

    const pBorder = this._passiveBorderG;
    if (pBorder) {
      pBorder.clear();
      const pBorderCol = pActive > 0 ? 0xfacc15 : pReady ? 0x38bdf8 : 0x64748b;
      pBorder.lineStyle((pActive > 0 || pReady ? 2.6 : 1.8) * S, pBorderCol, 0.98);
      pBorder.strokeRoundedRect(bx - pSize / 2, py - pSize / 2, pSize, pSize, 12 * S);
    }

    const pDim = this._passiveDimOverlay;
    if (pDim) {
      pDim.clear();
      if (pCd > 0) {
        pDim.fillStyle(0x000000, 0.65);
        pDim.fillRoundedRect(bx - pSize / 2 + 2 * S, py - pSize / 2 + 2 * S, pSize - 4 * S, pSize - 4 * S, 10 * S);
        this._passiveCdTxt?.setText(String(pCd)).setColor("#38e8ff").setVisible(true);
      } else if (pActive > 0) {
        this._passiveCdTxt?.setText("BẬT").setColor("#fde047").setVisible(true);
      } else {
        if (!pReady) {
          pDim.fillStyle(0x000000, 0.35);
          pDim.fillRoundedRect(bx - pSize / 2 + 2 * S, py - pSize / 2 + 2 * S, pSize - 4 * S, pSize - 4 * S, 10 * S);
        }
        this._passiveCdTxt?.setVisible(false);
      }
    }

    if (pActive > 0) {
      this._passiveSubTxt?.setText(`BẬT (${pActive}L)`).setColor("#fde047");
    } else if (pCd > 0) {
      this._passiveSubTxt?.setText(`Hồi ${pCd}L`).setColor("#38e8ff");
    } else if (pReady) {
      this._passiveSubTxt?.setText("Bật Nội Tại").setColor("#7dd3fc");
    } else {
      this._passiveSubTxt?.setText("Nội tại").setColor("#94a3b8");
    }

    // ── Icon Kỹ năng Nộ (phía dưới) ──
    const aIconId = ACTIVE_ICON_MAP[skill?.active_type] || 27;
    const aKey = `skill_icon_${aIconId}`;
    if (sc.textures.exists(aKey)) {
      this._activeIconImg.setTexture(aKey)
        .setDisplaySize(aSize - 8 * S, aSize - 8 * S)
        .setVisible(true);
    }

    const g = this._btnG;
    g.clear();
    g.fillStyle(0x000000, 0.48);
    g.fillRoundedRect(bx - aSize / 2 + 2, by - aSize / 2 + 4, aSize, aSize, 15 * S);
    g.fillStyle(0x0a1326, 0.96);
    g.fillRoundedRect(bx - aSize / 2, by - aSize / 2, aSize, aSize, 15 * S);

    const aDim = this._activeDimG;
    if (aDim) {
      aDim.clear();
      if (!ready) {
        aDim.fillStyle(0x000000, energy >= maxE ? 0.25 : 0.48);
        aDim.fillRoundedRect(bx - aSize / 2 + 3 * S, by - aSize / 2 + 3 * S, aSize - 6 * S, aSize - 6 * S, 12 * S);
      }
    }

    const aBorder = this._activeBorderG;
    if (aBorder) {
      aBorder.clear();
      const bCol = ready ? 0xffd54a : energy >= maxE ? 0x38bdf8 : 0x5588bb;
      aBorder.lineStyle((ready ? 3 : 2) * S, bCol, 1);
      aBorder.strokeRoundedRect(bx - aSize / 2, by - aSize / 2, aSize, aSize, 15 * S);
    }

    // Thanh năng lượng Nộ ngay dưới icon
    const barW = aSize;
    const barH = 8 * S;
    const barX = bx - barW / 2;
    const barY = by + aSize / 2 + 5 * S;
    const ratio = Math.max(0, Math.min(1, energy / maxE));

    const bg = this._barG;
    bg.clear();
    bg.fillStyle(0x000000, 0.65);
    bg.fillRoundedRect(barX, barY, barW, barH, 4 * S);
    if (ratio > 0) {
      bg.fillStyle(ready ? 0xffd54a : 0x38bdf8, 1);
      bg.fillRoundedRect(barX, barY, Math.max(6 * S, barW * ratio), barH, 4 * S);
    }

    if (ready) {
      this._energyTxt.setText("DÙNG NỘ!").setColor("#fde047");
    } else if (energy >= maxE && !this.myState.used_skill_this_turn) {
      this._energyTxt.setText(`${energy}/${maxE} • Chờ lượt`).setColor("#7dd3fc");
    } else {
      this._energyTxt.setText(`Nộ: ${energy}/${maxE}`).setColor("#e2e8f0");
    }
  }

  _showTooltip(which = "active") {
    this._hideTooltip();
    const skill = this.myState?.skill;
    if (!skill) return;
    const sc = this.scene;
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
    const anchorY = which === "passive" && typeof py === "number" ? py : by;
    const tx = Math.max(tw / 2 + 12 * S, bx - bw / 2 - tw / 2 - 14 * S);
    const ty = Math.max(th / 2 + 12 * S, Math.min(sc.scale.height - th / 2 - 12 * S, anchorY));

    const g = sc.add.graphics().setDepth(D + 20);
    g.fillStyle(0x0e1830, 0.94);
    g.fillRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12);
    g.lineStyle(2, 0xffe066, 0.9);
    g.strokeRoundedRect(tx - tw / 2, ty - th / 2, tw, th, 12);

    txt.setPosition(tx - tw / 2 + padX, ty - th / 2 + padY);

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

  _getSpriteByUid(uid) {
    const sc = this.scene;
    const myUid = Number(sc._myUserId?.());
    if (Number(uid) === myUid) return sc.player;
    return Object.values(sc.otherPlayers || {}).find(o => Number(o?.user_id) === Number(uid)) || null;
  }

  playImpactAt(x, y, element = "flame") {
    const sc = this.scene;
    const S = Math.min(sc.scale.width / 1920, sc.scale.height / 1080);
    const isWater = element === "water" || element === "water_ball";
    const animKey = isWater && sc.anims.exists("fx_water4_impact")
      ? "fx_water4_impact"
      : sc.anims.exists("fx_flame2_impact")
      ? "fx_flame2_impact"
      : null;
    if (!animKey) return;

    const firstTex = animKey === "fx_water4_impact" ? "fx_water4_00" : "fx_flame2_00";
    const srcImg = sc.textures.exists(firstTex) ? sc.textures.get(firstTex).getSourceImage() : null;
    const targetW = 135 * S;
    const impactScale = srcImg?.width ? (targetW / srcImg.width) : 0.35 * S;

    const impact = sc.add.sprite(x, y - 22 * S, firstTex)
      .setDepth(360)
      .setScale(impactScale)
      .setAlpha(0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    impact.play(animKey);
    sc.tweens.add({
      targets: impact,
      alpha: 0.18,
      duration: 580,
      ease: "Sine.easeOut",
    });
    impact.once("animationcomplete", () => {
      try { impact.destroy(); } catch (e) {}
    });
  }

  playImpactOnUser(uid, element = "flame") {
    const sp = this._getSpriteByUid(uid);
    if (sp) this.playImpactAt(sp.x, sp.y, element);
  }

  playImpactOnCell(cellIdx, element = "flame") {
    const sc = this.scene;
    const pt = sc.boardPath?.[Number(cellIdx)];
    if (!pt) return;
    this.playImpactAt(pt.x * sc.scale.width, pt.y * sc.scale.height, element);
  }

  playSkillFX(data) {
    const sc = this.scene;
    if (data.message) sc._showSkillToast?.(data.message);

    // Tìm tọa độ xuất phát và đích chuẩn trên màn hình
    const fromPlayer = this._getSpriteByUid(data.user_id);
    const sx = fromPlayer?.x ?? sc.scale.width / 2;
    const sy = fromPlayer?.y ?? sc.scale.height / 2;

    let tx = sx, ty = sy;
    if (data.target_user_id) {
      const tp = this._getSpriteByUid(data.target_user_id);
      if (tp) { tx = tp.x; ty = tp.y; }
    } else if (data.target_cell_index !== null && data.target_cell_index !== undefined && sc.boardPath?.[data.target_cell_index]) {
      const pt = sc.boardPath[data.target_cell_index];
      tx = pt.x * sc.scale.width;
      ty = pt.y * sc.scale.height;
    }

    const isWater = data.fx_type === "water_ball";
    const animKey = isWater && sc.anims.exists("fx_water_ball")
      ? "fx_water_ball"
      : (sc.anims.exists("fx_fire_ball") ? "fx_fire_ball" : null);
    if (!animKey) {
      this.playImpactAt(tx, ty, isWater ? "water" : "flame");
      return;
    }

    const S = Math.min(sc.scale.width / 1920, sc.scale.height / 1080);
    const tex0 = animKey === "fx_water_ball" ? "water_ball_01" : "fire_ball_01";
    const fx = sc.add.sprite(sx, sy - 20 * S, tex0)
      .setDepth(350)
      .setScale(0.28 * S)
      .setAlpha(0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    fx.play(animKey);
    fx.setRotation(Phaser.Math.Angle.Between(sx, sy, tx, ty));

    sc.tweens.add({
      targets: fx,
      x: tx,
      y: ty - 15 * S,
      duration: sx === tx && sy === ty ? 420 : 580,
      ease: "Quad.easeOut",
      onComplete: () => {
        sc.cameras.main.shake(120, 0.0025);
        this.playImpactAt(tx, ty, isWater ? "water" : "flame");
        sc.tweens.add({
          targets: fx, scale: 0.45 * S, alpha: 0, duration: 180,
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
