import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig(({ mode }) => {
  const target = mode === "background" ? "background" : "content";
  const isContent = target === "content";

  return {
    test: {
      setupFiles: ["./tests/setup.js"],
    },
    build: {
      outDir: "dist",
      emptyOutDir: isContent,
      sourcemap: true,
      minify: false,
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
    plugins: isContent
      ? [
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
        ]
      : [],
  };
});
