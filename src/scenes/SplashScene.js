/**
 * SplashScene — Màn hình chờ trước LobbyScene
 *
 * Đổi STYLE để chọn hiệu ứng nút TIẾP TỤC:
 *   "pulse"   → Vòng lan pulse vàng (mặc định, gần với ảnh gốc nhất)
 *   "orb"     → Viền xoay cầu vồng energy orb
 *   "shimmer" → Nút pill ngang có ánh sáng quét
 */
import { setupClickSound } from "../utils/clickSound.js";

const STYLE = "pulse"; // "pulse" | "orb" | "shimmer"

// ─────────────────────────────────────────────────────────
// CSS theo từng style
// ─────────────────────────────────────────────────────────
const STYLES = {
  /* ── PULSE RING ─────────────────────────────────────── */
  pulse: `
    @import url('https://fonts.googleapis.com/css2?family=Signika:wght@700&display=swap');

    #splash-ui {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 9999;
      gap: 18px;
    }

    /* Wrapper bắt sự kiện hover / click */
    #splash-play {
      position: relative;
      width: 90px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: all;
      cursor: pointer;
    }

    /* Hào quang teal/cyan loang không đều — hòa với crystals trong map */
    #splash-play::before,
    #splash-play::after {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      background: radial-gradient(
        ellipse at 46% 50%,
        rgba(0, 220, 210, 0.42) 0%,
        rgba(0, 160, 200, 0.16) 45%,
        transparent 72%
      );
      animation: splash-pulse 2.5s ease-out infinite;
    }
    #splash-play::after {
      animation-delay: 1.25s;
      background: radial-gradient(
        ellipse at 54% 48%,
        rgba(80, 235, 220, 0.32) 0%,
        rgba(20, 180, 215, 0.10) 50%,
        transparent 75%
      );
    }
    @keyframes splash-pulse {
      0%   { transform: scale(0.86) scaleX(1.00); opacity: 0.85; }
      40%  { transform: scale(1.22) scaleX(1.07); opacity: 0.45; }
      100% { transform: scale(1.82) scaleX(0.96); opacity: 0; }
    }

    /* Ảnh icon — glow teal khớp với crystals nền */
    #splash-play img {
      position: relative;
      z-index: 1;
      width: 90px;
      height: 90px;
      object-fit: contain;
      animation: icon-breathe 2.6s ease-in-out infinite;
      transition: transform 0.18s cubic-bezier(.34,1.56,.64,1);
    }
    #splash-play:hover img {
      transform: scale(1.12);
    }
    #splash-play:active img {
      transform: scale(0.95);
    }
    @keyframes icon-breathe {
      0%, 100% {
        transform: scale(1.0);
        filter: drop-shadow(0 0 8px rgba(0, 200, 210, 0.45))
                drop-shadow(0 4px 16px rgba(0,0,0,0.7));
      }
      50% {
        transform: scale(1.06);
        filter: drop-shadow(0 0 22px rgba(0, 230, 220, 0.80))
                drop-shadow(0 0 42px rgba(0, 180, 215, 0.35))
                drop-shadow(0 4px 18px rgba(0,0,0,0.65));
      }
    }

    /* Chữ — trắng ngà, viền teal nhẹ, hòa tông */
    #splash-label {
      font-family: 'Signika', sans-serif;
      font-size: 17px;
      font-weight: 700;
      color: #f4f4f6ac;
      text-shadow:
        0 1px 4px rgba(0,0,0,0.95),
        0 0 18px rgba(0, 200, 210, 0.55);
      animation: label-fade 2.6s ease-in-out infinite;
      pointer-events: none;
      user-select: none;
    }
    @keyframes label-fade {
      0%, 100% { opacity: 0.70; }
      50%       { opacity: 1.0; }
    }
  `,

  /* ── ENERGY ORB ─────────────────────────────────────── */
  orb: `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');

    #splash-ui {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 9999;
      gap: 20px;
    }

    #splash-play {
      position: relative;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      padding: 4px;
      /* viền cầu vồng xoay */
      background: conic-gradient(
        from 0deg,
        #00f0ff, #0070ff, #8040ff,
        #ff40ff, #ff1060, #00f0ff
      );
      animation: orb-spin 3s linear infinite;
      pointer-events: all;
      cursor: pointer;
      transition: filter 0.2s;
    }
    #splash-play:hover {
      filter: brightness(1.25) drop-shadow(0 0 18px rgba(0, 200, 255, 0.6));
    }
    #splash-play:active {
      transform: scale(0.93);
    }
    @keyframes orb-spin {
      to { transform: rotate(360deg); }
    }

    /* Lõi tối bên trong */
    #splash-play::before {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      background: #07132a;
      z-index: 0;
    }

    #splash-play img {
      position: relative;
      z-index: 1;
      width: 76px;
      height: 76px;
      object-fit: contain;
      margin: 6px;
      filter: drop-shadow(0 0 10px #00e5ff) drop-shadow(0 0 24px rgba(0, 200, 255, 0.5));
      animation: orb-icon-pulse 2.5s ease-in-out infinite;
    }
    @keyframes orb-icon-pulse {
      0%, 100% { filter: drop-shadow(0 0 8px #00e5ff); }
      50%       { filter: drop-shadow(0 0 22px #00e5ff) drop-shadow(0 0 40px rgba(0,200,255,0.4)); }
    }

    #splash-label {
      font-family: 'Orbitron', monospace;
      font-size: 14px;
      font-weight: 700;
      word-space: 1px;
      color: #00e5ff;
      text-shadow: 0 0 12px rgba(0, 220, 255, 0.8);
      animation: label-fade 2.5s ease-in-out infinite;
      pointer-events: none;
      user-select: none;
    }
    @keyframes label-fade {
      0%, 100% { opacity: 0.6; }
      50%       { opacity: 1.0; }
    }
  `,

  /* ── SHIMMER PILL ───────────────────────────────────── */
  shimmer: `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap');

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

    #splash-play {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 36px;
      border-radius: 50px;
      background: linear-gradient(135deg, #1a72e8 0%, #0a3fa0 100%);
      border: 1.5px solid rgba(120, 190, 255, 0.45);
      position: relative;
      overflow: hidden;
      pointer-events: all;
      cursor: pointer;
      animation: pill-breathe 3s ease-in-out infinite;
      transition: transform 0.15s cubic-bezier(.34,1.56,.64,1);
    }
    #splash-play:hover {
      transform: scale(1.05);
    }
    #splash-play:active {
      transform: scale(0.96);
    }

    /* Ánh sáng quét qua */
    #splash-play::after {
      content: '';
      position: absolute;
      top: -60%;
      left: -80%;
      width: 55%;
      height: 220%;
      background: rgba(255, 255, 255, 0.18);
      transform: skewX(-22deg);
      animation: shimmer-pass 2.8s ease-in-out infinite;
    }
    @keyframes shimmer-pass {
      0%        { left: -80%; opacity: 0; }
      10%       { opacity: 1; }
      60%, 100% { left: 130%; opacity: 0; }
    }

    @keyframes pill-breathe {
      0%, 100% { box-shadow: 0 0 18px rgba(30, 120, 255, 0.4), 0 4px 24px rgba(0,0,0,0.5); }
      50%       { box-shadow: 0 0 38px rgba(30, 120, 255, 0.75), 0 8px 32px rgba(0,0,0,0.6); }
    }

    #splash-play img {
      width: 36px;
      height: 36px;
      object-fit: contain;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
    }

    #splash-label {
      font-family: 'Nunito', sans-serif;
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      text-shadow: 0 2px 8px rgba(0, 50, 200, 0.8);
      position: relative;
      z-index: 1;
      pointer-events: none;
      user-select: none;
    }
  `,
};

