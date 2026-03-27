// translate.js
// Translates text to English via Lingva Translate API with fallback instances

const LINGVA_PRIMARY = "lingva.ml";
const LINGVA_FALLBACK = "lingva.thedaviddelta.com";
const TRANSLATE_TIMEOUT_MS = 5000;

// Map i18n language codes to Lingva API codes
const LANG_CODE_MAP = {
  zh_cn: "zh",
  zh_tw: "zh",
};

/**
 * Translate text to English using Lingva Translate.
 * Tries primary instance first, falls back to secondary.
 * @param {string} text - Text to translate
 * @param {string} langCode - Source language code from i18n (e.g. "de", "zh_cn")
 * @returns {Promise<string|null>} Translated English text, or null if translation fails or langCode is "en"
 */
export async function translateToEnglish(text, langCode) {
  if (langCode === "en") return null;

  const lingvaLang = LANG_CODE_MAP[langCode] || langCode;
  const encodedText = encodeURIComponent(text);

  const instances = [LINGVA_PRIMARY, LINGVA_FALLBACK];

  for (const instance of instances) {
    try {
      const url = `https://${instance}/api/v1/${lingvaLang}/en/${encodedText}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      if (data.translation) return data.translation;
    } catch {
      // Network error or timeout — try next instance
    }
  }

  return null;
}
