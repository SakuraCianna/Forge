// 本文件说明: Vitest 测试配置
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve("src/renderer/src"),
      "@shared": resolve("src/shared")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/renderer/src/test/setup.ts"]
  }
});
