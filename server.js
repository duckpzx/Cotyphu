// ===== ENV =====
import dotenv from "dotenv";
dotenv.config();

// ===== CORE =====
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

// ===== SERVICES =====
import userService from "./src/server/services/user.service.js";
import userRepo from "./src/server/repositories/user.repo.js";
import characterService from "./src/server/services/character.service.js";
import characterRepo from "./src/server/repositories/character.repo.js"; 
import roomService from "./src/server/services/room.service.js";
import roomRepo from "./src/server/repositories/room.repo.js";
import tarotService from "./src/server/services/tarot.service.js";
import questionsService from "./src/server/services/questions.service.js";
import db from "./src/server/config/db.js";

const SECRET = process.env.JWT_SECRET;
const app    = express();
const server = http.createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

console.log("🚀 Server đang chạy...");

// ===== SOCKET.IO =====
const io = new Server(server, { cors: { origin: "*" } });

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    const decoded = jwt.verify(token, SECRET);
    socket.user_id = decoded.id;
    next();
  } catch (err) {
    return next(new Error("Invalid token"));
  }
});

// ===== GAME STATE =====
const players = {};
const gameStates = {};
const PLANET_COLORS = ["red", "blue", "purple", "orange"];
const SKILL_CELLS   = [0, 9, 18, 28]; // ô kỹ năng — không mua/thuê

const TOTAL_CELLS = 37;

function normalizeTarotIds(raw) {
  let ids = raw ?? [];
  if (typeof ids === "string") {
    try { ids = JSON.parse(ids); } catch { ids = []; }
  }
  if (!Array.isArray(ids)) ids = [];
  return ids.map(Number).filter(Boolean).slice(0, 2);
}

function sanitizeTarotCard(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name || `Tarot ${row.id}`,
    description: row.description || "",
    cooldown_seconds: Number(row.cooldown_seconds || 0),
    effect_type: row.effect_type || "",
    icon: row.icon || null
  };
}

async function getTarotByIdSafe(tarotId) {
  const id = Number(tarotId);
  if (!id) return null;

  if (typeof tarotService.getTarotById === "function") {
    const result = await tarotService.getTarotById(id);
    if (result?.success && result?.tarot) return sanitizeTarotCard(result.tarot);
    if (result?.id) return sanitizeTarotCard(result);
  }

  if (typeof tarotService.getAllTarots === "function") {
    const result = await tarotService.getAllTarots();
    const arr =
      result?.tarots ||
      result?.data ||
      result?.cards ||
      (Array.isArray(result) ? result : []);
    const found = arr.find(t => Number(t.id) === id);
    return sanitizeTarotCard(found);
  }

  return null;
}

async function getTarotCardsByIds(ids = []) {
  const rows = await Promise.all(ids.map(getTarotByIdSafe));
  return rows.filter(Boolean);
}

function buildTarotRuntime(ids = []) {
  const runtime = {};
  ids.forEach((id) => {
    runtime[id] = {
      tarot_id: Number(id),
      next_available_at: 0,
      last_used_at: null,
      last_used_turn: null,
      used_this_turn: false
    };
  });
  return runtime;
}

function buildTarotCooldownArray(runtime = {}, ids = [], now = Date.now()) {
  return ids.map((id) => {
    const rt     = runtime?.[id] || {};
    const nextAt = Number(rt.next_available_at || 0);
    return {
      seconds_left: Math.max(0, Math.ceil((nextAt - now) / 1000)),
      turns_left:   Math.max(0, Number(rt.cooldown_turns_left ?? 0))
    };
  });
}

function emitTarotState(room_id, user_id = null) {
  const gs = gameStates[room_id];
  if (!gs) return;

  const now = Date.now();
  const list = user_id != null
    ? gs.players.filter(p => p.user_id === user_id)
    : gs.players;

  list.forEach((p) => {
    io.to(`game_${room_id}`).emit("game:tarot_state", {
      room_id,
      user_id: p.user_id,
      active_tarot_ids: p.active_tarot_ids || [],
      tarot_cards: p.tarot_cards || [],
      tarot_runtime: p.tarot_runtime || {},
      cooldown_seconds_left: buildTarotCooldownArray(
        p.tarot_runtime,
        p.active_tarot_ids,
        now
      ),
      used_tarot_this_turn: !!p.used_tarot_this_turn,
      server_now_ms: now
    });
  });
}

function getEnemies(gs, cur) {
  return (gs.players || []).filter(p => Number(p.user_id) !== Number(cur.user_id));
}

function getTargetEnemy(gs, cur, requestedUserId = null) {
  const enemies = getEnemies(gs, cur);
  if (!enemies.length) return null;

  if (requestedUserId != null) {
    return enemies.find(p => Number(p.user_id) === Number(requestedUserId)) || null;
  }

  return enemies[0] || null;
}

function getOwnedCells(gs, ownerUserId) {
  return Object.entries(gs.cellStates || {})
    .filter(([_, cell]) => Number(cell.owner_user_id) === Number(ownerUserId))
    .map(([cell_index, cell]) => ({
      cell_index: Number(cell_index),
      ...cell
    }));
}

function getTargetEnemyCell(gs, cur, targetUserId = null, targetCellIndex = null) {
  const enemy = getTargetEnemy(gs, cur, targetUserId);
  if (!enemy) return null;

  const enemyCells = getOwnedCells(gs, enemy.user_id);
  if (!enemyCells.length) return null;

  if (targetCellIndex != null) {
    return enemyCells.find(c => Number(c.cell_index) === Number(targetCellIndex)) || null;
  }

  return enemyCells[0] || null;
}

// server.js – bổ sung vào game state
// Mỗi player có thêm:
//   pending_tarot_effect: null | { type, params, used }
//   extra_roll_queued: bool
//   rent_refund_pending: bool
//   steal_pending: { active, targetUserIds, percent }

