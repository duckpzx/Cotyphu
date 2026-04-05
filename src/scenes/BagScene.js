import { getPlayerData, setPlayerData } from "../server/utils/playerData.js";

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
    }

    async create() {
        const { width, height } = this.scale;

        // Lấy playerData
        this.playerData = getPlayerData(this) || {};
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;

        // ── Background ───────────────────────────────────────────────
        const bg = this.add.image(width / 2, height / 2, "bag-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Tải dữ liệu từ server ────────────────────────────────────
        await this.loadAllAssets();

        // ── Layout ───────────────────────────────────────────────────
        const GAP        = 20;
        const LEFT_W     = 360;
        const RIGHT_W    = width - LEFT_W - GAP - 40;
        const PANEL_H    = height - 100;
        const START_X    = 20;

        const leftCX  = START_X + LEFT_W / 2;
        const rightCX = START_X + LEFT_W + GAP + RIGHT_W / 2;
        const panelY  = height / 2 + 10;

        // ── Panel trái ───────────────────────────────────────────────
        this.createStyledPanel(leftCX,  panelY, LEFT_W,  PANEL_H, 22);
        // ── Panel phải ───────────────────────────────────────────────
        this.createStyledPanel(rightCX, panelY, RIGHT_W, PANEL_H, 22);

        // Lưu layout để dùng lại
        this._layout = { leftCX, rightCX, panelY, LEFT_W, RIGHT_W, PANEL_H, GAP };

        // ── Panel trái: preview nhân vật ─────────────────────────────
        this.buildLeftPanel();

        // ── Tabs + nội dung phải ────────────────────────────────────
        this.buildTabs();
        this.renderRightPanel();

        // ── Nút Back ────────────────────────────────────────────────
        const backBtn = this.add.image(36, 36, "out")
            .setScale(0.9).setDepth(200)
            .setInteractive({ cursor: "pointer" });
        backBtn.on("pointerover", () => backBtn.setTint(0xdddddd));
        backBtn.on("pointerout",  () => backBtn.clearTint());
        backBtn.on("pointerup",   () => {
            this.cameras.main.fadeOut(200);
            this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
        });

        // ── Drag cho grid phải ──────────────────────────────────────
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
    async loadAllAssets() {
        if (!this.playerUserId) return;

        // ── 1. Tải danh sách nhân vật sở hữu ─────────────────────
        try {
            const charRes = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/bag`);
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
    }

    /**
     * Tải sprite idle frames cho tất cả nhân vật (skin active)
     * và TẤT CẢ skin (1-3) của nhân vật đang chọn
     */
    async _loadCharacterSprites() {
        let needsLoad = false;

        for (const char of this.myCharacters) {
            const charName = char.name;
            if (!charName) continue;

            // Xác định skin nào cần load cho nhân vật này
            const skinsToLoad = new Set();
            skinsToLoad.add(char.active_skin_number || 1);

            // Nếu là nhân vật đang chọn, load thêm tất cả skin 1-3
            if (Number(char.character_id) === Number(this.selectedCharId)) {
                skinsToLoad.add(1);
                skinsToLoad.add(2);
                skinsToLoad.add(3);
            }

            for (const skinNum of skinsToLoad) {
                for (let i = 0; i < 18; i++) {
                    const num      = String(i).padStart(3, "0");
                    const frameKey = `bag_${charName}_${skinNum}_idle_${num}`;
                    if (!this.textures.exists(frameKey)) {
                        const path = `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`;
                        this.load.image(frameKey, path);
                        needsLoad = true;
                    }
                }
            }
        }

        if (needsLoad) {
            // Xử lý lỗi load image (skin folder có thể không tồn tại)
            this.load.on('loaderror', (fileObj) => {
                // Bỏ qua lỗi load — skin chưa mua sẽ không có file
            });

            await new Promise(resolve => {
                this.load.once("complete", resolve);
                this.load.start();
            });
        }
    }

    /**
     * Tạo tất cả animation idle cho các nhân vật + skin đã load
     */
    _createAllBagAnimations() {
        for (const char of this.myCharacters) {
            const charName = char.name;
            if (!charName) continue;

            const skinsToCreate = new Set();
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
        const { leftCX, panelY, LEFT_W, PANEL_H } = this._layout;
        this._previewObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._previewObjs = [];
        const push = o => { this._previewObjs.push(o); return o; };

        const top = panelY - PANEL_H / 2;

        // ── Tiêu đề "TÚI ĐỒ" ────────────────────────────────────────
        const titleBg = push(this.add.graphics().setDepth(5));
        titleBg.fillStyle(0xd4a030, 1);
        titleBg.fillRoundedRect(leftCX - 75, top + 14, 150, 34, 17);
        titleBg.fillStyle(0xfff5b0, 0.40);
        titleBg.fillRoundedRect(leftCX - 73, top + 15, 146, 14, 12);
        titleBg.lineStyle(2.5, 0x8b5e1a, 1);
        titleBg.strokeRoundedRect(leftCX - 75, top + 14, 150, 34, 17);

        push(this.add.text(leftCX, top + 31, "TÚI ĐỒ", {
            fontFamily: "Signika", fontSize: "18px",
            color: "#4a2000", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(6));

        // ── Khung preview nhân vật ───────────────────────────────────
        const PREVIEW_W = LEFT_W - 40;
        const PREVIEW_H = 220;
        const PREVIEW_X = leftCX - PREVIEW_W / 2;
        const PREVIEW_Y = top + 62;

        const prevG = push(this.add.graphics().setDepth(4));
        prevG.fillStyle(0x1a3a6a, 1);
        prevG.fillRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H, 14);
        prevG.fillStyle(0x2a5090, 0.45);
        prevG.fillRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H * 0.4, 14);
        prevG.lineStyle(3, 0xc8a060, 0.9);
        prevG.strokeRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H, 14);
        prevG.lineStyle(1.5, 0xffffff, 0.15);
        prevG.strokeRoundedRect(PREVIEW_X + 3, PREVIEW_Y + 3, PREVIEW_W - 6, PREVIEW_H - 6, 12);

        // Hiển thị nhân vật đang chọn
        const currentChar = this.getCurrentCharacter();
        const charName    = currentChar?.name || "";
        const skinNum     = this.selectedSkinNum || currentChar?.active_skin_number || 1;
        const animKey     = `bag_${charName}_${skinNum}_idle`;
        const firstFrame  = `bag_${charName}_${skinNum}_idle_000`;

        if (charName && this.textures.exists(firstFrame)) {
            const sprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2, firstFrame));
            const scale  = Math.min((PREVIEW_W - 20) / sprite.width, (PREVIEW_H - 20) / sprite.height);
            sprite.setScale(scale).setDepth(5);

            if (this.anims.exists(animKey)) {
                sprite.play(animKey);
            }

            // Float animation
            this.tweens.add({
                targets: sprite, y: sprite.y - 6,
                duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });
        } else {
            push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H / 2, "👤", {
                fontFamily: "Signika", fontSize: "56px",
            }).setOrigin(0.5).setDepth(5));
        }

        // ── Tên nhân vật ────────────────────────────────────────────
        const displayName = currentChar?.name || "Chưa chọn";
        push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H + 16, displayName, {
            fontFamily: "Signika", fontSize: "20px",
            color: "#5c3300", fontStyle: "bold",
            stroke: "#f5dfa0", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(5));

        // ── Divider ──────────────────────────────────────────────────
        const divY2 = PREVIEW_Y + PREVIEW_H + 44;
        const dg = push(this.add.graphics().setDepth(5));
        dg.lineStyle(1.5, 0xc8a060, 0.6);
        dg.lineBetween(leftCX - LEFT_W / 2 + 20, divY2, leftCX + LEFT_W / 2 - 20, divY2);

        // ── Nhân vật đang mặc skin nào ──────────────────────────────
        const skinLabelY = divY2 + 18;
        push(this.add.text(leftCX - LEFT_W / 2 + 20, skinLabelY, "✦  Trang phục đang dùng:", {
            fontFamily: "Signika", fontSize: "13px",
            color: "#8b5e1a", fontStyle: "italic",
        }).setDepth(5));

        const activeSkinNumber = Number(skinNum);
        const skinLabelMap = { 1: "Sơ cấp", 2: "Trung cấp", 3: "Cao cấp" };
        const skinName = skinLabelMap[activeSkinNumber] || `Skin ${activeSkinNumber}`;

        push(this.add.text(leftCX - LEFT_W / 2 + 20, skinLabelY + 22, skinName, {
            fontFamily: "Signika", fontSize: "15px",
            color: "#4a2000", fontStyle: "bold",
        }).setDepth(5));

        // ── Info nhân vật ────────────────────────────────────────────
        if (currentChar) {
            const infoY = skinLabelY + 52;
            const isActive = Number(currentChar.is_active_character) === 1;

            push(this.add.text(leftCX - LEFT_W / 2 + 20, infoY, `✦  Trạng thái: ${isActive ? "Đang sử dụng" : "Chưa trang bị"}`, {
                fontFamily: "Signika", fontSize: "13px",
                color: isActive ? "#2a8b2a" : "#8b5e1a", fontStyle: "italic",
            }).setDepth(5));
        }

        // ── Nút TRANG BỊ ────────────────────────────────────────────
        const btnY = panelY + PANEL_H / 2 - 46;
        const currentCharObj = this.getCurrentCharacter();
        const isCurrentActive = currentCharObj && Number(currentCharObj.is_active_character) === 1;

        this._buildActionBtn(leftCX, btnY, 180, 42,
            isCurrentActive ? "✓ Đang Trang Bị" : "⚔️ Trang Bị",
            isCurrentActive ? 0x3a8a3a : 0xd4a030,
            isCurrentActive ? 0x1a5a1a : 0x8a5e10,
            async () => {
                if (isCurrentActive) {
                    this.showToast("Nhân vật đã được trang bị rồi!");
                    return;
                }
                if (this.playerUserId && this.selectedCharId) {
                    try {
                        await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/active`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ character_id: this.selectedCharId }),
                        });
                        // Cập nhật local state
                        this.myCharacters.forEach(c => {
                            c.is_active_character = (Number(c.character_id) === Number(this.selectedCharId)) ? 1 : 0;
                        });
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

    // ═══════════════════════════════════════════════════════════════
    //  TABS: Nhân Vật | Trang Phục | Phông Nền
    // ═══════════════════════════════════════════════════════════════
    buildTabs() {
        this._tabBtnObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._tabBtnObjs = [];
        const push = o => { this._tabBtnObjs.push(o); return o; };

        const { rightCX, panelY, RIGHT_W, PANEL_H } = this._layout;
        const top     = panelY - PANEL_H / 2;
        const TAB_H   = 36;
        const TAB_Y   = top + 15;

        const tabs = [
            { id: "character",  label: "Nhân Vật"  },
            { id: "skin",       label: "Trang Phục" },
            { id: "background", label: "Phông Nền"  },
        ];

        const TAB_W   = (RIGHT_W - 24) / tabs.length;
        const startX  = rightCX - RIGHT_W / 2 + 12;

        tabs.forEach((tab, i) => {
            const tx = startX + 2 + i * TAB_W + TAB_W / 2;

            const bg = push(this.add.graphics().setDepth(8));
            const drawTab = (active) => {
                bg.clear();
                if (active) {
                    bg.fillStyle(0xd4a030, 1);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                    bg.fillStyle(0xfff5b0, 0.38);
                    bg.fillRoundedRect(tx - TAB_W / 2 + 4, TAB_Y + 3, TAB_W - 12, TAB_H * 0.45, 8);
                    bg.lineStyle(2.5, 0x8b5e1a, 1);
                    bg.strokeRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                } else {
                    bg.fillStyle(0xc8a060, 0.22);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                    bg.lineStyle(1.5, 0xc8a060, 0.45);
                    bg.strokeRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                }
            };
            drawTab(this.activeTab === tab.id);

            const txt = push(this.add.text(tx - 2, TAB_Y + TAB_H / 2, tab.label, {
                fontFamily: "Signika",
                fontSize: this.activeTab === tab.id ? "15px" : "13px",
                color: this.activeTab === tab.id ? "#4a2000" : "#9b7040",
                fontStyle: "bold",
            }).setOrigin(0.5).setDepth(9));

            const zone = push(this.add.zone(tx - 2, TAB_Y + TAB_H / 2, TAB_W - 4, TAB_H)
                .setInteractive({ useHandCursor: true }).setDepth(10));

            zone.on("pointerover", () => {
                if (this.activeTab !== tab.id) {
                    bg.clear();
                    bg.fillStyle(0xc8a060, 0.40);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                }
            });
            zone.on("pointerout", () => drawTab(this.activeTab === tab.id));
            zone.on("pointerup", async () => {
                if (this.activeTab === tab.id) return;

                this.activeTab = tab.id;

                if (tab.id === "skin") {
                    this.ensureSelectedCharacter();
                    await this.loadSkinsForCharacter(this.selectedCharId);
                }

                this.buildTabs();
                this.renderRightPanel();
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL PHẢI — Grid item theo tab
    // ═══════════════════════════════════════════════════════════════
    renderRightPanel() {
        this._rightObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._rightObjs = [];
        if (this._gridContainer) { this._gridContainer.destroy(); this._gridContainer = null; }

        const { rightCX, panelY, RIGHT_W, PANEL_H } = this._layout;

        const top    = panelY - PANEL_H / 2 + 58;
        const GRID_H = PANEL_H - 76;
        const push   = o => { this._rightObjs.push(o); return o; };

        if (this.activeTab === "skin") {
            this.ensureSelectedCharacter();
        }

        let items = [];

        // ── Tab Nhân Vật ─────────────────────────────────────────
        if (this.activeTab === "character") {
            items = this.myCharacters.map(c => {
                const skinNum = c.active_skin_number || 1;
                const isActive = Number(c.is_active_character) === 1;
                return {
                    id: c.character_id,
                    type: "character",
                    imgKey: `bag_${c.name}_${skinNum}_idle_000`,
                    label: c.name || `Nhân vật ${c.character_id}`,
                    isActive,
                    skinNum,
                    charName: c.name
                };
            });
        }

        // ── Tab Trang Phục ───────────────────────────────────────
        if (this.activeTab === "skin") {
            const currentChar = this.getCurrentCharacter();
            const charName = currentChar?.name || "";

            if (this.mySkins.length > 0) {
                // Hiển thị skin từ server (user_skins)
                items = this.mySkins.map(s => {
                    const skinNum = s.skin_number || 1;
                    const isActive = Number(s.is_active) === 1;
                    return {
                        id: s.skin_id,
                        type: "skin",
                        imgKey: `bag_${charName}_${skinNum}_idle_000`,
                        label: this._getSkinLabel(skinNum),
                        isActive,
                        skinNum,
                        skinId: s.skin_id,
                        charName
                    };
                });
            } else {
                // Fallback: nếu chưa có data skin từ server, hiện 3 skin mặc định
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
                        locked: !hasTexture
                    });
                }
            }
        }

        // ── Tab Phông Nền ────────────────────────────────────────
        if (this.activeTab === "background") {
            items = this.myBackgrounds.map(b => ({
                id: b.bg_id,
                type: "background",
                imgKey: `bg_${b.bg_id}`,
                label: `Phông nền ${b.bg_id}`
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
        const PAD_X  = 26;
        const PAD_Y  = 22;
        const GAP_X  = 16;
        const GAP_Y  = 16;

        const availW = RIGHT_W - PAD_X * 2;
        const CARD_W = Math.min(132, (availW - GAP_X * (Math.min(COLS, 4) - 1)) / Math.min(COLS, 4));
        const CARD_H = Math.floor(CARD_W * 1.30);

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
        this._gridContainer.x = gridStartX;

        const maskShape = this.make.graphics();
        maskShape.fillRoundedRect(
            rightCX - RIGHT_W / 2 + 18,
            top + 6,
            RIGHT_W - 36,
            GRID_H - 12,
            16
        );
        this._gridContainer.setMask(maskShape.createGeometryMask());

        this._setupDrag(rightCX, RIGHT_W, top, GRID_H);
    }

    // ═══════════════════════════════════════════════════════════════
    //  THẺ ITEM — Card nhân vật / trang phục / phông nền
    // ═══════════════════════════════════════════════════════════════
    _buildItemCard(x, y, w, h, item) {
        const container = this.add.container(x, y);
        const r = 10;
        const isActive = !!item.isActive ||
            (item.type === "character" && Number(item.id) === Number(this.selectedCharId)) ||
            (item.type === "skin"      && item.skinNum === this.selectedSkinNum) ||
            (item.type === "background" && item.id === this.selectedBgId);
        const isLocked = !!item.locked;

        const bg = this.add.graphics();

        const drawCard = (hover = false) => {
            bg.clear();
            // Bóng
            bg.fillStyle(0x000000, 0.22);
            bg.fillRoundedRect(3, 5, w, h, r);
            // Nền card
            bg.fillStyle(isLocked ? 0x1a1a2a : 0x0d2a4a, 1);
            bg.fillRoundedRect(0, 0, w, h, r);
            // Dải sáng trên
            bg.fillStyle(isLocked ? 0x333355 : 0x1a5090, 0.55);
            bg.fillRoundedRect(0, 0, w, h * 0.45, r);
            // Shine
            bg.fillStyle(0xffffff, hover ? 0.20 : 0.11);
            bg.fillRoundedRect(8, 6, w - 16, h * 0.22, r - 3);
            // Viền
            if (isActive) {
                bg.lineStyle(3, 0xffe030, 1.0);
                bg.strokeRoundedRect(0, 0, w, h, r);
                bg.lineStyle(1.5, 0xffffff, 0.35);
                bg.strokeRoundedRect(3, 3, w - 6, h - 6, r - 2);
            } else if (isLocked) {
                bg.lineStyle(2, 0x444466, 0.6);
                bg.strokeRoundedRect(0, 0, w, h, r);
            } else if (hover) {
                bg.lineStyle(2.5, 0xc8a060, 0.9);
                bg.strokeRoundedRect(0, 0, w, h, r);
            } else {
                bg.lineStyle(2, 0x6a8ab0, 0.6);
                bg.strokeRoundedRect(0, 0, w, h, r);
            }
        };
        drawCard(false);

        // Badge "Đang dùng"
        let badgeObj = null;
        if (isActive) {
            const badgeG = this.add.graphics();
            badgeG.fillStyle(0xd4a030, 1);
            badgeG.fillRoundedRect(w / 2 - 38, 6, 76, 20, 10);
            badgeG.fillStyle(0xfff5b0, 0.38);
            badgeG.fillRoundedRect(w / 2 - 36, 7, 72, 9, 7);
            const badgeTxt = this.add.text(w / 2, 16, "✓ Đang dùng", {
                fontFamily: "Signika", fontSize: "11px", color: "#4a2000", fontStyle: "bold",
            }).setOrigin(0.5);
            badgeObj = this.add.container(0, 0, [badgeG, badgeTxt]);
        }

        // Badge "Chưa mở khóa"
        let lockBadge = null;
        if (isLocked) {
            lockBadge = this.add.text(w / 2, h / 2 - 10, "🔒", {
                fontSize: "28px"
            }).setOrigin(0.5);
        }

        // Ảnh item
        let imgObj = null;
        const imgKey = item.imgKey;
        if (imgKey && this.textures.exists(imgKey)) {
            imgObj = this.add.image(w / 2, h * 0.46, imgKey);
            const scale = Math.min((w - 18) / imgObj.width, (h * 0.58) / imgObj.height);
            imgObj.setScale(scale);
            if (isLocked) imgObj.setAlpha(0.3);
        } else if (!isLocked) {
            imgObj = this.add.text(w / 2, h * 0.46, "🎭", {
                fontFamily: "Signika", fontSize: "38px",
            }).setOrigin(0.5);
        }

        // Tên item
        const labelTxt = this.add.text(w / 2, h - 20, item.label, {
            fontFamily: "Signika", fontSize: "12px",
            color: isActive ? "#ffe066" : isLocked ? "#666688" : "#a8d0f0",
            fontStyle: "bold",
            align: "center",
            wordWrap: { width: w - 10 },
        }).setOrigin(0.5);

        // Glow animation nếu active
        if (isActive) {
            this.tweens.add({
                targets: bg, alpha: { from: 1, to: 0.80 },
                duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });
        }

        const children = [bg];
        if (imgObj)    children.push(imgObj);
        children.push(labelTxt);
        if (badgeObj)  children.push(badgeObj);
        if (lockBadge) children.push(lockBadge);
        container.add(children);

        // Interactive
        if (!isLocked) {
            container.setInteractive(
                new Phaser.Geom.Rectangle(0, 0, w, h),
                Phaser.Geom.Rectangle.Contains
            );
            container.input.cursor = "pointer";

            container.on("pointerover", () => { drawCard(true); this.tweens.add({ targets: container, scaleX: 1.04, scaleY: 1.04, duration: 90 }); });
            container.on("pointerout",  () => { drawCard(false); this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 90 }); });
            container.on("pointerup",   () => {
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
            const res = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/${targetCharId}/skins`);

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

            let needsLoad = false;
            for (const skin of this.mySkins) {
                const skinNum = skin.skin_number || 1;
                for (let i = 0; i < 18; i++) {
                    const num = String(i).padStart(3, "0");
                    const frameKey = `bag_${charName}_${skinNum}_idle_${num}`;
                    if (!this.textures.exists(frameKey)) {
                        this.load.image(frameKey,
                            `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`
                        );
                        needsLoad = true;
                    }
                }
            }

            if (needsLoad) {
                this.load.on('loaderror', () => {});
                await new Promise(resolve => {
                    this.load.once("complete", resolve);
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
        if (item.type === "character") {
            this.selectedCharId = item.id;

            const currentChar = this.getCurrentCharacter();
            this.selectedSkinNum = currentChar?.active_skin_number || 1;
            this.selectedSkinId = currentChar?.active_skin_id || null;

            // Load sprites cho nhân vật mới chọn (tất cả skin)
            await this._loadCharacterSprites();
            this._createAllBagAnimations();

            if (this.activeTab === "skin") {
                await this.loadSkinsForCharacter(item.id);
            }

            this.buildLeftPanel();
            this.renderRightPanel();

        } else if (item.type === "skin") {
            this.selectedSkinNum = item.skinNum;
            this.selectedSkinId = item.skinId || item.id;

            const currentChar = this.getCurrentCharacter();
            if (currentChar) {
                currentChar.active_skin_number = item.skinNum;
                currentChar.active_skin_id = item.skinId || item.id;
            }

            // Tải và tạo animation cho skin mới nếu chưa có
            const charName = item.charName || currentChar?.name;
            const animKey = `bag_${charName}_${item.skinNum}_idle`;
            if (!this.anims.exists(animKey)) {
                await this._loadCharacterSprites();
                this._createAllBagAnimations();
            }

            this.buildLeftPanel();
            this.renderRightPanel();

            // Gọi API cập nhật active skin trên server
            if (this.playerUserId && this.selectedCharId && item.skinId) {
                try {
                    await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/${this.selectedCharId}/skin`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ skin_id: item.skinId }),
                    });
                    
                    if (this.playerData && this.playerData.characters) {
                        let activeChar = this.playerData.characters.find(c => Number(c.id) === Number(this.selectedCharId));
                        if (activeChar) {
                            activeChar.active_skin_number = item.skinNum;
                            activeChar.active_skin_id = item.skinId || item.id;
                        }
                        setPlayerData(this, this.playerData);
                    }
                    
                    this.showToast("✅ Đã đổi trang phục!");
                } catch (e) {
                    console.warn("Save skin failed", e);
                }
            }

        } else if (item.type === "background") {
            this.selectedBgId = item.id;
            this.renderRightPanel();
        }
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
    createStyledPanel(x, y, w, h, radius) {
        const g    = this.add.graphics().setDepth(2);
        const left = x - w / 2;
        const top  = y - h / 2;

        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(left + 5, top + 7, w, h, radius);

        g.fillStyle(0xfff0d0, 1);
        g.fillRoundedRect(left, top, w, h, radius);

        g.fillStyle(0xffffff, 0.4);
        g.fillRoundedRect(left + 4, top + 4, w - 8, h * 0.18, radius);

        g.lineStyle(4, 0x8b5e1a, 1);
        g.strokeRoundedRect(left, top, w, h, radius);

        const inset = 10;
        const r2    = radius - 4;
        this.drawDashedBorder(g, left + inset, top + inset, w - inset * 2, h - inset * 2, r2, 0xc8a060, 2);
        return g;
    }

    drawDashedBorder(g, left, top, w, h, r, color, lw) {
        g.lineStyle(lw, color, 0.75);
        const dash = 10, skip = 7;
        const drawSeg = (x1, y1, x2, y2) => {
            const len = Math.hypot(x2 - x1, y2 - y1);
            const ax  = (x2 - x1) / len;
            const ay  = (y2 - y1) / len;
            for (let d = 0; d < len; d += dash + skip) {
                const end = Math.min(d + dash, len);
                g.beginPath();
                g.moveTo(x1 + ax * d,   y1 + ay * d);
                g.lineTo(x1 + ax * end, y1 + ay * end);
                g.strokePath();
            }
        };
        drawSeg(left + r, top,          left + w - r, top);
        drawSeg(left + w, top + r,      left + w,     top + h - r);
        drawSeg(left + w - r, top + h,  left + r,     top + h);
        drawSeg(left,  top + h - r,     left,         top + r);
        const corners = [
            { a: 180, b: 270, cx: left + r,     cy: top + r     },
            { a: 270, b: 360, cx: left + w - r, cy: top + r     },
            { a: 0,   b: 90,  cx: left + w - r, cy: top + h - r },
            { a: 90,  b: 180, cx: left + r,     cy: top + h - r },
        ];
        corners.forEach(c => {
            g.beginPath();
            g.arc(c.cx, c.cy, r, Phaser.Math.DegToRad(c.a), Phaser.Math.DegToRad(c.b));
            g.strokePath();
        });
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