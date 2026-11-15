import { SERVER_URL } from "../../config.js";
import { getPlayerData, setPlayerData } from "../../server/utils/playerData.js";

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

// ── Panel kem bo góc + viền đứt nét: cùng phong cách Túi đồ / Shop / Thẻ bài ──
function drawStyledPanel(g, left, top, w, h, radius) {
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(left + 6, top + 6, w, h, radius);
  g.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xf6eac6, 0xf6eac6, 1);
  g.fillRoundedRect(left, top, w, h, radius);
  g.lineStyle(3, 0xffffff, 1);
  g.strokeRoundedRect(left, top, w, h, radius);
  g.fillStyle(0xffffff, 0.18);
  g.fillRoundedRect(left + 6, top + 4, w - 12, 20, 8);

  const ins = 10, cr = radius - 4;
  g.lineStyle(1.5, 0xb8922e, 0.5);
  const dash = (x1, y1, x2, y2) => {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const ang = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    for (let d = 0; d < dist; d += 14) {
      g.beginPath();
      g.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
      g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
      g.strokePath();
    }
  };
  const arc = (cx, cy, r, a0, a1) => {
    const steps = Math.ceil((r * Math.abs(a1 - a0)) / 14);
    for (let i = 0; i < steps; i++) {
      const s = a0 + (a1 - a0) * (i / steps);
      const e = a0 + (a1 - a0) * Math.min((i + 0.57) / steps, 1);
      g.beginPath(); g.arc(cx, cy, r, s, e); g.strokePath();
    }
  };
  dash(left + ins + cr, top + ins, left + w - ins - cr, top + ins);
  dash(left + w - ins, top + ins + cr, left + w - ins, top + h - ins - cr);
  dash(left + w - ins - cr, top + h - ins, left + ins + cr, top + h - ins);
  dash(left + ins, top + h - ins - cr, left + ins, top + ins + cr);
  arc(left + ins + cr, top + ins + cr, cr, Math.PI, Math.PI * 1.5);
  arc(left + w - ins - cr, top + ins + cr, cr, Math.PI * 1.5, Math.PI * 2);
  arc(left + w - ins - cr, top + h - ins - cr, cr, 0, Math.PI * 0.5);
  arc(left + ins + cr, top + h - ins - cr, cr, Math.PI * 0.5, Math.PI);
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
  const gridObjs = [];

  // ── Nền mờ + panel chính ─────────────────────────────────────
  add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
    .setDepth(D).setInteractive());

  const PW = Math.min(1100, width - 40), PH = Math.min(640, height - 30);
  const px = width / 2 - PW / 2, py = height / 2 - PH / 2;
  const mainG = add(scene.add.graphics().setDepth(D + 1));
  drawStyledPanel(mainG, px, py, PW, PH, 18);

  // Tiêu đề dạng viên thuốc vàng (như hộp thoại Shop)
  const tg = add(scene.add.graphics().setDepth(D + 2));
  const TW = 240, TH = 40, tx = width / 2, ty = py + 6;
  tg.fillStyle(0xd4a030, 1); tg.fillRoundedRect(tx - TW / 2, ty, TW, TH, 20);
  tg.fillStyle(0xfff5b0, 0.4); tg.fillRoundedRect(tx - TW / 2 + 3, ty + 2, TW - 6, 16, 12);
  tg.lineStyle(2.5, 0x8b5e1a, 1); tg.strokeRoundedRect(tx - TW / 2, ty, TW, TH, 20);
  add(scene.add.text(tx, ty + TH / 2, "NÂNG CẤP THẺ BÀI", {
    fontFamily: F, fontSize: "20px", color: "#4a2000", fontStyle: "bold",
  }).setOrigin(0.5).setDepth(D + 3));

  // Nút đóng tròn đỏ
  const cg = add(scene.add.graphics().setDepth(D + 2));
  const cX = px + PW - 34, cY = py + 34;
  cg.fillStyle(0x000000, 0.3); cg.fillCircle(cX + 2, cY + 3, 18);
  cg.fillGradientStyle(0xff6a5a, 0xff6a5a, 0xc0281c, 0xc0281c, 1); cg.fillCircle(cX, cY, 18);
  cg.fillStyle(0xffffff, 0.3); cg.fillEllipse(cX, cY - 7, 22, 10);
  cg.lineStyle(2, 0xffffff, 0.8); cg.strokeCircle(cX, cY, 18);
  add(scene.add.text(cX, cY, "✕", {
    fontFamily: F, fontSize: "20px", color: "#ffffff", fontStyle: "bold",
    stroke: "#00000099", strokeThickness: 3,
  }).setOrigin(0.5).setDepth(D + 3));
  const cz = add(scene.add.zone(cX, cY, 40, 40).setDepth(D + 4).setInteractive({ cursor: "pointer" }));
  const close = () => {
    objs.forEach(o => { try { o.destroy(); } catch (e) {} });
    dyn.forEach(o => { try { o.destroy(); } catch (e) {} });
    gridObjs.forEach(o => { try { o.destroy(); } catch (e) {} });
    scene._tarotModal = false;
  };
  cz.on("pointerup", () => { if (!busy) close(); });

  // ── Hộp xanh chứa lưới thẻ (giống khung slot ở màn Thẻ bài) ──
  const cols = 5, cw = 96, ch = 144, gap = 10, pad = 16;
  const boxW = cols * cw + (cols - 1) * gap + pad * 2;
  const boxH = 2 * ch + gap + 8 + pad * 2;
  const boxX = px + 28, boxY = py + 64;
  const bg = add(scene.add.graphics().setDepth(D + 2));
  bg.fillStyle(0x000000, 0.3); bg.fillRoundedRect(boxX + 4, boxY + 6, boxW, boxH, 16);
  bg.fillGradientStyle(0x1a8fc0, 0x1a8fc0, 0x0a4a7a, 0x0a4a7a, 1);
  bg.fillRoundedRect(boxX, boxY, boxW, boxH, 16);
  bg.fillStyle(0xffffff, 0.18); bg.fillRoundedRect(boxX + 6, boxY + 5, boxW - 12, boxH * 0.12, 12);
  bg.lineStyle(3, 0x44ccff, 0.9); bg.strokeRoundedRect(boxX, boxY, boxW, boxH, 16);
  bg.lineStyle(1.5, 0xffffff, 0.35); bg.strokeRoundedRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12, 13);

  const tarotById = (id) => tarots.find(t => t.id === id);
  const lvOf = (id) => Number(levels[id]) >= 2 ? 2 : 1;

  const drawGrid = () => {
    gridObjs.forEach(o => o.destroy()); gridObjs.length = 0;
    tarots.forEach((t, i) => {
      const x = boxX + pad + (i % cols) * (cw + gap) + cw / 2;
      const y = boxY + pad + 4 + Math.floor(i / cols) * (ch + gap) + ch / 2;
      const sel = t.id === selected;
      const sg = scene.add.graphics().setDepth(D + 3);
      sg.fillStyle(0x000000, 0.35); sg.fillRoundedRect(x - cw / 2 + 2, y - ch / 2 + 3, cw, ch, 10);
      sg.fillGradientStyle(0x1a7ab8, 0x1a7ab8, 0x0a3a6a, 0x0a3a6a, 1);
      sg.fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 10);
      if (sel) { sg.fillStyle(0x000000, 0.0); }
      sg.lineStyle(sel ? 4 : 2.5, sel ? 0xffe066 : 0x44ccff, 1);
      sg.strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 10);
      const up = lvOf(t.id) >= 2;
      const img = scene.add.image(x, y, `labtarot_s${up ? 2 : 1}_${t.id}`).setDepth(D + 4);
      img.setScale(Math.min((cw - 4) / img.width, (ch - 4) / img.height));
      // nhãn cấp dạng huy hiệu
      const bw = 44, bh = 18, by = y + ch / 2 - 10;
      const badge = scene.add.graphics().setDepth(D + 5);
      badge.fillStyle(up ? 0xd4a030 : 0x2a6aa8, 1);
      badge.fillRoundedRect(x - bw / 2, by - bh / 2, bw, bh, 9);
      badge.lineStyle(1.5, 0xffffff, 0.85); badge.strokeRoundedRect(x - bw / 2, by - bh / 2, bw, bh, 9);
      const lv = scene.add.text(x, by, up ? "Lv.2" : "Lv.1", {
        fontFamily: F, fontSize: "12px", fontStyle: "bold",
        color: up ? "#4a2000" : "#ffffff",
      }).setOrigin(0.5).setDepth(D + 6);
      const zone = scene.add.zone(x, y, cw, ch).setDepth(D + 7).setInteractive({ cursor: "pointer" });
      zone.on("pointerup", () => { if (busy) return; selected = t.id; tier = 0; refresh(); });
      gridObjs.push(sg, img, badge, lv, zone);
    });
  };

  // ── Vùng phải ────────────────────────────────────────────────
  const rx = boxX + boxW + 24;
  const rw = px + PW - 28 - rx;
  const rcx = rx + rw / 2;

  const dtxt = (x, y, s, size, color, o = {}) => {
    const t = scene.add.text(x, y, s, {
      fontFamily: F, fontSize: size + "px", color, align: "center",
      wordWrap: { width: rw }, ...o,
    }).setOrigin(0.5).setDepth(D + 4);
    dyn.push(t); return t;
  };

  // Nút viên thuốc có bóng + gloss như _buildActionBtn
  const pill = (bx, by, bw, bh, c1, c2, label, size, onClick, opts = {}) => {
    const br = bh / 2;
    const g = scene.add.graphics().setDepth(D + 3);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 5, bw, bh, br);
      g.fillGradientStyle(c1, c1, c2, c2, 1); g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      g.fillStyle(0xffffff, hover ? 0.38 : 0.22);
      g.fillRoundedRect(bx - bw / 2 + 8, by - bh / 2 + 4, bw - 16, bh * 0.38, br - 3);
      g.lineStyle(opts.thick ? 3 : 2, opts.border ?? 0xffffff, opts.dim ? 0.3 : 0.7);
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
    };
    draw(false);
    const t = scene.add.text(bx, by - (opts.sub ? 7 : 0), label, {
      fontFamily: F, fontSize: size + "px", fontStyle: "bold",
      color: opts.dim ? "#cccccc" : "#ffffff", stroke: "#00000099", strokeThickness: 3,
      align: "center", wordWrap: { width: bw - 8 },
    }).setOrigin(0.5).setDepth(D + 4);
    dyn.push(g, t);
    if (opts.sub) {
      dyn.push(scene.add.text(bx, by + 9, opts.sub, {
        fontFamily: F, fontSize: Math.max(10, size - 3) + "px", color: "#fff3b0",
        stroke: "#00000099", strokeThickness: 2,
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
    const h = 200, cy = py + 205;
    const place = (key, x, dim) => {
      if (!scene.textures.exists(key)) return;
      const im = scene.add.image(x, cy, key).setDepth(D + 4);
      im.setScale(h / im.height);
      if (dim) im.setTint(0x8a8a9a);
      const fr = scene.add.graphics().setDepth(D + 3);
      const w2 = im.displayWidth + 10, h2 = im.displayHeight + 10;
      fr.fillStyle(0x000000, 0.25); fr.fillRoundedRect(x - w2 / 2 + 3, cy - h2 / 2 + 4, w2, h2, 10);
      fr.fillGradientStyle(0x1a8fc0, 0x1a8fc0, 0x0a4a7a, 0x0a4a7a, 1);
      fr.fillRoundedRect(x - w2 / 2, cy - h2 / 2, w2, h2, 10);
      fr.lineStyle(2.5, 0x44ccff, 1); fr.strokeRoundedRect(x - w2 / 2, cy - h2 / 2, w2, h2, 10);
      previewImgs.push(fr, im);
    };
    place(`labtarot_lv1_${id}`, rcx - rw * 0.28, false);
    place(`labtarot_lv2_${id}`, rcx + rw * 0.28, lvOf(id) < 2);
    previewImgs.forEach(o => dyn.push(o));
  };

  const refresh = () => {
    dyn.forEach(o => { try { o.destroy(); } catch (e) {} }); dyn = []; previewImgs = [];
    drawGrid();

    const t = tarotById(selected);
    const lv = lvOf(selected);
    const cd1 = cfg.lv1_cooldown?.[selected] ?? t.cooldown_seconds;
    const cd2 = cfg.lv2_cooldown?.[selected] ?? cd1;

    dtxt(rcx, py + 76, t.name, 24, "#3a1a00", { fontStyle: "bold" });
    dtxt(rcx, py + 205, "➜", 34, "#b8922e", { fontStyle: "bold" });
    dtxt(rcx - rw * 0.28, py + 328, `Lv.1\nHồi chiêu ${cd1} lượt`, 14, "#5a3010", { fontStyle: "bold" });
    dtxt(rcx + rw * 0.28, py + 328, `Lv.2\nHồi chiêu ${cd2} lượt`, 14, "#a06a00", { fontStyle: "bold" });
    showPreview();

    // Ecoin hiện có
    dtxt(rx + rw - 4, py + PH - 26, `Ecoin: ${ecoin.toLocaleString()}`, 15, "#3a7a2a", { fontStyle: "bold" }).setOrigin(1, 0.5);

    if (lv >= 2) {
      dtxt(rcx, py + 440, "Thẻ này đã đạt cấp tối đa", 22, "#a06a00", { fontStyle: "bold" });
      return;
    }

    const p = Number(pity[selected]) || 0;
    const chance = Math.min(100, cfg.base_rate + cfg.tiers[tier].bonus + p);
    const cost = cfg.base_cost + cfg.tiers[tier].cost;

    // Chọn mức may mắn
    const bw = Math.floor((rw - 24) / 4);
    cfg.tiers.forEach((tr, i) => {
      const x = rx + i * (bw + 8) + bw / 2, y = py + 382;
      const on = i === tier;
      pill(x, y, bw, 44, on ? 0x1a9fd4 : 0xd8c58a, on ? 0x0a5e96 : 0xb8a060,
        i === 0 ? "Không" : `+${tr.bonus}%`, 14, () => { if (busy) return; tier = i; refresh(); },
        { sub: i === 0 ? "miễn phí" : `+${tr.cost.toLocaleString()}`, border: on ? 0xffe066 : 0xffffff, thick: on });
    });
    dtxt(rcx, py + 418, "Dùng Ecoin để tăng may mắn khi nâng cấp", 12, "#8b5e1a");

    // Thanh tỉ lệ
    const barW = rw - 8, barX = rx + 4, barY = py + 440;
    const bar = scene.add.graphics().setDepth(D + 3);
    bar.fillStyle(0x6a4a1a, 0.55); bar.fillRoundedRect(barX, barY, barW, 22, 11);
    bar.fillGradientStyle(0x7be07b, 0x7be07b, 0x2a9a3a, 0x2a9a3a, 1);
    bar.fillRoundedRect(barX, barY, Math.max(22, barW * chance / 100), 22, 11);
    bar.fillStyle(0xffffff, 0.25); bar.fillRoundedRect(barX + 6, barY + 3, Math.max(10, barW * chance / 100 - 12), 6, 3);
    bar.lineStyle(2, 0xffffff, 0.8); bar.strokeRoundedRect(barX, barY, barW, 22, 11);
    dyn.push(bar);
    dtxt(rcx, barY + 11, `Tỉ lệ thành công: ${chance}%`, 13, "#ffffff", { fontStyle: "bold", stroke: "#00000099", strokeThickness: 3 });

    dtxt(rcx, py + 484, p > 0
      ? `May mắn tích luỹ: +${p}% (từ lần thất bại trước)`
      : "Thất bại không mất thẻ, tích luỹ +15% cho lần sau", 12, "#8b5e1a");
    dtxt(rcx, py + 502, "10% Đại Thành Công: hoàn 50% chi phí", 12, "#8b5e1a");

    const can = ecoin >= cost;
    pill(rcx, py + 548, 260, 50, can ? 0x6fd86f : 0x9a9a9a, can ? 0x2a9a3a : 0x6a6a6a,
      "NÂNG CẤP LÊN LV.2", 17, () => doUpgrade(cost, can),
      { sub: `${cost.toLocaleString()} Ecoin`, dim: !can });
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
    const orb = scene.add.text(rcx, py + 205, "✦", {
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
