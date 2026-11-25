import { setupClickSound, playOutSound } from "../utils/clickSound.js";
import { createLoadingOverlay } from "../utils/loadingOverlay.js";
import { SERVER_URL } from "../config.js";

// ─────────────────────────────────────────────────────────────────
//  RatingScene — Canvas 1128×636
//  Podium bục 1, 2, 3 căn chuẩn tâm mặt đĩa bục từ ảnh nen_23.png:
//    - Rank 2 (Trái): X = 272, podiumY = 412
//    - Rank 1 (Giữa): X = 564, podiumY = 385
//    - Rank 3 (Phải): X = 856, podiumY = 422
// ─────────────────────────────────────────────────────────────────
export default class RatingScene extends Phaser.Scene {
  constructor() {
    super("RatingScene");
  }

  preload() {
    this.load.image("rating-bg", "assets/nen_23.png");
    this.load.image("out", "assets/ui/shared/return.png");

    this._ratingSceneConfig = null;
    if (this.cache.json.exists("rating_scene_cfg")) {
      this.cache.json.remove("rating_scene_cfg");
    }
    this.load.json("rating_scene_cfg", `/api/assets/scene-config/rating?t=${Date.now()}`);
    this.load.once("filecomplete-json-rating_scene_cfg", (_k, _t, payload) => {
      const sc = payload?.scene;
      if (sc) {
        this._ratingSceneConfig = sc;
        if (sc.is_custom && sc.image_url) {
          const tk = `rating-bg-custom-${sc.version || 0}`;
          if (!this.textures.exists(tk)) this.load.image(tk, `${sc.image_url}?v=${sc.version || 0}`);
        }
      }
    });
  }

