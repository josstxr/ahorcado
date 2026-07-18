import { setState } from './state.mjs';
import { setMessage } from './ui.mjs';
import { createGame, loadDailyChallenge, submitGuess } from './api.mjs';

const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('');

export function initDailyChallenge({ elements }) {
  const {
    challengeWaiting,
    challengeGame,
    challengeResult,
    challengeLeaderboard,
    challengeMaskedWord,
    challengeDifficultyBadge,
    challengeStatus,
    challengeLettersRow,
    challengeAttemptsEl,
    challengeWrongAttemptsEl,
    challengeHangmanParts,
    challengeAttemptMeterFill,
    challengeHintArea,
    challengeMessage,
  } = elements;

  let dailyGameId = null;
  let requestPending = false;

  function renderHangman(wrongAttempts = 0) {
    challengeHangmanParts?.forEach((part) => {
      part.classList.toggle('visible', Number(part.dataset.step) <= wrongAttempts);
    });
    if (challengeAttemptMeterFill) {
      challengeAttemptMeterFill.style.width = `${Math.min(100, (wrongAttempts / 6) * 100)}%`;
    }
  }

  function renderKeypad(guessed = [], wrong = [], status = 'playing') {
    if (!challengeLettersRow) return;
    challengeLettersRow.innerHTML = '';
    const correctSet = new Set(guessed || []);
    const wrongSet = new Set(wrong || []);

    alphabet.forEach((letter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = letter.toUpperCase();
      button.dataset.letter = letter;
      button.disabled = status !== 'playing' || correctSet.has(letter) || wrongSet.has(letter);
      if (correctSet.has(letter)) button.classList.add('used', 'correct');
      if (wrongSet.has(letter)) button.classList.add('used', 'wrong');
      button.addEventListener('click', () => {
        button.blur();
        handleGuess(letter);
      });
      challengeLettersRow.appendChild(button);
    });
  }

  function renderGame(data) {
    dailyGameId = data.id;
    if (challengeMaskedWord) challengeMaskedWord.textContent = data.masked;
    if (challengeAttemptsEl) challengeAttemptsEl.textContent = data.attempts;
    if (challengeWrongAttemptsEl) challengeWrongAttemptsEl.textContent = data.wrongAttempts;
    if (challengeDifficultyBadge) {
      challengeDifficultyBadge.textContent = `Dificultad: ${data.difficulty === 'easy' ? 'fácil' : data.difficulty === 'medium' ? 'media' : 'difícil'}`;
    }
    if (challengeStatus) {
      challengeStatus.textContent = data.status === 'playing'
        ? 'Partida diaria'
        : data.status === 'won'
          ? '¡Palabra descubierta!'
          : 'Fin de la partida diaria';
    }
    if (challengeHintArea) {
      challengeHintArea.textContent = data.hint
        ? `Pista: la letra “${data.hint.toUpperCase()}” aparece en la palabra.`
        : 'La pista aparecerá después de tres fallos.';
    }
    renderHangman(data.wrongAttempts);
    renderKeypad(data.guessedLetters, data.wrongLetters, data.status);

    if (data.status === 'won') {
      setMessage(challengeMessage, `¡Excelente! Adivinaste “${data.word}”.`);
    } else if (data.status === 'lost') {
      setMessage(challengeMessage, `La palabra era “${data.word}”. Inténtalo de nuevo mañana.`);
    } else {
      setMessage(challengeMessage, 'Selecciona una letra para resolver la palabra del día.');
    }
  }

  async function handleGuess(letter) {
    if (!dailyGameId || requestPending) return;
    requestPending = true;
    challengeLettersRow?.classList.add('is-loading');
    try {
      const { response, data } = await submitGuess(letter, dailyGameId);
      if (response.ok) renderGame(data);
      else setMessage(challengeMessage, data.error || 'No se pudo procesar la letra.');
    } catch {
      setMessage(challengeMessage, 'No se pudo conectar con el servidor.');
    } finally {
      requestPending = false;
      challengeLettersRow?.classList.remove('is-loading');
    }
  }

  async function loadChallenge() {
    try {
      if (challengeWaiting) challengeWaiting.classList.remove('hidden');
      if (challengeGame) challengeGame.classList.add('hidden');
      if (challengeResult) challengeResult.classList.add('hidden');
      if (challengeLeaderboard) challengeLeaderboard.classList.add('hidden');
      setMessage(challengeWaiting, 'Comprobando disponibilidad del servidor...');

      const { response, data } = await loadDailyChallenge();
      if (!response.ok || !data.wordId) {
        setMessage(challengeWaiting, data.message || data.error || 'No hay palabra del día configurada.');
        return;
      }

      setState({ dailyWordId: data.id });
      const gameResponse = await createGame(data.difficulty, data.wordId);
      if (!gameResponse.response.ok) {
        setMessage(challengeWaiting, gameResponse.data.error || 'No se pudo iniciar la palabra del día.');
        return;
      }

      if (challengeWaiting) challengeWaiting.classList.add('hidden');
      if (challengeGame) challengeGame.classList.remove('hidden');
      renderGame(gameResponse.data);
    } catch (error) {
      console.error('Error loading daily hangman:', error);
      setMessage(challengeWaiting, 'Error cargando la palabra del día.');
    }
  }

  return { loadChallenge };
}
