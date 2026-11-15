import { SERVER_URL } from "../../config.js";
import { getPlayerData, setPlayerData } from "../../server/utils/playerData.js";

const F = "Signika";

function loadImages(scene, list) {
  return new Promise((resolve) => {
    const todo = list.filter(([k]) => !scene.textures.exists(k));
    if (!todo.length) return resolve();
    let left = todo.length;
    const done = () => { if (--left <= 0) resolve(); };
    const onErr = () => {};
    todo.forEach(([k, p]) => {
      scene.load.image(k, p);
    });
    scene.load.on("filecomplete", done);
    scene.load.on("loaderror", done);
    scene.load.once("complete", () => {
      scene.load.off("filecomplete", done);
      scene.load.off("loaderror", done);
      resolve();
    });
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

  // loading hint
  const loading = scene.add.text(width / 2, height / 2, "Đang mở Lò Luyện...", {
    fontFamily: F, fontSize: "24px", color: "#ffffff", stroke: "#000", strokeThickness: 4,
  }).setOrigin(0.5).setDepth(600);

  let tarots = [], info = null;
  try {
    const [t, u] = await Promise.all([
      fetch(`${SERVER_URL}/tarots`).then(r => r.json()),
      fetch(`${SERVER_URL}/users/${userId}/tarots/upgrades`).then(r => r.json()),
    ]);
    tarots = t.data || [];
    info = u;
  } catch (e) { /* handled below */ }

  if (!info?.success || !tarots.length) {
    loading.setText("Không tải được dữ liệu. Hãy khởi động lại server.");
    scene.time.delayedCall(2000, () => { loading.destroy(); scene._tarotModal = false; });
    return;
  }

  await loadImages(scene, tarots.map(t => [`labtarot_s_${t.id}`, `assets/resources/Tarot/Tarot_2/resize/thebai_${t.id}.png`]));
  loading.destroy();

  let levels = info.levels || {};
  let pity = info.pity || {};
  let ecoin = info.ecoin;
  const cfg = info.config;
  let selected = tarots[0].id;
  let tier = 0;
  let busy = false;
  let dyn = []; // objects redrawn on each refresh

  // overlay
  add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
    .setDepth(500).setInteractive());
  const PW = Math.min(1180, width - 40), PH = Math.min(660, height - 40);
  const px = width / 2 - PW / 2, py = height / 2 - PH / 2;
  const g = add(scene.add.graphics().setDepth(501));
  g.fillStyle(0x1b0f33, 1); g.fillRoundedRect(px, py, PW, PH, 22);
  g.lineStyle(4, 0x9b59ff, 1); g.strokeRoundedRect(px, py, PW, PH, 22);
  g.lineStyle(1.5, 0xe0c0ff, 0.4); g.strokeRoundedRect(px + 8, py + 8, PW - 16, PH - 16, 18);

  add(scene.add.text(width / 2, py + 34, "🔮 LÒ LUYỆN TAROT", {
    fontFamily: F, fontSize: "34px", color: "#ffe9a8", fontStyle: "bold",
    stroke: "#3a1060", strokeThickness: 6,
  }).setOrigin(0.5).setDepth(502));

  const closeBtn = add(scene.add.text(px + PW - 28, py + 28, "✕", {
    fontFamily: F, fontSize: "30px", color: "#ffffff", stroke: "#000", strokeThickness: 4,
  }).setOrigin(0.5).setDepth(503).setInteractive({ cursor: "pointer" }));
  const close = () => {
    objs.forEach(o => { try { o.destroy(); } catch (e) {} });
    dyn.forEach(o => { try { o.destroy(); } catch (e) {} });
    gridObjs.forEach(o => { try { o.destroy(); } catch (e) {} });
    scene._tarotModal = false;
  };
  closeBtn.on("pointerup", () => { if (!busy) close(); });

  // ── Grid trái ───────────────────────────────────────────────
  const gridX = px + 30, gridY = py + 90;
  const cols = 5, cw = 100, ch = 150, gap = 10;
  const gridObjs = [];

  const tarotById = (id) => tarots.find(t => t.id === id);
  const lvOf = (id) => Number(levels[id]) || 1;

  const drawGrid = () => {
    gridObjs.forEach(o => o.destroy()); gridObjs.length = 0;
    tarots.forEach((t, i) => {
      const x = gridX + (i % cols) * (cw + gap) + cw / 2;
      const y = gridY + Math.floor(i / cols) * (ch + gap + 8) + ch / 2;
      const sel = t.id === selected;
      const bg = scene.add.graphics().setDepth(502);
      bg.fillStyle(sel ? 0x5a2d9c : 0x2d1b50, 1);
      bg.fillRoundedRect(x - cw / 2 - 4, y - ch / 2 - 4, cw + 8, ch + 8, 10);
      bg.lineStyle(sel ? 4 : 2, sel ? 0xffe066 : (lvOf(t.id) >= 2 ? 0xffc83d : 0x7a55b8), 1);
      bg.strokeRoundedRect(x - cw / 2 - 4, y - ch / 2 - 4, cw + 8, ch + 8, 10);
      const img = scene.add.image(x, y, `labtarot_s_${t.id}`).setDepth(503);
      img.setScale(Math.min(cw / img.width, ch / img.height));
      if (lvOf(t.id) < 2) img.setTint(0xcfcfe8);
      const lv = scene.add.text(x, y + ch / 2 - 2, lvOf(t.id) >= 2 ? "Lv.2 ★" : "Lv.1", {
        fontFamily: F, fontSize: "15px", fontStyle: "bold",
        color: lvOf(t.id) >= 2 ? "#ffd84d" : "#ffffff",
        stroke: "#000", strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(504);
      const zone = scene.add.zone(x, y, cw, ch).setDepth(505).setInteractive({ cursor: "pointer" });
      zone.on("pointerup", () => { if (busy) return; selected = t.id; tier = 0; refresh(); });
      gridObjs.push(bg, img, lv, zone);
    });
  };

  // ── Panel phải (động) ───────────────────────────────────────
  const rx = px + 30 + cols * (cw + gap) + 30;
  const rw = px + PW - 30 - rx;
  const rcx = rx + rw / 2;

  const txt = (x, y, s, size, color, o = {}) => {
    const t = scene.add.text(x, y, s, {
      fontFamily: F, fontSize: size + "px", color, stroke: "#000", strokeThickness: 3,
      align: "center", wordWrap: { width: rw }, ...o,
    }).setOrigin(0.5).setDepth(504);
    dyn.push(t); return t;
  };

  let previewImgs = [];
  const showPreview = async () => {
    const id = selected;
    await loadImages(scene, [
      [`labtarot_lv1_${id}`, `assets/resources/Tarot/Tarot_1/thebai_${id}.png`],
      [`labtarot_lv2_${id}`, `assets/resources/Tarot/Tarot_2/thebai_${id}.png`],
    ]);
    if (id !== selected || !scene._tarotModal) return;
    previewImgs.forEach(o => o.destroy()); previewImgs = [];
    const h = 190;
    const place = (key, x, tint) => {
      if (!scene.textures.exists(key)) return;
      const im = scene.add.image(x, py + 190, key).setDepth(504);
      im.setScale(h / im.height);
      if (tint) im.setTint(tint);
      previewImgs.push(im);
    };
    place(`labtarot_lv1_${id}`, rcx - rw * 0.27);
    place(`labtarot_lv2_${id}`, rcx + rw * 0.27, lvOf(id) >= 2 ? 0xffffff : 0x9a9ab0);
    previewImgs.forEach(o => dyn.push(o));
  };

  const refresh = () => {
    dyn.forEach(o => { try { o.destroy(); } catch (e) {} }); dyn = []; previewImgs = [];
    drawGrid();

    const t = tarotById(selected);
    const lv = lvOf(selected);
    const cdNow = t.cooldown_seconds;
    const cd2 = cfg.lv2_cooldown[selected] ?? cdNow;

    txt(rcx, py + 80, `${t.name}`, 26, "#ffe9a8", { fontStyle: "bold" });
    txt(rcx - rw * 0.27, py + 305, `Lv.1\n⏱ ${cdNow} lượt`, 16, "#ffffff");
    txt(rcx + rw * 0.27, py + 305, `Lv.2 ★\n⏱ ${cd2} lượt (nhanh hơn)`, 16, "#ffd84d");
    txt(rcx, py + 190, "➜", 40, "#ffffff");
    showPreview();

    if (lv >= 2) {
      txt(rcx, py + 440, "✨ Thẻ này đã đạt cấp tối đa!", 24, "#ffd84d", { fontStyle: "bold" });
      txt(rcx, py + 585, `💰 Ecoin: ${ecoin.toLocaleString()}`, 18, "#aaffcc");
      return;
    }

    const p = Number(pity[selected]) || 0;
    const chance = Math.min(100, cfg.base_rate + cfg.tiers[tier].bonus + p);
    const cost = cfg.base_cost + cfg.tiers[tier].cost;

    // Nút chọn mức may mắn
    const bw = Math.floor((rw - 30) / 4);
    cfg.tiers.forEach((tr, i) => {
      const x = rx + i * (bw + 10) + bw / 2, y = py + 372;
      const on = i === tier;
      const b = scene.add.graphics().setDepth(503);
      b.fillStyle(on ? 0x8e44ff : 0x3a2468, 1); b.fillRoundedRect(x - bw / 2, y - 24, bw, 48, 10);
      b.lineStyle(on ? 3 : 1.5, on ? 0xffe066 : 0x9b7bd6, 1); b.strokeRoundedRect(x - bw / 2, y - 24, bw, 48, 10);
      dyn.push(b);
      txt(x, y - 8, i === 0 ? "Không dùng" : `🍀 +${tr.bonus}%`, 14, "#ffffff", { fontStyle: "bold", wordWrap: { width: bw } });
      txt(x, y + 10, i === 0 ? "miễn phí" : `+${tr.cost.toLocaleString()}`, 12, "#ffe9a8", { wordWrap: { width: bw } });
      const z = scene.add.zone(x, y, bw, 48).setDepth(506).setInteractive({ cursor: "pointer" });
      z.on("pointerup", () => { if (busy) return; tier = i; refresh(); });
      dyn.push(z);
    });
    txt(rcx, py + 412, "Dùng Ecoin để tăng may mắn khi nâng cấp", 13, "#c9b2f0", { strokeThickness: 2 });

    // Thanh tỉ lệ
    const barW = rw - 20, barX = rx + 10, barY = py + 448;
    const bar = scene.add.graphics().setDepth(503);
    bar.fillStyle(0x000000, 0.5); bar.fillRoundedRect(barX, barY, barW, 20, 8);
    bar.fillStyle(chance >= 100 ? 0xffd84d : 0x59e08a, 1);
    bar.fillRoundedRect(barX, barY, barW * chance / 100, 20, 8);
    dyn.push(bar);
    txt(rcx, barY + 10, `Tỉ lệ thành công: ${chance}%`, 15, "#ffffff", { fontStyle: "bold" });
    txt(rcx, py + 490, p > 0 ? `🔥 May mắn tích luỹ: +${p}% (từ lần thất bại trước)` : "Thất bại không mất thẻ, sẽ tích luỹ +15% cho lần sau", 13, "#ffb86b", { strokeThickness: 2 });
    txt(rcx, py + 512, "🌟 10% Đại Thành Công: hoàn 50% chi phí", 13, "#ffe9a8", { strokeThickness: 2 });

    // Nút nâng cấp
    const by = py + 560;
    const can = ecoin >= cost;
    const ub = scene.add.graphics().setDepth(503);
    ub.fillStyle(can ? 0x2ecc71 : 0x666666, 1); ub.fillRoundedRect(rcx - 150, by - 28, 300, 56, 14);
    ub.lineStyle(3, 0xffffff, 0.9); ub.strokeRoundedRect(rcx - 150, by - 28, 300, 56, 14);
    dyn.push(ub);
    txt(rcx, by - 8, "NÂNG CẤP LÊN LV.2", 20, "#ffffff", { fontStyle: "bold" });
    txt(rcx, by + 14, `💰 ${cost.toLocaleString()} Ecoin`, 14, "#fff7c0", { strokeThickness: 2 });
    const uz = scene.add.zone(rcx, by, 300, 56).setDepth(506).setInteractive({ cursor: "pointer" });
    uz.on("pointerup", () => doUpgrade(cost, can));
    dyn.push(uz);
    txt(rcx + rw / 2 - 10, py + PH - 20, `💰 Ecoin: ${ecoin.toLocaleString()}`, 15, "#aaffcc").setOrigin(1, 0.5);
  };

  const toast = (msg, color = "#ffffff") => {
    const tt = scene.add.text(width / 2, py + PH - 8, msg, {
      fontFamily: F, fontSize: "22px", color, fontStyle: "bold", stroke: "#000", strokeThickness: 5,
      backgroundColor: "#000000aa", padding: { x: 14, y: 8 },
    }).setOrigin(0.5, 1).setDepth(700);
    scene.time.delayedCall(2200, () => tt.destroy());
  };

  const doUpgrade = async (cost, can) => {
    if (busy) return;
    if (!can) return toast("Không đủ Ecoin!", "#ff7777");
    busy = true;
    // Hiệu ứng luyện phép
    const orb = scene.add.text(rcx, py + 190, "🔮", { fontSize: "90px" }).setOrigin(0.5).setDepth(650);
    const spin = scene.tweens.add({ targets: orb, angle: 360, scale: 1.6, duration: 700, repeat: -1 });
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
      toast(r.message || "Nâng cấp thất bại", "#ff7777");
      return;
    }
    levels = r.levels; pity = r.pity; ecoin = r.ecoin;
    // đồng bộ ecoin vào playerData
    try {
      const data = getPlayerData(scene);
      if (data?.user) { data.user.ecoin = r.ecoin; data.user.tarot_levels = r.levels; setPlayerData(scene, data); }
    } catch (e) {}

    if (r.upgraded) {
      scene.cameras.main.flash(400, 255, 230, 120);
      toast(r.critical ? `🌟 ĐẠI THÀNH CÔNG! Hoàn ${r.refund.toLocaleString()} Ecoin` : "✨ Nâng cấp thành công!", "#ffd84d");
    } else {
      scene.cameras.main.shake(250, 0.006);
      toast(`💨 Thất bại... May mắn tích luỹ +15% (hiện ${r.new_pity}%)`, "#ffb86b");
    }
    busy = false;
    tier = 0;
    refresh();
  };

  refresh();
}
