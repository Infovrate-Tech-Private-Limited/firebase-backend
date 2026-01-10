const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const importPlugin = require("eslint-plugin-import");
const prettierConfig = require("eslint-config-prettier");

// Helper: eslint-config-prettier sometimes exports { rules }, sometimes just rules
const prettierRules = prettierConfig.rules
  ? prettierConfig.rules
  : prettierConfig;

const tsRecommendedRules =
  (tsPlugin.configs &&
    tsPlugin.configs.recommended &&
    tsPlugin.configs.recommended.rules) ||
  {};

const importTypescriptRules =
  (importPlugin.configs &&
    importPlugin.configs.typescript &&
    importPlugin.configs.typescript.rules) ||
  {};

module.exports = [
  // Equivalent to common ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "eslint.config.js"],
  },

  {
    // Apply to TS + JS files (your old .eslintrc applied broadly via ts parser)
    files: ["**/*.{ts,tsx,js,jsx,cjs,mjs}"],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },

    // Matches your "plugin:import/typescript" intent (TS import resolution).
    // You already have eslint-import-resolver-typescript installed.
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },

    rules: {
      // Equivalent of:
      // extends: plugin:@typescript-eslint/recommended
      ...tsRecommendedRules,

      // Equivalent of:
      // extends: plugin:import/typescript
      ...importTypescriptRules,

      // Equivalent of:
      // extends: prettier
      ...prettierRules,

      // Your custom overrides (copied 1:1)
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",

      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "warn",

      "import/no-unresolved": "off",

      "max-classes-per-file": "off",
      "global-require": "off",
      "import/extensions": "off",
      "no-console": "off",
      "import/no-dynamic-require": "off",
      "class-methods-use-this": "off",
      "import/prefer-default-export": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
