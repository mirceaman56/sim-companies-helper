// market_ui.js
// Market price alert notifications sidebar
import { getSectionContent } from "./sidebar.js";
import { getRealmId } from "./auth.js";
import { fetchMarketPrice, fetchMarket, getRateLimitStatus } from "./market.js";
import { formatMoney, escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import recipes from "./resources/recipes.json";

const SECTION_ID = "market-alerts-section";
const CHECK_INTERVAL_MS = 60_000; // 1 minute

// State
let alerts = []; // { id, productId, productName, quality, targetPrice, active, intervalId, lastPrice, lastCheck, triggered }

let nextAlertId = 1;
let timerRefreshInterval = null;
let alertsContainer = null;

/**
 * Initialize the market alerts panel
 */
export function initMarketAlerts() {
  const content = getSectionContent(SECTION_ID);
  if (content && !content.querySelector(".scx-market-alerts")) {
    content.appendChild(createAlertsContent());
  }
}

/**
 * Update the market alerts panel (called when section is expanded)
 */
export function updateMarketAlertsPanel() {
  // Panel is event-driven, no periodic refresh needed
}

/**
 * Create the alerts UI
 */
function createAlertsContent() {
  const container = document.createElement("div");
  container.className = "scx-market-alerts";

  const sortedRecipes = [...recipes].sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML = `
    <div class="scx-market-alerts-form">
      <div class="scx-market-alerts-limit">
        <span class="scx-market-alerts-limit-text">${t("maAlertLimit")} (${alerts.length}/2)</span>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maProduct")}</label>
        <select id="scx-ma-product" class="scx-select" style="width: 100%;">
          ${sortedRecipes.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}
        </select>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maQuality")}</label>
        <select id="scx-ma-quality" class="scx-select" style="width: 100%;">
          <option value="all">${t("maAll")}</option>
          ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Q${i + 1}</option>`).join("")}
        </select>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maTargetPrice")}</label>
        <input id="scx-ma-price" type="number" step="0.01" min="0" placeholder="e.g. 5.00"
               class="scx-select" style="width: 100%; box-sizing: border-box;" />
      </div>
      <button id="scx-ma-add" class="scx-btn scx-btn-primary" style="width: 100%;" ${alerts.length >= 2 ? 'disabled' : ''}>
        ${t("maAddAlert")}
      </button>
    </div>
    <div id="scx-ma-list" class="scx-market-alerts-list"></div>
  `;

  // Wire up add button
  const addBtn = container.querySelector("#scx-ma-add");
  addBtn.addEventListener("click", () => addAlert(container));

  // Store container reference for timer updates
  alertsContainer = container;

  // Refresh timer display every 10 seconds
  if (timerRefreshInterval) {
    clearInterval(timerRefreshInterval);
  }
  timerRefreshInterval = setInterval(() => {
    if (alertsContainer) {
      renderAlertList(alertsContainer);
    }
  }, 10_000);

  return container;
}

/**
 * Add a new price alert
 */
function addAlert(container) {
  // Check limit
  if (alerts.length >= 2) {
    const priceInput = container.querySelector("#scx-ma-price");
    priceInput.style.borderColor = "var(--scx-color-error)";
    setTimeout(() => { priceInput.style.borderColor = ""; }, 2000);
    return;
  }

  const productSelect = container.querySelector("#scx-ma-product");
  const qualitySelect = container.querySelector("#scx-ma-quality");
  const priceInput = container.querySelector("#scx-ma-price");

  const productId = Number(productSelect.value);
  const productName = productSelect.options[productSelect.selectedIndex].text;
  const qualityValue = qualitySelect.value;
  const quality = qualityValue === "all" ? "all" : Number(qualityValue);
  const targetPrice = parseFloat(priceInput.value);

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    priceInput.style.borderColor = "var(--scx-color-error)";
    setTimeout(() => { priceInput.style.borderColor = ""; }, 2000);
    return;
  }

  const alert = {
    id: nextAlertId++,
    productId,
    productName,
    quality,
    targetPrice,
    active: false,
    intervalId: null,
    lastPrice: null,
    lastCheck: null,
    triggered: false,
  };

  alerts.push(alert);
  priceInput.value = "";
  renderAlertList(container);
}

/**
 * Start monitoring a specific alert
 */
function startAlert(container, alertId) {
  const alert = alerts.find(a => a.id === alertId);
  if (!alert || alert.active) return;

  alert.active = true;
  alert.triggered = false;

  // Immediate first check
  checkPrice(container, alert);

  // Schedule recurring checks
  alert.intervalId = setInterval(() => {
    checkPrice(container, alert);
  }, CHECK_INTERVAL_MS);

  renderAlertList(container);
}

/**
 * Stop monitoring a specific alert
 */
function stopAlert(container, alertId) {
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) return;

  alert.active = false;
  if (alert.intervalId) {
    clearInterval(alert.intervalId);
    alert.intervalId = null;
  }

  renderAlertList(container);
}

/**
 * Reset a triggered alert so it resumes monitoring and can fire again
 */
function resetAlert(container, alertId) {
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) return;

  alert.triggered = false;
  alert.lastPrice = null;
  alert.lastCheck = null;

  if (!alert.active) {
    startAlert(container, alertId);
  } else {
    checkPrice(container, alert);
    renderAlertList(container);
  }
}

/**
 * Remove an alert entirely
 */
function removeAlert(container, alertId) {
  const alert = alerts.find(a => a.id === alertId);
  if (alert?.intervalId) {
    clearInterval(alert.intervalId);
  }
  alerts = alerts.filter(a => a.id !== alertId);
  renderAlertList(container);
}

/**
 * Check current market price against alert target
 */
async function checkPrice(container, alert) {
  const { blocked, remainingMs } = getRateLimitStatus();
  if (blocked) {
    alert.lastCheck = Date.now();
    renderAlertList(container);
    return;
  }

  const realmId = getRealmId();
  try {
    let price = null;
    
    if (alert.quality === "all") {
      // Check all qualities for the product
      const data = await fetchMarket(realmId, alert.productId);
      if (Array.isArray(data) && data.length > 0) {
        // Find the cheapest price across all qualities
        const cheapest = data.reduce((min, item) => {
          if (!Number.isFinite(item.price)) return min;
          return !min || item.price < min.price ? item : min;
        }, null);
        price = cheapest ? cheapest.price : null;
      }
    } else {
      // Check specific quality
      price = await fetchMarketPrice(realmId, alert.productId, alert.quality);
    }

    alert.lastPrice = price;
    alert.lastCheck = Date.now();

    if (price !== null && price <= alert.targetPrice && !alert.triggered) {
      alert.triggered = true;
      showNotification(alert, price);
    } else if (price !== null && price > alert.targetPrice) {
      // Reset trigger if price went back above target
      alert.triggered = false;
    }
  } catch (e) {
    console.warn(`[SimHelper] Market alert check failed for ${alert.productName}:`, e);
  }

  renderAlertList(container);
}

/**
 * Play a short beep sound using the Web Audio API
 */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Two-tone alert: beep-beep
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);       // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.2); // C6
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Audio not available — silent fallback
  }
}

/**
 * Show an in-page toast notification
 */
function showNotification(alert, price) {
  playAlertSound();

  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById("scx-toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "scx-toast-container";
    document.documentElement.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = "scx-toast";
  toast.innerHTML = `
    <div class="scx-toast-icon">🔔</div>
    <div class="scx-toast-body">
      <div class="scx-toast-title">
        <a href="https://www.simcompanies.com/market/resource/${alert.productId}/"
           target="_blank" class="scx-toast-link">
          ${escapeHtml(alert.productName)} Q${alert.quality}
        </a>
      </div>
      <div class="scx-toast-message">
        ${t("maPrice")} ${formatMoney(price, { decimals: 3 })} ≤ ${formatMoney(alert.targetPrice, { decimals: 3 })}
      </div>
    </div>
    <button class="scx-toast-close">✕</button>
  `;

  // Auto-dismiss after 15 seconds
  const dismissTimer = setTimeout(() => dismissToast(toast), 15_000);

  toast.querySelector(".scx-toast-close").addEventListener("click", () => {
    clearTimeout(dismissTimer);
    dismissToast(toast);
  });

  toastContainer.appendChild(toast);
  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("scx-toast-visible"));
}

/**
 * Dismiss a toast with exit animation
 */
function dismissToast(toast) {
  toast.classList.remove("scx-toast-visible");
  toast.classList.add("scx-toast-exit");
  toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  // Fallback removal if transition doesn't fire
  setTimeout(() => toast.remove(), 500);
}

/**
 * Format time ago string
 */
function timeAgo(ts) {
  if (!ts) return t("never");
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}${t("sAgo")}`;
  if (diff < 3600) return `${Math.floor(diff / 60)}${t("mAgo")}`;
  return `${Math.floor(diff / 3600)}${t("hAgo")}`;
}

