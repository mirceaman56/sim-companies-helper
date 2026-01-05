(() => {
  const SIDEBAR_ID = "scx-sidebar";

  const STATE = {
    selectedRow: null,
    selectedRowObserver: null,
    selectedInputs: null,
    rafPending: false,

    auth: {
      companyId: null,
      realmId: null,
      loaded: false,
      loading: false,
      error: null,
    },

    inventory: {
      loaded: false,
      loading: false,
      status: "idle", // idle | loading | ok | error
      error: null,
      items: [],
      byKind: new Map(), // kind -> aggregated entry
    },

    marketCache: new Map(), // key -> { ts, data } where key = `${realmId}:${productId}`
    marketState: { status: "idle", productId: null, realmId: null, data: null, error: null },
  };

  // ---------- utils ----------
  function parseNumber(text) {
    const m = String(text).replace(/,/g, "").match(/-?\s*([0-9]+(\.[0-9]+)?)/);
    return m ? Number(m[1]) : NaN;
  }

  function parseMoney(text) {
    return parseNumber(text);
  }

  // replace your parseDurationToSeconds with this version
function parseDurationToSeconds(text) {
  const s = String(text);

  let total = 0;

  // days
  const d = s.match(/(\d+)\s*d/i);
  // hours
  const h = s.match(/(\d+)\s*h/i);
  // minutes
  const m = s.match(/(\d+)\s*m/i);
  // seconds
  const sec = s.match(/(\d+)\s*s/i);

  if (d) total += Number(d[1]) * 86400;
  if (h) total += Number(h[1]) * 3600;
  if (m) total += Number(m[1]) * 60;
  if (sec) total += Number(sec[1]);

  return total > 0 ? total : NaN;
}


  function formatMoney(x) {
    if (!isFinite(x)) return "—";
    const sign = x < 0 ? "-" : "";
    return `${sign}$${Math.abs(x).toFixed(2)}`;
  }

  function formatMoneyPerMin(x) {
    if (!isFinite(x)) return "—";
    const sign = x < 0 ? "-" : "";
    return `${sign}$${Math.abs(x).toFixed(2)}/min`;
  }

  function formatMoneyPerHr(x) {
    if (!isFinite(x)) return "—";
    const sign = x < 0 ? "-" : "";
    return `${sign}$${Math.abs(x).toFixed(2)}/hr`;
  }

  function scheduleUpdate() {
    if (STATE.rafPending) return;
    STATE.rafPending = true;
    requestAnimationFrame(() => {
      STATE.rafPending = false;
      updatePanel();
    });
  }

  function findTextElement(root, includesText) {
    const els = root.querySelectorAll("div, span, p");
    for (const el of els) {
      if ((el.textContent || "").includes(includesText)) return el;
    }
    return null;
  }

  // ---------- profit extraction ----------
  function extractProfitPerUnit(row) {
    const profitEl = findTextElement(row, "Profit per unit:");
    if (!profitEl) return NaN;

    const t = profitEl.textContent || "";
    const after = ((t.split("Profit per unit:")[1] || "").match(/-?\$?\d+(\.\d+)?/) || [])[0] || "";

    const val = parseMoney(after);
    if (!isFinite(val)) return NaN;

    const hasExplicitMinus =
      /-\s*\$/.test(after) ||
      /−\s*\$/.test(after) ||
      /^\s*-/.test(after) ||
      /^\s*−/.test(after) ||
      /\(\s*\$?\s*\d/.test(after);

    if (hasExplicitMinus) return -Math.abs(val);

    // Implicit negative: red text without minus
    const color = getComputedStyle(profitEl).color;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
      if (r > 150 && g < 100 && b < 100) return -Math.abs(val);
    }

    return Math.abs(val);
  }

  function extractFinishSeconds(row) {
    const finishEl = findTextElement(row, "Finishes:");
    if (!finishEl) return NaN;

    const t = finishEl.textContent || "";
    const paren = t.match(/\(([^)]+)\)/);
    if (paren) return parseDurationToSeconds(paren[1]);

    return parseDurationToSeconds(t);
  }

  // ---------- auth ----------
  async function loadAuthDataOnce() {
    if (STATE.auth.loaded || STATE.auth.loading) return;
    STATE.auth.loading = true;
    STATE.auth.error = null;

    try {
      const res = await fetch("https://www.simcompanies.com/api/v3/companies/auth-data/", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const c = data?.authCompany;

      STATE.auth.companyId = c?.companyId ?? null;
      STATE.auth.realmId = c?.realmId ?? null;
      STATE.auth.loaded = true;
    } catch (e) {
      STATE.auth.error = String(e?.message || e);
    } finally {
      STATE.auth.loading = false;
      scheduleUpdate();
    }
  }

  function getRealmId() {
    return STATE.auth.realmId ?? 0;
  }

  // ---------- inventory ----------
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
      const totalCost = sumCost(it.cost);

      const existing = byKind.get(kind) || {
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

  async function loadInventoryOnce() {
    if (STATE.inventory.loaded || STATE.inventory.loading) return;
    if (!STATE.auth.companyId) return;

    STATE.inventory.loading = true;
    STATE.inventory.status = "loading";
    STATE.inventory.error = null;

    try {
      const url = `https://www.simcompanies.com/api/v3/resources/${STATE.auth.companyId}/`;
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

  function getInventoryForKind(kind) {
    return STATE.inventory.byKind.get(kind) || null;
  }

  function formatCostPerUnit(totalCost, amount) {
    if (!isFinite(totalCost) || !isFinite(amount) || amount <= 0) return "—";
    return `$${(totalCost / amount).toFixed(2)}`;
  }

  function detectSourceLabel(inv) {
    if (!inv) return "—";
    const hasMarket = inv.marketCost > 0;
    const hasProd = inv.workers + inv.admin + inv.materials > 0;
    if (hasMarket && hasProd) return "Mixed";
    if (hasMarket) return "Market";
    if (hasProd) return "Produced";
    return "Unknown";
  }

  // ---------- market ----------
  function extractProductId(row) {
    const a = row?.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
    const href = a?.getAttribute("href") || "";
    const m = href.match(/\/resource\/(\d+)\//);
    return m ? Number(m[1]) : null;
  }

  function getCheapestListing(listings) {
    if (!Array.isArray(listings) || listings.length === 0) return null;
    const first = listings[0];
    if (!first || !Number.isFinite(first.price)) return null;
    return {
      price: first.price,
      quantity: Number.isFinite(first.quantity) ? first.quantity : null,
    };
  }

  async function fetchMarket(realmId, productId) {
    const now = Date.now();
    const cacheKey = `${realmId}:${productId}`;
    const cached = STATE.marketCache.get(cacheKey);
    if (cached && now - cached.ts < 30000) return cached.data;

    const url = `https://www.simcompanies.com/api/v3/market/${realmId}/${productId}/`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    STATE.marketCache.set(cacheKey, { ts: now, data });
    return data;
  }

  function setMarketStatus(status, realmId, productId, data = null, error = null) {
    STATE.marketState = { status, realmId, productId, data, error };
    scheduleUpdate();
  }

  function ensureMarketFetchForRow(row) {
    const productId = extractProductId(row);
    if (!productId) return;

    const realmId = getRealmId();

    if (
      STATE.marketState.productId === productId &&
      STATE.marketState.realmId === realmId &&
      (STATE.marketState.status === "ok" || STATE.marketState.status === "loading")
    ) {
      return;
    }

    setMarketStatus("loading", realmId, productId);

    fetchMarket(realmId, productId)
      .then((listings) => setMarketStatus("ok", realmId, productId, listings, null))
      .catch((err) => setMarketStatus("error", realmId, productId, null, String(err?.message || err)));
  }

  // ---------- metrics ----------
  function computeMetrics({ profitPerUnit, qty, seconds }) {
    const totalProfit = profitPerUnit * qty;
    const minutes = seconds / 60;
    const hours = seconds / 3600;

    const profitPerMin = isFinite(totalProfit) && minutes > 0 ? totalProfit / minutes : NaN;
    const profitPerHr = isFinite(totalProfit) && hours > 0 ? totalProfit / hours : NaN;

    return { totalProfit, profitPerMin, profitPerHr, seconds };
  }

  function classifyProfitPerMin(ppm) {
    if (!isFinite(ppm)) return { label: "N/A", cls: "scx-chip-na" };
    if (ppm < 0) return { label: "Bad", cls: "scx-chip-bad" };
    if (ppm >= 50) return { label: "Excellent", cls: "scx-chip-excellent" };
    if (ppm >= 20) return { label: "Good", cls: "scx-chip-good" };
    if (ppm >= 5) return { label: "Meh", cls: "scx-chip-meh" };
    return { label: "Low", cls: "scx-chip-meh" };
  }

  // ---------- UI ----------

  function toggleSidebar() {
    const el = document.getElementById(SIDEBAR_ID);
    if (!el) return;

    const minimized = el.classList.toggle("scx-minimized");

    const btn = el.querySelector('[data-k="toggle"]');
    if (btn) btn.textContent = minimized ? "◂" : "▸";
  }


  function ensureSidebar() {
    let el = document.getElementById(SIDEBAR_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = SIDEBAR_ID;
    el.className = "scx-sidebar";
    el.innerHTML = `
      <div class="scx-sidebar-header">
        <div class="scx-sidebar-title" data-k="title">Retail Helper</div>
        <button class="scx-toggle" data-k="toggle" title="Minimize">▸</button>
      </div>

      <div class="scx-selected">
        <div class="scx-selected-name">
          <span data-k="name">No item selected</span>
        </div>
        <div class="scx-muted" data-k="hint">
          Click a product’s Quantity or Price field to show profit rate here.
        </div>
      </div>

      <div class="scx-panel">
        <div class="scx-panel-head">
          <div class="scx-panel-title">Profit per minute</div>
          <div class="scx-chip scx-chip-na" data-k="chip">N/A</div>
        </div>

        <div class="scx-big" data-k="big">—</div>

        <div class="scx-grid">
          <div class="scx-k">Profit/hr</div><div class="scx-v" data-k="phr">—</div>
          <div class="scx-k">Net profit</div><div class="scx-v" data-k="profit">—</div>
          <div class="scx-k">Time</div><div class="scx-v" data-k="time">—</div>
          <div class="scx-k">Per unit</div><div class="scx-v" data-k="ppu">—</div>
        </div>

        <div class="scx-note" data-k="note"></div>

        <hr style="margin:10px 0; opacity:.25">

        <div class="scx-panel-head" style="margin-bottom:6px;">
          <div class="scx-panel-title">Your cost</div>
          <div class="scx-chip scx-chip-na" data-k="inv_status">Idle</div>
        </div>

        <div class="scx-grid">
          <div class="scx-k">Stock</div><div class="scx-v" data-k="inv_stock">—</div>
          <div class="scx-k">Avg cost/unit</div><div class="scx-v" data-k="inv_cpu">—</div>
          <div class="scx-k">Source</div><div class="scx-v" data-k="inv_src">—</div>
          <div class="scx-k">Cost basis</div><div class="scx-v" data-k="inv_basis">—</div>
        </div>

        <div class="scx-note" data-k="inv_note"></div>

        <hr style="margin:10px 0; opacity:.25">

        <div class="scx-panel-head" style="margin-bottom:6px;">
          <div class="scx-panel-title">Market</div>
          <div class="scx-chip scx-chip-na" data-k="m_status">Idle</div>
        </div>

        <div class="scx-grid">
          <div class="scx-k">Cheapest</div><div class="scx-v" data-k="m_best">—</div>
          <div class="scx-k">Qty</div><div class="scx-v" data-k="m_qty">—</div>
          <div class="scx-k">You vs cheap</div><div class="scx-v" data-k="m_vs">—</div>
        </div>

        <div class="scx-note" data-k="m_note"></div>
      </div>
    `;
    document.documentElement.appendChild(el);
    const toggleBtn = el.querySelector('[data-k="toggle"]');
    toggleBtn?.addEventListener("click", toggleSidebar);

    return el;
  }

  function getRowFromTarget(target) {
    if (!(target instanceof Element)) return null;

    // Current (dark theme) row wrapper
    const row = target.closest("div.css-1ruhbe");
    if (row && row.querySelector('input[name="price"]') && row.querySelector('input[name="quantity"]')) {
        return row;
    }

    // Old (light theme) wrapper fallback
    const old = target.closest("div.css-mv4qyq");
    if (old) return old;

    // Generic fallback: nearest ancestor containing both inputs
    let el = target;
    for (let i = 0; i < 15 && el; i++) {
        if (el.querySelector?.('input[name="price"]') && el.querySelector?.('input[name="quantity"]')) return el;
        el = el.parentElement;
    }

    return null;
}


  function getProductNameFromRow(row) {
    if (!row) return "Unknown";
    const h3s = row.querySelectorAll("h3");
    for (const h of h3s) {
      const t = (h.textContent || "").trim();
      if (!t) continue;
      if (t.toLowerCase() === "quantity") continue;
      if (t.toLowerCase() === "price") continue;
      return t;
    }
    return "Unknown";
  }

  function updatePanel() {
    const sidebar = ensureSidebar();
    const row = STATE.selectedRow;

    const nameEl = sidebar.querySelector('[data-k="name"]');
    const hintEl = sidebar.querySelector('[data-k="hint"]');

    const chipEl = sidebar.querySelector('[data-k="chip"]');
    const bigEl = sidebar.querySelector('[data-k="big"]');

    const phrEl = sidebar.querySelector('[data-k="phr"]');
    const profitEl = sidebar.querySelector('[data-k="profit"]');
    const timeEl = sidebar.querySelector('[data-k="time"]');
    const ppuEl = sidebar.querySelector('[data-k="ppu"]');
    const noteEl = sidebar.querySelector('[data-k="note"]');

    const invStatusEl = sidebar.querySelector('[data-k="inv_status"]');
    const invStockEl = sidebar.querySelector('[data-k="inv_stock"]');
    const invCpuEl = sidebar.querySelector('[data-k="inv_cpu"]');
    const invSrcEl = sidebar.querySelector('[data-k="inv_src"]');
    const invBasisEl = sidebar.querySelector('[data-k="inv_basis"]');
    const invNoteEl = sidebar.querySelector('[data-k="inv_note"]');

    const mStatusEl = sidebar.querySelector('[data-k="m_status"]');
    const mBestEl = sidebar.querySelector('[data-k="m_best"]');
    const mQtyEl = sidebar.querySelector('[data-k="m_qty"]');
    const mVsEl = sidebar.querySelector('[data-k="m_vs"]');
    const mNoteEl = sidebar.querySelector('[data-k="m_note"]');

    if (!row) {
      nameEl.textContent = "No item selected";
      hintEl.textContent = "Click a product’s Quantity or Price field to show profit rate here.";
      chipEl.textContent = "N/A";
      chipEl.className = "scx-chip scx-chip-na";
      bigEl.textContent = "—";
      phrEl.textContent = profitEl.textContent = timeEl.textContent = ppuEl.textContent = "—";
      noteEl.textContent = "";

      invStatusEl.textContent = STATE.inventory.status === "ok" ? "OK" : "Idle";
      invStatusEl.className = "scx-chip scx-chip-na";
      invStockEl.textContent = invCpuEl.textContent = invSrcEl.textContent = invBasisEl.textContent = "—";
      invNoteEl.textContent = "";

      mStatusEl.textContent = "Idle";
      mStatusEl.className = "scx-chip scx-chip-na";
      mBestEl.textContent = mQtyEl.textContent = mVsEl.textContent = "—";
      mNoteEl.textContent = "";
      return;
    }

    nameEl.textContent = getProductNameFromRow(row);
    hintEl.textContent = "Uses Profit per unit (already includes wages).";

    const qtyInput = row.querySelector('input[name="quantity"]');
    const qty = qtyInput ? parseNumber(qtyInput.value) : NaN;

    const priceInput = row.querySelector('input[name="price"]');
    const yourPrice = priceInput ? parseMoney(priceInput.value) : NaN;

    const profitPerUnit = extractProfitPerUnit(row);
    const seconds = extractFinishSeconds(row);
    const metrics = computeMetrics({ profitPerUnit, qty, seconds });

    bigEl.textContent = isFinite(metrics.profitPerMin) ? formatMoneyPerMin(metrics.profitPerMin) : "—";

    const cls = classifyProfitPerMin(metrics.profitPerMin);
    chipEl.textContent = cls.label;
    chipEl.className = `scx-chip ${cls.cls}`;

    phrEl.textContent = formatMoneyPerHr(metrics.profitPerHr);
    profitEl.textContent = formatMoney(metrics.totalProfit);
    timeEl.textContent = isFinite(metrics.seconds) ? `${Math.round(metrics.seconds)}s` : "—";
    ppuEl.textContent = isFinite(profitPerUnit) ? formatMoney(profitPerUnit) : "—";

    const warnings = [];
    if (!isFinite(qty) || qty <= 0) warnings.push("Enter a quantity.");
    if (!isFinite(profitPerUnit)) warnings.push("Waiting for “Profit per unit”.");
    if (!isFinite(seconds)) warnings.push("Waiting for “Finishes … (Xs)”.");
    noteEl.textContent = warnings.join(" ");

    // ---------- inventory render ----------
    const kind = extractProductId(row); // matches inventory kind/resource id

    if (STATE.inventory.status === "loading") {
      invStatusEl.textContent = "Loading";
      invStatusEl.className = "scx-chip scx-chip-meh";
      invStockEl.textContent = invCpuEl.textContent = invSrcEl.textContent = invBasisEl.textContent = "—";
      invNoteEl.textContent = "";
    } else if (STATE.inventory.status === "error") {
      invStatusEl.textContent = "Error";
      invStatusEl.className = "scx-chip scx-chip-bad";
      invStockEl.textContent = invCpuEl.textContent = invSrcEl.textContent = invBasisEl.textContent = "—";
      invNoteEl.textContent = STATE.inventory.error || "";
    } else if (STATE.inventory.status === "ok") {
      invStatusEl.textContent = "OK";
      invStatusEl.className = "scx-chip scx-chip-good";

      const inv = kind ? getInventoryForKind(kind) : null;

      if (!inv) {
        invStockEl.textContent = "0";
        invCpuEl.textContent = "—";
        invSrcEl.textContent = "—";
        invBasisEl.textContent = "—";
        invNoteEl.textContent = "";
      } else {
        invStockEl.textContent = String(Math.floor(inv.amount));
        invCpuEl.textContent = formatCostPerUnit(inv.totalCost, inv.amount);
        invSrcEl.textContent = detectSourceLabel(inv);
        invBasisEl.textContent = formatMoney(inv.totalCost);

        const mkt = inv.marketCost || 0;
        const prod = (inv.workers || 0) + (inv.admin || 0) + (inv.materials || 0);
        invNoteEl.textContent = `Mix: market ${formatMoney(mkt)} | produced ${formatMoney(prod)}`;
      }
    } else {
      invStatusEl.textContent = "Idle";
      invStatusEl.className = "scx-chip scx-chip-na";
      invStockEl.textContent = invCpuEl.textContent = invSrcEl.textContent = invBasisEl.textContent = "—";
      invNoteEl.textContent = "";
    }

    // ---------- market render (cheapest only) ----------
    const ms = STATE.marketState;

    if (!ms || ms.status === "idle") {
      mStatusEl.textContent = "Idle";
      mStatusEl.className = "scx-chip scx-chip-na";
      mBestEl.textContent = mQtyEl.textContent = mVsEl.textContent = "—";
      mNoteEl.textContent = "";
    } else if (ms.status === "loading") {
      mStatusEl.textContent = "Loading";
      mStatusEl.className = "scx-chip scx-chip-meh";
      mBestEl.textContent = mQtyEl.textContent = mVsEl.textContent = "—";
      mNoteEl.textContent = "";
    } else if (ms.status === "error") {
      mStatusEl.textContent = "Error";
      mStatusEl.className = "scx-chip scx-chip-bad";
      mBestEl.textContent = mQtyEl.textContent = mVsEl.textContent = "—";
      mNoteEl.textContent = ms.error || "Failed to load market.";
    } else if (ms.status === "ok") {
      const cheapest = getCheapestListing(ms.data);
      if (!cheapest) {
        mStatusEl.textContent = "Empty";
        mStatusEl.className = "scx-chip scx-chip-na";
        mBestEl.textContent = mQtyEl.textContent = mVsEl.textContent = "—";
        mNoteEl.textContent = "";
      } else {
        mStatusEl.textContent = "OK";
        mStatusEl.className = "scx-chip scx-chip-good";

        mBestEl.textContent = formatMoney(cheapest.price);
        mQtyEl.textContent = cheapest.quantity == null ? "—" : String(cheapest.quantity);

        if (isFinite(yourPrice)) {
          const diff = yourPrice - cheapest.price;
          const sign = diff > 0 ? "+" : "";
          mVsEl.textContent = `${sign}${diff.toFixed(2)}`;
        } else {
          mVsEl.textContent = "—";
        }

        mNoteEl.textContent = "";
      }
    }
  }

  function setSelectedRow(row) {
    if (!row) return;
    STATE.selectedRow = row;

    if (STATE.selectedRowObserver) {
      STATE.selectedRowObserver.disconnect();
      STATE.selectedRowObserver = null;
    }
    if (STATE.selectedInputs) {
      const { priceInput, qtyInput, onInput } = STATE.selectedInputs;
      priceInput?.removeEventListener("input", onInput);
      qtyInput?.removeEventListener("input", onInput);
      STATE.selectedInputs = null;
    }

    const priceInput = row.querySelector('input[name="price"]');
    const qtyInput = row.querySelector('input[name="quantity"]');

    const onInput = () => scheduleUpdate();
    priceInput?.addEventListener("input", onInput);
    qtyInput?.addEventListener("input", onInput);
    STATE.selectedInputs = { priceInput, qtyInput, onInput };

    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(row, { childList: true, subtree: true, characterData: true });
    STATE.selectedRowObserver = mo;

    ensureMarketFetchForRow(row);
    scheduleUpdate();
  }

  function isSellInput(target) {
    return target instanceof Element && target.matches('input[name="price"], input[name="quantity"]');
  }

  function onFocusOrClick(e) {
    console.log("Sim Company Extension: focus/click event", e);
    const t = e.target;
    console.log("Sim Company Extension: event target", t);
    if (!isSellInput(t)) return;
    const row = getRowFromTarget(t);
    console.log("Sim Company Extension: determined row", row);
    if (row) setSelectedRow(row);
  }

  // ---------- init ----------
  console.log("Sim Company Extension: initializing sidebar");
  ensureSidebar();

  (async () => {
    console.log("Sim Company Extension: loading auth and inventory data");
    await loadAuthDataOnce();
    await loadInventoryOnce();
    console.log("Sim Company Extension: data loaded");
    updatePanel();
    console.log("Sim Company Extension: panel updated");
  })();

  window.addEventListener("focusin", onFocusOrClick, true);
  window.addEventListener("click", onFocusOrClick, true);
})();
