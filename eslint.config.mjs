import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Flat config for this Vite + React + TypeScript project. (The previous config
// pulled in eslint-config-next, which was never a dependency and broke linting.)
export default tseslint.config(
  { ignores: ["dist", "build", "coverage", "node_modules"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // The API/JSON boundaries intentionally use `any`; keep it advisory.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Legitimate patterns for this stack:
      // - namespace: required for the Express Request augmentation
      // - empty-object-type: shadcn/ui component interfaces
      // - require-imports: tailwind config plugins
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "no-useless-catch": "warn",
      "no-useless-escape": "warn",
    },
  },
  {
    // shadcn/ui generated components export variants/hooks alongside the
    // component by design; fast-refresh purity doesn't apply to them.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
