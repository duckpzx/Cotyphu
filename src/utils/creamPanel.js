/**
 * creamPanel.js — Bộ hàm tái sử dụng (UI Design System) cho các khung Panel phong cách
 * "Nạp Tiền / Tạo Phòng" trên Phaser (giấy kem vàng, bóng mềm đa lớp, viền trắng + vàng nâu,
 * viền đứt nét vàng chuẩn CSS, tiêu đề pill vàng nổi lên trên mép, nút X bóng đồng bộ Chat).
 *
 * Dùng chung cho: FriendPanel.js, TarotUpgradeModal.js, và các modal Phaser khác.
 */

export function drawCreamInnerDash(g, L, T, W, H, R = 22) {
  const ins = 9;
  const cr = Math.max(8, R - 7);
  const dashLen = 5.5;
  const step = 10;
  g.lineStyle(1.8, 0xb8922e, 0.58);

  const drawD = (x1, y1, x2, y2) => {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const ang = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    for (let d = 0; d < dist; d += step) {
      g.beginPath();
      g.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
      g.lineTo(
        x1 + Math.cos(ang) * Math.min(d + dashLen, dist),
        y1 + Math.sin(ang) * Math.min(d + dashLen, dist)
      );
      g.strokePath();
    }
  };

  const drawArc = (cx, cy, r, a1, a2) => {
    const arcLen = r * Math.abs(a2 - a1);
    const steps = Math.max(2, Math.round(arcLen / step));
    for (let i = 0; i < steps; i++) {
      const s = a1 + (a2 - a1) * (i / steps);
      const e = a1 + (a2 - a1) * Math.min((i + dashLen / step) / steps, 1);
      g.beginPath();
      g.arc(cx, cy, r, s, e);
      g.strokePath();
    }
  };

  drawD(L + ins + cr, T + ins, L + W - ins - cr, T + ins);
  drawD(L + W - ins, T + ins + cr, L + W - ins, T + H - ins - cr);
  drawD(L + W - ins - cr, T + H - ins, L + ins + cr, T + H - ins);
  drawD(L + ins, T + H - ins - cr, L + ins, T + ins + cr);

  drawArc(L + ins + cr,     T + ins + cr,     cr, Math.PI,       Math.PI * 1.5);
  drawArc(L + W - ins - cr, T + ins + cr,     cr, Math.PI * 1.5, Math.PI * 2);
  drawArc(L + W - ins - cr, T + H - ins - cr, cr, 0,             Math.PI * 0.5);
  drawArc(L + ins + cr,     T + H - ins - cr, cr, Math.PI * 0.5, Math.PI);
}

/**
 * Vẽ khung Panel ngoài chuẩn phong cách Nạp Tiền / Tạo Phòng.
 */
