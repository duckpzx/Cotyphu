import { setupClickSound, playOutSound } from "../utils/clickSound.js";
import { getActiveProfile, getPlayerData }  from "../server/utils/playerData.js";
import { SERVER_URL }   from "../config.js";

// ── Tọa độ 6 tảng đá (lấy từ debug mode) ────────────────────────
const PLATFORM_SPOTS = [
  { rx: 0.143, ry: 0.597, label: "Spot 1", flipX: false },
  { rx: 0.2,   ry: 0.439, label: "Spot 2", flipX: false },
  { rx: 0.488, ry: 0.453, label: "Spot 3", flipX: false },
  { rx: 0.657, ry: 0.403, label: "Spot 4", flipX: true  },
  { rx: 0.848, ry: 0.516, label: "Spot 5", flipX: true  },
  { rx: 0.713, ry: 0.606, label: "Spot 6", flipX: true  },
];

export default class LabScene extends Phaser.Scene {
    constructor() { super("LabScene"); }

    // ────────────────────────────────────────────────────────────────
    preload() {
        this.load.image("lab-bg", "assets/nen_2.png");
        this.load.image("out",    "assets/ui/shared/return.png");

        // Load 5 idle frames phù thủy cho Spot 3
        for (let i = 0; i <= 4; i++) {
            const num = String(i).padStart(3, "0");
            this.load.image(`wizard_idle_${num}`,
                `./assets/characters/Wizard/PNG/wizard/1_IDLE_${num}.png`
            );
        }

        // Chỉ load nhân vật của mình
        try {
            const profile   = getActiveProfile(this);
            const character = (profile.characterName || "Dark_Oracle").replace(/ /g, "_");
            const skin      = profile.skin_id || 1;
            for (let i = 0; i < 18; i++) {
                const num = String(i).padStart(3, "0");
                const key = `${character}_${skin}_idle_${num}`;
                if (!this.textures.exists(key)) {
                    this.load.image(key,
                        `./assets/characters/${character}/${character}_${skin}/PNG/PNG Sequences/Idle/0_${character}_Idle_${num}.png`
                    );
                }
            }
        } catch(e) {}
    }