// Hàm xử lý thẻ mở rộng
async function applyTarotEffect(gs, cur, tarotDef, payload = {}) {
  const effectType = tarotDef.effect_type;
  const room_id    = gs.room_id;
 
  // ── Helper: lấy danh sách user_id đối thủ (hỗ trợ team 2v2) ──────────────
  const getEnemyIds = () => {
    const enemies = gs.players.filter(p => p.user_id !== cur.user_id);
    // Team 2v2: trả về cả 2 đối thủ bên kia; 1vs1: chỉ 1 người
    return enemies.map(e => e.user_id);
  };
 
  // ── Helper: lấy tất cả cellState thuộc về user_id ──────────────────────────
  const getOwnedCellEntries = (userId) =>
    Object.entries(gs.cellStates || {})
      .filter(([_, c]) => Number(c.owner_user_id) === Number(userId))
      .map(([idx, c]) => ({ cell_index: Number(idx), ...c }));
 
  switch (effectType) {
 
    // ═══════════════════════════════════════════════════════════════════════
    //  1. CÔNG AN — skip_turn_enemy
    //     Mất lượt 1 đối thủ chỉ định (team: chọn 1 người phía đối)
    // ═══════════════════════════════════════════════════════════════════════
    case 'skip_turn_enemy': {
      // Validate target
      const targetUserId = Number(payload.target_user_id) || getEnemyIds()[0];
      if (!targetUserId) return false;
 
      const target = gs.players.find(p => Number(p.user_id) === targetUserId);
      if (!target) return false;
 
      // Không cho phép target chính mình
      if (Number(target.user_id) === Number(cur.user_id)) return false;
 
      // Tích lũy: nếu bị dùng 2 thẻ liên tiếp thì mất 2 lượt
      target.skip_next_turn = (target.skip_next_turn || 0) + 1;
 
      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:           'skip_turn_enemy',
        user_id:        cur.user_id,
        name:           cur.name,
        target_user_id: target.user_id,
        target_name:    target.name,
        skip_count:     target.skip_next_turn
      });
 
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  2. XÚC XẮC MA THUẬT — extra_roll
    //     Sau khi kết thúc lượt bình thường → được tung lại ngay lập tức
    // ═══════════════════════════════════════════════════════════════════════
    case 'extra_roll': {
      cur.extra_roll_queued = true;

      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:    'extra_roll',
        source:  'tarot',
        user_id: cur.user_id,
        name:    cur.name
      });

      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  3. NHẬN TRỢ GIÚP — steal_cash_percent
    //     Pending: kích hoạt sau khi tung xúc xắc xong (ngay khi ROLLING)
    //     1vs1: lấy 20% tiền 1 người; team: lấy 20% tiền cả 2 đối thủ
    // ═══════════════════════════════════════════════════════════════════════
    case 'steal_cash_percent': {
      const percent  = Number(tarotDef.effect_params?.percent ?? 20);
      const enemyIds = getEnemyIds();
      if (!enemyIds.length) return false;

      let totalStolen = 0;
      const breakdown = [];

      enemyIds.forEach(uid => {
        const target = gs.players.find(p => Number(p.user_id) === Number(uid));
        if (!target || (target.cash || 0) <= 0) return;
        const amount = Math.floor(target.cash * percent / 100);
        if (amount <= 0) return;
        target.cash -= amount;
        cur.cash    += amount;
        totalStolen += amount;
        breakdown.push({ from_user_id: uid, from_name: target.name, amount });
      });

      if (totalStolen <= 0) return false;

      io.to(`game_${room_id}`).emit('game:steal_effect', {
        user_id:   cur.user_id,
        name:      cur.name,
        total:     totalStolen,
        breakdown,
        percent
      });

      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:    'steal_cash_percent_done',
        user_id: cur.user_id,
        name:    cur.name,
        total:   totalStolen,
        percent
      });

      emitGameStateSync(room_id);
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  4. NHANH CHÂN — move_forward_range
    //     Pending: kích hoạt sau khi di chuyển chính xong
    //     Ưu tiên ô an toàn (không phải nhà đối thủ) nếu có
    // ═══════════════════════════════════════════════════════════════════════
    case 'move_forward_range': {
      const min = Number(tarotDef.effect_params?.min ?? 1);
      const max = Number(tarotDef.effect_params?.max ?? 6);
 
      cur.pending_extra_move = {
        active:          true,
        min,
        max,
        avoidEnemyCells: true
      };
 
      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:    'move_forward_range_pending',
        user_id: cur.user_id,
        name:    cur.name,
        min,
        max
      });
 
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  5. TÀI PHIỆT — tax_multiplier
    //     Chọn ngẫu nhiên 1–2 tinh cầu của mình → buff hệ số thuế x1.2–x1.6
    //     Lưu vào cellState: { tax_multiplier, tax_multiplier_active }
    // ═══════════════════════════════════════════════════════════════════════
    case 'tax_multiplier': {
      const ownedCells = getOwnedCellEntries(cur.user_id);
      if (!ownedCells.length) return false;
 
      const countToBuff = Math.min(
        ownedCells.length,
        Number(tarotDef.effect_params?.count ?? 2)
      );
 
      // Xáo trộn và chọn
      const shuffled = [...ownedCells].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, countToBuff);
 
      const buffedCells = selected.map(c => {
        // Multiplier ngẫu nhiên trong khoảng [1.2, 1.6]
        const [mMin, mMax] = tarotDef.effect_params?.multiplier_range ?? [1.2, 1.6];
        const mult = +(mMin + Math.random() * (mMax - mMin)).toFixed(2);
 
        const cellState = gs.cellStates[c.cell_index];
        if (cellState) {
          cellState.tax_multiplier        = mult;
          cellState.tax_multiplier_active = true;
        }
 
        return { index: c.cell_index, multiplier: mult };
      });
 
      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:        'tax_multiplier',
        user_id:     cur.user_id,
        name:        cur.name,
        cells:       buffedCells   // [{index, multiplier}, ...]
      });
 
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  6. THẦN GIỮ CỦA — recover_house_money
    //     Pending: trong lượt này nếu trả thuê → được hoàn lại 100%
    //     Nếu không dẫm vào nhà đối thủ → hết hiệu lực sau lượt
    // ═══════════════════════════════════════════════════════════════════════
    case 'recover_house_money': {
      cur.rent_refund_pending = true;
 
      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:    'recover_house_money',
        user_id: cur.user_id,
        name:    cur.name
      });
 
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  7. GIẢI TỎA — destroy_enemy_house
    //     Xóa 1 tinh cầu / công trình đối thủ do client chỉ định
    //     Validation: ô phải tồn tại & không thuộc mình
    // ═══════════════════════════════════════════════════════════════════════
    case 'destroy_enemy_house': {
      const targetCellIndex = Number(payload.target_cell_index);
      if (isNaN(targetCellIndex)) return false;
 
      const targetCell = gs.cellStates[targetCellIndex];
      if (!targetCell) return false; // ô trống
      if (Number(targetCell.owner_user_id) === Number(cur.user_id)) return false; // không được phá của mình

      // Không thể phá ô đang được bảo vệ
      if ((targetCell.protected_turns || 0) > 0) {
        socket.emit('game:tarot_denied', { message: 'Tinh cầu này đang được bảo vệ!' });
        return false;
      }
 
      const previousOwner = targetCell.owner_user_id;
      delete gs.cellStates[targetCellIndex];
 
      io.to(`game_${room_id}`).emit('game:cell_destroyed', {
        cell_index:     targetCellIndex,
        had_planet:     true,
        destroyed_by:   cur.user_id,
        destroyer_name: cur.name,
        previous_owner: previousOwner
      });
 
      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:            'destroy_enemy_house',
        user_id:         cur.user_id,
        name:            cur.name,
        target_cell:     targetCellIndex,
        previous_owner:  previousOwner
      });
 
      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  8. HOÁN ĐỔI — swap_planet
    //     Hoán đổi quyền sở hữu 2 tinh cầu (1 của mình, 1 của đối thủ)
    //     Payload: { target_cell_index: enemyCell, my_cell_index: myCell }
    // ═══════════════════════════════════════════════════════════════════════
    case 'swap_planet': {
      const enemyCellIdx = Number(payload.target_cell_index);
      const myCellIdx    = Number(payload.my_cell_index);

      if (isNaN(enemyCellIdx) || isNaN(myCellIdx)) return false;

      const myCell    = gs.cellStates[myCellIdx];
      const enemyCell = gs.cellStates[enemyCellIdx];

      if (!myCell || !enemyCell) return false;
      if (Number(myCell.owner_user_id)    !== Number(cur.user_id)) return false;
      if (Number(enemyCell.owner_user_id) === Number(cur.user_id)) return false;

      // Không thể hoán đổi ô đang được bảo vệ
      if ((myCell.protected_turns || 0) > 0 || (enemyCell.protected_turns || 0) > 0) {
        socket.emit('game:tarot_denied', { message: 'Một trong hai tinh cầu đang được bảo vệ!' });
        return false;
      }

      console.log('[swap_planet] TRƯỚC:', {
        myCell:    { idx: myCellIdx,    owner: myCell.owner_user_id,    color: myCell.planet_color },
        enemyCell: { idx: enemyCellIdx, owner: enemyCell.owner_user_id, color: enemyCell.planet_color }
      });

      // Swap toàn bộ: owner + màu (tinh cầu đi theo người)
      const tmpOwner = myCell.owner_user_id;
      const tmpColor = myCell.planet_color;

      myCell.owner_user_id    = enemyCell.owner_user_id;
      myCell.planet_color     = enemyCell.planet_color;
      enemyCell.owner_user_id = tmpOwner;
      enemyCell.planet_color  = tmpColor;

      console.log('[swap_planet] SAU:', {
        myCell:    { idx: myCellIdx,    owner: myCell.owner_user_id,    color: myCell.planet_color },
        enemyCell: { idx: enemyCellIdx, owner: enemyCell.owner_user_id, color: enemyCell.planet_color }
      });

      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:             'swap_planet',
        user_id:          cur.user_id,
        name:             cur.name,
        my_cell_index:    myCellIdx,
        enemy_cell_index: enemyCellIdx
      });

      return true;
    }
 
    // ═══════════════════════════════════════════════════════════════════════
    //  9. TÀI PHÚ — bonus_starting_cash_percent
    //     Nhận ngay X% tiền khởi đầu (bet_ecoin * 20) từ hệ thống
    // ═══════════════════════════════════════════════════════════════════════
    case 'bonus_starting_cash_percent': {
      const percent      = Number(tarotDef.effect_params?.percent ?? 30);
      const startingCash = (gs.bet_ecoin || 5000) * 20;
      const bonus        = Math.floor(startingCash * percent / 100);
      if (bonus <= 0) return false;

      cur.cash += bonus;

      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:    'bonus_starting_cash_percent',
        user_id: cur.user_id,
        name:    cur.name,
        bonus,
        percent
      });

      emitGameStateSync(room_id);
      return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  10. BẢO VỆ — protect_planet_turns
    //      Bảo vệ 1 tinh cầu do người dùng chỉ định khỏi mọi tác động
    //      (phá nhà, hoán đổi, tăng thuế) trong N lượt tung xúc xắc
    // ═══════════════════════════════════════════════════════════════════════
    case 'protect_planet_turns': {
      const targetCellIndex = Number(payload.target_cell_index);
      if (isNaN(targetCellIndex)) return false;

      const targetCell = gs.cellStates[targetCellIndex];
      if (!targetCell) return false;
      // Chỉ được bảo vệ tinh cầu của mình
      if (Number(targetCell.owner_user_id) !== Number(cur.user_id)) return false;

      const turns = Number(tarotDef.effect_params?.turns ?? 3);
      targetCell.protected_turns = (targetCell.protected_turns || 0) + turns;
      targetCell.protected_by    = cur.user_id;

      io.to(`game_${room_id}`).emit('game:skill_event', {
        type:       'protect_planet_turns',
        user_id:    cur.user_id,
        name:       cur.name,
        cell_index: targetCellIndex,
        turns
      });

      return true;
    }

    default:
      console.warn(`[TarotEffect] Unknown effect_type: ${effectType}`);
      return false;
  }
}

function applyPendingSteal(gs, cur) {
  if (!cur.pending_steal?.active) return;
 
  const { targetUserIds, percent } = cur.pending_steal;
  let totalStolen = 0;
  const breakdown = [];
 
  targetUserIds.forEach(uid => {
    const target = gs.players.find(p => Number(p.user_id) === Number(uid));
    if (!target || target.cash <= 0) return;
 
    const stealAmount = Math.floor(target.cash * percent / 100);
    if (stealAmount <= 0) return;
 
    target.cash -= stealAmount;
    cur.cash    += stealAmount;
    totalStolen += stealAmount;
    breakdown.push({ from_user_id: uid, from_name: target.name, amount: stealAmount });
  });
 
  // Reset pending
  cur.pending_steal = null;
 
  if (totalStolen > 0) {
    io.to(`game_${gs.room_id}`).emit('game:steal_effect', {
      user_id:    cur.user_id,
      name:       cur.name,
      total:      totalStolen,
      breakdown,              // [{from_user_id, from_name, amount}]
      percent
    });
 
    // Đồng bộ cash mới cho tất cả
    emitCashSync(gs);
  }
}

// Hook xử lý extra move sau khi di chuyển chính
function applyPendingExtraMove(gs, cur, currentIndex, boardPath) {
  if (!cur.pending_extra_move?.active) return null;
  const { min, max, avoidEnemyCells } = cur.pending_extra_move;
  let steps = Math.floor(Math.random() * (max - min + 1)) + min;
  if (avoidEnemyCells) {
    // Tìm số bước an toàn (không dừng vào ô đối thủ)
    let bestSteps = steps;
    for (let s = 1; s <= steps; s++) {
      const targetIdx = (currentIndex + s) % TOTAL_CELLS;
      const cellState = gs.cellStates[targetIdx];
      if (!cellState || cellState.owner_user_id === cur.user_id) {
        bestSteps = s;
        break;
      }
    }
    steps = bestSteps;
  }
  cur.pending_extra_move = null;
  return steps;
}

/** Shuffle Fisher-Yates */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Khởi tạo game state */
async function initGameState(room_id, sockets, bet_ecoin = 5000) {
  const shuffled  = shuffle([...sockets]);
  const colorPool = shuffle([...PLANET_COLORS]);

  const gamePlayers = await Promise.all(
    shuffled.map(async (s, i) => {
      const user = await userService.getUserById(s.user_id);

      const activeTarotIds = normalizeTarotIds(user?.active_tarot_ids);
      const tarotCards = await getTarotCardsByIds(activeTarotIds);

      return {
        socket_id: s.id,
        user_id: s.user_id,
        name: s.player_name || "Player",
        turn_order: i + 1,
        planet_color: colorPool[i % colorPool.length],
        cash: bet_ecoin * 20,
        index: 0,

        characterName: s.character_name || "Unknown",
        skin: s.skin_id || 1,

        active_tarot_ids: activeTarotIds,
        tarot_cards: tarotCards,
        tarot_runtime: buildTarotRuntime(activeTarotIds),
        used_tarot_this_turn: false
      };
    })
  );

  gameStates[room_id] = {
    room_id,
    players: gamePlayers,
    current_turn_index: 0,
    phase: "IDLE",
    turn_number: 1,
    bet_ecoin,
    build_cost: bet_ecoin * 5,
    cellStates: {},
    _buildTimer: null,
  };

  return gameStates[room_id];
}

function getCurrentTurnPlayer(room_id) {
  const gs = gameStates[room_id];
  return gs ? gs.players[gs.current_turn_index] : null;
}

function resetTurnTarotFlags(player) {
  player.used_tarot_this_turn = false;
  Object.values(player.tarot_runtime || {}).forEach(rt => {
    rt.used_this_turn = false;
    if ((rt.cooldown_turns_left ?? 0) > 0) {
      rt.cooldown_turns_left -= 1;
    }
  });
}

// Tick protected_turns cho tất cả cellStates mỗi lượt
function tickProtectedCells(room_id) {
  const gs = gameStates[room_id];
  if (!gs) return;
  const expired = [];
  Object.entries(gs.cellStates).forEach(([idx, cell]) => {
    if ((cell.protected_turns || 0) > 0) {
      cell.protected_turns -= 1;
      if (cell.protected_turns <= 0) {
        delete cell.protected_turns;
        delete cell.protected_by;
        expired.push(Number(idx));
      }
    }
  });
  if (expired.length > 0) {
    io.to(`game_${room_id}`).emit('game:skill_event', {
      type: 'protect_expired', cell_indexes: expired
    });
  }
}

// ── TAX BOOST — tăng thuế ngẫu nhiên sau mỗi vòng ──────────────
const TAX_BOOST_DURATION = 5; // số lượt tung xúc sắc tồn tại

