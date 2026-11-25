/**
 * Bot AI Module — Heuristic Decision Engine cho người chơi mất kết nối
 *
 * Nguyên lý hoạt động:
 * 1. Không chọn ngẫu nhiên mà đánh giá trạng thái bàn cờ (tiền mặt dự phòng,
 *    tiền thuê cao nhất của đối thủ, chuỗi combo tinh cầu, giai đoạn trận đấu).
 * 2. Tạo độ trễ tự nhiên theo phân phối tam giác (giống thời gian suy nghĩ của người thật).
 * 3. Toàn bộ hàm đều là pure/stateless logic -> dễ kiểm thử (unit test) và bảo trì.
 */

const BOT_TAKEOVER_DELAY_MS = Math.max(
  3000,
  Number(process.env.BOT_TAKEOVER_DELAY_MS) || 15000
);
const BOT_QUIZ_ACCURACY = 0.72;
const ALL_BOTS_CLEANUP_MS = 60000;
const TOTAL_CELLS = 37;
const SKILL_CELLS = [0, 9, 18, 28];

/**
 * Sinh độ trễ tự nhiên kiểu người thật (phân phối tam giác tập trung ở giữa khoảng).
 */
function pickHumanDelay(minMs = 900, maxMs = 1900) {
  const r = (Math.random() + Math.random()) / 2;
  return Math.round(minMs + r * (maxMs - minMs));
}

function isSameTeam(gs, uidA, uidB) {
  if (!gs || gs.match_mode !== "team_2v2") return false;
  const a = (gs.players || []).find(p => Number(p.user_id) === Number(uidA));
  const b = (gs.players || []).find(p => Number(p.user_id) === Number(uidB));
  return !!(a && b && a.team_id != null && a.team_id === b.team_id);
}

/**
 * Ước lượng mức độ nguy hiểm trên bàn cờ để tính quỹ tiền mặt dự phòng (Safety Reserve).
 */
function estimateBoardThreat(gs, botPlayer, computeCellRentFn) {
  const buildCost = Number(gs.build_cost || 2000);
  const cellStates = gs.cellStates || {};
  let maxEnemyRent = 0;
  let sumEnemyRent = 0;
  let enemyCellCount = 0;
  let myCellCount = 0;

  for (const [idxStr, cell] of Object.entries(cellStates)) {
    if (!cell) continue;
    const idx = Number(idxStr);
    if (Number(cell.owner_user_id) === Number(botPlayer.user_id)) {
      myCellCount++;
      continue;
    }
    if (isSameTeam(gs, botPlayer.user_id, cell.owner_user_id)) {
      continue;
    }
    enemyCellCount++;
    let rent = Number(cell.total_invested || cell.build_cost || buildCost) * 0.5;
    if (typeof computeCellRentFn === "function") {
      try {
        rent = Number(computeCellRentFn(gs, idx, cell)?.rent || rent);
      } catch (_) {}
    }
    if (rent > maxEnemyRent) maxEnemyRent = rent;
    sumEnemyRent += rent;
  }

  const avgEnemyRent = enemyCellCount > 0 ? Math.round(sumEnemyRent / enemyCellCount) : 0;
  // Quỹ an toàn: đủ chịu được ít nhất 1 lần dẫm ô đắt nhất của đối thủ (hoặc 1 lần xây nhà ở đầu game)
  const safeReserve = enemyCellCount === 0
    ? Math.round(buildCost * 0.8)
    : Math.max(Math.round(buildCost * 1.0), Math.round(maxEnemyRent * 1.15));

  return {
    buildCost,
    maxEnemyRent,
    avgEnemyRent,
    enemyCellCount,
    myCellCount,
    safeReserve,
  };
}

/**
 * Đếm số ô cùng chủ nằm sát cạnh (±1, ±2) để đánh giá giá trị combo.
 */
function countNearbyOwnedCells(cellStates, cellIndex, ownerUserId) {
  let count = 0;
  for (const offset of [-2, -1, 1, 2]) {
    const ni = (cellIndex + offset + TOTAL_CELLS) % TOTAL_CELLS;
    const c = cellStates?.[ni];
    if (c && Number(c.owner_user_id) === Number(ownerUserId)) {
      count++;
    }
  }
  return count;
}

/**
 * Đánh giá điểm kỳ vọng của 1 dải bước đi (dùng cho kỹ năng dice_bias: low 2-6 vs high 8-12).
 */
