// public/js/i18n-path.js

const SUPPORTED_LANGUAGES = ["es", "en", "fr", "it", "de", "pt"];
const DEFAULT_LANGUAGE = "en";
const STORAGE_KEY = "preferredLanguage";

let initialized = false;
const loaded = new Set();

function normalizeLanguage(lang) {
  if (!lang) return DEFAULT_LANGUAGE;

  const base = String(lang).toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

function detectLanguage() {
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const pathLang = pathSegments[0];

  if (SUPPORTED_LANGUAGES.includes(pathLang)) {
    return pathLang;
  }

  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get("lang");

  if (urlLang) {
    return normalizeLanguage(urlLang);
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    return normalizeLanguage(saved);
  }

  const browserLanguages = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];

  for (const lang of browserLanguages) {
    const normalized = normalizeLanguage(lang);

    if (SUPPORTED_LANGUAGES.includes(normalized)) {
      return normalized;
    }
  }

  return DEFAULT_LANGUAGE;
}

async function loadLocale(language) {
  const response = await fetch(`/js/locales/${language}.json`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load locale: ${language}`);
  }

  return response.json();
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = i18next.t(key);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    el.innerHTML = i18next.t(key);
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr") || "";
    const pairs = spec.split(",").map((s) => s.trim()).filter(Boolean);

    for (const pair of pairs) {
      const [attr, key] = pair.split(":").map((s) => s.trim());

      if (!attr || !key) continue;

      el.setAttribute(attr, i18next.t(key));
    }
  });

  document.documentElement.lang = i18next.language || DEFAULT_LANGUAGE;
}

function getCurrentPage() {
  const pathname = window.location.pathname;

  if (pathname.includes("portfolio")) {
    return "portfolio";
  }

  return "cv";
}

function buildLocalizedUrl(language, page = getCurrentPage()) {
  const lng = normalizeLanguage(language);

  if (page === "portfolio") {
    return `/portfolio.html?lang=${lng}`;
  }

  return `/?lang=${lng}`;
}

export async function setLanguage(language, options = {}) {
  const { redirect = true } = options;
  const lng = normalizeLanguage(language);

  if (!initialized) {
    const resources = await loadLocale(lng);
    loaded.add(lng);

    await i18next.init({
      lng,
      fallbackLng: DEFAULT_LANGUAGE,
      resources: {
        [lng]: {
          translation: resources
        }
      }
    });

    initialized = true;
  } else {
    if (!loaded.has(lng)) {
      const resources = await loadLocale(lng);
      i18next.addResourceBundle(lng, "translation", resources, true, true);
      loaded.add(lng);
    }

    await i18next.changeLanguage(lng);
  }

  localStorage.setItem(STORAGE_KEY, lng);

  if (redirect) {
    const nextUrl = buildLocalizedUrl(lng);
    const currentUrl = window.location.pathname;

    if (nextUrl !== currentUrl) {
      window.location.href = nextUrl;
      return;
    }
  }

  applyTranslations();

  window.dispatchEvent(
    new CustomEvent("site:i18n-ready", {
      detail: {
        language: lng
      }
    })
  );
}

export function getLanguage() {
  return initialized && i18next.language
    ? i18next.language
    : detectLanguage();
}

export async function initI18n() {
  const lng = detectLanguage();

  await setLanguage(lng, {
    redirect: false
  });
}

export function getLocalizedPageUrl(page) {
  return buildLocalizedUrl(getLanguage(), page);
}

window.setLanguage = setLanguage;
window.getLanguage = getLanguage;