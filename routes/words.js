const express = require('express');
const { pool } = require('../db');
const { authToken, requireTeacher } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 5;
  return Math.min(Math.max(parsed, 1), 50);
}

function sanitizeAiWord(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñ]/g, '');
}

function resolveGeminiModel() {
  const configuredModel = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').replace(/^models\//, '');
  if (configuredModel === 'gemini-pro') return 'gemini-1.5-flash';
  return configuredModel;
}

async function generateAiWords({ theme, difficulty, count, teacherId }) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('La clave de API de Gemini no está configurada en el servidor.');
    error.status = 400;
    throw error;
  }

  const finalTheme = String(theme || '').trim() || 'General';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = resolveGeminiModel();
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = `Genera exactamente ${count} palabras en español para un juego de ahorcado con el tema "${finalTheme}" y dificultad "${difficulty}". Las palabras no deben contener espacios, numeros ni caracteres especiales. Devuelve unicamente un array JSON de strings.`;
  let result;

  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    console.error(`Error al generar palabras con Gemini (${modelName}):`, err);
    const error = new Error('Gemini no pudo generar palabras. Verifica GEMINI_API_KEY y usa GEMINI_MODEL=gemini-1.5-flash en Vercel.');
    error.status = 502;
    throw error;
  }

  const text = result.response.text();
  let generatedWords = [];

  try {
    const jsonMatch = text.match(/\[.*\]/s);
    if (!jsonMatch) throw new Error('La respuesta de la IA no contiene un array JSON válido.');
    generatedWords = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Error al parsear la respuesta de la IA:', text, e);
    const error = new Error('La respuesta de la IA no tuvo el formato esperado. Inténtalo de nuevo.');
    error.status = 500;
    throw error;
  }

  const cleanWords = [...new Set(generatedWords.map(sanitizeAiWord).filter(Boolean))].slice(0, count);
  const words = [];
  for (const cleanWord of cleanWords) {
    const newWord = await pool.query(
      `INSERT INTO words (word, difficulty, theme, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (word) DO UPDATE SET theme = EXCLUDED.theme, difficulty = EXCLUDED.difficulty
       RETURNING id, word, difficulty, theme`,
      [cleanWord, difficulty, finalTheme, teacherId]
    );
    words.push(newWord.rows[0]);
  }

  return { theme: finalTheme, words };
}

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
  const assignDaily = req.body.assignDaily === true;

  if (!word || !difficulty) {
    return res.status(400).json({ error: 'La palabra y la dificultad son obligatorias.' });
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({ error: 'La dificultad no es válida.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insert = await client.query(
      `INSERT INTO words (word, difficulty, theme, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, word, difficulty, theme`,
      [word, difficulty, (theme || '').trim() || 'General', req.user.id]
    );

    if (assignDaily) {
      await client.query('UPDATE daily_words SET active = false WHERE set_date = CURRENT_DATE');
      await client.query(
        `INSERT INTO daily_words (word_id, set_by, set_date, active)
         VALUES ($1, $2, CURRENT_DATE, true)`,
        [insert.rows[0].id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: assignDaily
        ? `Palabra "${word}" agregada y establecida como Palabra del Día.`
        : `Palabra "${word}" agregada.`,
      word: insert.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'La palabra ya existe en el banco.' });
    console.error('Error adding new word:', err);
    res.status(500).json({ error: 'Error al guardar la palabra.' });
  } finally {
    client.release();
  }
});

router.post('/generate', authToken, requireTeacher, async (req, res) => {
  const count = normalizeCount(req.body.count);
  const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'easy';
  const theme = String(req.body.theme || '').trim();

  if (!theme) {
    return res.status(400).json({ error: 'El tema es obligatorio para generar palabras con IA.' });
  }

  try {
    const result = await generateAiWords({ theme, difficulty, count, teacherId: req.user.id });
    if (!result.words.length) {
      return res.status(404).json({ error: 'La IA no generó palabras válidas. Inténtalo de nuevo.' });
    }
    res.status(201).json({
      message: `${result.words.length} palabra(s) generadas y agregadas al banco.`,
      theme: result.theme,
      words: result.words,
    });
  } catch (err) {
    console.error('Error generating AI words:', err);
    res.status(err.status || 500).json({ error: err.message || 'Error al generar palabras con IA.' });
  }
});

router.post('/prepare-game', authToken, requireTeacher, async (req, res) => {
  const { theme, source, difficulty, wordIds } = req.body;
  const count = normalizeCount(req.body.count);

  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({ error: 'La dificultad no es válida.' });
  }

  try {
    let words = [];
    const requestedTheme = String(theme || '').trim();
    let finalTheme = requestedTheme || 'General';

    if (source === 'manual' && Array.isArray(wordIds) && wordIds.length > 0) {
      const ids = [...new Set(wordIds.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger))];
      const result = await pool.query(
        `SELECT id, word, difficulty, theme
         FROM words
         WHERE id = ANY($1::int[])
         ORDER BY word`,
        [ids]
      );
      words = shuffle(result.rows).slice(0, count);
      finalTheme = requestedTheme || 'Selección Manual';
    } else if (source === 'random') {
      const result = await pool.query(
        `SELECT id, word, difficulty, theme
         FROM words
         WHERE ($1 = '' OR theme = $1) AND difficulty = $2
         ORDER BY RANDOM()
         LIMIT $3`,
        [requestedTheme, difficulty, count]
      );
      words = result.rows;
    } else if (source === 'ai') {
      const generated = await generateAiWords({ theme: finalTheme, difficulty, count, teacherId: req.user.id });
      finalTheme = generated.theme;
      words = generated.words;
    } else {
      return res.status(400).json({ error: 'Selecciona un origen válido para las palabras.' });
    }

    if (words.length === 0) {
      return res.status(404).json({ error: 'No se encontraron palabras con los criterios seleccionados.' });
    }

    res.json({ message: 'Partida preparada.', theme: finalTheme, words });
  } catch (err) {
    console.error('Error preparing game:', err);
    res.status(err.status || 500).json({ error: err.message || 'Error al preparar la partida temática.' });
  }
});

module.exports = router;
