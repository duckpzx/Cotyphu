import { getPlayerData, setPlayerData, getActiveProfile } from "../server/utils/playerData.js";
import EcoinManager from "../server/utils/ecoinManager.js";
import ChatWidget from "./components/ChatWidget.js";
import FriendPanel from "./components/FriendPanel.js";
import { SERVER_URL } from "../config.js";
import { tarotLevelKey, tarotImagePath } from "../utils/tarotLevel.js";
import { setupClickSound, playTabSound, playOutSound, isMusicEnabled, getAudioTrackUrl, getAudioTrackVolume, isAudioTrackEnabled } from "../utils/clickSound.js";
import { openPayosTopUpFlow } from "../utils/payosModal.js";
import { renderAvatarBadge } from "../utils/avatarBadge.js";
import { createSettingsButton } from "../utils/settingsBar.js";

// ── Helper: tính trạng thái khí quyển 24h mượt mà (Bình minh → Sáng → Trưa → Hoàng hôn → Đêm) ──
function computeLobbyAtmosphere(hourFloat) {
  const h = ((hourFloat % 24) + 24) % 24;
  // 05:00 -> 07:30: Bình minh (đêm tan dần sang ngày + ánh nắng cam vàng dịu)
  if (h >= 5 && h < 7.5) {
    const t = (h - 5) / 2.5;
    const bell = Math.sin(t * Math.PI);
    return { nightAlpha: +(0.85 * (1 - t)).toFixed(3), tintColor: 0xffaa55, tintAlpha: +(0.18 * bell).toFixed(3), addMode: false };
  }
  // 07:30 -> 10:30: Sáng sớm nắng nhẹ
  if (h >= 7.5 && h < 10.5) {
    const t = (h - 7.5) / 3.0;
    return { nightAlpha: 0, tintColor: 0xfff3cc, tintAlpha: +(0.08 * (1 - t * 0.5)).toFixed(3), addMode: true };
  }
  // 10:30 -> 15:30: Trưa nắng sáng rực rỡ
  if (h >= 10.5 && h < 15.5) {
    const t = (h - 10.5) / 5.0;
    const bell = Math.sin(t * Math.PI);
    return { nightAlpha: 0, tintColor: 0xffffff, tintAlpha: +(0.03 + 0.06 * bell).toFixed(3), addMode: true };
  }
  // 15:30 -> 18:30: Hoàng hôn (ánh cam hồng ấm + bắt đầu chuyển dần sang nền đêm)
  if (h >= 15.5 && h < 18.5) {
    const t = (h - 15.5) / 3.0;
    const bell = Math.sin(t * Math.PI);
    return { nightAlpha: +(0.55 * t).toFixed(3), tintColor: 0xff6b35, tintAlpha: +(0.24 * bell).toFixed(3), addMode: false };
  }
  // 18:30 -> 20:30: Chạng vạng (tối dần sang hoàn toàn ban đêm)
  if (h >= 18.5 && h < 20.5) {
    const t = (h - 18.5) / 2.0;
    return { nightAlpha: +(0.55 + 0.45 * t).toFixed(3), tintColor: 0x2b1e5a, tintAlpha: +(0.16 * (1 - t * 0.4)).toFixed(3), addMode: false };
  }
  // 20:30 -> 05:00: Ban đêm sâu lắng
  return { nightAlpha: 1, tintColor: 0x0a1936, tintAlpha: 0.1, addMode: false };
}