    // ────────────────────────────────────────────────────────────────
    create() {
        const { width, height } = this.scale;
        setupClickSound(this);

        this._memberSprites = {}; // user_id → { sprite, shadow, nameText }
        this._mySpotIndex   = null;

        // ── Nền ──────────────────────────────────────────────────────
        const bg = this.add.image(width / 2, height / 2, "lab-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Nút Back ─────────────────────────────────────────────────
        const backBtn = this.add.image(48, 48, "out")
            .setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            playOutSound(this);
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this._leaveLabRoom();
                    this.scene.start("LobbyScene");
                });
            });
        });

        this.add.text(105, 55, "NGHIÊN CỨU", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);

        // ── Phù thủy NPC tại Spot 3 ──────────────────────────────────
        this._spawnWizard(width, height);

        // ── Kết nối socket và join Lab ────────────────────────────────
        this._connectAndJoin();
    }

    // ────────────────────────────────────────────────────────────────
    //  Phù thủy NPC tĩnh tại Spot 3 (không phải player)
    // ────────────────────────────────────────────────────────────────
    _spawnWizard(width, height) {
        const spot = PLATFORM_SPOTS[2]; // Spot 3 = index 2
        if (!spot) return;

        const minR = Math.min(width / 1920, height / 1080);
        const sx   = spot.rx * width;
        const sy   = spot.ry * height;

        // Tạo animation idle phù thủy (5 frames)
        if (!this.anims.exists("wizard_idle")) {
            const frames = [];
            for (let i = 0; i <= 4; i++)
                frames.push({ key: `wizard_idle_${String(i).padStart(3,"0")}` });
            this.anims.create({
                key: "wizard_idle", frames,
                frameRate: 8, repeat: -1
            });
        }

        // Shadow
        this.add.ellipse(sx, sy + 4, 44 * minR, 16 * minR, 0x000000, 0.3)
            .setOrigin(0.5).setDepth(9);

        // Sprite phù thủy — hơi to hơn nhân vật player
        const wizard = this.add.sprite(sx, sy, "wizard_idle_000")
            .setScale(0.43 * minR).setOrigin(0.5, 0.8).setDepth(10)
            .setFlipX(spot.flipX ?? false);

        if (this.anims.exists("wizard_idle")) wizard.play("wizard_idle");

        // Nhãn — đẩy lên cao hơn đầu nhân vật
        this.add.text(sx, sy - 120 * minR, "Phù Thủy", {
            fontFamily: "Signika", fontSize: Math.floor(22 * minR) + "px",
            color: "#cc88ff", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 5,
        }).setOrigin(0.5).setDepth(12);

        // Hiệu ứng glow tím nhẹ xung quanh
        const glow = this.add.graphics().setDepth(8);
        glow.fillStyle(0x9933ff, 0.08);
        glow.fillCircle(sx, sy - 20 * minR, 52 * minR);

        // Lưu để dùng lại nếu cần
        this._wizardSprite = wizard;
    }

    // ────────────────────────────────────────────────────────────────
    //  Kết nối socket (hoặc dùng lại socket đã có) → join lab room
    // ────────────────────────────────────────────────────────────────
    _connectAndJoin() {
        const pd      = getPlayerData(this);
        const profile = getActiveProfile(this);
        const token   = pd?.token;

        // Dùng lại socket từ registry nếu có
        let socket = this.registry.get("gameSocket");
        if (socket && socket.connected) {
            this._socket = socket;
        } else {
            this._socket = io(SERVER_URL, {
                transports: ["websocket", "polling"],
                reconnection: true,
                reconnectionAttempts: 5,
                auth: { token },
            });
        }

        const charName = (profile.characterName || "Dark_Oracle").replace(/ /g, "_");
        const skin     = profile.skin_id || 1;
        const name     = pd?.user?.name || "Player";

        // Preload frame nhân vật người khác khi cần
        this._charName = charName;
        this._skin     = skin;
        this._myName   = name;

        const doJoin = () => {
            this._socket.emit("lab:join", { name, charName, skin });
        };

        if (this._socket.connected) {
            doJoin();
        } else {
            this._socket.once("connect", doJoin);
        }

        // ── Nhận danh sách phòng khi vào ─────────────────────────────
        this._socket.on("lab:joined", (data) => {
            this._labId      = data.lab_id;
            this._mySpotIndex = data.spot_index;
            this._buildLabInfo(data.lab_id);
            // Spawn tất cả thành viên hiện có
            data.members.forEach(m => this._spawnMember(m));
        });

        // ── Người mới vào ─────────────────────────────────────────────
        this._socket.on("lab:member_joined", (data) => {
            this._spawnMember(data);
            this._showNotice(`🧪 ${data.name} đã vào phòng`);
        });

        // ── Người rời ────────────────────────────────────────────────
        this._socket.on("lab:member_left", (data) => {
            this._removeMember(data.user_id);
        });
    }

    // ────────────────────────────────────────────────────────────────
    //  Hiển thị lab_id góc trên phải
    // ────────────────────────────────────────────────────────────────
    _buildLabInfo(labId) {
        const { width } = this.scale;
        this._labInfoText?.destroy();
        this._labInfoText = this.add.text(width - 16, 16,
            `🧪 Phòng: ${labId}`, {
            fontFamily: "Signika", fontSize: "16px",
            color: "#aaddff", stroke: "#000", strokeThickness: 3,
        }).setOrigin(1, 0).setDepth(200);
    }

    // ────────────────────────────────────────────────────────────────
    //  Spawn nhân vật một thành viên lên đúng spot
    // ────────────────────────────────────────────────────────────────
    _spawnMember(member) {
        const { width, height }  = this.scale;
        const minR = Math.min(width / 1920, height / 1080);

        const spot = PLATFORM_SPOTS[member.spot_index];
        if (!spot) return;

        const sx = spot.rx * width;
        const sy = spot.ry * height;

        const character = (member.charName || "Dark_Oracle").replace(/ /g, "_");
        const skin      = member.skin || 1;
        const animKey   = `${character}_${skin}_idle`;

        // Load frames nếu chưa có (lazy load)
        const frame0 = `${character}_${skin}_idle_000`;
        if (!this.textures.exists(frame0)) {
            // Load 18 frames rồi spawn sau
            for (let i = 0; i < 18; i++) {
                const num = String(i).padStart(3,"0");
                const k   = `${character}_${skin}_idle_${num}`;
                if (!this.textures.exists(k)) {
                    this.load.image(k,
                        `./assets/characters/${character}/${character}_${skin}/PNG/PNG Sequences/Idle/0_${character}_Idle_${num}.png`
                    );
                }
            }
            this.load.once("complete", () => {
                this._buildAnim(animKey, character, skin);
                this._doSpawnMember(member, sx, sy, minR, animKey);
            });
            this.load.start();
            return;
        }

        this._buildAnim(animKey, character, skin);
        this._doSpawnMember(member, sx, sy, minR, animKey);
    }

    _buildAnim(key, character, skin) {
        if (this.anims.exists(key)) return;
        const frames = [];
        for (let i = 0; i < 18; i++)
            frames.push({ key: `${character}_${skin}_idle_${String(i).padStart(3,"0")}` });
        this.anims.create({ key, frames, frameRate: 12, repeat: -1 });
    }

    _doSpawnMember(member, sx, sy, minR, animKey) {
        // Xóa sprite cũ nếu đã có
        this._removeMember(member.user_id);

        const isMe = Number(member.user_id) === Number(getPlayerData(this)?.user?.id);
        const spot = PLATFORM_SPOTS[member.spot_index];
        const shouldFlip = spot?.flipX ?? false;

        const character = (member.charName || "Dark_Oracle").replace(/ /g, "_");
        const skin      = member.skin || 1;
        const frame0    = `${character}_${skin}_idle_000`;

        const sprite = this.add.sprite(sx, sy, frame0)
            .setScale(0.26 * minR).setOrigin(0.5, 0.8).setDepth(10 + (isMe ? 1 : 0))
            .setFlipX(shouldFlip);
        if (this.anims.exists(animKey)) sprite.play(animKey);

        // Viền sáng cho mình
        if (isMe) {
            sprite.setTint(0xeeffee);
        }

        const shadow = this.add.ellipse(sx, sy + 4, 38 * minR, 14 * minR, 0x000000, 0.3)
            .setOrigin(0.5).setDepth(9);

        const nameColor = isMe ? "#ffff88" : "#ffffff";
        const nameText  = this.add.text(sx, sy - 120 * minR, member.name || "Player", {
            fontFamily: "Signika", fontSize: Math.floor(22 * minR) + "px",
            color: nameColor, fontStyle: "bold",
            stroke: "#000000", strokeThickness: 5,
        }).setOrigin(0.5).setDepth(12);

        // Nhãn "Bạn" nếu là mình
        let meTag = null;
        if (isMe) {
            meTag = this.add.text(sx, sy - 142 * minR, "[ Bạn ]", {
                fontFamily: "Signika", fontSize: Math.floor(14 * minR) + "px",
                color: "#88ffcc", stroke: "#000", strokeThickness: 3,
            }).setOrigin(0.5).setDepth(12);
        }

        this._memberSprites[member.user_id] = { sprite, shadow, nameText, meTag };

        // Hiệu ứng nhảy xuống khi xuất hiện
        const origY = sy;
        sprite.y = sy - 80 * minR;
        sprite.setAlpha(0);
        this.tweens.add({
            targets: sprite, y: origY, alpha: 1,
            duration: 400, ease: "Bounce.easeOut",
        });
    }

    // ────────────────────────────────────────────────────────────────
    _removeMember(userId) {
        const existing = this._memberSprites[userId];
        if (!existing) return;
        try { existing.sprite?.destroy();   } catch(e) {}
        try { existing.shadow?.destroy();   } catch(e) {}
        try { existing.nameText?.destroy(); } catch(e) {}
        try { existing.meTag?.destroy();    } catch(e) {}
        delete this._memberSprites[userId];
    }

    _leaveLabRoom() {
        if (this._socket) {
            try { this._socket.emit("lab:leave"); } catch(e) {}
        }
    }

    _showNotice(msg) {
        const { width, height } = this.scale;
        const t = this.add.text(width / 2, height - 60, msg, {
            fontFamily: "Signika", fontSize: "16px",
            color: "#aaffdd", stroke: "#000", strokeThickness: 3,
            backgroundColor: "#00000077", padding: { x: 12, y: 5 },
        }).setOrigin(0.5).setDepth(300).setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, duration: 200,
            onComplete: () => this.time.delayedCall(2500, () => {
                this.tweens.add({ targets: t, alpha: 0, duration: 300,
                    onComplete: () => { try { t.destroy(); } catch(e){} }
                });
            })
        });
    }

    shutdown() {
        this._leaveLabRoom();
        // Cleanup sprites
        Object.values(this._memberSprites || {}).forEach(s => {
            try { s.sprite?.destroy();   } catch(e) {}
            try { s.shadow?.destroy();   } catch(e) {}
            try { s.nameText?.destroy(); } catch(e) {}
            try { s.meTag?.destroy();    } catch(e) {}
        });
        this._memberSprites = {};
        // Tắt các socket listeners của lab để không bị duplicate
        if (this._socket) {
            this._socket.off("lab:joined");
            this._socket.off("lab:member_joined");
            this._socket.off("lab:member_left");
        }
    }
}
