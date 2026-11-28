import db from "../config/db.js";
import logger from "../utils/logger.js";
import rankingService from "./ranking.service.js";

const DAILY_REWARD_LIMIT = 3;

export const LAB_BUFF_CATALOG = [
  {
    key: "buff_start_cash",
    name: "Bùa Khởi Đầu Tài Lộc",
    icon: "💰",
    effect: "+10% tiền mặt khởi đầu ở ván đấu tiếp theo",
    cost_ecoin: 15000,
    min_iq: 100,
    color: "#f59e0b",
  },
  {
    key: "buff_shield_rent",
    name: "Bùa Bảo Hộ Địa Ốc",
    icon: "🛡️",
    effect: "Giảm 20% tiền thuê ô đầu tiên khi dẫm đất đối thủ",
    cost_ecoin: 18000,
    min_iq: 120,
    color: "#38bdf8",
  },
  {
    key: "buff_quiz_5050",
    name: "Bùa Trí Tuệ 50/50",
    icon: "🎓",
    effect: "Tự động loại bỏ 2 đáp án sai khi gặp Thầy Giáo Ô 18",
    cost_ecoin: 12000,
    min_iq: 100,
    color: "#a855f7",
  },
];

export const CODEX_MILESTONES = [
  { key: "codex_tarot_3",  type: "tarot", target: 3,  label: "Sưu tập 3 Thẻ Tarot",  reward_ecoin: 25000 },
  { key: "codex_tarot_6",  type: "tarot", target: 6,  label: "Sưu tập 6 Thẻ Tarot",  reward_ecoin: 65000 },
  { key: "codex_tarot_10", type: "tarot", target: 10, label: "Full 10/10 Thẻ Tarot", reward_ecoin: 180000 },
  { key: "codex_char_2",   type: "char",  target: 2,  label: "Sở hữu 2 Nhân vật",    reward_ecoin: 35000 },
  { key: "codex_char_5",   type: "char",  target: 5,  label: "Sở hữu 5 Nhân vật",    reward_ecoin: 120000 },
  { key: "codex_char_7",   type: "char",  target: 7,  label: "Full 7/7 Nhân vật",    reward_ecoin: 300000 },
];