  async create() {
    const { width, height } = this.scale;
    setupClickSound(this);

    // ── Nền bục đá (hỗ trợ nền tùy biến từ Admin Studio) ──
    const rVer = this._ratingSceneConfig?.version || 0;
    const customBgKey = this._ratingSceneConfig?.is_custom ? `rating-bg-custom-${rVer}` : null;
    const bgKey = (customBgKey && this.textures.exists(customBgKey)) ? customBgKey : "rating-bg";
    const bg = this.add.image(width / 2, height / 2, bgKey);
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    const loading = createLoadingOverlay(this);

    // ── Nút Quay lại ──
    const backBtn = this.add
      .image(48, 48, "out")
      .setScale(1)
      .setDepth(200)
      .setInteractive({ cursor: "pointer" });

    backBtn.on("pointerdown", () => {
      playOutSound(this);
      this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
      this.time.delayedCall(160, () => {
        this.cameras.main.fadeOut(200);
        this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
      });
    });

    // ── Tiêu đề ──
    this.add
      .text(105, 55, "BẢNG VÀNG XẾP HẠNG", {
        fontFamily: "Signika",
        fontSize: "30px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#003388",
        strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
      })
      .setOrigin(0, 0.5)
      .setPadding(8, 6, 8, 6)
      .setDepth(200);

    // ── Lấy dữ liệu BXH từ server ──
    let ranking = [];
    try {
      const resp = await fetch(`${SERVER_URL}/ranking`);
      const json = await resp.json();
      if (json.success) ranking = json.ranking;
    } catch (e) {
      console.error("RatingScene fetch /ranking error:", e);
    }

    loading.destroy();

    if (!ranking.length) {
      this.add
        .text(width / 2, height / 2, "Chưa có dữ liệu thi đấu", {
          fontFamily: "Signika",
          fontSize: "26px",
          color: "#ffffff",
          stroke: "#000",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(10);
      return;
    }

    this._buildPodium(ranking, width, height);
  }

  // ══════════════════════════════════════════════════════════
  //  _buildPodium: Khởi tạo bục và các nhân vật
  // ══════════════════════════════════════════════════════════
  _buildPodium(ranking, width, height) {
    const CHAR_H = 210; // Chiều cao hiển thị của nhân vật
    const scaleX = width / 1128;
    const scaleY = height / 636;

    // Tọa độ tâm mặt phẳng của 3 bục (ưu tiên tọa độ custom từ Admin Studio nếu có)
    const customSpots = Array.isArray(this._ratingSceneConfig?.spots) && this._ratingSceneConfig.spots.length === 3
      ? this._ratingSceneConfig.spots
      : null;
    const s1 = customSpots ? { x: customSpots[0].x * width, y: customSpots[0].y * height } : { x: 564 * scaleX, y: 385 * scaleY };
    const s2 = customSpots ? { x: customSpots[1].x * width, y: customSpots[1].y * height } : { x: 272 * scaleX, y: 412 * scaleY };
    const s3 = customSpots ? { x: customSpots[2].x * width, y: customSpots[2].y * height } : { x: 856 * scaleX, y: 422 * scaleY };

    const podiumLayout = {
      2: {
        x: s2.x,
        podiumY: s2.y,
        rankLabel: "HẠNG 2",
        medal: "🥈",
        color: "#E2E8F0",
        stroke: 0xc0d0e0,
      },
      1: {
        x: s1.x,
        podiumY: s1.y,
        rankLabel: "QUÁN QUÂN",
        medal: "👑",
        color: "#FFD700",
        stroke: 0xffd700,
      },
      3: {
        x: s3.x,
        podiumY: s3.y,
        rankLabel: "HẠNG 3",
        medal: "🥉",
        color: "#F6AD55",
        stroke: 0xcd7f32,
      },
    };

    const dataMap = {};
    ranking.forEach((r) => {
      dataMap[r.rank] = r;
    });

    const groups = {};
    const revealOrder = [3, 2, 1]; // Reveal từ hạng 3 -> 2 -> 1

    revealOrder.forEach((rank) => {
      const data = dataMap[rank];
      const layout = podiumLayout[rank];
      if (!data || !layout) return;

      const px = layout.x;
      const py = layout.podiumY;

      // 1. Bóng đen dưới chân nhân vật (ngay trên mặt đĩa bục)
      const shadow = this.add
        .ellipse(px, py + 4, 76, 20, 0x000000, 0.45)
        .setDepth(15)
        .setScale(0.2)
        .setAlpha(0);

      // 2. Tính vị trí đỉnh đầu thực tế của nhân vật để đặt bảng tên
      // Trong sprite 900x900, chân ở Y=750 (cách đáy 150px = 16.67%)
      // Khi origin bottom (0.5, 1) chạm py, chân thực tế cần ở py => sprite Y = py + CHAR_H * 0.1667 ≈ py + 35px
      const targetSpriteY = py + 35;
      // Đỉnh đầu thực tế nằm ở: targetSpriteY - CHAR_H + (CHAR_H * 0.22) ≈ py - 129px
      const headY = py - 129;

      // 3. Bảng tên (Badge Container) căn giữa hoàn hảo
      const badgeY = headY - 42;
      const badgeContainer = this.add
        .container(px, badgeY)
        .setDepth(30)
        .setAlpha(0);

      // - Dòng 1: Huy hiệu và thứ hạng
      const rankText = this.add
        .text(0, -17, `${layout.medal} ${layout.rankLabel}`, {
          fontFamily: "Signika",
          fontSize: "13px",
          fontStyle: "bold",
          color: layout.color,
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5);

      // - Dòng 2: Tên người chơi
      const nameText = this.add
        .text(0, 2, data.username, {
          fontFamily: "Signika",
          fontSize: "16px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#0a192f",
          strokeThickness: 4,
          shadow: { offsetX: 1, offsetY: 2, color: "#000000", blur: 3, fill: true },
        })
        .setOrigin(0.5, 0.5);

      // - Dòng 3: Số trận thắng
      const winsCount = Number(data.wins || 0);
      const winsStr = winsCount === 1 ? "1 Trận Thắng" : `${winsCount} Trận Thắng`;
      const winsText = this.add
        .text(0, 20, `🏆 ${winsStr}`, {
          fontFamily: "Signika",
          fontSize: "12px",
          fontStyle: "bold",
          color: layout.color,
          stroke: "#000000",
          strokeThickness: 2.5,
        })
        .setOrigin(0.5, 0.5);

      // Tự động căn bề rộng khung đen bao quanh text
      const maxW = Math.max(rankText.width, nameText.width, winsText.width);
      const badgeW = Math.max(maxW + 36, 140);
      const badgeH = 62;

      // Vẽ Background bo tròn sang trọng căn giữa tuyệt đối quanh (0, 0)
      const bgGfx = this.add.graphics();
      bgGfx.fillStyle(0x07111e, 0.85);
      bgGfx.fillRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 10);
      bgGfx.lineStyle(2, layout.stroke, 0.95);
      bgGfx.strokeRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 10);

      // Thêm các thành phần vào container
      badgeContainer.add([bgGfx, rankText, nameText, winsText]);

      groups[rank] = {
        px,
        py,
        targetSpriteY,
        headY,
        badgeY,
        badgeContainer,
        shadow,
        data,
        charH: CHAR_H,
      };
    });

    this._revealChain(revealOrder, groups, 0, width, height);
  }

  // ══════════════════════════════════════════════════════════
  //  _revealChain: Hiển thị tuần tự từng hạng với hoạt ảnh
  // ══════════════════════════════════════════════════════════
  _revealChain(order, groups, idx, width, height) {
    if (idx >= order.length) {
      return;
    }

    const rank = order[idx];
    const g = groups[rank];
    if (!g) {
      this.time.delayedCall(200, () => this._revealChain(order, groups, idx + 1, width, height));
      return;
    }

    // 1. Spawn nhân vật và animate bóng đổ
    this._spawnCharacter(g, () => {
      // 2. Hiện bóng đổ dưới chân
      this.tweens.add({
        targets: g.shadow,
        alpha: 0.45,
        scaleX: 1,
        scaleY: 1,
        duration: 400,
        ease: "Power2.Out",
      });

      // 3. Hiện bảng tên với hiệu ứng trượt nhẹ
      g.badgeContainer.y = g.badgeY - 12;
      this.tweens.add({
        targets: g.badgeContainer,
        alpha: 1,
        y: g.badgeY,
        duration: 400,
        ease: "Back.Out",
      });

      // 4. Kích hoạt Magic Buff Aura dưới chân nhân vật (Top 1 Cam S+ | Top 2 Tím S | Top 3 Xanh dương A)
      this._spawnRankMagicAura(g.px, g.py, rank);

      // Chờ một chút rồi đến lượt thứ hạng tiếp theo
      this.time.delayedCall(650, () => this._revealChain(order, groups, idx + 1, width, height));
    });
  }

  // ══════════════════════════════════════════════════════════
  //  _spawnRankMagicAura: Hiệu ứng Magic Buff đa lớp dưới chân Top 1/2/3
  //  (Top 1: Vàng Cam S+ | Top 2: Tím S | Top 3: Xanh Dương A)
  // ══════════════════════════════════════════════════════════
  _spawnRankMagicAura(sx, sy, rank) {
    const PALETTES = {
      1: {
        id: "rank1_orange",
        core: "rgba(255, 245, 210, 0.96)",
        mid: "rgba(255, 152, 0, 0.82)",
        outer: "rgba(230, 81, 0, 0.36)",
        ring1: "rgba(255, 232, 140, 0.95)",
        ring2: "rgba(255, 165, 30, 0.82)",
        tickA: "rgba(255, 248, 220, 0.96)",
        tickB: "rgba(255, 145, 0, 0.88)",
        wisp: "rgba(255, 179, 64, 0.70)",
        beamMid: "rgba(255, 200, 90, 0.94)",
        beamBot: "rgba(255, 128, 0, 0.95)",
        beamFade: "rgba(230, 81, 0, 0)",
        sparkMid: "rgba(255, 204, 102, 0.92)",
        sparkOuter: "rgba(245, 158, 11, 0.38)",
        ribbon1: 0xffb703,
        ribbon2: 0xff7b00,
        scale: 1.05,
      },
      2: {
        id: "rank2_purple",
        core: "rgba(255, 225, 255, 0.95)",
        mid: "rgba(232, 74, 255, 0.80)",
        outer: "rgba(155, 38, 255, 0.36)",
        ring1: "rgba(255, 195, 255, 0.94)",
        ring2: "rgba(216, 110, 255, 0.80)",
        tickA: "rgba(255, 240, 255, 0.95)",
        tickB: "rgba(236, 72, 255, 0.86)",
        wisp: "rgba(244, 114, 255, 0.68)",
        beamMid: "rgba(245, 160, 255, 0.92)",
        beamBot: "rgba(217, 70, 239, 0.95)",
        beamFade: "rgba(168, 85, 247, 0)",
        sparkMid: "rgba(244, 140, 255, 0.90)",
        sparkOuter: "rgba(192, 38, 211, 0.36)",
        ribbon1: 0xe879f9,
        ribbon2: 0xc026d3,
        scale: 0.94,
      },
      3: {
        id: "rank3_blue",
        core: "rgba(226, 248, 255, 0.96)",
        mid: "rgba(56, 189, 248, 0.82)",
        outer: "rgba(2, 132, 199, 0.36)",
        ring1: "rgba(186, 235, 255, 0.95)",
        ring2: "rgba(56, 189, 248, 0.82)",
        tickA: "rgba(240, 250, 255, 0.96)",
        tickB: "rgba(14, 165, 233, 0.88)",
        wisp: "rgba(125, 211, 252, 0.70)",
        beamMid: "rgba(165, 230, 255, 0.94)",
        beamBot: "rgba(14, 165, 233, 0.95)",
        beamFade: "rgba(2, 132, 199, 0)",
        sparkMid: "rgba(125, 211, 252, 0.92)",
        sparkOuter: "rgba(2, 132, 199, 0.38)",
        ribbon1: 0x38bdf8,
        ribbon2: 0x0284c7,
        scale: 0.90,
      },
    };

    const pal = PALETTES[rank] || PALETTES[3];
    const S = pal.scale;
    const footY = sy + 6;

    const runeKey  = `rank_rune_${pal.id}`;
    const beamKey  = `rank_beam_${pal.id}`;
    const sparkKey = `rank_spark_${pal.id}`;

    if (!this.textures.exists(runeKey)) {
      const sz = 256;
      const cTex = this.textures.createCanvas(runeKey, sz, sz);
      const ctx = cTex.getContext();
      const cx = sz / 2, cy = sz / 2;

      const coreGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, sz * 0.48);
      coreGrad.addColorStop(0, pal.core);
      coreGrad.addColorStop(0.28, pal.mid);
      coreGrad.addColorStop(0.62, pal.outer);
      coreGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, sz, sz);

      ctx.strokeStyle = pal.ring1;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.37, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = pal.ring2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.28, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.strokeStyle = i % 2 === 0 ? pal.tickA : pal.tickB;
        ctx.lineWidth = i % 2 === 0 ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(sz * 0.29, 0);
        ctx.lineTo(sz * 0.36, 0);
        ctx.stroke();
        ctx.restore();
      }

