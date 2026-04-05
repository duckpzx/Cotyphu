import EcoinManager from "../server/utils/ecoinManager.js";
import { getPlayerData, setPlayerData } from "../server/utils/playerData.js";

// src/scenes/ShopScene.js
export default class ShopScene extends Phaser.Scene {
    constructor() {
        super("ShopScene");

        this.playerData   = null;
        this.playerUserId = null;

        this.activeTab = "character";  // "character" | "skin" | "background"

        // ── Dữ liệu shop (tất cả item trong game) ──
        this.allCharacters  = [];   // { id, name, description, skin_number, image, price }
        this.allShopSkins   = [];   // { skin_id, character_id, skin_number, character_name, price }
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

        EcoinManager.init(this);
        this.playerData = getPlayerData(this) || {};
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;
        this.playerEcoin = EcoinManager.get(this);
        
        EcoinManager.onChange(this, (newEcoin) => {
            this.playerEcoin = newEcoin;
            if (this._ecoinText) {
                this._ecoinText.setText(EcoinManager.format(newEcoin));
            }
        });

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
        // 1) Load tất cả nhân vật kèm giá từ shop API
        try {
            const res = await fetch("http://localhost:3000/shop/characters");
            const json = await res.json();
            this.allCharacters = json.characters || [];
        } catch(e) {
            console.warn("Shop: Failed to load characters", e);
        }

        // 2) Load tất cả skin trong game kèm giá
        try {
            const res = await fetch("http://localhost:3000/shop/skins");
            const json = await res.json();
            this.allShopSkins = json.skins || [];
        } catch(e) {
            console.warn("Shop: Failed to load skins", e);
            this.allShopSkins = [];
        }

        // 3) Load tất cả backgrounds
        try {
            const res = await fetch("http://localhost:3000/shop/backgrounds");
            const json = await res.json();
            this.allBackgrounds = json.backgrounds || [];
        } catch(e) {
            console.warn("Shop: Failed to load backgrounds", e);
            this.allBackgrounds = [];
        }

        if (this.playerUserId) {
            // 3) Load nhân vật đã sở hữu
            try {
                const res = await fetch(`http://localhost:3000/users/${this.playerUserId}/characters/bag`);
                const json = await res.json();
                this.ownedCharacters = json.data || [];
            } catch(e) {
                console.warn("Shop: Failed to load owned characters", e);
            }

            // 4) Load skins sở hữu (từ login data)
            this.ownedSkins = this.playerData?.skins || [];

            // 5) Load backgrounds sở hữu (từ login data)
            this.ownedBgIds = this.playerData?.backgrounds?.map(b => Number(b.background_id)) || [];

            // 6) Load ecoin thật từ server
            this.playerEcoin = await EcoinManager.fetchFromServer(this, this.playerUserId);
        }

        // 7) Load sprite idle frames cho tất cả nhân vật và background
        await this._loadAllCharacterSprites();
        await this._loadAllBackgroundSprites();
    }

