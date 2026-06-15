// 本文件说明: 将 Built-in Tool 名称映射到现有主进程服务, 让 P0/P1 工具具备真实执行路径
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  cancelProjectCommand,
  listRunningProjectCommands,
  runProjectCommand,
  type CancelProjectCommandResult,
  type CommandResult,
  type RunProjectCommandOptions
} from "../commandRunner.js";
import type {
  BrowserConsoleInspectionRequest,
  BrowserPreviewTools,
  BrowserScreenshotRequest
} from "../browserPreviewTools.js";
import {
  getProjectGitStatus,
  commitProjectChanges,
  pushProjectBranch,
  createProjectWorktree
} from "../gitService.js";
import {
  deleteProjectFile,
  globProjectFiles,
  listProjectDirectory,
  previewProjectFile,
  previewProjectTextFileUpdate,
  readProjectTextFile,
  searchProjectTextFiles,
  writeProjectTextFile
} from "../projectFileService.js";
import { scanProjectFiles as scanProjectFilesDefault } from "../projectScanner.js";
import { searchWeb } from "../webSearchService.js";
import { assertProjectPathNotSensitive } from "../../shared/sensitiveProjectFiles.js";
import type { BuiltInToolExecutionContext } from "../../shared/builtInToolTypes.js";
import type { BuiltInToolExecutorMap } from "./builtInToolRegistry.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type OpenExternal = (url: string) => Promise<unknown> | unknown;
type ScanProjectFiles = typeof scanProjectFilesDefault;

export type BuiltInToolExecutorFactoryOptions = {
  browserTools?: BrowserPreviewTools;
  cancelCommand?: typeof cancelProjectCommand;
  fetcher?: Fetcher;
  listRunningCommands?: typeof listRunningProjectCommands;
  openExternal?: OpenExternal;
  runCommand?: typeof runProjectCommand;
  scanProjectFiles?: ScanProjectFiles;
};

