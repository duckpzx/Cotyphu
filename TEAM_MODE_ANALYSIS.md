# 📊 Team 2v2 Mode Analysis - Cờ Tỷ Phú

## ✅ HOÀN THÀNH (Implemented)

### 1. **Room Creation & Join** ✅
- ✅ RoomListScene: Có UI chọn mode "Team" (2vs2)
- ✅ Server validation: `VALID_MATCH_MODES` bao gồm `"team_2v2"`
- ✅ Room service: Support `team_2v2` với max 4 players
- ✅ Team assignment: `resolveTeamId()` tự động assign team dựa trên slot
  - Slot 0,1 → Team 0
  - Slot 2,3 → Team 1

### 2. **Room UI** ✅
- ✅ RoomScene có flag `_isTeam` để detect team mode
- ✅ VS Banner hiển thị giữa 2 team
- ✅ Layout player slots đặc biệt cho team:
  ```
  [Slot 0] [Slot 1]  VS  [Slot 2] [Slot 3]
   Team 0              Team 1
  ```
- ✅ Start button validation: Cần đủ 4 người cho team mode
- ✅ Status message khác cho team: "Team 2v2: cần đủ 4 người"

### 3. **Game Logic - Team Protection** ✅
- ✅ `isSameTeam()`: Kiểm tra 2 user có cùng team không
- ✅ `getRealEnemyIds()`: Lấy danh sách đối thủ (khác team)
- ✅ Không thể target đồng đội với:
  - ❌ Skip turn (Công An)
  - ❌ Phá tinh cầu (Thần Đập)
  - ❌ Hoán đổi tinh cầu (Thần Hoán Đổi)

### 4. **Rent Logic** ✅
- ✅ Miễn thuê khi dừng ô của đồng đội:
  ```javascript
  // server.js line ~2214
  // Ô của đồng đội (team_2v2) => miễn thuê
  ```

### 5. **Team Skills** ✅
- ✅ **Nhận Trợ Giúp** (steal_cash_percent):
  - Solo: Lấy 20% tiền 1 người
  - Team: Lấy 20% tiền CẢ 2 đối thủ
- ✅ **Công An** (skip_turn_enemy):
  - Phải chọn người từ team đối phương
  - Không cho phép target đồng đội
- ✅ **Thần Đập** (destroy_enemy_planet):
  - Chỉ phá được tinh cầu đối thủ
  - Không phá được của đồng đội
- ✅ **Thần Hoán Đổi** (swap_planet):
  - Chỉ swap với đối thủ
  - Không swap với đồng đội

### 6. **Win Condition - Team Mode** ✅
```javascript
// server.js handleSurrender và bankruptcy
if (isTeam2v2) {
  // Đếm số team còn lại
  const remainingByTeam = {};
  gs.players.forEach(p => {
    const tid = p.team_id ?? "none";
    remainingByTeam[tid] = (remainingByTeam[tid] || 0) + 1;
  });
  const teamsLeft = Object.keys(remainingByTeam).length;
  
  if (teamsLeft <= 1) {
    // Chỉ còn 1 team → Game Over
    await handleGameOver(room_id, gs, allPlayerIds);
  }
}
```

**Logic**:
- ✅ Khi 1 người bị phá sản/surrender → remove khỏi game
- ✅ Kiểm tra số team còn lại
- ✅ Nếu chỉ còn 1 team → Game Over
- ✅ Nếu đồng đội vẫn còn → game tiếp tục

### 7. **Payout Logic** ✅
```javascript
const winner = gs.players[0]; // Người còn lại cuối cùng
const loserIds = allPlayerIds.filter(id => id !== winner.user_id);
const winAmount = bet * loserIds.length;

// Winner nhận: bet × số người thua
// VD: 2v2, bet 5M, Team A win → mỗi người Team A nhận 5M × 2 = 10M
```

## ⚠️ VẤN ĐỀ CẦN FIX (Issues)

### 1. **CRITICAL: Win Reward Chia Team** ❌
**Vấn đề**: Hiện tại chỉ 1 người nhận toàn bộ tiền thắng!

```javascript
// server.js handleGameOver
const winner = gs.players[0]; // ← CHỈ 1 NGƯỜI
await db.query("UPDATE users SET ecoin = ecoin + ? WHERE id = ?", 
  [winAmount, winner.user_id]); // ← CHỈ CỘNG CHO 1 NGƯỜI
```

