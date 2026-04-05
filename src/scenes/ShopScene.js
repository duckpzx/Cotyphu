// src/scenes/ShopScene.js
export default class ShopScene extends Phaser.Scene {
    constructor() {
        super("ShopScene");

        this.playerData   = null;
        this.playerUserId = null;

        this.activeTab = "character";  // "character" | "skin" | "background"

        // ── Dữ liệu shop (tất cả item trong game) ──
        this.allCharacters  = [];   // { id, name, description, skin_number, image }
        this.allSkins       = [];   // [{ skin_number: 1 }, { skin_number: 2 }, ...]  per-character
        this.allBackgrounds = [];   // tương lai

        // ── Dữ liệu sở hữu ──
        this.ownedCharacters = [];  // { character_id, ... }
        this.ownedSkins      = [];  // { skin_id, ... }
        this.ownedBgIds      = [];

        // ── Tiền ──
        this.playerEcoin = 0;

        // ── Item đang chọn preview ──
        this.selectedItem    = null;

        // ── UI objects ──
        this._rightObjs     = [];
        this._previewObjs   = [];
        this._tabBtnObjs    = [];
        this._headerObjs    = [];

        // ── Drag scroll ──
        this._gridContainer = null;
        this._isDragging    = false;
        this._dragX         = 0;
        this._dragMoved     = false;
        this._velocityX     = 0;
        this._minX          = 0;
        this._maxX          = 0;
    }

    preload() {
        this.load.image("shop-bg",   "assets/ui/nen_chung.png");
        this.load.image("out",       "assets/ui/shared/return.png");
        this.load.image("coin",      "assets/ui/shared/coin.png");
    }

