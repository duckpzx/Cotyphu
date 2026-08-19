import { setupClickSound, playOutSound } from "../utils/clickSound.js";
import { createLoadingOverlay } from "../utils/loadingOverlay.js";
import { getActiveProfile, getPlayerData } from "../server/utils/playerData.js";

// ═══════════════════════════════════════════════════════════════════
//  LabScene — Nghiên Cứu / Nâng cấp thẻ bài
//
//  DEBUG MODE: Bật DEBUG_COORDS = true để click vào bất kỳ chỗ nào
//  trên màn hình → hiện tọa độ tương đối (rx, ry) + đặt nhân vật
//  lên đó. Copy các tọa độ vào PLATFORM_SPOTS bên dưới rồi tắt debug.
// ═══════════════════════════════════════════════════════════════════
const DEBUG_COORDS = true; // ← tắt về false sau khi lấy đủ tọa độ

// Tọa độ các tảng đá (tỉ lệ 0-1 so với width/height)
// rx = x / width,  ry = y / height
// Điền vào đây sau khi dùng debug mode để click lên từng tảng
const PLATFORM_SPOTS = [
  // { rx: 0.18, ry: 0.55, label: "Tảng trái nhỏ" },
  // { rx: 0.32, ry: 0.62, label: "Tảng trái cầu" },
  // { rx: 0.50, ry: 0.48, label: "Tảng trung tâm" },
  // { rx: 0.73, ry: 0.52, label: "Tảng phải lớn" },
  // { rx: 0.87, ry: 0.58, label: "Tảng phải nhỏ" },
];

export default class LabScene extends Phaser.Scene {
    constructor() { super("LabScene"); }

    preload() {
        this.load.image("lab-bg", "assets/nen_2.png");
        this.load.image("out",    "assets/ui/shared/return.png");

        // Load idle frames nhân vật (giống BoardScene)
        const characters = [
          'Dark_Oracle','Forest_Ranger','Golem','Minotaur',
          'Necromancer_of_the_Shadow','Reaper_Man','Zombie_Villager'
        ];
        characters.forEach(character => {
          for (let skin = 1; skin <= 3; skin++) {
            for (let i = 0; i < 18; i++) {
              const num = String(i).padStart(3, "0");
              this.load.image(
                `${character}_${skin}_idle_${num}`,
                `./assets/characters/${character}/${character}_${skin}/PNG/PNG Sequences/Idle/0_${character}_Idle_${num}.png`
              );
            }
          }
        });
    }

