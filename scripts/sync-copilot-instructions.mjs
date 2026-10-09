// AGENTS.md -> .github/copilot-instructions.md, .claude/skills/** -> .agents/skills/**.
// npm run docs:sync-instructions (write) | docs:check-instructions (verify)
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");

const normalize = (text) => {
  const unix = text.replace(/\r\n/g, "\n");
  return unix.endsWith("\n") ? unix : `${unix}\n`;
};
const readOrEmpty = (abs) => (fs.existsSync(abs) ? normalize(fs.readFileSync(abs, "utf8")) : "");

function listRelative(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    out.push(path.relative(dir, path.join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

/** @type {{ source: string, target: string }[]} */
const pairs = [{ source: "AGENTS.md", target: ".github/copilot-instructions.md" }];
const skillsSrc = path.join(repoRoot, ".claude", "skills");
const skillsDst = path.join(repoRoot, ".agents", "skills");
for (const file of listRelative(skillsSrc)) {
  pairs.push({ source: path.join(".claude/skills", file), target: path.join(".agents/skills", file) });
}
// Mirror files whose source was deleted.
const orphans = listRelative(skillsDst).filter((file) => !fs.existsSync(path.join(skillsSrc, file)));

const stale = pairs.filter(
  ({ source, target }) =>
    readOrEmpty(path.join(repoRoot, source)) !== readOrEmpty(path.join(repoRoot, target)),
);

if (checkOnly) {
  for (const { source, target } of stale) console.warn(`[docs] ${target} is out of sync with ${source}`);
  for (const file of orphans) console.warn(`[docs] .agents/skills/${file} has no source in .claude/skills/`);
  if (stale.length || orphans.length) {
    console.warn("[docs] Run: npm run docs:sync-instructions");
    process.exitCode = 1;
  } else {
    console.log("[docs] Instruction files are in sync.");
  }
} else {
  for (const { source, target } of stale) {
    const abs = path.join(repoRoot, target);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, readOrEmpty(path.join(repoRoot, source)), "utf8");
    console.log(`[docs] Synced ${target} from ${source}`);
  }
  for (const file of orphans)
    console.warn(`[docs] Orphan .agents/skills/${file}: delete it or add a source.`);
  if (!stale.length) console.log("[docs] Instruction files already in sync.");
}
