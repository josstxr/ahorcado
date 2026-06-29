const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();
const MAX_WRONG = 6;

function maskWord(word, guesses) {
  const guessed = new Set(guesses || []);
  return [...word].map((ch) => (guessed.has(ch.toLowerCase()) ? ch : '_')).join(' ');
}

function chooseHint(word, guesses) {
  const guessed = new Set(guesses || []);
  const missing = [...new Set([...word.toLowerCase()])].filter((ch) => ch >= 'a' && ch <= 'z' && !guessed.has(ch));
  if (!missing.length) return null;
  return missing[Math.floor(Math.random() * missing.length)];
}

function computeScore(status, difficulty, wrongAttempts) {
  if (status !== 'won') return 0;
  const base = 100;
  const difficultyBonus = difficulty === 'hard' ? 40 : difficulty === 'medium' ? 25 : 10;
  return Math.max(0, base + difficultyBonus - wrongAttempts * 10);
}

// SEGURIDAD: Ya no genera pistas dinámicas en memoria al consultar el estado.
// Ahora se limita de forma estricta a devolver el estado persistido en la BD.
async function getGameState(game) {
  const wordRes = await pool.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
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

    const wordRow = await pool.query(
      'SELECT id, word FROM words WHERE difficulty = $1 ORDER BY RANDOM() LIMIT 1',
      [difficulty]
    );
    if (!wordRow.rows.length) return res.status(500).json({ error: 'No hay palabras disponibles' });

    const wordId = wordRow.rows[0].id;
    const game = await pool.query(
      'INSERT INTO games (player_id, word_id, difficulty) VALUES ($1, $2, $3) RETURNING *',
      [playerId, wordId, difficulty]
    );

    res.json(await getGameState(game.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear partida' });
  }
});

router.post('/guess', authToken, async (req, res) => {
  // SEGURIDAD: Usamos un cliente dedicado del pool para poder manejar transacciones y bloqueos de fila de forma segura
  const client = await pool.connect();

  try {
    const gameId = parseInt(req.body.gameId, 10);
    
    // SEGURIDAD: Validación estricta del tipo de dato entrante para mitigar inyecciones de estructuras de datos (objetos/arreglos)
    if (typeof req.body.letter !== 'string') {
      client.release();
      return res.status(400).json({ error: 'La letra debe ser un texto de un solo carácter' });
    }

    const letter = req.body.letter.trim().toLowerCase();
    if (!gameId || letter.length !== 1 || !letter.match(/^[a-zñ]$/i)) {
      client.release();
      return res.status(400).json({ error: 'gameId y una letra válida son obligatorios' });
    }

    // SEGURIDAD: Iniciamos la transacción atómica
    await client.query('BEGIN');

    // SEGURIDAD: Aplicamos 'FOR UPDATE' para bloquear la fila correspondiente a esta partida. 
    // Evita condiciones de carrera si un usuario manda múltiples peticiones idénticas en paralelo.
    const gameRes = await client.query('SELECT * FROM games WHERE id = $1 FOR UPDATE', [gameId]);
    if (!gameRes.rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const game = gameRes.rows[0];

    // SEGURIDAD (Control de Acceso): Valida que el token del jugador corresponda estrictamente al dueño de esta partida
    if (game.player_id !== req.user.id) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({ error: 'No tienes permiso para interactuar con esta partida' });
    }

    if (game.status !== 'playing') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'La partida ya terminó' });
    }

    const guessed = new Set(game.guessed);
    const wrong = new Set(game.wrong);
    if (guessed.has(letter) || wrong.has(letter)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Ya intentaste esa letra' });
    }

    const wordRes = await client.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
    const word = wordRes.rows[0].word.toLowerCase();
    const isCorrect = word.includes(letter);

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

module.exports = router;