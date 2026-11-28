import db from "../config/db.js";
import logger from "../utils/logger.js";

export const RANK_MILESTONES = [
  { key: "tier_tapsu",      name: "Tập Sự",      min_elo: 1000, reward_ecoin: 15000,   color: "#94a3b8", desc: "Hoàn thành khởi đầu hành trình Tỷ Phú" },
  { key: "tier_thuonggia",  name: "Thương Gia",  min_elo: 1060, reward_ecoin: 50000,   color: "#38bdf8", desc: "Đạt 1.060 ELO trên BXH Mùa Giải" },
  { key: "tier_trieuphu",   name: "Triệu Phú",   min_elo: 1150, reward_ecoin: 150000,  color: "#c084fc", desc: "Đạt 1.150 ELO trên BXH Mùa Giải" },
  { key: "tier_typhu",      name: "Tỷ Phú",      min_elo: 1280, reward_ecoin: 350000,  color: "#ffd700", desc: "Đạt 1.280 ELO trên BXH Mùa Giải" },
  { key: "tier_huyenthoai", name: "Huyền Thoại", min_elo: 1450, reward_ecoin: 1000000, color: "#ff4d6d", desc: "Chạm đỉnh 1.450 ELO — Huyền Thoại Cờ Tỷ Phú" },
];

function computeRankTier(elo) {
  if (elo >= 1450) return { name: "Huyền Thoại", color: "#ff4d6d" };
  if (elo >= 1280) return { name: "Tỷ Phú",      color: "#ffd700" };
  if (elo >= 1150) return { name: "Triệu Phú",   color: "#c084fc" };
  if (elo >= 1060) return { name: "Thương Gia",  color: "#38bdf8" };
  return { name: "Tập Sự", color: "#94a3b8" };
}

