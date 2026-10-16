import { getPlayerData, setPlayerData, getActiveProfile } from "../server/utils/playerData.js";
import EcoinManager from "../server/utils/ecoinManager.js";
import ChatWidget from "./components/ChatWidget.js";
import FriendPanel from "./components/FriendPanel.js";
import { SERVER_URL } from "../config.js";
import { setupClickSound, playTabSound, playOutSound } from "../utils/clickSound.js";

// ── Helper: chọn background theo giờ trong ngày ──────────────────
// 5:00 → 19:00 = ban ngày (light), còn lại = ban đêm (dark)
function getLobbyBgKey() {
  const hour = new Date().getHours();
  return (hour >= 5 && hour < 19) ? "lobby-bg-light" : "lobby-bg-dark";
}

// src/scenes/LobbyScene.js
export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
  }

  preload() {
    // Load cả 2 nền, dùng theo giờ
    this.load.image("lobby-bg-light", "assets/ui/lobby/background_light.png");
    this.load.image("lobby-bg-dark",  "assets/ui/lobby/background_dark.png");

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
    this.load.image("lobby_return", "assets/ui/shared/return.png");

    // Nhạc sảnh
    if (!this.cache.audio.exists("lobby_bgm")) {
      this.load.audio("lobby_bgm", "assets/music/lobby/lobbyscene.mp3");
    }
  }

  create() {
    const { width, height } = this.scale;

    this.player = getPlayerData(this);
    EcoinManager.init(this);

    this.playerName = this.player?.user?.name || "Player";
    const activeProfile = getActiveProfile(this);

    this.playerSkin = activeProfile.skin_id;
    this.characterName = activeProfile.characterName;

    // ── Nhạc nền sảnh ────────────────────────────────────────────
    // Lấy reference hoặc play lại nếu đã bị dừng (ví dụ sau khi thoát trận)
    this._bgm = this.sound.get("lobby_bgm") || null;
    if (this._bgm && !this._bgm.isPlaying) {
      this._bgm.play();
    }
    setupClickSound(this);

    // ===== NỀN SẢNH theo giờ =====
    const bg = this.add.image(width / 2, height / 2, getLobbyBgKey());

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

  // ── Click vào cụm profile → mở panel thông tin + lịch sử ─────────
  const profileZone = this.add.zone(
    profileX + 20 + profileBgWidth / 2,
    y,
    profileBgWidth + avatarSize / 2,
    profileBgHeight + 10
  ).setInteractive({ cursor: "pointer" }).setDepth(110);

  profileZone.on("pointerover", () => {
    profileBg.setAlpha(0.7);
    name.setTint(0xffff88);
  });
  profileZone.on("pointerout", () => {
    profileBg.setAlpha(1);
    name.clearTint();
  });
  profileZone.on("pointerdown", () => {
    this.tweens.add({ targets: profileBg, alpha: 0.3, duration: 80, yoyo: true });
    this._openMyProfilePanel(width, height);
  });

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

  plusBtn.on("pointerover",  () => plusBtn.setTint(0xddffdd));
  plusBtn.on("pointerout",   () => plusBtn.clearTint());
  plusBtn.on("pointerdown",  () => {
    this.tweens.add({ targets: plusBtn, scale: 0.55, duration: 80, yoyo: true });
    this.time.delayedCall(100, () => this._showTopUpPanel(width, height));
  });


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

  // ── Badge đỏ YC kết bạn trên icon friend ─────────────────────
  const frBadgeR   = 10;
  const frBadgeX   = iconStartX + 28;
  const frBadgeY   = y - 5 - 22;
  const frBadgeG   = this.add.graphics().setDepth(106);
  const frBadgeTxt = this.add.text(frBadgeX, frBadgeY, "", {
    fontFamily: "Signika", fontSize: "10px", color: "#ffffff", fontStyle: "bold"
  }).setOrigin(0.5).setDepth(107);

  const updateFriendBadge = (count) => {
    frBadgeG.clear();
    frBadgeTxt.setText("");
    if (count <= 0) return;
    frBadgeG.fillStyle(0xdd2222, 1);
    frBadgeG.fillCircle(frBadgeX, frBadgeY, frBadgeR);
    frBadgeTxt.setText(count > 99 ? "99+" : String(count));
  };
  this._updateFriendBadge = updateFriendBadge;

  // Lắng nghe event từ FriendPanel
  this.events.off("friendrequest:count");
  this.events.on("friendrequest:count", (count) => {
    this._friendRequestCount = count;
    updateFriendBadge(count);
  });

  // Fetch số lượng YC kết bạn ngay khi lobby load (qua socket)
  const fetchFriendRequestCount = () => {
    if (!this._worldSocket?.connected) return;
    this._worldSocket.emit("friend:requests");
    this._worldSocket.once("friend:requests", (data) => {
      const count = (data || []).length;
      this._friendRequestCount = count;
      updateFriendBadge(count);
    });
  };
  // Thử fetch sau 1s để socket kịp connect
  this.time.delayedCall(1000, fetchFriendRequestCount);

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

  // ── Nút Return — góc trên trái, về LoginScene ─────────────────────
  const retBtn = this.add.image(48, 48, "lobby_return")
    .setScale(1).setDepth(110).setInteractive({ cursor: "pointer" });
  retBtn.on("pointerover",  () => retBtn.setTint(0xddddff));
  retBtn.on("pointerout",   () => retBtn.clearTint());
  retBtn.on("pointerdown",  () => {
    playOutSound(this);
    this.tweens.add({ targets: retBtn, scale: 0.7, duration: 80, yoyo: true });
    this.time.delayedCall(160, () => {
      this._showLogoutConfirm(width, height);
    });
  });
  }

  _buildChatButton(width, height) {
    const BTN_SIZE = 90;
    const LABEL_H  = 22;
    const btnX     = 12 + BTN_SIZE / 2;
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
          playTabSound(this);
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

    // ── Lắng nghe YC kết bạn mới khi FriendPanel chưa mở ────────
    this._worldSocket.on("friend:request:incoming", () => {
      if (this._friendPanelOpen) return; // FriendPanel tự xử lý
      this._friendRequestCount = (this._friendRequestCount || 0) + 1;
      this._updateFriendBadge?.(this._friendRequestCount);
    });
  }

  // ── Confirm dialog — dùng chung cho FriendPanel và các nơi khác ──
  _showConfirm(message, onConfirm, onCancel = null) {
    // Xóa confirm cũ nếu có
    if (this._confirmObjs) {
      this._confirmObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._confirmObjs = null;
      this._confirmDomBtns?.forEach(b => b.remove());
      this._confirmDomBtns = null;
    }

    const { width, height } = this.scale;
    const D = 400;
    const w = 280, h = 120;
    const x = width / 2 - w / 2;
    const y = height / 2 - h / 2;
    const ui = [];

    // Blocker
    const blocker = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.40)
      .setDepth(D - 1).setInteractive();
    ui.push(blocker);

    // Hộp — cùng style panel bạn bè (vàng kem)
    const box = this.add.graphics().setDepth(D);
    // Bóng
    box.fillStyle(0x7a5a20, 0.22);
    box.fillRoundedRect(x + 3, y + 4, w, h, 14);
    // Nền gradient
    box.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xede0b0, 0xede0b0, 1);
    box.fillRoundedRect(x, y, w, h, 14);
    // Viền vàng nâu
    box.lineStyle(2, 0xb89040, 1);
    box.strokeRoundedRect(x, y, w, h, 14);
    // Gloss
    box.fillStyle(0xffffff, 0.22);
    box.fillRoundedRect(x + 6, y + 5, w - 12, 16, 6);
    // Viền inset
    box.lineStyle(1, 0xfff0c0, 0.35);
    box.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 13);
    ui.push(box);

    // Nội dung
    ui.push(this.add.text(x + w / 2, y + h / 2 - 18, message, {
      fontFamily: "Signika", fontSize: "15px",
      color: "#502700", fontStyle: "bold",
      align: "center", wordWrap: { width: w - 28 }
    }).setOrigin(0.5).setDepth(D + 1));

    const btnY    = y + h - 24;
    const confirmX = x + w / 2 - 60;
    const cancelX  = x + w / 2 + 60;

    // Visual buttons Phaser
    const makeBtn = (cx, label, c1, c2) => {
      const g = this.add.graphics().setDepth(D + 1);
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(cx - 46, btnY - 14 + 3, 92, 28, 14);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(cx - 46, btnY - 14, 92, 28, 14);
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(cx - 40, btnY - 10, 80, 9, 6);
      g.lineStyle(1.5, 0xffffff, 0.5);
      g.strokeRoundedRect(cx - 46, btnY - 14, 92, 28, 14);
      const t = this.add.text(cx, btnY, label, {
        fontFamily: "Signika", fontSize: "14px",
        color: "#ffffff", fontStyle: "bold",
        stroke: "#001122", strokeThickness: 2
      }).setOrigin(0.5).setDepth(D + 2);
      ui.push(g, t);
      return g;
    };

    const gConfirm = makeBtn(confirmX, "Xác nhận", 0xc63a4a, 0xef5b6a);
    const gCancel  = makeBtn(cancelX,  "Hủy",      0x1a5fa8, 0x2e8fe8);

    // DOM hit areas
    const canvas = this.game.canvas;
    const cRect  = canvas.getBoundingClientRect();
    const sx     = cRect.width  / this.scale.width;
    const sy     = cRect.height / this.scale.height;

    const makeDomHit = (cx, g, cb) => {
      const btn = document.createElement("div");
      btn.style.cssText = `
        position:fixed;
        left:${cRect.left+(cx-46)*sx}px;top:${cRect.top+(btnY-14)*sy}px;
        width:${92*sx}px;height:${28*sy}px;
        border-radius:${14*sy}px;cursor:pointer;z-index:99999;background:transparent;
      `;
      btn.onmouseenter = () => g.setAlpha(0.78);
      btn.onmouseleave = () => g.setAlpha(1);
      btn.onmousedown  = () => g.setAlpha(0.55);
      btn.onclick = () => {
        this._confirmObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
        this._confirmObjs = null;
        this._confirmDomBtns?.forEach(b => b.remove());
        this._confirmDomBtns = null;
        cb();
      };
      document.body.appendChild(btn);
      this._confirmDomBtns = this._confirmDomBtns || [];
      this._confirmDomBtns.push(btn);
    };

    makeDomHit(confirmX, gConfirm, () => onConfirm?.());
    makeDomHit(cancelX,  gCancel,  () => onCancel?.());

    // Fade in
    ui.forEach(o => { if (o.setAlpha) o.setAlpha(0); });
    this.tweens.add({ targets: ui.filter(o => o.setAlpha), alpha: 1, duration: 160 });

    this._confirmObjs = ui;
  }

  // ── Logout confirm panel ─────────────────────────────────────────
  _showLogoutConfirm(width, height) {
    this._destroyLogoutConfirm();

    const D = 500;
    const w = 300, h = 130;
    const x = width / 2 - w / 2;
    const y = height / 2 - h / 2;
    const ui = [];

    // Blocker Phaser — chặn click xuống scene
    const blocker = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.45)
      .setDepth(D - 1).setInteractive();
    ui.push(blocker);

    // Hộp + text vẽ bằng Phaser
    const box = this.add.graphics().setDepth(D);
    box.fillStyle(0x0b1f3a, 0.97);
    box.fillRoundedRect(x, y, w, h, 14);
    box.lineStyle(2, 0x5bc0ff, 0.9);
    box.strokeRoundedRect(x, y, w, h, 14);
    box.fillStyle(0xffffff, 0.08);
    box.fillRoundedRect(x + 6, y + 6, w - 12, 18, 8);
    ui.push(box);

    ui.push(this.add.text(x + w / 2, y + 28, "Đăng xuất", {
      fontFamily: "Signika", fontSize: "18px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 1));

    ui.push(this.add.text(x + w / 2, y + 54, "Bạn có chắc muốn đăng xuất?", {
      fontFamily: "Signika", fontSize: "14px", color: "#aaccff",
      align: "center", wordWrap: { width: w - 28 }
    }).setOrigin(0.5, 0).setDepth(D + 1));

    // ── Dùng DOM button để tránh hoàn toàn Phaser input conflict ──
    const canvas = this.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width  / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;

    const btnY    = y + h - 26;
    const acceptX = x + w / 2 - 68;
    const cancelX = x + w / 2 + 68;

    // Vẽ button Phaser style (visual)
    const makeBtn = (cx, label, c1, c2) => {
      const g = this.add.graphics().setDepth(D + 1);
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(cx - 48, btnY - 16, 96, 32, 16);
      g.fillStyle(0xffffff, 0.20);
      g.fillRoundedRect(cx - 42, btnY - 12, 84, 10, 8);
      g.lineStyle(1.5, 0xffffff, 0.35);
      g.strokeRoundedRect(cx - 48, btnY - 16, 96, 32, 16);
      const t = this.add.text(cx, btnY, label, {
        fontFamily: "Signika", fontSize: "15px",
        color: "#ffffff", fontStyle: "bold",
        stroke: "#001122", strokeThickness: 2
      }).setOrigin(0.5).setDepth(D + 2);
      ui.push(g, t);
      return g;
    };

    const gAccept = makeBtn(acceptX, "Đăng xuất", 0xc63a4a, 0xef5b6a);
    const gCancel = makeBtn(cancelX, "Hủy",       0x1a5fa8, 0x2e8fe8);

    // DOM hit area trong suốt đè lên để bắt click (tránh Phaser input conflict)
    const makeDomHitArea = (cx, g, cb) => {
      const btn = document.createElement("div");
      btn.style.cssText = `
        position: fixed;
        left:   ${canvasRect.left + (cx - 48) * scaleX}px;
        top:    ${canvasRect.top  + (btnY - 16) * scaleY}px;
        width:  ${96 * scaleX}px;
        height: ${32 * scaleY}px;
        border-radius: ${16 * scaleY}px;
        cursor: pointer;
        z-index: 99999;
        background: transparent;
      `;
      btn.onmouseenter = () => g.setAlpha(0.78);
      btn.onmouseleave = () => g.setAlpha(1);
      btn.onmousedown  = () => g.setAlpha(0.55);
      btn.onclick = () => { this._destroyLogoutConfirm(); cb(); };
      document.body.appendChild(btn);
      this._logoutDomBtns = this._logoutDomBtns || [];
      this._logoutDomBtns.push(btn);
    };

    makeDomHitArea(acceptX, gAccept, () => {
      this._bgm?.stop();
      this.cameras.main.fadeOut(220);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        localStorage.removeItem("playerData");
        this.scene.start("LoginScene");
      });
    });
    makeDomHitArea(cancelX, gCancel, () => {});

    ui.forEach(o => { if (o.setAlpha) o.setAlpha(0); });
    this.tweens.add({
      targets: ui.filter(o => o.setAlpha),
      alpha: 1, duration: 180, ease: "Power2"
    });

    this._logoutConfirmUi = ui;
  }

  _destroyLogoutConfirm() {
    this._logoutConfirmUi?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._logoutConfirmUi = null;
    this._logoutDomBtns?.forEach(b => b.remove());
    this._logoutDomBtns = null;
  }

  shutdown() {
    this._bgm?.stop();
    this._bgm = null;    this._destroyChatPanel();
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
      // Khôi phục count badge từ cache nếu có
      if (this._friendRequestCount > 0) {
        this._updateFriendBadge?.(this._friendRequestCount);
      }
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

  // ── PANEL NẠP ECOIN ──────────────────────────────────────────────
  _showTopUpPanel(width, height) {
    if (this._topUpPanelOpen) return;
    this._topUpPanelOpen = true;

    const objs = [];
    const push = o => { objs.push(o); return o; };
    const D = 200;

    const closeAll = () => {
      this._topUpPanelOpen = false;
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
    };

    // ── Dimmer ────────────────────────────────────────────────────
    const dimmer = push(this.add.graphics().setDepth(D));
    dimmer.fillStyle(0x000000, 0.55);
    dimmer.fillRect(0, 0, width, height);
    dimmer.setAlpha(0);
    this.tweens.add({ targets: dimmer, alpha: 1, duration: 200 });

    // Bấm ngoài để đóng
    const dimZone = push(this.add.zone(width / 2, height / 2, width, height)
      .setInteractive().setDepth(D));
    dimZone.on("pointerdown", closeAll);

    // ── Panel chính (style BagScene) ─────────────────────────────
    const PW = 560, PH = 400;
    const PX = width / 2, PY = height / 2;
    const R  = 18;
    const left = PX - PW / 2, top = PY - PH / 2;

    const panelG = push(this.add.graphics().setDepth(D + 1));
    // Bóng đổ
    panelG.fillStyle(0x000000, 0.25);
    panelG.fillRoundedRect(left + 6, top + 6, PW, PH, R);
    // Nền gradient vàng kem
    panelG.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xede0b0, 0xede0b0, 1);
    panelG.fillRoundedRect(left, top, PW, PH, R);
    // Viền trắng ngoài
    panelG.lineStyle(3, 0xffffff, 1);
    panelG.strokeRoundedRect(left, top, PW, PH, R);
    // Gloss trên
    panelG.fillStyle(0xffffff, 0.18);
    panelG.fillRoundedRect(left + 6, top + 4, PW - 12, 22, 8);
    // Viền đứt nét vàng bên trong
    const ins = 10, cR = R - 4;
    panelG.lineStyle(1.5, 0xb8922e, 0.5);
    const drawD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += 14) {
        panelG.beginPath();
        panelG.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
        panelG.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
        panelG.strokePath();
      }
    };
    drawD(left+ins+cR, top+ins, left+PW-ins-cR, top+ins);
    drawD(left+PW-ins, top+ins+cR, left+PW-ins, top+PH-ins-cR);
    drawD(left+PW-ins-cR, top+PH-ins, left+ins+cR, top+PH-ins);
    drawD(left+ins, top+PH-ins-cR, left+ins, top+ins+cR);

    // Chặn click xuyên panel
    const panelZone = push(this.add.zone(PX, PY, PW, PH)
      .setInteractive().setDepth(D + 1));
    panelZone.on("pointerdown", (p) => p.event?.stopPropagation?.());

    // ── Tiêu đề pill ─────────────────────────────────────────────
    const pillW = 220, pillH = 44, pillR = 22;
    const pillG = push(this.add.graphics().setDepth(D + 2));
    pillG.fillStyle(0x000000, 0.2);
    pillG.fillRoundedRect(PX - pillW/2 + 4, top - pillH/2 + 5, pillW, pillH, pillR);
    pillG.fillGradientStyle(0xd4a030, 0xd4a030, 0xb07820, 0xb07820, 1);
    pillG.fillRoundedRect(PX - pillW/2, top - pillH/2, pillW, pillH, pillR);
    pillG.fillStyle(0xffffff, 0.28);
    pillG.fillRoundedRect(PX - pillW/2 + 8, top - pillH/2 + 6, pillW - 16, pillH * 0.38, pillR - 2);
    pillG.lineStyle(2.5, 0x8b5e1a, 1);
    pillG.strokeRoundedRect(PX - pillW/2, top - pillH/2, pillW, pillH, pillR);

    push(this.add.text(PX, top - pillH/2 + pillH/2, "💰 NẠP ECOIN", {
      fontFamily: "Signika", fontSize: "20px", color: "#4a2000", fontStyle: "bold",
      stroke: "#ffffffaa", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3));

    // ── Nút đóng X ───────────────────────────────────────────────
    const closeX = left + PW + 2, closeY = top - 2;
    const closeG = push(this.add.graphics().setDepth(D + 4));
    closeG.fillStyle(0xcc3333, 1);
    closeG.fillCircle(closeX, closeY, 16);
    closeG.fillStyle(0xffffff, 0.25);
    closeG.fillCircle(closeX, closeY - 4, 10);
    push(this.add.text(closeX, closeY, "✕", {
      fontFamily: "Signika", fontSize: "16px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 5));
    push(this.add.zone(closeX, closeY, 36, 36)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 5))
      .on("pointerdown", closeAll);

    // ── Tỷ giá quy đổi ───────────────────────────────────────────
    const rateBoxX = left + 20, rateBoxY = top + 44;
    const rateBoxW = PW - 40, rateBoxH = 90;
    const rateG = push(this.add.graphics().setDepth(D + 2));
    rateG.fillStyle(0xfff8e8, 1);
    rateG.fillRoundedRect(rateBoxX, rateBoxY, rateBoxW, rateBoxH, 10);
    rateG.lineStyle(1.5, 0xd4a030, 0.6);
    rateG.strokeRoundedRect(rateBoxX, rateBoxY, rateBoxW, rateBoxH, 10);

    push(this.add.text(PX, rateBoxY + 14, "✦  Tỷ giá quy đổi  ✦", {
      fontFamily: "Signika", fontSize: "13px", color: "#b07820", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 3));

    const rates = [
      "10.000đ = 100 Ecoin",  "50.000đ = 550 Ecoin",
      "100.000đ = 1.200 Ecoin", "200.000đ = 2.600 Ecoin",
    ];
    rates.forEach((r, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      push(this.add.text(
        rateBoxX + 20 + col * (rateBoxW / 2),
        rateBoxY + 34 + row * 22, r, {
          fontFamily: "Signika", fontSize: "12px", color: "#5a3000"
        }
      ).setDepth(D + 3));
    });

    // ── Các gói nạp ──────────────────────────────────────────────
    const packages = [
      { amount: 10000,   ecoin: 100,   label: "10K",   icon: "🪙", color: 0x6a9fd4 },
      { amount: 50000,   ecoin: 550,   label: "50K",   icon: "💰", color: 0x44aa66 },
      { amount: 100000,  ecoin: 1200,  label: "100K",  icon: "💎", color: 0x9966cc },
      { amount: 200000,  ecoin: 2600,  label: "200K",  icon: "👑", color: 0xd4a030 },
      { amount: 500000,  ecoin: 7000,  label: "500K",  icon: "🔥", color: 0xcc4422 },
      { amount: 1000000, ecoin: 15000, label: "1M",    icon: "⭐", color: 0xaa2288 },
    ];

    const cols = 3, cardW = 156, cardH = 100, gapX = 14, gapY = 10;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const gridStartX = PX - gridW / 2;
    const gridStartY = rateBoxY + rateBoxH + 16;

    packages.forEach((pkg, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = gridStartX + col * (cardW + gapX) + cardW / 2;
      const cy = gridStartY + row * (cardH + gapY) + cardH / 2;
      const bx = cx - cardW / 2, by = cy - cardH / 2;

      const cg = push(this.add.graphics().setDepth(D + 2));
      const drawCard = (hover = false) => {
        cg.clear();
        // Bóng
        cg.fillStyle(0x000000, 0.2);
        cg.fillRoundedRect(bx + 3, by + 4, cardW, cardH, 12);
        // Nền
        cg.fillStyle(pkg.color, hover ? 1 : 0.85);
        cg.fillRoundedRect(bx, by, cardW, cardH, 12);
        // Gloss
        cg.fillStyle(0xffffff, hover ? 0.3 : 0.18);
        cg.fillRoundedRect(bx + 6, by + 5, cardW - 12, cardH * 0.32, 8);
        // Viền
        cg.lineStyle(2, 0xffffff, hover ? 0.7 : 0.35);
        cg.strokeRoundedRect(bx, by, cardW, cardH, 12);
      };
      drawCard();

      // Icon emoji
      push(this.add.text(cx - 38, cy - 14, pkg.icon, { fontSize: "28px" })
        .setOrigin(0.5).setDepth(D + 3));

      // Số tiền VND
      push(this.add.text(cx + 14, cy - 20, pkg.label + " VND", {
        fontFamily: "Signika", fontSize: "15px", color: "#ffffff",
        fontStyle: "bold", stroke: "#00000066", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(D + 3));

      // Số ecoin nhận được
      push(this.add.text(cx + 14, cy + 2, `= ${pkg.ecoin.toLocaleString()} Ecoin`, {
        fontFamily: "Signika", fontSize: "12px", color: "#ffe066",
        stroke: "#00000066", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3));

      // Nút Nạp
      const btnY = by + cardH - 18;
      const btnG = push(this.add.graphics().setDepth(D + 3));
      btnG.fillStyle(0xffffff, 0.25);
      btnG.fillRoundedRect(bx + 10, btnY - 10, cardW - 20, 20, 10);
      push(this.add.text(cx, btnY, "Nạp ngay", {
        fontFamily: "Signika", fontSize: "11px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 4));

      // Zone click
      const zone = push(this.add.zone(cx, cy, cardW, cardH)
        .setInteractive({ cursor: "pointer" }).setDepth(D + 4));
      zone.on("pointerover",  () => drawCard(true));
      zone.on("pointerout",   () => drawCard(false));
      zone.on("pointerdown",  () => {
        this.tweens.add({ targets: cg, alpha: 0.7, duration: 80, yoyo: true });
        this._doTopUp(pkg.amount, pkg.ecoin, closeAll);
      });
    });

    // Fade in panel
    this.tweens.add({
      targets: [panelG, panelZone],
      alpha: { from: 0, to: 1 },
      duration: 200,
      ease: "Back.easeOut"
    });
  }

  async _doTopUp(amount, ecoin, onDone) {
    const playerData = this.registry.get("playerData")
      || JSON.parse(localStorage.getItem("playerData") || "null");
    if (!playerData?.token) {
      this._showToast("❌ Bạn chưa đăng nhập!");
      return;
    }
    const userId = playerData?.user?.id || playerData?.user_id;
    if (!userId) { this._showToast("❌ Không tìm thấy tài khoản!"); return; }

    try {
      const res  = await fetch(`${SERVER_URL}/shop/add-ecoin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount: ecoin }),
      });
      const data = await res.json();
      if (data.success) {
        EcoinManager.set(this, data.ecoin);
        if (playerData?.user) {
          playerData.user.ecoin = data.ecoin;
          localStorage.setItem("playerData", JSON.stringify(playerData));
        }
        this._showToast(`✅ Nạp thành công +${ecoin.toLocaleString()} Ecoin!`);
        onDone?.();
      } else {
        this._showToast(`❌ ${data.message || "Nạp thất bại!"}`);
      }
    } catch(e) {
      this._showToast("❌ Lỗi kết nối server!");
    }
  }

  _showToast(msg) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2 - 60, msg, {
      fontFamily: "Signika", fontSize: "16px", color: "#ffffff",
      backgroundColor: "#00000099", padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => t.destroy() });
  }

// ─────────────────────────────────────────────────────────────────
  //  PANEL THÔNG TIN CÁ NHÂN + LỊCH SỬ TRẬN ĐẤU (ĐỒNG BỘ GIAO DIỆN FRIEND)
  // ─────────────────────────────────────────────────────────────────
  _openMyProfilePanel(width, height) {
    if (this._myProfilePanelOpen) return;
    this._myProfilePanelOpen = true;

    const objs = [];
    const push = o => { objs.push(o); return o; };
    const D = 250;

    const tabBtns    = [];
    const tabContent = [];

    const closeAll = () => {
      this._myProfilePanelOpen = false;
      tabBtns.forEach(o => { try { o?.destroy(); } catch(e){} });
      tabContent.forEach(o => { try { o?.destroy(); } catch(e){} });
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
    };

    const PW = Math.min(600, width - 40);
    const PH = Math.min(460, height - 60);
    const PX = width / 2, PY = height / 2;
    const L  = PX - PW / 2, T = PY - PH / 2;
    const R  = 16;

    // ── Dimmer ────────────────────────────────────────────────────
    const dim = push(this.add.graphics().setDepth(D).setAlpha(0));
    dim.fillStyle(0x000000, 0.62);
    dim.fillRect(0, 0, width, height);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    push(this.add.zone(PX, PY, width, height).setInteractive().setDepth(D))
      .on("pointerdown", closeAll);

    // ── Panel nền chính (Viền trắng + Nền kem vàng giống Friend) ──
    const pg = push(this.add.graphics().setDepth(D + 1));
    // Bóng đổ
    pg.fillStyle(0x000000, 0.28);
    pg.fillRoundedRect(L + 6, T + 6, PW, PH, R);
    // Nền gradient kem vàng
    pg.fillGradientStyle(0xf6eac6, 0xf6eac6, 0xede0b0, 0xede0b0, 1);
    pg.fillRoundedRect(L, T, PW, PH, R);
    // Viền ngoài sáng đồng bộ với popup Friend
    pg.lineStyle(3, 0xffffff, 1);
    pg.strokeRoundedRect(L, T, PW, PH, R);
    // Gloss trên
    pg.fillStyle(0xffffff, 0.22);
    pg.fillRoundedRect(L + 6, T + 4, PW - 12, 20, 8);

    // Viền đứt nét vàng bên trong
    const ins = 10, cR = R - 4;
    pg.lineStyle(1.5, 0xb8922e, 0.5);
    const dD = (x1, y1, x2, y2) => {
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      const ang  = Phaser.Math.Angle.Between(x1, y1, x2, y2);
      for (let d = 0; d < dist; d += 14) {
        pg.beginPath();
        pg.moveTo(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d);
        pg.lineTo(x1 + Math.cos(ang) * Math.min(d + 8, dist), y1 + Math.sin(ang) * Math.min(d + 8, dist));
        pg.strokePath();
      }
    };
    dD(L + ins + cR, T + ins, L + PW - ins - cR, T + ins);
    dD(L + PW - ins, T + ins + cR, L + PW - ins, T + PH - ins - cR);
    dD(L + PW - ins - cR, T + PH - ins, L + ins + cR, T + PH - ins);
    dD(L + ins, T + PH - ins - cR, L + ins, T + ins + cR);

    // Chặn click xuyên panel
    push(this.add.zone(PX, PY, PW, PH).setInteractive().setDepth(D + 1));

    // ── Header pill & Tabs ────────────────────────────────────────
  // ── Header pill tiêu đề (Căn chỉnh và kích thước chuẩn bằng bảng Nạp Ecoin) ──
    const pillW  = 280; // Kích thước chiều rộng chuẩn bằng bảng Nạp Ecoin
    const pillH  = 44;  // Chiều cao chuẩn bằng bảng Nạp Ecoin
    const pillR2 = 22;  // Bán kính bo tròn
    const pillCY = T;   // Đặt tâm Y nằm đúng ngay đường viền trên cùng của panel (T) để nhô lên ngoài

    const pg2 = push(this.add.graphics().setDepth(D + 2));
    // Bóng đổ phía dưới pill
    pg2.fillStyle(0x000000, 0.2);
    pg2.fillRoundedRect(PX - pillW / 2 + 4, pillCY - pillH / 2 + 5, pillW, pillH, pillR2);
    // Nền gradient vàng nâu
    pg2.fillGradientStyle(0xd4a030, 0xd4a030, 0xb07820, 0xb07820, 1);
    pg2.fillRoundedRect(PX - pillW / 2, pillCY - pillH / 2, pillW, pillH, pillR2);
    // Gloss sáng phía trên
    pg2.fillStyle(0xffffff, 0.28);
    pg2.fillRoundedRect(PX - pillW / 2 + 8, pillCY - pillH / 2 + 6, pillW - 16, pillH * 0.38, pillR2 - 2);
    // Viền ngoài đậm
    pg2.lineStyle(2.5, 0x8b5e1a, 1);
    pg2.strokeRoundedRect(PX - pillW / 2, pillCY - pillH / 2, pillW, pillH, pillR2);

    // Text tiêu đề bên trong pill
    push(this.add.text(PX, pillCY, "THÔNG TIN CÁ NHÂN", {
      fontFamily: "Signika", fontSize: "20px", color: "#4a2000",
      fontStyle: "bold", stroke: "#ffffffaa", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3));

    // ── Nút X góc trên phải panel (Đặt dịch ra ngoài góc khung đúng chuẩn) ──
    const closeX = L + PW - 2;
    const closeY = T - 2;
    const closeImg = push(this.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(38, 38).setOrigin(0.5).setDepth(D + 6)
      .setInteractive({ cursor: "pointer" }));
    closeImg.on("pointerover",  () => closeImg.setAlpha(0.75));
    closeImg.on("pointerout",   () => closeImg.setAlpha(1));
    closeImg.on("pointerdown",  () => {
      this.tweens.add({ targets: closeImg, scale: 0.85, duration: 60, yoyo: true });
      closeAll();
    });

    // ── Dời vị trí của 2 Tab (Thông Tin / Lịch Sử Trận) xuống thấp hơn một chút để không bị che bởi pill tiêu đề mới ──
    const TAB_Y = T + 30;
    const TAB_H = 32;
    const PAD   = 22;
    const GAP   = 12;
    const TAB_W = (PW - PAD * 2 - GAP) / 2;
    const tabs  = ["Thông Tin", "Lịch Sử Trận"];
    let activeTab = 0;

    const pd    = this.registry.get("playerData") || JSON.parse(localStorage.getItem("playerData") || "null");
    const token = pd?.token;
    const uid   = pd?.user?.id;

    const drawTabs = () => {
      tabBtns.forEach(o => { try { o?.destroy(); } catch(e){} });
      tabBtns.length = 0;
      tabs.forEach((label, i) => {
        const tx = L + PAD + i * (TAB_W + GAP);
        const isAct = i === activeTab;
        const tg = this.add.graphics().setDepth(D + 2);
        tg.fillStyle(isAct ? 0xb88028 : 0x8a6530, 1);
        tg.fillRoundedRect(tx, TAB_Y, TAB_W, TAB_H, 8);
        tg.lineStyle(1.5, isAct ? 0xf5d77f : 0x6b4a10, isAct ? 1 : 0.5);
        tg.strokeRoundedRect(tx, TAB_Y, TAB_W, TAB_H, 8);
        if (isAct) {
          tg.fillStyle(0xffffff, 0.18);
          tg.fillRoundedRect(tx + 4, TAB_Y + 3, TAB_W - 8, TAB_H * 0.35, 5);
        }
        const tt = this.add.text(tx + TAB_W / 2, TAB_Y + TAB_H / 2, label, {
          fontFamily: "Signika", fontSize: "14px",
          color: isAct ? "#fff8dc" : "#d8b880", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(D + 3);
        const tz = this.add.zone(tx + TAB_W / 2, TAB_Y + TAB_H / 2, TAB_W, TAB_H)
          .setInteractive({ cursor: "pointer" }).setDepth(D + 4);
        tz.on("pointerdown", () => {
          if (activeTab === i) return;
          playTabSound(this);
          activeTab = i;
          drawTabs();
          renderContent();
        });
        tabBtns.push(tg, tt, tz);
      });
    };

    const CONTENT_Y = TAB_Y + TAB_H + 8;
    const CONTENT_H = PH - (CONTENT_Y - T) - 20;

    const clearContent = () => {
      tabContent.forEach(o => { try { o?.destroy(); } catch(e){} });
      tabContent.length = 0;
    };

    // ── TAB 1: THÔNG TIN (Bố cục chuẩn giống PlayerProfilePanel) ──
    const renderInfoTab = () => {
      const profile = getActiveProfile(this);
      const user    = pd?.user || {};

      const COL_W  = Math.floor((PW - PAD * 2 - GAP) / 2);
      const BODY_T = CONTENT_Y;
      const BODY_H = CONTENT_H;
      const IP     = 12; // Inner padding
      const leftX  = L + PAD;
      const rightX = L + PAD + COL_W + GAP;

      // ── Vẽ 2 khung card trái & phải giống hệt bên Friend ────────
      const makeInset = (ix, iy, iw, ih) => {
        const g = this.add.graphics().setDepth(D + 2);
        // Nền vàng kem đậm vừa phải giống Friend
        g.fillStyle(0xeed698, 1);
        g.fillRoundedRect(ix, iy, iw, ih, 10);
        g.lineStyle(1.5, 0xb89040, 0.85);
        g.strokeRoundedRect(ix, iy, iw, ih, 10);
        // Viền sáng inset
        g.lineStyle(1, 0xfff4d0, 0.5);
        g.strokeRoundedRect(ix + 1, iy + 1, iw - 2, ih - 2, 9);
        tabContent.push(g);
      };
      makeInset(leftX,  BODY_T, COL_W, BODY_H);
      makeInset(rightX, BODY_T, COL_W, BODY_H);

      // ── CỘT TRÁI: Tên + Nhân vật + Khung cảnh nền ──────────────
      const charName = (profile.characterName || "Dark_Oracle").replace(/ /g, "_");
      const skin     = profile.skin_id || 1;
      const userName = user.name || this.playerName;

      // Tên người chơi (To, rõ như bên Friend)
      tabContent.push(this.add.text(leftX + IP + 2, BODY_T + IP, userName, {
        fontFamily: "Signika", fontSize: "18px",
        fontStyle: "bold", color: "#4a2500",
      }).setDepth(D + 4));

      // Tên nhân vật bên dưới
      tabContent.push(this.add.text(leftX + IP + 2, BODY_T + IP + 22,
        charName.replace(/_/g, " "), {
        fontFamily: "Signika", fontSize: "13px",
        fontStyle: "bold", color: "#8a5a18",
      }).setDepth(D + 4));

      // Khung hiển thị Nhân vật
      const AVT_TOP = BODY_T + IP + 46;
      const AVT_H   = BODY_H - IP * 2 - 46;
      const AVT_W   = COL_W - IP * 2;
      const AVX     = leftX + IP + AVT_W / 2;
      const AVY     = AVT_TOP + AVT_H / 2;

      // Mask bo góc cho cả ảnh nền và nhân vật
      const maskG = this.make.graphics({ add: false });
      maskG.fillStyle(0xffffff);
      maskG.fillRoundedRect(leftX + IP, AVT_TOP, AVT_W, AVT_H, 8);
      const geomMask = maskG.createGeometryMask();
      tabContent.push(maskG);

      // Nền khung nhân vật — sẽ được render sau khi biết active_bg_path
      const avBg = this.add.graphics().setDepth(D + 3);
      // Vẽ gradient mặc định trước, sẽ bị thay khi bg load xong
      avBg.fillGradientStyle(0x0d3b4c, 0x165b6d, 0x091e26, 0x123542, 1);
      avBg.fillRoundedRect(leftX + IP, AVT_TOP, AVT_W, AVT_H, 8);

      // Helper: render ảnh nền vào khung avatar
      const DEFAULT_BG_PATH = "assets/ui/bg/0-ngocphumedia_0.png";
      const renderAvatarBg = (bgKey, bgPath) => {
        if (!this._myProfilePanelOpen) return;
        const doShow = (key) => {
          if (!this._myProfilePanelOpen) return;
          if (!this.textures.exists(key) || this.textures.get(key).key === "__MISSING") return;
          avBg.clear();
          const bgImg = this.add.image(AVX, AVY, key).setDepth(D + 3).setMask(geomMask);
          const tex = this.textures.get(key);
          const ia  = tex.source[0].width / tex.source[0].height;
          const fa  = AVT_W / AVT_H;
          bgImg.setDisplaySize(ia > fa ? AVT_H * ia : AVT_W, ia > fa ? AVT_H : AVT_W / ia);
          tabContent.push(bgImg);
          this._myProfileAvBgImg = bgImg;
        };

        const loadBg = (key, path, onFail) => {
          if (this.textures.exists(key) && this.textures.get(key).key !== "__MISSING") {
            doShow(key); return;
          }
          if (this.textures.exists(key)) this.textures.remove(key);
          this.load.once(`filecomplete-image-${key}`, () => doShow(key));
          this.load.once("loaderror", (file) => {
            if (file?.key === key) {
              try { this.textures.remove(key); } catch(e) {}
              onFail?.();
            }
          });
          this.load.image(key, path);
          this.load.start();
        };

        // Thử load bg chính, nếu lỗi thì dùng fallback mặc định
        loadBg(bgKey, bgPath, () => {
          loadBg("profile_bg_default", DEFAULT_BG_PATH, null);
        });
      };

      // Viền khung ảnh nhân vật
      const avBorder = this.add.graphics().setDepth(D + 6);
      avBorder.lineStyle(2, 0x9d7d48, 1);
      avBorder.strokeRoundedRect(leftX + IP, AVT_TOP, AVT_W, AVT_H, 8);
      tabContent.push(avBg, avBorder);

      // Scale nhân vật vừa vặn
      const charDisplayH = Math.min(AVT_H * 0.82, AVT_W * 0.82);

      const doSpawnChar = () => {
        if (!this._myProfilePanelOpen) return;
        try { this._avatarPlaceholder?.destroy(); } catch(e) {}
        const fk = `${charName}_${skin}_idle_000`;
        if (!this.textures.exists(fk)) return;
        const sp = this.add.sprite(AVX, AVY + AVT_H * 0.05, fk)
          .setDisplaySize(charDisplayH, charDisplayH)
          .setDepth(D + 5).setMask(geomMask);
        const ak = `${charName}_${skin}_idle`;
        if (!this.anims.exists(ak)) {
          const frames = [];
          for (let i = 0; i < 18; i++)
            frames.push({ key: `${charName}_${skin}_idle_${String(i).padStart(3, "0")}` });
          this.anims.create({ key: ak, frames, frameRate: 12, repeat: -1 });
        }
        sp.play(ak);
        tabContent.push(sp);
        this.tweens.add({ targets: sp, y: "-=5", duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      };

      const fk0 = `${charName}_${skin}_idle_000`;
      if (this.textures.exists(fk0)) {
        doSpawnChar();
      } else {
        const ph = this.add.text(AVX, AVY, "⏳", { fontSize: "24px" })
          .setOrigin(0.5).setDepth(D + 4);
        this._avatarPlaceholder = ph;
        tabContent.push(ph);
        for (let i = 0; i < 18; i++) {
          const num = String(i).padStart(3, "0");
          const k   = `${charName}_${skin}_idle_${num}`;
          if (!this.textures.exists(k))
            this.load.image(k, `./assets/characters/${charName}/${charName}_${skin}/PNG/PNG Sequences/Idle/0_${charName}_Idle_${num}.png`);
        }
        this.load.once("complete", doSpawnChar);
        this.load.start();
      }

      // ── CỘT PHẢI: 2 Badge Trận/Thắng + 2 Thẻ Bài Lớn (Giống Friend) ─
      const BADGE_H  = 32;
      const badgeGap = 10;
      const bw       = Math.floor((COL_W - IP * 2 - badgeGap) / 2);
      const b1cx     = rightX + IP + bw / 2;
      const b2cx     = rightX + IP + bw + badgeGap + bw / 2;
      const badgeCY  = BODY_T + IP + 6 + BADGE_H / 2;

      const drawBadge = (cx, label) => {
        const g = this.add.graphics().setDepth(D + 3);
        // Đổ bóng nhẹ
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(cx - bw / 2 + 1, badgeCY - BADGE_H / 2 + 2, bw, BADGE_H, 7);
        // Nền vàng đồng giống Friend
        g.fillGradientStyle(0xc88a28, 0xc88a28, 0x966010, 0x966010, 1);
        g.fillRoundedRect(cx - bw / 2, badgeCY - BADGE_H / 2, bw, BADGE_H, 7);
        g.lineStyle(1.5, 0xf5d77f, 0.9);
        g.strokeRoundedRect(cx - bw / 2, badgeCY - BADGE_H / 2, bw, BADGE_H, 7);
        g.fillStyle(0xffffff, 0.22);
        g.fillRoundedRect(cx - bw / 2 + 4, badgeCY - BADGE_H / 2 + 3, bw - 8, BADGE_H * 0.36, 4);
        tabContent.push(g);

        const t = this.add.text(cx, badgeCY, label, {
          fontFamily: "Signika", fontSize: "14px",
          color: "#fff8dc", fontStyle: "bold", stroke: "#3a2000", strokeThickness: 2.5,
        }).setOrigin(0.5).setDepth(D + 4);
        tabContent.push(t);
        return t;
      };

      const b1 = drawBadge(b1cx, "Trận: 0");
      const b2 = drawBadge(b2cx, "Thắng: 0");

      // Khu vực 2 Thẻ Bài + Stats bar bên dưới
      const STATS_BAR_H = 64; // chiều cao khu vực tỷ lệ thắng + ngày tham gia
      const cardAreaTop = badgeCY + BADGE_H / 2 + 14;
      const cardAreaH   = (BODY_T + BODY_H - IP) - cardAreaTop - STATS_BAR_H - 8;
      const CARD_GAP    = 10;
      const cardW       = Math.floor((COL_W - IP * 2 - CARD_GAP) / 2);
      const cardH       = Math.min(Math.floor(cardW * 1.52), cardAreaH - 24);
      const cardCY      = cardAreaTop + cardH / 2;
      const c1cx        = rightX + IP + cardW / 2;
      const c2cx        = rightX + IP + cardW + CARD_GAP + cardW / 2;

      // Refs để update stats bar sau khi fetch xong
      let _winRateTxt = null, _joinDateTxt = null;

      // Vẽ stats bar (tỷ lệ thắng + ngày tham gia) ngay dưới thẻ bài
      const statsBarY = cardAreaTop + cardAreaH + 8;
      const sbX       = rightX + IP;
      const sbW       = COL_W - IP * 2;

      // Nền stats bar
      const sbg = this.add.graphics().setDepth(D + 3);
      sbg.fillStyle(0xd4a830, 0.18);
      sbg.fillRoundedRect(sbX, statsBarY, sbW, STATS_BAR_H, 8);
      sbg.lineStyle(1, 0xb8902e, 0.4);
      sbg.strokeRoundedRect(sbX, statsBarY, sbW, STATS_BAR_H, 8);
      tabContent.push(sbg);

      // Chia đều bên trong: row1 ở 1/4, row2 ở 3/4 chiều cao stats bar
      const BAR_H   = 6;   // chiều cao thanh progress bar
      const ROW_PAD = 10;  // padding trái/phải bên trong stats bar

      // Dòng 1: Tỷ lệ thắng + thanh progress
      const row1Y = statsBarY + Math.round(STATS_BAR_H * 0.26);
      // Dòng 2: Tham gia (cách row1 đủ để có thanh bar + khoảng thở)
      const row2Y = statsBarY + Math.round(STATS_BAR_H * 0.76);

      const winRateLabel = this.add.text(sbX + ROW_PAD, row1Y, "Tỷ lệ thắng:", {
        fontFamily: "Signika", fontSize: "12px", color: "#8a6a30", fontStyle: "bold",
      }).setOrigin(0, 0.5).setDepth(D + 4);
      tabContent.push(winRateLabel);

      _winRateTxt = this.add.text(sbX + sbW - ROW_PAD, row1Y, "—", {
        fontFamily: "Signika", fontSize: "12px", color: "#4a2500", fontStyle: "bold",
      }).setOrigin(1, 0.5).setDepth(D + 4);
      tabContent.push(_winRateTxt);

      // Thanh progress bar nằm giữa row1 và row2
      const barY   = Math.round((row1Y + row2Y) / 2) - Math.round(BAR_H / 2);
      const barBgG = this.add.graphics().setDepth(D + 3);
      barBgG.fillStyle(0xb89040, 0.3);
      barBgG.fillRoundedRect(sbX + ROW_PAD, barY, sbW - ROW_PAD * 2, BAR_H, 3);
      tabContent.push(barBgG);

      const barFillG = this.add.graphics().setDepth(D + 4);
      tabContent.push(barFillG);
      // barFillG sẽ được vẽ sau khi có dữ liệu
      const _drawWinBar = (rate) => {
        if (!this._myProfilePanelOpen) return;
        barFillG.clear();
        const fillW = Math.max(0, Math.min(1, rate / 100)) * (sbW - ROW_PAD * 2);
        if (fillW <= 0) return;
        const color = rate >= 60 ? 0x44cc44 : rate >= 40 ? 0xf0c030 : 0xdd4444;
        barFillG.fillStyle(color, 1);
        barFillG.fillRoundedRect(sbX + ROW_PAD, barY, fillW, BAR_H, 3);
      };

      tabContent.push(this.add.text(sbX + ROW_PAD, row2Y, "Tham gia:", {
        fontFamily: "Signika", fontSize: "12px", color: "#8a6a30", fontStyle: "bold",
      }).setOrigin(0, 0.5).setDepth(D + 4));

      _joinDateTxt = this.add.text(sbX + sbW - ROW_PAD, row2Y, "—", {
        fontFamily: "Signika", fontSize: "12px", color: "#4a2500", fontStyle: "bold",
      }).setOrigin(1, 0.5).setDepth(D + 4);
      tabContent.push(_joinDateTxt);

      const renderTarotCards = (cards) => {
        if (!cards || cards.length === 0) {
          tabContent.push(this.add.text(rightX + COL_W / 2, cardAreaTop + cardAreaH / 2,
            "Chưa trang bị thẻ bài", {
            fontFamily: "Signika", fontSize: "14px",
            color: "#8a6a30", fontStyle: "bold", align: "center",
          }).setOrigin(0.5).setDepth(D + 4));
          return;
        }

        [c1cx, c2cx].forEach((cx, i) => {
          const card = cards[i];
          if (!card) return;
          const id   = card.id || card.tarot_id;
          const key  = `tarot_large_${id}`;
          const key2 = `tarot_${id}`;

          // Bóng đổ thẻ bài
          const sg = this.add.graphics().setDepth(D + 4);
          sg.fillStyle(0x000000, 0.24);
          sg.fillRoundedRect(cx - cardW / 2 + 3, cardCY - cardH / 2 + 4, cardW, cardH, 8);
          tabContent.push(sg);

          const doRenderCard = (usedKey) => {
            if (!this._myProfilePanelOpen) return;
            const tex = this.textures.get(usedKey);
            if (!tex || tex.key === "__MISSING") return;
            const asp = tex.source[0].width / tex.source[0].height;
            let dw = cardW, dh = cardW / asp;
            if (dh > cardH) { dh = cardH; dw = cardH * asp; }

            tabContent.push(
              this.add.image(cx, cardCY, usedKey).setDisplaySize(dw, dh).setDepth(D + 5)
            );

            // Tên thẻ bài rõ nét ở dưới giống bên Friend
            if (card.name) {
              tabContent.push(this.add.text(cx, cardCY + dh / 2 + 8, card.name, {
                fontFamily: "Signika", fontSize: "12px",
                fontStyle: "bold", color: "#4a2500", align: "center",
                wordWrap: { width: cardW + 6 },
              }).setOrigin(0.5, 0).setDepth(D + 4));
            }
          };

          const tryLoad = (k, path, fallbackK, fallbackPath) => {
            if (this.textures.exists(k)) { doRenderCard(k); return; }
            this.load.once(`filecomplete-image-${k}`, () => doRenderCard(k));
            this.load.once(`loaderror`, () => {
              if (this.textures.exists(fallbackK)) { doRenderCard(fallbackK); return; }
              this.load.once(`filecomplete-image-${fallbackK}`, () => doRenderCard(fallbackK));
              this.load.image(fallbackK, fallbackPath);
              this.load.start();
            });
            this.load.image(k, path);
            this.load.start();
          };

          tryLoad(
            key,  `assets/resources/Tarot/thebai_${id}.png`,
            key2, `assets/resources/Tarot/resize/thebai_${id}.png`
          );
        });
      };

      // ── Fetch song song stats + thẻ bài + bg đang trang bị ──────
      if (uid) {
        Promise.all([
          fetch(`${SERVER_URL}/users/${uid}/stats`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }).then(r => r.json()).catch(() => ({})),

          fetch(`${SERVER_URL}/users/${uid}/tarots/active`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }).then(r => r.json()).catch(() => ({})),

          fetch(`${SERVER_URL}/users/${uid}/backgrounds/bag`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }).then(r => r.json()).catch(() => ({ data: [] })),
        ]).then(([statsData, tarotData, bagData]) => {
          if (!this._myProfilePanelOpen) return;
          const total = statsData.total_games || 0;
          const wins  = statsData.total_wins  || 0;
          b1.setText(`Trận: ${total}`);
          b2.setText(`Thắng: ${wins}`);

          // Cập nhật stats bar
          const rate = total > 0 ? Math.round(wins / total * 100) : 0;
          _winRateTxt?.setText(`${rate}%`);
          _drawWinBar(rate);
          if (statsData.created_at) {
            const d = new Date(statsData.created_at);
            _joinDateTxt?.setText(d.toLocaleDateString("vi-VN", {
              day: "2-digit", month: "2-digit", year: "numeric"
            }));
          } else {
            _joinDateTxt?.setText("N/A");
          }

          const cards = tarotData.active_tarots || tarotData.tarots || tarotData.data || [];
          renderTarotCards(cards);

          // Tìm bg đang trang bị trong danh sách bag
          const activeBgId  = pd?.user?.active_bg_id || pd?.active_bg_id || null;
          const bagList     = bagData?.data || [];
          const activeBgRow = bagList.find(b => Number(b.id) === Number(activeBgId));
          if (activeBgRow?.image_path) {
            const bgKey  = `bg_${activeBgId}`;
            const bgPath = activeBgRow.image_path.startsWith("assets/")
              ? activeBgRow.image_path
              : `assets/ui/bg/${activeBgRow.image_path.split("/").pop()}`;
            renderAvatarBg(bgKey, bgPath);
          } else {
            // Không trang bị hoặc không tìm thấy bg → dùng ảnh mặc định
            renderAvatarBg("profile_bg_default", "assets/ui/bg/0-ngocphumedia_0.png");
          }
        });
      } else {
        renderTarotCards([]);
        renderAvatarBg("profile_bg_default", "assets/ui/bg/0-ngocphumedia_0.png");
      }
    };

    // ── TAB 2: LỊCH SỬ TRẬN ─────────────────────────────────────
    const renderHistoryTab = () => {
      const S = Math.min(PW / 720, PH / 540);
      const ROW_H = 44 * S;
      const listX = L + PAD;
      const listW = PW - PAD * 2;

      const cols = [
        { label: "#",          w: 0.06 },
        { label: "Chế độ",     w: 0.18 },
        { label: "Cược",       w: 0.15 },
        { label: "Kết quả",    w: 0.16 },
        { label: "Thắng/Thua", w: 0.20 },
        { label: "Thời gian",  w: 0.25 }
      ];
      let hx = listX;
      cols.forEach(c => {
        const ht = this.add.text(hx + listW * c.w / 2, CONTENT_Y + 6, c.label, {
          fontFamily: "Signika", fontSize: "12px",
          color: "#7a5010", fontStyle: "bold",
        }).setOrigin(0.5, 0).setDepth(D + 4);
        tabContent.push(ht);
        hx += listW * c.w;
      });

      const loadingTxt = this.add.text(L + PW / 2, CONTENT_Y + CONTENT_H / 2,
        "⏳ Đang tải lịch sử...", {
        fontFamily: "Signika", fontSize: "15px", color: "#7a5010",
      }).setOrigin(0.5).setDepth(D + 4);
      tabContent.push(loadingTxt);

      if (!uid) { loadingTxt.setText("❌ Chưa đăng nhập"); return; }

      fetch(`${SERVER_URL}/users/${uid}/history?limit=10`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }).then(r => r.json()).then(data => {
        if (!this._myProfilePanelOpen) return;
        loadingTxt.destroy();

        const history = data.history || [];
        if (history.length === 0) {
          const nt = this.add.text(L + PW / 2, CONTENT_Y + CONTENT_H / 2,
            "Chưa có trận đấu nào", {
            fontFamily: "Signika", fontSize: "15px", color: "#9a7040",
          }).setOrigin(0.5).setDepth(D + 4);
          tabContent.push(nt);
          return;
        }

        history.forEach((row, i) => {
          const ry = CONTENT_Y + 28 + i * ROW_H;
          const rbg = this.add.graphics().setDepth(D + 3);
          rbg.fillStyle(i % 2 === 0 ? 0xfdf0cc : 0xefd898, 0.75);
          rbg.fillRoundedRect(listX, ry, listW, ROW_H - 3, 6);
          tabContent.push(rbg);

          const isWin = Number(row.winner_id) === Number(uid);
          const modeMap = { solo_2: "1v1", solo_3: "1v1v1", solo_4: "FFA", team_2v2: "2v2" };
          const mode = modeMap[row.match_mode] || row.match_mode;
          const bet  = row.bet_ecoin >= 1000
            ? (row.bet_ecoin / 1000).toFixed(row.bet_ecoin % 1000 === 0 ? 0 : 1) + "K"
            : String(row.bet_ecoin);
          const result = isWin ? "🏆 Thắng" : "💀 Thua";
          const resultColor = isWin ? "#226622" : "#882222";
          const delta = isWin
            ? `+${row.win_amount >= 1000 ? (row.win_amount / 1000).toFixed(1) + "K" : row.win_amount}`
            : `-${bet}`;
          const deltaColor = isWin ? "#116611" : "#881111";
          const date = new Date(row.played_at).toLocaleDateString("vi-VN", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
          });

          const vals = [String(i + 1), mode, bet + "⚡", result, delta, date];
          let vx = listX;
          cols.forEach((c, ci) => {
            const color = ci === 3 ? resultColor : ci === 4 ? deltaColor : "#3a1a00";
            const vt = this.add.text(vx + listW * c.w / 2, ry + ROW_H / 2, vals[ci], {
              fontFamily: "Signika", fontSize: "12px", color,
              fontStyle: ci === 3 || ci === 4 ? "bold" : "normal",
            }).setOrigin(0.5).setDepth(D + 4);
            tabContent.push(vt);
            vx += listW * c.w;
          });
        });

        const total = data.total || 0, wins = data.wins || 0;
        const rate  = total > 0 ? Math.round(wins / total * 100) : 0;
        const sg = this.add.graphics().setDepth(D + 3);
        sg.fillStyle(0xb07820, 0.18);
        sg.fillRoundedRect(listX, T + PH - 46, listW, 30, 8);
        tabContent.push(sg);
        tabContent.push(this.add.text(L + PW / 2, T + PH - 31,
          `Tổng: ${total} trận  |  Thắng: ${wins}  |  Tỷ lệ thắng: ${rate}%`, {
          fontFamily: "Signika", fontSize: "13px", color: "#5a3000", fontStyle: "bold",
          align: "center",
        }).setOrigin(0.5).setDepth(D + 4));
      }).catch(() => {
        if (!this._myProfilePanelOpen) return;
        loadingTxt.setText("❌ Không tải được lịch sử");
      });
    };

    const renderContent = () => {
      clearContent();
      if (activeTab === 0) renderInfoTab();
      else                 renderHistoryTab();
    };

    drawTabs();
    renderContent();

    objs.forEach(o => { try { o?.setAlpha?.(0); } catch(e){} });
    this.tweens.add({
      targets: objs.filter(o => o?.setAlpha),
      alpha: 1, duration: 200, ease: "Power2.easeOut",
    });
  }
}
