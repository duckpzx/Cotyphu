/**
 * SplashScene — Màn hình chờ trước LobbyScene
 */
import { setupClickSound } from "../utils/clickSound.js";
export default class SplashScene extends Phaser.Scene {
  constructor() {
    super("SplashScene");
  }

  preload() {
    this.load.image("splash_bg",  "assets/ui/lobby/background.png");
    this.load.audio("lobby_bgm",  "assets/music/lobby/lobbyscene.mp3");
  }

  create() {
    const { width, height } = this.scale;
    setupClickSound(this);

    // ── Nền lobby ────────────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "splash_bg");
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    // ── Blur canvas + overlay tối ─────────────────────────────────
    const canvas = this.game.canvas;
    canvas.style.filter = "blur(6px)";
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.30);

    // ── DOM: icon + label đè lên (không bị blur) ──────────────────
    const style = document.createElement("style");
    style.id = "splash-style";
    style.textContent = `
      #splash-ui {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 9999;
      }
      #splash-ui img {
        width: 95px; height: 95px;
        object-fit: contain;
        filter: drop-shadow(0 4px 16px rgba(0,0,0,0.8));
      }
      #splash-ui span {
        position: fixed;
        bottom: 39.5%;
        font-family: 'Signika', sans-serif;
        font-size: 18px;
        font-weight: bold;
        color: #ffffff;
        background: linear-gradient(to top, #0f0f0f50, transparent);
        padding: 8px 16px;
        border-radius: 8px;
        text-shadow: 0 2px 6px #222222;
        letter-spacing: 1px;
      }
    `;
    document.head.appendChild(style);

    const ui = document.createElement("div");
    ui.id = "splash-ui";

    const img = document.createElement("img");
    img.src = window.location.origin + "/assets/ui/shared/start.png";

    const lbl = document.createElement("span");
    lbl.textContent = "TIẾP TỤC";

    ui.appendChild(img);
    ui.appendChild(lbl);
    document.body.appendChild(ui);

    this._splashUI    = ui;
    this._splashStyle = style;

    // ── Click → dọn dẹp, play nhạc, vào Lobby ───────────────────
    this.input.once("pointerdown", () => {
      this._cleanup();
      if (!this.sound.get("lobby_bgm")) {
        const bgm = this.sound.add("lobby_bgm", { loop: true, volume: 0.38 });
        bgm.play();
      }
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("LobbyScene");
      });
    });
  }

  _cleanup() {
    this.game.canvas.style.filter = "";
    this._splashUI?.remove();
    this._splashStyle?.remove();
    this._splashUI    = null;
    this._splashStyle = null;
  }

  shutdown() {
    this._cleanup();
  }
}
