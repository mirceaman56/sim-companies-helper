// i18n.js
// Lightweight internationalization based on page URL path.
// Detects /de/ prefix → German, otherwise English (default).

const STRINGS = {
  en: {
    productionHelper: "Production Helper",
    retailHelper: "Retail Helper",
    financialsHelper: "Financials Helper",
    chatFilter: "Chat Filter",
    loading: "Loading",
    loadingPrices: "Loading prices...",
    loadingCashflow: "Loading cashflow data...",
    noCashflowData: "No cashflow data available",
    recipeNotFound: "Recipe not found",
    authRequired: "Authentication required - realmId not available",
    unitCostNotFound: "Unit cost not found",
    errorLoadingPrices: "Error loading prices",
    na: "N/A",
    bad: "Bad",
    excellent: "Excellent",
    good: "Good",
    meh: "Meh",
    low: "Low",
    stop: "Stop",
    startSearch: "Start Search",
    buying: "Buying",
    selling: "Selling",
    searchingFor: "Searching for",
    searchStopped: "Search stopped.",
    supportTheDev: "Support The Dev",
    keepUpdates: "Keep the updates coming ⊂(◉‿◉)つ",
    reportBug: "Report a Bug",
    ensureCostPerUnit: "Ensure \"Cost per unit\" is visible in the game UI.",
    // -- Production panel --
    qty: "Qty",
    active: "Active",
    productionCosts: "Production Costs",
    costPerUnitUI: "Cost per Unit (UI)",
    totalProductionCost: "Total Production Cost",
    profitAnalysis: "Profit Analysis",
    marketInParens: "(Market)",
    marketSell: "Market Sell",
    fullTransportFee: "Full transport + Fee",
    profit: "Profit",
    margin: "Margin",
    breakEvenGt: "Break Even >",
    contractSell: "Contract Sell",
    halfTransport: "50% transport",
    perUnit: "/unit",
    cannotCalcProfit: "Cannot calculate profit - missing market prices",
    sellingAnalysis: "Selling Analysis",
    grossProceeds: "Gross Proceeds",
    marketFee4pct: "Market Fee (4%)",
    netProceeds: "Net Proceeds",
    profitMargin: "Profit Margin",
    // -- Retail panel --
    noItemSelected: "No item selected",
    clickToShowStats: "Click Quantity or Price to show stats.",
    profitPerMinute: "Profit per minute",
    perMin: "/min",
    perHour: "/hour",
    perDay: "/day",
    retailVsMarket: "Retail vs Market",
    costOfGoods: "Cost of Goods",
    unitCostLabel: "Unit Cost",
    marketNetProfit: "Market Net Profit",
    retailWinsBy: "Retail wins by",
    marketWinsBy: "Market wins by",
    basedOnCheapPrice: "Based on cheap price",
    loadingMarketPrices: "Loading market prices...",
    loadingMarketData: "Loading market data...",
    marketError: "Market Error",
    // -- Cashflow panel --
    todaysNetProfit: "Today's Net Profit",
    vsYesterday: "vs yesterday",
    incomes: "Incomes",
    expenses: "Expenses",
    total: "Total",
    retail: "Retail",
    contracts: "Contracts",
    marketLabel: "Market",
    other: "Other",
    production: "Production",
    wages: "Wages",
    marketBuy: "Market Buy",
    fees: "Fees",
    construction: "Construction",
    accounting: "Accounting",
    latest: "Latest",
    never: "never",
    sAgo: "s ago",
    mAgo: "m ago",
    hAgo: "h ago",
  },
  de: {
    productionHelper: "Produktionshelfer",
    retailHelper: "Einzelhandelshelfer",
    financialsHelper: "Finanzhelfer",
    chatFilter: "Chat-Filter",
    loading: "Lädt",
    loadingPrices: "Preise werden geladen...",
    loadingCashflow: "Cashflow-Daten werden geladen...",
    noCashflowData: "Keine Cashflow-Daten verfügbar",
    recipeNotFound: "Rezept nicht gefunden",
    authRequired: "Authentifizierung erforderlich - realmId nicht verfügbar",
    unitCostNotFound: "Stückkosten nicht gefunden",
    errorLoadingPrices: "Fehler beim Laden der Preise",
    na: "N/V",
    bad: "Schlecht",
    excellent: "Ausgezeichnet",
    good: "Gut",
    meh: "Mittelmäßig",
    low: "Niedrig",
    stop: "Stopp",
    startSearch: "Suche starten",
    buying: "Kaufe",
    selling: "Verkaufe",
    searchingFor: "Suche nach",
    searchStopped: "Suche gestoppt.",
    supportTheDev: "Entwickler unterstützen",
    keepUpdates: "Hilf mit, Updates zu ermöglichen ⊂(◉‿◉)つ",
    reportBug: "Fehler melden",
    ensureCostPerUnit: "Stelle sicher, dass \"Kosten pro Einheit\" in der Spieloberfläche sichtbar ist.",
    // -- Produktionspanel --
    qty: "Menge",
    active: "Aktiv",
    productionCosts: "Produktionskosten",
    costPerUnitUI: "Stückkosten (UI)",
    totalProductionCost: "Gesamtproduktionskosten",
    profitAnalysis: "Gewinnanalyse",
    marketInParens: "(Markt)",
    marketSell: "Marktverkauf",
    fullTransportFee: "Voller Transport + Gebühr",
    profit: "Gewinn",
    margin: "Marge",
    breakEvenGt: "Break Even >",
    contractSell: "Vertragsverkauf",
    halfTransport: "50% Transport",
    perUnit: "/Einheit",
    cannotCalcProfit: "Gewinn kann nicht berechnet werden – Marktpreise fehlen",
    sellingAnalysis: "Verkaufsanalyse",
    grossProceeds: "Bruttoerlös",
    marketFee4pct: "Marktgebühr (4%)",
    netProceeds: "Nettoerlös",
    profitMargin: "Gewinnmarge",
    // -- Einzelhandelspanel --
    noItemSelected: "Kein Artikel ausgewählt",
    clickToShowStats: "Klicke auf Menge oder Preis, um Statistiken anzuzeigen.",
    profitPerMinute: "Gewinn pro Minute",
    perMin: "/Min",
    perHour: "/Std",
    perDay: "/Tag",
    retailVsMarket: "Einzelhandel vs Markt",
    costOfGoods: "Warenkosten",
    unitCostLabel: "Stückkosten",
    marketNetProfit: "Markt-Nettogewinn",
    retailWinsBy: "Einzelhandel gewinnt um",
    marketWinsBy: "Markt gewinnt um",
    basedOnCheapPrice: "Basierend auf günstigstem Preis",
    loadingMarketPrices: "Lade Marktpreise...",
    loadingMarketData: "Lade Marktdaten...",
    marketError: "Marktfehler",
    // -- Cashflow-Panel --
    todaysNetProfit: "Heutiger Nettogewinn",
    vsYesterday: "vs gestern",
    incomes: "Einnahmen",
    expenses: "Ausgaben",
    total: "Gesamt",
    retail: "Einzelhandel",
    contracts: "Verträge",
    marketLabel: "Markt",
    other: "Sonstiges",
    production: "Produktion",
    wages: "Löhne",
    marketBuy: "Markteinkauf",
    fees: "Gebühren",
    construction: "Bau",
    accounting: "Buchhaltung",
    latest: "Aktualisiert",
    never: "nie",
    sAgo: "s her",
    mAgo: "m her",
    hAgo: "h her",
  },
};

