import { SERVER_URL } from "../config.js";
import { setupClickSound, playOutSound } from "../utils/clickSound.js";
export default class TarotScene extends Phaser.Scene {
    constructor() {
        super("TarotScene");
        this.isDragging = false;
        this.dragX = 0;
        this.velocityX = 0;
        this.cardContainer = null;
        this.minX = 0;
        this.maxX = 0;

        // Slot đang active (0 hoặc 1)
        this.activeSlot = 0;
        this.selectedSlots = [null, null];

        this.tarotList = [];
        this.cardData = {};
        this.playerData = null;
        this.playerUserId = null;
    }

    preload() {
        this.load.image("tarot-bg", "assets/ui/nen_chung.png");
        this.load.image("out",      "assets/ui/shared/return.png");
    }

    async create() {
        const { width, height } = this.scale;
        setupClickSound(this);

        try {
            this.playerData = JSON.parse(localStorage.getItem("playerData"));
        } catch (e) {
            this.playerData = null;
        }
        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;

        // ── Loading overlay: che khoảng trống khi fetch data ──
        const loadingOverlay = this.add.graphics().setDepth(500);
        loadingOverlay.fillStyle(0x0a1a3a, 1);
        loadingOverlay.fillRect(0, 0, width, height);

        const loadingDots = this.add.text(width / 2, height / 2, "Đang tải...", {
            fontFamily: "Signika",
            fontSize: "26px",
            color: "#ffffff",
            stroke: "#003388",
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(501);

        let dotCount = 0;
        const dotTimer = this.time.addEvent({
            delay: 400,
            loop: true,
            callback: () => {
                dotCount = (dotCount + 1) % 4;
                loadingDots.setText("Đang tải" + ".".repeat(dotCount));
            }
        });

        await this.loadTarotAssetsFromServer();

        dotTimer.remove();
        loadingDots.destroy();
        loadingOverlay.destroy();

        // ── Background ───────────────────────────────────────────────
        const bg = this.add.image(width / 2, height / 2, "tarot-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // ── Layout giống BagScene/ShopScene ──────────────────────────
        const PANEL_Y = 110;
        const PANEL_H = height - PANEL_Y - 40;
        const GAP     = 16;
        const LEFT_W  = 340;
        const RIGHT_W = width - LEFT_W - GAP - 40;
        const START_X = 20;

        const leftCX  = START_X + LEFT_W / 2;
        const rightCX = START_X + LEFT_W + GAP + RIGHT_W / 2;
        const panelY  = PANEL_Y + PANEL_H / 2;

        this._layout = { leftCX, rightCX, panelY, LEFT_W, RIGHT_W, PANEL_H, PANEL_Y };

        // ── 2 Panel chính ────────────────────────────────────────────
        this.createStyledPanel(leftCX,  panelY, LEFT_W,  PANEL_H, 18);
        this.createStyledPanel(rightCX, panelY, RIGHT_W, PANEL_H, 18);

        // ── Header: Back + "THẺ BÀI" ─────────────────────────────────
        const backBtn = this.add.image(48, 48, "out").setScale(1).setDepth(200).setInteractive({ cursor: "pointer" });
        backBtn.on("pointerdown", () => {
            playOutSound(this);
            this.tweens.add({ targets: backBtn, scale: 0.7, duration: 80, yoyo: true });
            this.time.delayedCall(160, () => {
                this.cameras.main.fadeOut(200);
                this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
            });
        });
        this.add.text(105, 55, "THẺ BÀI", {
            fontFamily: "Signika", fontSize: "32px", color: "#ffffff", fontStyle: "bold",
            stroke: "#003388", strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 3, color: "#001166", blur: 6, fill: true },
        }).setOrigin(0, 0.5).setPadding(8, 6, 8, 6).setDepth(200);
        [[220, 30], [295, 22], [335, 38]].forEach(([sx, sy]) => {
            this.add.text(sx, sy, "✦", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.6);
        });

        // ── Panel trái: slots + effects ───────────────────────────────
        this.buildLeftContent(leftCX, panelY, LEFT_W, PANEL_H);

        // ── Load active tarots ────────────────────────────────────────
        if (this.playerUserId) {
            try {
                const activeIds = await this.fetchActiveTarots(this.playerUserId);
                activeIds.slice(0, 2).forEach((id, index) => {
                    const key = `tarot_${id}`;
                    if (this._slots[index] && this.cardData[key]) {
                        this.selectedSlots[index] = key;
                        this._slots[index].setCard(this, key);
                    }
                });
                this.renderEffects();
            } catch (e) {
                console.warn("Failed to load active tarots:", e);
            }
        }

        // ── Panel phải: lưới thẻ ─────────────────────────────────────
        const cardKeys = this.tarotList.map(t => `tarot_${t.id}`);
        if (cardKeys.length === 0) {
            this.add.text(rightCX, panelY, "Chưa có thẻ tarot.", {
                fontFamily: "Signika", fontSize: "18px", color: "#8b5e1a"
            }).setOrigin(0.5);
            return;
        }

        const rows     = 2;
        const cols     = Math.ceil(cardKeys.length / rows);
        const PAD_X    = 12;
        const PAD_Y    = 18;
        const cardGapX = 3;
        const cardGapY = 10;

        const VISIBLE_COLS = 3;
        const CARD_H = Math.floor((PANEL_H - PAD_Y * 2 - cardGapY) / 2);
        const firstKey = cardKeys[0];
        const firstSrc = this.textures.exists(firstKey) ? this.textures.get(firstKey).getSourceImage() : null;
        const ratio    = firstSrc ? firstSrc.width / firstSrc.height : 0.68;
        const CARD_W   = Math.round(CARD_H * ratio) + 10;

        const totalGridW = cols * CARD_W + (cols - 1) * cardGapX;
        const totalGridH = 2 * CARD_H + cardGapY;
        const gridStartX = rightCX - RIGHT_W / 2 + PAD_X;
        const gridStartY = panelY - totalGridH / 2;

        this.cardContainer = this.add.container(gridStartX, gridStartY).setDepth(12);

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const idx = col * rows + row;
                if (idx >= cardKeys.length) continue;
                const key = cardKeys[idx];
                const cx  = col * (CARD_W + cardGapX);
                const cy  = row * (CARD_H + cardGapY);
                const card = this.createStyledCard(cx, cy, key, CARD_W, CARD_H);
                this.cardContainer.add(card);
            }
        }

        this.minX = gridStartX;
        this.maxX = Math.min(gridStartX, gridStartX - (totalGridW - (RIGHT_W - PAD_X * 2)));
        this.velocityX = 0;

        const maskShape = this.make.graphics();
        maskShape.fillRoundedRect(
            rightCX - RIGHT_W / 2 + PAD_X - 4, panelY - PANEL_H / 2 + PAD_Y - 4,
            RIGHT_W - PAD_X * 2 + 8, PANEL_H - PAD_Y * 2 + 8, 12
        );
        this.cardContainer.setMask(maskShape.createGeometryMask());

        // ── Drag ─────────────────────────────────────────────────────
        this._pDownX = 0;
        this._dragMoved = false;
        const panelLeft = rightCX - RIGHT_W / 2;

        this.input.on("pointerdown", (p) => {
            this._dragMoved = false;
            if (p.x > panelLeft) {
                this.isDragging = true;
                this.dragX = p.x;
                this._pDownX = p.x;
                this.velocityX = 0;
            }
        });
        this.input.on("pointermove", (p) => {
            if (!this.isDragging) return;
            if (Math.abs(p.x - this._pDownX) > 8) this._dragMoved = true;
            if (this._dragMoved && this.cardContainer) {
                const delta = p.x - this.dragX;
                this.cardContainer.x += delta;
                this.dragX = p.x;
                this.velocityX = delta;
            }
        });
        this.input.on("pointerup",  () => { this.isDragging = false; });
        this.input.on("pointerout", () => { this.isDragging = false; });

        // Fade in toàn bộ UI sau khi build xong
        this.cameras.main.fadeIn(180);
    }

