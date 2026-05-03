// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/resources/recipes.json", () => ({
  default: [
    { id: 9, name: "Zinc" },
    { id: 7, name: "Apples" },
  ],
}));

import {
  appendChatResult,
  createChatFilterContent,
  formatChatMessageBody,
  getActiveChatTab,
  populateChatRoomSelect,
  readChatSearchInput,
  setActiveChatTab,
  setChatSearchState,
  syncChatTypeState,
  updateChatStatus,
  updateQualitySummary,
} from "../src/chat_filter_presenter.js";

describe("chat_filter presenter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders sorted product options and tab shell", () => {
    const onAction = vi.fn();
    const onTabChange = vi.fn();
    const container = createChatFilterContent({ onAction, onTabChange });
    document.body.appendChild(container);

    const optionTexts = [...container.querySelectorAll("#scx-filter-product option")].map(
      (option) => option.textContent,
    );

    expect(optionTexts).toEqual(["Apples", "Zinc"]);
    expect(container.querySelectorAll(".scx-chat-tab")).toHaveLength(2);

    container.querySelector("#scx-filter-action")?.click();
    expect(onAction).toHaveBeenCalledTimes(1);

    container.querySelector('[data-tab="alerts"]')?.click();
    expect(onTabChange).toHaveBeenCalledWith("alerts");
    expect(getActiveChatTab(container)).toBe("alerts");
  });

  it("reads selected form values and quality summary from compact picker", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);
    populateChatRoomSelect(container, [
      { dbLetter: "S", name: "Sales" },
      { dbLetter: "DE", name: "German Trade" },
    ]);

    const roomSelect = container.querySelector("#scx-filter-room");
    const typeSelect = container.querySelector("#scx-filter-type");
    const productSelect = container.querySelector("#scx-filter-product");
    roomSelect.value = "S";
    typeSelect.value = "sell";
    productSelect.value = "9";
    container.querySelector("#scx-quality-1").checked = true;
    container.querySelector("#scx-quality-3").checked = true;
    updateQualitySummary(container);

    expect(container.querySelector("#scx-filter-quality-summary")?.textContent).toBe("Q1, Q3");
    expect(readChatSearchInput(container)).toEqual({
      roomDbLetter: "S",
      roomName: "Sales",
      filterType: "sell",
      productId: 9,
      productName: "Zinc",
      selectedQualities: ["Q1", "Q3"],
    });
  });

  it("disables type selection for non-default room and forces any", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);
    populateChatRoomSelect(container, [
      { dbLetter: "S", name: "Sales" },
      { dbLetter: "DE", name: "German Trade" },
    ]);

    const roomSelect = container.querySelector("#scx-filter-room");
    const typeSelect = container.querySelector("#scx-filter-type");
    roomSelect.value = "DE";
    syncChatTypeState(container);

    expect(typeSelect.disabled).toBe(true);
    expect(readChatSearchInput(container).filterType).toBe("any");
  });

  it("formats messages and appends rendered results without changing styles", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);

    expect(formatChatMessageBody("Sell :re-7: & fast")).toBe("Sell [Apples] &amp; fast");

    appendChatResult(
      container,
      {
        datetime: "2026-04-12T10:15:00Z",
        sender: { company: "Acme Inc" },
        body: "Sell :re-7: & fast",
      },
      { realmId: 5 },
    );

    const link = container.querySelector(".scx-chat-message-company");
    const body = container.querySelector(".scx-chat-message-body");

    expect(link?.getAttribute("href")).toBe("https://www.simcompanies.com/company/5/acme-inc/");
    expect(body?.innerHTML).toBe("Sell [Apples] &amp; fast");
  });

  it("toggles search state, status text, and tab visibility", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);

    setChatSearchState(container, true);
    updateChatStatus(container, "Scanning");
    expect(container.querySelector("#scx-filter-action")?.textContent).toBe("stop");
    expect(container.querySelector("#scx-filter-status")?.textContent).toBe("Scanning");

    setActiveChatTab(container, "alerts");
    expect(container.querySelector('[data-tab-panel="search"]')?.hidden).toBe(true);
    expect(container.querySelector('[data-tab-panel="alerts"]')?.hidden).toBe(false);

    setChatSearchState(container, false);
    expect(container.querySelector("#scx-filter-action")?.textContent).toBe("startSearch");
  });
});
