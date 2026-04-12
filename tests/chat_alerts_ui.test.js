// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveChatAlertsSnapshot: vi.fn(async () => {}),
  loadChatAlertsSnapshot: vi.fn(async () => null),
  findLatestRecentChatMatch: vi.fn(async () => null),
}));

vi.mock("../src/state.js", () => ({
  STATE: {
    auth: { realmId: 0, companyId: 123 },
  },
}));

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

vi.mock("../src/sidebar.js", () => ({
  getSectionContent: () => null,
}));

vi.mock("../src/data/apiClient.js", () => ({
  request: vi.fn(async () => []),
}));

vi.mock("../src/chat_alerts_storage.js", () => ({
  saveChatAlertsSnapshot: mocks.saveChatAlertsSnapshot,
  loadChatAlertsSnapshot: mocks.loadChatAlertsSnapshot,
  storageKeyForRealm: (realmId) => `scx-chat-alerts-${realmId}`,
}));

vi.mock("../src/chat_filter.js", () => ({
  findLatestRecentChatMatch: mocks.findLatestRecentChatMatch,
}));

import { _testUtils } from "../src/chat_alerts_ui.js";

function makeContainer() {
  const el = document.createElement("div");
  el.innerHTML = `
    <input id="scx-ca-keywords" value="sell, buying" />
    <input id="scx-ca-company" value="Acme" />
    <button id="scx-ca-add"></button>
    <span class="scx-chat-alerts-limit-text"></span>
    <div id="scx-ca-list"></div>
  `;
  return el;
}

describe("chat_alerts_ui", () => {
  beforeEach(() => {
    _testUtils.setAlerts([]);
    _testUtils.setNextAlertId(1);
    mocks.saveChatAlertsSnapshot.mockClear();
    mocks.loadChatAlertsSnapshot.mockClear();
    mocks.findLatestRecentChatMatch.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds alert from form and enforces 2-alert limit", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    container.querySelector("#scx-ca-keywords").value = "sell";
    container.querySelector("#scx-ca-company").value = "Acme";
    _testUtils.addAlert(container);
    container.querySelector("#scx-ca-keywords").value = "sell";
    container.querySelector("#scx-ca-company").value = "Acme";
    _testUtils.addAlert(container);

    const alerts = _testUtils.getAlerts();
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      id: 1,
      keywords: ["sell", "buying"],
      companyFilter: "Acme",
      active: false,
      triggered: false,
    });
  });

  it("start/stop/reset/remove lifecycle works", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    _testUtils.startAlert(container, alert.id);
    expect(alert.active).toBe(true);

    _testUtils.stopAlert(container, alert.id);
    expect(alert.active).toBe(false);

    alert.triggered = true;
    _testUtils.resetAlert(container, alert.id);
    expect(alert.triggered).toBe(false);

    _testUtils.removeAlert(container, alert.id);
    expect(_testUtils.getAlerts()).toHaveLength(0);
  });

  it("persists and restores snapshot", async () => {
    const container = makeContainer();
    _testUtils.addAlert(container);

    await _testUtils.saveAlerts();
    expect(mocks.saveChatAlertsSnapshot).toHaveBeenCalled();

    mocks.loadChatAlertsSnapshot.mockResolvedValueOnce({
      alerts: [
        {
          id: 5,
          keywords: ["sell"],
          companyFilter: null,
          active: false,
          triggered: false,
          intervalId: null,
          lastCheck: null,
          lastMatchMessageId: null,
          lastMatchAt: null,
          lastMatchCompany: null,
          lastMatchBody: null,
        },
      ],
      nextAlertId: 6,
    });

    await _testUtils.loadAlerts();
    expect(_testUtils.getAlerts()).toHaveLength(1);
    expect(_testUtils.getNextAlertId()).toBe(6);
  });

  it("exposes scoped storage key", () => {
    expect(_testUtils.storageKey()).toBe("scx-chat-alerts-0");
  });
});
