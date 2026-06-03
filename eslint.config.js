// 本文件说明: ESLint 代码检查配置
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly"
};

const browserGlobals = {
  console: "readonly",
  document: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLTextAreaElement: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "dist-electron/**",
      "node_modules/**",
      "out/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: [
      "*.config.ts",
      "src/main/**/*.ts",
      "src/preload/**/*.ts",
      "src/shared/**/*.ts"
    ],
    languageOptions: {
      globals: nodeGlobals
    }
  },
  {
    files: ["src/renderer/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: browserGlobals
    }
  }
);
