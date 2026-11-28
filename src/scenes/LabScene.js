import { setupClickSound, playOutSound } from "../utils/clickSound.js";
import { getActiveProfile, getPlayerData }  from "../server/utils/playerData.js";
import { SERVER_URL }   from "../config.js";
import { openTarotUpgradeModal } from "./components/TarotUpgradeModal.js";
import { openQuizSprintModal, openCodexModal, openLabBuffsModal } from "../utils/labModals.js";
import EcoinManager from "../server/utils/ecoinManager.js";

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

        this._labSceneConfig = null;
        if (this.cache.json.exists("lab_scene_cfg")) {
            this.cache.json.remove("lab_scene_cfg");
        }
        this.load.json("lab_scene_cfg", `/api/assets/scene-config/lab?t=${Date.now()}`);
        this.load.once("filecomplete-json-lab_scene_cfg", (_k, _t, payload) => {
            const sc = payload?.scene;
            if (sc) {
                this._labSceneConfig = sc;
                if (sc.is_custom && sc.image_url) {
                    const tk = `lab-bg-custom-${sc.version || 0}`;
                    if (!this.textures.exists(tk)) this.load.image(tk, `${sc.image_url}?v=${sc.version || 0}`);
                }
            }
        });

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

        // ── Tọa độ 6 tảng đá (ưu tiên cấu hình tùy biến từ Admin Studio) ──
        if (Array.isArray(this._labSceneConfig?.spots) && this._labSceneConfig.spots.length === PLATFORM_SPOTS.length) {
            this._spots = this._labSceneConfig.spots.map((s, i) => ({
                ...PLATFORM_SPOTS[i],
                rx: Number(s.x),
                ry: Number(s.y),
            }));
        } else {
            this._spots = PLATFORM_SPOTS;
        }

        // ── Nền (hỗ trợ nền tùy biến từ Admin Studio) ────────────────
        const lVer = this._labSceneConfig?.version || 0;
        const customBgKey = this._labSceneConfig?.is_custom ? `lab-bg-custom-${lVer}` : null;
        const bgKey = (customBgKey && this.textures.exists(customBgKey)) ? customBgKey : "lab-bg";
        const bg = this.add.image(width / 2, height / 2, bgKey);
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

        // ── 3 Điểm Nghiên Cứu Học Viện (Quiz 60s • Bách Khoa • Chế Tạo Bùa) ──
        this._buildAcademyControls(width, height);

        // ── Kết nối socket và join Lab ────────────────────────────────
        this._connectAndJoin();
    }

    _buildAcademyControls(width, height) {
        const onEcoinUpdated = (newEcoin) => {
            try { EcoinManager.set(this, newEcoin); } catch {}
        };

        // 1. Thanh 3 nút 3D góc trên phải: Luyện Thi 60s | Bách Khoa | Chế Tạo Bùa
        const actions = [
            { label: "🎓 Luyện Thi 60s", top: 0x38bdf8, bot: 0x0284c7, stroke: 0x075985, text: "#ffffff", fn: () => openQuizSprintModal({ scene: this, onEcoinUpdated }) },
            { label: "📖 Bách Khoa",     top: 0xffd65c, bot: 0xd9820b, stroke: 0x7c4304, text: "#4a1f00", fn: () => openCodexModal({ scene: this, onEcoinUpdated }) },
            { label: "⚗️ Chế Tạo Bùa",   top: 0xc084fc, bot: 0x7c3aed, stroke: 0x4c1d95, text: "#ffffff", fn: () => openLabBuffsModal({ scene: this, onEcoinUpdated }) },
        ];
        const btnW = 152, btnH = 38, gap = 9;
        const totalW = actions.length * btnW + (actions.length - 1) * gap;
        const startX = width - totalW - 18 + btnW / 2;
        const btnY = 48;

        actions.forEach((a, i) => {
            const c = this.add.container(startX + i * (btnW + gap), btnY).setDepth(210);
            const g = this.add.graphics();
            const draw = (hover = false) => {
                g.clear();
                const hw = btnW / 2, hh = btnH / 2;
                g.fillStyle(0x000000, 0.30);
                g.fillRoundedRect(-hw, -hh + 3, btnW, btnH, 14);
                g.fillGradientStyle(a.top, a.top, a.bot, a.bot, 1);
                g.fillRoundedRect(-hw, -hh, btnW, btnH, 14);
                g.fillStyle(0xffffff, hover ? 0.42 : 0.28);
                g.fillRoundedRect(-hw + 6, -hh + 3, btnW - 12, hh - 4, 8);
                g.lineStyle(2.2, a.stroke, 1);
                g.strokeRoundedRect(-hw, -hh, btnW, btnH, 14);
            };
            draw(false);
            const t = this.add.text(0, 0, a.label, {
                fontFamily: "Signika", fontSize: "14px", fontStyle: "bold", color: a.text,
            }).setOrigin(0.5);
            const z = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: "pointer" });
            z.on("pointerover", () => { draw(true); c.setScale(1.04); });
            z.on("pointerout",  () => { draw(false); c.setScale(1); });
            z.on("pointerup",   () => a.fn());
            c.add([g, t, z]);
        });

        // 2. Điểm tương tác trực tiếp ngay trên các đảo phụ của bản đồ (Đảo Tuần Lộc bên phải & Ngôi nhà bên trái)
        const createIslandStation = (rx, ry, label, glowHex, textColor, strokeColor, onClick) => {
            const x = width * rx, y = height * ry;
            const c = this.add.container(x, y).setDepth(15);
            const ring = this.add.circle(0, 14, 24, glowHex, 0.22).setStrokeStyle(2, glowHex, 0.85);
            const lbl = this.add.text(0, -14, label, {
                fontFamily: "Signika", fontSize: "14.5px", fontStyle: "bold",
                color: textColor, stroke: strokeColor, strokeThickness: 4.5,
                shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 6, fill: true },
            }).setOrigin(0.5);
            const z = this.add.zone(0, 0, 140, 62).setInteractive({ cursor: "pointer" });
            z.on("pointerover", () => this.tweens.add({ targets: c, scale: 1.09, duration: 110 }));
            z.on("pointerout",  () => this.tweens.add({ targets: c, scale: 1, duration: 110 }));
            z.on("pointerup", onClick);
            c.add([ring, lbl, z]);
            this.tweens.add({ targets: lbl, y: -20, duration: 1150, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
            this.tweens.add({ targets: ring, scale: { from: 0.9, to: 1.15 }, alpha: { from: 0.9, to: 0.45 }, duration: 1200, yoyo: true, repeat: -1 });
        };

        createIslandStation(0.835, 0.44, "🎓 THỬ THÁCH QUIZ 60s", 0x38bdf8, "#e0f2fe", "#0c4a6e", () => openQuizSprintModal({ scene: this, onEcoinUpdated }));
        createIslandStation(0.185, 0.365, "📖 BÁCH KHOA CHIẾN THUẬT", 0xffd65c, "#fef9c3", "#713f12", () => openCodexModal({ scene: this, onEcoinUpdated }));
    }

    // ────────────────────────────────────────────────────────────────
    //  Phù thủy NPC tĩnh tại Spot 3 (không phải player)
    // ────────────────────────────────────────────────────────────────
    _spawnWizard(width, height) {
        const spot = (this._spots || PLATFORM_SPOTS)[2]; // Spot 3 = index 2
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
        this.add.ellipse(sx, sy + 6, 62 * minR, 22 * minR, 0x000000, 0.32)
            .setOrigin(0.5).setDepth(9);

        // Sprite phù thủy — phóng to hài hòa trên bục trung tâm
        const wizard = this.add.sprite(sx, sy, "wizard_idle_000")
            .setScale(0.56 * minR).setOrigin(0.5, 0.8).setDepth(10)
            .setFlipX(spot.flipX ?? false);

        if (this.anims.exists("wizard_idle")) wizard.play("wizard_idle");

        // Hiệu ứng Magic Buff màu tím đa lớp (vòng ma pháp dưới chân + dải xoáy 3D trước/sau + tia sáng bay lên + hạt mana)
        this._buildWizardMagicAura(sx, sy, minR);

        // Lưu để dùng lại nếu cần
        this._wizardSprite = wizard;

        // ── Click phù thủy / nút để mở Lò Luyện Tarot ───────────────
        const openUpgrade = () => openTarotUpgradeModal(this);
        wizard.setInteractive({ cursor: "pointer", pixelPerfect: false });
        wizard.on("pointerup", openUpgrade);
        wizard.on("pointerover", () => wizard.setTint(0xe0c0ff));
        wizard.on("pointerout",  () => wizard.clearTint());

        // Nhãn "NÂNG CẤP THẺ BÀI" không khung nền: chữ gradient tím-hồng + quầng sáng blur đồng bộ hiệu ứng ma pháp bên dưới
        const bx = sx, by0 = sy - 158 * minR;
        const btnWrap = this.add.container(bx, by0).setDepth(14);

        const lblW = Math.round(250 * minR);
        const lblH = Math.round(64 * minR);
        const lblKey = `lab_upgrade_label_${lblW}x${lblH}`;
        if (!this.textures.exists(lblKey)) {
            const DPR = 2;
            const cTex = this.textures.createCanvas(lblKey, lblW * DPR, lblH * DPR);
            const ctx = cTex.getContext();
            ctx.scale(DPR, DPR);
            const cx = lblW / 2, cy = lblH / 2;

            // Quầng sáng tím-hồng blur mềm phía sau chữ (trùng màu magic buff bên dưới)
            ctx.save();
            ctx.filter = "blur(10px)";
            const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, lblW * 0.45);
            halo.addColorStop(0,    "rgba(232, 121, 249, 0.72)");
            halo.addColorStop(0.45, "rgba(168, 85, 247, 0.42)");
            halo.addColorStop(1,    "rgba(126, 34, 206, 0)");
            ctx.fillStyle = halo;
            ctx.fillRect(0, 0, lblW, lblH);
            ctx.restore();

            // Chữ "NÂNG CẤP THẺ BÀI" gradient trắng → hồng tím sáng + viền tím đậm sắc nét
            const fz = Math.max(15, Math.round(18 * minR));
            ctx.font = `900 ${fz}px Signika, Arial, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";

            ctx.save();
            ctx.shadowColor = "rgba(192, 38, 211, 0.9)";
            ctx.shadowBlur = 10;
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = "#2e0659";
            ctx.strokeText("NÂNG CẤP THẺ BÀI", cx, cy);
            ctx.restore();

            const tGrad = ctx.createLinearGradient(cx, cy - fz * 0.6, cx, cy + fz * 0.6);
            tGrad.addColorStop(0,    "#ffffff");
            tGrad.addColorStop(0.55, "#f5d0fe");
            tGrad.addColorStop(1,    "#e879f9");
            ctx.fillStyle = tGrad;
            ctx.fillText("NÂNG CẤP THẺ BÀI", cx, cy);
            cTex.refresh();
        }

        const lblImg = this.add.image(0, 0, lblKey)
            .setDisplaySize(lblW, lblH)
            .setInteractive({ cursor: "pointer" });
        btnWrap.add(lblImg);

        lblImg.on("pointerover", () => {
            this.tweens.add({ targets: btnWrap, scaleX: 1.07, scaleY: 1.07, duration: 110, ease: "Sine.easeOut" });
        });
        lblImg.on("pointerout", () => {
            this.tweens.add({ targets: btnWrap, scaleX: 1, scaleY: 1, duration: 110, ease: "Sine.easeOut" });
        });
        lblImg.on("pointerup", () => {
            this.tweens.add({
                targets: btnWrap, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true,
                onComplete: openUpgrade,
            });
        });

        this.tweens.add({ targets: btnWrap, y: by0 - 5 * minR, duration: 950, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    // ────────────────────────────────────────────────────────────────
    //  Hiệu ứng Magic Buff màu tím 3D xung quanh Phù Thủy (ADD blend)
    // ────────────────────────────────────────────────────────────────
    _buildWizardMagicAura(sx, sy, minR) {
        const footY = sy + 14 * minR;

        // 1. Tạo CanvasTexture vòng tròn ma pháp tím phát sáng (cache 1 lần)
        const runeKey = "wizard_arcane_rune_256";
        if (!this.textures.exists(runeKey)) {
            const sz = 256;
            const cTex = this.textures.createCanvas(runeKey, sz, sz);
            const ctx = cTex.getContext();
            const cx = sz / 2, cy = sz / 2;

            // Quầng plasma hồng-tím rực dưới chân
            const coreGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, sz * 0.48);
            coreGrad.addColorStop(0,    "rgba(255, 220, 255, 0.95)");
            coreGrad.addColorStop(0.28, "rgba(232, 74, 255, 0.78)");
            coreGrad.addColorStop(0.60, "rgba(155, 38, 255, 0.35)");
            coreGrad.addColorStop(1,    "rgba(120, 20, 220, 0)");
            ctx.fillStyle = coreGrad;
            ctx.fillRect(0, 0, sz, sz);

            // Vòng tròn ma pháp đồng tâm + 12 vạch rune
            ctx.strokeStyle = "rgba(255, 190, 255, 0.92)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, sz * 0.37, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = "rgba(216, 110, 255, 0.75)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, sz * 0.28, 0, Math.PI * 2);
            ctx.stroke();

            // 12 ký tự / vạch sáng quanh vòng ma pháp
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(a);
                ctx.strokeStyle = i % 2 === 0 ? "rgba(255, 240, 255, 0.95)" : "rgba(236, 72, 255, 0.85)";
                ctx.lineWidth = i % 2 === 0 ? 3 : 2;
                ctx.beginPath();
                ctx.moveTo(sz * 0.29, 0);
                ctx.lineTo(sz * 0.36, 0);
                ctx.stroke();
                ctx.restore();
            }

            // 3 vệt xoáy năng lượng mềm
            for (let k = 0; k < 3; k++) {
                const startA = (k / 3) * Math.PI * 2;
                ctx.strokeStyle = "rgba(244, 114, 255, 0.65)";
                ctx.lineWidth = 5;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.arc(cx, cy, sz * 0.42, startA, startA + 1.15);
                ctx.stroke();
            }
            cTex.refresh();
        }

        // 2. Tạo CanvasTexture tia năng lượng dọc (beam) & đốm sao sáng (spark)
        const beamKey = "wizard_arcane_beam_32x128";
        if (!this.textures.exists(beamKey)) {
            const bw = 32, bh = 128;
            const bTex = this.textures.createCanvas(beamKey, bw, bh);
            const ctx = bTex.getContext();
            const gV = ctx.createLinearGradient(0, 0, 0, bh);
            gV.addColorStop(0,   "rgba(255, 255, 255, 0)");
            gV.addColorStop(0.35,"rgba(245, 160, 255, 0.92)");
            gV.addColorStop(0.7, "rgba(217, 70, 239, 0.95)");
            gV.addColorStop(1,   "rgba(168, 85, 247, 0)");
            ctx.fillStyle = gV;
            ctx.fillRect(bw / 2 - 4, 0, 8, bh);

            // Lõi trắng rực mảnh ở giữa tia
            const gCore = ctx.createLinearGradient(0, 0, 0, bh);
            gCore.addColorStop(0,   "rgba(255, 255, 255, 0)");
            gCore.addColorStop(0.45,"rgba(255, 255, 255, 1)");
            gCore.addColorStop(0.75,"rgba(255, 220, 255, 0.9)");
            gCore.addColorStop(1,   "rgba(255, 255, 255, 0)");
            ctx.fillStyle = gCore;
            ctx.fillRect(bw / 2 - 1.5, bh * 0.1, 3, bh * 0.8);
            bTex.refresh();
        }

        const sparkKey = "wizard_arcane_spark_24";
        if (!this.textures.exists(sparkKey)) {
            const s = 24;
            const sTex = this.textures.createCanvas(sparkKey, s, s);
            const ctx = sTex.getContext();
            const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
            g.addColorStop(0,   "rgba(255, 255, 255, 1)");
            g.addColorStop(0.35,"rgba(244, 140, 255, 0.9)");
            g.addColorStop(0.7, "rgba(192, 38, 211, 0.35)");
            g.addColorStop(1,   "rgba(168, 85, 247, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
            sTex.refresh();
        }

        // 3. Đặt 2 lớp vòng ma pháp nằm phẳng hoàn toàn trên mặt đất như bóng (Container scaleY = 0.42)
        // Khi xoay runeOuter/runeInner bên trong Container dẹt, vòng tròn xoay mượt trên mặt phẳng đất không bị lật đứng!
        const groundContainer = this.add.container(sx, footY + 4 * minR)
            .setDepth(8)
            .setScale(1, 0.42);

        const runeOuter = this.add.image(0, 0, runeKey)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.92 * minR)
            .setAlpha(0.86);
        const runeInner = this.add.image(0, 0, runeKey)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.62 * minR)
            .setAlpha(0.76);
        groundContainer.add([runeOuter, runeInner]);

        // Nhịp thở phát sáng mềm cho vòng ma pháp dưới chân
        this.tweens.add({
            targets: runeOuter,
            alpha: { from: 0.70, to: 0.96 },
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        // 4. Dải năng lượng xoáy 3D ôm rộng quanh thân Phù Thủy (tách lớp Back depth 9 & Front depth 11)
        const vortexBack  = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
        const vortexFront = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);

        let phase = 0;
        const drawSwirlRibbons = () => {
            if (!vortexBack?.active || !vortexFront?.active) return;
            phase += 0.042;
            runeOuter.rotation += 0.012;
            runeInner.rotation -= 0.020;

            vortexBack.clear();
            vortexFront.clear();

            // 2 vòng ribbon nghiêng xoáy rộng quanh người Phù Thủy
            const ribbons = [
                { rx: 68 * minR, ry: 23 * minR, cy: sy - 14 * minR, tilt: 0.14, speed: 1,     color: 0xe879f9, width: 3.2 * minR },
                { rx: 56 * minR, ry: 18 * minR, cy: sy - 38 * minR, tilt: -0.18, speed: -1.35, color: 0xc026d3, width: 2.5 * minR },
            ];

            ribbons.forEach((rb, ri) => {
                const segs = 36;
                const arcLen = Math.PI * 1.45;
                const startA = phase * rb.speed + ri * 2.1;
                for (let i = 0; i < segs; i++) {
                    const t0 = i / segs;
                    const t1 = (i + 1) / segs;
                    const a0 = startA + t0 * arcLen;
                    const a1 = startA + t1 * arcLen;
                    const env = Math.sin(t0 * Math.PI); // mờ 2 đầu dải năng lượng

                    const x0 = sx + Math.cos(a0) * rb.rx;
                    const y0 = rb.cy + Math.sin(a0) * rb.ry + Math.cos(a0) * rb.rx * rb.tilt;
                    const x1 = sx + Math.cos(a1) * rb.rx;
                    const y1 = rb.cy + Math.sin(a1) * rb.ry + Math.cos(a1) * rb.rx * rb.tilt;

                    // sin(a) >= 0 nằm phía TRƯỚC Phù Thủy, < 0 nằm phía SAU
                    const targetG = Math.sin((a0 + a1) * 0.5) >= 0 ? vortexFront : vortexBack;
                    targetG.lineStyle(rb.width * (0.55 + 0.6 * env), rb.color, 0.72 * env);
                    targetG.beginPath();
                    targetG.moveTo(x0, y0);
                    targetG.lineTo(x1, y1);
                    targetG.strokePath();

                    // Lõi trắng hồng mỏng sáng rực bên trong dải xoáy
                    targetG.lineStyle(rb.width * 0.35 * env, 0xffffff, 0.65 * env);
                    targetG.beginPath();
                    targetG.moveTo(x0, y0);
                    targetG.lineTo(x1, y1);
                    targetG.strokePath();
                }
            });
        };
        drawSwirlRibbons();
        this._wizardAuraTimer = this.time.addEvent({ delay: 20, loop: true, callback: drawSwirlRibbons });

        // 5. Các tia ánh sáng tím bay thẳng lên (giống mẫu buff tím)
        const beamCount = 8;
        for (let i = 0; i < beamCount; i++) {
            const isFront = i % 2 === 0;
            const beam = this.add.image(sx, footY, beamKey)
                .setDepth(isFront ? 11 : 9)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setOrigin(0.5, 1)
                .setAlpha(0);

            const launchBeam = () => {
                if (!beam?.active) return;
                const offsetX = Phaser.Math.FloatBetween(-48, 48) * minR;
                const startY  = footY + Phaser.Math.FloatBetween(-8, 6) * minR;
                const scaleX  = Phaser.Math.FloatBetween(0.32, 0.75) * minR;
                const scaleY  = Phaser.Math.FloatBetween(0.55, 1.15) * minR;
                beam.setPosition(sx + offsetX, startY).setScale(scaleX, scaleY * 0.4).setAlpha(0);

                this.tweens.add({
                    targets: beam,
                    y: startY - Phaser.Math.FloatBetween(68, 125) * minR,
                    scaleY: scaleY,
                    alpha: { from: 0, to: 0.9 },
                    duration: Phaser.Math.Between(650, 1050),
                    ease: "Cubic.easeOut",
                    onComplete: () => {
                        if (!beam?.active) return;
                        this.tweens.add({
                            targets: beam,
                            y: beam.y - 32 * minR,
                            alpha: 0,
                            duration: Phaser.Math.Between(350, 550),
                            ease: "Quad.easeIn",
                            onComplete: () => this.time.delayedCall(Phaser.Math.Between(120, 650), launchBeam),
                        });
                    },
                });
            };
            this.time.delayedCall(i * 190, launchBeam);
        }

        // 6. Các hạt mana tím-trắng lơ lửng bay xoáy lên quanh Phù Thủy
        for (let i = 0; i < 12; i++) {
            const sp = this.add.image(sx, footY, sparkKey)
                .setDepth(11)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0);

            const launchSpark = () => {
                if (!sp?.active) return;
                const ox = Phaser.Math.FloatBetween(-50, 50) * minR;
                const oy = footY + Phaser.Math.FloatBetween(-10, 8) * minR;
                const sc = Phaser.Math.FloatBetween(0.32, 0.78) * minR;
                sp.setPosition(sx + ox, oy).setScale(sc).setAlpha(0);

                this.tweens.add({
                    targets: sp,
                    x: sx + ox + Phaser.Math.FloatBetween(-22, 22) * minR,
                    y: oy - Phaser.Math.FloatBetween(75, 138) * minR,
                    alpha: { from: 0.95, to: 0 },
                    scale: sc * 0.25,
                    duration: Phaser.Math.Between(1100, 1800),
                    ease: "Sine.easeOut",
                    onComplete: () => this.time.delayedCall(Phaser.Math.Between(80, 500), launchSpark),
                });
            };
            this.time.delayedCall(i * 140, launchSpark);
        }
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
            this._showNotice(`${data.name} đã vào phòng`);
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
        // Không hiển thị mã phòng nữa (giao diện cũ)
        this._labInfoText?.destroy();
        this._labInfoText = null;
    }

    // ────────────────────────────────────────────────────────────────
    //  Spawn nhân vật một thành viên lên đúng spot
    // ────────────────────────────────────────────────────────────────
    _spawnMember(member) {
        const { width, height }  = this.scale;
        const minR = Math.min(width / 1920, height / 1080);

        const spot = (this._spots || PLATFORM_SPOTS)[member.spot_index];
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
        const spot = (this._spots || PLATFORM_SPOTS)[member.spot_index];
        const shouldFlip = spot?.flipX ?? false;

        const character = (member.charName || "Dark_Oracle").replace(/ /g, "_");
        const skin      = member.skin || 1;
        const frame0    = `${character}_${skin}_idle_000`;

        const sprite = this.add.sprite(sx, sy, frame0)
            .setScale(0.35 * minR).setOrigin(0.5, 0.8).setDepth(10 + (isMe ? 1 : 0))
            .setFlipX(shouldFlip);
        if (this.anims.exists(animKey)) sprite.play(animKey);

        // Viền sáng cho mình
        if (isMe) {
            sprite.setTint(0xeeffee);
        }

        const shadow = this.add.ellipse(sx, sy + 5, 52 * minR, 18 * minR, 0x000000, 0.32)
            .setOrigin(0.5).setDepth(9);

        const nameColor = isMe ? "#ffff88" : "#ffffff";
        const nameText  = this.add.text(sx, sy - 156 * minR, member.name || "Player", {
            fontFamily: "Signika", fontSize: Math.floor(24 * minR) + "px",
            color: nameColor, fontStyle: "bold",
            stroke: "#000000", strokeThickness: 5,
        }).setOrigin(0.5).setDepth(12);

        // Nhãn "Bạn" nếu là mình
        let meTag = null;
        if (isMe) {
            meTag = this.add.text(sx, sy - 182 * minR, "[ Bạn ]", {
                fontFamily: "Signika", fontSize: Math.floor(15 * minR) + "px",
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
