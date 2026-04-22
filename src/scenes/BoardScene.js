import PowerDiceSystem   from "./components/PowerDiceSystem.js";
import TarotModalSystem  from "./components/TarotModalSystem.js";
import TarotButtonWidget from "./components/TarotButtonWidget.js";
import CardSystem        from "./components/CardSystem.js";
import { SERVER_URL }    from "../config.js";
import { getActiveProfile, getPlayerData } from "../server/utils/playerData.js";
import ChatWidget        from "./components/ChatWidget.js";
import {
  playBoardBuySound, playBoardErrSound, playBoardHunterSound,
  playBoardIncreaseSound, playBoardTeacherSound, playBoardSkillSound,
  playBoardBGM, playBoardAnswerSound, playBoardCoinSound
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

  return !!(
    this.isMyTurn &&
    this.canRoll &&
    !this.mustAnswerNext &&
    !myState?.used_tarot_this_turn
  );
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
      const isMe = data.user_id === this._myUserId();
      this._showToast(`${isMe ? 'Bạn' : data.name} đã cướp ${this._formatMoney(data.amount)} từ đối thủ!`,
        isMe ? '#ffaa44' : '#ff8844');
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
      // Nhạc nền khi vào trận — dừng nhạc lobby nếu còn chạy
      try {
        const lobbyBgm = this.sound.get("lobby_bgm");
        if (lobbyBgm?.isPlaying) lobbyBgm.stop();
      } catch(e) {}
      playBoardBGM(this);

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
      }

      this._applyTurnState();
      this._updateTurnInfo();
      this._updateTurnCounter(data.turn_number || 0);
      this._showTurnBanner(
        this.isMyTurn ? "🎲 Lượt của bạn! Nhấn SPACE" : `⏸ Lượt của ${data.name}...`,
        this.isMyTurn ? "#ffdd00" : "#aaaaaa"
      );

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

      if (isMe) {
        this.canRoll = false;
        this.infoText.setText(`🎲 Bạn tung được ${data.dice}!`);
        this.infoText.setColor("#ffdd00");

        // Nếu PowerDice đang chờ kết quả → dùng PD animation
        if (this.powerDice?.rolling) {
          this.powerDice.playResultAnimation(data.dice, () => {
            this._onDiceHandoff(data.dice);
          });
        } else {
          // Fallback: PD không active, dùng animation scene cũ
          this._onDiceHandoff(data.dice);
        }
      } else {
        // Người khác tung — chỉ hiện info text, không động vào PD
        this.infoText.setText(`${data.name} tung được ${data.dice}!`);
        this.infoText.setColor("#aaffaa");
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
      if (player.id !== this.socket.id) this.addOtherPlayer(player);
    });

    // ── playerMoved ───────────────────────────────────────────────
    this.socket.on("playerMoved", (data) => {
      if (data.id === this.socket.id) return;
      const other = this.otherPlayers[data.id];
      if (!other) return;

      const startIndex  = other.index || 0;
      const targetIndex = data.index;
      const totalCells  = this.boardPath.length;
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
      if (this.otherPlayers[id]) {
        this.otherPlayers[id].shadow?.destroy();
        this.otherPlayers[id].nameText?.destroy();
        this.otherPlayers[id].destroy();
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
      // Cập nhật cellStates
      if (!this.cellStates) this.cellStates = {};
      this.cellStates[data.cell_index] = {
        owner_user_id: data.owner_user_id,
        planet_color: data.planet_color,
        build_cost: data.build_cost
      };
      
      // Cập nhật cash của player (trừ đi build_cost)
      if (this.gamePlayers) {
        const player = this.gamePlayers.find(p => p.user_id === data.owner_user_id);
        if (player) {
          player.cash = (player.cash || 0) - data.build_cost;
        }
      }
      
      // Ẩn panel hỏi mua
      this._closeBuildPanel();
      
      const cell = this.boardPath[data.cell_index];
      if (cell && cell.type !== 'skill') {
        const hex = this._planetColorToHex(data.planet_color);
        this.paintCellGlowAnimated(cell, hex);
      }
      const myUid = this._myUserId();
      const msg = data.owner_user_id === myUid
        ? `✅ Bạn đã đặt tinh cầu ô ${data.cell_index}! (-${this._formatMoney(data.build_cost)})`
        : `🏗 ${data.owner_name} đặt tinh cầu ô ${data.cell_index}`;
      this._showToast(msg, data.owner_user_id === myUid ? "#00ff88" : "#ffffff");
      if (data.owner_user_id === myUid) playBoardBuySound(this);
      this._refreshPlayerPanelsFromGameState();
      // Cập nhật T.mặt & T.sản ngay
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

      // Hiệu ứng "bị đau" cho người trả tiền
      if (data.payer_user_id === myUid) {
        // Flash đỏ + shake nhân vật của mình
        this._playHurtEffect(this.player);
      } else {
        // Flash đỏ nhân vật người khác
        const payerSocket = Object.keys(this.otherPlayers).find(sid => {
          const op = this.otherPlayers[sid];
          return op?._userId === data.payer_user_id || op?.userId === data.payer_user_id;
        });
        if (payerSocket && this.otherPlayers[payerSocket]) {
          this._playHurtEffect(this.otherPlayers[payerSocket]);
        }
      }

      const cell = this.boardPath[data.cell_index];
      if (cell && data.owner_user_id === myUid) {
        const hex = this._planetColorToHex(data.planet_color);
        this.paintCellGlow(cell, hex, 0.8);
        this.time.delayedCall(500, () => this.paintCellGlow(cell, hex, 0.5));
      }

      if (data.payer_user_id === myUid) {
        playBoardCoinSound(this);
        this._showToast(`💸 Trả ${this._formatMoney(data.rent)} cho ${data.owner_name}`, "#ff8800");
      } else if (data.owner_user_id === myUid)
        this._showToast(`💰 Nhận ${this._formatMoney(data.rent)} từ ${data.payer_name}`, "#ffdd00");
      else
        this._showToast(`${data.payer_name} trả thuê ô ${data.cell_index}`, "#aaaaaa");

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

    this.socket.on("game:skill_event", (data) => {
      const isMe = data.user_id === this._myUserId();

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
        this._showSkillPanel({
          title: "CƯỜNG HÓA",
          text: `${data.name} tăng giá trị ô ${data.cell_index}!`,
          icon: "orb_blue"
        });
        if (this.cellStates && data.cell_index !== undefined && data.new_cost) {
          const cellState = this.cellStates[data.cell_index];
          if (cellState) {
            cellState.build_cost = data.new_cost;
            const cell = this.boardPath[data.cell_index];
            if (cell && cell.type !== 'skill') {
              const hex = this._planetColorToHex(cellState.planet_color);
              this.paintCellGlowAnimated(cell, hex);
              this._showToast(`✨ Ô ${data.cell_index} đã được cường hóa!`, "#ffdd44", 2000);
            }
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
        this._showSkillPanel({
          title: "GIẢM CẤP",
          text: `${data.name} giảm giá trị ô ${data.cell_index} của ${data.target_name}!`,
          icon: "orb_red"
        });
        if (this.cellStates && data.cell_index !== undefined && data.new_cost) {
          const cellState = this.cellStates[data.cell_index];
          if (cellState) {
            cellState.build_cost = data.new_cost;
            const cell = this.boardPath[data.cell_index];
            if (cell && cell.type !== 'skill') {
              const hex = this._planetColorToHex(cellState.planet_color);
              this.paintCellGlowAnimated(cell, hex);
              this._showToast(`⚠️ Ô ${data.cell_index} của ${data.target_name} đã bị giảm cấp!`, "#ff8866", 2000);
            }
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
        // Nếu là mình bị đẩy, có thể xử lý thông báo
        if (!isMe && data.target_user_id === this._myUserId()) {
          this._showToast(`🌀 Bạn bị đẩy lùi 2 ô bởi ${data.name}!`, "#ff8888", 2000);
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
          text: `${data.name} hoán đổi tinh cầu!`,
          icon: "orb_purple"
        });
        // Chỉ animation — màu sẽ được render đúng bởi game:state_sync
        const cellA = this.boardPath?.[data.my_cell_index];
        const cellB = this.boardPath?.[data.enemy_cell_index];
        if (cellA && cellB) {
          const ax = cellA.x * this.scale.width, ay = cellA.y * this.scale.height;
          const bx = cellB.x * this.scale.width, by = cellB.y * this.scale.height;
          const S  = this.minRatio || 1;
          const iA = this.add.text(ax, ay, "⭐", { fontSize: Math.floor(28*S)+"px" }).setOrigin(0.5).setDepth(900);
          const iB = this.add.text(bx, by, "⭐", { fontSize: Math.floor(28*S)+"px" }).setOrigin(0.5).setDepth(900);
          this.tweens.add({ targets: iA, x: bx, y: by, duration: 500, ease: 'Quad.easeInOut' });
          this.tweens.add({ targets: iB, x: ax, y: ay, duration: 500, ease: 'Quad.easeInOut',
            onComplete: () => { iA.destroy(); iB.destroy(); }
          });
        }
        return;
      }

      // ================== TAX MULTIPLIER (Tài Phiệt) ==================
      if (data.type === "tax_multiplier") {
        this._showSkillPanel({
          title: "TÀI PHIỆT",
          text: `${data.name} tăng thuế các tinh cầu!`,
          icon: "orb_orange"
        });
        (data.cells || []).forEach(c => {
          if (this.cellStates?.[c.index]) {
            this.cellStates[c.index].tax_multiplier        = c.multiplier;
            this.cellStates[c.index].tax_multiplier_active = true;
          }
          const cell = this.boardPath[c.index];
          if (cell && cell.type !== 'skill') {
            this.time.delayedCall(300, () => this._waterBallDrop(cell, c.multiplier));
          }
        });
        return;
      }

      // ================== STEAL CASH (Nhận Trợ Giúp) ==================
      if (data.type === "steal_cash_percent_pending" || data.type === "steal_cash_percent_done") {
        this._showSkillPanel({
          title: "NHẬN TRỢ GIÚP",
          text: `${data.name} lấy ${data.percent}% tiền đối thủ! (+${this._formatMoney(data.total)})`,
          icon: "orb_orange"
        });
        return;
      }

      // ================== SKIP TURN ENEMY (Công An) ==================
      if (data.type === "skip_turn_enemy") {
        this._showSkillPanel({
          title: "CÔNG AN",
          text: `${data.name} khiến ${data.target_name} mất lượt!`,
          icon: "orb_red"
        });
        if (data.target_user_id === this._myUserId()) {
          this._showToast(`🚔 Bạn bị ${data.name} cho mất lượt!`, "#ff6666", 3000);
        }
        return;
      }

      // ================== RECOVER HOUSE MONEY (Thần Giữ Của) ==================
      if (data.type === "recover_house_money") {
        this._showSkillPanel({
          title: "THẦN GIỮ CỦA",
          text: `${data.name} được bảo vệ khỏi tiền thuê lượt này!`,
          icon: "orb_blue"
        });
        if (isMe) this._showToast("🛡 Bạn được hoàn tiền thuê nếu dẫm vào nhà đối thủ!", "#88ffcc", 3000);
        return;
      }

      // ================== RENT REFUNDED ==================
      if (data.type === "rent_refunded") {
        this._showSkillPanel({
          title: "HOÀN TIỀN THUÊ",
          text: `${data.name} được hoàn lại ${this._formatMoney(data.amount)} tiền thuê!`,
          icon: "orb_blue"
        });
        if (isMe) this._showToast(`🛡 Hoàn lại ${this._formatMoney(data.amount)} tiền thuê!`, "#88ffcc", 2500);
        return;
      }

      // ================== MOVE FORWARD PENDING (Nhanh Chân) ==================
      if (data.type === "move_forward_range_pending") {
        this._showSkillPanel({
          title: "NHANH CHÂN",
          text: `${data.name} sẽ di chuyển thêm ${data.min}–${data.max} ô sau lượt này!`,
          icon: "orb_blue"
        });
        return;
      }

      // ================== EXTRA ROLL TAROT (Xúc Xắc Ma Thuật) ==================
      if (data.type === "extra_roll" && data.source === "tarot") {
        this._showSkillPanel({
          title: "XÚC XẮC MA THUẬT",
          text: `${data.name} được thêm 1 lượt tung xúc xắc!`,
          icon: "orb_orange"
        });
        return;
      }
    });

  this.socket.on("game:tax_boost", (data) => {
    if (!data.boosts || data.boosts.length === 0) return;
    playBoardIncreaseSound(this);
    if (!this._taxBadges) this._taxBadges = {};

    data.boosts.forEach(b => {
      // Cập nhật cellStates
      if (this.cellStates?.[b.cell_index]) {
        this.cellStates[b.cell_index].rent_multiplier = b.multiplier;
      }
      // Hiệu ứng lần lượt
      const targetCell = this.boardPath[b.cell_index];
      if (!targetCell) return;
      const i = data.boosts.indexOf(b);
      this.time.delayedCall(i * 700, () => {
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
    const details = data.target_details || (data.cell_indexes || []).map(i => ({ cell_index: i, had_planet: true }));
    if (!details || details.length === 0) return;

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

    if (data.had_planet) {
      this.clearCell(cell);
      if (this.cellStates) delete this.cellStates[data.cell_index];
      this._showToast(`☄ Ô ${data.cell_index} bị phá hủy!`, "#ff4444");
    } else {
      // Ô trống — vẫn tạo impact nhỏ tại vị trí ô
      const { width, height } = this.scale;
      const cx = cell.x * width, cy = cell.y * height;
      this._createFireImpact(cx, cy);
      this._showToast(`💨 Ô ${data.cell_index} trúng đạn nhưng trống`, "#aaaaaa");
    }

    this._stopDarkMapEffect();
    this._setHunter28Mode(false);
    this._refreshPlayerPanelsFromGameState();
  });

  this.socket.on("game:cell_sold", (data) => {
    // Xóa visual từng ô bị bán (broadcast từ server)
    (data.cell_indexes || [data.cell_index]).forEach(ci => {
      if (ci === undefined || ci === null) return;
      const cell = this.boardPath[ci];
      if (cell) this.clearCell(cell);
      if (this.cellStates) delete this.cellStates[ci];
    });

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
      this._showBankruptcyLoseScreen(bankruptPlayer.name);
    } else {
      this._showOtherPlayerBankrupt(bankruptPlayer.name);
    }

    this.gamePlayers = this.gamePlayers.filter(p => p.user_id !== data.user_id);
    this._refreshPlayerPanelsFromGameState();
  });

  this.socket.on("game:game_over", (data) => {
    const myUid = this._myUserId();
    const isWinner = data.winner_user_id === myUid;
    this.time.delayedCall(isWinner ? 0 : 1200, () => {
      this._showGameOverScreen(isWinner, data.winner_name);
    });
  });

  this.socket.on("game:quiz_prompt", (data) => {
      this.mustAnswerNext = true;
      if (this.isMyTurn) {
        this.canRoll = false;
        this.powerDice?.hide();
        if (this.diceSprite) this.diceSprite.setVisible(false);
        if (this.diceShadow) this.diceShadow.setVisible(false);
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
    if (data.user_id === this._myUserId()) {
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
 
    // Hiệu ứng kích hoạt thẻ toàn màn hình (chỉ với người dùng)
    if (isMe) {
      this._playTarotActivationEffect(data.tarot_name);
    }
  });

this.socket.on("game:tarot_denied", (data) => {
    this._showToast(`⚠️ ${data.message || "Không thể dùng thẻ"}`, "#ff6666", 2000);
    this.tarotModal?.close();
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
        }
      });
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
  const objs = [];
  const push = o => { objs.push(o); return o; };
 
  // Flash vàng full màn hình
  const flash = push(this.add.rectangle(width / 2, height / 2, width, height, 0xffcc44, 0).setDepth(D));
  this.tweens.add({ targets: flash, alpha: { from: 0, to: 0.35 }, duration: 120, yoyo: true,
    onComplete: () => flash.destroy() });
 
  // Banner tên thẻ
  const banner = push(this.add.text(width / 2, height / 2, `✨ ${cardName || "Thẻ"} ✨`, {
    fontFamily: "Signika",
    fontSize: Math.floor(42 * S) + "px",
    color: "#ffe566",
    fontStyle: "bold",
    stroke: "#3a1a00",
    strokeThickness: 6,
    shadow: { offsetX: 0, offsetY: 4, color: "#000000", blur: 16, fill: true }
  }).setOrigin(0.5).setDepth(D + 1).setAlpha(0).setScale(0.5));
 
  this.tweens.add({
    targets: banner, alpha: 1, scaleX: 1, scaleY: 1,
    duration: 280, ease: 'Back.easeOut',
    onComplete: () => {
      this.time.delayedCall(900, () => {
        this.tweens.add({ targets: banner, alpha: 0, y: height / 2 - 40 * S, duration: 350,
          onComplete: () => { try { banner.destroy(); } catch {} } });
      });
    }
  });
 
  // Particles
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const p = this.add.circle(
      width / 2 + Math.cos(angle) * 30 * S,
      height / 2 + Math.sin(angle) * 30 * S,
      Phaser.Math.Between(4, 9) * S,
      [0xffdd44, 0xff9900, 0xffffff, 0xffcc66][i % 4], 1
    ).setDepth(D + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: p,
      x: width / 2 + Math.cos(angle) * (80 + Math.random() * 120) * S,
      y: height / 2 + Math.sin(angle) * (80 + Math.random() * 120) * S,
      alpha: 0, scaleX: 0.1, scaleY: 0.1,
      duration: 700 + Math.random() * 400, ease: 'Quad.easeOut',
      onComplete: () => { try { p.destroy(); } catch {} }
    });
  }
}

  _startDarkMapEffect() {
    const { width, height } = this.scale;
    if (this._darkOverlay) this._darkOverlay.destroy();

    // Depth = 3000 để che hầu hết mọi thứ
    this._darkOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x010101, 0)
      .setDepth(3000);

    this.tweens.add({
      targets: this._darkOverlay,
      alpha: 0.96,
      duration: 500,
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

  _showSkillPanel({ title, text, icon }) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 170;

    if (this._skillObjs) {
      this._skillObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._skillObjs = [];
    const push = (o) => { this._skillObjs.push(o); return o; };

    push(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45).setDepth(D));
    const panel = push(this.createStyledPanel(width / 2, height / 2, 520 * S, 220 * S, 20 * S));
    panel.setDepth(D + 1);

    push(this.add.text(width / 2, height / 2 - 60 * S, title, {
      fontFamily: "Signika",
      fontSize: Math.floor(26 * S) + "px",
      color: "#8b5e1a",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 2));

    push(this.add.text(width / 2, height / 2 - 20 * S, text, {
      fontFamily: "Signika",
      fontSize: Math.floor(20 * S) + "px",
      color: "#8b5e1a",
      align: "center",
      wordWrap: { width: 460 * S }
    }).setOrigin(0.5).setDepth(D + 2));

    if (icon) {
      push(this.add.image(width / 2, height / 2 + 50 * S, icon)
        .setScale(0.35 * S).setOrigin(0.5).setDepth(D + 2));
    }

    this.time.delayedCall(2000, () => {
      this._skillObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
      this._skillObjs = [];
    });
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

      panel.nameText?.setText(gp.name || `Player ${i+1}`);
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
      // Online: emit lên server — server sẽ trả game:dice_result
      this.socket.emit("game:roll", { room_id: this.gameRoomId });
      this.infoText.setText("🎲 Đang tung...").setColor("#ffffff");
    } else {
      // Offline fallback: tự tính kết quả rồi phát event giả
      const dice = Phaser.Math.Between(1, 6);
      // Gọi thẳng handler với dữ liệu giả
      this.socket.emit("game:roll_offline_fake"); // no-op nếu không có server
      // Chờ một tick rồi xử lý như thể nhận từ server
      this.time.delayedCall(50, () => {
        const fakeData = {
          socket_id: this.socket.id,
          user_id:   this._myUserId(),
          dice,
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
      this.infoText.setText(`🎲 Bạn tung được ${data.dice}!`);
      this.infoText.setColor("#ffdd00");

      if (this.powerDice?.rolling) {
        this.powerDice.playResultAnimation(data.dice, () => {
          this._onDiceHandoff(data.dice);
        });
      } else {
        this._onDiceHandoff(data.dice);
      }
    }
  }

  // ─────────────────────────────────────────────
  //  HANDOFF — PowerDice ẩn xong, BoardScene tiếp quản
  //  Đây là điểm DUY NHẤT trigger di chuyển player
  // ─────────────────────────────────────────────
  _onDiceHandoff(diceResult) {
    // Hiện diceSprite của scene với đúng mặt
    this._showDiceSpriteResult(diceResult, () => {
      // Sau khi diceSprite đã hiện → di chuyển
      const target = (this.currentIndex + diceResult) % this.boardPath.length;
      this.showTargetArrow(target);
      this._movePlayerSteps(diceResult, () => {
        // Di chuyển xong
        this.diceSprite.setVisible(false);
        this.diceShadow.setVisible(false);

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
  //  DiceSprite scene — hiện đúng mặt, nhỏ và rõ
  //  (thay thế startDiceRollAnimation cũ khi dùng PowerDice)
  // ─────────────────────────────────────────────
  _showDiceSpriteResult(result, onDone) {
    const { width, height } = this.scale;
    const cx = width * 0.508, cy = height * 0.414;

    this.diceSprite.setPosition(cx, cy);
    this.diceShadow.setPosition(cx - 16 * this.minRatio, cy + 34 * this.minRatio);
    this.diceSprite.setTexture(`dice_${result}`).setAlpha(0).setAngle(0);
    this.diceSprite.setVisible(true);
    this.diceShadow.setVisible(true);

    this.tweens.add({
      targets: this.diceSprite, alpha: 1, scaleX: 0.65 * this.minRatio, scaleY: 0.65 * this.minRatio,
      duration: 250, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(600, () => {
          if (onDone) onDone();
        });
      }
    });
  }

  // ─────────────────────────────────────────────
  //  Turn state helper
  // ─────────────────────────────────────────────
  _applyTurnState() {
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
    this.load.image("bg", "./assets/nen_trochoi.jpg");

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

    for (let i = 0; i < 18; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(`Fantasy_Monster_1_idle_${num}`,
        `./assets/characters/Fantasy_Hunter/Hunter/PNG/PNG Sequences/Idle Blinking/0_Hunter_Idle Blinking_${num}.png`);
      this.load.image(`Fantasy_Teacher_idle_${num}`,
        `./assets/characters/Fantasy_Teacher/Sage/PNG/PNG Sequences/Idle Blinking/0_Sage_Idle Blinking_${num}.png`);
    }

    // Hunter greeting animation for cell 28 event
    for (let i = 0; i < 10; i++) {
      const num = String(i).padStart(3, "0");
      this.load.image(`Hunter_Greeting_${num}`,
        `./assets/characters/Fantasy_Hunter/Hunter/PNG/PNG Sequences/Greeting/0_Hunter_Greeting_${num}.png`);
    }

    this.load.image("treasure",     "./assets/characters/Fantasy_Treasure/PNG/without background/47.png");
    this.load.image("target_arrow", "./assets/resources/Gps/gps_gmae.png");
    this.load.image("orb_orange",   "./assets/resources/Orb/iloveimg-resized/orb_orange.png");
    this.load.image("orb_red",      "./assets/resources/Orb/iloveimg-resized/orb_red.png");
    this.load.image("orb_blue",     "./assets/resources/Orb/iloveimg-resized/orb_blue.png");
    this.load.image("orb_purple",   "./assets/resources/Orb/iloveimg-resized/orb_purple.png");
    this.load.image("coin",         "./assets/ui/shared/coin.png");
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

    this.load.image("card_slot_small", "./assets/ui/tarot/card.png");
    for (let i = 1; i <= 10; i++) {
      this.load.image(`tarot_${i}`,       `./assets/resources/Tarot/resize/thebai_${i}.png`);
      this.load.image(`tarot_large_${i}`, `./assets/resources/Tarot/thebai_${i}.png`);
    }
  }

  // =====================
  // ANIMATIONS
  // =====================
  createBloodyAnimation() {
    const idleFrames = [];
    for (let i = 0; i < 18; i++)
      idleFrames.push({ key: `Fantasy_Monster_1_idle_${String(i).padStart(3,"0")}` });
    this.anims.create({ key:"Bloody_Alchemist_1_idle", frames:idleFrames, frameRate:12, repeat:-1 });

    const teacherFrames = [];
    for (let i = 0; i < 18; i++)
      teacherFrames.push({ key: `Fantasy_Teacher_idle_${String(i).padStart(3,"0")}` });
    this.anims.create({ key:"Fantasy_Teacher_idle", frames:teacherFrames, frameRate:12, repeat:-1 });
  }

  createAllAnimations() {
    this.characters.forEach(character => {
      for (let skin = 1; skin <= 3; skin++) {
        const idleFrames = [];
        for (let i = 0; i < 18; i++)
          idleFrames.push({ key: `${character}_${skin}_idle_${String(i).padStart(3,"0")}` });
        this.anims.create({ key:`${character}_${skin}_idle`, frames:idleFrames, frameRate:12, repeat:-1 });

        const runFrames = [];
        for (let i = 0; i < 12; i++)
          runFrames.push({ key: `${character}_${skin}_run_throw_${i}` });
        this.anims.create({ key:`${character}_${skin}_run_throw`, frames:runFrames, frameRate:18, repeat:-1 });

        const hurtFrames = [];
        for (let i = 0; i < 12; i++)
          hurtFrames.push({ key: `${character}_${skin}_hurt_${String(i).padStart(3,"0")}` });
        this.anims.create({ key:`${character}_${skin}_hurt`, frames:hurtFrames, frameRate:18, repeat:0 });
      }
    });

    // Fire arrow animation for skill cell 28
    const fireArrowFrames = [];
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");
      fireArrowFrames.push({ key: `fire_arrow_${frame}` });
    }
    this.anims.create({ key: "fire_arrow", frames: fireArrowFrames, frameRate:24, repeat: -1 });

    // Water Ball animation for tax boost
    const waterBallFrames = [];
    for (let i = 1; i <= 12; i++) waterBallFrames.push({ key: `water_ball_${String(i).padStart(2,"0")}` });
    this.anims.create({ key: "water_ball", frames: waterBallFrames, frameRate: 20, repeat: -1 });

    // Hunter greeting animation for cell 28 event
    const greetingFrames = [];
    for (let i = 0; i < 10; i++) {
      greetingFrames.push({ key: `Hunter_Greeting_${String(i).padStart(3,"0")}` });
    }
    this.anims.create({ key: "Hunter_Greeting", frames: greetingFrames, frameRate:12, repeat:0 });
    this.anims.create({ key: "Hunter_Greeting_2", frames: greetingFrames, frameRate:12, repeat:0 });
  }

updatePlayerTarotSlotsByUserId(userId, tarotIds = []) {
  if (!userId) return;

  const panel = this.playerPanels?.find(p => Number(p.userId) === Number(userId));
  if (!panel || !panel.tarotSlots) return;

  const ids = this._normalizeTarotIds(tarotIds);

  panel.tarotSlots.forEach((slot, index) => {
    const tarotId = Number(ids[index] || 0);
    const texKey = `tarot_${tarotId}`;

    // luôn reset trước
    slot.tarotId = tarotId || null;

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
      slot.cooldownOverlay?.setVisible(false);
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
        slot.cooldownOverlay?.setVisible(true);
        slot.cooldownText?.setVisible(true);
        slot.cooldownText?.setText(String(turnsLeft));
      } else {
        slot.cooldownOverlay?.setVisible(false);
        slot.cooldownText?.setVisible(false);
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

  paintCellGlowAnimated(cell, hexColor) {
    if (cell.type==='skill') return;
    if (cell.glowTimer) { cell.glowTimer.destroy(); cell.glowTimer=null; }
    if (cell.orb) { cell.orb.destroy(); cell.orb=null; }
    if (cell.orbTween) { cell.orbTween.stop(); cell.orbTween=null; }
    this.paintCellGlow(cell, hexColor, 0.5);
    let tick=0; cell.glowColor=hexColor;
    cell.glowTimer = this.time.addEvent({ delay:16, loop:true, callback: () => {
      tick+=0.03;
      this.paintCellGlow(cell, hexColor, 0.5+Math.sin(tick)*0.08);
    }});
    this.spawnCellOrb(cell, hexColor);
  }

  spawnCellOrb(cell, hexColor) {
    const { width, height } = this.scale;
    const minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const cx=cell.x*width, cy=cell.y*height;
    const orbKey=this.getOrbKeyForColor(hexColor), TARGET_SCALE=0.65*minRatio;

    const orbShadow = this.add.ellipse(cx, cy+4*minRatio, 35*minRatio, 7*minRatio, hexColor, 0.01)
      .setDepth(2).setAlpha(0);
    cell.orbShadow=orbShadow;

    const orb = this.add.image(cx, cy-18*minRatio, orbKey).setScale(0).setDepth(3).setAlpha(0);
    cell.orb=orb;

    this.tweens.add({ targets:[orb,orbShadow], alpha:{value:0.95,ease:'Power2'}, duration:500, ease:'Back.easeOut' });
    this.tweens.add({ targets:orb, scaleX:TARGET_SCALE, scaleY:TARGET_SCALE, duration:500, ease:'Back.easeOut',
      onComplete: () => {
        cell.orbTween = this.tweens.add({ targets:orb, y:cy-24*minRatio, duration:1400, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
        this.tweens.add({ targets:orbShadow, scaleX:0.7, scaleY:0.7, alpha:0.08, duration:1100, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
      }
    });
  }

  clearCell(cell) {
    if (cell.glowTimer) { cell.glowTimer.destroy(); cell.glowTimer=null; }
    if (cell.orb||cell.orbShadow) {
      this.tweens.add({ targets:[cell.orb,cell.orbShadow].filter(Boolean), alpha:0, scaleX:0, scaleY:0, duration:250, ease:'Power2',
        onComplete: () => {
          cell.orb?.destroy(); cell.orb=null;
          cell.orbShadow?.destroy(); cell.orbShadow=null;
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
    cell.overlay.lineStyle(1.2, 0xffffff, 0.15);
    cell.overlay.strokeEllipse(cx, cy, rx*2, ry*2);
  }

  getOrbKeyForColor(hexColor) {
    return { 0xff7700:"orb_orange", 0xff2233:"orb_red", 0x2266ff:"orb_blue", 0x9933ff:"orb_purple" }[hexColor]||"orb_blue";
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
    const blurFrames = [];
    for (let i=1;i<=6;i++) blurFrames.push({key:`dice_blur_${i}`});
    this.anims.create({ key:"dice_blur_spin", frames:blurFrames, frameRate:18, repeat:-1 });
  }

  createDiceSprite(minRatio) {
    const { width, height } = this.scale;
    const cx=0.508*width, cy=0.414*height;

    this.diceShadow = this.add.ellipse(cx-12*minRatio, cy+34*minRatio, 70*minRatio, 34*minRatio, 0x000000, 0.45)
      .setOrigin(0.5).setDepth(29).setVisible(false);

    this.diceSprite = this.add.sprite(cx, cy, "dice_1")
      .setDepth(30).setScale(0.6*minRatio).setVisible(false);

    this.diceTween = null;
    // Gentle idle float — hữu ích khi diceSprite hiện trong scene
    this.tweens.add({ targets:this.diceSprite, y:"-=10", duration:1000, yoyo:true, repeat:-1, ease:"Sine.easeInOut" });
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
    this.otherPlayers[playerData.id] = op;
  }

  // =====================
  // CREATE
  // =====================
  create(data) {
    const { width, height } = this.scale;

    let playerData = getPlayerData(this);
    if (!playerData) { this.scene.start("LoginScene"); return; }

    this.gameRoomId = data?.roomData?.id || null;

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

    const bg = this.add.image(width/2, height/2, "bg").setDisplaySize(width, height);
    this.minRatio = Math.min(width/this.originalWidth, height/this.originalHeight);
    const minRatio = this.minRatio;

    const saved = localStorage.getItem("gameState");
    if (saved) { try { this.currentIndex = JSON.parse(saved).currentIndex||0; } catch(e){} }
    this.currentIndex = this.currentIndex || 0;

    const token = playerData?.token;
    this.socket = io(SERVER_URL, {
      transports:['websocket','polling'], reconnection:true, reconnectionAttempts:5, timeout:10000,
      auth:{ token }
    });

    this.socket.on("connect", () => {
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
        }, 600);
      }
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


    // NPC: Hunter tại ô 28
    const c28 = this.boardPath[28];
    const hx=c28.x*(width+7), hy=c28.y*(height-32);
    this.bloody = this.add.sprite(hx, hy, "Fantasy_Monster_1_idle_000")
      .setScale(0.13).setOrigin(0.5,0.8).setDepth(6).setFlipX(true);
    this.bloodyBaseScale = 0.13;
    this.bloodyBaseDepth = 6;
    this.bloody.play("Bloody_Alchemist_1_idle");
    this.createCharacterAura(hx,hy,minRatio,[0x4a6cff,0x4a6cff,0x2f4fd1,0x4a6cff,0x6688ff,0x1b2f75],0x050816);
    this.createLightningAura(hx, hy+18*minRatio, minRatio);
    this.add.ellipse(hx, hy+19*minRatio, 35*minRatio, 16*minRatio, 0x000000, 0.35).setDepth(5);

    // NPC: Teacher tại ô 18
    const c18 = this.boardPath[18];
    const tx=c18.x*(width-4), ty=c18.y*(height-17);
    this.teacher = this.add.sprite(tx, ty, "Fantasy_Teacher_idle_000")
      .setScale(0.22*minRatio).setOrigin(0.5,0.8).setDepth(6);
    this.teacher.play("Fantasy_Teacher_idle");
    this.createCharacterAura(tx,ty,minRatio,[0xffdd00,0xffdd00,0xffaa00,0xffdd00,0xffee55,0xcc8800],0x1a0e00);
    this.createLightningAura(tx, ty+18*minRatio, minRatio);
    this.add.ellipse(tx, ty+19*minRatio, 35*minRatio, 16*minRatio, 0x000000, 0.35).setDepth(5);

    // NPC: Treasure tại ô 9
    const c9 = this.boardPath[9];
    const trx=c9.x*(width-5), try_=c9.y*(height-7);
    this.treasure = this.add.image(trx, try_, "treasure")
      .setScale(0.18*minRatio).setOrigin(0.5,0.8).setDepth(6);
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

    // Target arrow
    this.targetArrow = this.add.image(0,0,"target_arrow")
      .setVisible(false).setDepth(20).setOrigin(0.5,1).setScale(1*minRatio);
    this.targetArrowTween = null;

    // Keyboard handler — chỉ Space để bắt đầu giữ, R để reset
    this.input.keyboard.on("keydown-SPACE", () => this.handleSpacePress());
    this.input.keyboard.on("keyup-SPACE",   () => this.handleSpaceRelease());
    this.input.keyboard.on("keydown-R",     () => this.resetPlayer());
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

      const avaOrb = this.add.image(avaCX, avaCY, orbKey).setDepth(DEPTH + 3);
      avaOrb.setDisplaySize(AVA_R * 1.72, AVA_R * 1.72);

      this.tweens.add({
        targets: avaOrb,
        y: avaCY - 4 * minRatio,
        duration: 1300 + idx * 200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
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
        cardShadow.fillStyle(0x000000, 0.25);
        cardShadow.fillRoundedRect(
          cardX + 2 * minRatio,
          cY + 3 * minRatio,
          CARD_W,
          CARD_H,
          6 * minRatio
        );

        const cardBg = this.add.graphics().setDepth(DEPTH + 2);
        cardBg.fillStyle(0x12182c, 0.98);
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

        const slotRadius = 6 * minRatio;

        // Lớp đen mờ ở phần trên thẻ
        const cooldownOverlay = this.add.graphics().setDepth(DEPTH + 6);
        cooldownOverlay.fillStyle(0x000000, 0.58);
        cooldownOverlay.fillRoundedRect(
          cardX,
          cY,
          CARD_W,
          CARD_H * 0.34,
          slotRadius
        );

        // Cắt phần dưới để chỉ bo góc phía trên nhìn đẹp hơn
        cooldownOverlay.fillStyle(0x000000, 0.58);
        cooldownOverlay.fillRect(
          cardX,
          cY + CARD_H * 0.16,
          CARD_W,
          CARD_H * 0.18
        );

        // Số lượt còn chờ
        const cooldownText = this.add.text(
          cardX + CARD_W / 2,
          cY + CARD_H * 0.17,
          "0",
          {
            fontFamily: "Signika",
            fontSize: Math.floor(16 * minRatio) + "px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3
          }
        ).setOrigin(0.5).setDepth(DEPTH + 7);

        // Ẩn mặc định
        cooldownOverlay.setVisible(false);
        cooldownText.setVisible(false);

        p.tarotSlots.push({
          shadow: cardShadow,
          bg: cardBg,
          text: slotText,
          icon,
          footer,
          cooldownOverlay,
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

      p._ui = {
        bg1, bg2, bg3, border,
        glowG, avaBg, avaOrb,
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
    // Shadow số
    this._turnCounterShadow = this.add.text(width/2 + 2, 32*S + 3, "—", {
      fontFamily: "Signika",
      fontSize: Math.floor(52*S) + "px",
      color: "#0044aa",
      fontStyle: "bold",
    }).setOrigin(1, 0.5).setDepth(62).setAlpha(0.7);

    // Main số — lớn hơn
    this._turnCounterText = this.add.text(width/2, 32*S, "—", {
      fontFamily: "Signika",
      fontSize: Math.floor(52*S) + "px",
      color: "#e8f4ff",
      fontStyle: "bold",
      stroke: "#001339ff",
      strokeThickness: Math.floor(8*S),
      shadow: { offsetX: 0, offsetY: 1, color: "#001339ff", blur: 8, fill: true }
    }).setOrigin(1, 0.5).setDepth(63);

    // Chữ "LƯỢT" — nhỏ hơn, nằm bên phải số
    this._turnLabelText = this.add.text(width/2 + 4, 36*S, "LƯỢT", {
      fontFamily: "Signika",
      fontSize: Math.floor(42*S) + "px",
      color: "#e8f4ff",
      fontStyle: "bold",
      stroke: "#001339ff",
      strokeThickness: Math.floor(6*S),
      shadow: { offsetX: 0, offsetY: 1, color: "#001339ff", blur: 6, fill: true }
    }).setOrigin(0, 0.5).setDepth(63);

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
    this._turnCounterText.setText(`${turnNumber}`);
    this._turnCounterShadow?.setText(`${turnNumber}`);
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
    const { width, height } = this.scale;
    const totalCells = this.boardPath.length;
    let stepsLeft = steps;

    const moveOneStep = () => {
      if (stepsLeft <= 0) {
        this.isMoving = false;
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
          .setDepth(155)
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

  // Tính tổng tài sản có thể bán (60% build_cost mỗi ô)
  _calcTotalSellable() {
    if (!this.cellStates) return 0;
    const myUid = this._myUserId();
    return Object.values(this.cellStates)
      .filter(c => c.owner_user_id === myUid)
      .reduce((sum, c) => sum + Math.floor((c.build_cost || 0) * 0.6), 0);
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

      // Nút xác nhận phá sản
      this._makePanelBtn(push, width/2, height/2 + PH/2 - 55*S, 200*S, 48*S, D,
        0xcc2222, 0x881111, "💀 Xác nhận thua", () => {
          this._clearBankruptcyUI();
          this._stopDarkMapEffect();
          this._triggerBankruptcy();
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
      const sellPrice = Math.floor(cellData.build_cost * 0.6);
      const hex = this._planetColorToHex(cellData.planet_color);
      const orbKey = this._hexToOrbKey(hex);
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

      // Orb icon
      const orbImg = push(this.add.image(cx - ITEM_W/2 + 22*S, cy, orbKey)
        .setDisplaySize(32*S, 32*S).setDepth(D+3));

      // Ô số + giá
      push(this.add.text(cx + 4*S, cy - 14*S, `Ô ${cellIndex}`,
        { fontFamily:"Signika", fontSize:Math.floor(13*S)+"px", color:"#ffffff" }
      ).setOrigin(0.5).setDepth(D+3));
      push(this.add.text(cx + 4*S, cy + 8*S, `+${this._formatMoney(sellPrice)}`,
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

    // Nút xác nhận
    this._makePanelBtn(push, width/2, height/2 + PH/2 - 55*S, 240*S, 48*S, D,
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

        // Gửi 1 event duy nhất với toàn bộ ô cần bán
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
  }

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

  // Màn hình kết thúc game (thắng/thua)
  _showGameOverScreen(isWinner, winnerName) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 300;
    const objs = [];
    const push = o => { objs.push(o); return o; };

    const bgColor = isWinner ? 0x001a00 : 0x1a0000;
    const overlay = push(this.add.rectangle(width/2, height/2, width, height, bgColor, 0).setDepth(D));
    this.tweens.add({ targets: overlay, fillAlpha: 0.85, duration: 700 });

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

      push(this.add.text(width/2, height/2 + 50*S, `🎉 ${winnerName} đã thắng cuộc!`,
        { fontFamily:"Signika", fontSize:Math.floor(22*S)+"px", color:"#ffffff" }
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

      push(this.add.text(width/2, height/2 + 45*S, `🏆 ${winnerName} đã thắng cuộc`,
        { fontFamily:"Signika", fontSize:Math.floor(20*S)+"px", color:"#aaaaaa" }
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
        invested += (cell.build_cost || 0);
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
    const D = 220;

    if (this._buildPanelObjs) {
      this._buildPanelObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._buildPanelObjs = [];
    if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }

    const shell = { D, addObj: (o) => { this._buildPanelObjs.push(o); return o; } };
    const push  = (o) => shell.addObj(o);

    // ── Màu đồng bộ theo planet_color của người chơi ────────────────
    const orbHex   = this._planetColorToHex(data.planet_color);
    const orbKey   = this._hexToOrbKey(orbHex);
    // Tạo màu nền tối từ orbHex (trộn với đen)
    const r0 = ((orbHex >> 16) & 0xff), g0 = ((orbHex >> 8) & 0xff), b0 = (orbHex & 0xff);
    const bgDark  = ((Math.floor(r0 * 0.18) << 16) | (Math.floor(g0 * 0.18) << 8) | Math.floor(b0 * 0.18));
    const bgMid   = ((Math.floor(r0 * 0.12) << 16) | (Math.floor(g0 * 0.12) << 8) | Math.floor(b0 * 0.12));
    const borderC = orbHex;
    const borderI = ((Math.floor(r0 * 0.6 + 255 * 0.4) << 16) | (Math.floor(g0 * 0.6 + 255 * 0.4) << 8) | Math.floor(b0 * 0.6 + 255 * 0.4));

    // ── Kích thước panel nằm dưới màn hình ──────────────────────────
    const PW  = Math.min(width * 0.88, 560 * S);
    const PH  = 340 * S;
    const PCX = width / 2;
    const PCY = height - PH / 2 - 180 * S;
    const RAD = 24 * S;

    // ── Overlay tối map ──────────────────────────────────────────────
    push(this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.45).setDepth(D));

    // ── Nền panel màu đồng bộ planet_color ──────────────────────────
    const panelG = push(this.add.graphics().setDepth(D + 1));
    // Bóng đổ
    panelG.fillStyle(0x000000, 0.45);
    panelG.fillRoundedRect(PCX - PW/2 + 5*S, PCY - PH/2 + 7*S, PW, PH, RAD);
    // Nền màu đồng bộ planet_color — transparent 0.80
    panelG.fillStyle(bgDark, 0.80);
    panelG.fillRoundedRect(PCX - PW/2, PCY - PH/2, PW, PH, RAD);
    // Lớp sáng nhẹ phía trên
    panelG.fillStyle(bgMid, 0.28);
    panelG.fillRoundedRect(PCX - PW/2, PCY - PH/2, PW, PH * 0.42, RAD);
    // Viền ngoài màu planet
    panelG.lineStyle(3*S, borderC, 1);
    panelG.strokeRoundedRect(PCX - PW/2, PCY - PH/2, PW, PH, RAD);
    // Viền trong mờ
    panelG.lineStyle(1.5*S, borderI, 0.22);
    panelG.strokeRoundedRect(PCX - PW/2 + 5*S, PCY - PH/2 + 5*S, PW - 10*S, PH - 10*S, RAD - 3*S);

    // ── Layout grid từ trên xuống ────────────────────────────────────
    const TOP        = PCY - PH/2;
    const PAD        = 20 * S;
    const ROW_TIMER  = TOP + 7*S;
    const ROW_TITLE  = TOP + PAD + 20*S;
    const ROW_ORB    = TOP + PH * 0.44;
    const ROW_PRICE  = TOP + PH * 0.73;
    const ROW_BTN    = TOP + PH - PAD - 20*S;

    // ── Timer bar — sát mép trên, chừa chỗ nút X ────────────────────
    const TIMER_SECS = 12;
    const TBAR_W = PW - 56*S;
    const TBAR_H = 7 * S;
    const TBAR_X = PCX - PW/2 + 10*S;
    const TBAR_Y = ROW_TIMER;

    const timerBg = push(this.add.graphics().setDepth(D + 3));
    timerBg.fillStyle(0x000000, 0.3);
    timerBg.fillRoundedRect(TBAR_X, TBAR_Y, TBAR_W, TBAR_H, TBAR_H / 2);

    const timerFill = push(this.add.graphics().setDepth(D + 4));
    const drawTimerBar = (frac) => {
      timerFill.clear();
      const col = frac > 0.5 ? 0x44dd88 : frac > 0.25 ? 0xffcc00 : 0xff4444;
      timerFill.fillStyle(col, 1);
      timerFill.fillRoundedRect(TBAR_X, TBAR_Y, Math.max(TBAR_W * frac, TBAR_H), TBAR_H, TBAR_H / 2);
    };
    drawTimerBar(1);

    const timerTxt = push(this.add.text(TBAR_X, TBAR_Y - 1*S, `${TIMER_SECS}s`, {
      fontFamily: "Signika", fontSize: Math.floor(9*S) + "px", color: "#aaccaa"
    }).setOrigin(0, 1).setDepth(D + 4));

    let secsLeft = TIMER_SECS;
    this._buildTimer = this.time.addEvent({
      delay: 1000, repeat: TIMER_SECS - 1,
      callback: () => {
        secsLeft--;
        drawTimerBar(secsLeft / TIMER_SECS);
        timerTxt.setText(`${secsLeft}s`);
        if (secsLeft <= 0) {
          this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: false });
          this._closeBuildPanel();
        }
      }
    });

    // ── Tiêu đề pill ─────────────────────────────────────────────────
    const titleY = ROW_TITLE;
    const tc1 = ((Math.floor(r0 * 0.45 + 20) << 16) | (Math.floor(g0 * 0.45 + 10) << 8) | Math.floor(b0 * 0.45 + 30));
    const titleBg = push(this.add.graphics().setDepth(D + 2));
    titleBg.fillStyle(tc1, 1);
    titleBg.fillRoundedRect(PCX - 115*S, titleY - 16*S, 230*S, 32*S, 16*S);
    titleBg.lineStyle(2*S, borderI, 0.8);
    titleBg.strokeRoundedRect(PCX - 115*S, titleY - 16*S, 230*S, 32*S, 16*S);

    push(this.add.text(PCX, titleY, "ĐẶT TINH CẦU", {
      fontFamily: "Signika", fontSize: Math.floor(18*S) + "px",
      color: "#ffffff", fontStyle: "bold",
      stroke: "#00000055", strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 1, color: "#00000077", blur: 4, fill: true }
    }).setOrigin(0.5).setDepth(D + 3));

    // ── Nút X — nửa trong nửa ngoài góc phải trên ───────────────────
    const CLOSE_SIZE = 60*S;
    const CLOSE_X    = PCX + PW/2;
    const CLOSE_Y    = PCY - PH/2;

    if (this.textures.exists("close_btn")) {
      const closeImg = push(this.add.image(CLOSE_X, CLOSE_Y, "close_btn")
        .setDisplaySize(CLOSE_SIZE, CLOSE_SIZE).setDepth(D + 10)
        .setInteractive({ useHandCursor: true }));
      closeImg.on("pointerover",  () => closeImg.setDisplaySize(CLOSE_SIZE * 1.1, CLOSE_SIZE * 1.1));
      closeImg.on("pointerout",   () => closeImg.setDisplaySize(CLOSE_SIZE, CLOSE_SIZE));
      closeImg.on("pointerdown",  () => {
        if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
        this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: false });
        this._closeBuildPanel();
      });
    } else {
      const closeG = push(this.add.graphics().setDepth(D + 10));
      closeG.fillStyle(0xdd1111, 1);
      closeG.fillCircle(CLOSE_X, CLOSE_Y, CLOSE_SIZE / 2);
      closeG.lineStyle(3*S, 0xffffff, 0.9);
      closeG.strokeCircle(CLOSE_X, CLOSE_Y, CLOSE_SIZE / 2);
      const closeTxt = push(this.add.text(CLOSE_X, CLOSE_Y, "✕", {
        fontFamily: "Signika", fontSize: Math.floor(22*S) + "px",
        color: "#ffffff", fontStyle: "bold", stroke: "#880000", strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 11).setInteractive({ useHandCursor: true }));
      closeTxt.on("pointerdown", () => {
        if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
        this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: false });
        this._closeBuildPanel();
      });
    }

    // ── Orb trung tâm phát sáng ──────────────────────────────────────
    const ORB_CX = PCX;
    const ORB_CY = ROW_ORB;
    const ORB_SIZE = 90*S;

    // Vòng hào quang — vẽ tĩnh, chỉ pulse alpha (không scale để tránh tạo hình tròn tối)
    const aura2 = push(this.add.graphics().setDepth(D + 2));
    aura2.fillStyle(orbHex, 0.18);
    aura2.fillCircle(ORB_CX, ORB_CY, ORB_SIZE * 0.62);
    this.tweens.add({ targets: aura2, alpha: { from: 0.9, to: 0.3 }, duration: 1100, repeat: -1, yoyo: true, ease: "Sine.easeInOut" });

    const aura1 = push(this.add.graphics().setDepth(D + 3));
    aura1.fillStyle(0xffffff, 0.10);
    aura1.fillCircle(ORB_CX, ORB_CY, ORB_SIZE * 0.50);
    this.tweens.add({ targets: aura1, alpha: { from: 0.4, to: 0.9 }, duration: 900, repeat: -1, yoyo: true, ease: "Sine.easeInOut" });

    // Bóng đổ orb — float cùng orb
    const orbShadow = push(this.add.ellipse(ORB_CX, ORB_CY + ORB_SIZE * 0.46, ORB_SIZE * 0.65, ORB_SIZE * 0.16, orbHex, 0.28).setDepth(D + 2));

    // Orb image — float nhẹ lên xuống 4px
    const orbImg = push(this.add.image(ORB_CX, ORB_CY, orbKey)
      .setDisplaySize(ORB_SIZE, ORB_SIZE).setDepth(D + 4));

    // Float tất cả cùng nhau — dùng offset tương đối đúng cách
    const floatObjs = [aura1, aura2, orbShadow, orbImg];
    const floatBase = floatObjs.map(o => o.y);
    let floatDir = -1, floatY = 0;
    this.time.addEvent({
      delay: 16,
      repeat: -1,
      callback: () => {
        floatY += floatDir * 0.04;
        if (floatY <= -6) floatDir = 1;
        if (floatY >= 0)  floatDir = -1;
        floatObjs.forEach((o, i) => { o.y = floatBase[i] + floatY; });
      }
    });

    // ── Giá + vị trí căn giữa, cùng font, thẳng hàng ───────────────
    const INFO_Y    = ROW_PRICE - 10*S;
    const COIN_SIZE = 36*S;
    const INFO_FONT = Math.floor(22*S) + "px";
    const priceStr  = this._formatMoney(data.build_cost);
    const locStr    = `Vị Trí: Ô ${data.cell_index}`;

    // Đo width thực để căn giữa chính xác
    const _tp = this.add.text(0, -9999, priceStr, { fontFamily: "Signika", fontSize: INFO_FONT, fontStyle: "bold" });
    const _tl = this.add.text(0, -9999, locStr,   { fontFamily: "Signika", fontSize: INFO_FONT, fontStyle: "bold" });
    const priceW = _tp.width, locW = _tl.width;
    _tp.destroy(); _tl.destroy();

    const SEP        = 14*S;
    const totalInfoW = COIN_SIZE + 6*S + priceW + SEP + locW;
    const iX         = PCX - totalInfoW / 2;

    // Coin icon — căn giữa dọc với text
    push(this.add.image(iX + COIN_SIZE/2, INFO_Y, "coin")
      .setDisplaySize(COIN_SIZE, COIN_SIZE).setDepth(D + 3));
    // 25K
    push(this.add.text(iX + COIN_SIZE + 6*S, INFO_Y, priceStr, {
      fontFamily: "Signika", fontSize: INFO_FONT,
      color: "#ffffff", fontStyle: "bold",
      stroke: "#3a1a0088", strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 1, color: "#00000088", blur: 3, fill: true }
    }).setOrigin(0, 0.5).setDepth(D + 3));
    // Vị trí — cùng font, cùng màu vàng, thẳng hàng
    push(this.add.text(iX + COIN_SIZE + 6*S + priceW + SEP, INFO_Y, locStr, {
      fontFamily: "Signika", fontSize: INFO_FONT,
      color: "#ffffff", fontStyle: "bold",
      stroke: "#3a1a0088", strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 1, color: "#00000088", blur: 3, fill: true }
    }).setOrigin(0, 0.5).setDepth(D + 3));

    // ── Nút MUA / BỎ QUA — nhỏ hơn ─────────────────────────────────
    const BTN_W = 120*S, BTN_H = 40*S;
    const BTN_Y = ROW_BTN;
    const BTN_GAP = 16*S;
    const BTN_BUY_X  = PCX - BTN_W/2 - BTN_GAP/2;
    const BTN_SKIP_X = PCX + BTN_W/2 + BTN_GAP/2;

    this._buildModalBtn(shell, BTN_BUY_X,  BTN_Y, BTN_W, BTN_H, 0x22cc55, 0x118833, "MUA", () => {
      if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
      this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: true });
      this._closeBuildPanel();
    });
    this._buildModalBtn(shell, BTN_SKIP_X, BTN_Y, BTN_W, BTN_H, 0xcc3322, 0x881111, "BỎ QUA", () => {
      if (this._buildTimer) { this._buildTimer.destroy(); this._buildTimer = null; }
      this.socket.emit("game:build_response", { room_id: this.gameRoomId, cell_index: data.cell_index, accept: false });
      this._closeBuildPanel();
    });

    // ── Slide-in từ dưới ────────────────────────────────────────────
    this._buildPanelObjs.forEach(o => { if (o?.y !== undefined) o.y += PH * 0.6; });
    this.tweens.add({
      targets: this._buildPanelObjs.filter(o => o?.y !== undefined),
      y: `-=${PH * 0.6}`, duration: 320, ease: "Back.easeOut"
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
    
  // Render lại tất cả orb từ cellStates (dùng khi reconnect)
  _renderAllCells(cellStates) {
    if (!cellStates) return;
    Object.entries(cellStates).forEach(([idx, data]) => {
      const cell = this.boardPath[Number(idx)];
      if (cell && cell.type !== 'skill') {
        const hex = this._planetColorToHex(data.planet_color);
        console.log(`[renderAllCells] ô ${idx}: planet_color=${data.planet_color} → hex=0x${hex.toString(16)}`);
        this.paintCellGlowAnimated(cell, hex);
      }
    });
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
  
  _hexToOrbKey(hex) {
    return { 0xff7700: "orb_orange", 0xff2233: "orb_red", 0x2266ff: "orb_blue", 0x9933ff: "orb_purple" }[hex] || "orb_blue";
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

  _buildGameChat(width, height) {
    const BTN_SIZE  = 90;
    const LABEL_H   = 18;
    const GAP       = 0;
    const TOTAL_H   = BTN_SIZE + GAP + LABEL_H;
    const btnX      = BTN_SIZE / 2 - 6; // dịch vào trái hơn
    const centerY   = height / 2;
    const iconY     = centerY - (LABEL_H + GAP) / 2;
    const labelY    = iconY + BTN_SIZE / 2 + GAP;
    const D         = 55;

    // ── Nền — bám viền trái, bo góc phải ──────────────────────────
    const PAD_V = 6;
    const bgH   = TOTAL_H + PAD_V * 2;
    const bgW   = BTN_SIZE / 2 + 8;
    const bgG   = this.add.graphics().setDepth(D - 1);
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
    }).setOrigin(0.5, 0).setDepth(D + 1);

    icon.on("pointerover",  () => icon.setTint(0xddddff));
    icon.on("pointerout",   () => icon.clearTint());
    icon.on("pointerdown",  () => this._toggleGameChatPanel(width, height));

    this._gameChatBtnObjs = [bgG, icon, label];
    this._gameChatPanelOpen = false;
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
      channel: "game",
      socket:  this.socket,
      depth:   D + 1,
      myId:    this._myUserId(),
    });
    this._gameChat.build(PANEL_X, PANEL_Y + TAB_H, PANEL_W, PANEL_H - TAB_H);
    this._gameChat.addSystemMessage("Chat trong trận — Chúc vui!");

    this._gameChatPanelObjs = objs;
  }

  _destroyGameChatPanel() {
    this._gameChatPanelOpen = false;
    this._gameChat?.destroy();
    this._gameChat = null;
    this._gameChatPanelObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._gameChatPanelObjs = [];
  }

  shutdown() {
    // Dừng nhạc nền board
    try { this.sound.get("board_bgm")?.stop(); } catch(e) {}
    this._destroyGameChatPanel();
    this._gameChatBtnObjs?.forEach(o => { try { o?.destroy(); } catch(e){} });
    this._gameChatBtnObjs = [];
  }
}