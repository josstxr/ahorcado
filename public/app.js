const state = {
  token: null,
  user: null,
  difficulty: 'easy',
  gameId: null,
  dailyWordId: null,
  challengeStartTime: null,
};

// --- ELEMENTOS DEL DOM ---
const loginForm = document.getElementById('login-form');
const authName = document.getElementById('auth-name');
const authPassword = document.getElementById('auth-password');
const showRegisterBtn = document.getElementById('show-register-btn');
const authMessage = document.getElementById('auth-message');
const rankingList = document.getElementById('ranking-list');

// Registro
const registerForm = document.getElementById('register-form');
const registerUsername = document.getElementById('register-username');
const registerFirstName = document.getElementById('register-first-name');
const registerLastName = document.getElementById('register-last-name');
const registerEmail = document.getElementById('register-email');
const registerRole = document.getElementById('register-role');
const registerPassword = document.getElementById('register-password');
const registerMessage = document.getElementById('register-message');
const backToLoginBtn = document.getElementById('back-to-login');

// Paneles principales
const introPanel = document.getElementById('intro-panel');
const homePanel = document.getElementById('home-panel');
const gamePanel = document.getElementById('game-panel');
const teacherPanel = document.getElementById('teacher-panel');
const speedChallengePanel = document.getElementById('speed-challenge-panel');
const welcomeName = document.getElementById('welcome-name');

// Botones de navegación Home
const playGameBtn = document.getElementById('play-game-btn');
const speedChallengeBtn = document.getElementById('speed-challenge-btn');
const teacherBtn = document.getElementById('teacher-btn');
const logoutBtn = document.getElementById('logout-btn');

// Botones para regresar
const backToHomeBtn = document.getElementById('back-to-home-btn');
const backToHomeFromTeacherBtn = document.getElementById('back-to-home-from-teacher-btn');
const backToHomeFromChallengeBtn = document.getElementById('back-to-home-from-challenge-btn');

// Componentes del ahorcado tradicional
const maskedWord = document.getElementById('masked-word');
const attemptsEl = document.getElementById('attempts');
const wrongAttemptsEl = document.getElementById('wrong-attempts');
const difficultyEl = document.getElementById('game-difficulty');
const difficultySelect = document.getElementById('difficulty');
const gameStatusEl = document.getElementById('game-status');
const hintArea = document.getElementById('hint-area');
const gameMessage = document.getElementById('game-message');
const letterInput = document.getElementById('letter-input');
const guessBtn = document.getElementById('guess-btn');
const lettersRow = document.getElementById('letters-row');
const newGameBtn = document.getElementById('new-game');

// Componentes del panel del profesor
const wordForm = document.getElementById('word-form');
const wordText = document.getElementById('word-text');
const wordDifficulty = document.getElementById('word-difficulty');
const teacherMessage = document.getElementById('teacher-message');
const dailyWordForm = document.getElementById('daily-word-form');
const dailyWordSelect = document.getElementById('daily-word-select');
const dailyWordMessage = document.getElementById('daily-word-message');

// Componentes del Desafío de Velocidad (Palabra del Día)
const challengeWaiting = document.getElementById('challenge-waiting');
const challengeGame = document.getElementById('challenge-game');
const challengeResult = document.getElementById('challenge-result');
const challengeLeaderboard = document.getElementById('challenge-leaderboard');
const challengeMaskedWord = document.getElementById('challenge-masked-word');
const challengeDifficultyBadge = document.getElementById('challenge-difficulty-badge');
const challengeAnswerForm = document.getElementById('challenge-answer-form');
const challengeLetterInput = document.getElementById('challenge-letter-input');
const challengeMessage = document.getElementById('challenge-message');
const timerText = document.getElementById('timer-text');
const timerProgress = document.getElementById('timer-progress');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultPoints = document.getElementById('result-points');
const resultTime = document.getElementById('result-time');
const challengeLeaderboardBtn = document.getElementById('challenge-leaderboard-btn');
const challengeBackBtn = document.getElementById('challenge-back-btn');
const challengeRankingList = document.getElementById('challenge-ranking-list');

