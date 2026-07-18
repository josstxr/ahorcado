const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();
const MAX_WRONG = 6;

function normalizeLetter(value) {
  return String(value).toLowerCase().replace(/ñ/g, '__enie__').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/__enie__/g, 'ñ');
}

function normalizeWord(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ñ/g, '__enie__')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/__enie__/g, 'ñ')
    .replace(/[^a-zñ]/g, '');
}

function maskWord(word, guesses) {
  const guessed = new Set(guesses || []);
  return [...word].map((ch) => (guessed.has(normalizeLetter(ch)) ? ch : '_')).join(' ');
}

function missingWordPart(word, guesses) {
  const guessed = new Set(guesses || []);
  return [...word].map(normalizeLetter).filter((ch) => /^[a-zñ]$/.test(ch) && !guessed.has(ch)).join('');
}

function revealWord(word, guessed) {
  [...word].map(normalizeLetter).filter((ch) => /^[a-zñ]$/.test(ch)).forEach((ch) => guessed.add(ch));
}

function chooseHint(word, guesses) {
  const guessed = new Set(guesses || []);
  const missing = [...new Set([...word].map(normalizeLetter))].filter((ch) => /^[a-zñ]$/.test(ch) && !guessed.has(ch));
  if (!missing.length) return null;
  return missing[Math.floor(Math.random() * missing.length)];
}

function computeScore(status, difficulty, wrongAttempts) {
  if (status !== 'won') return 0;
  const base = 100;
  const difficultyBonus = difficulty === 'hard' ? 40 : difficulty === 'medium' ? 25 : 10;
  return Math.max(0, base + difficultyBonus - wrongAttempts * 10);
}

// OWASP Top 10 - A04 Insecure Design / A01 Broken Access Control
// El estado del juego se construye a partir de datos persistidos en BD y no se generan pistas dinámicas en memoria.
async function getGameState(game) {
  const wordRes = await pool.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
  if (!wordRes.rows.length) {
    // Esto indica un problema de integridad de datos, pero debemos manejarlo para no crashear el servidor.
    console.error(`Error de integridad: No se encontró la palabra con id ${game.word_id} para la partida ${game.id}`);
    throw new Error('No se pudo encontrar la palabra asociada a la partida.');
  }
  const word = wordRes.rows[0].word;

  const gameState = {
    id: game.id,
    status: game.status,
    difficulty: game.difficulty,
    player_id: game.player_id,
    masked: maskWord(word, game.guessed),
    wrongLetters: game.wrong,
    guessedLetters: game.guessed,
    wrongAttempts: game.wrong_attempts,
    attempts: game.attempts,
    hint: game.revealed_hint, 
    maxWrong: MAX_WRONG,
  };

  if (game.status !== 'playing') {
    gameState.word = word;
  }

  return gameState;
}