export function createDefaultBuiltInToolExecutors({
  browserTools,
  cancelCommand = cancelProjectCommand,
  fetcher = fetch,
  listRunningCommands = listRunningProjectCommands,
  openExternal,
  runCommand = runProjectCommand,
  scanProjectFiles = scanProjectFilesDefault
}: BuiltInToolExecutorFactoryOptions = {}): BuiltInToolExecutorMap {
  return {
    applyEdit: (input, context) =>
      writeProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        nextContent: readRequiredText(input, "nextContent")
      }),
    applyPatch: (input, context) =>
      applyUnifiedDiffPatch(
        requireProjectRoot(input, context),
        readRequiredTextFromAny(input, ["patch", "diff"])
      ),
    copyFile: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const from = readRequiredString(input, "from");
      const to = readRequiredString(input, "to");
      const fromPath = resolveProjectRelativePath(projectRoot, from);
      const toPath = resolveProjectRelativePath(projectRoot, to);

      await mkdir(dirname(toPath), { recursive: true });
      await copyFile(fromPath, toPath);
      return {
        status: "ok",
        from,
        to
      };
    },
    createBranch: (input, context) =>
      runCommand(
        createCommandOptions(
          input,
          context,
          `git switch -c ${quoteCommandArgument(readRequiredString(input, "branch"))}`
        )
      ),
    createCommit: (input, context) =>
      commitProjectChanges({
        projectRoot: requireProjectRoot(input, context),
        message: readRequiredString(input, "message")
      }),
    createFile: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const absolutePath = resolveProjectRelativePath(projectRoot, relativePath);
      const existingStat = await stat(absolutePath).catch(() => null);

      if (existingStat) {
        throw new Error(`File already exists: ${relativePath}`);
      }

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, readRequiredText(input, "content"), "utf8");
      return readProjectTextFile({ projectRoot, relativePath });
    },
    createWorktree: (input, context) =>
      createProjectWorktree({
        projectRoot: requireProjectRoot(input, context),
        name: readRequiredString(input, "name")
      }),
    checkoutBranch: (input, context) =>
      runCommand(
        createCommandOptions(
          input,
          context,
          `git switch ${quoteCommandArgument(readRequiredString(input, "branch"))}`
        )
      ),
    deleteFile: (input, context) =>
      deleteProjectFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath")
      }),
    detectFileType: async (input, context) => {
      const preview = await previewProjectFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        maxBytes: readOptionalNumber(input, "maxBytes")
      });

      return {
        relativePath: preview.relativePath,
        kind: preview.kind,
        mediaType: preview.mediaType,
        size: preview.size,
        ...("reason" in preview ? { reason: preview.reason } : {})
      };
    },
    detectPackageManager: async (input, context) => detectPackageManager(requireProjectRoot(input, context)),
    fetchDocs: (input) => fetchDocs(input, fetcher),
    fetchUrl: (input) => fetchUrl(input, fetcher),
    findReferences: (input, context) =>
      searchProjectTextFiles({
        projectRoot: requireProjectRoot(input, context),
        query: readRequiredString(input, "query"),
        limit: readOptionalNumber(input, "limit")
      }),
    formatFile: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const file = await readProjectTextFile({ projectRoot, relativePath, maxBytes: 2_000_000 });

      return writeProjectTextFile({
        projectRoot,
        relativePath,
        nextContent: file.content.replace(/\s+$/u, "") + "\n"
      });
    },
    getContextBudget: async (input) => ({
      status: "ok",
      contextBudget: readOptionalNumber(input, "contextBudget") ?? null,
      usedTokens: readOptionalNumber(input, "usedTokens") ?? null
    }),
    getDiagnostics: async (input) => ({
      status: "ok",
      diagnostics: readOptionalString(input, "errorLog")
        ? parseErrorLogText(readOptionalString(input, "errorLog") ?? "")
        : []
    }),
    getEntrypoints: async (input, context) => {
      const project = await scanProjectFiles(requireProjectRoot(input, context));
      const entrypoints = project.files
        .map((file) => file.relativePath)
        .filter(isLikelyEntrypoint);

      return {
        entrypoints,
        truncated: project.truncated
      };
    },
    getDependencyGraph: (input, context) =>
      getDependencyGraph(
        requireProjectRoot(input, context),
        {
          includeExternal: readOptionalBoolean(input, "includeExternal") ?? false,
          limit: readOptionalNumber(input, "limit")
        },
        scanProjectFiles
      ),
    getFileSymbols: async (input, context) => {
      const file = await readProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        maxBytes: readOptionalNumber(input, "maxBytes") ?? 512_000
      });

      return {
        relativePath: file.relativePath,
        symbols: extractBasicSymbols(file.content)
      };
    },
    getGitDiff: async (input, context) => {
      const status = await getProjectGitStatus({ projectRoot: requireProjectRoot(input, context) });

      return {
        changes: status.changes,
        diff: status.changes.map((change) => change.diff).filter(Boolean).join("\n")
      };
    },
    getGitLog: (input, context) =>
      runCommand(
        createCommandOptions(
          input,
          context,
          `git log --oneline -n ${readOptionalNumber(input, "limit") ?? 20}`
        )
      ),
    getGitBlame: (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const startLine = readOptionalNumber(input, "startLine");
      const endLine = readOptionalNumber(input, "endLine") ?? startLine;
      const range = startLine ? `-L ${startLine}${endLine ? `,${endLine}` : ""} ` : "";

      resolveProjectRelativePath(projectRoot, relativePath);

      return runCommand(
        createCommandOptions(
          input,
          context,
          `git blame ${range}-- ${quoteCommandArgument(relativePath)}`
        )
      );
    },
    getGitStatus: (input, context) =>
      getProjectGitStatus({ projectRoot: requireProjectRoot(input, context) }),
    getProjectMetadata: (input, context) => getProjectMetadata(requireProjectRoot(input, context)),
    getProjectSummary: (input, context) =>
      getProjectSummary(requireProjectRoot(input, context), scanProjectFiles),
    getProjectTree: (input, context) =>
      scanProjectFiles(requireProjectRoot(input, context), {
        limit: readOptionalNumber(input, "limit")
      }),
    getRelatedFiles: (input, context) =>
      getRelatedFiles(
        requireProjectRoot(input, context),
        readRequiredString(input, "relativePath"),
        scanProjectFiles
      ),
    globFiles: (input, context) =>
      globProjectFiles({
        projectRoot: requireProjectRoot(input, context),
        pattern: readRequiredString(input, "pattern"),
        limit: readOptionalNumber(input, "limit")
      }),
    insertText: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const file = await readProjectTextFile({ projectRoot, relativePath, maxBytes: 2_000_000 });
      const index = readOptionalNumber(input, "index") ?? file.content.length;
      const nextContent =
        file.content.slice(0, index) + readRequiredText(input, "text") + file.content.slice(index);

      return previewProjectTextFileUpdate({ projectRoot, relativePath, nextContent });
    },
    installDependency: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const packageNames = readPackageNames(input);
      const packageManager = readOptionalString(input, "packageManager") ??
        String((await detectPackageManager(projectRoot)).packageManager);
      const dev = readOptionalBoolean(input, "dev") ?? false;
      const command = createInstallDependencyCommand(packageManager, packageNames, dev);

      return runCommand(createCommandOptions({ ...input, command }, context, command));
    },
    listFiles: (input, context) =>
      listProjectDirectory({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readOptionalString(input, "relativePath") ?? ".",
        limit: readOptionalNumber(input, "limit"),
        offset: readOptionalNumber(input, "offset")
      }),
    moveFile: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const from = readRequiredString(input, "from");
      const to = readRequiredString(input, "to");
      const fromPath = resolveProjectRelativePath(projectRoot, from);
      const toPath = resolveProjectRelativePath(projectRoot, to);

      await mkdir(dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
      return {
        status: "ok",
        from,
        to
      };
    },
    parseErrorLog: async (input) => ({
      status: "ok",
      diagnostics: parseErrorLogText(readRequiredString(input, "errorLog"))
    }),
    inspectPageConsole: (input) => inspectPageConsole(input, browserTools),
    openBrowserPreview: (input) => openBrowserPreview(input, openExternal),
    previewDiff: (input, context) =>
      previewProjectTextFileUpdate({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        nextContent: readRequiredText(input, "nextContent")
      }),
    proposeEdit: (input, context) =>
      previewProjectTextFileUpdate({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        nextContent: readRequiredText(input, "nextContent")
      }),
    readFile: (input, context) =>
      readProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        maxBytes: readOptionalNumber(input, "maxBytes")
      }),
    readFileChunk: async (input, context) => {
      const file = await readProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        maxBytes: readOptionalNumber(input, "maxBytes") ?? 2_000_000
      });
      const startLine = Math.max(1, readOptionalNumber(input, "startLine") ?? 1);
      const lineCount = Math.max(1, readOptionalNumber(input, "lineCount") ?? 120);
      const lines = file.content.split(/\r?\n/u);

      return {
        relativePath: file.relativePath,
        startLine,
        endLine: Math.min(lines.length, startLine + lineCount - 1),
        content: lines.slice(startLine - 1, startLine - 1 + lineCount).join("\n"),
        truncated: startLine + lineCount - 1 < lines.length
      };
    },
    readManyFiles: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePaths = readRequiredStringArray(input, "relativePaths").slice(0, 20);
      const maxBytesPerFile = readOptionalNumberFromAny(input, ["maxBytesPerFile", "maxBytes"]);

      return {
        files: await Promise.all(
          relativePaths.map((relativePath) =>
            readProjectTextFile({
              projectRoot,
              relativePath,
              maxBytes: maxBytesPerFile
            })
          )
        )
      };
    },
    readProjectMemory: (input, context) => readProjectMemoryFile(requireProjectRoot(input, context)),
    readProjectInstructions: async (input, context) => {
      const project = await scanProjectFiles(requireProjectRoot(input, context));

      return {
        instructionFiles: project.instructionFiles ?? []
      };
    },
    revertFile: (input, context) =>
      writeProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readRequiredString(input, "relativePath"),
        nextContent: readRequiredTextFromAny(input, ["previousContent", "content"])
      }),
    writeProjectMemory: (input, context) =>
      writeProjectMemoryFile(requireProjectRoot(input, context), {
        content: readRequiredText(input, "content"),
        id: readOptionalString(input, "id") ?? undefined,
        tags: readOptionalStringArray(input, "tags")
      }),
    replaceText: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const file = await readProjectTextFile({ projectRoot, relativePath, maxBytes: 2_000_000 });
      const search = readRequiredString(input, "search");

      if (!file.content.includes(search)) {
        throw new Error("Search text was not found");
      }

      return previewProjectTextFileUpdate({
        projectRoot,
        relativePath,
        nextContent: file.content.replace(search, readRequiredText(input, "replace"))
      });
    },
    revertChanges: (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePaths = readOptionalStringArray(input, "relativePaths");
      const scope = readOptionalString(input, "scope");

      if (relativePaths && relativePaths.length > 0) {
        for (const relativePath of relativePaths) {
          resolveProjectRelativePath(projectRoot, relativePath);
        }

        return runCommand(
          createCommandOptions(
            input,
            context,
            `git restore --worktree --staged -- ${relativePaths.map(quoteCommandArgument).join(" ")}`
          )
        );
      }

      if (scope === "all") {
        return runCommand(createCommandOptions(input, context, "git restore --worktree --staged ."));
      }

      throw new Error("revertChanges requires relativePaths or scope=all");
    },
    runBuild: (input, context) => runValidationScript(input, context, runCommand, "build"),
    runCommand: (input, context) =>
      runCommand(createCommandOptions(input, context, readRequiredString(input, "command"))),
    runLint: (input, context) => runValidationScript(input, context, runCommand, "lint"),
    listRunningCommands: async () => {
      const commands = listRunningCommands();

      return {
        status: "ok",
        commands,
        count: commands.length
      };
    },
    runPackageScript: (input, context) =>
      runValidationScript(input, context, runCommand, readRequiredString(input, "script")),
    runTargetedTest: (input, context) => {
      const explicitCommand = readOptionalString(input, "command");

      if (explicitCommand) {
        return runCommand(createCommandOptions(input, context, explicitCommand));
      }

      return runTargetedTestCommand(input, context, runCommand);
    },
    runTests: (input, context) => runValidationScript(input, context, runCommand, "test"),
    runTypecheck: (input, context) => runValidationScript(input, context, runCommand, "typecheck"),
    searchDiagnostics: (input, context) =>
      searchDiagnosticsInProject(requireProjectRoot(input, context), input),
    searchRegex: (input, context) =>
      searchRegexInProject(
        requireProjectRoot(input, context),
        readRequiredString(input, "pattern"),
        scanProjectFiles
      ),
    searchSemantic: (input, context) =>
      searchSemanticInProject(requireProjectRoot(input, context), input, scanProjectFiles),
    searchMemory: (input, context) =>
      searchProjectMemoryFile(requireProjectRoot(input, context), readRequiredString(input, "query")),
    searchText: (input, context) =>
      searchProjectTextFiles({
        projectRoot: requireProjectRoot(input, context),
        query: readRequiredString(input, "query"),
        limit: readOptionalNumber(input, "limit")
      }),
    deleteMemory: (input, context) =>
      deleteProjectMemoryEntry(requireProjectRoot(input, context), readRequiredString(input, "id")),
    createProjectInstructions: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readOptionalString(input, "relativePath") ?? "AGENTS.md";
      const absolutePath = resolveProjectRelativePath(projectRoot, relativePath);
      const existingStat = await stat(absolutePath).catch(() => null);

      if (existingStat) {
        throw new Error(`Project instruction file already exists: ${relativePath}`);
      }

      return writeProjectTextFile({
        projectRoot,
        relativePath,
        nextContent: readRequiredText(input, "content")
      });
    },
    updateProjectInstructions: (input, context) =>
      writeProjectTextFile({
        projectRoot: requireProjectRoot(input, context),
        relativePath: readOptionalString(input, "relativePath") ?? "AGENTS.md",
        nextContent: readRequiredText(input, "content")
      }),
    statFile: async (input, context) => {
      const projectRoot = requireProjectRoot(input, context);
      const relativePath = readRequiredString(input, "relativePath");
      const fileStat = await stat(resolveProjectRelativePath(projectRoot, relativePath));

      return {
        relativePath,
        size: fileStat.size,
        modifiedAtMs: fileStat.mtimeMs,
        isDirectory: fileStat.isDirectory(),
        isFile: fileStat.isFile()
      };
    },
    stopCommand: async (input): Promise<CancelProjectCommandResult> =>
      cancelCommand({ runId: readRequiredString(input, "runId") }),
    suggestValidationPlan: (input, context) =>
      suggestValidationPlan(requireProjectRoot(input, context), input),
    summarizeContext: async (input) => ({
      status: "ok",
      summary: readRequiredText(input, "content").slice(
        0,
        readOptionalNumber(input, "maxChars") ?? 4_000
      )
    }),
    takeScreenshot: (input) => takeScreenshot(input, browserTools),
    gitPush: (input, context) =>
      pushProjectBranch({
        projectRoot: requireProjectRoot(input, context),
        branch: readOptionalString(input, "branch") ?? undefined,
        remote: readOptionalString(input, "remote") ?? undefined
      }),
    webSearch: (input) =>
      searchWeb(
        {
          query: readRequiredString(input, "query"),
          limit: readOptionalNumber(input, "limit")
        },
        { fetcher }
      )
  };
}

