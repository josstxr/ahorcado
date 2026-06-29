const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();

// 1. Obtener palabra del día (para estudiantes - enmascarada)
// SEGURIDAD: Ahora requiere authToken para evitar que cualquiera husmee respuestas usando IDs ajenos
router.get('/', authToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dw.id, w.word, w.difficulty, 
             COALESCE(dwa.answer_letter, null) as user_answer,
             dwa.is_correct, dwa.points_earned, dwa.response_time_ms
      FROM daily_words dw
      JOIN words w ON dw.word_id = w.id
      LEFT JOIN daily_word_answers dwa ON dw.id = dwa.daily_word_id 
        AND dwa.player_id = $1
      WHERE dw.set_date = CURRENT_DATE AND dw.active = true
      LIMIT 1
    `, [req.user.id]); // SEGURIDAD: Extraído estrictamente del Token, no de req.query

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No hay palabra del día disponible' });
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
      response_time_ms: row.response_time_ms,
    });
  } catch (err) {
    console.error('Error getting daily word:', err);
    res.status(500).json({ error: 'Error obteniendo palabra del día' });
  }
});

// 2. Profesor: establecer palabra del día
router.post('/', authToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden establecer palabra del día' });
    }

    const wordId = parseInt(req.body.wordId, 10);
    if (!wordId) {
      return res.status(400).json({ error: 'Debes seleccionar una palabra válida' });
    }

    await client.query('BEGIN');

    // Desactivar palabra del día anterior
    await client.query(
      'UPDATE daily_words SET active = false WHERE set_date = CURRENT_DATE'
    );

    // Crear nueva palabra del día
    const result = await client.query(
      `INSERT INTO daily_words (word_id, set_by, set_date, active) 
       VALUES ($1, $2, CURRENT_DATE, true)
       RETURNING id`,
      [wordId, req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Palabra del día establecida correctamente',
      id: result.rows[0].id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error setting daily word:', err);
    res.status(500).json({ error: 'Error al establecer palabra del día' });
  } finally {
    client.release();
  }
});

// 3. Estudiante: responder palabra del día (Con sistema de bonificación por velocidad)
router.post('/answer', authToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const dailyWordId = parseInt(req.body.dailyWordId, 10);
    
    if (typeof req.body.answerLetter !== 'string') {
      return res.status(400).json({ error: 'La respuesta debe ser un formato de texto válido' });
    }
    
    const answerLetter = req.body.answerLetter.trim().toLowerCase();

    if (!dailyWordId || answerLetter.length !== 1) {
      return res.status(400).json({ error: 'Datos de respuesta inválidos o incompletos' });
    }

    await client.query('BEGIN');

    // SEGURIDAD: Verificar si el usuario YA respondió a esta palabra específica para evitar duplicación de puntos
    const existingAnswer = await client.query(
      'SELECT id FROM daily_word_answers WHERE daily_word_id = $1 AND player_id = $2',
      [dailyWordId, req.user.id]
    );

    if (existingAnswer.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ya has respondido a la palabra del día de hoy' });
    }

    // Obtener palabra del día y la hora exacta en que se creó (para calcular el tiempo de manera interna y segura)
    const wordResult = await client.query(
      `SELECT dw.id, w.word, w.difficulty, dw.created_at
       FROM daily_words dw
       JOIN words w ON dw.word_id = w.id
       WHERE dw.id = $1 AND dw.active = true`,
      [dailyWordId]
    );

    if (wordResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La palabra del día no está disponible o ya expiró' });
    }

    const { word, difficulty, created_at: wordCreatedAt } = wordResult.rows[0];
    const isCorrect = answerLetter === word.charAt(0).toLowerCase();

    // SEGURIDAD: El tiempo de procesamiento se calcula en el servidor.
    // Restamos la hora actual del servidor menos la hora en que se publicó la palabra.
    const serverElapsedTimeMs = Date.now() - new Date(wordCreatedAt).getTime();

    // Calcular puntos basado en la agilidad de respuesta y dificultad
    let points = 0;
    if (isCorrect) {
      const basePoints = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 25 : 50;
      
      // Bonificación por velocidad controlada internamente
      const velocityBonus = Math.max(0, 100 - Math.floor(serverElapsedTimeMs / 100)); 
      points = basePoints + velocityBonus;
    }

    // Registrar respuesta de manera definitiva (Sin vulnerabilidad de DO UPDATE que altere el score consecutivamente)
    const answerResult = await client.query(
      `INSERT INTO daily_word_answers 
       (daily_word_id, player_id, answer_letter, response_time_ms, is_correct, points_earned)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, points_earned`,
      [dailyWordId, req.user.id, answerLetter, serverElapsedTimeMs, isCorrect, points]
    );

    // Actualizar score acumulado del jugador
    if (isCorrect && points > 0) {
      await client.query(
        'UPDATE players SET score = score + $1 WHERE id = $2',
        [points, req.user.id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: isCorrect ? '¡Correcto!' : 'Incorrecto',
      isCorrect,
      answer: word.charAt(0).toUpperCase(),
      pointsEarned: points,
      responseTimeMs: serverElapsedTimeMs
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error submitting daily word answer:', err);
    res.status(500).json({ error: 'Error al registrar la respuesta' });
  } finally {
    client.release();
  }
});

// 4. Obtener tabla de clasificación de la palabra del día
router.get('/leaderboard/:dailyWordId', authToken, async (req, res) => {
  try {
    const dailyWordId = parseInt(req.params.dailyWordId, 10);
    if (!dailyWordId) {
      return res.status(400).json({ error: 'ID de palabra del día inválido' });
    }

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
    res.status(500).json({ error: 'Error obteniendo la tabla de clasificación' });
  }
});

module.exports = router;