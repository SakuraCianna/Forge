// 本文件说明: 验证 Agent 项目提示词上下文会按预算选择关键文件
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatProjectScanContext,
  selectPromptProjectFiles
} from "../src/main/agentPlanService.js";
import type { ProjectFile, ProjectScanResult } from "../src/shared/projectTypes.js";

test("prompt project files prioritize foundation and entrypoint files", () => {
  const files = [
    projectFile("docs/notes.md"),
    projectFile("src/feature/deep-helper.ts"),
    projectFile("package.json"),
    projectFile("README.md"),
    projectFile("src/main/index.ts")
  ];

  const selectedFiles = selectPromptProjectFiles(files, {
    contextBudget: 2_000,
    speed: "fast"
  });
  const selectedPaths = selectedFiles.map((file) => file.relativePath);

  assert.ok(selectedPaths.indexOf("package.json") < selectedPaths.indexOf("docs/notes.md"));
  assert.ok(selectedPaths.indexOf("src/main/index.ts") < selectedPaths.indexOf("docs/notes.md"));
});

test("prompt project context reports omitted files instead of implying absence", () => {
  const scan = createScanResult(
    Array.from({ length: 80 }, (_, index) =>
      projectFile(`src/features/feature-${String(index).padStart(2, "0")}/component.tsx`)
    )
  );

  const selectedFiles = selectPromptProjectFiles(scan.files, {
    contextBudget: 2_000,
    speed: "fast"
  });
  const context = formatProjectScanContext(scan, {
    contextBudget: 2_000,
    speed: "fast"
  });

  assert.ok(selectedFiles.length < scan.files.length);
  assert.match(context, /Selected indexed files \(\d+\/80, budgeted overview\)/u);
  assert.match(context, /indexed files are omitted from this prompt context/u);
  assert.match(context, /absence from this selected list is not proof a file does not exist/u);
});

function createScanResult(files: ProjectFile[]): ProjectScanResult {
  return {
    rootPath: "E:\\CodeHome\\LargeProject",
    files,
    truncated: true,
    instructionFiles: []
  };
}

function projectFile(relativePath: string): ProjectFile {
  return {
    relativePath,
    size: 128
  };
}
