const state = {
  token: null,
  user: null,
  difficulty: 'easy',
  gameId: null,
  dailyWordId: null,
  kahootStartTime: null,
};

const authName = document.getElementById('auth-name');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const showRegisterBtn = document.getElementById('show-register-btn');
const registerFormBtn = document.getElementById('register-form-btn');
const registerUsername = document.getElementById('register-username');
const registerFirstName = document.getElementById('register-first-name');
const registerLastName = document.getElementById('register-last-name');
const registerEmail = document.getElementById('register-email');
const registerRole = document.getElementById('register-role');
const registerPassword = document.getElementById('register-password');
const authMessage = document.getElementById('auth-message');
const registerMessage = document.getElementById('register-message');
const loginView = document.getElementById('login-view');
const introPanel = document.getElementById('intro-panel');
const homePanel = document.getElementById('home-panel');
const gamePanel = document.getElementById('game-panel');
const teacherPanel = document.getElementById('teacher-panel');
const kahootPanel = document.getElementById('kahoot-panel');
const welcomeName = document.getElementById('welcome-name');
const playGameBtn = document.getElementById('play-game-btn');
const kahootBtn = document.getElementById('kahoot-btn');
const teacherBtn = document.getElementById('teacher-btn');
const logoutBtn = document.getElementById('logout-btn');
const backToHomeBtn = document.getElementById('back-to-home-btn');
const backToHomeFromTeacherBtn = document.getElementById('back-to-home-from-teacher-btn');
const backToHomeFromKahootBtn = document.getElementById('back-to-home-from-kahoot-btn');
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
const rankingList = document.getElementById('ranking-list');
const newGameBtn = document.getElementById('new-game');
const wordText = document.getElementById('word-text');
const wordDifficulty = document.getElementById('word-difficulty');
const addWordBtn = document.getElementById('add-word-btn');
const teacherMessage = document.getElementById('teacher-message');
const dailyWordSelect = document.getElementById('daily-word-select');
const setDailyWordBtn = document.getElementById('set-daily-word-btn');
const dailyWordMessage = document.getElementById('daily-word-message');
const kahootWaiting = document.getElementById('kahoot-waiting');
const kahootGame = document.getElementById('kahoot-game');
const kahootResult = document.getElementById('kahoot-result');
const kahootLeaderboard = document.getElementById('kahoot-leaderboard');
const kahootMaskedWord = document.getElementById('kahoot-masked-word');
const kahootDifficultyBadge = document.getElementById('kahoot-difficulty-badge');
const kahootLetterInput = document.getElementById('kahoot-letter-input');
const kahootSubmitBtn = document.getElementById('kahoot-submit-btn');
const kahootMessage = document.getElementById('kahoot-message');
const timerText = document.getElementById('timer-text');
const timerProgress = document.getElementById('timer-progress');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultPoints = document.getElementById('result-points');
const resultTime = document.getElementById('result-time');
const kahootLeaderboardBtn = document.getElementById('kahoot-leaderboard-btn');
const kahootBackBtn = document.getElementById('kahoot-back-btn');
const kahootRankingList = document.getElementById('kahoot-ranking-list');

const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('');

function setMessage(node, text) {
  if (!node) return;
  node.textContent = text;
}

function authorizedFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Content-Type'] = 'application/json';
  if (state.token) options.headers['Authorization'] = `Bearer ${state.token}`;
  return fetch(url, options);
}