// Giảm đếm ngược boost mỗi lượt, reset ô hết hạn và trigger boost mới nếu cần
function tickTaxBoost(room_id) {
  const gs = gameStates[room_id];
  if (!gs) return;

  const expiredCells = [];
  Object.entries(gs.cellStates).forEach(([idx, cell]) => {
    if (cell._boost_turns_left > 0) {
      cell._boost_turns_left -= 1;
      if (cell._boost_turns_left <= 0) {
        cell.rent_multiplier = 1;
        delete cell._boost_turns_left;
        expiredCells.push(Number(idx));
      }
    }
  });

  if (expiredCells.length > 0) {
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:tax_reset", {
      cell_indexes: expiredCells
    });
    // Trigger boost mới ngay sau khi reset
    setTimeout(() => triggerTaxBoost(room_id), 400);
  }
}

function triggerTaxBoost(room_id) {
  const gs = gameStates[room_id];
  if (!gs) return;

  // Chỉ random ô chưa đang boost
  const ownedCells = Object.entries(gs.cellStates)
    .filter(([, c]) => !c._boost_turns_left || c._boost_turns_left <= 0);
  if (ownedCells.length === 0) return;

  // Ưu tiên ô cùng chủ gần nhau (±3)
  const ownerGroups = {};
  ownedCells.forEach(([idx, cell]) => {
    const uid = cell.owner_user_id;
    if (!ownerGroups[uid]) ownerGroups[uid] = [];
    ownerGroups[uid].push(Number(idx));
  });

  const candidates = [];
  Object.values(ownerGroups).forEach(indexes => {
    indexes.forEach(idx => {
      const hasNeighbor = indexes.some(o => o !== idx && Math.abs(o - idx) <= 3);
      candidates.push({ idx, priority: hasNeighbor ? 2 : 1 });
    });
  });
  candidates.sort((a, b) => b.priority - a.priority || Math.random() - 0.5);

  const boostCount = Math.min(candidates.length, Math.floor(Math.random() * 2) + 1); // 1-2 ô
  const multipliers = [1.2, 1.3, 1.4, 1.5, 1.6, 1.8];
  const boostDetails = candidates.slice(0, boostCount).map(({ idx }) => {
    const mult = multipliers[Math.floor(Math.random() * multipliers.length)];
    const cell = gs.cellStates[idx];
    cell.rent_multiplier = mult;
    cell._boost_turns_left = TAX_BOOST_DURATION;
    return { cell_index: idx, multiplier: mult };
  });

  if (boostDetails.length > 0) {
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:tax_boost", {
      boosts: boostDetails
    });
  }
}

function endTurn(room_id) {
  const gs = gameStates[room_id];
  if (!gs) return;
  if (gs._buildTimer) {
    clearTimeout(gs._buildTimer);
    gs._buildTimer = null;
  }

  // Xúc Xắc Ma Thuật: giữ lại lượt hiện tại
  const curPlayer = getCurrentTurnPlayer(room_id);
  if (curPlayer?.extra_roll_queued) {
    curPlayer.extra_roll_queued = false;
    gs.phase = "IDLE";
    const now = Date.now();
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:turn_changed", {
      current_turn: curPlayer.socket_id,
      socket_id: curPlayer.socket_id,
      current_turn_user_id: curPlayer.user_id,
      user_id: curPlayer.user_id,
      name: curPlayer.name,
      turn_order: curPlayer.turn_order,
      planet_color: curPlayer.planet_color,
      turn_number: gs.turn_number,
      must_answer: false,
      server_now_ms: now,
      is_extra_turn: true
    });
    emitTarotState(room_id);
    return;
  }

  gs.phase = "IDLE";

  let next = null;
  let safe = 0;

  while (safe < gs.players.length + 2) {
    gs.current_turn_index = (gs.current_turn_index + 1) % gs.players.length;
    gs.turn_number += 1;

    next = getCurrentTurnPlayer(room_id);
    if (!next) return;

    resetTurnTarotFlags(next);
    tickProtectedCells(room_id);

    if ((next.skip_next_turn || 0) > 0) {
      next.skip_next_turn -= 1;

      io.to(`game_${room_id}`).emit("game:skill_event", {
        type: "skip_turn_applied",
        user_id: next.user_id,
        name: next.name
      });

      emitTarotState(room_id, next.user_id);
      safe++;
      continue;
    }

    break;
  }

  if (!next) return;

  const now = Date.now();
  io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:turn_changed", {
    current_turn: next.socket_id,
    socket_id: next.socket_id,
    current_turn_user_id: next.user_id,
    user_id: next.user_id,
    name: next.name,
    turn_order: next.turn_order,
    planet_color: next.planet_color,
    turn_number: gs.turn_number,
    must_answer: !!next.must_answer_next,
    server_now_ms: now
  });

  // Tick boost mỗi lượt (giảm đếm ngược, reset hết hạn, trigger mới nếu cần)
  tickTaxBoost(room_id);

  // Trigger boost lần đầu sau lượt thứ players*2 (đủ thời gian có tinh cầu)
  const firstBoostTurn = gs.players.length * 2;
  if (gs.turn_number === firstBoostTurn) {
    setTimeout(() => triggerTaxBoost(room_id), 600);
  }

  // Nếu người chơi phải trả lời câu hỏi từ lượt trước, gửi quiz ngay
  if (next.must_answer_next) {
    next.must_answer_next = false; // reset trước để không lặp
    gs.phase = "QUIZ";

    const nextSocket = io.sockets.sockets.get(next.socket_id);
    if (!nextSocket) {
      gs.phase = "IDLE";
      setTimeout(() => endTurn(room_id), 500);
    } else {
      questionsService.getRandomQuestion()
        .then((result) => {
          if (!result.success || !result.question) {
            gs.phase = "IDLE";
            setTimeout(() => endTurn(room_id), 500);
            return;
          }
          const question = result.question;
          const safeQuestion = {
            id: question.id,
            question: question.question,
            A: question.A, B: question.B, C: question.C, D: question.D
          };
          gs.currentQuiz = {
            user_id: next.user_id,
            question: { ...safeQuestion, correct: question.correct }
          };
          nextSocket.emit("game:quiz_prompt", {
            cell_index: 18,
            question: safeQuestion
          });
          if (gs._quizTimer) clearTimeout(gs._quizTimer);
          gs._quizTimer = setTimeout(() => {
            if (gs.phase !== "QUIZ") return;
            next.wrong_quiz_count = (next.wrong_quiz_count || 0) + 1;
            const lockedOut = next.wrong_quiz_count >= 2;
            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:quiz_result", {
              user_id: next.user_id,
              correct: false,
              answer: null,
              timed_out: true,
              locked_out: lockedOut
            });
            if (lockedOut) {
              next.index = 0;
              next.wrong_quiz_count = 0;
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:player_teleported", {
                user_id: next.user_id, name: next.name, dest_index: 0, reason: "Hết giờ 2 lần liên tiếp"
              });
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("playerMoved", {
                id: next.socket_id, index: 0, characterName: next.name, skin: next.skin || 1
              });
            } else {
              next.must_answer_next = true;
            }
            gs.currentQuiz = null;
            gs._quizTimer = null;
            gs.phase = "IDLE";
            setTimeout(() => endTurn(room_id), 800);
          }, 15000);
        })
        .catch(() => {
          gs.phase = "IDLE";
          setTimeout(() => endTurn(room_id), 500);
        });
    }
  }

  emitTarotState(room_id);
}

// ===== HELPERS =====
function findFreeSlot(existingSockets) {
  const used = existingSockets.map(s => s.slot_index).filter(v => typeof v === "number");
  let slot = 0;
  while (used.includes(slot)) slot++;
  return slot;
}

function buildPlayerList(sockets, host_user_id) {
  return sockets.map(s => ({
    socket_id: s.id, user_id: s.user_id,
    name: s.player_name || "Player", character_name: s.character_name || "Unknown",
    skin_id: s.skin_id || 1, is_host: s.user_id === host_user_id,
    is_ready: s.is_ready || false,
    slot_index: typeof s.slot_index === "number" ? s.slot_index : 0,
    active_bg_id: s.active_bg_id || null,
    active_bg_path: s.active_bg_path || null,
  }));
}

function getMinPlayers(match_mode) {
  return match_mode === "team_2v2" ? 4 : 2;
}

async function checkAllReady(room_id) {
  try {
    const room = await roomRepo.getRoomById(room_id);
    if (!room) return;
    const sockets  = await io.in(`room_${room_id}`).fetchSockets();
    const minP     = getMinPlayers(room.match_mode);
    const nonHost  = sockets.filter(s => s.user_id !== room.host_user_id);
    const hostSock = sockets.find(s => s.user_id === room.host_user_id);
    if (!hostSock) return;
    const totalPlayers  = sockets.length;
    const hasMinPlayers = totalPlayers >= minP;
    const allReady      = nonHost.length > 0 && nonHost.every(s => s.is_ready === true);
    io.to(hostSock.id).emit("room:all_ready_status", {
      all_ready: hasMinPlayers && allReady,
      ready_count: nonHost.filter(s => s.is_ready).length,
      total: nonHost.length, total_players: totalPlayers,
      min_players: minP, has_min: hasMinPlayers,
    });
  } catch (err) { console.error("checkAllReady error:", err); }
}

async function handleLeaveRoom(socket) {
  const room_id = socket.current_room_id;
  if (!room_id) return;
  socket.leave(`room_${room_id}`);
  socket.current_room_id = null;
  try {
    const room = await roomRepo.getRoomById(room_id);
    if (!room) return;
    if (room.room_status === "playing") return;
    if (room.host_user_id === socket.user_id) {
      await roomRepo.deleteRoom(room_id);
      io.to(`room_${room_id}`).emit("room:closed", { message: "Chủ phòng đã rời, phòng bị đóng" });
      const rem = await io.in(`room_${room_id}`).fetchSockets();
      rem.forEach(s => { s.leave(`room_${room_id}`); s.current_room_id = null; });
    } else {
      const rem = await io.in(`room_${room_id}`).fetchSockets();
      await roomRepo.updateCurrentPlayers(room_id, Math.max(rem.length, 0));
      io.to(`room_${room_id}`).emit("room:player_left", {
        socket_id: socket.id, user_id: socket.user_id, slot_index: socket.slot_index,
      });
      await checkAllReady(room_id);
    }
  } catch (err) { console.error("handleLeaveRoom error:", err); }
}

function emitGameStateSync(room_id) {
  const gs = gameStates[room_id];
  if (!gs) return;

  const payload = {
    room_id,
    server_now_ms: Date.now(),
    phase: gs.phase,
    current_turn_user_id: gs.players?.[gs.current_turn_index]?.user_id ?? null,
    players: (gs.players || []).map(p => ({
      user_id: p.user_id,
      socket_id: p.socket_id,
      name: p.name,
      index: p.index || 0,
      cash: p.cash || 0,
      planet_color: p.planet_color,
      active_tarot_ids: p.active_tarot_ids || [],
      used_tarot_this_turn: !!p.used_tarot_this_turn,
      has_extra_roll: !!p.has_extra_roll,
      skip_next_turn: Number(p.skip_next_turn || 0),
      tax_multiplier_active: !!p.tax_multiplier_active,
      tax_multiplier_value: Number(p.tax_multiplier_value || 0),
      tax_multiplier_charges: Number(p.tax_multiplier_charges || 0),
      recover_house_money_charges: Number(p.recover_house_money_charges || 0)
    })),
    cellStates: gs.cellStates || {}
  };

  console.log('[emitGameStateSync] cellStates gửi đi:', JSON.stringify(payload.cellStates));
  io.to(`game_${room_id}`).emit("game:state_sync", payload);
}

