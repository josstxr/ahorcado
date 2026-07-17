import { state } from './state.js';

function getJsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

export async function authorizedFetch(url, options = {}) {
  const headers = options.headers || {};
  const requestHeaders = { ...headers, ...getJsonHeaders() };

  if (state.token) {
    requestHeaders.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: requestHeaders,
  });

  return response;
}

export async function registerUser(userData) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify(userData),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function loginUser(usernameOrEmail, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ credential: usernameOrEmail, password }),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function loadLeaderboard() {
  const response = await fetch('/api/leaderboard');
  const data = await response.json();
  return { response, data };
}

export async function createGame(difficulty) {
  const response = await authorizedFetch('/api/game', {
    method: 'POST',
    body: JSON.stringify({ difficulty }),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function submitGuess(letter, gameId) {
  const response = await authorizedFetch('/api/game/guess', {
    method: 'POST',
    body: JSON.stringify({ gameId, letter }),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function loadWordsForTeacher() {
  const response = await authorizedFetch('/api/words');
  return {
    response,
    data: await response.json(),
  };
}

export async function setDailyWord(wordId) {
  const response = await authorizedFetch('/api/daily-words', {
    method: 'POST',
    body: JSON.stringify({ wordId }),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function loadDailyChallenge() {
  const response = await authorizedFetch('/api/daily-words');
  return {
    response,
    data: await response.json(),
  };
}

export async function submitDailyChallengeAnswer(dailyWordId, answerLetter) {
  const response = await authorizedFetch('/api/daily-words/answer', {
    method: 'POST',
    body: JSON.stringify({ dailyWordId, answerLetter }),
  });
  return {
    response,
    data: await response.json(),
  };
}

export async function loadDailyChallengeLeaderboard(dailyWordId) {
  const response = await authorizedFetch(`/api/daily-words/leaderboard/${dailyWordId}`);
  return {
    response,
    data: await response.json(),
  };
}
