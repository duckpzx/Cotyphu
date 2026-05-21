<div align="center">

# Cờ Tỷ Phú — Đấu Trường Trí Tuệ

**Monopoly gặp vũ trụ huyền bí. Chiến thuật gặp may rủi. Bạn gặp... phá sản.**

![Node.js](https://img.shields.io/badge/Node.js-Express%205-339933?style=flat-square&logo=node.js)
![Phaser](https://img.shields.io/badge/Phaser-3-8B0000?style=flat-square&logo=phaser)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql)
![JWT](https://img.shields.io/badge/Auth-JWT-F7B731?style=flat-square)

</div>

---

## Về game này

Bạn từng chơi Monopoly và nghĩ "game này thiếu thẻ bài ma thuật và hành tinh vũ trụ"? Không? Thôi thì giờ có rồi đấy.

**Cờ Tỷ Phú** là game board multiplayer realtime — tung xúc xắc, mua hành tinh, thu thuế, và dùng thẻ Tarot để phá đám đối thủ. Người cuối cùng còn tiền thắng. Đơn giản vậy thôi (nhưng không dễ đâu).

Khác với Monopoly truyền thống:
- Không có nhà tù (nhưng có ô quái vật phá nhà)
- Không có thẻ cơ hội (có thẻ Tarot xịn hơn)
- Không có tranh cãi về luật (server quyết hết)
- Có thể phá nhà đối thủ (chaos mode: on)

---

## Chơi thế nào?

### Cơ bản
1. Tung xúc xắc → di chuyển
2. Đáp vào ô trống → mua (hoặc không, tùy)
3. Đáp vào ô người khác → trả thuê (đau)
4. Hết tiền → bay màu
5. Còn một mình → thắng

### Không cơ bản
- **Thẻ Tarot**: Dùng trước khi tung xúc xắc. Có thể skip lượt đối thủ, cướp tiền, phá nhà, hoán đổi hành tinh... Mỗi lá có cooldown riêng.
- **Tax Boost**: Ngẫu nhiên 1-2 ô bất kỳ sẽ tăng tiền thuê x1.2-x1.8 trong 5 lượt. Không ai biết trước. Đó là điểm hay.
- **Ô kỹ năng**: Ô 9 và 18 cho bạn trả lời câu hỏi (đúng = tiền, sai = về ô 0). Ô 28 là quái vật phá ngẫu nhiên một hành tinh đối thủ.

---

## Thẻ Tarot (9 loại)

Mỗi người được trang bị tối đa 2 lá trước khi vào ván. Chọn khôn ngoan.

| Thẻ | Tác dụng | Khi nào dùng |
|-----|----------|--------------|
| **Công An** | Skip lượt đối thủ | Khi họ sắp về đích |
| **Xúc Xắc Ma Thuật** | Tung thêm lần nữa ngay sau lượt này | Khi muốn đi xa hơn |
| **Nhận Trợ Giúp** | Cướp 20% tiền tất cả đối thủ | Khi bạn nghèo, họ giàu |
| **Nhanh Chân** | Di chuyển thêm 1-6 ô (tránh nhà đối thủ nếu có thể) | Khi sắp đạp phải bẫy |
| **Tài Phiệt** | Buff 1-2 hành tinh của bạn với hệ số thuê x1.2-x1.6 | Khi có nhiều đất |
| **Thần Giữ Của** | Hoàn 100% tiền thuê nếu đạp nhà người khác lượt này | Trước khi vào vùng nguy hiểm |
| **Giải Tỏa** | Phá một hành tinh đối thủ | Khi muốn xem họ khóc |
| **Hoán Đổi** | Swap quyền sở hữu 2 hành tinh (1 của bạn, 1 của họ) | Big brain move |
| **Tài Phú** | Nhận 30% tiền khởi đầu từ hệ thống | Đầu game, lấy lợi thế |

**Lưu ý**: Mỗi lượt chỉ dùng được 1 lá. Dùng xong phải chờ cooldown. Không spam được đâu.

---

## Tech stack

Vì bạn hỏi (hoặc không hỏi nhưng tôi vẫn nói):

**Frontend**
- Phaser 3 — game engine, render mọi thứ
- Socket.IO client — realtime sync với server

**Backend**
- Node.js + Express 5 — API và static files
- Socket.IO 4.8 — đồng bộ game state realtime
- MySQL 8 — lưu user, nhân vật, thẻ bài, câu hỏi
- JWT — auth (không dùng session vì stateless ngầu hơn)

**Khác**
- Compression — gzip response cho nhanh
- dotenv — quản lý biến môi trường

---

## Cài đặt

### Yêu cầu
- Node.js >= 18
- MySQL >= 8
- Não (để chơi)

### Bước 1: Clone repo
```bash
git clone https://github.com/duckpzx/Cotyphu.git
cd cotyphu
npm install
```

### Bước 2: Setup database
Tạo database MySQL tên `cotyphu` và import schema (nếu có file SQL). Hoặc để code tự tạo bảng lần đầu chạy (nếu có migration).

### Bước 3: Config môi trường
Tạo file `.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cotyphu

JWT_SECRET=random_string_dai_dai_nhe
JWT_EXPIRES=7d
```

### Bước 4: Chạy
```bash
node server.js
```

Mở trình duyệt: `http://localhost:3000`

---

## Cấu trúc code

```
cotyphu/
├── server.js                    # Entry point — Express + Socket.IO
├── src/
│   ├── main.js                  # Phaser config, khởi tạo game
│   ├── config.js                # Server URL
│   ├── scenes/                  # Các màn hình game
│   │   ├── LoginScene.js        # Đăng nhập
│   │   ├── LobbyScene.js        # Sảnh chính
│   │   ├── RoomListScene.js     # Danh sách phòng
│   │   ├── RoomScene.js         # Phòng chờ
│   │   ├── BoardScene.js        # Bàn cờ (màn chính)
│   │   ├── TarotScene.js        # Chọn thẻ bài
│   │   ├── BagScene.js          # Túi đồ
│   │   ├── ShopScene.js         # Cửa hàng
│   │   └── components/          # UI components
│   │       ├── TarotModalSystem.js
│   │       ├── TarotButtonWidget.js
│   │       └── PowerDiceSystem.js
│   └── server/
│       ├── services/            # Business logic
│       ├── repositories/        # Database queries
│       ├── handlers/            # Socket.IO event handlers
│       ├── config/db.js         # MySQL connection
│       └── utils/               # Helper functions
└── assets/
    ├── characters/              # Sprite sheets nhân vật
    ├── ui/                      # Backgrounds, icons
    ├── music/                   # Nhạc nền
    └── resources/               # Hành tinh, xúc xắc, etc.
```

---

## Socket.IO Events

### Client → Server
| Event | Mô tả |
|-------|-------|
| `roll_dice` | Tung xúc xắc |
| `buy_cell` | Mua ô đang đứng |
| `use_tarot` | Dùng thẻ bài |
| `tarot_target_selected` | Chọn mục tiêu cho thẻ (nếu cần) |
| `ready` | Sẵn sàng trong phòng chờ |
| `start_game` | Host bắt đầu game |

### Server → Client
| Event | Mô tả |
|-------|-------|
| `game_state` | Sync toàn bộ trạng thái game |
| `dice_result` | Kết quả xúc xắc + animation di chuyển |
| `tarot_effect` | Hiệu ứng thẻ bài được kích hoạt |
| `turn_changed` | Chuyển lượt |
| `player_bankrupt` | Ai đó phá sản |
| `game_over` | Kết thúc ván, công bố winner |

---

## Luồng chơi

```
LoginScene
    ↓
LobbyScene (chọn "Đấu Trường Trí Tuệ")
    ↓
RoomListScene (tạo/vào phòng)
    ↓
RoomScene (chờ đủ người, ready)
    ↓
BoardScene (chơi game)
    ↓
Game Over (ai còn tiền thắng)
```

---

## Nhân vật

7 nhân vật, mỗi nhân vật nhiều skin:

- **Dark Oracle** — Thầy bói bóng tối
- **Forest Ranger** — Kiểm lâm rừng sâu
- **Golem** — Người đá khổng lồ
- **Minotaur** — Bò đầu người (classic)
- **Necromancer of the Shadow** — Pháp sư bóng tối
- **Reaper Man** — Thần chết cầm lưỡi hái
- **Zombie Villager** — Dân làng zombie

Mỗi nhân vật có animation idle (đứng chớp mắt) và run (chạy). Render trực tiếp trên bàn cờ.

---

## Tính năng đặc biệt

### Tax Boost
Sau mỗi vài lượt, hệ thống random 1-2 ô bất kỳ và tăng tiền thuê x1.2-x1.8 trong 5 lượt. Không ai biết trước ô nào. Đó là phần thú vị — bạn có thể đột nhiên giàu lên hoặc phá sản vì đạp phải ô boost.

### Bảo vệ hành tinh
Thẻ "Bảo Vệ" cho phép bạn khóa 1 hành tinh khỏi mọi tác động (phá nhà, hoán đổi, tăng thuế) trong 3 lượt. Dùng để bảo vệ hành tinh quan trọng.

### Ô kỹ năng
- **Ô 0**: Điểm xuất phát, an toàn
- **Ô 9 & 18**: Trả lời câu hỏi. Đúng = tiền thưởng. Sai hoặc timeout 2 lần liên tiếp = về ô 0
- **Ô 28**: Quái vật phá ngẫu nhiên 1 hành tinh đối thủ

---

## Roadmap (có thể)

- [ ] Chế độ 2v2 team
- [ ] Thêm thẻ Tarot mới
- [ ] Ranking toàn server
- [ ] Replay ván đấu
- [ ] Mobile responsive (hiện tại desktop only)
- [ ] Thêm nhân vật mới
- [ ] Skin shop với ecoin

---

## Known Issues

- Đôi khi animation hơi lag nếu mạng chậm (Socket.IO đang cố sync)
- Chưa có reconnect logic — disconnect = thua
- UI chưa optimize cho màn hình nhỏ

---

## Credits

- Game design & code: [duckpzx](https://github.com/duckpzx)
- Phaser 3 community vì docs tốt
- Stack Overflow vì... mọi thứ
- Coffee vì tồn tại

---

<div align="center">

**"Vận may chỉ mỉm cười với người biết chuẩn bị."**

*(Và người biết dùng thẻ Tarot đúng lúc)*

Made with ☕ and a lot of dice rolls.

</div>
