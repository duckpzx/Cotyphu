import PowerDiceSystem   from "./components/PowerDiceSystem.js";
import TarotModalSystem  from "./components/TarotModalSystem.js";
import CharSkillWidget   from "./components/CharSkillWidget.js";
import TarotButtonWidget from "./components/TarotButtonWidget.js";
import CardSystem        from "./components/CardSystem.js";
import { SERVER_URL }    from "../config.js";
import { getActiveProfile, getPlayerData } from "../server/utils/playerData.js";
import { createLoadingOverlay } from "../utils/loadingOverlay.js";
import { getTarotLevel, tarotImagePath, prepareLevelTexture, markLevelTexture, tarotLevelKey, ensureTarotLevelTexture } from "../utils/tarotLevel.js";
import ChatWidget         from "./components/ChatWidget.js";
import PlayerProfilePanel from "./components/PlayerProfilePanel.js";
import voiceChat          from "../utils/voiceChatManager.js";
import { extractEmojiId, showCharacterEmojiBubble } from "../utils/emojiBubble.js";
import { renderAvatarBadge } from "../utils/avatarBadge.js";
import { drawCreamModalPanel } from "../utils/creamPanel.js";
import { createDemoMockSocket, mountBoardDemoSandbox } from "../utils/boardDemoSandbox.js";
import {
  playBoardBuySound, playBoardErrSound, playBoardHunterSound,
  playBoardIncreaseSound, playBoardTeacherSound, playBoardSkillSound,
  playBoardBGM, playBoardAnswerSound, playBoardCoinSound, playBoardDiceSound,
  playBoardStartSound, startFootstepSound, stopFootstepSound,
  setupClickSound,
  isMusicEnabled, isSoundEnabled, setMusicEnabled, setSoundEnabled
} from "../utils/clickSound.js";

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super("BoardScene");
    this.originalWidth  = 1920;
    this.originalHeight = 1080;
    this.canRoll        = true;
    this.otherPlayers   = {};
    this.characters     = [
      'Dark_Oracle','Forest_Ranger','Golem','Minotaur',
      'Necromancer_of_the_Shadow','Reaper_Man','Zombie_Villager'
    ];
    this.isMyTurn            = false;
    this.myTurnOrder         = null;
    this.myPlanetColor       = null;
    this.gameRoomId          = null;
    this.gamePlayers         = [];
    this.currentTurnSocketId = null;

    this.serverClockOffsetMs = 0;
    this.tarotCardsByUserId  = {};
    this.tarotStateByUserId  = {};
    this._tarotUiTimer       = null;
    this._tarotModalObjs     = [];
  }

  // ── MOBILE RECONNECT HANDLER ───────────────────────────────────
  handleReconnect() {
    console.log("🔄 BoardScene: Handling reconnect...");
    
    if (!this.socket || !this.gameRoomId) {
      console.warn("⚠️ Cannot reconnect - no socket or room ID");
      return;
    }

    // Nếu socket đã connected → force rejoin
    if (this.socket.connected) {
      console.log("✅ Socket connected - rejoining room");
      const playerData = JSON.parse(localStorage.getItem("playerData") || "{}");
      
      this.socket.emit("join", {
        room_id:       this.gameRoomId,
        name:          playerData?.user?.name || "Player",
        user_id:       playerData?.user?.id,
        characterName: this.characterName || "Dark_Oracle",
        skin:          this.mySkin || 1
      });

      // Request lại game state
      setTimeout(() => {
        this.socket.emit("game:request_state", { room_id: this.gameRoomId });
      }, 500);
    } else {
      // Socket chưa connected → force reconnect
      console.log("⚠️ Socket disconnected - attempting reconnect");
      this.socket.connect();
    }
  }

  _normalizeTarotIds(raw) {
  let ids = raw ?? [];
  if (typeof ids === "string") {
    try { ids = JSON.parse(ids); } catch { ids = []; }
  }
  if (!Array.isArray(ids)) ids = [];
  return ids.map(Number).filter(Boolean).slice(0, 2);
}

_estimateServerNowMs() {
  return Date.now() + Number(this.serverClockOffsetMs || 0);
}

_ingestTarotPlayerData(player) {
  if (!player?.user_id) return;

  const userId = Number(player.user_id);
  const activeIds = this._normalizeTarotIds(player.active_tarot_ids);

  this.tarotStateByUserId[userId] = {
    tarot_runtime: player.tarot_runtime || this.tarotStateByUserId[userId]?.tarot_runtime || {},
    cooldown_seconds_left: [],
    used_tarot_this_turn: !!player.used_tarot_this_turn
  };

  if (Array.isArray(player.tarot_cards)) {
    this.tarotCardsByUserId[userId] = player.tarot_cards;
  }

  if (activeIds.length) {
    this.updatePlayerTarotSlotsByUserId(userId, activeIds);
  }
}

_refreshPlayerTarotCooldownByUserId(userId) {
  const panel = this.playerPanels?.find(p => p.userId === userId);
  if (!panel || !panel.tarotSlots) return;

  const runtime = this.tarotStateByUserId?.[userId]?.tarot_runtime || {};
  const ids = this._normalizeTarotIds(
    this.gamePlayers?.find(p => Number(p.user_id) === Number(userId))?.active_tarot_ids
  );

  // Cooldown tính bằng số lần đổ xúc xắc còn lại
  const rollsLeft = ids.map((id) => {
    return Math.max(0, Number(runtime?.[id]?.cooldown_turns_left ?? 0));
  });

  this.updatePlayerTarotCooldownsByUserId(userId, rollsLeft);
}

_refreshAllTarotCooldownUIs() {
  (this.gamePlayers || []).forEach((p) => {
    this._refreshPlayerTarotCooldownByUserId(Number(p.user_id));
  });
}

_startTarotUiTicker() {
  // Cooldown theo rolls — không cần ticker giây, refresh khi nhận event từ server
}

_canUseTarotNow() {
  const myUid = this._myUserId();
  const myState = this.tarotStateByUserId?.[myUid];

  if (!this.isMyTurn || !this.canRoll || this.mustAnswerNext) return false;
  if (myState?.used_tarot_this_turn) return false;

  // Kiểm tra có ít nhất 1 thẻ đã hết cooldown (cooldown_turns_left === 0)
  const me = (this.gamePlayers || []).find(p => Number(p.user_id) === Number(myUid));
  const activeIds = this._normalizeTarotIds(me?.active_tarot_ids);
  if (!activeIds.length) return false;

  const runtime = myState?.tarot_runtime || {};
  const hasUsableCard = activeIds.some(id => {
    const rt = runtime[id] || {};
    return Number(rt.cooldown_turns_left ?? 0) === 0;
  });

  return hasUsableCard;
}

_bindMyTarotSlotClicks() {
  const myUid = this._myUserId();
  const myPanel = this.playerPanels?.find(p => Number(p.userId) === Number(myUid));
  if (!myPanel?.tarotSlots) return;

  myPanel.tarotSlots.forEach((slot) => {
    if (!slot?.icon || slot.icon._tarotBound) return;

    slot.icon._tarotBound = true;
    slot.icon.setInteractive({ useHandCursor: true });

    slot.icon.on("pointerdown", () => {
      if (!slot.tarotId) return;
      this._openTarotModal(slot.tarotId);
    });
  });
}

_openTarotModal(focusTarotId = null) {
  this.tarotModal?.open(focusTarotId);
}

// _openTarotModal()  { this.tarotModal?.open();  }

_closeTarotModal() { this.tarotModal?.close(); }

  // ============================================================
  //  SOCKET EVENTS
  //  Chú ý: chỉ đăng ký game:dice_result MỘT LẦN duy nhất.
  // ============================================================
  setupSocketEvents() {
    // ── currentPlayers ──────────────────────────────────────────
    this.socket.on("currentPlayers", (players) => {
      Object.values(this.otherPlayers).forEach(p => {
        p.shadow?.destroy();
        p.nameText?.destroy();
        p.destroy();
      });
      this.otherPlayers = {};

      const list = Object.values(players);
      list.forEach(player => {
        if (player.id !== this.socket.id) this.addOtherPlayer(player);
      });
      list.forEach((player, i) => {
        const panelId = ['p1','p2','p3','p4'][i];
        this.updatePlayerPanel(panelId, player.name || `Player ${i+1}`, 0, i+1);
      });
    });

    // Thêm vào setupSocketEvents
    this.socket.on('game:extra_move', (data) => {
      if (data.user_id === this._myUserId()) {
        this._movePlayerSteps(data.steps, () => {
          this.socket.emit('game:move_done', { room_id: this.gameRoomId, cell_index: this.currentIndex });
        });
      }
    });

    this.socket.on('game:extra_turn', (data) => {
      if (data.user_id === this._myUserId()) {
        this.isMyTurn = true;
        this.canRoll = true;
        this._applyTurnState();
        this._updateTurnInfo();
        this._showTurnBanner('✨ Lượt thêm từ Xúc Xắc Ma Thuật!', '#ffcc44');
      }
    });

    this.socket.on('game:steal_effect', (data) => {
      const isMe = Number(data.user_id) === Number(this._myUserId());
      const amt = Number(data.total ?? data.amount ?? 0);
      this._showToast(`${isMe ? 'Bạn' : data.name} đã thu ${this._formatMoney(amt)} từ đối thủ!`,
        isMe ? '#ffdd55' : '#ff8844');
      this._playTarotStealFX(data);
      this._updatePlayerStatsInUI();
    });

    this.socket.on('game:rent_refund', (data) => {
      if (data.user_id === this._myUserId()) {
        this._showToast(`🛡️ Thần Giữ Của hoàn trả ${this._formatMoney(data.amount)}!`, '#88ff88');
        this._updatePlayerStatsInUI();
      }
    });

    // ── game:init ────────────────────────────────────────────────
    this.socket.on("game:init", (data) => {
      const myUid = this._myUserId();
      this.gamePlayers = data.players;
      this.cellStates = data.cellStates || {};
      this.isMyTurn = (data.current_turn_user_id === myUid);
      this.canRoll = this.isMyTurn;
      this.gameRoomId = data.room_id || this.gameRoomId;
      this.serverClockOffsetMs = Number(data.server_now_ms || Date.now()) - Date.now();
      if (this.gameRoomId && this.socket) {
        voiceChat.join(this.socket, this.gameRoomId, myUid, this.playerName);
        if (!this._unsubVoiceErr) {
          this._unsubVoiceErr = voiceChat.onError((msg) => this._showToast?.(msg, "#ff6666", 3000));
        }
      }

      // ── Lưu session reconnect ────────────────────────────────
      try {
        localStorage.setItem("activeGame", JSON.stringify({
          room_id:     data.room_id,
          match_mode:  data.match_mode || "solo_4",
          bet_ecoin:   data.bet_ecoin,
          roomData:    { id: data.room_id, match_mode: data.match_mode, bet_ecoin: data.bet_ecoin },
          saved_at:    Date.now(),
        }));
      } catch(e) {}
      // Nhạc nền khi vào trận — dừng nhạc lobby nếu còn chạy
      try {
        const lobbyBgm = this.sound.get("lobby_bgm");
        if (lobbyBgm?.isPlaying) lobbyBgm.stop();
      } catch(e) {}
      playBoardBGM(this);

      // Phân biệt lần vào trận mới (chạy hiệu ứng Intro như video) vs reconnect / init lần 2
      const isFirstFreshInit =
        !this._isReconnecting &&
        !this._introPlayedOnce &&
        Number(data.turn_number || 1) <= 1 &&
        Object.keys(this.cellStates || {}).length === 0;

      // Cập nhật tất cả badges thành "Hoàn thành" + hiện huy hiệu thứ tự lượt 1st..4th
      if (this._loadingStatusTexts) {
        data.players.forEach((p, idx) => {
          const entry = this._loadingStatusTexts[p.user_id];
          if (entry?.drawStatus) entry.drawStatus("Hoàn thành", 0x16a34a);
          if (entry?.drawRankBadge) entry.drawRankBadge(p.turn_order || (idx + 1));
        });
      }
      this._loadingFallbackTimer && clearTimeout(this._loadingFallbackTimer);
      this._loadingFallbackTimer = null;

      if (isFirstFreshInit) {
        this._introPlayedOnce = true;
        this._isIntroRunning = true;
        this._playMatchStartIntro(data.players);
      } else if (!this._isIntroRunning) {
        this._hideLoadingScreen();
      }

      if (this._isReconnecting && !this._gameChatHistoryFetched) {
        this._gameChatHistoryFetched = true;
        this.socket?.emit("chat:game:history:get");
      }

      this.createPlayerPanels(this.minRatio);
      this._refreshPlayerPanelsFromGameState();

      data.players.forEach((gp) => {
        this._ingestTarotPlayerData(gp);
      });

      const me = data.players.find(p => p.user_id === myUid);
      if (me) {
        this.myPlanetColor = me.planet_color;
        const myColor = this._getPlayerColor(this.myPlanetColor);
        this.playerNameText.setColor(myColor);
        this.playerNameText.setText(me.name);
      }

      data.players.forEach(p => {
        const otherPlayer = this.otherPlayers[p.socket_id] ||
          Object.values(this.otherPlayers).find(op => op.user_id === p.user_id);
        if (otherPlayer && otherPlayer.nameText) {
          const color = this._getPlayerColor(p.planet_color);
          otherPlayer.nameText.setColor(color);
          otherPlayer.planet_color = p.planet_color;
        }
      });

      if (!this.tarotCardsByUserId) this.tarotCardsByUserId = {};
      if (!this.tarotStateByUserId) this.tarotStateByUserId = {};

      data.players.forEach((gp) => {
        let ids = gp.active_tarot_ids;

        if (typeof ids === "string") {
          try {
            ids = JSON.parse(ids);
          } catch {
            ids = [];
          }
        }

        if (Array.isArray(ids) && ids.length) {
          this.updatePlayerTarotSlotsByUserId(gp.user_id, ids);
        }

        if (Array.isArray(gp.tarot_cards) && gp.tarot_cards.length) {
          this.tarotCardsByUserId[gp.user_id] = gp.tarot_cards;
        }

        if (gp.tarot_runtime) {
          this.tarotStateByUserId[gp.user_id] = {
            tarot_runtime: gp.tarot_runtime,
            used_tarot_this_turn: !!gp.used_tarot_this_turn
          };
        }
      });

      this._applyTurnState();
      this._updateTurnInfo();
      this._updateTurnCounter(data.turn_number || 1);
      this._renderAllCells(this.cellStates);
      this._updatePlayerStatsInUI();

      this._bindMyTarotSlotClicks();
      this._refreshAllTarotCooldownUIs();
      this._startTarotUiTicker();

      // ── Restore vị trí tất cả player từ game state ───────────────
      // Luôn chạy: cả lần đầu vào lẫn reconnect
      const isReconnect = this._isReconnecting;
      this._isReconnecting = false;

      data.players.forEach(p => {
        const cellIdx = Number(p.index || 0);
        const cell    = this.boardPath[cellIdx];
        if (!cell) return;

        const wx = cell.x * this.scale.width;
        const wy = cell.y * this.scale.height;
        const nameOffsetY = 140 * this.minRatio;

        if (Number(p.user_id) === Number(myUid)) {
          // ── Vị trí nhân vật mình ─────────────────────────────────
          this.currentIndex = cellIdx;
          if (this.player) {
            this.player.x = wx;
            this.player.y = wy;
          }
          if (this.playerNameText) {
            this.playerNameText.x = wx;
            this.playerNameText.y = wy - nameOffsetY;
          }
        } else {
          // ── Vị trí nhân vật người khác ───────────────────────────
          // Tìm sprite theo user_id (socket_id đã đổi sau reconnect)
          let op = Object.values(this.otherPlayers).find(
            o => Number(o.user_id) === Number(p.user_id)
          );

          if (!op && isReconnect) {
            // Reconnect muộn: tạo mới sprite tại đúng ô
            this.addOtherPlayer({
              id:            p.socket_id,
              user_id:       p.user_id,
              name:          p.name,
              characterName: p.characterName || "Dark_Oracle",
              skin:          p.skin || 1,
              index:         cellIdx,
              planet_color:  p.planet_color,
            });
            op = this.otherPlayers[p.socket_id];
          }

          if (op) {
            // Remap key sang socket_id mới nếu cần
            const oldKey = Object.keys(this.otherPlayers).find(
              k => Number(this.otherPlayers[k]?.user_id) === Number(p.user_id)
            );
            if (oldKey && p.socket_id && oldKey !== p.socket_id) {
              this.otherPlayers[p.socket_id] = op;
              delete this.otherPlayers[oldKey];
            }
            // Teleport đến vị trí đúng (không animate)
            op.x = wx;
            op.y = wy;
            op.index = cellIdx;
            if (op.shadow)   { op.shadow.x   = wx;              op.shadow.y   = wy + 5; }
            if (op.nameText) { op.nameText.x  = wx;              op.nameText.y = wy - nameOffsetY; }
            if (op.nameText && p.name && op.nameText.text !== p.name) op.nameText.setText(p.name);
          }
        }
      });

      if (isReconnect) {
        this._showToast("🔄 Đã kết nối lại ván đấu!", "#44ccff", 3000);
      }
    });

    // ── game:turn_changed ────────────────────────────────────────
    this.socket.on("game:turn_changed", (data) => {
      const myUid = this._myUserId();
      this.isMyTurn            = (data.current_turn_user_id === myUid);
      this.currentTurnSocketId = data.socket_id || data.current_turn || null;
      this.mustAnswerNext      = !!data.must_answer;
      this.canRoll             = this.isMyTurn && !this.mustAnswerNext;

      if (data.server_now_ms) {
        this.serverClockOffsetMs = Number(data.server_now_ms) - Date.now();
      }

      if (this.mustAnswerNext && this.isMyTurn) {
        this.infoText.setText("⏳ Đang tải câu hỏi...").setColor("#ff8844");
        this.powerDice?.hide();
        if (this.diceSprite) this.diceSprite.setVisible(false);
        if (this.diceShadow) this.diceShadow.setVisible(false);
        if (this.diceSprite2) this.diceSprite2.setVisible(false);
        if (this.diceShadow2) this.diceShadow2.setVisible(false);
      }

      this._applyTurnState();
      this._updateTurnInfo();
      this._updateTurnCounter(data.turn_number || 0);
      if (!this._isIntroRunning) {
        this._showTurnBanner(
          this.isMyTurn ? "🎲 Lượt của bạn! Nhấn SPACE" : `⏸ Lượt của ${data.name}...`,
          this.isMyTurn ? "#ffdd00" : "#aaaaaa"
        );
      }

        // Trong handler game:turn_changed, thêm đoạn này:
      if (this.tarotStateByUserId[myUid]) {
        // Server sẽ emit tarot_state mới, nhưng reset local ngay để UI phản hồi nhanh
        if (data.current_turn_user_id !== myUid) {
          // Lượt người khác — không reset của mình
        }
      }
      // Thêm: mở/đóng nút tarot theo lượt
      this._applyTurnState();  // dòng này đã có, đảm bảo gọi sau khi set isMyTurn

      // Tick cooldown theo lượt cho người vừa kết thúc lượt
      const prevUserId = data.prev_turn_user_id ?? data.user_id;
      if (prevUserId) this.cardSystem?.tickCooldowns(Number(prevUserId));

      this._refreshAllTarotCooldownUIs();
    });

    // ── game:dice_result — NGUỒN DUY NHẤT ───────────────────────
    //  Cả online lẫn offline đều đi qua đây.
    //  PowerDiceSystem KHÔNG tự tính kết quả — chỉ nhận từ đây.
    this.socket.on("game:dice_result", (data) => {
      const myUid = this._myUserId();
      const isMe  = (data.socket_id === this.socket.id)
                 || (data.user_id   === myUid && this.isMyTurn);

      // Phát âm thanh cho người khác (người tung đã phát sớm hơn)
      if (!isMe) playBoardDiceSound(this);

      const diceText = (data.dice1 && data.dice2)
        ? `${data.dice1} + ${data.dice2} = ${data.dice}`
        : `${data.dice}`;

      if (isMe) {
        this.canRoll = false;
        if (data.extra_turn) {
          this.infoText.setText(`🎲 ĐÔI ${data.dice1}! ${diceText} — Được đi tiếp!`);
          this.infoText.setColor("#00ffcc");
          this._showToast?.(`✨ ĐÔI ${data.dice1}! Bạn được đi tiếp thêm lượt!`, "#00ffcc", 2600);
        } else {
          this.infoText.setText(`🎲 Bạn tung được ${diceText}!`);
          this.infoText.setColor("#ffdd00");
        }

        // Nếu PowerDice đang chờ kết quả → dùng PD animation
        if (this.powerDice?.rolling) {
          this.powerDice.playResultAnimation(data, () => {
            this._onDiceHandoff(data);
          });
        } else {
          // Fallback: PD không active, dùng animation scene cũ
          this._onDiceHandoff(data);
        }
      } else {
        // Người khác tung — chỉ hiện info text, không động vào PD
        if (data.extra_turn) {
          this.infoText.setText(`🎲 ${data.name} tung ĐÔI ${data.dice1} (${diceText}) — Đi tiếp!`);
          this.infoText.setColor("#00ffcc");
        } else {
          this.infoText.setText(`${data.name} tung được ${diceText}!`);
          this.infoText.setColor("#aaffaa");
        }
      }
    });

    // ── game:error ────────────────────────────────────────────────
    this.socket.on("game:error", (data) => {
      console.warn("game:error:", data.message);
      playBoardErrSound(this);
      this.infoText.setText(`❌ ${data.message}`);
      this.infoText.setColor("#ff4444");
      this.canRoll = this.isMyTurn;
      this.time.delayedCall(2500, () => this._updateTurnInfo());
    });

    // ── newPlayer ─────────────────────────────────────────────────
    this.socket.on("newPlayer", (player) => {
      if (!player || player.id === this.socket.id) return;
      const myUid = this._myUserId();
      if (player.user_id && myUid && Number(player.user_id) === Number(myUid)) return;
      if (this.gameRoomId && this.gamePlayers?.length) {
        const inRoom = this.gamePlayers.some(p => Number(p.user_id) === Number(player.user_id));
        if (!inRoom) return;
      }
      this.addOtherPlayer(player);
    });

    // ── game:player_reconnected — người chơi kết nối lại ─────────
    // Server gửi vị trí đúng ngay sau game:request_state
    this.socket.on("game:player_reconnected", (data) => {
      const myUid = this._myUserId();
      if (Number(data.user_id) === Number(myUid)) return; // không xử lý cho chính mình

      // Tìm tất cả sprite hiện có theo user_id (tránh bị trùng lặp)
      const matchingKeys = Object.keys(this.otherPlayers).filter(
        k => Number(this.otherPlayers[k]?.user_id) === Number(data.user_id)
      );
      let op = matchingKeys.length ? this.otherPlayers[matchingKeys[0]] : null;
      // Dọn các bản sao thừa nếu có
      for (let i = 1; i < matchingKeys.length; i++) {
        const dupKey = matchingKeys[i];
        const dup = this.otherPlayers[dupKey];
        dup?.shadow?.destroy();
        dup?.nameText?.destroy();
        dup?.destroy();
        delete this.otherPlayers[dupKey];
      }

      const cellIdx = Number(data.index || 0);
      const cell    = this.boardPath[cellIdx];
      if (!cell) return;

      const wx = cell.x * this.scale.width;
      const wy = cell.y * this.scale.height;

      if (op) {
        // Sprite đã tồn tại — remap sang socket_id mới và teleport đến đúng ô
        const oldKey = Object.keys(this.otherPlayers).find(
          k => Number(this.otherPlayers[k]?.user_id) === Number(data.user_id)
        );
        if (oldKey && oldKey !== data.socket_id) {
          this.otherPlayers[data.socket_id] = op;
          delete this.otherPlayers[oldKey];
        }
        // Đặt vị trí đúng không animate
        op.x = wx;
        op.y = wy;
        op.index = cellIdx;
        if (op.shadow)   { op.shadow.x = wx; op.shadow.y = wy + 5; }
        if (op.nameText) { op.nameText.x = wx; op.nameText.y = wy - 140 * this.minRatio; }
        // Cập nhật tên nếu thay đổi
        if (op.nameText && data.name) op.nameText.setText(data.name);
        op.setVisible(true);
        op.shadow?.setVisible(true);
        op.nameText?.setVisible(true);
      } else {
        // Sprite chưa tồn tại (vd: client reload trễ) — tạo mới tại đúng ô
        this.addOtherPlayer({
          id:            data.socket_id,
          user_id:       data.user_id,
          name:          data.name,
          characterName: data.characterName || "Dark_Oracle",
          skin:          data.skin || 1,
          index:         cellIdx,
          planet_color:  data.planet_color,
        });
      }

      this._showToast(`🔄 ${data.name} đã kết nối lại`, "#44ccff", 2500);
    });

    // ── game:player_disconnected — cảnh báo mất kết nối trước khi Bot AI tiếp quản ──
    this.socket.on("game:player_disconnected", (data) => {
      if (!data) return;
      const myUid = this._myUserId();
      if (Number(data.user_id) === Number(myUid)) return;
      const sec = Number(data.grace_seconds) || 15;
      this._showToast(`⚠️ ${data.name} mất kết nối — Bot AI sẽ chơi hộ sau ${sec}s`, "#ffbb55", 3500);
    });

    // ── game:bot_status — Bot AI tiếp quản hoặc trả lại quyền cho người chơi ──
    this.socket.on("game:bot_status", (data) => {
      if (!data) return;
      const uid = Number(data.user_id);
      const isBot = !!data.is_bot;
      const gp = (this.gamePlayers || []).find(p => Number(p.user_id) === uid);
      if (gp) {
        gp.is_bot_controlled = isBot;
        gp.is_connected = !isBot;
      }

      // Cập nhật nhãn tên trên đầu nhân vật
      const opKey = Object.keys(this.otherPlayers || {}).find(
        k => Number(this.otherPlayers[k]?.user_id) === uid
      );
      if (opKey && this.otherPlayers[opKey]?.nameText) {
        const baseName = data.name || gp?.name || "Player";
        this.otherPlayers[opKey].nameText.setText(isBot ? `🤖 ${baseName}` : baseName);
      }

      this._refreshPlayerPanelsFromGameState();
      if (isBot) {
        this._showToast(`🤖 Bot AI đang chơi hộ ${data.name}`, "#66e0ff", 3500);
      } else {
        this._showToast(`✅ ${data.name} đã quay lại trận đấu!`, "#44ff88", 3000);
      }
    });

    // ── playerMoved ───────────────────────────────────────────────
    this.socket.on("playerMoved", (data) => {
      if (data.id === this.socket.id) return;

      // Tìm theo socket_id trước, fallback theo user_id (sau reconnect socket_id đổi)
      let other = this.otherPlayers[data.id];
      if (!other && data.user_id) {
        other = Object.values(this.otherPlayers).find(
          o => Number(o.user_id) === Number(data.user_id)
        );
        // Remap key sang socket_id mới
        if (other) {
          const oldKey = Object.keys(this.otherPlayers).find(
            k => Number(this.otherPlayers[k]?.user_id) === Number(data.user_id)
          );
          if (oldKey && oldKey !== data.id) {
            this.otherPlayers[data.id] = other;
            delete this.otherPlayers[oldKey];
          }
        }
      }
      if (!other) return;

      const startIndex  = other.index || 0;
      const targetIndex = data.index;
      const totalCells  = this.boardPath.length;

      // Nếu server báo đi lùi (send_enemy_back), animate ngược chiều
      if (data.direction === "backward") {
        const backSteps = data.steps || 2;
        let step = 0;
        const moveBack = () => {
          if (step >= backSteps) {
            other.index = targetIndex;
            const key = `${data.characterName||'Dark_Oracle'}_${data.skin||1}_idle`;
            if (this.anims.exists(key)) other.play(key);
            return;
          }
          const ni = ((startIndex - step - 1) + totalCells) % totalCells;
          const nc = this.boardPath[ni];
          const nx = nc.x * this.scale.width, ny = nc.y * this.scale.height;
          // Khi lùi, flip ngược lại hướng đang đứng
          if (nx > other.x) other.setFlipX(true);
          else if (nx < other.x) other.setFlipX(false);
          const rKey = `${data.characterName||'Dark_Oracle'}_${data.skin||1}_run_throw`;
          if (this.anims.exists(rKey)) other.play(rKey);
          this.tweens.add({
            targets: other, x: nx, y: ny, duration: 350, ease: "Sine.easeInOut",
            onUpdate: () => {
              if (other.shadow)    { other.shadow.x = other.x; other.shadow.y = other.y + 5; }
              if (other.nameText)  { other.nameText.x = other.x; other.nameText.y = other.y - 140 * this.minRatio; }
            },
            onComplete: () => { step++; moveBack(); }
          });
        };
        moveBack();
        return;
      }

      // Di chuyển tiến bình thường
      const steps = targetIndex >= startIndex
        ? targetIndex - startIndex
        : (totalCells - startIndex) + targetIndex;

      let step = 0;
      const moveNext = () => {
        if (step >= steps) {
          other.index = targetIndex;
          const key = `${data.characterName||'Dark_Oracle'}_${data.skin||1}_idle`;
          if (this.anims.exists(key)) other.play(key);
          return;
        }
        const ni = (startIndex + step + 1) % totalCells;
        const nc = this.boardPath[ni];
        const nx = nc.x * this.scale.width, ny = nc.y * this.scale.height;
        if (nx < other.x) other.setFlipX(true);
        else if (nx > other.x) other.setFlipX(false);
        const rKey = `${data.characterName||'Dark_Oracle'}_${data.skin||1}_run_throw`;
        if (this.anims.exists(rKey)) other.play(rKey);
        this.tweens.add({
          targets: other, x: nx, y: ny, duration: 350, ease: "Sine.easeInOut",
          onUpdate: () => {
            if (other.shadow) { other.shadow.x = other.x; other.shadow.y = other.y+5; }
            if (other.nameText) { other.nameText.x = other.x; other.nameText.y = other.y-140 * this.minRatio; }
          },
          onComplete: () => { step++; moveNext(); }
        });
      };
      moveNext();
    });

    // ── playerDisconnected ────────────────────────────────────────
    this.socket.on("playerDisconnected", (id) => {
      // id là socket_id cũ — tìm và xóa sprite tương ứng
      const target = this.otherPlayers[id];
      if (target) {
        target.shadow?.destroy();
        target.nameText?.destroy();
        target.destroy();
        delete this.otherPlayers[id];
      }
    });

    // ── playerRolled (legacy) ─────────────────────────────────────
    this.socket.on("playerRolled", (data) => {
      if (data.id === this.socket.id) return;
      const name = this.otherPlayers[data.id]?.nameText?.text || "Player khác";
      this.infoText.setText(`${name} đã roll được ${data.diceValue}`);
      this.infoText.setColor("#00ff00");
      this.time.delayedCall(2000, () => this._updateTurnInfo());
    });

    this.socket.on("game:build_prompt", (data) => {
      this._showBuildPanel(data);
    });
    
    this.socket.on("game:cell_built", (data) => {
      const lv = Math.max(1, Math.min(2, Number(data.level || 1)));
      const totalInv = Number(data.total_invested ?? data.build_cost ?? 0);

      // Cập nhật cellStates
      if (!this.cellStates) this.cellStates = {};
      this.cellStates[data.cell_index] = {
        owner_user_id: data.owner_user_id,
        planet_color: data.planet_color,
        build_cost: totalInv,
        total_invested: totalInv,
        level: lv,
      };
      
      // Cập nhật cash của player (trừ đi chi phí hành động này, và cộng cho chủ cũ nếu Thâu Tóm)
      if (this.gamePlayers) {
        const player = this.gamePlayers.find(p => p.user_id === data.owner_user_id);
        if (player) {
          player.cash = (player.cash || 0) - (data.build_cost || 0);
        }
        if (data.is_buyout && data.previous_owner_id) {
          const prevOwner = this.gamePlayers.find(p => Number(p.user_id) === Number(data.previous_owner_id));
          if (prevOwner) {
            prevOwner.cash = (prevOwner.cash || 0) + (data.build_cost || 0);
          }
        }
      }
      
      // Ẩn panel hỏi mua/nâng cấp/thâu tóm
      this._closeBuildPanel();
      
      const cell = this.boardPath[data.cell_index];
      if (cell && cell.type !== 'skill') {
        const hex = this._planetColorToHex(data.planet_color);
        this.paintCellGlowAnimated(cell, hex, lv);
        if (data.is_upgrade || data.is_buyout) {
          this._playCellLevelUpFX(cell, hex, lv);
        }
      }
      this._refreshAllCellComboBadges();

      const myUid = this._myUserId();
      const isMe = data.owner_user_id === myUid;
      let msg;
      let toastCol = isMe ? "#00ff88" : "#ffffff";
      if (data.is_buyout) {
        msg = isMe
          ? `🏴 Bạn đã thâu tóm ô ${data.cell_index} (Lv.${lv}) từ ${data.previous_owner_name || "đối thủ"}! (-${this._formatMoney(data.build_cost)})`
          : `🏴 ${data.owner_name} thâu tóm ô ${data.cell_index} (Lv.${lv})!`;
        toastCol = isMe ? "#d8b4fe" : "#facc15";
      } else if (data.is_upgrade) {
        msg = isMe
          ? `⬆️ Bạn đã nâng cấp ô ${data.cell_index} lên Cấp ${lv}! (-${this._formatMoney(data.build_cost)})`
          : `✨ ${data.owner_name} nâng cấp ô ${data.cell_index} lên Cấp ${lv}!`;
        toastCol = "#ffe066";
      } else {
        msg = isMe
          ? `✅ Bạn đã đặt tinh cầu ô ${data.cell_index}! (-${this._formatMoney(data.build_cost)})`
          : `🏗 ${data.owner_name} đặt tinh cầu ô ${data.cell_index}`;
      }
      this._showToast(msg, toastCol);
      if (isMe) {
        if (data.is_upgrade || data.is_buyout) playBoardIncreaseSound(this);
        else playBoardBuySound(this);
      }
      this._refreshPlayerPanelsFromGameState();
      this._updatePlayerStatsInUI();
    });
    
    this.socket.on("game:rent_paid", (data) => {
      // Cập nhật cash
      if (this.gamePlayers) {
        const payer = this.gamePlayers.find(p => p.user_id === data.payer_user_id);
        const owner = this.gamePlayers.find(p => p.user_id === data.owner_user_id);
        if (payer) payer.cash = (payer.cash || 0) - data.rent;
        if (owner) owner.cash = (owner.cash || 0) + data.rent;
      }

      const myUid = this._myUserId();

      // ── Lấy sprite của payer và owner ────────────────────────
      const payerSprite = this._getSpriteByUserId(data.payer_user_id);
      const ownerSprite = this._getSpriteByUserId(data.owner_user_id);

      // ── Hiệu ứng "bị đau" cho người trả tiền ─────────────────
      if (data.payer_user_id === myUid) {
        this._playHurtEffect(this.player);
      } else {
        if (payerSprite) this._playHurtEffect(payerSprite);
      }

      // ── Số tiền nổi lên trên đầu payer (đỏ, -) ───────────────
      if (payerSprite) {
        this._showFloatingMoney(
          payerSprite.x,
          payerSprite.y - payerSprite.displayHeight * 0.6,
          `-${this._formatMoney(data.rent)}`,
          "#ff3333"
        );
      }

      // ── Số tiền nổi lên trên đầu owner (xanh, +) ─────────────
      if (ownerSprite) {
        this._showFloatingMoney(
          ownerSprite.x,
          ownerSprite.y - ownerSprite.displayHeight * 0.6,
          `+${this._formatMoney(data.rent)}`,
          "#44ff88"
        );
      }

      // ── Bubble thông báo cho owner (giống "Đổ xúc xắc") ──────
      if (ownerSprite) {
        this._showRentMoneyBubble(ownerSprite, `+${this._formatMoney(data.rent)}`, "owner");
      }
      // ── Bubble thông báo cho payer ────────────────────────────
      if (payerSprite) {
        this._showRentMoneyBubble(payerSprite, `-${this._formatMoney(data.rent)}`, "payer");
      }

      // ── Hiệu ứng coin bay từ payer → panel owner ─────────────
      if (payerSprite) {
        const ownerPanel = this._getPlayerPanelPos(data.owner_user_id);
        if (ownerPanel) {
          this._playCoinsFlying(
            payerSprite.x, payerSprite.y,
            ownerPanel.x, ownerPanel.y
          );
        }
      }

      const cell = this.boardPath[data.cell_index];
      if (cell && data.owner_user_id === myUid) {
        const hex = this._planetColorToHex(data.planet_color);
        this.paintCellGlow(cell, hex, 0.8);
        this.time.delayedCall(500, () => this.paintCellGlow(cell, hex, 0.5));
      }

      const lvTag = Number(data.level || 1) >= 2 ? ` (Lv.${data.level})` : "";
      const comboTag = Number(data.combo_bonus || 0) > 0 ? ` 🔗+${data.combo_bonus}%` : "";
      if (data.payer_user_id === myUid) {
        playBoardCoinSound(this);
        this._showToast(`💸 Trả ${this._formatMoney(data.rent)} cho ${data.owner_name}${lvTag}${comboTag}`, "#ff8800");
      } else if (data.owner_user_id === myUid)
        this._showToast(`💰 Nhận ${this._formatMoney(data.rent)} từ ${data.payer_name}${lvTag}${comboTag}`, "#ffdd00");
      else
        this._showToast(`${data.payer_name} trả thuê ô ${data.cell_index}${lvTag}`, "#aaaaaa");

      this._refreshPlayerPanelsFromGameState();
      this._updatePlayerStatsInUI();
    });

    this.socket.on("game:rent_cannot_afford", (data) => {
      const myUid = this._myUserId();
      const isMe = data.payer_user_id === myUid;

      if (isMe) {
        this._startBankruptcyResolution(data);
      } else {
        this._showToast(`💸 ${data.payer_name} không đủ tiền trả thuê ô ${data.cell_index}!`, "#ff8800");
      }
    });

    // Đồng đội dẫm vào nhà nhau => miễn phí
    this.socket.on("game:teammate_cell", (data) => {
      const myUid = this._myUserId();
      const isMe  = data.user_id === myUid;
      const isMyCellOwned = data.owner_user_id === myUid;

      const moverSprite = this._getSpriteByUserId(data.user_id);
      if (moverSprite) {
        this._showFloatingMoney(
          moverSprite.x,
          moverSprite.y - moverSprite.displayHeight * 0.6,
          "🤝 Đồng đội",
          "#44ccff"
        );
      }

      if (isMe) {
        this._showToast(`🤝 Nhà đồng đội ${data.owner_name} — miễn thuê!`, "#44ccff");
      } else if (isMyCellOwned) {
        this._showToast(`🤝 Đồng đội ${data.name} qua nhà bạn — miễn thuê`, "#44ccff");
      } else {
        this._showToast(`🤝 ${data.name} qua nhà đồng đội — miễn thuê`, "#aaaaaa");
      }
    });

    this.socket.on("game:skill_event", (data) => {
      const isMe = data.user_id === this._myUserId();

      // Hiệu ứng vòng tròn ánh sáng & hạt sao khi bốc trúng ô Cơ Hội (Ô 9) / Thầy Giáo (Ô 18)
      const chanceTypes = new Set([
        "move_plus_1", "move_plus_2", "move_plus_3", "extra_roll", "free_rent",
        "bonus_money", "steal_money", "buff_random_cell", "walk_to_cell",
        "teleport_safe_cell", "downgrade_enemy_cell", "send_enemy_back", "swap_positions"
      ]);
      if (chanceTypes.has(data?.type)) {
        this._playChanceCellFX(data.user_id, data.type);
      }

      // ================== MOVE STEPS ==================
      if (data.type === "move_plus_1" || data.type === "move_plus_2" || data.type === "move_plus_3") {
        let steps = 1;
        if (data.type === "move_plus_2") steps = 2;
        if (data.type === "move_plus_3") steps = 3;
        this._showSkillPanel({
          title: "KHÍCH BÍCH",
          text: `${data.name} nhận: tiến thêm ${steps} ô!`,
          icon: "orb_blue"
        });
        if (isMe) {
          this.time.delayedCall(900, () => {
            this._movePlayerSteps(steps, () => {
              this.socket.emit("game:move_done", {
                room_id: this.gameRoomId,
                cell_index: this.currentIndex
              });
            }); 
          });
        }
        return;
      }

      // ================== EXTRA ROLL ==================
      if (data.type === "extra_roll") {
        this._showSkillPanel({
          title: "SAO MAY MẮN",
          text: `${data.name} được thêm 1 lượt tung!`,
          icon: "orb_orange"
        });
        if (isMe) {
          this.canRoll = true;
          this.isMyTurn = true;
          this._applyTurnState();
          this._updateTurnInfo();
        }
        return;
      }

      // ================== FREE RENT ==================
      if (data.type === "free_rent") {
        this._showSkillPanel({
          title: "MIỄN THUÊ",
          text: `${data.name} được miễn trả thuê 1 lượt!`,
          icon: "orb_purple"
        });
        if (isMe) {
          this._showToast("✨ Bạn có 1 lượt miễn thuê!", "#ffaa88", 3000);
          // Có thể lưu số lượt miễn thuê vào biến this.freeRentTurns và hiển thị trên UI nếu muốn
        }
        return;
      }

      // ================== BONUS MONEY ==================
      if (data.type === "bonus_money") {
        this._showSkillPanel({
          title: "TIỀN THƯỞNG",
          text: `${data.name} nhận ${this._formatMoney(data.amount)} Ecoin!`,
          icon: "orb_orange"
        });
        if (isMe) {
          const myPlayer = this.gamePlayers?.find(p => p.user_id === this._myUserId());
          if (myPlayer) {
            myPlayer.cash = (myPlayer.cash || 0) + data.amount;
            this._updatePlayerStatsInUI();
          }
        }
        return;
      }

      // ================== BUFF RANDOM CELL ==================
      if (data.type === "buff_random_cell") {
        const upLv = Number(data.new_level || 1);
        const buffedToNewLv = data.old_level && upLv > Number(data.old_level);
        this._showSkillPanel({
          title: buffedToNewLv ? `THĂNG CẤP LV.${upLv}` : "CƯỜNG HÓA",
          text: buffedToNewLv
            ? `${data.name} thăng cấp miễn phí ô ${data.cell_index} lên Lv.${upLv}!`
            : `${data.name} tăng giá trị ô ${data.cell_index}!`,
          icon: upLv >= 2 ? "orb_blue2" : "orb_blue"
        });
        if (this.cellStates && data.cell_index !== undefined && (data.new_cost || data.total_invested)) {
          const cellState = this.cellStates[data.cell_index];
          if (cellState) {
            cellState.build_cost = data.total_invested || data.new_cost;
            cellState.total_invested = data.total_invested || data.new_cost;
            if (data.new_level) cellState.level = Number(data.new_level);
            const cell = this.boardPath[data.cell_index];
            if (cell && cell.type !== 'skill') {
              const hex = this._planetColorToHex(cellState.planet_color);
              this.paintCellGlowAnimated(cell, hex, cellState.level || 1);
              if (buffedToNewLv) this._playCellLevelUpFX(cell, hex, cellState.level || 1);
              this._showToast(
                buffedToNewLv ? `✨ Ô ${data.cell_index} được thăng lên Cấp ${cellState.level}!` : `✨ Ô ${data.cell_index} đã được cường hóa!`,
                "#ffdd44", 2200
              );
            }
            this._updatePlayerStatsInUI();
          }
        }
        return;
      }

      // ================== WALK TO CELL (go_to_teacher / go_to_monster) ==================
      if (data.type === "walk_to_cell") {
        this._showSkillPanel({
          title: data.dest_index === 18 ? "ĐI TỚI THẦY GIÁO" : "ĐI TỚI QUÁI VẬT",
          text: `${data.name} di chuyển tới ô ${data.dest_index}!`,
          icon: data.dest_index === 18 ? "orb_blue" : "orb_red"
        });
        if (isMe && data.steps > 0) {
          // Nhân vật của mình đi bộ từng bước
          this._movePlayerSteps(data.steps, () => {
            this.socket.emit("game:move_done", {
              room_id: this.gameRoomId,
              cell_index: this.currentIndex
            });
          });
        } else if (!isMe && data.steps > 0) {
          // Nhân vật người khác — animate qua otherPlayers
          const otherEntry = Object.entries(this.otherPlayers || {})
            .find(([, op]) => op?._userId === data.user_id || op?.userId === data.user_id);
          if (otherEntry) {
            const [, otherSprite] = otherEntry;
            this._moveOtherPlayerSteps(otherSprite, data.steps, data.dest_index, data.name);
          }
        }
        return;
      }

      // ================== MONSTER NO TARGET ==================
      if (data.type === "monster_no_target") {
        this._showSkillPanel({
          title: "QUÁI VẬT",
          text: `${data.name} vào ô 28 nhưng chưa có tinh cầu nào để phá!`,
          icon: "orb_red"
        });
        return;
      }

      // ================== TELEPORT SAFE CELL ==================
      if (data.type === "teleport_safe_cell") {
        this._showSkillPanel({
          title: "DỊCH CHUYỂN",
          text: `${data.name} được dịch chuyển đến ô ${data.dest_index}!`,
          icon: "orb_blue"
        });
        if (isMe && data.dest_index !== undefined) {
          this.currentIndex = data.dest_index;
          const cell = this.boardPath[data.dest_index];
          const x = cell.x * this.scale.width;
          const y = cell.y * this.scale.height;
          this.player.setPosition(x, y);
          this.shadow.setPosition(x, y + 5);
          this.playerNameText.setPosition(x, y - 140 * this.minRatio);
          this.onPlayerStop();
          this.socket.emit("game:move_done", {
            room_id: this.gameRoomId,
            cell_index: this.currentIndex
          });
        }
        return;
      }

      // ================== DOWNGRADE ENEMY CELL ==================
      if (data.type === "downgrade_enemy_cell") {
        const droppedLv = data.old_level && data.new_level && Number(data.new_level) < Number(data.old_level);
        this._showSkillPanel({
          title: "GIÁNG CẤP",
          text: droppedLv
            ? `${data.name} giáng cấp ô ${data.cell_index} của ${data.target_name} xuống Lv.${data.new_level}!`
            : `${data.name} giảm giá trị ô ${data.cell_index} của ${data.target_name}!`,
          icon: "orb_red"
        });
        if (this.cellStates && data.cell_index !== undefined && (data.new_cost || data.total_invested)) {
          const cellState = this.cellStates[data.cell_index];
          if (cellState) {
            cellState.build_cost = data.total_invested || data.new_cost;
            cellState.total_invested = data.total_invested || data.new_cost;
            if (data.new_level) cellState.level = Number(data.new_level);
            const cell = this.boardPath[data.cell_index];
            if (cell && cell.type !== 'skill') {
              const hex = this._planetColorToHex(cellState.planet_color);
              this.paintCellGlowAnimated(cell, hex, cellState.level || 1);
              this._showToast(
                droppedLv
                  ? `⚠️ Ô ${data.cell_index} của ${data.target_name} bị giáng xuống Cấp ${cellState.level}!`
                  : `⚠️ Ô ${data.cell_index} của ${data.target_name} bị giảm giá trị!`,
                "#ff8866", 2200
              );
            }
            this._updatePlayerStatsInUI();
          }
        }
        return;
      }

      // ================== SEND ENEMY BACK ==================
      if (data.type === "send_enemy_back") {
        this._showSkillPanel({
          title: "ĐẨY LÙI",
          text: `${data.name} đẩy ${data.target_name} lùi 2 ô!`,
          icon: "orb_red"
        });

        // Nếu là mình bị đẩy → animate lùi 2 ô
        if (data.target_user_id === this._myUserId()) {
          this._showToast(`🌀 Bạn bị đẩy lùi 2 ô bởi ${data.name}!`, "#ff8888", 2000);
          const backSteps = 2;
          const totalCells = this.boardPath.length;
          const startIdx = this.currentIndex;
          let step = 0;
          const moveBack = () => {
            if (step >= backSteps) {
              this.currentIndex = data.dest_index;
              this.onPlayerStop();
              return;
            }
            const ni = ((startIdx - step - 1) + totalCells) % totalCells;
            const nc = this.boardPath[ni];
            const nx = nc.x * this.scale.width;
            const ny = nc.y * this.scale.height;
            if (nx > this.player.x) this.player.setFlipX(true);
            else if (nx < this.player.x) this.player.setFlipX(false);
            this.tweens.add({
              targets: this.player, x: nx, y: ny, duration: 350, ease: "Sine.easeInOut",
              onUpdate: () => {
                if (this.shadow)         { this.shadow.x = this.player.x; this.shadow.y = this.player.y + 5; }
                if (this.playerNameText) { this.playerNameText.x = this.player.x; this.playerNameText.y = this.player.y - 140 * this.minRatio; }
              },
              onComplete: () => { step++; moveBack(); }
            });
          };
          moveBack();
        }
        return;
      }

      // ================== DESTROY RANDOM ==================
      if (data.type === "destroy_random") {
        this._startDarkMapEffect();
        // Hiệu ứng phá hủy được xử lý riêng qua sự kiện game:cell_destroyed
        return;
      }

      // ================== SWAP PLANET ==================
      if (data.type === "swap_planet") {
        this._showSkillPanel({
          title: "HOÁN ĐỔI",
          text: `${data.name} hoán đổi quyền sở hữu 2 tinh cầu!`,
          icon: "orb_purple"
        });
        this._playTarotSwapFX(data.my_cell_index, data.enemy_cell_index);
        return;
      }

      // ================== TAX MULTIPLIER (Tài Phiệt) ==================
      if (data.type === "tax_multiplier") {
        this._showSkillPanel({
          title: "TÀI PHIỆT",
          text: `${data.name} tăng hệ số thu thuế các tinh cầu!`,
          icon: "orb_orange"
        });
        (data.cells || []).forEach((c, idx) => {
          if (this.cellStates?.[c.index]) {
            this.cellStates[c.index].tax_multiplier        = c.multiplier;
            this.cellStates[c.index].tax_multiplier_active = true;
          }
          const cell = this.boardPath[c.index];
          if (cell && cell.type !== 'skill') {
            this.time.delayedCall(220 + idx * 180, () => {
              this._waterBallDrop(cell, c.multiplier);
              this._playCoinShowerAt(cell.x * this.scale.width, cell.y * this.scale.height, 8);
            });
          }
        });
        return;
      }

      // ================== STEAL CASH (Nhận Trợ Giúp) ==================
      if (data.type === "steal_cash_percent_pending" || data.type === "steal_cash_percent_done") {
        this._showSkillPanel({
          title: "NHẬN TRỢ GIÚP",
          text: `${data.name} lấy ${data.percent}% tiền mặt đối thủ! (+${this._formatMoney(data.total)})`,
          icon: "orb_orange"
        });
        return;
      }

      // ================== SKIP TURN ENEMY (Công An) ==================
      if (data.type === "skip_turn_enemy") {
        this._showSkillPanel({
          title: "CÔNG AN",
          text: `${data.name} khiến ${data.target_name} mất lượt kế tiếp!`,
          icon: "orb_red"
        });
        this._playTarotPoliceFX(data.target_user_id);
        if (Number(data.target_user_id) === Number(this._myUserId())) {
          this._showToast(`🚔 Bạn bị ${data.name} khóa lượt kế tiếp!`, "#ff6666", 3000);
        }
        return;
      }

      // ================== RECOVER HOUSE MONEY (Thần Giữ Của) ==================
      if (data.type === "recover_house_money") {
        this._showSkillPanel({
          title: "THẦN GIỮ CỦA",
          text: `${data.name} kích hoạt khiên hoàn tiền thuê lượt này!`,
          icon: "orb_blue"
        });
        this._playTarotShieldAuraFX(data.user_id, 0x44ffcc, "🛡 HOÀN THUẾ");
        if (isMe) this._showToast("🛡 Bạn được hoàn 100% tiền thuê nếu dẫm vào nhà đối thủ!", "#88ffcc", 3000);
        return;
      }

      // ================== RENT REFUNDED ==================
      if (data.type === "rent_refunded") {
        this._showSkillPanel({
          title: "HOÀN TIỀN THUÊ",
          text: `${data.name} được hoàn lại ${this._formatMoney(data.amount)} tiền thuê!`,
          icon: "orb_blue"
        });
        const pos = this._getPlayerPosByUid(data.user_id);
        if (pos) {
          this._playCoinShowerAt(pos.x, pos.y, 14);
          this._playFloatingBadge(pos.x, pos.y - 60 * this.minRatio, `+${this._formatMoney(data.amount)}`, "#88ffcc");
        }
        if (isMe) this._showToast(`🛡 Hoàn lại ${this._formatMoney(data.amount)} tiền thuê!`, "#88ffcc", 2500);
        return;
      }

      // ================== MOVE FORWARD PENDING (Nhanh Chân) ==================
      if (data.type === "move_forward_range_pending") {
        this._showSkillPanel({
          title: "NHANH CHÂN",
          text: `${data.name} tăng tốc — sẽ tiến thêm ${data.min}–${data.max} ô sau khi đi!`,
          icon: "orb_blue"
        });
        this._playTarotSpeedAuraFX(data.user_id);
        return;
      }

      // ================== MOVE FORWARD RANGE (Nhanh Chân — thực thi) ==================
      if (data.type === "move_forward_range") {
        this._showSkillPanel({
          title: "NHANH CHÂN",
          text: `${data.name} lướt tiến thêm ${data.steps} ô!`,
          icon: "orb_blue"
        });
        this._playTarotSpeedAuraFX(data.user_id);
        if (isMe && data.steps > 0) {
          this.time.delayedCall(600, () => {
            this._movePlayerSteps(data.steps, () => {
              this.socket.emit("game:move_done", {
                room_id: this.gameRoomId,
                cell_index: this.currentIndex
              });
            });
          });
        } else if (!isMe && data.steps > 0) {
          const otherEntry = Object.entries(this.otherPlayers || {})
            .find(([, op]) => Number(op?.user_id) === Number(data.user_id));
          if (otherEntry) {
            const [, otherSprite] = otherEntry;
            this._moveOtherPlayerSteps(otherSprite, data.steps, data.dest_index, data.name);
          }
        }
        return;
      }

      // ================== EXTRA ROLL TAROT (Xúc Xắc Ma Thuật) ==================
      if (data.type === "extra_roll" && data.source === "tarot") {
        this._showSkillPanel({
          title: "XÚC XẮC MA THUẬT",
          text: `${data.name} nhận thêm 1 lượt tung xúc xắc!`,
          icon: "orb_orange"
        });
        this._playTarotExtraRollFX(data.user_id);
        return;
      }

      // ================== DESTROY ENEMY HOUSE (Giải Tỏa) ==================
      if (data.type === "destroy_enemy_house") {
        this._showSkillPanel({
          title: "GIẢI TỎA",
          text: `${data.name} phá hủy tinh cầu ở ô #${Number(data.target_cell) + 1}!`,
          icon: "orb_red"
        });
        this._playTarotDestroyCellFX(data.target_cell);
        return;
      }

      // ================== BONUS STARTING CASH (Tài Phú) ==================
      if (data.type === "bonus_starting_cash_percent") {
        this._showSkillPanel({
          title: "TÀI PHÚ",
          text: `${data.name} nhận trợ cấp +${this._formatMoney(data.bonus)} (${data.percent}% vốn)!`,
          icon: "orb_orange"
        });
        const pos = this._getPlayerPosByUid(data.user_id);
        if (pos) {
          this._playCoinShowerAt(pos.x, pos.y, 18);
          this._playFloatingBadge(pos.x, pos.y - 65 * this.minRatio, `+${this._formatMoney(data.bonus)}`, "#ffe066");
        }
        return;
      }

      // ================== PROTECT PLANET TURNS (Bảo Vệ) ==================
      if (data.type === "protect_planet_turns") {
        this._showSkillPanel({
          title: "BẢO VỆ",
          text: `${data.name} bọc khiên bảo vệ ô #${Number(data.cell_index) + 1} trong ${data.turns} lượt!`,
          icon: "orb_blue"
        });
        this._playTarotProtectCellFX(data.cell_index, data.turns);
        return;
      }
    });

  this.socket.on("game:tax_boost", (data) => {
    if (!data.boosts || data.boosts.length === 0) return;
    playBoardIncreaseSound(this);
    if (!this._taxBadges) this._taxBadges = {};

    const seenBoost = new Set();
    let idxOrder = 0;
    data.boosts.forEach(b => {
      const ci = Number(b.cell_index);
      if (seenBoost.has(ci)) return;
      seenBoost.add(ci);
      // Cập nhật cellStates
      if (this.cellStates?.[ci]) {
        this.cellStates[ci].rent_multiplier = b.multiplier;
      }
      // Hiệu ứng lần lượt
      const targetCell = this.boardPath[ci];
      if (!targetCell) return;
      const delayMs = idxOrder * 700;
      idxOrder++;
      this.time.delayedCall(delayMs, () => {
        this._waterBallDrop(targetCell, b.multiplier);
      });
    });
  });

  this.socket.on("game:tax_reset", (data) => {
    if (!data.cell_indexes) return;
    data.cell_indexes.forEach(ci => {
      if (this.cellStates?.[ci]) this.cellStates[ci].rent_multiplier = 1;
      // Xóa badge
      if (this._taxBadges?.[ci]) {
        this._taxBadges[ci].forEach(o => { try { o?.destroy(); } catch(e){} });
        delete this._taxBadges[ci];
      }
    });
    if (data.cell_indexes.length > 0) {
      this._showToast(`🔄 Thuế ${data.cell_indexes.length} ô đã reset về bình thường`, "#88ccff", 2500);
    }
  });

  this.socket.on("game:monster_target", (data) => {
    const rawDetails = data.target_details || (data.cell_indexes || []).map(i => ({ cell_index: i, had_planet: true }));
    const uniq = new Map();
    rawDetails.forEach(d => {
      const ci = Number(d?.cell_index);
      if (Number.isInteger(ci) && !uniq.has(ci)) uniq.set(ci, d);
    });
    const details = Array.from(uniq.values()).slice(0, 3);
    if (!details || details.length === 0) return;

    const sig = details.map(d => d.cell_index).join(",");
    const now = Date.now();
    if (this._lastMonsterSig === sig && (now - (this._lastMonsterAt || 0)) < 4000) return;
    this._lastMonsterSig = sig;
    this._lastMonsterAt = now;

    const sourceCell = this.boardPath[28];
    this._startDarkMapEffect();

    if (this.bloody) {
      this._setHunter28Mode(true);
      this.bloody.play("Hunter_Greeting_2");
    }

    details.forEach((detail, i) => {
      const targetCell = this.boardPath[detail.cell_index];
      if (!targetCell || !sourceCell) return;
      const isLast = (i === details.length - 1);

      this.time.delayedCall(800 + i * 600, () => {
        this._highlightTargetCell(targetCell);
        this.time.delayedCall(400, () => {
          this._fireArrowFromAbove(sourceCell, targetCell, isLast);
        });
      });
    });
    // State được cập nhật khi nhận game:cell_destroyed
  });

  this.socket.on("game:cell_destroyed", (data) => {
    const cell = this.boardPath[data.cell_index];
    if (!cell) return;

    if (data.had_planet && data.downgraded && Number(data.new_level || 0) >= 1) {
      if (this.cellStates?.[data.cell_index]) {
        this.cellStates[data.cell_index].level = Number(data.new_level);
        if (data.total_invested) {
          this.cellStates[data.cell_index].total_invested = data.total_invested;
          this.cellStates[data.cell_index].build_cost = data.total_invested;
        }
      }
      const color = data.planet_color || this.cellStates?.[data.cell_index]?.planet_color;
      const hex = this._planetColorToHex(color);
      this.paintCellGlowAnimated(cell, hex, Number(data.new_level));
      this._showToast(`🛡️ Ô ${data.cell_index} đỡ đòn Quái Vật, giáng xuống Cấp ${data.new_level}!`, "#ffaa44");
    } else if (data.had_planet) {
      this.clearCell(cell);
      if (this.cellStates) delete this.cellStates[data.cell_index];
      this._showToast(`☄ Ô ${data.cell_index} bị phá hủy!`, "#ff4444");
    } else {
      // Ô trống — hiệu ứng nổ lửa đã chạy khi mũi tên chạm đất trong _fireArrowFromAbove
      this._showToast(`💨 Ô ${data.cell_index} trúng đạn nhưng trống`, "#aaaaaa");
    }

    this._refreshAllCellComboBadges();
    this._stopDarkMapEffect();
    this._setHunter28Mode(false);
    this._refreshPlayerPanelsFromGameState();
    this._updatePlayerStatsInUI();
  });

  this.socket.on("game:cell_sold", (data) => {
    // Xóa visual từng ô bị bán (broadcast từ server)
    (data.cell_indexes || [data.cell_index]).forEach(ci => {
      if (ci === undefined || ci === null) return;
      const cell = this.boardPath[ci];
      if (cell) this.clearCell(cell);
      if (this.cellStates) delete this.cellStates[ci];
    });
    this._refreshAllCellComboBadges();

    // Cập nhật cash trong gamePlayers
    if (this.gamePlayers) {
      const seller = this.gamePlayers.find(p => p.user_id === data.seller_user_id);
      const buyer  = this.gamePlayers.find(p => p.user_id === data.buyer_user_id);
      if (seller && data.seller_cash_after !== undefined) seller.cash = data.seller_cash_after;
      if (buyer  && data.buyer_cash_after  !== undefined) buyer.cash  = data.buyer_cash_after;
    }

    this._refreshPlayerPanelsFromGameState();
    this._updatePlayerStatsInUI();

    const myUid = this._myUserId();
    if (data.seller_user_id === myUid) {
      this._showToast(`💰 Bán tinh cầu & trả nợ thành công! Còn lại: ${this._formatMoney(data.seller_cash_after)}`, "#00ff88");
    } else if (data.buyer_user_id === myUid) {
      this._showToast(`💵 Nhận ${this._formatMoney(data.rent_paid)} tiền thuê từ ${data.seller_name}`, "#ffdd00");
    } else {
      this._showToast(`🏠 ${data.seller_name} bán tinh cầu trả nợ`, "#aaaaaa");
    }
  });

  this.socket.on("game:bankruptcy", (data) => {
    const myUid = this._myUserId();
    const bankruptPlayer = this.gamePlayers?.find(p => p.user_id === data.user_id);
    if (!bankruptPlayer) return;

    if (data.user_id === myUid) {
      // Phá sản = kết thúc ván của mình — xóa session reconnect
      try { localStorage.removeItem("activeGame"); } catch(e) {}
      this._intentionalExit = true;
      this._showBankruptcyLoseScreen(bankruptPlayer.name);
    } else {
      this._showOtherPlayerBankrupt(bankruptPlayer.name);
    }

    this.gamePlayers = this.gamePlayers.filter(p => p.user_id !== data.user_id);
    this._refreshPlayerPanelsFromGameState();
  });

  // ── game:player_surrendered — đầu hàng chủ động ─────────────────
  this.socket.on("game:player_surrendered", (data) => {
    const myUid = this._myUserId();

    // Xóa nhà của người đầu hàng khỏi bản đồ
    if (this.cellStates) {
      Object.keys(this.cellStates).forEach(ci => {
        if (Number(this.cellStates[ci]?.owner_user_id) === Number(data.user_id)) {
          // Xóa visual orb
          const cell = this.boardPath[Number(ci)];
          if (cell) {
            if (this._orbSprites?.[ci]) {
              this._orbSprites[ci].forEach?.(o => { try { o?.destroy(); } catch(e){} });
              delete this._orbSprites[ci];
            }
            this.paintCellGlowAnimated(cell, 0x444444);
          }
          delete this.cellStates[ci];
        }
      });
    }

    // Ẩn sprite nhân vật của người đầu hàng
    const op = Object.values(this.otherPlayers).find(
      o => Number(o.user_id) === Number(data.user_id)
    );
    if (op) {
      op.setVisible(false);
      op.shadow?.setVisible(false);
      op.nameText?.setVisible(false);
    }

    // Xóa khỏi danh sách player
    this.gamePlayers = (this.gamePlayers || []).filter(
      p => Number(p.user_id) !== Number(data.user_id)
    );
    this._refreshPlayerPanelsFromGameState();

    if (Number(data.user_id) === Number(myUid)) {
      // Mình đầu hàng
      try { localStorage.removeItem("activeGame"); } catch(e) {}
      this._intentionalExit = true;
      if (data.is_team) {
        this._showToast("🏳️ Bạn đã đầu hàng! Đồng đội tiếp tục chiến đấu...", "#ffaa44", 4000);
        // Chuyển sang màn hình chờ spectator nhẹ
        this.time.delayedCall(3000, () => this._showSurrenderWaitScreen());
      } else {
        this._showSurrenderLoseScreen(data.name);
      }
    } else {
      // Người khác đầu hàng
      const teamNote = data.is_team ? " (đồng đội vẫn tiếp tục)" : "";
      this._showToast(`🏳️ ${data.name} đã đầu hàng!${teamNote}`, "#ffaa44", 3500);
    }
  });

  this.socket.on("game:game_over", (data) => {
    const myUid = this._myUserId();
    // Xóa session reconnect — ván đã kết thúc
    try { localStorage.removeItem("activeGame"); } catch(e) {}
    this._intentionalExit = true;

    // Cập nhật ecoin mới vào localStorage ngay
    if (data.ecoins_after && myUid && data.ecoins_after[myUid] !== undefined) {
      try {
        const pd = JSON.parse(localStorage.getItem("playerData") || "null");
        if (pd?.user) {
          pd.user.ecoin = data.ecoins_after[myUid];
          localStorage.setItem("playerData", JSON.stringify(pd));
        }
      } catch(e) {}
    }

    // Team mode: Check if my team won
    const isTeam = data.is_team || false;
    const winnerIds = data.winner_ids || [data.winner_user_id];
    const isWinner = winnerIds.includes(myUid);

    this.time.delayedCall(isWinner ? 0 : 1200, () => {
      this._showGameOverScreen(isWinner, data, isTeam, winnerIds);
    });
  });

  this.socket.on("game:quiz_prompt", (data) => {
      this.mustAnswerNext = true;
      if (this.isMyTurn) {
        this.canRoll = false;
        this.powerDice?.hide();
        if (this.diceSprite) this.diceSprite.setVisible(false);
        if (this.diceShadow) this.diceShadow.setVisible(false);
        if (this.diceSprite2) this.diceSprite2.setVisible(false);
        if (this.diceShadow2) this.diceShadow2.setVisible(false);
      }
      this._showQuizPanel(data.question);
      this._applyTurnState();
      this._updateTurnInfo();
  });

  this.socket.on("game:quiz_result", (data) => {
    if (data.correct) {
      playBoardAnswerSound(this);
      this._showToast(`✅ Trả lời đúng! +${this._formatMoney(data.reward)}`, "#66ff99");
      if (data.user_id === this._myUserId() && this.gamePlayers) {
        const me = this.gamePlayers.find(p => p.user_id === this._myUserId());
        if (me && data.reward) {
          me.cash = (me.cash || 0) + data.reward;
          this._refreshPlayerPanelsFromGameState();
          this._updatePlayerStatsInUI();
        }
      }
    } else {
      if (data.user_id === this._myUserId()) playBoardErrSound(this);
      if (data.locked_out) {
        this._showToast("❌ Sai 2 lần — bị trả về ô xuất phát!", "#ff4444");
      } else {
        this._showToast("❌ Trả lời sai — lượt sau phải trả lời tiếp!", "#ff6666");
      }
      if (data.user_id === this._myUserId()) {
        if (!data.locked_out) {
          this.mustAnswerNext = true;
        }
        this.canRoll = false;
      }
    }
  });

  this.socket.on("game:start_bonus", (data) => {
    // Cập nhật cash trong gamePlayers trước khi refresh UI
    if (this.gamePlayers) {
      const player = this.gamePlayers.find(p => p.user_id === data.user_id);
      if (player) {
        player.cash = (player.cash || 0) + data.bonus;
      }
    }
    this._showToast(`💰 ${data.name} nhận ${this._formatMoney(data.bonus)} khi qua/về START`, "#00ccff");
    // Chỉ phát âm thanh cho chính người chơi đi qua START
    if (data.user_id === this._myUserId()) {
      playBoardStartSound(this);
      this._refreshPlayerPanelsFromGameState();
      this._updatePlayerStatsInUI();
    } else {
      this._refreshPlayerPanelsFromGameState();
    }
  });

  this.socket.on("game:player_teleported", (data) => {
    if (data.user_id === this._myUserId()) {
      this._showToast("🚨 Bạn bị trả về ô xuất phát do trả lời sai 2 lần liên tiếp", "#ff5555");
      this.resetPlayer();
    } else {
      this._showToast(`🌀 ${data.name} bị trả về START`, "#ff9999");
    }
  });

this.socket.on("game:tarot_state", (data) => {
  if (data.server_now_ms) {
    this.serverClockOffsetMs = Number(data.server_now_ms) - Date.now();
  }

  const userId = Number(data.user_id);
  if (!userId) return;

  this.tarotStateByUserId[userId] = {
    tarot_runtime: data.tarot_runtime || {},
    cooldown_seconds_left: data.cooldown_seconds_left || [],
    used_tarot_this_turn: !!data.used_tarot_this_turn
  };

  if (Array.isArray(data.tarot_cards)) {
    this.tarotCardsByUserId[userId] = data.tarot_cards;
  }

  if (Array.isArray(data.active_tarot_ids)) {
    const gp = this.gamePlayers?.find(p => Number(p.user_id) === userId);
    if (gp) gp.active_tarot_ids = [...data.active_tarot_ids];

    this.updatePlayerTarotSlotsByUserId(userId, data.active_tarot_ids);
  }

  this._refreshPlayerTarotCooldownByUserId(userId);

  // Cập nhật trạng thái nút THẺ BÀI nếu là của mình
  if (Number(userId) === Number(this._myUserId())) {
    this.tarotBtn?.updateCooldownState();
  }
});


  this.socket.on("game:tarot_used", (data) => {
    const myUid = this._myUserId();
    const isMe  = data.user_id === myUid;
 
    const msg = isMe
      ? `🃏 Bạn đã dùng thẻ: ${data.tarot_name || data.tarot_id}`
      : `🃏 ${data.name || "Người chơi"} đã dùng thẻ: ${data.tarot_name || ''}`;
 
    this._showToast(msg, isMe ? "#ffe066" : "#ffffff", 2000);
 
    // Cập nhật used_tarot_this_turn trong state local
    const uid = Number(data.user_id);
    if (this.tarotStateByUserId[uid]) {
      this.tarotStateByUserId[uid].used_tarot_this_turn = true;
    }
 
    // Đóng modal nếu đang mở
    this.tarotModal?.close();

    // Cập nhật trạng thái nút THẺ BÀI
    if (isMe) {
      this.tarotBtn?.updateCooldownState();
      this.charSkillWidget?.refresh();
    }
 
    // Hiệu ứng kích hoạt thẻ toàn màn hình (chỉ với người dùng)
    if (isMe) {
      this._playTarotActivationEffect(data.tarot_name);
    }
  });

this.socket.on("game:tarot_denied", (data) => {
    this._showToast(`⚠️ ${data.message || "Không thể dùng thẻ"}`, "#ff6666", 2000);
    this.tarotModal?.close();
  });

  // ── Character Skill Events ──
  this.socket.on("game:char_skill_state", (data) => {
    this.charSkillWidget?.syncState(data);
  });
  this.socket.on("game:char_skill_used", (data) => {
    this.charSkillWidget?.playSkillFX(data);
  });
  this.socket.on("game:char_skill_denied", (data) => {
    this._showToast(`⚠️ ${data.message || "Không thể dùng kỹ năng"}`, "#ff6666", 2000);
  });
  this.socket.on("game:char_passive_triggered", (data) => {
    if (data?.message) this._showToast(data.message, "#88ffcc", 2400);
    if (data?.user_id) this.charSkillWidget?.playImpactOnUser?.(data.user_id, "water");
  });
  this.socket.on("game:char_skill_fx", (data) => {
    if (data?.message) this._showToast(data.message, "#ffaa55", 2400);
    if (data?.cell_index !== undefined && data?.cell_index !== null) {
      this.charSkillWidget?.playImpactOnCell?.(data.cell_index, "flame");
    } else if (data?.target_user_id) {
      this.charSkillWidget?.playImpactOnUser?.(data.target_user_id, "flame");
    }
  });

  // ── game:state_sync — đồng bộ toàn bộ state (cellStates, players) ──
  this.socket.on("game:state_sync", (data) => {
    if (!data) return;

    if (data.cellStates) {
      console.log('[state_sync] cellStates nhận được:', JSON.stringify(data.cellStates));
      console.log('[state_sync] cellStates cũ:', JSON.stringify(this.cellStates));
      this.cellStates = data.cellStates;
      this._renderAllCells(this.cellStates);
      console.log('[state_sync] _renderAllCells xong');
    } else {
      console.warn('[state_sync] KHÔNG có cellStates trong data!');
    }

    if (Array.isArray(data.players)) {
      data.players.forEach(sp => {
        const gp = (this.gamePlayers || []).find(p => Number(p.user_id) === Number(sp.user_id));
        if (gp) {
          if (sp.cash !== undefined) gp.cash = sp.cash;
          if (sp.skip_next_turn !== undefined) gp.skip_next_turn = sp.skip_next_turn;
          if (sp.is_bot_controlled !== undefined) gp.is_bot_controlled = !!sp.is_bot_controlled;
          if (sp.is_connected !== undefined) gp.is_connected = sp.is_connected !== false;
        }
      });
      this._refreshPlayerPanelsFromGameState();
      this._updatePlayerStatsInUI();
    }
  });

  this.socket.on("game:tarot_state", (data) => {
    if (data.server_now_ms) {
      this.serverClockOffsetMs = Number(data.server_now_ms) - Date.now();
    }
    const userId = Number(data.user_id);
    if (!userId) return;

    this.tarotStateByUserId[userId] = {
      tarot_runtime:        data.tarot_runtime || {},
      cooldown_seconds_left: data.cooldown_seconds_left || [],
      used_tarot_this_turn: !!data.used_tarot_this_turn
    };
    if (Array.isArray(data.tarot_cards)) {
      this.tarotCardsByUserId[userId] = data.tarot_cards;
    }
    if (Array.isArray(data.active_tarot_ids)) {
      this.updatePlayerTarotSlotsByUserId(userId, data.active_tarot_ids);
    }
    this._refreshPlayerTarotCooldownByUserId(userId);

    // Sync cooldown_turns_left vào CardSystem
    this.cardSystem?.syncFromServer(userId, data.active_tarot_ids || [], data.tarot_runtime || {});
    this._refreshPlayerTarotCooldownByUserId(userId);
  });

  }

  _playTarotActivationEffect(cardName) {
    const { width, height } = this.scale;
    const S = this.minRatio || 1;
    const D = 700;

    // Flash vàng full màn hình (setAlpha(0) thay vì fillAlpha=0 để visible thật)
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffcc44, 0.35)
      .setDepth(D).setAlpha(0);
    this.tweens.add({
      targets: flash, alpha: 1, duration: 110, yoyo: true,
      onComplete: () => { try { flash.destroy(); } catch {} }
    });

    // Banner tên thẻ
    const banner = this.add.text(width / 2, height * 0.24, `✨ ${cardName || "Thẻ"} ✨`, {
      fontFamily: "Signika",
      fontSize: Math.floor(38 * S) + "px",
      color: "#ffe566",
      fontStyle: "bold",
      stroke: "#3a1a00",
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 4, color: "#000000", blur: 16, fill: true }
    }).setOrigin(0.5).setDepth(D + 1).setAlpha(0).setScale(0.5);

    this.tweens.add({
      targets: banner, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 260, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: banner, alpha: 0, y: height * 0.20, duration: 320,
            onComplete: () => { try { banner.destroy(); } catch {} }
          });
        });
      }
    });

    // Particles
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const p = this.add.circle(
        width / 2 + Math.cos(angle) * 30 * S,
        height * 0.24 + Math.sin(angle) * 20 * S,
        Phaser.Math.Between(4, 8) * S,
        [0xffdd44, 0xff9900, 0xffffff, 0xffcc66][i % 4], 1
      ).setDepth(D + 2).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        x: width / 2 + Math.cos(angle) * (80 + Math.random() * 120) * S,
        y: height * 0.24 + Math.sin(angle) * (50 + Math.random() * 80) * S,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 650 + Math.random() * 350, ease: 'Quad.easeOut',
        onComplete: () => { try { p.destroy(); } catch {} }
      });
    }
  }

  _getPlayerPosByUid(uid) {
    const myUid = Number(this._myUserId?.());
    if (Number(uid) === myUid && this.player) {
      return { x: this.player.x, y: this.player.y };
    }
    const op = Object.values(this.otherPlayers || {}).find(o => Number(o?.user_id) === Number(uid));
    if (op) return { x: op.x, y: op.y };
    const gp = (this.gamePlayers || []).find(p => Number(p.user_id) === Number(uid));
    const cell = gp ? this.boardPath?.[Number(gp.index || 0)] : null;
    if (cell) return { x: cell.x * this.scale.width, y: cell.y * this.scale.height };
    return null;
  }

  _playFloatingBadge(x, y, text, color = "#ffee44") {
    const S = this.minRatio || 1;
    const t = this.add.text(x, y, text, {
      fontFamily: "Signika", fontSize: Math.floor(24 * S) + "px",
      color, fontStyle: "bold", stroke: "#000000", strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 3, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(920).setAlpha(0).setScale(0.6);
    this.tweens.add({
      targets: t, alpha: 1, scaleX: 1, scaleY: 1, y: y - 16 * S,
      duration: 240, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: t, alpha: 0, y: y - 55 * S, duration: 400,
            onComplete: () => { try { t.destroy(); } catch {} }
          });
        });
      }
    });
  }

  _playCoinShowerAt(x, y, count = 14) {
    const S = this.minRatio || 1;
    const tex = this.textures.exists("coin") ? "coin" : null;
    for (let i = 0; i < count; i++) {
      const startX = x + (Math.random() - 0.5) * 90 * S;
      const startY = y - (140 + Math.random() * 90) * S;
      const obj = tex
        ? this.add.image(startX, startY, tex).setScale(0.26 * S).setDepth(910).setAlpha(0)
        : this.add.circle(startX, startY, 7 * S, 0xffdd00, 1).setDepth(910).setAlpha(0);
      this.tweens.add({
        targets: obj,
        alpha: 1,
        x: x + (Math.random() - 0.5) * 45 * S,
        y: y - (10 + Math.random() * 20) * S,
        angle: (Math.random() - 0.5) * 180,
        duration: 480 + Math.random() * 250,
        delay: i * 35,
        ease: 'Bounce.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: obj, alpha: 0, duration: 250, delay: 120,
            onComplete: () => { try { obj.destroy(); } catch {} }
          });
        }
      });
    }
  }

  // 1. Công An — Đèn tuần tra đỏ/xanh + biểu tượng khóa lượt giáng xuống đối thủ
  _playTarotPoliceFX(targetUid) {
    const pos = this._getPlayerPosByUid(targetUid);
    if (!pos) return;
    const S = this.minRatio || 1;
    const { x, y } = pos;

    // Nháy đèn xanh-đỏ trên đầu mục tiêu
    const sirenRed  = this.add.circle(x - 16 * S, y - 95 * S, 18 * S, 0xff2222, 0.75).setDepth(910).setBlendMode(Phaser.BlendModes.ADD);
    const sirenBlue = this.add.circle(x + 16 * S, y - 95 * S, 18 * S, 0x2288ff, 0.75).setDepth(910).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: sirenRed,  alpha: 0.15, scaleX: 1.5, scaleY: 1.5, duration: 150, yoyo: true, repeat: 6, onComplete: () => sirenRed.destroy() });
    this.tweens.add({ targets: sirenBlue, alpha: 0.15, scaleX: 1.5, scaleY: 1.5, duration: 150, delay: 150, yoyo: true, repeat: 6, onComplete: () => sirenBlue.destroy() });

    // Còng/Khóa rơi từ trên cao
    const lock = this.add.text(x, y - 220 * S, "🔒", { fontSize: Math.floor(42 * S) + "px" })
      .setOrigin(0.5).setDepth(915);
    this.tweens.add({
      targets: lock, y: y - 48 * S, duration: 360, ease: 'Cubic.easeIn',
      onComplete: () => {
        this.cameras.main.shake(180, 0.004);
        const ring = this.add.circle(x, y, 22 * S, 0xff3333, 0).setStrokeStyle(4 * S, 0xff3333, 0.9).setDepth(905);
        this.tweens.add({ targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
        this._playFloatingBadge(x, y - 90 * S, "BỊ KHÓA LƯỢT!", "#ff6666");
        this.tweens.add({ targets: lock, alpha: 0, duration: 400, delay: 900, onComplete: () => lock.destroy() });
      }
    });
  }

  // 2. Xúc Xắc Ma Thuật — 2 xúc xắc ma thuật xoay xoắn quanh nhân vật + cột sáng
  _playTarotExtraRollFX(uid) {
    const pos = this._getPlayerPosByUid(uid);
    if (!pos) return;
    const S = this.minRatio || 1;
    const { x, y } = pos;

    const beam = this.add.rectangle(x, y - 80 * S, 64 * S, 240 * S, 0xffcc44, 0.35)
      .setDepth(905).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, scaleX: 1.5, alpha: 0, duration: 950, onComplete: () => beam.destroy() });

    const d1 = this.add.image(x - 42 * S, y - 35 * S, "dice_6").setScale(0.32 * S).setDepth(915);
    const d2 = this.add.image(x + 42 * S, y - 35 * S, "dice_6").setScale(0.32 * S).setDepth(915);
    this.tweens.add({
      targets: [d1, d2], y: y - 105 * S, angle: 720, duration: 950, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: [d1, d2], alpha: 0, scaleX: 0.1, scaleY: 0.1, duration: 250, onComplete: () => { d1.destroy(); d2.destroy(); } });
      }
    });
    this._playFloatingBadge(x, y - 110 * S, "+1 LƯỢT TUNG!", "#ffdd44");
  }

  // 3. Nhận Trợ Giúp — Luồng tiền bay từ đối thủ về mình
  _playTarotStealFX(data) {
    const thiefPos = this._getPlayerPosByUid(data.user_id);
    if (!thiefPos) return;
    const S = this.minRatio || 1;
    const tex = this.textures.exists("coin") ? "coin" : null;
    const breakdown = data.breakdown || [];

    breakdown.forEach((b) => {
      const victimPos = this._getPlayerPosByUid(b.from_user_id);
      if (!victimPos) return;
      this._playFloatingBadge(victimPos.x, victimPos.y - 60 * S, `-${this._formatMoney(b.amount)}`, "#ff6666");
      for (let i = 0; i < 10; i++) {
        const c = tex
          ? this.add.image(victimPos.x, victimPos.y - 25 * S, tex).setScale(0.28 * S).setDepth(915)
          : this.add.circle(victimPos.x, victimPos.y - 25 * S, 8 * S, 0xffdd00, 1).setDepth(915);
        const midX = (victimPos.x + thiefPos.x) / 2 + (Math.random() - 0.5) * 60 * S;
        const midY = Math.min(victimPos.y, thiefPos.y) - (80 + Math.random() * 50) * S;
        this.tweens.add({
          targets: c, x: midX, y: midY, angle: 180, duration: 280, delay: i * 45, ease: 'Sine.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: c, x: thiefPos.x, y: thiefPos.y - 25 * S, angle: 360, duration: 320, ease: 'Sine.easeIn',
              onComplete: () => { try { c.destroy(); } catch {} }
            });
          }
        });
      }
    });
    if (data.total > 0) {
      this.time.delayedCall(550, () => {
        this._playFloatingBadge(thiefPos.x, thiefPos.y - 75 * S, `+${this._formatMoney(data.total)}`, "#ffdd44");
      });
    }
  }

  // 4. Nhanh Chân — Vòng gió & tia tăng tốc xanh ngọc dưới chân nhân vật
  _playTarotSpeedAuraFX(uid) {
    const pos = this._getPlayerPosByUid(uid);
    if (!pos) return;
    const S = this.minRatio || 1;
    for (let i = 0; i < 3; i++) {
      const ring = this.add.ellipse(pos.x, pos.y + 4 * S, 44 * S, 18 * S, 0x00ffcc, 0)
        .setStrokeStyle(3.5 * S, 0x00ffcc, 0.9).setDepth(905);
      this.tweens.add({
        targets: ring, scaleX: 2.8, scaleY: 2.4, y: pos.y - 26 * S, alpha: 0,
        duration: 500, delay: i * 120, ease: 'Quad.easeOut',
        onComplete: () => ring.destroy()
      });
    }
    this._playFloatingBadge(pos.x, pos.y - 70 * S, "⚡ TĂNG TỐC!", "#00ffcc");
  }

  // 6. Thần Giữ Của — Vòng khiên ánh sáng bảo vệ quanh nhân vật
  _playTarotShieldAuraFX(uid, color = 0x44ffcc, label = "🛡 KHIÊN THUẾ") {
    const pos = this._getPlayerPosByUid(uid);
    if (!pos) return;
    const S = this.minRatio || 1;
    const shield = this.add.circle(pos.x, pos.y - 24 * S, 42 * S, color, 0.22)
      .setStrokeStyle(4 * S, color, 0.95).setDepth(910);
    this.tweens.add({
      targets: shield, scaleX: 1.45, scaleY: 1.45, alpha: 0, duration: 1050, ease: 'Cubic.easeOut',
      onComplete: () => shield.destroy()
    });
    this._playFloatingBadge(pos.x, pos.y - 80 * S, label, "#88ffcc");
  }

  // 7. Giải Tỏa — Tên lửa / cầu lửa giáng từ trên trời xuống phá tinh cầu (mọi người đều thấy)
  _playTarotDestroyCellFX(cellIdx) {
    const cell = this.boardPath?.[Number(cellIdx)];
    if (!cell) return;
    const S = this.minRatio || 1;
    const x = cell.x * this.scale.width;
    const y = cell.y * this.scale.height;

    if (this.textures.exists("fire_ball_01") && this.anims.exists("fx_fire_ball")) {
      const fb = this.add.sprite(x, y - 360 * S, "fire_ball_01")
        .setDepth(920).setScale(0.55 * S).setAngle(90).play("fx_fire_ball");
      this.tweens.add({
        targets: fb, y, duration: 480, ease: 'Cubic.easeIn',
        onComplete: () => {
          fb.destroy();
          this._createFireImpact(x, y);
          this.cameras.main.shake(240, 0.006);
          this._playFloatingBadge(x, y - 50 * S, "💥 GIẢI TỎA!", "#ff5533");
        }
      });
    } else {
      this._createFireImpact(x, y);
    }
  }

  // 8. Hoán Đổi — 2 cổng xoáy ma thuật mở ra & tia sáng chéo hoán đổi
  _playTarotSwapFX(idxA, idxB) {
    const cellA = this.boardPath?.[Number(idxA)];
    const cellB = this.boardPath?.[Number(idxB)];
    if (!cellA || !cellB) return;
    const S = this.minRatio || 1;
    const ax = cellA.x * this.scale.width, ay = cellA.y * this.scale.height;
    const bx = cellB.x * this.scale.width, by = cellB.y * this.scale.height;

    [ { x: ax, y: ay, c: 0xaa66ff }, { x: bx, y: by, c: 0xffaa00 } ].forEach(p => {
      const portal = this.add.circle(p.x, p.y, 34 * S, p.c, 0.3)
        .setStrokeStyle(4 * S, p.c, 0.95).setDepth(905);
      this.tweens.add({ targets: portal, scaleX: 1.9, scaleY: 1.9, alpha: 0, duration: 850, onComplete: () => portal.destroy() });
    });

    const orbA = this.add.image(ax, ay, "orb_purple").setScale(0.32 * S).setDepth(915);
    const orbB = this.add.image(bx, by, "orb_orange").setScale(0.32 * S).setDepth(915);
    const midX = (ax + bx) / 2, midY = Math.min(ay, by) - 90 * S;

    this.tweens.add({
      targets: orbA, x: midX, y: midY, duration: 320, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({
        targets: orbA, x: bx, y: by, duration: 340, ease: 'Sine.easeIn',
        onComplete: () => { orbA.destroy(); }
      })
    });
    this.tweens.add({
      targets: orbB, x: midX, y: midY - 30 * S, duration: 320, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({
        targets: orbB, x: ax, y: ay, duration: 340, ease: 'Sine.easeIn',
        onComplete: () => {
          orbB.destroy();
          this._playFloatingBadge(ax, ay - 45 * S, "🔄 HOÁN ĐỔI!", "#dd99ff");
          this._playFloatingBadge(bx, by - 45 * S, "🔄 HOÁN ĐỔI!", "#ffdd77");
        }
      })
    });
  }

  // 10. Bảo Vệ — Vòm khiên năng lượng xanh dương giáng xuống tinh cầu
  _playTarotProtectCellFX(cellIdx, turns = 3) {
    const cell = this.boardPath?.[Number(cellIdx)];
    if (!cell) return;
    const S = this.minRatio || 1;
    const x = cell.x * this.scale.width;
    const y = cell.y * this.scale.height;

    const dome = this.add.circle(x, y, 42 * S, 0x33bbff, 0.35)
      .setStrokeStyle(4 * S, 0x88eeff, 1).setDepth(910);
    this.tweens.add({
      targets: dome, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 950, ease: 'Cubic.easeOut',
      onComplete: () => dome.destroy()
    });
    this._playFloatingBadge(x, y - 55 * S, `🛡 BẢO VỆ ${turns} LƯỢT`, "#66ddff");
  }

  _startDarkMapEffect() {
    const { width, height } = this.scale;
    if (this._darkOverlay) this._darkOverlay.destroy();

    // Dùng fillAlpha = 1 kết hợp setAlpha(0) rồi tween alpha để Phaser render đúng độ tối
    this._darkOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 1)
      .setDepth(3000)
      .setAlpha(0);

    this.tweens.add({
      targets: this._darkOverlay,
      alpha: 0.62,
      duration: 450,
      ease: 'Power2'
    });
  }

  drawNiceDashedRoundedRect(g, x, y, w, h, r, color = 0xc8a060, lw = 2, dash = 12, gap = 7) {
    g.lineStyle(lw, color, 0.9);

    const drawSeg = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len <= 0) return;

      const dx = (x2 - x1) / len;
      const dy = (y2 - y1) / len;

      for (let d = 0; d < len; d += dash + gap) {
        const end = Math.min(d + dash, len);
        g.beginPath();
        g.moveTo(x1 + dx * d, y1 + dy * d);
        g.lineTo(x1 + dx * end, y1 + dy * end);
        g.strokePath();
      }
    };

    const drawArcDashed = (cx, cy, radius, startDeg, endDeg) => {
      const start = Phaser.Math.DegToRad(startDeg);
      const end = Phaser.Math.DegToRad(endDeg);
      const arcLen = radius * Math.abs(end - start);
      const step = (dash + gap) / Math.max(radius, 1);

      for (let a = start; a < end; a += step) {
        const a2 = Math.min(a + dash / Math.max(radius, 1), end);
        g.beginPath();
        g.arc(cx, cy, radius, a, a2);
        g.strokePath();
      }
    };

    // cạnh trên
    drawSeg(x + r, y, x + w - r, y);
    // cạnh phải
    drawSeg(x + w, y + r, x + w, y + h - r);
    // cạnh dưới
    drawSeg(x + w - r, y + h, x + r, y + h);
    // cạnh trái
    drawSeg(x, y + h - r, x, y + r);

    // 4 góc bo
    drawArcDashed(x + r,     y + r,     r, 180, 270);
    drawArcDashed(x + w - r, y + r,     r, 270, 360);
    drawArcDashed(x + w - r, y + h - r, r,   0,  90);
    drawArcDashed(x + r,     y + h - r, r,  90, 180);
  }
  
  _showQuizPanel(q) {
    const { width, height } = this.scale;
    const S = this.minRatio || 1;
    const D = 170;

    if (this._quizObjs) {
      this._quizObjs.forEach(o => { try { o?.destroy?.(); } catch (e) {} });
    }
    this._quizObjs = [];
    const push = (o) => { this._quizObjs.push(o); return o; };

    // =========================================================
    // 1) Nền tối phía sau
    // =========================================================
    push(
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55)
        .setDepth(D)
    );

    // =========================================================
    // 2) Panel chính lớn hơn, đẹp hơn
    // =========================================================
    const panelW = 1120 * S;
    const panelH = 620 * S;
    const panelX = width / 2;
    const panelY = height / 2;

    const left = panelX - panelW / 2;
    const top  = panelY - panelH / 2;
    const radius = 24 * S;

    const panelG = push(this.add.graphics().setDepth(D + 1));

    // Bóng đổ
    panelG.fillStyle(0x000000, 0.24);
    panelG.fillRoundedRect(left + 7 * S, top + 10 * S, panelW, panelH, radius);

    // Nền kem ấm
    panelG.fillStyle(0xfff0d0, 1);
    panelG.fillRoundedRect(left, top, panelW, panelH, radius);

    // Highlight trên
    panelG.fillStyle(0xffffff, 0.33);
    panelG.fillRoundedRect(left + 4 * S, top + 4 * S, panelW - 8 * S, panelH * 0.14, radius);

    // Viền ngoài nâu
    panelG.lineStyle(5 * S, 0x8b5e1a, 1);
    panelG.strokeRoundedRect(left, top, panelW, panelH, radius);

    // Viền nét đứt bên trong - bản đẹp hơn, kín góc hơn
    const inset = 14 * S;
    this.drawNiceDashedRoundedRect(
      panelG,
      left + inset,
      top + inset,
      panelW - inset * 2,
      panelH - inset * 2,
      radius - 8 * S,
      0xc8a060,
      2 * S,
      12 * S,
      8 * S
    );

    // =========================================================
    // 3) KHÔNG còn vạch ở giữa
    // =========================================================

    // =========================================================
    // 4) Khung câu hỏi bên trái
    // =========================================================
    const qBoxX = left + 52 * S;
    const qBoxY = top + 78 * S;
    const qBoxW = 460 * S;
    const qBoxH = 430 * S;

    const qG = push(this.add.graphics().setDepth(D + 3));

    // bóng
    qG.fillStyle(0x000000, 0.16);
    qG.fillRoundedRect(qBoxX + 6 * S, qBoxY + 8 * S, qBoxW, qBoxH, 8 * S);

    // nền giấy
    qG.fillStyle(0xfcfcfa, 1);
    qG.fillRoundedRect(qBoxX, qBoxY, qBoxW, qBoxH, 6 * S);

    // viền giấy
    qG.lineStyle(3 * S, 0xd7c59a, 1);
    qG.strokeRoundedRect(qBoxX, qBoxY, qBoxW, qBoxH, 6 * S);

    // ghim đỏ nhỏ
    qG.fillStyle(0xd65a42, 1);
    qG.fillCircle(qBoxX + 16 * S, qBoxY + 16 * S, 4.5 * S);

    // nền sáng nhẹ đầu giấy
    qG.fillStyle(0xffffff, 0.22);
    qG.fillRoundedRect(qBoxX + 4 * S, qBoxY + 4 * S, qBoxW - 8 * S, 24 * S, 4 * S);

    // text câu hỏi - to hơn rõ rệt
    push(this.add.text(qBoxX + 20 * S, qBoxY + 22 * S, q.question || "", {
      fontFamily: "'Baloo 2','Signika',sans-serif",
      fontSize: Math.floor(24 * S) + "px",
      color: "#2d2418",
      fontStyle: "bold",
      wordWrap: { width: qBoxW - 36 * S },
      lineSpacing: 12,
      align: "left"
    }).setOrigin(0, 0).setDepth(D + 5));

    // =========================================================
    // 5) Khu đáp án bên phải
    // =========================================================
    const ansX = qBoxX + qBoxW + 34 * S;
    const ansW = 520 * S;
    const headerY = qBoxY;
    const headerH = 56 * S;

    const hG = push(this.add.graphics().setDepth(D + 3));
    hG.fillStyle(0x1cc7db, 1);
    hG.fillRoundedRect(ansX, headerY, ansW, headerH, 12 * S);
    hG.fillStyle(0x85edf7, 0.22);
    hG.fillRoundedRect(ansX + 4 * S, headerY + 4 * S, ansW - 8 * S, 18 * S, 8 * S);
    hG.lineStyle(2 * S, 0x63dbe8, 1);
    hG.strokeRoundedRect(ansX, headerY, ansW, headerH, 12 * S);

    push(this.add.text(ansX + ansW / 2, headerY + headerH / 2, "TRẢ LỜI ĐÚNG ĐỂ ĐI TIẾP", {
      fontFamily: "'Baloo 2','Signika',sans-serif",
      fontSize: Math.floor(19 * S) + "px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 4));

    // =========================================================
    // 6) Đáp án đẹp hơn, chữ to hơn
    // =========================================================
    const keys = ["A", "B", "C", "D"];
    const colorMap = {
      A: { main: 0x33a8ec, light: 0x68c7ff },
      B: { main: 0xf0ae22, light: 0xffcb59 },
      C: { main: 0x7dd63a, light: 0xa5f067 },
      D: { main: 0xeb4358, light: 0xff7888 }
    };

    const btnH = 82 * S;
    const btnGap = 12 * S;
    const badgeW = 48 * S;
    const startY = headerY + headerH + 18 * S;

    keys.forEach((key, idx) => {
      const y = startY + idx * (btnH + btnGap);
      const c = colorMap[key];

      const g = push(this.add.graphics().setDepth(D + 3));

      const drawBtn = (hovered = false) => {
        g.clear();

        // bóng
        g.fillStyle(0x000000, hovered ? 0.20 : 0.14);
        g.fillRoundedRect(ansX + 4 * S, y + 6 * S, ansW, btnH, 10 * S);

        // nền chính
        g.fillStyle(hovered ? 0xfff7df : 0xfdfbf6, 1);
        g.fillRoundedRect(ansX, y, ansW, btnH, 10 * S);

        g.lineStyle(2.5 * S, hovered ? 0xe6bb63 : 0xd8c7a0, 1);
        g.strokeRoundedRect(ansX, y, ansW, btnH, 10 * S);

        // cột màu trái
        g.fillStyle(c.main, 1);
        g.fillRoundedRect(ansX, y, badgeW, btnH, 10 * S);

        g.fillStyle(c.light, 1);
        g.fillRoundedRect(ansX, y, badgeW, btnH * 0.46, 10 * S);

        // shine
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(ansX + 4 * S, y + 4 * S, ansW - 8 * S, 16 * S, 8 * S);

        // chấm nhỏ góc phải
        g.fillStyle(0xd97d5d, 1);
        g.fillCircle(ansX + ansW - 14 * S, y + 14 * S, 3 * S);
      };

      drawBtn(false);

      push(this.add.text(ansX + badgeW / 2, y + btnH / 2, key, {
        fontFamily: "'Baloo 2','Signika',sans-serif",
        fontSize: Math.floor(30 * S) + "px",
        color: "#ffffff",
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 5));

      push(this.add.text(ansX + badgeW + 18 * S, y + btnH / 2, String(q[key] ?? ""), {
        fontFamily: "'Baloo 2','Signika',sans-serif",
        fontSize: Math.floor(24 * S) + "px",
        color: "#2f2619",
        fontStyle: "bold",
        wordWrap: { width: ansW - badgeW - 36 * S }
      }).setOrigin(0, 0.5).setDepth(D + 5));

      const zone = push(
        this.add.zone(ansX + ansW / 2, y + btnH / 2, ansW, btnH)
          .setInteractive({ cursor: "pointer" })
          .setDepth(D + 6)
      );

      zone.on("pointerover", () => drawBtn(true));
      zone.on("pointerout", () => drawBtn(false));

      zone.on("pointerdown", () => {
        this.socket.emit("game:quiz_answer", {
          room_id: this.gameRoomId,
          answer: key
        });
        this._closeQuizPanel();
      });
    });

    // =========================================================
    // 7) Timer đẹp hơn
    // =========================================================
    const timerY = top + panelH - 34 * S;
    const timerX = ansX;
    const timerW = ansW;
    const timerH = 12 * S;

    const timerBg = push(this.add.graphics().setDepth(D + 4));
    timerBg.fillStyle(0xd8ceb5, 1);
    timerBg.fillRoundedRect(timerX, timerY, timerW, timerH, 6 * S);

    const timerBar = push(this.add.graphics().setDepth(D + 5));

    let timeLeft = 30;
    const totalTime = 30;

    const drawTimer = (pct) => {
      timerBar.clear();

      let color = 0xf0b534;
      if (pct <= 0.5) color = 0xe88a2d;
      if (pct <= 0.25) color = 0xe24f4f;

      timerBar.fillStyle(color, 1);
      timerBar.fillRoundedRect(timerX, timerY, timerW * pct, timerH, 6 * S);
    };

    drawTimer(1);

    const timerLabel = push(this.add.text(timerX + timerW, timerY - 26 * S, "30s", {
      fontFamily: "'Signika',sans-serif",
      fontSize: Math.floor(16 * S) + "px",
      color: "#8e8266",
      fontStyle: "bold"
    }).setOrigin(1, 0).setDepth(D + 5));

    const timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        timeLeft--;
        drawTimer(Math.max(0, timeLeft / totalTime));
        timerLabel.setText(timeLeft + "s");

        if (timeLeft <= 0) {
          timerEvent.destroy();
          this._closeQuizPanel();
        }
      }
    });

    this._quizObjs.push({ destroy: () => timerEvent?.destroy?.() });
  }

  _closeQuizPanel() {
    if (!this._quizObjs) return;
    this._quizObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._quizObjs = [];
  }

  _playChanceCellFX(userId, eventType) {
    const S = this.minRatio || 1;
    const isTeacherEvent = ["downgrade_enemy_cell", "send_enemy_back", "swap_positions"].includes(eventType);
    const fallbackCell = this.boardPath?.[isTeacherEvent ? 18 : 9];
    const pos = this._getPlayerPosByUid?.(userId) || (fallbackCell ? {
      x: fallbackCell.x * this.scale.width,
      y: fallbackCell.y * this.scale.height
    } : null);
    if (!pos) return;

    const mainCol = isTeacherEvent ? 0x38bdf8 : 0xfacc15;
    const subCol  = isTeacherEvent ? 0x818cf8 : 0xfb923c;

    // 2 vòng tròn ma thuật đồng tâm nở bung dưới chân
    [0, 140].forEach((delay, idx) => {
      const ring = this.add.ellipse(pos.x, pos.y + 4 * S, 46 * S, 22 * S, mainCol, idx === 0 ? 0.22 : 0.12)
        .setStrokeStyle(3.5 * S, idx === 0 ? 0xfff3b0 : subCol, 0.95)
        .setDepth(35)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ring,
        scaleX: idx === 0 ? 2.6 : 3.2,
        scaleY: idx === 0 ? 2.6 : 3.2,
        alpha: 0,
        duration: 680,
        delay,
        ease: "Cubic.easeOut",
        onComplete: () => { try { ring.destroy(); } catch (e) {} }
      });
    });

    // Chùm hạt sao ánh sáng vàng/xanh bay lên từ vòng tròn
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14;
      const dist = (26 + Math.random() * 24) * S;
      const px = pos.x + Math.cos(ang) * 14 * S;
      const py = pos.y + Math.sin(ang) * 7 * S;
      const dot = this.add.circle(px, py, (2.5 + Math.random() * 2.5) * S, i % 2 === 0 ? 0xfff3b0 : mainCol, 0.95)
        .setDepth(36)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: dot,
        x: pos.x + Math.cos(ang) * dist,
        y: py - (45 + Math.random() * 45) * S,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 650 + Math.random() * 250,
        ease: "Sine.easeOut",
        onComplete: () => { try { dot.destroy(); } catch (e) {} }
      });
    }

    // Nhún nhẹ rương kho báu (Ô 9) nếu đứng ở ô cơ hội
    if (!isTeacherEvent && this.treasure?.active) {
      this.tweens.add({
        targets: this.treasure,
        scaleX: this.treasure.scaleX * 1.18,
        scaleY: this.treasure.scaleY * 1.18,
        duration: 180,
        yoyo: true,
        ease: "Back.easeOut"
      });
    }

    this._playFloatingBadge?.(
      pos.x,
      pos.y - 72 * S,
      isTeacherEvent ? "🎓 KỸ NĂNG THẦY GIÁO!" : "🎁 BỐC THĂM CƠ HỘI!",
      isTeacherEvent ? "#7dd3fc" : "#fde047"
    );
  }

  _showSkillPanel({ title, text, icon }) {
    const { width } = this.scale;
    const S = this.minRatio || 1;
    const D = 175;

    if (this._skillHideTimer) {
      try { this._skillHideTimer.remove(false); } catch (e) {}
      this._skillHideTimer = null;
    }
    if (this._skillObjs) {
      this._skillObjs.forEach(o => { try { o?.destroy(); } catch (e) {} });
    }
    this._skillObjs = [];
    const push = (o) => { this._skillObjs.push(o); return o; };

    const bw = Math.min(Math.round(520 * S), width - Math.round(40 * S));
    const bh = Math.round(64 * S);
    const bx = width / 2;
    const by = Math.round(104 * S);

    const g = push(this.add.graphics().setDepth(D));
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(bx - bw / 2 + 2, by - bh / 2 + 4, bw, bh, 14 * S);
    g.fillGradientStyle(0x0b1f3f, 0x0b1f3f, 0x051024, 0x051024, 0.94);
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 14 * S);
    g.lineStyle(2 * S, 0x38bdf8, 0.9);
    g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 14 * S);

    let textCenterX = bx;
    if (icon && this.textures.exists(icon)) {
      const ico = push(this.add.image(bx - bw / 2 + 34 * S, by, icon)
        .setDisplaySize(38 * S, 38 * S).setOrigin(0.5).setDepth(D + 1));
      ico.setAlpha(0.98);
      textCenterX = bx + 16 * S;
    }

    const titleObj = push(this.add.text(textCenterX, by - 13 * S, title || "SỰ KIỆN", {
      fontFamily: "Signika",
      fontSize: Math.max(13, Math.floor(17 * S)) + "px",
      color: "#fde047",
      fontStyle: "bold",
      stroke: "#020617",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 2));

    const bodyObj = push(this.add.text(textCenterX, by + 12 * S, text || "", {
      fontFamily: "Signika",
      fontSize: Math.max(11, Math.floor(14 * S)) + "px",
      color: "#f1f5f9",
      align: "center",
      stroke: "#020617",
      strokeThickness: 2,
      wordWrap: { width: bw - 84 * S },
    }).setOrigin(0.5).setDepth(D + 2));

    // Slide nhẹ từ trên xuống
    [g, titleObj, bodyObj].forEach(o => o.setAlpha(0));
    this._skillObjs.forEach(o => {
      this.tweens.add({ targets: o, alpha: 1, y: o.y + 4 * S, duration: 180, ease: "Quad.easeOut" });
    });

    this._pushMiniEventLog(title, text);

    this._skillHideTimer = this.time.delayedCall(2200, () => {
      const objs = this._skillObjs || [];
      this.tweens.add({
        targets: objs,
        alpha: 0,
        duration: 240,
        onComplete: () => {
          objs.forEach(o => { try { o?.destroy(); } catch (e) {} });
          if (this._skillObjs === objs) this._skillObjs = [];
        },
      });
    });
  }

  _pushMiniEventLog(title, text) {
    if (!title && !text) return;
    if (!this._miniEventLogs) this._miniEventLogs = [];
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();
    const entry = cleanText ? `${title}: ${cleanText}` : String(title);
    this._miniEventLogs.unshift(entry);
    if (this._miniEventLogs.length > 3) this._miniEventLogs.length = 3;
    this._renderMiniEventLog();
  }

  _renderMiniEventLog() {
    this._miniEventLogObjs?.forEach(o => { try { o?.destroy(); } catch (e) {} });
    this._miniEventLogObjs = [];
    if (!this._miniEventLogs?.length) return;

    const S = this.minRatio || 1;
    const D = 52;
    const lx = Math.round(16 * S);
    const ly = Math.round(182 * S);
    const lw = Math.round(290 * S);
    const pad = Math.round(8 * S);

    const objs = [];
    const push = (o) => { objs.push(o); return o; };

    const content = this._miniEventLogs.map((m, idx) => `${idx === 0 ? "▸" : "•"} ${m}`).join("\n");
    const txt = push(this.add.text(lx + pad, ly + pad, content, {
      fontFamily: "Signika",
      fontSize: Math.max(10, Math.floor(11.5 * S)) + "px",
      color: "#cbd5e1",
      lineSpacing: 3,
      wordWrap: { width: lw - pad * 2 },
    }).setOrigin(0, 0).setDepth(D + 1));

    const lh = Math.ceil(txt.height + pad * 2);
    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x041428, 0.72);
    bg.fillRoundedRect(lx, ly, lw, lh, 10 * S);
    bg.lineStyle(1 * S, 0x38bdf8, 0.4);
    bg.strokeRoundedRect(lx, ly, lw, lh, 10 * S);

    this._miniEventLogObjs = objs;
  }

  _stopDarkMapEffect() {
    if (!this._darkOverlay) return;
    this.tweens.add({
      targets: this._darkOverlay,
      alpha: 0,
      duration: 350,
      onComplete: () => {
        this._darkOverlay?.destroy();
        this._darkOverlay = null;
      }
    });
  }

  _formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString("vi-VN");
  }

  _refreshPlayerPanelsFromGameState() {
    if (!this.playerPanels || !this.gamePlayers) return;

    this.playerPanels.forEach((panel, i) => {
      const gp = this.gamePlayers[i];
      if (!gp) return;

      const cash = Number(gp.cash || 0);
      const invested = this._calculateInvestedAmount(gp.user_id);
      const asset = cash + invested;

      const baseName = gp.name || `Player ${i+1}`;
      panel.nameText?.setText(gp.is_bot_controlled ? `🤖 ${baseName}` : baseName);
      panel.statVal1?.setText(this._formatMoney(cash));
      panel.statVal2?.setText(this._formatMoney(asset));
    });
  }

  // ─────────────────────────────────────────────
  //  Helper: my user ID
  // ─────────────────────────────────────────────
  _myUserId() {
    try {
      return JSON.parse(localStorage.getItem("playerData"))?.user?.id ?? null;
    } catch { return null; }
  }

  // ─────────────────────────────────────────────
  //  Khi PowerDice cần emit game:roll
  //  (được gọi bởi PowerDice._fireRoll → scene._onPowerDiceRollRequested)
  // ─────────────────────────────────────────────
  _onPowerDiceRollRequested() {
    if (this.gameRoomId && this.gamePlayers.length > 0) {
      // Phát âm thanh xúc xắc ngay khi tung — trước khi server trả về
      playBoardDiceSound(this);
      // Online: emit lên server — server sẽ trả game:dice_result
      this.socket.emit("game:roll", { room_id: this.gameRoomId });
      this.infoText.setText("🎲 Đang tung...").setColor("#ffffff");
    } else {
      // Offline fallback: tự tính kết quả 2 xúc xắc rồi phát event giả
      const dice1 = Phaser.Math.Between(1, 6);
      const dice2 = Phaser.Math.Between(1, 6);
      const dice  = dice1 + dice2;
      // Gọi thẳng handler với dữ liệu giả
      this.socket.emit("game:roll_offline_fake"); // no-op nếu không có server
      // Chờ một tick rồi xử lý như thể nhận từ server
      this.time.delayedCall(50, () => {
        const fakeData = {
          socket_id: this.socket.id,
          user_id:   this._myUserId(),
          dice,
          dice1,
          dice2,
          name:      this.playerName
        };
        // Trigger handler thủ công
        this._handleDiceResult(fakeData);
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Logic xử lý dice result (tách ra để tái dùng)
  //  Cả socket handler lẫn offline fallback đều gọi vào đây
  // ─────────────────────────────────────────────
  _handleDiceResult(data) {
    const myUid = this._myUserId();
    const isMe  = (data.socket_id === this.socket.id)
               || (data.user_id   === myUid && this.isMyTurn);

    if (isMe) {
      this.canRoll = false;
      const diceText = (data.dice1 && data.dice2)
        ? `${data.dice1} + ${data.dice2} = ${data.dice}`
        : `${data.dice}`;
      this.infoText.setText(`🎲 Bạn tung được ${diceText}!`);
      this.infoText.setColor("#ffdd00");

      if (this.powerDice?.rolling) {
        this.powerDice.playResultAnimation(data, () => {
          this._onDiceHandoff(data);
        });
      } else {
        this._onDiceHandoff(data);
      }
    }
  }

  // ─────────────────────────────────────────────
  //  HANDOFF — PowerDice ẩn xong, BoardScene tiếp quản
  //  Đây là điểm DUY NHẤT trigger di chuyển player
  // ─────────────────────────────────────────────
  _onDiceHandoff(diceResult) {
    const total = (typeof diceResult === "object" && diceResult !== null)
      ? Number(diceResult.dice || ((diceResult.dice1 || 1) + (diceResult.dice2 || 1)))
      : Number(diceResult || 2);

    // Hiện 2 diceSprite của scene với đúng mặt
    this._showDiceSpriteResult(diceResult, () => {
      // Sau khi diceSprite đã hiện → di chuyển
      const target = (this.currentIndex + total) % this.boardPath.length;
      this.showTargetArrow(target);
      this._movePlayerSteps(total, () => {
        // Di chuyển xong
        this.diceSprite.setVisible(false);
        this.diceShadow.setVisible(false);
        if (this.diceSprite2) this.diceSprite2.setVisible(false);
        if (this.diceShadow2) this.diceShadow2.setVisible(false);

        if (this.gameRoomId && this.gamePlayers.length > 0) {
          this.socket.emit("game:move_done", {
            room_id:    this.gameRoomId,
            cell_index: this.currentIndex
          });
        } else {
          this.canRoll = true;
          this._updateTurnInfo();
        }
      });
    });
  }

  // ─────────────────────────────────────────────
  //  DiceSprite scene — hiện đúng mặt 2 xúc xắc, nhỏ và rõ
  // ─────────────────────────────────────────────
  _showDiceSpriteResult(result, onDone) {
    const { width, height } = this.scale;
    const cx = width * 0.508, cy = height * 0.414;
    const gapX = 48 * this.minRatio;
    const gapY = 16 * this.minRatio;

    let d1, d2;
    if (typeof result === "object" && result !== null) {
      d1 = Number(result.dice1) || 1;
      d2 = Number(result.dice2) || 1;
    } else {
      const total = Math.max(2, Math.min(12, Number(result) || 2));
      d1 = Math.min(6, Math.max(1, Math.floor(total / 2)));
      d2 = Math.min(6, Math.max(1, total - d1));
    }

    this.diceSprite.setPosition(cx - gapX, cy - gapY);
    this.diceShadow.setPosition(cx - gapX - 8 * this.minRatio, cy - gapY + 30 * this.minRatio);
    this.diceSprite.setTexture(`dice_${d1}`).setAlpha(0).setAngle(-18).setScale(0.32 * this.minRatio);
    this.diceSprite.setVisible(true);
    this.diceShadow.setVisible(true);

    if (this.diceSprite2 && this.diceShadow2) {
      this.diceSprite2.setPosition(cx + gapX, cy + gapY);
      this.diceShadow2.setPosition(cx + gapX - 8 * this.minRatio, cy + gapY + 30 * this.minRatio);
      this.diceSprite2.setTexture(`dice_${d2}`).setAlpha(0).setAngle(20).setScale(0.32 * this.minRatio);
      this.diceSprite2.setVisible(true);
      this.diceShadow2.setVisible(true);
    }

    this.tweens.add({
      targets: this.diceSprite,
      alpha: 1, angle: -8, scaleX: 0.54 * this.minRatio, scaleY: 0.54 * this.minRatio,
      duration: 260, ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.diceSprite2) {
          this.time.delayedCall(600, () => { if (onDone) onDone(); });
        }
      }
    });

    if (this.diceSprite2) {
      this.tweens.add({
        targets: this.diceSprite2,
        alpha: 1, angle: 9, scaleX: 0.54 * this.minRatio, scaleY: 0.54 * this.minRatio,
        duration: 260, delay: 75, ease: 'Back.easeOut',
        onComplete: () => {
          this.time.delayedCall(560, () => {
            if (onDone) onDone();
          });
        }
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Turn state helper
  // ─────────────────────────────────────────────
  _applyTurnState() {
    if (this._isIntroRunning) {
      this.powerDice?.hide();
      this.tarotBtn?.hide();
      return;
    }
    if (!this.isMyTurn || this.mustAnswerNext) {
      this.powerDice?.hide();
      this.tarotBtn?.hide();
      return;
    }
    this.powerDice?.showForMyTurn();
    this.tarotBtn?.show();
  }

  // =====================
  // PRELOAD
  // =====================
  preload() {
    this._preloadOverlay = createLoadingOverlay(this, "Đang tải trận đấu...");
    this._onPreloadProgress = (p) => {
      this._preloadOverlay?.updateProgress(p);
    };
    this.load.on("progress", this._onPreloadProgress);

    this.load.image("bg", "./assets/nen_trochoi.jpg");

    // Nạp cấu hình bản đồ theo mùa (ưu tiên snapshot của phòng đang đấu nếu đang reconnect)
    this._activeMapConfig = null;
    const mapRoomParam = this.gameRoomId ? `room_id=${encodeURIComponent(this.gameRoomId)}&` : "";
    if (this.cache.json.exists("map_config_live")) {
      this.cache.json.remove("map_config_live");
    }
    this.load.json("map_config_live", `/api/assets/map-config?${mapRoomParam}t=${Date.now()}`);
    this.load.once("filecomplete-json-map_config_live", (_k, _t, payload) => {
      const m = payload?.active_map;
      if (m) {
        this._activeMapConfig = m;
        if (m.is_custom && m.image_url) {
          const texKey = `bg_custom_${m.version || 0}`;
          if (!this.textures.exists(texKey)) {
            this.load.image(texKey, `${m.image_url}?v=${m.version || 0}`);
          }
        }
      }
    });

    this.characters.forEach(character => {
      for (let skin = 1; skin <= 3; skin++) {
        const image = `${character}_${skin}`;
        for (let i = 0; i < 18; i++) {
          const num = String(i).padStart(3, "0");
          this.load.image(`${character}_${skin}_idle_${num}`,
            `./assets/characters/${character}/${image}/PNG/PNG Sequences/Idle/0_${character}_Idle_${num}.png`);
        }
        for (let i = 0; i < 12; i++) {
          const num = String(i).padStart(3, "0");
          this.load.image(`${character}_${skin}_run_throw_${i}`,
            `./assets/characters/${character}/${image}/PNG/PNG Sequences/Run Throwing/0_${character}_Run Throwing_${num}.png`);
        }
        for (let i = 0; i < 12; i++) {
          const num = String(i).padStart(3, "0");
          this.load.image(`${character}_${skin}_hurt_${num}`,
            `./assets/characters/${character}/${image}/PNG/PNG Sequences/Hurt/0_${character}_Hurt_${num}.png`);
        }
      }
    });

    for (let i = 1; i <= 6; i++) {
      this.load.image(`dice_${i}`, `./assets/resources/Dice/dice_${i}.png`);
      this.load.image(`dice_blur_${i}`, `./assets/resources/Dice_Blur/dice_blur_${i}.png`);
    }

    // Nạp cấu hình NPC tùy biến từ Admin Sprite Studio (nếu có)
    this._npcConfig = null;
    if (this.cache.json.exists("npc_config_live")) {
      this.cache.json.remove("npc_config_live");
    }
    this.load.json("npc_config_live", `/api/assets/npc-config?t=${Date.now()}`);
    this.load.once("filecomplete-json-npc_config_live", (_key, _type, payload) => {
      const npcs = payload?.npcs || {};
      this._npcConfig = npcs;

      const tCfg = npcs.teacher;
      if (tCfg?.is_custom && Array.isArray(tCfg.idle_frames) && tCfg.idle_frames.length > 0) {
        const ver = tCfg.version || 0;
        tCfg.idle_frames.forEach((url, i) => {
          const num = String(i).padStart(3, "0");
          const k = `Fantasy_Teacher_custom_${ver}_idle_${num}`;
          if (!this.textures.exists(k)) this.load.image(k, `${url}?v=${ver}`);
        });
      }

      const mCfg = npcs.monster;
      if (mCfg?.is_custom && Array.isArray(mCfg.idle_frames) && mCfg.idle_frames.length > 0) {
        const ver = mCfg.version || 0;
        mCfg.idle_frames.forEach((url, i) => {
          const num = String(i).padStart(3, "0");
          const k = `Fantasy_Monster_custom_${ver}_idle_${num}`;
          if (!this.textures.exists(k)) this.load.image(k, `${url}?v=${ver}`);
        });
        const atkFrames = (Array.isArray(mCfg.attack_frames) && mCfg.attack_frames.length > 0)
          ? mCfg.attack_frames
          : mCfg.idle_frames;
        atkFrames.forEach((url, i) => {
          const num = String(i).padStart(3, "0");
          const k = `Hunter_Greeting_custom_${ver}_${num}`;
          if (!this.textures.exists(k)) this.load.image(k, `${url}?v=${ver}`);
        });
      }

      const trCfg = npcs.treasure;
      if (trCfg?.is_custom && Array.isArray(trCfg.idle_frames) && trCfg.idle_frames.length > 0) {
        const ver = trCfg.version || 0;
        trCfg.idle_frames.forEach((url, i) => {
          const num = String(i).padStart(3, "0");
          const k = `Fantasy_Treasure_custom_${ver}_idle_${num}`;
          if (!this.textures.exists(k)) this.load.image(k, `${url}?v=${ver}`);
        });
      }
    });

    for (let i = 0; i < 18; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(`Fantasy_Teacher_idle_${num}`,
        `./assets/characters/Fantasy_Teacher/Sage/PNG/PNG Sequences/Idle Blinking/0_Sage_Idle Blinking_${num}.png`);
    }

    // Quái vật ô 28: Devil Leader (Idle Blinking 16 frames + Attacking 10 frames)
    for (let i = 0; i < 16; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(`Fantasy_Monster_1_idle_${num}`,
        `./assets/characters/Fantasy_Monster/Devil Leader/PNG/PNG Sequences/Front - Idle Blinking/Front - Idle Blinking_${num}.png`);
    }
    for (let i = 0; i < 10; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(`Hunter_Greeting_${num}`,
        `./assets/characters/Fantasy_Monster/Devil Leader/PNG/PNG Sequences/Front - Attacking/Front - Attacking_${num}.png`);
    }

    this.load.image("treasure",     "./assets/characters/Fantasy_Treasure/PNG/without background/47.png");
    this.load.image("target_arrow", "./assets/resources/Gps/gps_gmae.png");
    this.load.image("orb_orange",   "./assets/resources/Orb/iloveimg-resized/orb_orange.png");
    this.load.image("orb_red",      "./assets/resources/Orb/iloveimg-resized/orb_red.png");
    this.load.image("orb_blue",     "./assets/resources/Orb/iloveimg-resized/orb_blue.png");
    this.load.image("orb_purple",   "./assets/resources/Orb/iloveimg-resized/orb_purple.png");
    this.load.image("orb_orange2",  "./assets/resources/Orb/orb_orange2.png");
    this.load.image("orb_red2",     "./assets/resources/Orb/orb_red2.png");
    this.load.image("orb_blue2",    "./assets/resources/Orb/orb_blue2.png");
    this.load.image("orb_purple2",  "./assets/resources/Orb/orb_purple2.png");
    this.load.image("coin",         "./assets/ui/shared/coin.png");
    this.load.image("coinm",        "./assets/ui/shared/coinm.png");
    this.load.image("close_btn",    "./assets/ui/shared/close.png");
    this.load.image("close_icon",   "./assets/ui/shared/close.png");

    // Fire arrow frames for ô 28 skill effect
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");
      this.load.image(`fire_arrow_${frame}`,
        `./assets/characters/craftpix-net-381552-free-water-and-fire-magic-sprite-vector-pack/Fire Arrow/PNG/Fire Arrow_Frame_${frame}.png`);
    }

    // Water Ball frames for tax boost effect
    for (let i = 1; i <= 12; i++) {
      const frame = String(i).padStart(2, "0");
      this.load.image(`water_ball_${frame}`,
        `./assets/characters/craftpix-net-381552-free-water-and-fire-magic-sprite-vector-pack/Water Ball/PNG/Water Ball_Frame_${frame}.png`);
    }
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");
      this.load.image(`fire_ball_${frame}`,
        `./assets/characters/craftpix-net-381552-free-water-and-fire-magic-sprite-vector-pack/Fire Ball/PNG/Fire Ball_Frame_${frame}.png`);
    }

    // Hoạt ảnh tác động Nước (Water4 - 16 frames) & Lửa/Nổ (flame2 - 16 frames)
    for (let i = 0; i <= 15; i++) {
      const idx2 = String(i).padStart(2, "0");
      this.load.image(`fx_water4_${idx2}`,
        `./assets/resources/Effect/Water/Water4/Png/water400${idx2}.png`);
      this.load.image(`fx_flame2_${idx2}`,
        `./assets/resources/Effect/Flame/flame2/png/${idx2}.png`);
    }

    // Skill icons pack (50 RPG icons)
    for (let i = 1; i <= 50; i++) {
      this.load.image(`skill_icon_${i}`, `./assets/resources/Skin/PNG/${i}.png`);
    }

    this.load.image("card_slot_small", "./assets/ui/tarot/card.png");
    this.load.image("chat_btn",        "./assets/ui/lobby/chat.png");
    this.load.image("add_friend",      "./assets/ui/shared/friend.png");
    this.load.image("icon_setting",    "./assets/ui/shared/setting.png");
    this.load.image("icon_sound",      "./assets/ui/shared/sound.png");
    this.load.image("icon_music",      "./assets/ui/shared/music.png");
    this.load.image("icon_mic",        "./assets/ui/shared/microphone.png");
    for (let i = 1; i <= 10; i++) {
      const lv = getTarotLevel(this, i);
      if (prepareLevelTexture(this, `tarot_${i}`, lv)) {
        this.load.image(`tarot_${i}`, `./${tarotImagePath(i, lv, true)}`);
      }
      if (prepareLevelTexture(this, `tarot_large_${i}`, lv)) {
        this.load.image(`tarot_large_${i}`, `./${tarotImagePath(i, lv, false)}`);
      }
    }
    this.load.once("complete", () => {
      for (let i = 1; i <= 10; i++) {
        const lv = getTarotLevel(this, i);
        markLevelTexture(this, `tarot_${i}`, lv);
        markLevelTexture(this, `tarot_large_${i}`, lv);
      }
      if (this._onPreloadProgress) {
        this.load.off("progress", this._onPreloadProgress);
        this._onPreloadProgress = null;
      }
      if (this._preloadOverlay) {
        this._preloadOverlay.destroy();
        this._preloadOverlay = null;
      }
    });
  }

  // =====================
  // ANIMATIONS
  // =====================
  createBloodyAnimation() {
    const mCfg = this._npcConfig?.monster;
    if (mCfg?.is_custom && Array.isArray(mCfg.idle_frames) && mCfg.idle_frames.length > 0) {
      const ver = mCfg.version || 0;
      const idleFrames = mCfg.idle_frames
        .map((_, i) => ({ key: `Fantasy_Monster_custom_${ver}_idle_${String(i).padStart(3, "0")}` }))
        .filter(f => this.textures.exists(f.key));
      if (idleFrames.length > 0) {
        if (this.anims.exists("Bloody_Alchemist_1_idle")) this.anims.remove("Bloody_Alchemist_1_idle");
        this.anims.create({ key: "Bloody_Alchemist_1_idle", frames: idleFrames, frameRate: Number(mCfg.fps) || 12, repeat: -1 });
      }
    } else if (!this.anims.exists("Bloody_Alchemist_1_idle")) {
      const idleFrames = [];
      for (let i = 0; i < 16; i++)
        idleFrames.push({ key: `Fantasy_Monster_1_idle_${String(i).padStart(3,"0")}` });
      this.anims.create({ key:"Bloody_Alchemist_1_idle", frames:idleFrames, frameRate:12, repeat:-1 });
    }

    const tCfg = this._npcConfig?.teacher;
    if (tCfg?.is_custom && Array.isArray(tCfg.idle_frames) && tCfg.idle_frames.length > 0) {
      const ver = tCfg.version || 0;
      const teacherFrames = tCfg.idle_frames
        .map((_, i) => ({ key: `Fantasy_Teacher_custom_${ver}_idle_${String(i).padStart(3, "0")}` }))
        .filter(f => this.textures.exists(f.key));
      if (teacherFrames.length > 0) {
        if (this.anims.exists("Fantasy_Teacher_idle")) this.anims.remove("Fantasy_Teacher_idle");
        this.anims.create({ key: "Fantasy_Teacher_idle", frames: teacherFrames, frameRate: Number(tCfg.fps) || 12, repeat: -1 });
      }
    } else if (!this.anims.exists("Fantasy_Teacher_idle")) {
      const teacherFrames = [];
      for (let i = 0; i < 18; i++)
        teacherFrames.push({ key: `Fantasy_Teacher_idle_${String(i).padStart(3,"0")}` });
      this.anims.create({ key:"Fantasy_Teacher_idle", frames:teacherFrames, frameRate:12, repeat:-1 });
    }

    const trCfg = this._npcConfig?.treasure;
    if (trCfg?.is_custom && Array.isArray(trCfg.idle_frames) && trCfg.idle_frames.length > 1) {
      const ver = trCfg.version || 0;
      const trFrames = trCfg.idle_frames
        .map((_, i) => ({ key: `Fantasy_Treasure_custom_${ver}_idle_${String(i).padStart(3, "0")}` }))
        .filter(f => this.textures.exists(f.key));
      if (trFrames.length > 1) {
        if (this.anims.exists("Fantasy_Treasure_custom_idle")) this.anims.remove("Fantasy_Treasure_custom_idle");
        this.anims.create({ key: "Fantasy_Treasure_custom_idle", frames: trFrames, frameRate: Number(trCfg.fps) || 10, repeat: -1 });
      }
    }
  }

  createAllAnimations() {
    this.characters.forEach(character => {
      for (let skin = 1; skin <= 3; skin++) {
        const idleKey = `${character}_${skin}_idle`;
        if (!this.anims.exists(idleKey)) {
          const idleFrames = [];
          for (let i = 0; i < 18; i++)
            idleFrames.push({ key: `${character}_${skin}_idle_${String(i).padStart(3,"0")}` });
          this.anims.create({ key: idleKey, frames: idleFrames, frameRate:12, repeat:-1 });
        }

        const runKey = `${character}_${skin}_run_throw`;
        if (!this.anims.exists(runKey)) {
          const runFrames = [];
          for (let i = 0; i < 12; i++)
            runFrames.push({ key: `${character}_${skin}_run_throw_${i}` });
          this.anims.create({ key: runKey, frames: runFrames, frameRate:18, repeat:-1 });
        }

        const hurtKey = `${character}_${skin}_hurt`;
        if (!this.anims.exists(hurtKey)) {
          const hurtFrames = [];
          for (let i = 0; i < 12; i++)
            hurtFrames.push({ key: `${character}_${skin}_hurt_${String(i).padStart(3,"0")}` });
          this.anims.create({ key: hurtKey, frames: hurtFrames, frameRate:18, repeat:0 });
        }
      }
    });

    // Fire arrow animation for skill cell 28
    if (!this.anims.exists("fire_arrow")) {
      const fireArrowFrames = [];
      for (let i = 1; i <= 8; i++) {
        const frame = String(i).padStart(2, "0");
        fireArrowFrames.push({ key: `fire_arrow_${frame}` });
      }
      this.anims.create({ key: "fire_arrow", frames: fireArrowFrames, frameRate:24, repeat: -1 });
    }

    // Water Ball animation for tax boost
    if (!this.anims.exists("water_ball")) {
      const waterBallFrames = [];
      for (let i = 1; i <= 12; i++) waterBallFrames.push({ key: `water_ball_${String(i).padStart(2,"0")}` });
      this.anims.create({ key: "water_ball", frames: waterBallFrames, frameRate: 20, repeat: -1 });
    }

    // Hunter greeting animation for cell 28 event (hỗ trợ custom attack frames từ Admin)
    const mCfg = this._npcConfig?.monster;
    if (mCfg?.is_custom && Array.isArray(mCfg.idle_frames) && mCfg.idle_frames.length > 0) {
      const ver = mCfg.version || 0;
      const atkList = (Array.isArray(mCfg.attack_frames) && mCfg.attack_frames.length > 0)
        ? mCfg.attack_frames
        : mCfg.idle_frames;
      const customGreet = atkList
        .map((_, i) => ({ key: `Hunter_Greeting_custom_${ver}_${String(i).padStart(3, "0")}` }))
        .filter(f => this.textures.exists(f.key));
      if (customGreet.length > 0) {
        if (this.anims.exists("Hunter_Greeting")) this.anims.remove("Hunter_Greeting");
        if (this.anims.exists("Hunter_Greeting_2")) this.anims.remove("Hunter_Greeting_2");
        const fps = Number(mCfg.fps) || 12;
        this.anims.create({ key: "Hunter_Greeting", frames: customGreet, frameRate: fps, repeat: 0 });
        this.anims.create({ key: "Hunter_Greeting_2", frames: customGreet, frameRate: fps, repeat: 0 });
      }
    } else if (!this.anims.exists("Hunter_Greeting")) {
      const greetingFrames = [];
      for (let i = 0; i < 10; i++) {
        greetingFrames.push({ key: `Hunter_Greeting_${String(i).padStart(3,"0")}` });
      }
      this.anims.create({ key: "Hunter_Greeting", frames: greetingFrames, frameRate:12, repeat:0 });
      this.anims.create({ key: "Hunter_Greeting_2", frames: greetingFrames, frameRate:12, repeat:0 });
    }
  }

updatePlayerTarotSlotsByUserId(userId, tarotIds = []) {
  if (!userId) return;

  const panel = this.playerPanels?.find(p => Number(p.userId) === Number(userId));
  if (!panel || !panel.tarotSlots) return;

  const ids = this._normalizeTarotIds(tarotIds);

  panel.tarotSlots.forEach((slot, index) => {
    const tarotId = Number(ids[index] || 0);
    const cardInfo = (this.tarotCardsByUserId?.[userId] || [])
      .find(c => Number(c.id ?? c.tarot_id) === tarotId);
    const tarotLv = Number(cardInfo?.level) >= 2 ? 2 : 1;
    const texKey = tarotLevelKey(tarotId, tarotLv, true);

    // luôn reset trước
    slot.tarotId = tarotId || null;

    if (tarotId && !this.textures.exists(texKey)) {
      // Load đúng cấp của người chơi này rồi vẽ lại
      ensureTarotLevelTexture(this, tarotId, tarotLv, true, (k) => {
        if (k && slot.tarotId === tarotId) this.updatePlayerTarotSlotsByUserId(userId, ids);
      });
    }

    if (tarotId && this.textures.exists(texKey)) {
      slot.icon.setTexture(texKey);
      slot.icon.setOrigin(0.5);
      slot.icon.setPosition(slot.x + slot.w / 2, slot.y + slot.h / 2);
      // Giữ đúng tỷ lệ ảnh, scale vừa khít slot
      const src = this.textures.get(texKey).getSourceImage();
      const scale = Math.min(slot.w / src.width, slot.h / src.height);
      slot.icon.setScale(scale);
      slot.icon.setAlpha(1);
      slot.icon.setVisible(true);
    } else {
      // clear slot cũ để khỏi giữ ảnh thẻ đã bỏ trang bị
      if (this.textures.exists("tarot_slot_empty")) {
        slot.icon.setTexture("tarot_slot_empty");
        slot.icon.setDisplaySize(slot.w, slot.h);
        slot.icon.setVisible(true);
      } else {
        slot.icon.setVisible(false);
      }
      slot.icon?.clearTint();
      slot.icon?.setAlpha(0.96);
      slot.cooldownText?.setVisible(false);
    }
  });
}

  updatePlayerTarotCooldownsByUserId(userId, cooldowns = []) {
    if (!userId) return;

    const panel = this.playerPanels?.find(p => p.userId === userId);
    if (!panel || !panel.tarotSlots) return;

    panel.tarotSlots.forEach((slot, index) => {
      const turnsLeft = Number(cooldowns[index] ?? 0);

      if (turnsLeft > 0) {
        slot.icon?.setTint(0x64748b);
        slot.icon?.setAlpha(0.55);
        slot.cooldownText?.setVisible(true);
        slot.cooldownText?.setText(String(turnsLeft));
        slot.text?.setVisible(false); // ẩn số thứ tự slot khi đang cooldown
      } else {
        slot.icon?.clearTint();
        slot.icon?.setAlpha(0.96);
        slot.cooldownText?.setVisible(false);
        slot.text?.setVisible(true); // hiện lại số thứ tự slot
      }
    });
  }

  // =====================
  // LIGHTNING AURA
  // =====================
  createLightningAura(x, y, minRatio) {
    const S = minRatio, NUM_BOLTS = 3, RX = 42*S, RY = 14*S, SPEED = 2200;
    for (let i = 0; i < NUM_BOLTS; i++)
      this.spawnLightningBolt(x, y, S, RX, RY, SPEED, (i/NUM_BOLTS)*Math.PI*2);
  }

  spawnLightningBolt(cx, cy, S, rx, ry, speed, startAngle,
    colorOuter=0x44aaff, colorMid=0x99ddff, colorHead=0x88ccff) {
    const g = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    let angle = startAngle;
    const ARC_LENGTH = Math.PI * 0.55, SEGMENTS = 10;
    this.time.addEvent({ delay:16, loop:true, callback: () => {
      g.clear();
      angle += (Math.PI*2)/(speed/16);
      const pts = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const a = angle + (i/SEGMENTS)*ARC_LENGTH;
        const noise = (Math.random()-0.5)*7*S;
        pts.push({ x: cx+Math.cos(a)*(rx+noise), y: cy+Math.sin(a)*(ry+noise*0.4) });
      }
      [[3*S,colorOuter,0.25],[1.5*S,colorMid,0.65],[0.6*S,0xffffff,0.9]].forEach(([w,c,a]) => {
        g.lineStyle(w,c,a); g.beginPath(); g.moveTo(pts[0].x,pts[0].y);
        pts.slice(1).forEach(p => g.lineTo(p.x,p.y)); g.strokePath();
      });
      g.fillStyle(0xffffff,0.9); g.fillCircle(pts[0].x,pts[0].y,2*S);
      g.fillStyle(colorHead,0.5); g.fillCircle(pts[0].x,pts[0].y,4*S);
    }});
  }

  // =====================
  // FLAME PARTICLES
  // =====================
  createCharacterAura(x, y, minRatio, colors, fadeColor) {
    const S = minRatio;
    this.time.addEvent({ delay:80, loop:true, callback: () => {
      const angle = Math.random()*Math.PI*2;
      const rx = (30+Math.random()*18)*S, ry = (18+Math.random()*10)*S;
      const fx = x+Math.cos(angle)*rx, fy = y-5*S+Math.sin(angle)*ry;
      const color = colors[Math.floor(Math.random()*colors.length)];
      this.spawnFlameParticle(fx, fy, S, color, fadeColor);
    }});
  }

  spawnFlameParticle(sourceX, sourceY, S, color, fadeColor=0x050816) {
    const size = (2.5+Math.random()*3.5)*S;
    const p = this.add.circle(sourceX+(Math.random()-0.5)*8*S, sourceY, size, color, 0.85)
      .setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    const angle = -Math.PI/2+(Math.random()-0.5)*1.2;
    const speed = (18+Math.random()*14)*S;
    this.tweens.add({
      targets:p, x:sourceX+Math.cos(angle)*speed, y:sourceY+Math.sin(angle)*speed,
      alpha:0, scaleX:0.05, scaleY:0.05,
      duration:900+Math.random()*600, ease:'Sine.easeOut',
      onUpdate: (tw) => { if(tw.progress>0.6) p.setFillStyle(fadeColor,1-tw.progress); },
      onComplete: () => p.destroy()
    });
  }

  // =====================
  // TILE OVERLAY
  // =====================
  createLandTiles(minRatio) {
    const { width, height } = this.scale;
    const FIXED_RX = 28*minRatio, FIXED_RY = 16*minRatio;
    this.boardPath.forEach(cell => {
      const cx = cell.x*width, cy = cell.y*height;
      const g = this.add.graphics().setDepth(1);
      if (cell.type==='skill') { cell.overlay=g; return; }
      g.lineStyle(1.2, 0xffffff, 0.15);
      g.strokeEllipse(cx, cy, FIXED_RX*2, FIXED_RY*2);
      cell.overlay = g; cell.rx = FIXED_RX; cell.ry = FIXED_RY;
    });
  }

  paintCellGlow(cell, hexColor, alpha=0.5) {
    if (!cell.overlay||cell.type==='skill') return;
    const { width, height } = this.scale;
    const minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const cx=cell.x*width, cy=cell.y*height;
    const rx=cell.rx||28*minRatio, ry=cell.ry||16*minRatio;
    cell.overlay.clear();
    const LAYERS=10;
    for (let i=LAYERS; i>=1; i--) {
      const expand=1+(i/LAYERS)*0.7, t=1-(i/LAYERS);
      cell.overlay.fillStyle(hexColor, Math.max(alpha*(t*t)*0.35, 0.005));
      cell.overlay.fillEllipse(cx, cy, rx*2*expand, ry*2*expand);
    }
    cell.overlay.fillStyle(hexColor, alpha*0.25);
    cell.overlay.fillEllipse(cx, cy, rx*0.8, ry*0.8);
    cell.overlay.lineStyle(1, hexColor, 0.15);
    cell.overlay.strokeEllipse(cx, cy, rx*2, ry*2);
  }

  paintCellGlowAnimated(cell, hexColor, level = null) {
    if (cell.type==='skill') return;
    const lv = Math.max(1, Math.min(2, Number(level ?? this.cellStates?.[cell.index]?.level ?? 1)));
    if (cell.glowTimer) { cell.glowTimer.destroy(); cell.glowTimer=null; }
    if (cell.orb) { cell.orb.destroy(); cell.orb=null; }
    if (cell.orbShadow) { cell.orbShadow.destroy(); cell.orbShadow=null; }
    if (cell.orbHalo) { cell.orbHalo.destroy(); cell.orbHalo=null; }
    if (cell.levelBadge) { cell.levelBadge.destroy(); cell.levelBadge=null; }
    if (cell.orbTween) { cell.orbTween.stop(); cell.orbTween=null; }
    if (cell.orbHaloTween) { cell.orbHaloTween.stop(); cell.orbHaloTween=null; }

    const baseAlpha = lv >= 2 ? 0.60 : 0.5;
    this.paintCellGlow(cell, hexColor, baseAlpha);
    let tick=0; cell.glowColor=hexColor; cell.level=lv;
    cell.glowTimer = this.time.addEvent({ delay:16, loop:true, callback: () => {
      tick+=0.03;
      this.paintCellGlow(cell, hexColor, baseAlpha+Math.sin(tick)*0.08);
    }});
    this.spawnCellOrb(cell, hexColor, lv);
  }

  spawnCellOrb(cell, hexColor, level = 1) {
    const lv = Math.max(1, Math.min(2, Number(level || 1)));
    const { width, height } = this.scale;
    const minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const cx=cell.x*width, cy=cell.y*height;
    const orbKey=this.getOrbKeyForColor(hexColor, lv);
    const texImg = this.textures.exists(orbKey) ? this.textures.get(orbKey).getSourceImage() : null;
    const srcW = texImg?.width || 80;
    const targetDisplayW = (lv >= 2 ? 102 : 52) * minRatio;
    const TARGET_SCALE = targetDisplayW / srcW;
    const orbY = cy - (lv >= 2 ? 25 : 18) * minRatio;

    const orbShadow = this.add.ellipse(cx, cy+4*minRatio, (lv>=2?50:35)*minRatio, (lv>=2?10:8)*minRatio, hexColor, 0.01)
      .setDepth(2).setAlpha(0);
    cell.orbShadow=orbShadow;

    const orb = this.add.image(cx, orbY, orbKey).setScale(0).setDepth(3).setAlpha(0);
    cell.orb=orb;

    this.tweens.add({ targets:[orb, orbShadow], alpha:{value:0.96,ease:'Power2'}, duration:450, ease:'Back.easeOut' });
    this.tweens.add({ targets:orb, scaleX:TARGET_SCALE, scaleY:TARGET_SCALE, duration:500, ease:'Back.easeOut',
      onComplete: () => {
        if (!orb.active) return;
        cell.orbTween = this.tweens.add({ targets:orb, y:orbY - 6*minRatio, duration:1400, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
        this.tweens.add({ targets:orbShadow, scaleX:0.7, scaleY:0.7, alpha:0.12, duration:1100, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
      }
    });
  }

  clearCell(cell) {
    if (cell.glowTimer) { cell.glowTimer.destroy(); cell.glowTimer=null; }
    if (cell.orbHaloTween) { cell.orbHaloTween.stop(); cell.orbHaloTween=null; }
    if (cell.comboBadge) { cell.comboBadge.destroy(); cell.comboBadge=null; }
    const toFade = [cell.orb, cell.orbShadow, cell.orbHalo, cell.levelBadge].filter(Boolean);
    if (toFade.length) {
      this.tweens.add({ targets: toFade, alpha:0, scaleX:0, scaleY:0, duration:250, ease:'Power2',
        onComplete: () => {
          cell.orb?.destroy(); cell.orb=null;
          cell.orbShadow?.destroy(); cell.orbShadow=null;
          cell.orbHalo?.destroy(); cell.orbHalo=null;
          cell.levelBadge?.destroy(); cell.levelBadge=null;
        }
      });
    }
    if (cell.orbTween) { cell.orbTween.stop(); cell.orbTween=null; }
    if (!cell.overlay||cell.type==='skill') return;
    const { width, height } = this.scale;
    const minRatio=Math.min(width/this.originalWidth,height/this.originalHeight);
    const cx=cell.x*width, cy=cell.y*height;
    const rx=cell.rx||28*minRatio, ry=cell.ry||16*minRatio;
    cell.overlay.clear();
    cell.overlay.lineStyle(1.2, 0xffffff, 0.05);
    cell.overlay.strokeEllipse(cx, cy, rx*2, ry*2);
  }

  getOrbKeyForColor(hexColor, level = 1) {
    const suffix = Number(level) >= 2 ? "2" : "";
    const base = { 0xff7700:"orb_orange", 0xff2233:"orb_red", 0x2266ff:"orb_blue", 0x9933ff:"orb_purple" }[hexColor]||"orb_blue";
    const key = base + suffix;
    return this.textures.exists(key) ? key : base;
  }

  _playCellLevelUpFX(cell, hexColor, newLevel = 2) {
    if (!cell) return;
    const { width, height } = this.scale;
    const S = Math.min(width / this.originalWidth, height / this.originalHeight);
    const cx = cell.x * width, cy = cell.y * height;
    const ringColor = newLevel >= 2 ? 0xffd700 : hexColor;

    const ring = this.add.circle(cx, cy - 12 * S, 24 * S, ringColor, 0.35)
      .setStrokeStyle(3.5 * S, 0xffffff, 0.95).setDepth(35);
    this.tweens.add({
      targets: ring, scaleX: 2.3, scaleY: 2.3, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10;
      const dot = this.add.circle(cx, cy - 16 * S, 3.5 * S, newLevel >= 2 ? 0xffe44d : hexColor, 1)
        .setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(ang) * 42 * S,
        y: (cy - 22 * S) + Math.sin(ang) * 28 * S - 18 * S,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: 600, ease: 'Sine.easeOut',
        onComplete: () => dot.destroy()
      });
    }

    const label = newLevel >= 2 ? "🪽 LÊN CẤP 2!" : "✨ CHIẾM LĨNH!";
    this._playFloatingBadge?.(cx, cy - 52 * S, label, newLevel >= 2 ? "#ffe066" : "#7dd3fc");
  }

  _refreshAllCellComboBadges() {
    if (!this.boardPath || !this.cellStates) return;
    const { width, height } = this.scale;
    const S = Math.min(width / this.originalWidth, height / this.originalHeight);
    const total = this.boardPath.length;

    // Xóa comboBadge cũ trước
    this.boardPath.forEach(cell => {
      if (cell?.comboBadge) { cell.comboBadge.destroy(); cell.comboBadge = null; }
    });

    Object.entries(this.cellStates).forEach(([idxStr, cs]) => {
      const idx = Number(idxStr);
      const cell = this.boardPath[idx];
      if (!cell || cell.type === 'skill' || !cs?.owner_user_id) return;
      const uid = Number(cs.owner_user_id);

      let left = 0;
      for (let step = 1; step < total; step++) {
        const ni = (idx - step + total) % total;
        const nc = this.boardPath[ni];
        if (!nc || nc.type === 'skill') break;
        const ncs = this.cellStates[ni];
        if (!ncs || Number(ncs.owner_user_id) !== uid) break;
        left++;
      }
      let right = 0;
      for (let step = 1; step < total; step++) {
        const ni = (idx + step) % total;
        const nc = this.boardPath[ni];
        if (!nc || nc.type === 'skill') break;
        const ncs = this.cellStates[ni];
        if (!ncs || Number(ncs.owner_user_id) !== uid) break;
        right++;
      }

      const chainLen = 1 + left + right;
      if (chainLen >= 2) {
        const cx = cell.x * width, cy = cell.y * height;
        const txt = chainLen >= 3 ? "🔗+35%" : "🔗+20%";
        cell.comboBadge = this.add.text(cx, cy - 42 * S, txt, {
          fontFamily: "Signika",
          fontSize: Math.max(8, Math.floor(9.5 * S)) + "px",
          color: chainLen >= 3 ? "#fde047" : "#86efac",
          fontStyle: "bold",
          backgroundColor: "#00000099",
          padding: { left: 3, right: 3, top: 1, bottom: 1 },
          stroke: "#000000",
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(4.8);
      }
    });
  }

  debugAllCells(minRatio) {
    const FOUR_COLORS=[0x9933ff,0x2266ff,0xff2233,0xff7700];
    this.boardPath.forEach(cell => {
      if (cell.type==='skill') return;
      this.paintCellGlowAnimated(cell, FOUR_COLORS[cell.index%4]);
    });
  }

  // =====================
  // DICE SPRITE (scene-level, hiện sau handoff)
  // =====================
  createDiceAnimations() {
    if (this.anims.exists("dice_blur_spin")) return;
    const blurFrames = [];
    for (let i=1;i<=6;i++) blurFrames.push({key:`dice_blur_${i}`});
    this.anims.create({ key:"dice_blur_spin", frames:blurFrames, frameRate:18, repeat:-1 });
  }

  createDiceSprite(minRatio) {
    const { width, height } = this.scale;
    const cx=0.508*width, cy=0.414*height;
    const gapX = 48 * minRatio;
    const gapY = 16 * minRatio;

    this.diceShadow = this.add.ellipse(cx-gapX-8*minRatio, cy-gapY+30*minRatio, 56*minRatio, 26*minRatio, 0x000000, 0.42)
      .setOrigin(0.5).setDepth(29).setVisible(false);

    this.diceSprite = this.add.sprite(cx-gapX, cy-gapY, "dice_1")
      .setDepth(30).setScale(0.54*minRatio).setVisible(false);

    this.diceShadow2 = this.add.ellipse(cx+gapX-8*minRatio, cy+gapY+30*minRatio, 56*minRatio, 26*minRatio, 0x000000, 0.42)
      .setOrigin(0.5).setDepth(29).setVisible(false);

    this.diceSprite2 = this.add.sprite(cx+gapX, cy+gapY, "dice_1")
      .setDepth(30).setScale(0.54*minRatio).setVisible(false);

    this.diceTween = null;
    // Gentle idle float — hữu ích khi diceSprite hiện trong scene
    this.tweens.add({ targets:[this.diceSprite, this.diceSprite2], y:"-=10", duration:1000, yoyo:true, repeat:-1, ease:"Sine.easeInOut" });
  }

  // startDiceRollAnimation cũ — vẫn giữ lại cho khả năng tương thích
  // nhưng khi dùng PowerDice thì _onDiceHandoff gọi _showDiceSpriteResult thay thế
  startDiceRollAnimation(result, onResultReady) {
    const { width, height } = this.scale;
    const cx=width/2, cy=height*0.4;
    this.diceSprite.setPosition(cx,cy);
    this.diceShadow.setPosition(cx,cy+30);
    this.diceSprite.setTexture("dice_blur_1").setVisible(true).setAlpha(1).setAngle(0);
    this.diceShadow.setVisible(true);
    this.diceSprite.play("dice_blur_spin");
    if (this.diceTween) this.diceTween.stop();
    this.diceTween = this.tweens.add({ targets:this.diceSprite, angle:360, duration:250, repeat:4, ease:"Cubic.easeOut" });
    this.time.delayedCall(1000, () => {
      this.diceSprite.anims.stop();
      if (this.diceTween) this.diceTween.stop();
      this.diceSprite.setAngle(0).setTexture(`dice_${result}`);
      this.time.delayedCall(1000, () => { if (onResultReady) onResultReady(); });
    });
  }

  // =====================
  // OTHER PLAYERS
  // =====================
  addOtherPlayer(playerData) {
    if (!playerData || playerData.id === this.socket.id) return;
    const myUid = this._myUserId();
    if (playerData.user_id && myUid && Number(playerData.user_id) === Number(myUid)) return;

    // Xóa sprite cũ nếu trùng socket_id hoặc user_id để không bao giờ bị nhân đôi
    Object.keys(this.otherPlayers).forEach((k) => {
      const existing = this.otherPlayers[k];
      const sameSid = k === playerData.id;
      const sameUid = playerData.user_id && existing?.user_id && Number(existing.user_id) === Number(playerData.user_id);
      if (sameSid || sameUid) {
        existing?.shadow?.destroy();
        existing?.nameText?.destroy();
        existing?.destroy();
        delete this.otherPlayers[k];
      }
    });

    const { width, height } = this.scale;
    const minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const cell = this.boardPath[playerData.index||0];
    if (!cell) return;
    const x=cell.x*width, y=cell.y*height;
    const skin=playerData.skin||1, character=playerData.characterName||'Dark_Oracle';
    if (!this.anims.exists(`${character}_${skin}_idle`)) this.createAllAnimations();

    const op = this.add.sprite(x,y,`${character}_${skin}_idle_000`)
      .setScale(0.24*minRatio).setOrigin(0.5,0.8).setDepth(5);
    op.play(`${character}_${skin}_idle`);
    op.index = playerData.index||0;

    const shadow = this.add.ellipse(x,y+5,35*minRatio,14*minRatio,0x000000,0.35)
      .setOrigin(0.5).setDepth(4);
    op.shadow = shadow;

    const displayName = playerData.name || "Player";

    let planetColor = playerData.planet_color;
    if (!planetColor && this.gamePlayers?.length) {
      const gp = this.gamePlayers.find(p => p.socket_id === playerData.id || p.user_id === playerData.user_id);
      planetColor = gp?.planet_color;
    }

    const nameColor = this._getPlayerColor(planetColor);

    const nameText = this.add.text(x, y - 140 * minRatio, displayName, {
        fontSize: Math.floor(28 * minRatio) + "px", // Tăng từ 20px lên 28px
        fontFamily: "Signika",
        color: nameColor, // Áp dụng màu ở đây
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 5, // Tăng độ dày viền cho rõ
        shadow: { offsetX: 1, offsetY: 2, color: "#000000", blur: 3, fill: true }
    })
    .setOrigin(0.5)
    .setDepth(11); // Đảm bảo luôn hiện trên đầu nhân vật
    
    op.nameText = nameText;
    op.user_id = playerData.user_id || null;
    op.planet_color = planetColor || null;
    if (this._isIntroRunning) {
      op.setAlpha(0);
      shadow.setAlpha(0);
      nameText.setAlpha(0);
    }
    this.otherPlayers[playerData.id] = op;
  }

  // =====================
  // CREATE
  // =====================
  create(data) {
    const { width, height } = this.scale;

    let playerData = getPlayerData(this);
    if (!playerData && data?.demoMode) {
      playerData = {
        token: "demo_token",
        user: { id: 1, name: data.name || "Đức Phạm", active_avatar_id: 1, ecoin: 100000 },
      };
      this.registry.set("playerData", playerData);
    }
    if (!playerData) { this.scene.start("LoginScene"); return; }

    setupClickSound(this);
    this.events.once("shutdown", () => this.shutdown());

    this.gameRoomId = data?.roomData?.id || null;
    this._isIntroRunning = false;
    this._introPlayedOnce = false;
    this._introTimers = [];

    const activeProfile = getActiveProfile(this);

    if (data?.characterName) {
      this.playerName    = data.name || playerData?.user?.name || "Player";
      this.mySkin        = data.skin ?? activeProfile.skin_id ?? 1;
      this.characterName = data.characterName || activeProfile.characterName || "Dark_Oracle";
    } else {
      this.playerName    = playerData?.user?.name || "Player";
      this.characterName = activeProfile.characterName || "Dark_Oracle";
      this.mySkin        = activeProfile.skin_id || 1;
    }

    const customBgKey = this._activeMapConfig?.is_custom
      ? `bg_custom_${this._activeMapConfig.version || 0}`
      : null;
    const bgTex = (customBgKey && this.textures.exists(customBgKey)) ? customBgKey : "bg";
    const bg = this.add.image(width/2, height/2, bgTex).setDisplaySize(width, height);
    this.minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const minRatio = this.minRatio;

    // ── Loading screen — hiện ngay khi vào, ẩn sau game:init ─────
    this._buildLoadingScreen(width, height, data);

    // Fallback: nếu sau 15s game:init vẫn chưa về thì tự ẩn (dùng setTimeout native tránh throttle)
    this._loadingFallbackTimer = setTimeout(() => {
      this._hideLoadingScreen();
    }, 15000);

    const saved = localStorage.getItem("gameState");
    if (saved) { try { this.currentIndex = JSON.parse(saved).currentIndex||0; } catch(e){} }
    this.currentIndex = this.currentIndex || 0;

    const token = playerData?.token;
    this._isDemoMode = Boolean(data?.demoMode);
    if (this._isDemoMode) {
      this.socket = createDemoMockSocket();
      mountBoardDemoSandbox(this, this.socket);
    } else {
      this.socket = io(SERVER_URL, {
        transports:['websocket','polling'],
        reconnection:true,
        reconnectionAttempts:10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout:20000,
        auth:{ token }
      });
    }

    // ── Flag reconnect (vào lại từ ván đang dở) ───────────────────
    this._isReconnecting = !!(data?._reconnecting);

    this.socket.on("connect", () => {
      this.socket.emit("join", {
        room_id:       this.gameRoomId,
        name:          playerData?.user?.name || "Player",
        user_id:       playerData?.user?.id,
        characterName: this.characterName || "Dark_Oracle",
        skin:          this.mySkin || 1
      });
      if (this.gameRoomId) {
        // Dù là lần đầu hay reconnect, luôn request state từ server
        setTimeout(() => {
          this.socket.emit("game:request_state", { room_id: this.gameRoomId });
        }, 400);
      }
    });

    // Xử lý mất kết nối trong ván — tự động thử lại
    this.socket.on("disconnect", (reason) => {
      console.warn("⚠ Socket disconnect trong ván:", reason);
      this._showReconnectingIndicator();
    });
    this.socket.on("reconnect", (attempt) => {
      console.log(`✅ Socket reconnected (attempt ${attempt}), re-requesting game state`);
      this._hideReconnectingIndicator();
      this.socket.emit("join", {
        room_id:       this.gameRoomId,
        name:          playerData?.user?.name || "Player",
        user_id:       playerData?.user?.id,
        characterName: this.characterName || "Dark_Oracle",
        skin:          this.mySkin || 1
      });
      if (this.gameRoomId) {
        setTimeout(() => {
          this.socket.emit("game:request_state", { room_id: this.gameRoomId });
        }, 400);
      }
    });
    this.socket.on("reconnect_failed", () => {
      console.error("❌ Reconnect failed");
      this._hideReconnectingIndicator();
      this._showAlert("Mất kết nối - vui lòng reload trang", "#ff4444", 5000);
    });

    this.setupSocketEvents();

    // ── GAME CHAT ─────────────────────────────────────────────────
    this._buildGameChat(width, height);
    this.boardPath = [
      { index:0,  x:0.24,  y:0.59,  hw:0.022, hh:0.018, name:"START",   type:"skill" },
      { index:1,  x:0.304, y:0.62,  hw:0.027, hh:0.0266,name:"Cell 1",  type:"land"  },
      { index:2,  x:0.355, y:0.63,  hw:0.0199,hh:0.0149,name:"Cell 2",  type:"land"  },
      { index:3,  x:0.402, y:0.61,  hw:0.0115,hh:0.007, name:"Cell 3",  type:"land"  },
      { index:4,  x:0.447, y:0.597, hw:0.023, hh:0.0196,name:"Cell 4",  type:"land"  },
      { index:5,  x:0.487, y:0.626, hw:0.0248,hh:0.0266,name:"Cell 5",  type:"land"  },
      { index:6,  x:0.52,  y:0.662, hw:0.0256,hh:0.0297,name:"Cell 6",  type:"land"  },
      { index:7,  x:0.566, y:0.69,  hw:0.0256,hh:0.0235,name:"Cell 7",  type:"land"  },
      { index:8,  x:0.621, y:0.695, hw:0.0212,hh:0.0133,name:"Cell 8",  type:"land"  },
      { index:9,  x:0.68,  y:0.665, hw:0.022, hh:0.018, name:"Cell 9",  type:"skill" },
      { index:10, x:0.732, y:0.634, hw:0.022, hh:0.018, name:"Cell 10", type:"land"  },
      { index:11, x:0.767, y:0.592, hw:0.020, hh:0.017, name:"Cell 11", type:"land"  },
      { index:12, x:0.8,   y:0.557, hw:0.020, hh:0.017, name:"Cell 12", type:"land"  },
      { index:13, x:0.834, y:0.518, hw:0.018, hh:0.016, name:"Cell 13", type:"land"  },
      { index:14, x:0.86,  y:0.47,  hw:0.0102,hh:0.018, name:"Cell 14", type:"land"  },
      { index:15, x:0.847, y:0.415, hw:0.0225,hh:0.025, name:"Cell 15", type:"land"  },
      { index:16, x:0.809, y:0.39,  hw:0.0212,hh:0.0157,name:"Cell 16", type:"land"  },
      { index:17, x:0.765, y:0.409, hw:0.0225,hh:0.0227,name:"Cell 17", type:"land"  },
      { index:18, x:0.72,  y:0.425, hw:0.022, hh:0.018, name:"Cell 18", type:"skill" },
      { index:19, x:0.67,  y:0.43,  hw:0.0212,hh:0.0196,name:"Cell 19", type:"land"  },
      { index:20, x:0.635, y:0.405, hw:0.0217,hh:0.0227,name:"Cell 20", type:"land"  },
      { index:21, x:0.607, y:0.372, hw:0.0212,hh:0.0282,name:"Cell 21", type:"land"  },
      { index:22, x:0.594, y:0.325, hw:0.019, hh:0.025, name:"Cell 22", type:"land"  },
      { index:23, x:0.583, y:0.277, hw:0.0111,hh:0.0149,name:"Cell 23", type:"land"  },
      { index:24, x:0.574, y:0.230, hw:0.0181,hh:0.0235,name:"Cell 24", type:"land"  },
      { index:25, x:0.541, y:0.198, hw:0.0212,hh:0.0211,name:"Cell 25", type:"land"  },
      { index:26, x:0.501, y:0.189, hw:0.019, hh:0.0125,name:"Cell 26", type:"land"  },
      { index:27, x:0.46,  y:0.198, hw:0.0119,hh:0.0078,name:"Cell 27", type:"land"  },
      { index:28, x:0.416, y:0.212, hw:0.022, hh:0.018, name:"Cell 28", type:"skill" },
      { index:29, x:0.374, y:0.234, hw:0.018, hh:0.015, name:"Cell 29", type:"land"  },
      { index:30, x:0.335, y:0.261, hw:0.0248,hh:0.0235,name:"Cell 30", type:"land"  },
      { index:31, x:0.304, y:0.294, hw:0.018, hh:0.016, name:"Cell 31", type:"land"  },
      { index:32, x:0.289, y:0.343, hw:0.0199,hh:0.0235,name:"Cell 32", type:"land"  },
      { index:33, x:0.32,  y:0.382, hw:0.0239,hh:0.0219,name:"Cell 33", type:"land"  },
      { index:34, x:0.336, y:0.431, hw:0.0141,hh:0.0164,name:"Cell 34", type:"land"  },
      { index:35, x:0.314, y:0.476, hw:0.0261,hh:0.0227,name:"Cell 35", type:"land"  },
      { index:36, x:0.274, y:0.52,  hw:0.0261,hh:0.0258,name:"Cell 36", type:"land"  },
    ];

    // Ghi đè tọa độ 37 ô nếu Admin đang kích hoạt bản đồ tùy biến
    if (Array.isArray(this._activeMapConfig?.board_path) && this._activeMapConfig.board_path.length === 37) {
      this.boardPath = this._activeMapConfig.board_path.map(c => ({ ...c }));
    }

    this.createLandTiles(minRatio);
    this.createBloodyAnimation();

    // this.debugAllCells(minRatio);

this.input.keyboard.on("keydown-T", () => {
  console.log("TEST ô 24");

  this.currentIndex = 24;
  const cell = this.boardPath[24];
  const x = cell.x * this.scale.width;
  const y = cell.y * this.scale.height;

  this.player.setPosition(x, y);
  this.shadow?.setPosition(x, y + 5);
  this.playerNameText?.setPosition(x, y - 140 * this.minRatio);

  this._startDarkMapEffect();
  // this._showSkillPanel({
  //   title: "PHÁ HỦY",
  //   text: "TEST hiệu ứng ô 24",
  //   icon: "orb_red"
  // });
});

this.input.keyboard.on("keydown-Y", () => {
  console.log("TEST ô 14");

  this.currentIndex = 14;
  const cell = this.boardPath[14];
  const x = cell.x * this.scale.width;
  const y = cell.y * this.scale.height;

  this.player.setPosition(x, y);
  this.shadow?.setPosition(x, y + 5);
  this.playerNameText?.setPosition(x, y - 140 * this.minRatio);

  this._startDarkMapEffect();
  // this._showSkillPanel({
  //   title: "PHÁ HỦY",
  //   text: "TEST hiệu ứng ô 24",
  //   icon: "orb_red"
  // });
});


    // NPC: Quái vật tại ô 28 (hỗ trợ custom sprite & scale từ Admin Sprite Studio)
    const mCfgSpawn = this._npcConfig?.monster;
    const mKey0 = (mCfgSpawn?.is_custom && this.textures.exists(`Fantasy_Monster_custom_${mCfgSpawn.version || 0}_idle_000`))
      ? `Fantasy_Monster_custom_${mCfgSpawn.version || 0}_idle_000`
      : "Fantasy_Monster_1_idle_000";
    const mScaleMult = Number(mCfgSpawn?.scale) || 1;
    const c28 = this.boardPath[28];
    const hx = c28.x * width;
    const tileY = c28.y * height + 2 * minRatio;
    const hy = tileY + 25 * minRatio;
    this.bloody = this.add.sprite(hx, hy, mKey0)
      .setScale(0.315 * mScaleMult * minRatio).setOrigin(0.5, 0.85).setDepth(6);
    this.bloodyBaseScale = 0.315 * mScaleMult * minRatio;
    this.bloodyBaseDepth = 6;
    this.bloody.play("Bloody_Alchemist_1_idle");
    this.createCharacterAura(hx, tileY - 10 * minRatio, minRatio,[0x4a6cff,0x4a6cff,0x2f4fd1,0x4a6cff,0x6688ff,0x1b2f75],0x050816);
    this.createLightningAura(hx, tileY, minRatio);
    this.add.ellipse(hx, tileY, 44*minRatio, 18*minRatio, 0x000000, 0.35).setDepth(5);

    // NPC: Teacher tại ô 18 (hỗ trợ custom sprite & scale từ Admin Sprite Studio)
    const tCfgSpawn = this._npcConfig?.teacher;
    const tKey0 = (tCfgSpawn?.is_custom && this.textures.exists(`Fantasy_Teacher_custom_${tCfgSpawn.version || 0}_idle_000`))
      ? `Fantasy_Teacher_custom_${tCfgSpawn.version || 0}_idle_000`
      : "Fantasy_Teacher_idle_000";
    const tScaleMult = Number(tCfgSpawn?.scale) || 1;
    const c18 = this.boardPath[18];
    const tx=c18.x*(width-4), ty=c18.y*(height-17);
    this.teacher = this.add.sprite(tx, ty, tKey0)
      .setScale(0.22 * tScaleMult * minRatio).setOrigin(0.5,0.8).setDepth(6);
    this.teacher.play("Fantasy_Teacher_idle");
    this.createCharacterAura(tx,ty,minRatio,[0xffdd00,0xffdd00,0xffaa00,0xffdd00,0xffee55,0xcc8800],0x1a0e00);
    this.createLightningAura(tx, ty+18*minRatio, minRatio);
    this.add.ellipse(tx, ty+19*minRatio, 35*minRatio, 16*minRatio, 0x000000, 0.35).setDepth(5);

    // NPC: Treasure tại ô 9 (hỗ trợ custom ảnh tĩnh hoặc hoạt ảnh nhiều frame từ Admin Studio)
    const trCfgSpawn = this._npcConfig?.treasure;
    const trVer = trCfgSpawn?.version || 0;
    const trCustomKey0 = `Fantasy_Treasure_custom_${trVer}_idle_000`;
    const trUseCustom = !!(trCfgSpawn?.is_custom && this.textures.exists(trCustomKey0));
    const trScaleMult = Number(trCfgSpawn?.scale) || 1;
    const c9 = this.boardPath[9];
    const trx=c9.x*(width-5), try_=c9.y*(height-7);
    if (trUseCustom && this.anims.exists("Fantasy_Treasure_custom_idle")) {
      this.treasure = this.add.sprite(trx, try_, trCustomKey0)
        .setScale(0.18 * trScaleMult * minRatio).setOrigin(0.5, 0.8).setDepth(6);
      this.treasure.play("Fantasy_Treasure_custom_idle");
    } else {
      this.treasure = this.add.image(trx, try_, trUseCustom ? trCustomKey0 : "treasure")
        .setScale(0.18 * trScaleMult * minRatio).setOrigin(0.5, 0.8).setDepth(6);
    }
    this.add.ellipse(trx, try_+5, 35*minRatio, 14*minRatio, 0x000000, 0.35).setDepth(5);
    for (let i=0;i<4;i++)
      this.spawnLightningBolt(trx,try_+16*minRatio,minRatio,38*minRatio,13*minRatio,1800,(i/4)*Math.PI*2,0xffaa00,0xffdd55,0xffcc00);
    this.tweens.add({ targets:this.treasure, y:try_-4, duration:1200, yoyo:true, repeat:-1, ease:"Sine.easeInOut" });

    this.enableCoordinateDebug();
    this.createAllAnimations();
    this.initPlayer(minRatio);
    this.createDiceAnimations();
    this.createDiceSprite(minRatio);
    this.createUI(minRatio);

    // PowerDice — gắn callback để nhận yêu cầu tung
    this.powerDice = new PowerDiceSystem(this);
    this.powerDice.create(minRatio);

    // ── Tarot Modal System ──
    this.tarotModal = new TarotModalSystem(this);

    // ── Card System (turn-based cooldown + effect logic) ──
    this.cardSystem = new CardSystem(this);
    this.cardSystem.on('card:cooldown_tick', ({ userId }) => {
      this._refreshPlayerTarotCooldownByUserId(userId);
    });

    // ── Tarot Button Widget ──
    this.tarotBtn = new TarotButtonWidget(this, this.tarotModal);
    this.tarotBtn.create(minRatio);

    // ── Character Skill Widget ──
    this.charSkillWidget = new CharSkillWidget(this);
    this._showSkillToast = (msg) => this._showToast(msg, "#ffe066", 2400);

    // Target arrow
    this.targetArrow = this.add.image(0,0,"target_arrow")
      .setVisible(false).setDepth(20).setOrigin(0.5,1).setScale(1*minRatio);
    this.targetArrowTween = null;

    // Keyboard handler — chỉ Space để bắt đầu giữ, R để reset, F9 mở thanh Demo
    this.input.keyboard.on("keydown-SPACE", () => this.handleSpacePress());
    this.input.keyboard.on("keyup-SPACE",   () => this.handleSpaceRelease());
    this.input.keyboard.on("keydown-R",     () => this.resetPlayer());

    if (this._onDemoKeyDown) window.removeEventListener("keydown", this._onDemoKeyDown);
    this._onDemoKeyDown = (e) => {
      if (e.key === "F9") {
        e.preventDefault();
        this._toggleDemoPanel();
      }
    };
    window.addEventListener("keydown", this._onDemoKeyDown);
  }

  // =====================
  // TARGET ARROW
  // =====================
  showTargetArrow(cellIndex) {
    const cell = this.boardPath[cellIndex];
    const { width, height } = this.scale;
    const x=cell.x*width, y=cell.y*height;
    if (this.targetArrowTween) this.targetArrowTween.stop();
    this.targetArrow.setPosition(x, y-1).setVisible(true).setAlpha(1);
    this.targetArrowTween = this.tweens.add({ targets:this.targetArrow, y:y-15, duration:500, yoyo:true, repeat:-1, ease:"Sine.easeInOut" });
  }

  hideTargetArrow() {
    if (this.targetArrowTween) { this.targetArrowTween.stop(); this.targetArrowTween=null; }
    this.targetArrow.setVisible(false);
  }

  // =====================
  // PLAYER
  // =====================
  initPlayer(minRatio) {
    const { width, height } = this.scale;
    this.isMoving = false;
    const startCell = this.boardPath[this.currentIndex||0];
    const px=startCell.x*width, py=startCell.y*height;
    const skin=this.mySkin||1, character=this.characterName||'Dark_Oracle';

    this.player = this.add.sprite(px,py,`${character}_${skin}_idle_000`)
      .setScale(0.24*minRatio).setOrigin(0.5,0.8).setDepth(10);
    this.playerBaseScale = 0.24*minRatio;
    this.player.play(`${character}_${skin}_idle`);

    this.shadow = this.add.ellipse(px, py+5, 35*minRatio, 14*minRatio, 0x000000, 0.35)
      .setOrigin(0.5).setDepth(9);

    this.playerNameText = this.add.text(px, py - 140 * minRatio, this.playerName, {
        fontSize: Math.floor(28 * minRatio) + "px", // Tăng kích thước
        fontFamily: "Signika",
        color: "#ffffff", 
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 5,
        shadow: { offsetX: 1, offsetY: 2, color: "#000000", blur: 3, fill: true }
    }).setOrigin(0.5).setDepth(11);
  }

  // =====================
  // PLAYER PANELS
  // =====================
  createPlayerPanels(minRatio) {
    const { width, height } = this.scale;

    const playerCount = Math.max(2, Math.min(4, this.gamePlayers?.length || 4));

    const planetColors = {
      purple: { color: 0xc084fc, dark: 0x6b21a8 },
      red:    { color: 0xff4444, dark: 0xb91c1c },
      blue:   { color: 0x60a5fa, dark: 0x1e40af },
      orange: { color: 0xfb923c, dark: 0xc2410c }
    };

    const layouts = {
      2: [
        { id: "p1", corner: "top-left" },
        { id: "p2", corner: "bottom-right" }
      ],
      3: [
        { id: "p1", corner: "top-left" },
        { id: "p2", corner: "top-right" },
        { id: "p3", corner: "bottom-right" }
      ],
      4: [
        { id: "p1", corner: "top-left" },
        { id: "p2", corner: "bottom-left" },
        { id: "p3", corner: "top-right" },
        { id: "p4", corner: "bottom-right" }
      ]
    };

    const PLAYERS = layouts[playerCount];

    const PAD = 32 * minRatio;
    const H = 112 * minRatio;
    const PILL_R = H / 2;
    const AVA_R = H * 0.46;
    const TEXT_PAD = 14 * minRatio;
    const TEXT_W = 200 * minRatio;
    const W = AVA_R * 2 + TEXT_PAD + TEXT_W + 18 * minRatio;
    const DEPTH = 50;

    // Kích thước 2 slot bài
    const CARD_W = 50 * minRatio;
    const CARD_H = 66 * minRatio;
    const CARD_GAP = 10 * minRatio;
    const CARD_SEP = 10 * minRatio;

    if (this.playerPanels) {
      this.playerPanels.forEach((p) => {
        Object.values(p._ui || {}).forEach((o) => {
          try { o?.destroy?.(); } catch (e) {}
        });

        if (Array.isArray(p.tarotSlots)) {
          p.tarotSlots.forEach((slot) => {
            Object.values(slot || {}).forEach((o) => {
              try { o?.destroy?.(); } catch (e) {}
            });
          });
        }
      });
    }

    this.playerPanels = [];

    PLAYERS.forEach((p, idx) => {
      const gmPlayer = this.gamePlayers?.[idx];
      const planetColor = gmPlayer?.planet_color || "purple";
      const pc = planetColors[planetColor] || planetColors.purple;
      const orbKey = `orb_${planetColor}`;

      const isLeft = p.corner.includes("left");
      const isTop = p.corner.includes("top");

      const px_ = isLeft ? PAD : width - PAD - W;
      const py_ = isTop ? PAD : height - PAD - H;

      const avaCX = isLeft ? px_ + AVA_R : px_ + W - AVA_R;
      const avaCY = py_ + H / 2;

      const drawHalfRounded = (g, x, y, w, h, r, roundLeft) => {
        g.beginPath();

        if (roundLeft) {
          g.moveTo(x + r, y);
          g.lineTo(x + w, y);
          g.lineTo(x + w, y + h);
          g.lineTo(x + r, y + h);
          g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
          g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
        } else {
          g.moveTo(x, y);
          g.lineTo(x + w - r, y);
          g.arc(x + w - r, y + r, r, Math.PI * 1.5, Math.PI * 2);
          g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
          g.lineTo(x, y + h);
          g.lineTo(x, y);
        }

        g.closePath();
      };

      // ===== Nền panel =====
      const bg1 = this.add.graphics().setDepth(DEPTH);
      bg1.fillStyle(pc.dark, 0.82);
      drawHalfRounded(bg1, px_, py_, W, H, PILL_R, isLeft);
      bg1.fillPath();

      const bg2 = this.add.graphics().setDepth(DEPTH);
      bg2.fillStyle(pc.color, 0.22);
      drawHalfRounded(bg2, px_, py_, W, H * 0.55, PILL_R, isLeft);
      bg2.fillPath();

      const bg3 = this.add.graphics().setDepth(DEPTH);
      bg3.fillStyle(0xffffff, 0.06);
      drawHalfRounded(bg3, px_, py_, W, H * 0.22, PILL_R, isLeft);
      bg3.fillPath();

      const border = this.add.graphics().setDepth(DEPTH + 1);
      border.lineStyle(3 * minRatio, pc.color, 1);
      drawHalfRounded(border, px_, py_, W, H, PILL_R, isLeft);
      border.strokePath();

      border.lineStyle(1 * minRatio, 0xffffff, 0.15);
      drawHalfRounded(
        border,
        px_ + 3 * minRatio,
        py_ + 3 * minRatio,
        W - 6 * minRatio,
        H - 6 * minRatio,
        PILL_R - 2 * minRatio,
        isLeft
      );
      border.strokePath();

      // ===== Avatar =====
      const glowG = this.add.graphics().setDepth(DEPTH + 1);
      glowG.fillStyle(pc.color, 0.20);
      glowG.fillCircle(avaCX, avaCY, AVA_R + 10 * minRatio);
      glowG.fillStyle(pc.color, 0.10);
      glowG.fillCircle(avaCX, avaCY, AVA_R + 18 * minRatio);

      const avaBg = this.add.graphics().setDepth(DEPTH + 2);
      avaBg.fillStyle(pc.dark, 1);
      avaBg.fillCircle(avaCX, avaCY, AVA_R);
      avaBg.lineStyle(4 * minRatio, pc.color, 1);
      avaBg.strokeCircle(avaCX, avaCY, AVA_R);
      avaBg.lineStyle(1.5 * minRatio, 0xffffff, 0.25);
      avaBg.strokeCircle(avaCX, avaCY, AVA_R - 5 * minRatio);

      // ===== Avatar người chơi đang trang bị (thay cho quả tinh cầu) =====
      let fallbackMyAvatar = 1;
      try {
        if (Number(gmPlayer?.user_id) === Number(this._myUserId?.())) {
          const pdLocal = getPlayerData(this);
          const profLocal = getActiveProfile(this);
          fallbackMyAvatar = Number(pdLocal?.user?.active_avatar_id || profLocal?.active_avatar_id || 1);
        }
      } catch (_) {}
      const avatarId = Number(gmPlayer?.active_avatar_id || fallbackMyAvatar || 1);
      const avaOrb = renderAvatarBadge(this, {
        x: avaCX,
        y: avaCY,
        size: Math.round(AVA_R * 1.88),
        avatarId,
        depth: DEPTH + 2.5,
        glow: false,
      });

      // ===== Zone click vào icon/avatar người chơi để xem Profile & Kết bạn =====
      const avaZoneSize = Math.max(64, Math.floor(86 * minRatio));
      const avaZone = this.add.zone(avaCX, avaCY, avaZoneSize, avaZoneSize)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH + 6);
      avaZone.on("pointerover", () => {
        const img = avaOrb?.getMainImage?.();
        if (img?.active) img.setAlpha(0.88);
      });
      avaZone.on("pointerout", () => {
        const img = avaOrb?.getMainImage?.();
        if (img?.active) img.setAlpha(1);
      });
      avaZone.on("pointerdown", () => {
        const target = this.gamePlayers?.[idx];
        if (!target?.user_id) return;
        const myUid = this._myUserId();
        if (this._profilePanel) this._profilePanel.destroy();
        this._profilePanel = new PlayerProfilePanel(this, {
          socket: this.socket,
          depth: 500,
        });
        this._profilePanel.open(width, height, {
          user_id:          target.user_id,
          name:             target.name,
          active_avatar_id: target.active_avatar_id || avatarId,
          character_name:   target.characterName,
          skin_id:          target.skin,
          active_tarot_ids: target.active_tarot_ids || [],
        }, myUid);
      });

      // ===== Badge số thứ tự =====
      const badgeR = 15 * minRatio;
      const badgeX = isLeft ? avaCX - AVA_R * 0.6 : avaCX + AVA_R * 0.6;
      const badgeY = avaCY - AVA_R * 0.72;

      const badge = this.add.graphics().setDepth(DEPTH + 4);
      badge.fillStyle(0xcc2200, 1);
      badge.fillCircle(badgeX, badgeY, badgeR);
      badge.lineStyle(2.5 * minRatio, 0xffdd88, 1);
      badge.strokeCircle(badgeX, badgeY, badgeR);

      const badgeText = this.add.text(badgeX, badgeY, `${idx + 1}`, {
        fontSize: Math.floor(26 * minRatio) + "px",
        fontFamily: "Signika",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2
      }).setOrigin(0.5).setDepth(DEPTH + 5);

      // ===== Text panel =====
      const textX = isLeft ? avaCX + AVA_R + TEXT_PAD : px_ + TEXT_PAD * 0.5;

      const nameBarH = 32 * minRatio;
      const nameBarY = py_ + 12 * minRatio;
      const s1Y = nameBarY + nameBarH + 9 * minRatio;
      const s2Y = s1Y + 22 * minRatio;

      const nameBar = this.add.graphics().setDepth(DEPTH + 1);
      nameBar.fillStyle(pc.color, 1);
      nameBar.fillRoundedRect(textX, nameBarY, TEXT_W, nameBarH, 5 * minRatio);
      nameBar.fillStyle(0xffffff, 0.15);
      nameBar.fillRoundedRect(textX, nameBarY, TEXT_W, nameBarH * 0.45, 5 * minRatio);

      const initCash = Number(gmPlayer?.cash ?? 0);
      const invested = this._calculateInvestedAmount(gmPlayer?.user_id);
      const initAsset = initCash + invested;

      const nameText = this.add.text(
        textX + TEXT_W / 2,
        nameBarY + nameBarH / 2,
        gmPlayer?.name || `Player ${idx + 1}`,
        {
          fontSize: Math.floor(22 * minRatio) + "px",
          fontFamily: "Signika",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#00000088",
          strokeThickness: 3
        }
      ).setOrigin(0.5).setDepth(DEPTH + 2);

      const faceLabel = this.add.text(textX + 5 * minRatio, s1Y, "T.mặt:", {
        fontSize: Math.floor(20 * minRatio) + "px",
        fontFamily: "Signika",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#00000099",
        strokeThickness: 2
      }).setOrigin(0, 0).setDepth(DEPTH + 2);

      const statVal1 = this.add.text(textX + 72 * minRatio, s1Y, this._formatMoney(initCash), {
        fontSize: Math.floor(20 * minRatio) + "px",
        fontFamily: "Signika",
        color: "#ffee55",
        fontStyle: "bold",
        stroke: "#00000099",
        strokeThickness: 2
      }).setOrigin(0, 0).setDepth(DEPTH + 2);

      const assetLabel = this.add.text(textX + 5 * minRatio, s2Y, "T.sản:", {
        fontSize: Math.floor(20 * minRatio) + "px",
        fontFamily: "Signika",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#00000099",
        strokeThickness: 2
      }).setOrigin(0, 0).setDepth(DEPTH + 2);

      const statVal2 = this.add.text(textX + 72 * minRatio, s2Y, this._formatMoney(initAsset), {
        fontSize: Math.floor(20 * minRatio) + "px",
        fontFamily: "Signika",
        color: "#66ddff",
        fontStyle: "bold",
        stroke: "#00000099",
        strokeThickness: 2
      }).setOrigin(0, 0).setDepth(DEPTH + 2);

      // ===== 2 slot thẻ bài nhỏ =====
      const cardX = isLeft ? px_ + W + CARD_SEP : px_ - CARD_SEP - CARD_W;
      const cardTotalH = CARD_H * 2 + CARD_GAP;
      const card1Y = py_ + (H - cardTotalH) / 2;

      p.tarotSlots = [];

      [0, 1].forEach((ci) => {
        const cY = card1Y + ci * (CARD_H + CARD_GAP);

        const cardShadow = this.add.graphics().setDepth(DEPTH + 1);
        cardShadow.fillStyle(0x000000, 0.01);
        cardShadow.fillRoundedRect(
          cardX + 2 * minRatio,
          cY + 3 * minRatio,
          CARD_W,
          CARD_H,
          6 * minRatio
        );

        const cardBg = this.add.graphics().setDepth(DEPTH + 2);
        cardBg.fillStyle(0x12182c, 0.58);
        cardBg.fillRoundedRect(cardX, cY, CARD_W, CARD_H, 6 * minRatio);

        cardBg.fillStyle(pc.color, 0.10);
        cardBg.fillRoundedRect(cardX, cY, CARD_W, CARD_H * 0.38, 6 * minRatio);

        const slotText = this.add.text(
          cardX + CARD_W / 2,
          cY + 7 * minRatio,
          `${ci + 1}`,
          {
            fontSize: Math.floor(16 * minRatio) + "px",
            fontFamily: "Signika",
            color: "#ffe6a3",
            fontStyle: "bold"
          }
        ).setOrigin(0.5, 0).setDepth(DEPTH + 4);

        const icon = this.add.image(
          cardX + CARD_W / 2,
          cY + CARD_H * 0.58,
          orbKey
        ).setDepth(DEPTH + 4);

        icon.setDisplaySize(CARD_W * 0.56, CARD_W * 0.56);
        icon.setAlpha(0.96);

        const footer = this.add.graphics().setDepth(DEPTH + 3);
        footer.fillStyle(pc.color, 0.20);
        footer.fillRoundedRect(
          cardX + 5 * minRatio,
          cY + CARD_H - 14 * minRatio,
          CARD_W - 10 * minRatio,
          9 * minRatio,
          4 * minRatio
        );

        // Số lượt còn chờ — hiện giữa thẻ bài, to và rõ (không lớp phủ đen, không đồng hồ cát)
        const slotRadius = 6 * minRatio;
        const cooldownText = this.add.text(
          cardX + CARD_W / 2,
          cY + CARD_H * 0.50,
          "0",
          {
            fontFamily: "Signika",
            fontSize: Math.floor(38 * minRatio) + "px",
            color: "#38e8ff",
            fontStyle: "bold",
            stroke: "#020617",
            strokeThickness: Math.floor(5 * minRatio),
            shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 8, fill: true }
          }
        ).setOrigin(0.5, 0.5).setDepth(DEPTH + 8);

        // Ẩn mặc định
        cooldownText.setVisible(false);

        p.tarotSlots.push({
          shadow: cardShadow,
          bg: cardBg,
          text: slotText,
          icon,
          footer,
          cooldownText,
          x: cardX,
          y: cY,
          w: CARD_W,
          h: CARD_H,
          radius: slotRadius
        });
      });

      // ===== Lưu refs =====
      p.nameText = nameText;
      p.statVal1 = statVal1;
      p.statVal2 = statVal2;
      p.userId = gmPlayer?.user_id;
      p.color = pc.color;
      p.orbKey = orbKey;
      p.chatBubbleAnchor = {
        x: isLeft ? (cardX + CARD_W + 12 * minRatio) : (cardX - 12 * minRatio),
        y: py_ + H / 2,
        isLeft,
      };

      p._ui = {
        bg1, bg2, bg3, border,
        glowG, avaBg, avaOrb, avaZone,
        badge, badgeText,
        nameBar, nameText,
        faceLabel, assetLabel,
        statVal1, statVal2
      };

      this.playerPanels.push(p);
    });
  }

  updatePlayerPanel(playerId, name, stat1, stat2) {
    const p=this.playerPanels?.find(pp=>pp.id===playerId);
    if (!p) return;
    if (name  != null) p.nameText.setText(name);
    if (stat1 != null) p.statVal1.setText(Number(stat1).toLocaleString());
    if (stat2 != null) p.statVal2.setText(Number(stat2).toLocaleString());
  }

  // =====================
  // UI
  // =====================
  createUI(minRatio) {
    const { width, height } = this.scale;
    const S = minRatio;

    // ── Turn counter — top center ──────────────────────────────────
    this._turnCounterText = this.add.text(width/2, 32*S, "—", {
      fontFamily: "Signika",
      fontSize: Math.floor(52*S) + "px",
      color: "#e8f4ff",
      fontStyle: "bold",
      stroke: "#001339ff",
      strokeThickness: Math.floor(6.5*S),
      shadow: { offsetX: 0, offsetY: 1, color: "#001339ff", blur: 7, fill: true }
    }).setOrigin(0.5, 0.5).setDepth(63);

    this._turnLabelText = this.add.text(width/2, 32*S+2, "LƯỢT", {
      fontFamily: "Signika",
      fontSize: Math.floor(42*S) + "px",
      color: "#e8f4ff",
      fontStyle: "bold",
      stroke: "#001339ff",
      strokeThickness: Math.floor(6*S),
      shadow: { offsetX: 0, offsetY: 1, color: "#001339ff", blur: 6, fill: true }
    }).setOrigin(0, 0.5).setDepth(63);

    this._turnCounterShadow = null; // không dùng nữa

    // ── infoText — bottom center, gradient bar style ──────────────
    const INFO_Y = height - 100 * S;
    const INFO_W = Math.floor(520 * S);
    const INFO_H = Math.floor(46 * S);
    const GRAD_W = 80; // độ rộng gradient 2 bên
    const BORDER_C = 0x0088ff; // xanh dương đậm

    // Nền: gradient fade 2 bên, đen transparent ở giữa + border trên/dưới
    this._infoBarGfx = this.add.graphics().setDepth(59);
    const _drawInfoBar = () => {
      const g = this._infoBarGfx;
      g.clear();
      const bx = width / 2 - INFO_W / 2;
      const by = INFO_Y - INFO_H / 2;

      // Nền giữa đen transparent
      g.fillStyle(0x000000, 0.60);
      g.fillRect(bx, by, INFO_W, INFO_H);

      // Gradient trái: fade từ transparent → đen
      for (let i = 0; i < GRAD_W; i++) {
        const alpha = (i / GRAD_W) * 0.60;
        g.fillStyle(0x000000, alpha);
        g.fillRect(bx - GRAD_W + i, by, 1, INFO_H);
      }
      // Gradient phải: fade từ đen → transparent
      for (let i = 0; i < GRAD_W; i++) {
        const alpha = (1 - i / GRAD_W) * 0.60;
        g.fillStyle(0x000000, alpha);
        g.fillRect(bx + INFO_W + i, by, 1, INFO_H);
      }

      // Border trên + dưới xanh dương đậm
      g.lineStyle(Math.max(1, Math.floor(1.5 * S)), BORDER_C, 0.9);
      g.beginPath();
      g.moveTo(bx - GRAD_W, by);
      g.lineTo(bx + INFO_W + GRAD_W, by);
      g.strokePath();
      g.beginPath();
      g.moveTo(bx - GRAD_W, by + INFO_H);
      g.lineTo(bx + INFO_W + GRAD_W, by + INFO_H);
      g.strokePath();
    };
    _drawInfoBar();
    this._drawInfoBar = _drawInfoBar;

    this.infoText = this.add.text(width / 2, INFO_Y, "⏳", {
      fontFamily: "Signika",
      fontSize: Math.floor(20 * S) + "px",
      color: "#facc15",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: Math.floor(3 * S),
    }).setOrigin(0.5).setDepth(60);

    // ── cellInfoText — ẩn ─────────────────────────────────────────
    this.cellInfoText = this.add.text(0, 0, "", {
      fontSize: "1px", color: "#00000000"
    }).setOrigin(0.5).setDepth(-1).setAlpha(0);
  }

  // Cập nhật turn counter từ turn_number
  _updateTurnCounter(turnNumber) {
    if (!this._turnCounterText) return;
    const { width } = this.scale;
    const S   = this.minRatio || 1;
    const GAP = 6 * S;

    this._turnCounterText.setText(`${turnNumber}`);

    // Căn giữa cụm "số LƯỢT" theo width
    // Tổng width = số.width + gap + LƯỢT.width
    const numW   = this._turnCounterText.width;
    const lblW   = this._turnLabelText?.width || 0;
    const totalW = numW + GAP + lblW;
    const startX = width / 2 - totalW / 2;

    this._turnCounterText.setX(startX + numW / 2);
    if (this._turnLabelText) {
      this._turnLabelText.setX(startX + numW + GAP);
    }
  }

  // =====================
  // SPACE INPUT
  //  Down → PowerDice giữ
  //  Up   → PowerDice thả (emit roll)
  // =====================
  handleSpacePress() {
    if (!this.isMyTurn) {
      playBoardErrSound(this);
      this.infoText.setText("⏸ Chưa tới lượt của bạn").setColor("#ff8800");
      return;
    }
    if (!this.canRoll) {
      playBoardErrSound(this);
      this.infoText.setText("⏳ Đang xử lý...").setColor("#ff8800");
      return;
    }
    this.powerDice?._onPressDown();
  }

  handleSpaceRelease() {
    if (!this.isMyTurn || !this.canRoll) return;
    this.powerDice?._onPressUp();
  }

  // =====================
  // DEBUG CLICK
  // =====================
  enableCoordinateDebug() {
    this.input.on("pointerdown", (pointer) => {
      const xPct=(pointer.x/this.scale.width).toFixed(3);
      const yPct=(pointer.y/this.scale.height).toFixed(3);
      console.log(`x: ${xPct}, y: ${yPct}`);
      let nearest=null, minDist=Infinity;
      this.boardPath.forEach(cell => {
        const d=Phaser.Math.Distance.Between(pointer.x,pointer.y,cell.x*this.scale.width,cell.y*this.scale.height);
        if (d<minDist) { minDist=d; nearest=cell; }
      });
      if (nearest&&minDist<50) console.log(`Ô gần nhất: ${nearest.index}`);
      const marker=this.add.circle(pointer.x,pointer.y,8,0xff0000,0.7);
      const txt=this.add.text(pointer.x+10,pointer.y-10,`${xPct}, ${yPct}`,{fontSize:"12px",color:"#ffffff",backgroundColor:"#000000"});
      this.time.delayedCall(2000,()=>{ marker.destroy(); txt.destroy(); });
    });
  }

  // =====================
  // RESET
  // =====================
  resetPlayer() {
    if (this.isMoving) { this.tweens.killAll(); this.isMoving=false; this.canRoll=true; }
    this.currentIndex=0;
    const startCell=this.boardPath[0];
    this.player.x=startCell.x*this.scale.width;
    this.player.y=startCell.y*this.scale.height;
    this.shadow.x=this.player.x;
    this.shadow.y=this.player.y+5;
    this.player.play(`${this.characterName||"Dark_Oracle"}_${this.mySkin}_idle`);
    this.onPlayerStop();
  }

  // =====================
  // MOVE
  // =====================
  _movePlayerSteps(steps, onDone) {
    if (this.isMoving) return;
    this.isMoving = true;
    // Tắt bubble "Đổ xúc xắc" ngay khi bắt đầu di chuyển
    if (this._diceBubbleObjs) {
      this._diceBubbleObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._diceBubbleObjs = null;
    }
    // Bắt đầu tiếng bước chân — phát trước animation một chút
    startFootstepSound(this);

    const { width, height } = this.scale;
    const totalCells = this.boardPath.length;
    let stepsLeft = steps;

    const moveOneStep = () => {
      if (stepsLeft <= 0) {
        this.isMoving = false;
        // Dừng tiếng bước chân sau khi animation kết thúc
        this.time.delayedCall(100, () => stopFootstepSound(this));
        this.player.play(`${this.characterName||"Dark_Oracle"}_${this.mySkin}_idle`);
        this.onPlayerStop();
        if (onDone) onDone();
        return;
      }
      const nextIndex=(this.currentIndex+1)%totalCells;
      const nextCell=this.boardPath[nextIndex];
      const tx=nextCell.x*width, ty=nextCell.y*height;
      this.player.rotation=0;
      if (tx<this.player.x) this.player.setFlipX(true);
      else if (tx>this.player.x) this.player.setFlipX(false);
      this.player.play(`${this.characterName||"Dark_Oracle"}_${this.mySkin}_run_throw`);
      this.tweens.add({
        targets:this.player, x:tx, y:ty, duration:350, ease:"Sine.easeInOut",
        onUpdate: () => { 
            this.shadow.x = this.player.x; 
            this.shadow.y = this.player.y + 5; 
            this.playerNameText.x = this.player.x;
            this.playerNameText.y = this.player.y - 140 * this.minRatio;
        },
        onComplete: ()=>{ this.currentIndex=nextIndex; stepsLeft--; this.highlightCurrentCell(); moveOneStep(); }
      });
    };
    moveOneStep();
  }

  // Animate nhân vật người khác đi từng bước (dùng cho walk_to_cell skill)
  _moveOtherPlayerSteps(sprite, steps, destIndex, charName) {
    if (!sprite || steps <= 0) return;
    const { width, height } = this.scale;
    const totalCells = this.boardPath.length;

    // Tìm index hiện tại của sprite dựa trên vị trí gần nhất
    let currentIdx = destIndex - steps;
    if (currentIdx < 0) currentIdx += totalCells;

    let stepsLeft = steps;
    const moveOne = () => {
      if (stepsLeft <= 0) {
        const runKey = `${charName||"Dark_Oracle"}_1_idle`;
        if (this.anims.exists(runKey)) sprite.play(runKey);
        return;
      }
      currentIdx = (currentIdx + 1) % totalCells;
      const cell = this.boardPath[currentIdx];
      const tx = cell.x * width, ty = cell.y * height;
      if (tx < sprite.x) sprite.setFlipX(true);
      else if (tx > sprite.x) sprite.setFlipX(false);
      const runKey = `${charName||"Dark_Oracle"}_1_run_throw`;
      if (this.anims.exists(runKey)) sprite.play(runKey);
      this.tweens.add({
        targets: sprite, x: tx, y: ty, duration: 350, ease: "Sine.easeInOut",
        onComplete: () => { stepsLeft--; moveOne(); }
      });
    };
    moveOne();
  }

  // =====================
  // HIGHLIGHT + STOP
  // =====================
  highlightCurrentCell() {
    this.boardPath.forEach(cell => {
      if (cell.circle) cell.circle.setFillStyle(cell.color||0x0f172a, 0.5);
    });
    const cur=this.boardPath[this.currentIndex];
    if (cur.circle) cur.circle.setFillStyle(0xffd700, 0.7);
  }

  onPlayerStop() {
    const cell=this.boardPath[this.currentIndex];
    this.cellInfoText.setText(`Ô hiện tại: ${cell.index} (${cell.name})`);
    this.socket.emit("move", { index:this.currentIndex });
    this.hideTargetArrow();
    this.highlightCurrentCell();

    // Âm thanh theo ô đặc biệt
    if (cell.index === 28) playBoardHunterSound(this);
    else if (cell.index === 18) playBoardTeacherSound(this);
    else if (cell.index === 9) playBoardSkillSound(this);
  }

  _triggerCell28FireDestruction() {
      const sourceCell = this.boardPath[28];
      // Chọn 2-3 mục tiêu ngẫu nhiên (bỏ qua ô skill, không lấy cell 28)
      const candidates = this.boardPath.filter(c => c.type !== 'skill' && c.index !== 28);
      Phaser.Utils.Array.Shuffle(candidates);
      const targets = candidates.slice(0, Phaser.Math.Between(2, 3));

      if (targets.length === 0) return;

      // BƯỚC 1: Làm tối bản đồ
      this._startDarkMapEffect();

      // BƯỚC 2: NPC Hunter (ô 28) thực hiện động tác vận nội công/chào (Greeting_2)
      if (this.bloody) {
          this._setHunter28Mode(true);
          this.bloody.play("Hunter_Greeting_2");
      }

      // BƯỚC 3: Chạy chuỗi hiệu ứng cho từng mục tiêu
      targets.forEach((target, index) => {
          // Delay để người chơi kịp thấy bản đồ tối đi
          this.time.delayedCall(800, () => {
              
              // A. Tinh cầu mục tiêu sáng rực lên (Planet lights up)
              this._highlightTargetCell(target);

              // B. Sau khi sáng lên 1.5s, ngọn lửa từ trên trời bay xuống (Fire fly in)
              this.time.delayedCall(1500, () => {
                  this._fireArrowFromAbove(sourceCell, target, true); 
              });
          });
      });
  }

  _highlightTargetCell(targetCell) {
      const { width, height } = this.scale;
      const cx = targetCell.x * width;
      const cy = targetCell.y * height;

      if (targetCell.orb) {
        targetCell.orb.setDepth(3100);
        if (targetCell.orbShadow) targetCell.orbShadow.setDepth(150);
      }

      const highlight = this.add.circle(cx, cy, 50 * this.minRatio, 0xff0000, 0.6)
          .setDepth(3050)
          .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
          targets: highlight,
          scale: 2,
          alpha: 0,
          duration: 1000,
          repeat: 1,
          onComplete: () => highlight.destroy()
      });

      if (targetCell.orb) {
          this.tweens.add({
              targets: targetCell.orb,
              x: cx + 5,
              duration: 50,
              yoyo: true,
              repeat: 20
          });
      }
  }

  _fireArrowFromAbove(sourceCell, targetCell, isLast) {
      const { width, height } = this.scale;
      const endX = targetCell.x * width;
      const endY = targetCell.y * height;

      const arrow = this.add.sprite(endX, endY - 400 * this.minRatio, "fire_arrow_01")
          .setDepth(3100)
          .setScale(0.5 * this.minRatio) 
          .setAngle(270) 
          .play("fire_arrow");

      this.tweens.add({
          targets: arrow,
          y: endY,
          duration: 800,
          ease: "Cubic.easeIn",
          onComplete: () => {
              arrow.destroy();

              // Hiệu ứng nổ lửa tại điểm chạm
              this._createFireImpact(endX, endY);
              // KHÔNG tự xóa cellStates ở đây — game:cell_destroyed sẽ đồng bộ cho tất cả

              if (isLast) {
                  this.time.delayedCall(800, () => {
                      this._stopDarkMapEffect();
                      this._setHunter28Mode(false);
                  });
              }
          }
      });
  }

  // ── Water Ball Drop — hiệu ứng tăng thuế ──────────────────────
  _waterBallDrop(targetCell, multiplier) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const endX = targetCell.x * width;
    const endY = targetCell.y * height;
    const mult = Number(multiplier) || 1.2; // đảm bảo là number

    // Water ball rơi từ trên cao — scale nhỏ cố định
    const ball = this.add.sprite(endX, endY - 400 * S, "water_ball_01")
      .setDepth(3100)
      .setScale(0.08)   // nhỏ hơn nữa
      .play("water_ball");

    this.tweens.add({
      targets: ball,
      y: endY,
      duration: 700,
      ease: "Cubic.easeIn",
      onComplete: () => {
        ball.destroy();

        // Ripple impact nhỏ
        for (let i = 0; i < 2; i++) {
          const ring = this.add.circle(endX, endY, (18 + i * 14) * S, 0x44ccff, 0.45 - i * 0.1)
            .setDepth(3140).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: ring, scaleX: 2.2, scaleY: 2.2, alpha: 0,
            duration: 500 + i * 120, ease: "Quad.easeOut",
            onComplete: () => ring.destroy()
          });
        }

        this._placeTaxBadge(targetCell, mult);
      }
    });
  }

  // Badge ×1.x duy trì trên ô cho đến khi reset
  _placeTaxBadge(targetCell, multiplier) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 160;
    const x = targetCell.x * width;
    const y = targetCell.y * height - 38 * S;
    const ci = targetCell.index;
    const mult = Number(multiplier) || 1.2;

    if (!this._taxBadges) this._taxBadges = {};
    if (this._taxBadges[ci]) {
      this._taxBadges[ci].forEach(o => { try { o?.destroy(); } catch(e){} });
    }

    const label = `×${mult.toFixed(1)}`;

    // Chỉ text, không nền — màu cam đồng như ảnh tham khảo
    const txt = this.add.text(x, y, label, {
      fontFamily: "Signika",
      fontSize: Math.floor(26 * S) + "px",
      color: "#ed864fff",
      fontStyle: "bold",
      stroke: "#6c3414ff",
      strokeThickness: Math.floor(4 * S)
    }).setOrigin(0.5).setDepth(D + 1);

    // Pulse nhẹ
    this.tweens.add({
      targets: txt, alpha: { from: 1, to: 0.75 },
      duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    this._taxBadges[ci] = [txt];
  }

  _setHunter28Mode(enable) {
    if (!this.bloody) return;
    if (enable) {
      this.bloody.setScale((this.bloodyBaseScale || 0.13) * 1.2);
      this.bloody.setDepth(3100);
      this.bloody.setTint(0xffcc99);
    } else {
      this.bloody.setScale(this.bloodyBaseScale || 0.13);
      this.bloody.setDepth(this.bloodyBaseDepth || 6);
      this.bloody.clearTint();
      this.bloody.play("Bloody_Alchemist_1_idle");
    }
  }

  _createFireImpact(x, y) {
    const S = this.minRatio;

    const mainBoom = this.add.circle(x, y, 35 * S, 0xffaa22, 0.95)
      .setDepth(3150)
      .setBlendMode(Phaser.BlendModes.ADD);

    const outerGlow = this.add.circle(x, y, 20 * S, 0xff6600, 0.4)
      .setDepth(3140)
      .setBlendMode(Phaser.BlendModes.ADD);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spark = this.add.circle(x, y, 3 * S, 0xffdd44, 0.9)
        .setDepth(3155)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 60 * S,
        y: y + Math.sin(angle) * 60 * S,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 600,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy()
      });
    }

    this.tweens.add({
      targets: [mainBoom, outerGlow],
      alpha: 0,
      scaleX: 2.5,
      scaleY: 2.5,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => {
        mainBoom.destroy();
        outerGlow.destroy();
      }
    });
  }

  _createArrowExplosion(x, y) {
    const S = this.minRatio;

    // Main explosion circle
    const mainBoom = this.add.circle(x, y, 35 * S, 0xffaa22, 0.95)
      .setDepth(165)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Outer glow ring
    const outerGlow = this.add.circle(x, y, 20 * S, 0xff6600, 0.4)
      .setDepth(164)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Spark particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sparkX = x + Math.cos(angle) * 25 * S;
      const sparkY = y + Math.sin(angle) * 25 * S;

      const spark = this.add.circle(sparkX, sparkY, 3 * S, 0xffdd44, 0.9)
        .setDepth(166)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 60 * S,
        y: y + Math.sin(angle) * 60 * S,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 600,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy()
      });
    }

    // Animate main explosion
    this.tweens.add({
      targets: [mainBoom, outerGlow],
      alpha: 0,
      scaleX: 2.5,
      scaleY: 2.5,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => {
        mainBoom.destroy();
        outerGlow.destroy();
      }
    });
  }

  // =====================
  // BANKRUPTCY SYSTEM
  // =====================
  _startBankruptcyResolution(rentData) {
    this._bankruptcyRentData = rentData; // lưu lại để dùng khi bán
    this._startDarkMapEffect();
    this.canRoll = false;
    this.isMyTurn = false;
    this._showDebtPanel();
  }

  // Tính tổng tài sản có thể bán (60% tổng vốn đầu tư mỗi ô)
  _calcTotalSellable() {
    if (!this.cellStates) return 0;
    const myUid = this._myUserId();
    return Object.values(this.cellStates)
      .filter(c => c.owner_user_id === myUid)
      .reduce((sum, c) => sum + Math.floor((c.total_invested ?? c.build_cost ?? 0) * 0.6), 0);
  }

  _showDebtPanel() {
    this._clearBankruptcyUI();
    if (!this._bankruptcyObjs) this._bankruptcyObjs = [];
    this._selectedSellCells = {}; // reset mỗi lần mở panel
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 170;
    const push = (o) => { this._bankruptcyObjs.push(o); return o; };

    const rentData = this._bankruptcyRentData;
    const requiredRent = rentData.required_rent;
    const myUid = this._myUserId();
    const me = this.gamePlayers?.find(p => p.user_id === myUid);
    const myCash = me?.cash || 0;
    const totalSellable = this._calcTotalSellable();
    const canSurvive = (myCash + totalSellable) >= requiredRent;

    // Overlay
    push(this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.72).setDepth(D));

    // Panel
    const PW = 580 * S, PH = canSurvive ? 480 * S : 360 * S;
    const panel = push(this.createStyledPanel(width/2, height/2, PW, PH, 22*S));
    panel.setDepth(D+1);

    // Tiêu đề
    push(this.add.text(width/2, height/2 - PH/2 + 38*S,
      canSurvive ? "⚠️ KHÔNG ĐỦ TIỀN MẶT" : "💀 PHÁ SẢN",
      { fontFamily:"Signika", fontSize:Math.floor(28*S)+"px",
        color: canSurvive ? "#ffcc00" : "#ff4444", fontStyle:"bold" }
    ).setOrigin(0.5).setDepth(D+2));

    // Thông tin nợ
    push(this.add.text(width/2, height/2 - PH/2 + 90*S,
      `Tiền thuê cần trả: ${this._formatMoney(requiredRent)}\nTiền mặt hiện tại: ${this._formatMoney(myCash)}`,
      { fontFamily:"Signika", fontSize:Math.floor(17*S)+"px",
        color:"#ffe566", align:"center" }
    ).setOrigin(0.5).setDepth(D+2));

    if (!canSurvive) {
      // Không thể sống sót dù bán hết
      push(this.add.text(width/2, height/2,
        `Tổng tài sản có thể bán: ${this._formatMoney(totalSellable)}\nVẫn không đủ trả nợ → Phá sản!`,
        { fontFamily:"Signika", fontSize:Math.floor(17*S)+"px",
          color:"#ff8888", align:"center" }
      ).setOrigin(0.5).setDepth(D+2));

      // 2 nút ngang: Phá sản | Đầu Hàng
      const btnW = 200*S, btnH = 48*S, btnGap = 18*S;
      this._makePanelBtn(push,
        width/2 - btnW/2 - btnGap/2, height/2 + PH/2 - 55*S, btnW, btnH, D,
        0xcc2222, 0x881111, "💀 Phá sản", () => {
          this._clearBankruptcyUI();
          this._stopDarkMapEffect();
          this._triggerBankruptcy();
        });
      this._makePanelBtn(push,
        width/2 + btnW/2 + btnGap/2, height/2 + PH/2 - 55*S, btnW, btnH, D,
        0x886600, 0x554400, "🏳️ Đầu Hàng", () => {
          this._clearBankruptcyUI();
          this._stopDarkMapEffect();
          this._triggerSurrender();
        });
      return;
    }

    // Hướng dẫn
    push(this.add.text(width/2, height/2 - PH/2 + 148*S,
      "Chọn tinh cầu của bạn để bán (60% giá trị)\nCó thể chọn nhiều ô cùng lúc",
      { fontFamily:"Signika", fontSize:Math.floor(15*S)+"px",
        color:"#cccccc", align:"center" }
    ).setOrigin(0.5).setDepth(D+2));

    // Danh sách tinh cầu của mình
    const myCells = Object.entries(this.cellStates || {})
      .filter(([, c]) => c.owner_user_id === myUid);

    const COLS = 4, ITEM_W = 110*S, ITEM_H = 72*S, GAP = 12*S;
    const gridW = COLS * ITEM_W + (COLS-1) * GAP;
    const startX = width/2 - gridW/2 + ITEM_W/2;
    const startY = height/2 - PH/2 + 200*S;

    myCells.forEach(([cellIndex, cellData], idx) => {
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const cx = startX + col * (ITEM_W + GAP);
      const cy = startY + row * (ITEM_H + GAP);
      const lv = Math.max(1, Math.min(2, Number(cellData.level || 1)));
      const investedVal = Number(cellData.total_invested ?? cellData.build_cost ?? 0);
      const sellPrice = Math.floor(investedVal * 0.6);
      const hex = this._planetColorToHex(cellData.planet_color);
      const orbKey = this._hexToOrbKey(hex, lv);
      const isSelected = !!this._selectedSellCells[cellIndex];

      // Card nền
      const cardG = push(this.add.graphics().setDepth(D+2));
      const drawCard = (selected) => {
        cardG.clear();
        cardG.fillStyle(selected ? 0x1a5c1a : 0x0d2a4a, 1);
        cardG.fillRoundedRect(cx - ITEM_W/2, cy - ITEM_H/2, ITEM_W, ITEM_H, 10*S);
        cardG.lineStyle(2*S, selected ? 0x44ff44 : hex, 0.9);
        cardG.strokeRoundedRect(cx - ITEM_W/2, cy - ITEM_H/2, ITEM_W, ITEM_H, 10*S);
      };
      drawCard(isSelected);

      // Orb icon (giữ đúng tỷ lệ cho orb có cánh Lv2)
      const orbSrc = this.textures.exists(orbKey) ? this.textures.get(orbKey).getSourceImage() : null;
      const maxBox = lv >= 2 ? 38 * S : 32 * S;
      const orbScale = orbSrc ? Math.min(maxBox / orbSrc.width, maxBox / orbSrc.height) : 0.4 * S;
      push(this.add.image(cx - ITEM_W/2 + 22*S, cy, orbKey)
        .setScale(orbScale).setDepth(D+3));

      // Ô số + Cấp + Giá bán
      push(this.add.text(cx + 8*S, cy - 15*S, `Ô ${cellIndex} • Lv.${lv}`,
        { fontFamily:"Signika", fontSize:Math.floor(12*S)+"px", color: lv >= 2 ? "#ffe066" : "#ffffff" }
      ).setOrigin(0.5).setDepth(D+3));
      push(this.add.text(cx + 8*S, cy + 9*S, `+${this._formatMoney(sellPrice)}`,
        { fontFamily:"Signika", fontSize:Math.floor(13*S)+"px", color:"#ffdd44", fontStyle:"bold" }
      ).setOrigin(0.5).setDepth(D+3));

      // Zone click
      const zone = push(this.add.zone(cx, cy, ITEM_W, ITEM_H)
        .setInteractive({ useHandCursor: true }).setDepth(D+4));
      zone.on("pointerdown", () => {
        if (this._selectedSellCells[cellIndex]) {
          delete this._selectedSellCells[cellIndex];
          drawCard(false);
        } else {
          this._selectedSellCells[cellIndex] = { cellData, sellPrice };
          drawCard(true);
        }
        this._updateDebtSummary(requiredRent, myCash, D, width, height, S, PH);
      });
    });

    // Summary + nút xác nhận
    this._debtSummaryDepth = D;
    this._updateDebtSummary(requiredRent, myCash, D, width, height, S, PH);
  }

  _updateDebtSummary(requiredRent, myCash, D, width, height, S, PH) {
    // Xóa summary cũ
    if (this._debtSummaryObjs) {
      this._debtSummaryObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._debtSummaryObjs = [];
    const push = (o) => { this._debtSummaryObjs.push(o); return o; };

    const totalSell = Object.values(this._selectedSellCells || {})
      .reduce((s, v) => s + v.sellPrice, 0);
    const totalAfter = myCash + totalSell;
    const canPay = totalAfter >= requiredRent;
    const color = canPay ? "#44ff88" : "#ff8888";

    push(this.add.text(width/2, height/2 + PH/2 - 110*S,
      `Bán được: +${this._formatMoney(totalSell)}  →  Tổng: ${this._formatMoney(totalAfter)} / ${this._formatMoney(requiredRent)}`,
      { fontFamily:"Signika", fontSize:Math.floor(15*S)+"px", color, align:"center" }
    ).setOrigin(0.5).setDepth(D+3));

    // Nút xác nhận bán (trái) + Đầu Hàng (phải)
    const mainBtnW = canPay ? 240*S : 240*S;
    const surrBtnW = 170*S;
    const btnGap   = 14*S;
    const mainBtnX = canPay
      ? width/2 - surrBtnW/2 - btnGap/2   // dịch sang trái để nhường chỗ nút Đầu Hàng
      : width/2;                            // giữa khi không chọn được

    this._makePanelBtn(push, mainBtnX, height/2 + PH/2 - 55*S, mainBtnW, 48*S, D,
      canPay ? 0x22aa44 : 0x555555, canPay ? 0x116622 : 0x333333,
      canPay ? "✅ Xác nhận bán & trả nợ" : "Chọn thêm tinh cầu...",
      canPay ? () => {
        const cellsToSell = Object.entries(this._selectedSellCells || {});
        if (cellsToSell.length === 0) return;
        this._clearBankruptcyUI();
        this._stopDarkMapEffect();

        const myUid = this._myUserId();
        const me = this.gamePlayers?.find(p => p.user_id === myUid);
        const myCash = me?.cash || 0;
        const totalSellPrice = cellsToSell.reduce((s, [, v]) => s + v.sellPrice, 0);
        const requiredRentVal = this._bankruptcyRentData.required_rent;

        this.socket.emit("game:sell_and_pay_rent", {
          room_id: this.gameRoomId,
          seller_user_id: myUid,
          buyer_user_id: this._bankruptcyRentData.owner_user_id,
          cells_to_sell: cellsToSell.map(([cellIndex, { sellPrice }]) => ({
            cell_index: Number(cellIndex),
            sell_price: sellPrice
          })),
          total_sell_price: totalSellPrice,
          required_rent: requiredRentVal,
          cash_before: myCash
        });
        this._selectedSellCells = {};
      } : null
    );

    // Nút Đầu Hàng — luôn hiện dù có/không thể trả nợ
    const surrX = canPay
      ? mainBtnX + mainBtnW/2 + btnGap + surrBtnW/2
      : width/2 + mainBtnW/2 + btnGap + surrBtnW/2;
    this._makePanelBtn(push, surrX, height/2 + PH/2 - 55*S, surrBtnW, 48*S, D,
      0x886600, 0x554400, "🏳️ Đầu Hàng", () => {
        this._clearBankruptcyUI();
        this._stopDarkMapEffect();
        this._triggerSurrender();
      });
  }  // ← đóng _updateDebtSummary

  _makePanelBtn(push, cx, cy, bw, bh, D, colorTop, colorBot, label, onClick) {
    const S = this.minRatio;
    const bg = push(this.add.graphics().setDepth(D+3));
    bg.fillStyle(colorTop, 1);
    bg.fillRoundedRect(cx - bw/2, cy - bh/2, bw, bh, 12*S);
    bg.lineStyle(2*S, 0xffffff, 0.18);
    bg.strokeRoundedRect(cx - bw/2, cy - bh/2, bw, bh, 12*S);

    const txt = push(this.add.text(cx, cy, label,
      { fontFamily:"Signika", fontSize:Math.floor(16*S)+"px", color:"#ffffff", fontStyle:"bold" }
    ).setOrigin(0.5).setDepth(D+4));

    if (onClick) {
      const zone = push(this.add.zone(cx, cy, bw, bh)
        .setInteractive({ useHandCursor: true }).setDepth(D+5));
      zone.on("pointerover", () => { bg.setAlpha(0.8); });
      zone.on("pointerout",  () => { bg.setAlpha(1); });
      zone.on("pointerdown", onClick);
    }
  }

  _triggerBankruptcy() {
    if (this.gameRoomId && this.socket) {
      this.socket.emit("game:bankruptcy", {
        room_id: this.gameRoomId,
        user_id: this._myUserId()
      });
    }
  }

  _triggerSurrender() {
    if (this.gameRoomId && this.socket) {
      this._intentionalExit = true;
      try { localStorage.removeItem("activeGame"); } catch(e) {}
      this.socket.emit("game:surrender", {
        room_id: this.gameRoomId,
        user_id: this._myUserId()
      });
    }
  }

  _clearBankruptcyUI() {
    if (this._bankruptcyObjs) {
      this._bankruptcyObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._bankruptcyObjs = [];
    if (this._debtSummaryObjs) {
      this._debtSummaryObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._debtSummaryObjs = [];
  }

  // Người chơi khác phá sản — toast nhỏ
  _showOtherPlayerBankrupt(name) {
    this._showToast(`💀 ${name} đã phá sản!`, "#ff4444", 3500);
  }

  // Màn hình thua của chính mình
  _showBankruptcyLoseScreen(name) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 300;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    // Overlay đỏ tối dần
    const overlay = push(this.add.rectangle(width/2, height/2, width, height, 0x220000, 0).setDepth(D));
    this.tweens.add({ targets: overlay, fillAlpha: 0.88, duration: 800 });

    // Skull icon
    push(this.add.text(width/2, height/2 - 120*S, "💀",
      { fontSize: Math.floor(72*S)+"px" }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
    this.tweens.add({ targets: objs[objs.length-1], alpha: 1, y: height/2 - 130*S, duration: 600, delay: 400 });

    // Text PHÁ SẢN
    const loseText = push(this.add.text(width/2, height/2 - 20*S, "BẠN ĐÃ PHÁ SẢN",
      { fontFamily:"Signika", fontSize:Math.floor(42*S)+"px",
        color:"#ff3333", fontStyle:"bold",
        stroke:"#000000", strokeThickness: Math.floor(5*S) }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0).setScale(0.4));
    this.tweens.add({ targets: loseText, alpha: 1, scaleX: 1, scaleY: 1, duration: 500, delay: 700, ease:"Back.easeOut" });

    push(this.add.text(width/2, height/2 + 50*S, "Không đủ tài sản để trả nợ",
      { fontFamily:"Signika", fontSize:Math.floor(20*S)+"px", color:"#ffaaaa" }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
    this.tweens.add({ targets: objs[objs.length-1], alpha: 1, duration: 400, delay: 1000 });

    // Particles đỏ rơi
    for (let i = 0; i < 18; i++) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(-50, height/2);
      const dot = push(this.add.circle(px, py, Phaser.Math.Between(3,8)*S, 0xff2222, 0.7).setDepth(D+1));
      this.tweens.add({
        targets: dot, y: py + Phaser.Math.Between(200, 500),
        alpha: 0, duration: Phaser.Math.Between(1200, 2400),
        delay: Phaser.Math.Between(0, 800), ease:"Cubic.easeIn"
      });
    }

    this.time.delayedCall(4500, () => {
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this.scene.start("RoomListScene");
    });
  }

  // Màn hình đầu hàng solo — tương tự bankruptcy nhưng chữ khác
  _showSurrenderLoseScreen(name) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 300;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const overlay = push(this.add.rectangle(width/2, height/2, width, height, 0x1a1200, 0).setDepth(D));
    this.tweens.add({ targets: overlay, fillAlpha: 0.88, duration: 800 });

    push(this.add.text(width/2, height/2 - 120*S, "🏳️",
      { fontSize: Math.floor(72*S)+"px" }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
    this.tweens.add({ targets: objs[objs.length-1], alpha: 1, y: height/2 - 130*S, duration: 600, delay: 300 });

    const txt = push(this.add.text(width/2, height/2 - 20*S, "BẠN ĐÃ ĐẦU HÀNG",
      { fontFamily:"Signika", fontSize:Math.floor(42*S)+"px",
        color:"#ffaa00", fontStyle:"bold",
        stroke:"#000000", strokeThickness: Math.floor(5*S) }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0).setScale(0.4));
    this.tweens.add({ targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 500, delay: 600, ease:"Back.easeOut" });

    push(this.add.text(width/2, height/2 + 50*S, "Bạn đã chọn rút khỏi ván đấu",
      { fontFamily:"Signika", fontSize:Math.floor(20*S)+"px", color:"#ffddaa" }
    ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
    this.tweens.add({ targets: objs[objs.length-1], alpha: 1, duration: 400, delay: 900 });

    this.time.delayedCall(4000, () => {
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this.scene.start("RoomListScene");
    });
  }

  // Team 2v2: mình đầu hàng nhưng đồng đội vẫn còn — chờ ở màn hình nhẹ
  _showSurrenderWaitScreen() {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 290;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const overlay = push(this.add.rectangle(width/2, height/2, width, height, 0x000a1a, 0.75).setDepth(D));

    push(this.add.text(width/2, height/2 - 60*S, "🏳️ Bạn đã đầu hàng",
      { fontFamily:"Signika", fontSize:Math.floor(28*S)+"px",
        color:"#ffaa44", fontStyle:"bold", stroke:"#000", strokeThickness:4*S }
    ).setOrigin(0.5).setDepth(D+1));

    push(this.add.text(width/2, height/2 + 10*S, "Đồng đội vẫn đang chiến đấu...\nĐang chờ kết thúc ván đấu",
      { fontFamily:"Signika", fontSize:Math.floor(18*S)+"px",
        color:"#aaccff", align:"center" }
    ).setOrigin(0.5).setDepth(D+1));

    // Nút về lobby
    const btnG = push(this.add.graphics().setDepth(D+2));
    const btnW = 200*S, btnH = 46*S;
    const btnX = width/2 - btnW/2, btnY = height/2 + 100*S - btnH/2;
    btnG.fillStyle(0x1a4a8a, 1);
    btnG.fillRoundedRect(btnX, btnY, btnW, btnH, 12*S);
    push(this.add.text(width/2, height/2 + 100*S, "▶ Về Sảnh",
      { fontFamily:"Signika", fontSize:Math.floor(17*S)+"px", color:"#ffffff", fontStyle:"bold" }
    ).setOrigin(0.5).setDepth(D+3));
    const zone = push(this.add.zone(width/2, height/2 + 100*S, btnW, btnH)
      .setInteractive({ useHandCursor: true }).setDepth(D+4));
    zone.on("pointerover",  () => btnG.setAlpha(0.7));
    zone.on("pointerout",   () => btnG.setAlpha(1));
    zone.on("pointerdown",  () => {
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this.scene.start("RoomListScene");
    });

    this._surrenderWaitObjs = objs;
  }

  // Màn hình kết thúc game (thắng/thua)
  _showGameOverScreen(isWinner, data, isTeam = false, winnerIds = []) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 300;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const bgColor = isWinner ? 0x001a00 : 0x1a0000;
    const overlay = push(this.add.rectangle(width/2, height/2, width, height, bgColor, 0).setDepth(D));
    this.tweens.add({ targets: overlay, fillAlpha: 0.85, duration: 700 });

    // Format winner names
    const winnerNames = data.winner_names || [data.winner_name];
    const winnerText = isTeam 
      ? `${winnerNames.join(" & ")}`
      : winnerNames[0];

    if (isWinner) {
      // Hiệu ứng thắng — vàng rực
      push(this.add.text(width/2, height/2 - 130*S, "🏆",
        { fontSize: Math.floor(80*S)+"px" }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
      this.tweens.add({ targets: objs[objs.length-1], alpha: 1, duration: 500, delay: 300 });

      const winText = push(this.add.text(width/2, height/2 - 30*S, "CHIẾN THẮNG!",
        { fontFamily:"Signika", fontSize:Math.floor(48*S)+"px",
          color:"#ffd700", fontStyle:"bold",
          stroke:"#000000", strokeThickness: Math.floor(5*S),
          shadow:{ offsetX:0, offsetY:3, color:"#ff8800", blur:12, fill:true } }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0).setScale(0.3));
      this.tweens.add({ targets: winText, alpha:1, scaleX:1, scaleY:1, duration:600, delay:500, ease:"Back.easeOut" });

      // Display prize info
      const prizeText = isTeam 
        ? `🎉 ${winnerText} đã thắng!\n💰 Mỗi người nhận: ${this._formatMoney(data.win_amount)}`
        : `🎉 ${winnerText} đã thắng cuộc!\n💰 Nhận: ${this._formatMoney(data.win_amount)}`;

      push(this.add.text(width/2, height/2 + 50*S, prizeText,
        { fontFamily:"Signika", fontSize:Math.floor(20*S)+"px", color:"#ffffff", align:"center" }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
      this.tweens.add({ targets: objs[objs.length-1], alpha:1, duration:400, delay:900 });

      // Confetti vàng
      for (let i = 0; i < 30; i++) {
        const colors = [0xffd700, 0xffffff, 0xff8800, 0x00ff88];
        const dot = push(this.add.circle(
          Phaser.Math.Between(0, width),
          Phaser.Math.Between(-80, 0),
          Phaser.Math.Between(4, 10)*S,
          colors[i % colors.length], 0.9
        ).setDepth(D+2));
        this.tweens.add({
          targets: dot,
          y: dot.y + Phaser.Math.Between(height, height + 200),
          x: dot.x + Phaser.Math.Between(-80, 80),
          angle: Phaser.Math.Between(-360, 360),
          alpha: 0,
          duration: Phaser.Math.Between(1500, 3000),
          delay: Phaser.Math.Between(0, 1000),
          ease: "Cubic.easeIn"
        });
      }
    } else {
      // Thua
      push(this.add.text(width/2, height/2 - 120*S, "😔",
        { fontSize: Math.floor(64*S)+"px" }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
      this.tweens.add({ targets: objs[objs.length-1], alpha:1, duration:500, delay:300 });

      const loseText = push(this.add.text(width/2, height/2 - 20*S, "THUA CUỘC",
        { fontFamily:"Signika", fontSize:Math.floor(40*S)+"px",
          color:"#ff5555", fontStyle:"bold",
          stroke:"#000000", strokeThickness: Math.floor(4*S) }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0).setScale(0.4));
      this.tweens.add({ targets: loseText, alpha:1, scaleX:1, scaleY:1, duration:500, delay:500, ease:"Back.easeOut" });

      const lostMessage = isTeam
        ? `🏆 ${winnerText} đã thắng cuộc\n💸 Bạn mất: ${this._formatMoney(data.bet_ecoin)}`
        : `🏆 ${winnerText} đã thắng cuộc\n💸 Bạn mất: ${this._formatMoney(data.bet_ecoin)}`;

      push(this.add.text(width/2, height/2 + 50*S, lostMessage,
        { fontFamily:"Signika", fontSize:Math.floor(18*S)+"px", color:"#aaaaaa", align:"center" }
      ).setOrigin(0.5).setDepth(D+1).setAlpha(0));
      this.tweens.add({ targets: objs[objs.length-1], alpha:1, duration:400, delay:800 });
    }

    this.time.delayedCall(5000, () => {
      objs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this.scene.start("RoomListScene");
    });
  }

  // Hiệu ứng bị đau — animation Hurt + flash đỏ nhẹ + shake
  _playHurtEffect(sprite) {
    if (!sprite) return;
    const origX = sprite.x;
    const charName = this.characterName || "Dark_Oracle";
    const skin = this.mySkin || 1;
    const hurtKey = `${charName}_${skin}_hurt`;
    const idleKey = `${charName}_${skin}_idle`;

    // Phát animation Hurt nếu tồn tại
    if (this.anims.exists(hurtKey)) {
      sprite.play(hurtKey);
      sprite.once("animationcomplete", () => {
        if (this.anims.exists(idleKey)) sprite.play(idleKey);
      });
    }

    // Tint đỏ mờ (alpha thấp hơn lần trước)
    let count = 0;
    const flash = () => {
      if (count >= 6) { sprite.clearTint(); return; }
      sprite.setTint(count % 2 === 0 ? 0xff6666 : 0xffffff);
      count++;
      this.time.delayedCall(90, flash);
    };
    flash();

    // Shake nhẹ
    this.tweens.add({
      targets: sprite,
      x: origX + 6,
      duration: 55,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
      onComplete: () => { sprite.x = origX; }
    });
  }

  saveGameState() {
    localStorage.setItem("gameState", JSON.stringify({ scene:"BoardScene", currentIndex:this.currentIndex }));
  }

  // =====================
  // TURN INFO
  // =====================
  _updateTurnInfo() {
    if (!this.infoText) return;
    if (!this.gamePlayers || this.gamePlayers.length === 0) {
      this.infoText.setText("Nhấn SPACE để tung").setColor("#facc15");
      return;
    }
    if (this.isMyTurn) {
      this.infoText.setText("🎲 Lượt của bạn! Nhấn SPACE").setColor("#ffdd00");
    } else {
      const cur = this.gamePlayers.find(p => p.socket_id === this.currentTurnSocketId);
      const name = cur?.name || "...";
      this.infoText.setText(`⏸ Lượt của ${name}...`).setColor("#aaaaaa");
    }
    this._updateDiceBubble();
  }

  _updateDiceBubble() {
    if (this._diceBubbleObjs) {
      this._diceBubbleObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._diceBubbleObjs = null;
    }
    if (!this.currentTurnSocketId) return;

    const { width, height } = this.scale;
    const minRatio = Math.min(width / this.originalWidth, height / this.originalHeight);

    let sprite = null;
    if (this.socket?.id === this.currentTurnSocketId) {
      sprite = this.player;
    } else {
      sprite = this.otherPlayers[this.currentTurnSocketId];
    }
    if (!sprite) return;

    const sx = sprite.x;
    const sy = sprite.y - sprite.displayHeight * 0.7;

    const D = 50;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const txt = "Đổ xúc xắc";
    const fontSize = Math.floor(20 * minRatio);
    const pad = { x: 18, y: 10 };
    const bR = 8;
    const TIP_W = 9;
    const TIP_H = 9;

    const t = push(this.add.text(0, 0, txt, {
      fontFamily: "Signika", fontSize: fontSize + "px",
      color: "#111111", fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(D + 2));

    const bW = t.width + pad.x * 2;
    const bH = t.height + pad.y * 2;
    const bX = sx - bW / 2;
    const bY = sy - bH - TIP_H;

    const g = push(this.add.graphics().setDepth(D + 1));

    // Nền trắng đậm, không border
    g.fillStyle(0xffffff, 0.9);
    g.fillRoundedRect(bX, bY, bW, bH, bR);

    // Tam giác chỉ xuống ở giữa đáy — cùng màu nền, liền mạch
    const tipX = sx;
    const tipBaseY = bY + bH;
    g.fillStyle(0xffffff, 0.95);
    g.fillTriangle(
      tipX - TIP_W, tipBaseY,
      tipX + TIP_W, tipBaseY,
      tipX,         tipBaseY + TIP_H
    );

    t.setPosition(bX + bW / 2, bY + bH / 2);

    this._diceBubbleObjs = objs;
  }

  /**
   * Bubble tiền thuê — copy y chang _updateDiceBubble
   * Chỉ đổi: text content + màu chữ
   * owner → xanh #2a9444 | payer → đỏ #e05030
   */
  _showRentMoneyBubble(sprite, amountText, role = "owner") {
    const { width, height } = this.scale;
    const minRatio = Math.min(width / this.originalWidth, height / this.originalHeight);

    if (!sprite) return;

    const sx = sprite.x;
    const sy = sprite.y - sprite.displayHeight * 0.7;

    const D = 290;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    // ── Chỉ đổi màu chữ, giữ nguyên mọi thứ khác ────────────────
    const txtColor = role === "owner" ? "#2a9444" : "#e05030";

    // === Copy y chang _updateDiceBubble từ đây ===
    const fontSize = Math.floor(20 * minRatio);
    const pad = { x: 18, y: 10 };
    const bR = 8;
    const TIP_W = 9;
    const TIP_H = 9;

    const t = push(this.add.text(0, 0, amountText, {
      fontFamily: "Signika", fontSize: fontSize + "px",
      color: txtColor, fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(D + 2));

    const bW = t.width + pad.x * 2;
    const bH = t.height + pad.y * 2;
    const bX = sx - bW / 2;
    const bY = sy - bH - TIP_H;

    const g = push(this.add.graphics().setDepth(D + 1));

    // Nền trắng đậm, không border — y chang _updateDiceBubble
    g.fillStyle(0xffffff, 0.9);
    g.fillRoundedRect(bX, bY, bW, bH, bR);

    // Tam giác chỉ xuống ở giữa đáy — y chang _updateDiceBubble
    const tipX     = sx;
    const tipBaseY = bY + bH;
    g.fillStyle(0xffffff, 0.95);
    g.fillTriangle(
      tipX - TIP_W, tipBaseY,
      tipX + TIP_W, tipBaseY,
      tipX,         tipBaseY + TIP_H
    );

    t.setPosition(bX + bW / 2, bY + bH / 2);
    // === Hết phần copy ===

    // Tự destroy sau 2s + bay lên nhẹ
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: [g, t],
        alpha: 0,
        y: `-=${18 * minRatio}`,
        duration: 300,
        ease: "Sine.easeIn",
        onComplete: () => objs.forEach(o => { try { o?.destroy(); } catch(e){} })
      });
    });
  }

  _showTurnBanner(message, color="#ffffff") {
    const { width, height } = this.scale;
    const minRatio=Math.min(width/this.originalWidth, height/this.originalHeight);
    if (this._turnBanner) { try{this._turnBanner.destroy();}catch(e){} this._turnBanner=null; }
    const banner=this.add.text(width/2, height*0.42, message, {
      fontFamily:"Signika", fontSize:Math.floor(36*minRatio)+"px",
      color, fontStyle:"bold", stroke:"#000000", strokeThickness:5,
      shadow:{offsetX:2,offsetY:3,color:"#000000",blur:6,fill:true}
    }).setOrigin(0.5).setDepth(100).setAlpha(0);
    this._turnBanner=banner;
    this.tweens.add({
      targets:banner, alpha:{from:0,to:1}, y:{from:height*0.46,to:height*0.42}, duration:350,
      onComplete: () => {
        this.time.delayedCall(2200, () => {
          if (!banner?.active) return;
          this.tweens.add({ targets:banner, alpha:0, duration:400, onComplete:()=>{try{banner.destroy();}catch(e){}} });
        });
      }
    });
  }

  // Tính tổng tiền đã đầu tư vào tinh cầu của một player
  _calculateInvestedAmount(userId) {
    if (!userId || !this.cellStates) return 0;
    let invested = 0;
    Object.values(this.cellStates).forEach(cell => {
      if (cell.owner_user_id === userId) {
        invested += (cell.total_invested ?? cell.build_cost ?? 0);
      }
    });
    return invested;
  }

  // Cập nhật T.mặt & T.sản trong UI từ gamePlayers
  _updatePlayerStatsInUI() {
    if (!this.playerPanels || !this.gamePlayers) return;
    this.playerPanels.forEach((panel, idx) => {
      const gmPlayer = this.gamePlayers[idx];
      if (!gmPlayer || !panel.userId) return;
      const cash = gmPlayer.cash ?? 0;
      const invested = this._calculateInvestedAmount(gmPlayer.user_id);
      const asset = cash + invested;
      if (panel.statVal1) panel.statVal1.setText(this._formatMoney(cash));
      if (panel.statVal2) panel.statVal2.setText(this._formatMoney(asset));
    });
  }

  _closeBuildPanel() {
    if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
    if (this._buildPanelObjs) {
      this._buildPanelObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._buildPanelObjs = [];
    }
    this._stopDarkMapEffect?.();
  }

  drawDashedBorder(g, x, y, w, h, radius, color = 0xc8a060, lineWidth = 2) {
  const dash = 10;
  const gap  = 6;

  g.lineStyle(lineWidth, color, 1);

  const drawDashedLine = (x1, y1, x2, y2) => {
    const len = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;
    let dist = 0;
    while (dist < len) {
      const sx = x1 + dx * dist;
      const sy = y1 + dy * dist;
      const ex = x1 + dx * Math.min(dist + dash, len);
      const ey = y1 + dy * Math.min(dist + dash, len);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.strokePath();
      dist += dash + gap;
    }
  };

  // 4 cạnh thẳng
  drawDashedLine(x + radius, y, x + w - radius, y);
  drawDashedLine(x + w, y + radius, x + w, y + h - radius);
  drawDashedLine(x + w - radius, y + h, x + radius, y + h);
  drawDashedLine(x, y + h - radius, x, y + radius);
}

  createStyledPanel(x, y, w, h, radius) {
    const g = this.add.graphics().setDepth(2);
    const left = x - w / 2;
    const top  = y - h / 2;

    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(left + 5, top + 7, w, h, radius);

    g.fillStyle(0xfff0d0, 1);
    g.fillRoundedRect(left, top, w, h, radius);

    g.fillStyle(0xffffff, 0.4);
    g.fillRoundedRect(left + 4, top + 4, w - 8, h * 0.18, radius);

    g.lineStyle(4, 0x8b5e1a, 1);
    g.strokeRoundedRect(left, top, w, h, radius);

    const inset = 10;
    const r2 = radius - 4;
    this.drawDashedBorder(
      g,
      left + inset, top + inset,
      w - inset * 2, h - inset * 2,
      r2, 0xc8a060, 2
    );

    return g;
  }

// ═══════════════════════════════════════════════════════════════
//  _showBuildPanel — Casual 3D Chibi style (1 cấp độ, không nâng cấp)
// ═══════════════════════════════════════════════════════════════

  _showBuildPanel(data) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 3050;

    if (this._buildPanelObjs) {
      this._buildPanelObjs.forEach(o => { try { o?.destroy(); } catch (e) {} });
    }
    this._buildPanelObjs = [];
    if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }

    this._startDarkMapEffect?.();

    const shell = { D, addObj: (o) => { this._buildPanelObjs.push(o); return o; } };
    const push  = (o) => shell.addObj(o);

    const mode        = data.mode || "build"; // "build" | "upgrade" | "buyout"
    const curLv       = Number(data.current_level || 0);
    const orbHex      = this._planetColorToHex(data.planet_color);
    const orbKey1     = this._hexToOrbKey(orbHex, 1);
    const orbKey2     = this._hexToOrbKey(orbHex, 2);
    const myPlayer    = (this.gamePlayers || []).find(p => Number(p.user_id) === Number(this._myUserId?.()));
    const playerCash  = Number(data.player_cash ?? myPlayer?.cash ?? 0);

    const lv1Cost     = Number(data.lv1_cost ?? data.build_cost ?? 0);
    const lv2Cost     = Number(data.lv2_cost ?? data.build_cost ?? 0);
    const lv1Rent     = Number(data.lv1_rent ?? data.current_rent ?? data.next_rent ?? 0);
    const lv2Rent     = Number(data.lv2_rent ?? data.next_rent ?? 0);
    const lv2Unlocked = mode === "upgrade" ? true : Boolean(data.lv2_unlocked);
    const unlockHint  = data.lv2_unlock_reason || "Qua vòng 1 hoặc sở hữu 2 ô";

    // ── Kích thước & vị trí Panel giấy kem vàng (lớn, rõ nét đúng chuẩn ảnh mẫu) ──
    const isTwoCards = mode === "build" || mode === "upgrade";
    const PW   = Math.min(width * 0.80, (isTwoCards ? 1120 : 780) * S);
    const PH   = Math.min(height * 0.58, (isTwoCards ? 510 : 450) * S);
    const PCX  = width / 2;
    const PCY  = height - PH / 2 - 28 * S;
    const LEFT = PCX - PW / 2;
    const TOP  = PCY - PH / 2;
    const RAD  = Math.round(24 * S);

    // ── Overlay tối mờ toàn bàn cờ ───────────────────────────────────
    push(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.42).setDepth(D));

    const sendDecline = () => {
      if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
      this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: false });
      this._closeBuildPanel();
    };

    const sendAccept = (chosenLevel = 1) => {
      if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
      this.socket.emit("game:build_response", {
        room_id: this.gameRoomId,
        cell_index: data.cell_index,
        accept: true,
        level: chosenLevel,
      });
      this._closeBuildPanel();
    };

    // ── Khung Panel giấy kem vàng + viền trắng + nét đứt + nút X đỏ bóng ──
    drawCreamModalPanel(this, {
      left: LEFT,
      top: TOP,
      width: PW,
      height: PH,
      radius: RAD,
      depth: D + 1,
      title: null,
      onClose: sendDecline,
      push,
    });

    // ── Thanh đếm ngược xanh lá phía trên-trái ngoài mép bảng (giống ảnh mẫu) ──
    const TIMER_SECS = Number(data.time_limit || 15);
    const TBAR_W = PW * 0.42;
    const TBAR_H = 12 * S;
    const TBAR_X = LEFT + 18 * S;
    const TBAR_Y = TOP - 22 * S;

    const timerBg = push(this.add.graphics().setDepth(D + 3));
    timerBg.fillStyle(0x111827, 0.68);
    timerBg.fillRoundedRect(TBAR_X, TBAR_Y, TBAR_W, TBAR_H, TBAR_H / 2);
    timerBg.lineStyle(1.8 * S, 0x000000, 0.6);
    timerBg.strokeRoundedRect(TBAR_X, TBAR_Y, TBAR_W, TBAR_H, TBAR_H / 2);

    const timerFill = push(this.add.graphics().setDepth(D + 4));
    const drawTimerBar = (frac) => {
      timerFill.clear();
      const col = frac > 0.45 ? 0x84cc16 : frac > 0.2 ? 0xfacc15 : 0xef4444;
      timerFill.fillStyle(col, 1);
      timerFill.fillRoundedRect(TBAR_X + 1.5, TBAR_Y + 1.5, Math.max(TBAR_H, (TBAR_W - 3) * frac), TBAR_H - 3, TBAR_H / 2);
    };
    drawTimerBar(1);

    let secsLeft = TIMER_SECS;
    this._buildTimer = this.time.addEvent({
      delay: 1000,
      repeat: TIMER_SECS - 1,
      callback: () => {
        secsLeft--;
        drawTimerBar(Math.max(0, secsLeft / TIMER_SECS));
        if (secsLeft <= 0) sendDecline();
      },
    });

    // ── Hàng trên: Tiền mặt trong hộp kem (trái) + Thanh pill xanh dương "ĐẶT TINH CẦU" (giữa) ──
    const HEADER_Y = TOP + 58 * S;

    // Tiền mặt bên trái (nền pill kem giống ảnh mẫu)
    const COIN_SZ  = 46 * S;
    const cashX    = LEFT + 34 * S;
    const cashText = Number(playerCash).toLocaleString("en-US");
    const cashPillW = Math.max(210 * S, COIN_SZ + cashText.length * 19 * S + 34 * S);
    const cashPillH = 52 * S;
    const cashBg = push(this.add.graphics().setDepth(D + 3));
    cashBg.fillStyle(0xdccda4, 0.72);
    cashBg.fillRoundedRect(cashX, HEADER_Y - cashPillH / 2, cashPillW, cashPillH, 14 * S);
    cashBg.lineStyle(1.5 * S, 0xc4b07e, 0.75);
    cashBg.strokeRoundedRect(cashX, HEADER_Y - cashPillH / 2, cashPillW, cashPillH, 14 * S);

    if (this.textures.exists("coin")) {
      push(this.add.image(cashX + 12 * S + COIN_SZ / 2, HEADER_Y, "coin")
        .setDisplaySize(COIN_SZ, COIN_SZ).setDepth(D + 4));
    }
    push(this.add.text(cashX + 12 * S + COIN_SZ + 10 * S, HEADER_Y, cashText, {
      fontFamily: "Signika",
      fontSize: Math.floor(32 * S) + "px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#4a2400",
      strokeThickness: 5 * S,
    }).setOrigin(0, 0.5).setDepth(D + 4));

    // Tiêu đề pill xanh dương bóng (giống hệt ảnh mẫu)
    const titleStr = mode === "upgrade"
      ? "NÂNG CẤP TINH CẦU"
      : mode === "buyout"
        ? `THÂU TÓM NHÀ • LV.${curLv}`
        : "ĐẶT TINH CẦU";
    const PILL_W = Math.min(PW * 0.44, 410 * S);
    const PILL_H = 58 * S;
    const PILL_R = 14 * S;
    const pillG = push(this.add.graphics().setDepth(D + 3));
    pillG.fillStyle(0x035388, 0.38);
    pillG.fillRoundedRect(PCX - PILL_W / 2 + 2 * S, HEADER_Y - PILL_H / 2 + 5 * S, PILL_W, PILL_H, PILL_R);
    pillG.fillGradientStyle(0x2cc6fb, 0x2cc6fb, 0x0584c7, 0x0584c7, 1);
    pillG.fillRoundedRect(PCX - PILL_W / 2, HEADER_Y - PILL_H / 2, PILL_W, PILL_H, PILL_R);
    pillG.fillStyle(0xffffff, 0.28);
    pillG.fillRoundedRect(PCX - PILL_W / 2 + 8 * S, HEADER_Y - PILL_H / 2 + 5 * S, PILL_W - 16 * S, PILL_H * 0.38, PILL_R - 4 * S);
    pillG.lineStyle(2.5 * S, 0x026aa7, 1);
    pillG.strokeRoundedRect(PCX - PILL_W / 2, HEADER_Y - PILL_H / 2, PILL_W, PILL_H, PILL_R);

    push(this.add.text(PCX, HEADER_Y, titleStr, {
      fontFamily: "Signika",
      fontSize: Math.floor(30 * S) + "px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#034572",
      strokeThickness: 4 * S,
    }).setOrigin(0.5).setDepth(D + 4));

    // Helper vẽ ổ khóa vàng 3D lớn, rõ nét giống ảnh mẫu
    const drawPadlock = (lx, ly, rScale) => {
      const g = push(this.add.graphics().setDepth(D + 7));
      const bw = 54 * rScale, bh = 46 * rScale;
      g.lineStyle(9 * rScale, 0x4b5563, 1);
      g.beginPath();
      g.arc(lx, ly - bh * 0.42, bw * 0.31, Math.PI, 0, false);
      g.strokePath();
      g.lineStyle(4.5 * rScale, 0xe5e7eb, 1);
      g.beginPath();
      g.arc(lx, ly - bh * 0.42, bw * 0.31, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(0x000000, 0.32);
      g.fillRoundedRect(lx - bw / 2 + 2.5 * rScale, ly - bh * 0.32 + 4 * rScale, bw, bh, 9 * rScale);
      g.fillGradientStyle(0xfef08a, 0xfef08a, 0xd97706, 0xd97706, 1);
      g.fillRoundedRect(lx - bw / 2, ly - bh * 0.32, bw, bh, 9 * rScale);
      g.lineStyle(2.8 * rScale, 0x92400e, 1);
      g.strokeRoundedRect(lx - bw / 2, ly - bh * 0.32, bw, bh, 9 * rScale);
      g.fillStyle(0x78350f, 1);
      g.fillCircle(lx, ly + bh * 0.08, 5.5 * rScale);
      g.fillTriangle(lx, ly + bh * 0.08, lx - 4.2 * rScale, ly + bh * 0.42, lx + 4.2 * rScale, ly + bh * 0.42);
      return g;
    };

    if (isTwoCards) {
      // ── 2 THẺ TINH CẦU LỚN (CẤP 1 & CẤP 2) ĐÚNG TỶ LỆ ẢNH MẪU ──────
      const CARD_GAP = 38 * S;
      const CARD_W   = Math.min(460 * S, (PW - 84 * S - CARD_GAP) / 2);
      const CARD_H   = PH - 142 * S;
      const CARD_Y   = TOP + 108 * S;
      const CARD_R   = 16 * S;
      const HDR_H    = 52 * S;
      const FOOT_H   = 44 * S;

      const cardsSpec = [
        {
          lv: 1,
          title: "Tinh cầu cấp 1",
          orbKey: orbKey1,
          cost: lv1Cost,
          rent: lv1Rent,
          unlocked: true,
          owned: mode === "upgrade",
          canAfford: playerCash >= lv1Cost,
          subHint: mode === "upgrade" ? "✓ Đang sở hữu" : `Thuê: ${this._formatMoney(lv1Rent)} / lượt`,
        },
        {
          lv: 2,
          title: "Tinh cầu cấp 2",
          orbKey: orbKey2,
          cost: lv2Cost,
          rent: lv2Rent,
          unlocked: lv2Unlocked,
          owned: false,
          canAfford: lv2Unlocked && playerCash >= lv2Cost,
          subHint: lv2Unlocked ? `🪽 Miễn thâu tóm • Thuê: ${this._formatMoney(lv2Rent)}` : `🔒 ${unlockHint}`,
        },
      ];

      const totalW = CARD_W * 2 + CARD_GAP;
      const startX = PCX - totalW / 2;

      cardsSpec.forEach((c, idx) => {
        const cx = startX + idx * (CARD_W + CARD_GAP);
        const midX = cx + CARD_W / 2;
        const isGray = !c.unlocked || c.owned;
        const cardG = push(this.add.graphics().setDepth(D + 3));

        const drawCard = (hover = false) => {
          cardG.clear();
          // Bóng thẻ
          cardG.fillStyle(0x000000, 0.18);
          cardG.fillRoundedRect(cx + 3 * S, CARD_Y + 5 * S, CARD_W, CARD_H, CARD_R);

          // Thân thẻ chính (xanh dương sáng khi mở khóa, xám bạc khi khóa/đang sở hữu)
          if (isGray) {
            cardG.fillGradientStyle(0x9ca3af, 0x9ca3af, 0xb6bec8, 0xb6bec8, 1);
            cardG.fillRoundedRect(cx, CARD_Y, CARD_W, CARD_H, CARD_R);
          } else {
            cardG.fillGradientStyle(hover ? 0x3ba6ec : 0x2992dc, hover ? 0x3ba6ec : 0x2992dc, hover ? 0x7ad0ff : 0x56bcf7, hover ? 0x7ad0ff : 0x56bcf7, 1);
            cardG.fillRoundedRect(cx, CARD_Y, CARD_W, CARD_H, CARD_R);
          }

          // Dải xanh dương đậm đáy thẻ (giống dải xanh dưới cùng trong ảnh mẫu)
          cardG.fillGradientStyle(isGray ? 0x3b93d1 : 0x1a7cc4, isGray ? 0x3b93d1 : 0x1a7cc4, isGray ? 0x2574b0 : 0x1262a3, isGray ? 0x2574b0 : 0x1262a3, 1);
          cardG.fillRoundedRect(cx, CARD_Y + CARD_H - FOOT_H, CARD_W, FOOT_H, { tl: 0, tr: 0, bl: CARD_R, br: CARD_R });

          // Thanh tiêu đề xanh lá mạ đầu thẻ (giống hệt ảnh mẫu)
          cardG.fillGradientStyle(0xa5e028, 0xa5e028, 0x5fa60b, 0x5fa60b, 1);
          cardG.fillRoundedRect(cx, CARD_Y, CARD_W, HDR_H, { tl: CARD_R, tr: CARD_R, bl: 0, br: 0 });
          cardG.fillStyle(0xffffff, 0.25);
          cardG.fillRoundedRect(cx + 8 * S, CARD_Y + 4 * S, CARD_W - 16 * S, HDR_H * 0.36, 7 * S);

          // Viền thẻ ngoài
          cardG.lineStyle(hover ? 3.5 * S : 2.5 * S, hover ? 0xffe066 : (isGray ? 0x64748b : 0x1778bc), 1);
          cardG.strokeRoundedRect(cx, CARD_Y, CARD_W, CARD_H, CARD_R);
        };
        drawCard(false);

        // Chữ tiêu đề thẻ: "Tinh cầu cấp 1" / "Tinh cầu cấp 2" (lớn, rõ nét)
        push(this.add.text(midX, CARD_Y + HDR_H / 2, c.title, {
          fontFamily: "Signika",
          fontSize: Math.floor(28 * S) + "px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#2d4c0e",
          strokeThickness: 4.5 * S,
        }).setOrigin(0.5).setDepth(D + 5));

        // Ảnh Tinh Cầu lớn chính giữa thẻ
        const bodyTop = CARD_Y + HDR_H;
        const bodyH   = CARD_H - HDR_H - FOOT_H;
        const orbY    = bodyTop + bodyH * 0.42;
        const texSrc  = this.textures.exists(c.orbKey) ? this.textures.get(c.orbKey).getSourceImage() : null;
        const dispW   = (c.lv >= 2 ? 195 : 128) * S;
        const aspect  = texSrc ? (texSrc.height / texSrc.width) : 1;
        const orbImg  = push(this.add.image(midX, orbY, c.orbKey)
          .setDisplaySize(dispW, dispW * aspect).setDepth(D + 5));
        if (isGray) {
          orbImg.setTint(0x9ca3af).setAlpha(0.88);
        }

        // Ổ khóa vàng 3D khi Tinh cầu cấp 2 chưa mở khóa
        if (!c.unlocked) {
          drawPadlock(midX + 30 * S, orbY + 6 * S, S);
        }

        // Hàng "Giá gốc:    25,000" nằm ngay trên dải xanh đáy thẻ (lớn, chuẩn ảnh mẫu)
        const priceY = CARD_Y + CARD_H - FOOT_H - 24 * S;
        push(this.add.text(cx + 22 * S, priceY, "Giá gốc:", {
          fontFamily: "Signika",
          fontSize: Math.floor(25 * S) + "px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#0f172a",
          strokeThickness: 4 * S,
        }).setOrigin(0, 0.5).setDepth(D + 5));

        const costColor = !c.unlocked
          ? "#f1f5f9"
          : c.owned
            ? "#d1fae5"
            : c.canAfford
              ? "#ffe63b"
              : "#ff7b7b";
        push(this.add.text(cx + CARD_W - 22 * S, priceY, Number(c.cost).toLocaleString("en-US"), {
          fontFamily: "Signika",
          fontSize: Math.floor(28 * S) + "px",
          color: costColor,
          fontStyle: "bold",
          stroke: "#3a1a00",
          strokeThickness: 4.5 * S,
        }).setOrigin(1, 0.5).setDepth(D + 5));

        // Dòng thông tin tiền thuê / điều kiện mở khóa nằm gọn giữa dải xanh đáy thẻ
        push(this.add.text(midX, CARD_Y + CARD_H - FOOT_H / 2, c.subHint, {
          fontFamily: "Signika",
          fontSize: Math.floor(19 * S) + "px",
          color: !c.unlocked ? "#fef08a" : "#ffffff",
          fontStyle: "bold",
          stroke: "#0c2238",
          strokeThickness: 3 * S,
        }).setOrigin(0.5).setDepth(D + 5));

        // Click trực tiếp vào thẻ để chọn xây / nâng cấp
        const zone = push(this.add.zone(midX, CARD_Y + CARD_H / 2, CARD_W, CARD_H)
          .setDepth(D + 8).setInteractive({ useHandCursor: !isGray }));
        zone.on("pointerover", () => { if (!isGray) drawCard(true); });
        zone.on("pointerout",  () => { if (!isGray) drawCard(false); });
        zone.on("pointerup", () => {
          if (c.owned) return;
          if (!c.unlocked) {
            this._showToast(`🔒 ${unlockHint} để mở Tinh cầu cấp 2!`, "#fde047", 2000);
            this.tweens.add({ targets: orbImg, x: midX + 6 * S, duration: 50, yoyo: true, repeat: 2 });
            return;
          }
          if (!c.canAfford) {
            this._showToast("❌ Không đủ tiền mặt!", "#ff6666", 1700);
            return;
          }
          sendAccept(c.lv);
        });
      });
    } else {
      // ── MODE BUYOUT (THÂU TÓM NHÀ ĐỐI THỦ) — ĐỒNG BỘ GIẤY KEM VÀNG ──
      const canAfford = data.can_afford !== false;
      const orbY = TOP + PH * 0.44;
      const orbImg = push(this.add.image(PCX, orbY, orbKey1)
        .setDisplaySize(90 * S, 90 * S).setDepth(D + 4));
      push(this.add.text(PCX, TOP + PH * 0.68,
        `Mua lại từ ${data.owner_name || "đối thủ"} • Giá: ${Number(data.build_cost || 0).toLocaleString("en-US")}`, {
          fontFamily: "Signika", fontSize: Math.floor(18 * S) + "px",
          color: "#4a2000", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(D + 4));

      const BTN_W = 150 * S, BTN_H = 42 * S, BTN_Y = TOP + PH - 42 * S;
      this._buildModalBtn(shell, PCX - BTN_W / 2 - 12 * S, BTN_Y, BTN_W, BTN_H,
        canAfford ? 0x9333ea : 0x6b7280, canAfford ? 0x6b21a8 : 0x4b5563,
        canAfford ? "THÂU TÓM" : "KHÔNG ĐỦ TIỀN", () => {
          if (!canAfford) { this._showToast("❌ Không đủ tiền mặt!", "#ff5555", 1600); return; }
          sendAccept(1);
        });
      this._buildModalBtn(shell, PCX + BTN_W / 2 + 12 * S, BTN_Y, BTN_W, BTN_H,
        0xcc3322, 0x881111, "BỎ QUA", sendDecline);
      this.tweens.add({ targets: orbImg, y: orbY - 5 * S, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    // ── Slide-in mượt từ dưới lên ────────────────────────────────────
    this._buildPanelObjs.forEach(o => { if (o?.y !== undefined) o.y += PH * 0.55; });
    this.tweens.add({
      targets: this._buildPanelObjs.filter(o => o?.y !== undefined),
      y: `-=${PH * 0.55}`,
      duration: 280,
      ease: "Back.easeOut",
    });
  }

// ─────────────────────────────────────────────────────────────────
//  _buildModalBtn — nâng cấp, to hơn, đẹp hơn
// ─────────────────────────────────────────────────────────────────
  _buildModalBtn(shell, bx, by, bw, bh, c1, c2, label, cb) {
    const { D } = shell;
    const br = bh / 2;
    const S  = this.minRatio;
    const g  = this.add.graphics().setDepth(D + 5);     

    const draw = (hover = false) => {
      g.clear();
      // // Hào quang ngoài (lớn hơn)
      // g.fillStyle(c1, hover ? 0.28 : 0.15);
      // g.fillRoundedRect(bx - bw / 2 - 10, by - bh / 2 - 10, bw + 20, bh + 20, br + 8);
      // Bóng đổ (sâu hơn)
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(bx - bw / 2 + 4, by - bh / 2 + 7, bw, bh, br);
      // Nền gradient
      g.fillGradientStyle(c1, c1, c2, c2, 1);
      g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      // Shine top (lớn hơn, mịn hơn)
      g.fillStyle(0xffffff, hover ? 0.42 : 0.28);
      g.fillRoundedRect(bx - bw / 2 + 10, by - bh / 2 + 5, bw - 20, bh * 0.40, br - 3);
      // Viền trắng ngoài
      g.lineStyle(1.5, 0xffffff, 0.5);
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      // Viền màu sáng thêm
      if (hover) {
        g.lineStyle(1.5, 0xffffff, 0.75);
        g.strokeRoundedRect(bx - bw / 2 + 2, by - bh / 2 + 2, bw - 4, bh - 4, br - 2);
      }
    };

    draw(false);

    const txt = this.add.text(bx, by, label, {
      fontFamily: "Signika",
      fontSize:   Math.floor(19 * S) + "px",
      color:      "#ffffff",
      fontStyle:  "bold",
      stroke:     "#00000099",
      strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 2, color: "#000", blur: 5, fill: true },
    }).setOrigin(0.5).setDepth(D + 6);

    // Pulse nhẹ
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0.88 },
      duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    const zone = this.add.zone(bx, by, bw + 10, bh + 10)
      .setInteractive({ useHandCursor: true })
      .setDepth(D + 7);

    // zone.on("pointerover", () => {
    //   draw(true);
    //   this.tweens.add({ targets: [g, txt], scaleX: 1.06, scaleY: 1.06, duration: 90 });
    // });
    // zone.on("pointerout", () => {
    //   draw(false);
    //   this.tweens.add({ targets: [g, txt], scaleX: 1, scaleY: 1, duration: 90 });
    // });
    zone.on("pointerdown", () => {
      this.tweens.add({
        targets: [g, txt], scaleX: 0.92, scaleY: 0.92,
        duration: 60, yoyo: true,
        onComplete: () => cb()
      });
    });

    shell.addObj(g);
    shell.addObj(txt);
    shell.addObj(zone);
  }
    
  // Render lại tất cả orb từ cellStates (dùng khi reconnect / state_sync)
  _renderAllCells(cellStates) {
    if (!cellStates) return;
    Object.entries(cellStates).forEach(([idx, data]) => {
      const cell = this.boardPath[Number(idx)];
      if (cell && cell.type !== 'skill') {
        const hex = this._planetColorToHex(data.planet_color);
        const lv  = Math.max(1, Math.min(2, Number(data.level || 1)));
        this.paintCellGlowAnimated(cell, hex, lv);
      }
    });
    this._refreshAllCellComboBadges();
  }
  
  _showToast(message, color = "#ffffff", duration = 2500) {
    const { width, height } = this.scale;
    const S = Math.min(width / this.originalWidth, height / this.originalHeight);
    const toastY = height - 150 * S;
    const BAR_W  = Math.min(Math.floor(560 * S), width * 0.75);
    const BAR_H  = Math.floor(42 * S);
    const GRAD_W = 70;
    const BORDER_C = 0x0088ff;

    // Nền gradient
    const g = this.add.graphics().setDepth(200).setAlpha(0);
    const bx = width / 2 - BAR_W / 2;
    const by = toastY - BAR_H / 2;

    g.fillStyle(0x000000, 0.60);
    g.fillRect(bx, by, BAR_W, BAR_H);
    for (let i = 0; i < GRAD_W; i++) {
      g.fillStyle(0x000000, (i / GRAD_W) * 0.60);
      g.fillRect(bx - GRAD_W + i, by, 1, BAR_H);
      g.fillStyle(0x000000, (1 - i / GRAD_W) * 0.60);
      g.fillRect(bx + BAR_W + i, by, 1, BAR_H);
    }
    // Border trên + dưới
    g.lineStyle(Math.max(1, Math.floor(1.5 * S)), BORDER_C, 0.9);
    g.beginPath(); g.moveTo(bx - GRAD_W, by); g.lineTo(bx + BAR_W + GRAD_W, by); g.strokePath();
    g.beginPath(); g.moveTo(bx - GRAD_W, by + BAR_H); g.lineTo(bx + BAR_W + GRAD_W, by + BAR_H); g.strokePath();

    const toast = this.add.text(width / 2, toastY, message, {
      fontFamily: "Signika", fontSize: Math.floor(16 * S) + "px", color,
      fontStyle: "bold", stroke: "#000000", strokeThickness: Math.floor(3 * S),
    }).setOrigin(0.5).setDepth(201).setAlpha(0);

    this.tweens.add({
      targets: [g, toast], alpha: 1, duration: 200,
      onComplete: () => this.time.delayedCall(duration, () => {
        this.tweens.add({ targets: [g, toast], alpha: 0, duration: 300,
          onComplete: () => { try { g.destroy(); toast.destroy(); } catch(e){} } });
      })
    });
  }
  
  _planetColorToHex(color) {
    return { red: 0xff2233, blue: 0x2266ff, purple: 0x9933ff, orange: 0xff7700 }[color] || 0x2266ff;
  }
  
  _hexToOrbKey(hex, level = 1) {
    const suffix = Number(level) >= 2 ? "2" : "";
    const base = { 0xff7700: "orb_orange", 0xff2233: "orb_red", 0x2266ff: "orb_blue", 0x9933ff: "orb_purple" }[hex] || "orb_blue";
    const key = base + suffix;
    return this.textures.exists(key) ? key : base;
  }
  
  _formatMoney(amount) {
    if (!amount) return "0";
    if (amount >= 1000000) return (amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1) + "M";
    if (amount >= 1000)    return Math.floor(amount / 1000) + "K";
    return String(amount);
  }

  _getPlayerColor(planetColor) {
      if (!planetColor) return "#ffffff";
      const key = planetColor.toString().trim().toLowerCase();
      const colors = {
          purple: "#c084fc", // Tím (Khớp với P1)
          red:    "#ff4444", // Đỏ (Khớp với P2)
          blue:   "#60a5fa", // Xanh dương
          orange: "#fb923c"  // Cam
      };
      return colors[key] || "#ffffff";
  }

  _showBoardHudChatBubble(userId, text) {
    const uid = Number(userId);
    const panel = (this.playerPanels || []).find(p => Number(p.userId) === uid);
    const anchor = panel?.chatBubbleAnchor;
    if (!anchor) return;

    this._hudChatBubbles = this._hudChatBubbles || new Map();
    const prev = this._hudChatBubbles.get(uid);
    if (prev) {
      try { prev.timer?.remove(false); } catch (_) {}
      try { prev.container?.destroy(); } catch (_) {}
      this._hudChatBubbles.delete(uid);
    }

    const r = this.minRatio || 1;
    const maxTextW = Math.round(280 * r);
    const padX = Math.round(22 * r);
    const padY = Math.round(13 * r);
    const arrowW = Math.round(11 * r);
    const arrowH = Math.round(16 * r);

    const displayMsg = String(text || "").trim().slice(0, 90);
    if (!displayMsg) return;

    const txt = this.add.text(0, 0, displayMsg, {
      fontFamily: "Signika",
      fontSize: Math.max(17, Math.round(23 * r)) + "px",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#061529",
      strokeThickness: 3,
      align: "center",
      wordWrap: { width: maxTextW, useAdvancedWrap: true },
    }).setOrigin(0.5);

    const bw = Math.max(Math.round(130 * r), Math.ceil(txt.width) + padX * 2);
    const bh = Math.max(Math.round(54 * r), Math.ceil(txt.height) + padY * 2);
    const rad = Math.round(12 * r);

    // Đặt tâm bong bóng bên phải (nếu player góc trái) hoặc bên trái (nếu player góc phải)
    const cx = anchor.isLeft ? (anchor.x + arrowW + bw / 2) : (anchor.x - arrowW - bw / 2);
    const cy = anchor.y;

    const g = this.add.graphics();
    // Nền xanh dương trong suốt giống ảnh mẫu
    g.fillStyle(0x0b2545, 0.76);
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, rad);
    g.lineStyle(1.4, 0x62b0f5, 0.55);
    g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, rad);

    // Mũi tên nhỏ chỉ về phía thẻ avatar của người chat
    g.fillStyle(0x0b2545, 0.88);
    if (anchor.isLeft) {
      g.fillTriangle(-bw / 2, -arrowH / 2, -bw / 2, arrowH / 2, -bw / 2 - arrowW, 0);
    } else {
      g.fillTriangle(bw / 2, -arrowH / 2, bw / 2, arrowH / 2, bw / 2 + arrowW, 0);
    }

    const container = this.add.container(cx, cy, [g, txt])
      .setDepth(245)
      .setAlpha(0)
      .setScale(0.86);

    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
    });

    const timer = this.time.delayedCall(4200, () => {
      if (!container?.active) return;
      this.tweens.add({
        targets: container,
        alpha: 0,
        duration: 320,
        onComplete: () => {
          try { container.destroy(); } catch (_) {}
          if (this._hudChatBubbles?.get(uid)?.container === container) {
            this._hudChatBubbles.delete(uid);
          }
        },
      });
    });

    this._hudChatBubbles.set(uid, { container, timer });
  }

  _showBoardCharacterEmoji(userId, emojiId) {
    const uid = Number(userId);
    const myUid = Number(this._myUserId());
    let targetSprite = null;
    if (uid === myUid && this.player?.active) {
      targetSprite = this.player;
    } else {
      const opKey = Object.keys(this.otherPlayers || {}).find(
        k => Number(this.otherPlayers[k]?.user_id) === uid
      );
      if (opKey && this.otherPlayers[opKey]?.active) {
        targetSprite = this.otherPlayers[opKey];
      }
    }
    if (!targetSprite) return;
    showCharacterEmojiBubble(this, {
      userId: uid,
      emojiId,
      targetSprite,
      offsetX: Math.round(34 * (this.minRatio || 1)),
      offsetY: -126 * (this.minRatio || 1),
      depth: 240,
      size: Math.max(56, Math.round(70 * (this.minRatio || 1))),
    });
  }

  _buildGameChat(width, height) {
    const BTN_SIZE  = 80;
    const LABEL_H   = 18;
    const GAP       = 0;
    const TOTAL_H   = BTN_SIZE + GAP + LABEL_H;
    const PAD_V     = 8;
    const PAD_R     = 7  ;
    const D         = 55;

    const centerY   = height / 2;
    const iconY     = centerY - (LABEL_H + GAP) / 2;
    const labelY    = iconY + BTN_SIZE / 2 + GAP;

    // Icon căn giữa theo chiều ngang của nền
    // Nền bắt đầu từ x=0, rộng đủ bao icon
    const bgH   = TOTAL_H + PAD_V * 2;
    const bgW   = BTN_SIZE + PAD_R;  // đủ bao toàn bộ icon
    const btnX  = bgW / 2;           // icon căn giữa nền

    // ── Nền — bám viền trái, bo góc phải ──────────────────────────
    const bgG = this.add.graphics().setDepth(D - 1);
    bgG.fillStyle(0x2a363d, 0.9);
    bgG.fillRoundedRect(0, centerY - bgH / 2, bgW, bgH, { tl: 0, tr: 14, bl: 0, br: 14 });

    // ── Icon ──────────────────────────────────────────────────────
    const icon = this.add.image(btnX, iconY, "chat_btn")
      .setDisplaySize(BTN_SIZE, BTN_SIZE)
      .setDepth(D)
      .setInteractive({ cursor: "pointer" });

    // ── Label sát icon ────────────────────────────────────────────
    const label = this.add.text(btnX, labelY, "Chat", {
      fontFamily: "Signika", fontSize: "14px", color: "#dff8ff",
      fontStyle: "bold", stroke: "#111111", strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(D + 1);

    icon.on("pointerover",  () => icon.setTint(0xddddff));
    icon.on("pointerout",   () => icon.clearTint());
    icon.on("pointerdown",  () => this._toggleGameChatPanel(width, height));

    // ── Badge số lượng tin nhắn chưa đọc trên icon Chat ──────────────
    const badgeX = btnX + BTN_SIZE / 2 - 8;
    const badgeY = iconY - BTN_SIZE / 2 + 10;
    const badgeG = this.add.graphics().setDepth(D + 3).setVisible(false);
    const badgeTxt = this.add.text(badgeX, badgeY, "0", {
      fontFamily: "Signika", fontSize: "12px", color: "#ffffff", fontStyle: "bold",
      stroke: "#7f1d1d", strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(D + 4).setVisible(false);
    this._gameChatBadgeG = badgeG;
    this._gameChatBadgeTxt = badgeTxt;
    this._gameChatBadgePos = { x: badgeX, y: badgeY };

    this._gameChatBtnObjs = [bgG, icon, label, badgeG, badgeTxt];

    // ── Lắng nghe chat:game:message liên tục ngay cả khi chưa mở hộp chat ──
    this._gameChatHistory = [];
    this._gameChatUnread = 0;
    this._gameChatHistoryFetched = false;

    if (this._onGameChatMsg) this.socket?.off("chat:game:message", this._onGameChatMsg);
    if (this._onGameChatHist) this.socket?.off("chat:game:history", this._onGameChatHist);

    this._onGameChatMsg = (data) => {
      if (!data) return;
      this._gameChatHistory.push({
        user_id: data.user_id,
        name: data.name,
        message: data.message,
        time: data.time,
      });
      if (this._gameChatHistory.length > 200) this._gameChatHistory.shift();

      if (!this._gameChatPanelOpen && Number(data.user_id) !== Number(this._myUserId())) {
        this._gameChatUnread = (this._gameChatUnread || 0) + 1;
        this._updateGameChatBadge(true);
      }

      // Nếu tin nhắn có mã Emoji [e:1..50] -> hiện bong bóng cảm xúc trên đầu & bám theo nhân vật trên bàn cờ
      const eid = extractEmojiId(data.message);
      if (eid) {
        this._showBoardCharacterEmoji(data.user_id, eid);
      }

      // Nếu tin nhắn có nội dung chữ -> hiện bong bóng chat cạnh thẻ avatar/HUD của người đó
      const cleanText = String(data.message || "").replace(/\[e:\d{1,2}\]/g, "").trim();
      if (cleanText) {
        this._showBoardHudChatBubble(data.user_id, cleanText);
      }
    };

    this._onGameChatHist = (history) => {
      if (!Array.isArray(history)) return;
      if (!this._gameChatHistory?.length) {
        this._gameChatHistory = history.slice(-200);
      }
    };

    this.socket?.on("chat:game:message", this._onGameChatMsg);
    this.socket?.on("chat:game:history", this._onGameChatHist);

    // ── Nút Cài Đặt Âm Thanh / Nhạc Nền ngay phía trên nút Chat ──────────
    if (this.textures.exists("icon_setting")) {
      const gearX = 36;
      const gearY = centerY - bgH / 2 - 36;
      const gearBtn = this.add.image(gearX, gearY, "icon_setting")
        .setDisplaySize(50, 50)
        .setDepth(D + 2)
        .setInteractive({ useHandCursor: true });
      gearBtn.on("pointerover", () => gearBtn.setTint(0xddddff));
      gearBtn.on("pointerout",  () => gearBtn.clearTint());
      gearBtn.on("pointerdown", () => this._toggleBoardSettingsBar(gearX, gearY));
      this._gameChatBtnObjs.push(gearBtn);
    }

    // ── Nút Micro nhanh ngay phía dưới nút Chat (đồng bộ chuẩn với nút mic trong Chat) ──
    const micX = 36;
    const micY = centerY + bgH / 2 + 36;
    const micR = 24;
    const micG = this.add.graphics().setDepth(D + 2);
    const micBadgeTxt = this.add.text(micX + 16, micY + 15, "×", {
      fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 4).setVisible(false);
    const micImg = this.add.image(micX, micY, "icon_mic")
      .setDisplaySize(46, 46).setDepth(D + 3);
    let micHover = false;

    const drawQuickMic = (snap = voiceChat.getSnapshot()) => {
      if (!micG?.active) return;
      const on = !!snap?.micEnabled;
      const speaking = on && !!snap?.isSpeaking;
      micG.clear();
      const R = 23;

      // Bóng đổ nhẹ (không còn nền tròn/vuông)
      micG.fillStyle(0x000000, 0.32);
      micG.fillCircle(micX + 1.5, micY + 3, R - 1);

      if (speaking) {
        micG.lineStyle(7, 0x4ade80, 0.28);
        micG.strokeCircle(micX, micY, R + 4);
        micG.lineStyle(3, 0x86efac, 1);
        micG.strokeCircle(micX, micY, R + 1.5);
      } else if (on) {
        micG.lineStyle(2, 0x93e6ff, 0.6);
        micG.strokeCircle(micX, micY, R + 1.5);
      }

      if (micImg?.active) {
        const sc = (micHover ? 1.1 : 1) * (speaking ? 1.06 : 1);
        micImg.setDisplaySize(46 * sc, 46 * sc);
        if (on) { micImg.clearTint(); micImg.setAlpha(1); }
        else    { micImg.setTint(0x9aa8bb); micImg.setAlpha(0.85); }
      }

      if (!on) {
        const bx = micX + 16, by = micY + 15, br = 8;
        micG.fillStyle(0x000000, 0.38);
        micG.fillCircle(bx + 1, by + 1.5, br);
        micG.fillStyle(0xef4444, 1);
        micG.fillCircle(bx, by, br);
        micG.lineStyle(1.6, 0xffffff, 0.95);
        micG.strokeCircle(bx, by, br);
        micBadgeTxt.setPosition(bx, by - 0.5).setVisible(true);
      } else {
        micBadgeTxt.setVisible(false);
      }
    };

    const micZone = this.add.zone(micX, micY, micR * 2.2, micR * 2.2)
      .setDepth(D + 5).setInteractive({ useHandCursor: true });
    micZone.on("pointerover", () => { micHover = true; drawQuickMic(); });
    micZone.on("pointerout",  () => { micHover = false; drawQuickMic(); });
    micZone.on("pointerdown", () => { voiceChat.toggleMic(); });

    if (this._unsubVoiceHud) { try { this._unsubVoiceHud(); } catch {} }
    this._unsubVoiceHud = voiceChat.onStateChange((snap) => drawQuickMic(snap));
    this._gameChatBtnObjs.push(micG, micImg, micBadgeTxt, micZone);

    this._gameChatPanelOpen = false;
  }

  _updateGameChatBadge(animate = false) {
    const g = this._gameChatBadgeG;
    const txt = this._gameChatBadgeTxt;
    const pos = this._gameChatBadgePos;
    if (!g || !txt || !pos) return;

    const count = Number(this._gameChatUnread || 0);
    g.clear();
    if (count <= 0) {
      g.setVisible(false);
      txt.setVisible(false);
      return;
    }

    const label = count > 99 ? "99+" : String(count);
    const rx = label.length >= 3 ? 14 : label.length === 2 ? 12 : 10.5;
    const ry = 10.5;
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(pos.x + 1, pos.y + 2, rx * 2, ry * 2);
    g.fillStyle(0xef4444, 1);
    g.fillEllipse(pos.x, pos.y, rx * 2, ry * 2);
    g.lineStyle(2, 0xffffff, 0.96);
    g.strokeEllipse(pos.x, pos.y, rx * 2, ry * 2);
    g.setVisible(true);

    txt.setText(label).setPosition(pos.x, pos.y - 0.5).setVisible(true);
    if (animate) {
      txt.setScale(1.35);
      this.tweens.add({
        targets: txt,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: "Back.easeOut",
      });
    }
  }

  _toggleBoardSettingsBar(gearX, gearY) {
    if (this._boardSettingsBar) {
      this._boardSettingsBar.forEach(o => { try { o?.destroy(); } catch (e) {} });
      this._boardSettingsBar = null;
      return;
    }

    const ICON_SIZE = 44;
    const GAP = 10;
    const PAD = 8;
    const D = 250;
    const barW = PAD * 2 + ICON_SIZE * 2 + GAP;
    const barH = ICON_SIZE + PAD * 2;
    const barX = gearX + 32;
    const barY = gearY - barH / 2;

    const objs = [];
    const push = (o) => { objs.push(o); return o; };

    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x0b172e, 0.92);
    bg.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    bg.lineStyle(1.5, 0x38bdf8, 0.75);
    bg.strokeRoundedRect(barX, barY, barW, barH, barH / 2);

    ["icon_sound", "icon_music"].forEach((key, i) => {
      const ix = barX + PAD + ICON_SIZE / 2 + i * (ICON_SIZE + GAP);
      const iy = gearY;
      const isMusicBtn = key === "icon_music";
      const img = push(this.add.image(ix, iy, key)
        .setDisplaySize(ICON_SIZE, ICON_SIZE)
        .setDepth(D + 1)
        .setInteractive({ useHandCursor: true }));

      const badgeG = push(this.add.graphics().setDepth(D + 2));
      const badgeTxt = push(this.add.text(ix + 13, iy + 13, "×", {
        fontFamily: "Signika", fontSize: "13px", color: "#ffffff", fontStyle: "bold"
      }).setOrigin(0.5).setDepth(D + 3).setVisible(false));

      const drawState = () => {
        const active = isMusicBtn ? isMusicEnabled() : isSoundEnabled();
        badgeG.clear();
        if (active) {
          img.clearTint();
          img.setAlpha(1);
          badgeTxt.setVisible(false);
        } else {
          img.setTint(0x7c8aa0);
          img.setAlpha(0.55);
          const bx = ix + 13, by = iy + 13, br = 8;
          badgeG.fillStyle(0x000000, 0.35);
          badgeG.fillCircle(bx + 1, by + 1.5, br);
          badgeG.fillStyle(0xef4444, 1);
          badgeG.fillCircle(bx, by, br);
          badgeG.lineStyle(1.6, 0xffffff, 0.95);
          badgeG.strokeCircle(bx, by, br);
          badgeTxt.setPosition(bx, by - 0.5).setVisible(true);
        }
      };
      drawState();

      img.on("pointerdown", () => {
        if (isMusicBtn) setMusicEnabled(this, !isMusicEnabled());
        else setSoundEnabled(this, !isSoundEnabled());
        drawState();
      });
    });

    this._boardSettingsBar = objs;
  }

  _toggleGameChatPanel(width, height) {
    if (this._gameChatPanelOpen) {
      this._destroyGameChatPanel();
    } else {
      this._openGameChatPanel(width, height);
    }
  }

  _openGameChatPanel(width, height) {
    this._gameChatPanelOpen = true;
    this._gameChatUnread = 0;
    this._updateGameChatBadge(false);

    const PANEL_W = Math.min(320, Math.floor(width * 0.26));
    const PANEL_H = 320;
    const PANEL_X = 14 + 72 + 10; // bên phải nút chat
    const PANEL_Y = height / 2 - PANEL_H / 2;
    const D       = 60;

    const objs = [];
    const push  = o => { objs.push(o); return o; };

    // ── Nền panel ─────────────────────────────────────────────────
    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x041428, 0.92);
    bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 10);
    bg.lineStyle(1.5, 0x2255aa, 0.7);
    bg.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 10);

    // ── Tiêu đề ───────────────────────────────────────────────────
    const TAB_H = 32;
    const tabBg = push(this.add.graphics().setDepth(D + 1));
    tabBg.fillStyle(0x0a2040, 1);
    tabBg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, TAB_H, { tl: 10, tr: 10, bl: 0, br: 0 });
    tabBg.lineStyle(1, 0x2255aa, 0.5);
    tabBg.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, TAB_H, { tl: 10, tr: 10, bl: 0, br: 0 });

    push(this.add.text(PANEL_X + PANEL_W / 2, PANEL_Y + TAB_H / 2, "Chat Trong Trận", {
      fontFamily: "Signika", fontSize: "14px", color: "#aaddff", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(D + 2));

    // ── Nút đóng X — nhô ra góc trên phải giống LobbyScene ────────
    const closeR  = 18;
    const closeX  = PANEL_X + PANEL_W;
    const closeY  = PANEL_Y;
    const closeBtn = push(this.add.image(closeX, closeY, "close_btn")
      .setDisplaySize(closeR * 2.2, closeR * 2.2).setDepth(D + 5)
      .setInteractive({ cursor: "pointer" }));
    const closeZone = push(this.add.zone(closeX, closeY, closeR * 2.6, closeR * 2.6)
      .setInteractive({ cursor: "pointer" }).setDepth(D + 6));
    closeBtn.on("pointerover",  () => closeBtn.setAlpha(0.8));
    closeBtn.on("pointerout",   () => closeBtn.setAlpha(1));
    closeZone.on("pointerdown", () => this._destroyGameChatPanel());

    // ── ChatWidget channel "game" ──────────────────────────────────
    this._gameChat?.destroy();
    this._gameChat = new ChatWidget(this, {
      channel:   "game",
      socket:    this.socket,
      depth:     D + 1,
      myId:      this._myUserId(),
      enableMic: true,
    });
    this._gameChat.build(PANEL_X, PANEL_Y + TAB_H, PANEL_W, PANEL_H - TAB_H);
    this._gameChat.addSystemMessage("Chat trong trận — Chúc vui!");

    // Hiển thị lại các tin nhắn đã nhận trước đó (kể cả lúc đóng chat)
    const myUid = Number(this._myUserId());
    (this._gameChatHistory || []).forEach(d => {
      const isMe = myUid && Number(d.user_id) === myUid;
      const label = isMe ? `[Bạn] ${d.message}` : `[${d.name}] ${d.message}`;
      this._gameChat._appendLine(label, isMe ? "#aaddff" : "#ffffff", d.time);
    });

    this._gameChatPanelObjs = objs;
  }

  _destroyGameChatPanel() {
    this._gameChatPanelOpen = false;
    this._gameChat?.destroy();
    this._gameChat = null;
    this._gameChatPanelObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._gameChatPanelObjs = [];
  }

  // =====================
  // DEMO / BÁO CÁO PANEL (Bật/tắt bằng phím F9)
  // =====================
  _toggleDemoPanel() {
    if (this._demoPanelObjs && this._demoPanelObjs.length > 0) {
      this._closeDemoPanel();
    } else {
      this._openDemoPanel();
    }
  }

  _closeDemoPanel() {
    if (!this._demoPanelObjs) return;
    this._demoPanelObjs.forEach(o => { try { o?.destroy(); } catch (e) {} });
    this._demoPanelObjs = [];
  }

  _demoRollToCell(targetCell) {
    if (!this.isMyTurn || !this.canRoll) {
      this._showToast("⏳ Chỉ dùng được khi đang tới lượt tung xúc xắc của bạn!", "#ffaa44", 2200);
      return;
    }
    const idx = Number(targetCell);
    if (!Number.isInteger(idx) || idx < 0 || idx >= (this.boardPath?.length || 37)) {
      this._showToast("❌ Số ô không hợp lệ (0 - 36)!", "#ff5555", 2000);
      return;
    }
    this.canRoll = false;
    this.powerDice?.hide();
    playBoardDiceSound(this);
    this.socket.emit("game:demo_roll_to", {
      room_id: this.gameRoomId,
      target_cell: idx,
    });
  }

  _openDemoPanel() {
    this._closeDemoPanel();
    const { width } = this.scale;
    const S = this.minRatio || 1;
    const D = 500;
    this._demoPanelObjs = [];
    const push = (o) => { this._demoPanelObjs.push(o); return o; };

    const items = [
      { label: "👹 Ô 28 Quái Vật",  color: 0xdc2626, fn: () => this._demoRollToCell(28) },
      { label: "👨‍🏫 Ô 18 Thầy Giáo", color: 0x2563eb, fn: () => this._demoRollToCell(18) },
      { label: "💎 Ô 9 Kho Báu",    color: 0xd97706, fn: () => this._demoRollToCell(9) },
      { label: "🏁 Ô 0 START",      color: 0x16a34a, fn: () => this._demoRollToCell(0) },
      { label: "🎯 Ô Bất Kỳ...",    color: 0x7c3aed, fn: () => {
        const val = window.prompt("Nhập số ô muốn đi tới (0 - 36):", "28");
        if (val !== null && val.trim() !== "") this._demoRollToCell(Number(val.trim()));
      }},
      { label: "⚡ Đầy 100 Nộ",     color: 0x0891b2, fn: () => {
        this.socket.emit("game:demo_fill_energy", { room_id: this.gameRoomId });
        this._showToast("⚡ Đã nạp đầy 100 Nộ!", "#38bdf8", 1600);
      }},
      { label: "✕ Đóng (F9)",       color: 0x475569, fn: () => this._closeDemoPanel() },
    ];

    const BTN_W = 122 * S, BTN_H = 34 * S, GAP = 8 * S, PAD = 12 * S;
    const PW = items.length * BTN_W + (items.length - 1) * GAP + PAD * 2;
    const PH = 72 * S;
    const PCX = width / 2;
    const PCY = 58 * S;

    const bg = push(this.add.graphics().setDepth(D));
    bg.fillStyle(0x0b1222, 0.92);
    bg.fillRoundedRect(PCX - PW / 2, PCY - PH / 2, PW, PH, 14 * S);
    bg.lineStyle(2 * S, 0x38bdf8, 0.85);
    bg.strokeRoundedRect(PCX - PW / 2, PCY - PH / 2, PW, PH, 14 * S);

    push(this.add.text(PCX, PCY - PH / 2 + 12 * S, "🎛 CHẾ ĐỘ DEMO BÁO CÁO (Phím F9 để bật/tắt)", {
      fontFamily: "Signika", fontSize: Math.max(10, Math.floor(11.5 * S)) + "px",
      color: "#7dd3fc", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 1));

    const startX = PCX - PW / 2 + PAD + BTN_W / 2;
    const btnY = PCY + 11 * S;
    items.forEach((it, i) => {
      const bx = startX + i * (BTN_W + GAP);
      const g = push(this.add.graphics().setDepth(D + 1));
      g.fillStyle(it.color, 1);
      g.fillRoundedRect(bx - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8 * S);
      g.lineStyle(1.5 * S, 0xffffff, 0.55);
      g.strokeRoundedRect(bx - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8 * S);

      push(this.add.text(bx, btnY, it.label, {
        fontFamily: "Signika", fontSize: Math.max(10, Math.floor(11.5 * S)) + "px",
        color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 2
      }).setOrigin(0.5).setDepth(D + 2));

      const z = push(this.add.zone(bx, btnY, BTN_W, BTN_H).setDepth(D + 3).setInteractive({ useHandCursor: true }));
      z.on("pointerdown", () => it.fn());
    });
  }

  shutdown() {
    // Dừng nhạc nền board & xóa intro timers
    try { this.sound.get("board_bgm")?.stop(); } catch(e) {}
    try {
      this.game.canvas.style.filter = "";
      this.game.canvas.style.transition = "";
    } catch(e) {}
    if (this._onDemoKeyDown) {
      window.removeEventListener("keydown", this._onDemoKeyDown);
      this._onDemoKeyDown = null;
    }
    this._closeDemoPanel();
    this._profilePanel?.destroy();
    this._profilePanel = null;
    if (this._skillHideTimer) {
      try { this._skillHideTimer.remove(false); } catch (e) {}
      this._skillHideTimer = null;
    }
    this._skillObjs?.forEach(o => { try { o?.destroy(); } catch (e) {} });
    this._skillObjs = [];
    this._miniEventLogObjs?.forEach(o => { try { o?.destroy(); } catch (e) {} });
    this._miniEventLogObjs = [];
    (this._introTimers || []).forEach(id => clearTimeout(id));
    this._introTimers = [];
    this._isIntroRunning = false;
    this._loadingFallbackTimer && clearTimeout(this._loadingFallbackTimer);
    this._loadingFallbackTimer = null;
    if (this._onGameChatMsg) {
      this.socket?.off("chat:game:message", this._onGameChatMsg);
      this._onGameChatMsg = null;
    }
    if (this._onGameChatHist) {
      this.socket?.off("chat:game:history", this._onGameChatHist);
      this._onGameChatHist = null;
    }
    this._gameChatBadgeG = null;
    this._gameChatBadgeTxt = null;
    this._gameChatHistory = [];
    this._gameChatUnread = 0;
    this._destroyGameChatPanel();
    if (this._unsubVoiceHud) { try { this._unsubVoiceHud(); } catch {} this._unsubVoiceHud = null; }
    if (this._unsubVoiceErr) { try { this._unsubVoiceErr(); } catch {} this._unsubVoiceErr = null; }
    voiceChat.leave();
    this._gameChatBtnObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._gameChatBtnObjs = [];
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (e) {}
      this.socket = null;
    }
    // Chỉ xóa session reconnect khi người dùng chủ động thoát (flag _intentionalExit = true)
    // Không xóa khi trang bị reload/unload — để SplashScene có thể reconnect
    if (this._intentionalExit) {
      try { localStorage.removeItem("activeGame"); } catch(e) {}
    }
  }

  // ── LOADING SCREEN + INTRO VÀO TRẬN (Chuẩn Cờ Tỷ Phú) ─────────────────
  _buildLoadingScreen(width, height, sceneData) {
    const D = 900;
    const S = this.minRatio || 1;
    const objs = [];
    // Gán _loadingObjs ngay từ đầu để renderChar / renderBg đồng bộ không bị return sớm
    this._loadingObjs = objs;
    const push = o => { objs.push(o); return o; };

    // ── Overlay tối vừa đủ để làm nổi bật 4 thẻ & huy hiệu 1st..4th sắc nét ──
    try {
      this.game.canvas.style.transition = "";
      this.game.canvas.style.filter = "";
    } catch (e) {}

    const overlayRect = push(
      this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 1)
        .setDepth(D)
        .setAlpha(0.62)
    );
    this._loadingOverlayRect = overlayRect;

    const players = sceneData?.players || [];
    const myUid   = this._myUserId();

    // Tỉ lệ thẻ chuẩn giống phòng chờ (không bị méo nền) + chừa chỗ huy hiệu 1st..4th ở dưới
    const CARD_W = Math.floor(Math.min(230 * S, (width - 100) / Math.max(players.length, 1) - 24));
    const CARD_H = Math.floor(CARD_W * 1.12);
    const GAP    = Math.floor(24 * S);
    const count  = Math.max(players.length, 1);
    const totalW = count * CARD_W + (count - 1) * GAP;
    const startX = width / 2 - totalW / 2;
    const cardY  = height * 0.36;

    this._loadingStatusTexts = {};
    this._loadingCardGroups = [];

    players.forEach((p, i) => {
      const cx = startX + i * (CARD_W + GAP) + CARD_W / 2;
      const left = cx - CARD_W / 2;
      const top  = cardY - CARD_H / 2;
      const bR   = 14 * S;
      const innerW = CARD_W - 8 * S;
      const innerH = CARD_H - 8 * S;
      const cardObjs = [];
      const pushCard = (o) => { push(o); cardObjs.push(o); return o; };

      // ── Khung card viền sáng nổi bật ──────────────────────────
      const cardG = pushCard(this.add.graphics().setDepth(D + 1));
      cardG.fillStyle(0x000000, 0.35);
      cardG.fillRoundedRect(left + 4 * S, top + 6 * S, CARD_W, CARD_H, bR);
      cardG.fillStyle(0x1e6ea8, 0.94);
      cardG.fillRoundedRect(left, top, CARD_W, CARD_H, bR);
      cardG.lineStyle(3 * S, 0xffffff, 0.95);
      cardG.strokeRoundedRect(left, top, CARD_W, CARD_H, bR);
      cardG.fillStyle(0xffffff, 0.16);
      cardG.fillRoundedRect(left + 4 * S, top + 4 * S, innerW, CARD_H * 0.28, bR - 2 * S);

      // ── Phông nền nhân vật (scale kiểu cover giữ nguyên tỉ lệ, không méo) ──
      const bgPath = p.active_bg_path;
      if (bgPath) {
        const bgKey = `ls_bg_${p.user_id}`;
        const fullPath = bgPath.startsWith("assets/") ? bgPath : `assets/ui/bg/${bgPath}`;
        const renderBg = () => {
          if (!this.textures.exists(bgKey) || !this._loadingObjs) return;
          const bgImg = pushCard(this.add.image(cx, cardY, bgKey).setDepth(D + 2));
          const wRatio = innerW / Math.max(1, bgImg.width);
          const hRatio = innerH / Math.max(1, bgImg.height);
          bgImg.setScale(Math.max(wRatio, hRatio));

          const maskG = this.make.graphics({ add: false });
          maskG.fillStyle(0xffffff);
          maskG.fillRoundedRect(left + 4 * S, top + 4 * S, innerW, innerH, bR - 3 * S);
          bgImg.setMask(maskG.createGeometryMask());
          push(maskG);
        };
        if (!this.textures.exists(bgKey)) {
          this.load.image(bgKey, fullPath);
          this.load.once(`filecomplete-image-${bgKey}`, renderBg);
          this.load.start();
        } else {
          renderBg();
        }
      }

      // ── Avatar nhân vật đứng giữa thẻ ────────────────────────
      const charName = p.character_name || p.characterName || "Dark_Oracle";
      const skinId   = p.skin_id || p.skin || 1;
      const frameKey = `${charName}_${skinId}_idle_000`;
      const idleAnim = `${charName}_${skinId}_idle`;
      const renderChar = () => {
        if (!this.textures.exists(frameKey) || !this._loadingObjs) return;
        const sp = pushCard(this.add.sprite(cx, cardY + CARD_H * 0.05, frameKey)
          .setOrigin(0.5, 0.5).setDepth(D + 3));
        const maxH = innerH * 0.88;
        const maxW = innerW * 0.88;
        const sc = Math.min(maxW / Math.max(1, sp.width), maxH / Math.max(1, sp.height));
        sp.setScale(sc);
        if (this.anims.exists(idleAnim)) sp.play(idleAnim);
      };
      if (this.textures.exists(frameKey)) {
        renderChar();
      } else {
        const imgPath = `assets/characters/${charName}/${charName}_${skinId}/PNG/PNG Sequences/Idle Blinking/0_${charName}_Idle Blinking_000.png`;
        this.load.image(frameKey, imgPath);
        this.load.once(`filecomplete-image-${frameKey}`, renderChar);
        this.load.start();
      }

      // ── Tên người chơi ───────────────────────────────────────
      pushCard(this.add.text(cx, top - 12 * S, p.name || "Player", {
        fontFamily: "Signika", fontSize: Math.floor(17 * S) + "px",
        color: "#ffffff", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 4
      }).setOrigin(0.5, 1).setDepth(D + 3));

      // ── Trạng thái ("Hoàn thành" / "Đang tải...") ────────────
      const isMe = Number(p.user_id) === Number(myUid);
      const BADGE_H = Math.floor(28 * S);
      const badgeY  = top + CARD_H + 8 * S;

      const statusG   = pushCard(this.add.graphics().setDepth(D + 3));
      const statusTxt = pushCard(this.add.text(cx, badgeY + BADGE_H / 2, "", {
        fontFamily: "Signika", fontSize: Math.floor(15 * S) + "px",
        color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setDepth(D + 4));

      const drawStatus = (label, color) => {
        if (!statusTxt?.active) return;
        statusTxt.setText(label);
        this.time.delayedCall(16, () => {
          if (!statusG?.active) return;
          statusG.clear();
          const sw = statusTxt.width + 26 * S;
          statusG.fillStyle(color, 0.90);
          statusG.fillRoundedRect(cx - sw / 2, badgeY, sw, BADGE_H, BADGE_H / 2);
        });
      };

      drawStatus(isMe ? "Hoàn thành" : "Đang tải...", isMe ? 0x16a34a : 0xd97706);

      // ── Huy hiệu tròn thứ tự lượt 1st / 2nd / 3rd / 4th ──────
      const rankY = badgeY + BADGE_H + 56 * S;
      const rankR = 34 * S;
      let rankBuilt = false;
      const drawRankBadge = (orderNum) => {
        if (rankBuilt || !this._loadingObjs) return;
        rankBuilt = true;
        const ord = Math.max(1, Math.min(4, Number(orderNum || (i + 1))));
        const suffix = ord === 1 ? "st" : ord === 2 ? "nd" : ord === 3 ? "rd" : "th";
        const palette = {
          1: { c1: 0xfacc15, c2: 0xb45309, rim: 0xfff3b0, txt: "#fffbeb" },
          2: { c1: 0xd97706, c2: 0x78350f, rim: 0xfde68a, txt: "#fef3c7" },
          3: { c1: 0xc26d27, c2: 0x6b320b, rim: 0xfcd34d, txt: "#fef3c7" },
          4: { c1: 0xa16207, c2: 0x5c3409, rim: 0xfbbf24, txt: "#fef3c7" },
        }[ord];

        const rg = pushCard(this.add.graphics().setDepth(D + 5));
        rg.fillStyle(0x000000, 0.45);
        rg.fillCircle(cx + 2 * S, rankY + 4 * S, rankR);
        rg.fillGradientStyle(palette.c1, palette.c1, palette.c2, palette.c2, 1);
        rg.fillCircle(cx, rankY, rankR);
        rg.lineStyle(3.5 * S, palette.rim, 1);
        rg.strokeCircle(cx, rankY, rankR);
        rg.lineStyle(1.5 * S, 0x000000, 0.45);
        rg.strokeCircle(cx, rankY, rankR - 4 * S);
        rg.fillStyle(0xffffff, 0.25);
        rg.fillEllipse(cx, rankY - rankR * 0.42, rankR * 1.15, rankR * 0.48);

        const numTxt = pushCard(this.add.text(cx - 8 * S, rankY, `${ord}`, {
          fontFamily: "Signika", fontSize: Math.floor(34 * S) + "px",
          color: palette.txt, fontStyle: "bold", stroke: "#2d1400", strokeThickness: 5,
        }).setOrigin(0.5).setDepth(D + 6));
        const supTxt = pushCard(this.add.text(cx + 12 * S, rankY + 6 * S, suffix, {
          fontFamily: "Signika", fontSize: Math.floor(16 * S) + "px",
          color: palette.txt, fontStyle: "bold", stroke: "#2d1400", strokeThickness: 3,
        }).setOrigin(0.5).setDepth(D + 6));

        [rg, numTxt, supTxt].forEach(o => o.setAlpha(0));
        this.tweens.add({
          targets: [rg, numTxt, supTxt],
          alpha: 1,
          duration: 240,
          delay: i * 70,
          ease: "Back.easeOut"
        });
      };

      this._loadingStatusTexts[p.user_id] = { drawStatus, drawRankBadge };
      this._loadingCardGroups.push({ objs: cardObjs, userId: p.user_id });

      if (!isMe) {
        this.time.delayedCall(30000, () => {
          if (this._loadingObjs && !this._isIntroRunning) drawStatus("Kết nối thất bại", 0xcc2222);
        });
      }
    });

    if (!players.length) {
      push(this.add.text(width/2, height/2, "⏳ Đang kết nối...", {
        fontFamily: "Signika", fontSize: Math.floor(24 * S) + "px",
        color: "#ffe28a", fontStyle: "bold", stroke: "#000000", strokeThickness: 4
      }).setOrigin(0.5).setDepth(D + 1));
    }

    this._loadingObjs = objs;
  }

  _playMatchStartIntro(players = []) {
    const { width, height } = this.scale;
    const S = this.minRatio || 1;
    const myUid = Number(this._myUserId());

    const pushTimer = (fn, ms) => {
      const id = setTimeout(fn, ms);
      this._introTimers = this._introTimers || [];
      this._introTimers.push(id);
      return id;
    };

    // Ẩn tạm nhân vật & nút điều khiển ở ô START trước khi giáng thế từ cột sáng
    this.powerDice?.hide();
    this.tarotBtn?.hide();
    if (this.player) this.player.setAlpha(0);
    if (this.shadow) this.shadow.setAlpha(0);
    if (this.playerNameText) this.playerNameText.setAlpha(0);
    Object.values(this.otherPlayers || {}).forEach(op => {
      op?.setAlpha?.(0);
      op?.shadow?.setAlpha?.(0);
      op?.nameText?.setAlpha?.(0);
    });

    const sorted = [...(players || [])].sort((a, b) => Number(a.turn_order || 99) - Number(b.turn_order || 99));

    const finishIntro = () => {
      if (!this.scene?.isActive?.()) return;
      this._isIntroRunning = false;
      this._hideLoadingScreen();

      // Đảm bảo tất cả nhân vật đều hiện đầy đủ ở đúng vị trí
      const cell0 = this.boardPath?.[0];
      sorted.forEach(p => {
        const sp = this._getSpriteByUserId(p.user_id);
        const c = this.boardPath?.[Number(p.index || 0)] || cell0;
        if (!sp || !c) return;
        const wx = c.x * width, wy = c.y * height;
        sp.setPosition(wx, wy).setAlpha(1).setVisible(true);
        sp.setScale(this.playerBaseScale || 0.24 * S);
        if (Number(p.user_id) === myUid) {
          this.shadow?.setPosition(wx, wy + 5).setAlpha(1).setVisible(true);
          this.playerNameText?.setPosition(wx, wy - 140 * S).setAlpha(1).setVisible(true);
        } else {
          sp.shadow?.setPosition(wx, wy + 5).setAlpha(1).setVisible(true);
          sp.nameText?.setPosition(wx, wy - 140 * S).setAlpha(1).setVisible(true);
        }
      });

      this._applyTurnState();
      this._updateTurnInfo();
      const firstPlayer = sorted[0];
      if (firstPlayer) {
        const isFirstMe = Number(firstPlayer.user_id) === myUid;
        this._showTurnBanner?.(
          isFirstMe ? "🎲 Lượt đầu tiên của bạn! Nhấn SPACE" : `🎲 Lượt đầu tiên: ${firstPlayer.name}`,
          isFirstMe ? "#ffdd00" : "#38bdf8"
        );
      }
    };

    // Fail-safe bảo đảm luôn mở khóa lượt dù tab bị ẩn
    pushTimer(() => {
      if (this._isIntroRunning) finishIntro();
    }, 5400);

    // Bước 1 (2400ms — giữ rõ thẻ + huy hiệu 1st..4th ~2.4 giây):
    // Chạy sóng sét xanh dương + thu dọn các thẻ Card & mờ lớp tối
    pushTimer(() => {
      if (!this.scene?.isActive?.()) return;
      this._playIntroBlueLightningWave();

      try { this.game.canvas.style.filter = ""; } catch (e) {}
      if (this._loadingOverlayRect?.active) {
        this.tweens.add({ targets: this._loadingOverlayRect, alpha: 0, duration: 400, ease: "Power2" });
      }
      (this._loadingCardGroups || []).forEach((grp) => {
        this.tweens.add({
          targets: grp.objs.filter(o => o?.active),
          y: `-=${70 * S}`,
          alpha: 0,
          duration: 360,
          ease: "Power2.easeIn"
        });
      });

      pushTimer(() => this._hideLoadingScreen(), 420);
    }, 2400);

    // Bước 2 (2850ms): Từng nhân vật giáng thế từ cột tia sáng đỏ-vàng xuống ô START
    const startDropMs = 2850;
    const dropGapMs = 190;
    sorted.forEach((p, idx) => {
      pushTimer(() => {
        if (!this.scene?.isActive?.()) return;
        const c = this.boardPath?.[Number(p.index || 0)] || this.boardPath?.[0];
        if (!c) return;
        const wx = c.x * width, wy = c.y * height;
        const sp = this._getSpriteByUserId(p.user_id);
        const isMe = Number(p.user_id) === myUid;
        const shadowObj = isMe ? this.shadow : sp?.shadow;
        const nameObj   = isMe ? this.playerNameText : sp?.nameText;

        this._playSpawnBeamAt(wx, wy, idx === 0);

        if (sp?.active) {
          const baseScale = this.playerBaseScale || (0.24 * S);
          sp.setPosition(wx, wy - 200 * S).setAlpha(0.35).setScale(baseScale).setVisible(true);
          this.tweens.add({
            targets: sp,
            y: wy,
            alpha: 1,
            duration: 240,
            ease: "Cubic.easeIn",
            onComplete: () => {
              if (!sp.active) return;
              sp.setScale(baseScale * 1.12, baseScale * 0.88);
              this.tweens.add({
                targets: sp, scaleX: baseScale, scaleY: baseScale, duration: 180, ease: "Back.easeOut"
              });
              if (shadowObj?.active) {
                shadowObj.setPosition(wx, wy + 5).setVisible(true);
                this.tweens.add({ targets: shadowObj, alpha: 1, duration: 180 });
              }
              if (nameObj?.active) {
                nameObj.setPosition(wx, wy - 140 * S).setVisible(true);
                this.tweens.add({ targets: nameObj, alpha: 1, duration: 200 });
              }
            }
          });
        }
      }, startDropMs + idx * dropGapMs);
    });

    const totalMs = startDropMs + Math.max(sorted.length - 1, 0) * dropGapMs + 520;
    pushTimer(() => finishIntro(), totalMs);
  }

  _playIntroBlueLightningWave() {
    const { width, height } = this.scale;
    const S = this.minRatio || 1;
    const D = 930;

    // Lóe sáng xanh dương dịu toàn màn hình
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0x38bdf8, 1)
      .setDepth(D).setAlpha(0.24).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 420, ease: "Cubic.easeOut",
      onComplete: () => { try { flash.destroy(); } catch (e) {} }
    });

    // Chùm tia sét xanh cyan bung tỏa giống hiệu ứng chuyển cảnh
    const boltG = this.add.graphics().setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD);
    const drawBolts = () => {
      boltG.clear();
      for (let b = 0; b < 14; b++) {
        let bx = (width * 0.08) + Math.random() * (width * 0.84);
        let by = height * (0.48 + Math.random() * 0.45);
        boltG.lineStyle((2.5 + Math.random() * 2.5) * S, b % 2 === 0 ? 0x38bdf8 : 0xe0f2fe, 0.92);
        boltG.beginPath();
        boltG.moveTo(bx, by);
        const segs = 5;
        for (let s = 0; s < segs; s++) {
          bx += (Math.random() - 0.5) * 95 * S;
          by -= (28 + Math.random() * 48) * S;
          boltG.lineTo(bx, by);
        }
        boltG.strokePath();
      }
    };
    drawBolts();
    const ev = this.time.addEvent({ delay: 75, repeat: 4, callback: drawBolts });
    this.tweens.add({
      targets: boltG, alpha: 0, duration: 440, ease: "Sine.easeOut",
      onComplete: () => {
        try { ev?.destroy(); } catch (e) {}
        try { boltG.destroy(); } catch (e) {}
      }
    });
  }

  _playSpawnBeamAt(wx, wy, playSound = false) {
    const S = this.minRatio || 1;
    const D = 40;
    const beamH = wy + 40 * S;

    const beamG = this.add.graphics().setDepth(D).setBlendMode(Phaser.BlendModes.ADD);
    beamG.fillStyle(0xff4500, 0.28);
    beamG.fillRect(wx - 28 * S, 0, 56 * S, beamH);
    beamG.fillStyle(0xffaa33, 0.50);
    beamG.fillRect(wx - 15 * S, 0, 30 * S, beamH);
    beamG.fillStyle(0xffffff, 0.85);
    beamG.fillRect(wx - 5 * S, 0, 10 * S, beamH);

    // Điểm hội tụ sáng trên mặt ô START
    const footRing = this.add.ellipse(wx, wy + 2 * S, 54 * S, 24 * S, 0xffaa22, 0.35)
      .setStrokeStyle(3 * S, 0xfff3b0, 0.95).setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD);

    if (playSound) playBoardStartSound(this);

    this.tweens.add({
      targets: beamG,
      alpha: 0,
      duration: 460,
      delay: 140,
      ease: "Cubic.easeOut",
      onComplete: () => { try { beamG.destroy(); } catch (e) {} }
    });
    this.tweens.add({
      targets: footRing,
      scaleX: 2.1, scaleY: 2.1, alpha: 0,
      duration: 440,
      delay: 180,
      ease: "Quad.easeOut",
      onComplete: () => { try { footRing.destroy(); } catch (e) {} }
    });
  }

  _hideLoadingScreen() {
    // Luôn xóa blur ngay lập tức
    try {
      this.game.canvas.style.filter = "";
      this.game.canvas.style.transition = "";
    } catch(e) {}
    this._loadingOverlayRect = null;
    this._loadingCardGroups = null;
    if (!this._loadingObjs) return;
    const objs = this._loadingObjs;
    this._loadingObjs = null;
    this._loadingStatusTexts = null;
    objs.forEach(o => { try { o?.destroy(); } catch(e){} });
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENT PAYMENT EFFECTS
  // ═══════════════════════════════════════════════════════════════

  /** Lấy sprite của player theo userId */
  _getSpriteByUserId(userId) {
    const uid = Number(userId);
    if (Number(this._myUserId()) === uid) return this.player;
    const sid = Object.keys(this.otherPlayers || {}).find(s => {
      const op = this.otherPlayers[s];
      return Number(op?._userId) === uid || Number(op?.user_id) === uid;
    });
    return sid ? this.otherPlayers[sid] : null;
  }

  /** Lấy vị trí trung tâm panel của player theo userId */
  _getPlayerPanelPos(userId) {
    if (!this.playerPanels) return null;
    const panel = this.playerPanels.find(p => p.userId === userId);
    if (!panel) return null;
    // statVal1 là text tiền mặt trong panel
    const ref = panel.statVal1 || panel._ui?.statVal1;
    if (ref) return { x: ref.x, y: ref.y };
    return null;
  }

  /**
   * Số tiền nổi lên trên đầu nhân vật rồi bay lên mờ dần
   * @param {number} x - vị trí x
   * @param {number} y - vị trí y bắt đầu
   * @param {string} text - "+500K" hoặc "-500K"
   * @param {string} color - "#ff3333" hoặc "#44ff88"
   */
  _showFloatingMoney(x, y, text, color) {
    const S = this.minRatio || 1;
    const D = 300;

    const t = this.add.text(x, y, text, {
      fontFamily: "Signika",
      fontSize: Math.floor(28 * S) + "px",
      color,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: Math.floor(4 * S),
    }).setOrigin(0.5, 1).setDepth(D).setAlpha(0);

    // Scale up nhỏ rồi bay lên
    this.tweens.add({
      targets: t,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: t,
          y: y - 80 * S,
          alpha: 0,
          duration: 900,
          ease: "Sine.easeIn",
          onComplete: () => { try { t.destroy(); } catch(e){} }
        });
      }
    });
  }

  /**
   * Bubble thông báo nhận tiền trên đầu owner (giống "Đổ xúc xắc" nhưng màu xanh)
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {string} amountText - "+500K"
   */
  _showRentBubble(sprite, amountText) {
    const S = this.minRatio || 1;
    const D = 290;

    const sx = sprite.x;
    const sy = sprite.y - sprite.displayHeight * 0.75;

    const objs = [];
    const push = o => { objs.push(o); return o; };

    const fontSize = Math.floor(20 * S);
    const pad = { x: 18 * S, y: 10 * S };
    const bR = 8 * S;
    const TIP_W = 9 * S, TIP_H = 9 * S;

    const t = push(this.add.text(0, 0, `💰 ${amountText}`, {
      fontFamily: "Signika",
      fontSize: fontSize + "px",
      color: "#004400",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(D + 2).setAlpha(0));

    const bW = t.width + pad.x * 2;
    const bH = t.height + pad.y * 2;
    const bX = sx - bW / 2;
    const bY = sy - bH - TIP_H;

    const g = push(this.add.graphics().setDepth(D + 1).setAlpha(0));

    // Nền xanh lá nhạt
    g.fillStyle(0xaaffcc, 0.95);
    g.fillRoundedRect(bX, bY, bW, bH, bR);
    // Viền xanh đậm
    g.lineStyle(2 * S, 0x00aa44, 1);
    g.strokeRoundedRect(bX, bY, bW, bH, bR);
    // Tam giác chỉ xuống
    const tipX = sx;
    const tipBaseY = bY + bH;
    g.fillStyle(0xaaffcc, 0.95);
    g.fillTriangle(tipX - TIP_W, tipBaseY, tipX + TIP_W, tipBaseY, tipX, tipBaseY + TIP_H);

    t.setPosition(bX + bW / 2, bY + bH / 2);

    // Fade in → hiện 1.5s → fade out
    this.tweens.add({
      targets: [g, t], alpha: 1, duration: 180, ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: [g, t], alpha: 0, duration: 300,
            onComplete: () => objs.forEach(o => { try { o?.destroy(); } catch(e){} })
          });
        });
      }
    });
  }

  /**
   * Hiệu ứng coin bay từ vị trí payer → panel của owner
   * Dùng ảnh coinm.png, kích thước + độ mờ random, bay theo bezier mượt mà
   */
  _playCoinsFlying(fromX, fromY, toX, toY) {
    const S = this.minRatio || 1;
    const D = 295;
    const COIN_COUNT = 8;

    for (let i = 0; i < COIN_COUNT; i++) {
      this.time.delayedCall(i * 55, () => {
        // Kích thước random 18-38px, độ mờ random 0.55-1.0
        const size   = (Phaser.Math.Between(18, 31)) * S;
        const alpha0 = Phaser.Math.FloatBetween(0.55, 1.0);

        const coin = this.add.image(0, 0, "coinm")
          .setDisplaySize(size, size)
          .setDepth(D)
          .setAlpha(0);

        // Vị trí xuất phát: tán xạ nhẹ quanh payer
        const startX = fromX + Phaser.Math.Between(-24, 24) * S;
        const startY = fromY + Phaser.Math.Between(-24, 8)  * S;
        coin.setPosition(startX, startY);

        // Điểm kiểm soát bezier: vòng cung lên cao ngẫu nhiên
        const ctrlX = (startX + toX) / 2 + Phaser.Math.Between(-80, 80) * S;
        const ctrlY = Math.min(startY, toY) - Phaser.Math.Between(70, 140) * S;

        // Tổng thời gian bay: 600-850ms (mỗi coin lệch nhau)
        const duration = Phaser.Math.Between(600, 850);
        const steps    = Math.ceil(duration / 16);
        let   step     = 0;

        // Fade in nhanh
        this.tweens.add({ targets: coin, alpha: alpha0, duration: 120 });

        const timer = this.time.addEvent({
          delay: 16,
          repeat: steps,
          callback: () => {
            step++;
            const t = Math.min(step / steps, 1);

            // Ease: easeInOut cubic
            const e = t < 0.5
              ? 4 * t * t * t
              : 1 - Math.pow(-2 * t + 2, 3) / 2;

            // Quadratic bezier
            const bx = (1-e)*(1-e)*startX + 2*(1-e)*e*ctrlX + e*e*toX;
            const by = (1-e)*(1-e)*startY + 2*(1-e)*e*ctrlY + e*e*toY;

            coin.setPosition(bx, by);

            // Xoay nhẹ theo chiều bay
            coin.setAngle(coin.angle + 4);

            // Scale + fade out ở 70% cuối
            if (t > 0.7) {
              const fade = 1 - (t - 0.7) / 0.3;
              coin.setAlpha(alpha0 * fade);
              const sc = 0.5 + fade * 0.5;
              coin.setScale(sc);
            }

            if (t >= 1) {
              // Flash nhỏ tại đích
              const flash = this.add.graphics().setDepth(D + 1);
              flash.fillStyle(0xffee44, 0.7);
              flash.fillCircle(toX, toY, size * 0.8);
              this.tweens.add({
                targets: flash,
                alpha: 0, scaleX: 2.2, scaleY: 2.2,
                duration: 220, ease: "Sine.easeOut",
                onComplete: () => { try { flash.destroy(); } catch(e){} }
              });
              try { coin.destroy(); } catch(e){}
            }
          }
        });
      });
    }
  }

  // ── RECONNECTING INDICATOR ─────────────────────────────────────
  _showReconnectingIndicator() {
    if (this._reconnectIndicator) return; // Already showing

    const { width, height } = this.scale;
    
    // Backdrop
    const backdrop = this.add.rectangle(
      width / 2, 
      height / 2, 
      width, 
      height, 
      0x000000, 
      0.5
    ).setDepth(9999).setOrigin(0.5);

    // Panel
    const panelW = 300;
    const panelH = 100;
    const panel = this.add.rectangle(
      width / 2,
      height / 2,
      panelW,
      panelH,
      0x1a1a1a,
      0.95
    ).setDepth(10000).setOrigin(0.5);

    // Text
    const text = this.add.text(
      width / 2,
      height / 2,
      "🔄 Đang kết nối lại...",
      {
        fontFamily: "Signika",
        fontSize: "18px",
        color: "#ffcc00",
        fontStyle: "bold"
      }
    ).setOrigin(0.5).setDepth(10001);

    // Pulse animation
    this.tweens.add({
      targets: text,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    this._reconnectIndicator = { backdrop, panel, text };
  }

  _hideReconnectingIndicator() {
    if (!this._reconnectIndicator) return;

    try {
      this._reconnectIndicator.backdrop?.destroy();
      this._reconnectIndicator.panel?.destroy();
      this._reconnectIndicator.text?.destroy();
    } catch (e) {
      console.error("Error hiding reconnect indicator:", e);
    }

    this._reconnectIndicator = null;
  }

  _showAlert(message, color = "#ffcc00", duration = 3000) {
    const { width, height } = this.scale;
    
    const text = this.add.text(width / 2, height - 100, message, {
      fontFamily: "Signika",
      fontSize: "16px",
      color: color,
      fontStyle: "bold",
      backgroundColor: "#00000099",
      padding: { x: 16, y: 10 }
    }).setOrigin(0.5).setDepth(10000).setAlpha(0);

    this.tweens.add({
      targets: text,
      alpha: 1,
      y: height - 120,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(duration, () => {
          this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 300,
            onComplete: () => text.destroy()
          });
        });
      }
    });
  }
}
