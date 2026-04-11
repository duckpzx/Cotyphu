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
    this.load.image("btn_play", "./assets/ui/buttons/play.png");
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

    // ── Name input ────────────────────────────────────────────────────────────
    this.createNameInput(width, height);

    // ── "Vào Game" button ─────────────────────────────────────────────────────
    this._buildPlayButton(width, height);

    // ── Cleanup on shutdown ───────────────────────────────────────────────────
    this.events.once("shutdown", () => {
      if (this.nameInput) this.nameInput.remove();
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Title Banner  (red ribbon + golden outlined text + stars)
  // ────────────────────────────────────────────────────────────────────────────
  _buildTitleBanner(width) {
    const bx = width / 2, by = 72;
    const bw = 480, bh = 72;

    // Ribbon shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillRoundedRect(bx - bw / 2 + 6, by - bh / 2 + 6, bw, bh, 10);

    // Ribbon body
    const ribbon = this.add.graphics();
    ribbon.fillGradientStyle(0xd42020, 0xd42020, 0xff4444, 0xff4444, 1);
    ribbon.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 10);

    // Gold border
    ribbon.lineStyle(3, 0xffdd55, 1);
    ribbon.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 10);

    // Stars left & right
    const starStyle = { fontSize: "28px", color: "#ffdd55" };
    this.add.text(bx - bw / 2 + 18, by, "★", starStyle).setOrigin(0.5);
    this.add.text(bx + bw / 2 - 18, by, "★", starStyle).setOrigin(0.5);

    // Title text
    this.add.text(bx, by + 2, "CHỌN NHÂN VẬT", {
      fontFamily: "Signika",
      fontSize: "34px",
      color: "#ffe066",
      fontStyle: "bold",
      stroke: "#7a2000",
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: "#000", blur: 4, fill: true }
    }).setOrigin(0.5);

    // Animate subtle pulse on ribbon
    this.tweens.add({
      targets: ribbon,
      alpha: { from: 1, to: 0.88 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Play Button  (orange pill shape + "VÀO GAME")
  // ────────────────────────────────────────────────────────────────────────────
  _buildPlayButton(width, height) {
    const bx = width / 2, by = height - 80;
    const bw = 220, bh = 60, br = 30;

    const btnGfx = this.add.graphics();

    const drawBtn = (alpha) => {
      btnGfx.clear();
      // outer glow
      btnGfx.fillStyle(0xff8c00, 0.3 * alpha);
      btnGfx.fillRoundedRect(bx - bw / 2 - 10, by - bh / 2 - 10, bw + 20, bh + 20, br + 8);
      // shadow
      btnGfx.fillStyle(0x000000, 0.3);
      btnGfx.fillRoundedRect(bx - bw / 2 + 4, by - bh / 2 + 6, bw, bh, br);
      // gradient body
      btnGfx.fillGradientStyle(0xff6600, 0xff6600, 0xff9900, 0xff9900, 1);
      btnGfx.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      // highlight line
      btnGfx.fillStyle(0xffffff, 0.25);
      btnGfx.fillRoundedRect(bx - bw / 2 + 8, by - bh / 2 + 6, bw - 16, bh / 3, br - 4);
      // border
      btnGfx.lineStyle(2, 0xffd060, 1);
      btnGfx.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
    };
    drawBtn(1);

    const btnText = this.add.text(bx, by, "VÀO GAME", {
      fontFamily: "Signika",
      fontSize: "26px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#7a2000",
      strokeThickness: 5,
      shadow: { offsetX: 1, offsetY: 2, color: "#000", blur: 3, fill: true }
    }).setOrigin(0.5);

    // Hit area
    const hitZone = this.add.zone(bx, by, bw, bh).setInteractive({ cursor: "pointer" });

    // hitZone.on("pointerover", () => {
    //   this.tweens.add({ targets: [btnGfx, btnText], scaleX: 1.06, scaleY: 1.06, duration: 100 });
    // });
    // hitZone.on("pointerout", () => {
    //   this.tweens.add({ targets: [btnGfx, btnText], scaleX: 1, scaleY: 1, duration: 100 });
    // });
    hitZone.on("pointerdown", () => {
      const name = this.nameInput ? this.nameInput.value.trim() : "";
      if (!name) { alert("Vui lòng nhập tên nhân vật"); return; }
      if (!this.selectedCharacter) { alert("Vui lòng chọn nhân vật"); return; }
      this.createCharacter(name);
    });

    // Idle glow pulse on button
    this.tweens.add({
      targets: btnGfx,
      alpha: { from: 1, to: 0.85 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Load characters from server
  // ────────────────────────────────────────────────────────────────────────────
  async loadCharacters() {
    try {
      const res = await fetch(`${SERVER_URL}/characters`);
      const data = await res.json();
      this.characters = data.characters || [];

      if (this.characters.length === 0) { console.log("Không có nhân vật"); return; }

      this.characters.forEach(char => this.loadIdleFrames(char));

      this.load.once("complete", () => {
        this.createAnimations();
        this.renderCharacters();
      });
      this.load.start();
    } catch (err) {
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

    const charY = height / 2 - 60;  
    const pedestalY = height / 2 + 30;

    this.characters.forEach((char, index) => {

      const x = startX + index * spacing;

      // ── Pedestal ──────────────────────────────────────────────────────────
      const pedestal = this._buildPedestal(x, pedestalY, index);
      this.pedestals.push(pedestal);

      // ── Glow ring (hidden by default) ─────────────────────────────────────
      const glowRing = this.add.graphics();
      this.selectors.push(glowRing);

      // ── Sprite ────────────────────────────────────────────────────────────
      const sprite = this.add.sprite(x, charY, `${char.name}_${char.skin_number}_idle_000`)
        .setScale(0.28)
        .setInteractive({ cursor: "pointer" });

      sprite.play(`${char.name}_${char.skin_number}_idle`);
      sprite.setTint(0x888888);
      sprite.setAlpha(0.75);
      this.characterSprites.push(sprite);

      // bỏ dấu _
      let displayName = char.name.replace(/_/g, " ");

      // viết hoa chữ đầu
      displayName = displayName.replace(/\b\w/g, c => c.toUpperCase());

      // rút ngắn tên
      let shortName = displayName;

      if (shortName.length > 12) {
        shortName = shortName.substring(0, 12) + "...";
      }

      // ── Name label ────────────────────────────────────────────────────────
      this.add.text(x, pedestalY + 32, shortName, {
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
          this.tweens.add({ targets: sprite, scaleX: 0.31, scaleY: 0.31, duration: 120 });
        }
      });
      sprite.on("pointerout", () => {
        if (this.selectedCharacter !== char) {
          this.tweens.add({ targets: sprite, scaleX: 0.28, scaleY: 0.28, duration: 120 });
        }
      });
      sprite.on("pointerdown", () => this._selectCharacter(index, char));
    });

    // Default select first
    this.time.delayedCall(120, () => this._selectCharacter(0, this.characters[0]));
  }

  _selectCharacter(index, char) {
    this.selectedCharacter = char;

    this.characterSprites.forEach((s, i) => {
      if (i === index) {
        s.clearTint();
        s.setAlpha(1);
        this.tweens.add({ targets: s, scaleX: 0.31, scaleY: 0.31, duration: 180, ease: "Back.easeOut" });
      } else {
        s.setTint(0x888888);
        s.setAlpha(0.72);
        this.tweens.add({ targets: s, scaleX: 0.28, scaleY: 0.28, duration: 120 });
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
    // Alternating tones: grey for unselected, pink/lavender for selected female
    const colors = [0xaaaaaa, 0xf0b0d0, 0x90c0ff, 0xb0e0a0];
    const baseColor = colors[index % colors.length];

    const g = this.add.graphics();

    // Shadow ellipse
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(x, y + 18, 140, 30);

    // Top surface ellipse
    g.fillStyle(baseColor, 1);
    g.fillEllipse(x, y, 130, 28);

    // Cylinder body
    g.fillStyle(Phaser.Display.Color.ValueToColor(baseColor).darken(20).color, 1);
    g.fillRect(x - 65, y, 130, 20);

    // Bottom ellipse
    g.fillStyle(Phaser.Display.Color.ValueToColor(baseColor).darken(30).color, 1);
    g.fillEllipse(x, y + 20, 130, 28);

    // Highlight line on top
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(x - 10, y - 4, 80, 12);

    // Checker pattern shadow on floor
    g.fillStyle(0x000000, 0.08);
    g.fillEllipse(x, y + 30, 160, 24);

    return g;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HTML Name Input  (styled to match screenshot: blue/teal pill)
  // ────────────────────────────────────────────────────────────────────────────
  createNameInput(width, height) {
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "10"
    });

    const inputWrap = document.createElement("div");
    Object.assign(inputWrap.style, {
      position: "absolute",
      top: `${height * 0.69}px`,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "0",
      pointerEvents: "all"
    });

    this.nameInput = document.createElement("input");
    this.nameInput.placeholder = "Tên nhân vật...";

    const style = document.createElement("style");
    style.innerHTML = `
    ::placeholder{
      color:#ffffd199;
      opacity:1;
    }
    `;
    document.head.appendChild(style);

    Object.assign(this.nameInput.style, {
      padding: "13px 23px",
      paddingLeft: "25px",
      borderRadius: "30px",
      border: "3px solid #4ab8e8",
      backgroundColor: "rgba(0,30,80,0.85)",
      fontSize: "18px",
      width: "240px",
      color: "#ffffff",
      outline: "none",
      fontFamily: "Signika",
      boxShadow: "0 0 16px rgba(74,184,232,0.5), inset 0 1px 4px rgba(255,255,255,0.1)",
      caretColor: "#4ab8e8"
    });


    inputWrap.appendChild(this.nameInput);
    wrapper.appendChild(inputWrap);
    document.body.appendChild(wrapper);
    this._inputWrapper = wrapper;

    // Focus style
    this.nameInput.addEventListener("focus", () => {
      this.nameInput.style.boxShadow = "0 0 24px rgba(74,184,232,0.9), inset 0 1px 4px rgba(255,255,255,0.2)";
    });
    this.nameInput.addEventListener("blur", () => {
      this.nameInput.style.boxShadow = "0 0 16px rgba(74,184,232,0.5), inset 0 1px 4px rgba(255,255,255,0.1)";
    });

    this.events.once("shutdown", () => wrapper.remove());
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
        alert(data.message);
      }
    } catch (err) {
      console.error("createCharacter lỗi:", err);
      alert("Lỗi kết nối server");
    }
  }
}