const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('');
let timerInterval = null;

// --- FUNCIONES UTILITARIAS Y DE RED SEGURA ---

function setMessage(node, text) {
  if (!node) return;
  node.textContent = text;
}

async function registerUser(userData) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return res.json();
}

function authorizedFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Content-Type'] = 'application/json';
  if (state.token) {
    options.headers['Authorization'] = `Bearer ${state.token}`;
  }
  return fetch(url, options);
}

// SEGURIDAD: Reconstrucción defensiva usando nodos para eludir la inyección de scripts vía innerHTML
async function loadLeaderboard() {
  if (!rankingList) return;
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    rankingList.innerHTML = '';
    
    data.forEach(player => {
      const li = document.createElement('li');
      li.textContent = `${player.name} — ${player.score} pts`;
      rankingList.appendChild(li);
    });
  } catch (err) {
    rankingList.innerHTML = '<li>Error cargando ranking</li>';
  }
}

async function loginUser(usernameOrEmail, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: usernameOrEmail, password }),
  });
  return res.json();
}

async function createGame(difficulty) {
  const res = await authorizedFetch('/api/game', {
    method: 'POST',
    body: JSON.stringify({ difficulty }),
  });
  return res.json();
}

async function submitGuess(letter) {
  if (!state.gameId) return;
  const res = await authorizedFetch('/api/game/guess', {
    method: 'POST',
    body: JSON.stringify({ gameId: state.gameId, letter }),
  });
  const data = await res.json();
  if (res.ok) {
    setGameState(data);
  } else {
    setMessage(gameMessage, data.error || 'Error en la jugada');
  }
}

// --- LOGICA DEL DESAFÍO DE VELOCIDAD (PALABRA DEL DÍA) ---