async function loadLeaderboard() {
  if (!rankingList) return;
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    rankingList.innerHTML = data.map((player) => `<li>${player.name} � ${player.score} pts</li>`).join('');
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

async function registerUser(username, firstName, lastName, email, role, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: username,
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      password,
    }),
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
  const res = await authorizedFetch('/api/guess', {
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

// Kahoot Functions
async function loadDailyWords() {
  try {
    const res = await fetch('/api/words');
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
    console.error('Error loading daily words:', err);
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

async function loadKahootGame() {
  try {
    const res = await fetch('/api/daily-words?userId=' + state.user.id);
    const data = await res.json();

    if (!data.id) {
      setMessage(kahootWaiting, data.message || 'No hay palabra del día');
      return;
    }

    state.dailyWordId = data.id;
    state.kahootStartTime = Date.now();

    if (kahootMaskedWord) kahootMaskedWord.textContent = data.word;
    if (kahootDifficultyBadge) {
      kahootDifficultyBadge.textContent = 
        data.difficulty === 'easy' ? 'Fácil' : 
        data.difficulty === 'medium' ? 'Medio' : 'Difícil';
      kahootDifficultyBadge.className = 'kahoot-difficulty-badge ' + data.difficulty;
    }

    // Si ya respondió, mostrar resultado
    if (data.user_answer) {
      showKahootResult(data.is_correct, data.points_earned);
    } else {
      // Mostrar juego y iniciar timer
      if (kahootWaiting) kahootWaiting.classList.add('hidden');
      if (kahootGame) kahootGame.classList.remove('hidden');
      startKahootTimer();
    }
  } catch (err) {
    console.error('Error loading kahoot game:', err);
    setMessage(kahootWaiting, 'Error cargando palabra del día');
  }
}

function startKahootTimer() {
  const maxTime = 30; // 30 segundos
  let timeLeft = maxTime;

  const interval = setInterval(() => {
    timeLeft--;
    if (timerText) timerText.textContent = timeLeft + 's';

    // Actualizar SVG circle progress
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (timeLeft / maxTime) * circumference;
    if (timerProgress) timerProgress.style.strokeDashoffset = offset;

    if (timeLeft <= 0) {
      clearInterval(interval);
      if (kahootLetterInput) kahootLetterInput.disabled = true;
      if (kahootSubmitBtn) kahootSubmitBtn.disabled = true;
      setMessage(kahootMessage, 'Tiempo agotado');
    }
  }, 1000);
}

async function submitKahootAnswer() {
  if (!state.dailyWordId || !state.kahootStartTime) return;

  const letter = (kahootLetterInput?.value || '').trim().toLowerCase();
  if (!letter) {
    setMessage(kahootMessage, 'Ingresa una letra');
    return;
  }

  const responseTime = Date.now() - state.kahootStartTime;

  try {
    const res = await authorizedFetch('/api/daily-words/answer', {
      method: 'POST',
      body: JSON.stringify({
        dailyWordId: state.dailyWordId,
        answerLetter: letter,
        responseTimeMs: responseTime,
      }),
    });
    const data = await res.json();
    showKahootResult(data.isCorrect, data.points, responseTime);
  } catch (err) {
    console.error('Error submitting kahoot answer:', err);
    setMessage(kahootMessage, 'Error enviando respuesta');
  }
}

function showKahootResult(isCorrect, points, responseTime) {
  if (kahootGame) kahootGame.classList.add('hidden');
  if (kahootResult) kahootResult.classList.remove('hidden');

  const resultEl = kahootResult?.querySelector('.result-content');
  if (resultEl) {
    resultEl.className = 'result-content ' + (isCorrect ? 'correct' : 'incorrect');
  }

  if (resultTitle) resultTitle.textContent = isCorrect ? '¡Correcto!' : 'Incorrecto';
  if (resultMessage) resultMessage.textContent = isCorrect 
    ? `¡Excelente! Ganaste ${points} puntos` 
    : 'La respuesta era incorrecta';
  if (resultPoints) resultPoints.textContent = isCorrect ? '+' + points : '0';
  if (resultTime && responseTime) resultTime.textContent = (responseTime / 1000).toFixed(1) + 's';
}

async function showKahootLeaderboard() {
  if (!state.dailyWordId) return;

  try {
    const res = await fetch('/api/daily-words/leaderboard/' + state.dailyWordId);
    const data = await res.json();

    if (kahootRankingList) {
      kahootRankingList.innerHTML = data.map((player, idx) => `
        <li>
          <span class="player-name">${player.first_name} ${player.last_name}</span>
          <span class="player-points">${player.points_earned} pts</span>
        </li>
      `).join('');
    }

    if (kahootResult) kahootResult.classList.add('hidden');
    if (kahootLeaderboard) kahootLeaderboard.classList.remove('hidden');
  } catch (err) {
    console.error('Error loading kahoot leaderboard:', err);
  }
}

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
      if (status === 'playing') {
        submitGuess(letter);
      }
    });
    lettersRow.appendChild(button);
  });
}

function saveSession(token, user) {
  localStorage.setItem('ahorcado_token', token);
  localStorage.setItem('ahorcado_user', JSON.stringify(user));
}

function loadSession() {
  const token = localStorage.getItem('ahorcado_token');
  const userJson = localStorage.getItem('ahorcado_user');
  if (!token || !userJson) return null;
  try {
    const user = JSON.parse(userJson);
    return { token, user };
  } catch (err) {
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
  
  if (welcomeName) welcomeName.textContent = data.user.name;
  
  if (teacherBtn) {
    if (data.user.role === 'teacher') {
      teacherBtn.classList.remove('hidden');
      teacherBtn.style.display = 'flex';
    } else {
      teacherBtn.classList.add('hidden');
      teacherBtn.style.display = 'none';
    }
  }
  
  loadLeaderboard();
}

function goToGame() {
  if (homePanel) homePanel.classList.add('hidden');
  if (gamePanel) gamePanel.classList.remove('hidden');
  if (teacherPanel) teacherPanel.classList.add('hidden');
  createGame(state.difficulty).then(game => {
    if (game.error) {
      setMessage(gameMessage, game.error);
    } else {
      setGameState(game);
    }
  });
}

function goToTeacher() {
  if (homePanel) homePanel.classList.add('hidden');
  if (gamePanel) gamePanel.classList.add('hidden');
  if (teacherPanel) teacherPanel.classList.remove('hidden');
}

function logout() {
  clearSession();
  state.token = null;
  state.user = null;
  if (homePanel) homePanel.classList.add('hidden');
  if (gamePanel) gamePanel.classList.add('hidden');
  if (teacherPanel) teacherPanel.classList.add('hidden');
  if (introPanel) introPanel.classList.remove('hidden');
  if (authName) authName.value = '';
  if (authPassword) authPassword.value = '';
  setMessage(authMessage, 'Sesión cerrada');
}

function setGameState(data) {
  if (!data || !maskedWord) return;
  state.gameId = data.id;
  maskedWord.textContent = data.masked;
  attemptsEl.textContent = data.attempts;
  wrongAttemptsEl.textContent = data.wrongAttempts;
  difficultyEl.textContent = `Dificultad: ${data.difficulty}`;
  gameStatusEl.textContent = data.status === 'playing' ? 'Partida en juego' : `Partida ${data.status}`;
  hintArea.textContent = data.hint ? `Pista maquiav�lica: ${data.hint}` : 'A�n no hay pista.';
  renderKeypad(data.guessedLetters, data.wrongLetters, data.status);
  if (data.status !== 'playing') {
    const text = data.status === 'won' ? 'Ganaste, legi�n de sombras!' : 'Perdiste, el verdugo r�e.';
    setMessage(gameMessage, `${text} La palabra era: ${data.masked.replace(/ /g, '')}`);
  } else {
    setMessage(gameMessage, 'Intenta una letra y arrasa con la oscuridad.');
  }
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const username = authName.value.trim();
    const password = authPassword.value.trim();
    if (!username || !password) {
      setMessage(authMessage, 'Usuario y contrase�a son obligatorios');
      return;
    }

    const data = await loginUser(username, password);
    if (data.token) {
      setUserSession(data);
    } else {
      setMessage(authMessage, data.error || 'Error de inicio de sesi�n');
    }
  });
}

