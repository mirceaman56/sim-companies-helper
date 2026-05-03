// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/resources/recipes.json", () => ({
  default: [{ id: 7, name: "Apples" }],
}));

import {
  clearChatFilterAlertForm,
  createChatFilterAlertsContent,
  formatChatFilterAlertsAsText,
  readChatFilterAlertFormInput,
  renderChatFilterAlertList,
  showChatFilterAlertNotification,
  updateChatFilterAlertRoomDisplay,
} from "../src/chat_filter_alerts_render.js";

describe("chat_filter_alerts_render", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads, clears, and updates the inherited room display", () => {
    const container = createChatFilterAlertsContent({
      alertsCount: 0,
      maxCount: 2,
      currentRoomName: "Sales",
      t: (key) => key,
      onAdd: vi.fn(),
    });
    document.body.appendChild(container);

    container.querySelector("#scx-ca-keywords").value = "sell, buying";
    container.querySelector("#scx-ca-company").value = "Acme";

    expect(readChatFilterAlertFormInput(container)).toEqual({
      keywords: "sell, buying",
      companyFilter: "Acme",
    });

    updateChatFilterAlertRoomDisplay(container, "German Trade");
    expect(container.textContent).toContain("German Trade");

    clearChatFilterAlertForm(container);
    expect(container.querySelector("#scx-ca-keywords").value).toBe("");
    expect(container.querySelector("#scx-ca-company").value).toBe("");
  });

  it("renders room-aware free-text alert cards", () => {
    const onAction = vi.fn();
    const container = createChatFilterAlertsContent({
      alertsCount: 1,
      maxCount: 2,
      currentRoomName: "German Trade",
      t: (key) => key,
      onAdd: vi.fn(),
    });
    document.body.appendChild(container);

    renderChatFilterAlertList({
      container,
      alerts: [
        {
          id: 1,
          roomDbLetter: "DE",
          roomName: "German Trade",
          keywords: ["verkauf"],
          companyFilter: "Acme",
          active: false,
          triggered: false,
          lastCheck: Date.now(),
          lastMatchMessageId: 500,
          lastMatchAt: "2026-04-12T10:00:00Z",
          lastMatchCompany: "Acme",
          lastMatchBody: "Verkaufe :re-7: Q2",
        },
      ],
      maxCount: 2,
      t: (key) => key,
      onAction,
      realmId: 1,
    });

    const messageLink = container.querySelector(".scx-ca-message-link");
    expect(messageLink?.getAttribute("href")).toBe(
      "https://www.simcompanies.com/messages/chatroom_German%20Trade",
    );
    container
      .querySelector('[data-action="remove"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith("remove", 1);
  });

  it("formats alert copy text and toast link", () => {
    const text = formatChatFilterAlertsAsText(
      [
        {
          roomName: "Sales",
          keywords: ["sell"],
          companyFilter: null,
          active: true,
          triggered: false,
          lastCheck: Date.now(),
          lastMatchBody: "Selling",
          lastMatchCompany: "Acme",
        },
      ],
      (key) => key,
    );

    expect(text).toContain("chatAlerts");
    expect(text).toContain("sell");

    showChatFilterAlertNotification({
      alert: {
        roomName: "German Trade",
        keywords: ["verkauf"],
        lastMatchCompany: "Acme",
        companyFilter: "Acme",
        lastMatchBody: "Verkaufe jetzt",
      },
      t: (key) => key,
      toastDismissMs: 2000,
      requestAnimationFrameFn: (cb) => cb(),
      setTimeoutFn: () => 1,
      clearTimeoutFn: vi.fn(),
    });

    const link = document.querySelector(".scx-ca-toast-link");
    expect(link?.getAttribute("href")).toBe("https://www.simcompanies.com/messages/chatroom_German%20Trade");
  });
});
