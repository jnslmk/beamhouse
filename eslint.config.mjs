import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".claude/**",
      ".codex-tmp/**",
      ".husky/_/**",
      "**/dist/**",
      "definitions/**",
      "docs/design/ui-canvas/**",
      "node_modules/**",
      "prototypes/**",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...eslint.configs.recommended,
  },
  {
    // ADR-0047: bridge/src runs on node inside the Electron main process. This
    // lint wall replaces ADR-0006's Bun-only toolchain as the ignorance barrier.
    files: ["bridge/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Bun",
          message: "bridge/src runs on node (ADR-0047); use node:* builtins, not Bun globals.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["bun:*"],
              message: "bridge/src runs on node (ADR-0047); import node:* builtins instead.",
            },
          ],
        },
      ],
    },
  },
);
