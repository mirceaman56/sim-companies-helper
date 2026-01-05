// scripts/pack-extension.mjs
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const OUT_ZIP = path.join(ROOT, "sim-companies-extension-chrome.zip");

// remove old zip if exists
if (fs.existsSync(OUT_ZIP)) {
  fs.unlinkSync(OUT_ZIP);
}

// ---- create archive ----
const output = fs.createWriteStream(OUT_ZIP);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`✅ Packed ${archive.pointer()} bytes → ${path.basename(OUT_ZIP)}`);
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") console.warn(err);
  else throw err;
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

// ---- add dist contents (no wrapper folder) ----
archive.glob("**/*", {
  cwd: DIST_DIR,
  dot: false,
  ignore: [
    "**/.DS_Store",
    "**/__MACOSX/**"
  ],
});

// ---- finalize ----
await archive.finalize();
