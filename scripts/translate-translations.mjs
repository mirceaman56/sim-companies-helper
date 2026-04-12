import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const translationsDir = path.join(repoRoot, "src", "translations");
const englishFile = "en.js";

const localeConfig = {
  de: { file: "de.js", apiCode: "de" },
  fr: { file: "fr.js", apiCode: "fr" },
  pt: { file: "pt.js", apiCode: "pt" },
  tr: { file: "tr.js", apiCode: "tr" },
  it: { file: "it.js", apiCode: "it" },
  es: { file: "es.js", apiCode: "es" },
  zh_cn: { file: "zh_cn.js", apiCode: "zh-CN" },
  zh_tw: { file: "zh_tw.js", apiCode: "zh-TW" },
  cs: { file: "cs.js", apiCode: "cs" },
  pl: { file: "pl.js", apiCode: "pl" },
  ja: { file: "ja.js", apiCode: "ja" },
};

const defaultProvider = process.env.SCX_TRANSLATE_PROVIDER || "google";
const defaultDelayMs = Number.parseInt(process.env.SCX_TRANSLATE_DELAY_MS || "120", 10);
const defaultLibreUrl = process.env.SCX_LIBRE_URL || "https://libretranslate.com/translate";

function printHelp() {
  console.log(`Usage: node scripts/translate-translations.mjs [options]

Translates missing fallback English values from src/translations/en.js into all locale files.

Options:
  --locales=<csv>      Restrict locales (example: --locales=de,fr,pl)
  --provider=<name>    Translation provider: google | libre | mock (default: ${defaultProvider})
  --libre-url=<url>    LibreTranslate endpoint (default: ${defaultLibreUrl})
  --delay-ms=<num>     Delay between requests per locale (default: ${defaultDelayMs})
  --all                Retranslate all keys (not only missing/English fallback keys)
  --prune              Remove locale keys not present in English file
  --dry-run            Do not write files
  --help               Show this help

Notes:
  - google provider uses unofficial free endpoint translate.googleapis.com.
  - libre provider uses a free LibreTranslate endpoint you supply or default.`);
}

function parseArgs(argv) {
  const options = {
    locales: null,
    provider: defaultProvider,
    libreUrl: defaultLibreUrl,
    delayMs: Number.isFinite(defaultDelayMs) ? Math.max(0, defaultDelayMs) : 120,
    translateAll: false,
    prune: false,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--all") {
      options.translateAll = true;
      continue;
    }
    if (arg === "--prune") {
      options.prune = true;
      continue;
    }

    const [flag, rawValue] = arg.split("=", 2);
    if (rawValue == null) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (flag === "--locales") {
      options.locales = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    if (flag === "--provider") {
      options.provider = rawValue.trim();
      continue;
    }

    if (flag === "--libre-url") {
      options.libreUrl = rawValue.trim();
      continue;
    }

    if (flag === "--delay-ms") {
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --delay-ms value: ${rawValue}`);
      }
      options.delayMs = parsed;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidIdentifier(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function formatObjectKey(key) {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

function serializeTranslationObject(translations, orderedKeys) {
  const lines = ["export default {"];

  for (const key of orderedKeys) {
    if (!(key in translations)) {
      continue;
    }
    const value = typeof translations[key] === "string" ? translations[key] : String(translations[key] ?? "");
    lines.push(`  ${formatObjectKey(key)}: ${JSON.stringify(value)},`);
  }

  lines.push("};");
  return `${lines.join("\n")}\n`;
}

function shouldTranslate({ englishValue, localeValue, translateAll }) {
  if (translateAll) {
    return true;
  }

  if (typeof localeValue !== "string") {
    return true;
  }

  if (localeValue.trim() === "") {
    return true;
  }

  return localeValue === englishValue;
}

function shouldSkipApiTranslation(text) {
  return !/[A-Za-z]/.test(text);
}

function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadTranslationModule(filePath) {
  const fileUrl = pathToFileURL(filePath);
  fileUrl.searchParams.set("t", String(Date.now()));
  const mod = await import(fileUrl.href);
  if (!isPlainObject(mod.default)) {
    throw new Error(`Expected default object export in ${filePath}`);
  }
  return mod.default;
}

async function translateViaGoogle({ text, targetCode }) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", targetCode);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google translate failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("Unexpected Google translate response format");
  }

  const translated = payload[0]
    .map((chunk) => {
      if (!Array.isArray(chunk) || typeof chunk[0] !== "string") {
        return "";
      }
      return chunk[0];
    })
    .join("")
    .trim();

  if (!translated) {
    throw new Error("Google translate returned empty text");
  }

  return translated;
}

async function translateViaLibre({ text, targetCode, libreUrl }) {
  const response = await fetch(libreUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: text,
      source: "en",
      target: targetCode,
      format: "text",
    }),
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate failed (${response.status})`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.translatedText !== "string" || payload.translatedText.trim() === "") {
    throw new Error("Unexpected LibreTranslate response format");
  }

  return payload.translatedText.trim();
}

async function translateText({ text, targetCode, options }) {
  if (options.provider === "mock") {
    return `[${targetCode}] ${text}`;
  }

  if (options.provider === "google") {
    return translateViaGoogle({ text, targetCode });
  }

  if (options.provider === "libre") {
    return translateViaLibre({ text, targetCode, libreUrl: options.libreUrl });
  }

  throw new Error(`Unsupported provider: ${options.provider}`);
}

async function translateWithRetry({ text, targetCode, options, attempts = 3 }) {
  let lastError = null;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await translateText({ text, targetCode, options });
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        await sleep(250 * i);
      }
    }
  }

  throw lastError;
}

