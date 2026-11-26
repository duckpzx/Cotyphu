/**
 * Helper hiển thị Avatar 96x96 bo tròn sắc nét + hào quang blur ánh xạ từ chính ảnh.
 * Dùng CanvasTexture đã cắt tròn sẵn nên cuộn/di chuyển mượt mà không bị lỗi GeometryMask.
 */
export function renderAvatarBadge(scene, {
  x,
  y,
  size = 44,
  avatarId = 1,
  depth = 10,
  push = null,
  glow = true,
} = {}) {
  const id = Math.max(1, Math.min(50, Number(avatarId || 1)));
  const rawKey  = `avatar_96_${id}`;
  const circKey = `avatar_circ_${id}`;
  const glowKey = `avatar_glow_${id}`;

  const reg = (obj) => {
    if (typeof push === "function") push(obj);
    return obj;
  };

  // Placeholder tròn tối gọn gàng trong lúc chờ ảnh tải (nếu chưa có trong cache)
  let glowImg = null;
  let mainImg = null;
  let destroyed = false;

  const buildTextures = () => {
    const srcImg = scene.textures.get(rawKey)?.getSourceImage?.();
    if (!srcImg) return false;

    if (!scene.textures.exists(circKey)) {
      const sz = 96;
      const cTex = scene.textures.createCanvas(circKey, sz, sz);
      const ctx = cTex.getContext();
      ctx.clearRect(0, 0, sz, sz);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sz / 2, sz / 2, sz / 2 - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(srcImg, 0, 0, sz, sz);
      ctx.restore();
      // Viền kính mảnh sáng nhẹ tách mép tròn
      ctx.beginPath();
      ctx.arc(sz / 2, sz / 2, sz / 2 - 2.5, 0, Math.PI * 2);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
      ctx.stroke();
      cTex.refresh();
    }

    if (glow && !scene.textures.exists(glowKey)) {
      const sz = 128;
      const gTex = scene.textures.createCanvas(glowKey, sz, sz);
      const ctx = gTex.getContext();
      ctx.clearRect(0, 0, sz, sz);
      ctx.save();
      ctx.filter = "blur(9px) saturate(1.5) brightness(1.18)";
      ctx.drawImage(srcImg, 18, 18, sz - 36, sz - 36);
      ctx.restore();
      ctx.globalCompositeOperation = "destination-in";
      const grad = ctx.createRadialGradient(sz / 2, sz / 2, sz * 0.24, sz / 2, sz / 2, sz * 0.5);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.68, "rgba(255,255,255,0.72)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, sz, sz);
      ctx.globalCompositeOperation = "source-over";
      gTex.refresh();
    }
    return true;
  };

  const apply = () => {
    if (destroyed || !scene?.sys?.isActive?.() || !scene.textures?.exists(rawKey)) return;
    if (!buildTextures()) return;

    if (glow && scene.textures.exists(glowKey)) {
      const gSize = Math.round(size * 1.38);
      if (glowImg?.active) {
        glowImg.setTexture(glowKey).setDisplaySize(gSize, gSize);
      } else {
        glowImg = reg(scene.add.image(x, y, glowKey).setDisplaySize(gSize, gSize).setDepth(depth).setAlpha(0.85));
      }
    }

    if (scene.textures.exists(circKey)) {
      if (mainImg?.active) {
        mainImg.setTexture(circKey).setDisplaySize(size, size);
      } else {
        mainImg = reg(scene.add.image(x, y, circKey).setDisplaySize(size, size).setDepth(depth + 1));
      }
    }
  };

  const setAvatar = (newId) => {
    const nid = Math.max(1, Math.min(50, Number(newId || 1)));
    const nRaw = `avatar_96_${nid}`;
    const nCirc = `avatar_circ_${nid}`;
    const nGlow = `avatar_glow_${nid}`;

    const applyNew = () => {
      if (destroyed || !scene?.sys?.isActive?.() || !scene.textures?.exists(nRaw)) return;
      const srcImg = scene.textures.get(nRaw)?.getSourceImage?.();
      if (!srcImg) return;
      if (!scene.textures.exists(nCirc)) {
        const sz = 96;
        const cTex = scene.textures.createCanvas(nCirc, sz, sz);
        const ctx = cTex.getContext();
        ctx.clearRect(0, 0, sz, sz);
        ctx.save();
        ctx.beginPath();
        ctx.arc(sz / 2, sz / 2, sz / 2 - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(srcImg, 0, 0, sz, sz);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(sz / 2, sz / 2, sz / 2 - 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
        ctx.stroke();
        cTex.refresh();
      }
      if (glow && !scene.textures.exists(nGlow)) {
        const sz = 128;
        const gTex = scene.textures.createCanvas(nGlow, sz, sz);
        const ctx = gTex.getContext();
        ctx.clearRect(0, 0, sz, sz);
        ctx.save();
        ctx.filter = "blur(9px) saturate(1.5) brightness(1.18)";
        ctx.drawImage(srcImg, 18, 18, sz - 36, sz - 36);
        ctx.restore();
        ctx.globalCompositeOperation = "destination-in";
        const grad = ctx.createRadialGradient(sz / 2, sz / 2, sz * 0.24, sz / 2, sz / 2, sz * 0.5);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.68, "rgba(255,255,255,0.72)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, sz, sz);
        ctx.globalCompositeOperation = "source-over";
        gTex.refresh();
      }
      if (glow && scene.textures.exists(nGlow)) {
        const gSize = Math.round(size * 1.38);
        if (glowImg?.active) glowImg.setTexture(nGlow).setDisplaySize(gSize, gSize);
        else glowImg = reg(scene.add.image(x, y, nGlow).setDisplaySize(gSize, gSize).setDepth(depth).setAlpha(0.85));
      }
      if (scene.textures.exists(nCirc)) {
        if (mainImg?.active) mainImg.setTexture(nCirc).setDisplaySize(size, size);
        else mainImg = reg(scene.add.image(x, y, nCirc).setDisplaySize(size, size).setDepth(depth + 1));
      }
    };

    if (scene.textures.exists(nRaw)) {
      applyNew();
    } else {
      scene.load.image(nRaw, `assets/resources/Avatar/PNG/thumbs_96/${nid}.png`);
      scene.load.once(`filecomplete-image-${nRaw}`, applyNew);
      scene.load.start();
    }
  };

  if (scene.textures.exists(rawKey)) {
    apply();
  } else {
    scene.load.image(rawKey, `assets/resources/Avatar/PNG/thumbs_96/${id}.png`);
    scene.load.once(`filecomplete-image-${rawKey}`, apply);
    scene.load.start();
  }

  return {
    setAvatar,
    getMainImage: () => mainImg,
    destroy: () => {
      destroyed = true;
      try { glowImg?.destroy(); } catch (_) {}
      try { mainImg?.destroy(); } catch (_) {}
    },
  };
}
