// Shared helpers for the repo check scripts (scripts/check-*.mjs).
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const SRC = path.join(ROOT, "src");

/**
 * Recursively list files under `dir` whose name ends with one of `exts`.
 * @param {string} dir
 * @param {string[]} exts
 * @returns {string[]} absolute paths
 */
export function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(abs);
  }
  return out.sort();
}

/** Repo-relative POSIX path, used in messages and rule matching. */
export function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

export function read(abs) {
  return fs.readFileSync(abs, "utf8");
}

/** Replace comments with spaces (keeps offsets/line numbers stable). Strings are left intact. */
export function stripComments(code) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        out += code[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * Collect violations and print them in `file:line  [check] message` form.
 * Exits non-zero when anything was reported.
 */
export function createReporter(checkName) {
  const problems = [];
  return {
    report(file, line, message) {
      problems.push(`${file}:${line}  [${checkName}] ${message}`);
    },
    finish(okMessage) {
      if (problems.length > 0) {
        for (const p of problems) console.error(p);
        console.error(`\n[${checkName}] ${problems.length} problem(s).`);
        process.exitCode = 1;
      } else {
        console.log(`[${checkName}] OK: ${okMessage}`);
      }
    },
  };
}

/**
 * Extract every string and template literal from (comment-stripped) code.
 * Template expressions `${...}` are replaced by "\u0000" in `text`; template
 * literals nested inside expressions are extracted as literals of their own.
 * @param {string} code
 * @returns {{ index: number, text: string }[]} index = offset of the literal's first character
 */
export function extractLiterals(code) {
  const out = [];

  function readQuoted(i, quote) {
    let j = i + 1;
    let text = "";
    while (j < code.length && code[j] !== quote) {
      if (code[j] === "\\") {
        text += code[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (code[j] === "\n") break; // unterminated: bail out
      text += code[j];
      j += 1;
    }
    out.push({ index: i + 1, text });
    return j + 1;
  }

  function readTemplate(i) {
    let j = i + 1;
    let text = "";
    while (j < code.length && code[j] !== "`") {
      if (code[j] === "\\") {
        text += code[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (code[j] === "$" && code[j + 1] === "{") {
        const end = scanCode(j + 2, "}");
        // Keep line count so callers can map offsets in `text` back to source lines.
        text += "\u0000" + "\n".repeat((code.slice(j, end).match(/\n/g) || []).length);
        j = end;
        continue;
      }
      text += code[j];
      j += 1;
    }
    out.push({ index: i + 1, text });
    return j + 1;
  }

  // Scan code until the matching `close` brace (or end), extracting literals on the way.
  function scanCode(i, close) {
    let depth = 0;
    let j = i;
    while (j < code.length) {
      const ch = code[j];
      if (ch === '"' || ch === "'") j = readQuoted(j, ch);
      else if (ch === "`") j = readTemplate(j);
      else if (ch === "{") {
        depth += 1;
        j += 1;
      } else if (ch === "}") {
        if (depth === 0 && close === "}") return j + 1;
        depth -= 1;
        j += 1;
      } else j += 1;
    }
    return j;
  }

  scanCode(0, null);
  return out;
}
