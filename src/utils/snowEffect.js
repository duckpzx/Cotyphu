/**
 * snowEffect.js — Hệ thống hiệu ứng thời tiết tự nhiên toàn game (mọi Scene trong #root-game)
 * Hỗ trợ 4 chế độ do Admin điều khiển real-time qua /api/weather-config:
 *  - "none"  : Tắt hiệu ứng
 *  - "snow"  : Tuyết rơi (tinh thể 6 cánh xoay nhẹ + hạt tuyết mềm 3 tầng chiều sâu)
 *  - "peach" : Hoa đào rơi (cánh hoa đào lật 3D mềm + bông đào 5 cánh nhụy vàng + phấn hồng)
 *  - "both"  : Kết hợp Tuyết rơi & Hoa đào
 *
 * Chuyển động rơi chéo nhẹ trên-trái → dưới-phải, gió đung đưa hình sin, 3 vòng đời tự nhiên:
 *  - Rơi xuyên hết khung hình rồi mờ dần (~44%)
 *  - Nhạt dần giữa không trung (~26%)
 *  - Chạm mép dưới đọng lại 2.5–6.5s rồi tan dần (~30%)
 */

const SNOW_LS_KEY = "setting_snow_enabled";

function createCrystalSprite(size) {
  const c = document.createElement("canvas");
  const pad = Math.ceil(size * 0.45);
  const full = size + pad * 2;
  c.width = full;
  c.height = full;
  const ctx = c.getContext("2d");
  const cx = full / 2;
  const cy = full / 2;
  const r = size * 0.48;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.shadowColor = "rgba(186, 232, 255, 0.95)";
  ctx.shadowBlur = Math.max(4, size * 0.35);
  ctx.lineCap = "round";

  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    ctx.lineWidth = Math.max(1.1, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.stroke();

    ctx.lineWidth = Math.max(0.85, size * 0.055);
    const b1 = -r * 0.46;
    const b2 = -r * 0.74;
    const w1 = r * 0.25;
    const w2 = r * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, b1); ctx.lineTo(-w1, b1 - w1 * 0.85);
    ctx.moveTo(0, b1); ctx.lineTo( w1, b1 - w1 * 0.85);
    ctx.moveTo(0, b2); ctx.lineTo(-w2, b2 - w2 * 0.85);
    ctx.moveTo(0, b2); ctx.lineTo( w2, b2 - w2 * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.2, size * 0.11), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c;
}

function createSoftFlakeSprite(size) {
  const c = document.createElement("canvas");
  const full = Math.max(12, Math.ceil(size * 2.2));
  c.width = full;
  c.height = full;
  const ctx = c.getContext("2d");
  const cx = full / 2;
  const r = full / 2;

  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  grad.addColorStop(0.4, "rgba(232, 246, 255, 0.78)");
  grad.addColorStop(0.75, "rgba(190, 228, 255, 0.24)");
  grad.addColorStop(1, "rgba(190, 228, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, full, full);
  return c;
}

function createPetalSprite(palette) {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const g = c.getContext("2d");
  g.translate(24, 24);
  g.shadowColor = palette.glow;
  g.shadowBlur = 7;

  const grad = g.createRadialGradient(-2, -4, 1, 0, 2, 18);
  grad.addColorStop(0, palette.light);
  grad.addColorStop(0.55, palette.mid);
  grad.addColorStop(1, palette.deep);

  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-13, 6, -14, -10, -4, -15);
  g.quadraticCurveTo(0, -11, 0, -9);
  g.quadraticCurveTo(0, -11, 4, -15);
  g.bezierCurveTo(14, -10, 13, 6, 0, 14);
  g.closePath();
  g.fill();

  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 11);
  g.quadraticCurveTo(-1, 0, 0, -7);
  g.stroke();
  return c;
}

