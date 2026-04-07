import PowerDiceSystem   from "./components/PowerDiceSystem.js";
import TarotModalSystem  from "./components/TarotModalSystem.js";
import TarotButtonWidget from "./components/TarotButtonWidget.js";
import { getActiveProfile, getPlayerData } from "../server/utils/playerData.js";

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

  const now = this._estimateServerNowMs();

  const secondsLeft = ids.map((id) => {
    const nextAt = Number(runtime?.[id]?.next_available_at || 0);
    return Math.max(0, Math.ceil((nextAt - now) / 1000));
  });

  this.updatePlayerTarotCooldownsByUserId(userId, secondsLeft);
}

_refreshAllTarotCooldownUIs() {
  (this.gamePlayers || []).forEach((p) => {
    this._refreshPlayerTarotCooldownByUserId(Number(p.user_id));
  });
}

_startTarotUiTicker() {
  if (this._tarotUiTimer) return;

  this._tarotUiTimer = this.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      this._refreshAllTarotCooldownUIs();
    }
  });
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
        this.infoText.setText("❗ Bạn phải trả lời câu hỏi, không được tung xúc xắc").setColor("#ff8844");
        this.powerDice?.hide();
        if (this.diceSprite) this.diceSprite.setVisible(false);
        if (this.diceShadow) this.diceShadow.setVisible(false);
      }

      this._applyTurnState();
      this._updateTurnInfo();
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
      this._refreshPlayerPanelsFromGameState();
      // Cập nhật T.mặt & T.sản ngay
      this._updatePlayerStatsInUI();
    });
    
    this.socket.on("game:rent_paid", (data) => {
      // Cập nhật cash của payer & owner
      if (this.gamePlayers) {
        const payer = this.gamePlayers.find(p => p.user_id === data.payer_user_id);
        const owner = this.gamePlayers.find(p => p.user_id === data.owner_user_id);
        if (payer) payer.cash = (payer.cash || 0) - data.rent;
        if (owner) owner.cash = (owner.cash || 0) + data.rent;
      }
      
      const myUid = this._myUserId();
      // Hiển thị cell glow khi có người trả tiền để làm highlight
      const cell = this.boardPath[data.cell_index];
      if (cell && data.owner_user_id === myUid) {
        const hex = this._planetColorToHex(data.planet_color);
        // Flash glow để chỉ rõ ô nào được trả tiền
        this.paintCellGlow(cell, hex, 0.8);
        this.time.delayedCall(500, () => this.paintCellGlow(cell, hex, 0.5));
      }
      
      if (data.payer_user_id === myUid)
        this._showToast(`💸 Trả ${this._formatMoney(data.rent)} cho ${data.owner_name}`, "#ff8800");
      else if (data.owner_user_id === myUid)
        this._showToast(`💰 Nhận ${this._formatMoney(data.rent)} từ ${data.payer_name}`, "#ffdd00");
      else
        this._showToast(`${data.payer_name} trả thuê ô ${data.cell_index}`, "#aaaaaa");
      
      this._refreshPlayerPanelsFromGameState();
      // Cập nhật T.mặt khi có thay đổi tiền
      this._updatePlayerStatsInUI();
    });

    this.socket.on("game:rent_cannot_afford", (data) => {
      const myUid = this._myUserId();
      const isMe = data.payer_user_id === myUid;

      if (isMe) {
        // Trigger bankruptcy resolution for current player
        this._startBankruptcyResolution(data.owner_user_id);
      } else {
        // Show message for other players
        this._showToast(`${data.payer_name} không đủ tiền trả thuê ô ${data.cell_index}!`, "#ff8800");
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

      this.socket.on("game:monster_target", (data) => {
        const targetIndex = data.cell_index;
        if (targetIndex === undefined || targetIndex === null) return;

        const targetCell = this.boardPath[targetIndex];
        const sourceCell = this.boardPath[28];
        if (!targetCell || !sourceCell) return;

        this._startDarkMapEffect();

        if (this.bloody) {
          this._setHunter28Mode(true);
          this.bloody.play("Hunter_Greeting_2");
        }

        this.time.delayedCall(800, () => {
          this._highlightTargetCell(targetCell);

          this.time.delayedCall(1200, () => {
            this._fireArrowFromAbove(sourceCell, targetCell, true);
          });
        });
      });

      this.socket.on("game:cell_destroyed", (data) => {
        const cell = this.boardPath[data.cell_index];
        if (!cell) return;

        if (data.had_planet) {
          this.clearCell(cell);
          if (this.cellStates) delete this.cellStates[data.cell_index];
          this._showToast(`☄ Ô ${data.cell_index} bị phá hủy!`, "#ff4444");
        } else {
          this._showToast(`💨 Ô ${data.cell_index} bị nhắm nhưng không có tinh cầu`, "#aaaaaa");
        }

        this._stopDarkMapEffect();
        this._setHunter28Mode(false);
      });

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

      // ================== TELEPORT SAFE CELL / GO TO TEACHER / GO TO MONSTER ==================
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
    });

  this.socket.on("game:cell_destroyed", (data) => {
    const cell = this.boardPath[data.cell_index];
    if (cell) this.clearCell(cell);
    this._showToast(`☄ Ô ${data.cell_index} bị phá hủy!`, "#ff4444");
    this._stopDarkMapEffect();
  });

  this.socket.on("game:cell_sold", (data) => {
    // Clear the cell visually
    const cell = this.boardPath[data.cell_index];
    if (cell) this.clearCell(cell);
    if (this.cellStates) delete this.cellStates[data.cell_index];

    // Update UI
    this._refreshPlayerPanelsFromGameState();
    this._updatePlayerStatsInUI();
    this._stopDarkMapEffect();

    // Continue turn
    this.canRoll = true;
    this.isMyTurn = true;
    this._applyTurnState();
    this._updateTurnInfo();

    const myUid = this._myUserId();
    if (data.seller_user_id === myUid) {
      this._showToast(`💰 Bán ô ${data.cell_index} (+${this._formatMoney(data.sell_price)}) và trả nợ thành công!`, "#00ff88");
    } else {
      this._showToast(`🏠 Ô ${data.cell_index} đã được bán`, "#ffffff");
    }
  });

  this.socket.on("game:bankruptcy", (data) => {
    const bankruptPlayer = this.gamePlayers?.find(p => p.user_id === data.user_id);
    if (bankruptPlayer) {
      this._showTurnBanner(`💀 ${bankruptPlayer.name} đã phá sản!`, "#ff4444");

      // Remove bankrupt player from game
      this.gamePlayers = this.gamePlayers.filter(p => p.user_id !== data.user_id);

      // If it was current player's turn, end turn
      if (this.currentTurnSocketId === bankruptPlayer.socket_id) {
        this._updateTurnInfo();
      }
    }
  });

  this.socket.on("game:game_over", (data) => {
    const myUid = this._myUserId();
    if (data.winner_user_id === myUid) {
      this._showTurnBanner(`🎉 Bạn đã thắng! Chúc mừng ${data.winner_name}!`, "#ffdd00");
    } else {
      this._showTurnBanner(`🏆 ${data.winner_name} đã thắng cuộc!`, "#ffdd00");
    }

    // Return to room list after delay
    this.time.delayedCall(4000, () => {
      this.scene.start("RoomListScene");
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
      this._showToast("✅ Trả lời đúng!", "#66ff99");
    } else {
      this._showToast("❌ Trả lời sai!", "#ff6666");
      if (data.user_id === this._myUserId()) {
        this.mustAnswerNext = true;
        this.canRoll = false;
      }
    }
  });

  this.socket.on("game:start_bonus", (data) => {
    this._showToast(`💰 ${data.name} nhận ${this._formatMoney(data.bonus)} khi qua/về START`, "#00ccff");
    if (data.user_id === this._myUserId()) {
      this._updatePlayerStatsInUI();
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
 
    // Cập nhật cooldown live trong panel nhỏ
    const myUid = this._myUserId();
    if (Number(userId) === Number(myUid)) {
      // Nếu modal đang mở thì không cần cập nhật thêm (ticker tự lo)
    }
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
      this.tarotBtn?.hide();           // ← ẩn nút tarot khi không phải lượt
      return;
    }
    this.powerDice?.showForMyTurn();
    this.tarotBtn?.show();             // ← hiện nút tarot khi đến lượt
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
    this.load.image("close_icon",   "./assets/ui/shared/close.png");

    // Fire arrow frames for ô 28 skill effect
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");
      this.load.image(`fire_arrow_${frame}`,
        `./assets/characters/craftpix-net-381552-free-water-and-fire-magic-sprite-vector-pack/Fire Arrow/PNG/Fire Arrow_Frame_${frame}.png`);
    }

    this.load.image("card_slot_small", "./assets/ui/tarot/card.png");
    for (let i = 1; i <= 8; i++) {
      this.load.image(`tarot_${i}`, `./assets/resources/Tarot/resize/thebai_${i}.png`);
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
      }
    });

    // Fire arrow animation for skill cell 28
    const fireArrowFrames = [];
    for (let i = 1; i <= 8; i++) {
      const frame = String(i).padStart(2, "0");
      fireArrowFrames.push({ key: `fire_arrow_${frame}` });
    }
    this.anims.create({ key: "fire_arrow", frames: fireArrowFrames, frameRate:24, repeat: -1 });

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
      slot.icon.setDisplaySize(slot.w, slot.h);
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
    this.socket = io("http://localhost:3000", {
      transports:['websocket','polling'], reconnection:true, reconnectionAttempts:5, timeout:10000,
      auth:{ token }
    });

    this.socket.on("connect", () => {
      this.socket.emit("join", {
        room_id:       this.gameRoomId,
        name:          playerData?.user?.name || "Player",
        user_id:       playerData?.user?.id,
        characterName: playerData?.active?.characterName || "Necromancer_of_the_Shadow",
        skin:          playerData?.active?.skin || 1
      });
      if (this.gameRoomId) {
        setTimeout(() => {
          this.socket.emit("game:request_state", { room_id: this.gameRoomId });
        }, 600);
      }
    });

    this.setupSocketEvents();

    // Board path
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

        cardBg.lineStyle(2 * minRatio, pc.color, 0.95);
        cardBg.strokeRoundedRect(cardX, cY, CARD_W, CARD_H, 6 * minRatio);

        cardBg.lineStyle(1 * minRatio, 0xffffff, 0.12);
        cardBg.strokeRoundedRect(
          cardX + 3 * minRatio,
          cY + 3 * minRatio,
          CARD_W - 6 * minRatio,
          CARD_H - 6 * minRatio,
          4 * minRatio
        );

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
    this.infoText = this.add.text(width/2, 40, "Nhấn SPACE để đổ xúc xắc | R để reset", {
      fontSize: Math.floor(20*minRatio)+"px", color:"#facc15",
      backgroundColor:"#000000cc", padding:{x:20,y:10}
    }).setOrigin(0.5).setDepth(60);

    this.cellInfoText = this.add.text(width/2, height-50, "Ô hiện tại: 0 (START)", {
      fontSize: Math.floor(18*minRatio)+"px", color:"#ffffff",
      backgroundColor:"#000000cc", padding:{x:20,y:10}
    }).setOrigin(0.5).setDepth(60);

    // this.debugText = this.add.text(10, 10, "", {
    //   fontSize:"14px", color:"#ffffff", backgroundColor:"#000000cc", padding:{x:10,y:5}
    // }).setOrigin(0,0).setDepth(60);

    // this.createPlayerPanels(minRatio);
  }

  // =====================
  // SPACE INPUT
  //  Down → PowerDice giữ
  //  Up   → PowerDice thả (emit roll)
  // =====================
  handleSpacePress() {
    if (!this.isMyTurn) {
      this.infoText.setText("⏸ Chưa tới lượt của bạn").setColor("#ff8800");
      return;
    }
    if (!this.canRoll) {
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

    if (this.currentIndex === 28) {
      this._triggerCell28FireDestruction();
    }
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

              // C. Tinh cầu bị phá vỡ (Break)
              this._createFireImpact(endX, endY); // Hiệu ứng nổ lửa
              this.clearCell(targetCell);       // Xóa tinh cầu khỏi map
              if (this.cellStates) delete this.cellStates[targetCell.index];

              // D. Mang map quay lại bình thường (Back to normal)
              if (isLast) {
                  this.time.delayedCall(800, () => {
                      this._stopDarkMapEffect();
                      this._setHunter28Mode(false);
                      this._updatePlayerStatsInUI(); // Cập nhật lại tài sản vì bị mất tinh cầu
                  });
              }
          }
      });
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
  _startBankruptcyResolution(ownerUserId) {
    // Dark map effect
    this._startDarkMapEffect();

    // Highlight all cells owned by the owner
    this._highlightOwnerCells(ownerUserId);

    // Show bankruptcy panel
    this._showBankruptcyPanel(ownerUserId);

    // Disable normal game input
    this.canRoll = false;
    this.isMyTurn = false;
  }

  _highlightOwnerCells(ownerUserId) {
    if (!this.cellStates) return;

    Object.entries(this.cellStates).forEach(([cellIndex, cellData]) => {
      if (cellData.owner_user_id === ownerUserId) {
        const cell = this.boardPath[Number(cellIndex)];
        if (cell) {
          const hex = this._planetColorToHex(cellData.planet_color);
          this.paintCellGlowAnimated(cell, hex);
        }
      }
    });
  }

  _showBankruptcyPanel(ownerUserId) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 170;

    if (this._bankruptcyObjs) {
      this._bankruptcyObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._bankruptcyObjs = [];
    const push = (o) => { this._bankruptcyObjs.push(o); return o; };

    // Dark overlay
    push(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(D));

    // Panel background
    const panel = push(this.createStyledPanel(width / 2, height / 2, 600 * S, 400 * S, 20 * S));
    panel.setDepth(D + 1);

    // Title
    push(this.add.text(width / 2, height / 2 - 160 * S, "PHÁ SẢN!", {
      fontFamily: "Signika",
      fontSize: Math.floor(32 * S) + "px",
      color: "#ff4444",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(D + 2));

    // Description
    push(this.add.text(width / 2, height / 2 - 120 * S, "Bạn đã hết tiền mặt!\nChọn tinh cầu để bán và trả nợ", {
      fontFamily: "Signika",
      fontSize: Math.floor(20 * S) + "px",
      color: "#ffffff",
      align: "center",
      wordWrap: { width: 500 * S }
    }).setOrigin(0.5).setDepth(D + 2));

    // Get required rent from current cell
    const cellState = this.cellStates[this.currentIndex];
    const requiredRent = Math.floor(cellState.build_cost * 0.8);
    const myCash = this.gamePlayers?.find(p => p.user_id === this._myUserId())?.cash || 0;

    push(this.add.text(width / 2, height / 2 - 60 * S,
      `Cần trả: ${this._formatMoney(requiredRent)} Ecoin\nTiền mặt hiện tại: ${this._formatMoney(myCash)} Ecoin`, {
      fontFamily: "Signika",
      fontSize: Math.floor(18 * S) + "px",
      color: "#ffee55",
      align: "center"
    }).setOrigin(0.5).setDepth(D + 2));

    // Instruction
    push(this.add.text(width / 2, height / 2 - 10 * S, "Click vào tinh cầu màu vàng để bán", {
      fontFamily: "Signika",
      fontSize: Math.floor(16 * S) + "px",
      color: "#cccccc",
      align: "center"
    }).setOrigin(0.5).setDepth(D + 2));

    // Make owner's cells clickable
    this._makeOwnerCellsClickable(ownerUserId, requiredRent);
  }

  _makeOwnerCellsClickable(ownerUserId, requiredRent) {
    if (!this.cellStates) return;

    Object.entries(this.cellStates).forEach(([cellIndex, cellData]) => {
      if (cellData.owner_user_id === ownerUserId) {
        const cell = this.boardPath[Number(cellIndex)];
        if (cell && cell.overlay) {
          // Make cell interactive
          const zone = this.add.zone(cell.x * this.scale.width, cell.y * this.scale.height,
            50 * this.minRatio, 50 * this.minRatio)
            .setInteractive({ cursor: "pointer" })
            .setDepth(200);

          zone.on("pointerdown", () => {
            this._handleCellSellClick(Number(cellIndex), cellData, requiredRent);
          });

          // Store zone for cleanup
          if (!this._bankruptcyObjs) this._bankruptcyObjs = [];
          this._bankruptcyObjs.push(zone);
        }
      }
    });
  }

  _handleCellSellClick(cellIndex, cellData, requiredRent) {
    const sellPrice = Math.floor(cellData.build_cost * 0.6); // 60% of build cost
    const myCash = this.gamePlayers?.find(p => p.user_id === this._myUserId())?.cash || 0;
    const totalMoney = myCash + sellPrice;

    if (totalMoney >= requiredRent) {
      // Can afford - sell the cell and pay rent
      this._sellCellAndPayRent(cellIndex, cellData, sellPrice, requiredRent);
    } else {
      // Cannot afford - bankruptcy
      this._triggerBankruptcy();
    }
  }

  _sellCellAndPayRent(cellIndex, cellData, sellPrice, requiredRent) {
    // Clear bankruptcy UI
    this._clearBankruptcyUI();

    // Emit sell and pay rent to server
    if (this.gameRoomId && this.socket) {
      this.socket.emit("game:cell_sold", {
        room_id: this.gameRoomId,
        cell_index: cellIndex,
        seller_user_id: this._myUserId(),
        buyer_user_id: cellData.owner_user_id,
        sell_price: sellPrice,
        rent_paid: requiredRent
      });
    }
  }

  _triggerBankruptcy() {
    // Clear bankruptcy UI
    this._clearBankruptcyUI();

    // Emit bankruptcy to server
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
      this._bankruptcyObjs = [];
    }
  }

  saveGameState() {
    localStorage.setItem("gameState", JSON.stringify({ scene:"BoardScene", currentIndex:this.currentIndex }));
  }

  // =====================
  // TURN INFO
  // =====================
  _updateTurnInfo() {
    if (!this.infoText) return;
    if (this.gamePlayers.length===0) {
      this.infoText.setText("Nhấn SPACE để đổ xúc xắc | R để reset").setColor("#facc15");
      return;
    }
    if (this.isMyTurn) {
      this.infoText.setText("🎲 Lượt của bạn! Nhấn và GIỮ SPACE để tung").setColor("#ffdd00");
    } else {
      const cur=this.gamePlayers.find(p=>p.socket_id===this.currentTurnSocketId);
      const name=cur?.name||"...";
      this.infoText.setText(`⏸ Lượt của ${name} — chờ...`).setColor("#aaaaaa");
    }
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
//  Thay thế toàn bộ _showBuildPanel và _buildModalBtn trong BoardScene.js
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  _showBuildPanel — phiên bản nâng cấp
// ═══════════════════════════════════════════════════════════════

  _showBuildPanel(data) {
    const { width, height } = this.scale;
    const S = this.minRatio;
    const D = 150;

    if (this._buildPanelObjs) {
      this._buildPanelObjs.forEach(o => { try { o?.destroy(); } catch(e){} });
    }
    this._buildPanelObjs = [];

    const shell = { D, addObj: (o) => { this._buildPanelObjs.push(o); return o; } };
    const push  = (o) => shell.addObj(o);

    // ── Dimmer (blur-style) ─────────────────────────────────────────
    const dim = push(this.add.graphics().setDepth(D));
    dim.fillStyle(0x000020, 0.70);
    dim.fillRect(0, 0, width, height);

    // ── Panel chính — lớn hơn, tỉ lệ đẹp hơn ───────────────────────
    const PW  = 460 * S;
    const PH  = 520 * S;
    const PCX = width  / 2;
    const PCY = height / 2;
    const RAD = 24 * S;

    const panelG = push(this.createStyledPanel(PCX, PCY, PW, PH, RAD));
    panelG.setDepth(D + 1);

    // Hiệu ứng glow ngoài panel
    const glowG = push(this.add.graphics().setDepth(D));
    glowG.fillStyle(0xffd080, 0.08);
    glowG.fillRoundedRect(PCX - PW / 2 - 18 * S, PCY - PH / 2 - 18 * S, PW + 36 * S, PH + 36 * S, RAD + 18 * S);

   // ── Nút X — dùng close_icon image ──────────────────────────────
    const closeX = PCX + PW / 2 + 2 * S;
    const closeY = PCY - PH / 2 - 2 * S;

    const closeBtn = push(
      this.add.image(closeX, closeY, "close_icon")
        .setScale(0.70 * S)
        .setDepth(D + 10)
        .setInteractive({ useHandCursor: true })
    );
    closeBtn.on("pointerover",  () => {
      this.tweens.add({ targets: closeBtn, scaleX: 0.80*S, scaleY: 0.80*S, duration: 80 });
    });
    closeBtn.on("pointerout",   () => {
      this.tweens.add({ targets: closeBtn, scaleX: 0.70*S, scaleY: 0.70*S, duration: 80 });
    });
    closeBtn.on("pointerdown",  () => {
      this.tweens.add({
        targets: closeBtn, scaleX: 0.58*S, scaleY: 0.58*S,
        duration: 60, yoyo: true,
        onComplete: () => {
          this.socket.emit("game:build_response", {
            room_id: this.gameRoomId, cell_index: data.cell_index, accept: false
          });
          this._closeBuildPanel();
        }
      });
    });

    // ── Tiêu đề — to hơn, có icon trang trí ────────────────────────
    const titleY = PCY - PH / 2 + 40 * S;

    // Icon ngôi sao trái
    push(this.add.text(PCX - 105 * S, titleY, "✦", {
      fontFamily: "serif",
      fontSize: Math.floor(16 * S) + "px",
      color: "#c8a060",
    }).setOrigin(0.5).setDepth(D + 2));

    push(this.add.text(PCX + 105 * S, titleY, "✦", {
      fontFamily: "serif",
      fontSize: Math.floor(16 * S) + "px",
      color: "#c8a060",
    }).setOrigin(0.5).setDepth(D + 2));

    push(this.add.text(PCX, titleY, "ĐẶT TINH CẦU", {
      fontFamily: "Signika",
      fontSize:   Math.floor(26 * S) + "px",
      color:      "#4a2a08",
      fontStyle:  "bold",
      stroke:     "#f5dfa0",
      strokeThickness: Math.floor(3 * S),
      shadow: { offsetX: 1, offsetY: 2, color: "#c8a06088", blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(D + 2));

    // Đường kẻ trang trí dưới tiêu đề — có ornament
    const divY = titleY + 22 * S;
    const divG = push(this.add.graphics().setDepth(D + 2));
    divG.lineStyle(2 * S, 0xc8a060, 0.7);
    divG.lineBetween(PCX - PW * 0.42, divY, PCX - 14 * S, divY);
    divG.lineBetween(PCX + 14 * S,    divY, PCX + PW * 0.42, divY);
    // Hình thoi giữa
    divG.fillStyle(0xc8a060, 0.9);
    divG.fillTriangle(PCX, divY - 5 * S,  PCX - 8 * S, divY,  PCX, divY + 5 * S);
    divG.fillTriangle(PCX, divY - 5 * S,  PCX + 8 * S, divY,  PCX, divY + 5 * S);

    // ── Card tinh cầu — to hơn, có thêm chi tiết ───────────────────
    const orbHex = this._planetColorToHex(data.planet_color);
    const orbKey = this._hexToOrbKey(orbHex);

    const CARD_W = 240 * S;   // trước là 200
    const CARD_H = 250 * S;   // trước là 210
    const CARD_X = PCX - CARD_W / 2;
    const CARD_Y = PCY - PH / 2 + 96 * S; // trước là 78 -> dịch xuống
    const CARD_R = 18 * S;   // bo góc nhẹ lớn hơn

    // Glow màu orb xung quanh card
    const cardGlowG = push(this.add.graphics().setDepth(D + 2));
    cardGlowG.fillStyle(orbHex, 0.12);
    cardGlowG.fillRoundedRect(CARD_X - 10 * S, CARD_Y - 10 * S, CARD_W + 20 * S, CARD_H + 20 * S, CARD_R + 10 * S);
    this.tweens.add({
      targets: cardGlowG, alpha: { from: 1, to: 0.4 },
      duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    // Bóng đổ card
    const cardShadow = push(this.add.graphics().setDepth(D + 2));
    cardShadow.fillStyle(0x000000, 0.22);
    cardShadow.fillRoundedRect(CARD_X + 5 * S, CARD_Y + 8 * S, CARD_W, CARD_H, CARD_R);

    // Thân card
    const cardG = push(this.add.graphics().setDepth(D + 3));
    cardG.fillStyle(0x0d2a4a, 1);
    cardG.fillRoundedRect(CARD_X, CARD_Y, CARD_W, CARD_H, CARD_R);

    // Dải màu orb phía dưới
    cardG.fillStyle(orbHex, 0.22);
    cardG.fillRoundedRect(CARD_X, CARD_Y + CARD_H * 0.48, CARD_W, CARD_H * 0.52, CARD_R);
    cardG.fillRect(CARD_X, CARD_Y + CARD_H * 0.48, CARD_W, CARD_H * 0.20);

    // Đường phân cách tinh tế
    cardG.lineStyle(1 * S, orbHex, 0.4);
    cardG.lineBetween(CARD_X + 12 * S, CARD_Y + CARD_H * 0.50, CARD_X + CARD_W - 12 * S, CARD_Y + CARD_H * 0.50);

    // Shine card
    cardG.fillStyle(0xffffff, 0.15);
    cardG.fillRoundedRect(CARD_X + 8 * S, CARD_Y + 6 * S, CARD_W - 16 * S, CARD_H * 0.18, CARD_R - 4 * S);

    // Viền card
    cardG.lineStyle(2.5 * S, orbHex, 0.95);
    cardG.strokeRoundedRect(CARD_X, CARD_Y, CARD_W, CARD_H, CARD_R);
    // Viền sáng trên
    cardG.lineStyle(1.5 * S, 0xffffff, 0.22);
    cardG.strokeRoundedRect(CARD_X + 2 * S, CARD_Y + 2 * S, CARD_W - 4 * S, CARD_H - 4 * S, CARD_R - 2 * S);

    // Label "Tinh cầu" — badge nhỏ
    const badgeG = push(this.add.graphics().setDepth(D + 4));
    const badgeW = 102 * S, badgeH = 24 * S;
    badgeG.fillStyle(0x1a90d0, 0.85);
    badgeG.fillRoundedRect(PCX - badgeW / 2, CARD_Y + 12 * S, badgeW, badgeH, badgeH / 2);

    push(this.add.text(PCX, CARD_Y + 12 * S + badgeH / 2, "Tinh cầu", {
      fontFamily: "Signika",
      fontSize:   Math.floor(16 * S) + "px",
      color:      "#00121b",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(D + 5));
    // Orb — float animation
    const ORB_CY = CARD_Y + CARD_H * 0.45;
    const ORB_SIZE = 118 * S; // trước là 100
    const orbImg = push(
      this.add.image(PCX, ORB_CY, orbKey)
        .setDisplaySize(ORB_SIZE, ORB_SIZE)
        .setDepth(D + 5)
    );
    this.tweens.add({
      targets: orbImg, y: ORB_CY - 7 * S,
      duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    // Bóng orb
    const orbShadowEl = push(
      this.add.ellipse(PCX, CARD_Y + CARD_H - 22 * S, 65 * S, 12 * S, orbHex, 0.30)
        .setDepth(D + 4)
    );
    this.tweens.add({
      targets: orbShadowEl,
      scaleX: { from: 1, to: 0.60 }, alpha: { from: 0.30, to: 0.06 },
      duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
    });

    // Giá — nổi bật hơn
    push(this.add.text(PCX, CARD_Y + CARD_H - 20 * S, `💰 Giá: ${this._formatMoney(data.build_cost)}`, {
      fontFamily: "Signika",
      fontSize:   Math.floor(16 * S) + "px",
      color:      "#ffe566",
      fontStyle:  "bold",
      stroke:     "#00000099",
      strokeThickness: Math.floor(2.5 * S),
      shadow: { offsetX: 0, offsetY: 2, color: "#000", blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(D + 5));

    // ── Ô số — badge nhỏ dưới card ─────────────────────────────────
    const cellY = CARD_Y + CARD_H + 20 * S + 8 * S; 

    const cellBadgeW = 132 * S;
    const cellBadgeH = 30 * S;

    const cellBadgeG = push(this.add.graphics().setDepth(D + 2));
    cellBadgeG.fillStyle(0x8b5e1a, 0.25);
    cellBadgeG.fillRoundedRect(PCX - cellBadgeW / 2, cellY - cellBadgeH / 2, cellBadgeW, cellBadgeH, 14 * S);
    cellBadgeG.lineStyle(1.5 * S, 0xc8a060, 0.55);
    cellBadgeG.strokeRoundedRect(PCX - cellBadgeW / 2, cellY - cellBadgeH / 2, cellBadgeW, cellBadgeH, 14 * S);

    push(this.add.text(PCX, cellY, `📍 Ô số ${data.cell_index}`, {
      fontFamily: "Signika",
      fontSize:   Math.floor(17 * S) + "px", 
      color:      "#9b7040",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(D + 3));

    // ── Hai button — to hơn, khoảng cách đều ───────────────────────
    const BTN_W   = 155 * S;
    const BTN_H   = 52 * S;
    const BTN_Y   = PCY + PH / 2 - 74 * S; // trước là -50 -> kéo lên trên
    const BTN_GAP = 24 * S;

    const BTN_BUY_X  = PCX - BTN_W / 2 - BTN_GAP / 2;
    const BTN_SKIP_X = PCX + BTN_W / 2 + BTN_GAP / 2;

    // MUA — xanh lá
    this._buildModalBtn(shell,
      BTN_BUY_X, BTN_Y, BTN_W, BTN_H,
      0x2ecc40, 0x1a8a28, "🛒 MUA",
      () => {
        this.socket.emit("game:build_response", {
          room_id: this.gameRoomId, cell_index: data.cell_index, accept: true
        });
        this._closeBuildPanel();
      }
    );

    // BỎ QUA — đỏ cam
    this._buildModalBtn(shell,
      BTN_SKIP_X, BTN_Y, BTN_W, BTN_H,
      0xe05c2a, 0x8a2a10, "⏭ BỎ QUA",
      () => {
        this.socket.emit("game:build_response", {
          room_id: this.gameRoomId, cell_index: data.cell_index, accept: false
        });
        this._closeBuildPanel();
      }
    );

    // ── Hiệu ứng particles nhỏ trang trí ───────────────────────────
    for (let i = 0; i < 4; i++) {
      const px = PCX - PW / 2 + (i + 0.5) * (PW / 4);
      const py = PCY - PH / 2 + 12 * S;
      const dot = push(this.add.graphics().setDepth(D + 2));
      dot.fillStyle(0xffd080, 0.6);
      dot.fillCircle(px, py, 3 * S);
      this.tweens.add({
        targets: dot, alpha: { from: 0.6, to: 0.1 },
        duration: 800 + i * 200, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
      });
    }
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
      g.lineStyle(2.5, 0xffffff, 0.65);
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, br);
      // Viền màu sáng thêm
      if (hover) {
        g.lineStyle(2, 0xffffff, 0.90);
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
        this.paintCellGlowAnimated(cell, hex);
      }
    });
  }
  
  _showToast(message, color = "#ffffff", duration = 2500) {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height - 130, message, {
      fontFamily: "Signika", fontSize: "16px", color,
      backgroundColor: "#000000bb", padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(200).setAlpha(0);
    this.tweens.add({
      targets: toast, alpha: 1, y: height - 140, duration: 200,
      onComplete: () => this.time.delayedCall(duration, () => {
        this.tweens.add({ targets: toast, alpha: 0, duration: 300,
          onComplete: () => { try { toast.destroy(); } catch(e){} } });
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
}