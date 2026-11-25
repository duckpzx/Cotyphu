/**
 * clickSound — Helper phát âm thanh & quản lý Bật/Tắt Nhạc nền / Âm thanh toàn cục
 * Tự động đồng bộ file âm thanh, âm lượng và trạng thái bật/tắt cấu hình từ Admin Dashboard (/api/audio-config).
 * Gọi setupClickSound(scene) trong create() của mỗi scene.
 */

const LS_MUSIC_KEY = "setting_music_enabled";
const LS_SOUND_KEY = "setting_sound_enabled";

let _audioTrackMap = {};
let _audioConfigPromise = null;

export function ensureAudioConfigLoaded() {
  if (_audioConfigPromise) return _audioConfigPromise;
  _audioConfigPromise = fetch(`/api/audio-config?t=${Date.now()}`)
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      if (json?.success && Array.isArray(json.tracks)) {
        const next = {};
        for (const t of json.tracks) next[t.id] = t;
        _audioTrackMap = next;
      }
      return _audioTrackMap;
    })
    .catch(() => _audioTrackMap);
  return _audioConfigPromise;
}

// Khởi tải cấu hình âm thanh ngay khi game khởi động
ensureAudioConfigLoaded();

export function getAudioTrackUrl(key, fallbackPath) {
  const t = _audioTrackMap[key];
  if (!t || !t.active_url) return fallbackPath;
  return `${t.active_url}?v=${t.version || 1}`;
}

export function getAudioTrackVolume(key, fallbackVol = 1.0) {
  const t = _audioTrackMap[key];
  if (t && typeof t.volume === "number") return Math.max(0, Math.min(1, t.volume));
  return fallbackVol;
}

export function isAudioTrackEnabled(key) {
  const t = _audioTrackMap[key];
  if (t && t.enabled === false) return false;
  return true;
}

export function isMusicEnabled() {
  try { return localStorage.getItem(LS_MUSIC_KEY) !== "0"; } catch (e) { return true; }
}

export function isSoundEnabled() {
  try { return localStorage.getItem(LS_SOUND_KEY) !== "0"; } catch (e) { return true; }
}

export function setMusicEnabled(scene, enabled) {
  try { localStorage.setItem(LS_MUSIC_KEY, enabled ? "1" : "0"); } catch (e) {}
  try {
    if (!scene?.sound) return;
    const lobbyBgm = scene.sound.get("lobby_bgm");
    const boardBgm = scene.sound.get("board_bgm");
    if (!enabled) {
      if (lobbyBgm?.isPlaying) lobbyBgm.stop();
      if (boardBgm?.isPlaying) boardBgm.stop();
    } else {
      const key = scene.scene?.key;
      if (key === "BoardScene") {
        playBoardBGM(scene);
      } else {
        if (!isAudioTrackEnabled("lobby_bgm")) return;
        let bgm = lobbyBgm;
        const vol = getAudioTrackVolume("lobby_bgm", 0.56);
        if (!bgm && scene.cache?.audio?.exists("lobby_bgm")) {
          bgm = scene.sound.add("lobby_bgm", { loop: true, volume: vol });
        }
        if (bgm) {
          bgm.setVolume?.(vol);
          if (!bgm.isPlaying) bgm.play();
        }
      }
    }
  } catch (e) {}
}

export function setSoundEnabled(scene, enabled) {
  try { localStorage.setItem(LS_SOUND_KEY, enabled ? "1" : "0"); } catch (e) {}
  try {
    if (!enabled && scene?.sound) {
      ["board_footstep", "click_sfx", "click2_sfx", "out_sfx", "use_sfx", "buy_sfx"].forEach(k => {
        const s = scene.sound.get(k);
        if (s?.isPlaying) s.stop();
      });
    }
  } catch (e) {}
}

export function setupClickSound(scene) {
  ensureAudioConfigLoaded().finally(() => {
    try {
      if (!scene?.load || !scene?.cache) return;
      if (!scene.cache.audio.exists("click_sfx")) {
        scene.load.audio("click_sfx", getAudioTrackUrl("click_sfx", "assets/music/shared/click.mp3"));
        scene.load.once("complete", () => _bindClick(scene));
        scene.load.start();
      } else {
        _bindClick(scene);
      }
    } catch (e) {}
  });
}

export function playTabSound(scene) {
  _playSharedSound(scene, "click2_sfx", "assets/music/shared/click2.mp3", 1.0);
}

export function playOutSound(scene) {
  _playSharedSound(scene, "out_sfx", "assets/music/shared/out.mp3", 1.0);
}

