import { initI18n, getLocalizedPageUrl, getCurrentPageSection, getLanguage } from "./i18n-path.js";

// ── NAVIGATION LINKS ──────────────────────────────────────────────
document.querySelectorAll("[data-nav-section]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const section = link.getAttribute("data-nav-section");
    window.location.href = getLocalizedPageUrl(section === "home" ? null : section);
  });
});

function markActiveLinks() {
  const current = getCurrentPageSection() || "home";

  document.querySelectorAll("[data-nav-section]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-nav-section") === current);
  });
}

markActiveLinks();

// ── HAMBURGER / OVERLAY MENU ──────────────────────────────────────
const burgerBtn = document.getElementById("burgerBtn");
const navOverlay = document.getElementById("navOverlay");

function closeOverlay() {
  if (!burgerBtn || !navOverlay) return;
  burgerBtn.classList.remove("open");
  burgerBtn.setAttribute("aria-expanded", "false");
  navOverlay.classList.remove("open");
}

function openOverlay() {
  if (!burgerBtn || !navOverlay) return;
  burgerBtn.classList.add("open");
  burgerBtn.setAttribute("aria-expanded", "true");
  navOverlay.classList.add("open");
}

if (burgerBtn && navOverlay) {
  burgerBtn.addEventListener("click", () => {
    if (navOverlay.classList.contains("open")) {
      closeOverlay();
    } else {
      openOverlay();
    }
  });

  navOverlay.addEventListener("click", (event) => {
    if (event.target === navOverlay) {
      closeOverlay();
    }
  });

  navOverlay.querySelectorAll("[data-nav-section]").forEach((link) => {
    link.addEventListener("click", closeOverlay);
  });
}

// ── LANGUAGE MENU (desktop dropdown) ──────────────────────────────
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

// ── LANGUAGE LIST (mobile overlay) ────────────────────────────────
document.querySelectorAll(".nav__overlay-lang-list button[data-lang]").forEach((btn) => {
  btn.addEventListener("click", () => {
    window.setLanguage(btn.dataset.lang);
  });
});

function markActiveLangButtons() {
  const lng = getLanguage();
  document.querySelectorAll("button[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lng);
  });
}

// ── WHATSAPP LINKS (dynamic, per section + language) ──────────────
const WHATSAPP_PHONE = "34623800979";

function updateWhatsappLinks() {
  const section = getCurrentPageSection();
  const serviceKey = `services.${section}.name`;

  const message = section && i18next.exists(serviceKey)
    ? i18next.t("common.whatsapp_msg_template", { service: i18next.t(serviceKey) })
    : i18next.t("common.whatsapp_msg_generic");

  const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;

  document.querySelectorAll("[data-whatsapp-link]").forEach((el) => {
    el.setAttribute("href", url);
  });
}

// ── SERVICE PAGE LABEL ("Nuestros servicios de X") ────────────────
function updateServiceLabels() {
  const section = getCurrentPageSection();
  const serviceKey = `services.${section}.name`;

  if (!section || !i18next.exists(serviceKey)) return;

  const label = i18next.t("common.services_label_template", { service: i18next.t(serviceKey) });

  document.querySelectorAll("[data-service-label]").forEach((el) => {
    el.textContent = label;
  });
}

window.addEventListener("site:i18n-ready", markActiveLangButtons);
window.addEventListener("site:i18n-ready", updateWhatsappLinks);
window.addEventListener("site:i18n-ready", updateServiceLabels);

// ── INIT I18N ──────────────────────────────────────────────────────
initI18n()
  .then(markActiveLangButtons)
  .catch((error) => {
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