export function drawCreamModalPanel(scene, {
  left,
  top,
  width,
  height,
  radius = 22,
  depth = 200,
  title = null,
  titleWidth = 260,
  titleHeight = 46,
  onClose = null,
  push = null,
} = {}) {
  const reg = (o) => (typeof push === "function" ? push(o) : o);

  // 1. Bóng đổ mềm nhiều lớp (khớp box-shadow CSS .topup-panel)
  const shadow = reg(scene.add.graphics().setDepth(depth));
  [
    { pad: 14, dy: 12, a: 0.08 },
    { pad: 9,  dy: 9,  a: 0.12 },
    { pad: 5,  dy: 6,  a: 0.16 },
    { pad: 2,  dy: 3,  a: 0.22 },
  ].forEach(({ pad, dy, a }) => {
    shadow.fillStyle(0x000000, a);
    shadow.fillRoundedRect(
      left - pad,
      top - pad + dy,
      width + pad * 2,
      height + pad * 2,
      radius + pad * 0.5
    );
  });

  // 2. Nền giấy kem vàng + viền trắng 3.8px + viền vàng nâu mảnh + nét đứt trong
  const bg = reg(scene.add.graphics().setDepth(depth + 1));
  bg.fillGradientStyle(0xfaf1d6, 0xfaf1d6, 0xedd9a3, 0xedd9a3, 1);
  bg.fillRoundedRect(left, top, width, height, radius);
  bg.lineStyle(3.8, 0xffffff, 1);
  bg.strokeRoundedRect(left, top, width, height, radius);
  bg.lineStyle(2, 0x9a6a1a, 0.48);
  bg.strokeRoundedRect(left - 2.6, top - 2.6, width + 5.2, height + 5.2, radius + 2.4);
  drawCreamInnerDash(bg, left, top, width, height, radius);

  // 3. Thanh tiêu đề pill vàng nổi lên trên mép (giống NẠP TIỀN)
  let titleText = null;
  if (title) {
    const tx = left + width / 2;
    const ty = top - titleHeight / 2;
    const tr = titleHeight / 2;

    const tg = reg(scene.add.graphics().setDepth(depth + 4));
    // Bóng pill
    tg.fillStyle(0x000000, 0.26);
    tg.fillRoundedRect(tx - titleWidth / 2 + 2, ty + 4, titleWidth, titleHeight, tr);
    // Gradient vàng mật ong
    tg.fillGradientStyle(0xf3c44d, 0xf3c44d, 0xb57714, 0xb57714, 1);
    tg.fillRoundedRect(tx - titleWidth / 2, ty, titleWidth, titleHeight, tr);
    // Gloss sáng phía trên
    tg.fillStyle(0xffffff, 0.36);
    tg.fillRoundedRect(tx - titleWidth / 2 + 12, ty + 4, titleWidth - 24, titleHeight * 0.34, tr - 6);
    // Viền nâu vàng đậm
    tg.lineStyle(2.5, 0x8a5610, 1);
    tg.strokeRoundedRect(tx - titleWidth / 2, ty, titleWidth, titleHeight, tr);

    titleText = reg(
      scene.add.text(tx, ty + titleHeight / 2, title, {
        fontFamily: "Signika",
        fontSize: "20px",
        color: "#4a2000",
        fontStyle: "bold",
        stroke: "#fff5c8",
        strokeThickness: 1.5,
      }).setOrigin(0.5).setDepth(depth + 5)
    );
  }

  // 4. Nút đóng X bóng đồng bộ Chat (assets/ui/shared/close.png) nhô ở góc trên phải
  let closeZone = null;
  if (typeof onClose === "function") {
    const closeR = 21;
    const closeX = left + width;
    const closeY = top;

    const mountCloseImg = () => {
      if (!scene?.sys?.isActive?.()) return;
      const closeBtn = reg(
        scene.add.image(closeX, closeY, "close_btn")
          .setDisplaySize(closeR * 2.15, closeR * 2.15)
          .setDepth(depth + 6)
      );
      closeZone?.on("pointerover", () => closeBtn.setAlpha(0.82));
      closeZone?.on("pointerout",  () => closeBtn.setAlpha(1));
    };

    closeZone = reg(
      scene.add.zone(closeX, closeY, closeR * 2.5, closeR * 2.5)
        .setInteractive({ cursor: "pointer" })
        .setDepth(depth + 7)
    );
    closeZone.on("pointerup", onClose);

    if (scene.textures.exists("close_btn")) {
      mountCloseImg();
    } else if (scene.load) {
      scene.load.image("close_btn", "assets/ui/shared/close.png");
      scene.load.once("filecomplete-image-close_btn", mountCloseImg);
      scene.load.start();
    }
  }

  return { shadow, bg, titleText, closeZone };
}

/**
 * Vẽ hộp nội dung kem sáng bo góc bên trong Panel (giống .topup-amount-box / .topup-main-box).
 */
export function drawCreamInnerBox(scene, {
  left,
  top,
  width,
  height,
  radius = 14,
  depth = 201,
  fillColor = 0xfffbee,
  fillAlpha = 0.92,
  borderColor = 0xc49a3a,
  borderAlpha = 0.5,
  push = null,
} = {}) {
  const reg = (o) => (typeof push === "function" ? push(o) : o);
  const g = reg(scene.add.graphics().setDepth(depth));
  g.fillStyle(fillColor, fillAlpha);
  g.fillRoundedRect(left, top, width, height, radius);
  g.lineStyle(1.5, borderColor, borderAlpha);
  g.strokeRoundedRect(left, top, width, height, radius);
  return g;
}