// ===== SOCKET EVENTS =====
io.on("connection", (socket) => {
  console.log(`\n✅ Connected: ${socket.id} | user_id: ${socket.user_id}`);

  // ── BOARD GAME join ───────────────────────────────────────────────
  socket.on("join", async (data) => {
    try {
      const user_id = socket.user_id;
      const room_id = data.room_id;
      let assignedColor = null;

      // Nếu người chơi đã có trong gameState thì cập nhật lại socket mới
      if (room_id && gameStates[room_id]) {
        const p = gameStates[room_id].players.find((p) => p.user_id === user_id);
        if (p) {
          p.socket_id = socket.id;
          p.is_connected = true;
          assignedColor = p.planet_color;
          console.log(`🔄 Updated socket_id & color for User ${user_id}`);
        }
      }

      const user = await userService.getUserById(user_id);
      if (!user) return;

      const chars = await characterService.getCharactersByUser(user_id);
      const activeChar = chars.find((c) => c.id === user.active_character_id);

      let activeTarotIds = user?.active_tarot_ids ?? [];
      if (typeof activeTarotIds === "string") {
        try {
          activeTarotIds = JSON.parse(activeTarotIds);
        } catch {
          activeTarotIds = [];
        }
      }
      if (!Array.isArray(activeTarotIds)) activeTarotIds = [];

      const pd = {
        id: socket.id,
        user_id,
        name: data?.name || user.name || "Player",
        characterName: (data?.characterName || activeChar?.name || "Dark_Oracle").replace(/ /g, "_"),
        skin: Number(data?.skin) || activeChar?.active_skin_number || 1,
        index: 0,
        planet_color: assignedColor,
        active_tarot_ids: activeTarotIds
      };

      players[socket.id] = pd;

      if (room_id) {
        socket.join(`room:${room_id}`);
      }

      socket.emit("currentPlayers", players);
      socket.broadcast.emit("newPlayer", pd);

    } catch (err) {
      console.error("JOIN ERROR:", err);
    }
  });

  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].index = data.index;
    io.emit("playerMoved", { id: socket.id, index: data.index, ...players[socket.id] });
  });

  socket.on("rollDice", (data) => {
    io.emit("playerRolled", { id: socket.id, diceValue: data.diceValue, ...players[socket.id] });
  });

  // ── ROOM JOIN ────────────────────────────────────────────────────
  socket.on("room:join", async (data) => {
    try {
      const room_id = Number(data?.room_id ?? data?.id);
      const user_id = socket.user_id;
      if (!room_id || isNaN(room_id)) {
        socket.emit("room:error", { message: `room_id không hợp lệ: ${JSON.stringify(data)}` }); return;
      }
      const room = await roomRepo.getRoomById(room_id);
      if (!room) { socket.emit("room:error", { message: "Phòng không tồn tại" }); return; }
      if (room.room_status !== "waiting") { socket.emit("room:error", { message: "Phòng đã bắt đầu" }); return; }

      // ── Kiểm tra mật khẩu phòng nội bộ ──────────────────────────
      if (Number(room.is_private) === 1 && room.host_user_id !== user_id) {
        const enteredPw = String(data?.password ?? "").trim();
        const correctPw = String(room.room_password ?? "").trim();
        console.log(`🔒 Room ${room_id} password check: entered="${enteredPw}" correct="${correctPw}" match=${enteredPw === correctPw}`);
        if (!enteredPw || enteredPw !== correctPw) {
          socket.emit("room:error", { message: "Sai mật khẩu phòng" }); return;
        }
      }

      const before = await io.in(`room_${room_id}`).fetchSockets();
      if (before.some(s => s.id === socket.id)) {
        socket.emit("room:players", { players: buildPlayerList(before, room.host_user_id), room }); return;
      }
      if (before.length >= room.max_players) {
        socket.emit("room:error", { message: "Phòng đã đầy người chơi" }); return;
      }

      const user = await userService.getUserById(user_id);
      if (!user) return;
      let characterName = "Unknown", skinId = 1, activeBgId = null, activeBgPath = null;
      try {
        const chars = await characterService.getCharactersByUser(user_id);
        const ac    = chars.find(c => c.id === user.active_character_id) || chars[0];
        if (ac) { characterName = ac.name || ac.character_name || "Unknown"; skinId = ac.active_skin_number || 1; }
      } catch(e) { console.error("Error matching chars", e); }

      // Lấy active background
      try {
        if (user.active_bg_id) {
          const [bgRows] = await db.query(
            "SELECT id, image_path FROM backgrounds WHERE id = ?",
            [user.active_bg_id]
          );
          if (bgRows[0]) { activeBgId = bgRows[0].id; activeBgPath = bgRows[0].image_path; }
        }
      } catch(e) { console.error("Error fetching bg", e); }

      const isHost = room.host_user_id === user_id;
      const mySlot = findFreeSlot(before);
      socket.player_name = user.username || user.name || "Player";
      socket.character_name = characterName; socket.skin_id = skinId;
      socket.active_bg_id = activeBgId; socket.active_bg_path = activeBgPath;
      socket.is_ready = false; socket.slot_index = mySlot; socket.current_room_id = room_id;
      socket.join(`room_${room_id}`);
      await roomRepo.updateCurrentPlayers(room_id, before.length + 1);

      const allPlayers = [
        ...buildPlayerList(before, room.host_user_id),
        { socket_id: socket.id, user_id, name: socket.player_name, character_name: characterName,
          skin_id: skinId, is_host: isHost, is_ready: false, slot_index: mySlot,
          active_bg_id: activeBgId, active_bg_path: activeBgPath }
      ];
      socket.emit("room:players", { players: allPlayers, room });
      socket.to(`room_${room_id}`).emit("room:player_joined", {
        socket_id: socket.id, user_id, name: socket.player_name,
        character_name: characterName, skin_id: skinId, is_host: isHost, is_ready: false, slot_index: mySlot,
        active_bg_id: activeBgId, active_bg_path: activeBgPath,
      });
    } catch (err) { console.error("room:join error:", err); }
  });

  socket.on("room:ready", async (data) => {
    const room_id = socket.current_room_id; if (!room_id) return;
    socket.is_ready = data.is_ready;
    io.to(`room_${room_id}`).emit("room:player_ready", { socket_id: socket.id, user_id: socket.user_id, is_ready: data.is_ready });
    await checkAllReady(room_id);
  });

  socket.on("room:swap_slot", async (data) => {
    const room_id = socket.current_room_id; if (!room_id) return;
    const { target_slot } = data;
    const sockets = await io.in(`room_${room_id}`).fetchSockets();
    const tgtSock = sockets.find(s => s.slot_index === target_slot);
    const myOld   = socket.slot_index;
    if (tgtSock && tgtSock.id !== socket.id) {
      io.to(tgtSock.id).emit("room:swap_request", { from_socket_id: socket.id, from_name: socket.player_name, from_slot: myOld, target_slot });
      socket.emit("room:swap_pending", { target_socket_id: tgtSock.id, target_name: tgtSock.player_name });
    } else if (!tgtSock) {
      socket.slot_index = target_slot;
      io.to(`room_${room_id}`).emit("room:slots_swapped", { socket_id_a: socket.id, slot_a: target_slot, socket_id_b: null, slot_b: myOld });
    }
  });

  socket.on("room:swap_response", async (data) => {
    const room_id = socket.current_room_id; if (!room_id) return;
    const { from_socket_id, accepted } = data;
    const sockets  = await io.in(`room_${room_id}`).fetchSockets();
    const fromSock = sockets.find(s => s.id === from_socket_id); if (!fromSock) return;
    if (accepted) {
      const slotA = fromSock.slot_index, slotB = socket.slot_index;
      fromSock.slot_index = slotB; socket.slot_index = slotA;
      io.to(`room_${room_id}`).emit("room:slots_swapped", { socket_id_a: fromSock.id, slot_a: slotB, socket_id_b: socket.id, slot_b: slotA });
    } else {
      io.to(fromSock.id).emit("room:swap_declined", { by_name: socket.player_name });
    }
  });

  socket.on("room:update_character", async (data) => {
    const room_id = socket.current_room_id; if (!room_id) return;
    const room = await roomRepo.getRoomById(room_id); if (!room) return;
    socket.character_name = data.character_name;
    socket.skin_id = data.skin_id;

    // Build the full player list and emit it to everyone
    const sockets = await io.in(`room_${room_id}`).fetchSockets();
    const allPlayers = buildPlayerList(sockets, room.host_user_id);
    io.to(`room_${room_id}`).emit("room:players", { players: allPlayers, room });
  });

  // ── START GAME ───────────────────────────────────────────────────
  socket.on("room:start", async () => {
    const room_id = socket.current_room_id; if (!room_id) return;
    try {
      const room = await roomRepo.getRoomById(room_id);
      if (!room) return;
      if (room.host_user_id !== socket.user_id) { socket.emit("room:error", { message: "Chỉ chủ phòng mới có thể bắt đầu" }); return; }
      const sockets = await io.in(`room_${room_id}`).fetchSockets();
      const nonHost = sockets.filter(s => s.user_id !== room.host_user_id);
      const minP    = getMinPlayers(room.match_mode);
      if (sockets.length < minP) {
        socket.emit("room:error", { message: room.match_mode === "team_2v2" ? `Team 2v2 cần đủ 4 người!` : `Cần ít nhất 2 người để bắt đầu!` }); return;
      }
      if (nonHost.length > 0 && !nonHost.every(s => s.is_ready)) { socket.emit("room:error", { message: "Vẫn còn người chưa sẵn sàng!" }); return; }

      await roomRepo.updateRoomStatus(room_id, "playing");
      const bet_ecoin = Number(room.bet_ecoin) || 5000;
      const gs        = await initGameState(room_id, sockets, bet_ecoin);
      const first     = getCurrentTurnPlayer(room_id);
      console.log(`🎮 Game init room ${room_id}, bet=${bet_ecoin}, buildCost=${gs.build_cost}`);

      io.to(`room_${room_id}`).emit("room:starting", { countdown: 3, room_id });
      sockets.forEach(s => { s.join(`game_${room_id}`); s.game_room_id = room_id; });

      setTimeout(() => {
        io.to(`game_${room_id}`).emit("game:init", {
          players: gs.players, current_turn: first.socket_id,
          current_turn_user_id: first.user_id, turn_number: 1,
          room_id, build_cost: gs.build_cost, bet_ecoin,
        });
      }, 3700);
    } catch (err) { console.error("room:start error:", err); }
  });

  // ── REQUEST STATE ────────────────────────────────────────────────
  socket.on("game:request_state", async (data) => {
    const room_id = Number(data?.room_id);
    if (!room_id) return;

    const gs = gameStates[room_id];
    if (!gs) {
      socket.emit("game:error", { message: "Game state chưa sẵn sàng, thử lại sau" });
      return;
    }

    socket.join(`game_${room_id}`);
    socket.game_room_id = room_id;

    const p = gs.players.find(p => p.user_id === socket.user_id);
    if (p) p.socket_id = socket.id;

    const cur = getCurrentTurnPlayer(room_id);

    socket.emit("game:init", {
      players: gs.players,
      current_turn: cur.socket_id,
      current_turn_user_id: cur.user_id,
      turn_number: gs.turn_number,
      room_id,
      build_cost: gs.build_cost,
      bet_ecoin: gs.bet_ecoin,
      cellStates: gs.cellStates,
      server_now_ms: Date.now()
    });

    emitTarotState(room_id);
  });

