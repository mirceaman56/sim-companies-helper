// chat_alerts_render.js
// Rendering and presenter helpers for chat alerts.
import { COPY_BUTTON_SVG, escapeHtml } from "./utils.js";
import { buildCompanyUrl, formatChatMessageBody } from "./chat_filter_presenter.js";
import { timeAgo } from "./market_alerts_render.js";

const KEYWORDS_INPUT_ID = "scx-ca-keywords";
const COMPANY_INPUT_ID = "scx-ca-company";
const ADD_BUTTON_ID = "scx-ca-add";
const LIMIT_TEXT_SELECTOR = ".scx-chat-alerts-limit-text";
const LIST_ID = "scx-ca-list";
const SALES_CHATROOM_URL = "https://www.simcompanies.com/messages/chatroom_Sales";

function escapeRegex(raw) {
  return String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compact age for chat alerts, showing minute+second granularity while under one hour.
 * Example: 1m10s
 * @param {number|null} ts
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function timeAgoDetailed(ts, t) {
  if (!ts) return t("never");

  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}${t("sAgo")}`;

  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    if (seconds === 0) {
      return `${minutes}${t("mAgo")}`;
    }
    return `${minutes}${t("timeMinuteShort")}${seconds}${t("timeSecondShort")}`;
  }

  return timeAgo(ts, t);
}

/**
 * @param {string} bodyHtml
 * @param {string[]} keywords
 * @returns {string}
 */
export function highlightKeywords(bodyHtml, keywords) {
  let html = String(bodyHtml || "");

  const deduped = [...new Set((keywords || []).map((keyword) => keyword.trim()).filter(Boolean))];
  deduped.sort((a, b) => b.length - a.length);

  for (const keyword of deduped) {
    const regex = new RegExp(`(${escapeRegex(escapeHtml(keyword))}\\w*)`, "gi");
    html = html.replace(regex, '<span class="scx-ca-highlight">$1</span>');
  }

  return html;
}

/**
 * @param {string} text
 * @param {string|null} filter
 * @returns {string}
 */
export function highlightCompany(text, filter) {
  const safeText = escapeHtml(text || "");
  const trimmed = String(filter || "").trim();
  if (!trimmed) return safeText;

  const regex = new RegExp(`(${escapeRegex(escapeHtml(trimmed))})`, "gi");
  return safeText.replace(regex, '<span class="scx-ca-highlight">$1</span>');
}

/**
 * @param {HTMLElement|null} container
 * @returns {{keywords: string, companyFilter: string}}
 */
export function readChatAlertFormInput(container) {
  const keywordsInput = container?.querySelector?.(`#${KEYWORDS_INPUT_ID}`);
  const companyInput = container?.querySelector?.(`#${COMPANY_INPUT_ID}`);

  return {
    keywords: String(keywordsInput?.value || "").trim(),
    companyFilter: String(companyInput?.value || "").trim(),
  };
}

/**
 * @param {HTMLElement|null} container
 */
export function clearChatAlertForm(container) {
  const keywordsInput = container?.querySelector?.(`#${KEYWORDS_INPUT_ID}`);
  const companyInput = container?.querySelector?.(`#${COMPANY_INPUT_ID}`);
  if (keywordsInput) keywordsInput.value = "";
  if (companyInput) companyInput.value = "";
}

/**
 * @param {{alertsCount:number, maxCount:number, t:(k:string)=>string, onAdd:()=>void}} input
 * @returns {HTMLDivElement}
 */
export function createChatAlertsContent(input) {
  const { alertsCount, maxCount, t, onAdd } = input;

  const container = document.createElement("div");
  container.className = "scx-chat-alerts";

  container.innerHTML = `
    <div class="scx-chat-alerts-form scx-panel">
      <div class="scx-flex-spaced">
        <div class="scx-text-muted scx-font-9">${t("caMonitoringWindow")}</div>
        <button class="scx-copy-btn" data-copy-action="chat-alerts" data-tooltip="${t("copyText")}" type="button">
          ${COPY_BUTTON_SVG}
        </button>
      </div>

      <div class="scx-chat-alerts-limit">
        <span class="scx-chat-alerts-limit-text">${t("caAlertLimit")} (${alertsCount}/${maxCount})</span>
      </div>

      <div class="scx-chat-alerts-row">
        <label class="scx-label" for="${KEYWORDS_INPUT_ID}">${t("caKeywords")}</label>
        <input id="${KEYWORDS_INPUT_ID}" class="scx-select scx-width-full" type="text" placeholder="${t("caKeywordsPlaceholder")}" />
      </div>

      <div class="scx-chat-alerts-row">
        <label class="scx-label" for="${COMPANY_INPUT_ID}">${t("caCompany")}</label>
        <input id="${COMPANY_INPUT_ID}" class="scx-select scx-width-full" type="text" placeholder="${t("caCompanyPlaceholder")}" />
      </div>

      <button id="${ADD_BUTTON_ID}" class="scx-btn scx-btn-primary scx-width-full" ${alertsCount >= maxCount ? "disabled" : ""}>
        ${t("caAddAlert")}
      </button>
    </div>

    <div id="${LIST_ID}" class="scx-chat-alerts-list"></div>
  `;

  const addBtn = container.querySelector(`#${ADD_BUTTON_ID}`);
  addBtn?.addEventListener("click", onAdd);

  return container;
}

