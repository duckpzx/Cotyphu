export default class BagScene extends Phaser.Scene {
    constructor() {
        super("BagScene");

        // Dữ liệu người chơi
        this.playerData   = null;
        this.playerUserId = null;

        // Tab đang active: "character" | "skin" | "background"
        this.activeTab = "character";

        // Dữ liệu từ server
        this.myCharacters  = [];   // { character_id, active_skin_id, ... }
        this.mySkins       = [];   // { skin_id, ... }
        this.myBackgrounds = [];   // tương lai

        // Character đang preview bên trái
        this.selectedCharId    = null;
        this.selectedSkinId    = null;
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
        try { this.playerData = JSON.parse(localStorage.getItem("playerData")); } catch(e) {}
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;

        // ── Background ───────────────────────────────────────────────
        const bg = this.add.image(width / 2, height / 2, "bag-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Tải dữ liệu từ server ────────────────────────────────────
        await this.loadAllAssets();

        // ── Layout ───────────────────────────────────────────────────
        const GAP        = 20;
        const LEFT_W     = 360;
        const RIGHT_W    = width - LEFT_W - GAP - 40;  // linh hoạt theo màn
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

        try {
            const charRes = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/bag`);
            const charJson = await charRes.json();
            this.myCharacters = charJson.data || [];

            console.log("myCharacters từ server:", JSON.stringify(this.myCharacters, null, 2));
        } catch (e) {
            console.warn("Failed to load characters", e);
            return;
        }

        if (this.myCharacters.length > 0) {
            const activeChar =
                this.myCharacters.find(c => Number(c.is_active_character) === 1) ||
                this.myCharacters.find(c =>
                    Number(c.character_id) === Number(this.playerData?.user?.active_character_id || this.playerData?.active_character_id)
                ) ||
                this.myCharacters[0];

            this.selectedCharId = activeChar?.character_id || null;
            this.selectedSkinId = activeChar?.active_skin_id || null;
        }

        for (const char of this.myCharacters) {
            const charName = char.name;
            const skinNum  = char.active_skin_number || 1;

            const testPath = `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_000.png`;
            console.log("Thử load path:", testPath);

            for (let i = 0; i < 18; i++) {
                const num      = String(i).padStart(3, "0");
                const frameKey = `bag_${charName}_${skinNum}_idle_${num}`;
                if (!this.textures.exists(frameKey)) {
                    this.load.image(
                        frameKey,
                        `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`
                    );
                }
            }
        }

        await new Promise(resolve => {
            this.load.once("complete", resolve);
            this.load.start();
        });

        for (const char of this.myCharacters) {
            const skinNum = char.active_skin_number || 1;
            const key = `bag_${char.name}_${skinNum}_idle_000`;
            console.log(`Texture "${key}" tồn tại:`, this.textures.exists(key));
        }

        this.createBagAnimations();
    }

    createBagAnimations() {
        for (const char of this.myCharacters) {
            const charName = char.name;
            const skinNum  = char.active_skin_number || 1; // chỉ skin đang active

            const animKey = `bag_${charName}_${skinNum}_idle`;
            if (this.anims.exists(animKey)) continue;

            const frames = [];
            for (let i = 0; i < 18; i++) {
                const num = String(i).padStart(3, "0");
                frames.push({ key: `bag_${charName}_${skinNum}_idle_${num}` });
            }
            this.anims.create({
                key: animKey,
                frames,
                frameRate: 10,
                repeat: -1
            });
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
        const skinNum     = currentChar?.active_skin_number || 1;
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
        const playerName = this.playerData?.username || this.playerData?.user?.username || "Người chơi";
        push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H + 16, playerName, {
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

        const activeSkinNumber = Number(currentChar?.active_skin_number || 1);

        const skinLabelMap = {
            1: "Sơ cấp",
            2: "Trung cấp",
            3: "Cao cấp"
        };

        const skinName = skinLabelMap[activeSkinNumber] || "Sơ cấp";

        push(this.add.text(leftCX - LEFT_W / 2 + 20, skinLabelY + 22, skinName, {
            fontFamily: "Signika",
            fontSize: "15px",
            color: "#4a2000",
            fontStyle: "bold",
        }).setDepth(5));

        // ── Nút ĐEO / THÁO (placeholder) ────────────────────────────
        const btnY = panelY + PANEL_H / 2 - 46;
        this._buildActionBtn(leftCX, btnY, 180, 42, "⚔️  Trang Bị", 0xd4a030, 0x8a5e10, () => {
            this.showToast("Đã trang bị!");
        });
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

if (this.activeTab === "character") {
    items = this.myCharacters.map(c => {
        const skinNum = c.active_skin_number || 1;
        return {
            id: c.id,
            type: "character",
            imgKey: `bag_${c.name}_${skinNum}_idle_000`, // ← key đúng
            label: c.name || `Nhân vật ${c.character_id}`,
            activeSkinId: c.active_skin_id
        };
    });
}

        if (this.activeTab === "skin") {
            items = this.mySkins.map(s => ({
                id: s.skin_id,
                type: "skin",
                imgKey: `skin_${s.skin_id}`,
                label: `Skin ${s.skin_number || s.skin_id}`
            }));
        }

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

            push(this.add.text(
                rightCX,
                panelY,
                this.activeTab === "skin"
                    ? `Nhân vật ${currentChar?.name || ""} chưa có trang phục nào`
                    : "Chưa có vật phẩm nào.",
                {
                    fontFamily: "Signika",
                    fontSize: "16px",
                    color: "#9b7040",
                    align: "center"
                }
            ).setOrigin(0.5).setDepth(10));

            return;
        }

        const ROWS   = 2;
        const COLS   = Math.ceil(items.length / ROWS);

        // tăng khoảng cách viền trong
        const PAD_X  = 26;
        const PAD_Y  = 22;

        // tăng khoảng cách giữa các card
        const GAP_X  = 16;
        const GAP_Y  = 16;

        const availW = RIGHT_W - PAD_X * 2;
        const availH = GRID_H  - PAD_Y * 2;

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
        const isActive = (item.type === "character" && item.id === this.selectedCharId)
                      || (item.type === "skin"      && item.id === this.selectedSkinId)
                      || (item.type === "background"&& item.id === this.selectedBgId);

        const bg = this.add.graphics();

        const drawCard = (hover = false) => {
            bg.clear();
            // Bóng
            bg.fillStyle(0x000000, 0.22);
            bg.fillRoundedRect(3, 5, w, h, r);
            // Nền card — màu xanh navy như TarotScene
            bg.fillStyle(0x0d2a4a, 1);
            bg.fillRoundedRect(0, 0, w, h, r);
            // Dải sáng trên
            bg.fillStyle(0x1a5090, 0.55);
            bg.fillRoundedRect(0, 0, w, h * 0.45, r);
            // Shine
            bg.fillStyle(0xffffff, hover ? 0.20 : 0.11);
            bg.fillRoundedRect(8, 6, w - 16, h * 0.22, r - 3);
            // Viền: nếu active — vàng sáng; bình thường — vàng nâu
            if (isActive) {
                bg.lineStyle(3, 0xffe030, 1.0);
                bg.strokeRoundedRect(0, 0, w, h, r);
                bg.lineStyle(1.5, 0xffffff, 0.35);
                bg.strokeRoundedRect(3, 3, w - 6, h - 6, r - 2);
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

        // Ảnh item
        let imgObj = null;
        const imgKey = item.imgKey;
        if (this.textures.exists(imgKey)) {
            imgObj = this.add.image(w / 2, h * 0.46, imgKey);
            const scale = Math.min((w - 18) / imgObj.width, (h * 0.58) / imgObj.height);
            imgObj.setScale(scale);
        } else {
            imgObj = this.add.text(w / 2, h * 0.46, "🎭", {
                fontFamily: "Signika", fontSize: "38px",
            }).setOrigin(0.5);
        }

        // Tên item — cắt ngắn nếu dài
        const labelTxt = this.add.text(w / 2, h - 20, item.label, {
            fontFamily: "Signika", fontSize: "12px",
            color: isActive ? "#ffe066" : "#a8d0f0",
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

        const children = [bg, imgObj, labelTxt];
        if (badgeObj) children.push(badgeObj);
        container.add(children);

        // Interactive
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

        return container;
    }

    async loadSkinsForCharacter(characterId = null) {
        const targetCharId = Number(characterId || this.selectedCharId);
        if (!this.playerUserId || !targetCharId) return;

        try {
            const res = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/${targetCharId}/skins`);
            
            if (!res.ok) {
                this.mySkins = []; // Nếu server lỗi, gán mảng rỗng để không crash
                return;
            }

            const json = await res.json();
            // Kiểm tra chắc chắn json.data là mảng
            this.mySkins = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);

            let needsLoad = false;
            this.mySkins.forEach(s => {
                const key = `skin_${s.skin_id}`;
                if (!this.textures.exists(key)) {
                    this.load.image(key, `assets/skins/${s.skin_id}/thumb.png`);
                    needsLoad = true;
                }
            });

            if (needsLoad) {
                this.load.start();
            }
        } catch (e) {
            console.warn("Failed to load skins", e);
            this.mySkins = [];
        }
    }

    async loadSkinsForSelectedCharacter() {
        if (!this.playerUserId || !this.selectedCharId) {
            this.mySkins = [];
            return;
        }

        try {
            const res = await fetch(
                `http://localhost:3000/users/${this.playerUserId}/characters/${this.selectedCharId}/skins`
            );

            if (!res.ok) {
                const raw = await res.text();
                console.error("Skin API lỗi:", res.status, raw);
                this.mySkins = [];
                return;
            }

            const json = await res.json();
            this.mySkins = json.data || [];

            // preload ảnh skin thumbnail
            this.mySkins.forEach(s => {
                const key = `skin_${s.skin_id}`;
                if (!this.textures.exists(key)) {
                    this.load.image(key, `assets/skins/${s.skin_id}/thumb.png`);
                }
            });

            await new Promise(resolve => {
                this.load.once("complete", resolve);
                this.load.start();
            });

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
            this.selectedSkinId = currentChar?.active_skin_id || null;

            if (this.activeTab === "skin") {
                await this.loadSkinsForCharacter(item.id);
            }

            this.buildLeftPanel();
            this.renderRightPanel();

            if (this.playerUserId) {
                try {
                    await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/active`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ character_id: item.id }),
                    });
                } catch (e) {
                    console.warn("Save character failed", e);
                }
            }
        } else if (item.type === "skin") {
            this.selectedSkinId = item.id;   // id có thể là skin_number
            const currentChar = this.getCurrentCharacter();
            if (currentChar) {
                currentChar.active_skin_id = item.id;
            }
            this.buildLeftPanel();     // ← sẽ tạo sprite mới với skin vừa chọn
            this.renderRightPanel();

            // Gọi API cập nhật active skin trên server
            if (this.playerUserId && this.selectedCharId) {
                await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/${this.selectedCharId}/skin`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ skin_id: item.id }),
                });
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

    getCurrentCharacter() {
        if (!this.selectedCharId) return null;
        return this.myCharacters.find(c => Number(c.character_id) === Number(this.selectedCharId)) || null;
    }

    getSkinsOfSelectedCharacter() {
        const currentChar = this.getCurrentCharacter();
        return currentChar?.skins || [];
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
            this.selectedSkinId = currentChar.active_skin_id || currentChar.active_skin_number || null;
        }
    }
}