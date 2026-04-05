import tarotRepo from "../repositories/tarot.repo.js";

const tarotService = {
  async getAllTarots() {
    const tarots = await tarotRepo.getAllTarots();

    return {
      success: true,
      data: tarots
    };
  },

  async saveActiveTarot(userId, tarotIds) {
    if (!userId) {
      return {
        success: false,
        message: "Thiếu userId"
      };
    }

    if (!Array.isArray(tarotIds)) {
      return {
        success: false,
        message: "Dữ liệu tarot phải là mảng"
      };
    }

    if (tarotIds.length > 2) {
      return {
        success: false,
        message: "Chỉ được chọn tối đa 2 lá bài"
      };
    }

    const uniqueIds = new Set(tarotIds);
    if (uniqueIds.size !== tarotIds.length) {
        return { success: false, message: "Không được chọn 2 lá bài giống nhau" };
    }

    const allTarots = await tarotRepo.getAllTarots();
    const validIds = allTarots.map(t => Number(t.id));

    const isValid = tarotIds.every(
      (id) => Number.isInteger(id) && validIds.includes(id)
    );

    if (!isValid) {
      return {
        success: false,
        message: "Lá bài không hợp lệ"
      };
    }

    const saved = await tarotRepo.saveActiveTarotIds(userId, tarotIds);

    if (!saved) {
      return {
        success: false,
        message: "Không lưu được tarot"
      };
    }

    return {
      success: true,
      message: "Lưu tarot thành công",
      active_tarot_ids: tarotIds
    };
  },

  async getActiveTarot(userId) {
    if (!userId) {
      return {
        success: false,
        message: "Thiếu userId"
      };
    }

    const tarotIds = await tarotRepo.getActiveTarotIds(userId);

    if (tarotIds === null) {
      return {
        success: false,
        message: "Không tìm thấy user"
      };
    }

    const tarots = await tarotRepo.getTarotsByIds(tarotIds);

    return {
      success: true,
      active_tarot_ids: tarotIds,
      active_tarots: tarots
    };
  }
};

export default tarotService;