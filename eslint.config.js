import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
      // Track work in issues, not in comments.
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx", "hack"], location: "start" }],
    },
  },
  {
    // Extension runtime: content script + background service worker.
    files: ["src/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: {
      // Inline styling bypasses the design system in src/styles/. Add a .scx-* class instead.
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression > MemberExpression.left[object.property.name='style']",
          message:
            "No inline styles. Add a .scx-* class in src/styles/ and toggle it (classList / hidden attribute).",
        },
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name='style']",
          message:
            "No inline styles. Add a .scx-* class in src/styles/ and toggle it (classList / hidden attribute).",
        },
        {
          // Measured values may be handed to CSS through --scx-* custom properties only.
          selector:
            "CallExpression[callee.property.name='setProperty'][callee.object.property.name='style'][arguments.0.value=/^(?!--scx-)/]",
          message: "Only --scx-* custom properties may be set from JS. Put the styling in src/styles/.",
        },
        {
          selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.value='style']",
          message: "No inline styles. Add a .scx-* class in src/styles/.",
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: "eval is forbidden (MV3 CSP + store policy).",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function is forbidden (MV3 CSP + store policy).",
        },
      ],
      // Keep modules small enough for an agent to read in one pass. Split by responsibility when this fires.
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/background.js"],
    languageOptions: {
      globals: { ...globals.serviceworker, chrome: "readonly" },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, chrome: "readonly" },
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Check scripts mark template expressions with \u0000 (see scripts/lib/source-files.mjs).
      "no-control-regex": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
];
