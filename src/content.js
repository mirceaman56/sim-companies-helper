// content.js
import { STATE } from "./state.js";
import { loadAuthDataOnce } from "./auth.js";
import { ensureMarketFetchForProduct, getCheapestListing } from "./market.js";
import { ensureSidebar, updatePanel } from "./ui.js";

/**
 * One RAF per tick to avoid UI thrash
 */
function scheduleUpdate() {
  if (STATE.rafPending) return;
  STATE.rafPending = true;
  requestAnimationFrame(() => {
    STATE.rafPending = false;
    updatePanel(RetailHelper.renderers);
  });
}

/**
 * ---------------------------
 * Inventory (kept in content)
 * ---------------------------
 */

function sumCost(cost) {
  if (!cost) return 0;
  return (
    (cost.workers || 0) +
    (cost.admin || 0) +
    (cost.material1 || 0) +
    (cost.material2 || 0) +
    (cost.material3 || 0) +
    (cost.material4 || 0) +
    (cost.material5 || 0) +
    (cost.market || 0)
  );
}

function rebuildInventoryIndex(items) {
  const byKind = new Map();

  for (const it of items || []) {
    const kind = it?.kind;
    if (!Number.isFinite(kind)) continue;

    const amount = Number(it.amount || 0);
    const totalCost =(allFiniteNumber(sumCost(it.cost)) ? sumCost(it.cost) : 0);

    const existing =
      byKind.get(kind) || {
        kind,
        amount: 0,
        totalCost: 0,
        marketCost: 0,
        workers: 0,
        admin: 0,
        materials: 0,
      };

    existing.amount += amount;
    existing.totalCost += totalCost;

    const c = it.cost || {};
    existing.marketCost += c.market || 0;
    existing.workers += c.workers || 0;
    existing.admin += c.admin || 0;
    existing.materials +=
      (c.material1 || 0) +
      (c.material2 || 0) +
      (c.material3 || 0) +
      (c.material4 || 0) +
      (c.material5 || 0);

    byKind.set(kind, existing);
  }

  STATE.inventory.byKind = byKind;
}

function allFiniteNumber(x) {
  return Number.isFinite(x);
}

async function loadInventoryOnce() {
  if (!STATE.inventory) return; // safety
  if (STATE.inventory.loaded || STATE.inventory.loading) return;

  const companyId = STATE.auth?.companyId;
  if (!companyId) return;

  STATE.inventory.loading = true;
  STATE.inventory.status = "loading";
  STATE.inventory.error = null;

  try {
    const url = `https://www.simcompanies.com/api/v3/resources/${companyId}/`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const items = await res.json();
    STATE.inventory.items = Array.isArray(items) ? items : [];
    rebuildInventoryIndex(STATE.inventory.items);

    STATE.inventory.loaded = true;
    STATE.inventory.status = "ok";
  } catch (e) {
    STATE.inventory.status = "error";
    STATE.inventory.error = String(e?.message || e);
  } finally {
    STATE.inventory.loading = false;
    scheduleUpdate();
  }
}

/**
 * ---------------------------
 * Retail UI parsing/adapters
 * ---------------------------
 */
