const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "public/vendor/**",
      "docs/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Playwright specs: Node code with browser code inside page.evaluate().
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    // A fixture with no dependencies is written async ({}, use) => ...
    rules: { "no-empty-pattern": "off" },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, L: "readonly" },
    },
  },
];
