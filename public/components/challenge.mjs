import { state, setState } from './state.mjs';
import { setMessage } from './ui.mjs';
import { loadDailyChallenge, submitDailyChallengeAnswer, loadDailyChallengeLeaderboard } from './api.mjs';

let timerInterval = null;

export function initDailyChallenge({ elements }) {
  const {
    challengeWaiting,
    challengeGame,
    challengeResult,
    challengeLeaderboard,
    challengeMaskedWord,
    challengeDifficultyBadge,
    challengeLetterInput,
    challengeMessage,
    timerText,
    timerProgress,
    resultTitle,
    resultMessage,
    resultPoints,
    resultTime,
    challengeLeaderboardBtn,
    challengeBackBtn,
    challengeRankingList,
    challengeAnswerForm,
  } = elements;

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function startChallengeTimer() {
    clearTimer();
    const maxTime = 30;
    let timeLeft = maxTime;

    timerInterval = setInterval(() => {
      timeLeft -= 1;
      if (timerText) timerText.textContent = `${timeLeft}s`;

      const circumference = 2 * Math.PI * 45;
      const offset = circumference - (timeLeft / maxTime) * circumference;
      if (timerProgress) timerProgress.style.strokeDashoffset = offset;

      if (timeLeft <= 0) {
        clearTimer();
        if (challengeLetterInput) challengeLetterInput.disabled = true;
        setMessage(challengeMessage, 'Tiempo agotado');
      }
    }, 1000);
  }

  function showChallengeResult(isCorrect, points, responseTimeMs) {
    if (challengeGame) challengeGame.classList.add('hidden');
    if (challengeResult) challengeResult.classList.remove('hidden');

    const resultEl = challengeResult?.querySelector('.result-content');
    if (resultEl) {
      resultEl.className = `result-content ${isCorrect ? 'correct' : 'incorrect'}`;
    }

    if (resultTitle) resultTitle.textContent = isCorrect ? '¡Correcto!' : 'Respuesta Incorrecta';
    if (resultMessage) {
      resultMessage.textContent = isCorrect
        ? 'Agilidad mental comprobada.'
        : 'Has fallado la inicial de la palabra del día.';
    }
    if (resultPoints) resultPoints.textContent = isCorrect ? `+${points}` : '0';
    if (resultTime) resultTime.textContent = responseTimeMs != null ? `${(responseTimeMs / 1000).toFixed(2)}s` : '--';
  }

  async function loadChallenge() {
    try {
      if (challengeWaiting) challengeWaiting.classList.remove('hidden');
      if (challengeGame) challengeGame.classList.add('hidden');
      if (challengeResult) challengeResult.classList.add('hidden');
      if (challengeLeaderboard) challengeLeaderboard.classList.add('hidden');

      const { response, data } = await loadDailyChallenge();
      if (!response.ok) {
        setMessage(challengeWaiting, data.error || 'Error cargando el desafío diario');
        return;
      }

      if (!data.id) {
        setMessage(challengeWaiting, data.message || 'No hay palabra del día configurada.');
        return;
      }

      setState({ dailyWordId: data.id, challengeStartTime: Date.now() });
      if (challengeMaskedWord) challengeMaskedWord.textContent = data.word;
      if (challengeDifficultyBadge) {
        challengeDifficultyBadge.textContent = data.difficulty === 'easy' ? 'Fácil' : data.difficulty === 'medium' ? 'Medio' : 'Difícil';
        challengeDifficultyBadge.className = `challenge-difficulty-badge ${data.difficulty}`;
      }

      if (data.user_answer) {
        if (challengeWaiting) challengeWaiting.classList.add('hidden');
        showChallengeResult(data.is_correct, data.points_earned, data.response_time_ms);
      } else {
        if (challengeWaiting) challengeWaiting.classList.add('hidden');
        if (challengeGame) challengeGame.classList.remove('hidden');
        if (challengeLetterInput) {
          challengeLetterInput.disabled = false;
          challengeLetterInput.value = '';
        }
        startChallengeTimer();
      }
    } catch (error) {
      console.error('Error loading speed challenge:', error);
      setMessage(challengeWaiting, 'Error cargando el desafío diario');
    }
  }

  async function submitAnswer() {
    if (!state.dailyWordId) return;

    const letter = (challengeLetterInput?.value || '').trim().toLowerCase();
    if (!letter || letter.length !== 1) {
      setMessage(challengeMessage, 'Ingresa una letra válida');
      return;
    }

    try {
      clearTimer();
      const { response, data } = await submitDailyChallengeAnswer(state.dailyWordId, letter);
      if (response.ok) {
        showChallengeResult(data.isCorrect, data.pointsEarned, data.responseTimeMs);
      } else {
        setMessage(challengeMessage, data.error || 'Error al procesar respuesta');
      }
    } catch (error) {
      console.error('Error submitting response:', error);
      setMessage(challengeMessage, 'Error de conectividad');
    }
  }

  async function showLeaderboard() {
    if (!state.dailyWordId) return;

    try {
      const { response, data } = await loadDailyChallengeLeaderboard(state.dailyWordId);
      if (!response.ok) return;

      if (challengeRankingList) {
        challengeRankingList.innerHTML = '';
        data.forEach((player) => {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.className = 'player-name';
          nameSpan.textContent = `${player.first_name} ${player.last_name}`;

          const pointsSpan = document.createElement('span');
          pointsSpan.className = 'player-points';
          pointsSpan.textContent = `${player.points_earned} pts (${(player.response_time_ms / 1000).toFixed(2)}s)`;

          li.appendChild(nameSpan);
          li.appendChild(pointsSpan);
          challengeRankingList.appendChild(li);
        });
      }

      if (challengeResult) challengeResult.classList.add('hidden');
      if (challengeLeaderboard) challengeLeaderboard.classList.remove('hidden');
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  }

  if (challengeLetterInput) {
    challengeLetterInput.addEventListener('input', () => {
      challengeLetterInput.value = challengeLetterInput.value.replace(/[^a-zA-ZñÑ]/g, '');
    });
  }

  if (challengeAnswerForm) {
    challengeAnswerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!challengeAnswerForm.checkValidity()) {
        challengeAnswerForm.reportValidity();
        return;
      }
      submitAnswer();
    });
  }

  if (challengeLeaderboardBtn) {
    challengeLeaderboardBtn.addEventListener('click', showLeaderboard);
  }

  if (challengeBackBtn) {
    challengeBackBtn.addEventListener('click', () => {
      clearTimer();
    });
  }

  return { loadChallenge, showLeaderboard };
}
