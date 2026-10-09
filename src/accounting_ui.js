// Accounting-overhead chip inside the navbar cash bar: OK under the free threshold, the
// estimated daily fee above it. Click opens a breakdown popover.
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml, formatMoney } from "./utils.js";
import { findMoneyTextElement, readMoneyBalance, readMoneyNavbarContext } from "./page/money_page.js";
import { observeDocumentBody, observeMutations } from "./page/page_utils.js";
import { buildAccountingSummary, computeExecutiveLift, computeNetBonds } from "./accounting_calc.js";
import {
  createNavPopController,
  fitNavChip,
  renderNavChip,
  renderNavPopGauge,
  renderNavPopDesc,
  renderNavPopHead,
  renderNavPopLine,
  renderNavPopNote,
} from "./nav_chip.js";

const CONTAINER_ID = "scx-acct-widget";
const POPOVER_ID = "scx-acct-popover";
const CASH_OBSERVER_OPTIONS = { childList: true, subtree: true, characterData: true };

const popover = createNavPopController({ containerId: CONTAINER_ID });
let _dataLoaded = false;
let _lastRenderedCash = null;
let _observedMoneyAnchor = null;
let _disconnectCashObserver = null;

/**
 * Initialize the accounting widget. The body observer only injects/removes the
 * container and watches the cash label; data loading happens at startup and
 * rendering is driven by updateAccountingWidget() or a cash change.
 */
export function initAccountingWidget() {
  popover.listen();
  window.addEventListener("resize", fitChip);
  observeDocumentBody(syncWithNavbar);
  syncWithNavbar();
}

/**
 * Re-render after executives / buildings / bonds finished loading (successfully or not).
 */
export function updateAccountingWidget() {
  _dataLoaded = true;
  updateWidget();
}

function syncWithNavbar() {
  const navContext = readMoneyNavbarContext(document);
  if (!navContext) {
    removeIfPresent();
    return;
  }
  injectIfNeeded(navContext);
  watchCash(navContext.moneyAnchor);
}

// React updates the cash text in place (characterData), which the body
// observer does not see. Watch the cash link itself and re-render only when
// the parsed value changes, so widget renders never feed back into the observer.
function watchCash(moneyAnchor) {
  if (_observedMoneyAnchor === moneyAnchor) return;
  _disconnectCashObserver?.();
  _observedMoneyAnchor = moneyAnchor;
  _disconnectCashObserver = observeMutations(moneyAnchor, onCashMutation, CASH_OBSERVER_OPTIONS);
  onCashMutation();
}

function onCashMutation() {
  const cash = readMoneyBalance(document);
  if (Number.isFinite(cash) && cash !== _lastRenderedCash) {
    updateWidget();
  }
}

function injectIfNeeded(navContext) {
  // Already injected — the observer must not touch the DOM here to avoid loops.
  if (document.getElementById(CONTAINER_ID)) return;

  const { hostEl } = navContext;
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-navchip-widget";

  hostEl.classList.add("scx-navchip-host");
  hostEl.appendChild(container);

  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".scx-navchip");
    if (!chip || chip.disabled) return;
    e.preventDefault();
    popover.toggle();
  });

  _lastRenderedCash = null;
  updateWidget();
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
  _disconnectCashObserver?.();
  _disconnectCashObserver = null;
  _observedMoneyAnchor = null;
  _lastRenderedCash = null;
  popover.setOpen(false);
}

function fitChip() {
  const chip = document.querySelector(`#${CONTAINER_ID} .scx-navchip`);
  fitNavChip(chip, findMoneyTextElement(document));
}

function formatCompactMoney(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return formatMoney(value, { decimals: 0 });
}

// Chip text drops the "$" to stay narrow inside the cash bar.
function formatChipAmount(value) {
  return formatCompactMoney(value).replace("$", "");
}

