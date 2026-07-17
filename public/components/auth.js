// public/components/auth.js

// Asegúrate de que la URL base de tu API sea la correcta.
// El puerto debe coincidir con el de tu servidor (en el README dice 4000).
const API_URL = 'http://localhost:4000/api';

/**
 * Muestra un mensaje de error o éxito al usuario.
 * @param {string} message - El mensaje a mostrar.
 * @param {boolean} isError - Si es un mensaje de error.
 */
function showFeedback(message, isError = false) {
  const feedbackElement = document.getElementById('feedback-message'); // Necesitas un elemento en tu HTML con este ID
  if (feedbackElement) {
    feedbackElement.textContent = message;
    feedbackElement.style.color = isError ? 'red' : 'green';
  } else {
    alert(message);
  }
}

/**
 * Maneja el envío del formulario de registro.
 */
async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();

    if (!response.ok) {
      return showFeedback(result.error || 'Ocurrió un error desconocido.', true);
    }

    showFeedback('¡Registro exitoso! Ahora puedes iniciar sesión.');
    form.reset();

  } catch (error) {
    showFeedback('No se pudo conectar con el servidor. Revisa tu conexión.', true);
  }
}

/**
 * Maneja el envío del formulario de inicio de sesión.
 */
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries()); // El backend espera 'credential' y 'password'

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();

    if (!response.ok) {
      return showFeedback(result.error || 'Credenciales incorrectas.', true);
    }

    // Si el login es exitoso, guarda el token y los datos del usuario
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));

    // Redirige al usuario a la página del juego
    window.location.href = '/game.html'; // Cambia esto a la página que corresponda

  } catch (error) {
    showFeedback('No se pudo conectar con el servidor. Revisa tu conexión.', true);
  }
}

// Debes asociar estas funciones a tus formularios en el HTML.
// Ejemplo: <form id="login-form" onsubmit="handleLogin(event)">...</form>