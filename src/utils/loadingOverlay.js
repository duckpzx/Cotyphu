export function createLoadingOverlay(scene, text = "Đang tải dữ liệu...") {
  const { width, height } = scene.scale;
  const objs = [];

  // ===== Overlay =====
  const overlay = scene.add.graphics().setDepth(500).setAlpha(0);
  overlay.fillStyle(0x000000, 0.35);
  overlay.fillRect(0, 0, width, height);
  objs.push(overlay);

  // ===== Config =====
  // Thu nhỏ thanh + căn giữa cả cụm (bar + text) theo chiều dọc
  const barW  = 300;   // thu nhỏ từ 360 → 280
  const barH  = 18;    // thu nhỏ từ 24 → 16
  const barR  = barH / 2;
  const textH = 18;    // chiều cao ước tính của text (fontSize 14px)
  const gap   = 12;    // khoảng cách bar → text

  // Tổng chiều cao cụm = barH + gap + textH
  // Căn giữa dọc: cụm bắt đầu tại height/2 - totalH/2
  const totalH = barH + gap + textH;
  const barY   = height / 2 - totalH / 2;
  const barX   = width  / 2 - barW  / 2;

  // ===== Background =====
  const barBg = scene.add.graphics().setDepth(501).setAlpha(0);

  // nền tối xanh
  barBg.fillStyle(0x0d2a33, 0.95);
  barBg.fillRoundedRect(barX, barY, barW, barH, barR);

  // viền sáng nhẹ
  barBg.lineStyle(2, 0x7cefff, 0.5);
  barBg.strokeRoundedRect(barX, barY, barW, barH, barR);

  objs.push(barBg);

  // ===== Graphics =====
  const barFill = scene.add.graphics().setDepth(502).setAlpha(0);
  const stripeGfx = scene.add.graphics().setDepth(503).setAlpha(0);
  const maskShape = scene.add.graphics().setVisible(false);

  objs.push(barFill, stripeGfx, maskShape);

  const geoMask = maskShape.createGeometryMask();
  stripeGfx.setMask(geoMask);

  let progress = 0;
  let isDestroyed = false;

  const drawProgress = (p) => {
    barFill.clear();
    stripeGfx.clear();
    maskShape.clear();

    const fillW = Math.max(0, barW * p);
    if (fillW <= 0) return;

    // ===== FIX bo góc =====
    const radius = Math.min(barR, fillW / 2);

    // ===== Gradient chuẩn =====
    barFill.fillGradientStyle(
      0x00aac6,
      0x1eb2c6,
      0x0089a7,
      0x0089a9,
      1
    );

    barFill.fillRoundedRect(barX, barY, fillW, barH, radius);

    // ===== GLOW BAO QUANH =====

    // outer glow
    barFill.lineStyle(8, 0x66f6ff, 0.08);
    barFill.strokeRoundedRect(barX, barY, fillW, barH, radius);

    // mid glow
    barFill.lineStyle(4, 0x99f8ff, 0.15);
    barFill.strokeRoundedRect(barX, barY, fillW, barH, radius);

    // inner glow
    barFill.lineStyle(2, 0xffffff, 0.25);
    barFill.strokeRoundedRect(barX, barY, fillW, barH, radius);

    // soft overlay (ánh sáng nhẹ bên trong)
    barFill.fillStyle(0xffffff, 0.06);
    barFill.fillRoundedRect(barX, barY, fillW, barH, radius);

    // ===== Shadow dưới =====
    barFill.fillStyle(0x007a99, 0.25);
    barFill.fillRoundedRect(barX, barY + barH * 0.6, fillW, barH * 0.4, radius);

    // ===== Viền sáng =====
    barFill.lineStyle(1.5, 0x99f8ff, 0.6);
    barFill.strokeRoundedRect(barX, barY, fillW, barH, radius);

    // ===== Mask =====
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRoundedRect(barX, barY, fillW, barH, radius);

    // ===== Sọc đẹp hơn =====
    const stripeSpacing = 16;   // khoảng cách đều
    const stripeWidth   = 8;    // độ rộng mỗi sọc
    const angleOffset   = barH; // độ nghiêng

    stripeGfx.fillStyle(0xffffff, 0.12);

    // QUAN TRỌNG: bắt đầu từ 0 để sọc luôn đều
    for (let i = 0; i < fillW + barH; i += stripeSpacing) {
      const x = barX + i;

      stripeGfx.fillPoints([
        { x: x,                   y: barY },
        { x: x + stripeWidth,     y: barY },
        { x: x + stripeWidth + angleOffset, y: barY + barH },
        { x: x + angleOffset,     y: barY + barH },
      ], true);
    }
  };

  drawProgress(0);

  // ===== TEXT =====
  const loadingText = scene.add
    .text(width / 2, barY + barH + gap, `${text}0%`, {
      fontFamily: "Signika",
      fontSize: "17px",   // thu nhỏ từ 20px → 14px
      color: "#ffffff",
      fontStyle: "bold",
    })
    .setOrigin(0.5, 0)   // origin top-center để text không bị lệch
    .setDepth(504)
    .setAlpha(0);

  objs.push(loadingText);

  // ===== Loading tracking =====
  let totalAssets = 0;
  let loadedAssets = 0;

  const originalStart = scene.load.start.bind(scene.load);

  scene.load.start = function () {
    totalAssets = this.list.size;
    loadedAssets = 0;
    return originalStart();
  };

  scene.load.on("filecomplete", () => {
    if (!isDestroyed && totalAssets > 0) {
      loadedAssets++;
      progress = Math.min(loadedAssets / totalAssets, 0.99);
      drawProgress(progress);
      loadingText.setText(`${text}${Math.floor(progress * 100)}%`);
    }
  });

  // fallback
  const fallbackTimer = scene.time.addEvent({
    delay: 80,
    loop: true,
    callback: () => {
      if (!isDestroyed && totalAssets === 0) {
        const remaining = 0.95 - progress;
        progress = Math.min(progress + Math.max(0.005, remaining * 0.03), 0.95);
        drawProgress(progress);
        loadingText.setText(`${text}${Math.floor(progress * 100)}%`);
      }
    },
  });

  // ===== Fade in =====
  scene.tweens.add({
    targets: [overlay, barBg, barFill, stripeGfx, loadingText],
    alpha: 1,
    duration: 200,
    ease: "Sine.easeOut",
  });

  // ===== Update manual =====
  const updateProgress = (p) => {
    if (!isDestroyed) {
      progress = Math.min(p, 0.99);
      drawProgress(progress);
      loadingText.setText(`${text}${Math.floor(progress * 100)}%`);
    }
  };

  // ===== Destroy =====
  const destroy = (callback) => {
    isDestroyed = true;
    fallbackTimer.remove();

    // Nhảy 100% rồi fade out ngay, không delay
    progress = 1;
    drawProgress(1);
    loadingText.setText(`${text}100%`);

    scene.tweens.add({
      targets: [overlay, barBg, barFill, stripeGfx, loadingText],
      alpha: 0,
      duration: 250,
      ease: "Sine.easeOut",
      onComplete: () => {
        geoMask.destroy();
        objs.forEach((o) => o?.destroy());
        callback && callback();
      },
    });
  };

  return {
    overlay,
    progressBar: barFill,
    text: loadingText,
    updateProgress,
    destroy,
  };
}