socket.on("game:use_tarot", async ({ room_id, tarot_id, target_user_id = null, target_cell_index = null, my_cell_index = null }) => {
  try {
    const gs = gameStates[room_id];
    if (!gs) return socket.emit("game:tarot_denied", { message: "Không tìm thấy game" });

    const cur = getCurrentTurnPlayer(room_id);
    if (!cur || Number(cur.user_id) !== Number(socket.user_id)) {
      return socket.emit("game:tarot_denied", { message: "Chưa tới lượt của bạn" });
    }

    if (gs.phase !== "IDLE") {
      return socket.emit("game:tarot_denied", { message: "Chỉ được dùng thẻ trước khi tung xúc xắc" });
    }

    if (cur.used_tarot_this_turn) {
      return socket.emit("game:tarot_denied", { message: "Mỗi lượt chỉ dùng được 1 thẻ" });
    }

    const tarotIdNum = Number(tarot_id);
    const runtime = cur.tarot_runtime?.[tarotIdNum];
    if (!runtime) {
      return socket.emit("game:tarot_denied", { message: "Bạn không sở hữu lá này" });
    }

    const now = Date.now();
    if (Number(runtime.next_available_at || 0) > now) {
      return socket.emit("game:tarot_denied", {
        message: "Thẻ đang hồi chiêu",
        remaining_seconds: Math.ceil((runtime.next_available_at - now) / 1000)
      });
    }

    const tarotDef = await getTarotByIdSafe(tarotIdNum);
    if (!tarotDef) {
      return socket.emit("game:tarot_denied", { message: "Không tìm thấy dữ liệu thẻ" });
    }

    const ok = await applyTarotEffect(gs, cur, tarotDef, {
      target_user_id,
      target_cell_index,
      my_cell_index
    });

    if (!ok) return;

    cur.used_tarot_this_turn = true;
    runtime.used_this_turn = true;
    runtime.last_used_at = now;
    runtime.last_used_turn = gs.turn_number;
    runtime.next_available_at = now + Number(tarotDef.cooldown_seconds || 0) * 1000;
    // Cooldown theo lượt (song song với cooldown_seconds)
    runtime.cooldown_turns_left = Number(tarotDef.cooldown_turns ?? 0);

    io.to(`game_${room_id}`).emit("game:tarot_used", {
      room_id,
      user_id: cur.user_id,
      name: cur.name,
      tarot_id: tarotIdNum,
      tarot_name: tarotDef.name,
      effect_type: tarotDef.effect_type
    });

    emitTarotState(room_id);
    setTimeout(() => emitGameStateSync(room_id), 700);
  } catch (err) {
    console.error("game:use_tarot error:", err);
    socket.emit("game:tarot_denied", { message: "Lỗi server khi dùng thẻ" });
  }
});

  // ── GAME ROLL ────────────────────────────────────────────────────
  socket.on("game:roll", ({ room_id }) => {
    const gs = gameStates[room_id];
    if (!gs) return socket.emit("game:error", { message: "Không tìm thấy game" });
    if (gs.phase !== "IDLE") return socket.emit("game:error", { message: "Đang xử lý, chờ tí" });
    const cur = getCurrentTurnPlayer(room_id);
    if (!cur || cur.user_id !== socket.user_id) return socket.emit("game:error", { message: "Chưa tới lượt của bạn!" });

    gs.phase = "ROLLING";
    const dice = Math.floor(Math.random() * 6) + 1;
    console.log(`🎲 ${cur.name} rolled ${dice} in room ${room_id}`);
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:dice_result", {
      room_id, socket_id: socket.id, user_id: socket.user_id, name: cur.name, dice,
    });
  });

  // ── GAME MOVE DONE ───────────────────────────────────────────────
  socket.on("game:move_done", ({ room_id, cell_index }) => {
    const gs = gameStates[room_id];
    if (!gs) {
      console.warn("❌ game:move_done nhưng không thấy gameState:", room_id);
      return;
    }

    const cur = getCurrentTurnPlayer(room_id);
    if (!cur) {
      console.warn("❌ game:move_done nhưng không có current turn player:", room_id);
      return;
    }

    if (cur.user_id !== socket.user_id) {
      console.warn("❌ game:move_done sai người chơi:", {
        room_id,
        from_user: socket.user_id,
        current_user: cur.user_id
      });
      return;
    }

    // Đừng chặn cứng vì phase, chỉ log để debug
    if (gs.phase !== "MOVING") {
      console.warn("⚠ game:move_done khi phase không phải MOVING:", gs.phase);
    }

    gs.phase = "RESOLVING";

    // Nếu người chơi bị cấm tung lượt kế, áp dụng ngay
    if (cur.no_roll_next) {
      cur.no_roll_next = false;
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:error", { message: "Bạn bị trượt lượt do trả lời sai trước đó." });
      setTimeout(() => endTurn(room_id), 600);
      return;
    }

    const idx = Number(cell_index);
    const cell = gs.cellStates[idx];

    console.log("📍 move_done:", {
      room_id,
      idx,
      phase: gs.phase,
      currentPlayer: cur.name,
      hasCellOwner: !!cell,
      isSkill: SKILL_CELLS.includes(idx)
    });

    // Tính toán đi qua START
    const prevIdx = typeof cur.index === 'number' ? cur.index : 0;
    const didPassStart = prevIdx > idx || idx === 0;
    cur.index = idx;

    if (didPassStart) {
      const bonus = Math.floor(gs.bet_ecoin * 4);
      cur.cash = (cur.cash || 0) + bonus;

      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:start_bonus", {
        user_id: cur.user_id,
        name: cur.name,
        bonus,
        passed: prevIdx !== idx
      });

      if (idx === 0) {
        setTimeout(() => endTurn(room_id), 900);
        return;
      }
    }

    // START / skill
    if (SKILL_CELLS.includes(idx)) {
      // Ô 9: cơ hội random
      if (idx === 9) {
        const skills = [
          { type: "move_plus_1", label: "Tiến thêm 1 ô" },
          { type: "move_plus_2", label: "Tiến thêm 2 ô" },
          { type: "move_plus_3", label: "Tiến thêm 3 ô" },
          { type: "teleport_safe_cell", label: "Đến ô an toàn gần nhất" },
          { type: "go_to_teacher", label: "Di chuyển tới ô Thầy giáo" },
          { type: "go_to_monster", label: "Di chuyển tới ô Quái vật" },
          { type: "extra_roll", label: "Nhận thêm 1 lượt tung" },
          { type: "bonus_money", label: "Nhận tiền thưởng" },
          { type: "buff_random_cell", label: "Tăng giá trị 1 ô đất ngẫu nhiên" },
          { type: "free_rent", label: "Miễn trả tiền thuê 1 lượt" },
          { type: "downgrade_enemy_cell", label: "Giảm giá trị 1 ô đất đối thủ" },
          { type: "send_enemy_back", label: "Đẩy đối thủ lùi 2 ô" },
        ];

        const picked = skills[Math.floor(Math.random() * skills.length)];

        // Move steps
        if (picked.type === "move_plus_1" || picked.type === "move_plus_2" || picked.type === "move_plus_3") {
          let steps = 1;
          if (picked.type === "move_plus_2") steps = 2;
          if (picked.type === "move_plus_3") steps = 3;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: picked.type,
            user_id: cur.user_id,
            name: cur.name,
            step: steps
          });
          // không end turn, chờ client gửi move_done tiếp
          return;
        }

        // Extra roll
        if (picked.type === "extra_roll") {
          gs.phase = "IDLE";
          cur.has_extra_roll = true;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: "extra_roll",
            user_id: cur.user_id,
            name: cur.name
          });
          // giữ nguyên lượt hiện tại
          return;
        }

        // Free rent
        if (picked.type === "free_rent") {
          cur.free_rent_turns = (cur.free_rent_turns || 0) + 1;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: "free_rent",
            user_id: cur.user_id,
            name: cur.name
          });
          setTimeout(() => endTurn(room_id), 900);
          return;
        }

        // Bonus money
        if (picked.type === "bonus_money") {
          const bonus = Math.floor(gs.bet_ecoin * 2);
          cur.cash = (cur.cash || 0) + bonus;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: "bonus_money",
            user_id: cur.user_id,
            name: cur.name,
            amount: bonus
          });
          setTimeout(() => endTurn(room_id), 900);
          return;
        }

        // Buff random cell
        if (picked.type === "buff_random_cell") {
          const ownedCells = Object.entries(gs.cellStates)
            .filter(([_, c]) => c.owner_user_id === cur.user_id);
          if (ownedCells.length > 0) {
            const [buffIdx, buffCell] = ownedCells[Math.floor(Math.random() * ownedCells.length)];
            buffCell.build_cost = Math.floor((buffCell.build_cost || gs.build_cost) * 1.2);
            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
              type: "buff_random_cell",
              user_id: cur.user_id,
              name: cur.name,
              cell_index: Number(buffIdx),
              new_cost: buffCell.build_cost
            });
          }
          setTimeout(() => endTurn(room_id), 1200);
          return;
        }

        // Teleport safe cell — dùng TOTAL_CELLS thay vì gs.boardPath
        if (picked.type === "teleport_safe_cell") {
          const safeCells = [];
          for (let i = 0; i < TOTAL_CELLS; i++) {
            if (!SKILL_CELLS.includes(i) && !gs.cellStates[i]) safeCells.push(i);
          }
          if (safeCells.length > 0) {
            const destIndex = safeCells[Math.floor(Math.random() * safeCells.length)];
            cur.index = destIndex;
            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
              type: "teleport_safe_cell",
              user_id: cur.user_id,
              name: cur.name,
              dest_index: destIndex
            });
            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("playerMoved", {
              id: cur.socket_id,
              index: destIndex,
              characterName: cur.name,
              skin: cur.skin || 1
            });
          }
          setTimeout(() => endTurn(room_id), 1200);
          return;
        }

        // Go to teacher (cell 18) — đi bộ từng bước
        if (picked.type === "go_to_teacher") {
          const targetIndex = 18;
          const steps = (targetIndex - cur.index + TOTAL_CELLS) % TOTAL_CELLS || TOTAL_CELLS;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: "walk_to_cell",
            user_id: cur.user_id,
            name: cur.name,
            steps,
            dest_index: targetIndex
          });
          // không end turn, chờ client gửi move_done sau khi đi xong
          return;
        }

        // Go to monster (cell 28) — đi bộ từng bước
        if (picked.type === "go_to_monster") {
          const targetIndex = 28;
          const steps = (targetIndex - cur.index + TOTAL_CELLS) % TOTAL_CELLS || TOTAL_CELLS;
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
            type: "walk_to_cell",
            user_id: cur.user_id,
            name: cur.name,
            steps,
            dest_index: targetIndex
          });
          // không end turn, chờ client gửi move_done sau khi đi xong
          return;
        }

        // Downgrade enemy cell
        if (picked.type === "downgrade_enemy_cell") {
          const enemies = gs.players.filter(p => p.user_id !== cur.user_id);
          if (enemies.length > 0) {
            const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            const enemyCells = Object.entries(gs.cellStates).filter(([_, c]) => c.owner_user_id === targetEnemy.user_id);
            if (enemyCells.length > 0) {
              const [cellIdx, cellData] = enemyCells[Math.floor(Math.random() * enemyCells.length)];
              cellData.build_cost = Math.floor(cellData.build_cost * 0.8);
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
                type: "downgrade_enemy_cell",
                user_id: cur.user_id,
                name: cur.name,
                target_user_id: targetEnemy.user_id,
                target_name: targetEnemy.name,
                cell_index: Number(cellIdx),
                new_cost: cellData.build_cost
              });
            }
          }
          setTimeout(() => endTurn(room_id), 1200);
          return;
        }

        // Send enemy back
        if (picked.type === "send_enemy_back") {
          const enemies = gs.players.filter(p => p.user_id !== cur.user_id);
          if (enemies.length > 0) {
            const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            const oldIdx = targetEnemy.index;
            const newIdx = (oldIdx - 2 + TOTAL_CELLS) % TOTAL_CELLS;
            targetEnemy.index = newIdx;

            // Kiểm tra đi qua START
            const didPassStart = oldIdx <= 2 && newIdx > oldIdx;
            if (didPassStart) {
              const bonus = Math.floor(gs.bet_ecoin * 4);
              targetEnemy.cash = (targetEnemy.cash || 0) + bonus;
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:start_bonus", {
                user_id: targetEnemy.user_id,
                name: targetEnemy.name,
                bonus,
                passed: true
              });
            }

            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:skill_event", {
              type: "send_enemy_back",
              user_id: cur.user_id,
              name: cur.name,
              target_user_id: targetEnemy.user_id,
              target_name: targetEnemy.name,
              dest_index: newIdx
            });

            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("playerMoved", {
              id: targetEnemy.socket_id,
              index: newIdx,
              characterName: targetEnemy.name,
              skin: targetEnemy.skin || 1
            });
          }
          setTimeout(() => endTurn(room_id), 1200);
          return;
        }
      }

      // Ô 18: câu hỏi
      if (idx === 18) {
      gs.phase = "QUIZ";

      questionsService.getRandomQuestion()
        .then((result) => {
          if (!result.success || !result.question) {
            socket.emit("game:error", {
              message: result.message || "Không lấy được câu hỏi từ hệ thống"
            });
            gs.phase = "IDLE";
            setTimeout(() => endTurn(room_id), 500);
            return;
          }

          const question = result.question;

          const safeQuestion = {
            id: question.id,
            question: question.question,
            A: question.A,
            B: question.B,
            C: question.C,
            D: question.D
          };

          // Lưu câu hỏi vào game state để quiz_answer có thể kiểm tra
          gs.currentQuiz = {
            user_id: cur.user_id,
            question: { ...safeQuestion, correct: question.correct }
          };

          socket.emit("game:quiz_prompt", {
            cell_index: 18,
            question: safeQuestion
          });

          if (gs._quizTimer) clearTimeout(gs._quizTimer);

          gs._quizTimer = setTimeout(() => {
            if (gs.phase !== "QUIZ") return; // đã được xử lý rồi
            cur.wrong_quiz_count = (cur.wrong_quiz_count || 0) + 1;
            const lockedOut = cur.wrong_quiz_count >= 2;

            io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:quiz_result", {
              user_id: cur.user_id,
              correct: false,
              answer: null,
              timed_out: true,
              locked_out: lockedOut
            });

            if (lockedOut) {
              cur.index = 0;
              cur.wrong_quiz_count = 0;
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:player_teleported", {
                user_id: cur.user_id,
                name: cur.name,
                dest_index: 0,
                reason: "Hết giờ 2 lần liên tiếp"
              });
              io.to(`room_${room_id}`).to(`game_${room_id}`).emit("playerMoved", {
                id: cur.socket_id,
                index: 0,
                characterName: cur.name,
                skin: cur.skin || 1
              });
            } else {
              cur.must_answer_next = true;
            }

            gs.currentQuiz = null;
            gs._quizTimer = null;
            gs.phase = "IDLE";
            setTimeout(() => endTurn(room_id), 800);
          }, 15000);
        })
        .catch((err) => {
          console.error("Lỗi lấy câu hỏi từ DB:", err);
          socket.emit("game:error", {
            message: "Lỗi server khi lấy câu hỏi"
          });
          gs.phase = "IDLE";
          setTimeout(() => endTurn(room_id), 500);
        });

      return;
    }

    // Ô 28: quái vật phá 2-3 tinh cầu ngẫu nhiên
    if (idx === 28) {
      // Random 1-2 ô bất kỳ (kể cả ô trống), bỏ qua ô skill
      const candidateIndexes = [];
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (!SKILL_CELLS.includes(i)) candidateIndexes.push(i);
      }

      if (candidateIndexes.length === 0) {
        setTimeout(() => endTurn(room_id), 800);
        return;
      }

      const destroyCount = Math.min(
        candidateIndexes.length,
        Math.floor(Math.random() * 2) + 1 // 1 hoặc 2
      );

      const shuffled = [...candidateIndexes].sort(() => Math.random() - 0.5);
      const targetIndexes = shuffled.slice(0, destroyCount);

      const targetDetails = targetIndexes.map(cellIndex => ({
        cell_index: cellIndex,
        had_planet: !!gs.cellStates[cellIndex]
      }));

      // Phá hủy tinh cầu nếu có
      targetIndexes.forEach(cellIndex => {
        if (gs.cellStates[cellIndex]) delete gs.cellStates[cellIndex];
      });

      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:monster_target", {
        cell_indexes: targetIndexes,
        target_details: targetDetails
      });

      const effectDuration = 800 + targetDetails.length * 600 + 500;
      setTimeout(() => {
        targetDetails.forEach(detail => {
          io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:cell_destroyed", {
            cell_index: detail.cell_index,
            had_planet: detail.had_planet
          });
        });
        setTimeout(() => endTurn(room_id), 700);
      }, effectDuration);

      return;
    }
    }

    // Ô trống => hỏi xây
    if (!cell) {
      socket.emit("game:build_prompt", {
        cell_index: idx,
        build_cost: gs.build_cost,
        planet_color: cur.planet_color,
        time_limit: 15,
      });

      if (gs._buildTimer) {
        clearTimeout(gs._buildTimer);
        gs._buildTimer = null;
      }

      gs._buildTimer = setTimeout(() => {
        if (gs.phase === "RESOLVING") endTurn(room_id);
      }, 15500);

      return;
    }

    // Ô của mình => bỏ qua
    if (cell.owner_user_id === socket.user_id) {
      setTimeout(() => endTurn(room_id), 400);
      return;
    }

    // Ô người khác => trả tiền thuê
    const baseRent = Math.floor(gs.bet_ecoin * 3);
    const rentMultiplier = cell.rent_multiplier || 1;
    const rent = Math.floor(baseRent * rentMultiplier);
    const payer = gs.players.find(p => p.user_id === socket.user_id);
    const owner = gs.players.find(p => p.user_id === cell.owner_user_id);

    let actualRent = rent;
    if (payer && payer.free_rent_turns > 0) {
      actualRent = 0;
      payer.free_rent_turns -= 1;
    }

    // Thần Giữ Của: hoàn lại toàn bộ tiền thuê
    if (payer && payer.rent_refund_pending) {
      payer.rent_refund_pending = false;
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit('game:skill_event', {
        type: 'rent_refunded',
        user_id: payer.user_id,
        name: payer.name,
        amount: actualRent
      });
      setTimeout(() => endTurn(room_id), 1200);
      return;
    }

    // Nhận Trợ Giúp đã được xử lý ngay khi dùng thẻ (không còn pending)

    // Check if payer can afford the rent
    if (payer && (payer.cash || 0) < actualRent) {
      // Cannot afford - trigger bankruptcy resolution
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:rent_cannot_afford", {
        payer_user_id: socket.user_id,
        payer_name: payer.name,
        owner_user_id: cell.owner_user_id,
        owner_name: owner?.name || "?",
        cell_index: idx,
        required_rent: actualRent,
        current_cash: payer.cash || 0,
        planet_color: cell.planet_color,
      });
      return; // Don't end turn yet - wait for bankruptcy resolution
    }

    // Can afford - proceed with payment
    if (payer) payer.cash = (payer.cash || 0) - actualRent;
    if (owner) owner.cash = (owner.cash || 0) + actualRent;

    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:rent_paid", {
      payer_user_id: socket.user_id,
      payer_name: payer?.name || "?",
      owner_user_id: cell.owner_user_id,
      owner_name: owner?.name || "?",
      cell_index: idx,
      rent: actualRent,
      planet_color: cell.planet_color,
    });

    setTimeout(() => endTurn(room_id), 1500);
  });

  // ── GAME BUILD RESPONSE ──────────────────────────────────────────
  socket.on("game:build_response", ({ room_id, cell_index, accept }) => {
    const gs = gameStates[room_id];
    if (!gs || gs.phase !== "RESOLVING") return;

    if (gs._buildTimer) {
      clearTimeout(gs._buildTimer);
      gs._buildTimer = null;
    }

    const cur = getCurrentTurnPlayer(room_id);
    if (!cur || cur.user_id !== socket.user_id) return;

    const idx = Number(cell_index);

    if (accept) {
      if ((cur.cash || 0) < gs.build_cost) {
        socket.emit("game:error", { message: "Không đủ tiền để xây tinh cầu!" });
        setTimeout(() => endTurn(room_id), 400);
        return;
      }

      if (gs.cellStates[idx]) {
        socket.emit("game:error", { message: "Ô này đã có tinh cầu!" });
        setTimeout(() => endTurn(room_id), 400);
        return;
      }

      cur.cash -= gs.build_cost;

      gs.cellStates[idx] = {
        owner_user_id: socket.user_id,
        planet_color: cur.planet_color,   // đúng màu random ban đầu
        build_cost: gs.build_cost,
      };

      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:cell_built", {
        cell_index: idx,
        owner_user_id: socket.user_id,
        owner_name: cur.name,
        planet_color: cur.planet_color,
        build_cost: gs.build_cost,
      });
    }

    setTimeout(() => endTurn(room_id), 600);
  });

  socket.on("game:quiz_answer", ({ room_id, answer }) => {
    const gs = gameStates[room_id];
    if (!gs || gs.phase !== "QUIZ") return;
    const cur = getCurrentTurnPlayer(room_id);
    if (!cur || cur.user_id !== socket.user_id) return;

    const quizData = gs.currentQuiz;
    if (!quizData || quizData.user_id !== cur.user_id) return;

    if (gs._quizTimer) {
      clearTimeout(gs._quizTimer);
      gs._quizTimer = null;
    }

    const isCorrect = (answer === quizData.question.correct);
    if (isCorrect) {
      cur.wrong_quiz_count = 0;
      const reward = Math.floor(gs.bet_ecoin * 0.2);
      cur.cash = (cur.cash || 0) + reward;

      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:quiz_result", {
        user_id: cur.user_id,
        correct: true,
        answer,
        reward
      });

      gs.phase = "IDLE";
      gs.currentQuiz = null;
      // Giữ lượt hiện tại
      setTimeout(() => {
        io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:turn_changed", {
          current_turn: cur.socket_id,
          current_turn_user_id: cur.user_id,
          user_id: cur.user_id,
          name: cur.name,
          turn_order: cur.turn_order,
          planet_color: cur.planet_color,
          turn_number: gs.turn_number,
        });
      }, 200);
      return;
    }

    // Sai câu hỏi: bắt trả lời tiếp lượt sau (không được tung)
    cur.wrong_quiz_count = (cur.wrong_quiz_count || 0) + 1;
    const isLockedOut = cur.wrong_quiz_count >= 2;
    if (isLockedOut) {
      cur.index = 0;
      cur.must_answer_next = false;
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:player_teleported", {
        user_id: cur.user_id,
        name: cur.name,
        dest_index: 0,
        reason: "Thua 2 lần câu hỏi liên tiếp"
      });
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("playerMoved", {
        id: cur.socket_id,
        index: 0,
        characterName: cur.name,
        skin: cur.skin || 1
      });
    } else {
      cur.must_answer_next = true;
    }
    cur.no_roll_next = false; // dùng cho các tình huống khác
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:quiz_result", {
      user_id: cur.user_id,
      correct: false,
      answer,
    });

    gs.phase = "IDLE";
    gs.currentQuiz = null;
    setTimeout(() => endTurn(room_id), 800);
  });

  // ── GAME SELL AND PAY RENT (atomic, không cho âm tiền) ──────────
  socket.on("game:sell_and_pay_rent", ({ room_id, seller_user_id, buyer_user_id, cells_to_sell, total_sell_price, required_rent, cash_before }) => {
    const gs = gameStates[room_id];
    if (!gs) return;

    const seller = gs.players.find(p => p.user_id === seller_user_id);
    const buyer  = gs.players.find(p => p.user_id === buyer_user_id);
    if (!seller) return;

    // Validate: tổng tiền sau khi bán phải đủ trả
    const sellerCash = seller.cash || 0;
    const totalAvailable = sellerCash + total_sell_price;
    if (totalAvailable < required_rent) {
      // Không đủ dù bán hết — phá sản
      gs.players = gs.players.filter(p => p.user_id !== seller_user_id);
      Object.keys(gs.cellStates).forEach(ci => {
        if (gs.cellStates[ci].owner_user_id === seller_user_id) delete gs.cellStates[ci];
      });
      io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:bankruptcy", { user_id: seller_user_id });
      if (gs.players.length <= 1) {
        const winner = gs.players[0];
        if (winner) io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:game_over", {
          winner_user_id: winner.user_id, winner_name: winner.name
        });
        delete gameStates[room_id];
      } else {
        setTimeout(() => endTurn(room_id), 2000);
      }
      return;
    }

    // Xóa các ô đã bán
    const soldIndexes = [];
    cells_to_sell.forEach(({ cell_index }) => {
      delete gs.cellStates[cell_index];
      soldIndexes.push(cell_index);
    });

    // Tính tiền sau giao dịch — không âm
    const sellerCashAfter = Math.max(0, sellerCash + total_sell_price - required_rent);
    const buyerCashAfter  = (buyer?.cash || 0) + required_rent;

    seller.cash = sellerCashAfter;
    if (buyer) buyer.cash = buyerCashAfter;

    // Broadcast cho tất cả
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:cell_sold", {
      cell_indexes: soldIndexes,
      cell_index: soldIndexes[0], // backward compat
      seller_user_id,
      seller_name: seller.name,
      buyer_user_id,
      buyer_name: buyer?.name || "?",
      total_sell_price,
      rent_paid: required_rent,
      seller_cash_after: sellerCashAfter,
      buyer_cash_after: buyerCashAfter
    });

    if (gs._sellEndTimer) clearTimeout(gs._sellEndTimer);
    gs._sellEndTimer = setTimeout(() => {
      gs._sellEndTimer = null;
      endTurn(room_id);
    }, 1200);
  });

  // ── GAME CELL SOLD (BANKRUPTCY RESOLUTION) ──────────────────────
  // Client có thể gửi nhiều lần (bán nhiều ô). Tiền thuê chỉ trả 1 lần ở lần đầu tiên.
  socket.on("game:cell_sold", ({ room_id, cell_index, seller_user_id, buyer_user_id, sell_price, rent_paid }) => {
    const gs = gameStates[room_id];
    if (!gs) return;

    // Remove cell from cellStates
    delete gs.cellStates[cell_index];

    const seller = gs.players.find(p => p.user_id === seller_user_id);
    const buyer  = gs.players.find(p => p.user_id === buyer_user_id);

    // Tiền thuê chỉ trả 1 lần — dùng flag trên gs để track
    const rentKey = `_rentPaid_${seller_user_id}_${buyer_user_id}`;
    const alreadyPaidRent = !!gs[rentKey];

    if (seller) seller.cash = (seller.cash || 0) + sell_price - (alreadyPaidRent ? 0 : rent_paid);
    if (buyer)  buyer.cash  = (buyer.cash  || 0) + (alreadyPaidRent ? 0 : rent_paid);

    if (!alreadyPaidRent) gs[rentKey] = true;

    // Broadcast
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:cell_sold", {
      cell_index,
      seller_user_id,
      buyer_user_id,
      sell_price,
      rent_paid: alreadyPaidRent ? 0 : rent_paid
    });

    // Xóa flag sau 3s (đủ thời gian cho tất cả ô được bán trong 1 lượt)
    if (!alreadyPaidRent) {
      setTimeout(() => { delete gs[rentKey]; }, 3000);
    }

    // Kết thúc lượt sau khi xử lý xong
    if (gs._sellEndTimer) clearTimeout(gs._sellEndTimer);
    gs._sellEndTimer = setTimeout(() => {
      gs._sellEndTimer = null;
      endTurn(room_id);
    }, 1200);
  });

  // ── GAME BANKRUPTCY ─────────────────────────────────────────────
  socket.on("game:bankruptcy", ({ room_id, user_id }) => {
    const gs = gameStates[room_id];
    if (!gs) return;

    // Remove bankrupt player
    gs.players = gs.players.filter(p => p.user_id !== user_id);

    // Remove all cells owned by bankrupt player
    Object.keys(gs.cellStates).forEach(cellIndex => {
      if (gs.cellStates[cellIndex].owner_user_id === user_id) {
        delete gs.cellStates[cellIndex];
      }
    });

    // Broadcast bankruptcy
    io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:bankruptcy", {
      user_id
    });

    // Check if game should end (only 1 player left)
    if (gs.players.length <= 1) {
      // Game over - winner is the last player
      const winner = gs.players[0];
      if (winner) {
        io.to(`room_${room_id}`).to(`game_${room_id}`).emit("game:game_over", {
          winner_user_id: winner.user_id,
          winner_name: winner.name
        });
      }
      // Clean up game state
      delete gameStates[room_id];
      return;
    }

    // Continue with remaining players
    setTimeout(() => endTurn(room_id), 2000);
  });

  // ── LEAVE / DISCONNECT ───────────────────────────────────────────
  socket.on("room:leave", async () => { await handleLeaveRoom(socket); });
  socket.on("disconnect", async () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    await handleLeaveRoom(socket);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });



});