async function getProjectSummary(
  projectRoot: string,
  scanProjectFiles: ScanProjectFiles
): Promise<Record<string, unknown>> {
  const project = await scanProjectFiles(projectRoot, { limit: 2_000 });
  const packageJson = await readJsonProjectFile(projectRoot, "package.json");
  const topLevelDirectories = Array.from(
    new Set(
      project.files
        .map((file) => file.relativePath.split("/")[0])
        .filter((part) => part && !part.includes("."))
    )
  ).slice(0, 40);

  return {
    rootPath: project.rootPath,
    fileCount: project.files.length,
    truncated: project.truncated,
    packageName: typeof packageJson?.name === "string" ? packageJson.name : null,
    packageManager: await detectPackageManager(projectRoot),
    topLevelDirectories,
    instructionFiles: (project.instructionFiles ?? []).map((file) => file.relativePath)
  };
}

async function getProjectMetadata(projectRoot: string): Promise<Record<string, unknown>> {
  const metadataFiles = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "electron.vite.config.ts"
  ];
  const files = await Promise.all(
    metadataFiles.map(async (relativePath) => {
      const content = await readCachedProjectTextContent(projectRoot, relativePath, 200_000);

      return content === null
        ? null
        : {
            relativePath,
            content: content.slice(0, 20_000),
            truncated: content.length > 20_000
          };
    })
  );

  return {
    packageManager: await detectPackageManager(projectRoot),
    files: files.filter(Boolean)
  };
}

async function getRelatedFiles(
  projectRoot: string,
  relativePath: string,
  scanProjectFiles: ScanProjectFiles
): Promise<Record<string, unknown>> {
  const project = await scanProjectFiles(projectRoot, { limit: 5_000 });
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;
  const stem = fileName.replace(/\.[^.]+$/u, "");
  const directory = normalizedPath.includes("/")
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
    : "";

  return {
    relativePath: normalizedPath,
    relatedFiles: project.files
      .map((file) => file.relativePath)
      .filter(
        (candidate) =>
          candidate !== normalizedPath &&
          (candidate.startsWith(`${directory}/`) || candidate.includes(stem))
      )
      .slice(0, 80)
  };
}

async function detectPackageManager(projectRoot: string): Promise<Record<string, unknown>> {
  const lockFiles = [
    ["pnpm", "pnpm-lock.yaml"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lockb"],
    ["npm", "package-lock.json"]
  ] as const;

  for (const [manager, lockFile] of lockFiles) {
    if (await stat(resolve(projectRoot, lockFile)).then(() => true).catch(() => false)) {
      return {
        packageManager: manager,
        lockFile
      };
    }
  }

  return {
    packageManager: "npm",
    lockFile: null
  };
}

type UnifiedPatchLine = {
  kind: "add" | "context" | "remove";
  text: string;
};

type UnifiedPatchHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: UnifiedPatchLine[];
};

type UnifiedFilePatch = {
  oldPath: string;
  newPath: string;
  hunks: UnifiedPatchHunk[];
};

type ProjectMemoryEntry = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

type SemanticSearchTerm = {
  value: string;
  source: "alias" | "query";
  weight: number;
};

type SemanticSearchMatch = {
  relativePath: string;
  lineNumber: number;
  score: number;
  preview: string;
  matchedTerms: string[];
  reason: string;
};

const projectMemoryRelativePath = "MEMORY.md";
const legacyProjectMemoryRelativePath = ".forge/project-memory.json";
const projectMemoryManagedStartMarker = "<!-- forge-memory:managed:start -->";
const projectMemoryManagedEndMarker = "<!-- forge-memory:managed:end -->";
const projectMemoryEntryPrefix = "<!-- forge-memory-entry";
const maxProjectMemoryContentChars = 1_000;

async function applyUnifiedDiffPatch(
  projectRoot: string,
  patchText: string
): Promise<Record<string, unknown>> {
  const filePatches = parseUnifiedDiffPatch(patchText);

  if (filePatches.length === 0) {
    throw new Error("Patch does not contain any unified diff file hunks");
  }

  const files = [];

  for (const filePatch of filePatches) {
    if (filePatch.newPath === "/dev/null") {
      throw new Error("Patch deletion hunks are not supported by applyPatch; use deleteFile with critical confirmation");
    }

    const relativePath = filePatch.newPath || filePatch.oldPath;
    const currentContent = filePatch.oldPath === "/dev/null"
      ? ""
      : (await readProjectTextFile({
          projectRoot,
          relativePath,
          maxBytes: 5_000_000
        })).content;
    const nextContent = applyUnifiedFilePatch(currentContent, filePatch);
    const writtenFile = await writeProjectTextFile({
      projectRoot,
      relativePath,
      nextContent
    });

    files.push({
      relativePath: writtenFile.relativePath,
      size: writtenFile.size,
      hunks: filePatch.hunks.length
    });
  }

  return {
    status: "ok",
    files
  };
}

function parseUnifiedDiffPatch(patchText: string): UnifiedFilePatch[] {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const filePatches: UnifiedFilePatch[] = [];
  let currentPatch: UnifiedFilePatch | null = null;
  let currentHunk: UnifiedPatchHunk | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushCurrentPatch();
      currentPatch = { oldPath: "", newPath: "", hunks: [] };
      currentHunk = null;
      continue;
    }

    if (line.startsWith("--- ")) {
      if (!currentPatch) {
        currentPatch = { oldPath: "", newPath: "", hunks: [] };
      }

      currentPatch.oldPath = normalizePatchPath(line.slice(4));
      currentHunk = null;
      continue;
    }

    if (line.startsWith("+++ ")) {
      if (!currentPatch) {
        throw new Error("Patch has a new file header before an old file header");
      }

      currentPatch.newPath = normalizePatchPath(line.slice(4));
      currentHunk = null;
      continue;
    }

    const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);

    if (hunkMatch) {
      if (!currentPatch) {
        throw new Error("Patch hunk appears before a file header");
      }

      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        oldCount: Number(hunkMatch[2] ?? "1"),
        newStart: Number(hunkMatch[3]),
        newCount: Number(hunkMatch[4] ?? "1"),
        lines: []
      };
      currentPatch.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk || line.startsWith("\\ No newline")) {
      continue;
    }

    if (line.startsWith(" ")) {
      currentHunk.lines.push({ kind: "context", text: line.slice(1) });
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.lines.push({ kind: "add", text: line.slice(1) });
      continue;
    }

    if (line.startsWith("-")) {
      currentHunk.lines.push({ kind: "remove", text: line.slice(1) });
    }
  }

  pushCurrentPatch();

  return filePatches;

  function pushCurrentPatch(): void {
    if (!currentPatch) {
      return;
    }

    if (currentPatch.hunks.length > 0 && currentPatch.newPath) {
      filePatches.push(currentPatch);
    }
  }
}

