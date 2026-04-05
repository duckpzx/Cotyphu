import roomRepo from "../repositories/room.repo.js";

const VALID_ROOM_TYPES = ["pho_thong", "tan_thu", "cao_thu", "bac_thay"];
const VALID_MATCH_MODES = ["solo_2", "solo_3", "solo_4", "team_2v2"];
const VALID_ROOM_STATUSES = ["waiting", "playing", "closed"];
const VALID_BET_ECOINS = [5000, 20000, 50000, 200000, 500000, 1000000, 5000000];

const MATCH_MODE_TO_MAX_PLAYERS = {
  solo_2: 2,
  solo_3: 3,
  solo_4: 4,
  team_2v2: 4
};

const roomService = {
  async createRoom(payload) {
    const {
      host_user_id,
      room_type,
      match_mode,
      bet_ecoin,
      is_private = 0,
      room_password = null
    } = payload;

    if (!host_user_id) {
      return {
        success: false,
        message: "Thiếu host_user_id"
      };
    }

    if (!VALID_ROOM_TYPES.includes(room_type)) {
      return {
        success: false,
        message: "Loại phòng không hợp lệ"
      };
    }

    if (!VALID_MATCH_MODES.includes(match_mode)) {
      return {
        success: false,
        message: "Kiểu chơi không hợp lệ"
      };
    }

    if (!VALID_BET_ECOINS.includes(Number(bet_ecoin))) {
      return {
        success: false,
        message: "Mức cược không hợp lệ"
      };
    }

    const privateFlag = Number(is_private) === 1 ? 1 : 0;
    const normalizedPassword =
      privateFlag === 1 ? String(room_password || "").trim() : null;

    if (privateFlag === 1 && !normalizedPassword) {
      return {
        success: false,
        message: "Phòng nội bộ phải có mật khẩu"
      };
    }

    if (normalizedPassword && normalizedPassword.length > 255) {
      return {
        success: false,
        message: "Mật khẩu quá dài"
      };
    }

    const maxPlayers = MATCH_MODE_TO_MAX_PLAYERS[match_mode];

    const roomData = {
      room_type,
      match_mode,
      bet_ecoin: Number(bet_ecoin),
      max_players: maxPlayers,
      current_players: 1,
      host_user_id: Number(host_user_id),
      room_status: "waiting",
      is_private: privateFlag,
      room_password: normalizedPassword || null
    };

    const roomId = await roomRepo.createRoom(roomData);

    if (!roomId) {
      return {
        success: false,
        message: "Không tạo được phòng"
      };
    }

    const room = await roomRepo.getRoomById(roomId);

    return {
      success: true,
      message: "Tạo phòng thành công",
      room
    };
  },

  async getRoomById(roomId) {
    if (!roomId) {
      return {
        success: false,
        message: "Thiếu roomId"
      };
    }

    const room = await roomRepo.getRoomById(roomId);

    if (!room) {
      return {
        success: false,
        message: "Không tìm thấy phòng"
      };
    }

    return {
      success: true,
      room
    };
  },

  async getOpenRooms() {
    const rooms = await roomRepo.getOpenRooms();

    return {
      success: true,
      rooms
    };
  },

  async getVisibleRooms(roomType = null) {
    const rooms = await roomRepo.getVisibleRooms(roomType);

    return {
      success: true,
      rooms
    };
  }
};

export default roomService;