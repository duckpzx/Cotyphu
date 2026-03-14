// src/scenes/BoardScene.js

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super("BoardScene");
    this.originalWidth = 1920;
    this.originalHeight = 1080;
    this.canRoll = true;
    this.otherPlayers = {};
  }

setupSocketEvents() {
  console.log("🔧 Setting up socket events...");

  // Nhận danh sách players hiện tại
  this.socket.on("currentPlayers", (players) => {
    console.log("\n========== CURRENT PLAYERS RECEIVED ==========");
    console.log("📦 Players data:", players);
    console.log("🆔 My socket ID:", this.socket.id);
    
    // Xóa tất cả player cũ
    Object.values(this.otherPlayers).forEach(player => {
      if (player.shadow) player.shadow.destroy();
      if (player.nameText) player.nameText.destroy();
      player.destroy();
    });
    this.otherPlayers = {};
    
    // Đếm số player khác
    let otherCount = 0;
    
    // Thêm tất cả players (trừ mình)
    Object.values(players).forEach(player => {
      if (player.id !== this.socket.id) {
        console.log(`➕ Adding existing player ${++otherCount}:`, player.id);
        this.addOtherPlayer(player);
      }
    });
    
    console.log(`👥 Total other players added: ${otherCount}`);
  });

  // Có player mới join
  this.socket.on("newPlayer", (player) => {
    console.log("\n========== NEW PLAYER JOINED ==========");
    console.log("👤 New player data:", player);
    console.log("🆔 My ID:", this.socket.id);
    
    if (player.id !== this.socket.id) {
      console.log("✅ Adding new player to my game:", player.id);
      this.addOtherPlayer(player);
      console.log("👥 Total other players now:", Object.keys(this.otherPlayers).length);
    } else {
      console.log("⚠️ This is me, ignoring...");
    }
  });

  // Player di chuyển
this.socket.on("playerMoved", (data) => {
  console.log("\n========== PLAYER MOVED ==========");
  console.log("🎯 Player moved:", data.id, "to index:", data.index);
  
  if (data.id === this.socket.id) {
    console.log("⏭️ This is me, ignoring...");
    return;
  }
  
  const otherPlayer = this.otherPlayers[data.id];
  if (otherPlayer) {
    console.log("✅ Found player in my game, moving step by step...");
    
    // Lấy index hiện tại của player khác
    const startIndex = otherPlayer.index || 0;
    const targetIndex = data.index;
    const totalCells = this.boardPath.length;
    
    // Tính số bước cần di chuyển
    let steps;
    if (targetIndex >= startIndex) {
      steps = targetIndex - startIndex;
    } else {
      // Trường hợp đi qua ô START (vòng lại)
      steps = (totalCells - startIndex) + targetIndex;
    }
    
    console.log(`🦶 Moving from ${startIndex} to ${targetIndex}, steps: ${steps}`);
    
    // Hàm di chuyển từng bước một
    let currentStep = 0;
    const moveNextStep = () => {
      if (currentStep >= steps) {
        // Kết thúc di chuyển
        otherPlayer.index = targetIndex;
        
        // Quay lại animation idle với skin phù hợp
        const skin = data.skin || 1;
        if (this.anims.exists(`Minotaur_${skin}_idle`)) {
          otherPlayer.play(`Minotaur_${skin}_idle`);
        }
        
        console.log("✅ Finished moving other player");
        return;
      }
      
      // Tính index của bước tiếp theo
      const nextIndex = (startIndex + currentStep + 1) % totalCells;
      const nextCell = this.boardPath[nextIndex];
      
      const nextX = nextCell.x * this.scale.width;
      const nextY = nextCell.y * this.scale.height;
      
      // Xác định hướng để flip sprite
      if (nextX < otherPlayer.x) {
        otherPlayer.setFlipX(true);
      } else if (nextX > otherPlayer.x) {
        otherPlayer.setFlipX(false);
      }
      
      // Chạy animation run
      const skin = data.skin || 1;
      if (this.anims.exists(`Minotaur_${skin}_run_throw`)) {
        otherPlayer.play(`Minotaur_${skin}_run_throw`);
      }
      
      // Tween di chuyển tới ô tiếp theo
      this.tweens.add({
        targets: otherPlayer,
        x: nextX,
        y: nextY,
        duration: 350,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          // Cập nhật shadow và nameText
          if (otherPlayer.shadow) {
            otherPlayer.shadow.x = otherPlayer.x;
            otherPlayer.shadow.y = otherPlayer.y + 5;
          }
          if (otherPlayer.nameText) {
            otherPlayer.nameText.x = otherPlayer.x;
            otherPlayer.nameText.y = otherPlayer.y - 40;
          }
        },
        onComplete: () => {
          currentStep++;
          moveNextStep(); // Di chuyển bước tiếp theo
        }
      });
    };
    
    // Bắt đầu di chuyển
    moveNextStep();
  } else {
    console.log("❌ Player not found in this.otherPlayers:", data.id);
  }
});

  // Player roll dice
  this.socket.on("playerRolled", (data) => {
    if (data.id === this.socket.id) return;
    
    const playerName = this.otherPlayers[data.id]?.nameText?.text || "Player khác";
    this.infoText.setText(`${playerName} đã roll được ${data.diceValue}`);
    this.infoText.setColor("#00ff00");
    
    this.time.delayedCall(2000, () => {
      this.infoText.setText("Nhấn SPACE để đổ xúc xắc | R để reset");
      this.infoText.setColor("#facc15");
    });
  });

  // Player rời game
  this.socket.on("playerDisconnected", (playerId) => {
    console.log("\n========== PLAYER DISCONNECTED ==========");
    console.log("👋 Player left:", playerId);
    
    if (this.otherPlayers[playerId]) {
      console.log("✅ Removing player from my game");
      if (this.otherPlayers[playerId].shadow) {
        this.otherPlayers[playerId].shadow.destroy();
      }
      if (this.otherPlayers[playerId].nameText) {
        this.otherPlayers[playerId].nameText.destroy();
      }
      this.otherPlayers[playerId].destroy();
      delete this.otherPlayers[playerId];
      console.log("👥 Remaining players:", Object.keys(this.otherPlayers).length);
    }
  });
}

  // =====================
  // PRELOAD
  // =====================
  preload() {
    this.load.image("bg", "assets/nen_trochoi.jpg");

    // LOAD 3 SKIN
    for (let skin = 1; skin <= 3; skin++) {

      // IDLE 00
      for (let i = 0; i < 10; i++) {
        this.load.image(
          `Minotaur_${skin}_idle_00_${i}`,
          `assets/characters/Minotaur/Minotaur_${skin}/PNG/PNG Sequences/Idle/0_Minotaur_Idle_00${i}.png`
        );
      }

      // IDLE 01
      for (let i = 0; i < 8; i++) {
        this.load.image(
          `Minotaur_${skin}_idle_01_${i}`,
          `assets/characters/Minotaur/Minotaur_${skin}/PNG/PNG Sequences/Idle/0_Minotaur_Idle_01${i}.png`
        );
      }

      // RUN THROWING
      for (let i = 0; i < 12; i++) {
        const index = i.toString().padStart(3, "0");

        this.load.image(
          `Minotaur_${skin}_run_throw_${i}`,
          `assets/characters/Minotaur/Minotaur_${skin}/PNG/PNG Sequences/Run Throwing/0_Minotaur_Run Throwing_${index}.png`
        );
      }

    }

    // ====== DICE NORMAL (1–6) ======
    for (let i = 1; i <= 6; i++) {
      this.load.image(`dice_${i}`, `assets/resources/Dice/dice_${i}.png`);
    }

    // ====== DICE BLUR ======
    for (let i = 1; i <= 6; i++) {
      this.load.image(
        `dice_blur_${i}`,
        `assets/resources/Dice_Blur/dice_blur_${i}.png`
      );
    }

    this.load.image("target_arrow", "assets/resources/Gps/gps_gmae.png");
  }

    // Thêm player khác vào game
