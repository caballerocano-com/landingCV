import { initI18n } from './i18n-path.js';

// ── LANGUAGE MENU ──────────────────────────────────────────────────
const langBtn  = document.getElementById('langBtn');
const langMenu = document.getElementById('langMenu');

if (langBtn && langMenu) {
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('open');
  });

  document.addEventListener('click', () => langMenu.classList.remove('open'));

  langMenu.querySelectorAll('button[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.setLanguage(btn.dataset.lang);
    });
  });
}

// ── SCROLL REVEAL ──────────────────────────────────────────────────
const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 60);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

reveals.forEach(el => observer.observe(el));

// ── INIT I18N ──────────────────────────────────────────────────────
await initI18n();