function normalizePatchPath(rawPath: string): string {
  const withoutMetadata = rawPath.split("\t")[0]?.trim() ?? "";
  const unquoted = withoutMetadata.replace(/^"|"$/gu, "");

  if (unquoted === "/dev/null") {
    return unquoted;
  }

  return unquoted.replace(/^[ab]\//u, "");
}

function applyUnifiedFilePatch(content: string, patch: UnifiedFilePatch): string {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const originalLines = normalizedContent.length === 0
    ? []
    : normalizedContent.replace(/\n$/u, "").split("\n");
  const nextLines: string[] = [];
  let cursor = 0;

  for (const hunk of patch.hunks) {
    const startIndex = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;

    if (startIndex < cursor) {
      throw new Error(`Patch hunks overlap for ${patch.newPath}`);
    }

    nextLines.push(...originalLines.slice(cursor, startIndex));

    let readIndex = startIndex;

    for (const line of hunk.lines) {
      if (line.kind === "add") {
        nextLines.push(line.text);
        continue;
      }

      const currentLine = originalLines[readIndex];

      if (currentLine !== line.text) {
        throw new Error(`Patch context mismatch in ${patch.newPath} near line ${readIndex + 1}`);
      }

      if (line.kind === "context") {
        nextLines.push(currentLine);
      }

      readIndex += 1;
    }

    cursor = readIndex;
  }

  nextLines.push(...originalLines.slice(cursor));

  return nextLines.length === 0 ? "" : `${nextLines.join("\n")}\n`;
}

async function readProjectMemoryFile(projectRoot: string): Promise<Record<string, unknown>> {
  const filePath = resolveProjectRelativePath(projectRoot, projectMemoryRelativePath);
  const rawContent = await readOptionalTextFile(filePath);

  if (rawContent === null) {
    const legacyEntries = await readLegacyProjectMemoryEntries(projectRoot);

    return {
      status: "ok",
      relativePath: projectMemoryRelativePath,
      ...(legacyEntries.length > 0 ? { legacyRelativePath: legacyProjectMemoryRelativePath } : {}),
      entries: legacyEntries
    };
  }

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    entries: parseProjectMemoryMarkdown(rawContent)
  };
}

async function writeProjectMemoryFile(
  projectRoot: string,
  {
    content,
    id,
    tags = []
  }: {
    content: string;
    id?: string;
    tags?: string[];
  }
): Promise<Record<string, unknown>> {
  const memory = await readProjectMemoryFile(projectRoot);
  const currentEntries = Array.isArray(memory.entries)
    ? memory.entries.filter(isProjectMemoryEntry)
    : [];
  const now = new Date().toISOString();
  const entryId = normalizeProjectMemoryEntryId(id);
  const normalizedContent = normalizeProjectMemoryContent(content);
  const normalizedTags = normalizeProjectMemoryTags(tags);
  const existingEntry = currentEntries.find((entry) => entry.id === entryId);
  const nextEntry: ProjectMemoryEntry = {
    id: entryId,
    content: normalizedContent,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    tags: normalizedTags
  };
  const entries = existingEntry
    ? currentEntries.map((entry) => (entry.id === entryId ? nextEntry : entry))
    : [...currentEntries, nextEntry];

  await writeProjectMemoryEntries(projectRoot, entries);

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    entry: nextEntry,
    entries
  };
}

async function searchProjectMemoryFile(
  projectRoot: string,
  query: string
): Promise<Record<string, unknown>> {
  const memory = await readProjectMemoryFile(projectRoot);
  const entries = Array.isArray(memory.entries)
    ? memory.entries.filter(isProjectMemoryEntry)
    : [];
  const tokens = tokenizeSearchText(query);
  const matches = entries
    .map((entry) => ({
      entry,
      score: tokens.reduce(
        (score, token) => score + (entry.content.toLocaleLowerCase().includes(token) ? 1 : 0),
        0
      )
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((match) => match.entry);

  return {
    status: "ok",
    query,
    matches
  };
}

async function deleteProjectMemoryEntry(
  projectRoot: string,
  id: string
): Promise<Record<string, unknown>> {
  const memory = await readProjectMemoryFile(projectRoot);
  const entries = Array.isArray(memory.entries)
    ? memory.entries.filter(isProjectMemoryEntry)
    : [];
  const nextEntries = entries.filter((entry) => entry.id !== id);

  if (nextEntries.length === entries.length) {
    throw new Error(`Project memory entry was not found: ${id}`);
  }

  await writeProjectMemoryEntries(projectRoot, nextEntries);

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    deletedId: id,
    entries: nextEntries
  };
}

async function writeProjectMemoryEntries(
  projectRoot: string,
  entries: ProjectMemoryEntry[]
): Promise<void> {
  const filePath = resolveProjectRelativePath(projectRoot, projectMemoryRelativePath);
  const currentContent = await readOptionalTextFile(filePath);
  const nextContent = renderProjectMemoryMarkdown(currentContent, entries);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, nextContent, "utf8");
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch((error: unknown) => {
    if (isNodeErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  });
}

async function readLegacyProjectMemoryEntries(projectRoot: string): Promise<ProjectMemoryEntry[]> {
  const legacyFilePath = resolveProjectRelativePath(projectRoot, legacyProjectMemoryRelativePath);
  const rawContent = await readOptionalTextFile(legacyFilePath);

  if (rawContent === null) {
    return [];
  }

  const parsed = JSON.parse(rawContent) as { entries?: unknown };

  return Array.isArray(parsed.entries)
    ? parsed.entries.filter(isProjectMemoryEntry)
    : [];
}

function parseProjectMemoryMarkdown(content: string): ProjectMemoryEntry[] {
  const managedContent = readProjectMemoryManagedContent(content);

  if (!managedContent) {
    return [];
  }

  return managedContent
    .split(/\r?\n/u)
    .map((line) => parseProjectMemoryEntryLine(line.trim()))
    .filter((entry): entry is ProjectMemoryEntry => Boolean(entry));
}

function readProjectMemoryManagedContent(content: string): string | null {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const startIndex = normalizedContent.indexOf(projectMemoryManagedStartMarker);
  const endIndex = normalizedContent.indexOf(projectMemoryManagedEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return normalizedContent.slice(
    startIndex + projectMemoryManagedStartMarker.length,
    endIndex
  );
}

function parseProjectMemoryEntryLine(line: string): ProjectMemoryEntry | null {
  if (!line.startsWith(`- ${projectMemoryEntryPrefix}`)) {
    return null;
  }

  const match =
    /^- <!-- forge-memory-entry id="([^"]+)" createdAt="([^"]+)" updatedAt="([^"]+)" tags="([^"]*)" --> (.+)$/u.exec(
      line
    );

  if (!match) {
    return null;
  }

  return {
    id: match[1],
    createdAt: match[2],
    updatedAt: match[3],
    tags: match[4].split(",").map((tag) => tag.trim()).filter(Boolean),
    content: match[5].trim()
  };
}

function renderProjectMemoryMarkdown(
  currentContent: string | null,
  entries: ProjectMemoryEntry[]
): string {
  const managedBlock = renderProjectMemoryManagedBlock(entries);

  if (!currentContent?.trim()) {
    return `${renderProjectMemoryDefaultHeader()}\n\n${managedBlock}\n`;
  }

  const normalizedContent = currentContent.replace(/\r\n/g, "\n").trimEnd();
  const startIndex = normalizedContent.indexOf(projectMemoryManagedStartMarker);
  const endIndex = normalizedContent.indexOf(projectMemoryManagedEndMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = normalizedContent.slice(0, startIndex).trimEnd();
    const after = normalizedContent
      .slice(endIndex + projectMemoryManagedEndMarker.length)
      .trimStart();

    return [
      before,
      managedBlock,
      after
    ].filter(Boolean).join("\n\n") + "\n";
  }

  return `${normalizedContent}\n\n${managedBlock}\n`;
}

function renderProjectMemoryDefaultHeader(): string {
  return [
    "# MEMORY.md",
    "",
    "Forge reads this file as project memory when scanning the workspace.",
    "Forge may update the managed section silently during agent work. Do not store secrets, tokens, cookies, private keys, or production credentials here."
  ].join("\n");
}

function renderProjectMemoryManagedBlock(entries: ProjectMemoryEntry[]): string {
  const lines = [
    projectMemoryManagedStartMarker,
    "## Forge Managed Memories",
    "",
    "Forge updates this section automatically. Edit or delete entries when they are wrong.",
    ""
  ];

  if (entries.length === 0) {
    lines.push("_No managed memories yet._");
  } else {
    lines.push(...entries.map(renderProjectMemoryEntryLine));
  }

  lines.push("", projectMemoryManagedEndMarker);

  return lines.join("\n");
}

function renderProjectMemoryEntryLine(entry: ProjectMemoryEntry): string {
  const tags = normalizeProjectMemoryTags(entry.tags).join(",");

  return [
    "-",
    `<!-- forge-memory-entry id="${entry.id}" createdAt="${entry.createdAt}" updatedAt="${entry.updatedAt}" tags="${tags}" -->`,
    entry.content
  ].join(" ");
}

function normalizeProjectMemoryEntryId(id: string | undefined): string {
  const fallbackId = `memory-${Date.now().toString(36)}`;
  const normalizedId = (id ?? fallbackId)
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);

  return normalizedId || fallbackId;
}

function normalizeProjectMemoryContent(content: string): string {
  const normalizedContent = redactSensitiveProjectMemoryContent(content)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxProjectMemoryContentChars);

  if (!normalizedContent) {
    throw new Error("Project memory content must not be empty");
  }

  return normalizedContent;
}

function normalizeProjectMemoryTags(tags: string[]): string[] {
  const seenTags = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40);

    if (!normalizedTag || seenTags.has(normalizedTag)) {
      continue;
    }

    seenTags.add(normalizedTag);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags.slice(0, 12);
}