function createBlossomSprite() {
  const c = document.createElement("canvas");
  c.width = 56;
  c.height = 56;
  const g = c.getContext("2d");
  g.translate(28, 28);
  g.shadowColor = "rgba(255, 130, 175, 0.75)";
  g.shadowBlur = 8;

  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i * Math.PI * 2) / 5);
    const grad = g.createRadialGradient(0, -4, 1, 0, -10, 12);
    grad.addColorStop(0, "#fff0f5");
    grad.addColorStop(0.5, "#ff8fb8");
    grad.addColorStop(1, "#e84a86");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -1);
    g.bezierCurveTo(-8, -5, -8, -16, -2, -18);
    g.quadraticCurveTo(0, -15, 2, -18);
    g.bezierCurveTo(8, -16, 8, -5, 0, -1);
    g.closePath();
    g.fill();
    g.restore();
  }

  g.shadowBlur = 0;
  g.fillStyle = "#fde047";
  g.beginPath();
  g.arc(0, 0, 3.2, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.fillStyle = "#fff7ed";
    g.beginPath();
    g.arc(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 1.1, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function createPinkGlowSprite() {
  const c = document.createElement("canvas");
  c.width = 28;
  c.height = 28;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(14, 14, 0, 14, 14, 14);
  grad.addColorStop(0, "rgba(255, 232, 242, 0.95)");
  grad.addColorStop(0.45, "rgba(255, 158, 198, 0.55)");
  grad.addColorStop(1, "rgba(255, 130, 180, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 28, 28);
  return c;
}

export function initSnowEffect(containerId = "root-game") {
  if (window.__snowEffectInstance) return window.__snowEffectInstance;
  const host = document.getElementById(containerId) || document.body;

  const canvas = document.createElement("canvas");
  canvas.id = "snow-overlay-canvas";
  canvas.style.cssText = [
    "position: absolute",
    "inset: 0",
    "width: 100%",
    "height: 100%",
    "pointer-events: none",
    "z-index: 500",
    "display: block",
  ].join(";");
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const crystalSm  = createCrystalSprite(14);
  const crystalLg  = createCrystalSprite(22);
  const softFlake  = createSoftFlakeSprite(12);
  const petalLight = createPetalSprite({ light: "#fff1f5", mid: "#ffa6c9", deep: "#f4689c", glow: "rgba(255,150,190,0.7)" });
  const petalDeep  = createPetalSprite({ light: "#ffe4ee", mid: "#ff79ad", deep: "#db3274", glow: "rgba(235,80,145,0.65)" });
  const blossomSpr = createBlossomSprite();
  const pinkBokeh  = createPinkGlowSprite();

  let width = 1128;
  let height = 636;
  let dpr = 1; // 1x canvas giúp giảm 75% tải GPU khi chồng lên Phaser WebGL
  let mode = "snow"; // "none" | "snow" | "peach" | "both"
  let userEnabled = (() => {
    try { return localStorage.getItem(SNOW_LS_KEY) !== "0"; } catch { return true; }
  })();
  let densitySetting = 46;
  let targetCount = 46;

  const flakes = [];

  function recalcTargetCount() {
    const scale = Math.max(0.6, Math.min(1.0, (width * height) / (1128 * 636)));
    targetCount = Math.max(18, Math.min(78, Math.round(densitySetting * scale)));
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(320, Math.round(rect.width || window.innerWidth));
    height = Math.max(240, Math.round(rect.height || window.innerHeight));
    dpr = 1;
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    recalcTargetCount();
  }

  function spawnFlake(initialScatter = false) {
    const kind = mode === "both"
      ? (Math.random() < 0.56 ? "peach" : "snow")
      : (mode === "peach" ? "peach" : "snow");

    const depthRoll = Math.random();
    const layer = depthRoll < 0.40 ? 0 : depthRoll < 0.78 ? 1 : 2;

    const lifeRoll = Math.random();
    const lifeMode = lifeRoll < 0.30 ? "settle" : lifeRoll < 0.56 ? "fade_mid" : "fall_through";

    let subType = "snow_soft";
    if (kind === "peach") {
      const r = Math.random();
      subType = r < 0.42 ? "petal_light" : r < 0.74 ? "petal_deep" : r < 0.90 ? "blossom" : "pink_bokeh";
    } else {
      const isCrystal = layer === 2 ? Math.random() < 0.65 : layer === 1 ? Math.random() < 0.32 : false;
      subType = isCrystal ? "snow_crystal" : "snow_soft";
    }

    const baseSize = kind === "peach"
      ? (layer === 0 ? 7.5 + Math.random() * 4.0 : layer === 1 ? 12.5 + Math.random() * 5.0 : 17.5 + Math.random() * 7.0)
      : (layer === 0 ? 3.2 + Math.random() * 3.4 : layer === 1 ? 6.2 + Math.random() * 5.2 : 10.5 + Math.random() * 7.5);

    const vy = (layer === 0 ? 22 : layer === 1 ? 36 : 50) + Math.random() * 16;
    const vx = vy * (0.30 + Math.random() * 0.25);

    let x, y;
    if (initialScatter) {
      x = Math.random() * width;
      y = Math.random() * height;
    } else if (Math.random() < 0.76) {
      x = -width * 0.22 + Math.random() * (width * 1.15);
      y = -18 - Math.random() * 40;
    } else {
      x = -18 - Math.random() * 24;
      y = Math.random() * height * 0.55;
    }

    const baseAlpha = kind === "peach"
      ? (layer === 0 ? 0.54 + Math.random() * 0.22 : layer === 1 ? 0.74 + Math.random() * 0.18 : 0.86 + Math.random() * 0.12)
      : (layer === 0 ? 0.38 + Math.random() * 0.24 : layer === 1 ? 0.58 + Math.random() * 0.26 : 0.74 + Math.random() * 0.22);

    return {
      x, y, vx, vy,
      size: baseSize,
      layer,
      kind,
      subType,
      lifeMode,
      baseAlpha,
      alpha: initialScatter ? baseAlpha : 0,
      fadeInDone: initialScatter,
      swayAmp: (layer === 0 ? 7 : layer === 1 ? 14 : 20) + Math.random() * 8,
      swayFreq: 0.65 + Math.random() * 0.95,
      swayPhase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.05),
      flipPhase: Math.random() * Math.PI * 2,
      flipFreq: 1.3 + Math.random() * 1.6,
      fadeStartY: height * (0.48 + Math.random() * 0.34),
      fadeDist: height * (0.16 + Math.random() * 0.14),
      settleY: height - (3 + Math.random() * 11),
      settled: false,
      settleTimer: 0,
      settleHold: 2.5 + Math.random() * 4.0,
      meltDuration: 1.4 + Math.random() * 1.2,
    };
  }

  function applyConfig({ mode: nextMode, density: nextDensity } = {}, forceReset = false) {
    const valid = ["none", "snow", "peach", "both"];
    const prevMode = mode;
    if (nextMode && valid.includes(String(nextMode))) {
      mode = String(nextMode);
    }
    if (nextDensity !== undefined && !Number.isNaN(Number(nextDensity))) {
      densitySetting = Math.max(25, Math.min(115, Number(nextDensity)));
      recalcTargetCount();
    }
    const visible = userEnabled && mode !== "none";
    canvas.style.display = visible ? "block" : "none";
    if (!visible) {
      ctx.clearRect(0, 0, width, height);
      return;
    }
    if (forceReset || prevMode !== mode) {
      flakes.length = 0;
      for (let i = 0; i < targetCount; i++) flakes.push(spawnFlake(true));
    }
  }

  async function syncFromServer() {
    try {
      const res = await fetch(`/api/weather-config?t=${Date.now()}`);
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.success) {
        applyConfig({ mode: json.mode, density: json.density });
      }
    } catch {}
  }

  resize();
  for (let i = 0; i < targetCount; i++) flakes.push(spawnFlake(true));
  syncFromServer();
  // Đồng bộ định kỳ mỗi 15 giây khi Admin đổi thời tiết
  setInterval(() => { if (!document.hidden) syncFromServer(); }, 15000);

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(host);
  }
  window.addEventListener("resize", resize);

  let elapsed = 0;
  let lastTs = performance.now();

  function tick(ts) {
    requestAnimationFrame(tick);
    if (!userEnabled || mode === "none" || document.hidden) {
      lastTs = ts;
      return;
    }

    // Giới hạn ~30fps cho lớp thời tiết để mượt tuyệt đối mà không gây lag Phaser WebGL
    const rawDt = (ts - lastTs) / 1000;
    if (rawDt < 0.032) return;
    const dt = Math.min(0.06, Math.max(0.001, rawDt));
    lastTs = ts;
    elapsed += dt;

    while (flakes.length < targetCount) flakes.push(spawnFlake(false));
    if (flakes.length > targetCount + 12) flakes.length = targetCount;

    const gust = Math.sin(elapsed * 0.45) * 9 + Math.sin(elapsed * 0.19) * 5;
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];

      if (f.settled) {
        f.settleTimer += dt;
        if (f.settleTimer > f.settleHold) {
          const meltProgress = (f.settleTimer - f.settleHold) / f.meltDuration;
          f.alpha = f.baseAlpha * Math.max(0, 1 - meltProgress);
          if (meltProgress >= 1) {
            flakes[i] = spawnFlake(false);
            continue;
          }
        }
      } else {
        const swayVel = Math.cos(elapsed * f.swayFreq + f.swayPhase) * f.swayAmp;
        f.x += (f.vx + swayVel + gust * (0.35 + f.layer * 0.3)) * dt;
        f.y += f.vy * dt;
        f.rot += f.rotSpeed * dt;

        if (!f.fadeInDone) {
          f.alpha = Math.min(f.baseAlpha, f.alpha + dt * 1.45);
          if (f.alpha >= f.baseAlpha) f.fadeInDone = true;
        }

        if (f.lifeMode === "fade_mid" && f.y >= f.fadeStartY) {
          const t = (f.y - f.fadeStartY) / f.fadeDist;
          f.alpha = f.baseAlpha * Math.max(0, 1 - t);
          if (t >= 1) { flakes[i] = spawnFlake(false); continue; }
        } else if (f.lifeMode === "settle" && f.y >= f.settleY && f.x >= 8 && f.x <= width - 8) {
          f.y = f.settleY;
          f.settled = true;
          f.settleTimer = 0;
          f.alpha = Math.min(f.baseAlpha, 0.86);
        } else if (f.lifeMode === "fall_through") {
          if (f.y > height * 0.90) {
            const t = (f.y - height * 0.90) / (height * 0.14);
            f.alpha = f.baseAlpha * Math.max(0, 1 - t);
          }
          if (f.y > height + 26 || f.x > width + 40) { flakes[i] = spawnFlake(false); continue; }
        } else if (f.y > height + 26 || f.x > width + 40) {
          flakes[i] = spawnFlake(false); continue;
        }
      }

      if (f.alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);

      if (f.subType === "petal_light" || f.subType === "petal_deep") {
        const flipY = f.settled ? 0.55 : (0.42 + 0.58 * Math.abs(Math.sin(elapsed * f.flipFreq + f.flipPhase)));
        ctx.scale(1, flipY);
        const spr = f.subType === "petal_light" ? petalLight : petalDeep;
        const sz = f.size * 1.25;
        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      } else if (f.subType === "blossom") {
        const sz = f.size * 1.35;
        ctx.drawImage(blossomSpr, -sz / 2, -sz / 2, sz, sz);
      } else if (f.subType === "pink_bokeh") {
        const sz = f.size * 1.1;
        ctx.drawImage(pinkBokeh, -sz / 2, -sz / 2, sz, sz);
      } else if (f.subType === "snow_crystal") {
        const sprite = f.size >= 14 ? crystalLg : crystalSm;
        const drawSz = f.size * 1.75;
        ctx.drawImage(sprite, -drawSz / 2, -drawSz / 2, drawSz, drawSz);
      } else {
        const drawSz = f.size * 2.1;
        ctx.drawImage(softFlake, -drawSz / 2, -drawSz / 2, drawSz, drawSz);
      }
      ctx.restore();
    }
  }

  requestAnimationFrame(tick);

  const api = {
    isEnabled: () => userEnabled && mode !== "none",
    getConfig: () => ({ mode, density: densitySetting }),
    setConfig: (cfg) => applyConfig(cfg, true),
    setEnabled: (val) => {
      userEnabled = Boolean(val);
      try { localStorage.setItem(SNOW_LS_KEY, userEnabled ? "1" : "0"); } catch {}
      const visible = userEnabled && mode !== "none";
      canvas.style.display = visible ? "block" : "none";
      if (!visible) ctx.clearRect(0, 0, width, height);
    },
    destroy: () => {
      canvas.remove();
      window.__snowEffectInstance = null;
    },
  };

  window.__snowEffectInstance = api;
  return api;
}
