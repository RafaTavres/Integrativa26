import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/tesseract/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    rules: {
      // O projeto usa efeitos de sincronização com APIs do navegador.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