// src/scenes/LobbyScene.js
export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super("LobbyScene");
  }

  preload() {
    // Load cả 2 nền mặc định, đồng thời kiểm tra cấu hình sảnh tùy biến từ Admin
    this.load.image("lobby-bg-light", "assets/ui/lobby/background_light.png");
    this.load.image("lobby-bg-dark",  "assets/ui/lobby/background_dark.png");

    this._lobbyConfig = null;
    if (this.cache.json.exists("lobby_config_live")) {
      this.cache.json.remove("lobby_config_live");
    }
    this.load.json("lobby_config_live", `/api/assets/lobby-config?t=${Date.now()}`);
    this.load.once("filecomplete-json-lobby_config_live", (_k, _t, payload) => {
      const cfg = payload?.lobby;
      if (cfg) {
        this._lobbyConfig = cfg;
        if (cfg.is_custom && cfg.day_url && cfg.night_url) {
          const ver = cfg.version || 0;
          const dk = `lobby-bg-custom-day-${ver}`;
          const nk = `lobby-bg-custom-night-${ver}`;
          if (!this.textures.exists(dk)) this.load.image(dk, `${cfg.day_url}?v=${ver}`);
          if (!this.textures.exists(nk)) this.load.image(nk, `${cfg.night_url}?v=${ver}`);
        }
      }
    });

    // icon top bar
    this.load.image("coin","assets/ui/shared/coin.png");
    this.load.image("add","assets/ui/shared/add.png");
    this.load.image("deposit_badge","assets/ui/shared/deposit.png");
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
    this.load.image("icon_setting", "assets/ui/shared/setting.png");
    this.load.image("icon_sound",   "assets/ui/shared/sound.png");
    this.load.image("icon_music",   "assets/ui/shared/music.png");

    // Nhạc sảnh
    if (!this.cache.audio.exists("lobby_bgm")) {
      this.load.audio("lobby_bgm", getAudioTrackUrl("lobby_bgm", "assets/music/lobby/lobbyscene.mp3"));
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
    if (!this._bgm && this.cache.audio.exists("lobby_bgm") && isMusicEnabled() && isAudioTrackEnabled("lobby_bgm")) {
      this._bgm = this.sound.add("lobby_bgm", { loop: true, volume: getAudioTrackVolume("lobby_bgm", 0.56) });
    }
    if (this._bgm && !this._bgm.isPlaying && isMusicEnabled() && isAudioTrackEnabled("lobby_bgm")) {
      this._bgm.setVolume?.(getAudioTrackVolume("lobby_bgm", 0.56));
      this._bgm.play();
    } else if (this._bgm && this._bgm.isPlaying && (!isMusicEnabled() || !isAudioTrackEnabled("lobby_bgm"))) {
      this._bgm.stop();
    }
    setupClickSound(this);

    // Nút Cài Đặt (Âm thanh / Nhạc nền) góc trên phải đồng bộ với Phòng Chờ
    createSettingsButton(this, { x: width - 46, y: 46, size: 58, depth: 80 });

    // ===== NỀN SẢNH CHUYỂN CẢNH KHÍ QUYỂN 24 GIỜ (DAY ↔ NIGHT CROSSFADE) =====
    const lCfg = this._lobbyConfig;
    const lVer = lCfg?.version || 0;
    const dayKey = (lCfg?.is_custom && this.textures.exists(`lobby-bg-custom-day-${lVer}`))
      ? `lobby-bg-custom-day-${lVer}`
      : "lobby-bg-light";
    const nightKey = (lCfg?.is_custom && this.textures.exists(`lobby-bg-custom-night-${lVer}`))
      ? `lobby-bg-custom-night-${lVer}`
      : "lobby-bg-dark";

    const bgDay = this.add.image(width / 2, height / 2, dayKey);
    bgDay.setScale(Math.max(width / bgDay.width, height / bgDay.height));

    const bgNight = this.add.image(width / 2, height / 2, nightKey);
    bgNight.setScale(Math.max(width / bgNight.width, height / bgNight.height));

    const atmosphereOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);

    const applyAtmosphereNow = () => {
      const now = new Date();
      const hourFloat = lCfg?.time_mode === "fixed"
        ? Number(lCfg.fixed_hour ?? 12)
        : now.getHours() + now.getMinutes() / 60;
      const atm = computeLobbyAtmosphere(hourFloat);
      bgNight.setAlpha(atm.nightAlpha);
      atmosphereOverlay.setFillStyle(atm.tintColor, atm.tintAlpha);
      atmosphereOverlay.setBlendMode(atm.addMode ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    };
    applyAtmosphereNow();

    // Cập nhật ánh sáng mượt mỗi 30 giây nếu đang ở chế độ giờ thực
    this.time.addEvent({
      delay: 30000,
      loop: true,
      callback: applyAtmosphereNow,
    });

    // ===== LẤY TỌA ĐỘ 4 KHU VỰC TỪ CẤU HÌNH ADMIN (HOẶC MẶC ĐỊNH) =====
    const islandCfgMap = new Map((lCfg?.islands || []).map(it => [it.key, it]));
    const getIslandPos = (key, defX, defY) => {
      const found = islandCfgMap.get(key);
      return {
        rx: Number.isFinite(Number(found?.x)) ? Number(found.x) : defX,
        ry: Number.isFinite(Number(found?.y)) ? Number(found.y) : defY,
      };
    };

    // ===== NÚT Ở ĐẢO GIỮA: ĐẤU TRƯỜNG TRÒ CHƠI =====
    const playPos = getIslandPos("play", 0.50, 0.5393);
    const playText = this.add
      .text(width * playPos.rx, height * playPos.ry, "ĐẤU TRƯỜNG\nTRÍ TUỆ", {
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
    const shopPos = getIslandPos("shop", 0.31, 0.23);
    const rankPos = getIslandPos("rank", 0.12, 0.42);
    const labPos  = getIslandPos("lab",  0.84, 0.44);
    const menuItems = [
      {
        key: "shop",
        label: "CỬA HÀNG",
        rx: shopPos.rx,
        ry: shopPos.ry
      },
      {
        key: "rank",
        label: "XẾP HẠNG",
        rx: rankPos.rx,
        ry: rankPos.ry
      },
      {
        key: "lab",
        label: "NGHIÊN CỨU",
        rx: labPos.rx,
        ry: labPos.ry
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

      // cập nhật lại nền Ngày/Đêm + lớp phủ khí quyển
      bgDay.setPosition(w / 2, h / 2);
      bgDay.setScale(Math.max(w / bgDay.width, h / bgDay.height));
      bgNight.setPosition(w / 2, h / 2);
      bgNight.setScale(Math.max(w / bgNight.width, h / bgNight.height));
      atmosphereOverlay.setPosition(w / 2, h / 2).setSize(w, h);

      // cập nhật vị trí 4 chữ đảo
      this.islandTexts.forEach(({ text, config }) => {
        text.setPosition(w * config.rx, h * config.ry);
      });

      playText.setPosition(w * playPos.rx, h * playPos.ry);
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

  // 2. Vẽ Avatar người chơi (96x96 bo tròn + viền vàng kim sang trọng)
  const avX = profileX + avatarRadius;
  const avY = y - 2;
  const avMaskG = this.make.graphics({ add: false });
  avMaskG.fillStyle(0xffffff);
  avMaskG.fillCircle(avX, avY, avatarRadius - 1);
  const avMask = avMaskG.createGeometryMask();

  // Viền kính mỏng tinh tế nằm trên ảnh (depth 106)
  const avRing = this.add.graphics().setDepth(106);
  avRing.lineStyle(1.2, 0xffffff, 0.36);
  avRing.strokeCircle(avX, avY, avatarRadius - 0.5);

  this._lobbyAvatarGlow = null;
  this._lobbyAvatarImg = null;
  this._refreshLobbyAvatar = (avatarId) => {
    const id = Math.max(1, Math.min(50, Number(avatarId || 1)));
    const key = `avatar_96_${id}`;
    const glowKey = `avatar_glow_${id}`;

    const buildGlowTex = () => {
      if (this.textures.exists(glowKey)) return glowKey;
      const srcImg = this.textures.get(key)?.getSourceImage?.();
      if (!srcImg) return null;
      const sz = 128;
      const cTex = this.textures.createCanvas(glowKey, sz, sz);
      const ctx = cTex.getContext();
      ctx.clearRect(0, 0, sz, sz);
      ctx.save();
      ctx.filter = "blur(9px) saturate(1.5) brightness(1.18)";
      ctx.drawImage(srcImg, 18, 18, sz - 36, sz - 36);
      ctx.restore();
      ctx.globalCompositeOperation = "destination-in";
      const grad = ctx.createRadialGradient(sz / 2, sz / 2, sz * 0.24, sz / 2, sz / 2, sz * 0.5);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.68, "rgba(255,255,255,0.72)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, sz, sz);
      ctx.globalCompositeOperation = "source-over";
      cTex.refresh();
      return glowKey;
    };

    const applyTex = () => {
      if (!this.sys?.isActive?.() || !this.textures?.exists(key)) return;
      const gk = buildGlowTex();
      if (gk) {
        if (this._lobbyAvatarGlow?.active) {
          this._lobbyAvatarGlow.setTexture(gk).setDisplaySize(avatarSize + 24, avatarSize + 24);
        } else {
          this._lobbyAvatarGlow = this.add.image(avX, avY, gk)
            .setDisplaySize(avatarSize + 24, avatarSize + 24)
            .setDepth(103)
            .setAlpha(0.95);
        }
      }
      if (this._lobbyAvatarImg?.active) {
        this._lobbyAvatarImg.setTexture(key).setDisplaySize(avatarSize - 2, avatarSize - 2);
      } else {
        this._lobbyAvatarImg = this.add.image(avX, avY, key)
          .setDisplaySize(avatarSize - 2, avatarSize - 2)
          .setDepth(104)
          .setMask(avMask);
      }
    };
    if (this.textures.exists(key)) {
      applyTex();
    } else {
      this.load.image(key, `assets/resources/Avatar/PNG/thumbs_96/${id}.png`);
      this.load.once(`filecomplete-image-${key}`, applyTex);
      this.load.start();
    }
  };

  const initialAvId = Number(this.player?.user?.active_avatar_id || 1);
  this._refreshLobbyAvatar(initialAvId);

  const myUid = this.player?.user?.id || this.player?.user_id;
  if (myUid) {
    fetch(`${SERVER_URL}/users/${myUid}/avatars`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.active_avatar_id) {
          if (this.player?.user) {
            this.player.user.active_avatar_id = Number(d.active_avatar_id);
            setPlayerData(this, this.player);
          }
          this._refreshLobbyAvatar(d.active_avatar_id);
        }
      })
      .catch(() => {});
  }

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

  // Nhãn "NẠP" (deposit.png) phía trên nút + với hiệu ứng nhún lên xuống nhịp nhàng
  const depositBadge = this.add.image(plusBtn.x, y - 26, "deposit_badge")
    .setDisplaySize(46, 30)
    .setOrigin(0.5)
    .setDepth(108)
    .setInteractive({ cursor: "pointer" });

  this.tweens.add({
    targets: depositBadge,
    y: y - 31,
    duration: 720,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  depositBadge.on("pointerover", () => depositBadge.setScale(1.06));
  depositBadge.on("pointerout",  () => depositBadge.setDisplaySize(46, 30));
  depositBadge.on("pointerdown", () => {
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

    const PANEL_W = Math.min(540, width - 220);
    const PANEL_H = Math.min(470, height - 120);
    const PANEL_X = Math.round((width - PANEL_W) / 2) + 32;
    const PANEL_Y = Math.max(24, Math.round((height - 70 - PANEL_H) / 2));
    const SIDE_TAB_W = 148;
    const SIDE_TAB_H = 44;
    const SIDE_TAB_GAP = 10;
    const D       = 120; // thấp hơn FriendPanel (160) để FriendPanel đè lên trên

    const objs = [];
    const push  = o => { objs.push(o); return o; };

    // ── Dimmer tối phía sau giúp khung chat nổi bật & dễ đọc ──────
    const dim = push(this.add.graphics().setDepth(D - 2));
    dim.fillStyle(0x000000, 0.48);
    dim.fillRect(0, 0, width, height);
    push(this.add.zone(width / 2, height / 2, width, height)
      .setInteractive().setDepth(D - 2))
      .on("pointerdown", () => this._destroyChatPanel());

    // ── Khung chính to ở giữa (viền xanh cyan phát sáng kiểu Phòng Tán Gẫu) ──
    const bg = push(this.add.graphics().setDepth(D));
    // Hào quang xanh dương dịu ngoài viền
    bg.lineStyle(6, 0x1ea7ff, 0.2);
    bg.strokeRoundedRect(PANEL_X - 2, PANEL_Y - 2, PANEL_W + 4, PANEL_H + 4, 16);
    // Nền xanh đen trong suốt
    bg.fillStyle(0x031429, 0.86);
    bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14);
    // Viền sáng cyan sắc nét
    bg.lineStyle(2, 0x38bdf8, 0.92);
    bg.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14);

    // Chặn click xuyên qua khung chat xuống dimmer
    push(this.add.zone(PANEL_X + PANEL_W / 2, PANEL_Y + PANEL_H / 2, PANEL_W, PANEL_H)
      .setInteractive().setDepth(D));

    // ── Tabs gắn bên cạnh trái (PHÒNG TÁN GẪU / BẠN BÈ) ───────────
    const tabs = ["PHÒNG TÁN GẪU", "BẠN BÈ"];
    this._activeTab = this._activeTab || 0;
    const tabObjs = [];

    const buildTabs = () => {
      tabObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      tabObjs.length = 0;

      tabs.forEach((label, i) => {
        const tx = PANEL_X - SIDE_TAB_W + 2;
        const ty = PANEL_Y + 26 + i * (SIDE_TAB_H + SIDE_TAB_GAP);
        const isActive = i === this._activeTab;

        const tg = this.add.graphics().setDepth(isActive ? D + 2 : D - 1);
        if (isActive) {
          tg.fillGradientStyle(0x28c2ff, 0x28c2ff, 0x0284c7, 0x0284c7, 1);
          tg.fillRoundedRect(tx, ty, SIDE_TAB_W, SIDE_TAB_H, { tl: 12, tr: 0, bl: 12, br: 0 });
          tg.fillStyle(0xffffff, 0.25);
          tg.fillRoundedRect(tx + 5, ty + 3, SIDE_TAB_W - 8, SIDE_TAB_H * 0.4, { tl: 8, tr: 0, bl: 4, br: 0 });
          tg.lineStyle(1.8, 0x7dd3fc, 0.95);
          tg.strokeRoundedRect(tx, ty, SIDE_TAB_W, SIDE_TAB_H, { tl: 12, tr: 0, bl: 12, br: 0 });
        } else {
          tg.fillStyle(0x061d3a, 0.88);
          tg.fillRoundedRect(tx + 8, ty, SIDE_TAB_W - 8, SIDE_TAB_H, { tl: 10, tr: 0, bl: 10, br: 0 });
          tg.lineStyle(1.4, 0x2b6cb0, 0.7);
          tg.strokeRoundedRect(tx + 8, ty, SIDE_TAB_W - 8, SIDE_TAB_H, { tl: 10, tr: 0, bl: 10, br: 0 });
        }
        tabObjs.push(tg);

        const tt = this.add.text(tx + (isActive ? SIDE_TAB_W / 2 : (SIDE_TAB_W + 8) / 2), ty + SIDE_TAB_H / 2, label, {
          fontFamily: "Signika", fontSize: "13.5px",
          color: isActive ? "#ffffff" : "#89b7df",
          fontStyle: "bold",
          stroke: isActive ? "#034078" : "#021020",
          strokeThickness: isActive ? 3 : 2,
        }).setOrigin(0.5).setDepth(D + 3);
        tabObjs.push(tt);

        // Badge đỏ trên tab "BẠN BÈ" (i === 1)
        if (i === 1) {
          const unread = this._pmUnreadTotal || 0;
          if (unread > 0 && !isActive) {
            const bR = 9;
            const bX = tx + 20;
            const bY = ty + 8;
            const bG = this.add.graphics().setDepth(D + 4);
            bG.fillStyle(0xdd2222, 1);
            bG.fillCircle(bX, bY, bR);
            tabObjs.push(bG);
            const bt = this.add.text(bX, bY, unread > 99 ? "99+" : String(unread), {
              fontFamily: "Signika", fontSize: "10px", color: "#ffffff", fontStyle: "bold"
            }).setOrigin(0.5).setDepth(D + 5);
            tabObjs.push(bt);
          }
        }

        const tz = this.add.zone(tx + SIDE_TAB_W / 2, ty + SIDE_TAB_H / 2, SIDE_TAB_W, SIDE_TAB_H)
          .setInteractive({ cursor: "pointer" }).setDepth(D + 5);
        tz.on("pointerdown", () => {
          if (this._activeTab === i) return;
          playTabSound(this);
          this._activeTab = i;
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

    // ── Khu vực chat bên trong khung lớn ───────────────────────────
    const CHAT_X = PANEL_X + 6;
    const CHAT_Y = PANEL_Y + 6;
    const CHAT_W = PANEL_W - 12;
    const CHAT_H = PANEL_H - 12;
    let currentChat = null;

    const rebuildChatArea = () => {
      currentChat?.destroy();

      if (this._activeTab === 0) {
        this._initWorldSocket(() => {
          currentChat = new ChatWidget(this, {
            channel: "world", socket: this._worldSocket, depth: D + 1,
            myId: this.player?.user?.id
          });
          currentChat.build(CHAT_X, CHAT_Y, CHAT_W, CHAT_H);
          currentChat.addSystemMessage("Chat Thế Giới — Chào mừng!");
          this._currentChatWidget = currentChat;
        });
      } else {
        const friend = this._pmFriend;
        if (!friend) {
          currentChat = this._buildPMList(CHAT_X, CHAT_Y, CHAT_W, CHAT_H, D + 1, (f) => {
            this._pmFriend = f;
            rebuildChatArea();
          });
          this._currentChatWidget = currentChat;
        } else {
          currentChat = this._buildPMWidget(CHAT_X, CHAT_Y, CHAT_W, CHAT_H, D + 1, friend, () => {
            this._pmFriend = null;
            rebuildChatArea();
          });
          this._currentChatWidget = currentChat;
        }
      }
    };

    // ── Nút đóng X (nhô ra góc trên phải khung lớn) ───────────────
    const closeR = 20;
    const closeX = PANEL_X + PANEL_W - 2;
    const closeY = PANEL_Y + 2;
    const closeBtn = push(this.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(closeR * 2.2, closeR * 2.2)
      .setDepth(D + 6));
    const closeZone = push(this.add.zone(closeX, closeY, closeR * 2.4, closeR * 2.4)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 7));
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

    const rowObjs = [];
    const clearRows = () => {
      rowObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      rowObjs.length = 0;
    };
    const pushRow = (o) => { rowObjs.push(o); return o; };

    let scrollY = 0;
    let maxScroll = 0;
    let alive = true;

    const loadingTxt = pushRow(this.add.text(x + w / 2, y + h / 2, "⏳ Đang tải danh sách bạn bè...", {
      fontFamily: "Signika", fontSize: "14px", color: "#7799bb", align: "center"
    }).setOrigin(0.5).setDepth(D + 1));

    const renderFriendList = (friends) => {
      if (!alive) return;
      clearRows();
      scrollY = 0;

      if (!Array.isArray(friends) || friends.length === 0) {
        pushRow(this.add.text(x + w / 2, y + h / 2, "Bạn chưa có bạn bè nào.\nHãy kết bạn để trò chuyện!", {
          fontFamily: "Signika", fontSize: "14px", color: "#7799bb", align: "center"
        }).setOrigin(0.5).setDepth(D + 1));
        maxScroll = 0;
        return;
      }

      // Sắp xếp bạn Online / Trong phòng / Trong trận lên đầu
      const rankOf = (f) => f.online ? 0 : (f.in_room ? 1 : (f.in_game ? 2 : 3));
      const sorted = [...friends].sort((a, b) => {
        const ra = rankOf(a), rb = rankOf(b);
        if (ra !== rb) return ra - rb;
        return (a.name || "").localeCompare(b.name || "");
      });

      const ROW_H = 54;
      const conversations = this._pmConversations;
      let rowY = y + 8;

      sorted.forEach((friend) => {
        const fid = friend.friend_uid ?? friend.id;
        const isOnline = !!(friend.online || friend.in_room || friend.in_game);
        const rowAlpha = isOnline ? 1 : 0.48;
        const capturedRowY = rowY;

        const rowBg = pushRow(this.add.graphics().setDepth(D + 1).setMask(listMask).setAlpha(rowAlpha));
        const drawRowBg = (hover = false) => {
          rowBg.clear();
          rowBg.fillStyle(hover ? 0x163b6b : (isOnline ? 0x0a2244 : 0x07162b), hover ? 0.92 : 0.82);
          rowBg.fillRoundedRect(x + 6, capturedRowY, w - 12, ROW_H - 5, 8);
          rowBg.lineStyle(1, isOnline ? (hover ? 0x58b8ff : 0x2a66a8) : 0x1e334d, isOnline ? 0.7 : 0.4);
          rowBg.strokeRoundedRect(x + 6, capturedRowY, w - 12, ROW_H - 5, 8);
        };
        drawRowBg(false);

        // Avatar tròn 34x34
        const avX = x + 28;
        const avY = capturedRowY + (ROW_H - 5) / 2;
        renderAvatarBadge(this, {
          x: avX,
          y: avY,
          size: 34,
          avatarId: friend.active_avatar_id || 1,
          depth: D + 2,
          push: (o) => {
            o.setMask(listMask);
            if (!isOnline) o.setAlpha(0.55);
            return pushRow(o);
          },
          glow: isOnline,
        });

        // Chấm trạng thái góc dưới phải avatar
        const dotColor = friend.in_game ? 0xe05030
                       : friend.in_room ? 0xe8a020
                       : friend.online  ? 0x22c55e
                       : 0x64748b;
        const dotG = pushRow(this.add.graphics().setDepth(D + 5).setMask(listMask));
        dotG.fillStyle(dotColor, 1);
        dotG.fillCircle(avX + 12, avY + 12, 4.5);
        dotG.lineStyle(1.2, 0x041428, 1);
        dotG.strokeCircle(avX + 12, avY + 12, 4.5);

        // Tên bạn bè
        pushRow(this.add.text(x + 54, capturedRowY + 9, friend.name || `User ${fid}`, {
          fontFamily: "Signika", fontSize: "14px",
          color: isOnline ? "#d8ecff" : "#7c91a8", fontStyle: "bold"
        }).setDepth(D + 3).setMask(listMask));

        // Dòng phụ: trạng thái hoặc tin nhắn gần nhất
        const msgs = conversations?.get(fid);
        let subText = friend.in_game ? "Trong trận"
                    : friend.in_room ? "Trong phòng"
                    : friend.online  ? "Online • Nhấn để chat"
                    : "Offline";
        if (msgs && msgs.length > 0 && isOnline) {
          const last = msgs[msgs.length - 1].text.replace(/^\[.+?\] /, "");
          subText = last.slice(0, 24) + (last.length > 24 ? "…" : "");
        }
        const subColor = friend.in_game ? "#f87171"
                       : friend.in_room ? "#fbbf24"
                       : friend.online  ? "#4ade80"
                       : "#64748b";
        pushRow(this.add.text(x + 54, capturedRowY + 28, subText, {
          fontFamily: "Signika", fontSize: "11.5px", color: subColor
        }).setDepth(D + 3).setMask(listMask));

        // Chỉ cho phép bấm chat khi bạn đang Online
        if (isOnline) {
          pushRow(this.add.text(x + w - 18, avY, "💬", {
            fontSize: "15px"
          }).setOrigin(0.5).setDepth(D + 3).setMask(listMask));

          const zone = pushRow(this.add.zone(x + w / 2, avY, w - 12, ROW_H - 5)
            .setInteractive({ cursor: "pointer" }).setDepth(D + 6));
          zone.on("pointerover", () => drawRowBg(true));
          zone.on("pointerout",  () => drawRowBg(false));
          zone.on("pointerdown", () => {
            onSelect({
              friend_uid: fid,
              id: fid,
              name: friend.name || `User ${fid}`,
              active_avatar_id: friend.active_avatar_id || 1,
            });
          });
        }

        rowY += ROW_H;
      });

      const totalH = sorted.length * ROW_H + 12;
      maxScroll = Math.max(0, totalH - h);
      rowObjs.forEach(o => { if (o) o._pmBaseY = o.y; });
    };

    const onWheel = (pointer, _objs, _dx, dy) => {
      if (!alive || maxScroll <= 0) return;
      if (pointer.x < x || pointer.x > x + w || pointer.y < y || pointer.y > y + h) return;
      scrollY = Phaser.Math.Clamp(scrollY + dy * 0.45, 0, maxScroll);
      rowObjs.forEach(o => {
        if (!o || o._pmBaseY === undefined) return;
        try { o.y = o._pmBaseY - scrollY; } catch(_) {}
      });
    };
    this.input.on("wheel", onWheel);

    const socket = this._worldSocket;
    const onFriendList = (list) => renderFriendList(list || []);
    if (socket) {
      socket.on("friend:list", onFriendList);
      socket.emit("friend:list");
    } else {
      loadingTxt.setText("Chưa kết nối máy chủ chat");
    }

    return {
      destroy: () => {
        alive = false;
        this.input.off("wheel", onWheel);
        if (socket) socket.off("friend:list", onFriendList);
        clearRows();
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

    // ── Mời vào phòng / Duyệt xin vào phòng ───────────────────────
    this._worldSocket.on("room:invited", (data) => {
      if (!data?.roomData) return;
      this._showConfirm(
        `${data.from_name || "Bạn bè"} mời bạn vào phòng #${data.room_id}. Vào ngay?`,
        () => {
          this._destroyFriendPanel?.();
          this.scene.start("RoomScene", { roomData: data.roomData });
        }
      );
    });
    this._worldSocket.on("room:join_approved", (data) => {
      if (!data?.roomData) return;
      this._showToast?.("Đã được duyệt vào phòng!");
      this._destroyFriendPanel?.();
      this.scene.start("RoomScene", { roomData: data.roomData });
    });
    this._worldSocket.on("room:join_rejected", (data) => {
      this._showToast?.(data?.message || "Yêu cầu vào phòng bị từ chối.");
    });

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

  // ── PANEL NẠP TIỀN TỨC THÌ (VietQR + payOS Webhook) ─────────────
  _showTopUpPanel() {
    if (this._topUpPanelOpen) return;
    const playerData = this.registry.get("playerData")
      || JSON.parse(localStorage.getItem("playerData") || "null");
    const token = playerData?.token || localStorage.getItem("token");
    if (!token) {
      this._showToast("❌ Bạn chưa đăng nhập!");
      return;
    }

    this._topUpPanelOpen = true;
    openPayosTopUpFlow({
      scene: this,
      token,
      amountVnd: 50000,
      packageId: "pkg_50k",
      onPaid: (newEcoin, added) => {
        EcoinManager.set(this, newEcoin);
        if (playerData?.user) {
          playerData.user.ecoin = newEcoin;
          localStorage.setItem("playerData", JSON.stringify(playerData));
        }
        this._showToast(`✅ Nạp thành công +${Number(added || 0).toLocaleString()} Ecoin!`);
      },
      onError: (msg) => {
        this._showToast(`❌ ${msg}`);
      },
      onClose: () => {
        this._topUpPanelOpen = false;
      },
    });
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
    let avatarDomEl  = null;
    const removeAvatarDom = () => {
      if (avatarDomEl) {
        try { avatarDomEl.remove(); } catch(_) {}
        avatarDomEl = null;
      }
    };

    const closeAll = () => {
      this._myProfilePanelOpen = false;
      removeAvatarDom();
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

    // ── 3 Tab: Thông Tin / Avatar / Lịch Sử Trận ──────────────────
    const TAB_Y = T + 30;
    const TAB_H = 32;
    const PAD   = 22;
    const GAP   = 10;
    const tabs  = ["Thông Tin", "Avatar", "Lịch Sử Trận"];
    const TAB_W = (PW - PAD * 2 - GAP * (tabs.length - 1)) / tabs.length;
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
      removeAvatarDom();
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

      // Avatar tròn cạnh Tên người chơi & tên nhân vật (đồng bộ PlayerProfilePanel)
      const avBadgeSize = 38;
      const avBadgeX = leftX + IP + avBadgeSize / 2 + 1;
      const avBadgeY = BODY_T + IP + 20;
      renderAvatarBadge(this, {
        x: avBadgeX,
        y: avBadgeY,
        size: avBadgeSize,
        avatarId: user.active_avatar_id || this.player?.user?.active_avatar_id || 1,
        depth: D + 3,
        push: (o) => tabContent.push(o),
        glow: true,
      });

      const nameStartX = leftX + IP + avBadgeSize + 10;
      // Tên người chơi (To, rõ như bên Friend)
      tabContent.push(this.add.text(nameStartX, BODY_T + IP + 1, userName, {
        fontFamily: "Signika", fontSize: "17px",
        fontStyle: "bold", color: "#4a2500",
      }).setDepth(D + 4));

      // Tên nhân vật bên dưới
      tabContent.push(this.add.text(nameStartX, BODY_T + IP + 22,
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
          const lvl  = Number(card.level) >= 2 ? 2 : 1;
          const key  = tarotLevelKey(id, lvl, false);
          const key2 = tarotLevelKey(id, lvl, true);

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
            key,  tarotImagePath(id, lvl, false),
            key2, tarotImagePath(id, lvl, true)
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

          // Check if team mode và parse winner_team_ids
          const isTeamMode = row.match_mode === "team_2v2";
          let isWin = false;
          
          if (isTeamMode && row.winner_team_ids) {
            try {
              const winnerIds = JSON.parse(row.winner_team_ids);
              isWin = winnerIds.includes(Number(uid));
            } catch {
              isWin = Number(row.winner_id) === Number(uid);
            }
          } else {
            isWin = Number(row.winner_id) === Number(uid);
          }

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

    // ── TAB 2: CHỌN & THIẾT LẬP AVATAR (50 AVATARS 96x96) ─────────
    const renderAvatarTab = () => {
      const boxX = L + PAD;
      const boxY = CONTENT_Y;
      const boxW = PW - PAD * 2;
      const boxH = CONTENT_H;

      const bgG = this.add.graphics().setDepth(D + 2);
      bgG.fillStyle(0xeed698, 1);
      bgG.fillRoundedRect(boxX, boxY, boxW, boxH, 10);
      bgG.lineStyle(1.5, 0xb89040, 0.85);
      bgG.strokeRoundedRect(boxX, boxY, boxW, boxH, 10);
      tabContent.push(bgG);

      const canvas = this.game?.canvas;
      const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width, height };
      const sx = rect.width / width;
      const sy = rect.height / height;

      const wrap = document.createElement("div");
      wrap.style.cssText = `
        position: fixed;
        left: ${rect.left + (boxX + 6) * sx}px;
        top: ${rect.top + (boxY + 6) * sy}px;
        width: ${(boxW - 12) * sx}px;
        height: ${(boxH - 12) * sy}px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        z-index: 99980;
        font-family: Signika, system-ui, sans-serif;
        box-sizing: border-box;
      `;

      const statusBar = document.createElement("div");
      statusBar.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 8px; border-radius: 7px;
        background: rgba(138, 90, 24, 0.16); color: #4a2500;
        font-size: 12px; font-weight: 700; flex-shrink: 0;
      `;
      statusBar.innerHTML = `<span>⏳ Đang tải bộ sưu tập Avatar...</span>`;
      wrap.appendChild(statusBar);

      const innerW = Math.max(240, (boxW - 12) * sx);
      const cols = 6;
      const cellGap = 8;
      const cellSize = Math.max(48, Math.floor((innerW - 24 - cellGap * (cols - 1)) / cols));

      const grid = document.createElement("div");
      grid.style.cssText = `
        flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px;
        display: grid;
        grid-template-columns: repeat(${cols}, ${cellSize}px);
        grid-auto-rows: ${cellSize}px;
        gap: ${cellGap}px;
        justify-content: center;
        align-content: start;
      `;
      wrap.appendChild(grid);
      document.body.appendChild(wrap);
      avatarDomEl = wrap;

      const renderAvatarGrid = (avatars, ownedIds, activeAvId) => {
        if (!avatarDomEl || !this._myProfilePanelOpen) return;
        const ownedSet = new Set(ownedIds.map(Number));
        statusBar.innerHTML = `
          <span>Đã sở hữu: <b>${ownedSet.size}/${avatars.length}</b> • Chọn avatar đã mở khóa để trang bị</span>
          <button type="button" id="goAvatarShopBtn" style="
            background: linear-gradient(180deg,#ff9800,#d97706); color:#fff; border:1px solid #8b5e1a;
            border-radius:6px; padding:3px 9px; font-size:11px; font-weight:700; cursor:pointer;
          ">🛒 Mua thêm</button>
        `;
        statusBar.querySelector("#goAvatarShopBtn").onclick = () => {
          closeAll();
          this.scene.start("ShopScene");
        };

        grid.innerHTML = "";
        avatars.forEach((av) => {
          const isOwned = av.id === 1 || ownedSet.has(Number(av.id));
          const isActive = Number(activeAvId) === Number(av.id);

          const cell = document.createElement("button");
          cell.type = "button";
          cell.title = isOwned
            ? `${av.name} (${isActive ? "Đang dùng" : "Bấm để chọn"})`
            : `${av.name} — Chưa sở hữu (${Number(av.price_ecoin).toLocaleString("vi-VN")} Ecoin)`;
          cell.style.cssText = `
            position: relative; width: ${cellSize}px; height: ${cellSize}px;
            padding: 0; margin: 0; box-sizing: border-box;
            border-radius: 10px; overflow: hidden; cursor: pointer;
            border: 2.5px solid ${isActive ? "#16a34a" : (isOwned ? "#b88628" : "#5c4a32")};
            background: #101828;
            box-shadow: ${isActive ? "0 0 0 2px rgba(22,163,74,0.4)" : "0 2px 6px rgba(0,0,0,0.22)"};
            transition: transform 0.12s ease;
          `;

          const img = document.createElement("img");
          img.src = `/${av.image_path}`;
          img.alt = av.name;
          img.loading = "lazy";
          img.style.cssText = `
            width: 100%; height: 100%; object-fit: cover; display: block;
            ${isOwned ? "" : "filter: grayscale(0.25) brightness(0.65);"}
          `;
          cell.appendChild(img);

          if (!isOwned) {
            const lockMask = document.createElement("div");
            lockMask.style.cssText = `
              position: absolute; inset: 0;
              background: rgba(0, 0, 0, 0.58);
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              color: #f8fafc; font-size: 20px; text-shadow: 0 2px 6px rgba(0,0,0,0.9);
            `;
            lockMask.innerHTML = `<span>🔒</span>`;
            cell.appendChild(lockMask);
          } else if (isActive) {
            const tick = document.createElement("div");
            tick.style.cssText = `
              position: absolute; bottom: 0; left: 0; right: 0;
              background: rgba(22, 163, 74, 0.92); color: #fff;
              font-size: 9px; font-weight: 800; padding: 1px 0; text-align: center;
            `;
            tick.textContent = "ĐANG DÙNG";
            cell.appendChild(tick);
          }

          cell.onmouseenter = () => { cell.style.transform = "scale(1.06)"; };
          cell.onmouseleave = () => { cell.style.transform = "scale(1)"; };
          cell.onclick = async () => {
            if (!isOwned) {
              statusBar.querySelector("span").innerHTML =
                `🔒 <b>${av.name}</b> chưa sở hữu (${Number(av.price_ecoin).toLocaleString("vi-VN")} Ecoin) — bấm <b>Mua thêm</b>!`;
              return;
            }
            if (isActive) return;
            try {
              const r = await fetch(`${SERVER_URL}/users/${uid}/avatars/active`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar_id: av.id }),
              });
              const j = await r.json();
              if (j.success) {
                if (this.player?.user) {
                  this.player.user.active_avatar_id = av.id;
                  setPlayerData(this, this.player);
                }
                if (pd?.user) pd.user.active_avatar_id = av.id;
                this._refreshLobbyAvatar?.(av.id);
                renderAvatarGrid(avatars, ownedIds, av.id);
                statusBar.querySelector("span").innerHTML = `✅ Đã đổi sang <b>${av.name}</b>!`;
              }
            } catch (_) {
              statusBar.querySelector("span").textContent = "❌ Lỗi kết nối khi đổi avatar";
            }
          };

          grid.appendChild(cell);
        });
      };

      fetch(`${SERVER_URL}/users/${uid}/avatars`)
        .then(r => r.json())
        .then(data => {
          if (!data?.success) {
            statusBar.innerHTML = `<span>❌ Không tải được danh sách avatar</span>`;
            return;
          }
          renderAvatarGrid(data.avatars || [], data.owned_ids || [1], data.active_avatar_id || 1);
        })
        .catch(() => {
          if (statusBar) statusBar.innerHTML = `<span>❌ Lỗi kết nối server</span>`;
        });
    };

    const renderContent = () => {
      clearContent();
      if (activeTab === 0)      renderInfoTab();
      else if (activeTab === 1) renderAvatarTab();
      else                      renderHistoryTab();
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