const RetailHelper = (() => {
  // ---------- parsing ----------
  function parseNumber(text) {
    const m = String(text).replace(/,/g, "").match(/-?\s*([0-9]+(\.[0-9]+)?)/);
    return m ? Number(m[1]) : NaN;
  }
  function parseMoney(text) {
    return parseNumber(text);
  }

  function findTextElement(root, includesText) {
    const els = root.querySelectorAll("div, span, p");
    for (const el of els) {
      if ((el.textContent || "").includes(includesText)) return el;
    }
    return null;
  }

  // supports: "12s", "8m", "1h 5m", "1d 5h", "1d, 8m", etc.
  function parseDurationToSeconds(text) {
    const s = String(text);
    let total = 0;
    const d = s.match(/(\d+)\s*d/i);
    const h = s.match(/(\d+)\s*h/i);
    const m = s.match(/(\d+)\s*m/i);
    const sec = s.match(/(\d+)\s*s/i);
    if (d) total += Number(d[1]) * 86400;
    if (h) total += Number(h[1]) * 3600;
    if (m) total += Number(m[1]) * 60;
    if (sec) total += Number(sec[1]);
    return total > 0 ? total : NaN;
  }

  function extractFinishSeconds(row) {
    const finishEl = findTextElement(row, "Finishes:");
    if (!finishEl) return NaN;

    const t = finishEl.textContent || "";
    const paren = t.match(/\(([^)]+)\)/);
    if (paren) return parseDurationToSeconds(paren[1]);

    return parseDurationToSeconds(t);
  }

  function extractProfitPerUnit(row) {
    const profitEl = findTextElement(row, "Profit per unit:");
    if (!profitEl) return NaN;

    const t = profitEl.textContent || "";
    const after =
      ((t.split("Profit per unit:")[1] || "").match(/-?\$?\d+(\.\d+)?/) || [])[0] || "";

    const val = parseMoney(after);
    if (!isFinite(val)) return NaN;

    // explicit minus formats
    const hasExplicitMinus =
      /-\s*\$/.test(after) ||
      /−\s*\$/.test(after) ||
      /^\s*-/.test(after) ||
      /^\s*−/.test(after) ||
      /\(\s*\$?\s*\d/.test(after);

    if (hasExplicitMinus) return -Math.abs(val);

    // implicit negative by red-ish text
    const color = getComputedStyle(profitEl).color;
    const mm = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (mm) {
      const r = Number(mm[1]),
        g = Number(mm[2]),
        b = Number(mm[3]);
      if (r > 150 && g < 100 && b < 100) return -Math.abs(val);
    }

    return Math.abs(val);
  }

  function extractProductId(row) {
    const a = row?.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
    const href = a?.getAttribute("href") || "";
    const m = href.match(/\/resource\/(\d+)\//);
    return m ? Number(m[1]) : null;
  }

  function computeMetrics({ profitPerUnit, qty, seconds }) {
    const totalProfit = profitPerUnit * qty;
    const minutes = seconds / 60;
    const hours = seconds / 3600;

    const profitPerMin = isFinite(totalProfit) && minutes > 0 ? totalProfit / minutes : NaN;
    const profitPerHr = isFinite(totalProfit) && hours > 0 ? totalProfit / hours : NaN;

    return { totalProfit, profitPerMin, profitPerHr, seconds };
  }

  // ---------- row detection ----------
  function isSellInput(target) {
    return target instanceof Element && target.matches('input[name="price"], input[name="quantity"]');
  }

  /**
   * Robust row finder for both themes:
   * - walks up and returns the nearest ancestor that contains both inputs + an encyclopedia link
   * - falls back to old wrapper classes
   */
  function getRowFromTarget(target) {
    if (!(target instanceof Element)) return null;

    // old wrapper fallback
    const old = target.closest("div.css-mv4qyq");
    if (old && old.querySelector('input[name="price"]') && old.querySelector('input[name="quantity"]')) {
      return old;
    }

    // direct heuristic: nearest ancestor with both inputs and a resource link
    let el = target;
    for (let i = 0; i < 25 && el; i++) {
      const hasInputs =
        !!el.querySelector?.('input[name="price"]') &&
        !!el.querySelector?.('input[name="quantity"]');
      const hasLink =
        !!el.querySelector?.('a[href*="/encyclopedia/"][href*="/resource/"]');

      if (hasInputs && hasLink) return el;

      // some containers are too big; stop if we reached body
      if (el === document.body) break;
      el = el.parentElement;
    }

    // final: nearest ancestor with both inputs (even if link missing)
    el = target;
    for (let i = 0; i < 25 && el; i++) {
      if (
        el.querySelector?.('input[name="price"]') &&
        el.querySelector?.('input[name="quantity"]')
      ) {
        return el;
      }
      if (el === document.body) break;
      el = el.parentElement;
    }

    return null;
  }

  function getProductName(row) {
    if (!row) return "Unknown";
    const h3s = row.querySelectorAll("h3");
    for (const h of h3s) {
      const t = (h.textContent || "").trim();
      if (!t) continue;
      const tl = t.toLowerCase();
      if (tl === "quantity" || tl === "price") continue;
      return t;
    }
    return "Unknown";
  }

  // ---------- UI data adapters ----------
  const renderers = {
    getProductName,

    getMetrics(row) {
      const qty = parseNumber(row.querySelector('input[name="quantity"]')?.value ?? "");
      const yourPrice = parseMoney(row.querySelector('input[name="price"]')?.value ?? "");
      const profitPerUnit = extractProfitPerUnit(row);
      const seconds = extractFinishSeconds(row);
      const m = computeMetrics({ profitPerUnit, qty, seconds });
      return { ...m, profitPerUnit, qty, yourPrice };
    },

    getInventoryView(row) {
      const kind = extractProductId(row);

      if (!STATE.inventory) {
        return { status: "Idle", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };
      }

      if (STATE.inventory.status === "loading")
        return { status: "Loading", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };

      if (STATE.inventory.status === "error")
        return {
          status: "Error",
          stock: "—",
          cpu: "—",
          src: "—",
          basis: "—",
          note: STATE.inventory.error || "",
        };

      if (STATE.inventory.status !== "ok")
        return { status: "Idle", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };

      const inv = kind ? STATE.inventory.byKind.get(kind) : null;
      if (!inv) return { status: "OK", stock: "0", cpu: "—", src: "—", basis: "—", note: "" };

      const cpu = inv.amount > 0 ? `$${(inv.totalCost / inv.amount).toFixed(2)}` : "—";
      const src =
        inv.marketCost > 0 && (inv.workers + inv.admin + inv.materials) > 0
          ? "Mixed"
          : inv.marketCost > 0
          ? "Market"
          : inv.workers + inv.admin + inv.materials > 0
          ? "Produced"
          : "Unknown";

      const note = `Mix: market $${(inv.marketCost || 0).toFixed(2)} | produced $${(
        (inv.workers || 0) +
        (inv.admin || 0) +
        (inv.materials || 0)
      ).toFixed(2)}`;

      return {
        status: "OK",
        stock: String(Math.floor(inv.amount)),
        cpu,
        src,
        basis: `$${(inv.totalCost || 0).toFixed(2)}`,
        note,
      };
    },

    getMarketView(row) {
      const productId = extractProductId(row);
      if (productId) ensureMarketFetchForProduct(productId, scheduleUpdate);

      const ms = STATE.marketState;

      // if your market module stores productId in marketState, this prevents stale display:
      if (ms?.productId != null && productId != null && ms.productId !== productId) {
        return { status: "Loading", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };
      }

      if (!ms || ms.status === "idle")
        return { status: "Idle", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      if (ms.status === "loading")
        return { status: "Loading", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      if (ms.status === "error")
        return {
          status: "Error",
          cheapestPrice: "—",
          cheapestQty: "—",
          youVs: "—",
          note: ms.error || "",
        };

      const cheapest = getCheapestListing(ms.data);
      if (!cheapest)
        return { status: "Empty", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      const yourPrice = parseMoney(row.querySelector('input[name="price"]')?.value ?? "");
      const youVs = isFinite(yourPrice) ? yourPrice - cheapest.price : NaN;

      return {
        status: "OK",
        cheapestPrice: `$${cheapest.price.toFixed(2)}`,
        cheapestQty: cheapest.quantity == null ? "—" : String(cheapest.quantity),
        youVs: isFinite(youVs) ? `${youVs > 0 ? "+" : ""}${youVs.toFixed(2)}` : "—",
        note: "",
      };
    },
  };

  // ---------- selection wiring ----------
  function setSelectedRow(row) {
    if (!row) return;

    STATE.selectedRow = row;

    // disconnect old observers
    STATE.selectedRowObserver?.disconnect();
    STATE.selectedRowObserver = null;

    // remove old listeners
    if (STATE.selectedInputs) {
      const { priceInput, qtyInput, onInput } = STATE.selectedInputs;
      priceInput?.removeEventListener("input", onInput);
      qtyInput?.removeEventListener("input", onInput);
    }
    STATE.selectedInputs = null;

    const priceInput = row.querySelector('input[name="price"]');
    const qtyInput = row.querySelector('input[name="quantity"]');
    const onInput = () => scheduleUpdate();

    priceInput?.addEventListener("input", onInput);
    qtyInput?.addEventListener("input", onInput);
    STATE.selectedInputs = { priceInput, qtyInput, onInput };

    // observe row changes (React updates profit/time etc)
    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(row, { childList: true, subtree: true, characterData: true });
    STATE.selectedRowObserver = mo;

    scheduleUpdate();
  }

  function onFocusOrClick(e) {
    const t = e.target;
    if (!isSellInput(t)) return;
    const row = getRowFromTarget(t);
    if (row) setSelectedRow(row);
  }

  function autoSelectFirstRow() {
    if (STATE.selectedRow) return;
    const input = document.querySelector(
      'input[name="price"], input[name="quantity"]'
    );
    const row = input ? getRowFromTarget(input) : null;
    if (row) setSelectedRow(row);
  }

  return { onFocusOrClick, autoSelectFirstRow, renderers };
})();

/**
 * ---------------------------
 * Init
 * ---------------------------
 */
async function init() {
  ensureSidebar();

  await loadAuthDataOnce();
  await loadInventoryOnce();

  scheduleUpdate();
  RetailHelper.autoSelectFirstRow();
}

init();

window.addEventListener("focusin", RetailHelper.onFocusOrClick, true);
window.addEventListener("click", RetailHelper.onFocusOrClick, true);
