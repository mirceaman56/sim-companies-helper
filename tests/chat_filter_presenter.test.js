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
  readChatSearchInput,
  setChatSearchState,
  updateChatStatus,
} from "../src/chat_filter_presenter.js";

describe("chat_filter presenter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders sorted product options and wires the action button", () => {
    const onAction = vi.fn();
    const container = createChatFilterContent({ onAction });
    document.body.appendChild(container);

    const optionTexts = [...container.querySelectorAll("#scx-filter-product option")].map(
      (option) => option.textContent,
    );

    expect(optionTexts).toEqual(["Apples", "Zinc"]);

    container.querySelector("#scx-filter-action")?.click();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(container.querySelector('label[for="scx-filter-type"]')).not.toBeNull();
    expect(container.querySelector('label[for="scx-filter-product"]')).not.toBeNull();
    expect(container.querySelector("#scx-filter-type")?.getAttribute("name")).toBe("scx-filter-type");
    expect(container.querySelector("#scx-filter-product")?.getAttribute("name")).toBe("scx-filter-product");
    expect(container.querySelector("#scx-filter-quality")?.getAttribute("aria-labelledby")).toBe("scx-filter-quality-label");
    expect(container.querySelector("#scx-quality-1")?.getAttribute("name")).toBe("scx-quality-1");
  });

  it("reads selected form values from the presenter DOM", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);

    const typeSelect = container.querySelector("#scx-filter-type");
    const productSelect = container.querySelector("#scx-filter-product");
    typeSelect.value = "sell";
    productSelect.value = "9";
    container.querySelector("#scx-quality-1").checked = true;
    container.querySelector("#scx-quality-3").checked = true;

    expect(readChatSearchInput(container)).toEqual({
      filterType: "sell",
      productId: 9,
      productName: "Zinc",
      filterTypeLabel: "selling",
      selectedQualities: ["Q1", "Q3"],
    });
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

  it("toggles search state and status text", () => {
    const container = createChatFilterContent();
    document.body.appendChild(container);

    setChatSearchState(container, true);
    updateChatStatus(container, "Scanning");
    expect(container.querySelector("#scx-filter-action")?.textContent).toBe("stop");
    expect(container.querySelector("#scx-filter-status")?.textContent).toBe("Scanning");

    setChatSearchState(container, false);
    expect(container.querySelector("#scx-filter-action")?.textContent).toBe("startSearch");
  });
});
