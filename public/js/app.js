import { initI18n, getLocalizedPageUrl } from "./i18n-path.js";

// ── NAVIGATION ─────────────────────────────────────────────────────
document.querySelectorAll("[data-nav-page]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const page = link.getAttribute("data-nav-page");
    window.location.href = getLocalizedPageUrl(page);
  });
});

// ── LANGUAGE MENU ──────────────────────────────────────────────────
const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");

if (langBtn && langMenu) {
  langBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    langMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    langMenu.classList.remove("open");
  });

  langMenu.querySelectorAll("button[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.setLanguage(btn.dataset.lang);
    });
  });
}

// ── INIT I18N ──────────────────────────────────────────────────────
initI18n().catch((error) => {
  console.error("I18N error:", error);
});

// ── SCROLL REVEAL ──────────────────────────────────────────────────
const reveals = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add("visible");
      }, index * 60);

      observer.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.08,
  rootMargin: "0px 0px -32px 0px"
});

reveals.forEach((el) => observer.observe(el));