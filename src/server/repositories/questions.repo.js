import db from "../config/db.js";

const questionsRepo = {
  /**
   * Lấy một câu hỏi ngẫu nhiên từ database.
   * @returns {Promise<Object|null>} Câu hỏi nếu có, null nếu không tìm thấy.
   */
  async getRandomQuestion() {
    const [rows] = await db.query(`
      SELECT id, question, option_a, option_b, option_c, option_d, correct_answer
      FROM questions
      ORDER BY RAND()
      LIMIT 1
    `);

    if (rows.length === 0) return null;

    const q = rows[0];
    return {
      id: q.id,
      question: q.question,
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d,
      correct: q.correct_answer
    };
  }
};

export default questionsRepo;