import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import noRawJsxStrings from "./eslint-local-rules/no-raw-jsx-strings.js";

const preExistingEffectSyncComponents = [
  "src/components/admin/tables/TablesGrid.tsx",
  "src/components/customer/MenuExperience.tsx",
  "src/components/admin/menu/MenuManager.tsx",
];

const localI18nPlugin = {
  rules: {
    "no-raw-jsx-strings": noRawJsxStrings,
  },
};

export default [
  { ignores: [".next/**", "node_modules/**", "dist/**", "out/**", ".claude/**", "eslint-local-rules/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    files: preExistingEffectSyncComponents,
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["src/**/*.tsx", "src/**/*.jsx"],
    plugins: { local: localI18nPlugin },
    rules: {
      "local/no-raw-jsx-strings": "warn",
    },
  },
];