const labService = {
  async ensureLabSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS lab_quiz_runs (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          run_date DATE NOT NULL,
          correct_count INT NOT NULL DEFAULT 0,
          total_answered INT NOT NULL DEFAULT 0,
          max_combo INT NOT NULL DEFAULT 0,
          iq_gained INT NOT NULL DEFAULT 0,
          ecoin_reward INT NOT NULL DEFAULT 0,
          luck_dust_gained INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_lab_quiz_user_date (user_id, run_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS user_lab_buffs (
          user_id INT NOT NULL,
          buff_key VARCHAR(40) NOT NULL,
          charges INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, buff_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS user_codex_rewards (
          user_id INT NOT NULL,
          reward_key VARCHAR(40) NOT NULL,
          reward_ecoin INT NOT NULL DEFAULT 0,
          claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, reward_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      logger.ok("LAB", "Verified tables: lab_quiz_runs, user_lab_buffs, user_codex_rewards");
    } catch (err) {
      logger.err("LAB", "ensureLabSchema failed", err);
    }
  },

  /**
   * 1. THỬ THÁCH HỌC GIẢ (QUIZ SPRINT 60 GIÂY)
   * Lấy 15 câu hỏi ngẫu nhiên từ bảng questions + số lượt còn thưởng trong ngày.
   */
  async startQuizSprint(userId) {
    const uid = Number(userId);
    const [qRows] = await db.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer
       FROM questions
       ORDER BY RAND()
       LIMIT 15`
    );
    const [[runRow]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM lab_quiz_runs WHERE user_id = ? AND run_date = CURDATE()",
      [uid]
    ).catch(() => [[{ cnt: 0 }]]);
    const [[statRow]] = await db.query(
      "SELECT iq_score, best_quiz_streak FROM user_scholar_stats WHERE user_id = ? LIMIT 1",
      [uid]
    ).catch(() => [[{ iq_score: 100, best_quiz_streak: 0 }]]);

    const runsToday = Number(runRow?.cnt || 0);
    return {
      success: true,
      duration_sec: 60,
      runs_today: runsToday,
      daily_reward_limit: DAILY_REWARD_LIMIT,
      can_earn_ecoin: runsToday < DAILY_REWARD_LIMIT,
      current_iq: Number(statRow?.iq_score || 100),
      best_streak: Number(statRow?.best_quiz_streak || 0),
      questions: (qRows || []).map(q => ({
        id: q.id,
        question: q.question,
        A: q.option_a,
        B: q.option_b,
        C: q.option_c,
        D: q.option_d,
        correct: String(q.correct_answer || "A").trim().toUpperCase(),
      })),
    };
  },

  /**
   * Nộp kết quả Quiz 60s: tính Combo, cộng IQ vào user_scholar_stats (nối thẳng BXH Trạng Nguyên!),
   * thưởng Ecoin (tối đa 3 lượt/ngày) & thưởng Bụi May Mắn Tarot (+10% tỉ lệ nâng cấp) nếu Combo >= 3.
   */
  async submitQuizSprint(userId, { correct_count = 0, total_answered = 0, max_combo = 0 } = {}) {
    const uid = Number(userId);
    const correct = Math.max(0, Math.min(20, Math.round(Number(correct_count) || 0)));
    const total = Math.max(correct, Math.min(25, Math.round(Number(total_answered) || 0)));
    const combo = Math.max(0, Math.min(correct, Math.round(Number(max_combo) || 0)));

    const [[runRow]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM lab_quiz_runs WHERE user_id = ? AND run_date = CURDATE()",
      [uid]
    ).catch(() => [[{ cnt: 0 }]]);
    const runsToday = Number(runRow?.cnt || 0);
    const canEarnReward = runsToday < DAILY_REWARD_LIMIT;

    // Combo multiplier: x1 (<3), x2 (3-5), x3 (>=6)
    const mult = combo >= 6 ? 3 : combo >= 3 ? 2 : 1;
    const iqGained = correct > 0 ? correct * 6 + combo * 4 : 0;
    const ecoinReward = canEarnReward && correct > 0 ? Math.min(25000, correct * 1200 * mult) : 0;
    const luckDust = canEarnReward && combo >= 3 ? 1 : 0;

    await db.query(
      `INSERT INTO lab_quiz_runs
         (user_id, run_date, correct_count, total_answered, max_combo, iq_gained, ecoin_reward, luck_dust_gained)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)`,
      [uid, correct, total, combo, iqGained, ecoinReward, luckDust]
    );

    // Cập nhật Điểm Học Giả & Chuỗi Quiz lên BXH Trạng Nguyên
    if (total > 0) {
      await db.query(
        `INSERT INTO user_scholar_stats (user_id, iq_score, quiz_correct, quiz_total, best_quiz_streak)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           iq_score = iq_score + VALUES(iq_score) - 100,
           quiz_correct = quiz_correct + VALUES(quiz_correct),
           quiz_total = quiz_total + VALUES(quiz_total),
           best_quiz_streak = GREATEST(best_quiz_streak, VALUES(best_quiz_streak))`,
        [uid, 100 + iqGained, correct, total, combo]
      ).catch(() => {});
    }

    let newEcoin = null;
    if (ecoinReward > 0) {
      await db.query("UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?", [ecoinReward, uid]);
    }
    const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    newEcoin = Number(uRow?.ecoin || 0);

    if (luckDust > 0) {
      await db.query(
        `INSERT INTO user_lab_buffs (user_id, buff_key, charges) VALUES (?, 'tarot_luck', ?)
         ON DUPLICATE KEY UPDATE charges = charges + VALUES(charges)`,
        [uid, luckDust]
      ).catch(() => {});
    }

    const [[statRow]] = await db.query(
      "SELECT iq_score, best_quiz_streak FROM user_scholar_stats WHERE user_id = ? LIMIT 1",
      [uid]
    ).catch(() => [[{ iq_score: 100, best_quiz_streak: 0 }]]);

    return {
      success: true,
      correct_count: correct,
      total_answered: total,
      max_combo: combo,
      combo_mult: mult,
      iq_gained: iqGained,
      total_iq: Number(statRow?.iq_score || 100),
      ecoin_reward: ecoinReward,
      new_ecoin: newEcoin,
      luck_dust_gained: luckDust,
      runs_today: runsToday + 1,
      daily_reward_limit: DAILY_REWARD_LIMIT,
      reward_capped: !canEarnReward,
    };
  },

  /**
   * 2. BÁCH KHOA TOÀN THƯ & THƯ VIỆN CHIẾN THUẬT (CODEX)
   * Trả toàn bộ 10 Thẻ Tarot (Lv.1 vs Lv.2), 7 Nhân vật + kỹ năng, tiến độ sưu tập & quà mốc sưu tập.
   */
  async getCodex(userId) {
    const uid = Number(userId);
    const [tarots] = await db.query(
      "SELECT id, name, description, cooldown_seconds, icon, effect_type, price FROM tarots ORDER BY id ASC"
    ).catch(() => [[]]);
    const [characters] = await db.query(
      `SELECT c.id, c.name, c.price,
              GROUP_CONCAT(CONCAT(cs.skill_type, ': ', cs.name, ' — ', COALESCE(cs.description, '')) SEPARATOR ' || ') AS skills_summary
       FROM characters c
       LEFT JOIN character_skills cs ON cs.character_id = c.id
       GROUP BY c.id, c.name, c.price
       ORDER BY c.id ASC`
    ).catch(() => [[]]);

    const [ownedTarotRows] = await db.query(
      "SELECT tarot_id FROM user_tarots WHERE user_id = ?",
      [uid]
    ).catch(() => [[]]);
    const [ownedCharRows] = await db.query(
      "SELECT character_id FROM user_characters WHERE user_id = ?",
      [uid]
    ).catch(() => [[]]);
    const [claimedRows] = await db.query(
      "SELECT reward_key FROM user_codex_rewards WHERE user_id = ?",
      [uid]
    ).catch(() => [[]]);

    const ownedTarotSet = new Set((ownedTarotRows || []).map(r => Number(r.tarot_id)));
    const ownedCharSet = new Set((ownedCharRows || []).map(r => Number(r.character_id)));
    const claimedSet = new Set((claimedRows || []).map(r => r.reward_key));

    const tarotList = (tarots || []).map(t => {
      const cd1 = Number(t.cooldown_seconds || 4);
      const cd2 = Math.max(1, cd1 - 2);
      return {
        id: Number(t.id),
        name: t.name,
        description: t.description || "",
        icon: t.icon || "",
        effect_type: t.effect_type || "",
        cd_lv1: cd1,
        cd_lv2: cd2,
        owned: ownedTarotSet.has(Number(t.id)),
      };
    });

    const charList = (characters || []).map(c => ({
      id: Number(c.id),
      name: c.name,
      price: Number(c.price || 0),
      skills: String(c.skills_summary || "").split(" || ").filter(Boolean),
      owned: ownedCharSet.has(Number(c.id)),
    }));

    const ownedTarotCount = ownedTarotSet.size;
    const ownedCharCount = ownedCharSet.size;

    const milestones = CODEX_MILESTONES.map(m => {
      const cur = m.type === "tarot" ? ownedTarotCount : ownedCharCount;
      const unlocked = cur >= m.target;
      const claimed = claimedSet.has(m.key);
      return { ...m, current: cur, unlocked, claimed, can_claim: unlocked && !claimed };
    });

    return {
      success: true,
      progress: {
        tarots_owned: ownedTarotCount,
        tarots_total: tarotList.length || 10,
        chars_owned: ownedCharCount,
        chars_total: charList.length || 7,
      },
      tarots: tarotList,
      characters: charList,
      milestones,
    };
  },

  async claimCodexReward(userId, rewardKey) {
    const uid = Number(userId);
    const ms = CODEX_MILESTONES.find(m => m.key === String(rewardKey));
    if (!uid || !ms) return { success: false, message: "Mốc thưởng sưu tập không hợp lệ!" };

    const codex = await this.getCodex(uid);
    const target = codex.milestones.find(m => m.key === ms.key);
    if (!target?.unlocked) return { success: false, message: `Chưa đạt điều kiện ${ms.label}!` };
    if (target.claimed) return { success: false, message: "Bạn đã nhận thưởng mốc sưu tập này rồi!" };

    const [ins] = await db.query(
      "INSERT IGNORE INTO user_codex_rewards (user_id, reward_key, reward_ecoin) VALUES (?, ?, ?)",
      [uid, ms.key, ms.reward_ecoin]
    );
    if (ins.affectedRows === 0) return { success: false, message: "Bạn đã nhận thưởng mốc này rồi!" };

    await db.query("UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?", [ms.reward_ecoin, uid]);
    const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    return {
      success: true,
      reward_ecoin: ms.reward_ecoin,
      new_ecoin: Number(uRow?.ecoin || 0),
      message: `Đã nhận +${ms.reward_ecoin.toLocaleString("vi-VN")} Ecoin (${ms.label})!`,
    };
  },

  /**
   * 3. CHẾ TẠO BÙA TRỢ CHIẾN (LAB BUFFS — 1 TRẬN)
   */
  async getLabBuffs(userId) {
    const uid = Number(userId);
    const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    const [[statRow]] = await db.query("SELECT iq_score FROM user_scholar_stats WHERE user_id = ? LIMIT 1", [uid]).catch(() => [[{ iq_score: 100 }]]);
    const [buffRows] = await db.query("SELECT buff_key, charges FROM user_lab_buffs WHERE user_id = ?", [uid]).catch(() => [[]]);
    const chargeMap = new Map((buffRows || []).map(r => [r.buff_key, Number(r.charges || 0)]));

    return {
      success: true,
      ecoin: Number(uRow?.ecoin || 0),
      iq_score: Number(statRow?.iq_score || 100),
      tarot_luck_dust: chargeMap.get("tarot_luck") || 0,
      buffs: LAB_BUFF_CATALOG.map(b => ({
        ...b,
        charges: chargeMap.get(b.key) || 0,
      })),
    };
  },

  async craftLabBuff(userId, buffKey) {
    const uid = Number(userId);
    const item = LAB_BUFF_CATALOG.find(b => b.key === String(buffKey));
    if (!uid || !item) return { success: false, message: "Loại bùa không hợp lệ!" };

    const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    const [[statRow]] = await db.query("SELECT iq_score FROM user_scholar_stats WHERE user_id = ? LIMIT 1", [uid]).catch(() => [[{ iq_score: 100 }]]);
    const curEcoin = Number(uRow?.ecoin || 0);
    const curIq = Number(statRow?.iq_score || 100);

    if (curIq < item.min_iq) {
      return { success: false, message: `Cần tối thiểu ${item.min_iq} điểm Học Giả (IQ) để chế tạo ${item.name}!` };
    }
    if (curEcoin < item.cost_ecoin) {
      return { success: false, message: `Không đủ Ecoin (cần ${item.cost_ecoin.toLocaleString("vi-VN")} Ecoin)!` };
    }

    const [upd] = await db.query(
      "UPDATE users SET ecoin = ecoin - ? WHERE id = ? AND ecoin >= ?",
      [item.cost_ecoin, uid, item.cost_ecoin]
    );
    if (upd.affectedRows === 0) return { success: false, message: "Không đủ Ecoin!" };

    await db.query(
      `INSERT INTO user_lab_buffs (user_id, buff_key, charges) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE charges = charges + 1`,
      [uid, item.key]
    );

    const [[afterU]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    const [[afterB]] = await db.query("SELECT charges FROM user_lab_buffs WHERE user_id = ? AND buff_key = ? LIMIT 1", [uid, item.key]);

    return {
      success: true,
      buff_key: item.key,
      charges: Number(afterB?.charges || 1),
      new_ecoin: Number(afterU?.ecoin || 0),
      message: `Chế tạo thành công ${item.name}! Sẵn sàng kích hoạt ở trận tiếp theo.`,
    };
  },
};

export default labService;
