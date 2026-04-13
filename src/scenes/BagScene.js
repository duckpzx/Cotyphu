import { getPlayerData, setPlayerData } from "../server/utils/playerData.js";
import { SERVER_URL } from "../config.js";

export default class BagScene extends Phaser.Scene {
    constructor() {
        super("BagScene");

        // Dữ liệu người chơi
        this.playerData   = null;
        this.playerUserId = null;

        // Tab đang active: "character" | "skin" | "background"
        this.activeTab = "character";

        // Dữ liệu từ server
        this.myCharacters  = [];   // { character_id, name, active_skin_id, active_skin_number, is_active_character, ... }
        this.mySkins       = [];   // { skin_id, skin_number, is_active, ... }
        this.myBackgrounds = [];   // tương lai

        // Character đang preview bên trái
        this.selectedCharId    = null;
        this.selectedSkinId    = null;
        this.selectedSkinNum   = null;
        this.selectedBgId      = null;

        // Objects cần xóa khi đổi tab / reload
        this._rightObjs     = [];
        this._previewObjs   = [];
        this._tabBtnObjs    = [];

        // Drag
        this._gridContainer = null;
        this._isDragging    = false;
        this._dragX         = 0;
        this._dragMoved     = false;
        this._velocityX     = 0;
        this._minX          = 0;
        this._maxX          = 0;
    }

    preload() {
        this.load.image("bag-bg",    "assets/ui/nen_chung.png");
        this.load.image("out",       "assets/ui/shared/return.png");
        this.load.image("card_item1","assets/ui/shared/item_card2.png");
        this.load.image("use_badge", "assets/ui/shared/use.png");
    }

