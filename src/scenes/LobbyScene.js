import { getPlayerData, setPlayerData, getActiveProfile } from "../server/utils/playerData.js";
import EcoinManager from "../server/utils/ecoinManager.js";
import ChatWidget from "./components/ChatWidget.js";
import { SERVER_URL } from "../config.js";

// src/scenes/LobbyScene.js
export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
  }

  preload() {
    // nếu có ảnh sảnh thì load ở đây
    this.load.image(
      "lobby-bg",
      "assets/ui/lobby/background.png"
    );
    
    // icon top bar
    this.load.image("coin","assets/ui/shared/coin.png");
    this.load.image("add","assets/ui/shared/add.png");
    this.load.image("border","assets/ui/lobby/border.png");
    this.load.image("bag","assets/ui/lobby/backpack.png");
    this.load.image("shop","assets/ui/lobby/shop.png");
    this.load.image("tarot","assets/ui/lobby/tarot.png");
    this.load.image("friend","assets/ui/lobby/friend.png");
    this.load.image("chat_btn","assets/ui/lobby/chat.png");
    this.load.image("close_btn","assets/ui/shared/close.png");
  }

  create() {
    const { width, height } = this.scale;

    this.player = getPlayerData(this);
    EcoinManager.init(this);

    this.playerName = this.player?.user?.name || "Player";
    const activeProfile = getActiveProfile(this);

    this.playerSkin = activeProfile.skin_id;
    this.characterName = activeProfile.characterName;

    // ===== NỀN SẢNH =====
    const bg = this.add.image(width / 2, height / 2, "lobby-bg");

    // scale theo chiều ngang
    const scale = width / bg.width;
    bg.setScale(scale);
    bg.setPosition(width / 2, height / 2);

    // ===== NÚT Ở ĐẢO GIỮA: ĐẤU TRƯỜNG TRÒ CHƠI =====
    const playText = this.add
      .text(width / 2, height / 2 + 25, "ĐẤU TRƯỜNG\nTRÍ TUỆ", {
        fontFamily: "Signika",
        fontSize: "36px",
        fontWeight: 900,
        align: "center",
        color: "#dff8ff",
        stroke: "#222222",
        strokeThickness: 6,
        padding: { top: 10, bottom: 10, left: 5, right: 5 }
      })
      .setOrigin(0.5)
      .setInteractive({ cursor: "pointer" });

    playText.setShadow(0, 0, "#00000055", 12, true, true);

    playText.on("pointerup", () => {

      this.cameras.main.fadeOut(200);

      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("RoomListScene",{
          name: this.playerName,
          skin: this.playerSkin,
          characterName: this.characterName
        });
      });

    });

    // ===== STYLE CHUNG CHO 3 CHỮ TRÊN CÁC ĐẢO KHÁC =====
    const islandTextStyle = {
      fontFamily: "Signika",
      fontSize: "32px",
      fontWeight: 900,  
      color: "#dff8ff",
      stroke: "#222222",
      strokeThickness: 6,
      padding: { top: 10, bottom: 10 }
    };

    // ===== TOẠ ĐỘ TƯƠNG ĐỐI 3 ĐẢO (dùng tỉ lệ để auto fit màn hình) =====
    const menuItems = [
      {
        key: "shop",
        label: "CỬA HÀNG",
        rx: 0.31, // đảo trên bên trái
        ry: 0.23
      },
      {
        key: "rank",
        label: "XẾP HẠNG",
        rx: 0.12, // đảo giữa/trên trái (tuỳ map bạn chỉnh)
        ry: 0.42
      },
      {
        key: "lab",
        label: "NGHIÊN CỨU",
        rx: 0.84, // đảo bên phải
        ry: 0.44
      }
    ];

    // lưu lại nếu muốn dùng resize sau này
    this.islandTexts = [];

    menuItems.forEach((item) => {
      const x = width * item.rx;
      const y = height * item.ry;

      const txt = this.add
        .text(x, y, item.label, islandTextStyle)
        .setOrigin(0.5)
        .setInteractive({ cursor: "pointer" });

      txt.setShadow(0, 0, "#00000055", 12, true, true);

      txt.on("pointerup", () => {
        if (item.key === "shop") {
          this.cameras.main.fadeOut(200);
          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("ShopScene");
          });
        } else if (item.key === "rank") {
          this.cameras.main.fadeOut(200);
          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("RatingScene");
          });
        } else if (item.key === "lab") {
          this.cameras.main.fadeOut(200);
          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("LabScene");
          });
        } else {
          console.log("Click menu:", item.key);
        }
      });

      this.islandTexts.push({ text: txt, config: item });
    });

    this.createTopBar();

    // ===== handle khi resize màn hình =====
    this.scale.on("resize", (gameSize) => {
      const { width: w, height: h } = gameSize;

      // cập nhật lại nền
      const newScale = w / bg.width;
      bg.setScale(newScale);
      bg.setPosition(w / 2, h / 2);

      // cập nhật vị trí 3 chữ đảo
      this.islandTexts.forEach(({ text, config }) => {
        text.setPosition(w * config.rx, h * config.ry);
      });

      playText.setPosition(w / 2, h / 2 + 40);
    });
  }

