import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "../scripts/lib/color.mjs";
import { extractLiterals, lineOf, stripComments } from "../scripts/lib/source-files.mjs";

describe("scripts/lib/source-files", () => {
  it("strips comments but keeps strings and line numbers", () => {
    const code = 'const a = "// not a comment"; // gone\n/* gone\n too */ const b = 1;';
    const out = stripComments(code);
    expect(out).toContain('"// not a comment"');
    expect(out).not.toContain("gone");
    expect(out.split("\n")).toHaveLength(3);
  });

  it("extracts template literals with expressions masked, including nested ones", () => {
    const code = 'const html = `<b>${t("x")}</b>${items.map((i) => `<i>${i}</i>`).join("")}`;';
    const texts = extractLiterals(code).map((l) => l.text);
    expect(texts).toContain("<b>\u0000</b>\u0000");
    expect(texts).toContain("<i>\u0000</i>");
    expect(texts).toContain("x");
  });

  it("keeps newlines of masked expressions so offsets map to source lines", () => {
    const code = "const s = `a${\n  value\n}b\n<p>Text</p>`;";
    const lit = extractLiterals(code).find((l) => l.text.includes("<p>"));
    const offset = lit.text.indexOf("<p>");
    const line = lineOf(code, lit.index) + (lit.text.slice(0, offset).match(/\n/g) || []).length;
    expect(line).toBe(4);
  });
});

describe("scripts/check-comments.mjs", () => {
  async function runOn(source) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const dir = mkdtempSync(join(tmpdir(), "scx-comments-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "sample.js"), source);
    const script = resolve("scripts/check-comments.mjs");
    const res = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    return { ok: res.status === 0, out: res.stdout + res.stderr };
  }

  it("accepts short why-comments and JSDoc tags", async () => {
    const { ok, out } = await runOn(
      [
        "// why: the game renders the list after the route event.",
        "/**",
        " * @param {string} a",
        " * @returns {number}",
        " */",
        "export function parse(a) {",
        "  return Number(a);",
        "}",
      ].join("\n"),
    );
    expect(out).toContain("OK");
    expect(ok).toBe(true);
  });

  it("flags restating names, long blocks, commented-out code and history", async () => {
    const { ok, out } = await runOn(
      [
        "// sample.js",
        "/** Render the alert list. */",
        "function renderAlertList() {}",
        "// one",
        "// two",
        "// three",
        "// four",
        "const a = 1;",
        "// const b = 2;",
        "// The old build skipped patches.",
        "const c = 3;",
      ].join("\n"),
    );
    expect(ok).toBe(false);
    expect(out).toContain("restates the file name");
    expect(out).toContain("only restates the name");
    expect(out).toContain("4 prose lines");
    expect(out).toContain("commented-out code");
    expect(out).toContain("change history");
  });
});

describe("scripts/lib/color.mjs", () => {
  it("matches the WCAG reference values for black and white", () => {
    expect(contrastRatio("oklch(100% 0 0)", "oklch(0% 0 0)")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });

  it("agrees between hex and the equivalent oklch", () => {
    // Okabe-Ito blue, #0072B2
    expect(contrastRatio("oklch(53.2% 0.131 244)", "#ffffff")).toBeCloseTo(
      contrastRatio("#0072b2", "#ffffff"),
      1,
    );
  });

  it("refuses translucent or unknown colors instead of guessing", () => {
    expect(contrastRatio("oklch(50% 0.1 240 / 0.5)", "#ffffff")).toBeNull();
    expect(contrastRatio("var(--x)", "#ffffff")).toBeNull();
    expect(parseColor("oklch(50% 0.1 240 / 50%)").alpha).toBe(0.5);
  });
});

describe("scripts/check-markup.mjs", () => {
  async function runOn(source) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const dir = mkdtempSync(join(tmpdir(), "scx-markup-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "sample.js"), source);
    const res = spawnSync(process.execPath, [resolve("scripts/check-markup.mjs")], {
      cwd: dir,
      encoding: "utf8",
    });
    return { ok: res.status === 0, out: res.stdout + res.stderr };
  }

  it("flags icon-only and tooltip-only buttons without aria-label", async () => {
    const { ok, out } = await runOn(
      [
        'const a = `<button type="button" class="x">✕</button>`;',
        'const b = `<button type="button" data-tooltip="${t("copy")}">${ICON}</button>`;',
      ].join("\n"),
    );
    expect(ok).toBe(false);
    expect(out).toContain("icon-only <button>");
    expect(out).toContain("data-tooltip is CSS-only");
  });

  it("accepts buttons with text or an aria-label", async () => {
    const { ok, out } = await runOn(
      [
        'const a = `<button type="button">${t("save")}</button>`;',
        'const b = `<button type="button" aria-label="${t("close")}">✕</button>`;',
        'const c = `<button type="button">Save</button>`;',
      ].join("\n"),
    );
    expect(out).toContain("OK");
    expect(ok).toBe(true);
  });
});