/**
 * Render the list of alerts
 */
function renderAlertList(container) {
  const listEl = container.querySelector("#scx-ma-list");
  const addBtn = container.querySelector("#scx-ma-add");
  const limitText = container.querySelector(".scx-market-alerts-limit-text");

  if (!listEl) return;

  // Update limit counter and button state
  if (limitText) {
    limitText.textContent = `${t("maAlertLimit")} (${alerts.length}/2)`;
  }
  if (addBtn) {
    addBtn.disabled = alerts.length >= 2;
  }

  if (alerts.length === 0) {
    listEl.innerHTML = `<div class="scx-market-alerts-empty">${t("maNoAlerts")}</div>`;
    return;
  }

  listEl.innerHTML = alerts.map(alert => {
    const priceColor = alert.lastPrice !== null && alert.lastPrice <= alert.targetPrice
      ? "var(--scx-color-success)"
      : "var(--scx-text-primary)";

    const statusClass = alert.active
      ? (alert.triggered ? "scx-ma-status-triggered" : "scx-ma-status-active")
      : "scx-ma-status-stopped";

    const statusText = alert.active
      ? (alert.triggered ? t("maTriggered") : t("maMonitoring"))
      : t("maStopped");

    const qualityDisplay = alert.quality === "all" ? t("maAll") : `Q${alert.quality}`;

    const { blocked, remainingMs } = getRateLimitStatus();
    const rateLimitWarning = blocked
      ? `<div class="scx-ma-rate-limit">${t("maRateLimited")} ${Math.ceil(remainingMs / 60000)}m</div>`
      : "";

    return `
      <div class="scx-ma-card" data-alert-id="${alert.id}">
        <div class="scx-ma-card-header">
          <div>
            <a href="https://www.simcompanies.com/market/resource/${alert.productId}/"
               target="_blank" class="scx-ma-product-link">
              ${escapeHtml(alert.productName)}
            </a>
            <span class="scx-ma-quality-badge">${qualityDisplay}</span>
          </div>
          <span class="${statusClass}">${statusText}</span>
        </div>

        <div class="scx-ma-card-body">
          <div class="scx-flex-row scx-font-9">
            <span class="scx-k">${t("maTargetPrice")}</span>
            <span class="scx-v">${formatMoney(alert.targetPrice, { decimals: 3 })}</span>
          </div>
          <div class="scx-flex-row scx-font-9 scx-margin-top-2">
            <span class="scx-k">${t("maCurrentPrice")}</span>
            <span class="scx-v" style="color: ${priceColor};">
              ${alert.lastPrice !== null ? formatMoney(alert.lastPrice, { decimals: 3 }) : "—"}
            </span>
          </div>
          <div class="scx-flex-row scx-font-9 scx-margin-top-2">
            <span class="scx-k">${t("maLastChecked")}</span>
            <span class="scx-color-999">${timeAgo(alert.lastCheck)}</span>
          </div>
          ${rateLimitWarning}
        </div>

        <div class="scx-ma-card-actions">
          ${alert.triggered
            ? `<button class="scx-btn scx-ma-btn-reset" data-action="reset">${t("maReset")}</button>`
            : alert.active
              ? `<button class="scx-btn scx-ma-btn-stop" data-action="stop">${t("stop")}</button>`
              : `<button class="scx-btn scx-ma-btn-start" data-action="start">${t("maStart")}</button>`
          }
          <button class="scx-btn scx-ma-btn-remove" data-action="remove">✕</button>
        </div>
      </div>
    `;
  }).join("");

  // Wire up action buttons
  listEl.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const card = e.target.closest(".scx-ma-card");
      const alertId = Number(card.dataset.alertId);
      const action = e.target.dataset.action;

      if (action === "start") startAlert(container, alertId);
      else if (action === "stop") stopAlert(container, alertId);
      else if (action === "reset") resetAlert(container, alertId);
      else if (action === "remove") removeAlert(container, alertId);
    });
  });
}
