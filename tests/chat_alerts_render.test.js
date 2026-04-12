// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/resources/recipes.json", () => ({
  default: [{ id: 7, name: "Apples" }],
}));

import {
  clearChatAlertForm,
  createChatAlertsContent,
  formatChatAlertsAsText,
  highlightCompany,
  highlightKeywords,
  readChatAlertFormInput,
  renderChatAlertList,
  timeAgoDetailed,
} from "../src/chat_alerts_render.js";

describe("chat_alerts_render", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads and clears form input", () => {
    const container = createChatAlertsContent({ alertsCount: 0, maxCount: 2, t: (k) => k, onAdd: vi.fn() });
    document.body.appendChild(container);

    container.querySelector("#scx-ca-keywords").value = "sell, buying";
    container.querySelector("#scx-ca-company").value = "Acme";

    expect(readChatAlertFormInput(container)).toEqual({
      keywords: "sell, buying",
      companyFilter: "Acme",
    });

    clearChatAlertForm(container);
    expect(container.querySelector("#scx-ca-keywords").value).toBe("");
    expect(container.querySelector("#scx-ca-company").value).toBe("");
  });

  it("highlights keywords and company safely", () => {
    const body = highlightKeywords("Selling [Apples] &amp; more", ["sell"]);
    expect(body).toContain("scx-ca-highlight");

    const company = highlightCompany("Acme Traders", "acme");
    expect(company).toContain("scx-ca-highlight");
  });

  it("renders list and action handlers", () => {
    const onAction = vi.fn();
    const container = createChatAlertsContent({ alertsCount: 1, maxCount: 2, t: (k) => k, onAdd: vi.fn() });
    document.body.appendChild(container);

    renderChatAlertList({
      container,
      alerts: [
        {
          id: 1,
          keywords: ["sell"],
          companyFilter: "Acme",
          active: false,
          triggered: false,
          lastCheck: Date.now(),
          lastMatchMessageId: 500,
          lastMatchAt: "2026-04-12T10:00:00Z",
          lastMatchCompany: "Acme",
          lastMatchBody: "Selling :re-7:",
        },
      ],
      maxCount: 2,
      t: (k) => k,
      onAction,
      realmId: 1,
    });

    const startBtn = container.querySelector('[data-action="start"]');
    expect(startBtn).not.toBeNull();
    startBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith("start", 1);
  });

  it("formats copy text", () => {
    const text = formatChatAlertsAsText(
      [
        {
          id: 1,
          keywords: ["sell"],
          companyFilter: null,
          active: true,
          triggered: false,
          lastCheck: Date.now(),
          lastMatchBody: "Selling",
          lastMatchCompany: "Acme",
        },
      ],
      (k) => k,
    );

    expect(text).toContain("chatAlerts");
    expect(text).toContain("sell");
  });

  it("formats minute and second age while under one hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T12:00:00Z"));

    const t = (key) =>
      ({
        never: "never",
        sAgo: "s ago",
        mAgo: "m ago",
        hAgo: "h ago",
        timeMinuteShort: "m",
        timeSecondShort: "s",
      })[key] || key;

    expect(timeAgoDetailed(Date.now() - 70_000, t)).toBe("1m10s");
    expect(timeAgoDetailed(Date.now() - 120_000, t)).toBe("2m ago");

    vi.useRealTimers();
  });
});