function redactSensitiveProjectMemoryContent(content: string): string {
  return content
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
      "[redacted private key]"
    )
    .replace(
      /\b(api[_-]?key|token|secret|password|cookie)\b(\s*[:=]\s*)(["']?)[^\s"'`,;]+/giu,
      (_match, key: string, separator: string, quote: string) =>
        `${key}${separator}${quote}[redacted]${quote}`
    )
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]?)-[A-Za-z0-9_-]{8,}\b/gu, "[redacted token]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[redacted aws access key]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/giu, "Bearer [redacted]");
}

function tokenizeSearchText(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function readPackageNames(input: Record<string, unknown>): string[] {
  const packageName = readOptionalString(input, "packageName");
  const packageNames = packageName ? [packageName] : readRequiredStringArray(input, "packages");

  for (const name of packageNames) {
    assertSafePackageName(name);
  }

  return packageNames;
}

function createInstallDependencyCommand(
  packageManager: string,
  packageNames: string[],
  dev: boolean
): string {
  const packages = packageNames.map(quoteCommandArgument).join(" ");

  if (packageManager === "pnpm") {
    return `pnpm add ${dev ? "-D " : ""}${packages}`;
  }

  if (packageManager === "yarn") {
    return `yarn add ${dev ? "--dev " : ""}${packages}`;
  }

  if (packageManager === "bun") {
    return `bun add ${dev ? "-d " : ""}${packages}`;
  }

  return `npm install ${dev ? "--save-dev " : ""}${packages}`;
}

async function runTargetedTestCommand(
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext,
  runCommand: typeof runProjectCommand
): Promise<CommandResult> {
  const projectRoot = requireProjectRoot(input, context);
  const packageManager = (await detectPackageManager(projectRoot)).packageManager;
  const script = readOptionalString(input, "script") ?? "test";
  const target = readOptionalString(input, "target") ?? readOptionalString(input, "testPath");
  const commandPrefix =
    packageManager === "npm" ? `npm run ${script}` : `${String(packageManager)} run ${script}`;
  const command = target
    ? `${commandPrefix} -- ${quoteCommandArgument(target)}`
    : commandPrefix;

  return runCommand(createCommandOptions({ ...input, command }, context, command));
}

function assertSafePackageName(name: string): void {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu.test(name)) {
    throw new Error(`Dependency name is not safe to install: ${name}`);
  }
}

