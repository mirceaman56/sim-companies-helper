import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.js"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,

    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.js"),
        background: resolve(__dirname, "src/background.js"),
        contentStyle: resolve(__dirname, "src/content.css"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [
    {
      name: "copy-recipes",
      apply: "build",
      enforce: "post",
      generateBundle() {
        mkdirSync(resolve(__dirname, "dist"), { recursive: true });
        mkdirSync(resolve(__dirname, "dist/resources"), { recursive: true });
        copyFileSync(
          resolve(__dirname, "src/resources/recipes.json"),
          resolve(__dirname, "dist/resources/recipes.json"),
        );
      },
    },
  ],
});