async function loadDailyWordsOptions() {
  try {
    const res = await authorizedFetch('/api/words');
    const words = await res.json();
    if (dailyWordSelect) {
      dailyWordSelect.innerHTML = '<option value="">Selecciona una palabra...</option>';
      words.forEach((w) => {
        const option = document.createElement('option');
        option.value = w.id;
        option.textContent = `${w.word} (${w.difficulty})`;
        dailyWordSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Error loading words reference:', err);
  }
}

async function setDailyWord(wordId) {
  const res = await authorizedFetch('/api/daily-words', {
    method: 'POST',
    body: JSON.stringify({ wordId }),
  });
  const data = await res.json();
  if (res.ok) {
    setMessage(dailyWordMessage, data.message || 'Palabra del día establecida');
    if (dailyWordSelect) dailyWordSelect.value = '';
  } else {
    setMessage(dailyWordMessage, data.error || 'Error al establecer palabra del día');
  }
}

async function loadSpeedChallenge() {
  try {
    if (challengeWaiting) challengeWaiting.classList.remove('hidden');
    if (challengeGame) challengeGame.classList.add('hidden');
    if (challengeResult) challengeResult.classList.add('hidden');
    if (challengeLeaderboard) challengeLeaderboard.classList.add('hidden');

    const res = await authorizedFetch('/api/daily-words');
    const data = await res.json();

    if (!data.id) {
      setMessage(challengeWaiting, data.message || 'No hay palabra del día configurada.');
      return;
    }

    state.dailyWordId = data.id;
    state.challengeStartTime = Date.now();

    if (challengeMaskedWord) challengeMaskedWord.textContent = data.word;
    if (challengeDifficultyBadge) {
      challengeDifficultyBadge.textContent = 
        data.difficulty === 'easy' ? 'Fácil' : 
        data.difficulty === 'medium' ? 'Medio' : 'Difícil';
      challengeDifficultyBadge.className = 'challenge-difficulty-badge ' + data.difficulty;
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
  } catch (err) {
    console.error('Error loading speed challenge:', err);
    setMessage(challengeWaiting, 'Error cargando el desafío diario');
  }
}

function startChallengeTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const maxTime = 30;
  let timeLeft = maxTime;

  timerInterval = setInterval(() => {
    timeLeft--;
    if (timerText) timerText.textContent = timeLeft + 's';

    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (timeLeft / maxTime) * circumference;
    if (timerProgress) timerProgress.style.strokeDashoffset = offset;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (challengeLetterInput) challengeLetterInput.disabled = true;
      setMessage(challengeMessage, 'Tiempo agotado');
    }
  }, 1000);
}

async function submitChallengeAnswer() {
  if (!state.dailyWordId) return;

  const letter = (challengeLetterInput?.value || '').trim().toLowerCase();
  if (!letter || letter.length !== 1) {
    setMessage(challengeMessage, 'Ingresa una letra válida');
    return;
  }

  try {
    if (timerInterval) clearInterval(timerInterval);
    
    const res = await authorizedFetch('/api/daily-words/answer', {
      method: 'POST',
      body: JSON.stringify({
        dailyWordId: state.dailyWordId,
        answerLetter: letter
      }),
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showChallengeResult(data.isCorrect, data.pointsEarned, data.responseTimeMs);
    } else {
      setMessage(challengeMessage, data.error || 'Error al procesar respuesta');
    }
  } catch (err) {
    console.error('Error submitting response:', err);
    setMessage(challengeMessage, 'Error de conectividad');
  }
}

function showChallengeResult(isCorrect, points, responseTimeMs) {
  if (challengeGame) challengeGame.classList.add('hidden');
  if (challengeResult) challengeResult.classList.remove('hidden');

  const resultEl = challengeResult?.querySelector('.result-content');
  if (resultEl) {
    resultEl.className = 'result-content ' + (isCorrect ? 'correct' : 'incorrect');
  }

  if (resultTitle) resultTitle.textContent = isCorrect ? '¡Correcto!' : 'Respuesta Incorrecta';
  if (resultMessage) {
    resultMessage.textContent = isCorrect 
      ? `Agilidad mental comprobada.` 
      : 'Has fallado la inicial de la palabra del día.';
  }
  if (resultPoints) resultPoints.textContent = isCorrect ? '+' + points : '0';
  if (resultTime) resultTime.textContent = responseTimeMs != null
    ? `${(responseTimeMs / 1000).toFixed(2)}s`
    : '--';
}

async function showChallengeLeaderboard() {
  if (!state.dailyWordId) return;

  try {
    const res = await authorizedFetch('/api/daily-words/leaderboard/' + state.dailyWordId);
    const data = await res.json();

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
  } catch (err) {
    console.error('Error loading leaderboard:', err);
  }
}

// --- LOGICA DEL JUEGO DEL AHORCADO TRADICIONAL ---

function renderKeypad(guessed, wrong, status) {
  if (!lettersRow) return;
  lettersRow.innerHTML = '';
  const used = new Set([...(guessed || []), ...(wrong || [])]);
  
  alphabet.forEach((letter) => {
    const button = document.createElement('button');
    button.textContent = letter.toUpperCase();
    button.disabled = status !== 'playing' || used.has(letter);
    if (used.has(letter)) button.classList.add('used');
    
    button.addEventListener('click', () => {
      if (status === 'playing') submitGuess(letter);
    });
    lettersRow.appendChild(button);
  });
}

function setGameState(data) {
  if (!data || !maskedWord) return;
  state.gameId = data.id;
  maskedWord.textContent = data.masked;
  attemptsEl.textContent = data.attempts;
  wrongAttemptsEl.textContent = data.wrongAttempts;
  difficultyEl.textContent = `Dificultad: ${data.difficulty}`;
  gameStatusEl.textContent = data.status === 'playing' ? 'Partida en juego' : `Partida ${data.status}`;
  hintArea.textContent = data.hint ? `Pista : ${data.hint}` : 'Aún no hay pista.';
  renderKeypad(data.guessedLetters, data.wrongLetters, data.status);
  
  if (data.status !== 'playing') {
    const text = data.status === 'won' ? '¡Ganaste!' : 'Perdiste.';
    setMessage(gameMessage, `${text} La palabra era: ${data.word}`);
  } else {
    setMessage(gameMessage, 'Intenta una letra.');
  }
}

// --- MANEJO DE SESIONES DE FORMA SEGURA ---

function saveSession(token, user) {
  localStorage.setItem('ahorcado_token', token);
  localStorage.setItem('ahorcado_user', JSON.stringify(user));
}

function loadSession() {
  const token = localStorage.getItem('ahorcado_token');
  const userJson = localStorage.getItem('ahorcado_user');
  if (!token || !userJson) return null;
  try {
    // SEGURIDAD: Validación de integridad básica estructural al parsear la cookie/localStorage
    const user = JSON.parse(userJson);
    if (!user.id || !user.role) throw new Error("Datos corruptos");
    return { token, user };
  } catch (err) {
    clearSession();
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('ahorcado_token');
  localStorage.removeItem('ahorcado_user');
}

async function setUserSession(data) {
  state.token = data.token;
  state.user = data.user;
  saveSession(data.token, data.user);
  
  if (introPanel) introPanel.classList.add('hidden');
  if (homePanel) homePanel.classList.remove('hidden');
  if (gamePanel) gamePanel.classList.add('hidden');
  if (teacherPanel) teacherPanel.classList.add('hidden');
  if (speedChallengePanel) speedChallengePanel.classList.add('hidden');
  
  if (welcomeName) welcomeName.textContent = data.user.name;
  
  if (teacherBtn) {
    if (data.user.role === 'teacher') {
      teacherBtn.classList.remove('hidden');
      teacherBtn.style.display = 'flex';
      loadDailyWordsOptions();
    } else {
      teacherBtn.classList.add('hidden');
      teacherBtn.style.display = 'none';
    }
  }
  loadLeaderboard();
}

function logout() {
  if (timerInterval) clearInterval(timerInterval);
  clearSession();
  state.token = null;
  state.user = null;
  if (homePanel) homePanel.classList.add('hidden');
  if (gamePanel) gamePanel.classList.add('hidden');
  if (teacherPanel) teacherPanel.classList.add('hidden');
  if (speedChallengePanel) speedChallengePanel.classList.add('hidden');
  if (introPanel) introPanel.classList.remove('hidden');
  if (authName) authName.value = '';
  if (authPassword) authPassword.value = '';
  setMessage(authMessage, 'Sesión cerrada');
}

// --- CONTROLADORES DE EVENTOS CON FILTROS DE CLIENTE ---

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }
    const username = authName.value.trim();
    const password = authPassword.value.trim();

    const data = await loginUser(username, password);
    if (data.token) {
      setUserSession(data);
    } else {
      setMessage(authMessage, data.error || 'Error de inicio de sesión');
    }
  });
}