    update() {
        if (this.cardContainer && !this.isDragging) {
            this.cardContainer.x += this.velocityX;
            this.velocityX *= 0.92;
            if (this.cardContainer.x > this.minX) {
                this.cardContainer.x = Phaser.Math.Linear(this.cardContainer.x, this.minX, 0.15);
                this.velocityX = 0;
            } else if (this.cardContainer.x < this.maxX) {
                this.cardContainer.x = Phaser.Math.Linear(this.cardContainer.x, this.maxX, 0.15);
                this.velocityX = 0;
            }
        }
    }

    // =========================================================================
    // PANEL — giống BagScene/ShopScene
    // =========================================================================
    createStyledPanel(x, y, w, h, radius) {
        const left = x - w / 2;
        const top  = y - h / 2;
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


    // =========================================================================
    // PANEL TRÁI — 2 slot + hiển thị ý nghĩa thẻ
    // =========================================================================
    buildLeftContent(cx, cy, w, h) {
        const top    = cy - h / 2;
        const padX   = 30;

        // ── Nền xanh chứa 2 slot ─────────────────────────────────────────────
        const OUTER_PAD = 22; 
        const gap     = 12;
        const PAD     = 14; 
        const boxW    = w - OUTER_PAD * 2;
        const slotW   = Math.floor((boxW - PAD * 2 - gap) / 2);
        const slotH   = Math.round(slotW * 1.45);
        const boxH    = slotH + PAD * 2 + 10;
        const boxX    = cx - w / 2 + OUTER_PAD;
        const boxY    = top + 22;
        const boxR    = 16;

        const boxG = this.add.graphics().setDepth(3);

        // Bóng đổ
        boxG.fillStyle(0x000000, 0.3);
        boxG.fillRoundedRect(boxX + 4, boxY + 6, boxW, boxH, boxR);

        // Nền xanh gradient
        boxG.fillGradientStyle(0x1a8fc0, 0x1a8fc0, 0x0a4a7a, 0x0a4a7a, 1);
        boxG.fillRoundedRect(boxX, boxY, boxW, boxH, boxR);

        // Gloss trên
        boxG.fillStyle(0xffffff, 0.18);
        boxG.fillRoundedRect(boxX + 6, boxY + 5, boxW - 12, boxH * 0.18, boxR - 3);

        // Viền xanh sáng ngoài
        boxG.lineStyle(3, 0x44ccff, 0.9);
        boxG.strokeRoundedRect(boxX, boxY, boxW, boxH, boxR);

        // Viền đứt nét trắng bên trong
        boxG.lineStyle(1.5, 0xffffff, 0.35);
        const ins = 6;
        boxG.strokeRoundedRect(boxX + ins, boxY + ins, boxW - ins * 2, boxH - ins * 2, boxR - 3);

        // ── 2 Slot thẻ ───────────────────────────────────────────────────────
        const slotY  = boxY + PAD + slotH / 2;
        const slot1X = boxX + PAD + slotW / 2;
        const slot2X = slot1X + slotW + gap;

        this._slots = [];
        [slot1X, slot2X].forEach((sx, i) => {
            const slot = this.buildSlot(sx, slotY, slotW, slotH, i);
            this._slots.push(slot);
        });

        // ── Vùng ý nghĩa — căn giữa dọc trong phần còn lại ─────────────────
        const effectAreaTop = boxY + boxH + 10;
        const effectAreaBot = cy + h / 2 - 16;
        this._effectAreaTop = effectAreaTop;
        this._effectAreaBot = effectAreaBot;
        this._effectCX   = cx;
        this._effectW    = w - padX * 2;
        this._effectObjs = [];
        this.renderEffects();
    }

buildSlot(cx, cy, w, h, idx) {
    const g = this.add.graphics().setDepth(4);
    const r = 14;

    const drawEmpty = () => {
        g.clear();
        // Bóng đổ nhỏ
        g.fillStyle(0x000000, 0.35);
        g.fillRoundedRect(cx - w/2 + 3, cy - h/2 + 4, w, h, r);

        // Nền xanh gradient đậm
        g.fillGradientStyle(0x1a7ab8, 0x1a7ab8, 0x0a3a6a, 0x0a3a6a, 1);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);

        // Gloss trên trái
        g.fillStyle(0xffffff, 0.22);
        g.fillRoundedRect(cx - w/2 + 5, cy - h/2 + 5, w * 0.45, h * 0.18, r - 4);

        // Viền xanh sáng ngoài
        g.lineStyle(3, 0x44ccff, 1);
        g.strokeRoundedRect(cx - w/2, cy - h/2, w, h, r);

        // Nét đứt trắng bên trong
        const ins = 6;
        g.lineStyle(1.2, 0xffffff, 0.45);
        const dash = 8, skip = 5;
        const lx = cx - w/2 + ins, ly = cy - h/2 + ins;
        const lw = w - ins*2, lh = h - ins*2;
        const lr = r - 4;
        // vẽ 4 cạnh đứt nét
        for (let d = lr; d < lw - lr; d += dash + skip) {
            const e = Math.min(d + dash, lw - lr);
            g.beginPath(); g.moveTo(lx + d, ly); g.lineTo(lx + e, ly); g.strokePath();
            g.beginPath(); g.moveTo(lx + d, ly + lh); g.lineTo(lx + e, ly + lh); g.strokePath();
        }
        for (let d = lr; d < lh - lr; d += dash + skip) {
            const e = Math.min(d + dash, lh - lr);
            g.beginPath(); g.moveTo(lx, ly + d); g.lineTo(lx, ly + e); g.strokePath();
            g.beginPath(); g.moveTo(lx + lw, ly + d); g.lineTo(lx + lw, ly + e); g.strokePath();
        }
    };

    const drawActive = () => {
        drawEmpty();
        // Tối nhẹ overlay khi đang active/selected
        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);
        // Viền cyan sáng hơn
        g.lineStyle(3, 0x00eeff, 1);
        g.strokeRoundedRect(cx - w/2, cy - h/2, w, h, r);
    };

