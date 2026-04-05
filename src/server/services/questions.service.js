import questionsRepo from "../repositories/questions.repo.js";

const questionsService = {
  /**
   * Lấy một câu hỏi ngẫu nhiên.
   * @returns {Promise<Object>} { success: boolean, message?: string, question?: Object }
   */
  async getRandomQuestion() {
    const question = await questionsRepo.getRandomQuestion();

    if (!question) {
      return {
        success: false,
        message: "Không có câu hỏi nào trong hệ thống"
      };
    }

    return {
      success: true,
      question
    };
  }
};

export default questionsService;