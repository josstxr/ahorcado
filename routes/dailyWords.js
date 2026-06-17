const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();

// Obtener palabra del día (para estudiantes - mascarada)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dw.id, w.word, w.difficulty, 
             COALESCE(dwa.answer_letter, null) as user_answer,
             dwa.is_correct, dwa.points_earned
      FROM daily_words dw
      JOIN words w ON dw.word_id = w.id
      LEFT JOIN daily_word_answers dwa ON dw.id = dwa.daily_word_id 
        AND dwa.player_id = $1
      WHERE dw.set_date = CURRENT_DATE AND dw.active = true
      LIMIT 1
    `, [req.query.userId || null]);

    if (result.rows.length === 0) {
      return res.json({ message: 'No hay palabra del día disponible' });
    }

    const row = result.rows[0];
    const word = row.word.toLowerCase();
    const maskedWord = '*'.repeat(word.length);

    res.json({
      id: row.id,
      word: maskedWord,
      difficulty: row.difficulty,
      user_answer: row.user_answer,
      is_correct: row.is_correct,
      points_earned: row.points_earned,
    });
  } catch (err) {
    console.error('Error getting daily word:', err);
    res.status(500).json({ error: 'Error obteniendo palabra del día' });
  }
});

// Profesor: establecer palabra del día
router.post('/', authToken, async (req, res) => {
  try {
    console.log('Setting daily word:', { user: req.user, body: req.body });

    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden establecer palabra del día' });
    }

    const wordId = req.body.wordId;
    if (!wordId) {
      return res.status(400).json({ error: 'Debes seleccionar una palabra' });
    }

    // Desactivar palabra del día anterior
    await pool.query(
      'UPDATE daily_words SET active = false WHERE set_date = CURRENT_DATE',
      []
    );

    // Crear nueva palabra del día
    const result = await pool.query(
      `INSERT INTO daily_words (word_id, set_by, set_date, active) 
       VALUES ($1, $2, CURRENT_DATE, true)
       RETURNING id`,
      [wordId, req.user.id]
    );

    res.json({
      message: 'Palabra del día establecida correctamente',
      id: result.rows[0].id,
    });
  } catch (err) {
    console.error('Error setting daily word:', err);
    res.status(500).json({ error: `Error al establecer palabra del día: ${err.message}` });
  }
});

// Estudiante: responder palabra del día (tipo kahoot)
router.post('/answer', authToken, async (req, res) => {
  try {
    console.log('Answering daily word:', { user: req.user.id, body: req.body });

    const { dailyWordId, answerLetter, responseTimeMs } = req.body;

    if (!dailyWordId || !answerLetter || responseTimeMs === undefined) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Obtener palabra del día con su palabra asociada
    const wordResult = await pool.query(
      `SELECT dw.id, w.word, w.difficulty 
       FROM daily_words dw
       JOIN words w ON dw.word_id = w.id
       WHERE dw.id = $1`,
      [dailyWordId]
    );

    if (wordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Palabra del día no encontrada' });
    }

    const { word, difficulty } = wordResult.rows[0];
    const isCorrect = answerLetter.toLowerCase() === word.charAt(0).toLowerCase();

    // Calcular puntos basado en velocidad y dificultad
    let points = 0;
    if (isCorrect) {
      const basePts = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 25 : 50;
      const speedBonus = Math.max(0, 100 - Math.floor(responseTimeMs / 100)); // Menos tiempo = más bonus
      points = basePts + speedBonus;
    }

    // Registrar respuesta (con UNIQUE constraint previene duplicados)
    const answerResult = await pool.query(
      `INSERT INTO daily_word_answers 
       (daily_word_id, player_id, answer_letter, response_time_ms, is_correct, points_earned)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (daily_word_id, player_id) 
       DO UPDATE SET 
         answer_letter = EXCLUDED.answer_letter,
         response_time_ms = EXCLUDED.response_time_ms,
         is_correct = EXCLUDED.is_correct,
         points_earned = EXCLUDED.points_earned,
         created_at = now()
       RETURNING id, points_earned, is_correct`,
      [dailyWordId, req.user.id, answerLetter, responseTimeMs, isCorrect, points]
    );

    // Actualizar score del jugador
    if (isCorrect) {
      await pool.query(
        'UPDATE players SET score = score + $1 WHERE id = $2',
        [points, req.user.id]
      );
    }

    res.json({
      message: isCorrect ? '¡Correcto!' : 'Incorrecto',
      isCorrect,
      answer: word.charAt(0).toUpperCase(),
      points,
      totalPoints: answerResult.rows[0].points_earned,
    });
  } catch (err) {
    console.error('Error submitting daily word answer:', err);
    res.status(500).json({ error: `Error al registrar respuesta: ${err.message}` });
  }
});

// Obtener leaderboard de palabra del día
router.get('/leaderboard/:dailyWordId', async (req, res) => {
  try {
    const { dailyWordId } = req.params;

    const result = await pool.query(
      `SELECT p.id, p.name, p.first_name, p.last_name, 
              dwa.response_time_ms, dwa.points_earned, dwa.is_correct,
              ROW_NUMBER() OVER (ORDER BY dwa.points_earned DESC, dwa.response_time_ms ASC) as rank
       FROM daily_word_answers dwa
       JOIN players p ON dwa.player_id = p.id
       WHERE dwa.daily_word_id = $1 AND dwa.is_correct = true
       ORDER BY dwa.points_earned DESC, dwa.response_time_ms ASC
       LIMIT 10`,
      [dailyWordId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error getting daily word leaderboard:', err);
    res.status(500).json({ error: 'Error obteniendo leaderboard' });
  }
});

module.exports = router;