    create() {
        const { width, height } = this.scale;
        setupClickSound(this);

        // ── Nền ──────────────────────────────────────────────────────
        const bg = this.add.image(width / 2, height / 2, "lab-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Loading overlay ───────────────────────────────────────────
        const loading = createLoadingOverlay(this);

        // ── Nút Back ─────────────────────────────────────────────────
        const backBtn = this.add.image(48, 48, "out")
            .setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            playOutSound(this);
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
            });
        });
        this.add.text(105, 55, "NGHIÊN CỨU", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);

        // ── Tạo animations nhân vật ───────────────────────────────────
        this._createIdleAnims();

        // ── Đặt nhân vật người chơi lên tảng đá ─────────────────────
        this._spawnMyCharacter(width, height);

        // ── Debug: click để lấy tọa độ ───────────────────────────────
        if (DEBUG_COORDS) {
            this._setupDebugMode(width, height);
        }

        this.time.delayedCall(100, () => loading.destroy());
    }

    // ─────────────────────────────────────────────────────────────────
    //  Tạo idle animation cho tất cả nhân vật / skin
    // ─────────────────────────────────────────────────────────────────
    _createIdleAnims() {
        const characters = [
          'Dark_Oracle','Forest_Ranger','Golem','Minotaur',
          'Necromancer_of_the_Shadow','Reaper_Man','Zombie_Villager'
        ];
        characters.forEach(character => {
            for (let skin = 1; skin <= 3; skin++) {
                const key = `${character}_${skin}_idle`;
                if (this.anims.exists(key)) continue;
                const frames = [];
                for (let i = 0; i < 18; i++) {
                    frames.push({ key: `${character}_${skin}_idle_${String(i).padStart(3,"0")}` });
                }
                this.anims.create({ key, frames, frameRate: 12, repeat: -1 });
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    //  Spawn nhân vật mình lên tảng đá đầu tiên (hoặc trung tâm)
    // ─────────────────────────────────────────────────────────────────
    _spawnMyCharacter(width, height) {
        const profile = getActiveProfile(this);
        const character = (profile.characterName || "Dark_Oracle").replace(/ /g, "_");
        const skin      = profile.skin_id || 1;
        const animKey   = `${character}_${skin}_idle`;

        // Vị trí mặc định: tảng trung tâm (điều chỉnh sau khi có debug coords)
        const spot = PLATFORM_SPOTS.length > 0
            ? PLATFORM_SPOTS[0]
            : { rx: 0.50, ry: 0.52 }; // fallback tảng giữa

        const sx = spot.rx * width;
        const sy = spot.ry * height;

        const minR = Math.min(width / 1920, height / 1080);
        const frameKey = `${character}_${skin}_idle_000`;

        if (this.textures.exists(frameKey)) {
            const sprite = this.add.sprite(sx, sy, frameKey)
                .setScale(0.26 * minR)
                .setOrigin(0.5, 0.8)
                .setDepth(10);

            if (this.anims.exists(animKey)) sprite.play(animKey);

            // Shadow
            this.add.ellipse(sx, sy + 4, 38 * minR, 14 * minR, 0x000000, 0.3)
                .setOrigin(0.5).setDepth(9);

            // Tên
            const pd = getPlayerData(this);
            const name = pd?.user?.name || "Bạn";
            this.add.text(sx, sy - 50 * minR, name, {
                fontFamily: "Signika", fontSize: Math.floor(18 * minR) + "px",
                color: "#ffffff", fontStyle: "bold",
                stroke: "#000000", strokeThickness: 4,
            }).setOrigin(0.5).setDepth(11);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  DEBUG MODE — click để xem tọa độ tương đối
    // ─────────────────────────────────────────────────────────────────
    _setupDebugMode(width, height) {
        const minR = Math.min(width / 1920, height / 1080);
        const D = 300;

        // Banner thông báo
        const banner = this.add.text(width / 2, height - 36, "🔧 DEBUG: Click vào tảng đá để lấy tọa độ", {
            fontFamily: "Signika", fontSize: "15px", color: "#ffff00",
            stroke: "#000000", strokeThickness: 3,
            backgroundColor: "#00000088", padding: { x: 10, y: 4 },
        }).setOrigin(0.5).setDepth(D);

        // List tọa độ đã lấy
        const coordList = [];
        const logText = this.add.text(8, 80, "", {
            fontFamily: "monospace", fontSize: "12px", color: "#00ff88",
            stroke: "#000000", strokeThickness: 2,
            backgroundColor: "#00000088", padding: { x: 6, y: 4 },
        }).setDepth(D).setWordWrapWidth(width * 0.5);

        // Cursor highlight
        const cursor = this.add.graphics().setDepth(D - 1);

        this.input.on("pointermove", (ptr) => {
            const rx = (ptr.x / width).toFixed(3);
            const ry = (ptr.y / height).toFixed(3);
            cursor.clear();
            cursor.lineStyle(1, 0xffff00, 0.35);
            cursor.strokeCircle(ptr.x, ptr.y, 22 * minR);
        });

        this.input.on("pointerdown", (ptr) => {
            const rx = +(ptr.x / width).toFixed(3);
            const ry = +(ptr.y / height).toFixed(3);
            const label = `Spot ${coordList.length + 1}`;

            coordList.push({ rx, ry, label });

            // Đánh dấu chấm
            const dot = this.add.graphics().setDepth(D);
            dot.fillStyle(0xff4444, 1);
            dot.fillCircle(ptr.x, ptr.y, 6 * minR);
            dot.lineStyle(2, 0xffffff, 0.8);
            dot.strokeCircle(ptr.x, ptr.y, 6 * minR);

            this.add.text(ptr.x + 10, ptr.y - 8, label, {
                fontFamily: "monospace", fontSize: "11px", color: "#ffff44",
                stroke: "#000000", strokeThickness: 2,
            }).setDepth(D + 1);

            // Cập nhật log
            const lines = coordList.map(s =>
                `{ rx: ${s.rx}, ry: ${s.ry}, label: "${s.label}" },`
            ).join("\n");
            logText.setText("// PLATFORM_SPOTS:\n" + lines);

            // In ra console để copy
            console.log(`🗺️ ${label}: { rx: ${rx}, ry: ${ry} }`);
            console.log("📋 Full array:\nconst PLATFORM_SPOTS = [\n" +
                coordList.map(s => `  { rx: ${s.rx}, ry: ${s.ry}, label: "${s.label}" },`).join("\n") +
                "\n];");
        });

        // Nút RESET
        const resetG = this.add.graphics().setDepth(D);
        resetG.fillStyle(0x883300, 1);
        resetG.fillRoundedRect(width - 100, height - 56, 90, 32, 8);
        const resetTxt = this.add.text(width - 55, height - 40, "RESET", {
            fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(D + 1).setInteractive({ cursor: "pointer" });
        resetTxt.on("pointerdown", () => {
            coordList.length = 0;
            logText.setText("");
            this.scene.restart(); // reload lại scene
        });

        // Nút COPY (mở popup JS)
        const copyG = this.add.graphics().setDepth(D);
        copyG.fillStyle(0x004488, 1);
        copyG.fillRoundedRect(width - 100, height - 92, 90, 32, 8);
        const copyTxt = this.add.text(width - 55, height - 76, "COPY", {
            fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(D + 1).setInteractive({ cursor: "pointer" });
        copyTxt.on("pointerdown", () => {
            const out = "const PLATFORM_SPOTS = [\n" +
                coordList.map(s => `  { rx: ${s.rx}, ry: ${s.ry}, label: "${s.label}" },`).join("\n") +
                "\n];";
            navigator.clipboard?.writeText(out)
                .then(() => alert("✅ Đã copy vào clipboard!\n\n" + out))
                .catch(() => prompt("Copy nội dung này:", out));
        });
    }
}

