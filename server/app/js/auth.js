import { apiFetch, getToken } from './api.js';

async function guard() {
  const token = getToken();
  if (!token) {
    window.location.href = '/app/index.html';
    return false;
  }
  try {
    await apiFetch('/auth/check');
    return true;
  } catch {
    localStorage.removeItem('app_token');
    window.location.href = '/app/index.html';
    return false;
  }
}

async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // ignore network errors on logout
  }
  localStorage.removeItem('app_token');
  window.location.href = '/app/index.html';
}

export { guard, logout };
