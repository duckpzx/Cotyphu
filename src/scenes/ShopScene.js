import EcoinManager from "../server/utils/ecoinManager.js";
import { getPlayerData, setPlayerData } from "../server/utils/playerData.js";
import { SERVER_URL } from "../config.js";

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
        this.load.image("shop-bg",    "assets/ui/nen_chung.png");
        this.load.image("out",        "assets/ui/shared/return.png");
        this.load.image("coin",       "assets/ui/shared/coin.png");
        this.load.image("card_item1", "assets/ui/shared/item_card2.png");
        this.load.image("use_badge",  "assets/ui/shared/use.png");
        this.load.image("own_badge",  "assets/ui/shared/own.png");
        this.load.image("default_bg", "assets/ui/bg/0-ngocphumedia_0.png");
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
                const s = this._formatMoney(newEcoin);
                this._ecoinText.setText(s);
                if (this._drawEcoinBg) this._drawEcoinBg(s);
            }
        });

        // ── Background ──
        const bg = this.add.image(width / 2, height / 2, "shop-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Tải dữ liệu ──
        await this._loadShopData();

        // ── Layout (giống BagScene) ──
        const TAB_H   = 46;
        const PANEL_Y = 110;
        const GAP     = 16;
        const LEFT_W  = 340;
        const RIGHT_W = width - LEFT_W - GAP - 40;
        const PANEL_H = height - PANEL_Y - 40;
        const START_X = 20;

        const leftCX  = START_X + LEFT_W / 2;
        const rightCX = START_X + LEFT_W + GAP + RIGHT_W / 2;
        const panelY  = PANEL_Y + PANEL_H / 2;

        this._layout = { leftCX, rightCX, panelY, LEFT_W, RIGHT_W, PANEL_H, GAP, PANEL_Y, TAB_H };

        this.createStyledPanel(leftCX,  panelY, LEFT_W,  PANEL_H, 18);
        this.createStyledPanel(rightCX, panelY, RIGHT_W, PANEL_H, 18);

        // ── Header: Back + "CỬA HÀNG" ─────────────────────────────────
        const backBtn = this.add.image(48, 48, "out").setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
            });
        });
        this.add.text(105, 55, "CỬA HÀNG", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);
        [[260, 30], [340, 22], [385, 38]].forEach(([sx, sy]) => {
            this.add.text(sx, sy, "✦", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.6);
        });

        // ── Header: Ecoin bar ──
        this._buildEcoinHeader();

        // ── Chọn item đầu tiên ──
        this._autoSelectFirst();

        // ── Build UI ──
        this.buildTabs();
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
    //  LOAD DATA
    // ═══════════════════════════════════════════════════════════════

    async _loadShopData() {
        // 1) Load tất cả nhân vật kèm giá từ shop API
        try {
            const res = await fetch(`${SERVER_URL}/shop/characters`);
            const json = await res.json();
            this.allCharacters = json.characters || [];
        } catch(e) {
            console.warn("Shop: Failed to load characters", e);
        }

        // 2) Load tất cả skin trong game kèm giá
        try {
            const res = await fetch(`${SERVER_URL}/shop/skins`);
            const json = await res.json();
            this.allShopSkins = json.skins || [];
        } catch(e) {
            console.warn("Shop: Failed to load skins", e);
            this.allShopSkins = [];
        }

        // 3) Load tất cả backgrounds
        try {
            const res = await fetch(`${SERVER_URL}/shop/backgrounds`);
            const json = await res.json();
            this.allBackgrounds = json.backgrounds || [];
        } catch(e) {
            console.warn("Shop: Failed to load backgrounds", e);
            this.allBackgrounds = [];
        }

        if (this.playerUserId) {
            // 3) Load nhân vật đã sở hữu
            try {
                const res = await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/bag`);
                const json = await res.json();
                this.ownedCharacters = json.data || [];
            } catch(e) {
                console.warn("Shop: Failed to load owned characters", e);
            }

            // 4) Load skins sở hữu (từ login data)
            this.ownedSkins = this.playerData?.skins || [];

            // 5) Load backgrounds sở hữu — fetch từ server để đảm bảo đúng
            try {
                const bgRes = await fetch(`${SERVER_URL}/users/${this.playerUserId}/backgrounds/bag`);
                const bgJson = await bgRes.json();
                const ownedBgs = bgJson.data || [];
                this.ownedBgIds = ownedBgs.map(b => Number(b.background_id || b.id));
            } catch(e) {
                // fallback về playerData nếu API lỗi
                const bgs = this.playerData?.backgrounds || [];
                this.ownedBgIds = bgs.map(b => Number(b.background_id || b.id || 0)).filter(Boolean);
            }

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
        return Number(v || 0).toLocaleString("vi-VN").replace(/\./g, ",");
    }

    // ═══════════════════════════════════════════════════════════════
    //  ECOIN HEADER
    // ═══════════════════════════════════════════════════════════════

    _buildEcoinHeader() {
        const { width } = this.scale;
        this._headerObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._headerObjs = [];
        const push = o => { this._headerObjs.push(o); return o; };

        const badgeH = 42;
        const iconSize = 30;
        const PAD_L = 8, PAD_R = 8;
        const by = 36;

        const calcW = (str) => PAD_L + iconSize + 6 + str.length * 10 + PAD_R;

        const bg = push(this.add.graphics().setDepth(100));
        const drawBg = (str) => {
            const tw = calcW(str);
            const bx = width - tw;
            bg.clear();
            bg.fillStyle(0xf6eac6, 0.97);
            bg.fillRoundedRect(bx, by - badgeH / 2, tw, badgeH, { tl: badgeH / 2, tr: 0, bl: badgeH / 2, br: 0 });
            bg.lineStyle(2, 0xb8922e, 0.9);
            bg.strokeRoundedRect(bx, by - badgeH / 2, tw, badgeH, { tl: badgeH / 2, tr: 0, bl: badgeH / 2, br: 0 });
        };

        const priceStr = this._formatMoney(this.playerEcoin);
        drawBg(priceStr);

        const tw0 = calcW(priceStr);
        const bx0 = width - tw0;

        push(this.add.image(bx0 + PAD_L + iconSize / 2, by, "coin")
            .setDisplaySize(iconSize, iconSize).setDepth(101));

        this._ecoinText = push(this.add.text(bx0 + PAD_L + iconSize + 6, by, priceStr, {
            fontFamily: "Signika", fontSize: "18px",
            color: "#502700", fontStyle: "bold",
            stroke: "#f5dfa0", strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(101));

        this._drawEcoinBg = drawBg;
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
            const res = await fetch(`${SERVER_URL}/shop/add-ecoin`, {
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
        const { leftCX, panelY, LEFT_W, PANEL_H, PANEL_Y } = this._layout;
        this._previewObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._previewObjs = [];
        const push = o => { this._previewObjs.push(o); return o; };

        const top = PANEL_Y || (panelY - PANEL_H / 2);
        const PAD = 22;

        // ── Khung preview — phong cách BagScene ──────────────────
        const PREVIEW_W = LEFT_W - PAD * 2;
        const PREVIEW_H = Math.round(PANEL_H * 0.52);
        const PREVIEW_X = leftCX - PREVIEW_W / 2;
        const PREVIEW_Y = top + PAD;
        const r = 16;

        const prevG = push(this.add.graphics().setDepth(4));

        // Bóng mờ
        prevG.fillStyle(0x000000, 0.18);
        prevG.fillRoundedRect(PREVIEW_X + 4, PREVIEW_Y + 6, PREVIEW_W, PREVIEW_H, r + 2);

        // Viền ngoài gradient trắng → xanh nhạt
        const borderThick = 1.5;
        const bx = PREVIEW_X - borderThick, by = PREVIEW_Y - borderThick;
        const bw = PREVIEW_W + borderThick * 2, bh = PREVIEW_H + borderThick * 2;
        const br = r + borderThick;
        prevG.fillGradientStyle(0xffffff, 0xebfcff, 0xffffff, 0xebfcff, 1);
        prevG.fillRoundedRect(bx, by, bw, bh, br);
        prevG.lineStyle(1.5, 0xebfcff, 0.55);
        prevG.strokeRoundedRect(bx + 2, by + 2, bw - 4, bh - 4, br - 1);

        // Nền mặc định từ ảnh
        if (this.textures.exists("default_bg")) {
            const defBg = push(this.add.image(leftCX, PREVIEW_Y + PREVIEW_H / 2, "default_bg").setDepth(4));
            const wRatio = PREVIEW_W / defBg.width;
            const hRatio = PREVIEW_H / defBg.height;
            defBg.setScale(Math.max(wRatio, hRatio));
            const maskDef = push(this.make.graphics());
            maskDef.fillRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H, r);
            defBg.setMask(maskDef.createGeometryMask());
        } else {
            prevG.fillGradientStyle(0x1a9fd4, 0x1a9fd4, 0x0a5e96, 0x0a5e96, 1);
            prevG.fillRoundedRect(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H, r);
        }

        // Gloss tam giác góc trên phải
        prevG.fillStyle(0xffffff, 0.28);
        prevG.fillTriangle(
            PREVIEW_X + PREVIEW_W * 0.45, PREVIEW_Y,
            PREVIEW_X + PREVIEW_W,        PREVIEW_Y,
            PREVIEW_X + PREVIEW_W,        PREVIEW_Y + PREVIEW_H * 0.55
        );

        // Viền trong trắng mỏng
        prevG.lineStyle(1.5, 0xffffff, 0.55);
        prevG.strokeRoundedRect(PREVIEW_X + 2, PREVIEW_Y + 2, PREVIEW_W - 4, PREVIEW_H - 4, r - 2);

        const item = this.selectedItem;

        // helper: vẽ ngôi sao lấp lánh quanh nhân vật
        const _addStarEffect = (charCY, charScale, src) => {
            const STAR_COUNT = 12;
            const spreadX = (src.width  * charScale) * 0.85;
            const spreadY = (src.height * charScale) * 0.75;
            const starPalette = [0xffffff, 0xddbbff, 0xffddff, 0xaaddff, 0xffeeaa];

            for (let i = 0; i < STAR_COUNT; i++) {
                const sg = push(this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(8));
                const col = starPalette[i % starPalette.length];
                const sz  = Phaser.Math.Between(2, 5);
                const angle = Math.random() * Math.PI * 2;
                const dist  = 0.5 + Math.random() * 0.5;
                const baseX = leftCX + Math.cos(angle) * spreadX * dist;
                const baseY = charCY  + Math.sin(angle) * spreadY * dist;
                sg.x = baseX; sg.y = baseY;

                const drawStar = (size, alpha) => {
                    sg.clear();
                    sg.fillStyle(col, alpha);
                    sg.fillCircle(0, 0, size * 0.55);
                    sg.fillTriangle(0, -size * 1.7, -size * 0.3, 0,  size * 0.3, 0);
                    sg.fillTriangle(0,  size * 1.7, -size * 0.3, 0,  size * 0.3, 0);
                    sg.fillTriangle(-size * 1.7, 0, 0, -size * 0.3, 0, size * 0.3);
                    sg.fillTriangle( size * 1.7, 0, 0, -size * 0.3, 0, size * 0.3);
                };
                drawStar(sz, 0.05);

                const twinkleDur   = Phaser.Math.Between(600, 1800);
                const twinkleDelay = Phaser.Math.Between(0, 2000);
                const peakAlpha    = 0.5 + Math.random() * 0.5;
                const alphaState   = { v: 0.05 };
                this.tweens.add({ targets: alphaState, v: peakAlpha, duration: twinkleDur, delay: twinkleDelay, yoyo: true, repeat: -1, ease: "Sine.easeInOut", onUpdate: () => drawStar(sz, alphaState.v) });
                this.tweens.add({ targets: sg, x: baseX + Phaser.Math.Between(-8, 8), y: baseY + Phaser.Math.Between(-10, 10), duration: Phaser.Math.Between(1200, 2400), delay: twinkleDelay, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                this.tweens.add({ targets: sg, scaleX: { from: 0.8, to: 1.4 }, scaleY: { from: 0.8, to: 1.4 }, duration: twinkleDur * 1.1, delay: twinkleDelay, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
            }
        };

        if (item) {
            if (item.type === "background") {
                const bgKey = `bg_${item.id}`;
                if (this.textures.exists(bgKey)) {
                    const bgSprite = push(this.add.sprite(leftCX, PREVIEW_Y + PREVIEW_H / 2, bgKey));
                    const wRatio = (PREVIEW_W - 6) / bgSprite.width;
                    const hRatio = (PREVIEW_H - 6) / bgSprite.height;
                    bgSprite.setScale(Math.max(wRatio, hRatio)).setDepth(5);
                    const maskShape = push(this.make.graphics());
                    maskShape.fillRoundedRect(PREVIEW_X + 3, PREVIEW_Y + 3, PREVIEW_W - 6, PREVIEW_H - 6, 12);
                    bgSprite.setMask(maskShape.createGeometryMask());
                }
                // Nhân vật active đè lên nền
                const activeCharId = Number(this.playerData?.user?.active_character_id);
                const activeChar = (this.ownedCharacters || []).find(c => Number(c.character_id) === activeCharId) || (this.ownedCharacters || [])[0];
                if (activeChar) {
                    const charName = activeChar.name;
                    const skinNum  = activeChar.active_skin_number || 1;
                    const animKey  = `shop_${charName}_${skinNum}_idle`;
                    const frame0   = `shop_${charName}_${skinNum}_idle_000`;
                    if (this.textures.exists(frame0)) {
                        const src = this.textures.get(frame0).getSourceImage();
                        const charScale = Math.min((PREVIEW_W - 20) / src.width, (PREVIEW_H - 20) / src.height) * 0.92;
                        const charCY = PREVIEW_Y + PREVIEW_H / 2 + 10;
                        _addStarEffect(charCY, charScale, src);
                        const charSprite = push(this.add.sprite(leftCX, charCY, frame0));
                        charSprite.setScale(charScale).setDepth(7);
                        if (this.anims.exists(animKey)) charSprite.play(animKey);
                        this.tweens.add({ targets: charSprite, y: charCY - 6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                    }
                }
            } else {
                const charName = item.charName || item.name || "";
                const skinNum  = item.skinNum || 1;
                const animKey  = `shop_${charName}_${skinNum}_idle`;
                const frame0   = `shop_${charName}_${skinNum}_idle_000`;
                if (charName && this.textures.exists(frame0)) {
                    const src = this.textures.get(frame0).getSourceImage();
                    const charScale = Math.min((PREVIEW_W - 20) / src.width, (PREVIEW_H - 20) / src.height) * 0.92;
                    const charCY = PREVIEW_Y + PREVIEW_H / 2 + 10;
                    _addStarEffect(charCY, charScale, src);
                    const charSprite = push(this.add.sprite(leftCX, charCY, frame0));
                    charSprite.setScale(charScale).setDepth(7);
                    if (this.anims.exists(animKey)) charSprite.play(animKey);
                    this.tweens.add({ targets: charSprite, y: charCY - 6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
                }
            }
        }

        // ── Nội dung bên dưới preview ──
        const infoY   = PREVIEW_Y + PREVIEW_H + 12;
        const infoBot = top + PANEL_H - 16;
        const infoH   = infoBot - infoY;
        const infoCY  = infoY + infoH / 2 - 12;

        if (!item) {
            push(this.add.text(leftCX, infoCY, "Chọn một vật phẩm\ntừ bên phải", {
                fontFamily: "Signika", fontSize: "16px", color: "#9b7040", align: "center",
            }).setOrigin(0.5).setDepth(5));
            return;
        }

        const displayName = item.label || this._getDisplayName(item.charName || item.name || "");
        const isOwned  = this._isItemOwned(item);
        const isActive = this._isItemActive(item);
        const price    = item.price || 0;
        const hasDesc  = false; // đã xóa description
        const hasBtn   = true;

        // tên(28) + divider(21) + trạng thái/giá(24) + gap(20) + btn(48)
        let blockH = 28 + 21 + 24 + 20 + 48;
        const blockTop = infoCY - blockH / 2;
        let cy = blockTop;

        // Tên
        push(this.add.text(leftCX, cy, displayName, {
            fontFamily: "Signika", fontSize: "20px", color: "#5c3300", fontStyle: "bold",
            stroke: "#f5dfa0", strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(5));
        cy += 28;

        // Divider
        const dg = push(this.add.graphics().setDepth(5));
        dg.lineStyle(1.5, 0xc8a060, 0.6);
        dg.lineBetween(leftCX - LEFT_W / 2 + 20, cy + 10, leftCX + LEFT_W / 2 - 20, cy + 10);
        cy += 21;

        // Trạng thái / giá
        if (!isOwned && price > 0) {
            const priceStr = this._formatMoney(price);
            const iconSize = 32, gap = 8, fontSize = 21;
            // ước tính width chữ (~12px/char ở 21px)
            const textW = priceStr.length * 12.5;
            const totalW = iconSize + gap + textW;
            const startX = leftCX - totalW / 2;
            push(this.add.image(startX + iconSize / 2, cy + 12, "coin").setDisplaySize(iconSize, iconSize).setDepth(5));
            push(this.add.text(startX + iconSize + gap, cy + 12, priceStr, {
                fontFamily: "Signika", fontSize: fontSize + "px", color: "#f5c842", fontStyle: "bold",
                stroke: "#5a3000", strokeThickness: 2,
            }).setOrigin(0, 0.5).setDepth(5));
        } else if (!isOwned && price === 0) {
            push(this.add.text(leftCX, cy + 12, "Miễn phí", {
                fontFamily: "Signika", fontSize: "17px", color: "#44bb44", fontStyle: "bold",
            }).setOrigin(0.5, 0.5).setDepth(5));
        } else {
            push(this.add.text(leftCX, cy + 12,
                `✦  ${isActive ? "Đang sử dụng" : "Đã sở hữu"}`, {
                fontFamily: "Signika", fontSize: "14px",
                color: isActive ? "#2a8b2a" : "#8b5e1a",
            }).setOrigin(0.5, 0.5).setDepth(5));
        }
        cy += 24;

        // Nút pill
        cy += 20;
        const btnW = 220, btnH = 48;
        const btnBY = cy + btnH / 2;
        this._buildShopPillBtn(push, leftCX, btnBY, btnW, btnH, item, isOwned, isActive, price);
    }

    _buildShopPillBtn(push, bx, by, bw, bh, item, isOwned, isActive, price) {
        const br = bh / 2;
        let c1, c2, label, cb, disabled = false;

        if (isActive) {
            c1 = 0x3a8a3a11; c2 = 0x1a5a1a11;
            label = "Đang Sử Dụng"; disabled = true; cb = null;
        } else if (isOwned) {
            c1 = 0x2277dd; c2 = 0x1144aa;
            label = "Sử Dụng";
            cb = async () => { await this._equipItem(item); };
        } else {
            const canAfford = this.playerEcoin >= price;
            c1 = canAfford ? 0xff8800 : 0x888888;
            c2 = canAfford ? 0xffaa00 : 0x555555;
            label = price === 0 ? "Nhận Miễn Phí" : `Mua Ngay`;
            cb = async () => {
                if (!canAfford && price > 0) { this.showToast("Không đủ Ecoin!"); return; }
                await this._buyItem(item);
            };
        }

        const g = push(this.add.graphics().setDepth(6));
        const draw = (hover = false) => {
            g.clear();
            if (disabled) {
                g.fillStyle(c1, 0.5);
                g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
                g.lineStyle(2, 0xffffff, 0.3);
                g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
                return;
            }
            g.fillStyle(c1, 0.18);
            g.fillRoundedRect(bx - bw / 2 - 4, by - bh / 2 - 4, bw + 8, bh + 8, br + 3);
            g.fillStyle(0x000000, 0.28);
            g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 5, bw, bh, br);
            g.fillGradientStyle(c1, c1, c2, c2, 1);
            g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
            g.fillStyle(0xffffff, hover ? 0.40 : 0.22);
            g.fillRoundedRect(bx - bw / 2 + 8, by - bh / 2 + 5, bw - 16, bh / 3, br - 4);
            g.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
            g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
        };
        draw(false);

        const txt = push(this.add.text(bx, by, label, {
            fontFamily: "Signika", fontSize: "20px", color: "#ffffff",
            fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
            shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true },
        }).setOrigin(0.5).setDepth(7));

        if (!disabled) {
            this.tweens.add({ targets: g, alpha: { from: 1, to: 0.85 }, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
            const zone = push(this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" }).setDepth(50));
            zone.on("pointerover",  () => draw(true));
            zone.on("pointerout",   () => draw(false));
            zone.on("pointerdown",  () => {
                this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true });
                cb();
            });
        }
    }


    // ═══════════════════════════════════════════════════════════════
    //  TABS
    // ═══════════════════════════════════════════════════════════════

    buildTabs() {
        this._tabBtnObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._tabBtnObjs = [];
        const push = o => { this._tabBtnObjs.push(o); return o; };

        const { rightCX, RIGHT_W, PANEL_Y } = this._layout;

        const tabs = ["NHÂN VẬT", "TRANG PHỤC", "PHÔNG NỀN"];
        const ids  = ["character", "skin", "background"];
        const tabW = 160;
        const tabH = 46;
        const gap  = 8;
        const totalW = tabs.length * tabW + (tabs.length - 1) * gap;
        const startX = rightCX - totalW / 2;
        const tabY   = PANEL_Y - tabH - 2;

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
                .on("pointerdown", () => {
                    if (this.activeTab === ids[i]) return;
                    this.activeTab = ids[i];
                    this._autoSelectFirstForTab();
                    this._drawAllTabs(startX, tabY, tabW, tabH, gap);
                    this.buildLeftPanel();
                    this.renderRightPanel();
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

        const { rightCX, panelY, RIGHT_W, PANEL_H, PANEL_Y } = this._layout;
        const top    = (PANEL_Y || panelY - PANEL_H / 2) + 14;
        const GRID_H = PANEL_H - 28;
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
                isActive: this._isBgActive(b.id),
            }));
        }

        if (items.length === 0) {
            push(this.add.text(rightCX, panelY, "Sắp ra mắt...", {
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

        const VISIBLE_COLS = 3;
        const CARD_W = Math.floor((RIGHT_W - PAD_X * 2 - GAP_X * (VISIBLE_COLS - 1)) / VISIBLE_COLS * 0.82);
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
        const r = 18;
        const isSelected = this.selectedItem &&
            this.selectedItem.id === item.id &&
            this.selectedItem.type === item.type;

        const HDR_H = Math.round(h * 0.26);

        // ── Nền card dùng card_item1 như BagScene ────────────────
        const cardBg = this.add.image(w / 2, h / 2, "card_item1").setDisplaySize(w, h);

        // ── Tên trên header ───────────────────────────────────────
        const rawLabel = (item.label || this._getDisplayName(item.name || "")).replace(/_/g, " ");
        const maxChars = 12;
        const displayLabel = rawLabel.length > maxChars ? rawLabel.substring(0, maxChars) + "..." : rawLabel;
        const fontSize = Math.max(12.5, Math.min(16.5, Math.round(w * 0.13)));
        const nameTxt = this.add.text(w / 2, HDR_H / 2, displayLabel, {
            fontFamily: "Signika", fontSize: fontSize + "px",
            color: "#ffffff", fontStyle: "bold",
            stroke: "#0b0a2bff", strokeThickness: 3,
            align: "center",
        }).setOrigin(0.5);

        // ── Badge ribbon "Đang dùng" / "Đã sở hữu" ───────────────
        let badgeObj = null;
        if (item.isActive) {
            const size = w * 0.6;
            const ribbon = this.add.image(-3.5, -3.5, "use_badge").setOrigin(0, 0).setDisplaySize(size, size);
            badgeObj = this.add.container(0, 0, [ribbon]);
        } else if (item.isOwned) {
            const size = w * 0.6;
            const ribbon = this.add.image(-3.5, -3.5, "own_badge").setOrigin(0, 0).setDisplaySize(size, size);
            badgeObj = this.add.container(0, 0, [ribbon]);
        }

        // ── Ảnh item ──────────────────────────────────────────────
        const imgAreaY   = HDR_H + 4;
        const imgAreaH   = h - HDR_H - 8;
        const imgCenterY = imgAreaY + imgAreaH / 2 - 11;

        let imgObj = null;
        if (item.imgKey && this.textures.exists(item.imgKey)) {
            imgObj = this.add.image(w / 2, imgCenterY, item.imgKey).setOrigin(0.5);
            if (item.type === "background") {
                imgObj.setScale(Math.min((w - 10) / imgObj.width, (imgAreaH - 8) / imgObj.height));
            } else {
                imgObj.setScale(Math.min((w - 28) / imgObj.width, (imgAreaH - 20) / imgObj.height) * 1.3);
            }
        } else {
            imgObj = this.add.text(w / 2, imgCenterY,
                item.type === "background" ? "🖼" : "🎭",
                { fontSize: Math.round(h * 0.35) + "px" }
            ).setOrigin(0.5);
        }

        // ── Giá (chỉ khi chưa sở hữu) ────────────────────────────
        let priceObj = null;
        const price = item.price || 0;
        if (!item.isOwned) {
            if (price === 0) {
                // nền mờ bám góc trái dưới
                const label = "Miễn phí";
                const tagH = 22, tagPadR = 10, iconSz = 0;
                const tagW = 70;
                const tagG = this.add.graphics();
                tagG.fillStyle(0x000000, 0.42);
                tagG.fillRoundedRect(0, h - tagH, tagW, tagH, { tl: 0, tr: tagH / 2, bl: 0, br: tagH / 2 });
                const tagTxt = this.add.text(tagW / 2, h - tagH / 2, label, {
                    fontFamily: "Signika", fontSize: "11px", color: "#44ee44", fontStyle: "bold",
                }).setOrigin(0.5);
                priceObj = this.add.container(0, 0, [tagG, tagTxt]);
            } else {
                const priceStr = this._formatMoney(price);
                const iconSz = 22, gap = 5, fontSize = 14;
                const textW = priceStr.length * 8.5;
                const tagW = iconSz + gap + textW + 14;
                const tagH = 28;
                const tagY = h - tagH - 16;

                const tagG = this.add.graphics();
                tagG.fillStyle(0xc59653, 0.92);
                tagG.fillRoundedRect(0, tagY, tagW, tagH, { tl: 0, tr: tagH / 2, bl: 0, br: tagH / 2 });

                const ci = this.add.image(iconSz / 2 + 4, tagY + tagH / 2, "coin").setDisplaySize(iconSz, iconSz);
                const pt = this.add.text(iconSz + gap + 4, tagY + tagH / 2, priceStr, {
                    fontFamily: "Signika", fontSize: fontSize + "px", color: "#f5c842", fontStyle: "bold",
                    stroke: "#3a1a00", strokeThickness: 1.5,
                }).setOrigin(0, 0.5);

                priceObj = this.add.container(4, 0, [tagG, ci, pt]);
            }
        }

        // Selected: viền trắng + xanh dương pha nhau, mỏng
        const selOverlay = this.add.graphics();
        if (isSelected) {
            selOverlay.lineStyle(1.5, 0xc49856, 0.9);
            selOverlay.strokeRoundedRect(0, 0, w, h, r);
            selOverlay.lineStyle(1, 0xc49856, 0.5);
            selOverlay.strokeRoundedRect(1.5, 1.5, w - 3, h - 3, r - 1);
        }

        const children = [cardBg, nameTxt, selOverlay];
        if (imgObj)   children.push(imgObj);
        if (priceObj) children.push(priceObj);
        if (badgeObj) children.push(badgeObj);
        container.add(children);

        container.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
        container.input.cursor = "pointer";
        container.on("pointerover", () => { cardBg.setTint(0xffe8cc); });
        container.on("pointerout",  () => { cardBg.clearTint(); });
        container.on("pointerup",   async () => {
            if (this._wasDragged) return;
            // Check card có nằm trong visible area không
            const worldX = container.parentContainer ? container.parentContainer.x + container.x : container.x;
            const { rightCX, RIGHT_W } = this._layout;
            const visLeft  = rightCX - RIGHT_W / 2 + 10;
            const visRight = rightCX + RIGHT_W / 2 - 10;
            if (worldX + w < visLeft || worldX > visRight) return;

            this.selectedItem = item;
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
                const res = await fetch(`${SERVER_URL}/shop/buy-character`, {
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
                const res = await fetch(`${SERVER_URL}/shop/buy-skin`, {
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
                const res = await fetch(`${SERVER_URL}/shop/buy-background`, {
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
                await fetch(`${SERVER_URL}/users/${this.playerUserId}/characters/active`, {
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
            // Reset wasDragged khi bắt đầu bất kỳ click mới nào
            this._wasDragged = false;
            if (p.x > panelLeft && p.x < panelRight) {
                this._isDragging = true; this._dragX = p.x;
                this._dragMoved = false; this._velocityX = 0;
            }
        };
        this._onPMove = (p) => {
            if (!this._isDragging) return;
            if (Math.abs(p.x - this._dragX) > 8) { this._dragMoved = true; this._wasDragged = true; }
            if (this._dragMoved && this._gridContainer) {
                const delta = p.x - this._dragX;
                this._gridContainer.x += delta;
                this._dragX = p.x;
                this._velocityX = delta;
            }
        };
        this._onPUp  = () => { 
            this._isDragging = false;
            this.time.delayedCall(50, () => { this._wasDragged = false; });
        };
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
        const left = x - w / 2;
        const top  = y - h / 2;
        const g    = this.add.graphics().setDepth(2);

        g.fillStyle(0x000000, 0.25);
        g.fillRoundedRect(left + 6, top + 6, w, h, radius);

        g.fillGradientStyle(0xfaeec3, 0xfaeec3, 0xfaeec3, 0xfaeec3, 1);
        g.fillRoundedRect(left, top, w, h, radius);

        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(left, top, w, h, radius);

        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(left + 6, top + 4, w - 12, 20, 8);

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

        drawArc(left+ins+cornerR,   top+ins+cornerR,   cornerR, Math.PI,     Math.PI*1.5);
        drawArc(left+w-ins-cornerR, top+ins+cornerR,   cornerR, Math.PI*1.5, Math.PI*2);
        drawArc(left+w-ins-cornerR, top+h-ins-cornerR, cornerR, 0,           Math.PI*0.5);
        drawArc(left+ins+cornerR,   top+h-ins-cornerR, cornerR, Math.PI*0.5, Math.PI);

        return g;
    }
}
