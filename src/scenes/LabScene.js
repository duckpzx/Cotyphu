export default class LabScene extends Phaser.Scene {
    constructor() { super("LabScene"); }

    preload() {
        this.load.image("lab-bg", "assets/nen_2.png");
        this.load.image("out",    "assets/ui/shared/return.png");
    }

    create() {
        const { width, height } = this.scale;

        const bg = this.add.image(width / 2, height / 2, "lab-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // Back button + title giống BagScene
        const backBtn = this.add.image(48, 48, "out").setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
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
    }
}