// ===== ROUTES =====
app.get("/",           (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.post("/register",  async (req, res) => res.json(await userService.register(req.body.username, req.body.email, req.body.password)));
app.post("/login",     async (req, res) => res.json(await userService.login(req.body.username, req.body.password)));

// Verify token — dùng để auto-login khi reload game
app.get("/auth/me", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return res.json({ success: false });
    const token = auth.slice(7);
    const decoded = jwt.verify(token, SECRET);
    const result = await userRepo.findById(decoded.id);
    if (!result) return res.json({ success: false });
    res.json({ success: true, user: result });
  } catch {
    res.json({ success: false });
  }
});
app.get("/characters", async (req, res) => {
  try { res.json(await characterService.getCharacters()); }
  catch { res.status(500).json({ success: false, message: "Server error" }); }
});
app.post("/create-character", async (req, res) => {
  try {
    const { user_id, character_id, name } = req.body;
    if (!user_id || !character_id || !name) return res.json({ success: false, message: "Thiếu dữ liệu" });
    res.json(await characterService.createCharacter(user_id, character_id, name));
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});
app.post("/rooms/create", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Thiếu token" });
    const decoded = jwt.verify(auth.split(" ")[1], SECRET);
    res.json(await roomService.createRoom({
      host_user_id: decoded.id, room_type: req.body.room_type,
      match_mode: req.body.match_mode, bet_ecoin: req.body.bet_ecoin,
      is_private: req.body.is_private, room_password: req.body.room_password,
    }));
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});
app.get("/rooms", async (req, res) => {
  try { res.json(await roomService.getVisibleRooms(req.query.room_type)); }
  catch { res.status(500).json({ success: false, message: "Server error" }); }
});

