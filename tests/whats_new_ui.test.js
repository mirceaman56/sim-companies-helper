// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key, getLang: () => "en", getHtmlLang: () => "en" }));

const sectionContent = { current: null };
vi.mock("../src/sidebar.js", () => ({
  getSectionContent: () => sectionContent.current,
  setSectionUpdateFn: vi.fn(),
}));

vi.mock("../src/data/storage.js", () => ({
  storage: {
    migrate: vi.fn(async () => ({ data: null })),
    set: vi.fn(async () => true),
    buildStorageKey: ({ domain, version }) => `scx:${domain}:v${version}:global`,
  },
}));

vi.mock("../src/whats_new.js", async (importOriginal) => {
  const actual = await importOriginal();
  const versions = [
    {
      version: "0.29.2",
      date: "2026-09-21",
      entries: [
        { cat: "feature", pr: 158, text: "Contract discounts accept any value" },
        { cat: "fix", pr: 157, text: "Production panel works again" },
      ],
      credits: [
        { handle: "irenes-cv", role: "reporter", url: "https://github.com/irenes-cv" },
        { handle: "alice", role: "contributor", url: "https://github.com/alice" },
      ],
    },
    {
      version: "0.29.1",
      date: "2026-09-18",
      entries: [{ cat: "fix", pr: 156, text: "Warehouse totals fixed" }],
      credits: [{ handle: "Cauadsm", role: "contributor", url: null }],
    },
  ];
  return {
    ...actual,
    getChangelog: () => versions,
    getLatestVersions: (count) => versions.slice(0, count),
    getVersionsBetween: (from, to) => actual.getVersionsBetween(from, to, versions),
  };
});

import { initWhatsNew, updateWhatsNewPanel, _testUtils } from "../src/whats_new_ui.js";
import { storage } from "../src/data/storage.js";

function mountSection() {
  document.body.innerHTML = `
    <div class="scx-section collapsed">
      <div class="scx-section-content"></div>
    </div>`;
  sectionContent.current = document.querySelector(".scx-section-content");
  return sectionContent.current;
}

beforeEach(() => {
  mountSection();
  _testUtils.setUnseen([]);
  vi.clearAllMocks();
  storage.migrate.mockResolvedValue({ data: null });
});

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("scx-toast-container")?.remove();
  sectionContent.current = null;
});