if (showRegisterBtn) {
  showRegisterBtn.addEventListener('click', () => {
    window.location.href = '/register.html';
  });
}

if (registerFormBtn) {
  registerFormBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Botón registro clickeado');
    
    const username = registerUsername?.value.trim() || '';
    const firstName = registerFirstName?.value.trim() || '';
    const lastName = registerLastName?.value.trim() || '';
    const email = registerEmail?.value.trim() || '';
    const role = registerRole?.value || 'student';
    const password = registerPassword?.value.trim() || '';

    if (!username || !firstName || !lastName || !email || !password) {
      setMessage(registerMessage || authMessage, 'Completa todos los campos para registrarte');
      return;
    }

    try {
      const data = await registerUser(username, firstName, lastName, email, role, password);
      console.log('Respuesta del registro:', data);
      
      if (data.token) {
        saveSession(data.token, data.user);
        setMessage(registerMessage || authMessage, 'Registro exitoso, redirigiendo...');
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        setMessage(registerMessage || authMessage, data.error || 'Error de registro');
      }
    } catch (err) {
      console.error('Error en registro:', err);
      setMessage(registerMessage || authMessage, 'Error de conexión: ' + err.message);
    }
  });
} else {
  console.warn('registerFormBtn no encontrado en el DOM');
}

if (playGameBtn) {
  playGameBtn.addEventListener('click', goToGame);
}

if (teacherBtn) {
  teacherBtn.addEventListener('click', goToTeacher);
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', logout);
}

if (backToHomeBtn) {
  backToHomeBtn.addEventListener('click', () => {
    if (homePanel) homePanel.classList.remove('hidden');
    if (gamePanel) gamePanel.classList.add('hidden');
    if (teacherPanel) teacherPanel.classList.add('hidden');
  });
}

if (backToHomeFromTeacherBtn) {
  backToHomeFromTeacherBtn.addEventListener('click', () => {
    if (homePanel) homePanel.classList.remove('hidden');
    if (gamePanel) gamePanel.classList.add('hidden');
    if (teacherPanel) teacherPanel.classList.add('hidden');
  });
}

if (guessBtn) {
  guessBtn.addEventListener('click', () => {
    const letter = letterInput.value.trim().toLowerCase();
    if (!letter) return;
    submitGuess(letter);
    letterInput.value = '';
    letterInput.focus();
  });
}

if (newGameBtn) {
  newGameBtn.addEventListener('click', async () => {
    if (!state.user) return;
    const game = await createGame(difficultySelect.value);
    if (game.error) {
      setMessage(gameMessage, game.error);
    } else {
      setGameState(game);
    }
  });
}

if (addWordBtn) {
  addWordBtn.addEventListener('click', async () => {
    if (!state.user || state.user.role !== 'teacher') {
      setMessage(teacherMessage, 'Solo profesores pueden agregar palabras.');
      return;
    }

    const word = wordText.value.trim();
    const difficulty = wordDifficulty.value;
    if (!word) {
      setMessage(teacherMessage, 'Ingresa una palabra o frase.');
      return;
    }

    const res = await authorizedFetch('/api/words', {
      method: 'POST',
      body: JSON.stringify({ word, difficulty }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(teacherMessage, data.message || 'Palabra agregada.');
      wordText.value = '';
    } else {
      setMessage(teacherMessage, data.error || 'Error al agregar palabra');
    }
  });
}

(async () => {
  const existingSession = loadSession();
  if (existingSession && window.location.pathname === '/') {
    await setUserSession(existingSession);
  }
  await loadLeaderboard();
})();