    async create() {
        const { width, height } = this.scale;

        this.playerData = getPlayerData(this) || {};
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;

        const bg = this.add.image(width / 2, height / 2, "bag-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        this._buildStarfield(width, height);
        await this.loadAllAssets();

        // ── Layout ───────────────────────────────────────────────────
        const TAB_H   = 46;
        const PANEL_Y = 110;
        const PANEL_H = height - PANEL_Y - 40;
        const GAP     = 16;
        const LEFT_W  = 340;
        const RIGHT_W = width - LEFT_W - GAP - 40;
        const START_X = 20;

        const leftCX  = START_X + LEFT_W / 2;
        const rightCX = START_X + LEFT_W + GAP + RIGHT_W / 2;
        const panelY  = PANEL_Y + PANEL_H / 2;

        this._layout = { leftCX, rightCX, panelY, LEFT_W, RIGHT_W, PANEL_H, GAP, PANEL_Y, TAB_H };

        // ── Header: Back + "TÚI ĐỒ" ─────────────────────────────────
        const backBtn = this.add.image(48, 48, "out").setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
            });
        });
        this.add.text(105, 55, "TÚI ĐỒ", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);
        [[230, 30], [310, 22], [355, 38]].forEach(([sx, sy]) => {
            this.add.text(sx, sy, "✦", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.6);
        });

        // const backBtn = this.add.image(48, 48, "back").setScale(1).setInteractive({ cursor: "pointer" });
        //     backBtn.on("pointerdown", () => {
        //     this.tweens.add({ targets: backBtn, scale: 0.6, duration: 80, yoyo: true });
        //     this.time.delayedCall(160, () => this.scene.start("LobbyScene"));
        // });
        // this.add.text(105, 55, "ĐẤU TRƯỜNG", {
        // fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
        // stroke: "#003388", strokeThickness: 6,
        // shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        // }).setOrigin(0, 0.5).setPadding(7, 5, 7, 5);

        // ── 2 Panel chính ────────────────────────────────────────────
        this.createStyledPanel(leftCX,  panelY, LEFT_W,  PANEL_H, 18);
        this.createStyledPanel(rightCX, panelY, RIGHT_W, PANEL_H, 18);

        // ── Tabs phía trên panel phải ────────────────────────────────
        this.buildTabs();

        // ── Nội dung ─────────────────────────────────────────────────
        this.buildLeftPanel();
        this.renderRightPanel();

        this._setupDrag(rightCX, RIGHT_W);
    }

    update() {
        if (this._gridContainer && !this._isDragging) {
            this._gridContainer.x += this._velocityX;
            this._velocityX *= 0.88;
            if (this._gridContainer.x > this._minX) {
                this._gridContainer.x = Phaser.Math.Linear(this._gridContainer.x, this._minX, 0.18);
                this._velocityX = 0;
            } else if (this._gridContainer.x < this._maxX) {
                this._gridContainer.x = Phaser.Math.Linear(this._gridContainer.x, this._maxX, 0.18);
                this._velocityX = 0;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  LOAD DATA + ASSETS
    // ═══════════════════════════════════════════════════════════════
    _buildStarfield(width, height) {
        for (let i = 0; i < 22; i++) {
            const x  = Phaser.Math.Between(0, width);
            const y  = Phaser.Math.Between(0, height * 0.55);
            const sz = Phaser.Math.FloatBetween(1, 2.5);
            const g  = this.add.graphics();
            g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.2, 0.65));
            g.fillCircle(x, y, sz);
            this.tweens.add({ targets: g, alpha: { from: g.alpha, to: 0.04 },
                duration: Phaser.Math.Between(900, 2200), yoyo: true, repeat: -1,
                delay: Phaser.Math.Between(0, 1800), ease: "Sine.easeInOut" });
        }
    }

    async loadAllAssets() {
        if (!this.playerUserId) return;

        // ── 1. Tải danh sách nhân vật sở hữu ─────────────────────
        try {
            const charRes = await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/bag`);
            const charJson = await charRes.json();
            this.myCharacters = charJson.data || [];
            console.log("myCharacters từ server:", JSON.stringify(this.myCharacters, null, 2));
        } catch (e) {
            console.warn("Failed to load characters", e);
            return;
        }

        if (this.myCharacters.length === 0) return;

        // ── 2. Xác định nhân vật active ──────────────────────────
        const activeChar =
            this.myCharacters.find(c => Number(c.is_active_character) === 1) ||
            this.myCharacters[0];

        this.selectedCharId = activeChar.character_id;
        this.selectedSkinNum = activeChar.active_skin_number || 1;
        this.selectedSkinId = activeChar.active_skin_id || null;

        // ── 3. Tải sprite frames cho TẤT CẢ nhân vật (skin active) ──
        //    + Tải thêm tất cả skin 1,2,3 cho nhân vật đang chọn
        await this._loadCharacterSprites();

        // ── 4. Tạo animations ────────────────────────────────────
        this._createAllBagAnimations();
        // ── 5. Tải backgrounds ────────────────────────────────────
        try {
            const bgRes = await fetch(`${SERVER_URL}/users/${this.playerUserId}/backgrounds/bag`);
            const bgJson = await bgRes.json();
            this.myBackgrounds = bgJson.data || [];
        } catch (e) {
            console.warn("Failed to load backgrounds", e);
        }

        const activeBgId = this.playerData?.user?.active_bg_id || this.playerData?.active_bg_id || null;
        if (activeBgId) {
            this.selectedBgId = activeBgId;
        } else if (this.myBackgrounds.length > 0) {
            this.selectedBgId = this.myBackgrounds[0].background_id || this.myBackgrounds[0].id;
        }

        let needsBgLoad = false;
        for (const bg of this.myBackgrounds) {
            const imgKey = `bg_${bg.background_id || bg.id}`;
            if (!this.textures.exists(imgKey) && bg.image_path) {
                this.load.image(imgKey, bg.image_path);
                needsBgLoad = true;
            }
        }
        if (needsBgLoad) {
            this.load.on('loaderror', () => {});
            await new Promise(resolve => {
                this.load.once("complete", resolve);
                this.load.start();
            });
        }
    }

    /**
     * Tải sprite idle frames cho tất cả nhân vật (skin active)
     * và TẤT CẢ skin (1-3) của nhân vật đang chọn
     */
    async _loadCharacterSprites() {
        const toLoad = [];

        for (const char of this.myCharacters) {
            const charName = char.name;
            if (!charName) continue;

            const skinsToLoad = new Set();
            skinsToLoad.add(1); // luôn load skin 1 cho mọi nhân vật
            skinsToLoad.add(char.active_skin_number || 1);

            if (Number(char.character_id) === Number(this.selectedCharId)) {
                skinsToLoad.add(2);
                skinsToLoad.add(3);
            }

            for (const skinNum of skinsToLoad) {
                for (let i = 0; i < 18; i++) {
                    const num      = String(i).padStart(3, "0");
                    const frameKey = `bag_${charName}_${skinNum}_idle_${num}`;
                    if (!this.textures.exists(frameKey)) {
                        toLoad.push({
                            key:  frameKey,
                            path: `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`
                        });
                    }
                }
            }
        }

        if (!toLoad.length) return;

        await new Promise(resolve => {
            let done = 0;
            const total = toLoad.length;
            const tick = () => { if (++done >= total) resolve(); };
            this.load.on("filecomplete", tick);
            this.load.on("loaderror", (file) => {
                console.warn("Load lỗi:", file.key, file.src);
                tick();
            });
            toLoad.forEach(({ key, path }) => this.load.image(key, path));
            this.load.start();
        });
    }

    /**
     * Tạo tất cả animation idle cho các nhân vật + skin đã load
     */
    _createAllBagAnimations() {
        for (const char of this.myCharacters) {
            const charName = char.name;
            if (!charName) continue;

            const skinsToCreate = new Set();
            skinsToCreate.add(1); // luôn tạo anim skin 1
            skinsToCreate.add(char.active_skin_number || 1);

            if (Number(char.character_id) === Number(this.selectedCharId)) {
                for (let s = 1; s <= 3; s++) skinsToCreate.add(s);
            }

            for (const skinNum of skinsToCreate) {
                const animKey = `bag_${charName}_${skinNum}_idle`;
                if (this.anims.exists(animKey)) continue;

                // Kiểm tra frame đầu tiên tồn tại
                const firstFrame = `bag_${charName}_${skinNum}_idle_000`;
                if (!this.textures.exists(firstFrame)) continue;

                const frames = [];
                for (let i = 0; i < 18; i++) {
                    const num = String(i).padStart(3, "0");
                    const key = `bag_${charName}_${skinNum}_idle_${num}`;
                    if (this.textures.exists(key)) {
                        frames.push({ key });
                    }
                }

                if (frames.length > 0) {
                    this.anims.create({
                        key: animKey,
                        frames,
                        frameRate: 10,
                        repeat: -1
                    });
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL TRÁI — Preview nhân vật + tên
    // ═══════════════════════════════════════════════════════════════
    buildLeftPanel() {
        const { leftCX, panelY, LEFT_W, PANEL_H, PANEL_Y } = this._layout;
        this._previewObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._previewObjs = [];
        const push = o => { this._previewObjs.push(o); return o; };

        const top     = PANEL_Y || (panelY - PANEL_H / 2);
        const PAD     = 22;

        // ── Khung preview — viền gradient trắng-xanh dương nhẹ ───────
        const PREVIEW_W = LEFT_W - PAD * 2;
        const PREVIEW_H = Math.round(PANEL_H * 0.52);
        const PREVIEW_X = leftCX - PREVIEW_W / 2;
        const PREVIEW_Y = top + PAD;
        const r = 16;

        const prevG = push(this.add.graphics().setDepth(4));

        // Lớp bóng mờ ngoài cùng (shadow)
        prevG.fillRoundedRect(PREVIEW_X + 4, PREVIEW_Y + 6, PREVIEW_W, PREVIEW_H, r + 2);

        // Viền ngoài gradient trắng → xanh dương nhẹ (dày 7px)
        const borderThick = 1.5;
        const bx = PREVIEW_X - borderThick, by = PREVIEW_Y - borderThick;
        const bw = PREVIEW_W + borderThick * 2, bh = PREVIEW_H + borderThick * 2;
        const br = r + borderThick;
        // Top-left trắng, top-right xanh nhạt, bottom-left xanh nhạt, bottom-right xanh dương
        prevG.fillGradientStyle(0xffffff, 0xebfcff, 0xffffff, 0xebfcff, 1);
        prevG.fillRoundedRect(bx, by, bw, bh, br);

        // Viền giữa mỏng (separator) xanh dương trong suốt
        prevG.lineStyle(1.5, 0xebfcff, 0.55);
        prevG.strokeRoundedRect(bx + 2, by + 2, bw - 4, bh - 4, br - 1);

        // Nền xanh gradient bên trong
        prevG.fillGradientStyle(0xebfcff, 0xebfcff, 0x1a8fc0, 0x1a8fc0, 1);
        prevG.fillRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H, r);

        // Gloss trên
        prevG.fillStyle(0xffffff, 0.22);
        prevG.fillRoundedRect(PREVIEW_X + 8, PREVIEW_Y + 6, PREVIEW_W - 16, PREVIEW_H * 0.22, r - 2);

        // Viền trong trắng mỏng
        prevG.lineStyle(1.5, 0xffffff, 0.7);
        prevG.strokeRoundedRect(PREVIEW_X + 2, PREVIEW_Y + 2, PREVIEW_W - 4, PREVIEW_H - 4, r - 2);

        // ── Luôn hiển thị phông nền đang dùng (hoặc đang chọn) ──────
        const activeBgId = Number(this.playerData?.user?.active_bg_id || this.playerData?.active_bg_id);
        // Tab background: dùng selectedBgId; tab khác: dùng activeBgId
        const previewBgId = (this.activeTab === "background" && this.selectedBgId)
            ? this.selectedBgId
            : (activeBgId || this.selectedBgId);

        const bgKey = `bg_${previewBgId}`;
        if (previewBgId && this.textures.exists(bgKey)) {
            const bgSprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2, bgKey));
            const wRatio = (PREVIEW_W - 6) / bgSprite.width;
            const hRatio = (PREVIEW_H - 6) / bgSprite.height;
            bgSprite.setScale(Math.max(wRatio, hRatio)).setDepth(5);

            const maskShape = push(this.make.graphics());
            maskShape.fillRoundedRect(PREVIEW_X + 3, PREVIEW_Y + 3, PREVIEW_W - 6, PREVIEW_H - 6, 12);
            bgSprite.setMask(maskShape.createGeometryMask());
        }

        // ── Luôn đè nhân vật lên trên nền ───────────────────────────
        const currentChar = this.getCurrentCharacter();
        if (currentChar) {
            const charName = currentChar.name;
            // Tab "skin": dùng skin đang preview; tab "character": luôn skin 1
            const skinNum  = (this.activeTab === "skin")
                ? (this.selectedSkinNum || currentChar.active_skin_number || 1)
                : 1;
            const animKey  = `bag_${charName}_${skinNum}_idle`;
            const frame0   = `bag_${charName}_${skinNum}_idle_000`;

            if (this.textures.exists(frame0)) {
                const src = this.textures.get(frame0).getSourceImage();
                const charScale = Math.min(
                    (PREVIEW_W - 20) / src.width,
                    (PREVIEW_H - 20) / src.height
                ) * 0.92;
                const charCY = PREVIEW_Y + PREVIEW_H / 2 + 10;

                const aura = push(this.add.sprite(leftCX, charCY, frame0));
                aura.setScale(charScale * 1.15).setTint(0xffeeaa).setAlpha(0.55)
                    .setBlendMode(Phaser.BlendModes.ADD).setDepth(6);

                const charSprite = push(this.add.sprite(leftCX, charCY, frame0));
                charSprite.setScale(charScale).setDepth(7);

                if (this.anims.exists(animKey)) { charSprite.play(animKey); aura.play(animKey); }

                this.tweens.add({ targets: [charSprite, aura], y: charCY - 6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                this.tweens.add({ targets: aura, scaleX: charScale * 1.25, scaleY: charScale * 1.25, alpha: { from: 0.55, to: 0.08 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
            }
        }

        // ── Nội dung bên dưới preview ────────────────────────────────
        const infoY    = PREVIEW_Y + PREVIEW_H + 12;
        const infoBot  = top + PANEL_H - 16;
        const infoH    = infoBot - infoY;
        const infoCY   = infoY + infoH / 2 - 12;

        if (this.activeTab === "background") {
            const currentBg = this.myBackgrounds.find(b => Number(b.background_id || b.id) === Number(this.selectedBgId));
            const isCurrentActive = currentBg && Number(currentBg.background_id || currentBg.id) === activeBgId;
            const displayName = currentBg?.name || `Phông nền ${this.selectedBgId || ""}`;

            // tên(~28) + divider(21) + trạng thái(~18) = ~67
            const blockH   = 67;
            const blockTop = infoCY - blockH / 2;

            push(this.add.text(leftCX, blockTop, displayName, {
                fontFamily: "Signika", fontSize: "20px", color: "#5c3300", fontStyle: "bold",
                stroke: "#f5dfa0", strokeThickness: 2,
            }).setOrigin(0.5, 0).setDepth(5));

            const dg = push(this.add.graphics().setDepth(5));
            dg.lineStyle(1.5, 0xc8a060, 0.6);
            dg.lineBetween(leftCX - LEFT_W / 2 + 20, blockTop + 38, leftCX + LEFT_W / 2 - 20, blockTop + 38);

            push(this.add.text(leftCX, blockTop + 40,
                `✦  Trạng thái: ${isCurrentActive ? "Đang sử dụng" : "Chưa trang bị"}`, {
                fontFamily: "Signika", fontSize: "13px",
                color: isCurrentActive ? "#2a8b2a" : "#8b5e1a", fontStyle: "italic",
            }).setOrigin(0.5, 0).setDepth(5));
        } else {
            const displayName = currentChar?.name || "Chưa chọn";
            const desc = currentChar?.description || currentChar?.desc || null;
            const isCurrentActive = currentChar && Number(currentChar.is_active_character) === 1;

            // Tính tổng chiều cao khối nội dung để căn giữa dọc
            // tên(~28) + divider(10+1+10) + label(~18) + skinName(~22) + [desc: divider+text] + [btn: 44]
            const hasDesc = !!desc;
            const hasBtn  = !isCurrentActive;
            let blockH = 28 + 21 + 18 + 22; // tên + divider + label + skinName
            if (hasDesc) blockH += 10 + 1 + 10 + 40; // divider + desc (~2 dòng)
            if (hasBtn)  blockH += 16 + 44; // gap + btn
            const blockTop = infoCY - blockH / 2;

            let cy = blockTop;

            push(this.add.text(leftCX, cy, displayName, {
                fontFamily: "Signika", fontSize: "20px", color: "#5c3300", fontStyle: "bold",
                stroke: "#f5dfa0", strokeThickness: 2,
            }).setOrigin(0.5, 0).setDepth(5));
            cy += 28;

            const dg = push(this.add.graphics().setDepth(5));
            dg.lineStyle(1.5, 0xc8a060, 0.6);
            dg.lineBetween(leftCX - LEFT_W / 2 + 20, cy + 10, leftCX + LEFT_W / 2 - 20, cy + 10);
            cy += 21;

            const activeSkinNum = this.selectedSkinNum || currentChar?.active_skin_number || 1;
            const skinLabelMap  = { 1: "Sơ cấp", 2: "Trung cấp", 3: "Cao cấp" };

            push(this.add.text(leftCX, cy, "✦  Trang phục đang mặc:", {
                fontFamily: "Signika", fontSize: "13px", color: "#8b5e1a", fontStyle: "italic",
            }).setOrigin(0.5, 0).setDepth(5));
            cy += 18;

            push(this.add.text(leftCX, cy, skinLabelMap[activeSkinNum] || `Skin ${activeSkinNum}`, {
                fontFamily: "Signika", fontSize: "15px", color: "#4a2000", fontStyle: "bold",
            }).setOrigin(0.5, 0).setDepth(5));
            cy += 22;

            if (hasDesc) {
                const dg2 = push(this.add.graphics().setDepth(5));
                dg2.lineStyle(1, 0xc8a060, 0.35);
                dg2.lineBetween(leftCX - LEFT_W / 2 + 28, cy + 10, leftCX + LEFT_W / 2 - 28, cy + 10);
                cy += 21;

                push(this.add.text(leftCX, cy, desc, {
                    fontFamily: "Signika", fontSize: "12px", color: "#6b4a1a",
                    fontStyle: "italic", align: "center",
                    wordWrap: { width: LEFT_W - 52 },
                }).setOrigin(0.5, 0).setDepth(5));
                cy += 40;
            }

            if (hasBtn) {
                cy += 16;
                this._buildActionBtn(leftCX, cy + 22, 200, 44,
                    "⚔️ Trang Bị", 0xd4a030, 0x8a5e10,
                    async () => {
                        if (this.playerUserId && this.selectedCharId) {
                            try {
                                await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/active`, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ character_id: this.selectedCharId }),
                                });
                                this.myCharacters.forEach(c => c.is_active_character = (Number(c.character_id) === Number(this.selectedCharId)) ? 1 : 0);
                                if (this.playerData?.user) {
                                    this.playerData.user.active_character_id = this.selectedCharId;
                                    setPlayerData(this, this.playerData);
                                }
                                this.showToast("✅ Đã trang bị nhân vật!");
                                this.buildLeftPanel();
                                this.renderRightPanel();
                            } catch (e) {
                                console.warn("Save character failed", e);
                                this.showToast("❌ Lỗi khi trang bị!");
                            }
                        }
                    }
                );
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  TABS: Nhân Vật | Trang Phục | Phông Nền
    // ═══════════════════════════════════════════════════════════════
    buildTabs() {
        this._tabBtnObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._tabBtnObjs = [];
        const push = o => { this._tabBtnObjs.push(o); return o; };

        const { rightCX, RIGHT_W, PANEL_Y } = this._layout;

        const tabs   = ["NHÂN VẬT", "TRANG PHỤC", "PHÔNG NỀN"];
        const ids    = ["character", "skin", "background"];
        const tabW   = 160;
        const tabH   = 46;
        const gap    = 8;
        const totalTabsWidth = tabs.length * tabW + (tabs.length - 1) * gap;
        const startX = rightCX - totalTabsWidth / 2;
        const tabY   = PANEL_Y - tabH - 2;

        // Khởi tạo graphics và text
        this._tabGraphics = this._tabGraphics || [];
        this._tabTexts    = this._tabTexts    || [];
        this._tabGraphics.forEach(g => { try { g?.destroy(); } catch(e){} });
        this._tabTexts.forEach(t => { try { t?.destroy(); } catch(e){} });
        this._tabGraphics = [];
        this._tabTexts    = [];

        tabs.forEach((label, i) => {
            const tx = startX + i * (tabW + gap);
            const g  = push(this.add.graphics().setDepth(1));
            this._tabGraphics.push(g);

            const txt = push(this.add.text(tx + tabW / 2, tabY + tabH / 2, label, {
                fontFamily: "Signika", fontSize: "18px", color: "#502700",
                fontStyle: "bold",
            }).setOrigin(0.5).setPadding(6, 4, 6, 4).setDepth(16));
            this._tabTexts.push(txt);

            push(this.add.zone(tx + tabW / 2, tabY + tabH / 2, tabW, tabH)
                .setInteractive({ cursor: "pointer" }).setDepth(17))
                .on("pointerdown", async () => {
                    if (this.activeTab === ids[i]) return;
                    this.activeTab = ids[i];
                    if (ids[i] === "skin") {
                        this.ensureSelectedCharacter();
                        await this.loadSkinsForCharacter(this.selectedCharId);
                    }
                    this._drawAllTabs(startX, tabY, tabW, tabH, gap);
                    this._fadeRefresh();
                });
        });

        this._drawAllTabs(startX, tabY, tabW, tabH, gap);
        this._tabMeta = { startX, tabY, tabW, tabH, gap };
    } 

    _drawAllTabs(startX, tabY, tabW, tabH, gap) {
        const ids = ["character", "skin", "background"];
        this._tabGraphics.forEach((g, i) => {
            const tx     = startX + i * (tabW + gap);
            const active = this.activeTab === ids[i];
            g.clear();
            if (active) {
                g.fillStyle(0x000000, 0.2);
                g.fillRoundedRect(tx + 3, tabY - 2, tabW, tabH, { tl: 10, tr: 10, bl: 0, br: 0 });
                g.fillStyle(0xebe3c0, 1);
                g.fillRoundedRect(tx, tabY - 4, tabW, tabH + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
                g.lineStyle(2, 0xb89040, 1);
                g.strokeRoundedRect(tx, tabY - 4, tabW, tabH + 4, { tl: 10, tr: 10, bl: 0, br: 0 });
                g.fillStyle(0xffffff, 0.28);
                g.fillRoundedRect(tx + 8, tabY, tabW - 16, 10, 4);
                this._tabTexts[i].setColor("#502700");
            } else {
                g.fillStyle(0x000000, 0.18);
                g.fillRoundedRect(tx + 3, tabY + 2, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
                g.fillStyle(0xc4a865, 1);
                g.fillRoundedRect(tx, tabY, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
                g.lineStyle(1.5, 0x8a6a20, 0.6);
                g.strokeRoundedRect(tx, tabY, tabW, tabH, { tl: 8, tr: 8, bl: 0, br: 0 });
                this._tabTexts[i].setColor("#502700");
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL PHẢI — Grid item theo tab
    // ═══════════════════════════════════════════════════════════════
    renderRightPanel() {
        let oldGridX = null;
        if (this._gridContainer) { 
            oldGridX = this._gridContainer.x;
            this._gridContainer.destroy(); 
            this._gridContainer = null; 
        }

        this._rightObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._rightObjs = [];

        const { rightCX, panelY, RIGHT_W, PANEL_H, PANEL_Y } = this._layout;

        const top    = (PANEL_Y || panelY - PANEL_H / 2) + 14;
        const GRID_H = PANEL_H - 28;
        const push   = o => { this._rightObjs.push(o); return o; };

        if (this.activeTab === "skin") {
            this.ensureSelectedCharacter();
        }

        let items = [];

        // ── Tab Nhân Vật ─────────────────────────────────────────
        if (this.activeTab === "character") {
            items = this.myCharacters.map(c => {
                // Tab nhân vật luôn dùng skin 1 để hiển thị
                const isActive = Number(c.is_active_character) === 1;
                return {
                    id: c.character_id,
                    type: "character",
                    imgKey: `bag_${c.name}_1_idle_000`,
                    label: c.name || `Nhân vật ${c.character_id}`,
                    isActive,
                    skinNum: 1,
                    charName: c.name
                };
            });
        }

        // ── Tab Trang Phục ───────────────────────────────────────
        if (this.activeTab === "skin") {
            const currentChar = this.getCurrentCharacter();
            const charName = currentChar?.name || "";

            if (this.mySkins.length > 0) {
                // Luôn đảm bảo skin lv1 (default) có trong danh sách
                const hasSkin1 = this.mySkins.some(s => Number(s.skin_number) === 1);
                const skinList = hasSkin1 ? this.mySkins : [
                    { skin_id: null, skin_number: 1, is_active: 0 },
                    ...this.mySkins
                ];

                items = skinList.map(s => {
                    const skinNum = s.skin_number || 1;
                    const isActive = Number(s.is_active) === 1;
                    const frameKey = `bag_${charName}_${skinNum}_idle_000`;
                    return {
                        id: s.skin_id || skinNum,
                        type: "skin",
                        imgKey: this.textures.exists(frameKey) ? frameKey : null,
                        label: this._getSkinLabel(skinNum),
                        isActive,
                        skinNum,
                        skinId: s.skin_id,
                        charName,
                        locked: !this.textures.exists(frameKey) && skinNum !== 1
                    };
                });
            } else {
                // Fallback: hiện 3 skin, lv1 luôn unlock
                for (let s = 1; s <= 3; s++) {
                    const frameKey = `bag_${charName}_${s}_idle_000`;
                    const hasTexture = this.textures.exists(frameKey);
                    items.push({
                        id: s,
                        type: "skin",
                        imgKey: hasTexture ? frameKey : null,
                        label: this._getSkinLabel(s),
                        isActive: s === (this.selectedSkinNum || 1),
                        skinNum: s,
                        skinId: null,
                        charName,
                        locked: !hasTexture && s !== 1
                    });
                }
            }
        }

        // ── Tab Phông Nền ────────────────────────────────────────
        if (this.activeTab === "background") {
            const activeBgId = Number(this.playerData?.user?.active_bg_id || this.playerData?.active_bg_id);
            items = this.myBackgrounds.map(b => ({
                id: b.background_id || b.id,
                type: "background",
                imgKey: `bg_${b.background_id || b.id}`,
                label: b.name || `Phông nền ${b.background_id || b.id}`,
                isActive: Number(b.background_id || b.id) === activeBgId
            }));
        }

        if (items.length === 0) {
            const currentChar = this.getCurrentCharacter();
            const emptyMsg = this.activeTab === "skin"
                ? `Nhân vật ${currentChar?.name || ""} chưa có trang phục nào`
                : this.activeTab === "background"
                    ? "Chưa có phông nền nào."
                    : "Chưa có nhân vật nào.";

            push(this.add.text(rightCX, panelY, emptyMsg, {
                fontFamily: "Signika", fontSize: "16px",
                color: "#9b7040", align: "center"
            }).setOrigin(0.5).setDepth(10));

            return;
        }

        const ROWS   = 2;
        const COLS   = Math.ceil(items.length / ROWS);
        const PAD_X  = 24;
        const PAD_Y  = 14;
        const GAP_X  = 10;
        const GAP_Y  = 10;

        // Hiển thị đúng 3 cột cùng lúc, tính CARD_W từ RIGHT_W
        const VISIBLE_COLS = 3;
        const CARD_W = Math.floor((RIGHT_W - PAD_X * 2 - GAP_X * (VISIBLE_COLS - 1)) / VISIBLE_COLS * 0.82);
        // CARD_H vừa khít 2 hàng trong GRID_H
        const CARD_H = Math.floor((GRID_H - PAD_Y * 2 - GAP_Y) / 2);

        const totalW     = COLS * CARD_W + (COLS - 1) * GAP_X;
        const gridStartX = rightCX - RIGHT_W / 2 + PAD_X;
        const gridStartY = top + PAD_Y;

        this._gridContainer = this.add.container(gridStartX, gridStartY).setDepth(12);

        items.forEach((item, idx) => {
            const col = Math.floor(idx / ROWS);
            const row = idx % ROWS;
            const cx  = col * (CARD_W + GAP_X);
            const cy  = row * (CARD_H + GAP_Y);
            const card = this._buildItemCard(cx, cy, CARD_W, CARD_H, item);
            this._gridContainer.add(card);
        });

        this._minX  = gridStartX;
        this._maxX  = Math.min(gridStartX, gridStartX - (totalW - (RIGHT_W - PAD_X * 2)));
        this._velocityX = 0;
        
        if (oldGridX !== null) {
            this._gridContainer.x = Phaser.Math.Clamp(oldGridX, this._maxX, this._minX);
        } else {
            this._gridContainer.x = gridStartX;
        }

        const maskShape = push(this.make.graphics());
        maskShape.fillRoundedRect(
            rightCX - RIGHT_W / 2 + 20,
            top + 6,
            RIGHT_W - 36,
            GRID_H - 6,
            12
        );
        this._gridContainer.setMask(maskShape.createGeometryMask());

        this._setupDrag(rightCX, RIGHT_W, top, GRID_H);
    }

    // ═══════════════════════════════════════════════════════════════
    //  THẺ ITEM — Card nhân vật / trang phục / phông nền
    // ═══════════════════════════════════════════════════════════════
    _buildItemCard(x, y, w, h, item) {
        const container = this.add.container(x, y);

        const isSelected =
            (item.type === "character"  && Number(item.id) === Number(this.selectedCharId)) ||
            (item.type === "skin"       && item.skinNum === this.selectedSkinNum) ||
            (item.type === "background" && item.id === this.selectedBgId);

        const isActive = !!item.isActive;
        const isLocked = !!item.locked;

        // Header cam chiếm ~26% chiều cao card
        const HDR_H = Math.round(h * 0.26);

        // ── Ảnh nền card ──────────────────────────────────────────
        const cardBg = this.add.image(w / 2, h / 2, "card_item1")
            .setDisplaySize(w, h);
        if (isLocked) cardBg.setAlpha(0.55);

        // ── Hiệu ứng selected: làm tối card ─────────────────────
        const selGlow = this.add.graphics();
        if (isSelected) {
            // selGlow.fillStyle(0x000000, 0.22);
            // selGlow.fillRoundedRect(0, 0, w, h, 16);
        }

        // ── Tên trên header cam ───────────────────────────────────
        const rawLabel = (item.label || "").replace(/_/g, " ");
        const maxChars = 12;
        const displayLabel = rawLabel.length > maxChars ? rawLabel.substring(0, maxChars) + "..." : rawLabel;
        const fontSize = Math.max(12.5, Math.min(16.5, Math.round(w * 0.13)));
        const nameTxt = this.add.text(w / 2, HDR_H / 2, displayLabel, {
            fontFamily: "Signika",
            fontSize: fontSize + "px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#0b0a2bff",
            strokeThickness: 3,
            align: "center",
        }).setOrigin(0.5);

        // ── Badge "Đã dùng" — ribbon ảnh góc trên trái ──────────
        let badgeObj = null;
        if (isActive) {
            const size = w * 0.6;
            const ribbon = this.add.image(-3.5, -3.5, "use_badge")
                .setOrigin(0, 0)
                .setDisplaySize(size, size);
            badgeObj = this.add.container(0, 0, [ribbon]);
        }

        // ── Ảnh nhân vật / skin / background ─────────────────────
        // Chiếm toàn bộ phần thân (dưới header)
        const imgAreaY   = HDR_H + 4;
        const imgAreaH   = h - HDR_H - 8;
        const imgCenterY = imgAreaY + imgAreaH / 2 - 11;

        let imgObj = null;
        if (item.imgKey && this.textures.exists(item.imgKey)) {
            imgObj = this.add.image(w / 2, imgCenterY, item.imgKey).setOrigin(0.5, 0.5);
            if (item.type === "background") {
                // Fill vừa khít vùng thân, không tràn ra ngoài
                const scale = Math.min((w - 10) / imgObj.width, (imgAreaH - 8) / imgObj.height);
                imgObj.setScale(scale);
            } else {
                const scale = Math.min((w - 28) / imgObj.width, (imgAreaH - 20) / imgObj.height) * 1.3;
                imgObj.setScale(scale);
            }
            if (isLocked) imgObj.setAlpha(0.35);
        } else if (!isLocked) {
            imgObj = this.add.text(w / 2, imgCenterY,
                item.type === "background" ? "🖼" : "🎭",
                { fontSize: Math.round(h * 0.35) + "px" }
            ).setOrigin(0.5);
        }

        // ── Badge khóa ────────────────────────────────────────────
        let lockBadge = null;
        if (isLocked) {
            lockBadge = this.add.text(w / 2, imgCenterY, "🔒",
                { fontSize: Math.round(h * 0.25) + "px" }
            ).setOrigin(0.5);
        }

        const children = [cardBg, selGlow, nameTxt];
        if (imgObj)    children.push(imgObj);
        if (lockBadge) children.push(lockBadge);
        if (badgeObj)  children.push(badgeObj);  // ribbon luôn trên cùng
        container.add(children);

        // ── Interactive ───────────────────────────────────────────
        if (!isLocked) {
            container.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
            container.input.cursor = "pointer";
            container.on("pointerover", () => {
                cardBg.setTint(0xffe8cc);
            });
            container.on("pointerout", () => {
                cardBg.clearTint();
            });
            container.on("pointerup", () => {
                if (this._dragMoved) return;
                this._onSelectItem(item);
            });
        }

        return container;
    }

    /**
     * Tải danh sách skin đã sở hữu cho một nhân vật cụ thể
     */
    async loadSkinsForCharacter(characterId = null) {
        const targetCharId = Number(characterId || this.selectedCharId);
        if (!this.playerUserId || !targetCharId) {
            this.mySkins = [];
            return;
        }

        try {
            const res = await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/${targetCharId}/skins`);

            if (!res.ok) {
                console.warn("Skin API lỗi:", res.status);
                this.mySkins = [];
                return;
            }

            const json = await res.json();
            this.mySkins = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
            console.log("mySkins từ server:", JSON.stringify(this.mySkins, null, 2));

            // Preload sprites cho các skin chưa load
            const currentChar = this.getCurrentCharacter();
            const charName = currentChar?.name || "";
            if (!charName) return;

            const toLoad = [];
            for (const skin of this.mySkins) {
                const skinNum = skin.skin_number || 1;
                for (let i = 0; i < 18; i++) {
                    const num      = String(i).padStart(3, "0");
                    const frameKey = `bag_${charName}_${skinNum}_idle_${num}`;
                    if (!this.textures.exists(frameKey)) {
                        toLoad.push({
                            key:  frameKey,
                            path: `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`
                        });
                    }
                }
            }

            if (toLoad.length) {
                await new Promise(resolve => {
                    let done = 0;
                    const total = toLoad.length;
                    const tick = () => { if (++done >= total) resolve(); };
                    this.load.on("filecomplete", tick);
                    this.load.on("loaderror",    tick);
                    toLoad.forEach(({ key, path }) => this.load.image(key, path));
                    this.load.start();
                });
                this._createAllBagAnimations();
            }
        } catch (e) {
            console.warn("Failed to load skins", e);
            this.mySkins = [];
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  CHỌN ITEM
    // ═══════════════════════════════════════════════════════════════
    async _onSelectItem(item) {
        if (item.locked) {
            this.showToast("Trang phục này chưa được mở khóa!");
            return;
        }

        if (item.type === "background") {
            this.selectedBgId = item.id;
            if (this.playerUserId) {
                const activeBgId = Number(this.playerData?.user?.active_bg_id || this.playerData?.active_bg_id);
                if (Number(item.id) !== activeBgId) {
                    try {
                        await fetch(`${SERVER_URL}/users/${this.playerUserId}/backgrounds/active`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ background_id: item.id }),
                        });
                        if (this.playerData) {
                            if (this.playerData.user) this.playerData.user.active_bg_id = item.id;
                            this.playerData.active_bg_id = item.id;
                            setPlayerData(this, this.playerData);
                        }
                        this.showToast("✅ Đã trang bị phông nền!");
                    } catch (e) { console.warn("Save background failed", e); }
                }
            }
            this._fadeRefresh();
            return;
        }

        if (item.type === "character") {
            this.selectedCharId = item.id;
            this.selectedSkinNum = null;

            const currentChar = this.getCurrentCharacter();
            const charName1 = currentChar?.name || "";
            const frame1 = `bag_${charName1}_1_idle_000`;
            if (charName1 && !this.textures.exists(frame1)) {
                await this._loadCharacterSprites();
                this._createAllBagAnimations();
            }

            // Auto equip ngay
            if (this.playerUserId) {
                try {
                    await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/active`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ character_id: item.id }),
                    });
                    this.myCharacters.forEach(c => {
                        c.is_active_character = (Number(c.character_id) === Number(item.id)) ? 1 : 0;
                    });
                    if (this.playerData?.user) {
                        this.playerData.user.active_character_id = item.id;
                        setPlayerData(this, this.playerData);
                    }
                    this.showToast("✅ Đã trang bị nhân vật!");
                } catch (e) { console.warn("Save character failed", e); }
            }

            this._fadeRefresh();

        } else if (item.type === "skin") {
            this.selectedSkinNum = item.skinNum;
            this.selectedSkinId = item.skinId || item.id;

            const currentChar = this.getCurrentCharacter();
            if (currentChar) {
                currentChar.active_skin_number = item.skinNum;
                currentChar.active_skin_id = item.skinId || item.id;
            }

            const charName = item.charName || currentChar?.name;
            const animKey = `bag_${charName}_${item.skinNum}_idle`;
            if (!this.anims.exists(animKey)) {
                await this._loadCharacterSprites();
                this._createAllBagAnimations();
            }

            // Auto equip skin ngay
            if (this.playerUserId && this.selectedCharId) {
                try {
                    if (item.skinId) {
                        await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/${this.selectedCharId}/skin`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ skin_id: item.skinId }),
                        });
                    }
                    // Cập nhật mySkins để isActive đúng khi rebuild
                    this.mySkins.forEach(s => {
                        s.is_active = (Number(s.skin_number) === Number(item.skinNum)) ? 1 : 0;
                    });
                    if (this.playerData?.characters) {
                        const ac = this.playerData.characters.find(c => Number(c.id) === Number(this.selectedCharId));
                        if (ac) { ac.active_skin_number = item.skinNum; ac.active_skin_id = item.skinId; }
                        setPlayerData(this, this.playerData);
                    }
                    this.showToast("✅ Đã đổi trang phục!");
                } catch (e) { console.warn("Save skin failed", e); }
            }

            this._fadeRefresh();
        }
    }

    // Fade out → rebuild → fade in mượt
    _fadeRefresh() {
        const rightObjs = this._rightObjs.filter(o => o?.active);
        const leftObjs  = this._previewObjs.filter(o => o?.active);
        const all = [...rightObjs, ...leftObjs];

        if (all.length === 0) {
            this.buildLeftPanel();
            this.renderRightPanel();
            return;
        }

        this.tweens.add({
            targets: all,
            alpha: 0,
            duration: 100,
            ease: "Sine.easeIn",
            onComplete: () => {
                this.buildLeftPanel();
                this.renderRightPanel();
                const newAll = [...this._rightObjs, ...this._previewObjs].filter(o => o?.active);
                newAll.forEach(o => { try { o.setAlpha(0); } catch(e){} });
                this.tweens.add({ targets: newAll, alpha: 1, duration: 200, ease: "Sine.easeOut" });
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  DRAG
    // ═══════════════════════════════════════════════════════════════
    _setupDrag(rightCX, RIGHT_W, top, gridH) {
        // Xóa listener cũ trước
        this.input.off("pointerdown",  this._onPDown,  this);
        this.input.off("pointermove",  this._onPMove,  this);
        this.input.off("pointerup",    this._onPUp,    this);
        this.input.off("pointerout",   this._onPOut,   this);

        const panelLeft  = rightCX - RIGHT_W / 2;
        const panelRight = rightCX + RIGHT_W / 2;

        this._onPDown = (p) => {
            if (p.x > panelLeft && p.x < panelRight) {
                this._isDragging = true;
                this._dragX      = p.x;
                this._dragMoved  = false;
                this._velocityX  = 0;
            }
        };
        this._onPMove = (p) => {
            if (!this._isDragging) return;
            if (Math.abs(p.x - this._dragX) > 8) this._dragMoved = true;
            if (this._dragMoved && this._gridContainer) {
                const delta = p.x - this._dragX;
                this._gridContainer.x += delta;
                this._dragX      = p.x;
                this._velocityX  = delta;
            }
        };
        this._onPUp  = () => { this._isDragging = false; };
        this._onPOut = () => { this._isDragging = false; };

        this.input.on("pointerdown",  this._onPDown,  this);
        this.input.on("pointermove",  this._onPMove,  this);
        this.input.on("pointerup",    this._onPUp,    this);
        this.input.on("pointerout",   this._onPOut,   this);
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI HELPERS
    // ═══════════════════════════════════════════════════════════════
    _buildActionBtn(bx, by, bw, bh, label, c1, c2, cb) {
        const br = bh / 2;
        const g  = this.add.graphics().setDepth(8);
        const drawBtn = (hover = false) => {
            g.clear();
            g.fillStyle(c1, hover ? 0.28 : 0.15);
            g.fillRoundedRect(bx - bw/2 - 8, by - bh/2 - 8, bw + 16, bh + 16, br + 6);
            g.fillStyle(0x000000, 0.30);
            g.fillRoundedRect(bx - bw/2 + 3, by - bh/2 + 6, bw, bh, br);
            g.fillGradientStyle(c1, c1, c2, c2, 1);
            g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
            g.fillStyle(0xffffff, hover ? 0.38 : 0.22);
            g.fillRoundedRect(bx - bw/2 + 10, by - bh/2 + 5, bw - 20, bh * 0.38, br - 3);
            g.lineStyle(2, 0xffffff, 0.55);
            g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
        };
        drawBtn(false);

        const txt = this.add.text(bx, by, label, {
            fontFamily: "Signika", fontSize: "16px",
            color: "#ffffff", fontStyle: "bold",
            stroke: "#00000099", strokeThickness: 3,
        }).setOrigin(0.5).setDepth(9);

        const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(10);
        zone.on("pointerover", () => { drawBtn(true); this.tweens.add({ targets: [g, txt], scaleX: 1.05, scaleY: 1.05, duration: 85 }); });
        zone.on("pointerout",  () => { drawBtn(false); this.tweens.add({ targets: [g, txt], scaleX: 1, scaleY: 1, duration: 85 }); });
        zone.on("pointerup",   () => { this.tweens.add({ targets: [g, txt], scaleX: 0.93, scaleY: 0.93, duration: 55, yoyo: true, onComplete: cb }); });

        this._previewObjs.push(g, txt, zone);
    }

    showToast(msg) {
        const { width, height } = this.scale;
        const toast = this.add.text(width / 2, height - 80, msg, {
            fontFamily: "Signika", fontSize: "16px",
            color: "#fff", backgroundColor: "#4a2000cc",
            padding: { x: 18, y: 10 }, borderRadius: 12,
        }).setOrigin(0.5).setDepth(300).setAlpha(0);
        this.tweens.add({ targets: toast, alpha: 1, duration: 180, onComplete: () => {
            this.time.delayedCall(1400, () => {
                this.tweens.add({ targets: toast, alpha: 0, duration: 240, onComplete: () => toast.destroy() });
            });
        }});
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL ĐẸP — copy từ TarotScene
    // ═══════════════════════════════════════════════════════════════
    createStyledPanel(cx, cy, w, h, radius) {
        const left = cx - w / 2;
        const top  = cy - h / 2;
        const g    = this.add.graphics().setDepth(2);

        // Bóng đổ
        g.fillStyle(0x000000, 0.25);
        g.fillRoundedRect(left + 6, top + 6, w, h, radius);

        // Nền gradient vàng kem
        g.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xf6eac6, 0xf6eac6, 1);
        g.fillRoundedRect(left, top, w, h, radius);

        // Viền trắng ngoài
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(left, top, w, h, radius);

        // Gloss trên cùng
        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(left + 6, top + 4, w - 12, 20, 8);

        // Viền đứt nét bên trong
        const ins = 10;
        const cornerR = radius - 4;
        g.lineStyle(1.5, 0xb8922e, 0.5);

        const drawD = (x1, y1, x2, y2) => {
            const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
            const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
            for (let d = 0; d < dist; d += 14) {
                g.beginPath();
                g.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
                g.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
                g.strokePath();
            }
        };

        const drawArc = (acx, acy, r, startAngle, endAngle) => {
            const arcLength = r * Math.abs(endAngle - startAngle);
            const steps = Math.ceil(arcLength / 14);
            for (let i = 0; i < steps; i++) {
                const a1 = startAngle + (endAngle - startAngle) * (i / steps);
                const a2 = startAngle + (endAngle - startAngle) * Math.min((i + 0.57) / steps, 1);
                g.beginPath();
                g.arc(acx, acy, r, a1, a2);
                g.strokePath();
            }
        };

        drawD(left+ins+cornerR, top+ins, left+w-ins-cornerR, top+ins);
        drawD(left+w-ins, top+ins+cornerR, left+w-ins, top+h-ins-cornerR);
        drawD(left+w-ins-cornerR, top+h-ins, left+ins+cornerR, top+h-ins);
        drawD(left+ins, top+h-ins-cornerR, left+ins, top+ins+cornerR);

        drawArc(left+ins+cornerR,   top+ins+cornerR,   cornerR, Math.PI,      Math.PI*1.5);
        drawArc(left+w-ins-cornerR, top+ins+cornerR,   cornerR, Math.PI*1.5,  Math.PI*2);
        drawArc(left+w-ins-cornerR, top+h-ins-cornerR, cornerR, 0,            Math.PI*0.5);
        drawArc(left+ins+cornerR,   top+h-ins-cornerR, cornerR, Math.PI*0.5,  Math.PI);

        return g;
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    getCurrentCharacter() {
        if (!this.selectedCharId) return null;
        return this.myCharacters.find(c => Number(c.character_id) === Number(this.selectedCharId)) || null;
    }

    ensureSelectedCharacter() {
        if (this.selectedCharId) return;

        const activeCharId =
            Number(this.playerData?.user?.active_character_id) ||
            Number(this.playerData?.active_character_id) ||
            null;

        if (activeCharId) {
            this.selectedCharId = activeCharId;
        } else if (this.myCharacters.length > 0) {
            this.selectedCharId = this.myCharacters[0].character_id;
        }

        const currentChar = this.getCurrentCharacter();
        if (currentChar) {
            this.selectedSkinNum = currentChar.active_skin_number || 1;
            this.selectedSkinId = currentChar.active_skin_id || null;
        }
    }

    _getSkinLabel(skinNum) {
        const map = { 1: "Sơ cấp", 2: "Trung cấp", 3: "Cao cấp" };
        return map[skinNum] || `Skin ${skinNum}`;
    }
}