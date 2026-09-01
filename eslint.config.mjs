import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // Existing client components intentionally synchronize browser-only state
    // after hydration. Refactoring those UI paths is separate from this
    // security upgrade; keep the established behavior while retaining every
    // other Next/React rule.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off"
    }
  },
  globalIgnores([".next/**", "node_modules/**", "shots/**", "data/**", "next-env.d.ts"])
]);