    async _loadAllCharacterSprites() {
        let needsLoad = false;
        
        const requiredSprites = [];
        
        // Add from characters
        for (const char of this.allCharacters) {
            if (char.name) {
                requiredSprites.push({ charName: char.name, skinNum: char.skin_number || 1 });
            }
        }
        
        // Add from shop skins (this includes 1, 2, 3)
        for (const skin of this.allShopSkins) {
            if (skin.character_name) {
                requiredSprites.push({ charName: skin.character_name, skinNum: skin.skin_number || 1 });
            }
        }
        
        // Deduplicate
        const uniqueSprites = [];
        const seen = new Set();
        for (const item of requiredSprites) {
            const key = `${item.charName}_${item.skinNum}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSprites.push(item);
            }
        }

        for (const { charName, skinNum } of uniqueSprites) {
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
        for (const { charName, skinNum } of uniqueSprites) {
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

    async _loadAllBackgroundSprites() {
        let needsLoad = false;
        for (const bg of this.allBackgrounds) {
            const imgKey = `bg_${bg.id}`;
            if (!this.textures.exists(imgKey) && bg.image_path) {
                this.load.image(imgKey, bg.image_path);
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
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS — ownership / status
    // ═══════════════════════════════════════════════════════════════

    _isCharOwned(charId) {
        return this.ownedCharacters.some(c => Number(c.character_id) === Number(charId));
    }

    _isBgOwned(bgId) {
        return this.ownedBgIds.includes(Number(bgId));
    }

    _isBgActive(bgId) {
        return Number(this.playerData?.user?.active_bg_id) === Number(bgId);
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
        const badgeW = 230, badgeH = 36;
        const bx = width - 30 - badgeW / 2;
        const by = 28;

        const hg = push(this.add.graphics().setDepth(100));
        hg.fillStyle(0x1a0e00, 0.75);
        hg.fillRoundedRect(bx - badgeW / 2, by - badgeH / 2, badgeW, badgeH, badgeH / 2);
        hg.lineStyle(2, 0xd4a030, 0.9);
        hg.strokeRoundedRect(bx - badgeW / 2, by - badgeH / 2, badgeW, badgeH, badgeH / 2);

        push(this.add.image(bx - badgeW / 2 + 22, by, "coin")
            .setDisplaySize(28, 28).setDepth(101));

        this._ecoinText = push(this.add.text(bx - 5, by, this._formatMoney(this.playerEcoin), {
            fontFamily: "Signika", fontSize: "16px",
            color: "#ffe066", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(101));

        // Nút + (Nạp Ecoin)
        const plusX = bx + badgeW / 2 - 22;
        const plusG = push(this.add.graphics().setDepth(101));
        plusG.fillStyle(0x44bb44, 1);
        plusG.fillCircle(plusX, by, 14);
        plusG.lineStyle(2, 0xffffff, 0.6);
        plusG.strokeCircle(plusX, by, 14);

        const plusTxt = push(this.add.text(plusX, by, "+", {
            fontFamily: "Signika", fontSize: "22px",
            color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(102));

        const plusZone = push(this.add.zone(plusX, by, 30, 30)
            .setInteractive({ useHandCursor: true }).setDepth(103));
        plusZone.on("pointerover", () => { plusG.clear(); plusG.fillStyle(0x66dd66, 1); plusG.fillCircle(plusX, by, 15); plusG.lineStyle(2, 0xffffff, 0.9); plusG.strokeCircle(plusX, by, 15); });
        plusZone.on("pointerout", () => { plusG.clear(); plusG.fillStyle(0x44bb44, 1); plusG.fillCircle(plusX, by, 14); plusG.lineStyle(2, 0xffffff, 0.6); plusG.strokeCircle(plusX, by, 14); });
        plusZone.on("pointerup", () => this._showEcoinModal());
    }

    _showEcoinModal() {
        const { width, height } = this.scale;

        // Overlay mờ
        const _modalObjs = [];
        const push = o => { _modalObjs.push(o); return o; };

        const overlay = push(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
            .setDepth(500).setInteractive());

        // Panel
        const PW = 480, PH = 380;
        const px = width / 2, py = height / 2;

        const panelG = push(this.add.graphics().setDepth(501));
        panelG.fillStyle(0xfff0d0, 1);
        panelG.fillRoundedRect(px - PW / 2, py - PH / 2, PW, PH, 20);
        panelG.fillStyle(0xffffff, 0.35);
        panelG.fillRoundedRect(px - PW / 2 + 4, py - PH / 2 + 4, PW - 8, PH * 0.15, 18);
        panelG.lineStyle(4, 0x8b5e1a, 1);
        panelG.strokeRoundedRect(px - PW / 2, py - PH / 2, PW, PH, 20);

        // Tiêu đề
        const titleG = push(this.add.graphics().setDepth(502));
        titleG.fillStyle(0xd4a030, 1);
        titleG.fillRoundedRect(px - 85, py - PH / 2 + 12, 170, 34, 17);
        titleG.fillStyle(0xfff5b0, 0.40);
        titleG.fillRoundedRect(px - 83, py - PH / 2 + 13, 166, 14, 12);
        titleG.lineStyle(2.5, 0x8b5e1a, 1);
        titleG.strokeRoundedRect(px - 85, py - PH / 2 + 12, 170, 34, 17);

        push(this.add.text(px, py - PH / 2 + 29, "💰 NẠP ECOIN", {
            fontFamily: "Signika", fontSize: "16px",
            color: "#4a2000", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(503));

        // Các gói nạp
        const packages = [
            { amount: 10000,    label: "10.000",     icon: "🪙",  color: 0x6a8ab0 },
            { amount: 50000,    label: "50.000",     icon: "💰",  color: 0x44aa44 },
            { amount: 200000,   label: "200.000",    icon: "💎",  color: 0x8844cc },
            { amount: 1000000,  label: "1.000.000",  icon: "👑",  color: 0xd4a030 },
        ];

        const startY = py - PH / 2 + 75;
        const cardW = 100, cardH = 130, gap = 12;
        const totalCardsW = packages.length * cardW + (packages.length - 1) * gap;
        const startX = px - totalCardsW / 2;

        packages.forEach((pkg, i) => {
            const cx = startX + i * (cardW + gap) + cardW / 2;
            const cy = startY + cardH / 2;

            const cg = push(this.add.graphics().setDepth(502));
            const drawPkgCard = (hover = false) => {
                cg.clear();
                cg.fillStyle(0x000000, 0.18);
                cg.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 3, cardW, cardH, 12);
                cg.fillStyle(pkg.color, hover ? 0.95 : 0.8);
                cg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
                cg.fillStyle(0xffffff, hover ? 0.25 : 0.15);
                cg.fillRoundedRect(cx - cardW / 2 + 6, cy - cardH / 2 + 5, cardW - 12, cardH * 0.3, 8);
                cg.lineStyle(2, 0xffffff, hover ? 0.6 : 0.3);
                cg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
            };
            drawPkgCard();

            push(this.add.text(cx, cy - 30, pkg.icon, { fontSize: "32px" }).setOrigin(0.5).setDepth(503));
            push(this.add.text(cx, cy + 10, pkg.label, {
                fontFamily: "Signika", fontSize: "14px",
                color: "#ffffff", fontStyle: "bold",
                stroke: "#000000", strokeThickness: 2,
            }).setOrigin(0.5).setDepth(503));
            push(this.add.text(cx, cy + 30, "Ecoin", {
                fontFamily: "Signika", fontSize: "11px", color: "#ffe066",
            }).setOrigin(0.5).setDepth(503));

            // Nút chọn
            const btnY2 = cy + cardH / 2 - 16;
            const btnG = push(this.add.graphics().setDepth(502));
            btnG.fillStyle(0xffffff, 0.25);
            btnG.fillRoundedRect(cx - 35, btnY2 - 10, 70, 20, 10);

            push(this.add.text(cx, btnY2, "Chọn", {
                fontFamily: "Signika", fontSize: "11px", color: "#ffffff", fontStyle: "bold",
            }).setOrigin(0.5).setDepth(503));

            const zone = push(this.add.zone(cx, cy, cardW, cardH)
                .setInteractive({ useHandCursor: true }).setDepth(504));
            zone.on("pointerover", () => drawPkgCard(true));
            zone.on("pointerout",  () => drawPkgCard(false));
            zone.on("pointerup", async () => {
                await this._addEcoin(pkg.amount);
                _modalObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
            });
        });

        // Nút đóng
        const closeY = py + PH / 2 - 40;
        const closeG = push(this.add.graphics().setDepth(502));
        closeG.fillStyle(0xcc4444, 0.9);
        closeG.fillRoundedRect(px - 50, closeY - 16, 100, 32, 16);
        closeG.lineStyle(2, 0xffffff, 0.3);
        closeG.strokeRoundedRect(px - 50, closeY - 16, 100, 32, 16);

        push(this.add.text(px, closeY, "✕ Đóng", {
            fontFamily: "Signika", fontSize: "14px", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(503));

        const closeZone = push(this.add.zone(px, closeY, 100, 32)
            .setInteractive({ useHandCursor: true }).setDepth(504));
        closeZone.on("pointerup", () => {
            _modalObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        });
    }

    async _addEcoin(amount) {
        if (!this.playerUserId) return;
        try {
            const res = await fetch("http://localhost:3000/shop/add-ecoin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: this.playerUserId, amount }),
            });
            const json = await res.json();
            if (json.success) {
                this.playerEcoin = json.ecoin;
                this._refreshEcoinUI();
                if (this.playerData?.user) {
                    this.playerData.user.ecoin = json.ecoin;
                    localStorage.setItem("playerData", JSON.stringify(this.playerData));
                }
                this.showToast(`✅ ${json.message}`);
                this.buildLeftPanel(); // refresh buy buttons
            } else {
                this.showToast(`❌ ${json.message}`);
            }
        } catch(e) {
            console.warn("Add ecoin error:", e);
            this.showToast("❌ Lỗi kết nối!");
        }
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
        if (item.type === "background") {
            const bgKey = `bg_${item.id}`;
            if (this.textures.exists(bgKey)) {
                const sprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2, bgKey));
                const wRatio = (PREVIEW_W - 20) / sprite.width;
                const hRatio = (PREVIEW_H - 20) / sprite.height;
                sprite.setScale(Math.max(wRatio, hRatio)).setDepth(5);
                
                const maskShape = push(this.make.graphics());
                maskShape.fillRoundedRect(PREVIEW_X + 5, PREVIEW_Y + 5, PREVIEW_W - 10, PREVIEW_H - 10, 10);
                sprite.setMask(maskShape.createGeometryMask());

                // ── Đè nhân vật + Aura lên trên nền ──
                const activeChar = this.playerData?.characters?.find(c => Number(c.is_active_character) === 1) || (this.allCharacters && this.allCharacters[0]);
                if (activeChar) {
                    const charName = activeChar.name;
                    const skinNum = activeChar.active_skin_number || 1;
                    const animKey = `shop_${charName}_${skinNum}_idle`;
                    const frame0 = `shop_${charName}_${skinNum}_idle_000`;

                    if (this.textures.exists(frame0)) {
                        const charScale = Math.min((PREVIEW_W - 20) / this.textures.get(frame0).getSourceImage().width, (PREVIEW_H - 20) / this.textures.get(frame0).getSourceImage().height) * 0.9;
                        
                        // Aura chớp sáng
                        const aura = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2 + 10, frame0));
                        aura.setScale(charScale * 1.15).setTint(0xffeeaa).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
                        
                        // Nhân vật
                        const charSprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2 + 10, frame0));
                        charSprite.setScale(charScale).setDepth(7);

                        if (this.anims.exists(animKey)) { charSprite.play(animKey); aura.play(animKey); }

                        this.tweens.add({ targets: [charSprite, aura], y: charSprite.y - 6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                        this.tweens.add({ targets: aura, scaleX: charScale * 1.25, scaleY: charScale * 1.25, alpha: { from: 0.6, to: 0.1 }, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                    }
                }
            } else {
                push(this.add.text(leftCX, PREVIEW_Y + PREVIEW_H / 2, "🖼", {
                    fontSize: "56px",
                }).setOrigin(0.5).setDepth(5));
            }
        } else {
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
        }

        // ── Tên item ──
        const displayName = item.label || this._getDisplayName(item.charName || item.name || "");
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
        } else if (this.activeTab === "background" && this.allBackgrounds.length > 0) {
            const b = this.allBackgrounds[0];
            this.selectedItem = {
                id: b.id, type: "background", name: b.name || `Phông nền ${b.id}`, description: "Một phông nền tuyệt đẹp cho phòng chơi.",
                price: Number(b.price_ecoin) || 0, imgKey: `bg_${b.id}`
            };
        } else {
            this.selectedItem = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  RIGHT PANEL — Item Grid
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
            items = this.allBackgrounds.map(b => ({
                id: b.id, type: "background", name: b.name || `Phông nền ${b.id}`,
                label: b.name || `Phông nền ${b.id}`, description: "Một phông nền tuyệt đẹp cho phòng chơi.",
                price: Number(b.price_ecoin) || 0,
                imgKey: `bg_${b.id}`,
                isOwned: this._isBgOwned(b.id),
                isActive: false
            }));
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
        
        if (oldGridX !== null) {
            this._gridContainer.x = Phaser.Math.Clamp(oldGridX, this._maxX, this._minX);
        } else {
            this._gridContainer.x = gridStartX;
        }

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
        const SKIN_LABELS = { 1: "Sơ cấp", 2: "Trung cấp", 3: "Cao cấp" };

        for (const skin of this.allShopSkins) {
            const charName = skin.character_name;
            const skinNum = skin.skin_number;
            const frameKey = `shop_${charName}_${skinNum}_idle_000`;
            const isOwnedChar = this._isCharOwned(skin.character_id);
            // Skin mặc định sở hữu nếu đã có nhân vật
            const isOwnedSkin = skin.is_default
                ? isOwnedChar
                : this.ownedSkins.some(s => Number(s.skin_id) === Number(skin.skin_id));

            items.push({
                id: skin.skin_id,
                type: "skin",
                charName,
                name: charName,
                skinNum,
                description: `${SKIN_LABELS[skinNum] || `Skin ${skinNum}`} — ${this._getDisplayName(charName)}`,
                price: skin.price || 0,
                imgKey: frameKey,
                isOwned: isOwnedSkin,
                isActive: false,
                charId: skin.character_id,
                skinId: skin.skin_id,
                label: `${SKIN_LABELS[skinNum] || `Skin ${skinNum}`}`
            });
        }
        return items;
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
            const wRatio = (w - 18) / imgObj.width;
            const hRatio = (h * 0.50) / imgObj.height;
            // For backgrounds we want to fit inside the card to avoid complicated local/world mask scaling issues in scrollviews
            const scale = Math.min(wRatio, hRatio);
            imgObj.setScale(scale);
        } else {
            imgObj = this.add.text(w / 2, h * 0.38, item.type === "background" ? "🖼" : "🎭", { fontSize: "36px" }).setOrigin(0.5);
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

        container.on('destroy', () => {
            if (container.maskShape) {
                container.maskShape.destroy();
            }
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
        if (item.type === "background") return this._isBgOwned(item.id);
        return false;
    }

    _isItemActive(item) {
        if (!item) return false;
        if (item.type === "character") return this._isCharActive(item.id);
        if (item.type === "skin") return !!item.isActive;
        if (item.type === "background") return this._isBgActive(item.id);
        return false;
    }

    async _buyItem(item) {
        if (!this.playerUserId) return;

        if (item.type === "character") {
            try {
                const res = await fetch("http://localhost:3000/shop/buy-character", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: this.playerUserId,
                        character_id: item.id,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    // Cập nhật ecoin qua EcoinManager
                    EcoinManager.set(this, json.ecoin);

                    // Cập nhật owned characters cho ShopScene
                    this.ownedCharacters.push({
                        character_id: item.id,
                        name: item.name,
                        active_skin_number: 1,
                    });

                    // Cập nhật global playerData để LobbyScene & BagScene có thể thấy
                    if (this.playerData) {
                        if (!this.playerData.characters) this.playerData.characters = [];
                        this.playerData.characters.push({
                            id: item.id,
                            name: item.name,
                            active_skin_id: null,
                            active_skin_number: 1
                        });
                        setPlayerData(this, this.playerData);
                    }

                    this.showToast(`✅ ${json.message}`);
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
            if (!item.skinId) {
                this.showToast("❌ Dữ liệu skin không hợp lệ!");
                return;
            }
            try {
                const res = await fetch("http://localhost:3000/shop/buy-skin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: this.playerUserId,
                        skin_id: item.skinId,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    EcoinManager.set(this, json.ecoin);
                    // Thêm vào owned skins
                    this.ownedSkins.push({ skin_id: item.skinId });

                    // Cập nhật global playerData
                    if (this.playerData) {
                        if (!this.playerData.skins) this.playerData.skins = [];
                        this.playerData.skins.push({ skin_id: item.skinId });
                        setPlayerData(this, this.playerData);
                    }

                    this.showToast(`✅ ${json.message}`);
                    this.buildLeftPanel();
                    this.renderRightPanel();
                } else {
                    this.showToast(`❌ ${json.message || "Lỗi mua trang phục"}`);
                }
            } catch(e) {
                console.warn("Buy skin error:", e);
                this.showToast("❌ Lỗi kết nối!");
            }
        } else if (item.type === "background") {
            try {
                const res = await fetch("http://localhost:3000/shop/buy-background", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: this.playerUserId,
                        background_id: item.id,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    EcoinManager.set(this, json.ecoin);
                    this.ownedBgIds.push(item.id);

                    if (this.playerData) {
                        if (!this.playerData.backgrounds) this.playerData.backgrounds = [];
                        this.playerData.backgrounds.push({ background_id: item.id });
                        localStorage.setItem("playerData", JSON.stringify(this.playerData));
                    }

                    this.showToast(`✅ ${json.message}`);
                    this.buildLeftPanel();
                    this.renderRightPanel();
                } else {
                    this.showToast(`❌ ${json.message || "Lỗi mua phông nền"}`);
                }
            } catch(e) {
                console.warn("Buy background error:", e);
                this.showToast("❌ Lỗi kết nối!");
            }
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
                    setPlayerData(this, this.playerData);
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
