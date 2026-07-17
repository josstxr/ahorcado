const express = require('express');
const { pool } = require('../db');
const { authToken, requireTeacher } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

router.get('/', authToken, requireTeacher, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM words ORDER BY theme, word');
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading words for teacher:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/', authToken, requireTeacher, async (req, res) => {
  const { difficulty, theme } = req.body;
  const word = String(req.body.word || '').trim().toLowerCase().split(' ')[0];

  if (!word || !difficulty) {
    return res.status(400).json({ error: 'La palabra y la dificultad son obligatorias.' });
  }
  try {
    await pool.query(
      'INSERT INTO words (word, difficulty, theme) VALUES ($1, $2, $3)',
      [word, difficulty, (theme || '').trim() || 'General']
    );
    res.status(201).json({ message: `Palabra "${word}" agregada.` });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'La palabra ya existe en el banco.' });
    console.error('Error adding new word:', err);
    res.status(500).json({ error: 'Error al guardar la palabra.' });
  }
});

router.post('/prepare-game', authToken, requireTeacher, async (req, res) => {
  const { theme, count, source, difficulty, wordIds } = req.body;

  try {
    let words = [];
    let finalTheme = theme;

    if (source === 'manual' && wordIds && wordIds.length > 0) {
      const result = await pool.query('SELECT id, word, difficulty FROM words WHERE id = ANY($1::int[])', [wordIds]);
      words = result.rows;
      finalTheme = theme || 'Selección Manual';
    } else if (source === 'random') {
      const result = await pool.query(
        `SELECT id, word, difficulty FROM words WHERE ($1 = '' OR theme = $1) AND difficulty = $2 ORDER BY RANDOM() LIMIT $3`,
        [theme || '', difficulty, count]
      );
      words = result.rows;
    } else if (source === 'ai') {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: 'La clave de API de Gemini no está configurada en el servidor.' });
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-pro" });
      const prompt = `Genera una lista de ${count} palabras en español para un juego de ahorcado con el tema "${theme}" y dificultad "${difficulty}". Las palabras no deben contener espacios ni caracteres especiales. Devuelve únicamente un array JSON de strings, como por ejemplo: ["palabra1", "palabra2"]. No incluyas texto adicional ni explicaciones.`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      let generatedWords = [];
      try {
        // Extraer el contenido JSON, incluso si está rodeado de texto o bloques de código.
        const jsonMatch = text.match(/\[.*\]/s);
        if (!jsonMatch) throw new Error('La respuesta de la IA no contiene un array JSON válido.');
        generatedWords = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Error al parsear la respuesta de la IA:', text, e);
        return res.status(500).json({ error: 'La respuesta de la IA no tuvo el formato esperado. Inténtalo de nuevo.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const rawWord of generatedWords) {
          const word = String(rawWord).trim().toLowerCase().split(' ')[0];
          if (!word) continue; // Ignorar palabras vacías que pueda devolver la IA
          const newWord = await client.query(
            'INSERT INTO words (word, difficulty, theme) VALUES ($1, $2, $3) ON CONFLICT (word) DO UPDATE SET theme = EXCLUDED.theme RETURNING id, word, difficulty',
            [word, difficulty, theme || 'IA']
          );
          words.push(newWord.rows[0]);
        }
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('Error guardando palabras de IA en la BD:', dbErr);
        return res.status(500).json({ error: 'Error al guardar las palabras generadas en la base de datos.' });
      } finally {
        client.release();
      }
    }

    if (words.length === 0) {
      return res.status(404).json({ error: 'No se encontraron palabras con los criterios seleccionados.' });
    }

    res.json({ message: 'Partida preparada.', theme: finalTheme, words: words });
  } catch (err) {
    console.error('Error preparing game:', err);
    res.status(500).json({ error: 'Error al preparar la partida temática.' });
  }
});

module.exports = router;