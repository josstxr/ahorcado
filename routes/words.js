const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();

router.post('/', authToken, async (req, res) => {
  try {
    console.log('Request to add word:', { user: req.user, body: req.body });
    
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Solo profesores pueden añadir palabras' });

    const word = String(req.body.word || '').trim();
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : null;
    if (!word || !difficulty) return res.status(400).json({ error: 'Palabra y dificultad son obligatorios' });

    await pool.query('INSERT INTO words (word, difficulty, created_by) VALUES ($1, $2, $3)', [word, difficulty, req.user.id]);
    res.json({ message: 'Palabra agregada correctamente' });
  } catch (err) {
    console.error('Error adding word:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'La palabra ya existe' });
    }
    res.status(500).json({ error: `Error al agregar palabra: ${err.message}` });
  }
});

module.exports = router;
