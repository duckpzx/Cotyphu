import { SERVER_URL } from "../../config.js";
import { getPlayerData, setPlayerData } from "../../server/utils/playerData.js";
import { drawCreamModalPanel, drawCreamInnerBox } from "../../utils/creamPanel.js";

const F = "Signika";
const D = 500;

function loadImages(scene, list) {
  return new Promise((resolve) => {
    const todo = list.filter(([k]) => !scene.textures.exists(k));
    if (!todo.length) return resolve();
    let left = todo.length;
    const done = () => { if (--left <= 0) finish(); };
    const finish = () => {
      scene.load.off("filecomplete", done);
      scene.load.off("loaderror", done);
      resolve();
    };
    todo.forEach(([k, p]) => scene.load.image(k, p));
    scene.load.on("filecomplete", done);
    scene.load.on("loaderror", done);
    scene.load.start();
  });
}

export async function openTarotUpgradeModal(scene) {
  if (scene._tarotModal) return;
  scene._tarotModal = true;

  const pd = getPlayerData(scene);
  const userId = pd?.user?.id || pd?.user_id;
  const { width, height } = scene.scale;
  const objs = [];
  const add = (o) => { objs.push(o); return o; };

  const loading = scene.add.text(width / 2, height / 2, "Đang tải...", {
    fontFamily: F, fontSize: "24px", color: "#ffffff", fontStyle: "bold",
    stroke: "#003388", strokeThickness: 5,
  }).setOrigin(0.5).setDepth(D + 100);

  let tarots = [], info = null;
  try {
    const [t, u] = await Promise.all([
      fetch(`${SERVER_URL}/tarots`).then(r => r.json()),
      fetch(`${SERVER_URL}/users/${userId}/tarots/upgrades`).then(r => r.json()),
    ]);
    tarots = t.data || [];
    info = u;
  } catch (e) { /* xử lý bên dưới */ }

  if (!info?.success || !tarots.length) {
    loading.setText("Không tải được dữ liệu. Hãy khởi động lại server.");
    scene.time.delayedCall(2000, () => { loading.destroy(); scene._tarotModal = false; });
    return;
  }

  await loadImages(scene, tarots.flatMap(t => [
    [`labtarot_s1_${t.id}`, `assets/resources/Tarot/Tarot_1/resize/thebai_${t.id}.png`],
    [`labtarot_s2_${t.id}`, `assets/resources/Tarot/Tarot_2/resize/thebai_${t.id}.png`],
  ]));
  loading.destroy();

  let levels = info.levels || {};
  let pity = info.pity || {};
  let ecoin = info.ecoin;
  const cfg = info.config;
  let selected = tarots[0].id;
  let tier = 0;
  let busy = false;
  let dyn = [];
  let previewImgs = [];
  let scrollX = 0;

  // ── Nền mờ + Panel chính (tái sử dụng creamPanel.js đồng bộ Nạp Tiền) ──
  add(scene.add.rectangle(width / 2, height / 2, width, height, 0x0c0a08, 0.62)
    .setDepth(D).setInteractive());

  const PW = Math.min(1090, width - 48);
  const PH = Math.min(620, height - 64);
  const px = width / 2 - PW / 2;
  const py = height / 2 - PH / 2 + 12;

  let wheelHandler = null;
  let pointerMoveHandler = null;
  let pointerUpHandler = null;
  let maskShape = null;

  const close = () => {
    if (wheelHandler) scene.input.off("wheel", wheelHandler);
    if (pointerMoveHandler) scene.input.off("pointermove", pointerMoveHandler);
    if (pointerUpHandler) scene.input.off("pointerup", pointerUpHandler);
    if (maskShape) { try { maskShape.destroy(); } catch {} }
    objs.forEach(o => { try { o.destroy(); } catch {} });
    dyn.forEach(o => { try { o.destroy(); } catch {} });
    scene._tarotModal = false;
  };

  drawCreamModalPanel(scene, {
    left: px,
    top: py,
    width: PW,
    height: PH,
    radius: 22,
    depth: D + 1,
    title: "NÂNG CẤP THẺ BÀI",
    titleWidth: 270,
    titleHeight: 46,
    onClose: () => { if (!busy) close(); },
    push: add,
  });

  // ── 2 khung kem sáng cân đối (Trái: Kho thẻ kéo ngang | Phải: Chi tiết nâng cấp) ──
  const innerTop = py + 38;
  const innerH   = PH - 60;
  const leftBoxX = px + 24;
  const leftBoxW = Math.round((PW - 64) * 0.44); // ~452px (hiển thị ~3 cột x 2 hàng, kéo ngang mượt)
  const rightBoxX = leftBoxX + leftBoxW + 16;
  const rightBoxW = px + PW - 24 - rightBoxX;    // ~558px rộng rãi

  drawCreamInnerBox(scene, {
    left: leftBoxX, top: innerTop, width: leftBoxW, height: innerH,
    radius: 14, depth: D + 2, fillColor: 0xfffbee, fillAlpha: 0.92, push: add,
  });
  drawCreamInnerBox(scene, {
    left: rightBoxX, top: innerTop, width: rightBoxW, height: innerH,
    radius: 14, depth: D + 2, fillColor: 0xfffbee, fillAlpha: 0.92, push: add,
  });

  // Tiêu đề nhỏ + hướng dẫn kéo ngang ở khung trái
  add(scene.add.text(leftBoxX + 16, innerTop + 18, "CHỌN THẺ BÀI", {
    fontFamily: F, fontSize: "14px", color: "#6b3b09", fontStyle: "bold",
  }).setOrigin(0, 0.5).setDepth(D + 3));
  add(scene.add.text(leftBoxX + leftBoxW - 16, innerTop + 18, "◀ Kéo ngang ▶", {
    fontFamily: F, fontSize: "12px", color: "#a16207", fontStyle: "bold",
  }).setOrigin(1, 0.5).setDepth(D + 3));

  // ── Lưới thẻ bài 2 hàng kéo ngang (giống BagScene) ────────────
  const vpX = leftBoxX + 12;
  const vpY = innerTop + 36;
  const vpW = leftBoxW - 24;
  const vpH = innerH - 64;

  const rows = 2;
  const gapX = 12;
  const gapY = 12;
  const ch   = Math.floor((vpH - gapY - 12) / rows);
  const cw   = Math.round(ch * 0.68);
  const numCols = Math.ceil(tarots.length / rows);
  const contentW = numCols * cw + Math.max(0, numCols - 1) * gapX + 12;
  const maxScrollX = Math.max(0, contentW - vpW);

  const gridContainer = add(scene.add.container(vpX, vpY).setDepth(D + 3));
  maskShape = scene.make.graphics({ add: false });
  maskShape.fillStyle(0xffffff);
  maskShape.fillRoundedRect(vpX, vpY, vpW, vpH, 10);
  gridContainer.setMask(maskShape.createGeometryMask());

  // Thanh cuộn ngang tinh tế ở đáy khung trái
  const sbY = innerTop + innerH - 16;
  const sbTrackW = vpW;
  const sbTrackG = add(scene.add.graphics().setDepth(D + 3));
  sbTrackG.fillStyle(0xc9a76a, 0.35);
  sbTrackG.fillRoundedRect(vpX, sbY, sbTrackW, 6, 3);
  const sbThumbG = add(scene.add.graphics().setDepth(D + 4));

  const updateScroll = (nextX) => {
    scrollX = Phaser.Math.Clamp(nextX, 0, maxScrollX);
    gridContainer.x = vpX - scrollX;
    sbThumbG.clear();
    if (maxScrollX > 0) {
      const thumbW = Math.max(48, Math.round((vpW / contentW) * sbTrackW));
      const thumbX = vpX + (scrollX / maxScrollX) * (sbTrackW - thumbW);
      sbThumbG.fillStyle(0xb8862b, 0.88);
      sbThumbG.fillRoundedRect(thumbX, sbY, thumbW, 6, 3);
    }
  };
  updateScroll(0);

  // Kéo ngang bằng chuột / cảm ứng & cuộn bánh xe
  let isDragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartScroll = 0;

  const dragZone = add(scene.add.zone(vpX + vpW / 2, vpY + vpH / 2, vpW, vpH)
    .setDepth(D + 6).setInteractive({ cursor: "grab" }));

  dragZone.on("pointerdown", (pointer) => {
    isDragging = true;
    dragMoved = false;
    dragStartX = pointer.x;
    dragStartScroll = scrollX;
  });

  pointerMoveHandler = (pointer) => {
    if (!isDragging || !pointer.isDown) return;
    const dx = dragStartX - pointer.x;
    if (Math.abs(dx) > 6) dragMoved = true;
    updateScroll(dragStartScroll + dx);
  };

  pointerUpHandler = (pointer) => {
    if (!isDragging) return;
    const wasDrag = dragMoved;
    isDragging = false;
    dragMoved = false;
    if (!wasDrag && !busy) {
      // Hit-test trực tiếp thẻ bài theo tọa độ click trong viewport
      const lx = pointer.x - (vpX - scrollX);
      const ly = pointer.y - vpY;
      if (pointer.x >= vpX && pointer.x <= vpX + vpW && pointer.y >= vpY && pointer.y <= vpY + vpH) {
        for (let i = 0; i < tarots.length; i++) {
          const col = Math.floor(i / rows);
          const row = i % rows;
          const cx = 6 + col * (cw + gapX);
          const cy = 6 + row * (ch + gapY);
          if (lx >= cx && lx <= cx + cw && ly >= cy && ly <= cy + ch) {
            selected = tarots[i].id;
            tier = 0;
            refresh();
            break;
          }
        }
      }
    }
  };

  wheelHandler = (pointer, _objs, deltaX, deltaY) => {
    if (pointer.x >= leftBoxX && pointer.x <= leftBoxX + leftBoxW && pointer.y >= innerTop && pointer.y <= innerTop + innerH) {
      const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      updateScroll(scrollX + delta * 0.65);
    }
  };

  scene.input.on("pointermove", pointerMoveHandler);
  scene.input.on("pointerup", pointerUpHandler);
  scene.input.on("wheel", wheelHandler);

  const tarotById = (id) => tarots.find(t => t.id === id);
  const lvOf = (id) => Number(levels[id]) >= 2 ? 2 : 1;

  const drawGrid = () => {
    gridContainer.removeAll(true);
    tarots.forEach((t, i) => {
      // Sắp xếp theo cột dọc 2 hàng (giống BagScene: kéo ngang cực tự nhiên)
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = 6 + col * (cw + gapX) + cw / 2;
      const y = 6 + row * (ch + gapY) + ch / 2;
      const sel = t.id === selected;
      const up = lvOf(t.id) >= 2;

      const sg = scene.add.graphics();
      sg.fillStyle(0x000000, sel ? 0.25 : 0.14);
      sg.fillRoundedRect(x - cw / 2 + 2, y - ch / 2 + 3, cw, ch, 11);
      sg.fillStyle(sel ? 0xfff3c4 : 0xf7eac6, 1);
      sg.fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 11);
      sg.lineStyle(sel ? 3.5 : 1.5, sel ? 0x0ea5e9 : 0xc9a76a, 1);
      sg.strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 11);

      const img = scene.add.image(x, y, `labtarot_s${up ? 2 : 1}_${t.id}`);
      img.setScale(Math.min((cw - 8) / img.width, (ch - 8) / img.height));

      const bw = 46, bh = 19, by = y + ch / 2 - 12;
      const badge = scene.add.graphics();
      badge.fillStyle(up ? 0xd4a030 : 0x0284c7, 1);
      badge.fillRoundedRect(x - bw / 2, by - bh / 2, bw, bh, 9.5);
      badge.lineStyle(1.5, 0xffffff, 0.9);
      badge.strokeRoundedRect(x - bw / 2, by - bh / 2, bw, bh, 9.5);
      const lv = scene.add.text(x, by, `Lv.${up ? 2 : 1}`, {
        fontFamily: F, fontSize: "11px", fontStyle: "bold",
        color: up ? "#4a2000" : "#ffffff",
      }).setOrigin(0.5);

      gridContainer.add([sg, img, badge, lv]);
    });
  };

  // ── Vùng phải (bên trong rightBox — rộng rãi, không tràn viền) ──
  const rx  = rightBoxX + 20;
  const rw  = rightBoxW - 40;
  const rcx = rightBoxX + rightBoxW / 2;

  const dtxt = (x, y, s, size, color, o = {}) => {
    const t = scene.add.text(x, y, s, {
      fontFamily: F, fontSize: size + "px", color, align: "center",
      wordWrap: { width: rw }, ...o,
    }).setOrigin(0.5).setDepth(D + 4);
    dyn.push(t); return t;
  };

  const pill = (bx, by, bw, bh, c1, c2, label, size, onClick, opts = {}) => {
    const br = bh / 2;
    const g = scene.add.graphics().setDepth(D + 3);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.22); g.fillRoundedRect(bx - bw / 2 + 2, by - bh / 2 + 4, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1); g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.36 : 0.22);
      g.fillRoundedRect(bx - bw / 2 + 8, by - bh / 2 + 3, bw - 16, bh * 0.38, br - 3);
      g.lineStyle(opts.thick ? 2.5 : 1.6, opts.border ?? 0xffffff, opts.dim ? 0.3 : 0.78);
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
    };
    draw(false);
    const t = scene.add.text(bx, by - (opts.sub ? 7 : 0), label, {
      fontFamily: F, fontSize: size + "px", fontStyle: "bold",
      color: opts.dim ? "#dddddd" : (opts.textColor || "#ffffff"),
      stroke: opts.noStroke ? undefined : "#00000088",
      strokeThickness: opts.noStroke ? 0 : 2.5,
      align: "center", wordWrap: { width: bw - 8 },
    }).setOrigin(0.5).setDepth(D + 4);
    dyn.push(g, t);
    if (opts.sub) {
      dyn.push(scene.add.text(bx, by + 9, opts.sub, {
        fontFamily: F, fontSize: Math.max(10, size - 3) + "px",
        color: opts.subColor || "#fff3b0",
        stroke: opts.noStroke ? undefined : "#00000088",
        strokeThickness: opts.noStroke ? 0 : 2,
      }).setOrigin(0.5).setDepth(D + 4));
    }
    const z = scene.add.zone(bx, by, bw, bh).setDepth(D + 8).setInteractive({ cursor: "pointer" });
    z.on("pointerover", () => draw(true));
    z.on("pointerout", () => draw(false));
    z.on("pointerup", onClick);
    dyn.push(z);
  };

  const showPreview = async () => {
    const id = selected;
    await loadImages(scene, [
      [`labtarot_lv1_${id}`, `assets/resources/Tarot/Tarot_1/thebai_${id}.png`],
      [`labtarot_lv2_${id}`, `assets/resources/Tarot/Tarot_2/thebai_${id}.png`],
    ]);
    if (id !== selected || !scene._tarotModal) return;
    previewImgs.forEach(o => o.destroy()); previewImgs = [];
    const h = 186, cy = innerTop + 152;
    const place = (key, x, dim, isTarget) => {
      if (!scene.textures.exists(key)) return;
      const im = scene.add.image(x, cy, key).setDepth(D + 4);
      im.setScale(h / im.height);
      if (dim) im.setTint(0x8a8a9a);
      const fr = scene.add.graphics().setDepth(D + 3);
      const w2 = im.displayWidth + 10, h2 = im.displayHeight + 10;
      fr.fillStyle(0x000000, 0.18); fr.fillRoundedRect(x - w2 / 2 + 2, cy - h2 / 2 + 3, w2, h2, 11);
      fr.fillStyle(isTarget ? 0xfff3c4 : 0xf7eac6, 1);
      fr.fillRoundedRect(x - w2 / 2, cy - h2 / 2, w2, h2, 11);
      fr.lineStyle(2.5, isTarget ? 0xd4a030 : 0x0ea5e9, 1);
      fr.strokeRoundedRect(x - w2 / 2, cy - h2 / 2, w2, h2, 11);
      previewImgs.push(fr, im);
    };
    place(`labtarot_lv1_${id}`, rcx - rw * 0.25, false, false);
    place(`labtarot_lv2_${id}`, rcx + rw * 0.25, lvOf(id) < 2, true);
    previewImgs.forEach(o => dyn.push(o));
  };

  const refresh = () => {
    dyn.forEach(o => { try { o.destroy(); } catch {} }); dyn = []; previewImgs = [];
    drawGrid();

    const t = tarotById(selected);
    const lv = lvOf(selected);
    const cd1 = cfg.lv1_cooldown?.[selected] ?? t.cooldown_seconds;
    const cd2 = cfg.lv2_cooldown?.[selected] ?? cd1;

    // Hàng tiêu đề trong khung phải: Tên thẻ (trái) + Ecoin badge xanh lá (phải — giống Nạp Tiền)
    dtxt(rx, innerTop + 26, t.name, 22, "#3f1d00", { fontStyle: "bold" }).setOrigin(0, 0.5);

    const ecoLabel = `Ecoin: ${ecoin.toLocaleString()}`;
    const ecoPillW = Math.max(145, ecoLabel.length * 8.5 + 24);
    const ecoPillX = rx + rw - ecoPillW;
    const ecoPillY = innerTop + 13;
    const ecoG = scene.add.graphics().setDepth(D + 3);
    ecoG.fillStyle(0x22c55e, 0.15);
    ecoG.fillRoundedRect(ecoPillX, ecoPillY, ecoPillW, 26, 13);
    ecoG.lineStyle(1.2, 0x22c55e, 0.45);
    ecoG.strokeRoundedRect(ecoPillX, ecoPillY, ecoPillW, 26, 13);
    dyn.push(ecoG);
    dtxt(ecoPillX + ecoPillW / 2, ecoPillY + 13, ecoLabel, 13, "#15803d", { fontStyle: "bold" });

    // Đường kẻ đứt mảnh dưới tiêu đề (giống Nạp Tiền)
    const divG = scene.add.graphics().setDepth(D + 3);
    divG.lineStyle(1, 0xb8922e, 0.4);
    for (let x = rx; x < rx + rw; x += 9) {
      divG.beginPath(); divG.moveTo(x, innerTop + 48); divG.lineTo(Math.min(x + 5, rx + rw), innerTop + 48); divG.strokePath();
    }
    dyn.push(divG);

    // Preview thẻ Lv.1 → Lv.2
    dtxt(rcx, innerTop + 152, "➜", 32, "#b8922e", { fontStyle: "bold" });
    dtxt(rcx - rw * 0.25, innerTop + 272, `Lv.1\nHồi chiêu ${cd1} lượt`, 13.5, "#5a3010", { fontStyle: "bold" });
    dtxt(rcx + rw * 0.25, innerTop + 272, `Lv.2\nHồi chiêu ${cd2} lượt`, 13.5, "#a06a00", { fontStyle: "bold" });
    showPreview();

    if (lv >= 2) {
      dtxt(rcx, innerTop + 390, "✦ Thẻ này đã đạt cấp tối đa (Lv.2) ✦", 20, "#a06a00", { fontStyle: "bold" });
      return;
    }

    const p = Number(pity[selected]) || 0;
    const chance = Math.min(100, cfg.base_rate + cfg.tiers[tier].bonus + p);
    const cost = cfg.base_cost + cfg.tiers[tier].cost;

    // 4 nút pill chọn mức may mắn (style xanh/kem đồng bộ Nạp Tiền)
    const gapBtn = 10;
    const bw = Math.floor((rw - gapBtn * 3) / 4);
    cfg.tiers.forEach((tr, i) => {
      const x = rx + i * (bw + gapBtn) + bw / 2;
      const y = innerTop + 332;
      const on = i === tier;
      pill(
        x, y, bw, 44,
        on ? 0x38bdf8 : 0xf3e4be,
        on ? 0x0284c7 : 0xdec68e,
        i === 0 ? "Không" : `+${tr.bonus}%`,
        14,
        () => { if (busy) return; tier = i; refresh(); },
        {
          sub: i === 0 ? "miễn phí" : `+${tr.cost.toLocaleString()}`,
          border: on ? 0x0284c7 : 0xc9a76a,
          thick: on,
          textColor: on ? "#ffffff" : "#5b3108",
          subColor: on ? "#e0f2fe" : "#7c4d14",
          noStroke: !on,
        }
      );
    });
    dtxt(rcx, innerTop + 368, "Dùng Ecoin để tăng may mắn khi nâng cấp", 12, "#8b5e1a");

    // Thanh tỉ lệ thành công
    const barW = rw - 16, barX = rx + 8, barY = innerTop + 388;
    const bar = scene.add.graphics().setDepth(D + 3);
    bar.fillStyle(0x6a4a1a, 0.45); bar.fillRoundedRect(barX, barY, barW, 24, 12);
    bar.fillGradientStyle(0x4ade80, 0x4ade80, 0x16a34a, 0x16a34a, 1);
    bar.fillRoundedRect(barX, barY, Math.max(24, barW * chance / 100), 24, 12);
    bar.fillStyle(0xffffff, 0.28); bar.fillRoundedRect(barX + 8, barY + 3, Math.max(10, barW * chance / 100 - 16), 7, 3);
    bar.lineStyle(1.8, 0xffffff, 0.85); bar.strokeRoundedRect(barX, barY, barW, 24, 12);
    dyn.push(bar);
    dtxt(rcx, barY + 12, `Tỉ lệ thành công: ${chance}%`, 13, "#ffffff", { fontStyle: "bold", stroke: "#00000099", strokeThickness: 3 });

    dtxt(rcx, innerTop + 432, p > 0
      ? `May mắn tích luỹ: +${p}% (từ lần thất bại trước)`
      : "Thất bại không mất thẻ, tích luỹ +15% cho lần sau", 12, "#7c4d14");
    dtxt(rcx, innerTop + 450, "10% Đại Thành Công: hoàn 50% chi phí", 12, "#7c4d14");

    // Nút NÂNG CẤP nằm gọn bên trong đáy khung kem phải
    const can = ecoin >= cost;
    pill(
      rcx, innerTop + innerH - 42, Math.min(280, rw - 40), 50,
      can ? 0x4ade80 : 0x9a9a9a,
      can ? 0x16a34a : 0x6a6a6a,
      "NÂNG CẤP LÊN LV.2", 17,
      () => doUpgrade(cost, can),
      { sub: `${cost.toLocaleString()} Ecoin`, dim: !can, border: can ? 0x15803d : 0xffffff }
    );
  };

  const toast = (msg, color = "#ffffff") => {
    const tt = scene.add.text(width / 2, py + PH - 8, msg, {
      fontFamily: F, fontSize: "20px", color, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
      backgroundColor: "#4a2000cc", padding: { x: 16, y: 8 },
    }).setOrigin(0.5, 1).setDepth(D + 200);
    scene.time.delayedCall(2200, () => tt.destroy());
  };

  const doUpgrade = async (cost, can) => {
    if (busy) return;
    if (!can) return toast("Không đủ Ecoin!", "#ff9a8a");
    busy = true;
    const orb = scene.add.text(rcx, innerTop + 152, "✦", {
      fontFamily: F, fontSize: "110px", color: "#fff3b0", stroke: "#d4a030", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(D + 100);
    const spin = scene.tweens.add({ targets: orb, angle: 360, scale: 1.5, duration: 700, repeat: -1 });
    let r;
    try {
      const res = await fetch(`${SERVER_URL}/users/${userId}/tarots/upgrade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarot_id: selected, luck_tier: tier }),
      });
      r = await res.json();
    } catch (e) { r = { success: false, message: "Lỗi kết nối" }; }
    await new Promise(rs => scene.time.delayedCall(1100, rs));
    spin.stop(); orb.destroy();

    if (!r.success) {
      busy = false;
      toast(r.message || "Nâng cấp thất bại", "#ff9a8a");
      return;
    }
    levels = r.levels; pity = r.pity; ecoin = r.ecoin;
    try {
      const data = getPlayerData(scene);
      if (data?.user) { data.user.ecoin = r.ecoin; data.user.tarot_levels = r.levels; setPlayerData(scene, data); }
    } catch (e) {}

    if (r.upgraded) {
      scene.cameras.main.flash(400, 255, 230, 120);
      toast(r.critical ? `ĐẠI THÀNH CÔNG! Hoàn ${r.refund.toLocaleString()} Ecoin` : "Nâng cấp thành công!", "#ffe066");
    } else {
      scene.cameras.main.shake(250, 0.006);
      toast(`Thất bại... May mắn tích luỹ +15% (hiện ${r.new_pity}%)`, "#ffc88a");
    }
    busy = false;
    tier = 0;
    refresh();
  };

  refresh();
}