function quoteCommandArgument(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

async function runValidationScript(
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext,
  runCommand: typeof runProjectCommand,
  script: string
): Promise<CommandResult> {
  const projectRoot = requireProjectRoot(input, context);
  const packageManager = (await detectPackageManager(projectRoot)).packageManager;
  const command =
    packageManager === "npm" ? `npm run ${script}` : `${String(packageManager)} run ${script}`;

  return runCommand(createCommandOptions(input, context, command));
}

async function readJsonProjectFile(
  projectRoot: string,
  relativePath: string
): Promise<Record<string, unknown> | null> {
  try {
    const content = await readCachedProjectTextContent(projectRoot, relativePath, 256_000);

    return content === null ? null : JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readCachedProjectTextContent(
  projectRoot: string,
  relativePath: string,
  maxBytes: number
): Promise<string | null> {
  try {
    const file = await readProjectTextFile({
      projectRoot,
      relativePath,
      maxBytes
    });

    return file.content;
  } catch {
    return null;
  }
}

async function fetchUrl(
  input: Record<string, unknown>,
  fetcher: Fetcher
): Promise<Record<string, unknown>> {
  const url = normalizeFetchUrl(readRequiredString(input, "url"));
  const maxChars = clampContentLimit(readOptionalNumber(input, "maxChars"));
  const response = await fetcher(url, {
    headers: {
      accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.5",
      "user-agent": "Forge/0.1 local coding agent"
    },
    signal: createTimeoutSignal(readOptionalNumber(input, "timeoutMs") ?? 10000)
  });
  const contentType = response.headers.get("content-type") ?? "";
  const rawContent = await response.text();
  const content = contentType.includes("html")
    ? htmlToReadableText(rawContent)
    : rawContent.replace(/\s+/gu, " ").trim();

  return {
    status: response.ok ? "ok" : "http_error",
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    contentType,
    title: contentType.includes("html") ? extractHtmlTitle(rawContent) : null,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars
  };
}

async function fetchDocs(
  input: Record<string, unknown>,
  fetcher: Fetcher
): Promise<Record<string, unknown>> {
  const explicitUrl = readOptionalString(input, "url");

  if (explicitUrl) {
    return {
      ...(await fetchUrl({ ...input, url: explicitUrl }, fetcher)),
      source: "explicit-url"
    };
  }

  const topic = (
    readOptionalString(input, "topic") ??
    readOptionalString(input, "library") ??
    readOptionalString(input, "query") ??
    ""
  ).toLocaleLowerCase();
  const docsUrl = resolveOfficialDocsUrl(topic);

  if (!docsUrl) {
    return {
      status: "no_match",
      topic,
      message: "No official documentation mapping is available for this topic.",
      suggestedNextStep: "Use webSearch to find the official documentation URL, then call fetchDocs with url."
    };
  }

  return {
    ...(await fetchUrl({ ...input, url: docsUrl }, fetcher)),
    source: "official-docs",
    topic
  };
}

async function openBrowserPreview(
  input: Record<string, unknown>,
  openExternal: OpenExternal | undefined
): Promise<Record<string, unknown>> {
  const url = normalizeLocalBrowserToolUrl(readRequiredString(input, "url"), "openBrowserPreview");

  if (!openExternal) {
    return {
      status: "unavailable",
      url,
      opened: false,
      message: "Browser preview is unavailable because no external opener was configured."
    };
  }

  await openExternal(url);

  return {
    status: "ok",
    url,
    opened: true
  };
}

async function takeScreenshot(
  input: Record<string, unknown>,
  browserTools: BrowserPreviewTools | undefined
): Promise<Record<string, unknown>> {
  const request: BrowserScreenshotRequest = {
    url: normalizeLocalBrowserToolUrl(readRequiredString(input, "url"), "takeScreenshot"),
    width: clampBrowserNumber(readOptionalNumber(input, "width"), 320, 1920, 1280),
    height: clampBrowserNumber(readOptionalNumber(input, "height"), 240, 2000, 800),
    timeoutMs: clampBrowserNumber(readOptionalNumber(input, "timeoutMs"), 1_000, 30_000, 10_000),
    waitMs: clampBrowserNumber(readOptionalNumber(input, "waitMs"), 0, 5_000, 300),
    fullPage: readOptionalBoolean(input, "fullPage") ?? false,
    includeDataUrl: readOptionalBoolean(input, "includeDataUrl") ?? false,
    maxInlineBytes: clampBrowserNumber(readOptionalNumber(input, "maxInlineBytes"), 1_000, 250_000, 80_000)
  };

  if (!browserTools) {
    return {
      status: "unavailable",
      url: request.url,
      message: "Browser screenshot is unavailable because no Electron browser tool provider was configured."
    };
  }

  return browserTools.takeScreenshot(request);
}

async function inspectPageConsole(
  input: Record<string, unknown>,
  browserTools: BrowserPreviewTools | undefined
): Promise<Record<string, unknown>> {
  const request: BrowserConsoleInspectionRequest = {
    url: normalizeLocalBrowserToolUrl(readRequiredString(input, "url"), "inspectPageConsole"),
    width: clampBrowserNumber(readOptionalNumber(input, "width"), 320, 1920, 1280),
    height: clampBrowserNumber(readOptionalNumber(input, "height"), 240, 2000, 800),
    timeoutMs: clampBrowserNumber(readOptionalNumber(input, "timeoutMs"), 1_000, 30_000, 10_000),
    waitMs: clampBrowserNumber(readOptionalNumber(input, "waitMs"), 0, 5_000, 500),
    limit: clampBrowserNumber(readOptionalNumber(input, "limit"), 1, 200, 80)
  };

  if (!browserTools) {
    return {
      status: "unavailable",
      url: request.url,
      message: "Browser console inspection is unavailable because no Electron browser tool provider was configured."
    };
  }

  return browserTools.inspectPageConsole(request);
}

async function getDependencyGraph(
  projectRoot: string,
  {
    includeExternal,
    limit = 300
  }: {
    includeExternal: boolean;
    limit?: number;
  },
  scanProjectFiles: ScanProjectFiles
): Promise<Record<string, unknown>> {
  const project = await scanProjectFiles(projectRoot, { limit: 5_000 });
  const allRelativePaths = project.files.map((file) => file.relativePath);
  const sourceFiles = project.files
    .filter((file) => isDependencyGraphSourceFile(file.relativePath) && file.size <= 512_000)
    .slice(0, Math.max(1, limit));
  const edges = [];

  for (const file of sourceFiles) {
    const content = await readCachedProjectTextContent(projectRoot, file.relativePath, 512_000);

    if (!content || content.includes("\u0000")) {
      continue;
    }

    for (const dependency of extractDependencySpecifiers(content)) {
      const resolvedPath = resolveImportSpecifier(file.relativePath, dependency.specifier, allRelativePaths);
      const external = !dependency.specifier.startsWith(".");

      if (external && !includeExternal) {
        continue;
      }

      edges.push({
        from: file.relativePath,
        specifier: dependency.specifier,
        kind: dependency.kind,
        external,
        ...(resolvedPath ? { to: resolvedPath } : {})
      });

      if (edges.length >= limit) {
        return {
          status: "ok",
          filesAnalyzed: sourceFiles.length,
          edges,
          truncated: true
        };
      }
    }
  }

  return {
    status: "ok",
    filesAnalyzed: sourceFiles.length,
    edges,
    truncated: project.truncated || sourceFiles.length < project.files.filter((file) => isDependencyGraphSourceFile(file.relativePath)).length
  };
}

function normalizeFetchUrl(value: string): string {
  try {
    const url = new URL(value);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error("fetchUrl only supports plain http/https URLs without credentials");
    }

    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("fetchUrl")) {
      throw error;
    }

    throw new Error("url must be a valid http or https URL", { cause: error });
  }
}

function normalizeLocalBrowserToolUrl(value: string, toolName: string): string {
  const url = new URL(normalizeFetchUrl(value));
  const hostname = url.hostname.toLocaleLowerCase();
  const allowedLocalHosts = new Set(["0.0.0.0", "127.0.0.1", "::1", "[::1]", "localhost"]);

  if (!allowedLocalHosts.has(hostname)) {
    throw new Error(`${toolName} only supports local preview URLs`);
  }

  return url.toString();
}

function clampBrowserNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolveOfficialDocsUrl(topic: string): string | null {
  if (/\breact\b/u.test(topic)) {
    return "https://react.dev/reference/react";
  }

  if (/\belectron\b/u.test(topic)) {
    return "https://www.electronjs.org/docs/latest/";
  }

  if (/\bvite\b/u.test(topic)) {
    return "https://vite.dev/guide/";
  }

  if (/\btypescript\b|\bts\b/u.test(topic)) {
    return "https://www.typescriptlang.org/docs/";
  }

  if (/\bnode(?:\.js)?\b/u.test(topic)) {
    return "https://nodejs.org/api/";
  }

  return null;
}

function clampContentLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 6000;
  }

  return Math.min(20_000, Math.max(500, Math.round(value)));
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(Math.max(1000, timeoutMs))
    : undefined;
}

function extractHtmlTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1];

  return title ? decodeHtmlEntities(title).replace(/\s+/gu, " ").trim() : null;
}

function htmlToReadableText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
  )
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    const normalizedEntity = entity.toLocaleLowerCase();

    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);

      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);

      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[normalizedEntity] ?? match;
  });
}

async function searchRegexInProject(
  projectRoot: string,
  pattern: string,
  scanProjectFiles: ScanProjectFiles
): Promise<Record<string, unknown>> {
  const regex = new RegExp(pattern, "u");
  const project = await scanProjectFiles(projectRoot, { limit: 5_000 });
  const matches = [];

  for (const file of project.files) {
    if (file.size > 256_000) {
      continue;
    }

    const content = await readCachedProjectTextContent(projectRoot, file.relativePath, 256_000);

    if (!content || content.includes("\u0000")) {
      continue;
    }

    const lines = content.split(/\r?\n/u);

    for (const [index, line] of lines.entries()) {
      if (regex.test(line)) {
        matches.push({
          relativePath: file.relativePath,
          lineNumber: index + 1,
          preview: line.trim().slice(0, 240)
        });
      }

      if (matches.length >= 80) {
        return { pattern, matches, truncated: true };
      }
    }
  }

  return {
    pattern,
    matches,
    truncated: false
  };
}

async function searchSemanticInProject(
  projectRoot: string,
  input: Record<string, unknown>,
  scanProjectFiles: ScanProjectFiles
): Promise<Record<string, unknown>> {
  const query = readRequiredString(input, "query");
  const limit = clampSemanticSearchLimit(readOptionalNumber(input, "limit"));
  const maxFileBytes = clampSemanticMaxFileBytes(readOptionalNumber(input, "maxFileBytes"));
  const project = await scanProjectFiles(projectRoot, {
    limit: readOptionalNumber(input, "fileLimit") ?? 5_000
  });
  const terms = expandSemanticSearchTerms(query);
  const matches: SemanticSearchMatch[] = [];
  let scannedFiles = 0;
  let skippedLargeFiles = 0;

  if (terms.length === 0) {
    throw new Error("searchSemantic query must contain at least one searchable term");
  }

  for (const file of project.files) {
    if (file.size > maxFileBytes) {
      skippedLargeFiles += 1;
      continue;
    }

    const content = await readCachedProjectTextContent(projectRoot, file.relativePath, maxFileBytes);

    if (!content || content.includes("\u0000")) {
      continue;
    }

    scannedFiles += 1;
    const lines = content.split(/\r?\n/u);
    const pathScore = scoreSemanticText(file.relativePath, query, terms) * 1.4;
    const fileMatch = findBestSemanticFileMatch({
      lines,
      pathScore,
      query,
      relativePath: file.relativePath,
      terms
    });

    if (fileMatch) {
      matches.push(fileMatch);
    }
  }

  const sortedMatches = matches
    .sort((left, right) =>
      right.score - left.score ||
      left.relativePath.localeCompare(right.relativePath) ||
      left.lineNumber - right.lineNumber
    );

  return {
    status: "ok",
    mode: "local_semantic_fallback",
    query,
    terms: terms.map((term) => term.value).slice(0, 40),
    matches: sortedMatches.slice(0, limit),
    scannedFiles,
    skippedLargeFiles,
    truncated: project.truncated || sortedMatches.length > limit,
    limitations: "Local lexical heuristics only; no embedding model or external search was invoked."
  };
}

