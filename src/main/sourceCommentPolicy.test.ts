// 本文件说明: 验证源码文件都有中文说明注释
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const codeEntryPoints = ["electron.vite.config.ts", "vitest.config.ts", "eslint.config.js", "src"];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs"]);
const forbiddenChinesePunctuation = /[，。；：！？]/;

function collectCodeFiles(targetPath: string): string[] {
  const absolutePath = path.join(repositoryRoot, targetPath);
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return codeExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => {
    const relativePath = path.join(targetPath, entry);

    return collectCodeFiles(relativePath);
  });
}

function readLeadingChineseComment(filePath: string): string | undefined {
  const source = readFileSync(filePath, "utf8");

  return source
    .split(/\r?\n/)
    .slice(0, 8)
    .map((line) => line.trim())
    .find((line) => /^\/\/\s*[\u4e00-\u9fff]/.test(line));
}

describe("source comment policy", () => {
  const codeFiles = codeEntryPoints.flatMap(collectCodeFiles);

  it.each(codeFiles)("keeps a Chinese file summary comment in %s", (filePath) => {
    const comment = readLeadingChineseComment(filePath);

    expect(comment).toBeDefined();
    expect(comment).not.toMatch(forbiddenChinesePunctuation);
    expect(comment?.endsWith(".")).toBe(false);
  });
});
