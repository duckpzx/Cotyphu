import { SERVER_URL } from "../config.js";
export default class CreateCharacterScene extends Phaser.Scene {

  constructor() {
    super("CreateCharacterScene");
    this.characters = [];
    this.selectedCharacter = null;
    this.characterSprites = [];
    this.pedestals = [];
    this.selectors = [];
    this.nameInput = null;
    this.glowTweens = [];
  }

  preload() {
    this.load.image("create_bg", "./assets/nen_taikhoan.png");
    this.load.image("btn_play",  "./assets/ui/buttons/play.png");
    this.load.image("podium",    "assets/ui/shared/podium.png");
    this.load.image("banner",    "assets/ui/shared/banner_cr_ch.png");
  }

  async create() {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────────────────
    const bg = this.add.image(width / 2, height / 2, "create_bg");
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    // ── Decorative light rays (radial burst behind characters) ───────────────
    const rays = this.add.graphics();
    const cx = width / 2, cy = height / 2 - 20;
    const rayCount = 18;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const x2 = cx + Math.cos(angle) * width * 0.7;
      const y2 = cy + Math.sin(angle) * height * 0.7;
      rays.lineStyle(28, 0xffffff, 0.07);
      rays.beginPath();
      rays.moveTo(cx, cy);
      rays.lineTo(x2, y2);
      rays.strokePath();
    }

    // ── Title banner ─────────────────────────────────────────────────────────
    this._buildTitleBanner(width);

    // ── Load characters ───────────────────────────────────────────────────────
    await this.loadCharacters();

    // ── Name input + Button trên cùng 1 hàng ─────────────────────────────────
    this.createNameInput(width, height);

