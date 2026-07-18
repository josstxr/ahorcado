import { setMessage } from './ui.mjs';
import { apiFetch, loadWordsForTeacher, setDailyWord } from './api.mjs';

const difficultyLabels = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };

export function initTeacherPanel({ elements, onWordsLoaded, onStartGame }) {
  const {
    wordForm, wordText, wordDifficulty, wordTheme, wordAssignDaily, teacherMessage,
    aiWordForm, aiWordTheme, aiWordCount, aiWordDifficulty, aiWordMessage,
    dailyWordForm, dailyWordSelect, dailyWordMessage, wordFilter, themeFilter,
    teacherWordBank, gameConfigForm, gameTheme, gameWordCount, gameSource,
    gameConfigDifficulty, gameConfigMessage, studentSelect, startPreparedGameBtn,
  } = elements;
  let words = [];
  const selectedWordIds = new Set();

  async function loadStudents() {
    if (!studentSelect) return;
    try {
      const { response, data } = await apiFetch('/api/assignments/students');
      if (!response.ok) return;
      studentSelect.innerHTML = '';
      data.forEach((student) => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = `${student.first_name} ${student.last_name} (@${student.name})`;
        studentSelect.appendChild(option);
      });
      if (!data.length) studentSelect.innerHTML = '<option disabled>No hay alumnos registrados</option>';
    } catch {
      studentSelect.innerHTML = '<option disabled>No se pudieron cargar los alumnos</option>';
    }
  }

  function populateThemes() {
    if (!themeFilter) return;
    const current = themeFilter.value;
    const themes = [...new Set(words.map((item) => item.theme || 'General'))].sort((a, b) => a.localeCompare(b, 'es'));
    themeFilter.innerHTML = '<option value="">Todos los temas</option>';
    themes.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      themeFilter.appendChild(option);
    });
    if (themes.includes(current)) themeFilter.value = current;
  }

  function renderWordBank() {
    if (!teacherWordBank) return;
    const query = wordFilter?.value.trim().toLocaleLowerCase('es') || '';
    const selectedTheme = themeFilter?.value || '';
    const filtered = words.filter((item) =>
      (!query || item.word.toLocaleLowerCase('es').includes(query)) &&
      (!selectedTheme || item.theme === selectedTheme)
    );

    teacherWordBank.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No hay palabras que coincidan con los filtros.';
      teacherWordBank.appendChild(empty);
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'word-chip';
      card.classList.toggle('selected', selectedWordIds.has(String(item.id)));
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.id;
      checkbox.checked = selectedWordIds.has(String(item.id));
      checkbox.setAttribute('aria-label', `Seleccionar ${item.word}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedWordIds.add(String(item.id));
        else selectedWordIds.delete(String(item.id));
        card.classList.toggle('selected', checkbox.checked);
      });
      const name = document.createElement('strong');
      name.textContent = item.word;
      const meta = document.createElement('span');
      meta.textContent = `${item.theme || 'General'} · ${difficultyLabels[item.difficulty]}`;
      const text = document.createElement('div');
      text.append(name, meta);
      card.append(checkbox, text);
      teacherWordBank.appendChild(card);
    });
  }

  async function loadDailyWordsOptions() {
    try {
      const { response, data } = await loadWordsForTeacher();
      if (!response.ok) return setMessage(teacherMessage, data.error || 'No se pudo cargar el banco.');
      words = data;
      if (dailyWordSelect) {
        dailyWordSelect.innerHTML = '<option value="">Selecciona una palabra…</option>';
        words.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = `${item.word} · ${item.theme || 'General'} (${difficultyLabels[item.difficulty]})`;
          dailyWordSelect.appendChild(option);
        });
      }
      populateThemes();
      renderWordBank();
      await loadStudents();
      if (typeof onWordsLoaded === 'function') onWordsLoaded(words);
    } catch {
      setMessage(teacherMessage, 'No se pudo conectar con el servidor.');
    }
  }

  async function submitWord() {
    if (!wordForm?.checkValidity()) return wordForm?.reportValidity();
    const { response, data } = await apiFetch('/api/words', {
      method: 'POST',
      body: JSON.stringify({
        word: wordText.value.trim(),
        difficulty: wordDifficulty.value,
        theme: wordTheme?.value.trim() || 'General',
        assignDaily: Boolean(wordAssignDaily?.checked),
      }),
    });
    setMessage(teacherMessage, data.message || data.error);
    if (response.ok) {
      wordText.value = '';
      if (wordAssignDaily) wordAssignDaily.checked = false;
      await loadDailyWordsOptions();
    }
  }

  async function submitDailyWord() {
    if (!dailyWordForm?.checkValidity()) return dailyWordForm?.reportValidity();
    const { response, data } = await setDailyWord(dailyWordSelect.value);
    setMessage(dailyWordMessage, data.message || data.error);
    if (response.ok) dailyWordSelect.value = '';
  }

  async function generateAiWordsForBank() {
    if (!aiWordForm?.checkValidity()) return aiWordForm?.reportValidity();
    const button = aiWordForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Generando…';
    setMessage(aiWordMessage, 'La IA está creando palabras para el banco.');
    try {
      const { response, data } = await apiFetch('/api/words/generate', {
        method: 'POST',
        body: JSON.stringify({
          theme: aiWordTheme.value.trim(),
          count: Number(aiWordCount.value),
          difficulty: aiWordDifficulty.value,
        }),
      });
      if (!response.ok) return setMessage(aiWordMessage, data.error || 'No fue posible generar palabras.');
      const generated = data.words.map((item) => item.word).join(', ');
      setMessage(aiWordMessage, `✓ ${data.message}: ${generated}`);
      if (gameTheme) gameTheme.value = data.theme || aiWordTheme.value.trim();
      await loadDailyWordsOptions();
    } catch {
      setMessage(aiWordMessage, 'No se pudo conectar con el servidor.');
    } finally {
      button.disabled = false;
      button.textContent = 'Generar y guardar palabras';
    }
  }

  async function prepareThemedGame() {
    if (!gameConfigForm?.checkValidity()) return gameConfigForm?.reportValidity();
    const button = gameConfigForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = gameSource.value === 'ai' ? 'Generando con IA…' : 'Preparando…';
    setMessage(gameConfigMessage, 'Estamos preparando la selección de palabras.');
    try {
      const { response, data } = await apiFetch('/api/words/prepare-game', {
        method: 'POST',
        body: JSON.stringify({
          theme: gameTheme.value.trim(),
          count: Number(gameWordCount.value),
          source: gameSource.value,
          difficulty: gameConfigDifficulty.value,
          wordIds: [...selectedWordIds],
        }),
      });
      if (!response.ok) return setMessage(gameConfigMessage, data.error || 'No fue posible preparar la partida.');
      const selected = data.words.map((item) => item.word).join(', ');
      const studentIds = [...(studentSelect?.selectedOptions || [])].map((option) => Number(option.value));
      if (studentIds.length) {
        const { response: assignmentResponse, data: assignmentData } = await apiFetch('/api/assignments', {
          method: 'POST',
          body: JSON.stringify({
            studentIds,
            wordIds: data.words.map((item) => item.id),
            theme: data.theme,
            difficulty: gameConfigDifficulty.value,
          }),
        });
        if (!assignmentResponse.ok) return setMessage(gameConfigMessage, assignmentData.error || 'No se pudo asignar la partida.');
        localStorage.removeItem('themedGameQueue');
        startPreparedGameBtn?.classList.add('hidden');
        setMessage(gameConfigMessage, `✓ ${assignmentData.message} (${data.words.length} palabras: ${selected})`);
      } else {
        localStorage.setItem('themedGameQueue', JSON.stringify({
          theme: data.theme,
          words: data.words.map((item) => ({ id: item.id, word: item.word, difficulty: item.difficulty })),
          current: 0,
        }));
        startPreparedGameBtn?.classList.remove('hidden');
        setMessage(gameConfigMessage, `✓ ${data.message} Pulsa “Iniciar partida ahora”. Palabras: ${selected}`);
      }
      selectedWordIds.clear();
      await loadDailyWordsOptions();
    } catch {
      setMessage(gameConfigMessage, 'No se pudo conectar con el servidor.');
    } finally {
      button.disabled = false;
      button.textContent = 'Preparar partida temática';
    }
  }

  wordForm?.addEventListener('submit', (event) => { event.preventDefault(); submitWord(); });
  aiWordForm?.addEventListener('submit', (event) => { event.preventDefault(); generateAiWordsForBank(); });
  dailyWordForm?.addEventListener('submit', (event) => { event.preventDefault(); submitDailyWord(); });
  gameConfigForm?.addEventListener('submit', (event) => { event.preventDefault(); prepareThemedGame(); });
  wordFilter?.addEventListener('input', renderWordBank);
  themeFilter?.addEventListener('change', () => {
    renderWordBank();
    if (themeFilter.value && gameTheme) gameTheme.value = themeFilter.value;
  });
  startPreparedGameBtn?.addEventListener('click', () => {
    if (typeof onStartGame === 'function') onStartGame();
  });

  return { loadDailyWordsOptions, loadStudents };
}
