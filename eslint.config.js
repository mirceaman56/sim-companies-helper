import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        MutationObserver: "readonly",
        AbortController: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        Event: "readonly",
        AudioContext: "readonly",
        webkitAudioContext: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        getComputedStyle: "readonly",
        history: "readonly",
        // Chrome extension API
        chrome: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**"],
  },
];
