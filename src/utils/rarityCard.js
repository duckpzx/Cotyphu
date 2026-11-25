/**
 * Rarity Card Generator (S+ Vàng, S Tím, A Xanh dương, B Xanh lá)
 * Vẽ thẻ vật phẩm bằng CanvasTexture 2x sắc nét có hiệu ứng gradient + vệt sáng chéo theo cấp độ giá tiền.
 * Không làm thay đổi nền kem vàng phía dưới của Cửa Hàng / Túi Đồ.
 */

export const RARITY_THEMES = {
  "S+": {
    label: "S+",
    hdrTop: "#ffd54f",
    hdrMid: "#ff9800",
    hdrBot: "#e65100",
    hdrLine: "#b84a00",
    bodyTop: "#fffdf7",
    bodyBot: "#f6dfbe",
    beamStart: "rgba(255, 160, 32, 0.34)",
    beamEnd:   "rgba(255, 196, 84, 0.04)",
    glowCenter:"rgba(255, 193, 7, 0.26)",
    baseShade: "rgba(217, 138, 43, 0.24)",
    border:    "#c27a22",
    badgeTop:  "#ffe066",
    badgeMid:  "#f59e0b",
    badgeBot:  "#b45309",
    badgeLip:  "#6b2600",
    badgeRim:  "#fff7cc",
    txtTop:    "#ffffff",
    txtMid:    "#ffe66d",
    txtBot:    "#ffb703",
    txtStroke: "#5c1900",
  },
  "S": {
    label: "S",
    hdrTop: "#f062ff",
    hdrMid: "#b522ef",
    hdrBot: "#7e12c2",
    hdrLine: "#5e0d94",
    bodyTop: "#fdfaff",
    bodyBot: "#ead4fb",
    beamStart: "rgba(182, 56, 245, 0.30)",
    beamEnd:   "rgba(216, 132, 255, 0.04)",
    glowCenter:"rgba(192, 84, 255, 0.24)",
    baseShade: "rgba(148, 62, 204, 0.20)",
    border:    "#9539c4",
    badgeTop:  "#f5a3ff",
    badgeMid:  "#a855f7",
    badgeBot:  "#6b21a8",
    badgeLip:  "#3b0764",
    badgeRim:  "#fae8ff",
    txtTop:    "#ffffff",
    txtMid:    "#f5d0fe",
    txtBot:    "#e879f9",
    txtStroke: "#3b0764",
  },
  "A": {
    label: "A",
    hdrTop: "#4ae0ff",
    hdrMid: "#0ea5e9",
    hdrBot: "#0369a1",
    hdrLine: "#075985",
    bodyTop: "#f6fcff",
    bodyBot: "#ceeefe",
    beamStart: "rgba(24, 174, 245, 0.30)",
    beamEnd:   "rgba(125, 211, 252, 0.04)",
    glowCenter:"rgba(56, 189, 248, 0.24)",
    baseShade: "rgba(2, 132, 199, 0.18)",
    border:    "#1e80b8",
    badgeTop:  "#7dd3fc",
    badgeMid:  "#0284c7",
    badgeBot:  "#075985",
    badgeLip:  "#082f49",
    badgeRim:  "#e0f2fe",
    txtTop:    "#ffffff",
    txtMid:    "#bae6fd",
    txtBot:    "#38bdf8",
    txtStroke: "#082f49",
  },
  "B": {
    label: "B",
    hdrTop: "#b8f22c",
    hdrMid: "#72bf0e",
    hdrBot: "#4d8806",
    hdrLine: "#3b6b04",
    bodyTop: "#f9fff2",
    bodyBot: "#d9f0be",
    beamStart: "rgba(114, 191, 14, 0.28)",
    beamEnd:   "rgba(163, 230, 53, 0.04)",
    glowCenter:"rgba(132, 204, 22, 0.22)",
    baseShade: "rgba(77, 136, 6, 0.18)",
    border:    "#5c911a",
    badgeTop:  "#bef264",
    badgeMid:  "#65a30d",
    badgeBot:  "#3f6212",
    badgeLip:  "#1a2e05",
    badgeRim:  "#ecfccb",
    txtTop:    "#ffffff",
    txtMid:    "#d9f99d",
    txtBot:    "#a3e635",
    txtStroke: "#1a2e05",
  },
};

/**
 * Xác định cấp độ (S+ | S | A | B) dựa trên loại vật phẩm và giá Ecoin.
 */
