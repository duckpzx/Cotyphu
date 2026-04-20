import { getPlayerData, setPlayerData, getActiveProfile } from "../server/utils/playerData.js";
import EcoinManager from "../server/utils/ecoinManager.js";
import ChatWidget from "./components/ChatWidget.js";
import FriendPanel from "./components/FriendPanel.js";
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
    this.load.image("close_btn",  "assets/ui/shared/close.png");
    this.load.image("add_friend", "assets/ui/shared/friend.png");
    this.load.image("icon_search", "assets/ui/shared/icon_search.png");
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
    .setInteractive({ cursor: 'pointer' });

  friend.on("pointerdown", () => {
    if (this._friendPanelOpen) {
      this._destroyFriendPanel();
    } else {
      this._openFriendPanel(width, height);
    }
  });

  // Khi bấm nút Chat trong FriendPanel → đóng FriendPanel, mở chat PM
  this.events.off("friend:open_pm"); // tránh duplicate listener
  this.events.on("friend:open_pm", (friend) => {
    // Đóng FriendPanel
    if (this._friendPanelOpen) {
      this._destroyFriendPanel();
    }
    this._pmFriend = friend;
    this._activeTab = 1;
    // Xóa unread của người này
    const fid = Number(friend.friend_uid ?? friend.id);
    if (this._pmUnreadPerFriend?.has(fid)) {
      const cleared = this._pmUnreadPerFriend.get(fid) || 0;
      this._pmUnreadPerFriend.delete(fid);
      this._pmUnreadTotal = Math.max(0, (this._pmUnreadTotal || 0) - cleared);
      this._updateChatBadge?.();
    }
    if (this._chatPanelOpen) {
      this._destroyChatPanel();
    }
    this._openChatPanel(width, height, { tab: 1, friend });
  });

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

    // ── Badge đỏ tổng tin chưa đọc ──────────────────────────────
    const badgeR  = 11;
    const badgeX  = btnX + BTN_SIZE * 0.32;
    const badgeY  = btnY - BTN_SIZE * 0.32;
    const badgeG  = this.add.graphics().setDepth(D + 3);
    const badgeTxt = this.add.text(badgeX, badgeY, "", {
      fontFamily: "Signika", fontSize: "11px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 4);

    const updateBadge = () => {
      badgeG.clear();
      const total = this._pmUnreadTotal || 0;
      if (total <= 0) { badgeTxt.setText(""); return; }
      badgeG.fillStyle(0xdd2222, 1);
      badgeG.fillCircle(badgeX, badgeY, badgeR);
      badgeTxt.setText(total > 99 ? "99+" : String(total));
    };
    this._updateChatBadge = updateBadge;
    updateBadge();

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

  _openChatPanel(width, height, opts = {}) {
    this._chatPanelOpen = true;
    // opts.tab: 0=Thế Giới, 1=Bạn Bè
    // opts.friend: object friend để mở PM ngay
    if (opts.tab !== undefined) this._activeTab = opts.tab;
    if (opts.friend !== undefined) this._pmFriend = opts.friend;

    const PANEL_W = 340;
    const PANEL_H = 420;
    const PANEL_X = 10;
    const PANEL_Y = height / 2 - PANEL_H / 2 - 30;
    const TAB_H   = 36;
    const D       = 120; // thấp hơn FriendPanel (160) để FriendPanel đè lên trên

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
          { tl: i === 0 ? 10 : 0, tr: 0, bl: 0, br: 0 });
        tabObjs.push(tg);

        const tt = this.add.text(tx + tw / 2, PANEL_Y + TAB_H / 2, label, {
          fontFamily: "Signika", fontSize: "15px",
          color: isActive ? "#ffffff" : "#7799bb", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(D + 2);
        tabObjs.push(tt);

        // Badge đỏ trên tab "Bạn Bè" (i === 1)
        if (i === 1) {
          const unread = this._pmUnreadTotal || 0;
          if (unread > 0 && !isActive) {
            const bR = 9;
            const bX = tx + tw / 2 + tt.width / 2 + bR + 4;
            const bY = PANEL_Y + TAB_H / 2;
            const bg = this.add.graphics().setDepth(D + 3);
            bg.fillStyle(0xdd2222, 1);
            bg.fillCircle(bX, bY, bR);
            tabObjs.push(bg);
            const bt = this.add.text(bX, bY, unread > 99 ? "99+" : String(unread), {
              fontFamily: "Signika", fontSize: "10px", color: "#ffffff", fontStyle: "bold"
            }).setOrigin(0.5).setDepth(D + 4);
            tabObjs.push(bt);
          }
        }

        const tz = this.add.zone(tx + tw / 2, PANEL_Y + TAB_H / 2, tw, TAB_H)
          .setInteractive({ cursor: "pointer" }).setDepth(D + 3);
        tz.on("pointerdown", () => {
          if (this._activeTab === i) return;
          this._activeTab = i;
          // Bấm tab "Bạn Bè" → xóa unread
          if (i === 1) {
            this._pmUnreadTotal = 0;
            this._pmUnreadPerFriend = new Map();
            this._updateChatBadge?.();
          }
          this._pmFriend = null;
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
            channel: "world", socket: this._worldSocket, depth: D + 1,
            myId: this.player?.user?.id
          });
          currentChat.build(PANEL_X, CHAT_Y, PANEL_W, CHAT_H);
          currentChat.addSystemMessage("Chat Thế Giới — Chào mừng!");
          this._currentChatWidget = currentChat;
        });
      } else {
        // Tab Bạn Bè
        const friend = this._pmFriend; // null = xem danh sách, có = xem PM
        if (!friend) {
          currentChat = this._buildPMList(PANEL_X, CHAT_Y, PANEL_W, CHAT_H, D + 1, (f) => {
            this._pmFriend = f;
            rebuildChatArea();
          });
          this._currentChatWidget = currentChat; // lưu để destroy được
        } else {
          currentChat = this._buildPMWidget(PANEL_X, CHAT_Y, PANEL_W, CHAT_H, D + 1, friend, () => {
            // Callback back → về danh sách
            this._pmFriend = null;
            rebuildChatArea();
          });
          this._currentChatWidget = currentChat;
        }
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
    this._chatPanelBuildTabs = buildTabs;
    this._chatPanelCurrentRef = () => currentChat;
  }

  _destroyChatPanel() {
    this._chatPanelOpen = false;
    this._currentChatWidget?.destroy();
    this._currentChatWidget = null;
    this._chatPanelObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._chatPanelObjs = null;
  }

  // ── PM LIST — danh sách conversation ────────────────────────────
  _buildPMList(x, y, w, h, depth, onSelect) {
    const objs = [];
    const push = o => { objs.push(o); return o; };
    const D = depth;

    // Nền
    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x041428, 0.62);
    bg.fillRoundedRect(x, y, w, h, { tl: 0, tr: 10, bl: 0, br: 0 });
    bg.lineStyle(1.5, 0x2255aa, 0.5);
    bg.strokeRoundedRect(x, y, w, h, { tl: 0, tr: 10, bl: 0, br: 0 });

    // Mask để clip nội dung trong vùng list
    const maskShape = this.make.graphics({ add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(x, y, w, h);
    const listMask = maskShape.createGeometryMask();

    const conversations = this._pmConversations;
    const hasCached = conversations && conversations.size > 0;

    if (!hasCached) {
      push(this.add.text(x + w / 2, y + h / 2, "Chưa có tin nhắn nào.\nBấm 💬 trong danh sách\nbạn bè để nhắn tin!", {
        fontFamily: "Signika", fontSize: "14px", color: "#7799bb", align: "center"
      }).setOrigin(0.5).setDepth(D + 1));
    } else {
      const ROW_H = 52;
      let rowY = y + 8;
      conversations.forEach((msgs, friendId) => {
        if (!msgs.length) return;
        const lastMsg = msgs[msgs.length - 1];
        const nameMatch = lastMsg.text.match(/^\[(.+?)\]/);
        const displayName = nameMatch ? nameMatch[1] : `User ${friendId}`;

        // Row nền — áp mask
        const rowBg = push(this.add.graphics().setDepth(D + 1).setMask(listMask));
        rowBg.fillStyle(0x0a2040, 0.8);
        rowBg.fillRoundedRect(x + 6, rowY, w - 12, ROW_H - 4, 6);

        // Tên
        push(this.add.text(x + 16, rowY + 10, displayName, {
          fontFamily: "Signika", fontSize: "14px", color: "#aaccff", fontStyle: "bold"
        }).setDepth(D + 2).setMask(listMask));

        // Preview tin nhắn cuối
        const preview = lastMsg.text.replace(/^\[.+?\] /, "").slice(0, 30) + (lastMsg.text.length > 30 ? "…" : "");
        push(this.add.text(x + 16, rowY + 28, preview, {
          fontFamily: "Signika", fontSize: "12px", color: "#6688aa"
        }).setDepth(D + 2).setMask(listMask));

        // Zone click — chỉ trong vùng row thực tế
        const capturedRowY = rowY;
        const zone = push(this.add.zone(x + w / 2, capturedRowY + (ROW_H - 4) / 2, w - 12, ROW_H - 4)
          .setInteractive({ cursor: "pointer" }).setDepth(D + 3));
        zone.on("pointerover",  () => { rowBg.clear(); rowBg.fillStyle(0x1a4070, 0.9); rowBg.fillRoundedRect(x + 6, capturedRowY, w - 12, ROW_H - 4, 6); });
        zone.on("pointerout",   () => { rowBg.clear(); rowBg.fillStyle(0x0a2040, 0.8); rowBg.fillRoundedRect(x + 6, capturedRowY, w - 12, ROW_H - 4, 6); });
        zone.on("pointerdown",  () => {
          onSelect({ friend_uid: friendId, id: friendId, name: displayName === "Bạn" ? `User ${friendId}` : displayName });
        });

        rowY += ROW_H;
      });
    }

    return {
      destroy: () => {
        maskShape.destroy();
        objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      }
    };
  }

  // ── PM WIDGET ────────────────────────────────────────────────────
  _buildPMWidget(x, y, w, h, depth, friend, onBack = null) {
    const objs = [];
    const push = o => { objs.push(o); return o; };
    const socket = this._worldSocket;
    const toId   = friend.friend_uid ?? friend.id;
    const D      = depth;

    // Cache conversation — lưu tin nhắn trong memory
    if (!this._pmConversations) this._pmConversations = new Map();
    if (!this._pmConversations.has(toId)) {
      this._pmConversations.set(toId, []);
    }
    const conversation = this._pmConversations.get(toId);

    const INPUT_H = 40;
    const HEADER_H = 32;
    const MSG_H   = h - INPUT_H - HEADER_H;
    const SEND_W  = 52;
    const INPUT_W = w - SEND_W;

    // ── Header tên bạn + nút Back ───────────────────────────────
    const hdrBg = push(this.add.graphics().setDepth(D));
    hdrBg.fillStyle(0x041428, 0.85);
    hdrBg.fillRoundedRect(x, y, w, HEADER_H, { tl: 0, tr: 10, bl: 0, br: 0 });

    // Nút Back ←
    if (onBack) {
      const backTxt = push(this.add.text(x + 10, y + HEADER_H / 2, "◀", {
        fontFamily: "Signika", fontSize: "18px", color: "#7799bb"
      }).setOrigin(0, 0.5).setDepth(D + 2).setInteractive({ cursor: "pointer" }));
      backTxt.on("pointerover",  () => backTxt.setColor("#aaccff"));
      backTxt.on("pointerout",   () => backTxt.setColor("#7799bb"));
      backTxt.on("pointerdown",  () => onBack());
    }

    push(this.add.text(x + w / 2, y + HEADER_H / 2, `${friend.name}`, {
      fontFamily: "Signika", fontSize: "14px", color: "#aaccff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 1));

    // ── Vùng tin nhắn ───────────────────────────────────────────
    const msgY = y + HEADER_H;
    const msgBg = push(this.add.graphics().setDepth(D));
    msgBg.fillStyle(0x041428, 0.62);
    msgBg.fillRoundedRect(x, msgY, w, MSG_H, 0);
    msgBg.lineStyle(1.5, 0x2255aa, 0.5);
    msgBg.strokeRoundedRect(x, msgY, w, MSG_H, 0);

    const chatBox = { x: x + 8, y: msgY + 6, w: w - 16, h: MSG_H - 10, lineH: 18 };
    const lines = [];

    const appendLine = (text, color = "#ffffff", time = null, saveToCache = true) => {
      // Lưu vào cache
      if (saveToCache) {
        conversation.push({ text, color, time });
        // Giới hạn 100 tin nhắn mỗi conversation
        if (conversation.length > 100) conversation.shift();
      }

      const maxLines = Math.floor(chatBox.h / chatBox.lineH);
      if (lines.length >= maxLines) {
        const old = lines.shift();
        try { old?.ts?.destroy(); old?.msg?.destroy(); } catch(e) {}
        lines.forEach(l => {
          l.msg.setY(l.msg.y - chatBox.lineH);
          l.ts?.setY(l.ts?.y - chatBox.lineH);
        });
      }
      const lineY = chatBox.y + lines.length * chatBox.lineH;
      let tsStr = "";
      if (time) {
        const diffMin = Math.floor((Date.now() - time) / 60000);
        tsStr = diffMin < 1 ? "vừa xong" : diffMin < 60 ? `${diffMin}ph`
              : new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      }
      const msg = push(this.add.text(chatBox.x, lineY, text, {
        fontFamily: "Signika", fontSize: "13px", color,
        wordWrap: { width: chatBox.w - (tsStr ? 52 : 0) }
      }).setDepth(D + 1));
      let ts = null;
      if (tsStr) {
        ts = push(this.add.text(chatBox.x + chatBox.w, lineY, tsStr, {
          fontFamily: "Signika", fontSize: "11px", color: "#6688aa"
        }).setOrigin(1, 0).setDepth(D + 1));
      }
      lines.push({ msg, ts });
    };

    // Restore tin nhắn cũ từ cache
    conversation.forEach(m => appendLine(m.text, m.color, m.time, false));

    // ── Input ────────────────────────────────────────────────────
    const inputY = msgY + MSG_H;
    const inputBg = push(this.add.graphics().setDepth(D));
    inputBg.fillStyle(0x020d1e, 0.92);
    inputBg.fillRoundedRect(x, inputY, INPUT_W, INPUT_H, 0);
    inputBg.lineStyle(1.5, 0x2255aa, 0.6);
    inputBg.strokeRoundedRect(x, inputY, INPUT_W, INPUT_H, 0);

    let inputText = "";
    const placeholder = push(this.add.text(x + 12, inputY + INPUT_H / 2, "Nhập tin nhắn...", {
      fontFamily: "Signika", fontSize: "13px", color: "#4477aa"
    }).setOrigin(0, 0.5).setDepth(D + 1));
    const inputDisplay = push(this.add.text(x + 12, inputY + INPUT_H / 2, "", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff"
    }).setOrigin(0, 0.5).setDepth(D + 1));

    const syncInput = () => {
      inputDisplay.setText(inputText);
      placeholder.setVisible(inputText.length === 0);
    };

    const sendMsg = () => {
      const msg = inputText.trim();
      if (!msg) return;
      socket?.emit("chat:pm:send", { to_id: toId, message: msg });
      inputText = "";
      syncInput();
    };

    let focused = false;
    const keyListener = (e) => {
      if (!focused) return;
      if (e.key === "Enter")     { sendMsg(); }
      else if (e.key === "Backspace") { inputText = inputText.slice(0, -1); syncInput(); }
      else if (e.key === "Escape")    { focused = false; }
      else if (e.key.length === 1 && inputText.length < 200) { inputText += e.key; syncInput(); }
    };
    window.addEventListener("keydown", keyListener);

    const inputZone = push(this.add.zone(x + INPUT_W / 2, inputY + INPUT_H / 2, INPUT_W, INPUT_H)
      .setInteractive({ cursor: "text" }).setDepth(D + 2));
    inputZone.on("pointerdown", () => { focused = true; placeholder.setVisible(false); });

    // ── Nút Gửi ─────────────────────────────────────────────────
    const sendX = x + INPUT_W;
    const sendG = push(this.add.graphics().setDepth(D));
    const drawSend = (hover) => {
      sendG.clear();
      sendG.fillGradientStyle(
        hover ? 0x22bbff : 0x0099ff, hover ? 0x22bbff : 0x0099ff,
        hover ? 0x0055cc : 0x0066cc, hover ? 0x0055cc : 0x0066cc, 1
      );
      sendG.fillRoundedRect(sendX, inputY, SEND_W, INPUT_H, 0);
    };
    drawSend(false);
    push(this.add.text(sendX + SEND_W / 2, inputY + INPUT_H / 2, "Gửi", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 1));
    const sendZone = push(this.add.zone(sendX + SEND_W / 2, inputY + INPUT_H / 2, SEND_W, INPUT_H)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 2));
    sendZone.on("pointerover",  () => drawSend(true));
    sendZone.on("pointerout",   () => drawSend(false));
    sendZone.on("pointerdown",  () => sendMsg());

    // ── Socket listeners ─────────────────────────────────────────
    const myId = this.player?.user?.id;

    // Xóa unread của conversation này khi mở
    if (this._pmUnreadPerFriend?.has(Number(toId))) {
      const cleared = this._pmUnreadPerFriend.get(Number(toId)) || 0;
      this._pmUnreadPerFriend.delete(Number(toId));
      this._pmUnreadTotal = Math.max(0, (this._pmUnreadTotal || 0) - cleared);
      this._updateChatBadge?.();
      this._chatPanelBuildTabs?.();
    }

    const onPmMessage = (data) => {
      const isMe = Number(data.from_id) === Number(myId);
      const isRelevant = isMe
        ? Number(data.to_id) === Number(toId)
        : Number(data.from_id) === Number(toId);
      if (!isRelevant) return;
      const label = isMe ? `[Bạn] ${data.message}` : `[${data.name}] ${data.message}`;
      appendLine(label, isMe ? "#aaddff" : "#ffffff", data.time);
    };
    socket?.on("chat:pm:message", onPmMessage);

    // Nhận PM từ bất kỳ ai khi widget đang mở (lưu vào cache dù không đang xem)
    const onPmAny = (data) => {
      const isMe = Number(data.from_id) === Number(myId);
      const otherId = isMe ? Number(data.to_id) : Number(data.from_id);
      if (otherId === Number(toId)) return; // đã xử lý bởi onPmMessage
      // Lưu vào cache của conversation khác
      if (!this._pmConversations.has(otherId)) {
        this._pmConversations.set(otherId, []);
      }
      const label = isMe ? `[Bạn] ${data.message}` : `[${data.name}] ${data.message}`;
      const cache = this._pmConversations.get(otherId);
      cache.push({ text: label, color: isMe ? "#aaddff" : "#ffffff", time: data.time });
      if (cache.length > 100) cache.shift();
    };
    socket?.on("chat:pm:message", onPmAny);

    return {
      destroy: () => {
        window.removeEventListener("keydown", keyListener);
        socket?.off("chat:pm:message", onPmMessage);
        socket?.off("chat:pm:message", onPmAny);
        objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      }
    };
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

    // ── Lắng nghe PM đến để track unread ────────────────────────
    this._worldSocket.on("chat:pm:message", (data) => {
      const myId = this.player?.user?.id;
      const isMe = Number(data.from_id) === Number(myId);
      if (isMe) return; // tin mình gửi không tính unread

      // Chỉ tăng unread nếu tab Bạn Bè không đang active với đúng người này
      const fromId = Number(data.from_id);
      const isViewingThisConv = this._chatPanelOpen
        && this._activeTab === 1
        && this._pmFriend
        && Number(this._pmFriend.friend_uid ?? this._pmFriend.id) === fromId;

      if (!isViewingThisConv) {
        if (!this._pmUnreadTotal) this._pmUnreadTotal = 0;
        if (!this._pmUnreadPerFriend) this._pmUnreadPerFriend = new Map();
        this._pmUnreadTotal++;
        this._pmUnreadPerFriend.set(fromId, (this._pmUnreadPerFriend.get(fromId) || 0) + 1);
        this._updateChatBadge?.();
        if (this._chatPanelOpen && this._chatPanelBuildTabs) {
          this._chatPanelBuildTabs();
        }
      }
    });
  }

  shutdown() {
    this._destroyChatPanel();
    this._destroyFriendPanel();
    this._worldSocket?.disconnect();
    this._worldSocket = null;
    // Xóa cache PM khi thoát game
    this._pmConversations = null;
  }

  // ── FRIEND PANEL ─────────────────────────────────────────────────

  _openFriendPanel(width, height) {
    this._friendPanelOpen = true;
    const playerData = this.registry.get("playerData") || JSON.parse(localStorage.getItem("playerData") || "null");
    const token = playerData?.token || localStorage.getItem("token");

    // Dùng lại worldSocket nếu đã connect, hoặc tạo mới
    const doOpen = () => {
      this._friendPanel = new FriendPanel(this, {
        socket:     this._worldSocket,
        playerData: this.player,
        depth:      160
      });
      this._friendPanel.build(width, height);
    };

    if (this._worldSocket?.connected) {
      doOpen();
    } else {
      this._initWorldSocket(() => doOpen());
    }
  }

  _destroyFriendPanel() {
    this._friendPanelOpen = false;
    this._friendPanel?.destroy();
    this._friendPanel = null;
  }

  _showToast(msg) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2 - 60, msg, {
      fontFamily: "Signika", fontSize: "16px", color: "#ffffff",
      backgroundColor: "#00000099", padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => t.destroy() });
  }
}