**Cần sửa**:
- Team mode: Chia đều tiền thắng cho CẢ TEAM
- VD: Team thắng 10M → mỗi người 5M

### 2. **Game Over Display** ⚠️
**Vấn đề**: Client emit "game:game_over" chỉ hiện 1 winner

```javascript
io.emit("game:game_over", {
  winner_user_id: winner.user_id,  // ← CHỈ 1 NGƯỜI
  winner_name: winner.name,
  // ...
});
```

**Cần sửa**:
- Team mode: Gửi array winner_team = [user1, user2]
- UI hiển thị "Team 0 thắng!" thay vì tên 1 người

### 3. **Stats Update** ⚠️
**Vấn đề**: Chỉ update stats cho 1 người

```javascript
await db.query(
  "UPDATE users SET total_games = total_games + 1, total_wins = total_wins + 1 WHERE id = ?",
  [winner.user_id] // ← CHỈ 1 NGƯỜI
);
```

**Cần sửa**:
- Update total_wins cho CẢ TEAM
- Losers vẫn +1 total_games

### 4. **Game Results Record** ⚠️
**Vấn đề**: Chỉ lưu 1 winner_id

```javascript
INSERT INTO game_results
  (room_id, match_mode, bet_ecoin, winner_id, winner_name, ...)
VALUES (?, ?, ?, ?, ?, ...)
```

**Cần sửa**:
- Thêm column `winner_team_ids` (JSON array)
- Hoặc thêm flag `is_team` + team_id

### 5. **History Display** ⚠️
**Vấn đề**: LobbyScene lịch sử chỉ show 1 winner

```javascript
// LobbyScene.js
const modeMap = { 
  solo_2: "1v1", 
  solo_3: "1v1v1", 
  solo_4: "FFA", 
  team_2v2: "2v2" // ✅ Có map
};
// Nhưng không có logic hiển thị team winners
```

**Cần sửa**:
- Parse winner_team_ids nếu là team mode
- Hiển thị "Team 0 thắng" thay vì tên 1 người

### 6. **BoardScene UI - Team Indicator** ⚠️
**Vấn đề**: Không có visual indicator cho teammate

**Cần thêm**:
- Border/màu đặc biệt cho player panels của đồng đội
- Icon team (A/B hoặc 0/1) trên mỗi player
- Highlight teammate khác màu

### 7. **Chat - Team Chat** ❌ (Optional)
**Hiện tại**: Tất cả đều thấy chat

**Có thể thêm**:
- Team-only chat channel
- Tab "Team" và "All"

## 📋 CHECKLIST FIX TEAM MODE

### High Priority (Must Fix)
- [ ] **Fix payout**: Chia đều tiền thắng cho cả team
- [ ] **Fix game over event**: Gửi array winners thay vì 1 người
- [ ] **Fix stats update**: Update total_wins cho cả team
- [ ] **Fix game_results**: Lưu array winner_ids cho team

### Medium Priority (Should Fix)
- [ ] **UI team indicator**: Visual cue cho teammates
- [ ] **History display**: Show team winners properly
- [ ] **Bankruptcy team notice**: "Đồng đội của bạn bị phá sản"

### Low Priority (Nice to Have)
- [ ] Team chat channel
- [ ] Team strategy planning phase
- [ ] Team achievements/stats

## 💡 IMPLEMENTATION PLAN

### Phase 1: Fix Core Logic
1. Modify `handleGameOver()` để detect team mode
2. Chia đều winAmount cho team members
3. Update game_over event structure
4. Update stats cho cả team

### Phase 2: Fix UI
1. BoardScene: Add team indicators
2. LobbyScene: Fix history display
3. RoomScene: Already good ✅

### Phase 3: Testing
1. Test 2v2 full game flow
2. Test win condition (1 team eliminated)
3. Test payout distribution
4. Test stats update

## 🎯 SUMMARY

**Tình trạng hiện tại**: Team mode đã implement **75%**

✅ **Hoàn thành**:
- Room creation/join logic
- Team assignment (slot → team_id)
- Team protection (không target teammate)
- Win condition (check teams left)
- Rent immunity cho teammate
- Team-aware skills

❌ **Chưa hoàn thành**:
- Chia tiền thắng cho cả team (CRITICAL)
- Display multiple winners
- Stats update cho team
- UI team indicators

**Kết luận**: Code đã có framework tốt cho team mode, nhưng cần fix phần **payout** và **display** để hoàn thiện!
