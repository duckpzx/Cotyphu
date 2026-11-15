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
  }

  async create() {
    const { width, height } = this.scale;
    setupClickSound(this);

    // ── Nền bục đá ──
    const bg = this.add.image(width / 2, height / 2, "rating-bg");
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

    // Tọa độ tâm mặt phẳng của 3 bục (đo chính xác theo asset nen_23.png)
    const podiumLayout = {
      2: {
        x: 272 * scaleX,
        podiumY: 412 * scaleY,
        rankLabel: "HẠNG 2",
        medal: "🥈",
        color: "#E2E8F0",
        stroke: 0xc0d0e0,
      },
      1: {
        x: 564 * scaleX,
        podiumY: 385 * scaleY,
        rankLabel: "QUÁN QUÂN",
        medal: "👑",
        color: "#FFD700",
        stroke: 0xffd700,
      },
      3: {
        x: 856 * scaleX,
        podiumY: 422 * scaleY,
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
      // Sau khi top 1 lên xong -> Bắt đầu pháo hoa đại tiệc
      this.time.delayedCall(400, () => this._fireworksBurst(width, height));
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

      // 4. Bắn pháo hoa nhỏ ăn mừng riêng cho nhân vật
      this._smallFirework(g.px, g.py - g.charH * 0.45);

      // Chờ một chút rồi đến lượt thứ hạng tiếp theo
      this.time.delayedCall(750, () => this._revealChain(order, groups, idx + 1, width, height));
    });
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
