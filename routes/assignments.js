const express = require('express');
const { pool } = require('../db');
const { authToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function distributeWords(wordIds, studentIds) {
  const shuffledWords = shuffle(wordIds);
  const buckets = studentIds.map(() => []);
  shuffledWords.forEach((wordId, index) => {
    buckets[index % studentIds.length].push(wordId);
  });
  return buckets;
}

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

router.get('/teacher', authToken, requireTeacher, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ag.id,
         ag.theme,
         ag.difficulty,
         ag.status,
         ag.current_index,
         ag.created_at,
         cardinality(ag.word_ids) as word_count,
         p.name as student_username,
         p.first_name as student_first_name,
         p.last_name as student_last_name
       FROM assigned_games ag
       JOIN players p ON ag.student_id = p.id
       WHERE ag.teacher_id = $1
       ORDER BY ag.created_at DESC, ag.id DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading assignments for teacher:', err);
    res.status(500).json({ error: 'Error al cargar las partidas temáticas.' });
  }
});

router.post('/', authToken, requireTeacher, async (req, res) => {
  const { studentIds, wordIds, theme, difficulty } = req.body;
  const teacherId = req.user.id;

  if (!Array.isArray(studentIds) || studentIds.length === 0 || !Array.isArray(wordIds) || wordIds.length === 0) {
    return res.status(400).json({ error: 'Se requieren IDs de alumnos y de palabras.' });
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({ error: 'La dificultad no es válida.' });
  }

  const cleanStudentIds = [...new Set(studentIds.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger))];
  const cleanWordIds = [...new Set(wordIds.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger))];

  if (!cleanStudentIds.length || !cleanWordIds.length) {
    return res.status(400).json({ error: 'Se requieren alumnos y palabras válidas.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const students = await client.query(
      "SELECT id FROM players WHERE role = 'student' AND id = ANY($1::int[])",
      [cleanStudentIds]
    );
    const validStudentIds = students.rows.map((row) => row.id);
    if (!validStudentIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se encontraron alumnos válidos para asignar.' });
    }

    const words = await client.query('SELECT id FROM words WHERE id = ANY($1::int[])', [cleanWordIds]);
    const validWordIds = words.rows.map((row) => row.id);
    if (!validWordIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se encontraron palabras válidas para asignar.' });
    }

    const assignments = distributeWords(validWordIds, validStudentIds);
    let created = 0;
    for (const [index, assignedWordIds] of assignments.entries()) {
      if (!assignedWordIds.length) continue;
      await client.query(
        `INSERT INTO assigned_games (teacher_id, student_id, theme, difficulty, word_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [teacherId, validStudentIds[index], String(theme || '').trim() || 'General', difficulty, assignedWordIds]
      );
      created += 1;
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: `Partida repartida aleatoriamente entre ${created} alumno(s).`,
      assignedStudents: created,
      totalWords: validWordIds.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating assignments:', err);
    res.status(500).json({ error: 'Error al asignar la partida.' });
  } finally {
    client.release();
  }
});

router.delete('/:id', authToken, requireTeacher, async (req, res) => {
  const assignmentId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(assignmentId)) {
    return res.status(400).json({ error: 'La partida no es válida.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM assigned_games WHERE id = $1 AND teacher_id = $2 RETURNING id',
      [assignmentId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'No se encontró esa partida temática para tu profesor.' });
    }

    res.json({ message: 'Partida temática eliminada.' });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({ error: 'Error al eliminar la partida temática.' });
  }
});

module.exports = router;