createTopBar() {

  const { width, height } = this.scale;
  const barHeight = 70;
  const y = height - barHeight / 2;

  // ===== GRADIENT TEXTURE =====
  const g = this.add.graphics();

  g.fillGradientStyle(
    0xffffff, 0xffffff,
    0x000000, 0x000000,
    0.45, 0.45, 0, 0
  );

  g.fillRect(0, 0, width, barHeight);
  g.generateTexture("barGradient", width, barHeight);
  g.destroy();


  // ===== BACKGROUND =====
  const barBg = this.add.rectangle(
    width / 2,
    y,
    width,
    barHeight,
    0x111111
  )
  .setAlpha(0.43)   // giống #ffffff6f
  .setDepth(100);


  // ===== GRADIENT OVERLAY =====
  const gradient = this.add.image(
    width / 2,
    y,
    "barGradient"
  )
  .setAlpha(0.25)
  .setDepth(101);


  // ===== BORDER TOP =====
  const topBorder = this.add.rectangle(
    width / 2,
    y - barHeight / 2,
    width,
    3,
    0x1f1f1f
  )
  .setAlpha(0.4)
  .setDepth(102);


  // ===== SHADOW =====
  const shadow = this.add.rectangle(
    width / 2,
    y + barHeight / 2,
    width,
    10,
    0x000000
  )
  .setAlpha(0.15)
  .setDepth(99);


  // ===== AVATAR =====
// ===== CỤM PROFILE (AVATAR + TÊN) =====
  const profileX = 40; // Vị trí bắt đầu của cụm
  const profileBgWidth = 220; 
  const profileBgHeight = 48;
  const avatarSize = 55; // Kích thước bạn muốn
  const avatarRadius = avatarSize / 2;

  // 1. Vẽ khung nền thẫm cho Profile (nằm dưới Avatar và Tên)
  const profileBg = this.add.graphics();
  profileBg.fillStyle(0x0f0f0f, 0.4);
  // Vẽ lùi lại một chút để Avatar đè lên đầu khung
  profileBg.fillRoundedRect(profileX + 20, y - profileBgHeight / 2, profileBgWidth, profileBgHeight, 8);
  profileBg.lineStyle(2, 0x1f1f1f, 0.2);
  profileBg.strokeRoundedRect(profileX + 20, y - profileBgHeight / 2, profileBgWidth, profileBgHeight, 8);
  profileBg.setDepth(102);

  // 2. Vẽ Avatar với VIỀN (Stroke)
  // setStrokeStyle(độ dày, màu sắc, alpha)
  const avatar = this.add.circle(profileX + avatarRadius, y - 2, avatarRadius, 0x000000, 0)
      .setDepth(104);

  const avatarBorder = this.add.image(avatar.x, avatar.y, "border")
    .setDepth(105)
    .setDisplaySize(avatarSize + 4, avatarSize + 4);

  // 3. Tên người chơi (đặt vào trong khung nền)
  const name = this.add.text(profileX + avatarSize + 15, y, this.playerName, {
    fontFamily: "Signika",
    fontSize: "23px",
    fontWeight: "bold",
    color: "#ffffff",
    stroke: "#222222",
    strokeThickness: 3
  })
  .setOrigin(0, 0.5)
  .setDepth(104);

// ===== CỤM COIN (KHUNG NỀN THẪM) =====
  const coinX = 310;
  const bgWidth = 240;
  const bgHeight = 48;

  // Vẽ khung nền thẫm bằng Graphics
  const coinBg = this.add.graphics();
  coinBg.fillStyle(0x0f0f0f, 0.4); // Màu đen, alpha 0.6
  coinBg.lineStyle(2, 0x1f1f1f, 0.2); // Viền xám mỏng
  // Vẽ hình chữ nhật bo góc (x, y, width, height, radius)
  coinBg.fillRoundedRect(coinX, y - bgHeight / 2, bgWidth, bgHeight, 8);
  coinBg.strokeRoundedRect(coinX, y - bgHeight / 2, bgWidth, bgHeight, 8);
  coinBg.setDepth(102);

  // Icon Coin (đặt đè lên khung)
  const coinIcon = this.add.image(coinX + 5, y, "coin")
    .setScale(0.8) // Chỉnh scale cho vừa khung
    .setOrigin(0, 0.5)
    .setDepth(103);

  // Text Coin
  const ecoinValue = EcoinManager.get(this);

  const coinText = this.add.text(
    coinIcon.x + 50,
    y,
    EcoinManager.format(ecoinValue),
    {
      fontFamily: "Signika",
      fontSize: "23px",
      fontWeight: "bold",
      color: "#ffffff",
      stroke: "#222222",
      strokeThickness: 3,
      padding: { left: 15 }
    }
  )
  .setOrigin(0, 0.5)
  .setDepth(103);

  // Sync real-time
  EcoinManager.onChange(this, (newEcoin) => {
      coinText.setText(EcoinManager.format(newEcoin));
  });

  // Nút cộng (icon add.png) - Giống trong ảnh mẫu của bạn
  const plusBtn = this.add.image(coinX + bgWidth - 25, y, "add")
    .setScale(0.7) // Điều chỉnh kích thước cho phù hợp
    .setOrigin(0.5)
    .setDepth(103)
    .setInteractive({ cursor: 'pointer' });


// ===== ICON MENU =====
  const iconStartX = width - 440;
  const gap = 120;
  const menuBgWidth = 100; // Độ rộng của mỗi ô nền icon
  const menuBgHeight = 48; // Chiều cao bằng với cụm profile/coin

  // 1. Vẽ nền thẫm cho 4 icon (Không dùng lineStyle/stroke để bỏ border)
  const menuBg = this.add.graphics();
  menuBg.fillStyle(0x0f0f0f, 0.4);
  menuBg.setDepth(102);

  // Vẽ 4 hình nền tại 4 vị trí icon
  for (let i = 0; i < 4; i++) {
    const bgX = (iconStartX + gap * i) - menuBgWidth / 2;
    const bgY = y - menuBgHeight / 2;
    menuBg.fillRoundedRect(bgX, bgY, menuBgWidth, menuBgHeight, 8);
  }

  // 2. Thêm các icon (Đã thêm cấu hình con trỏ chuột)
  const friend = this.add.image(iconStartX, y - 5, "friend")
    .setScale(1)
    .setDepth(103)
<<<<<<< HEAD
    .setInteractive({ cursor: 'pointer' });

  friend.on("pointerdown", () => {
    if (this._friendPanelOpen) {
      this._destroyFriendPanel();
    } else {
      this._openFriendPanel(width, height);
    }
  });
=======
    .setInteractive({ cursor: 'pointer' }); // Thêm ở đây
>>>>>>> parent of 4d28e5f (commit friend)

  const shop = this.add.image(iconStartX + gap, y - 5, "shop")
    .setScale(1)
    .setDepth(103)
    .setInteractive({ cursor: 'pointer' }); // Thêm ở đây

  shop.on("pointerup", () => {
    this.cameras.main.fadeOut(200);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("ShopScene");
    });
  });

  const bag = this.add.image(iconStartX + gap * 2, y - 5, "bag")
    .setScale(1)
    .setDepth(103)
    .setInteractive({ cursor: 'pointer' });

  bag.on("pointerup", () => {
    this.cameras.main.fadeOut(200);

    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("BagScene");
    });
  });

  const tarot = this.add.image(iconStartX + gap * 3, y - 5, "tarot")
    .setScale(1)
    .setDepth(103)
    .setInteractive({ cursor: 'pointer' });

  tarot.on("pointerup", () => {

    this.cameras.main.fadeOut(200);

    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("TarotScene");
    });

  });
  
  const menuIcons = [friend, shop, bag, tarot];

  menuIcons.forEach(icon => {
      icon.on('pointerover', () => {
          icon.setBlendMode(Phaser.BlendModes.ADD);
      });
      icon.on('pointerout', () => {
          icon.setBlendMode(Phaser.BlendModes.NORMAL);
      });
  });

  // ── WORLD CHAT ────────────────────────────────────────────────────
  this._buildChatButton(width, height);
  }

  _buildChatButton(width, height) {
    const BTN_SIZE = 90;
    const LABEL_H  = 22;
    const btnX     = 22 + BTN_SIZE / 2;
    const btnY     = height - 170;
    const D        = 110;

    // Icon chat
    const icon = this.add.image(btnX, btnY, "chat_btn")
      .setDisplaySize(BTN_SIZE, BTN_SIZE)
      .setDepth(D)
      .setInteractive({ cursor: "pointer" });

    // Label "Tin nhắn" với nền bo góc
    const label = this.add.text(btnX, btnY - BTN_SIZE / 2 + 90, "Tin Nhắn", {
      fontFamily: "Signika", fontSize: "17px", color: "#dff8ff",
      fontStyle: "bold", stroke: "#222222", strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 1);

    const lbPadX = 12, lbPadY = 4, lbR = 8;
    const labelBg = this.add.graphics().setDepth(D);
    labelBg.fillStyle(0x0f0f0f, 0.4);
    labelBg.fillRoundedRect(
      label.x - label.width / 2 - lbPadX,
      label.y - lbPadY,
      label.width + lbPadX * 2,
      label.height + lbPadY * 2,
      lbR
    );

    // Hover
    icon.on("pointerover",  () => icon.setTint(0xddddff));
    icon.on("pointerout",   () => icon.clearTint());
    icon.on("pointerdown",  () => {
      this._toggleChatPanel(width, height);
    });
  }

  _toggleChatPanel(width, height) {
    if (this._chatPanelOpen) {
      this._destroyChatPanel();
    } else {
      this._openChatPanel(width, height);
    }
  }

  _openChatPanel(width, height) {
    this._chatPanelOpen = true;

    const PANEL_W = 338;
    const PANEL_H = 420;
    const PANEL_X = 10;
    const PANEL_Y = height / 2 - PANEL_H / 2 - 30;
    const TAB_H   = 36;
    const D       = 120;

    const objs = [];
    const push  = o => { objs.push(o); return o; };

    // ── Nền panel ──────────────────────────────────────────────────
    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x041428, 0.92);
    bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    bg.lineStyle(1.5, 0x2255aa, 0.7);
    bg.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);

    // ── Tabs ───────────────────────────────────────────────────────
    const tabs = ["Thế Giới", "Bạn Bè"];
    this._activeTab = this._activeTab || 0;
    const tabObjs = [];

    const buildTabs = () => {
      tabObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      tabObjs.length = 0;

      tabs.forEach((label, i) => {
        const tx = PANEL_X + (PANEL_W / tabs.length) * i;
        const tw = PANEL_W / tabs.length;
        const isActive = i === this._activeTab;

        const tg = this.add.graphics().setDepth(D + 1);
        tg.fillStyle(isActive ? 0x1a5fa8 : 0x0a1a33, isActive ? 1 : 0.8);
        tg.fillRoundedRect(tx + 2, PANEL_Y + 2, tw - 4, TAB_H - 2,
          { tl: i === 0 ? 10 : 0, tr: i === tabs.length - 1 ? 10 : 0, bl: 0, br: 0 });
        tabObjs.push(tg);

        const tt = this.add.text(tx + tw / 2, PANEL_Y + TAB_H / 2, label, {
          fontFamily: "Signika", fontSize: "15px",
          color: isActive ? "#ffffff" : "#7799bb", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(D + 2);
        tabObjs.push(tt);

        const tz = this.add.zone(tx + tw / 2, PANEL_Y + TAB_H / 2, tw, TAB_H)
          .setInteractive({ cursor: "pointer" }).setDepth(D + 3);
        tz.on("pointerdown", () => {
          if (this._activeTab === i) return;
          this._activeTab = i;
          buildTabs();
          rebuildChatArea();
        });
        tabObjs.push(tz);
      });

      objs.push(...tabObjs);
    };

    // ── Khu vực chat ───────────────────────────────────────────────
    const CHAT_Y = PANEL_Y + TAB_H + 4;
    const CHAT_H = PANEL_H - TAB_H - 4;
    let currentChat = null;

    const rebuildChatArea = () => {
      currentChat?.destroy();

      if (this._activeTab === 0) {
        // World chat
        this._initWorldSocket(() => {
          currentChat = new ChatWidget(this, {
            channel: "world", socket: this._worldSocket, depth: D + 1
          });
          currentChat.build(PANEL_X, CHAT_Y, PANEL_W, CHAT_H);
          currentChat.addSystemMessage("Chat Thế Giới — Chào mừng!");
          this._currentChatWidget = currentChat;
        });
      } else {
        // Bạn bè — placeholder
        const ph = this.add.text(PANEL_X + PANEL_W / 2, CHAT_Y + CHAT_H / 2,
          "Tính năng Bạn Bè\nsắp ra mắt!", {
          fontFamily: "Signika", fontSize: "16px", color: "#7799bb",
          align: "center"
        }).setOrigin(0.5).setDepth(D + 1);
        currentChat = { destroy: () => ph.destroy() };
        this._currentChatWidget = null;
      }
    };

    // ── Nút đóng X (icon close.png, nhô ra góc trên phải panel) ───
    const closeR = 18;
    const closeX = PANEL_X + PANEL_W;
    const closeY = PANEL_Y;
    const closeBtn = push(this.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(closeR * 2.2, closeR * 2.2)
      .setDepth(D + 4));
    const closeZone = push(this.add.zone(closeX, closeY, closeR * 2.4, closeR * 2.4)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 5));
    closeZone.on("pointerover",  () => closeBtn.setAlpha(0.85));
    closeZone.on("pointerout",   () => closeBtn.setAlpha(1));
    closeZone.on("pointerdown",  () => this._destroyChatPanel());

    buildTabs();
    rebuildChatArea();

    this._chatPanelObjs = objs;
    this._chatPanelTabObjs = tabObjs;
    this._chatPanelRebuild = rebuildChatArea;
    this._chatPanelCurrentRef = () => currentChat;
  }

  _destroyChatPanel() {
    this._chatPanelOpen = false;
    this._currentChatWidget?.destroy();
    this._currentChatWidget = null;
    this._chatPanelObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._chatPanelObjs = null;
  }

  _initWorldSocket(cb) {
    const playerData = this.registry.get("playerData") || JSON.parse(localStorage.getItem("playerData") || "null");
    const token = playerData?.token || localStorage.getItem("token");
    if (!token) return;

    if (this._worldSocket?.connected) { cb(); return; }

    this._worldSocket?.disconnect();
    this._worldSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      auth: { token }
    });
    this._worldSocket.on("connect", () => cb());
  }

  shutdown() {
    this._destroyChatPanel();
    this._worldSocket?.disconnect();
    this._worldSocket = null;
  }
}
