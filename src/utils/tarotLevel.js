import { getPlayerData, setPlayerData } from "../server/utils/playerData.js";

// Cấp thẻ tarot của người chơi: { [tarotId]: 1|2 } — mặc định Lv1 (Tarot_1, màu xanh)
export function getTarotLevels(scene) {
  let lv = getPlayerData(scene)?.user?.tarot_levels;
  if (typeof lv === "string") { try { lv = JSON.parse(lv); } catch { lv = {}; } }
  return lv && typeof lv === "object" ? lv : {};
}

export function getTarotLevel(scene, id) {
  return Number(getTarotLevels(scene)[id]) >= 2 ? 2 : 1;
}

export function saveTarotLevels(scene, levels) {
  const data = getPlayerData(scene);
  if (data?.user) {
    data.user.tarot_levels = levels;
    setPlayerData(scene, data);
  }
}

// small=true: ảnh nhỏ dùng trong ván (Lv2 có bản resize; Lv1 dùng ảnh gốc)
export function tarotImagePath(id, level, small = false) {
  if (level >= 2) {
    return small
      ? `assets/resources/Tarot/Tarot_2/resize/thebai_${id}.png`
      : `assets/resources/Tarot/Tarot_2/thebai_${id}.png`;
  }
  return small
    ? `assets/resources/Tarot/Tarot_1/resize/thebai_${id}.png`
    : `assets/resources/Tarot/Tarot_1/thebai_${id}.png`;
}

// Nếu texture `key` đang giữ sai cấp → xoá để load lại đúng cấp.
// Trả về true nếu cần load.
export function prepareLevelTexture(scene, key, level) {
  if (scene.textures.exists(key)) {
    const cur = scene.textures.get(key).customData?.tarotLevel;
    if (cur === level) return false;
    scene.textures.remove(key);
  }
  return true;
}

export function markLevelTexture(scene, key, level) {
  if (scene.textures.exists(key)) {
    scene.textures.get(key).customData = { tarotLevel: level };
  }
}

// Texture riêng theo (thẻ, cấp) — dùng để hiển thị thẻ của BẤT KỲ người chơi nào đúng cấp của họ.
export function tarotLevelKey(id, level, small = true) {
  return `tarotL${level >= 2 ? 2 : 1}${small ? "s" : "l"}_${id}`;
}

// Load (nếu chưa có) rồi gọi cb(key). Nếu lỗi thì cb(null).
export function ensureTarotLevelTexture(scene, id, level, small, cb) {
  const lv = level >= 2 ? 2 : 1;
  const key = tarotLevelKey(id, lv, small);
  if (scene.textures.exists(key)) { cb(key); return; }
  const onOk = (k) => { if (k !== key) return; cleanup(); cb(key); };
  const onErr = (f) => { if (f?.key !== key) return; cleanup(); cb(null); };
  const cleanup = () => {
    scene.load.off("filecomplete", onOk);
    scene.load.off("loaderror", onErr);
  };
  scene.load.on("filecomplete", onOk);
  scene.load.on("loaderror", onErr);
  scene.load.image(key, tarotImagePath(id, lv, small));
  if (!scene.load.isLoading()) scene.load.start();
}