      for (let k = 0; k < 3; k++) {
        const startA = (k / 3) * Math.PI * 2;
        ctx.strokeStyle = pal.wisp;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, sz * 0.42, startA, startA + 1.15);
        ctx.stroke();
      }
      cTex.refresh();
    }

    if (!this.textures.exists(beamKey)) {
      const bw = 32, bh = 128;
      const bTex = this.textures.createCanvas(beamKey, bw, bh);
      const ctx = bTex.getContext();
      const gV = ctx.createLinearGradient(0, 0, 0, bh);
      gV.addColorStop(0, "rgba(255,255,255,0)");
      gV.addColorStop(0.35, pal.beamMid);
      gV.addColorStop(0.7, pal.beamBot);
      gV.addColorStop(1, pal.beamFade);
      ctx.fillStyle = gV;
      ctx.fillRect(bw / 2 - 4, 0, 8, bh);

      const gCore = ctx.createLinearGradient(0, 0, 0, bh);
      gCore.addColorStop(0, "rgba(255,255,255,0)");
      gCore.addColorStop(0.45, "rgba(255,255,255,1)");
      gCore.addColorStop(0.78, pal.core);
      gCore.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gCore;
      ctx.fillRect(bw / 2 - 1.5, bh * 0.1, 3, bh * 0.8);
      bTex.refresh();
    }

    if (!this.textures.exists(sparkKey)) {
      const s = 24;
      const sTex = this.textures.createCanvas(sparkKey, s, s);
      const ctx = sTex.getContext();
      const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, pal.sparkMid);
      g.addColorStop(0.7, pal.sparkOuter);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      sTex.refresh();
    }

    // 1. Vòng ma pháp nằm phẳng trên mặt bục như bóng (xoay mượt không bị lật đứng)
    const groundContainer = this.add.container(sx, footY)
      .setDepth(16)
      .setScale(1, 0.40)
      .setAlpha(0);

    const runeOuter = this.add.image(0, 0, runeKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.82 * S)
      .setAlpha(0.88);
    const runeInner = this.add.image(0, 0, runeKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.54 * S)
      .setAlpha(0.76);
    groundContainer.add([runeOuter, runeInner]);

    this.tweens.add({ targets: groundContainer, alpha: 1, duration: 420, ease: "Power2.Out" });
    this.tweens.add({
      targets: runeOuter,
      alpha: { from: 0.72, to: 0.98 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // 2. Dải năng lượng xoáy 3D ôm quanh nhân vật (Back depth 18 / Front depth 22)
    const vortexBack  = this.add.graphics().setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
    const vortexFront = this.add.graphics().setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    let phase = rank * 1.4;

    const drawSwirl = () => {
      if (!vortexBack?.active || !vortexFront?.active) return;
      phase += 0.04;
      runeOuter.rotation += 0.011;
      runeInner.rotation -= 0.018;

      vortexBack.clear();
      vortexFront.clear();

      const ribbons = [
        { rx: 64 * S, ry: 21 * S, cy: sy - 22 * S, tilt: 0.13, speed: 1,     color: pal.ribbon1, width: 3.0 * S },
        { rx: 52 * S, ry: 17 * S, cy: sy - 50 * S, tilt: -0.17, speed: -1.3, color: pal.ribbon2, width: 2.3 * S },
      ];

      ribbons.forEach((rb, ri) => {
        const segs = 32;
        const arcLen = Math.PI * 1.4;
        const startA = phase * rb.speed + ri * 2.1;
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const a0 = startA + t0 * arcLen, a1 = startA + t1 * arcLen;
          const env = Math.sin(t0 * Math.PI);
          const x0 = sx + Math.cos(a0) * rb.rx;
          const y0 = rb.cy + Math.sin(a0) * rb.ry + Math.cos(a0) * rb.rx * rb.tilt;
          const x1 = sx + Math.cos(a1) * rb.rx;
          const y1 = rb.cy + Math.sin(a1) * rb.ry + Math.cos(a1) * rb.rx * rb.tilt;

          const targetG = Math.sin((a0 + a1) * 0.5) >= 0 ? vortexFront : vortexBack;
          targetG.lineStyle(rb.width * (0.55 + 0.6 * env), rb.color, 0.72 * env);
          targetG.beginPath();
          targetG.moveTo(x0, y0);
          targetG.lineTo(x1, y1);
          targetG.strokePath();

          targetG.lineStyle(rb.width * 0.34 * env, 0xffffff, 0.62 * env);
          targetG.beginPath();
          targetG.moveTo(x0, y0);
          targetG.lineTo(x1, y1);
          targetG.strokePath();
        }
      });
    };
    drawSwirl();
    this.time.addEvent({ delay: 20, loop: true, callback: drawSwirl });

    // 3. Các tia sáng năng lượng bay thẳng lên
    const beamCount = rank === 1 ? 8 : 6;
    for (let i = 0; i < beamCount; i++) {
      const isFront = i % 2 === 0;
      const beam = this.add.image(sx, footY, beamKey)
        .setDepth(isFront ? 22 : 18)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0.5, 1)
        .setAlpha(0);

      const launchBeam = () => {
        if (!beam?.active) return;
        const ox = Phaser.Math.FloatBetween(-50, 50) * S;
        const startY = footY + Phaser.Math.FloatBetween(-6, 6) * S;
        const scX = Phaser.Math.FloatBetween(0.32, 0.72) * S;
        const scY = Phaser.Math.FloatBetween(0.55, 1.1) * S;
        beam.setPosition(sx + ox, startY).setScale(scX, scY * 0.4).setAlpha(0);

        this.tweens.add({
          targets: beam,
          y: startY - Phaser.Math.FloatBetween(72, 130) * S,
          scaleY: scY,
          alpha: { from: 0, to: 0.88 },
          duration: Phaser.Math.Between(650, 1050),
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (!beam?.active) return;
            this.tweens.add({
              targets: beam,
              y: beam.y - 30 * S,
              alpha: 0,
              duration: Phaser.Math.Between(350, 520),
              ease: "Quad.easeIn",
              onComplete: () => this.time.delayedCall(Phaser.Math.Between(120, 650), launchBeam),
            });
          },
        });
      };
      this.time.delayedCall(i * 180, launchBeam);
    }

    // 4. Các đốm sáng mana bay xoáy lên quanh nhân vật
    const sparkCount = rank === 1 ? 12 : 8;
    for (let i = 0; i < sparkCount; i++) {
      const sp = this.add.image(sx, footY, sparkKey)
        .setDepth(22)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);

      const launchSpark = () => {
        if (!sp?.active) return;
        const ox = Phaser.Math.FloatBetween(-54, 54) * S;
        const oy = footY + Phaser.Math.FloatBetween(-8, 6) * S;
        const sc = Phaser.Math.FloatBetween(0.30, 0.72) * S;
        sp.setPosition(sx + ox, oy).setScale(sc).setAlpha(0);

        this.tweens.add({
          targets: sp,
          x: sx + ox + Phaser.Math.FloatBetween(-20, 20) * S,
          y: oy - Phaser.Math.FloatBetween(80, 145) * S,
          alpha: { from: 0.95, to: 0 },
          scale: sc * 0.24,
          duration: Phaser.Math.Between(1100, 1750),
          ease: "Sine.easeOut",
          onComplete: () => this.time.delayedCall(Phaser.Math.Between(80, 500), launchSpark),
        });
      };
      this.time.delayedCall(i * 150, launchSpark);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  _spawnCharacter: Hoạt ảnh bước lên bục của nhân vật
  // ══════════════════════════════════════════════════════════
  _spawnCharacter(g, onDone) {
    const { px, targetSpriteY, data, charH } = g;
    const charName = (data.characterName || "Dark_Oracle").replace(/ /g, "_");
    const skin = data.skin_id || 1;
    const fk0 = `${charName}_${skin}_idle_000`;

    // Độ lệch tâm X trong sprite 900x900 (Visual center ở 427.5 thay vì 450 => offset -22.5)
    // Để nhân vật đứng chính giữa bục: cộng bù 5px
    const spriteX = px + 5;

    const spawnSprite = () => {
      if (!this.textures.exists(fk0)) {
        // Fallback icon đại diện nếu chưa load được ảnh
        const ph = this.add
          .text(px, targetSpriteY, "👤", { fontSize: "56px" })
          .setOrigin(0.5, 1)
          .setDepth(20)
          .setAlpha(0);
        this.tweens.add({
          targets: ph,
          alpha: 1,
          y: { from: targetSpriteY + 70, to: targetSpriteY },
          duration: 500,
          ease: "Back.Out",
          onComplete: onDone,
        });
        return;
      }

      // Khởi tạo sprite nhân vật
      const sp = this.add
        .sprite(spriteX, targetSpriteY + 80, fk0)
        .setDisplaySize(charH, charH)
        .setOrigin(0.5, 1)
        .setDepth(20)
        .setAlpha(0);

      // Tạo Animation Idle mượt mà nếu chưa tồn tại
      const ak = `${charName}_${skin}_idle`;
      if (!this.anims.exists(ak)) {
        const frames = [];
        for (let i = 0; i < 18; i++) {
          const num = String(i).padStart(3, "0");
          const fk = `${charName}_${skin}_idle_${num}`;
          if (this.textures.exists(fk)) frames.push({ key: fk });
        }
        if (frames.length > 1) {
          this.anims.create({ key: ak, frames, frameRate: 12, repeat: -1 });
        }
      }

      if (this.anims.exists(ak)) {
        sp.play(ak);
      }

      // Tween slide từ dưới bục đáp chân lên mặt bục
      this.tweens.add({
        targets: sp,
        alpha: 1,
        y: { from: targetSpriteY + 80, to: targetSpriteY },
        duration: 580,
        ease: "Back.Out",
        onComplete: onDone,
      });
    };

    // Nạp toàn bộ 18 frame Idle của nhân vật nếu chưa có trong cache
    let needLoad = false;
    for (let i = 0; i < 18; i++) {
      const num = String(i).padStart(3, "0");
      const fk = `${charName}_${skin}_idle_${num}`;
      const path = `./assets/characters/${charName}/${charName}_${skin}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`;
      if (!this.textures.exists(fk)) {
        this.load.image(fk, path);
        needLoad = true;
      }
    }

    if (needLoad) {
      this.load.once("complete", spawnSprite);
      this.load.once("loaderror", spawnSprite);
      this.load.start();
    } else {
      spawnSprite();
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Hiệu ứng pháo hoa nhỏ khi từng nhân vật xuất hiện
  // ══════════════════════════════════════════════════════════
  _smallFirework(cx, cy) {
    const colors = [0xffd700, 0xff4488, 0x44ffcc, 0xff8800, 0xffffff, 0x88aaff];
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2;
      const speed = Phaser.Math.Between(70, 160);
      const col = Phaser.Utils.Array.GetRandom(colors);
      const p = this.add.circle(cx, cy, Phaser.Math.Between(4, 8), col).setDepth(50);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: Phaser.Math.Between(500, 900),
        ease: "Power2.Out",
        onComplete: () => p.destroy(),
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Hiệu ứng pháo hoa lớn ăn mừng sau khi đủ cả 3 người
  // ══════════════════════════════════════════════════════════
  _fireworksBurst(width, height) {
    if (!this.scene.isActive("RatingScene")) return;

    const pts = [
      { x: width * 0.18, y: height * 0.48 },
      { x: width * 0.5, y: height * 0.32 },
      { x: width * 0.82, y: height * 0.48 },
      { x: width * 0.34, y: height * 0.4 },
      { x: width * 0.66, y: height * 0.42 },
    ];
    const cols = [
      0xffd700, 0xff3399, 0x33ffcc, 0xff6600, 0xffffff, 0x66aaff, 0xaaff44, 0xff88ff,
    ];

    pts.forEach((pt, li) => {
      this.time.delayedCall(li * 200, () => {
        if (!this.scene.isActive("RatingScene")) return;
        for (let i = 0; i < 36; i++) {
          const angle = (i / 36) * Math.PI * 2;
          const speed = Phaser.Math.Between(90, 220);
          const col = Phaser.Utils.Array.GetRandom(cols);
          const p = this.add
            .circle(pt.x, pt.y, Phaser.Math.Between(4, 9), col)
            .setDepth(60);
          this.tweens.add({
            targets: p,
            x: pt.x + Math.cos(angle) * speed,
            y: pt.y + Math.sin(angle) * speed + Phaser.Math.Between(15, 50),
            alpha: 0,
            scaleX: 0.1,
            scaleY: 0.1,
            duration: Phaser.Math.Between(600, 1100),
            ease: "Power2.Out",
            onComplete: () => p.destroy(),
          });
        }

        // Tinh tú lấp lánh (Sparkle stars)
        for (let j = 0; j < 10; j++) {
          this.time.delayedCall(j * 40, () => {
            if (!this.scene.isActive("RatingScene")) return;
            const sx = pt.x + Phaser.Math.Between(-25, 25);
            const sy = pt.y + Phaser.Math.Between(-25, 25);
            const s = this.add
              .star(sx, sy, 5, 2, 7, Phaser.Utils.Array.GetRandom(cols))
              .setDepth(60)
              .setAlpha(0.9);
            this.tweens.add({
              targets: s,
              y: sy + Phaser.Math.Between(30, 80),
              alpha: 0,
              angle: 180,
              duration: Phaser.Math.Between(400, 700),
              ease: "Power1.Out",
              onComplete: () => s.destroy(),
            });
          });
        }
      });
    });

    // Lặp lại pháo hoa tuần hoàn
    this.time.delayedCall(2800, () => this._fireworksBurst(width, height));
  }
}