router.post('/', authToken, async (req, res) => {
  try {
    const playerId = req.user.id;
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'easy';
    const requestedWordId = Number.parseInt(req.body.wordId, 10);
    const assignmentId = Number.parseInt(req.body.assignmentId, 10);
    let assignedWordId = null;

    if (Number.isInteger(assignmentId)) {
      const assignment = await pool.query(
        `SELECT * FROM assigned_games WHERE id=$1 AND student_id=$2 AND status!='completed'`,
        [assignmentId, playerId]
      );
      if (!assignment.rows.length) return res.status(403).json({ error: 'La partida asignada no está disponible.' });
      assignedWordId = assignment.rows[0].word_ids[assignment.rows[0].current_index];
      if (!assignedWordId) return res.status(400).json({ error: 'La partida asignada ya fue completada.' });
    }
    const selectedWordId = assignedWordId || (Number.isInteger(requestedWordId) ? requestedWordId : null);

    const wordRow = await pool.query(
      `SELECT id, word, difficulty FROM words
       WHERE ($2::int IS NOT NULL AND id = $2) OR ($2::int IS NULL AND difficulty = $1)
       ORDER BY CASE WHEN $2::int IS NOT NULL THEN 0 ELSE 1 END, RANDOM() LIMIT 1`,
      [difficulty, selectedWordId]
    );
    if (!wordRow.rows.length) return res.status(500).json({ error: 'No hay palabras disponibles' });

    const wordId = wordRow.rows[0].id;
    const selectedDifficulty = wordRow.rows[0].difficulty || difficulty;
    const game = await pool.query(
      'INSERT INTO games (player_id, word_id, difficulty, assigned_game_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [playerId, wordId, selectedDifficulty, Number.isInteger(assignmentId) ? assignmentId : null]
    );

    if (Number.isInteger(assignmentId)) {
      await pool.query("UPDATE assigned_games SET status='playing' WHERE id=$1", [assignmentId]);
    }

    res.json(await getGameState(game.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear partida' });
  }
});

router.post('/guess', authToken, async (req, res) => {
  // OWASP Top 10 - A04 Insecure Design / A01 Broken Access Control
  // Se maneja la jugada con transacciones y bloqueo de fila para evitar condiciones de carrera y acceso no autorizado.
  const client = await pool.connect();

  try {
    const gameId = parseInt(req.body.gameId, 10);
    
    // OWASP Top 10 - A03 Injection
    // Se valida estrictamente el tipo y formato de la letra para evitar entradas maliciosas.
    if (typeof req.body.letter !== 'string') {
      return res.status(400).json({ error: 'La letra debe ser un texto de un solo carácter' });
    }

    const letter = req.body.letter.trim().toLowerCase();
    if (!gameId || letter.length !== 1 || !letter.match(/^[a-zñ]$/i)) {
      return res.status(400).json({ error: 'gameId y una letra válida son obligatorios' });
    }

    // SEGURIDAD: Iniciamos la transacción atómica
    await client.query('BEGIN');

    // OWASP Top 10 - A04 Insecure Design
    // Se usa FOR UPDATE para bloquear la fila y evitar conflictos al procesar la misma partida en paralelo.
    // Evita condiciones de carrera si un usuario manda múltiples peticiones idénticas en paralelo.
    const gameRes = await client.query('SELECT * FROM games WHERE id = $1 FOR UPDATE', [gameId]);
    if (!gameRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const game = gameRes.rows[0];

    // OWASP Top 10 - A01 Broken Access Control
    // El servidor verifica que el usuario autenticado sea el dueño de la partida antes de modificarla.
    if (Number(game.player_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para interactuar con esta partida' });
    }

    if (game.status !== 'playing') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La partida ya terminó' });
    }

    const guessed = new Set(game.guessed);
    const wrong = new Set(game.wrong);
    if (guessed.has(letter) || wrong.has(letter)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ya intentaste esa letra' });
    }

    const wordRes = await client.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
    const word = wordRes.rows[0].word.toLowerCase();
    const isCorrect = [...word].some((character) => normalizeLetter(character) === letter);

    let wrongAttempts = game.wrong_attempts;
    let attempts = game.attempts + 1;
    let status = game.status;
    let revealedHint = game.revealed_hint;

    if (isCorrect) {
      guessed.add(letter);
    } else {
      wrong.add(letter);
      wrongAttempts += 1;
      
      // La pista se calcula una única vez al tercer fallo y queda grabada permanentemente
      if (wrongAttempts >= 3 && !revealedHint) {
        revealedHint = chooseHint(word, Array.from(guessed));
      }
    }

    const masked = maskWord(word, Array.from(guessed));
    if (!masked.includes('_')) {
      status = 'won';
    } else if (wrongAttempts >= MAX_WRONG) {
      status = 'lost';
    }

    await client.query(
      'UPDATE games SET guessed = $1, wrong = $2, wrong_attempts = $3, attempts = $4, status = $5, revealed_hint = $6, finished_at = CASE WHEN $5::varchar != $7::varchar THEN now() ELSE finished_at END WHERE id = $8',
      [Array.from(guessed), Array.from(wrong), wrongAttempts, attempts, status, revealedHint, game.status, gameId]
    );

    if (status === 'won') {
      const earned = computeScore(status, game.difficulty, wrongAttempts);
      await client.query('UPDATE players SET score = score + $1 WHERE id = $2', [earned, game.player_id]);
    }

    if (status !== 'playing' && game.assigned_game_id) {
      await client.query(
        `UPDATE assigned_games
         SET current_index=current_index+1,
             status=CASE WHEN current_index+1 >= cardinality(word_ids) THEN 'completed' ELSE 'playing' END
         WHERE id=$1 AND student_id=$2`,
        [game.assigned_game_id, game.player_id]
      );
    }

    // Confirmamos todos los cambios de forma segura
    await client.query('COMMIT');

    const updatedGameRes = await client.query('SELECT * FROM games WHERE id = $1', [gameId]);
    res.json(await getGameState(updatedGameRes.rows[0]));

  } catch (err) {
    // Si algo falla, revertimos el estado para no corromper ni bloquear la base de datos
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la letra' });
  } finally {
    // Es mandatorio liberar el cliente para no agotar las conexiones del Pool
    client.release();
  }
});

router.post('/solve', authToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const gameId = parseInt(req.body.gameId, 10);
    const guess = normalizeWord(req.body.guess);

    if (!gameId || guess.length < 2 || guess.length > 60) {
      return res.status(400).json({ error: 'Ingresa la palabra completa o las letras que faltan.' });
    }

    await client.query('BEGIN');

    const gameRes = await client.query('SELECT * FROM games WHERE id = $1 FOR UPDATE', [gameId]);
    if (!gameRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const game = gameRes.rows[0];
    if (Number(game.player_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para interactuar con esta partida' });
    }

    if (game.status !== 'playing') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La partida ya terminó' });
    }

    const wordRes = await client.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
    const word = wordRes.rows[0].word.toLowerCase();
    const guessed = new Set(game.guessed);
    const normalizedWord = normalizeWord(word);
    const remaining = missingWordPart(word, game.guessed);
    const isCorrect = guess === normalizedWord || guess === remaining;

    let wrongAttempts = game.wrong_attempts;
    const attempts = game.attempts + 1;
    let status = game.status;
    let revealedHint = game.revealed_hint;

    if (isCorrect) {
      revealWord(word, guessed);
      status = 'won';
    } else {
      wrongAttempts += 1;
      if (wrongAttempts >= 3 && !revealedHint) {
        revealedHint = chooseHint(word, Array.from(guessed));
      }
      if (wrongAttempts >= MAX_WRONG) {
        status = 'lost';
      }
    }

    await client.query(
      'UPDATE games SET guessed = $1, wrong_attempts = $2, attempts = $3, status = $4, revealed_hint = $5, finished_at = CASE WHEN $4::varchar != $6::varchar THEN now() ELSE finished_at END WHERE id = $7',
      [Array.from(guessed), wrongAttempts, attempts, status, revealedHint, game.status, gameId]
    );

    if (status === 'won') {
      const earned = computeScore(status, game.difficulty, wrongAttempts);
      await client.query('UPDATE players SET score = score + $1 WHERE id = $2', [earned, game.player_id]);
    }

    if (status !== 'playing' && game.assigned_game_id) {
      await client.query(
        `UPDATE assigned_games
         SET current_index=current_index+1,
             status=CASE WHEN current_index+1 >= cardinality(word_ids) THEN 'completed' ELSE 'playing' END
         WHERE id=$1 AND student_id=$2`,
        [game.assigned_game_id, game.player_id]
      );
    }

    await client.query('COMMIT');

    const updatedGameRes = await client.query('SELECT * FROM games WHERE id = $1', [gameId]);
    res.json(await getGameState(updatedGameRes.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al resolver la palabra' });
  } finally {
    client.release();
  }
});

module.exports = router;