function scoreDiceRange(gs, botPlayer, minSteps, maxSteps, computeCellRentFn) {
  const curIdx = Number(botPlayer.index || 0);
  const cash = Number(botPlayer.cash || 0);
  const buildCost = Number(gs.build_cost || 2000);
  let score = 0;

  for (let s = minSteps; s <= maxSteps; s++) {
    const dest = (curIdx + s) % TOTAL_CELLS;
    if (dest === 0) {
      score += 4; // START bonus
      continue;
    }
    if (dest === 9) {
      score += 1.5; // Cơ hội
      continue;
    }
    if (dest === 18) {
      score += 0.5; // Quiz
      continue;
    }
    if (dest === 28) {
      score -= 3.5; // Quái vật
      continue;
    }

    const cell = gs.cellStates?.[dest];
    if (!cell) {
      score += cash >= buildCost ? 3 : 0.5;
    } else if (Number(cell.owner_user_id) === Number(botPlayer.user_id)) {
      score += Number(cell.level || 1) < 2 && cash >= buildCost ? 2.5 : 1;
    } else if (isSameTeam(gs, botPlayer.user_id, cell.owner_user_id)) {
      score += 0.5;
    } else {
      let rent = buildCost * 0.5;
      if (typeof computeCellRentFn === "function") {
        try {
          rent = Number(computeCellRentFn(gs, dest, cell)?.rent || rent);
        } catch (_) {}
      }
      score -= Math.min(8, 2 + (rent / Math.max(1, buildCost)) * 2);
    }
  }
  return score;
}

/**
 * Quyết định hành động trước khi tung xúc xắc:
 * - Bật kỹ năng phụ (passive) nếu phù hợp
 * - Dùng chiêu cuối (active skill) khi đầy năng lượng và có mục tiêu có lợi
 * - Hoặc tung xúc xắc ngay
 */
