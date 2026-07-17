import { setMessage } from './ui.js';
import { authorizedFetch, loadWordsForTeacher, setDailyWord } from './api.js';

export function initTeacherPanel({ elements, onWordsLoaded }) {
  const {
    wordForm,
    wordText,
    wordDifficulty,
    teacherMessage,
    dailyWordForm,
    dailyWordSelect,
    dailyWordMessage,
  } = elements;

  async function loadDailyWordsOptions() {
    try {
      const { response, data } = await loadWordsForTeacher();
      if (!response.ok) return;

      if (dailyWordSelect) {
        dailyWordSelect.innerHTML = '<option value="">Selecciona una palabra...</option>';
        data.forEach((word) => {
          const option = document.createElement('option');
          option.value = word.id;
          option.textContent = `${word.word} (${word.difficulty})`;
          dailyWordSelect.appendChild(option);
        });
      }

      if (typeof onWordsLoaded === 'function') {
        onWordsLoaded(data);
      }
    } catch (error) {
      console.error('Error loading words reference:', error);
    }
  }

  async function submitWord() {
    if (!wordForm?.checkValidity()) {
      wordForm.reportValidity();
      return;
    }

    const word = wordText.value.trim();
    const difficulty = wordDifficulty.value;
    const response = await authorizedFetch('/api/words', {
      method: 'POST',
      body: JSON.stringify({ word, difficulty }),
    });
    const data = await response.json();

    if (response.ok) {
      setMessage(teacherMessage, data.message || 'Palabra agregada de forma exitosa.');
      if (wordText) wordText.value = '';
      await loadDailyWordsOptions();
    } else {
      setMessage(teacherMessage, data.error || 'Error al guardar la palabra');
    }
  }

  async function submitDailyWord() {
    if (!dailyWordForm?.checkValidity()) {
      dailyWordForm.reportValidity();
      return;
    }

    const { response, data } = await setDailyWord(dailyWordSelect.value);
    if (response.ok) {
      setMessage(dailyWordMessage, data.message || 'Palabra del día establecida');
      if (dailyWordSelect) dailyWordSelect.value = '';
    } else {
      setMessage(dailyWordMessage, data.error || 'Error al establecer palabra del día');
    }
  }

  if (wordForm) {
    wordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitWord();
    });
  }

  if (dailyWordForm) {
    dailyWordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitDailyWord();
    });
  }

  return { loadDailyWordsOptions };
}
