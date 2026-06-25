import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const preExistingEffectSyncComponents = [
  "src/components/admin/tables/TablesGrid.tsx",
  "src/components/customer/MenuExperience.tsx",
  "src/components/admin/menu/MenuManager.tsx",
];

export default [
  { ignores: [".next/**", "node_modules/**", "dist/**", "out/**", ".claude/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    files: preExistingEffectSyncComponents,
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["src/components/customer/PaymentFlow.tsx"],
    rules: {
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];
