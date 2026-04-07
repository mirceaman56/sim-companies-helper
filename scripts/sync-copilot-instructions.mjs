import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "AGENTS.md");
const targetPath = path.join(repoRoot, ".github", "copilot-instructions.md");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

const source = ensureTrailingNewline(readFile(sourcePath));
let target = "";
try {
  target = ensureTrailingNewline(readFile(targetPath));
} catch {
  target = "";
}

if (checkOnly) {
  if (source !== target) {
    console.warn("[docs] .github/copilot-instructions.md is out of sync with AGENTS.md");
    console.warn("[docs] Run: npm run docs:sync-instructions");
    process.exitCode = 1;
  } else {
    console.log("[docs] Instruction files are in sync.");
  }
  process.exit();
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, source, "utf8");
console.log("[docs] Synced .github/copilot-instructions.md from AGENTS.md");