async function searchDiagnosticsInProject(
  projectRoot: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const errorLog = readOptionalString(input, "errorLog") ?? readOptionalString(input, "log") ?? "";
  const query = readOptionalString(input, "query");
  const limit = readOptionalNumber(input, "limit") ?? 40;
  const diagnostics = parseErrorLogText(errorLog);
  const terms = extractDiagnosticSearchTerms(query ? `${query}\n${errorLog}` : errorLog).slice(0, 8);
  const matches = [];
  const seenMatches = new Set<string>();

  for (const term of terms) {
    const result = await searchProjectTextFiles({
      projectRoot,
      query: term,
      limit: Math.max(5, Math.ceil(limit / Math.max(1, terms.length)))
    });

    for (const match of result.matches) {
      const key = `${match.relativePath}:${match.lineNumber}:${match.preview}`;

      if (seenMatches.has(key)) {
        continue;
      }

      seenMatches.add(key);
      matches.push({
        term,
        ...match
      });

      if (matches.length >= limit) {
        return {
          status: "ok",
          diagnostics,
          terms,
          matches,
          truncated: true
        };
      }
    }
  }

  return {
    status: "ok",
    diagnostics,
    terms,
    matches,
    truncated: false
  };
}

async function suggestValidationPlan(
  projectRoot: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const packageJson = await readJsonProjectFile(projectRoot, "package.json");
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
  const packageManager = String((await detectPackageManager(projectRoot)).packageManager);
  const runScriptPrefix = packageManager === "npm" ? "npm run" : `${packageManager} run`;
  const changedFiles = readOptionalStringArray(input, "changedFiles") ?? [];
  const recommendations = [];

  if (typeof scripts.typecheck === "string") {
    recommendations.push(validationRecommendation("runTypecheck", `${runScriptPrefix} typecheck`, "TypeScript/API surface changed or needs compile validation."));
  } else if (await projectFileExists(projectRoot, "tsconfig.json")) {
    recommendations.push(validationRecommendation("runCommand", "npx tsc --noEmit", "No typecheck script was found, but tsconfig.json exists."));
  }

  if (typeof scripts.lint === "string") {
    recommendations.push(validationRecommendation("runLint", `${runScriptPrefix} lint`, "Lint catches style and common correctness regressions."));
  }

  if (typeof scripts.build === "string") {
    recommendations.push(validationRecommendation("runBuild", `${runScriptPrefix} build`, "Build verifies bundling and production compile behavior."));
  }

  if (typeof scripts.test === "string") {
    recommendations.push(validationRecommendation("runTests", `${runScriptPrefix} test`, "Run tests after behavior changes or touched test-covered code."));
  }

  recommendations.push({
    toolName: "getGitStatus",
    command: "git status --short",
    reason: "Confirm the final changed-file set before reporting completion."
  });

  return {
    status: "ok",
    packageManager,
    changedFiles,
    recommendations
  };
}

function findBestSemanticFileMatch({
  lines,
  pathScore,
  query,
  relativePath,
  terms
}: {
  lines: string[];
  pathScore: number;
  query: string;
  relativePath: string;
  terms: SemanticSearchTerm[];
}): SemanticSearchMatch | null {
  let bestMatch: SemanticSearchMatch | null = null;

  for (const [lineIndex, line] of lines.entries()) {
    const lineScore = scoreSemanticText(line, query, terms);

    if (lineScore <= 0) {
      continue;
    }

    const score = roundSemanticScore(lineScore + pathScore);
    const match = {
      relativePath,
      lineNumber: lineIndex + 1,
      score,
      preview: createSemanticPreview(lines, lineIndex),
      matchedTerms: collectMatchedSemanticTerms(`${relativePath}\n${line}`, query, terms),
      reason: pathScore > 0 ? "path-and-content-match" : "content-match"
    };

    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = match;
    }
  }

  if (bestMatch || pathScore <= 0) {
    return bestMatch;
  }

  return {
    relativePath,
    lineNumber: findFirstNonBlankLine(lines) + 1,
    score: roundSemanticScore(pathScore),
    preview: createSemanticPreview(lines, findFirstNonBlankLine(lines)),
    matchedTerms: collectMatchedSemanticTerms(relativePath, query, terms),
    reason: "path-match"
  };
}

function expandSemanticSearchTerms(query: string): SemanticSearchTerm[] {
  const terms = new Map<string, SemanticSearchTerm>();
  const normalizedQuery = normalizeSemanticText(query);
  const addTerm = (value: string, source: SemanticSearchTerm["source"], weight: number): void => {
    const normalizedValue = normalizeSemanticText(value);

    if (normalizedValue.length < 2 && !/[\u4e00-\u9fff]/u.test(normalizedValue)) {
      return;
    }

    const existing = terms.get(normalizedValue);

    if (!existing || existing.weight < weight) {
      terms.set(normalizedValue, {
        value: normalizedValue,
        source,
        weight
      });
    }
  };

  for (const token of splitSemanticTokens(query)) {
    addTerm(token, "query", 4);
  }

  if (normalizedQuery.length >= 3) {
    addTerm(normalizedQuery, "query", 6);
  }

  for (const group of semanticAliasGroups) {
    if (group.triggers.some((trigger) => normalizedQuery.includes(trigger))) {
      for (const alias of group.aliases) {
        addTerm(alias, "alias", 3);
      }
    }
  }

  return [...terms.values()]
    .sort((left, right) => right.weight - left.weight || right.value.length - left.value.length)
    .slice(0, 80);
}

const semanticAliasGroups = [
  {
    triggers: ["登录", "登陆", "login", "signin", "sign in", "auth", "认证", "鉴权"],
    aliases: [
      "login",
      "signin",
      "signIn",
      "sign in",
      "auth",
      "authenticate",
      "authentication",
      "session",
      "token",
      "password",
      "user",
      "登录",
      "登陆",
      "认证",
      "鉴权"
    ]
  },
  {
    triggers: ["路由", "页面", "route", "router", "page", "navigation"],
    aliases: ["route", "routes", "router", "page", "screen", "navigation", "路由", "页面"]
  },
  {
    triggers: ["状态", "状态管理", "state", "store", "redux", "zustand", "pinia"],
    aliases: ["state", "store", "redux", "zustand", "pinia", "状态", "状态管理"]
  },
  {
    triggers: ["配置", "设置", "config", "settings", "option"],
    aliases: ["config", "configuration", "settings", "options", "environment", "配置", "设置"]
  },
  {
    triggers: ["测试", "test", "spec", "vitest", "jest", "playwright"],
    aliases: ["test", "tests", "spec", "vitest", "jest", "playwright", "assert", "测试"]
  },
  {
    triggers: ["样式", "style", "css", "scss", "tailwind", "theme"],
    aliases: ["style", "styles", "css", "scss", "tailwind", "theme", "className", "样式"]
  },
  {
    triggers: ["错误", "报错", "error", "exception", "diagnostic", "log"],
    aliases: ["error", "exception", "diagnostic", "diagnostics", "failed", "failure", "log", "错误", "报错"]
  },
  {
    triggers: ["命令", "终端", "command", "shell", "terminal"],
    aliases: ["command", "commands", "shell", "terminal", "process", "run", "命令", "终端"]
  },
  {
    triggers: ["工具", "tool", "built-in", "builtin"],
    aliases: ["tool", "tools", "builtInTool", "builtin", "registry", "executor", "工具"]
  },
  {
    triggers: ["确认", "权限", "permission", "confirm", "confirmation", "risk"],
    aliases: ["permission", "permissions", "confirm", "confirmation", "risk", "critical", "确认", "权限"]
  }
] as const;