export function playUseSound(scene) {
  _playSharedSound(scene, "use_sfx", "assets/music/shared/use.mp3", 1.0);
}

export function playBuySound(scene) {
  _playSharedSound(scene, "buy_sfx", "assets/music/shared/buy.mp3", 1.0);
}

function _playSharedSound(scene, key, fallbackPath, defaultVol) {
  try {
    if (!scene?.sound || !isSoundEnabled() || !isAudioTrackEnabled(key)) return;
    const vol = getAudioTrackVolume(key, defaultVol);
    if (!scene.cache.audio.exists(key)) {
      scene.load.audio(key, getAudioTrackUrl(key, fallbackPath));
      scene.load.once("complete", () => _playOnce(scene, key, vol));
      scene.load.start();
    } else {
      _playOnce(scene, key, vol);
    }
  } catch (e) {}
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
    if (!scene?.sound || !isSoundEnabled() || !isAudioTrackEnabled("board_footstep")) return;
    const existing = scene.sound.get("board_footstep");
    if (existing?.isPlaying) existing.stop();
    const vol = getAudioTrackVolume("board_footstep", 1.0);

    const play = () => {
      let sfx = scene.sound.get("board_footstep");
      if (!sfx) sfx = scene.sound.add("board_footstep", { loop: true, volume: vol, rate: 1.1 });
      sfx.setVolume(vol);
      if (!sfx.isPlaying) sfx.play();
    };

    if (!scene.cache.audio.exists("board_footstep")) {
      scene.load.audio("board_footstep", getAudioTrackUrl("board_footstep", "assets/music/board/footstep3.mp3"));
      scene.load.once("complete", play);
      scene.load.start();
    } else {
      play();
    }
  } catch (e) {}
}

export function stopFootstepSound(scene) {
  try {
    scene?.sound?.get("board_footstep")?.stop();
  } catch (e) {}
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
  ensureAudioConfigLoaded().finally(() => {
    try {
      if (!scene?.sound || !isMusicEnabled() || !isAudioTrackEnabled("board_bgm")) return;
      const vol = getAudioTrackVolume("board_bgm", 0.44);
      if (!scene.cache.audio.exists("board_bgm")) {
        scene.load.audio("board_bgm", getAudioTrackUrl("board_bgm", "assets/music/board/game.mp3"));
        scene.load.once("complete", () => {
          if (!isMusicEnabled() || !isAudioTrackEnabled("board_bgm")) return;
          const bgm = scene.sound.add("board_bgm", { loop: true, volume: vol });
          bgm.play();
        });
        scene.load.start();
      } else {
        let bgm = scene.sound.get("board_bgm");
        if (!bgm) bgm = scene.sound.add("board_bgm", { loop: true, volume: vol });
        bgm.setVolume?.(vol);
        if (!bgm.isPlaying) bgm.play();
      }
    } catch (e) {}
  });
}

function _playBoardSound(scene, key, fallbackPath) {
  try {
    if (!scene?.sound || !isSoundEnabled() || !isAudioTrackEnabled(key)) return;
    const vol = getAudioTrackVolume(key, 1.0);
    if (!scene.cache.audio.exists(key)) {
      scene.load.audio(key, getAudioTrackUrl(key, fallbackPath));
      scene.load.once("complete", () => _playOnce(scene, key, vol));
      scene.load.start();
    } else {
      _playOnce(scene, key, vol);
    }
  } catch (e) {}
}

function _playOnce(scene, key, volume = 1.0) {
  try {
    if (!isSoundEnabled() || !isAudioTrackEnabled(key)) return;
    let sfx = scene.sound.get(key);
    if (!sfx) sfx = scene.sound.add(key, { volume });
    sfx.setVolume?.(volume);
    if (sfx && !sfx.isPlaying) sfx.play();
  } catch (e) {}
}

function _bindClick(scene) {
  if (scene._clickSoundBound) return;
  scene._clickSoundBound = true;

  scene.input.on("pointerdown", () => {
    try {
      if (!scene.sound || !scene.scene.isActive() || !isSoundEnabled() || !isAudioTrackEnabled("click_sfx")) return;
      const vol = getAudioTrackVolume("click_sfx", 0.9);
      let sfx = scene.sound.get("click_sfx");
      if (!sfx) sfx = scene.sound.add("click_sfx", { volume: vol });
      sfx.setVolume?.(vol);
      if (sfx && !sfx.isPlaying) sfx.play();
    } catch (e) {}
  });

  scene.events.once("shutdown", () => {
    scene._clickSoundBound = false;
  });
}
