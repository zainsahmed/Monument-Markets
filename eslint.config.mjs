import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".next-qa/**",
    "test-results/**",
    "playwright-report/**",
    "tests/qa/.data/**",
  ]),
  {
    rules: {
      // Supabase rows are untyped (no generated Database type without a live project); `any` is confined to row mapping.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // Resetting viewer state when the selected document changes is a deliberate sync with an external fetch.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
