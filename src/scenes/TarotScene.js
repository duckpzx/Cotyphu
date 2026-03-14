export default class TarotScene extends Phaser.Scene {
    constructor() {
        super("TarotScene");
        // Khởi tạo các biến điều khiển scroll
        this.isDragging = false;
        this.dragX = 0;
        this.velocityX = 0;
        this.cardContainer = null;
        this.minX = 0;
        this.maxX = 0;
    }

    preload() {
        // Load các tài nguyên UI
        this.load.image("tarot-bg", "assets/ui/nen_chung.png");
        this.load.image("out", "assets/ui/shared/return.png");
        this.load.image("card-slot", "assets/ui/tarot/card.png");
        this.load.image("arrow-left", "assets/ui/shared/arrow-left.png");
        this.load.image("arrow-right", "assets/ui/shared/arrow-right.png");

        // Load 8 lá bài mẫu (tarot1 -> tarot8)
        for (let i = 1; i <= 8; i++) {
            this.load.image(`tarot${i}`, `assets/resources/Tarot/thebai_${i}.png`);
        }
    }

    create() {
        const { width, height } = this.scale;

        // 1. BACKGROUND
        const bg = this.add.image(width / 2, height / 2, "tarot-bg");
        bg.setScale(Math.max(width / bg.width, height / bg.height));

        // 2. THÔNG SỐ LAYOUT (CĂN GIỮA TUYỆT ĐỐI)
        const gap = 25;
        const leftWidth = 400;
        const rightWidth = 650;
        const panelHeight = 520;
        const totalUIWidth = leftWidth + rightWidth + gap;
        
        const startX = (width - totalUIWidth) / 2;
        const leftPanelX = startX + leftWidth / 2;
        const rightPanelX = startX + leftWidth + gap + rightWidth / 2;
        const panelsY = height * 0.5;

        // Vẽ 2 Panel chính với đường nét đứt
        this.createDashedPanel(leftPanelX, panelsY, leftWidth, panelHeight, 22);
        this.createDashedPanel(rightPanelX, panelsY, rightWidth, panelHeight, 22);

        // 3. NỘI DUNG PANEL TRÁI (STATS)
        this.add.image(leftPanelX - 75, panelsY - 110, "card-slot").setScale(0.8);
        this.add.image(leftPanelX + 75, panelsY - 110, "card-slot").setScale(0.8);
        
        const textStyle = { fontFamily: "Signika", fontSize: "20px", color: "#333" };
        this.add.text(leftPanelX - 75, panelsY + 10, "2732", textStyle).setOrigin(0.5);
        this.add.text(leftPanelX + 75, panelsY + 10, "2922", textStyle).setOrigin(0.5);
        this.add.text(leftPanelX, panelsY + 75, "Chỉ số", { ...textStyle, fontSize: "26px", fontStyle: "bold" }).setOrigin(0.5);

        const statsData = [150, 52, 3647, 3305];
        statsData.forEach((val, i) => {
            const sx = leftPanelX - 90 + (i % 2) * 180;
            const sy = panelsY + 130 + Math.floor(i / 2) * 50;
            this.add.text(sx, sy, val.toString(), textStyle).setOrigin(0.5);
        });

        // 4. PANEL PHẢI (SCROLLABLE GRID)
        const cardKeys = ["tarot1", "tarot2", "tarot3", "tarot4", "tarot5", "tarot6", "tarot7", "tarot8"];
        const rows = 2;
        const padding = 25; 
        const cardGapX = 15;
        const cardGapY = 15;
        const cardHeight = (panelHeight - (padding * 2) - cardGapY) / rows;

        // Container chứa danh sách bài
        this.cardContainer = this.add.container(rightPanelX - rightWidth / 2 + padding, panelsY - panelHeight / 2 + padding);
        
        let currentX = 0;
        for (let i = 0; i < cardKeys.length; i += rows) {
            for (let r = 0; r < rows; r++) {
                const key = cardKeys[i + r];
                if (key) {
                    const styledCard = this.createStyledCard(currentX, r * (cardHeight + cardGapY), key, cardHeight);
                    this.cardContainer.add(styledCard);
                }
            }
            currentX += (cardHeight * 0.72) + cardGapX;
        }

        // Cấu hình giới hạn cuộn
        this.minX = rightPanelX - rightWidth / 2 + padding;
        this.maxX = this.minX - (currentX - rightWidth + (padding * 2));
        if (this.maxX > this.minX) this.maxX = this.minX;

        // MASK (Cắt ảnh sắc cạnh tại biên trong)
        const maskInset = 12;
        const maskShape = this.make.graphics();
        maskShape.fillRoundedRect(
            rightPanelX - rightWidth / 2 + maskInset, 
            panelsY - panelHeight / 2 + maskInset, 
            rightWidth - (maskInset * 2), 
            panelHeight - (maskInset * 2), 
            22
        );
        this.cardContainer.setMask(maskShape.createGeometryMask());

        // 5. HIỆU ỨNG GRADIENT TRANSPARENT (FADE-OUT TẠI BIÊN PHẢI)
        // Lưu ý: Thay đổi màu 0x1a4ba0 bằng mã màu nền xanh chính xác của bạn
        const fadeColor = 0xfefed4; 
        const fadeWidth = 50;
        const fadeX = rightPanelX + rightWidth / 2 - fadeWidth - 10;
        const fadeY = panelsY - panelHeight / 2 + 10;

        const gradientFade = this.add.graphics();
        // fillGradientStyle(topLeft, topRight, bottomLeft, bottomRight, alphaTopLeft, alphaTopRight, alphaBottomLeft, alphaBottomRight)
        gradientFade.fillGradientStyle(fadeColor, fadeColor, fadeColor, fadeColor, 0, 1, 0, 1);
        gradientFade.fillRect(fadeX, fadeY, fadeWidth, panelHeight - 20);
        gradientFade.setDepth(10); // Đảm bảo nằm trên thẻ bài nhưng dưới border ngoài

        // 6. EVENT XỬ LÝ VUỐT (DRAG)
        this.input.on("pointerdown", (p) => {
            if (p.x > rightPanelX - rightWidth / 2) {
                this.isDragging = true;
                this.dragX = p.x;
                this.velocityX = 0;
            }
        });

        this.input.on("pointermove", (p) => {
            if (this.isDragging) {
                const delta = p.x - this.dragX;
                this.cardContainer.x += delta;
                this.dragX = p.x;
                this.velocityX = delta;
            }
        });

        this.input.on("pointerup", () => { this.isDragging = false; });
        this.input.on("pointerout", () => { this.isDragging = false; });

        // // Nút Lobby
        // this.add.text(30, 20, "← Lobby", { fontFamily: "Signika", fontSize: "28px", color: "#fff" })
        //     .setInteractive({ cursor: "pointer" })
        //     .on("pointerup", () => this.scene.start("LobbyScene"));

        const backBtn = this.add.image(50, 30, "out")
          .setScale(1)
          .setDepth(200)
          .setInteractive({ cursor: "pointer" });

        backBtn.on("pointerup", () => {

          this.cameras.main.fadeOut(200);

          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("LobbyScene");
          });

        });
    }

    update() {
        // Xử lý Quán tính (Inertia) và Đàn hồi (Rubber Banding)
        if (!this.isDragging) {
            this.cardContainer.x += this.velocityX;
            this.velocityX *= 0.92; // Ma sát

            if (this.cardContainer.x > this.minX) {
                this.cardContainer.x = Phaser.Math.Linear(this.cardContainer.x, this.minX, 0.15);
                this.velocityX = 0;
            } else if (this.cardContainer.x < this.maxX) {
                this.cardContainer.x = Phaser.Math.Linear(this.cardContainer.x, this.maxX, 0.15);
                this.velocityX = 0;
            }
        }
    }

    // HÀM TẠO LÁ BÀI CÓ VIỀN VÀ BO GÓC
    createStyledCard(x, y, key, targetHeight) {
        const container = this.add.container(x, y);
        const radius = 6;
        const borderColor = 0xf4e538;

        const img = this.add.image(0, 0, key).setOrigin(0);
        const scale = targetHeight / img.height;
        img.setScale(scale);
        const targetWidth = img.width * scale;

        // Vẽ viền cho lá bài
        const border = this.add.graphics();
        border.lineStyle(4, borderColor);
        border.strokeRoundedRect(0, 0, targetWidth, targetHeight, radius);

        container.add([img, border]);
        container.setSize(targetWidth, targetHeight);
        
        // Hiệu ứng Hover nhẹ
        // container.setInteractive({ cursor: 'pointer' })
        //     .on('pointerover', () => container.setScale(1.03))
        //     .on('pointerout', () => container.setScale(1));

        return container;
    }

    // HÀM VẼ PANEL NÉT ĐỨT
    createDashedPanel(x, y, w, h, radius) {

    const g = this.add.graphics();

    const left = x - w / 2;
    const top = y - h / 2;

    // PANEL FILL
    g.fillStyle(0xffe7c3, 1);
    g.fillRoundedRect(left, top, w, h, radius);

    // BORDER STYLE
    g.lineStyle(3, 0xb7a36d);

    const inset = 12;
    const r = radius - inset / 2;

    const iL = left + inset;
    const iR = x + w / 2 - inset;
    const iT = top + inset;
    const iB = y + h / 2 - inset;

    // ===== FUNCTION VẼ NÉT ĐỨT =====
    const drawD = (x1, y1, x2, y2) => {

        const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
        const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);

        for (let i = 0; i < dist; i += 18) {

        g.beginPath();

        g.moveTo(
            x1 + Math.cos(angle) * i,
            y1 + Math.sin(angle) * i
        );

        g.lineTo(
            x1 + Math.cos(angle) * (i + 10),
            y1 + Math.sin(angle) * (i + 10)
        );

        g.strokePath();

        }
    };

    // ===== TOP (CHỪA CHỖ CHO CHỮ) =====

    const gap = 110;

    drawD(iL + r, iT, x - gap, iT);
    drawD(x + gap, iT, iR - r, iT);

    // ===== RIGHT =====
    drawD(iR, iT + r, iR, iB - r);

    // ===== BOTTOM =====
    drawD(iR - r, iB, iL + r, iB);

    // ===== LEFT =====
    drawD(iL, iB - r, iL, iT + r);

    // ===== CORNER ARCS (GIỐNG TAROTSCENE) =====

    const corners = [

        { a: 180, b: 270, x: iL + r, y: iT + r }, // top-left
        { a: 270, b: 360, x: iR - r, y: iT + r }, // top-right
        { a: 0, b: 90, x: iR - r, y: iB - r }, // bottom-right
        { a: 90, b: 180, x: iL + r, y: iB - r } // bottom-left

    ];

    corners.forEach(c => {

        g.beginPath();

        g.arc(
        c.x,
        c.y,
        r,
        Phaser.Math.DegToRad(c.a),
        Phaser.Math.DegToRad(c.b)
        );

        g.strokePath();

    });

    }
}