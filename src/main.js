// src/main.js
import LobbyScene from "./scenes/LobbyScene.js";
import BoardScene from "./scenes/BoardScene.js";
import TarotScene from "./scenes/TarotScene.js";
import RegisterScene from "./scenes/RegisterScene.js";
import LoginScene from "./scenes/LoginScene.js";
import SplashScene from "./scenes/SplashScene.js";
import CreateCharacterScene from "./scenes/CreateCharacterScene.js";
import RoomListScene from "./scenes/RoomListScene.js";
import RoomScene from "./scenes/RoomScene.js"
import BagScene from "./scenes/BagScene.js";
import ShopScene from "./scenes/ShopScene.js";
import RatingScene from "./scenes/RatingScene.js";
import LabScene from "./scenes/LabScene.js";

import { SERVER_URL } from "./config.js";

// ── CLEAN URL: Remove tracking params ─────────────────────────────
// Zalo và các platform khác thêm tracking params gây lỗi CORS
if (window.location.search) {
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
  console.log("🧹 Cleaned tracking params from URL");
}

// ── CHECK DEPENDENCIES ─────────────────────────────────────────────
function checkDependencies() {
  const missing = [];
  
  if (typeof Phaser === 'undefined') {
    missing.push('Phaser.js');
  }
  
  if (typeof io === 'undefined') {
    missing.push('Socket.IO');
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing dependencies:', missing.join(', '));
    alert(`Lỗi tải thư viện: ${missing.join(', ')}\n\nVui lòng reload trang hoặc kiểm tra kết nối mạng.`);
    return false;
  }
  
  return true;
}

window.onload = async function () {
  // Check if all dependencies loaded
  if (!checkDependencies()) {
    return;
  }

  console.log('✅ All dependencies loaded');

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
          }        }
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
      width: 1128,
      height: 636,
    },
    scene: [LoginScene, SplashScene, BoardScene, RegisterScene, RoomScene, LobbyScene, RoomListScene, CreateCharacterScene, TarotScene, BagScene, ShopScene, RatingScene, LabScene],
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };

  const game = new Phaser.Game(config);

  // Catch Phaser boot errors
  game.events.once('boot', () => {
    console.log('✅ Phaser game booted successfully');
  });

  game.events.on('error', (error) => {
    console.error('❌ Phaser error:', error);
  });

  // Start đúng scene
  game.events.once("ready", () => {
    if (startScene !== "LoginScene") {
      game.scene.stop("LoginScene");
      // Auto-login → qua SplashScene để lấy interaction trước khi play nhạc
      game.scene.start(startScene === "LobbyScene" ? "SplashScene" : startScene);
    }
  });

  // ── MOBILE VISIBILITY HANDLING ──────────────────────────────────
  // Xử lý khi app vào background/foreground trên mobile
  let isAppVisible = true;
  let reconnectTimer = null;

  const handleVisibilityChange = () => {
    if (document.hidden) {
      // App vào background
      isAppVisible = false;
      console.log("📱 App hidden - saving state");
      
      // Lưu thời điểm app bị hide
      localStorage.setItem("appHiddenTime", Date.now().toString());
    } else {
      // App quay lại foreground
      isAppVisible = true;
      console.log("📱 App visible - checking reconnect");
      
      const hiddenTime = localStorage.getItem("appHiddenTime");
      const now = Date.now();
      
      // Nếu bị hide quá 3 giây → có thể socket bị disconnect
      if (hiddenTime && (now - parseInt(hiddenTime)) > 3000) {
        console.log("⚠️ App was hidden for a while - forcing reconnect");
        
        // Delay một chút để app stable lại
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          // Trigger reconnect cho tất cả active scenes
          const boardScene = game.scene.getScene("BoardScene");
          const roomScene = game.scene.getScene("RoomScene");
          
          if (boardScene && boardScene.scene.isActive()) {
            console.log("🔄 Reconnecting BoardScene...");
            boardScene.handleReconnect?.();
          }
          
          if (roomScene && roomScene.scene.isActive()) {
            console.log("🔄 Reconnecting RoomScene...");
            roomScene.handleReconnect?.();
          }
        }, 500);
      }
      
      localStorage.removeItem("appHiddenTime");
    }
  };

  // Listen visibility changes
  document.addEventListener("visibilitychange", handleVisibilityChange);
  
  // iOS: pageshow/pagehide (bfcache)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      console.log("📱 Page restored from bfcache");
      handleVisibilityChange();
    }
  });

  // ── WINDOW RESIZE ───────────────────────────────────────────────
  window.addEventListener("resize", () => {
    game.scale.refresh();
  });

  // ── PREVENT ACCIDENTAL NAVIGATION ───────────────────────────────
  // Ngăn pull-to-refresh trên mobile
  document.body.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) return; // Allow pinch zoom
    e.preventDefault();
  }, { passive: false });

  // Cleanup
  window.addEventListener("beforeunload", () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
};