    // ── Cleanup on shutdown ───────────────────────────────────────────────────
    this.events.once("shutdown", () => {
      if (this.nameInput) this.nameInput.remove();
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Title Banner  (red ribbon + golden outlined text + stars)
  // ────────────────────────────────────────────────────────────────────────────
  _buildTitleBanner(width) {
    const bx = width / 2, by = 92;

    // Ảnh banner kích thước gốc, không scale
    const bannerImg = this.add.image(bx, by, "banner").setOrigin(0.5).setScale(0.8);

    this.tweens.add({
      targets: bannerImg,
      alpha: { from: 1, to: 0.90 },
      duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Play Button  (orange pill shape + "VÀO GAME")
  // ────────────────────────────────────────────────────────────────────────────
  _buildPlayButton(width, height) {
    const bx = width / 2, by = height - 80;
    const bw = 240, bh = 60, br = bh / 2;

    const g = this.add.graphics();
    const draw = (hover = false) => {
      g.clear();
      // Viền ngoài xám nhạt (như ảnh)
      g.fillStyle(0xddccbb, 0.9);
      g.fillRoundedRect(bx - bw/2 - 6, by - bh/2 - 6, bw + 12, bh + 12, br + 5);
      // Shadow đáy đỏ đậm
      g.fillStyle(0xaa2200, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2 + 6, bw, bh, br);
      // Thân nút đỏ cam gradient
      g.fillGradientStyle(0xff5500, 0xff5500, 0xdd2200, 0xdd2200, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh - 4, br);
      // Gloss trên cùng
      g.fillStyle(0xffffff, hover ? 0.45 : 0.30);
      g.fillRoundedRect(bx - bw/2 + 10, by - bh/2 + 5, bw - 20, bh * 0.32, br - 4);
      // Viền trong
      g.lineStyle(2, 0xff8866, 0.6);
      g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh - 4, br);
    };
    draw(false);

    this.add.text(bx, by - 2, "VÀO GAME", {
      fontFamily: "Signika", fontSize: "26px", color: "#fff5e0",
      fontStyle: "bold",
      stroke: "#5a1500", strokeThickness: 5,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true }
    }).setOrigin(0.5);

    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.88 }, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" });
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true });
      const name = this.nameInput ? this.nameInput.value.trim() : "";
      if (!name) { this.showAlert("Vui lòng nhập tên nhân vật"); return; }
      if (!this.selectedCharacter) { this.showAlert("Vui lòng chọn nhân vật"); return; }
      this.createCharacter(name);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Load characters from server
  // ────────────────────────────────────────────────────────────────────────────
  async loadCharacters() {
    // ── Loading indicator ─────────────────────────────────────────
    const { width, height } = this.scale;
    const loadGroup = [];

    // Vòng tròn xoay
    const spinG = this.add.graphics().setDepth(50);
    const spinCX = width / 2, spinCY = height / 2 - 20;
    let angle = 0;
    const spinTimer = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        spinG.clear();
        for (let i = 0; i < 8; i++) {
          const a = angle + i * (Math.PI * 2 / 8);
          const r = 28, dotR = 4;
          const alpha = (i / 8) * 0.9 + 0.1;
          spinG.fillStyle(0xffafafff, alpha);
          spinG.fillCircle(spinCX + Math.cos(a) * r, spinCY + Math.sin(a) * r, dotR);
        }
        angle += 0.08;
      }
    });

    const loadTxt = this.add.text(spinCX, spinCY + 52, "Đang tải nhân vật...", {
      fontFamily: "Signika", fontSize: "18px", color: "#ffffff",
      fontStyle: "bold", stroke: "#003388", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);

    // Pulse text
    this.tweens.add({ targets: loadTxt, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });

    const destroyLoader = () => {
      spinTimer.destroy();
      spinG.destroy();
      loadTxt.destroy();
    };

    try {
      const res = await fetch(`${SERVER_URL}/characters`);
      const data = await res.json();
      this.characters = data.characters || [];

      if (this.characters.length === 0) { console.log("Không có nhân vật"); return; }

      this.characters.forEach(char => this.loadIdleFrames(char));

      this.load.once("complete", () => {
        destroyLoader();
        this.createAnimations();
        this.renderCharacters();
      });
      this.load.start();
    } catch (err) {
      destroyLoader();
      console.error("Load characters lỗi:", err);
    }
  }

  loadIdleFrames(char) {
    const { name, image, skin_number } = char;
    for (let i = 0; i < 18; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(
        `${name}_${skin_number}_idle_${num}`,
        `assets/characters/${name}/${image}/PNG/PNG Sequences/Idle/0_${name}_Idle_${num}.png`
      );
    }
  }

  createAnimations() {
    this.characters.forEach(({ name, skin_number }) => {
      const frames = [];
      for (let i = 0; i < 18; i++) {
        frames.push({ key: `${name}_${skin_number}_idle_${String(i).padStart(3, "0")}` });
      }
      this.anims.create({ key: `${name}_${skin_number}_idle`, frames, frameRate: 10, repeat: -1 });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render character cards with pedestal + glow selection
  // ────────────────────────────────────────────────────────────────────────────
  renderCharacters() {
    const { width, height } = this.scale;
    const total = this.characters.length;

    const spacing = 160; 
    const startX = width / 2 - ((total - 1) * spacing) / 2;

    const charY = height / 2 - 55;  
    const pedestalY = height / 2 + 30;

    this.characters.forEach((char, index) => {

      const x = startX + index * spacing;

      // ── Pedestal ──────────────────────────────────────────────────────────
      const pedestal = this._buildPedestal(x, pedestalY, index);
      this.pedestals.push(pedestal);

      // ── Bóng tròn cố định trên bục ───────────────────────────────────────
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.28);
      shadow.fillEllipse(x, pedestalY - 5, 70, 14);

      // ── Glow ring (hidden by default) ─────────────────────────────────────
      const glowRing = this.add.graphics();
      this.selectors.push(glowRing);

      // ── Sprite ────────────────────────────────────────────────────────────
      const sprite = this.add.sprite(x, charY, `${char.name}_${char.skin_number}_idle_000`)
        .setScale(0.26)
        .setInteractive({ cursor: "pointer" });

      sprite.play(`${char.name}_${char.skin_number}_idle`);
      // Xám tối để gần grayscale
      sprite.setTint(0x707070);
      sprite.setAlpha(0.85);
      this.characterSprites.push(sprite);

      // bỏ dấu _
      let displayName = char.name.replace(/_/g, " ");

      // viết hoa chữ đầu
      displayName = displayName.replace(/\b\w/g, c => c.toUpperCase());

      // rút ngắn tên
      let shortName = displayName;

      if (shortName.length > 8) {
        shortName = shortName.substring(0, 8) + "...";
      }

      // ── Name label ────────────────────────────────────────────────────────
      this.add.text(x, pedestalY + 26, shortName, {
        fontFamily: "Signika",
        fontSize: "18px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(0.5);

      // ── Click to select ───────────────────────────────────────────────────
      sprite.on("pointerover", () => {
        if (this.selectedCharacter !== char) {
          this.tweens.add({ targets: sprite, scaleX: 0.27, scaleY: 0.27, duration: 120 });
        }
      });
      sprite.on("pointerout", () => {
        if (this.selectedCharacter !== char) {
          this.tweens.add({ targets: sprite, scaleX: 0.26, scaleY: 0.26, duration: 120 });
        }
      });
      sprite.on("pointerdown", () => this._selectCharacter(index, char));
    });

    // Default select first
    this.time.delayedCall(120, () => this._selectCharacter(3, this.characters[3]));
  }

  _selectCharacter(index, char) {
    this.selectedCharacter = char;

    this.characterSprites.forEach((s, i) => {
      if (i === index) {
        // Nhân vật được chọn: màu đầy đủ
        try { s.resetPipeline(); } catch(e) {}
        s.clearTint();
        s.setAlpha(1);
        this.tweens.add({ targets: s, scaleX: 0.27, scaleY: 0.27, duration: 180, ease: "Back.easeOut" });
      } else {
        // Nhân vật không chọn: xám tối
        try { s.resetPipeline(); } catch(e) {}
        s.setTint(0x707070);
        s.setAlpha(0.85);
        this.tweens.add({ targets: s, scaleX: 0.26, scaleY: 0.26, duration: 120 });
      }
    });

    this.selectors.forEach((ring, i) => {

      const ped = this.pedestals[i];

      const x = ped.x;
      const y = ped.y;

    });

    this.pedestals.forEach((ped, i) => {
      ped.setAlpha(i === index ? 1 : 0.6);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pedestal graphic (circular platform like the screenshot)
  // ────────────────────────────────────────────────────────────────────────────
  _buildPedestal(x, y, index) {
    // Dùng ảnh podium.png, scale vừa khít dưới chân nhân vật
    const podium = this.add.image(x, y + 20, "podium").setOrigin(0.5, 0.5).setScale(0.65);
    return podium;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HTML Name Input  (styled to match screenshot: blue/teal pill)
  // ────────────────────────────────────────────────────────────────────────────
  createNameInput(width, height) {
    const INP_W = 280, BTN_W = 160, H = 52;
    const totalW = INP_W + BTN_W;
    // Tọa độ Phaser (game units)
    const rowY   = height * 0.80;
    const rowX   = width / 2 - totalW / 2;  // góc trái input

    // Tính scale canvas → DOM
    const canvas = this.game.canvas;
    const rect   = canvas.getBoundingClientRect();
    const sx = rect.width  / width;
    const sy = rect.height / height;

    // ── Input DOM ────────────────────────────────────────────────
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      position: "fixed",
      left:   `${rect.left + rowX * sx}px`,
      top:    `${rect.top  + (rowY - H/2) * sy}px`,
      width:  `${INP_W * sx}px`,
      height: `${H * sy}px`,
      pointerEvents: "all",
      zIndex: "10"
    });

    this.nameInput = document.createElement("input");
    this.nameInput.placeholder = "Tên nhân vật...";
    Object.assign(this.nameInput.style, {
      width: "100%", height: "100%",
      padding: `0 ${20*sx}px`,
      boxSizing: "border-box",
      borderRadius: `${H/2*sy}px 0 0 ${H/2*sy}px`,
      border: `${2*sy}px solid rgba(255, 101, 50, 0.41)`,
      borderRight: "none",
      background: "rgba(255,255,255,0.82)",
      fontSize: `${17*sy}px`,
      color: "#3a1800",
      outline: "none",
      fontFamily: "Signika",
      fontWeight: "bold",
      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.12), 0 4px 0 rgba(150,40,0,0.5), 0 0 0 5px rgba(255,100,50,0.18)"
    });
    this.nameInput.addEventListener("focus", () => {
      this.nameInput.style.background = "rgba(255,255,255,0.96)";
      this.nameInput.style.borderColor = "rgba(255,80,20,1)";
    });
    this.nameInput.addEventListener("blur", () => {
      this.nameInput.style.background = "rgba(255,255,255,0.82)";
      this.nameInput.style.borderColor = "rgba(255,100,50,0.7)";
    });

    const style = document.createElement("style");
    style.innerHTML = `input::placeholder { color: rgba(180,100,60,0.6); font-weight:normal; }`;
    document.head.appendChild(style);

    wrapper.appendChild(this.nameInput);
    document.body.appendChild(wrapper);
    this._inputWrapper = wrapper;
    this.events.once("shutdown", () => wrapper.remove());

    // ── Button Phaser: ngay sát phải input ───────────────────────
    const bx = rowX + INP_W + BTN_W / 2;
    const by = rowY;
    const bw = BTN_W, bh = H, br = bh / 2;

    const g = this.add.graphics().setDepth(20);
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(0xee4400, 0.18);
      g.fillRoundedRect(bx - bw/2 - 4, by - bh/2 - 4, bw + 8, bh + 8,
        { tl: 0, tr: br + 3, bl: 0, br: br + 3 });
      // Shadow đáy đỏ đậm
      g.fillStyle(0x880000, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2 + 4, bw, bh,
        { tl: 0, tr: br, bl: 0, br: br });
      g.fillGradientStyle(0xff5500, 0xff5500, 0xcc2200, 0xcc2200, 1);
      g.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh,
        { tl: 0, tr: br, bl: 0, br: br });
      g.fillStyle(0xffffff, hover ? 0.40 : 0.22);
      g.fillRoundedRect(bx - bw/2 + 6, by - bh/2 + 5, bw - 12, bh / 3,
        { tl: 0, tr: br - 4, bl: 0, br: br - 4 });
      // Viền trái khớp màu input
      g.lineStyle(2, 0xff6432, 0.7);      g.beginPath(); g.moveTo(bx - bw/2, by - bh/2); g.lineTo(bx - bw/2, by + bh/2); g.strokePath();
      g.lineStyle(2, 0xffffff, hover ? 0.7 : 0.5);
      g.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh,
        { tl: 0, tr: br, bl: 0, br: br });
    };
    draw(false);

    this.add.text(bx, by, "VÀO GAME", {
      fontFamily: "Signika", fontSize: "18px", color: "#ffffff",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true }
    }).setOrigin(0.5).setDepth(21);

    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.85 }, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" }).setDepth(22);
    zone.on("pointerover",  () => draw(true));
    zone.on("pointerout",   () => draw(false));
    zone.on("pointerdown",  () => {
      this.tweens.add({ targets: g, alpha: 0.65, duration: 60, yoyo: true });
      const name = this.nameInput.value.trim();
      if (!name) { this.showAlert("Vui lòng nhập tên nhân vật"); return; }
      if (!this.selectedCharacter) { this.showAlert("Vui lòng chọn nhân vật"); return; }
      this.createCharacter(name);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Create character API call
  // ────────────────────────────────────────────────────────────────────────────
  async createCharacter(name) {
    try {
      const user = JSON.parse(localStorage.getItem("playerData"));
      const userId = user.user.id;
      const res = await fetch(`${SERVER_URL}/create-character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, character_id: this.selectedCharacter.id, name })
      });
      const data = await res.json();

      if (data.success) {
        // Update localStorage so the selected character is used immediately in the game
        const playerData = JSON.parse(localStorage.getItem("playerData")) || {};

        if (playerData.user) {
          playerData.user.active_character_id = this.selectedCharacter.id;
        }

        playerData.active = {
          characterId: this.selectedCharacter.id,
          characterName: this.selectedCharacter.name,
          skin: this.selectedCharacter.skin_number,
          active_skin_id: this.selectedCharacter.skin_number
        };

        localStorage.setItem("playerData", JSON.stringify(playerData));

        if (this.nameInput) this.nameInput.remove();
        if (this._inputWrapper) this._inputWrapper.remove();
        this.scene.start("LobbyScene");
      } else {
        this.showAlert(data.message);
      }
    } catch (err) {
      console.error("createCharacter lỗi:", err);
      this.showAlert("Lỗi kết nối server");
    }
  }

  showAlert(message, color = "#fff6d7", duration = 2200) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height - 80, message, {
      fontFamily: "Signika", fontSize: "17px", color,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      backgroundColor: "#00000099", padding: { x: 16, y: 9 },
    }).setOrigin(0.5).setDepth(300).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, y: height - 100, duration: 200, ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(duration, () => {
          this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
        });
      }
    });
  }
}