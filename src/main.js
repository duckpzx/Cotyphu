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
import RatingScene from "./scenes/RatingScene.js";
import LabScene from "./scenes/LabScene.js";

import { SERVER_URL } from "./config.js";

window.onload = async function () {
  const root = document.getElementById("root-game");
  const rect = root.getBoundingClientRect();

  // ── Auto-login: kiểm tra token còn hợp lệ không ──────────────
  let startScene = "LoginScene";

  const saved = localStorage.getItem("playerData");
  if (saved) {
    try {
      const pd = JSON.parse(saved);
      const token = pd?.token;
      if (token) {
        const res = await fetch(`${SERVER_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          // Token hợp lệ — cập nhật user mới nhất vào localStorage
          pd.user = data.user;
          localStorage.setItem("playerData", JSON.stringify(pd));
          // Kiểm tra có đang trong ván đấu không
          const gameState = localStorage.getItem("gameState");
          if (gameState) {
            try {
              const gs = JSON.parse(gameState);
              if (gs.scene === "BoardScene") startScene = "BoardScene";
              else startScene = "LobbyScene";
            } catch { startScene = "LobbyScene"; }
          } else {
            startScene = "LobbyScene";
          }
        }
      }
    } catch {
      // Network lỗi hoặc token hết hạn → về LoginScene
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: "root-game",
    backgroundColor: "#020617",
    disableVisibilityChange: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: rect.width,
      height: rect.height,
    },
    scene: [LoginScene, BoardScene, RegisterScene, RoomScene, LobbyScene, RoomListScene, CreateCharacterScene, TarotScene, BagScene, ShopScene, RatingScene, LabScene],
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };

  const game = new Phaser.Game(config);

  // Start đúng scene
  game.events.once("ready", () => {
    if (startScene !== "LoginScene") {
      game.scene.stop("LoginScene");
      game.scene.start(startScene);
    }
  });

  window.addEventListener("resize", () => {
    const r = root.getBoundingClientRect();
    game.scale.resize(r.width, r.height);
  });
};