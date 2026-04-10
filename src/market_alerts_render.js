// market_alerts_render.js
// Rendering and notification helpers for market alerts.

/**
 * @param {HTMLInputElement} input
 * @param {{setTimeoutFn?: typeof setTimeout, durationMs?: number}} [options]
 */
export function flashInputError(input, options = {}) {
  const { setTimeoutFn = setTimeout, durationMs = 2000 } = options;
  input.classList.add("scx-input-error");
  setTimeoutFn(() => {
    input.classList.remove("scx-input-error");
  }, durationMs);
}

/**
 * @param {() => void} renderFn
 * @param {typeof requestAnimationFrame} requestAnimationFrameFn
 * @returns {() => void}
 */
export function createRenderScheduler(renderFn, requestAnimationFrameFn = requestAnimationFrame) {
  let scheduled = false;

  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrameFn(() => {
      scheduled = false;
      renderFn();
    });
  };
}

/**
 * @param {{recipes: object[], alertsCount: number, maxCount: number, t: (key: string) => string, escapeHtml: (v: string) => string, onAdd: () => void}} input
 * @returns {HTMLDivElement}
 */
export function createAlertsContent(input) {
  const { recipes, alertsCount, maxCount, t, escapeHtml, onAdd } = input;

  const container = document.createElement("div");
  container.className = "scx-market-alerts";

  const sortedRecipes = [...recipes].sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML = `
    <div class="scx-market-alerts-form">
      <div class="scx-market-alerts-limit">
        <span class="scx-market-alerts-limit-text">${t("maAlertLimit")} (${alertsCount}/${maxCount})</span>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maProduct")}</label>
        <select id="scx-ma-product" class="scx-select scx-width-full">
          ${sortedRecipes.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}
        </select>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maQuality")}</label>
        <select id="scx-ma-quality" class="scx-select scx-width-full">
          <option value="all">${t("maAll")}</option>
          ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Q${i + 1}</option>`).join("")}
        </select>
      </div>
      <div class="scx-market-alerts-row">
        <label class="scx-label">${t("maTargetPrice")}</label>
        <input id="scx-ma-price" type="number" step="0.01" min="0" placeholder="${t("maTargetPricePlaceholder")}"
               class="scx-select scx-width-full" />
      </div>
      <button id="scx-ma-add" class="scx-btn scx-btn-primary scx-width-full" ${alertsCount >= maxCount ? "disabled" : ""}>
        ${t("maAddAlert")}
      </button>
    </div>
    <div id="scx-ma-list" class="scx-market-alerts-list"></div>
  `;

  const addBtn = container.querySelector("#scx-ma-add");
  addBtn.addEventListener("click", onAdd);

  return container;
}

/**
 * @param {number|null} ts
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function timeAgo(ts, t) {
  if (!ts) return t("never");
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}${t("sAgo")}`;
  if (diff < 3600) return `${Math.floor(diff / 60)}${t("mAgo")}`;
  return `${Math.floor(diff / 3600)}${t("hAgo")}`;
}

/**
 * @param {{
 *  container: HTMLElement,
 *  alerts: object[],
 *  maxCount: number,
 *  t: (key: string) => string,
 *  formatMoney: (v: number, opts?: object) => string,
 *  escapeHtml: (v: string) => string,
 *  getRateLimitStatus: () => {blocked: boolean, remainingMs: number},
 *  onAction: (action: string, alertId: number) => void,
 * }} input
 */
