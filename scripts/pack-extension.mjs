import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "extension"); // staging folder
const ZIP_PATH = path.join(ROOT, "release.zip");

function rm(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(dstDir, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else copy(s, d);
  }
}

async function zipDir(dir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
}

(async () => {
  rm(OUT_DIR);
  rm(ZIP_PATH);

  // Copy manifest + icons + compiled JS
  // Adjust paths if you keep manifest somewhere else
  copy(path.join(ROOT, "public/manifest.json"), path.join(OUT_DIR, "manifest.json"));
  copyDir(path.join(ROOT, "public/icons"), path.join(OUT_DIR, "icons"));
  copyDir(DIST, path.join(OUT_DIR, "dist"));

  // CSS: if referenced as src/content.css in manifest, copy it too
  copy(path.join(ROOT, "src/content.css"), path.join(OUT_DIR, "content.css"));

  await zipDir(OUT_DIR, ZIP_PATH);

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "manifest.json"), "utf-8"));
  console.log(`Packed ${ZIP_PATH} (version ${manifest.version})`);
})();
