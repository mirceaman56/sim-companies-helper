import fs from "node:fs";
import path from "node:path";

const srcRoot = path.join(process.cwd(), "src");

const forbidden = [
  { pattern: /\blocalStorage\./, message: "Use src/data/storage.js instead of localStorage directly." },
  { pattern: /\bchrome\.storage\.local\b/, message: "Use src/data/storage.js instead of chrome.storage.local directly." },
  { pattern: /\bfetch\(/, message: "Use src/data/apiClient.js instead of fetch directly." },
];

const allowDir = path.join(srcRoot, "data") + path.sep;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (entry.isFile() && abs.endsWith(".js")) {
      out.push(abs);
    }
  }
  return out;
}

const files = walk(srcRoot).filter((f) => !f.startsWith(allowDir));
let violations = 0;

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    ) {
      continue;
    }
    for (const rule of forbidden) {
      if (!rule.pattern.test(line)) continue;
      console.warn(`[data-boundary] ${rel}:${i + 1} -> ${rule.message}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  process.exitCode = 1;
} else {
  console.log("[data-boundary] OK: no direct fetch/storage usage outside src/data");
}