function formatWholeMoney(value) {
  return formatMoney(value, { decimals: 0 });
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function renderPopover(summary, { effectiveSkill, bankLevel }) {
  const over = summary.isOverThreshold;
  const tone = over ? "warn" : "ok";
  const exposure = summary.cash + summary.netBonds;

  const notes = [];
  if (STATE.bonds.error) notes.push(t("acctBondsUnavailable"));
  if (STATE.executives.error || !STATE.executives.loaded) notes.push(t("acctExecutivesUnavailable"));

  return `
    <div id="${POPOVER_ID}" class="scx-navpop ${popover.isOpen() ? "" : "scx-hidden"}" role="dialog" aria-label="${escapeHtml(t("acctTitle"))}">
      ${renderNavPopHead({
        title: t("acctTitle"),
        badge: over ? t("acctFeesApply") : t("acctNoFees"),
        badgeTone: tone,
      })}
      ${renderNavPopDesc(t("acctExplainer"))}
      ${renderNavPopGauge({
        label: t("acctExposure"),
        valueText: `${formatCompactMoney(exposure)} / ${formatCompactMoney(summary.freeThreshold)}`,
        value: exposure,
        max: summary.freeThreshold,
        tone,
      })}
      <div class="scx-navpop-lines">
        ${renderNavPopLine({ label: t("acctCash"), value: formatWholeMoney(summary.cash) })}
        ${renderNavPopLine({ sign: "+", label: t("acctNetBonds"), value: formatWholeMoney(summary.netBonds) })}
        ${renderNavPopLine({
          sign: "−",
          label: t("acctExecutiveLift"),
          value: formatWholeMoney(summary.lift),
          sub: `${t("acctCfoSkill")} ${effectiveSkill} · ${t("acctBankLevel")} ${bankLevel}`,
        })}
        ${renderNavPopLine({ sign: "=", label: t("acctBase"), value: formatWholeMoney(summary.base), tone: "total" })}
      </div>
      <div class="scx-navpop-lines">
        ${renderNavPopLine({ label: t("acctFeesStartAt"), value: formatWholeMoney(summary.freeThreshold) })}
        ${
          over
            ? renderNavPopLine({
                label: t("acctOverBy"),
                value: formatWholeMoney(-summary.headroom),
                tone: "warn",
              })
            : renderNavPopLine({
                label: t("acctHeadroom"),
                value: formatWholeMoney(summary.headroom),
                tone: "ok",
              })
        }
        ${renderNavPopLine({ label: t("acctMarginalRate"), value: formatPercent(summary.marginalRate) })}
        ${renderNavPopLine({ label: t("acctDailyFee"), value: formatWholeMoney(summary.fee), tone: over ? "warn" : "" })}
      </div>
      ${notes.map(renderNavPopNote).join("")}
    </div>
  `;
}

function updateWidget() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const cash = readMoneyBalance(document);
  if (!Number.isFinite(cash) || !_dataLoaded) {
    _lastRenderedCash = null;
    container.innerHTML = renderNavChip({
      icon: "…",
      title: t("acctLoading"),
      tone: "loading",
      popoverId: POPOVER_ID,
      expanded: false,
      disabled: true,
    });
    return;
  }

  const liftInfo = computeExecutiveLift(STATE.executives.items, STATE.buildings.items);
  const netBonds = computeNetBonds(STATE.bonds.owned, STATE.bonds.sold);
  const summary = buildAccountingSummary({ cash, netBonds, lift: liftInfo.lift });
  _lastRenderedCash = cash;

  const over = summary.isOverThreshold;
  const chip = renderNavChip({
    icon: over ? "⚠" : "✓",
    amount: over
      ? `${formatChipAmount(summary.fee)}${t("acctPerDaySuffix")}`
      : formatChipAmount(summary.headroom),
    title: `${over ? t("acctOverTitle") : t("acctUnderTitle")} (${formatCompactMoney(over ? summary.fee : summary.headroom)})`,
    tone: over ? "warn" : "ok",
    popoverId: POPOVER_ID,
    expanded: popover.isOpen(),
  });

  container.innerHTML = `${chip}${renderPopover(summary, liftInfo)}`;
  fitChip();
  popover.sync();
}

export const _testUtils = {
  CONTAINER_ID,
  updateWidget,
  syncWithNavbar,
  formatCompactMoney,
  fitChip,
  popover,
  setDataLoadedForTest(val) {
    _dataLoaded = Boolean(val);
  },
  reset() {
    removeIfPresent();
    _dataLoaded = false;
  },
};
