// why: store review and user trust need a minimal manifest. Widening permissions means editing
// the allowlists below and calling it out in the PR.
import fs from "node:fs";
import path from "node:path";
import { ROOT, createReporter } from "./lib/source-files.mjs";

const FILE = "public/manifest.json";
// unlimitedStorage: the finance cache keeps 60 days of transactions per company/realm in
// chrome.storage.local, which can outgrow the default 10 MB quota. It shows no install warning.
const ALLOWED_PERMISSIONS = ["storage", "unlimitedStorage"];
const ALLOWED_HOST_PERMISSIONS = [];
const ALLOWED_CONTENT_MATCHES = ["https://www.simcompanies.com/*"];

const reporter = createReporter("manifest");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
const report = (msg) => reporter.report(FILE, 1, msg);

if (manifest.manifest_version !== 3) report("manifest_version must be 3.");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || ""))
  report(`version "${manifest.version}" must be MAJOR.MINOR.PATCH.`);
if (!manifest.minimum_chrome_version) report("minimum_chrome_version is required.");
const viteTarget = fs
  .readFileSync(path.join(ROOT, "vite.config.js"), "utf8")
  .match(/target:\s*["']chrome(\d+)["']/);
if (viteTarget?.[1] !== String(manifest.minimum_chrome_version)) {
  report(
    `vite build target chrome${viteTarget?.[1]} must equal minimum_chrome_version ${manifest.minimum_chrome_version}.`,
  );
}

for (const p of manifest.permissions || []) {
  if (!ALLOWED_PERMISSIONS.includes(p))
    report(`permission "${p}" is not in the allowlist (scripts/check-manifest.mjs).`);
}
for (const p of manifest.host_permissions || []) {
  if (!ALLOWED_HOST_PERMISSIONS.includes(p)) {
    report(
      `host permission "${p}" is not in the allowlist. Content scripts already reach the game same-origin.`,
    );
  }
}
for (const p of manifest.optional_permissions || []) report(`optional permission "${p}" is not allowed.`);
for (const cs of manifest.content_scripts || []) {
  for (const m of cs.matches || []) {
    if (!ALLOWED_CONTENT_MATCHES.includes(m)) report(`content script match "${m}" is not in the allowlist.`);
  }
}
if ((manifest.web_accessible_resources || []).length > 0) {
  report("web_accessible_resources lets any page detect the extension. Bundle data via import instead.");
}
if (/unsafe-eval|unsafe-inline/.test(JSON.stringify(manifest.content_security_policy || {}))) {
  report("content_security_policy must not allow unsafe-eval / unsafe-inline.");
}
for (const icon of Object.values(manifest.icons || {})) {
  if (!fs.existsSync(path.join(ROOT, "public", icon))) report(`icon ${icon} is missing from public/.`);
}

reporter.finish(`permissions ${JSON.stringify(manifest.permissions || [])}, no host permissions`);
