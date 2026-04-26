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

export function playBuySound(scene) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists("buy_sfx")) {
      scene.load.audio("buy_sfx", "assets/music/shared/buy.mp3");
      scene.load.once("complete", () => _playOnce(scene, "buy_sfx"));
      scene.load.start();
    } else {
      _playOnce(scene, "buy_sfx");
    }
  } catch(e) {}
}

// ── Board game sounds ────────────────────────────────────────────
export function playBoardBuySound(scene) {
  _playBoardSound(scene, "board_buy", "assets/music/board/buy_1.mp3");
}

export function playBoardDiceSound(scene) {
  _playBoardSound(scene, "board_dice", "assets/music/board/dice2.mp3");
}

export function playBoardTarotSound(scene) {
  _playBoardSound(scene, "board_tarot", "assets/music/board/tarot.mp3");
}

export function startFootstepSound(scene) {
  try {
    if (!scene?.sound) return;
    // Dừng footstep cũ nếu có
    const existing = scene.sound.get("board_footstep");
    if (existing?.isPlaying) existing.stop();

    const play = () => {
      let sfx = scene.sound.get("board_footstep");
      if (!sfx) sfx = scene.sound.add("board_footstep", { loop: true, volume: 0.55, rate: 1.1 });
      sfx.setVolume(0.55);
      if (!sfx.isPlaying) sfx.play();
    };

    if (!scene.cache.audio.exists("board_footstep")) {
      scene.load.audio("board_footstep", "assets/music/board/footstep3.mp3");
      scene.load.once("complete", play);
      scene.load.start();
    } else {
      play();
    }
  } catch(e) {}
}

export function stopFootstepSound(scene) {
  try {
    scene?.sound?.get("board_footstep")?.stop();
  } catch(e) {}
}

export function playBoardStartSound(scene) {
  _playBoardSound(scene, "board_start", "assets/music/board/start.mp3");
}

export function playBoardErrSound(scene) {
  _playBoardSound(scene, "board_err", "assets/music/board/err.mp3");
}

export function playBoardHunterSound(scene) {
  _playBoardSound(scene, "board_hunter", "assets/music/board/hunter.mp3");
}

export function playBoardIncreaseSound(scene) {
  _playBoardSound(scene, "board_increase", "assets/music/board/increase.mp3");
}

export function playBoardTeacherSound(scene) {
  _playBoardSound(scene, "board_teacher", "assets/music/board/teacher.mp3");
}

export function playBoardSkillSound(scene) {
  _playBoardSound(scene, "board_skill", "assets/music/board/skill.mp3");
}

export function playBoardAnswerSound(scene) {
  _playBoardSound(scene, "board_answer", "assets/music/board/answer.mp3");
}

export function playBoardCoinSound(scene) {
  _playBoardSound(scene, "board_coin", "assets/music/board/coin2.mp3");
}
export function playBoardBGM(scene) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists("board_bgm")) {
      scene.load.audio("board_bgm", "assets/music/board/game.mp3");
      scene.load.once("complete", () => {
        const bgm = scene.sound.add("board_bgm", { loop: true, volume: 0.22 });
        bgm.play();
      });
      scene.load.start();
    } else {
      let bgm = scene.sound.get("board_bgm");
      if (!bgm) bgm = scene.sound.add("board_bgm", { loop: true, volume: 0.22 });
      if (!bgm.isPlaying) bgm.play();
    }
  } catch(e) {}
}

function _playBoardSound(scene, key, path) {
  try {
    if (!scene?.sound) return;
    if (!scene.cache.audio.exists(key)) {
      scene.load.audio(key, path);
      scene.load.once("complete", () => _playOnce(scene, key, 0.6));
      scene.load.start();
    } else {
      _playOnce(scene, key, 0.6);
    }
  } catch(e) {}
}

function _playOnce(scene, key, volume = 0.5) {
  try {
    let sfx = scene.sound.get(key);
    if (!sfx) sfx = scene.sound.add(key, { volume });
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