    const drawHasCard = () => {
        g.clear();
        g.fillStyle(0x000000, 0.35);
        g.fillRoundedRect(cx - w/2 + 3, cy - h/2 + 4, w, h, r);
        g.fillGradientStyle(0x1a7ab8, 0x1a7ab8, 0x0a3a6a, 0x0a3a6a, 1);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);
        // Viền cyan
        g.lineStyle(2.5, 0x44ccff, 1);
        g.strokeRoundedRect(cx - w/2, cy - h/2, w, h, r);
    };

    drawEmpty();

    const hintTxt = this.add.text(cx, cy, "Chọn\nthẻ bài", {
        fontFamily: "Signika", fontSize: "13px",
        color: "#88ccff", fontStyle: "bold",
        stroke: "#0a2a4a", strokeThickness: 2,
        align: "center",
    }).setOrigin(0.5).setDepth(5).setAlpha(0.7);

    let imgObj = null;
    let sheenG = null;
    let nameLbl = null;

    const clearCard = () => {
        if (imgObj)  { imgObj.destroy();  imgObj  = null; }
        if (sheenG)  { sheenG.destroy();  sheenG  = null; }
        if (nameLbl) { nameLbl.destroy(); nameLbl = null; }
        ref.hasCard = false;
        ref.imgObj  = null;
        hintTxt.setVisible(true);
        drawEmpty();
    };

    const zone = this.add.zone(cx, cy, w, h)
        .setInteractive({ cursor: "pointer" }).setDepth(8);

    zone.on("pointerup", () => {
        if (ref.hasCard) {
            // Bỏ thẻ ra
            this.selectedSlots[idx] = null;
            clearCard();
            this.renderEffects();
            if (this.playerUserId) {
                const ids = this.selectedSlots.filter(Boolean).map(k => parseInt(k.split('_')[1]));
                this.saveActiveTarots(this.playerUserId, ids).catch(() => {});
            }
        } else {
            // Chọn slot này để nhận thẻ
            this.activeSlot = idx;
            this._slots.forEach((s, i) => {
                if (i === idx) s.drawActive();
                else if (!s.hasCard) s.drawEmpty();
            });
        }
    });

    const ref = {
        g, hintTxt, cx, cy, w, h, r,
        hasCard: false, imgObj: null,
        drawEmpty, drawActive, drawHasCard,
        setCard(scene, key) {
            clearCard();
            hintTxt.setVisible(false);
            drawHasCard();

            const img = scene.add.image(cx, cy, key);
            const scale = Math.min(w / img.width, (h - 5) / img.height);
            img.setScale(scale).setDepth(5);
            imgObj = img;
            ref.imgObj = img;
            ref.hasCard = true;

            // Mask bo góc cho ảnh
            const maskG = scene.make.graphics();
            maskG.fillStyle(0xffffff);
            maskG.fillRoundedRect(cx - w/2 + 2, cy - h/2 + 2, w - 4, h - 4, r - 2);
            img.setMask(maskG.createGeometryMask());

            // Sheen
            sheenG = scene.add.graphics().setDepth(7);
            for (let i = 0; i < 5; i++) {
                sheenG.fillStyle(0xffffff, 0.18 * (1 - i / 5));
                sheenG.fillRect(cx - w/2 + 4, cy - h/2 + 4 + i * (h * 0.4 / 5), w * 0.35, h * 0.4 / 5);
            }
            sheenG.setMask(maskG.createGeometryMask());

            // Tên thẻ đã có trong ảnh, không cần label thêm
        }
    };
    return ref;
}

    // Render ý nghĩa thẻ bài đã chọn
    renderEffects() {
        this._effectObjs.forEach(o => o.destroy());
        this._effectObjs = [];

        const cx  = this._effectCX;
        const w   = this._effectW;
        const areaTop = this._effectAreaTop || 0;
        const areaBot = this._effectAreaBot || areaTop + 200;
        const areaH   = areaBot - areaTop;

        const selected = this.selectedSlots.filter(Boolean);

        if (selected.length === 0) {
            const t = this.add.text(cx, areaTop + areaH / 2, "← Chọn thẻ bài để xem tác dụng", {
                fontFamily: "Signika", fontSize: "13px",
                color: "#b08850", fontStyle: "italic",
            }).setOrigin(0.5).setDepth(6);
            this._effectObjs.push(t);
            return;
        }

        // Tính tổng chiều cao để căn giữa dọc
        const BOX_H = 86, BOX_GAP = 10;
        const totalH = selected.length * BOX_H + (selected.length - 1) * BOX_GAP;
        let yy = areaTop + (areaH - totalH) / 2;

        selected.forEach((key) => {
            const data = this.cardData[key];
            if (!data) return;

            const boxX = cx - w / 2;
            const box  = this.add.graphics().setDepth(5);

            // Nền trắng kem
            box.fillStyle(0xffffff, 0.6);
            box.fillRoundedRect(boxX, yy, w, BOX_H, 10);

            // Viền đều 4 cạnh màu của thẻ — mờ nhẹ
            box.lineStyle(1.5, data.color, 0.3);
            box.strokeRoundedRect(boxX, yy, w, BOX_H, 10);

            // Dải màu trái dày hơn (4px) — đậm
            box.fillStyle(data.color, 1);
            box.fillRoundedRect(boxX, yy + 8, 4, BOX_H - 16, 3);

            // Highlight trên
            box.fillStyle(0xffffff, 0.45);
            box.fillRoundedRect(boxX + 6, yy + 4, w - 12, 12, 5);

            this._effectObjs.push(box);

            // Căn giữa dọc: tên ở 1/3 trên, mô tả ở 2/3 dưới
            const nameCY = yy + BOX_H * 0.32;
            const descCY = yy + BOX_H * 0.68;

            // Dot màu
            const dot = this.add.graphics().setDepth(6);
            dot.fillStyle(data.color, 1);
            dot.fillCircle(boxX + 20, nameCY, 6);
            this._effectObjs.push(dot);

            // Tên thẻ
            this._effectObjs.push(this.add.text(boxX + 34, nameCY, data.name, {
                fontFamily: "Signika", fontSize: "15px", color: "#3a1a00", fontStyle: "bold",
            }).setOrigin(0, 0.5).setDepth(6));

            // Cooldown — font lớn hơn, căn phải
            if (data.cooldown_seconds) {
                this._effectObjs.push(this.add.text(boxX + w - 10, nameCY, `⏱ ${data.cooldown_seconds}s`, {
                    fontFamily: "Signika", fontSize: "13px", color: "#8b5e1a",
                }).setOrigin(1, 0.5).setDepth(6));
            }

            // Divider
            const dg = this.add.graphics().setDepth(6);
            dg.lineStyle(1, data.color, 0.25);
            dg.beginPath();
            dg.moveTo(boxX + 12, yy + BOX_H * 0.5);
            dg.lineTo(boxX + w - 12, yy + BOX_H * 0.5);
            dg.strokePath();
            this._effectObjs.push(dg);

            // Mô tả căn giữa dọc phần dưới
            this._effectObjs.push(this.add.text(boxX + 14, descCY, data.effect, {
                fontFamily: "Signika", fontSize: "12px", color: "#5a3010",
                lineSpacing: 2, wordWrap: { width: w - 28 },
            }).setOrigin(0, 0.5).setDepth(6));

            yy += BOX_H + BOX_GAP;
        });
    }

    isCardAlreadySelected(key, excludeSlotIndex) {
        // Kiểm tra xem key đã tồn tại trong selectedSlots ở slot khác với excludeSlotIndex chưa
        for (let i = 0; i < this.selectedSlots.length; i++) {
            if (i !== excludeSlotIndex && this.selectedSlots[i] === key) {
                return true;
            }
        }
        return false;
    }

    // =========================================================================
    // THẺ BÀI — click chọn slot + hiệu ứng đẹp
    // =========================================================================
    createStyledCard(x, y, key, cardW, cardH) {
        const container = this.add.container(x, y);

        // Chỉ load ảnh thẻ, giữ tỷ lệ gốc, fit trong cardW x cardH
        const img = this.add.image(cardW / 2, cardH / 2, key);
        const scale = Math.min(cardW / img.width, cardH / img.height);
        img.setScale(scale);

        container.add(img);

        container.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, cardW, cardH),
            Phaser.Geom.Rectangle.Contains
        );
        container.input.cursor = "pointer";

        container.on("pointerover", () => { img.setTint(0xddeeff); });
        container.on("pointerout",  () => { img.clearTint(); });

        container.on("pointerup", () => {
            if (this._dragMoved) return;

            if (this.isCardAlreadySelected(key, this.activeSlot)) {
                this.showToast("Bạn đã chọn thẻ này ở slot khác!");
                return;
            }

            img.clearTint();
            // Glow sáng nhẹ fade out
            const glow = this.add.graphics().setDepth(50);
            glow.fillStyle(0xffffff, 0.22);
            glow.fillRoundedRect(0, 0, cardW, cardH, 10);
            container.add(glow);
            this.tweens.add({ targets: glow, alpha: 0, duration: 400, ease: "Sine.easeOut", onComplete: () => glow.destroy() });

            const worldX = (this.cardContainer?.x || 0) + x + cardW / 2;
            const worldY = (this.cardContainer?.y || 0) + y + cardH / 2;
            this._playEquipEffect(worldX, worldY, this._slots[this.activeSlot]);

            this._slots[this.activeSlot].setCard(this, key);
            this.selectedSlots[this.activeSlot] = key;
            this.renderEffects();

            if (this.playerUserId) {
                const ids = this.selectedSlots.filter(Boolean).map(k => parseInt(k.split('_')[1]));
                this.saveActiveTarots(this.playerUserId, ids).catch(() => {});
            }

            if (this.activeSlot === 0 && !this._slots[1].hasCard) {
                this.activeSlot = 1; this._slots[1].drawActive();
            } else if (this.activeSlot === 1 && !this._slots[0].hasCard) {
                this.activeSlot = 0; this._slots[0].drawActive();
            }
        });

        return container;
    }

    // Hiệu ứng tia sáng khi trang bị thẻ
    _playEquipEffect(fromX, fromY, slot) {
        const toX = slot.cx;
        const toY = slot.cy;

        // Ngôi sao bay lướt nhẹ từ card đến slot
        const star = this.add.text(fromX, fromY, "✦", {
            fontSize: "18px", color: "#eeffff",
            stroke: "#88ccff", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50).setAlpha(0.9);

        this.tweens.add({
            targets: star,
            x: toX, y: toY,
            alpha: 0,
            scaleX: 0.4, scaleY: 0.4,
            duration: 320,
            ease: "Sine.easeIn",
            onComplete: () => star.destroy()
        });
    }

    showToast(msg, color = "#ff6644", duration = 1800) {
        const { width, height } = this.scale;
        const t = this.add.text(width / 2, height - 80, msg, {
            fontFamily: "Signika", fontSize: "15px",
            color: color, fontStyle: "bold",
            stroke: "#000000", strokeThickness: 3,
            backgroundColor: "#00000088",
            padding: { x: 14, y: 8 },
        }).setOrigin(0.5).setDepth(300).setAlpha(0);

        this.tweens.add({
            targets: t, alpha: 1, y: height - 100,
            duration: 200, ease: "Back.easeOut",
            onComplete: () => {
                this.time.delayedCall(duration, () => {
                    this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
                });
            }
        });
    }

    // createDashedPanel GIỮ NGUYÊN (không dùng nữa nhưng để tránh lỗi nếu có gọi)
    createDashedPanel(x, y, w, h, radius) {
        this.createStyledPanel(x, y, w, h, radius);
    }

    async fetchTarots() {
    const res = await fetch(`${SERVER_URL}/tarots`);
    const json = await res.json();

    if (!json.success) {
        throw new Error(json.message || "Không lấy được danh sách tarot");
    }

    return json.data || [];
}

async fetchActiveTarots(userId) {
    const res = await fetch(`${SERVER_URL}/users/${userId}/tarots/active`);
    const json = await res.json();

    if (!json.success) return [];
    return json.active_tarot_ids || [];
}

async saveActiveTarots(userId, tarotIds) {
    const res = await fetch(`${SERVER_URL}/users/${userId}/tarots/active`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ tarotIds })
    });

    return await res.json();
}

