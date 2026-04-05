// src/main.js
import LobbyScene from "./scenes/LobbyScene.js";
import BoardScene from "./scenes/BoardScene.js";
import TarotScene from "./scenes/TarotScene.js";
import RegisterScene from "./scenes/RegisterScene.js";
import LoginScene from "./scenes/LoginScene.js";
import CreateCharacterScene from "./scenes/CreateCharacterScene.js";
import RoomListScene from "./scenes/RoomListScene.js";
import RoomScene from "./scenes/RoomScene.js"
import BagScene from "./scenes/BagScene.js";
import ShopScene from "./scenes/ShopScene.js";

window.onload = function () {
  const root = document.getElementById("root-game");
  const rect = root.getBoundingClientRect();

  // kiểm tra save game
  const saved = localStorage.getItem("gameState");
  let startScene = "LobbyScene";

  if (saved) {
    const data = JSON.parse(saved);

    if (data.scene === "BoardScene") {
      startScene = "BoardScene";
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: "root-game",
    backgroundColor: "#020617",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: rect.width,
      height: rect.height,
    },
    scene: [LoginScene, BoardScene, RegisterScene, RoomScene, LobbyScene, RoomListScene, CreateCharacterScene, TarotScene, BagScene, ShopScene],
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };

  const game = new Phaser.Game(config);

  // nếu có save thì tự chuyển scene
  if (startScene === "BoardScene") {
    game.scene.start("BoardScene");
  }

  window.addEventListener("resize", () => {
    const r = root.getBoundingClientRect();
    game.scale.resize(r.width, r.height);
  });
};