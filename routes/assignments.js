const express = require('express');
const { pool } = require('../db');
const { authToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

router.get('/students', authToken, requireTeacher, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, first_name, last_name FROM players WHERE role = 'student' ORDER BY first_name, last_name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading students:', err);
    res.status(500).json({ error: 'Error al cargar la lista de alumnos.' });
  }
});

router.get('/mine', authToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.json([]);
  }
  try {
    const result = await pool.query(
      `SELECT ag.*, p.name as teacher_name, cardinality(ag.word_ids) as word_count
       FROM assigned_games ag
       JOIN players p ON ag.teacher_id = p.id
       WHERE ag.student_id = $1 AND ag.status != 'completed'
       ORDER BY ag.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading assignments for student:', err);
    res.status(500).json({ error: 'Error al cargar tus actividades.' });
  }
});

router.post('/', authToken, requireTeacher, async (req, res) => {
  const { studentIds, wordIds, theme, difficulty } = req.body;
  const teacherId = req.user.id;

  if (!Array.isArray(studentIds) || studentIds.length === 0 || !Array.isArray(wordIds) || wordIds.length === 0) {
    return res.status(400).json({ error: 'Se requieren IDs de alumnos y de palabras.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const studentId of studentIds) {
      await client.query(
        `INSERT INTO assigned_games (teacher_id, student_id, theme, difficulty, word_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [teacherId, studentId, theme, difficulty, wordIds]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: `Partida asignada a ${studentIds.length} alumno(s).` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating assignments:', err);
    res.status(500).json({ error: 'Error al asignar la partida.' });
  } finally {
    client.release();
  }
});

module.exports = router;