describe("what's new panel", () => {
  it("renders every version grouped by category", () => {
    updateWhatsNewPanel();

    const versions = document.querySelectorAll(".scx-whats-new-version");
    expect(versions).toHaveLength(2);
    expect(versions[0].textContent).toContain("v0.29.2");
    // Feature group renders before the fix group.
    const groups = versions[0].querySelectorAll(".scx-whats-new-group-title");
    expect(groups[0].textContent).toContain("whatsNewCatFeature");
    expect(groups[1].textContent).toContain("whatsNewCatFix");
    expect(versions[0].textContent).toContain("Contract discounts accept any value");
  });

  it("badges only the versions the player has not seen", () => {
    _testUtils.setUnseen(["0.29.2"]);
    updateWhatsNewPanel();

    const badged = document.querySelectorAll(".scx-whats-new-badge");
    expect(badged).toHaveLength(1);
    expect(badged[0].closest(".scx-whats-new-version").textContent).toContain("v0.29.2");
  });

  it("credits reporters and contributors with profile links", () => {
    updateWhatsNewPanel();

    const first = document.querySelectorAll(".scx-whats-new-version")[0];
    const lines = first.querySelectorAll(".scx-whats-new-credits");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("whatsNewCreditContributors");
    expect(lines[0].textContent).toContain("@alice");
    expect(lines[1].textContent).toContain("whatsNewCreditReporters");

    const link = first.querySelector('a.scx-whats-new-credit[href="https://github.com/irenes-cv"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toBe("@irenes-cv");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("shows a name-only credit as plain text, not a link", () => {
    updateWhatsNewPanel();

    const second = document.querySelectorAll(".scx-whats-new-version")[1];
    const credit = second.querySelector(".scx-whats-new-credit");
    expect(credit.tagName).toBe("SPAN");
    expect(credit.textContent).toBe("Cauadsm");
  });

  it("omits the credits line for a version with nobody to thank", () => {
    _testUtils.setUnseen([]);
    const block = _testUtils.renderVersionBlock(
      { version: "1.0.0", date: "2026-01-01", entries: [{ cat: "fix", text: "x" }] },
      "en",
    );
    expect(block).not.toContain("scx-whats-new-credits");
  });

  it("renders without a section mounted", () => {
    sectionContent.current = null;
    expect(() => updateWhatsNewPanel()).not.toThrow();
  });
});

describe("what's new toast", () => {
  it("summarises the range instead of listing every entry", async () => {
    storage.migrate.mockResolvedValue({
      data: { kind: "changelog", version: "0.29.2", lastVersion: "0.29.1", show: true },
    });

    await initWhatsNew();

    const toast = document.querySelector(".scx-toast");
    expect(toast).not.toBeNull();
    expect(toast.querySelector(".scx-toast-message").textContent).toBe(
      "1 whatsNewOneFeature · 1 whatsNewOneFix",
    );
    expect(toast.textContent).toContain("v0.29.2");
  });

  it("marks itself shown only after the toast is in the DOM", async () => {
    // The old build wrote the flag first, so a navigation mid-load cost the
    // player the announcement permanently.
    storage.migrate.mockResolvedValue({
      data: { kind: "changelog", version: "0.29.2", lastVersion: "0.29.1", show: true },
    });
    let toastExistedAtWrite = false;
    storage.set.mockImplementation(async () => {
      toastExistedAtWrite = document.querySelector(".scx-toast") !== null;
      return true;
    });

    await initWhatsNew();

    expect(toastExistedAtWrite).toBe(true);
    expect(storage.set).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ show: false }) }));
  });

  it("opens the panel section from the toast action", async () => {
    storage.migrate.mockResolvedValue({
      data: { kind: "changelog", version: "0.29.2", lastVersion: "0.29.1", show: true },
    });

    await initWhatsNew();
    const section = document.querySelector(".scx-section");
    expect(section.classList.contains("collapsed")).toBe(true);

    document.querySelector(".scx-whats-new-action").click();

    expect(section.classList.contains("collapsed")).toBe(false);
  });

  it("shows a welcome toast on a fresh install, not a changelog", async () => {
    storage.migrate.mockResolvedValue({ data: { kind: "welcome", version: "0.29.2", show: true } });

    await initWhatsNew();

    const toast = document.querySelector(".scx-toast");
    expect(toast.textContent).toContain("whatsNewWelcomeTitle");
    expect(document.querySelectorAll(".scx-whats-new-badge")).toHaveLength(0);
  });

  it("stays quiet when the update had nothing player-visible", async () => {
    storage.migrate.mockResolvedValue({
      data: { kind: "changelog", version: "0.29.3", lastVersion: "0.29.2", show: true },
    });

    await initWhatsNew();

    expect(document.querySelector(".scx-toast")).toBeNull();
    // Still marked shown, so it does not retry on every page load.
    expect(storage.set).toHaveBeenCalled();
  });

  it("stays quiet when nothing is pending", async () => {
    storage.migrate.mockResolvedValue({ data: { kind: "changelog", version: "0.29.2", show: false } });

    await initWhatsNew();

    expect(document.querySelector(".scx-toast")).toBeNull();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("migrates a v1 payload without showing its scraped English highlights", async () => {
    storage.migrate.mockImplementation(async ({ readLegacy }) => {
      const legacy = await readLegacy({
        getRaw: async (_backend, key) =>
          key === "scx:whats-new:v1:global"
            ? { version: "0.29.2", lastVersion: "0.29.1", show: true, highlights: ["raw scraped text"] }
            : null,
        removeRaw: async () => true,
      });
      return { data: legacy.data, migrated: true };
    });

    await initWhatsNew();

    const toast = document.querySelector(".scx-toast");
    expect(toast).not.toBeNull();
    expect(toast.textContent).not.toContain("raw scraped text");
  });
});

describe("buildSummaryLine", () => {
  it.each([
    [{ feature: 1, fix: 0, other: 0 }, "1 whatsNewOneFeature"],
    [{ feature: 2, fix: 0, other: 0 }, "2 whatsNewManyFeatures"],
    [{ feature: 0, fix: 3, other: 0 }, "3 whatsNewManyFixes"],
    [{ feature: 1, fix: 1, other: 1 }, "1 whatsNewOneFeature · 1 whatsNewOneFix · 1 whatsNewOneOther"],
    [{ feature: 0, fix: 0, other: 0 }, ""],
  ])("pluralizes %o", (counts, expected) => {
    expect(_testUtils.buildSummaryLine(counts)).toBe(expected);
  });
});
