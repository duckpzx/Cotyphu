import { setupClickSound, playOutSound } from "../utils/clickSound.js";
import { createLoadingOverlay } from "../utils/loadingOverlay.js";
export default class RatingScene extends Phaser.Scene {
    constructor() { super("RatingScene"); }

    preload() {
        this.load.image("rating-bg", "assets/nen_23.png");
        this.load.image("out",       "assets/ui/shared/return.png");
    }

    create() {
        const { width, height } = this.scale;
        setupClickSound(this);

        const bg = this.add.image(width / 2, height / 2, "rating-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Loading overlay ──
        const loading = createLoadingOverlay(this);

        // Back button + title giống BagScene
        const backBtn = this.add.image(48, 48, "out").setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            playOutSound(this);
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
            });
        });
        this.add.text(105, 55, "XẾP HẠNG", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);

        // Tắt loading sau khi build xong
        this.time.delayedCall(100, () => loading.destroy());
    }
}
