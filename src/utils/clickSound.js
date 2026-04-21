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

export function playTabSound(scene) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists("click2_sfx")) {
      scene.load.audio("click2_sfx", "assets/music/shared/click2.mp3");
      scene.load.once("complete", () => _playOnce(scene, "click2_sfx"));
      scene.load.start();
    } else {
      _playOnce(scene, "click2_sfx");
    }
  } catch(e) {}
}

export function playOutSound(scene) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists("out_sfx")) {
      scene.load.audio("out_sfx", "assets/music/shared/out.mp3");
      scene.load.once("complete", () => _playOnce(scene, "out_sfx"));
      scene.load.start();
    } else {
      _playOnce(scene, "out_sfx");
    }
  } catch(e) {}
}

export function playUseSound(scene) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists("use_sfx")) {
      scene.load.audio("use_sfx", "assets/music/shared/use.mp3");
      scene.load.once("complete", () => _playOnce(scene, "use_sfx"));
      scene.load.start();
    } else {
      _playOnce(scene, "use_sfx");
    }
  } catch(e) {}
}

function _playOnce(scene, key) {
  try {
    let sfx = scene.sound.get(key);
    if (!sfx) sfx = scene.sound.add(key, { volume: 0.55 });
    if (sfx && !sfx.isPlaying) sfx.play();
  } catch(e) {}
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
