// public/js/i18n-path.js
const SUPPORTED_LANGUAGES = ["es", "en", "fr", "it", "de", "pt"];
const DEFAULT_LANGUAGE = "en";
const STORAGE_KEY = "preferredLanguage";

function normalizeLanguage(lang) {
  if (!lang) return DEFAULT_LANGUAGE;
  const lower = String(lang).toLowerCase();
  const base = lower.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

function detectLanguage() {
  // 0. URL path: /es/, /en/, etc.
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const rawPathLang = pathSegments[0] ? String(pathSegments[0]).toLowerCase() : "";

  if (SUPPORTED_LANGUAGES.includes(rawPathLang)) {
    return rawPathLang;
  }

  // 1. URL param (used by verification emails)
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get("lang");
  if (urlLang) return normalizeLanguage(urlLang);

  // 2. saved preference
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeLanguage(saved);

  // 3. browser languages
  const navLangs = Array.isArray(navigator.languages) ? navigator.languages : [];
  for (const l of navLangs) {
    const normalized = normalizeLanguage(l);
    if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  }

  return normalizeLanguage(navigator.language);
}

async function loadLocale(language) {
  const res = await fetch(`/js/locales/${language}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load locale: ${language}`);
  return res.json();
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

function dispatchI18nReady() {
  window.dispatchEvent(
    new CustomEvent("riimbo:i18n-ready", {
      detail: {
        language: i18next.language || DEFAULT_LANGUAGE
      }
    })
  );
}

// Cache de recursos ya cargados
const loaded = new Set();
let initialized = false;

function buildLocalizedCurrentUrl(language) {
  const lng = normalizeLanguage(language);
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const rawPathLang = pathSegments[0] ? String(pathSegments[0]).toLowerCase() : "";
  const hasLangInPath = SUPPORTED_LANGUAGES.includes(rawPathLang);

  if (hasLangInPath) {
    pathSegments[0] = lng;
  } else {
    pathSegments.unshift(lng);
  }

  const hasTrailingSlash = window.location.pathname.endsWith("/");
  let nextPath = `/${pathSegments.join("/")}`;

  if (hasTrailingSlash || pathSegments.length === 1) {
    nextPath += "/";
  }

  nextPath = nextPath.replace(/\/{2,}/g, "/");

  return `${nextPath}${window.location.search}${window.location.hash}`;
}

export async function setLanguage(language) {
  const lng = normalizeLanguage(language);

  // Init i18next una sola vez
  if (!initialized) {
    const resources = await loadLocale(lng);
    loaded.add(lng);

    await i18next.init({
      lng,
      fallbackLng: DEFAULT_LANGUAGE,
      resources: {
        [lng]: { translation: resources }
      }
    });

    // Reaplicar traducciones cuando cambie idioma
    i18next.on("languageChanged", () => {
      applyTranslations();
      dispatchI18nReady();
    });

    initialized = true;
  } else {
    // Cargar recursos si no están
    if (!loaded.has(lng)) {
      const resources = await loadLocale(lng);
      i18next.addResourceBundle(lng, "translation", resources, true, true);
      loaded.add(lng);
    }

    await i18next.changeLanguage(lng);
  }

  localStorage.setItem(STORAGE_KEY, lng);

  const nextUrl = buildLocalizedCurrentUrl(lng);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.location.assign(nextUrl);
    return;
  }

  applyTranslations();
  dispatchI18nReady();
}

export function getLanguage() {
  return (initialized && i18next.language) ? i18next.language : detectLanguage();
}

export async function initI18n() {
  const lng = detectLanguage();
  await setLanguage(lng);
}

// Exponer para componentes que no importan
window.setLanguage = setLanguage;
window.getLanguage = getLanguage;

// Auto-init
initI18n().catch((err) => {
  console.error("[i18n] init failed:", err);
});