if (showRegisterBtn) {
  showRegisterBtn.addEventListener('click', () => {
    window.location.href = '/register.html';
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!registerForm.checkValidity()) {
      registerForm.reportValidity();
      return;
    }

    const userPayload = {
      name: registerUsername.value.trim(),
      first_name: registerFirstName.value.trim(),
      last_name: registerLastName.value.trim(),
      email: registerEmail.value.trim().toLowerCase(),
      role: registerRole.value,
      password: registerPassword.value,
    };

    const data = await registerUser(userPayload);
    if (data.token) {
      saveSession(data.token, data.user);
      window.location.href = '/'; // Redirigir a la página principal, que se encargará de cargar la sesión
    } else {
      setMessage(registerMessage, data.error || 'Error registrando usuario');
    }
  });
}

if (backToLoginBtn) {
  backToLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
  });
}

if (playGameBtn) {
  playGameBtn.addEventListener('click', () => {
    if (homePanel) homePanel.classList.add('hidden');
    if (gamePanel) gamePanel.classList.remove('hidden');
    createGame(state.difficulty).then(game => {
      if (game.error) setMessage(gameMessage, game.error);
      else setGameState(game);
    });
  });
};

if (speedChallengeBtn) {
  speedChallengeBtn.addEventListener('click', () => {
    if (homePanel) homePanel.classList.add('hidden');
    if (speedChallengePanel) speedChallengePanel.classList.remove('hidden');
    loadSpeedChallenge();
  });
}