export function renderAlertList(input) {
  const { container, alerts, maxCount, t, formatMoney, escapeHtml, getRateLimitStatus, onAction } = input;

  const listEl = container.querySelector("#scx-ma-list");
  const addBtn = container.querySelector("#scx-ma-add");
  const limitText = container.querySelector(".scx-market-alerts-limit-text");

  if (!listEl) return;

  if (limitText) {
    limitText.textContent = `${t("maAlertLimit")} (${alerts.length}/${maxCount})`;
  }

  if (addBtn) {
    addBtn.disabled = alerts.length >= maxCount;
  }

  if (alerts.length === 0) {
    listEl.innerHTML = `<div class="scx-market-alerts-empty">${t("maNoAlerts")}</div>`;
    return;
  }

  listEl.innerHTML = alerts
    .map((alert) => {
      const priceClass =
        alert.lastPrice !== null && alert.lastPrice <= alert.targetPrice
          ? "scx-ma-price-hit"
          : "scx-ma-price-normal";

      const statusClass = alert.active
        ? alert.triggered
          ? "scx-ma-status-triggered"
          : "scx-ma-status-active"
        : "scx-ma-status-stopped";

      const statusText = alert.active
        ? alert.triggered
          ? t("maTriggered")
          : t("maMonitoring")
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
            <span class="scx-v ${priceClass}">
              ${alert.lastPrice !== null ? formatMoney(alert.lastPrice, { decimals: 3 }) : "—"}
            </span>
          </div>
          <div class="scx-flex-row scx-font-9 scx-margin-top-2">
            <span class="scx-k">${t("maLastChecked")}</span>
            <span class="scx-color-999">${timeAgo(alert.lastCheck, t)}</span>
          </div>
          ${rateLimitWarning}
        </div>

        <div class="scx-ma-card-actions">
          ${
            alert.triggered
              ? `<button class="scx-btn scx-ma-btn-reset" data-action="reset">${t("maReset")}</button>`
              : alert.active
                ? `<button class="scx-btn scx-ma-btn-stop" data-action="stop">${t("stop")}</button>`
                : `<button class="scx-btn scx-ma-btn-start" data-action="start">${t("maStart")}</button>`
          }
          <button class="scx-btn scx-ma-btn-remove" data-action="remove">✕</button>
        </div>
      </div>
    `;
    })
    .join("");

  listEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.target.closest(".scx-ma-card");
      const alertId = Number(card.dataset.alertId);
      const action = e.target.dataset.action;
      onAction(action, alertId);
    });
  });
}

function playAlertSound(windowRef) {
  try {
    const ctx = new (windowRef.AudioContext || windowRef.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Silent fallback.
  }
}

/**
 * @param {{
 *  alert: object,
 *  price: number,
 *  t: (key: string) => string,
 *  formatMoney: (v: number, opts?: object) => string,
 *  escapeHtml: (v: string) => string,
 *  toastDismissMs: number,
 *  documentRef?: Document,
 *  windowRef?: Window,
 *  requestAnimationFrameFn?: typeof requestAnimationFrame,
 *  setTimeoutFn?: typeof setTimeout,
 *  clearTimeoutFn?: typeof clearTimeout,
 * }} input
 */
export function showNotification(input) {
  const {
    alert,
    price,
    t,
    formatMoney,
    escapeHtml,
    toastDismissMs,
    documentRef = document,
    windowRef = window,
    requestAnimationFrameFn = requestAnimationFrame,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = input;

  playAlertSound(windowRef);

  let toastContainer = documentRef.getElementById("scx-toast-container");
  if (!toastContainer) {
    toastContainer = documentRef.createElement("div");
    toastContainer.id = "scx-toast-container";
    documentRef.documentElement.appendChild(toastContainer);
  }

  const toast = documentRef.createElement("div");
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

  const dismiss = () => {
    toast.classList.remove("scx-toast-visible");
    toast.classList.add("scx-toast-exit");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    setTimeoutFn(() => toast.remove(), 500);
  };

  const dismissTimer = setTimeoutFn(() => dismiss(), toastDismissMs);

  toast.querySelector(".scx-toast-close").addEventListener("click", () => {
    clearTimeoutFn(dismissTimer);
    dismiss();
  });

  toastContainer.appendChild(toast);
  requestAnimationFrameFn(() => toast.classList.add("scx-toast-visible"));
}