function decidePreRollAction(gs, botPlayer, helpers = {}) {
  const computeCellRentFn = helpers.computeCellRent;
  const skill = botPlayer.skill;
  const threat = estimateBoardThreat(gs, botPlayer, computeCellRentFn);
  const cash = Number(botPlayer.cash || 0);
  const startingCash = Number(gs.bet_ecoin || 5000) * 20;

  // 1. Xem xét kích hoạt kỹ năng nội tại (passive) nếu đang sẵn sàng
  if (
    skill?.passive_type &&
    (botPlayer.passive_active_turns || 0) <= 0 &&
    (botPlayer.passive_cooldown_left || 0) <= 0
  ) {
    let shouldActivatePassive = false;
    switch (skill.passive_type) {
      case "revive_cash_percent": {
        const threshold = Math.floor(startingCash * ((skill.passive_value || 15) / 100));
        shouldActivatePassive = cash < threshold * 1.15;
        break;
      }
      case "rent_discount_percent":
        shouldActivatePassive = threat.enemyCellCount >= 2;
        break;
      case "build_discount_percent":
        shouldActivatePassive = cash >= threat.buildCost * 0.9;
        break;
      case "rent_bonus_percent":
        shouldActivatePassive = threat.myCellCount >= 2;
        break;
      default:
        shouldActivatePassive = (gs.turn_number || 1) >= 2;
        break;
    }
    if (shouldActivatePassive) {
      return { type: "use_char_passive" };
    }
  }

  // 2. Xem xét dùng Chiêu Cuối (Active Skill) nếu đủ năng lượng & chưa dùng lượt này
  const cost = Number(skill?.energy_cost || 100);
  if (skill?.active_type && !botPlayer.used_skill_this_turn && (botPlayer.energy || 0) >= cost) {
    const enemies = (gs.players || []).filter(
      p => Number(p.user_id) !== Number(botPlayer.user_id) && !isSameTeam(gs, botPlayer.user_id, p.user_id)
    );
    const richestEnemy = [...enemies].sort((a, b) => (b.cash || 0) - (a.cash || 0))[0] || null;

    switch (skill.active_type) {
      case "dice_bias": {
        const lowScore = scoreDiceRange(gs, botPlayer, 2, 6, computeCellRentFn);
        const highScore = scoreDiceRange(gs, botPlayer, 8, 12, computeCellRentFn);
        return {
          type: "use_char_skill",
          payload: { bias: highScore >= lowScore ? "high" : "low" },
        };
      }
      case "weaken_cell_rent": {
        // Ưu tiên ô đối thủ nằm trong tầm 2..12 bước phía trước, nếu không chọn ô đắt nhất
        const curIdx = Number(botPlayer.index || 0);
        let bestAhead = null;
        let bestAheadRent = -1;
        let bestGlobal = null;
        let bestGlobalRent = -1;

        for (const [idxStr, cell] of Object.entries(gs.cellStates || {})) {
          if (!cell) continue;
          if (Number(cell.owner_user_id) === Number(botPlayer.user_id)) continue;
          if (isSameTeam(gs, botPlayer.user_id, cell.owner_user_id)) continue;
          if ((cell.weaken_turns || 0) > 0) continue;

          const idx = Number(idxStr);
          const dist = (idx - curIdx + TOTAL_CELLS) % TOTAL_CELLS;
          const rent = typeof computeCellRentFn === "function"
            ? Number(computeCellRentFn(gs, idx, cell)?.rent || 0)
            : Number(cell.total_invested || cell.build_cost || 0);

          if (dist >= 2 && dist <= 12 && rent > bestAheadRent) {
            bestAheadRent = rent;
            bestAhead = idx;
          }
          if (rent > bestGlobalRent) {
            bestGlobalRent = rent;
            bestGlobal = idx;
          }
        }
        const targetCell = bestAhead !== null ? bestAhead : bestGlobal;
        if (targetCell !== null) {
          return {
            type: "use_char_skill",
            payload: { target_cell_index: targetCell },
          };
        }
        break;
      }
      case "rent_shield": {
        // Kích hoạt khi phía trước 2..12 bước có ô đối thủ nguy hiểm
        const curIdx = Number(botPlayer.index || 0);
        let dangerAhead = 0;
        for (let s = 2; s <= 12; s++) {
          const dest = (curIdx + s) % TOTAL_CELLS;
          const c = gs.cellStates?.[dest];
          if (c && Number(c.owner_user_id) !== Number(botPlayer.user_id) && !isSameTeam(gs, botPlayer.user_id, c.owner_user_id)) {
            dangerAhead++;
          }
        }
        if (dangerAhead >= 2 || threat.maxEnemyRent >= cash * 0.35) {
          return { type: "use_char_skill", payload: {} };
        }
        break;
      }
      case "push_back_enemy":
      case "curse_enemy":
      case "soul_mark": {
        if (richestEnemy) {
          return {
            type: "use_char_skill",
            payload: { target_user_id: richestEnemy.user_id },
          };
        }
        break;
      }
      case "poison_trap": {
        if (richestEnemy) {
          const enemyIdx = Number(richestEnemy.index || 0);
          for (const step of [7, 6, 8, 5, 9, 4]) {
            const candidate = (enemyIdx + step) % TOTAL_CELLS;
            if (!SKILL_CELLS.includes(candidate) && !(gs.traps && gs.traps[candidate])) {
              return {
                type: "use_char_skill",
                payload: { target_cell_index: candidate },
              };
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return { type: "roll" };
}

/**
 * Quyết định Mua mới (build) / Nâng cấp (upgrade) / Thâu tóm (buyout) tinh cầu.
 * Dựa trên quỹ dự phòng an toàn, giai đoạn trận đấu và tiềm năng chuỗi combo.
 */
function decidePropertyAction(gs, botPlayer, promptData, helpers = {}) {
  const mode = promptData?.mode || "build";
  const cost = Number(promptData?.build_cost || 0);
  const cash = Number(botPlayer?.cash || 0);
  const canAfford = promptData?.can_afford !== false && cash >= cost;

  if (!canAfford || cost <= 0) {
    return { accept: false, reason: "insufficient_cash" };
  }

  const threat = estimateBoardThreat(gs, botPlayer, helpers.computeCellRent);
  const cashAfter = cash - cost;
  const chainLen = Number(promptData?.chain_len || 1);
  const hasCombo = chainLen >= 2;

  if (mode === "build") {
    // Đầu game (< 3 tinh cầu): ưu tiên mở rộng nhanh, chỉ cần giữ lại một phần dự phòng nhỏ
    if (threat.myCellCount < 3) {
      const minKeep = Math.min(Math.round(threat.safeReserve * 0.35), Math.round(threat.maxEnemyRent * 0.7));
      const accept = cashAfter >= minKeep;
      return { accept, reason: accept ? "early_expansion" : "preserve_cash_early" };
    }
    // Tạo được chuỗi combo: ưu tiên mua mạnh hơn
    if (hasCombo) {
      const accept = cashAfter >= Math.round(threat.safeReserve * 0.5);
      return { accept, reason: accept ? "combo_build" : "preserve_cash_combo" };
    }
    // Giữa / cuối game: mua khi vẫn giữ được quỹ an toàn
    const accept = cashAfter >= Math.round(threat.safeReserve * 0.85);
    return { accept, reason: accept ? "safe_build" : "keep_safety_reserve" };
  }

  if (mode === "upgrade") {
    // Nâng cấp Lv.2 giúp tăng mạnh tiền thuê & chống thâu tóm
    const reserveFactor = hasCombo ? 0.65 : 0.9;
    const accept = cashAfter >= Math.round(threat.safeReserve * reserveFactor);
    return { accept, reason: accept ? "high_roi_upgrade" : "keep_safety_reserve" };
  }

  if (mode === "buyout") {
    // Thâu tóm đắt (1.5x) -> chỉ mua khi dư dả tiền hoặc tạo được combo phá chuỗi đối thủ
    const reserveFactor = hasCombo ? 0.75 : 1.15;
    const accept = cashAfter >= Math.round(threat.safeReserve * reserveFactor);
    return { accept, reason: accept ? "strategic_buyout" : "buyout_too_risky" };
  }

  return { accept: false, reason: "unknown_mode" };
}

/**
 * Quyết định đáp án câu hỏi ở ô 18 (tỉ lệ đúng ~72% giống người chơi thực tế).
 */
function decideQuizAnswer(question, accuracy = BOT_QUIZ_ACCURACY) {
  const options = ["A", "B", "C", "D"];
  const correct = question?.correct;
  if (!correct || !options.includes(correct)) {
    return options[Math.floor(Math.random() * options.length)];
  }
  if (Math.random() < accuracy) {
    return correct;
  }
  const wrongOptions = options.filter(opt => opt !== correct);
  return wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
}

/**
 * Xử lý khi không đủ tiền mặt trả thuê:
 * - Tính giá bán 60% theo đúng luật server.
 * - Sắp xếp tinh cầu theo giá trị chiến lược tăng dần (bán ô Lv.1 lẻ trước, giữ lại ô Lv.2 & chuỗi combo).
 * - Chọn tập nhỏ nhất đủ trả nợ; nếu bán hết vẫn thiếu -> phá sản.
 */
function decideDebtResolution(gs, botPlayer, requiredRent) {
  const cash = Number(botPlayer?.cash || 0);
  const rent = Number(requiredRent || 0);
  const deficit = rent - cash;

  if (deficit <= 0) {
    return { action: "sell", cells_to_sell: [], total_sell_price: 0 };
  }

  const owned = [];
  for (const [idxStr, cell] of Object.entries(gs.cellStates || {})) {
    if (!cell || Number(cell.owner_user_id) !== Number(botPlayer.user_id)) continue;
    const cellIndex = Number(idxStr);
    const invested = Number(cell.total_invested || cell.build_cost || gs.build_cost || 0);
    const sellPrice = Math.floor(invested * 0.6);
    const level = Number(cell.level || 1);
    const nearby = countNearbyOwnedCells(gs.cellStates, cellIndex, botPlayer.user_id);
    const hasBoost = (cell.rent_multiplier || 1) > 1 || !!cell.tax_multiplier_active;

    // Điểm chiến lược thấp -> bán trước
    const strategicValue = level * 100 + nearby * 80 + (hasBoost ? 50 : 0);
    owned.push({ cell_index: cellIndex, sell_price: sellPrice, strategicValue });
  }

  // Sắp xếp tăng dần theo strategicValue (nếu bằng nhau, bán ô giá nhỏ hơn trước)
  owned.sort((a, b) => a.strategicValue - b.strategicValue || a.sell_price - b.sell_price);

  const selected = [];
  let totalSellPrice = 0;

  for (const item of owned) {
    selected.push({ cell_index: item.cell_index, sell_price: item.sell_price });
    totalSellPrice += item.sell_price;
    if (cash + totalSellPrice >= rent) {
      return {
        action: "sell",
        cells_to_sell: selected,
        total_sell_price: totalSellPrice,
      };
    }
  }

  return {
    action: "bankrupt",
    cells_to_sell: [],
    total_sell_price: 0,
  };
}

export {
  BOT_TAKEOVER_DELAY_MS,
  BOT_QUIZ_ACCURACY,
  ALL_BOTS_CLEANUP_MS,
  pickHumanDelay,
  estimateBoardThreat,
  decidePreRollAction,
  decidePropertyAction,
  decideQuizAnswer,
  decideDebtResolution,
};

export default {
  BOT_TAKEOVER_DELAY_MS,
  BOT_QUIZ_ACCURACY,
  ALL_BOTS_CLEANUP_MS,
  pickHumanDelay,
  estimateBoardThreat,
  decidePreRollAction,
  decidePropertyAction,
  decideQuizAnswer,
  decideDebtResolution,
};
