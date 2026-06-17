// 本文件说明: 验证本地生成目录不会污染仓库级 ESLint 检查
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ESLint ignores the local Forge site workspace", async () => {
  const config = await readFile("eslint.config.js", "utf8");

  assert.match(config, /"Forge-site\/\*\*"/u);
});
