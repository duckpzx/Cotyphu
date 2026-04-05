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

}