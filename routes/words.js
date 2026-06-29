const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden ver las palabras' });
    }

    const result = await pool.query(
      'SELECT id, word, difficulty FROM words ORDER BY difficulty, word'
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching words:', err);
    res.status(500).json({ error: 'Error cargando las palabras' });
  }
});

router.post('/', authToken, async (req, res) => {
  try {
    // SEGURIDAD: No loguear el objeto 'req.user' completo para evitar la fuga de datos sensibles (como hashes de contraseñas)
    console.log('Request to add word:', { userId: req.user.id, role: req.user.role });
    
    // Control de acceso por rol
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden añadir palabras' });
    }

    // SEGURIDAD: Validación estricta del tipo de dato entrante
    if (typeof req.body.word !== 'string') {
      return res.status(400).json({ error: 'La palabra debe ser un formato de texto válido' });
    }

    const word = req.body.word.trim().toLowerCase();
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : null;

    // SEGURIDAD: Sanitización por Expresión Regular. 
    // Asegura que la palabra contenga ÚNICAMENTE letras (incluyendo eñes, acentos y diéresis), evitando caracteres especiales o scripts.
    const validWordRegex = /^[a-zñáéíóúü]+$/;

    if (!word || !difficulty) {
      return res.status(400).json({ error: 'Palabra y dificultad son obligatorios' });
    }

    if (!validWordRegex.test(word)) {
      return res.status(400).json({ error: 'La palabra solo debe contener letras válidas, sin números ni caracteres especiales' });
    }

    // Inserción segura mediante consultas parametrizadas
    await pool.query(
      'INSERT INTO words (word, difficulty, created_by) VALUES ($1, $2, $3)', 
      [word, difficulty, req.user.id]
    );

    res.json({ message: 'Palabra agregada correctamente' });
  } catch (err) {
    console.error('Error adding word:', err);

    // Manejo seguro del error de clave duplicada (PostgreSQL error code 23505)
    if (err.code === '23505') {
      return res.status(400).json({ error: 'La palabra ya existe en el sistema' });
    }
    
    // SEGURIDAD: No exponer 'err.message' directamente al cliente para no revelar detalles internos de la base de datos
    res.status(500).json({ error: 'Error interno al agregar la palabra' });
  }
});

module.exports = router;