if (teacherBtn) {
  teacherBtn.addEventListener('click', () => {
    if (homePanel) homePanel.classList.add('hidden');
    if (teacherPanel) teacherPanel.classList.remove('hidden');
  });
}

if (logoutBtn) logoutBtn.addEventListener('click', logout);

const backToHomeAction = () => {
  if (timerInterval) clearInterval(timerInterval);
  if (homePanel) homePanel.classList.remove('hidden');
  if (gamePanel) gamePanel.classList.add('hidden');
  if (teacherPanel) teacherPanel.classList.add('hidden');
  if (speedChallengePanel) speedChallengePanel.classList.add('hidden');
  loadLeaderboard();
};

if (backToHomeBtn) backToHomeBtn.addEventListener('click', backToHomeAction);
if (backToHomeFromTeacherBtn) backToHomeFromTeacherBtn.addEventListener('click', backToHomeAction);
if (backToHomeFromChallengeBtn) backToHomeFromChallengeBtn.addEventListener('click', backToHomeAction);
if (challengeBackBtn) challengeBackBtn.addEventListener('click', backToHomeAction);

// Sanitización del input en tiempo real (Ahorcado tradicional)
if (letterInput) {
  letterInput.addEventListener('input', () => {
    letterInput.value = letterInput.value.replace(/[^a-zA-ZñÑ]/g, '');
  });
}

if (guessBtn) {
  guessBtn.addEventListener('click', () => {
    const letter = letterInput.value.trim().toLowerCase();
    if (!letter || letter.length !== 1) return;
    submitGuess(letter);
    letterInput.value = '';
    letterInput.focus();
  });
}

if (newGameBtn) {
  newGameBtn.addEventListener('click', async () => {
    if (!state.user) return;
    const game = await createGame(difficultySelect.value);
    if (game.error) setMessage(gameMessage, game.error);
    else setGameState(game);
  });
}

// Formularios Administrativos del Profesor con interceptores de envío seguros
if (wordForm) {
  wordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!wordForm.checkValidity()) {
      wordForm.reportValidity();
      return;
    }
    const word = wordText.value.trim();
    const difficulty = wordDifficulty.value;

    const res = await authorizedFetch('/api/words', {
      method: 'POST',
      body: JSON.stringify({ word, difficulty }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(teacherMessage, data.message || 'Palabra agregada de forma exitosa.');
      wordText.value = '';
      loadDailyWordsOptions();
    } else {
      setMessage(teacherMessage, data.error || 'Error al guardar la palabra');
    }
  });
}

if (dailyWordForm) {
  dailyWordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!dailyWordForm.checkValidity()) {
      dailyWordForm.reportValidity();
      return;
    }
    setDailyWord(dailyWordSelect.value);
  });
}

// Sanitización del input en tiempo real (Desafío de velocidad)
if (challengeLetterInput) {
  challengeLetterInput.addEventListener('input', () => {
    challengeLetterInput.value = challengeLetterInput.value.replace(/[^a-zA-ZñÑ]/g, '');
  });
}

if (challengeAnswerForm) {
  challengeAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!challengeAnswerForm.checkValidity()) {
      challengeAnswerForm.reportValidity();
      return;
    }
    submitChallengeAnswer();
  });
}

if (challengeLeaderboardBtn) {
  challengeLeaderboardBtn.addEventListener('click', showChallengeLeaderboard);
}

// --- CARGA INICIAL ---
(async () => {
  const existingSession = loadSession();
  if (existingSession && window.location.pathname === '/') {
    await setUserSession(existingSession);
  } else {
    await loadLeaderboard();
  }
})();