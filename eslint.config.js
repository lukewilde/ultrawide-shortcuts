import globals from "globals";

const gnomeGlobals = {
  global: "readonly",
  imports: "readonly",
  log: "readonly",
  logError: "readonly",
  print: "readonly",
  printerr: "readonly",
  console: "readonly",
};

export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2021,
        ...gnomeGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": "warn",
      "no-debugger": "warn",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-extra-semi": "warn",
      "no-unreachable": "warn",
      "eqeqeq": ["warn", "always"],
      "no-var": "error",
      "prefer-const": "warn",
      "semi": ["warn", "always"],
    },
  },
];