getTarotColor(effectType) {
    const map = {
        skip_turn_enemy:           0xe84060,  // đỏ hồng — bỏ lượt địch
        extra_roll:                0xffcc00,  // vàng — thêm lượt tung
        steal_cash_percent:        0xff6600,  // cam — ăn cắp tiền
        move_forward_range:        0x44aaff,  // xanh dương — tiến nhanh
        tax_multiplier:            0xaa44ff,  // tím — thuế
        bonus_cash_percent:        0x44dd88,  // xanh lá — thưởng tiền
        recover_house_money:       0x88ccff,  // xanh nhạt — thu hồi nhà
        destroy_enemy_house:       0xff3366,  // đỏ — phá nhà
        swap_planet:               0x9966ff,  // tím xanh — hoán đổi
        bonus_starting_cash_percent: 0xf5a623, // vàng cam — Tài Phú
        protect_planet_turns:      0x4488ff,  // xanh dương — Bảo Vệ
    };

    return map[effectType] || 0xc08a40;
}

async loadTarotAssetsFromServer() {
    try {
        this.tarotList = await this.fetchTarots();
    } catch (e) {
        console.warn("Failed to load tarots from server:", e);
        this.tarotList = [];
    }
    this.cardData = {};

    if (!this.tarotList.length) return;

    // Xây cardData
    this.tarotList.forEach((tarot) => {
        const key = `tarot_${tarot.id}`;
        this.cardData[key] = {
            id: tarot.id,
            name: tarot.name,
            effect: tarot.description || "Chưa có mô tả",
            color: this.getTarotColor(tarot.effect_type),
            cooldown_seconds: tarot.cooldown_seconds || 0,
            effect_type: tarot.effect_type,
        };
    });

    // Load ảnh: chỉ load những key chưa có trong texture cache
    const toLoad = this.tarotList.filter(tarot => {
        const key = `tarot_${tarot.id}`;
        return !this.textures.exists(key);
    });

    if (!toLoad.length) return;

    await new Promise((resolve) => {
        let loaded = 0;
        const total = toLoad.length;
        const done = () => { if (++loaded >= total) resolve(); };

        this.load.on("filecomplete", done);
        this.load.on("loaderror", (file) => {
            console.warn("Tarot image load error:", file.key, file.src);
            done();
        });
        toLoad.forEach((tarot) => {
            const key = `tarot_${tarot.id}`;
            const iconValid = tarot.icon && (tarot.icon.includes('/') || tarot.icon.startsWith('http'));
            const imgPath = iconValid ? tarot.icon : `assets/resources/Tarot/thebai_${tarot.id}.png`;
            this.load.image(key, imgPath);
        });
        this.load.start();
    });
}
}