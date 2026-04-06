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
        this.load.image("tarot-bg",    "assets/ui/nen_chung.png");
        this.load.image("out",         "assets/ui/shared/return.png");
        // Removed hardcoded tarot preloads and unused assets
    }

    async create() {
        const { width, height } = this.scale;

        try {
            this.playerData = JSON.parse(localStorage.getItem("playerData"));
        } catch (e) {
            this.playerData = null;
        }

        this.playerUserId = this.playerData?.user_id || this.playerData?.user?.id || null;

        // 0. Lấy danh sách tarot và preload ảnh động
        await this.loadTarotAssetsFromServer();

        // 1. BACKGROUND
        const bg = this.add.image(width / 2, height / 2, "tarot-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // 2. THÔNG SỐ LAYOUT
        const gap = 25;
        const leftWidth = 400;
        const rightWidth = 650;
        const panelHeight = 520;
        const totalUIWidth = leftWidth + rightWidth + gap;

        const startX = (width - totalUIWidth) / 2;
        const leftPanelX = startX + leftWidth / 2;
        const rightPanelX = startX + leftWidth + gap + rightWidth / 2;
        const panelsY = height * 0.5;

        // 3. VẼ 2 PANEL
        this.createStyledPanel(leftPanelX,  panelsY, leftWidth,  panelHeight, 22);
        this.createStyledPanel(rightPanelX, panelsY, rightWidth, panelHeight, 22);

        // 4. PANEL TRÁI: ô slot và tác dụng
        this.buildLeftContent(leftPanelX, panelsY, leftWidth, panelHeight);

        // 5. Load active tarots nếu user đã đăng nhập (có _slots)
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

        // 6. PANEL PHẢI: render danh sách thẻ
        const cardKeys = this.tarotList.map(t => `tarot_${t.id}`);
        if (cardKeys.length === 0) {
            this.add.text(rightPanelX, panelsY, "Chưa có thẻ tarot.", {
                fontFamily: "Signika", fontSize: "18px", color: "#8b5e1a"
            }).setOrigin(0.5);
            return;
        }

        const rows     = 2;
        const cols     = Math.ceil(cardKeys.length / rows);
        const padding  = 22;
        const cardGapX = 14;
        const cardGapY = 14;

        const availW   = rightWidth - padding * 2 - cardGapX * (cols - 1);
        const cardWidth  = availW / cols;
        const cardHeight = cardWidth / 0.68;

        const availH    = panelHeight - padding * 2 - cardGapY * (rows - 1);
        const cardHeightFinal = Math.min(cardHeight, availH / rows);
        const cardWidthFinal  = cardHeightFinal * 0.68;

        const totalGridW = cardWidthFinal * cols + cardGapX * (cols - 1);
        const totalGridH = cardHeightFinal * rows + cardGapY * (rows - 1);
        const gridStartX = rightPanelX - totalGridW / 2;
        const gridStartY = panelsY - totalGridH / 2;

        this.cardContainer = this.add.container(gridStartX, gridStartY);
        this.cardContainer.setDepth(20);

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const idx = col * rows + row;
                if (idx >= cardKeys.length) continue;
                const key = cardKeys[idx];
                const cx  = col * (cardWidthFinal + cardGapX);
                const cy  = row * (cardHeightFinal + cardGapY);
                const card = this.createStyledCard(cx, cy, key, cardHeightFinal);
                this.cardContainer.add(card);
            }
        }

        this.minX = gridStartX;
        this.maxX = gridStartX;

        const maskInset = 12;
        const maskShape = this.make.graphics();
        maskShape.fillRoundedRect(
            rightPanelX - rightWidth / 2 + maskInset,
            panelsY - panelHeight / 2 + maskInset,
            rightWidth - maskInset * 2,
            panelHeight - maskInset * 2,
            22
        );
        this.cardContainer.setMask(maskShape.createGeometryMask());

        // 7. DRAG EVENTS
        this._pDownX    = 0;
        this._dragMoved = false;

        this.input.on("pointerdown", (p) => {
            if (p.x > rightPanelX - rightWidth / 2) {
                this.isDragging = true;
                this.dragX      = p.x;
                this._pDownX    = p.x;
                this._dragMoved = false;
                this.velocityX  = 0;
            }
        });
        this.input.on("pointermove", (p) => {
            if (!this.isDragging) return;
            if (Math.abs(p.x - this._pDownX) > 8) this._dragMoved = true;
            if (this._dragMoved) {
                const delta = p.x - this.dragX;
                this.cardContainer.x += delta;
                this.dragX     = p.x;
                this.velocityX = delta;
            }
        });
        this.input.on("pointerup",  () => { this.isDragging = false; });
        this.input.on("pointerout", () => { this.isDragging = false; });

        // 8. NÚT BACK
        const backBtn = this.add.image(32, 32, "out")
            .setScale(0.9).setDepth(200)
            .setInteractive({ cursor: "pointer" });
        backBtn.on("pointerover", () => backBtn.setTint(0xdddddd));
        backBtn.on("pointerout",  () => backBtn.clearTint());
        backBtn.on("pointerup",   () => {
            this.cameras.main.fadeOut(200);
            this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LobbyScene"));
        });
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

    showToast(message) {
        const { width, height } = this.scale;
        const toast = this.add.text(width / 2, height - 100, message, {
            fontFamily: "Signika", fontSize: "20px", color: "#ffffff",
            backgroundColor: "#000000aa", padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setDepth(300);
        toast.setStroke("#000000", 2);

        this.tweens.add({
            targets: toast, y: height - 120, alpha: { from: 1, to: 0 },
            duration: 2500, ease: "Sine.easeOut", onComplete: () => toast.destroy()
        });
    }

    // =========================================================================
    // PANEL ĐẸP — thay thế createDashedPanel cũ
    // =========================================================================
    createStyledPanel(x, y, w, h, radius) {
        const g = this.add.graphics().setDepth(2);
        const left = x - w / 2;
        const top  = y - h / 2;

        // Bóng đổ
        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(left + 5, top + 7, w, h, radius);

        // Nền kem ấm
        g.fillStyle(0xfff0d0, 1);
        g.fillRoundedRect(left, top, w, h, radius);

        // Highlight trên (giả gradient sáng)
        g.fillStyle(0xffffff, 0.4);
        g.fillRoundedRect(left + 4, top + 4, w - 8, h * 0.18, radius);

        // Viền nâu đậm ngoài
        g.lineStyle(4, 0x8b5e1a, 1);
        g.strokeRoundedRect(left, top, w, h, radius);

        // Viền nét đứt vàng bên trong
        const inset = 10;
        const r2 = radius - 4;
        this.drawDashedBorder(
            g,
            left + inset, top + inset,
            w - inset * 2, h - inset * 2,
            r2, 0xc8a060, 2
        );
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

        // Cạnh — chừa chỗ cho góc bo
        drawSeg(left + r, top,          left + w - r, top);
        drawSeg(left + w, top + r,      left + w,     top + h - r);
        drawSeg(left + w - r, top + h,  left + r,     top + h);
        drawSeg(left,  top + h - r,     left,         top + r);

        // Góc bo
        const corners = [
            { a: 180, b: 270, cx: left + r,     cy: top + r },
            { a: 270, b: 360, cx: left + w - r, cy: top + r },
            { a: 0,   b: 90,  cx: left + w - r, cy: top + h - r },
            { a: 90,  b: 180, cx: left + r,     cy: top + h - r },
        ];
        corners.forEach(c => {
            g.beginPath();
            g.arc(c.cx, c.cy, r, Phaser.Math.DegToRad(c.a), Phaser.Math.DegToRad(c.b));
            g.strokePath();
        });
    }

    // =========================================================================
    // PANEL TRÁI — 2 slot + hiển thị ý nghĩa thẻ
    // =========================================================================
    buildLeftContent(cx, cy, w, h) {
        const top    = cy - h / 2;
        const padX   = 30;

        // ── Tiêu đề ──────────────────────────────────────────────────────────
        const titleBg = this.add.graphics().setDepth(5);
        titleBg.fillStyle(0xd4a030, 1);
        titleBg.fillRoundedRect(cx - 90, top + 14, 180, 30, 15);
        titleBg.fillStyle(0xfff0a0, 0.45);
        titleBg.fillRoundedRect(cx - 88, top + 15, 176, 13, 10);
        titleBg.lineStyle(2, 0x8b5e1a, 1);
        titleBg.strokeRoundedRect(cx - 90, top + 14, 180, 30, 15);

        this.add.text(cx, top + 29, "Thẻ Đã Chọn", {
            fontFamily: "Signika", fontSize: "16px",
            color: "#5a2d00", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(6);

        // ── 2 Slot thẻ ───────────────────────────────────────────────────────
        const slotW  = 130;
        const slotH  = 180;
        const slotY  = top + 60 + slotH / 2;
        const slot1X = cx - slotW / 2 - 12;
        const slot2X = cx + slotW / 2 + 12;

        this._slots = [];
        [slot1X, slot2X].forEach((sx, i) => {
            const slot = this.buildSlot(sx, slotY, slotW, slotH, i);
            this._slots.push(slot);
        });

        // ── Divider ───────────────────────────────────────────────────────────
        const divY = slotY + slotH / 2 + 16;
        const dg = this.add.graphics().setDepth(5);
        dg.lineStyle(1.5, 0xc8a060, 0.8);
        dg.beginPath();
        dg.moveTo(cx - w / 2 + padX, divY);
        dg.lineTo(cx + w / 2 - padX, divY);
        dg.strokePath();

        // Nhãn "Tác dụng"
        const lblBg = this.add.graphics().setDepth(5);
        lblBg.fillStyle(0xfff0d0, 1);
        lblBg.fillRect(cx - 40, divY - 8, 80, 16);
        this.add.text(cx, divY, "✦  Tác Dụng  ✦", {
            fontFamily: "Signika", fontSize: "12px",
            color: "#8b5e1a", fontStyle: "italic",
        }).setOrigin(0.5).setDepth(6);

        // ── Vùng ý nghĩa ─────────────────────────────────────────────────────
        this._effectY    = divY + 20;
        this._effectCX   = cx;
        this._effectW    = w - padX * 2;
        this._effectObjs = [];
        this.renderEffects();
    }

buildSlot(cx, cy, w, h, idx) {
    const g = this.add.graphics().setDepth(4);
    const r = 12;

    const drawFrameBase = () => {
        g.clear();
        // Bóng đổ
        g.fillStyle(0x000000, 0.30);
        g.fillRoundedRect(cx - w/2 + 4, cy - h/2 + 5, w, h, r);

        // Nền gradient cam vàng (giả bằng 3 lớp)
        g.fillStyle(0x803000, 1);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);
        g.fillStyle(0xf08010, 0.9);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h * 0.7, r);
        g.fillStyle(0xffd040, 0.7);
        g.fillRoundedRect(cx - w/2, cy - h/2, w, h * 0.30, r);

        // Viền vàng dày ngoài
        g.lineStyle(5, 0xffe060, 1);
        g.strokeRoundedRect(cx - w/2, cy - h/2, w, h, r);

        // Viền vàng mỏng bên trong
        g.lineStyle(1.5, 0xffd030, 0.7);
        g.strokeRoundedRect(cx - w/2 + 7, cy - h/2 + 7, w - 14, h - 14, r - 3);
    };

    const drawSheen = (targetGraphics, depth) => {
        const sg = targetGraphics || this.add.graphics().setDepth(depth || 7);

        // Dải sheen trái (rộng, sáng hơn)
        for (let i = 0; i < 8; i++) {
            const alpha = 0.32 * (1 - i / 8);
            sg.fillStyle(0xffffff, alpha);
            sg.fillRect(
                cx - w/2 + 4,
                cy - h/2 + 4 + i * (h * 0.58 / 8),
                w * 0.33,
                h * 0.58 / 8
            );
        }
        // Dải sheen phải (hẹp, mờ hơn)
        for (let i = 0; i < 6; i++) {
            const alpha = 0.16 * (1 - i / 6);
            sg.fillStyle(0xffffff, alpha);
            sg.fillRect(
                cx - w/2 + 4 + w * 0.33 + 4,
                cy - h/2 + 4 + i * (h * 0.45 / 6),
                w * 0.16,
                h * 0.45 / 6
            );
        }

        // Mask để sheen không ra ngoài bo tròn
        const mask = this.make.graphics();
        mask.fillStyle(0xffffff);
        mask.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);
        sg.setMask(mask.createGeometryMask());
        return { sg, mask };
    };

    const drawEmpty = () => {
        drawFrameBase();
        drawSheen(g, 4); // vẽ sheen vào cùng graphics (depth 4)
    };

    const drawActive = () => {
        drawFrameBase();
        // Thêm glow vàng khi active
        g.lineStyle(7, 0xffee00, 0.5);
        g.strokeRoundedRect(cx - w/2 - 2, cy - h/2 - 2, w + 4, h + 4, r + 2);
        drawSheen(g, 4);
    };

    drawEmpty();

    const hintTxt = this.add.text(cx, cy, "Chọn\nthẻ bài", {
        fontFamily: "Signika", fontSize: "13px",
        color: "#ffe090", align: "center",
    }).setOrigin(0.5).setDepth(5);

    let imgObj = null;
    let _sheenObjs = [];

    const zone = this.add.zone(cx, cy, w, h)
        .setInteractive({ cursor: "pointer" }).setDepth(6);
    zone.on("pointerup", () => {
        this.activeSlot = idx;
        this._slots.forEach((s, i) => {
            if (i === idx) s.drawActive();
            else if (!s.hasCard) s.drawEmpty();
        });
    });

    const ref = {
        g, hintTxt, imgObj, cx, cy, w, h, r,
        hasCard: false, drawEmpty, drawActive,
        setCard(scene, key) {
            if (imgObj) { imgObj.destroy(); imgObj = null; }
            _sheenObjs.forEach(o => { if (o.destroy) o.destroy(); });
            _sheenObjs = [];
            hintTxt.setVisible(false);

            // Vẽ khung nền
            drawFrameBase();

            // Ảnh thẻ (depth 5, nằm trên nền)
            const img = scene.add.image(cx, cy, key);
            const scale = Math.min((w - 10) / img.width, (h - 10) / img.height);
            img.setScale(scale).setDepth(5);
            imgObj = img;
            ref.imgObj = img;
            ref.hasCard = true;

            // Sheen đè lên ảnh (depth 7)
            const sheenG = scene.add.graphics().setDepth(7);
            const { sg, mask } = scene._slots[0] // workaround: gọi drawSheen qua scene
                ? (() => {
                    // vẽ sheen thủ công
                    for (let i = 0; i < 8; i++) {
                        const alpha = 0.32 * (1 - i / 8);
                        sheenG.fillStyle(0xffffff, alpha);
                        sheenG.fillRect(
                            cx - w/2 + 4,
                            cy - h/2 + 4 + i * (h * 0.58 / 8),
                            w * 0.33, h * 0.58 / 8
                        );
                    }
                    for (let i = 0; i < 6; i++) {
                        const alpha = 0.16 * (1 - i / 6);
                        sheenG.fillStyle(0xffffff, alpha);
                        sheenG.fillRect(
                            cx - w/2 + 4 + w * 0.33 + 4,
                            cy - h/2 + 4 + i * (h * 0.45 / 6),
                            w * 0.16, h * 0.45 / 6
                        );
                    }
                    const m = scene.make.graphics();
                    m.fillStyle(0xffffff);
                    m.fillRoundedRect(cx - w/2, cy - h/2, w, h, r);
                    sheenG.setMask(m.createGeometryMask());
                    return { sg: sheenG, mask: m };
                  })()
                : { sg: sheenG, mask: null };

            _sheenObjs.push(sheenG, mask);
        }
    };
    return ref;
}

    // Render ý nghĩa thẻ bài đã chọn
    renderEffects() {
        // Xóa objects cũ
        this._effectObjs.forEach(o => o.destroy());
        this._effectObjs = [];

        const cx   = this._effectCX;
        const w    = this._effectW;
        let   yy   = this._effectY;

        const selected = this.selectedSlots.filter(Boolean);

        if (selected.length === 0) {
            const t = this.add.text(cx, yy + 50, "← Chọn thẻ bài để\n    xem tác dụng", {
                fontFamily: "Signika", fontSize: "13px",
                color: "#a07840", align: "left", lineSpacing: 5,
            }).setOrigin(0.5).setDepth(5);
            this._effectObjs.push(t);
            return;
        }

        selected.forEach((key, i) => {
            const data = this.cardData[key];
            if (!data) return;

            // Hộp tác dụng
            const boxH  = 95;
            const boxX  = cx - w / 2;
            const box   = this.add.graphics().setDepth(5);

            // Nền hộp với màu của thẻ
            box.fillStyle(data.color, 0.12);
            box.fillRoundedRect(boxX, yy, w, boxH, 10);
            box.lineStyle(2, data.color, 0.7);
            box.strokeRoundedRect(boxX, yy, w, boxH, 10);
            // Dải màu trái
            box.fillStyle(data.color, 0.85);
            box.fillRoundedRect(boxX, yy, 5, boxH, 4);
            this._effectObjs.push(box);

            // Tên thẻ
            const nameT = this.add.text(boxX + 14, yy + 9, data.name, {
                fontFamily: "Signika", fontSize: "14px",
                color: "#4a2000", fontStyle: "bold",
            }).setOrigin(0, 0).setDepth(6);
            this._effectObjs.push(nameT);

            // Hiệu ứng / mô tả
            const effT = this.add.text(boxX + 14, yy + 30, data.effect, {
                fontFamily: "Signika", fontSize: "12px",
                color: "#6b3a00", lineSpacing: 4,
                wordWrap: { width: w - 20 },
            }).setOrigin(0, 0).setDepth(6);
            this._effectObjs.push(effT);

            yy += boxH + 10;
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
    // THẺ BÀI (GIỮ NGUYÊN + THÊM CLICK CHỌN SLOT)
    // =========================================================================
    createStyledCard(x, y, key, targetHeight) {
        const container   = this.add.container(x, y);
        const radius      = 6;
        const borderColor = 0xf4e538;

        const img = this.add.image(0, 0, key).setOrigin(0);
        const scale = targetHeight / img.height;
        img.setScale(scale);
        const targetWidth = img.width * scale;

        const border = this.add.graphics();
        border.lineStyle(4, borderColor);
        border.strokeRoundedRect(0, 0, targetWidth, targetHeight, radius);

        const hover = this.add.graphics();

        container.add([img, border, hover]);

        // Hit area tường minh — dùng Rectangle thay vì setSize để tránh lệch
        container.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, targetWidth, targetHeight),
            Phaser.Geom.Rectangle.Contains
        );
        container.input.cursor = "pointer";

        container.on("pointerover", () => {
            hover.clear();
            hover.fillStyle(0xffffff, 0.18);
            hover.fillRoundedRect(0, 0, targetWidth, targetHeight, radius);
            border.clear();
            border.lineStyle(4, 0xffffff, 1);
            border.strokeRoundedRect(0, 0, targetWidth, targetHeight, radius);
            this.tweens.add({ targets: container, scaleX: 1.01, scaleY: 1.01, duration: 90, ease: "Back.easeOut" });
        });
        container.on("pointerout", () => {
            hover.clear();
            border.clear();
            border.lineStyle(4, borderColor);
            border.strokeRoundedRect(0, 0, targetWidth, targetHeight, radius);
            this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 90, ease: "Sine.easeOut" });
        });

        // Click — chỉ kích hoạt khi KHÔNG drag
        container.on("pointerup", () => {
            if (this._dragMoved) return;

            const slot = this._slots[this.activeSlot];
            const cardKey = key;

            if (this.isCardAlreadySelected(cardKey, this.activeSlot)) {
                this.showToast("Bạn đã chọn thẻ này ở slot khác!");
                return;
            }

            slot.setCard(this, key);
            this.selectedSlots[this.activeSlot] = key;
            this.renderEffects();

            // Save to server
            if (this.playerUserId) {
                const selectedIds = this.selectedSlots.filter(Boolean).map(k => parseInt(k.split('_')[1]));
                this.saveActiveTarots(this.playerUserId, selectedIds).catch(e => console.warn("Failed to save active tarots:", e));
            }

            // Hiệu ứng flash xác nhận
            hover.clear();
            hover.fillStyle(0xffff88, 0.45);
            hover.fillRoundedRect(0, 0, targetWidth, targetHeight, radius);
            this.time.delayedCall(220, () => { hover.clear(); });

            // Tự động chuyển sang slot còn trống
            if (this.activeSlot === 0 && !this._slots[1].hasCard) {
                this.activeSlot = 1;
                this._slots[1].drawActive();
            } else if (this.activeSlot === 1 && !this._slots[0].hasCard) {
                this.activeSlot = 0;
                this._slots[0].drawActive();
            }
        });

        return container;
    }

    // createDashedPanel GIỮ NGUYÊN (không dùng nữa nhưng để tránh lỗi nếu có gọi)
    createDashedPanel(x, y, w, h, radius) {
        this.createStyledPanel(x, y, w, h, radius);
    }

    async fetchTarots() {
    const res = await fetch("http://localhost:3000/tarots");
    const json = await res.json();

    if (!json.success) {
        throw new Error(json.message || "Không lấy được danh sách tarot");
    }

    return json.data || [];
}

async fetchActiveTarots(userId) {
    const res = await fetch(`http://localhost:3000/users/${userId}/tarots/active`);
    const json = await res.json();

    if (!json.success) return [];
    return json.active_tarot_ids || [];
}

async saveActiveTarots(userId, tarotIds) {
    const res = await fetch(`http://localhost:3000/users/${userId}/tarots/active`, {
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
        skip_turn_enemy: 0xe84060,
        extra_roll: 0xffcc00,
        steal_cash_percent: 0xff6600,
        move_forward_range: 0x44aaff,
        tax_multiplier: 0xaa44ff,
        bonus_cash_percent: 0x44dd88,
        recover_house_money: 0x88ccff,
        destroy_enemy_house: 0xff3366,
        swap_planet: 0x9966ff
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

        // Bỏ qua giá trị icon từ DB nếu nó không phải là file path hợp lệ
        const imgPath = (tarot.icon && tarot.icon.includes('/')) 
            ? tarot.icon 
            : `assets/resources/Tarot/thebai_${tarot.id}.png`;
            
        this.load.image(key, imgPath);
    });

    await new Promise((resolve) => {
        this.load.once("complete", resolve);
        this.load.start();
    });
}
}