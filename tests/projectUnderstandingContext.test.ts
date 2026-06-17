// 本文件说明: 验证项目理解问答上下文的文件筛选和内容拼装行为
import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectTextFile } from "../src/shared/fileTypes.js";
import type { ProjectFile, ProjectScanResult } from "../src/shared/projectTypes.js";
import {
  createProjectUnderstandingContexts,
  selectProjectUnderstandingFiles,
  truncateForProjectUnderstanding
} from "../src/renderer/src/agent/projectUnderstandingContext.js";

test("project understanding file selection prioritizes foundation files and skips noisy files", () => {
  const selectedPaths = selectProjectUnderstandingFiles(
    [
      projectFile("node_modules/library/index.ts"),
      projectFile("package-lock.json"),
      projectFile("dist/bundle.js"),
      projectFile("docs/overview.md"),
      projectFile("src/features/deep-helper.ts"),
      projectFile("package.json"),
      projectFile("README.md"),
      projectFile("src/main/index.ts")
    ],
    12_000
  ).map((file) => file.relativePath);

  assert.deepEqual(selectedPaths.slice(0, 3), [
    "README.md",
    "package.json",
    "src/main/index.ts"
  ]);
  assert.ok(selectedPaths.includes("src/features/deep-helper.ts"));
  assert.ok(selectedPaths.includes("docs/overview.md"));
  assert.ok(!selectedPaths.includes("node_modules/library/index.ts"));
  assert.ok(!selectedPaths.includes("package-lock.json"));
  assert.ok(!selectedPaths.includes("dist/bundle.js"));
});

test("project understanding contexts read representative files through an injected reader", async () => {
  const scan = createScanResult([
    projectFile("README.md", 32),
    projectFile("src/main/index.ts", 36),
    projectFile("src/empty.ts", 0),
    projectFile("src/missing.ts", 12)
  ]);
  const readPaths: string[] = [];
  const contexts = await createProjectUnderstandingContexts({
    contextBudget: 1_000,
    prompt: "看看这个项目是做什么的",
    projectScan: scan,
    readText: async ({ projectRoot, relativePath }) => {
      assert.equal(projectRoot, scan.rootPath);
      readPaths.push(relativePath);

      if (relativePath === "src/missing.ts") {
        throw new Error("file moved");
      }

      return textFile(relativePath, contentFor(relativePath));
    }
  });

  assert.deepEqual(readPaths, ["README.md", "src/main/index.ts", "src/missing.ts"]);
  assert.equal(contexts.length, 1);
  assert.match(contexts[0]?.content ?? "", /Forge project understanding context:/u);
  assert.match(contexts[0]?.content ?? "", /--- README\.md \(32 bytes\) ---/u);
  assert.match(contexts[0]?.content ?? "", /--- src\/main\/index\.ts \(36 bytes\) ---/u);
  assert.doesNotMatch(contexts[0]?.content ?? "", /src\/missing\.ts/u);
});

test("project understanding contexts are skipped for non-understanding prompts", async () => {
  const contexts = await createProjectUnderstandingContexts({
    contextBudget: 1_000,
    prompt: "继续",
    projectScan: createScanResult([projectFile("README.md")]),
    readText: async () => {
      throw new Error("reader should not run for non-understanding prompts");
    }
  });

  assert.deepEqual(contexts, []);
});

test("project understanding truncation keeps short content and marks clipped content", () => {
  assert.equal(truncateForProjectUnderstanding("short content", 30), "short content");
  assert.equal(
    truncateForProjectUnderstanding("a".repeat(40), 30),
    `${"a".repeat(6)}\n[truncated]`
  );
});

function createScanResult(files: ProjectFile[]): ProjectScanResult {
  return {
    rootPath: "E:\\CodeHome\\Demo",
    files,
    truncated: false,
    instructionFiles: []
  };
}

function projectFile(relativePath: string, size = 128): ProjectFile {
  return {
    relativePath,
    size
  };
}

function textFile(relativePath: string, content: string): ProjectTextFile {
  return {
    relativePath,
    content,
    size: content.length
  };
}

function contentFor(relativePath: string): string {
  if (relativePath === "README.md") {
    return "# Demo\n\nA local coding agent.";
  }

  if (relativePath === "src/main/index.ts") {
    return "export function main(): void {}";
  }

  return "";
}