addOtherPlayer(playerData) {
  console.log("\n========== ADDING OTHER PLAYER ==========");
  console.log("📦 Player data:", playerData);
  
  const { width, height } = this.scale;
  const minRatio = Math.min(width / this.originalWidth, height / this.originalHeight);
  
  const cell = this.boardPath[playerData.index || 0];
  if (!cell) {
    console.error("❌ Invalid cell for player:", playerData);
    return;
  }
  
  const x = cell.x * width;
  const y = cell.y * height;
  
  console.log("📍 Position:", x, y, "from cell index:", playerData.index);

  const skin = playerData.skin || 1;
  console.log("🎨 Using skin:", skin);

  // Kiểm tra animation có tồn tại không
  if (!this.anims.exists(`Minotaur_${skin}_idle`)) {
    console.log("⚠️ Animation not found, creating...");
    this.createMinotaurAnimations();
  }

  const otherPlayer = this.add.sprite(
    x,
    y,
    `Minotaur_${skin}_idle_00_0`
  );
  otherPlayer.play(`Minotaur_${skin}_idle`);
  otherPlayer.setScale(0.24 * minRatio);
  otherPlayer.setOrigin(0.5, 0.8);
  otherPlayer.setDepth(5);
  otherPlayer.index = playerData.index || 0;
  
  // Thêm shadow
  const shadow = this.add.ellipse(
    x,
    y + 5,
    35 * minRatio,
    14 * minRatio,
    0x000000,
    0.35
  );
  shadow.setOrigin(0.5);
  shadow.setDepth(otherPlayer.depth - 1);
  otherPlayer.shadow = shadow;
  
  // Thêm tên
  const shortId = playerData.id.substring(0, 4);
  const nameText = this.add.text(x, y - 40, `Player ${shortId}`, {
    fontSize: Math.floor(14 * minRatio) + "px",
    color: "#ffffff",
    backgroundColor: "#00000080",
    padding: { x: 5, y: 2 }
  }).setOrigin(0.5);
  
  otherPlayer.nameText = nameText;
  
  this.otherPlayers[playerData.id] = otherPlayer;
  console.log("✅ Successfully added player to this.otherPlayers");
  console.log("📊 Current otherPlayers:", Object.keys(this.otherPlayers));
}

  // =====================
  // DICE
  // =====================
  createDiceAnimations() {
    const blurFrames = [];
    for (let i = 1; i <= 6; i++) {
      blurFrames.push({ key: `dice_blur_${i}` });
    }

    this.anims.create({
      key: "dice_blur_spin",
      frames: blurFrames,
      frameRate: 18,
      repeat: -1,
    });
  }

  saveGameState() {
    const data = {
      scene: "BoardScene",
      currentIndex: this.currentIndex
    };

    localStorage.setItem("gameState", JSON.stringify(data));
  }

  createDiceSprite(minRatio) {
    const { width, height } = this.scale;

    this.dicePosX = 0.508;
    this.dicePosY = 0.414;

    const cx = this.dicePosX * width;
    const cy = this.dicePosY * height;

    this.diceShadow = this.add.ellipse(
      cx - 12 * minRatio,
      cy + 34 * minRatio,
      70 * minRatio,
      34 * minRatio,
      0x000000,
      0.45
    );
    this.diceShadow.setOrigin(0.5);
    this.diceShadow.setDepth(29);
    this.diceShadow.setVisible(false);

    this.diceSprite = this.add.sprite(cx, cy, "dice_1");
    this.diceSprite.setDepth(30);
    this.diceSprite.setScale(0.6 * minRatio);
    this.diceSprite.setVisible(false);

    this.diceTween = null;

    this.tweens.add({
      targets: this.diceSprite,
      y: "-=10",
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // =====================
  // DARK ORACLE ANIMS
  // =====================
createMinotaurAnimations() {
  for (let skin = 1; skin <= 3; skin++) {
    // IDLE
    const idleFrames = [];
    for (let i = 0; i < 10; i++) {
      idleFrames.push({ key: `Minotaur_${skin}_idle_00_${i}` });
    }

    this.anims.create({
      key: `Minotaur_${skin}_idle`,
      frames: idleFrames,
      frameRate: 12,
      repeat: -1
    });
    console.log(`✅ Created idle animation for skin ${skin}`);

    // RUN THROWING
    const runFrames = [];
    for (let i = 0; i < 12; i++) {
      runFrames.push({ key: `Minotaur_${skin}_run_throw_${i}` });
    }

    this.anims.create({
      key: `Minotaur_${skin}_run_throw`,
      frames: runFrames,
      frameRate: 18,
      repeat: -1
    });
    console.log(`✅ Created run animation for skin ${skin}`);
  }
}

  // =====================
  // CREATE
  // =====================
  create(data) {
    const { width, height } = this.scale;

    this.playerName = data.name;
    this.mySkin = data.skin;
    this.characterName = data.characterName;

    console.log("Player name:", this.playerName);
    console.log("Skin:", this.mySkin);

    const bg = this.add.image(width / 2, height / 2, "bg");
    bg.setDisplaySize(width, height);

    const bgRatioX = width / this.originalWidth;
    const bgRatioY = height / this.originalHeight;
    const minRatio = Math.min(bgRatioX, bgRatioY);

    const saved = localStorage.getItem("gameState");

    if (saved) {
      const data = JSON.parse(saved);
      this.currentIndex = data.currentIndex || 0;
    }

    const serverUrl = "http://localhost:3000";

    console.log("🔌 Đang kết nối đến server:", serverUrl);

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    this.socket.on("connect", () => {
      console.log("✅ Đã kết nối socket với ID:", this.socket.id);
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Lỗi kết nối socket:", error);
    });

    this.setupSocketEvents();

    // ----- MẢNG 37 Ô -----
    this.boardPath = [
      { index: 0, x: 0.24, y: 0.59, name: "START", type: "start", color: 0x00ff00 },
      { index: 1, x: 0.304, y: 0.62, name: "Cell 1", type: "land", color: 0xffffff },
      { index: 2, x: 0.355, y: 0.63, name: "Cell 2", type: "land", color: 0xffffff },
      { index: 3, x: 0.402, y: 0.61, name: "Cell 3", type: "land", color: 0xffffff },
      { index: 4, x: 0.447, y: 0.597, name: "Cell 4", type: "land", color: 0xffffff },
      { index: 5, x: 0.487, y: 0.626, name: "Cell 5", type: "land", color: 0xffffff },
      { index: 6, x: 0.52, y: 0.662, name: "Cell 6", type: "land", color: 0xffffff },
      { index: 7, x: 0.566, y: 0.69, name: "Cell 7", type: "land", color: 0xffffff },
      { index: 8, x: 0.621, y: 0.695, name: "Cell 8", type: "land", color: 0xffffff },
      { index: 9, x: 0.68, y: 0.665, name: "Cell 9", type: "land", color: 0xffffff },

      { index: 10, x: 0.732, y: 0.634, name: "Cell 10", type: "land", color: 0xffffff },
      { index: 11, x: 0.767, y: 0.592, name: "Cell 11", type: "land", color: 0xffffff },
      { index: 12, x: 0.8, y: 0.557, name: "Cell 12", type: "land", color: 0xffffff },
      { index: 13, x: 0.834, y: 0.518, name: "Cell 13", type: "land", color: 0xffffff },
      { index: 14, x: 0.86, y: 0.47, name: "Cell 14", type: "land", color: 0xffffff },
      { index: 15, x: 0.852, y: 0.415, name: "Cell 15", type: "land", color: 0xffffff },
      { index: 16, x: 0.809, y: 0.39, name: "Cell 16", type: "land", color: 0xffffff },
      { index: 17, x: 0.765, y: 0.409, name: "Cell 17", type: "land", color: 0xffffff },
      { index: 18, x: 0.72, y: 0.425, name: "Cell 18", type: "land", color: 0xffffff },

      { index: 19, x: 0.67, y: 0.43, name: "Cell 19", type: "land", color: 0xffffff },
      { index: 20, x: 0.635, y: 0.405, name: "Cell 20", type: "land", color: 0xffffff },
      { index: 21, x: 0.607, y: 0.372, name: "Cell 21", type: "land", color: 0xffffff },
      { index: 22, x: 0.594, y: 0.325, name: "Cell 22", type: "land", color: 0xffffff },
      { index: 23, x: 0.583, y: 0.277, name: "Cell 23", type: "land", color: 0xffffff },
      { index: 24, x: 0.574, y: 0.225, name: "Cell 24", type: "land", color: 0xffffff },
      { index: 25, x: 0.541, y: 0.198, name: "Cell 25", type: "land", color: 0xffffff },
      { index: 26, x: 0.501, y: 0.189, name: "Cell 26", type: "land", color: 0xffffff },
      { index: 27, x: 0.46, y: 0.198, name: "Cell 27", type: "land", color: 0xffffff },

      { index: 28, x: 0.416, y: 0.212, name: "Cell 28", type: "land", color: 0xffffff },
      { index: 29, x: 0.374, y: 0.234, name: "Cell 29", type: "land", color: 0xffffff },
      { index: 30, x: 0.335, y: 0.261, name: "Cell 30", type: "land", color: 0xffffff },
      { index: 31, x: 0.304, y: 0.294, name: "Cell 31", type: "land", color: 0xffffff },
      { index: 32, x: 0.289, y: 0.343, name: "Cell 32", type: "land", color: 0xffffff },
      { index: 33, x: 0.32, y: 0.382, name: "Cell 33", type: "land", color: 0xffffff },
      { index: 34, x: 0.336, y: 0.431, name: "Cell 34", type: "land", color: 0xffffff },
      { index: 35, x: 0.314, y: 0.476, name: "Cell 35", type: "land", color: 0xffffff },
      { index: 36, x: 0.274, y: 0.52, name: "Cell 36", type: "land", color: 0xffffff },
    ];

    console.log(`Tổng số ô: ${this.boardPath.length}`);
    if (this.boardPath.length !== 37) {
      console.warn(
        `CẢNH BÁO: Số ô hiện tại là ${this.boardPath.length}, cần đúng 37 ô!`
      );
    }

    this.enableCoordinateDebug();
    // this.drawCells(minRatio);

    this.createMinotaurAnimations();
    this.initPlayer(minRatio);

    this.createDiceAnimations();
    this.createDiceSprite(minRatio);

    this.createUI(minRatio);

    this.targetArrow = this.add.image(0, 0, "target_arrow");
    this.targetArrow.setVisible(false);
    this.targetArrow.setDepth(20);
    this.targetArrow.setOrigin(0.5, 1);
    this.targetArrow.setScale(1.2 * minRatio);
    this.targetArrowTween = null;

    this.input.keyboard.on("keydown-SPACE", () => {
      this.handleSpacePress();
    });

    this.input.keyboard.on("keydown-R", () => {
      this.resetPlayer();
    });
  }

  // =====================
  // TARGET ARROW
  // =====================
  showTargetArrow(cellIndex) {
    const cell = this.boardPath[cellIndex];
    const { width, height } = this.scale;

    const x = cell.x * width;
    const y = cell.y * height;

    if (this.targetArrowTween) {
      this.targetArrowTween.stop();
    }

    this.targetArrow.setPosition(x, y - 1);
    this.targetArrow.setVisible(true);
    this.targetArrow.setAlpha(1);

    this.targetArrowTween = this.tweens.add({
      targets: this.targetArrow,
      y: y - 15,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  hideTargetArrow() {
    if (this.targetArrowTween) {
      this.targetArrowTween.stop();
      this.targetArrowTween = null;
    }
    this.targetArrow.setVisible(false);
  }

  // =====================
  // DICE ROLL ANIMATION
  // =====================
  startDiceRollAnimation(result, onResultReady) {
    const { width, height } = this.scale;

    const cx = width / 2;
    const cy = height * 0.4;

    this.diceSprite.setPosition(cx, cy);

    const shadowOffsetY = 30;
    this.diceShadow.setPosition(cx, cy + shadowOffsetY);

    this.diceSprite.setTexture("dice_blur_1");
    this.diceSprite.setVisible(true);
    this.diceShadow.setVisible(true);

    this.diceSprite.setAlpha(1);
    this.diceSprite.setAngle(0);
    this.diceSprite.play("dice_blur_spin");

    if (this.diceTween) this.diceTween.stop();

    this.diceTween = this.tweens.add({
      targets: this.diceSprite,
      angle: 360,
      duration: 250,
      repeat: 4,
      ease: "Cubic.easeOut",
    });

    this.time.delayedCall(1000, () => {
      this.diceSprite.anims.stop();
      if (this.diceTween) this.diceTween.stop();
      this.diceSprite.setAngle(0);
      this.diceSprite.setTexture(`dice_${result}`);

      this.time.delayedCall(1000, () => {
        if (onResultReady) onResultReady();
      });
    });
  }

  // =====================
  // VẼ Ô (DEBUG)
  // =====================
  drawCells(minRatio) {
    const { width, height } = this.scale;
    const tileRadius = 24 * minRatio;

    this.boardPath.forEach((cell) => {
      const actualX = cell.x * width;
      const actualY = cell.y * height;

      const circle = this.add.circle(
        actualX,
        actualY,
        tileRadius,
        cell.color || 0x0f172a,
        cell.type === "start" ? 0.8 : 0.5
      );
      circle.setStrokeStyle(2, 0xffffff);

      const text = this.add
        .text(actualX, actualY, cell.index.toString(), {
          fontSize: Math.floor(14 * minRatio) + "px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      cell.circle = circle;
      cell.text = text;
    });
  }

  // =====================
  // PLAYER
  // =====================
  initPlayer(minRatio) {
    const { width, height } = this.scale;

    this.currentIndex = this.currentIndex ?? 0;
    this.isMoving = false;

    const startCell = this.boardPath[this.currentIndex];
    const playerX = startCell.x * width;
    const playerY = startCell.y * height;

    const skin = Phaser.Math.Between(1,3);
    this.mySkin = skin;

    this.player = this.add.sprite(
      playerX,
      playerY,
      `Minotaur_${skin}_idle_00_0`
    );

    this.playerBaseScale = 0.24 * minRatio;
    this.player.setScale(this.playerBaseScale);
    this.player.setOrigin(0.5, 0.8);
    this.player.play(`Minotaur_${skin}_idle`);
    this.player.setDepth(10);

    this.shadow = this.add.ellipse(
      playerX,
      playerY + 5,
      35 * minRatio,
      14 * minRatio,
      0x000000,
      0.35
    );
    this.shadow.setOrigin(0.5);
    this.shadow.setDepth(this.player.depth - 1);
  }
 
  // =====================
  // UI
  // =====================
  createUI(minRatio) {
    const { width, height } = this.scale;

    this.infoText = this.add
      .text(
        width / 2,
        40,
        "Nhấn SPACE để đổ xúc xắc | R để reset",
        {
          fontSize: Math.floor(20 * minRatio) + "px",
          color: "#facc15",
          backgroundColor: "#000000cc",
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5);

    this.cellInfoText = this.add
      .text(
        width / 2,
        height - 50,
        "Ô hiện tại: 0 (START)",
        {
          fontSize: Math.floor(18 * minRatio) + "px",
          color: "#ffffff",
          backgroundColor: "#000000cc",
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5);

    this.debugText = this.add
      .text(10, 10, "", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0, 0);

    this.updateDebugInfo();
  }

  // HÀM XỬ LÝ KHI NHẤN SPACE
  handleSpacePress() {
    // KIỂM TRA: nếu không được phép roll thì return
    if (!this.canRoll) {
      console.log("Đang di chuyển, chưa thể roll tiếp!");
      
      // Hiệu ứng thông báo nhấp nháy
      this.infoText.setText("⏳ ĐANG DI CHUYỂN... CHỜ TÍ NỮA!");
      this.infoText.setColor("#ff0000");
      
      // Sau 1 giây đổi lại màu cũ
      this.time.delayedCall(1000, () => {
        this.infoText.setColor("#facc15");
      });
      
      return;
    }

    // Được phép roll
    this.rollDiceAndMove();
  }


  // =====================
  // DEBUG CLICK
  // =====================
  enableCoordinateDebug() {
    this.input.on("pointerdown", (pointer) => {
      const xPercent = pointer.x / this.scale.width;
      const yPercent = pointer.y / this.scale.height;

      console.log(
        `Tọa độ tỷ lệ: x: ${xPercent.toFixed(
          3
        )}, y: ${yPercent.toFixed(3)}`
      );
      console.log(
        `Để thêm vào mảng: {index: ?, x: ${xPercent.toFixed(
          3
        )}, y: ${yPercent.toFixed(3)}, name: "Cell ?", type: "land"},`
      );

      let nearestCell = null;
      let minDistance = Infinity;

      this.boardPath.forEach((cell) => {
        const cellX = cell.x * this.scale.width;
        const cellY = cell.y * this.scale.height;
        const distance = Phaser.Math.Distance.Between(
          pointer.x,
          pointer.y,
          cellX,
          cellY
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestCell = cell;
        }
      });

      if (nearestCell && minDistance < 50) {
        console.log(
          `Ô gần nhất: ${nearestCell.index} - ${nearestCell.name}`
        );
      }

      const marker = this.add.circle(
        pointer.x,
        pointer.y,
        8,
        0xff0000,
        0.7
      );
      const markerText = this.add.text(
        pointer.x + 10,
        pointer.y - 10,
        `${xPercent.toFixed(3)}, ${yPercent.toFixed(3)}`,
        {
          fontSize: "12px",
          color: "#ffffff",
          backgroundColor: "#000000",
        }
      );

      this.time.delayedCall(2000, () => {
        marker.destroy();
        markerText.destroy();
      });
    });
  }

  updateDebugInfo() {
    const currentCell = this.boardPath[this.currentIndex];
    this.debugText.setText([
      `Ô: ${currentCell.index} (${currentCell.name})`,
      `Tọa độ: (${currentCell.x.toFixed(3)}, ${currentCell.y.toFixed(3)})`,
      `Tổng: ${this.boardPath.length}/37 ô`,
      `Click để lấy tọa độ`,
    ]);
  }

  // =====================
  // RESET
  // =====================
resetPlayer() {
  if (this.isMoving) {
    this.tweens.killAll();
    this.isMoving = false;
    this.canRoll = true;
  }

  this.currentIndex = 0;
  const startCell = this.boardPath[this.currentIndex];
  const playerX = startCell.x * this.scale.width;
  const playerY = startCell.y * this.scale.height;

  this.player.x = playerX;
  this.player.y = playerY;

  this.shadow.x = playerX;
  this.shadow.y = playerY + 5;

  // Quay lại idle với skin đúng
  this.player.play(`Minotaur_${this.mySkin}_idle`);

  this.onPlayerStop();
}

  // =====================
  // DICE + MOVE
  // =====================
rollDiceAndMove() {
  if (this.isMoving) return;
  this.canRoll = false;

  const dice = Phaser.Math.Between(1, 6);
  const totalCells = this.boardPath.length;
  const targetIndex = (this.currentIndex + dice) % totalCells;

  this.infoText.setText(
    `Xúc xắc: ${dice} | Di chuyển... (SPACE để tiếp tục)`
  );

  this.startDiceRollAnimation(dice, () => {
    this.showTargetArrow(targetIndex);

    // Đợi animation dice xong mới chạy
    this.movePlayer(dice);
    this.isRollingDice = false;
  });
}

movePlayer(steps) {
  if (this.isMoving) return;
  this.isMoving = true;

  const { width, height } = this.scale;
  const totalCells = this.boardPath.length;
  let stepsLeft = steps;

  // Lưu skin hiện tại
  const currentSkin = this.mySkin;

  const moveOneStep = () => {
    if (stepsLeft <= 0) {
      this.isMoving = false;
      this.canRoll = true;
      // Quay lại idle với skin đúng
      this.player.play(`Minotaur_${currentSkin}_idle`);
      this.onPlayerStop();
      return;
    }

    const nextIndex = (this.currentIndex + 1) % totalCells;
    const nextCell = this.boardPath[nextIndex];

    const targetX = nextCell.x * width;
    const targetY = nextCell.y * height;

    this.player.rotation = 0;

    if (targetX < this.player.x) {
      this.player.setFlipX(true);
    } else if (targetX > this.player.x) {
      this.player.setFlipX(false);
    }

    // Chạy animation run với skin đúng
    this.player.play(`Minotaur_${currentSkin}_run_throw`);

    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: targetY,
      duration: 350,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.shadow.x = this.player.x;
        this.shadow.y = this.player.y + 5;
      },
      onComplete: () => {
        this.currentIndex = nextIndex;
        stepsLeft--;

        this.highlightCurrentCell();
        moveOneStep();
      },
    });
  };

  moveOneStep();
}

  // =====================
  // HIGHLIGHT + STOP
  // =====================
  highlightCurrentCell() {
    this.boardPath.forEach((cell) => {
      if (cell.circle) {
        cell.circle.setFillStyle(cell.color || 0x0f172a, 0.5);
      }
    });

    const currentCell = this.boardPath[this.currentIndex];
    if (currentCell.circle) {
      currentCell.circle.setFillStyle(0xffd700, 0.7);
    }
  }

  onPlayerStop() {
    const cell = this.boardPath[this.currentIndex];
    this.cellInfoText.setText(
      `Ô hiện tại: ${cell.index} (${cell.name})`
    );

    this.socket.emit("move", {
      index: this.currentIndex
    });

    this.updateDebugInfo();

    this.hideTargetArrow();
    this.highlightCurrentCell();
    // this.saveGameState();
  }
}