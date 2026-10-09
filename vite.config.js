import { defineConfig } from "vite";
import { resolve } from "path";

// Two builds share dist/: `--mode content` (content script + CSS, clears dist) runs first,
// then `--mode background` (service worker) appends. Source maps stay in dist/ for local
// debugging; scripts/pack-extension.mjs leaves them out of the store zip.
export default defineConfig(({ mode }) => {
  const isContent = mode !== "background";

  return {
    test: {
      setupFiles: ["./tests/setup.js"],
    },
    build: {
      outDir: "dist",
      emptyOutDir: isContent,
      sourcemap: true,
      minify: true,
      target: "chrome116", // keep in sync with minimum_chrome_version in public/manifest.json
      rollupOptions: {
        input: isContent
          ? {
              content: resolve(__dirname, "src/content.js"),
              contentStyle: resolve(__dirname, "src/content.css"),
            }
          : {
              background: resolve(__dirname, "src/background.js"),
            },
        output: {
          entryFileNames: "[name].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  };
});
