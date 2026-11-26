/**
 * settingsBar.js — Nút Cài Đặt (bánh răng xanh bóng) góc trên phải dùng chung cho LobbyScene / RoomScene.
 * Bấm để trượt ra thanh pill Bật/Tắt Âm thanh (SFX) và Nhạc nền (BGM).
 */
import {
  isMusicEnabled,
  isSoundEnabled,
  setMusicEnabled,
  setSoundEnabled,
} from "./clickSound.js";

export function createSettingsButton(scene, {
  x,
  y = 46,
  size = 58,
  depth = 80,
} = {}) {
  const gearX = x ?? (scene.scale.width - 46);
  const gearY = y;

  let settingsBar = null;
  let outsideHandler = null;

  const closeBar = () => {
    if (outsideHandler) {
      scene.input.off("pointerdown", outsideHandler);
      outsideHandler = null;
    }
    if (settingsBar) {
      settingsBar.forEach(o => { try { o?.destroy(); } catch {} });
      settingsBar = null;
    }
  };

  const toggleBar = () => {
    if (settingsBar) {
      closeBar();
      return;
    }

    const ICON_SIZE = 52;
    const GAP       = 12;
    const PAD_X     = 8;
    const PAD_Y     = 4;
    const icons     = [
      { key: "icon_sound" },
      { key: "icon_music" },
    ];
    const barW = PAD_X + icons.length * ICON_SIZE + (icons.length - 1) * GAP + GAP + ICON_SIZE + PAD_X / 2;
    const barH = PAD_Y * 2 + ICON_SIZE;
    const barX = gearX + ICON_SIZE / 2 - barW;
    const barY = gearY - barH / 2;
    const D    = depth - 1;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const bg = push(scene.add.graphics().setDepth(D));
    bg.fillStyle(0x041428, 0.42);
    bg.fillRoundedRect(barX, barY, barW, barH, barH / 2);

    push(scene.add.zone(barX + barW / 2, barY + barH / 2, barW, barH)
      .setInteractive({ useHandCursor: true, cursor: "pointer" }).setDepth(D + 0.5));

    icons.forEach((item, i) => {
      const ix = barX + PAD_X + i * (ICON_SIZE + GAP) + ICON_SIZE / 2;
      const iy = barY + barH / 2;
      const isMusicBtn = item.key === "icon_music";
      const img = push(scene.add.image(ix, iy, item.key)
        .setDisplaySize(ICON_SIZE, ICON_SIZE).setDepth(D + 1)
        .setInteractive({ useHandCursor: true, cursor: "pointer" }));

      const badgeG = push(scene.add.graphics().setDepth(D + 2));
      const badgeTxt = push(scene.add.text(ix + 15, iy + 15, "×", {
        fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 3).setVisible(false));

      const drawState = () => {
        const active = isMusicBtn ? isMusicEnabled() : isSoundEnabled();
        badgeG.clear();
        if (active) {
          img.clearTint();
          img.setAlpha(1);
          badgeTxt.setVisible(false);
        } else {
          img.setTint(0x7c8aa0);
          img.setAlpha(0.55);
          const bx = ix + 15, by = iy + 15, br = 9;
          badgeG.fillStyle(0x000000, 0.35);
          badgeG.fillCircle(bx + 1, by + 1.5, br);
          badgeG.fillStyle(0xef4444, 1);
          badgeG.fillCircle(bx, by, br);
          badgeG.lineStyle(1.8, 0xffffff, 0.95);
          badgeG.strokeCircle(bx, by, br);
          badgeTxt.setPosition(bx, by - 0.5).setVisible(true);
        }
      };
      drawState();

      img.on("pointerover", () => img.setAlpha(0.85));
      img.on("pointerout",  () => drawState());
      img.on("pointerdown", () => {
        if (isMusicBtn) {
          setMusicEnabled(scene, !isMusicEnabled());
        } else {
          setSoundEnabled(scene, !isSoundEnabled());
        }
        drawState();
        scene.tweens.add({ targets: img, alpha: 0.5, duration: 60, yoyo: true });
      });
    });

    settingsBar = objs;

    objs.forEach(o => { if (o?.x !== undefined) o.x += barW * 0.6; });
    scene.tweens.add({
      targets: objs.filter(o => o?.x !== undefined),
      x: `-=${barW * 0.6}`, duration: 200, ease: "Back.easeOut"
    });

    scene.time.delayedCall(220, () => {
      if (!settingsBar) return;
      outsideHandler = (p) => {
        const inBar = p.x >= barX - 4 && p.x <= barX + barW + 4 && p.y >= barY - 4 && p.y <= barY + barH + 4;
        if (!inBar) closeBar();
      };
      scene.input.on("pointerdown", outsideHandler);
    });
  };

  const gearIcon = scene.add.image(gearX, gearY, "icon_setting")
    .setDisplaySize(size, size)
    .setDepth(depth + 2)
    .setInteractive({ useHandCursor: true, cursor: "pointer" });

  gearIcon.on("pointerover", () => scene.tweens.add({ targets: gearIcon, scaleX: gearIcon.scaleX * 1.06, scaleY: gearIcon.scaleY * 1.06, duration: 100 }));
  gearIcon.on("pointerout",  () => gearIcon.setDisplaySize(size, size));
  gearIcon.on("pointerdown", () => toggleBar());

  scene.events.once("shutdown", closeBar);
  return { gearIcon, closeBar };
}
