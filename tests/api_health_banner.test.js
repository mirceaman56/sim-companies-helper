// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

import { SIDEBAR_ID } from "../src/state.js";
import {
  applyExternalRateLimit,
  SIMCOMPANIES_RATE_LIMIT_GROUP,
  _testUtils as apiClientTestUtils,
} from "../src/data/apiClient.js";
import {
  formatCooldown,
  initApiHealthBanner,
  renderApiHealthBanner,
  _testUtils,
} from "../src/api_health_banner.js";

const { BANNER_ID, RATE_LIMITED_CLASS } = _testUtils;

function mountSidebar() {
  const sidebar = document.createElement("div");
  sidebar.id = SIDEBAR_ID;
  const tab = document.createElement("button");
  tab.className = "scx-sidebar-toggle-tab";
  const section = document.createElement("div");
  section.className = "scx-section";
  sidebar.append(tab, section);
  document.documentElement.appendChild(sidebar);
  return { sidebar, tab };
}

beforeEach(() => {
  apiClientTestUtils.reset();
  _testUtils.reset();
});

afterEach(() => {
  _testUtils.reset();
  apiClientTestUtils.reset();
  document.getElementById(SIDEBAR_ID)?.remove();
});

describe("formatCooldown", () => {
  it("formats remaining time as m:ss", () => {
    expect(formatCooldown(0)).toBe("0:00");
    expect(formatCooldown(61_000)).toBe("1:01");
    expect(formatCooldown(599_500)).toBe("10:00");
  });
});

describe("api health banner", () => {
  it("shows nothing while the API is healthy", () => {
    const { sidebar } = mountSidebar();
    initApiHealthBanner();

    expect(document.getElementById(BANNER_ID)).toBeNull();
    expect(sidebar.classList.contains(RATE_LIMITED_CLASS)).toBe(false);
  });

  it("tints the sidebar and shows a countdown under the toggle tab when rate limited", () => {
    const { sidebar, tab } = mountSidebar();
    initApiHealthBanner();

    applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: Date.now() + 90_000 });

    const banner = document.getElementById(BANNER_ID);
    expect(banner).not.toBeNull();
    expect(tab.nextElementSibling).toBe(banner);
    expect(sidebar.classList.contains(RATE_LIMITED_CLASS)).toBe(true);
    expect(banner.textContent).toContain("apiLimitBannerTitle");
    expect(banner.querySelector("[data-scx-api-countdown]").textContent).toMatch(/^1:(29|30)$/);
  });

  it("removes the warning once the cooldown is over", () => {
    const { sidebar } = mountSidebar();
    initApiHealthBanner();
    applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: Date.now() + 90_000 });

    renderApiHealthBanner(Date.now() + 91_000);

    expect(document.getElementById(BANNER_ID)).toBeNull();
    expect(sidebar.classList.contains(RATE_LIMITED_CLASS)).toBe(false);
  });
});
