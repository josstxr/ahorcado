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

async function getGameState(game) {
  const wordRes = await pool.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
  const word = wordRes.rows[0].word;
  const masked = maskWord(word, game.guessed);
  const hint = game.revealed_hint || (game.wrong_attempts >= 3 ? chooseHint(word, game.guessed) : null);

  return {
    id: game.id,
    status: game.status,
    difficulty: game.difficulty,
    player_id: game.player_id,
    masked,
    wrongLetters: game.wrong,
    guessedLetters: game.guessed,
    wrongAttempts: game.wrong_attempts,
    attempts: game.attempts,
    hint,
    maxWrong: MAX_WRONG,
  };
}

router.post('/game', authToken, async (req, res) => {
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
  try {
    const gameId = parseInt(req.body.gameId, 10);
    const letter = String(req.body.letter || '').trim().toLowerCase();
    if (!gameId || !letter.match(/^[a-zñ]$/i)) {
      return res.status(400).json({ error: 'gameId y una letra válida son obligatorios' });
    }

    const gameRes = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (!gameRes.rows.length) return res.status(404).json({ error: 'Partida no encontrada' });
    const game = gameRes.rows[0];
    if (game.status !== 'playing') return res.status(400).json({ error: 'La partida ya terminó' });

    const guessed = new Set(game.guessed);
    const wrong = new Set(game.wrong);
    if (guessed.has(letter) || wrong.has(letter)) {
      return res.status(400).json({ error: 'Ya intentaste esa letra' });
    }

    const wordRes = await pool.query('SELECT word FROM words WHERE id = $1', [game.word_id]);
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

    await pool.query(
      'UPDATE games SET guessed = $1, wrong = $2, wrong_attempts = $3, attempts = $4, status = $5, revealed_hint = $6, finished_at = CASE WHEN $5::varchar != $7::varchar THEN now() ELSE finished_at END WHERE id = $8',
      [Array.from(guessed), Array.from(wrong), wrongAttempts, attempts, status, revealedHint, game.status, gameId]
    );

    if (status === 'won') {
      const earned = computeScore(status, game.difficulty, wrongAttempts);
      await pool.query('UPDATE players SET score = score + $1 WHERE id = $2', [earned, game.player_id]);
    }

    const updatedGameRes = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
    res.json(await getGameState(updatedGameRes.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la letra' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, score FROM players ORDER BY score DESC, created_at ASC LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el ranking' });
  }
});

module.exports = router;
