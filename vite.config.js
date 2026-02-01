import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,

    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.js"),
        contentStyle: resolve(__dirname, "src/content.css")
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  },
  plugins: [
    {
      name: "copy-recipes",
      apply: "build",
      enforce: "post",
      generateBundle() {
        mkdirSync(resolve(__dirname, "dist"), { recursive: true });
        copyFileSync(
          resolve(__dirname, "src/recipes.json"),
          resolve(__dirname, "dist/recipes.json")
        );
      }
    }
  ]
});
