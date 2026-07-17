import { state, setState } from './state.js';
import { setMessage } from './ui.js';
import { createGame, submitGuess } from './api.js';

const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('');

export function initTraditionalGame({ elements, onGameReady }) {
  const {
    letterInput,
    guessBtn,
    newGameBtn,
    difficultySelect,
    lettersRow,
    maskedWord,
    attemptsEl,
    wrongAttemptsEl,
    difficultyEl,
    gameStatusEl,
    hintArea,
    gameMessage,
  } = elements;

  function renderKeypad(guessed = [], wrong = [], status = 'playing') {
    if (!lettersRow) return;

    lettersRow.innerHTML = '';
    const used = new Set([...(guessed || []), ...(wrong || [])]);

    alphabet.forEach((letter) => {
      const button = document.createElement('button');
      button.textContent = letter.toUpperCase();
      button.disabled = status !== 'playing' || used.has(letter);
      if (used.has(letter)) button.classList.add('used');

      button.addEventListener('click', () => {
        if (status === 'playing') {
          handleGuess(letter);
        }
      });

      lettersRow.appendChild(button);
    });
  }

  function setGameState(data) {
    if (!data || !maskedWord) return;

    setState({ gameId: data.id });
    maskedWord.textContent = data.masked;
    if (attemptsEl) attemptsEl.textContent = data.attempts;
    if (wrongAttemptsEl) wrongAttemptsEl.textContent = data.wrongAttempts;
    if (difficultyEl) difficultyEl.textContent = `Dificultad: ${data.difficulty}`;
    if (gameStatusEl) gameStatusEl.textContent = data.status === 'playing' ? 'Partida en juego' : `Partida ${data.status}`;
    if (hintArea) hintArea.textContent = data.hint ? `Pista : ${data.hint}` : 'Aún no hay pista.';
    renderKeypad(data.guessedLetters, data.wrongLetters, data.status);

    if (data.status !== 'playing') {
      const text = data.status === 'won' ? '¡Ganaste!' : 'Perdiste.';
      setMessage(gameMessage, `${text} La palabra era: ${data.word}`);
    } else {
      setMessage(gameMessage, 'Intenta una letra.');
    }

    if (typeof onGameReady === 'function') {
      onGameReady(data);
    }
  }

  async function handleGuess(letter) {
    if (!state.gameId) return;
    const { response, data } = await submitGuess(letter, state.gameId);
    if (response.ok) {
      setGameState(data);
    } else {
      setMessage(gameMessage, data.error || 'Error en la jugada');
    }
  }

  async function startNewGame() {
    // Primero, nos aseguramos de que el estado del usuario esté cargado.
    if (!state.user) {
      const userFromStorage = localStorage.getItem('user');
      if (userFromStorage) {
        // Si el usuario está en localStorage pero no en el estado, lo actualizamos.
        setState({ user: JSON.parse(userFromStorage) });
      } else {
        // Si no hay usuario, no se puede iniciar una partida.
        setMessage(gameMessage, 'Por favor, inicia sesión para comenzar una nueva partida.');
        return;
      }
    }
    const { response, data } = await createGame(difficultySelect?.value || state.difficulty);
    if (response.ok) {
      setGameState(data);
    } else {
      setMessage(gameMessage, data.error || 'Error al iniciar partida');
    }
  }

  if (letterInput) {
    letterInput.addEventListener('input', () => {
      letterInput.value = letterInput.value.replace(/[^a-zA-ZñÑ]/g, '');
    });
  }

  if (guessBtn) {
    guessBtn.addEventListener('click', () => {
      const letter = letterInput?.value.trim().toLowerCase();
      if (!letter || letter.length !== 1) return;
      handleGuess(letter);
      if (letterInput) {
        letterInput.value = '';
        letterInput.focus();
      }
    });
  }

  if (newGameBtn) {
    newGameBtn.addEventListener('click', startNewGame);
  }

  return { setGameState, startNewGame };
}