function parseJsonIds(val) {
  if (Array.isArray(val)) return val.map(Number).filter(Boolean);
  try {
    const parsed = JSON.parse(val || "[]");
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const rankingService = {
  async ensureRankingSchema() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_scholar_stats (
          user_id INT NOT NULL PRIMARY KEY,
          iq_score INT NOT NULL DEFAULT 100,
          quiz_correct INT NOT NULL DEFAULT 0,
          quiz_total INT NOT NULL DEFAULT 0,
          best_quiz_streak INT NOT NULL DEFAULT 0,
          kudos_count INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS user_kudos_logs (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          from_user_id INT NOT NULL,
          to_user_id INT NOT NULL,
          kudos_date DATE NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_daily_kudos (from_user_id, to_user_id, kudos_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS user_rank_rewards (
          user_id INT NOT NULL,
          milestone_key VARCHAR(40) NOT NULL,
          reward_ecoin INT NOT NULL DEFAULT 0,
          claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, milestone_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Đảm bảo mỗi user hiện có đều có bản ghi học giả khởi điểm để tab Trạng Nguyên luôn có dữ liệu sống động
      await db.query(`
        INSERT IGNORE INTO user_scholar_stats (user_id, iq_score, quiz_correct, quiz_total, best_quiz_streak, kudos_count)
        SELECT id, 100 + MOD(id * 37, 90), 3 + MOD(id * 7, 12), 5 + MOD(id * 9, 15), 2 + MOD(id * 3, 7), MOD(id * 5, 11)
        FROM users
      `).catch(() => {});

      logger.ok("RANKING", "Verified tables: user_scholar_stats, user_kudos_logs, user_rank_rewards");
    } catch (err) {
      logger.err("RANKING", "ensureRankingSchema failed", err);
    }
  },

  /**
   * Ghi nhận kết quả trả lời câu hỏi Quiz (từ ô 18 hoặc Phòng Nghiên Cứu) để cập nhật BXH Trạng Nguyên.
   */
  async recordQuizAnswer(userId, { correct = false, streak = 0 } = {}) {
    if (!userId) return;
    const uid = Number(userId);
    const iqDelta = correct ? 15 + Math.min(25, Number(streak || 0) * 5) : 0;
    await db.query(
      `INSERT INTO user_scholar_stats (user_id, iq_score, quiz_correct, quiz_total, best_quiz_streak)
       VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         iq_score = iq_score + VALUES(iq_score),
         quiz_correct = quiz_correct + VALUES(quiz_correct),
         quiz_total = quiz_total + 1,
         best_quiz_streak = GREATEST(best_quiz_streak, VALUES(best_quiz_streak))`,
      [uid, 100 + iqDelta, correct ? 1 : 0, correct ? Math.max(1, Number(streak || 1)) : 0]
    ).catch(() => {});
  },

  /**
   * Thả tim / Vinh danh 1 người chơi trên BXH (mỗi ngày 1 lần cho mỗi đối tượng).
   */
  async giveKudos(fromUserId, toUserId) {
    const fromId = Number(fromUserId);
    const toId = Number(toUserId);
    if (!fromId || !toId) return { success: false, message: "Thông tin không hợp lệ" };
    if (fromId === toId) return { success: false, message: "Bạn không thể tự thả tim cho chính mình!" };

    try {
      const [ins] = await db.query(
        `INSERT IGNORE INTO user_kudos_logs (from_user_id, to_user_id, kudos_date) VALUES (?, ?, CURDATE())`,
        [fromId, toId]
      );
      if (ins.affectedRows === 0) {
        return { success: false, message: "Hôm nay bạn đã thả tim vinh danh người chơi này rồi!" };
      }
      await db.query(
        `INSERT INTO user_scholar_stats (user_id, kudos_count) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE kudos_count = kudos_count + 1`,
        [toId]
      );
      const [[row]] = await db.query("SELECT kudos_count FROM user_scholar_stats WHERE user_id = ? LIMIT 1", [toId]);
      return { success: true, kudos_count: Number(row?.kudos_count || 1) };
    } catch (err) {
      logger.err("RANKING", "giveKudos failed", err);
      return { success: false, message: "Lỗi máy chủ khi thả tim" };
    }
  },

  /**
   * Lấy dữ liệu 4 Bảng Xếp Hạng chuyên biệt:
   *  - season  : Cao Thủ Mùa Giải (ELO / Số trận thắng / Tỷ lệ thắng từ game_results)
   *  - wealth  : Đại Gia Tỷ Phú (Top Ecoin)
   *  - scholar : Trạng Nguyên Trí Tuệ (Điểm Học Giả IQ & Chuỗi Quiz đúng liên tiếp)
   *  - streak  : Chuỗi Thắng Bất Bại (Win Streak từ game_results)
   */
  async getLeaderboard(type = "season", { viewerId = null, limit = 20 } = {}) {
    const validTypes = new Set(["season", "wealth", "scholar", "streak"]);
    const tab = validTypes.has(String(type).toLowerCase()) ? String(type).toLowerCase() : "season";
    const maxRows = Math.min(50, Math.max(3, Number(limit) || 20));

    // 1. Lấy toàn bộ thông tin user + nhân vật/skin active + scholar stats
    const [users] = await db.query(`
      SELECT
        u.id,
        u.username,
        u.name AS display_name,
        COALESCE(u.ecoin, 0) AS ecoin,
        COALESCE(u.active_avatar_id, 1) AS active_avatar_id,
        c.name AS characterName,
        COALESCE(cs.skin_number, 1) AS skin_id,
        COALESCE(s.iq_score, 100) AS iq_score,
        COALESCE(s.quiz_correct, 0) AS quiz_correct,
        COALESCE(s.quiz_total, 0) AS quiz_total,
        COALESCE(s.best_quiz_streak, 0) AS best_quiz_streak,
        COALESCE(s.kudos_count, 0) AS kudos_count
      FROM users u
      LEFT JOIN user_characters uc ON uc.user_id = u.id AND uc.character_id = u.active_character_id
      LEFT JOIN characters c ON c.id = uc.character_id
      LEFT JOIN character_skins cs ON cs.id = uc.active_skin_id
      LEFT JOIN user_scholar_stats s ON s.user_id = u.id
      WHERE COALESCE(u.is_banned, 0) = 0
    `);

    // 2. Tổng hợp thống kê trận đấu & chuỗi thắng từ game_results
    const [results] = await db.query(
      "SELECT id, winner_id, all_player_ids, played_at FROM game_results ORDER BY id ASC"
    ).catch(() => [[]]);

    const matchStats = new Map();
    const ensureStat = (uid) => {
      if (!matchStats.has(uid)) {
        matchStats.set(uid, { wins: 0, matches: 0, curStreak: 0, maxStreak: 0 });
      }
      return matchStats.get(uid);
    };

    for (const r of results || []) {
      const winnerId = Number(r.winner_id || 0);
      const participants = parseJsonIds(r.all_player_ids);
      if (winnerId && !participants.includes(winnerId)) participants.push(winnerId);

      for (const pid of participants) {
        const st = ensureStat(pid);
        st.matches += 1;
        if (pid === winnerId) {
          st.wins += 1;
          st.curStreak += 1;
          if (st.curStreak > st.maxStreak) st.maxStreak = st.curStreak;
        } else {
          st.curStreak = 0;
        }
      }
    }

    // 3. Gộp hồ sơ đầy đủ cho từng người chơi
    const enriched = (users || []).map((u) => {
      const st = matchStats.get(Number(u.id)) || { wins: 0, matches: 0, curStreak: 0, maxStreak: 0 };
      const losses = Math.max(0, st.matches - st.wins);
      const winRate = st.matches > 0 ? Math.round((st.wins / st.matches) * 100) : 0;
      const elo = Math.max(800, 1000 + st.wins * 35 - losses * 10);
      const tier = computeRankTier(elo);
      const quizAcc = Number(u.quiz_total) > 0 ? Math.round((Number(u.quiz_correct) / Number(u.quiz_total)) * 100) : 0;

      return {
        user_id: Number(u.id),
        username: u.display_name || u.username || `Player ${u.id}`,
        handle: u.username || "",
        active_avatar_id: Number(u.active_avatar_id || 1),
        characterName: u.characterName || "Dark_Oracle",
        skin_id: Number(u.skin_id || 1),
        wins: st.wins,
        matches: st.matches,
        win_rate: winRate,
        elo,
        tier_name: tier.name,
        tier_color: tier.color,
        ecoin: Number(u.ecoin || 0),
        iq_score: Number(u.iq_score || 100),
        quiz_correct: Number(u.quiz_correct || 0),
        quiz_acc: quizAcc,
        best_quiz_streak: Number(u.best_quiz_streak || 0),
        cur_streak: st.curStreak,
        max_streak: st.maxStreak,
        kudos_count: Number(u.kudos_count || 0),
      };
    });

    // 4. Sắp xếp theo đúng tiêu chí của từng Tab BXH
    if (tab === "wealth") {
      enriched.sort((a, b) => b.ecoin - a.ecoin || b.wins - a.wins);
    } else if (tab === "scholar") {
      enriched.sort((a, b) => b.iq_score - a.iq_score || b.best_quiz_streak - a.best_quiz_streak || b.quiz_correct - a.quiz_correct);
    } else if (tab === "streak") {
      enriched.sort((a, b) => b.max_streak - a.max_streak || b.cur_streak - a.cur_streak || b.wins - a.wins);
    } else {
      // season: Cao Thủ Mùa Giải
      enriched.sort((a, b) => b.elo - a.elo || b.wins - a.wins || b.win_rate - a.win_rate);
    }

    const fullRanked = enriched.map((row, idx) => {
      const rank = idx + 1;
      let primaryLabel = "";
      let secondaryLabel = "";
      let titleBadge = row.tier_name;

      if (tab === "wealth") {
        primaryLabel = `${row.ecoin.toLocaleString("vi-VN")} Ecoin`;
        secondaryLabel = `${row.wins} thắng • ${row.kudos_count} tim`;
        titleBadge = rank === 1 ? "Vua Tỷ Phú" : rank <= 3 ? "Đại Gia" : "Thương Nhân";
      } else if (tab === "scholar") {
        primaryLabel = `${row.iq_score.toLocaleString("vi-VN")} IQ`;
        secondaryLabel = `Chuỗi ${row.best_quiz_streak} Quiz • ${row.quiz_acc}% đúng`;
        titleBadge = rank === 1 ? "Trạng Nguyên" : rank === 2 ? "Bảng Nhãn" : rank === 3 ? "Thám Hoa" : "Học Giả";
      } else if (tab === "streak") {
        primaryLabel = `Chuỗi ${row.max_streak} Thắng`;
        secondaryLabel = row.cur_streak > 0 ? `Đang bất bại ${row.cur_streak} trận` : `Tổng ${row.wins} trận thắng`;
        titleBadge = rank === 1 ? "Chiến Thần Bất Bại" : rank <= 3 ? "Kẻ Hủy Diệt" : "Đấu Sĩ";
      } else {
        primaryLabel = `${row.elo} ELO • ${row.wins} Thắng`;
        secondaryLabel = row.matches > 0 ? `Tỷ lệ thắng ${row.win_rate}% (${row.matches} trận)` : "Chưa có trận xếp hạng";
        titleBadge = row.tier_name;
      }

      return {
        ...row,
        rank,
        primary_label: primaryLabel,
        secondary_label: secondaryLabel,
        title_badge: titleBadge,
      };
    });

    const ranking = fullRanked.slice(0, maxRows);
    let me = viewerId ? fullRanked.find(r => r.user_id === Number(viewerId)) || null : null;

    // Tính Mục tiêu leo hạng cá nhân (Goal Hint)
    if (me) {
      let goalHint = "Đang giữ ngôi đầu Bảng Vàng!";
      if (me.rank > 1) {
        const targetRank = me.rank > 10 ? 10 : me.rank > 3 ? 3 : me.rank - 1;
        const targetRow = fullRanked[targetRank - 1];
        if (targetRow) {
          if (tab === "wealth") {
            const diff = Math.max(1, targetRow.ecoin - me.ecoin + 1);
            goalHint = `Cần thêm ${diff.toLocaleString("vi-VN")} Ecoin để vào Top ${targetRank}`;
          } else if (tab === "scholar") {
            const diff = Math.max(1, targetRow.iq_score - me.iq_score + 1);
            goalHint = `Cần thêm ${diff} điểm IQ để vào Top ${targetRank}`;
          } else if (tab === "streak") {
            const diff = Math.max(1, targetRow.max_streak - me.max_streak + 1);
            goalHint = `Cần chuỗi ${me.max_streak + diff} thắng để vào Top ${targetRank}`;
          } else {
            const eloDiff = Math.max(1, targetRow.elo - me.elo + 1);
            const winsNeed = Math.max(1, Math.ceil(eloDiff / 35));
            goalHint = `Cần thêm ${winsNeed} trận thắng để vào Top ${targetRank}`;
          }
        }
      }
      me = { ...me, goal_hint: goalHint };
    }

    return {
      success: true,
      type: tab,
      total_players: fullRanked.length,
      ranking,
      me,
    };
  },

  /**
   * Soi Hồ Sơ Chi Tiết của 1 người chơi trên BXH (Avatar, Skin, Tỷ lệ thắng, IQ, Bộ thẻ Tarot tủ, trạng thái kết bạn).
   */
  async getPlayerProfile(targetUserId, { viewerId = null } = {}) {
    const tid = Number(targetUserId);
    const vid = viewerId ? Number(viewerId) : null;
    if (!tid) return { success: false, message: "Không tìm thấy người chơi" };

    const board = await this.getLeaderboard("season", { viewerId: tid, limit: 100 });
    const profile = board.me;
    if (!profile) return { success: false, message: "Không tìm thấy hồ sơ người chơi!" };

    // Lấy bộ thẻ Tarot tủ (active_tarot_ids)
    let activeTarots = [];
    try {
      const [[uRow]] = await db.query("SELECT active_tarot_ids FROM users WHERE id = ? LIMIT 1", [tid]);
      const ids = parseJsonIds(uRow?.active_tarot_ids);
      if (ids.length) {
        const [tRows] = await db.query(
          `SELECT id, name, icon, description, cooldown_seconds FROM tarots WHERE id IN (${ids.map(() => "?").join(",")})`,
          ids
        );
        const byId = new Map((tRows || []).map(t => [Number(t.id), t]));
        activeTarots = ids.map(id => byId.get(id)).filter(Boolean);
      }
    } catch {}

    // Trạng thái kết bạn giữa viewer và target
    let friendStatus = "none";
    if (vid && vid === tid) {
      friendStatus = "self";
    } else if (vid) {
      try {
        const [fRows] = await db.query(
          `SELECT user_id, friend_id, status FROM friendships
           WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1`,
          [vid, tid, tid, vid]
        );
        if (fRows[0]) {
          if (fRows[0].status === "accepted") friendStatus = "friends";
          else if (Number(fRows[0].user_id) === vid) friendStatus = "pending_out";
          else friendStatus = "pending_in";
        }
      } catch {}
    }

    return {
      success: true,
      profile: {
        ...profile,
        active_tarots: activeTarots,
        friend_status: friendStatus,
      },
    };
  },

  /**
   * Gửi lời mời kết bạn ngay từ BXH (hoặc tự đồng ý nếu đối phương đã gửi lời mời trước đó).
   */
  async sendFriendRequest(fromUserId, toUserId) {
    const fromId = Number(fromUserId);
    const toId = Number(toUserId);
    if (!fromId || !toId) return { success: false, message: "Thông tin không hợp lệ" };
    if (fromId === toId) return { success: false, message: "Không thể tự kết bạn với chính mình!" };

    try {
      const [existing] = await db.query(
        `SELECT id, user_id, status FROM friendships
         WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1`,
        [fromId, toId, toId, fromId]
      );
      if (existing[0]) {
        if (existing[0].status === "accepted") {
          return { success: true, friend_status: "friends", message: "Hai bạn đã là bạn bè rồi!" };
        }
        if (Number(existing[0].user_id) === fromId) {
          return { success: true, friend_status: "pending_out", message: "Đã gửi lời mời kết bạn trước đó!" };
        }
        // Đối phương đã gửi lời mời trước -> Chấp nhận luôn
        await db.query("UPDATE friendships SET status = 'accepted' WHERE id = ?", [existing[0].id]);
        return { success: true, friend_status: "friends", message: "Đã chấp nhận kết bạn thành công!" };
      }

      await db.query("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')", [fromId, toId]);
      return { success: true, friend_status: "pending_out", message: "Đã gửi lời mời kết bạn thành công!" };
    } catch (err) {
      logger.err("RANKING", "sendFriendRequest failed", err);
      return { success: false, message: "Lỗi gửi lời mời kết bạn" };
    }
  },

  /**
   * Lấy danh sách Quà Mốc Rank (Thương Gia / Triệu Phú / Tỷ Phú / Huyền Thoại) của người chơi.
   */
  async getRankRewards(userId) {
    const uid = Number(userId);
    if (!uid) return { success: false, message: "Chưa đăng nhập" };
    const board = await this.getLeaderboard("season", { viewerId: uid, limit: 100 });
    const me = board.me || { elo: 1000, tier_name: "Tập Sự", rank: null };

    const [claimedRows] = await db.query(
      "SELECT milestone_key, claimed_at FROM user_rank_rewards WHERE user_id = ?",
      [uid]
    ).catch(() => [[]]);
    const claimedSet = new Set((claimedRows || []).map(r => r.milestone_key));

    const milestones = RANK_MILESTONES.map((m) => {
      const unlocked = Number(me.elo || 1000) >= m.min_elo;
      const claimed = claimedSet.has(m.key);
      return {
        ...m,
        unlocked,
        claimed,
        can_claim: unlocked && !claimed,
      };
    });

    return {
      success: true,
      elo: Number(me.elo || 1000),
      tier_name: me.tier_name || "Tập Sự",
      rank: me.rank || null,
      claimable_count: milestones.filter(m => m.can_claim).length,
      milestones,
    };
  },

  async claimRankReward(userId, milestoneKey) {
    const uid = Number(userId);
    const ms = RANK_MILESTONES.find(m => m.key === String(milestoneKey));
    if (!uid || !ms) return { success: false, message: "Mốc quà không hợp lệ!" };

    const status = await this.getRankRewards(uid);
    const target = status.milestones?.find(m => m.key === ms.key);
    if (!target?.unlocked) {
      return { success: false, message: `Bạn cần đạt tối thiểu ${ms.min_elo} ELO để nhận quà mốc ${ms.name}!` };
    }
    if (target.claimed) {
      return { success: false, message: "Bạn đã nhận quà mốc Rank này rồi!" };
    }

    const [ins] = await db.query(
      "INSERT IGNORE INTO user_rank_rewards (user_id, milestone_key, reward_ecoin) VALUES (?, ?, ?)",
      [uid, ms.key, ms.reward_ecoin]
    );
    if (ins.affectedRows === 0) {
      return { success: false, message: "Bạn đã nhận quà mốc Rank này rồi!" };
    }

    await db.query("UPDATE users SET ecoin = COALESCE(ecoin, 0) + ? WHERE id = ?", [ms.reward_ecoin, uid]);
    const [[uRow]] = await db.query("SELECT ecoin FROM users WHERE id = ? LIMIT 1", [uid]);
    const newEcoin = Number(uRow?.ecoin || 0);
    logger.ok("RANKING", `Claimed rank reward ${ms.key}`, { uid, add: ms.reward_ecoin, bal: newEcoin });

    return {
      success: true,
      milestone_key: ms.key,
      reward_ecoin: ms.reward_ecoin,
      new_ecoin: newEcoin,
      message: `Đã nhận +${ms.reward_ecoin.toLocaleString("vi-VN")} Ecoin mốc ${ms.name}!`,
    };
  },
};

export default rankingService;
