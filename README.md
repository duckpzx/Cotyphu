<div align="center">

```
 ██████╗ ██████╗     ████████╗██╗   ██╗    ██████╗ ██╗  ██╗██╗   ██╗
██╔════╝██╔═══██╗    ╚══██╔══╝╚██╗ ██╔╝    ██╔══██╗██║  ██║██║   ██║
██║     ██║   ██║       ██║    ╚████╔╝     ██████╔╝███████║██║   ██║
██║     ██║   ██║       ██║     ╚██╔╝      ██╔═══╝ ██╔══██║██║   ██║
╚██████╗╚██████╔╝       ██║      ██║       ██║     ██║  ██║╚██████╔╝
 ╚═════╝ ╚═════╝        ╚═╝      ╚═╝       ╚═╝     ╚═╝  ╚═╝ ╚═════╝
```

# ✨ Cờ Tỷ Phú — Đấu Trường Trí Tuệ ✨

**Game board đa người chơi thời gian thực — chinh phục hành tinh, triệu hồi thẻ bài, trở thành tỷ phú vũ trụ.**

![Node.js](https://img.shields.io/badge/Node.js-Express%205-339933?style=flat-square&logo=node.js)
![Phaser](https://img.shields.io/badge/Phaser-3-8B0000?style=flat-square&logo=phaser)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io)
![MySQL](https://img.shields.io/badge/MySQL-2-4479A1?style=flat-square&logo=mysql)
![JWT](https://img.shields.io/badge/Auth-JWT-F7B731?style=flat-square)

</div>

---

## 🌌 Giới thiệu

**Cờ Tỷ Phú** là một tựa game board chiến thuật nhiều người chơi, lấy cảm hứng từ Monopoly nhưng được tái sinh trong một vũ trụ huyền bí đầy màu sắc. Người chơi hóa thân thành những nhà thám hiểm vũ trụ — tung xúc xắc, chinh phục các hành tinh, thu thuế đối thủ, và sử dụng những lá bài Tarot huyền bí để lật ngược thế cờ.

Không chỉ là may mắn — đây là cuộc chiến của trí tuệ, chiến lược và thời điểm.

---

## 🎮 Tính năng nổi bật

### 🎲 Gameplay Board Game Thời Gian Thực
- Bàn cờ **37 ô** với hệ thống sở hữu hành tinh độc đáo
- Tung xúc xắc, di chuyển nhân vật với animation mượt mà
- Mua đất, xây hành tinh, thu thuê từ đối thủ đặt chân lên lãnh thổ của bạn
- Hệ thống **Tax Boost** ngẫu nhiên — tiền thuê có thể tăng đột biến bất cứ lúc nào
- Phá sản → loại khỏi ván đấu, người cuối cùng đứng vững là người chiến thắng

### 🃏 Hệ thống Thẻ Bài Tarot
Mỗi người chơi được trang bị tối đa **2 lá bài Tarot** với 9 loại hiệu ứng khác nhau:

| Lá bài | Hiệu ứng |
|--------|----------|
| ⏭️ Skip Turn | Khiến đối thủ bỏ lượt tiếp theo |
| 🎲 Extra Roll | Tung thêm xúc xắc ngay lập tức |
| 💰 Steal Cash | Cướp 20% tiền mặt của tất cả đối thủ |
| 🚀 Move Forward | Dịch chuyển thêm 1–6 ô về phía trước |
| 📈 Tax Multiplier | Buff hành tinh của bạn với hệ số thuê 1.2–1.6× |
| 🛡️ Recover House | Hoàn tiền 100% nếu đáp xuống đất đối thủ lượt này |
| 💥 Destroy House | Phá hủy một hành tinh của đối thủ |
| 🔄 Swap Planet | Hoán đổi quyền sở hữu hai hành tinh |
| 🎁 Bonus Cash | Nhận thưởng tiền mặt |

- Mỗi lá bài có **cooldown** riêng — dùng khôn ngoan, đừng lãng phí
- Chỉ được dùng **1 lá/lượt**, trước khi tung xúc xắc
- Giao diện modal đẹp mắt với animation, thanh cooldown trực tiếp

### 🌍 Ô Kỹ Năng Đặc Biệt
- **Ô 0** — Điểm xuất phát, an toàn
- **Ô 9** — Thử thách trí tuệ: trả lời câu hỏi để nhận thưởng
- **Ô 18** — Gặp Thầy Giáo: kiểm tra kiến thức
- **Ô 28** — Quái Vật: phá hủy ngẫu nhiên một hành tinh của đối thủ

### 👥 Phòng Chờ & Matchmaking
- Tạo/tham gia phòng với mức cược tùy chọn
- Hỗ trợ chế độ **solo_4** (4 người)
- Đổi vị trí slot, sẵn sàng, đếm ngược bắt đầu
- Host có quyền kick và khởi động ván đấu

### 🧙 Nhân Vật & Skin
7 nhân vật độc đáo với nhiều skin khác nhau:

> `Dark Oracle` · `Forest Ranger` · `Golem` · `Minotaur`
> `Necromancer of the Shadow` · `Reaper Man` · `Zombie Villager`

Mỗi nhân vật có animation **Idle Blinking** và **Run** với nhiều frame, được render trực tiếp trên bàn cờ.

---

## 🏗️ Kiến trúc

```
cotyphu/
├── server.js                    # Entry point — Express + Socket.IO server
├── src/
│   ├── scenes/                  # Phaser Scenes (frontend)
│   │   ├── LoginScene.js        # Đăng nhập với UI animated
│   │   ├── LobbyScene.js        # Sảnh chính — điều hướng
│   │   ├── RoomScene.js         # Phòng chờ trước ván đấu
│   │   ├── BoardScene.js        # Bàn cờ — gameplay chính
│   │   ├── TarotScene.js        # Chọn & trang bị thẻ bài
│   │   ├── ShopScene.js         # Cửa hàng cosmetics
│   │   └── components/
│   │       ├── TarotModalSystem.js   # Hệ thống modal thẻ bài (v2)
│   │       ├── TarotButtonWidget.js  # Widget nút mở thẻ bài
│   │       └── PowerDiceSystem.js    # Hệ thống xúc xắc animated
│   └── server/
│       ├── services/            # Business logic
│       │   ├── user.service.js
│       │   ├── room.service.js
│       │   ├── tarot.service.js
│       │   ├── character.service.js
│       │   └── questions.service.js
│       ├── repositories/        # Database access layer
│       ├── config/db.js         # MySQL connection
│       └── utils/               # Helpers (playerData, ecoinManager...)
└── assets/
    ├── characters/              # Sprite sheets & animations
    └── ui/                      # Backgrounds, icons, UI elements
```

---

## 🚀 Cài đặt & Chạy

### Yêu cầu
- Node.js >= 18
- MySQL >= 8

### 1. Clone & cài dependencies

```bash
git clone <repo-url>
cd cotyphu
npm install
```

### 2. Cấu hình môi trường

Tạo file `.env` tại thư mục gốc:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cotyphu

JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES=7d
```

### 3. Khởi động server

```bash
node server.js
```

Mở trình duyệt tại `http://localhost:3000`

---

## 🔌 Socket.IO Events

### Client → Server
| Event | Mô tả |
|-------|-------|
| `roll_dice` | Yêu cầu tung xúc xắc |
| `buy_cell` | Mua ô đang đứng |
| `use_tarot` | Sử dụng lá bài Tarot |
| `tarot_target_selected` | Chọn mục tiêu cho thẻ bài |
| `ready` | Sẵn sàng trong phòng chờ |
| `start_game` | Host bắt đầu ván đấu |

### Server → Client
| Event | Mô tả |
|-------|-------|
| `game_state` | Đồng bộ toàn bộ trạng thái game |
| `dice_result` | Kết quả xúc xắc + di chuyển |
| `tarot_effect` | Hiệu ứng thẻ bài được kích hoạt |
| `turn_changed` | Chuyển lượt |
| `player_bankrupt` | Người chơi phá sản |
| `game_over` | Kết thúc ván đấu |

---

## 🛠️ Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Game Engine | Phaser 3 |
| Backend | Node.js + Express 5 |
| Realtime | Socket.IO 4.8 |
| Database | MySQL 8 + mysql2 |
| Auth | JWT (jsonwebtoken) |
| Config | dotenv |

---

## 📸 Luồng game

```
LoginScene
    ↓  (đăng nhập thành công)
LobbyScene
    ↓  (nhấn "Đấu Trường Trí Tuệ")
RoomListScene → RoomScene
    ↓  (host bắt đầu)
BoardScene  ←→  TarotScene (trang bị thẻ trước ván)
    ↓  (người cuối cùng còn tiền)
Game Over
```

---

<div align="center">

Made with ☕ and a lot of dice rolls.

*"Vận may chỉ mỉm cười với người biết chuẩn bị."*

</div>