    async create() {
        const { width, height } = this.scale;

        try { this.playerData = JSON.parse(localStorage.getItem("playerData")); } catch(e) {}
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;
        this.playerEcoin  = Number(this.playerData?.user?.ecoin ?? 0);

        // ── Background ──
        const bg = this.add.image(width / 2, height / 2, "shop-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Tải dữ liệu ──
        await this._loadShopData();

        // ── Layout ──
        const GAP     = 20;
        const LEFT_W  = 360;
        const RIGHT_W = width - LEFT_W - GAP - 40;
        const PANEL_H = height - 100;
        const START_X = 20;

        const leftCX  = START_X + LEFT_W / 2;
        const rightCX = START_X + LEFT_W + GAP + RIGHT_W / 2;
        const panelY  = height / 2 + 10;

        this.createStyledPanel(leftCX,  panelY, LEFT_W,  PANEL_H, 22);
        this.createStyledPanel(rightCX, panelY, RIGHT_W, PANEL_H, 22);

        this._layout = { leftCX, rightCX, panelY, LEFT_W, RIGHT_W, PANEL_H, GAP };

        // ── Header: Ecoin bar ──
        this._buildEcoinHeader();

        // ── Chọn item đầu tiên ──
        this._autoSelectFirst();

        // ── Build UI ──
        this.buildLeftPanel();
        this.buildTabs();
        this.renderRightPanel();

        // ── Nút Back ──
        const backBtn = this.add.image(36, 36, "out")
            .setScale(0.9).setDepth(200)
            .setInteractive({ cursor: "pointer" });
        backBtn.on("pointerover", () => backBtn.setTint(0xdddddd));
        backBtn.on("pointerout",  () => backBtn.clearTint());
        backBtn.on("pointerup",   () => {
            this.cameras.main.fadeOut(200);
            this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
        });

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
    //  LOAD DATA
    // ═══════════════════════════════════════════════════════════════

    async _loadShopData() {
        // 1) Load tất cả nhân vật trong game
        try {
            const res = await fetch("http://localhost:3000/characters");
            const json = await res.json();
            this.allCharacters = json.characters || [];
        } catch(e) {
            console.warn("Shop: Failed to load characters", e);
        }

        // 2) Load nhân vật đã sở hữu
        if (this.playerUserId) {
            try {
                const res = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/bag`);
                const json = await res.json();
                this.ownedCharacters = json.data || [];
            } catch(e) {
                console.warn("Shop: Failed to load owned characters", e);
            }
        }

        // 3) Load skins sở hữu (từ login data)
        this.ownedSkins = this.playerData?.skins || [];

        // 4) Tạo static pricing cho nhân vật
        const CHAR_PRICES = {
            1: 0,       // Dark_Oracle — miễn phí (starter)
            2: 15000,   // Forest_Ranger
            3: 25000,   // Golem
            4: 25000,   // Minotaur
            5: 0,       // Necromancer_of_the_Shadow (có thể free starter)
            7: 35000,   // Reaper_Man
            8: 10000,   // Zombie_Villager
        };
        this.allCharacters.forEach(c => {
            c.price = CHAR_PRICES[c.id] ?? 20000;
        });

        // 5) Load sprite idle frames cho tất cả nhân vật
        await this._loadAllCharacterSprites();
    }

    async _loadAllCharacterSprites() {
        let needsLoad = false;

        for (const char of this.allCharacters) {
            const charName = char.name;
            if (!charName) continue;

            const skinNum = char.skin_number || 1;
            for (let i = 0; i < 18; i++) {
                const num = String(i).padStart(3, "0");
                const frameKey = `shop_${charName}_${skinNum}_idle_${num}`;
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
        }

        // Tạo animation
        for (const char of this.allCharacters) {
            const charName = char.name;
            const skinNum = char.skin_number || 1;
            const animKey = `shop_${charName}_${skinNum}_idle`;
            if (this.anims.exists(animKey)) continue;

            const firstFrame = `shop_${charName}_${skinNum}_idle_000`;
            if (!this.textures.exists(firstFrame)) continue;

            const frames = [];
            for (let i = 0; i < 18; i++) {
                const num = String(i).padStart(3, "0");
                const key = `shop_${charName}_${skinNum}_idle_${num}`;
                if (this.textures.exists(key)) frames.push({ key });
            }
            if (frames.length > 0) {
                this.anims.create({ key: animKey, frames, frameRate: 10, repeat: -1 });
            }
        }
    }

    /**
     * Load thêm skin sprites cho một character cụ thể
     */
    async _loadSkinSprites(charName, skinNum) {
        let needsLoad = false;
        for (let i = 0; i < 18; i++) {
            const num = String(i).padStart(3, "0");
            const frameKey = `shop_${charName}_${skinNum}_idle_${num}`;
            if (!this.textures.exists(frameKey)) {
                this.load.image(frameKey,
                    `assets/characters/${charName}/${charName}_${skinNum}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`
                );
                needsLoad = true;
            }
        }
        if (needsLoad) {
            this.load.on('loaderror', () => {});
            await new Promise(resolve => {
                this.load.once("complete", resolve);
                this.load.start();
            });
        }

        const animKey = `shop_${charName}_${skinNum}_idle`;
        if (!this.anims.exists(animKey)) {
            const firstFrame = `shop_${charName}_${skinNum}_idle_000`;
            if (this.textures.exists(firstFrame)) {
                const frames = [];
                for (let i = 0; i < 18; i++) {
                    const num = String(i).padStart(3, "0");
                    const key = `shop_${charName}_${skinNum}_idle_${num}`;
                    if (this.textures.exists(key)) frames.push({ key });
                }
                if (frames.length) this.anims.create({ key: animKey, frames, frameRate: 10, repeat: -1 });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS — ownership / status
    // ═══════════════════════════════════════════════════════════════

    _isCharOwned(charId) {
        return this.ownedCharacters.some(c => Number(c.character_id) === Number(charId));
    }

    _isCharActive(charId) {
        const activeId = this.playerData?.user?.active_character_id;
        return Number(activeId) === Number(charId);
    }

    _getActiveCharId() {
        return Number(this.playerData?.user?.active_character_id || 0);
    }

    _autoSelectFirst() {
        if (this.activeTab === "character" && this.allCharacters.length > 0) {
            const c = this.allCharacters[0];
            this.selectedItem = {
                id: c.id, type: "character", name: c.name, description: c.description,
                price: c.price, skinNum: c.skin_number || 1, charName: c.name
            };
        }
    }

    _formatMoney(v) {
        return Number(v || 0).toLocaleString("vi-VN");
    }

    // ═══════════════════════════════════════════════════════════════
    //  ECOIN HEADER
    // ═══════════════════════════════════════════════════════════════

    _buildEcoinHeader() {
        const { width } = this.scale;
        this._headerObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._headerObjs = [];
        const push = o => { this._headerObjs.push(o); return o; };

        // Ecoin badge ở góc trên phải
        const badgeW = 200, badgeH = 36;
        const bx = width - 30 - badgeW / 2;
        const by = 28;

        const hg = push(this.add.graphics().setDepth(100));
        hg.fillStyle(0x1a0e00, 0.75);
        hg.fillRoundedRect(bx - badgeW / 2, by - badgeH / 2, badgeW, badgeH, badgeH / 2);
        hg.lineStyle(2, 0xd4a030, 0.9);
        hg.strokeRoundedRect(bx - badgeW / 2, by - badgeH / 2, badgeW, badgeH, badgeH / 2);

        const coinIcon = push(this.add.image(bx - badgeW / 2 + 22, by, "coin")
            .setDisplaySize(28, 28).setDepth(101));

        this._ecoinText = push(this.add.text(bx + 10, by, this._formatMoney(this.playerEcoin), {
            fontFamily: "Signika", fontSize: "16px",
            color: "#ffe066", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(101));
    }

    _refreshEcoinUI() {
        if (this._ecoinText) {
            this._ecoinText.setText(this._formatMoney(this.playerEcoin));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEFT PANEL — Preview + Actions
    // ═══════════════════════════════════════════════════════════════

    buildLeftPanel() {
        const { leftCX, panelY, LEFT_W, PANEL_H } = this._layout;
        this._previewObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._previewObjs = [];
        const push = o => { this._previewObjs.push(o); return o; };

        const top = panelY - PANEL_H / 2;

        // ── Tiêu đề "CỬA HÀNG" ──
        const titleBg = push(this.add.graphics().setDepth(5));
        titleBg.fillStyle(0xd4a030, 1);
        titleBg.fillRoundedRect(leftCX - 80, top + 14, 160, 34, 17);
        titleBg.fillStyle(0xfff5b0, 0.40);
        titleBg.fillRoundedRect(leftCX - 78, top + 15, 156, 14, 12);
        titleBg.lineStyle(2.5, 0x8b5e1a, 1);
        titleBg.strokeRoundedRect(leftCX - 80, top + 14, 160, 34, 17);

        push(this.add.text(leftCX, top + 31, "CỬA HÀNG", {
            fontFamily: "Signika", fontSize: "18px",
            color: "#4a2000", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(6));

        const item = this.selectedItem;
        if (!item) {
            push(this.add.text(leftCX, panelY, "Chọn một vật phẩm\ntừ bên phải", {
                fontFamily: "Signika", fontSize: "16px",
                color: "#9b7040", align: "center",
            }).setOrigin(0.5).setDepth(5));
            return;
        }

        // ── Khung preview ──
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

        // ── Sprite preview ──
        const charName = item.charName || item.name || "";
        const skinNum  = item.skinNum || 1;
        const animKey  = `shop_${charName}_${skinNum}_idle`;
        const frame0   = `shop_${charName}_${skinNum}_idle_000`;

        if (charName && this.textures.exists(frame0)) {
            const sprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2, frame0));
            const scale  = Math.min((PREVIEW_W - 20) / sprite.width, (PREVIEW_H - 20) / sprite.height);
            sprite.setScale(scale).setDepth(5);
            if (this.anims.exists(animKey)) sprite.play(animKey);

            this.tweens.add({
                targets: sprite, y: sprite.y - 6,
                duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });
        } else {
            push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H / 2, "👤", {
                fontSize: "56px",
            }).setOrigin(0.5).setDepth(5));
        }

        // ── Tên item ──
        const displayName = this._getDisplayName(charName);
        push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H + 18, displayName, {
            fontFamily: "Signika", fontSize: "20px",
            color: "#5c3300", fontStyle: "bold",
            stroke: "#f5dfa0", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(5));

        // ── Divider ──
        const divY = PREVIEW_Y + PREVIEW_H + 42;
        const dg = push(this.add.graphics().setDepth(5));
        dg.lineStyle(1.5, 0xc8a060, 0.6);
        dg.lineBetween(leftCX - LEFT_W / 2 + 20, divY, leftCX + LEFT_W / 2 - 20, divY);

        // ── Giá tiền ──
        const infoStartY = divY + 16;
        const isOwned  = this._isItemOwned(item);
        const isActive = this._isItemActive(item);
        const price    = item.price || 0;

        // Icon coin + giá
        if (!isOwned && price > 0) {
            const coinI = push(this.add.image(leftCX - 50, infoStartY + 12, "coin")
                .setDisplaySize(24, 24).setDepth(5));
            push(this.add.text(leftCX - 34, infoStartY + 12, this._formatMoney(price), {
                fontFamily: "Signika", fontSize: "17px",
                color: "#ffe066", fontStyle: "bold",
                stroke: "#3a1a00", strokeThickness: 2,
            }).setOrigin(0, 0.5).setDepth(5));
        } else if (!isOwned && price === 0) {
            push(this.add.text(leftCX, infoStartY + 12, "✨ Miễn phí", {
                fontFamily: "Signika", fontSize: "17px",
                color: "#44bb44", fontStyle: "bold",
            }).setOrigin(0.5).setDepth(5));
        } else {
            push(this.add.text(leftCX, infoStartY + 12, "✓ Đã sở hữu", {
                fontFamily: "Signika", fontSize: "16px",
                color: "#2a8b2a", fontStyle: "bold",
            }).setOrigin(0.5).setDepth(5));
        }

        // ── Mô tả ──
        if (item.description) {
            push(this.add.text(leftCX, infoStartY + 42, item.description, {
                fontFamily: "Signika", fontSize: "12px",
                color: "#8b6e3a", fontStyle: "italic",
                align: "center",
                wordWrap: { width: LEFT_W - 60 },
                lineSpacing: 4,
            }).setOrigin(0.5, 0).setDepth(5));
        }

        // ── Nút hành động ──
        const btnY = panelY + PANEL_H / 2 - 46;

        if (isActive) {
            this._buildActionBtn(push, leftCX, btnY, 200, 44, "✓ Đang Sử Dụng", 0x3a8a3a, 0x1a5a1a, null, true);
        } else if (isOwned) {
            this._buildActionBtn(push, leftCX, btnY, 200, 44, "🎮 Sử Dụng", 0x2266cc, 0x1a3a8a, async () => {
                await this._equipItem(item);
            });
        } else {
            const canAfford = this.playerEcoin >= price;
            const btnLabel = price === 0 ? "🎁 Nhận Miễn Phí" : `💰 Mua — ${this._formatMoney(price)}`;
            this._buildActionBtn(push, leftCX, btnY, 220, 44, btnLabel,
                canAfford ? 0xd4a030 : 0x888888,
                canAfford ? 0x8a5e10 : 0x555555,
                async () => {
                    if (!canAfford && price > 0) {
                        this.showToast("❌ Không đủ Ecoin!");
                        return;
                    }
                    await this._buyItem(item);
                }
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  TABS
    // ═══════════════════════════════════════════════════════════════

    buildTabs() {
        this._tabBtnObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._tabBtnObjs = [];
        const push = o => { this._tabBtnObjs.push(o); return o; };

        const { rightCX, panelY, RIGHT_W, PANEL_H } = this._layout;
        const top   = panelY - PANEL_H / 2;
        const TAB_H = 36;
        const TAB_Y = top + 15;

        const tabs = [
            { id: "character",  label: "Nhân Vật",    icon: "⚔" },
            { id: "skin",       label: "Trang Phục",  icon: "👔" },
            { id: "background", label: "Phông Nền",   icon: "🖼" },
        ];

        const TAB_W  = (RIGHT_W - 24) / tabs.length;
        const startX = rightCX - RIGHT_W / 2 + 12;

        tabs.forEach((tab, i) => {
            const tx = startX + 2 + i * TAB_W + TAB_W / 2;
            const isActive = this.activeTab === tab.id;

            const bg = push(this.add.graphics().setDepth(8));
            const drawTab = (active, hover = false) => {
                bg.clear();
                if (active) {
                    bg.fillStyle(0xd4a030, 1);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                    bg.fillStyle(0xfff5b0, 0.38);
                    bg.fillRoundedRect(tx - TAB_W / 2 + 4, TAB_Y + 3, TAB_W - 12, TAB_H * 0.45, 8);
                    bg.lineStyle(2.5, 0x8b5e1a, 1);
                    bg.strokeRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                } else if (hover) {
                    bg.fillStyle(0xc8a060, 0.40);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                    bg.lineStyle(1.5, 0xc8a060, 0.55);
                    bg.strokeRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                } else {
                    bg.fillStyle(0xc8a060, 0.22);
                    bg.fillRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                    bg.lineStyle(1.5, 0xc8a060, 0.45);
                    bg.strokeRoundedRect(tx - TAB_W / 2, TAB_Y, TAB_W - 4, TAB_H, 12);
                }
            };
            drawTab(isActive);

            const label = `${tab.icon}  ${tab.label}`;
            const txt = push(this.add.text(tx - 2, TAB_Y + TAB_H / 2, label, {
                fontFamily: "Signika",
                fontSize: isActive ? "14px" : "13px",
                color: isActive ? "#4a2000" : "#9b7040",
                fontStyle: "bold",
            }).setOrigin(0.5).setDepth(9));

            const zone = push(this.add.zone(tx - 2, TAB_Y + TAB_H / 2, TAB_W - 4, TAB_H)
                .setInteractive({ useHandCursor: true }).setDepth(10));

            zone.on("pointerover", () => { if (this.activeTab !== tab.id) drawTab(false, true); });
            zone.on("pointerout",  () => drawTab(this.activeTab === tab.id));
            zone.on("pointerup",   () => {
                if (this.activeTab === tab.id) return;
                this.activeTab = tab.id;
                this._autoSelectFirstForTab();
                this.buildTabs();
                this.buildLeftPanel();
                this.renderRightPanel();
            });
        });
    }

    _autoSelectFirstForTab() {
        if (this.activeTab === "character" && this.allCharacters.length > 0) {
            const c = this.allCharacters[0];
            this.selectedItem = {
                id: c.id, type: "character", name: c.name, description: c.description,
                price: c.price, skinNum: c.skin_number || 1, charName: c.name
            };
        } else if (this.activeTab === "skin") {
            // Skins for all characters
            const items = this._buildSkinItems();
            if (items.length > 0) {
                this.selectedItem = items[0];
            } else {
                this.selectedItem = null;
            }
        } else if (this.activeTab === "background") {
            this.selectedItem = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  RIGHT PANEL — Item Grid
    // ═══════════════════════════════════════════════════════════════

    renderRightPanel() {
        this._rightObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._rightObjs = [];
        if (this._gridContainer) { this._gridContainer.destroy(); this._gridContainer = null; }

        const { rightCX, panelY, RIGHT_W, PANEL_H } = this._layout;
        const top    = panelY - PANEL_H / 2 + 58;
        const GRID_H = PANEL_H - 76;
        const push   = o => { this._rightObjs.push(o); return o; };

        let items = [];

        if (this.activeTab === "character") {
            items = this.allCharacters.map(c => ({
                id: c.id, type: "character", charName: c.name, name: c.name,
                description: c.description, price: c.price,
                skinNum: c.skin_number || 1,
                imgKey: `shop_${c.name}_${c.skin_number || 1}_idle_000`,
                isOwned: this._isCharOwned(c.id),
                isActive: this._isCharActive(c.id),
            }));
        } else if (this.activeTab === "skin") {
            items = this._buildSkinItems();
        } else if (this.activeTab === "background") {
            items = [];
        }

        if (items.length === 0) {
            push(this.add.text(rightCX, panelY, "Sắp ra mắt...", {
                fontFamily: "Signika", fontSize: "16px",
                color: "#9b7040", align: "center"
            }).setOrigin(0.5).setDepth(10));
            return;
        }

        const ROWS  = 2;
        const COLS  = Math.ceil(items.length / ROWS);
        const PAD_X = 26, PAD_Y = 22, GAP_X = 16, GAP_Y = 16;
        const availW = RIGHT_W - PAD_X * 2;
        const CARD_W = Math.min(142, (availW - GAP_X * (Math.min(COLS, 4) - 1)) / Math.min(COLS, 4));
        const CARD_H = Math.floor(CARD_W * 1.35);

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

        this._minX = gridStartX;
        this._maxX = Math.min(gridStartX, gridStartX - (totalW - (RIGHT_W - PAD_X * 2)));
        this._velocityX = 0;
        this._gridContainer.x = gridStartX;

        const maskShape = this.make.graphics();
        maskShape.fillRoundedRect(
            rightCX - RIGHT_W / 2 + 18, top + 6,
            RIGHT_W - 36, GRID_H - 12, 16
        );
        this._gridContainer.setMask(maskShape.createGeometryMask());
        this._setupDrag(rightCX, RIGHT_W, top, GRID_H);
    }

    _buildSkinItems() {
        const items = [];
        const SKIN_PRICES = { 1: 0, 2: 15000, 3: 35000 };
        const SKIN_LABELS = { 1: "Sơ cấp", 2: "Trung cấp", 3: "Cao cấp" };

        for (const char of this.allCharacters) {
            for (let skinNum = 1; skinNum <= 3; skinNum++) {
                const frameKey = `shop_${char.name}_${skinNum}_idle_000`;
                const isOwnedChar = this._isCharOwned(char.id);
                // Skin 1 = default, sở hữu nếu đã có nhân vật
                const isOwnedSkin = skinNum === 1 ? isOwnedChar :
                    this.ownedSkins.some(s => Number(s.skin_id) === this._getSkinId(char.id, skinNum));

                items.push({
                    id: `${char.id}_${skinNum}`,
                    type: "skin",
                    charName: char.name,
                    name: `${char.name}`,
                    skinNum,
                    description: `${SKIN_LABELS[skinNum]} — ${this._getDisplayName(char.name)}`,
                    price: SKIN_PRICES[skinNum] ?? 15000,
                    imgKey: frameKey,
                    isOwned: isOwnedSkin,
                    isActive: false,
                    charId: char.id,
                    label: `${SKIN_LABELS[skinNum]}`
                });
            }
        }
        return items;
    }

    _getSkinId(charId, skinNum) {
        // Tạm tính skin_id dựa trên pattern: (charId - 1) * 3 + skinNum
        // Cần điều chỉnh theo DB thực tế
        return (charId - 1) * 3 + skinNum;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ITEM CARD
    // ═══════════════════════════════════════════════════════════════

    _buildItemCard(x, y, w, h, item) {
        const container = this.add.container(x, y);
        const r = 10;
        const isSelected = this.selectedItem &&
            this.selectedItem.id === item.id &&
            this.selectedItem.type === item.type;

        const bg = this.add.graphics();

        const drawCard = (hover = false) => {
            bg.clear();
            bg.fillStyle(0x000000, 0.22);
            bg.fillRoundedRect(3, 5, w, h, r);

            bg.fillStyle(item.isOwned ? 0x0d2a4a : 0x1a1a2e, 1);
            bg.fillRoundedRect(0, 0, w, h, r);
            bg.fillStyle(item.isOwned ? 0x1a5090 : 0x2a2a44, 0.55);
            bg.fillRoundedRect(0, 0, w, h * 0.45, r);
            bg.fillStyle(0xffffff, hover ? 0.20 : 0.11);
            bg.fillRoundedRect(8, 6, w - 16, h * 0.22, r - 3);

            if (isSelected) {
                bg.lineStyle(3, 0xffe030, 1.0);
                bg.strokeRoundedRect(0, 0, w, h, r);
                bg.lineStyle(1.5, 0xffffff, 0.35);
                bg.strokeRoundedRect(3, 3, w - 6, h - 6, r - 2);
            } else if (hover) {
                bg.lineStyle(2.5, 0xc8a060, 0.9);
                bg.strokeRoundedRect(0, 0, w, h, r);
            } else {
                bg.lineStyle(2, item.isOwned ? 0x6a8ab0 : 0x444466, 0.6);
                bg.strokeRoundedRect(0, 0, w, h, r);
            }
        };
        drawCard(false);

        // Badge trạng thái
        let badgeObj = null;
        if (item.isActive) {
            badgeObj = this._createBadge(w, "✓ Đang dùng", 0x3a8a3a);
        } else if (item.isOwned) {
            badgeObj = this._createBadge(w, "Đã sở hữu", 0x2266cc);
        }

        // Ảnh item
        let imgObj = null;
        if (item.imgKey && this.textures.exists(item.imgKey)) {
            imgObj = this.add.image(w / 2, h * 0.40, item.imgKey);
            const scale = Math.min((w - 18) / imgObj.width, (h * 0.50) / imgObj.height);
            imgObj.setScale(scale);
        } else {
            imgObj = this.add.text(w / 2, h * 0.38, "🎭", { fontSize: "36px" }).setOrigin(0.5);
        }

        // Tên
        const nameLabel = item.label || this._getDisplayName(item.name || "");
        const labelTxt = this.add.text(w / 2, h - 36, nameLabel, {
            fontFamily: "Signika", fontSize: "11px",
            color: isSelected ? "#ffe066" : item.isOwned ? "#a8d0f0" : "#8888aa",
            fontStyle: "bold", align: "center",
            wordWrap: { width: w - 10 },
        }).setOrigin(0.5);

        // Giá
        let priceObj = null;
        const price = item.price || 0;
        if (!item.isOwned) {
            if (price === 0) {
                priceObj = this.add.text(w / 2, h - 16, "Miễn phí", {
                    fontFamily: "Signika", fontSize: "11px",
                    color: "#66dd66", fontStyle: "bold",
                }).setOrigin(0.5);
            } else {
                // Coin icon + price
                const priceC = this.add.container(0, 0);
                const ci = this.add.image(w / 2 - 26, h - 16, "coin").setDisplaySize(16, 16);
                const pt = this.add.text(w / 2 - 14, h - 16, this._formatMoney(price), {
                    fontFamily: "Signika", fontSize: "11px",
                    color: "#ffe066", fontStyle: "bold",
                }).setOrigin(0, 0.5);
                priceC.add([ci, pt]);
                priceObj = priceC;
            }
        }

        // Glow nếu selected
        if (isSelected) {
            this.tweens.add({
                targets: bg, alpha: { from: 1, to: 0.80 },
                duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });
        }

        const children = [bg, imgObj, labelTxt];
        if (badgeObj)  children.push(badgeObj);
        if (priceObj)  children.push(priceObj);
        container.add(children);

        // Interactive
        container.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, w, h),
            Phaser.Geom.Rectangle.Contains
        );
        container.input.cursor = "pointer";

        container.on("pointerover", () => { drawCard(true); this.tweens.add({ targets: container, scaleX: 1.04, scaleY: 1.04, duration: 90 }); });
        container.on("pointerout",  () => { drawCard(false); this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 90 }); });
        container.on("pointerup",   async () => {
            if (this._dragMoved) return;
            this.selectedItem = item;

            // Load skin sprites nếu xem skin
            if (item.type === "skin" && item.charName) {
                await this._loadSkinSprites(item.charName, item.skinNum);
            }

            this.buildLeftPanel();
            this.renderRightPanel();
        });

        return container;
    }

    _createBadge(cardW, text, color) {
        const bw = 72, bh = 18;
        const g = this.add.graphics();
        g.fillStyle(color, 0.9);
        g.fillRoundedRect(cardW / 2 - bw / 2, 5, bw, bh, 9);
        g.fillStyle(0xffffff, 0.20);
        g.fillRoundedRect(cardW / 2 - bw / 2 + 2, 6, bw - 4, bh * 0.45, 6);

        const txt = this.add.text(cardW / 2, 14, text, {
            fontFamily: "Signika", fontSize: "10px", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5);

        return this.add.container(0, 0, [g, txt]);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ACTIONS — Buy / Equip
    // ═══════════════════════════════════════════════════════════════

    _isItemOwned(item) {
        if (!item) return false;
        if (item.type === "character") return this._isCharOwned(item.id);
        if (item.type === "skin") return !!item.isOwned;
        return false;
    }

    _isItemActive(item) {
        if (!item) return false;
        if (item.type === "character") return this._isCharActive(item.id);
        if (item.type === "skin") return !!item.isActive;
        return false;
    }

    async _buyItem(item) {
        if (!this.playerUserId) return;

        if (item.type === "character") {
            try {
                // Insert vào user_characters
                const res = await fetch(`http://localhost:3000/create-character`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: this.playerUserId,
                        character_id: item.id,
                        name: this.playerData?.user?.name || "Player"
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    // Trừ tiền local
                    this.playerEcoin -= (item.price || 0);
                    this._refreshEcoinUI();

                    // Cập nhật owned
                    this.ownedCharacters.push({
                        character_id: item.id,
                        name: item.name,
                        active_skin_number: 1,
                    });

                    this.showToast("✅ Mua nhân vật thành công!");
                    this.buildLeftPanel();
                    this.renderRightPanel();
                } else {
                    this.showToast(`❌ ${json.message || "Lỗi mua nhân vật"}`);
                }
            } catch(e) {
                console.warn("Buy character error:", e);
                this.showToast("❌ Lỗi kết nối!");
            }
        } else if (item.type === "skin") {
            // TODO: Khi có API mua skin
            this.showToast("⚠️ Tính năng mua trang phục đang phát triển!");
        }
    }

    async _equipItem(item) {
        if (!this.playerUserId) return;

        if (item.type === "character") {
            try {
                await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/active`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ character_id: item.id }),
                });
                // Cập nhật local
                if (this.playerData?.user) {
                    this.playerData.user.active_character_id = item.id;
                    localStorage.setItem("playerData", JSON.stringify(this.playerData));
                }
                this.showToast("✅ Đã trang bị nhân vật!");
                this.buildLeftPanel();
                this.renderRightPanel();
            } catch(e) {
                console.warn("Equip error:", e);
                this.showToast("❌ Lỗi trang bị!");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  DISPLAY NAME HELPERS
    // ═══════════════════════════════════════════════════════════════

    _getDisplayName(name) {
        const MAP = {
            "Dark_Oracle": "Tiên Tri Bóng Tối",
            "Forest_Ranger": "Kiểm Lâm Cổ Đại",
            "Golem": "Người Đá Golem",
            "Minotaur": "Bò Thần Minotaur",
            "Necromancer_of_the_Shadow": "Pháp Sư Bóng Tối",
            "Reaper_Man": "Thần Chết",
            "Zombie_Villager": "Xác Sống",
        };
        return MAP[name] || name?.replace(/_/g, " ") || "???";
    }

    // ═══════════════════════════════════════════════════════════════
    //  DRAG SCROLL
    // ═══════════════════════════════════════════════════════════════

    _setupDrag(rightCX, RIGHT_W, top, gridH) {
        this.input.off("pointerdown", this._onPDown, this);
        this.input.off("pointermove", this._onPMove, this);
        this.input.off("pointerup",   this._onPUp,   this);
        this.input.off("pointerout",  this._onPOut,  this);

        const panelLeft  = rightCX - RIGHT_W / 2;
        const panelRight = rightCX + RIGHT_W / 2;

        this._onPDown = (p) => {
            if (p.x > panelLeft && p.x < panelRight) {
                this._isDragging = true; this._dragX = p.x;
                this._dragMoved = false;  this._velocityX = 0;
            }
        };
        this._onPMove = (p) => {
            if (!this._isDragging) return;
            if (Math.abs(p.x - this._dragX) > 8) this._dragMoved = true;
            if (this._dragMoved && this._gridContainer) {
                const delta = p.x - this._dragX;
                this._gridContainer.x += delta;
                this._dragX = p.x;
                this._velocityX = delta;
            }
        };
        this._onPUp  = () => { this._isDragging = false; };
        this._onPOut = () => { this._isDragging = false; };

        this.input.on("pointerdown", this._onPDown, this);
        this.input.on("pointermove", this._onPMove, this);
        this.input.on("pointerup",   this._onPUp,   this);
        this.input.on("pointerout",  this._onPOut,  this);
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI COMPONENTS
    // ═══════════════════════════════════════════════════════════════

    _buildActionBtn(push, bx, by, bw, bh, label, c1, c2, cb, disabled = false) {
        const br = bh / 2;
        const g  = push(this.add.graphics().setDepth(8));
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
            g.lineStyle(2, 0xffffff, disabled ? 0.25 : 0.55);
            g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, br);
        };
        drawBtn(false);

        const txt = push(this.add.text(bx, by, label, {
            fontFamily: "Signika", fontSize: "15px",
            color: disabled ? "#cccccc" : "#ffffff", fontStyle: "bold",
            stroke: "#00000099", strokeThickness: 3,
        }).setOrigin(0.5).setDepth(9));

        if (!disabled && cb) {
            const zone = push(this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(10));
            zone.on("pointerover", () => { drawBtn(true); this.tweens.add({ targets: [g, txt], scaleX: 1.05, scaleY: 1.05, duration: 85 }); });
            zone.on("pointerout",  () => { drawBtn(false); this.tweens.add({ targets: [g, txt], scaleX: 1, scaleY: 1, duration: 85 }); });
            zone.on("pointerup",   () => { this.tweens.add({ targets: [g, txt], scaleX: 0.93, scaleY: 0.93, duration: 55, yoyo: true, onComplete: cb }); });
        }
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
    //  STYLED PANEL — đồng bộ với BagScene
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
        this._drawDashedBorder(g, left + inset, top + inset, w - inset * 2, h - inset * 2, r2, 0xc8a060, 2);
        return g;
    }

    _drawDashedBorder(g, left, top, w, h, r, color, lw) {
        g.lineStyle(lw, color, 0.75);
        const dash = 10, skip = 7;
        const drawSeg = (x1, y1, x2, y2) => {
            const len = Math.hypot(x2 - x1, y2 - y1);
            if (len <= 0) return;
            const ax = (x2 - x1) / len, ay = (y2 - y1) / len;
            for (let d = 0; d < len; d += dash + skip) {
                const end = Math.min(d + dash, len);
                g.beginPath();
                g.moveTo(x1 + ax * d, y1 + ay * d);
                g.lineTo(x1 + ax * end, y1 + ay * end);
                g.strokePath();
            }
        };
        drawSeg(left + r, top, left + w - r, top);
        drawSeg(left + w, top + r, left + w, top + h - r);
        drawSeg(left + w - r, top + h, left + r, top + h);
        drawSeg(left, top + h - r, left, top + r);

        [{ a:180, b:270, cx:left+r, cy:top+r },
         { a:270, b:360, cx:left+w-r, cy:top+r },
         { a:0,   b:90,  cx:left+w-r, cy:top+h-r },
         { a:90,  b:180, cx:left+r, cy:top+h-r }
        ].forEach(c => {
            g.beginPath();
            g.arc(c.cx, c.cy, r, Phaser.Math.DegToRad(c.a), Phaser.Math.DegToRad(c.b));
            g.strokePath();
        });
    }
}
