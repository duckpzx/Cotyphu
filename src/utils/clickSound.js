/**
 * clickSound — Helper phát âm thanh click toàn cục
 * Gọi setupClickSound(scene) trong create() của mỗi scene
 */

export function setupClickSound(scene) {
  // Load nếu chưa có trong cache
  if (!scene.cache.audio.exists("click_sfx")) {
    scene.load.audio("click_sfx", "assets/music/shared/click.mp3");
    scene.load.once("complete", () => _bindClick(scene));
    scene.load.start();
  } else {
    _bindClick(scene);
  }
}

function _bindClick(scene) {
  // Tránh đăng ký nhiều lần
  if (scene._clickSoundBound) return;
  scene._clickSoundBound = true;

  scene.input.on("pointerdown", () => {
    try {
      if (!scene.sound || !scene.scene.isActive()) return;
      let sfx = scene.sound.get("click_sfx");
      if (!sfx) sfx = scene.sound.add("click_sfx", { volume: 0.45 });
      if (sfx && !sfx.isPlaying) sfx.play();
    } catch(e) {}
  });

  // Cleanup khi scene shutdown
  scene.events.once("shutdown", () => {
    scene._clickSoundBound = false;
  });
}
