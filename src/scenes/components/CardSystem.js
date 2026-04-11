// ═══════════════════════════════════════════════════════════════════════
//  CardSystem.js — Logic hệ thống thẻ bài (turn-based cooldown)
//
//  Pattern: Strategy + EventEmitter
//  Tách hoàn toàn khỏi UI — chỉ xử lý state và emit events
//
//  Tích hợp:
//    this.cardSystem = new CardSystem(scene);
//    this.cardSystem.on('card:used',    ({ card, payload }) => { ... });
//    this.cardSystem.on('card:cooldown_tick', ({ userId, cooldowns }) => { ... });
// ═══════════════════════════════════════════════════════════════════════

export default class CardSystem {
  constructor(scene) {
    this.scene     = scene;
    this._handlers = {};

    // cooldown_turns state: { [userId]: { [cardId]: turnsLeft } }
    this._cooldowns = {};
  }

  // ─────────────────────────────────────────────────────────────────────
  //  EVENT EMITTER (minimal)
  // ─────────────────────────────────────────────────────────────────────

  on(event, fn)  { (this._handlers[event] = this._handlers[event] || []).push(fn); return this; }
  off(event, fn) { this._handlers[event] = (this._handlers[event] || []).filter(h => h !== fn); }

  emit(event, data) {
    (this._handlers[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[CardSystem]', e); } });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  COOLDOWN MANAGEMENT (turn-based)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Khởi tạo cooldown state cho một player từ server data
   * @param {number} userId
   * @param {Array}  cards   — mảng card objects { id, cooldown_turns, ... }
   * @param {Object} runtime — tarot_runtime từ server { [cardId]: { current_cooldown } }
   */
  initPlayerCooldowns(userId, cards = [], runtime = {}) {
    if (!this._cooldowns[userId]) this._cooldowns[userId] = {};
    cards.forEach(card => {
      const rt = runtime[card.id] || {};
      // Ưu tiên cooldown_turns_left từ server, fallback về 0
      this._cooldowns[userId][card.id] = Number(rt.cooldown_turns_left ?? rt.current_cooldown ?? 0);
    });
  }

  /**
   * Lấy số lượt cooldown còn lại của 1 thẻ
   */
  getCooldown(userId, cardId) {
    return this._cooldowns[userId]?.[cardId] ?? 0;
  }

  /**
   * Kiểm tra thẻ có đang cooldown không
   */
  isOnCooldown(userId, cardId) {
    return this.getCooldown(userId, cardId) > 0;
  }

  /**
   * Set cooldown sau khi dùng thẻ
   */
  setAfterUse(userId, card) {
    const turns = Number(card.cooldown_turns ?? card.cooldown_seconds ?? 0);
    if (!this._cooldowns[userId]) this._cooldowns[userId] = {};
    this._cooldowns[userId][card.id] = turns;
    this.emit('card:cooldown_set', { userId, cardId: card.id, turns });
  }

  /**
   * Giảm cooldown 1 lượt cho tất cả thẻ của userId
   * Gọi khi bắt đầu lượt mới của userId
   */
  tickCooldowns(userId) {
    const state = this._cooldowns[userId];
    if (!state) return;
    Object.keys(state).forEach(cardId => {
      if (state[cardId] > 0) state[cardId]--;
    });
    this.emit('card:cooldown_tick', { userId, cooldowns: { ...state } });
  }

  /**
   * Sync cooldown từ server (game:tarot_state)
   * Server gửi cooldown_turns_left thay vì cooldown_seconds_left
   */
  syncFromServer(userId, activeIds = [], runtime = {}) {
    if (!this._cooldowns[userId]) this._cooldowns[userId] = {};
    activeIds.forEach(id => {
      const rt = runtime[id] || {};
      const turnsLeft = Number(rt.cooldown_turns_left ?? rt.current_cooldown ?? 0);
      this._cooldowns[userId][id] = turnsLeft;
    });
    this.emit('card:cooldown_tick', { userId, cooldowns: { ...this._cooldowns[userId] } });
  }

  /**
   * Lấy toàn bộ cooldown state của userId
   */
  getCooldownsForUser(userId) {
    return { ...(this._cooldowns[userId] || {}) };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  CARD EFFECTS — Strategy map
  //  Mỗi effect là 1 function thuần, không chứa UI
  //  Server xử lý thật — client chỉ emit socket + local preview
  // ─────────────────────────────────────────────────────────────────────

  static EFFECTS = {

    // 1. Công An — bỏ lượt đối thủ
    skip_turn_enemy: (ctx) => {
      const { scene, card, payload } = ctx;
      const sc = scene;
      const myUid = sc._myUserId();
      const enemies = (sc.gamePlayers || []).filter(p => Number(p.user_id) !== Number(myUid));
      if (!enemies.length) return { ok: false, reason: 'Không có đối thủ' };

      // 1vs1: tự động chọn
      const targetId = payload?.target_user_id ?? enemies[0].user_id;
      sc.socket.emit('game:use_tarot', {
        room_id: sc.gameRoomId, tarot_id: card.id, target_user_id: targetId
      });
      return { ok: true, needsTarget: enemies.length > 1 };
    },

    // 2. Xúc Xắc Ma Thuật — tung thêm lượt
    extra_roll: (ctx) => {
      ctx.scene.socket.emit('game:use_tarot', {
        room_id: ctx.scene.gameRoomId, tarot_id: ctx.card.id
      });
      return { ok: true };
    },

    // 3. Nhận Trợ Giúp — lấy 20% gold đối thủ (pending, server xử lý)
    steal_cash_percent: (ctx) => {
      ctx.scene.socket.emit('game:use_tarot', {
        room_id: ctx.scene.gameRoomId, tarot_id: ctx.card.id
      });
      return { ok: true };
    },

    // 4. Nhanh Chân — di chuyển thêm 1-6 ô (pending, server xử lý)
    move_forward_range: (ctx) => {
      ctx.scene.socket.emit('game:use_tarot', {
        room_id: ctx.scene.gameRoomId, tarot_id: ctx.card.id
      });
      return { ok: true };
    },

    // 5. Tài Phiệt — buff thuế x1.6-1.8 trong 3 lượt
    tax_multiplier: (ctx) => {
      ctx.scene.socket.emit('game:use_tarot', {
        room_id: ctx.scene.gameRoomId, tarot_id: ctx.card.id
      });
      return { ok: true };
    },

    // 6. Thần Giữ Của — hoàn tiền thuế lượt này
    recover_house_money: (ctx) => {
      ctx.scene.socket.emit('game:use_tarot', {
        room_id: ctx.scene.gameRoomId, tarot_id: ctx.card.id
      });
      return { ok: true };
    },

    // 7. Giải Tỏa — phá tinh cầu đối thủ (cần targeting UI)
    destroy_enemy_house: (ctx) => {
      // UI sẽ handle targeting, sau đó gọi sendWithTarget
      return { ok: true, needsCellTarget: true };
    },

    // 8. Hoán Đổi — swap 2 tinh cầu (cần 2-step targeting UI)
    swap_planet: (ctx) => {
      return { ok: true, needsSwapTarget: true };
    },
  };

  /**
   * Dispatch effect — gọi từ UI sau khi user bấm dùng thẻ
   * @returns {{ ok, needsTarget, needsCellTarget, needsSwapTarget, reason }}
   */
  useCard(card, payload = {}) {
    const sc = this.scene;

    if (!sc._canUseTarotNow?.()) {
      return { ok: false, reason: 'Không thể dùng thẻ lúc này' };
    }

    const myUid = sc._myUserId();
    if (this.isOnCooldown(myUid, card.id)) {
      const left = this.getCooldown(myUid, card.id);
      return { ok: false, reason: `Còn ${left} lượt hồi chiêu` };
    }

    const effectFn = CardSystem.EFFECTS[card.effect_type];
    if (!effectFn) {
      // Fallback: gửi thẳng
      sc.socket.emit('game:use_tarot', { room_id: sc.gameRoomId, tarot_id: card.id });
      this.emit('card:used', { card, payload });
      return { ok: true };
    }

    const result = effectFn({ scene: sc, card, payload });
    if (result.ok && !result.needsTarget && !result.needsCellTarget && !result.needsSwapTarget) {
      this.emit('card:used', { card, payload });
    }
    return result;
  }

  /**
   * Gửi thẻ cần target sau khi UI đã chọn xong
   */
  sendWithTarget(card, payload = {}) {
    const sc = this.scene;
    sc.socket.emit('game:use_tarot', {
      room_id: sc.gameRoomId,
      tarot_id: card.id,
      ...payload
    });
    this.emit('card:used', { card, payload });
  }

  destroy() {
    this._handlers = {};
    this._cooldowns = {};
  }
}
