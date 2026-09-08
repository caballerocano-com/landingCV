import { getToken } from './api.js';

if (getToken()) {
  window.location.href = '/app/dashboard.html';
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Error al iniciar sesión';
      errorEl.hidden = false;
      return;
    }

    localStorage.setItem('app_token', data.token);
    window.location.href = '/app/dashboard.html';
  } catch {
    errorEl.textContent = 'No se pudo conectar con el servidor';
    errorEl.hidden = false;
  }
});
