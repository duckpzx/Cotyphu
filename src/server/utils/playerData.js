export function getPlayerData(scene){

  let data = scene.registry.get("playerData");

  if(!data){
    data = JSON.parse(localStorage.getItem("playerData"));

    if(data){
      scene.registry.set("playerData", data);
    }
  }

  return data;
}

export function setPlayerData(scene, data){

  scene.registry.set("playerData", data);
  localStorage.setItem("playerData", JSON.stringify(data));
  
  if (scene.registry && scene.registry.events) {
    scene.registry.events.emit("playerData_changed", data);
  }
}

export function getActiveProfile(scene) {
  const pd = getPlayerData(scene);
  if (!pd || !pd.user) return { characterName: "Unknown", skin_id: 1, character_id: null };

  const activeCharId = pd.user.active_character_id;
  let character = (pd.characters || []).find(c => Number(c.id) === Number(activeCharId));

  if (!character && pd.characters && pd.characters.length > 0) {
    character = pd.characters[0];
  }

  if (!character) return { characterName: "Unknown", skin_id: 1, character_id: null };

  // active_skin_number là số thứ tự skin (1/2/3) dùng cho animation key
  // active_skin_id là DB ID — KHÔNG dùng trực tiếp cho animation
  const skinNumber = Number(character.active_skin_number) || 1;

  return {
    character_id: character.id,
    characterName: character.name || character.character_name || "Unknown",
    skin_id: skinNumber
  };
}

export function getActiveBackgroundPath(scene) {
  const pd = getPlayerData(scene);
  return pd?.user?.active_bg_path || "assets/ui/nen_chung.png";
}