// Verify room password trước khi vào
app.post("/rooms/:id/verify-password", async (req, res) => {
  try {
    const room = await roomRepo.getRoomById(Number(req.params.id));
    if (!room) return res.json({ success: false, message: "Phòng không tồn tại" });
    if (Number(room.is_private) !== 1) return res.json({ success: true }); // không cần pass
    const entered = String(req.body.password ?? "").trim();
    const correct = String(room.room_password ?? "").trim();
    if (!entered || entered !== correct) return res.json({ success: false, message: "Bạn đã nhập sai mật khẩu" });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});

server.listen(3000, "0.0.0.0", () => {
  console.log("✅ Server ready at (tất cả interface)");
});
app.get("/tarots", async (req, res) => {
  try {
    const result = await tarotService.getAllTarots();
    res.json(result);
  } catch (err) {
    console.error("GET /tarots error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

app.get("/users/:userId/tarots/active", async (req, res) => {
  try {
    const result = await tarotService.getActiveTarot(Number(req.params.userId));
    res.json(result);
  } catch (err) {
    console.error("GET active tarots error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

app.post("/users/:userId/tarots/active", async (req, res) => {
  try {
    const result = await tarotService.saveActiveTarot(
      Number(req.params.userId),
      req.body.tarotIds
    );
    res.json(result);
  } catch (err) {
    console.error("POST active tarots error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

app.post("/users/:userId/characters/active", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const charId = Number(req.body.character_id);

    // KIỂM TRA BẢO VỆ: Nếu charId không phải là số, dừng lại ngay
    if (!charId || isNaN(charId)) {
      return res.status(400).json({ 
        success: false, 
        message: "ID nhân vật không hợp lệ (NaN)" 
      });
    }

    await characterRepo.setActiveCharacter(userId, charId);

    res.json({ success: true, message: "Đổi nhân vật thành công" });
  } catch (err) {
    console.error("POST /active error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/users/:userId/characters", async (req, res) => {
  try {
    const result = await characterService.getCharactersByUser(Number(req.params.userId));
    res.json(result);
  } catch (err) {
    console.error("GET /users/:userId/characters error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

app.get("/users/:userId/characters/:characterId/skins", async (req, res) => {
    try {
        const result = await characterService.getOwnedSkinsForBag(
            Number(req.params.userId),
            Number(req.params.characterId)
        );
        res.json(result);
    } catch (err) {
        console.error("GET skins error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/users/:userId/characters/:characterId/skin", async (req, res) => {
  try {
    await db.query(`
      UPDATE user_characters
      SET active_skin_id = ?
      WHERE user_id = ? AND character_id = ?
    `, [
      Number(req.body.skin_id),
      Number(req.params.userId),
      Number(req.params.characterId)
    ]);

    res.json({
      success: true,
      message: "Đổi trang phục thành công"
    });
  } catch (err) {
    console.error("POST /users/:userId/characters/:characterId/skin error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Route lấy nhân vật cho BagScene — dùng getOwnedCharactersForBag để có đầy đủ dữ liệu
app.get("/users/:userId/characters/bag", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const result = await characterService.getOwnedCharactersForBag(userId);
    res.json(result);
  } catch (err) {
    console.error("Lỗi API Bag:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ═══════════════════════════════════════════════════════════════
//  SHOP APIS
// ═══════════════════════════════════════════════════════════════

// Bảng giá nhân vật (có thể chuyển vào DB sau)
const CHARACTER_PRICES = {
  1: 0,       // Dark_Oracle — miễn phí (starter)
  2: 15000,   // Forest_Ranger
  3: 25000,   // Golem
  4: 25000,   // Minotaur
  5: 0,       // Necromancer_of_the_Shadow (starter)
  7: 35000,   // Reaper_Man
  8: 10000,   // Zombie_Villager
};

// Bảng giá skin
const SKIN_PRICES = {
  1: 0,        // Skin sơ cấp — miễn phí (theo nhân vật)
  2: 15000,    // Skin trung cấp
  3: 35000,    // Skin cao cấp
};

// GET /shop/characters — Tất cả nhân vật kèm giá từ DB
app.get("/shop/characters", async (req, res) => {
  try {
    const result = await characterService.getCharacters();
    const characters = (result.characters || []).map(c => ({
      ...c,
      price: Number(c.price ?? 0),
    }));
    res.json({ success: true, characters });
  } catch (err) {
    console.error("GET /shop/characters error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /shop/skins — Tất cả skin trong game (giá từ DB)
app.get("/shop/skins", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        cs.id AS skin_id,
        cs.character_id,
        cs.skin_number,
        cs.image,
        cs.is_default,
        cs.price,
        c.name AS character_name
      FROM character_skins cs
      JOIN characters c ON c.id = cs.character_id
      ORDER BY cs.character_id, cs.skin_number
    `);
    const skins = rows.map(s => ({ ...s, price: Number(s.price ?? 0) }));
    res.json({ success: true, skins });
  } catch (err) {
    console.error("GET /shop/skins error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /users/:userId/ecoin — Lấy số dư ecoin
app.get("/users/:userId/ecoin", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT ecoin FROM users WHERE id = ?", [Number(req.params.userId)]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, ecoin: Number(rows[0].ecoin || 0) });
  } catch (err) {
    console.error("GET ecoin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /shop/buy-character — Mua nhân vật (trừ ecoin)
app.post("/shop/buy-character", async (req, res) => {
  try {
    const { user_id, character_id } = req.body;
    if (!user_id || !character_id) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    const userId = Number(user_id);
    const charId = Number(character_id);

    // 1) Kiểm tra đã sở hữu chưa
    const [owned] = await db.query(
      "SELECT id FROM user_characters WHERE user_id = ? AND character_id = ?",
      [userId, charId]
    );
    if (owned.length > 0) {
      return res.json({ success: false, message: "Bạn đã sở hữu nhân vật này rồi!" });
    }

    // 2) Lấy giá từ DB
    const [charRows] = await db.query("SELECT price FROM characters WHERE id = ?", [charId]);
    if (!charRows[0]) return res.json({ success: false, message: "Nhân vật không tồn tại" });
    const price = Number(charRows[0].price ?? 0);

    // 3) Kiểm tra ecoin
    const [userRows] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    if (!userRows[0]) return res.json({ success: false, message: "User không tồn tại" });

    const currentEcoin = Number(userRows[0].ecoin || 0);
    if (currentEcoin < price) {
      return res.json({
        success: false,
        message: `Không đủ Ecoin! Cần ${price.toLocaleString()}, bạn có ${currentEcoin.toLocaleString()}`
      });
    }

    // 4) Trừ ecoin
    if (price > 0) {
      await db.query("UPDATE users SET ecoin = ecoin - ? WHERE id = ?", [price, userId]);
    }

    // 5) Thêm nhân vật vào kho
    await db.query(`
      INSERT INTO user_characters (user_id, character_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE user_id = user_id
    `, [userId, charId]);

    // 6) Thêm skin mặc định (skin_number = 1) vào kho
    const [defaultSkin] = await db.query(
      "SELECT id FROM character_skins WHERE character_id = ? AND is_default = 1",
      [charId]
    );
    if (defaultSkin[0]) {
      await db.query(`
        INSERT INTO user_skins (user_id, skin_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE user_id = user_id
      `, [userId, defaultSkin[0].id]);

      // Set active skin cho nhân vật mới
      await db.query(`
        UPDATE user_characters SET active_skin_id = ? WHERE user_id = ? AND character_id = ?
      `, [defaultSkin[0].id, userId, charId]);
    }

    // 7) Lấy ecoin mới
    const [newUser] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    const newEcoin = Number(newUser[0]?.ecoin || 0);

    res.json({
      success: true,
      message: price > 0
        ? `Mua thành công! -${price.toLocaleString()} Ecoin`
        : "Nhận nhân vật miễn phí thành công!",
      ecoin: newEcoin
    });

  } catch (err) {
    console.error("POST /shop/buy-character error:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi mua nhân vật" });
  }
});

// POST /shop/buy-skin — Mua trang phục (trừ ecoin)
app.post("/shop/buy-skin", async (req, res) => {
  try {
    const { user_id, skin_id } = req.body;
    if (!user_id || !skin_id) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    const userId = Number(user_id);
    const skinId = Number(skin_id);

    // 1) Kiểm tra đã sở hữu chưa
    const [owned] = await db.query(
      "SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?",
      [userId, skinId]
    );
    if (owned.length > 0) {
      return res.json({ success: false, message: "Bạn đã sở hữu trang phục này rồi!" });
    }

    // 2) Lấy thông tin skin
    const [skinRows] = await db.query(
      "SELECT skin_number, character_id FROM character_skins WHERE id = ?",
      [skinId]
    );
    if (!skinRows[0]) return res.json({ success: false, message: "Skin không tồn tại" });

    const skinNumber = skinRows[0].skin_number;
    const charId = skinRows[0].character_id;

    // 3) Kiểm tra có sở hữu nhân vật không
    const [ownedChar] = await db.query(
      "SELECT id FROM user_characters WHERE user_id = ? AND character_id = ?",
      [userId, charId]
    );
    if (ownedChar.length === 0) {
      return res.json({ success: false, message: "Bạn cần sở hữu nhân vật trước khi mua trang phục!" });
    }

    // 4) Lấy giá
    const price = SKIN_PRICES[skinNumber] ?? 15000;

    // 5) Kiểm tra ecoin
    const [userRows] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    const currentEcoin = Number(userRows[0]?.ecoin || 0);
    if (currentEcoin < price) {
      return res.json({
        success: false,
        message: `Không đủ Ecoin! Cần ${price.toLocaleString()}, bạn có ${currentEcoin.toLocaleString()}`
      });
    }

    // 6) Trừ ecoin
    if (price > 0) {
      await db.query("UPDATE users SET ecoin = ecoin - ? WHERE id = ?", [price, userId]);
    }

    // 7) Thêm vào kho
    await db.query(`
      INSERT INTO user_skins (user_id, skin_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE user_id = user_id
    `, [userId, skinId]);

    // 8) Lấy ecoin mới
    const [newUser] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    const newEcoin = Number(newUser[0]?.ecoin || 0);

    res.json({
      success: true,
      message: price > 0
        ? `Mua trang phục thành công! -${price.toLocaleString()} Ecoin`
        : "Nhận trang phục miễn phí!",
      ecoin: newEcoin
    });

  } catch (err) {
    console.error("POST /shop/buy-skin error:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi mua trang phục" });
  }
});

// POST /shop/add-ecoin — Thêm ecoin cho user (nạp tiền)
app.post("/shop/add-ecoin", async (req, res) => {
  try {
    const { user_id, amount } = req.body;
    if (!user_id || !amount) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    const userId = Number(user_id);
    const addAmount = Number(amount);

    if (addAmount <= 0) {
      return res.json({ success: false, message: "Số Ecoin không hợp lệ" });
    }

    await db.query("UPDATE users SET ecoin = ecoin + ? WHERE id = ?", [addAmount, userId]);

    const [newUser] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    const newEcoin = Number(newUser[0]?.ecoin || 0);

    res.json({
      success: true,
      message: `Nạp thành công +${addAmount.toLocaleString()} Ecoin!`,
      ecoin: newEcoin
    });
  } catch (err) {
    console.error("POST /shop/add-ecoin error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// GET /shop/backgrounds — Tất cả phông nền
app.get("/shop/backgrounds", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM backgrounds ORDER BY id ASC");
    const formattedRows = rows.map(r => {
      if (r.image_path) {
        const parts = r.image_path.replace(/\\/g, "/").split("/");
        r.image_path = "assets/ui/bg/" + parts[parts.length - 1];
      }
      return r;
    });
    res.json({ success: true, backgrounds: formattedRows });
  } catch (err) {
    console.error("GET /shop/backgrounds error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /shop/buy-background — Mua phông nền
app.post("/shop/buy-background", async (req, res) => {
  try {
    const { user_id, background_id } = req.body;
    if (!user_id || !background_id) return res.json({ success: false, message: "Thiếu dữ liệu" });

    const userId = Number(user_id);
    const bgId = Number(background_id);

    // Kiểm tra đã sở hữu
    const [owned] = await db.query("SELECT * FROM user_backgrounds WHERE user_id = ? AND background_id = ?", [userId, bgId]);
    if (owned.length > 0) return res.json({ success: false, message: "Bạn đã sở hữu phông nền này rồi!" });

    // Lấy thông tin phông nền
    const [bg] = await db.query("SELECT price_ecoin FROM backgrounds WHERE id = ?", [bgId]);
    if (!bg[0]) return res.json({ success: false, message: "Phông nền không tồn tại" });
    const price = Number(bg[0].price_ecoin || 0);

    // Kiểm tra ecoin
    const [userRows] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    const currentEcoin = Number(userRows[0]?.ecoin || 0);
    if (currentEcoin < price) {
      return res.json({ success: false, message: `Không đủ Ecoin! Cần ${price.toLocaleString()}` });
    }

    // Trừ ecoin
    if (price > 0) {
      await db.query("UPDATE users SET ecoin = ecoin - ? WHERE id = ?", [price, userId]);
    }

    // Thêm vào kho
    await db.query("INSERT INTO user_backgrounds (user_id, background_id) VALUES (?, ?)", [userId, bgId]);

    const [newUser] = await db.query("SELECT ecoin FROM users WHERE id = ?", [userId]);
    res.json({
      success: true,
      message: price > 0 ? `Mua thành công! -${price.toLocaleString()} Ecoin` : "Nhận miễn phí thành công!",
      ecoin: Number(newUser[0]?.ecoin || 0)
    });
  } catch (err) {
    console.error("POST /shop/buy-background error:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi mua phông nền" });
  }
});

// GET /users/:userId/backgrounds/bag — Danh sách phông nền sở hữu
app.get("/users/:userId/backgrounds/bag", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.* 
      FROM user_backgrounds ub
      JOIN backgrounds b ON b.id = ub.background_id
      WHERE ub.user_id = ?
    `, [Number(req.params.userId)]);
    
    const formattedRows = rows.map(r => {
      if (r.image_path) {
        const parts = r.image_path.replace(/\\/g, "/").split("/");
        r.image_path = "assets/ui/bg/" + parts[parts.length - 1];
      }
      return r;
    });
    
    res.json({ success: true, data: formattedRows });
  } catch (err) {
    console.error("GET bag backgrounds error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// POST /users/:userId/backgrounds/active — Đổi phông nền
app.post("/users/:userId/backgrounds/active", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const bgId = Number(req.body.background_id);
    await db.query("UPDATE users SET active_bg_id = ? WHERE id = ?", [bgId, userId]);
    res.json({ success: true, message: "Đổi phông nền thành công" });
  } catch (err) {
    console.error("POST active background error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});