// ─────────────────────────────────────────────────────────
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

    // ── Nền lobby ────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "splash_bg");
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    // ── Blur canvas + overlay tối ────────────────────────
    const canvas = this.game.canvas;
    canvas.style.filter = "blur(6px)";
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.30);

    // ── Inject CSS ────────────────────────────────────────
    const style = document.createElement("style");
    style.id = "splash-style";
    style.textContent = STYLES[STYLE] || STYLES.pulse;
    document.head.appendChild(style);

    // ── Tạo DOM UI ────────────────────────────────────────
    const ui = document.createElement("div");
    ui.id = "splash-ui";

    // Wrapper nút play (bắt sự kiện, pointer-events: all)
    const playBtn = document.createElement("div");
    playBtn.id = "splash-play";

    const img = document.createElement("img");
    img.src = window.location.origin + "/assets/ui/shared/start.png";
    img.alt = "iCon&TiepTuc";
    playBtn.appendChild(img);

    // Label chữ (cho shimmer thì nằm trong playBtn)
    const lbl = document.createElement("span");
    lbl.id = "splash-label";
    lbl.textContent = "BẤM BẤT KÌ ĐỂ TIẾP TỤC";

    if (STYLE === "shimmer") {
      // Icon + chữ nằm trong cùng pill
      playBtn.appendChild(lbl);
      ui.appendChild(playBtn);
    } else {
      // Icon trên, chữ dưới
      ui.appendChild(playBtn);
      ui.appendChild(lbl);
    }

    document.body.appendChild(ui);

    this._splashUI    = ui;
    this._splashStyle = style;

    // ── Click handler — dùng DOM trực tiếp thay vì Phaser input ──
    // Phaser input không nhận khi click vào DOM element đè lên canvas
    const doEnter = () => {
      if (this._entering) return;
      this._entering = true;

      // Hiệu ứng: icon scale up + fade out
      playBtn.style.transition = "transform 0.3s ease, opacity 0.3s ease";
      playBtn.style.transform  = "scale(1.4)";
      playBtn.style.opacity    = "0";
      if (lbl) { lbl.style.transition = "opacity 0.2s"; lbl.style.opacity = "0"; }

      // Bỏ blur canvas dần
      let blurVal = 6;
      const blurInterval = setInterval(() => {
        blurVal = Math.max(0, blurVal - 1);
        this.game.canvas.style.filter = blurVal > 0 ? `blur(${blurVal}px)` : "";
        if (blurVal === 0) clearInterval(blurInterval);
      }, 40);

      setTimeout(() => {
        this._cleanup();
        if (!this.sound.get("lobby_bgm")) {
          try {
            const bgm = this.sound.add("lobby_bgm", { loop: true, volume: 0.28 });
            bgm.play();
          } catch(e) {}
        }
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start("LobbyScene");
        });
      }, 320);
    };

    // Bắt cả click DOM lẫn Phaser (để đảm bảo hoạt động)
    playBtn.addEventListener("click", doEnter);
    ui.addEventListener("click", doEnter);
    this.input.once("pointerdown", doEnter);
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