/**
 * Detect language from the current page URL.
 * Returns "de" if the path starts with /de, otherwise "en".
 */
function detectLang() {
  try {
    return window.location.pathname.startsWith("/de") ? "de" : "en";
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
 * @returns {"en"|"de"}
 */
export function getLang() {
  return currentLang;
}

/**
 * Parse a locale-formatted number string into a JS number.
 * German: "." = thousands, "," = decimal  (e.g. "31.825" → 31825, "1,95" → 1.95)
 * English: "," = thousands, "." = decimal (e.g. "31,825" → 31825, "1.95" → 1.95)
 * @param {string} raw
 * @returns {number}
 */
export function parseLocalNumber(raw) {
  let s = String(raw).trim();
  if (currentLang === "de") {
    // Remove thousands separator (.) then swap decimal comma → dot
    s = s.replace(/\./g, "").replace(/,/, ".");
  } else {
    // Remove thousands separator (,)
    s = s.replace(/,/g, "");
  }
  const m = s.match(/-?\s*([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : NaN;
}

// ---------------------------------------------------------------------------
// Game-UI label patterns (used to scrape text from the Sim Companies DOM).
// Each key maps to an array of possible labels across all supported languages.
// The regex helpers below build patterns that match any variant.
// ---------------------------------------------------------------------------

const GAME_LABELS = {
  finishes:          ["Finishes:",          "Beendet:"],
  profitPerUnit:     ["Profit per unit:",   "Gewinn pro Einheit:"],
  costPerUnit:       ["Cost per unit:",     "Kosten pro Einheit:"],
  unitCost:          ["Unit cost:",         "Kosten pro Einheit:"],
  laborCost:         ["Labor cost:",        "Arbeitskosten:"],
  producingRightNow: ["Producing right now:", "Produziert gerade:"],
};

/**
 * Check if `text` contains any of the label variants for `key`.
 * @param {string} text
 * @param {string} key – one of the GAME_LABELS keys
 * @returns {boolean}
 */
export function matchesGameLabel(text, key) {
  const variants = GAME_LABELS[key];
  if (!variants) return false;
  const lower = text.toLowerCase();
  return variants.some((v) => lower.includes(v.toLowerCase()));
}

/**
 * Find an element whose textContent contains any variant of the given game label.
 * Drop-in replacement for the old `findTextElement(root, "Profit per unit:")` pattern.
 * @param {Element} root
 * @param {string} key – GAME_LABELS key
 * @returns {Element|null}
 */
export function findGameLabelElement(root, key) {
  const variants = GAME_LABELS[key];
  if (!variants) return null;
  const els = root.querySelectorAll("div, span, p");
  for (const el of els) {
    const tc = (el.textContent || "").toLowerCase();
    if (variants.some((v) => tc.includes(v.toLowerCase()))) return el;
  }
  return null;
}

/**
 * Build a RegExp that matches any of the label variants for `key`, followed by
 * the capture group supplied by the caller.
 * Example: gameRegex("costPerUnit", "\\s*\\$?([\\d,]+(?:\\.\\d+)?)")
 *   → /(?:Cost per unit|Kosten pro Einheit):\s*\$?([\d,]+(?:\.\d+)?)/i
 * @param {string} key
 * @param {string} afterColon – regex source to append after the colon
 * @returns {RegExp}
 */
export function gameRegex(key, afterColon) {
  const variants = GAME_LABELS[key];
  if (!variants) return new RegExp(afterColon, "i");
  // Strip trailing colon from the variants (we add it back in the pattern)
  const stems = variants.map((v) => v.replace(/:$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${stems.join("|")}):${afterColon}`, "i");
}

/**
 * Split text on any of the label variants for `key`.
 * Returns the portion *after* the first matched label, or "" if no match.
 * @param {string} text
 * @param {string} key
 * @returns {string}
 */
export function splitAfterGameLabel(text, key) {
  const variants = GAME_LABELS[key];
  if (!variants) return "";
  const lower = text.toLowerCase();
  for (const v of variants) {
    const idx = lower.indexOf(v.toLowerCase());
    if (idx !== -1) return text.slice(idx + v.length);
  }
  return "";
}
