/**
 * Hiển thị bong bóng cảm xúc Emoji sắc nét (96x96 Bicubic) ngay trên đầu nhân vật.
 * Hỗ trợ bám theo targetSprite (nếu nhân vật đang di chuyển) hoặc tọa độ cố định (x, y).
 */
export function extractEmojiId(message) {
  const m = String(message || "").match(/\[e:(\d{1,2})\]/);
  if (!m) return null;
  const id = Number(m[1]);
  return id >= 1 && id <= 50 ? id : null;
}

export function showCharacterEmojiBubble(scene, {
  userId,
  emojiId,
  x,
  y,
  targetSprite = null,
  offsetX = 34,
  offsetY = -98,
  depth = 260,
  size = 64,
}) {
  if (!scene || !emojiId) return;
  const id = Number(emojiId);
  if (id < 1 || id > 50) return;

  const key = `chat_emoji_${id}`;
  const spawn = () => {
    if (!scene?.sys?.isActive?.() || !scene.textures?.exists(key)) return;

    // Xóa bong bóng cũ của cùng user nếu đang hiển thị
    scene._activeEmojiBubbles = scene._activeEmojiBubbles || new Map();
    const prev = scene._activeEmojiBubbles.get(Number(userId));
    if (prev) {
      try { prev.cleanup(); } catch (_) {}
      scene._activeEmojiBubbles.delete(Number(userId));
    }

    const startX = targetSprite?.active ? targetSprite.x + offsetX : x + offsetX;
    const startY = targetSprite?.active ? targetSprite.y + offsetY : y;
    if (startX === undefined || startY === undefined) return;

    const container = scene.add.container(startX, startY).setDepth(depth).setScale(0.2).setAlpha(0);

    // Không vẽ khung viền ngoài — chỉ hiện Emoji nổi sắc nét kèm quầng sáng nhẹ phía sau
    const glow = scene.add.graphics();
    glow.fillStyle(0xffffff, 0.16);
    glow.fillCircle(0, 0, size * 0.56);

    const img = scene.add.image(0, 0, key).setDisplaySize(size, size);
    container.add([glow, img]);

    // Nếu bám theo sprite đang đi bộ trên bàn cờ
    let followEvent = null;
    let floatOffset = 0;
    if (targetSprite?.active) {
      followEvent = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (!container?.active || !targetSprite?.active) return;
          container.x = targetSprite.x + offsetX;
          container.y = targetSprite.y + offsetY + floatOffset;
        },
      });
    }

    const cleanup = () => {
      if (followEvent) { followEvent.remove(false); followEvent = null; }
      if (container?.active) container.destroy();
    };
    scene._activeEmojiBubbles.set(Number(userId), { cleanup });

    // Hiệu ứng pop-in nảy mềm
    scene.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 240,
      ease: "Back.easeOut",
    });

    // Nhún nhẹ liên tục cho sinh động
    const bobTarget = { v: 0 };
    const bobTween = scene.tweens.add({
      targets: bobTarget,
      v: -6,
      duration: 420,
      yoyo: true,
      repeat: 4,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        floatOffset = bobTarget.v;
        if (!targetSprite && container?.active) {
          container.y = startY + floatOffset;
        }
      },
    });

    // Tự mờ đi và biến mất sau 2.6 giây
    scene.time.delayedCall(2500, () => {
      if (!container?.active) return;
      try { bobTween?.stop(); } catch (_) {}
      scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 16,
        scaleX: 0.75,
        scaleY: 0.75,
        duration: 320,
        ease: "Quad.easeIn",
        onComplete: () => {
          cleanup();
          if (scene._activeEmojiBubbles?.get(Number(userId))?.cleanup === cleanup) {
            scene._activeEmojiBubbles.delete(Number(userId));
          }
        },
      });
    });
  };

  if (scene.textures?.exists(key)) {
    spawn();
  } else if (scene.load) {
    scene.load.image(key, `assets/resources/Emoji/PNG/thumbs_96/${id}.png`);
    scene.load.once(`filecomplete-image-${key}`, spawn);
    scene.load.start();
  }
}
