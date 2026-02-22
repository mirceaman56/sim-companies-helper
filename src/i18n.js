// i18n.js
// Lightweight internationalization based on page URL path.
// Detects /de/ prefix → German, otherwise English (default).
import { parseLocaleNumber } from "./utils.js";
import en from "./translations/en.js";
import de from "./translations/de.js";
import fr from "./translations/fr.js";
import pt from "./translations/pt.js";
import tr from "./translations/tr.js";
import it from "./translations/it.js";
import es from "./translations/es.js";
import zh_cn from "./translations/zh_cn.js";
import zh_tw from "./translations/zh_tw.js";
import cs from "./translations/cs.js";
import pl from "./translations/pl.js";
import ja from "./translations/ja.js";

const STRINGS = {
  en,
  de,
  fr,
  pt,
  tr,
  it,
  es,
  zh_cn,
  zh_tw,
  cs,
  pl,
  ja,
};

function detectLang() {
  try {
    const path = window.location.pathname;
    const langCodes = {
      "/de": "de",
      "/fr": "fr",
      "/pt": "pt",
      "/tr": "tr",
      "/it": "it",
      "/es": "es",
      "/zh-cn": "zh_cn",
      "/zh-tw": "zh_tw",
      "/cs": "cs",
      "/pl": "pl",
      "/ja": "ja",
    };
    for (const [prefix, code] of Object.entries(langCodes)) {
      if (path.startsWith(prefix)) return code;
    }
    return "en";
  } catch {
    return "en";
  }
}

const currentLang = detectLang();

/**
 * Get a translated string by key.
 * Falls back to English if key is missing in the current language.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
}

/**
 * Get the current detected language code.
 * @returns {"en"|"de"|"fr"|"pt"|"tr"|"it"|"es"|"zh_cn"|"zh_tw"|"cs"|"pl"|"ja"}
 */
export function getLang() {
  return currentLang;
}

/**
 * Parse a locale-formatted number string into a JS number.
 * Re-exports the shared parseLocaleNumber from utils.js for backward compatibility.
 * @param {string} raw
 * @returns {number}
 */
export const parseLocalNumber = parseLocaleNumber;