export function getItemRarityTier(item) {
  if (!item) return "B";
  const price = Number(item.price ?? item.price_ecoin ?? 0);
  const type = item.type || "character";

  if (type === "character") {
    if (price >= 180000) return "S+";
    if (price >= 170000) return "S";
    if (price >= 160000) return "A";
    return "B";
  }
  if (type === "skin") {
    const skinNum = Number(item.skinNum || item.skin_number || 0);
    if (price >= 135000 || (price === 0 && skinNum >= 3)) return "S+";
    if (price >= 125000 || (price === 0 && skinNum === 2)) return "S";
    if (price >= 115000) return "A";
    return "B";
  }
  if (type === "avatar") {
    if (price >= 60000) return "S+";
    if (price >= 40000) return "S";
    if (price >= 25000) return "A";
    return "B";
  }
  if (type === "background") {
    if (price >= 100000) return "S+";
    if (price >= 60000) return "S";
    if (price >= 30000) return "A";
    return "B";
  }
  // Fallback chung theo giá
  if (price >= 150000) return "S+";
  if (price >= 80000) return "S";
  if (price >= 30000) return "A";
  return "B";
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Tạo (hoặc lấy từ cache) CanvasTexture thẻ vật phẩm theo tier & kích thước.
 */
export function ensureRarityCardTexture(scene, tier, w, h) {
  const safeTier = RARITY_THEMES[tier] ? tier : "B";
  const theme = RARITY_THEMES[safeTier];
  const iw = Math.max(60, Math.round(w));
  const ih = Math.max(60, Math.round(h));
  const key = `rarity_card_${safeTier}_${iw}x${ih}`;
  if (scene.textures.exists(key)) return key;

  const DPR = 2;
  const cw = iw * DPR;
  const ch = ih * DPR;
  const cTex = scene.textures.createCanvas(key, cw, ch);
  const ctx = cTex.getContext();
  ctx.save();
  ctx.scale(DPR, DPR);

  const pad = 2;
  const x = pad;
  const y = pad;
  const bw = iw - pad * 2;
  const bh = ih - pad * 2;
  const r = 14;
  const hdrH = Math.round(bh * 0.25);

  // 1. Bóng đổ mềm phía dưới card
  ctx.save();
  ctx.shadowColor = "rgba(70, 42, 10, 0.22)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  roundRectPath(ctx, x, y, bw, bh, r);
  ctx.fillStyle = theme.bodyTop;
  ctx.fill();
  ctx.restore();

  // 2. Clip toàn bộ bên trong bo góc card
  ctx.save();
  roundRectPath(ctx, x, y, bw, bh, r);
  ctx.clip();

  // 2a. Nền body gradient sáng dịu theo tông màu tier
  const bodyGrad = ctx.createLinearGradient(x, y + hdrH, x, y + bh);
  bodyGrad.addColorStop(0, theme.bodyTop);
  bodyGrad.addColorStop(0.75, theme.bodyBot);
  bodyGrad.addColorStop(1, theme.bodyBot);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, bw, bh);

  // 2b. Quầng sáng tỏa mềm ở tâm phía sau vật phẩm
  const glowGrad = ctx.createRadialGradient(
    x + bw * 0.5, y + hdrH + (bh - hdrH) * 0.45, 4,
    x + bw * 0.5, y + hdrH + (bh - hdrH) * 0.45, bw * 0.65
  );
  glowGrad.addColorStop(0, theme.glowCenter);
  glowGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(x, y + hdrH, bw, bh - hdrH);

  // 2c. Vệt ánh sáng chéo đặc trưng (góc phải trên → phải dưới)
  const beamGrad = ctx.createLinearGradient(x + bw * 0.55, y + hdrH, x + bw, y + bh);
  beamGrad.addColorStop(0, theme.beamStart);
  beamGrad.addColorStop(0.65, theme.beamStart);
  beamGrad.addColorStop(1, theme.beamEnd);
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.72, y + hdrH);
  ctx.lineTo(x + bw, y + hdrH);
  ctx.lineTo(x + bw, y + bh);
  ctx.lineTo(x + bw * 0.44, y + bh);
  ctx.closePath();
  ctx.fill();

  // Vệt sáng chéo mảnh phụ tạo chiều sâu ánh kính
  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.62, y + hdrH);
  ctx.lineTo(x + bw * 0.71, y + hdrH);
  ctx.lineTo(x + bw * 0.43, y + bh);
  ctx.lineTo(x + bw * 0.34, y + bh);
  ctx.closePath();
  ctx.fill();

  // 2d. Dải nền dịu phía đáy card
  const botGrad = ctx.createLinearGradient(x, y + bh - 22, x, y + bh);
  botGrad.addColorStop(0, "rgba(255,255,255,0)");
  botGrad.addColorStop(1, theme.baseShade);
  ctx.fillStyle = botGrad;
  ctx.fillRect(x, y + bh - 22, bw, 22);

  // 2e. Thanh Header màu bóng (S+ Vàng, S Tím, A Xanh dương, B Xanh lá)
  const hdrGrad = ctx.createLinearGradient(x, y, x, y + hdrH);
  hdrGrad.addColorStop(0, theme.hdrTop);
  hdrGrad.addColorStop(0.52, theme.hdrMid);
  hdrGrad.addColorStop(1, theme.hdrBot);
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(x, y, bw, hdrH);

  // Gloss trắng bóng nửa trên header
  const glossGrad = ctx.createLinearGradient(x, y, x, y + hdrH * 0.55);
  glossGrad.addColorStop(0, "rgba(255,255,255,0.48)");
  glossGrad.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = glossGrad;
  ctx.fillRect(x + 2, y + 1, bw - 4, hdrH * 0.48);

  // Đường ngăn cách dưới header
  ctx.fillStyle = theme.hdrLine;
  ctx.fillRect(x, y + hdrH - 1.5, bw, 1.5);

  // 2f. Huy hiệu cấp độ nổi 3D (S+, S, A, B) góc trên phải phần body — font kiểu in nghiêng + chữ gradient kim loại
  const pillW = safeTier.length > 1 ? 34 : 26;
  const pillH = 20;
  const px = x + bw - pillW - 5;
  const py = y + hdrH + 5;
  const pr = 7;

  // Bóng đổ mềm dưới huy hiệu 3D
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2.5;
  roundRectPath(ctx, px, py + 2, pillW, pillH, pr);
  ctx.fillStyle = theme.badgeLip;
  ctx.fill();
  ctx.restore();

  // Phần đế dày 3D (extrusion) phía dưới
  roundRectPath(ctx, px, py + 2, pillW, pillH, pr);
  ctx.fillStyle = theme.badgeLip;
  ctx.fill();

  // Mặt trên huy hiệu với gradient bóng kim loại
  const badgeGrad = ctx.createLinearGradient(px, py, px, py + pillH);
  badgeGrad.addColorStop(0, theme.badgeTop);
  badgeGrad.addColorStop(0.52, theme.badgeMid);
  badgeGrad.addColorStop(1, theme.badgeBot);
  roundRectPath(ctx, px, py, pillW, pillH, pr);
  ctx.fillStyle = badgeGrad;
  ctx.fill();

  // Vệt sáng bóng kính nửa trên huy hiệu
  ctx.save();
  roundRectPath(ctx, px, py, pillW, pillH, pr);
  ctx.clip();
  const bGloss = ctx.createLinearGradient(px, py, px, py + pillH * 0.52);
  bGloss.addColorStop(0, "rgba(255,255,255,0.62)");
  bGloss.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = bGloss;
  ctx.fillRect(px + 1.5, py + 1, pillW - 3, pillH * 0.48);
  ctx.restore();

  // Viền sáng nổi 3D
  roundRectPath(ctx, px, py, pillW, pillH, pr);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = theme.badgeRim;
  ctx.stroke();

  // Chữ hạng (S+, S, A, B): font display in nghiêng đậm + đổ khối 3D + màu gradient
  const tcx = px + pillW / 2 - 0.5;
  const tcy = py + pillH / 2 + 0.5;
  ctx.font = `italic 900 ${safeTier.length > 1 ? 12.5 : 13.5}px "Arial Black", Impact, Signika, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // Lớp bóng đổ 3D lệch xuống dưới
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = theme.txtStroke;
  ctx.strokeText(theme.label, tcx + 0.6, tcy + 1.3);

  // Lớp viền đậm quanh chữ
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = theme.txtStroke;
  ctx.strokeText(theme.label, tcx, tcy);

  // Lớp chữ fill gradient ánh kim
  const txtGrad = ctx.createLinearGradient(tcx, py + 3, tcx, py + pillH - 3);
  txtGrad.addColorStop(0, theme.txtTop);
  txtGrad.addColorStop(0.55, theme.txtMid);
  txtGrad.addColorStop(1, theme.txtBot);
  ctx.fillStyle = txtGrad;
  ctx.fillText(theme.label, tcx, tcy);

  ctx.restore();

  // 3. Viền ngoài bo tròn gọn gàng
  roundRectPath(ctx, x, y, bw, bh, r);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  // Viền sáng mảnh bên trong
  roundRectPath(ctx, x + 1.2, y + 1.2, bw - 2.4, bh - 2.4, r - 1);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.stroke();

  ctx.restore();
  cTex.refresh();
  return key;
}
