/**
 * snowEffect.js — Hiệu ứng tuyết rơi tự nhiên toàn game (mọi Scene trong #root-game)
 *
 * Đặc điểm thiết kế tự nhiên, mượt 60fps, không chặn click (pointer-events: none):
 *  - Rơi chéo nhẹ từ trên-trái sang dưới-phải kèm gió đung đưa hình sin (không cứng nhắc)
 *  - 3 tầng chiều sâu (xa / trung / gần) kết hợp tinh thể bông tuyết 6 cánh xoay nhẹ & hạt tuyết mềm phát sáng
 *  - 3 kiểu vòng đời tự nhiên trộn ngẫu nhiên:
 *      1. Rơi xuyên hết khung hình rồi mới mờ dần biến mất (~44%)
 *      2. Nhạt dần & tan biến mềm giữa không trung (~26%)
 *      3. Chạm xuống mép dưới khung hình, đọng lại vài giây (2.5–6.5s) rồi tan dần (~30%)
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

    // 2 cặp nhánh tinh thể đối xứng
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

  // Tâm sáng
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
  const crystalSm = createCrystalSprite(14);
  const crystalLg = createCrystalSprite(22);
  const softFlake = createSoftFlakeSprite(12);

  let width = 1128;
  let height = 636;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let enabled = (() => {
    try { return localStorage.getItem(SNOW_LS_KEY) !== "0"; } catch { return true; }
  })();

  const flakes = [];
  let targetCount = 82;

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(320, Math.round(rect.width || window.innerWidth));
    height = Math.max(240, Math.round(rect.height || window.innerHeight));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Mật độ tự nhiên theo kích thước màn hình (không quá dày che giao diện)
    targetCount = Math.max(52, Math.min(96, Math.round((width * height) / 9200)));
  }

  function spawnFlake(initialScatter = false) {
    // 3 tầng chiều sâu: 0 = xa (nhỏ, chậm, mờ), 1 = trung, 2 = gần (to, rõ, tinh thể)
    const depthRoll = Math.random();
    const layer = depthRoll < 0.42 ? 0 : depthRoll < 0.78 ? 1 : 2;

    // 3 kiểu vòng đời tự nhiên
    const lifeRoll = Math.random();
    const mode = lifeRoll < 0.30 ? "settle" : lifeRoll < 0.56 ? "fade_mid" : "fall_through";

    // Tinh thể 6 cánh chủ yếu xuất hiện ở tầng trung & gần (~35%)
    const isCrystal = layer === 2 ? Math.random() < 0.65 : layer === 1 ? Math.random() < 0.32 : false;

    const baseSize = layer === 0
      ? 3.2 + Math.random() * 3.4
      : layer === 1
        ? 6.2 + Math.random() * 5.2
        : 10.5 + Math.random() * 7.5;

    // Rơi chéo từ trên-trái sang dưới-phải (góc nghiêng tự nhiên ~18–28 độ)
    const vy = (layer === 0 ? 22 : layer === 1 ? 38 : 54) + Math.random() * 18;
    const vx = vy * (0.30 + Math.random() * 0.24);

    // Điểm sinh: trải rộng cả phía trên lẫn một phần mép trái để góc trên-trái không bị trống
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

    const baseAlpha = layer === 0
      ? 0.38 + Math.random() * 0.24
      : layer === 1
        ? 0.58 + Math.random() * 0.26
        : 0.74 + Math.random() * 0.22;

    return {
      x,
      y,
      vx,
      vy,
      size: baseSize,
      layer,
      isCrystal,
      mode,
      baseAlpha,
      alpha: initialScatter ? baseAlpha : 0,
      fadeInDone: initialScatter,
      swayAmp: (layer === 0 ? 6 : layer === 1 ? 12 : 18) + Math.random() * 8,
      swayFreq: 0.65 + Math.random() * 0.95,
      swayPhase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.9),
      // Cho mode fade_mid: bắt đầu nhạt dần từ 48%–82% chiều cao
      fadeStartY: height * (0.48 + Math.random() * 0.34),
      fadeDist: height * (0.16 + Math.random() * 0.14),
      // Cho mode settle: điểm đọng gần đáy khung hình + thời gian đọng (2.5s–6.5s)
      settleY: height - (2 + Math.random() * 11),
      settled: false,
      settleTimer: 0,
      settleHold: 2.5 + Math.random() * 4.0,
      meltDuration: 1.4 + Math.random() * 1.2,
    };
  }

  resize();
  for (let i = 0; i < targetCount; i++) {
    flakes.push(spawnFlake(true));
  }

  // Theo dõi thay đổi kích thước #root-game
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(host);
  }
  window.addEventListener("resize", resize);

  // Gió nhẹ biến thiên theo thời gian để dòng tuyết sống động
  let elapsed = 0;
  let lastTs = performance.now();

  function tick(ts) {
    requestAnimationFrame(tick);
    if (!enabled || document.hidden) {
      lastTs = ts;
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;
    elapsed += dt;

    // Điều chỉnh số lượng hạt theo kích thước hiện tại
    while (flakes.length < targetCount) flakes.push(spawnFlake(false));
    if (flakes.length > targetCount + 12) flakes.length = targetCount;

    // Cơn gió nhẹ dao động chậm theo chu kỳ ~14s
    const gust = Math.sin(elapsed * 0.45) * 8 + Math.sin(elapsed * 0.19) * 5;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];

      if (f.settled) {
        // Đọng lại ở mép dưới khung hình vài giây rồi tan dần
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
        // Chuyển động rơi chéo + gió đung đưa mượt
        const swayVel = Math.cos(elapsed * f.swayFreq + f.swayPhase) * f.swayAmp;
        f.x += (f.vx + swayVel + gust * (0.35 + f.layer * 0.3)) * dt;
        f.y += f.vy * dt;
        f.rot += f.rotSpeed * dt;

        // Hiện dần mượt khi mới vào khung hình
        if (!f.fadeInDone) {
          f.alpha = Math.min(f.baseAlpha, f.alpha + dt * 1.4);
          if (f.alpha >= f.baseAlpha) f.fadeInDone = true;
        }

        if (f.mode === "fade_mid" && f.y >= f.fadeStartY) {
          const t = (f.y - f.fadeStartY) / f.fadeDist;
          f.alpha = f.baseAlpha * Math.max(0, 1 - t);
          if (t >= 1) {
            flakes[i] = spawnFlake(false);
            continue;
          }
        } else if (f.mode === "settle" && f.y >= f.settleY && f.x >= 8 && f.x <= width - 8) {
          f.y = f.settleY;
          f.settled = true;
          f.settleTimer = 0;
          f.alpha = Math.min(f.baseAlpha, 0.85);
        } else if (f.mode === "fall_through") {
          // Nhạt dần ở 8% cuối màn hình rồi mới biến mất
          if (f.y > height * 0.90) {
            const t = (f.y - height * 0.90) / (height * 0.14);
            f.alpha = f.baseAlpha * Math.max(0, 1 - t);
          }
          if (f.y > height + 24 || f.x > width + 40) {
            flakes[i] = spawnFlake(false);
            continue;
          }
        } else if (f.y > height + 24 || f.x > width + 40) {
          flakes[i] = spawnFlake(false);
          continue;
        }
      }

      if (f.alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      if (f.isCrystal) {
        const sprite = f.size >= 14 ? crystalLg : crystalSm;
        const drawSz = f.size * 1.75;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.drawImage(sprite, -drawSz / 2, -drawSz / 2, drawSz, drawSz);
      } else {
        const drawSz = f.size * 2.1;
        ctx.drawImage(softFlake, f.x - drawSz / 2, f.y - drawSz / 2, drawSz, drawSz);
      }
      ctx.restore();
    }
  }

  requestAnimationFrame(tick);

  const api = {
    isEnabled: () => enabled,
    setEnabled: (val) => {
      enabled = Boolean(val);
      try { localStorage.setItem(SNOW_LS_KEY, enabled ? "1" : "0"); } catch {}
      canvas.style.display = enabled ? "block" : "none";
      if (!enabled) ctx.clearRect(0, 0, width, height);
    },
    destroy: () => {
      canvas.remove();
      window.__snowEffectInstance = null;
    },
  };

  if (!enabled) canvas.style.display = "none";
  window.__snowEffectInstance = api;
  return api;
}
