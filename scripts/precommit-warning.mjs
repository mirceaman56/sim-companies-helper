import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/sync-copilot-instructions.mjs", "--check"], {
  stdio: "inherit",
});

if (result.status && result.status !== 0) {
  console.warn("[pre-commit] Warning only: instruction files are not synced.");
  console.warn("[pre-commit] Suggested fix: npm run docs:sync-instructions");
}

process.exit(0);