/**
 * @param {{
 *  container: HTMLElement,
 *  alerts: object[],
 *  maxCount: number,
 *  t: (key: string) => string,
 *  onAction: (action: string, alertId: number) => void,
 *  realmId: number,
 * }} input
 */
export function renderChatAlertList(input) {
  const { container, alerts, maxCount, t, onAction, realmId } = input;

  const listEl = container.querySelector(`#${LIST_ID}`);
  const addBtn = container.querySelector(`#${ADD_BUTTON_ID}`);
  const limitText = container.querySelector(LIMIT_TEXT_SELECTOR);

  if (!listEl) return;

  if (limitText) {
    limitText.textContent = `${t("caAlertLimit")} (${alerts.length}/${maxCount})`;
  }

  if (addBtn) {
    addBtn.disabled = alerts.length >= maxCount;
  }

  if (alerts.length === 0) {
    listEl.innerHTML = `<div class="scx-chat-alerts-empty">${t("caNoAlerts")}</div>`;
    return;
  }

  listEl.innerHTML = alerts
    .map((alert) => {
      const statusClass = alert.active
        ? alert.triggered
          ? "scx-ca-status-triggered"
          : "scx-ca-status-active"
        : "scx-ca-status-stopped";

      const statusText = alert.active
        ? alert.triggered
          ? t("caTriggered")
          : t("caMonitoring")
        : t("caStopped");

      const keywords = (alert.keywords || []).map((keyword) => escapeHtml(keyword)).join(", ");
      const companyDisplay = alert.companyFilter
        ? highlightCompany(alert.lastMatchCompany || alert.companyFilter, alert.companyFilter)
        : "";
      const messageBodyHtml = alert.lastMatchBody
        ? highlightKeywords(formatChatMessageBody(alert.lastMatchBody), alert.keywords || [])
        : `<span class="scx-text-muted">${t("caNoMatchYet")}</span>`;
      const messagePreviewHtml = alert.lastMatchBody
        ? `<a href="${SALES_CHATROOM_URL}" target="_blank" rel="noreferrer noopener" class="scx-ca-message-link"><div class="scx-chat-message-body">${messageBodyHtml}</div></a>`
        : `<div class="scx-chat-message-body">${messageBodyHtml}</div>`;
      const lastMatchMs = alert.lastMatchAt ? new Date(alert.lastMatchAt).getTime() : null;

      const companyUrl = buildCompanyUrl(alert.lastMatchCompany || alert.companyFilter || "", realmId);
      const hasCompanyLink = Boolean(alert.lastMatchCompany || alert.companyFilter);

      return `
      <div class="scx-ca-card" data-alert-id="${alert.id}">
        <div class="scx-ca-card-header">
          <div class="scx-ca-rule-block">
            <div class="scx-ca-keywords">${keywords}</div>
            ${alert.companyFilter ? `<div class="scx-ca-company">${t("caMatchIn")}: ${highlightCompany(alert.companyFilter, alert.companyFilter)}</div>` : ""}
          </div>
          <span class="${statusClass}">${statusText}</span>
        </div>

        <div class="scx-ca-card-body">
          <div class="scx-flex-row scx-font-9">
            <span class="scx-k">${t("caLastChecked")}</span>
            <span class="scx-color-999">${timeAgoDetailed(alert.lastCheck, t)}</span>
          </div>
          <div class="scx-flex-row scx-font-9 scx-margin-top-2">
            <span class="scx-k">${t("caLastMatch")}</span>
            <span class="scx-color-999">${Number.isFinite(lastMatchMs) ? timeAgoDetailed(lastMatchMs, t) : t("never")}</span>
          </div>

          ${
            hasCompanyLink
              ? `<div class="scx-margin-top-4"><a href="${companyUrl}" target="_blank" class="scx-chat-message-company">${companyDisplay}</a></div>`
              : ""
          }
          <div class="scx-chat-message scx-ca-message-preview scx-margin-top-4">
            ${messagePreviewHtml}
          </div>
        </div>

        <div class="scx-ca-card-actions">
          ${
            alert.triggered
              ? `<button class="scx-btn scx-btn-warning scx-ca-btn-reset" data-action="reset">${t("caReset")}</button>`
              : alert.active
                ? `<button class="scx-btn scx-btn-error scx-ca-btn-stop" data-action="stop">${t("stop")}</button>`
                : `<button class="scx-btn scx-btn-success scx-ca-btn-start" data-action="start">${t("caStart")}</button>`
          }
          <button class="scx-btn scx-ca-btn-remove" data-action="remove">✕</button>
        </div>
      </div>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const card = event.target.closest(".scx-ca-card");
      const alertId = Number(card?.dataset?.alertId);
      const action = event.target.dataset.action;
      onAction(action, alertId);
    });
  });
}

/**
 * @param {object[]} alerts
 * @param {(key:string) => string} t
 * @returns {string}
 */
export function formatChatAlertsAsText(alerts, t) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return `${t("chatAlerts")}\n${t("caNoAlerts")}`;
  }

  const lines = [`${t("chatAlerts")} (${alerts.length})`, t("caMonitoringWindow"), ""];

  alerts.forEach((alert, index) => {
    const status = alert.active ? (alert.triggered ? t("caTriggered") : t("caMonitoring")) : t("caStopped");
    lines.push(`#${index + 1} ${status}`);
    lines.push(`- ${t("caKeywords")}: ${(alert.keywords || []).join(", ")}`);
    if (alert.companyFilter) {
      lines.push(`- ${t("caCompany")}: ${alert.companyFilter}`);
    }
    lines.push(`- ${t("caLastChecked")}: ${timeAgoDetailed(alert.lastCheck, t)}`);

    if (alert.lastMatchBody) {
      lines.push(`- ${t("caLastMatch")}: ${alert.lastMatchCompany || "-"}`);
      lines.push(`  ${alert.lastMatchBody}`);
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * @param {{
 *  alert: object,
 *  t: (key: string) => string,
 *  toastDismissMs: number,
 *  documentRef?: Document,
 *  requestAnimationFrameFn?: typeof requestAnimationFrame,
 *  setTimeoutFn?: typeof setTimeout,
 *  clearTimeoutFn?: typeof clearTimeout,
 * }} input
 */
export function showChatAlertNotification(input) {
  const {
    alert,
    t,
    toastDismissMs,
    documentRef = document,
    requestAnimationFrameFn = requestAnimationFrame,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = input;

  let toastContainer = documentRef.getElementById("scx-toast-container");
  if (!toastContainer) {
    toastContainer = documentRef.createElement("div");
    toastContainer.id = "scx-toast-container";
    documentRef.documentElement.appendChild(toastContainer);
  }

  const keywords = (alert?.keywords || []).join(", ");
  const company = alert?.lastMatchCompany || alert?.companyFilter || "-";
  const body = alert?.lastMatchBody || "";

  const toast = documentRef.createElement("div");
  toast.className = "scx-toast";
  toast.innerHTML = `
    <div class="scx-toast-icon">💬</div>
    <div class="scx-toast-body">
      <div class="scx-toast-title">${escapeHtml(t("chatAlerts"))}</div>
      <div class="scx-toast-message">${escapeHtml(company)} · ${escapeHtml(keywords)}</div>
      <div class="scx-toast-message">
        <a href="${SALES_CHATROOM_URL}" target="_blank" rel="noreferrer noopener" class="scx-toast-link scx-ca-toast-link">${escapeHtml(body).slice(0, 140)}</a>
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

  toast.querySelector(".scx-toast-close")?.addEventListener("click", () => {
    clearTimeoutFn(dismissTimer);
    dismiss();
  });

  toastContainer.appendChild(toast);
  requestAnimationFrameFn(() => toast.classList.add("scx-toast-visible"));
}

export const _testUtils = {
  KEYWORDS_INPUT_ID,
  COMPANY_INPUT_ID,
  ADD_BUTTON_ID,
  LIST_ID,
  SALES_CHATROOM_URL,
  timeAgoDetailed,
};
