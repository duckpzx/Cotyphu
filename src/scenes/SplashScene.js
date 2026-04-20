/**
 * SplashScene — Màn hình chờ trước LobbyScene
 * Mục đích: lấy user interaction để unlock AudioContext
 */
import { setupClickSound } from "../utils/clickSound.js";
export default class SplashScene extends Phaser.Scene {
  constructor() {
    super("SplashScene");
  }

  preload() {
    this.load.image("bg_account", "assets/nen_24.png");
    this.load.image("icon",       "assets/ui/cotyphu.png");
    this.load.audio("lobby_bgm",  "assets/music/lobby/lobbyscene.mp3");
  }

  create() {
    const { width, height } = this.scale;
    setupClickSound(this);

    // Nền
    const bg = this.add.image(width / 2, height / 2, "bg_account");
    bg.setScale(Math.max(width / bg.width, height / bg.height));
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45);

    // Logo
    this.add.image(width / 2, height / 2 - 60, "icon")
      .setDisplaySize(180, 180);

    // Text nhấn để vào
    const txt = this.add.text(width / 2, height / 2 + 80, "Nhấn để vào game", {
      fontFamily: "Signika", fontSize: "24px", color: "#ffe066",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5);

    // Nhấp nháy
    this.tweens.add({
      targets: txt, alpha: 0.3, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    // Click bất kỳ đâu → play nhạc + vào Lobby
    this.input.once("pointerdown", () => {
      if (!this.sound.get("lobby_bgm")) {
        const bgm = this.sound.add("lobby_bgm", { loop: true, volume: 0.15 });
        bgm.play();
      }
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("LobbyScene");
      });
    });
  }
}