function splitSemanticTokens(value: string): string[] {
  const tokens = new Set<string>();

  for (const match of value.matchAll(/[\p{L}\p{N}_$-]+/gu)) {
    const token = normalizeSemanticText(match[0]);

    addSemanticToken(tokens, token);

    for (const part of token.split(/[_$-]+/u)) {
      addSemanticToken(tokens, part);
    }
  }

  return [...tokens];
}

function addSemanticToken(tokens: Set<string>, token: string): void {
  if (token.length >= 2 || /[\u4e00-\u9fff]/u.test(token)) {
    tokens.add(token);
  }
}

function normalizeSemanticText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}_$-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function scoreSemanticText(value: string, query: string, terms: SemanticSearchTerm[]): number {
  const normalizedValue = normalizeSemanticText(value);
  const normalizedQuery = normalizeSemanticText(query);
  let score = 0;

  if (normalizedQuery.length >= 3 && normalizedValue.includes(normalizedQuery)) {
    score += 12;
  }

  for (const term of terms) {
    if (normalizedValue.includes(term.value)) {
      score += term.weight + Math.min(4, term.value.length / 4);
    }
  }

  return roundSemanticScore(score);
}

function collectMatchedSemanticTerms(
  value: string,
  query: string,
  terms: SemanticSearchTerm[]
): string[] {
  const normalizedValue = normalizeSemanticText(value);
  const normalizedQuery = normalizeSemanticText(query);
  const matchedTerms = new Set<string>();

  if (normalizedQuery.length >= 3 && normalizedValue.includes(normalizedQuery)) {
    matchedTerms.add(normalizedQuery);
  }

  for (const term of terms) {
    if (normalizedValue.includes(term.value)) {
      matchedTerms.add(term.value);
    }
  }

  return [...matchedTerms].slice(0, 12);
}

function createSemanticPreview(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length, lineIndex + 2);
  const preview = lines.slice(start, end).join("\n").trim();

  return (preview || lines[lineIndex] || "").slice(0, 500);
}

function findFirstNonBlankLine(lines: string[]): number {
  const index = lines.findIndex((line) => line.trim().length > 0);

  return index === -1 ? 0 : index;
}

function clampSemanticSearchLimit(value: number | undefined): number {
  return Math.min(80, Math.max(1, Math.round(value ?? 20)));
}

function clampSemanticMaxFileBytes(value: number | undefined): number {
  return Math.min(1_000_000, Math.max(8_000, Math.round(value ?? 180_000)));
}

function roundSemanticScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseErrorLogText(errorLog: string): Array<Record<string, unknown>> {
  return errorLog
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /error|failed|exception|ts\d{4}/iu.test(line))
    .slice(0, 120)
    .map((message) => ({ message }));
}

function extractDependencySpecifiers(content: string): Array<{
  kind: "dynamic-import" | "import-export";
  specifier: string;
}> {
  const specifiers = [];
  const staticPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']/gu;
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;

  for (const match of content.matchAll(staticPattern)) {
    if (match[1]) {
      specifiers.push({
        kind: "import-export" as const,
        specifier: match[1]
      });
    }
  }

  for (const match of content.matchAll(dynamicPattern)) {
    if (match[1]) {
      specifiers.push({
        kind: "dynamic-import" as const,
        specifier: match[1]
      });
    }
  }

  return specifiers;
}

function extractDiagnosticSearchTerms(value: string): string[] {
  const terms = new Set<string>();

  for (const match of value.matchAll(/\bTS\d{4}\b/gu)) {
    terms.add(match[0]);
  }

  for (const match of value.matchAll(/\b[\w./\\-]+\.(?:[cm]?[jt]sx?|vue|svelte|json|css|scss|less)(?::\d+)?/giu)) {
    terms.add(match[0].replace(/:\d+$/u, "").replace(/\\/g, "/"));
  }

  for (const match of value.matchAll(/["'`]([A-Za-z_$][\w$]{2,})["'`]/gu)) {
    terms.add(match[1]);
  }

  return [...terms].slice(0, 20);
}

function resolveImportSpecifier(
  importer: string,
  specifier: string,
  allRelativePaths: string[]
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const importerDirectory = importer.split("/").slice(0, -1);
  const candidateBase = normalizeProjectImportPath([...importerDirectory, specifier].join("/"));
  const candidates = [
    candidateBase,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"].map(
      (extension) => `${candidateBase}${extension}`
    ),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map(
      (fileName) => `${candidateBase}/${fileName}`
    )
  ];
  const normalizedPathSet = new Set(allRelativePaths.map((relativePath) => relativePath.replace(/\\/g, "/")));

  return candidates.find((candidate) => normalizedPathSet.has(candidate)) ?? null;
}

function normalizeProjectImportPath(value: string): string {
  const parts = [];

  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join("/");
}

function validationRecommendation(
  toolName: string,
  command: string,
  reason: string
): Record<string, unknown> {
  return {
    toolName,
    command,
    reason
  };
}

function extractBasicSymbols(content: string): Array<Record<string, unknown>> {
  const symbols = [];
  const patterns = [
    /(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/gu,
    /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gu,
    /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gu,
    /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/gu,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)/gu
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      symbols.push({
        name: match[1],
        kind: pattern.source.includes("function")
          ? "function"
          : pattern.source.includes("class")
            ? "class"
            : pattern.source.includes("interface")
              ? "interface"
              : pattern.source.includes("type")
                ? "type"
                : "const"
      });
    }
  }

  return symbols.slice(0, 300);
}

function createCommandOptions(
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext,
  command: string
): RunProjectCommandOptions {
  const projectRoot = requireProjectRoot(input, context);

  return {
    projectRoot,
    cwd: readOptionalString(input, "cwd") ?? projectRoot,
    command,
    runId: readOptionalString(input, "runId") ?? undefined,
    timeoutMs: readOptionalNumber(input, "timeoutMs")
  };
}

function requireProjectRoot(
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext
): string {
  const projectRoot = context.projectRoot ?? readOptionalString(input, "projectRoot");

  if (!projectRoot) {
    throw new Error("Project root is required");
  }

  return projectRoot;
}

function resolveProjectRelativePath(projectRoot: string, relativePath: string): string {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absolutePath = resolve(projectRoot, ...normalizedRelativePath.split("/"));
  const normalizedProjectRoot = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;

  if (absolutePath !== projectRoot && !absolutePath.startsWith(normalizedProjectRoot)) {
    throw new Error("Path must stay inside the selected project");
  }

  return absolutePath;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = readOptionalString(input, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readRequiredText(input: Record<string, unknown>, key: string): string {
  const value = input[key];

  if (typeof value !== "string") {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readRequiredTextFromAny(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];

    if (typeof value === "string") {
      return value;
    }
  }

  throw new Error(`${keys.join(" or ")} is required`);
}

function readOptionalString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalNumberFromAny(input: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readOptionalNumber(input, key);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];

  return typeof value === "boolean" ? value : undefined;
}

function readRequiredStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} must be a string array`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function readOptionalStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} must be a string array`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function isProjectMemoryEntry(value: unknown): value is ProjectMemoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ProjectMemoryEntry>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === "string")
  );
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function projectFileExists(projectRoot: string, relativePath: string): Promise<boolean> {
  return stat(resolveProjectRelativePath(projectRoot, relativePath))
    .then(() => true)
    .catch(() => false);
}

function isDependencyGraphSourceFile(relativePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?|vue|svelte)$/iu.test(relativePath);
}

function isLikelyEntrypoint(relativePath: string): boolean {
  return /(^|\/)(main|index|app|App|preload|renderer)\.(?:[cm]?[jt]sx?|html)$/u.test(relativePath);
}