function pickLocales(options) {
  const allLocales = Object.keys(localeConfig);
  if (!options.locales || options.locales.length === 0) {
    return allLocales;
  }

  const invalid = options.locales.filter((locale) => !(locale in localeConfig));
  if (invalid.length > 0) {
    throw new Error(`Unsupported locales: ${invalid.join(", ")}`);
  }

  return options.locales;
}

async function processLocale({ locale, englishTranslations, englishKeys, options }) {
  const localeMeta = localeConfig[locale];
  const localePath = path.join(translationsDir, localeMeta.file);
  const localeTranslations = await loadTranslationModule(localePath);

  const outputTranslations = { ...localeTranslations };
  const keysToTranslate = [];

  for (const key of englishKeys) {
    const englishValue = typeof englishTranslations[key] === "string" ? englishTranslations[key] : String(englishTranslations[key] ?? "");
    const localeValue = outputTranslations[key];

    if (shouldTranslate({ englishValue, localeValue, translateAll: options.translateAll })) {
      keysToTranslate.push(key);
    }
  }

  const translatedKeys = [];
  const copiedNoApi = [];

  for (const key of keysToTranslate) {
    const sourceText = typeof englishTranslations[key] === "string" ? englishTranslations[key] : String(englishTranslations[key] ?? "");

    if (shouldSkipApiTranslation(sourceText)) {
      outputTranslations[key] = sourceText;
      copiedNoApi.push(key);
      continue;
    }

    if (options.dryRun) {
      continue;
    }

    const translated = await translateWithRetry({
      text: sourceText,
      targetCode: localeMeta.apiCode,
      options,
    });

    outputTranslations[key] = translated;
    translatedKeys.push(key);

    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  for (const key of englishKeys) {
    if (!(key in outputTranslations)) {
      const sourceText = typeof englishTranslations[key] === "string" ? englishTranslations[key] : String(englishTranslations[key] ?? "");
      outputTranslations[key] = sourceText;
    }
  }

  const extraKeys = Object.keys(outputTranslations).filter((key) => !Object.prototype.hasOwnProperty.call(englishTranslations, key));
  if (options.prune) {
    for (const key of extraKeys) {
      delete outputTranslations[key];
    }
  }

  const orderedKeys = options.prune ? englishKeys : [...englishKeys, ...extraKeys];
  const nextText = serializeTranslationObject(outputTranslations, orderedKeys);
  const prevText = ensureTrailingNewline(normalizeText(fs.readFileSync(localePath, "utf8")));

  let wrote = false;
  if (!options.dryRun && nextText !== prevText) {
    fs.writeFileSync(localePath, nextText, "utf8");
    wrote = true;
  }

  return {
    locale,
    keysToTranslate: keysToTranslate.length,
    translatedCount: translatedKeys.length,
    copiedNoApiCount: copiedNoApi.length,
    prunedCount: options.prune ? extraKeys.length : 0,
    wrote,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const supportedProviders = new Set(["google", "libre", "mock"]);
  if (!supportedProviders.has(options.provider)) {
    throw new Error(`Invalid provider: ${options.provider}. Use google, libre, or mock.`);
  }

  const locales = pickLocales(options);

  const englishPath = path.join(translationsDir, englishFile);
  const englishTranslations = await loadTranslationModule(englishPath);
  const englishKeys = Object.keys(englishTranslations);

  console.log(`[i18n] Provider: ${options.provider}`);
  console.log(`[i18n] Locales: ${locales.join(", ")}`);
  console.log(`[i18n] Mode: ${options.translateAll ? "all-keys" : "missing-or-english-fallback"}`);
  if (options.dryRun) {
    console.log("[i18n] Dry run enabled (no files written)");
  }

  let totalCandidates = 0;
  let totalTranslated = 0;
  let totalCopied = 0;
  let totalPruned = 0;
  let totalWritten = 0;

  for (const locale of locales) {
    const result = await processLocale({
      locale,
      englishTranslations,
      englishKeys,
      options,
    });

    totalCandidates += result.keysToTranslate;
    totalTranslated += result.translatedCount;
    totalCopied += result.copiedNoApiCount;
    totalPruned += result.prunedCount;
    totalWritten += result.wrote ? 1 : 0;

    console.log(
      `[i18n] ${result.locale}: candidates=${result.keysToTranslate}, translated=${result.translatedCount}, copiedNoApi=${result.copiedNoApiCount}, pruned=${result.prunedCount}, fileUpdated=${result.wrote}`
    );
  }

  console.log(
    `[i18n] Done. candidates=${totalCandidates}, translated=${totalTranslated}, copiedNoApi=${totalCopied}, pruned=${totalPruned}, filesUpdated=${totalWritten}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[i18n] Failed: ${message}`);
  process.exitCode = 1;
});
