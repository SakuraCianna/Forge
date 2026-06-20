// 本文件说明: 将 Built-in Tool 名称映射到现有主进程服务, 让 P0/P1 工具具备真实执行路径
import { copyFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
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
import {
  classifyDocumentationUrl,
  officialDocsSourceCatalogVersion,
  resolveOfficialDocsSource
} from "../../shared/officialDocsSources.js";
import type {
  DocumentationCitation,
  DocumentationSourceClassification,
  OfficialDocsSource
} from "../../shared/officialDocsSources.js";
import type { WebSearchResultItem } from "../../shared/webSearchTypes.js";
import type { BuiltInToolExecutorMap } from "./builtInToolRegistry.js";
import {
  deleteProjectMemoryEntry,
  readProjectMemoryFile,
  searchProjectMemoryFile,
  writeProjectMemoryFile
} from "./projectMemoryToolExecutors.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type OpenExternal = (url: string) => Promise<unknown> | unknown;
type ScanProjectFiles = typeof scanProjectFilesDefault;
type FetchDocsCache = Map<string, FetchDocsCacheEntry>;

const fetchDocsDefaultCacheTtlMs = 10 * 60 * 1000;
const fetchDocsMaxCacheEntries = 64;

type FetchDocsCacheEntry = {
  createdAtMs: number;
  result: Record<string, unknown>;
};

type FetchDocsCacheMetadata = {
  status: "disabled" | "hit" | "miss" | "refresh";
  ttlMs: number;
  cachedAt: string | null;
  expiresAt: string | null;
};

type FetchDocsFallbackReason = "fetch_error" | "http_error" | "no_match";

type FetchDocsFallbackSearch = {
  status: "disabled" | "failed" | "no_results" | "ok";
  reason: FetchDocsFallbackReason;
  query: string | null;
  resultCount: number;
  trustedResultCount: number;
  results: WebSearchResultItem[];
  fetchedAt?: string;
  truncated?: boolean;
  errorMessage?: string;
};

type FetchDocsTopicUrlMatch =
  | { kind: "none" }
  | { kind: "url-like"; url: string | null };

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
  const fetchDocsCache: FetchDocsCache = new Map();

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
    fetchDocs: (input) => fetchDocs(input, fetcher, fetchDocsCache),
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
  fetcher: Fetcher,
  cache: FetchDocsCache
): Promise<Record<string, unknown>> {
  const explicitUrl = readOptionalString(input, "url");
  const fallbackSearchEnabled = readOptionalBoolean(input, "fallbackSearch") ??
    readOptionalBoolean(input, "fallback") ??
    true;
  const fallbackLimit = clampFetchDocsFallbackLimit(readOptionalNumber(input, "fallbackLimit"));

  if (explicitUrl) {
    const { cache: cacheMetadata, result } = await fetchUrlWithDocsCache(input, explicitUrl, fetcher, cache);
    const documentationSource = classifyDocumentationUrl(String(result.finalUrl ?? explicitUrl));
    const output = {
      ...result,
      source: "explicit-url",
      ...createFetchDocsSourceMetadata({
        cache: cacheMetadata,
        documentationSource,
        result
      })
    };

    return withFetchDocsFallbackSearch({
      enabled: fallbackSearchEnabled,
      fallbackLimit,
      fetcher,
      output,
      query: documentationSource.trusted ? createExplicitDocsFallbackQuery(explicitUrl) : null,
      result
    });
  }

  const rawTopic = (
    readOptionalString(input, "topic") ??
    readOptionalString(input, "library") ??
    readOptionalString(input, "query") ??
    readOptionalString(input, "target") ??
    readOptionalString(input, "text") ??
    ""
  );
  const topic = rawTopic.toLocaleLowerCase();
  const docsSource = resolveOfficialDocsSource(topic);

  if (!docsSource) {
    const fallbackQuery = createTopicDocsFallbackQuery(rawTopic || topic);
    const fallbackSearch = await createFetchDocsFallbackSearch({
      enabled: fallbackSearchEnabled,
      fetcher,
      limit: fallbackLimit,
      query: fallbackQuery,
      reason: "no_match"
    });

    return {
      status: "no_match",
      topic,
      docsCatalogVersion: officialDocsSourceCatalogVersion,
      fallbackSearch,
      message: "No official documentation mapping is available for this topic.",
      suggestedNextStep: createFetchDocsNoMatchSuggestedNextStep(fallbackSearch.status, fallbackQuery)
    };
  }

  const { cache: cacheMetadata, result } = await fetchUrlWithDocsCache(input, docsSource.url, fetcher, cache);
  const documentationSource = classifyDocumentationUrl(String(result.finalUrl ?? docsSource.url));
  const output = {
    ...result,
    source: "official-docs",
    topic,
    officialDocs: docsSource,
    ...createFetchDocsSourceMetadata({
      cache: cacheMetadata,
      documentationSource,
      officialDocs: docsSource,
      result
    })
  };

  return withFetchDocsFallbackSearch({
    enabled: fallbackSearchEnabled,
    fallbackLimit,
    fetcher,
    output,
    query: createTopicDocsFallbackQuery(docsSource.label),
    result
  });
}

async function fetchUrlWithDocsCache(
  input: Record<string, unknown>,
  url: string,
  fetcher: Fetcher,
  cache: FetchDocsCache
): Promise<{ cache: FetchDocsCacheMetadata; result: Record<string, unknown> }> {
  const normalizedUrl = normalizeFetchUrl(url);
  const cacheEnabled = readOptionalBoolean(input, "cache") ?? true;
  const forceRefresh = readOptionalBoolean(input, "refresh") ?? readOptionalBoolean(input, "forceRefresh") ?? false;
  const ttlMs = clampFetchDocsCacheTtlMs(readOptionalNumber(input, "cacheTtlMs"));
  const maxChars = clampContentLimit(readOptionalNumber(input, "maxChars"));
  const cacheKey = `${normalizedUrl}#maxChars=${maxChars}`;
  const now = Date.now();

  if (!cacheEnabled) {
    return {
      cache: createFetchDocsCacheMetadata("disabled", ttlMs, null),
      result: await fetchUrlForDocs({ ...input, maxChars, url: normalizedUrl }, fetcher)
    };
  }

  const cacheStatus = forceRefresh ? "refresh" : "miss";

  if (ttlMs <= 0) {
    cache.delete(cacheKey);
    return {
      cache: createFetchDocsCacheMetadata(cacheStatus, ttlMs, null),
      result: await fetchUrlForDocs({ ...input, maxChars, url: normalizedUrl }, fetcher)
    };
  }

  pruneFetchDocsCache(cache, now, ttlMs);

  const cached = cache.get(cacheKey);

  if (cached && !forceRefresh && now - cached.createdAtMs <= ttlMs) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);

    return {
      cache: createFetchDocsCacheMetadata("hit", ttlMs, cached.createdAtMs),
      result: { ...cached.result }
    };
  }

  if (cached) {
    cache.delete(cacheKey);
  }

  const result = await fetchUrlForDocs({ ...input, maxChars, url: normalizedUrl }, fetcher);

  if (result.status === "ok") {
    pruneFetchDocsCache(cache, now, ttlMs);
    cache.set(cacheKey, {
      createdAtMs: now,
      result: { ...result }
    });
  }

  return {
    cache: createFetchDocsCacheMetadata(cacheStatus, ttlMs, result.status === "ok" ? now : null),
    result
  };
}

async function fetchUrlForDocs(
  input: Record<string, unknown>,
  fetcher: Fetcher
): Promise<Record<string, unknown>> {
  try {
    return await fetchUrl(input, fetcher);
  } catch (error) {
    const url = normalizeFetchUrl(readRequiredString(input, "url"));

    return {
      status: "fetch_error",
      url,
      finalUrl: url,
      statusCode: null,
      contentType: null,
      title: null,
      content: "",
      truncated: false,
      errorMessage: formatUnknownError(error)
    };
  }
}

async function withFetchDocsFallbackSearch({
  enabled,
  fallbackLimit,
  fetcher,
  output,
  query,
  result
}: {
  enabled: boolean;
  fallbackLimit: number;
  fetcher: Fetcher;
  output: Record<string, unknown>;
  query: string | null;
  result: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const status = typeof result.status === "string" ? result.status : "";

  if (status === "ok") {
    return output;
  }

  if (status !== "fetch_error" && status !== "http_error") {
    return output;
  }

  return {
    ...output,
    fallbackSearch: await createFetchDocsFallbackSearch({
      enabled,
      fetcher,
      limit: fallbackLimit,
      query,
      reason: status
    })
  };
}

async function createFetchDocsFallbackSearch({
  enabled,
  fetcher,
  limit,
  query,
  reason
}: {
  enabled: boolean;
  fetcher: Fetcher;
  limit: number;
  query: string | null;
  reason: FetchDocsFallbackReason;
}): Promise<FetchDocsFallbackSearch> {
  if (!enabled || !query) {
    return {
      status: "disabled",
      reason,
      query,
      resultCount: 0,
      trustedResultCount: 0,
      results: []
    };
  }

  try {
    const searchResult = await searchWeb({ query, limit }, { fetcher });

    return {
      status: searchResult.results.length > 0 ? "ok" : "no_results",
      reason,
      query: searchResult.query,
      resultCount: searchResult.results.length,
      trustedResultCount: searchResult.results.filter((result) => result.trustedSource).length,
      results: searchResult.results,
      fetchedAt: searchResult.fetchedAt,
      truncated: searchResult.truncated
    };
  } catch (error) {
    return {
      status: "failed",
      reason,
      query,
      resultCount: 0,
      trustedResultCount: 0,
      results: [],
      errorMessage: formatUnknownError(error)
    };
  }
}

function createTopicDocsFallbackQuery(topic: string): string | null {
  const normalizedTopic = topic.replace(/\s+/gu, " ").trim();
  const topicUrl = extractUrlLikeTopic(normalizedTopic);

  if (topicUrl.kind === "url-like") {
    if (!topicUrl.url) {
      return null;
    }

    const documentationSource = classifyDocumentationUrl(topicUrl.url);

    return documentationSource.trusted ? createExplicitDocsFallbackQuery(topicUrl.url) : null;
  }

  return normalizedTopic ? `${normalizedTopic} official documentation` : null;
}

function createFetchDocsNoMatchSuggestedNextStep(
  fallbackStatus: FetchDocsFallbackSearch["status"],
  fallbackQuery: string | null
): string {
  if (fallbackStatus === "ok") {
    return "Review fallbackSearch.results, then call fetchDocs with a selected official documentation URL.";
  }

  if (!fallbackQuery) {
    return "Fallback search was disabled because the topic is empty or looks like an untrusted URL. Pass a verified official documentation URL via url, or use webSearch manually only after confirming it is safe to disclose.";
  }

  return "Use webSearch to find the official documentation URL, then call fetchDocs with url.";
}

function extractUrlLikeTopic(topic: string): FetchDocsTopicUrlMatch {
  const candidate = topic.match(/https?:\/\/[^\s<>"')]+/iu)?.[0] ??
    topic.match(/\bwww\.[a-z0-9.-]+(?:\/[^\s<>"')]+)?/iu)?.[0] ??
    topic.match(/\b(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{2,5})?(?:\/[^\s<>"')]+)?/iu)?.[0] ??
    topic.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\.(?:local|internal|lan|corp|home|test|localhost))(?::\d{2,5})?(?:\/[^\s<>"')]+)?/iu)?.[0] ??
    topic.match(/\b(?:[a-z0-9-]+\.)+[a-z0-9-]+:\d{2,5}(?:\/[^\s<>"')]+)?/iu)?.[0];

  if (!candidate) {
    return { kind: "none" };
  }

  const trimmedCandidate = candidate.replace(/[),.;]+$/gu, "");
  const candidateUrl = /^https?:\/\//iu.test(trimmedCandidate) ? trimmedCandidate : `https://${trimmedCandidate}`;

  try {
    return {
      kind: "url-like",
      url: normalizeFetchUrl(candidateUrl)
    };
  } catch {
    return {
      kind: "url-like",
      url: null
    };
  }
}

function createExplicitDocsFallbackQuery(url: string): string | null {
  try {
    const parsedUrl = new URL(normalizeFetchUrl(url));
    const host = parsedUrl.hostname.replace(/^www\./iu, "");
    const pathHint = parsedUrl.pathname.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

    return `${host} official documentation ${pathHint}`.replace(/\s+/gu, " ").trim();
  } catch {
    return createTopicDocsFallbackQuery(url);
  }
}

function pruneFetchDocsCache(cache: FetchDocsCache, now: number, ttlMs: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.createdAtMs > ttlMs) {
      cache.delete(key);
    }
  }

  while (cache.size >= fetchDocsMaxCacheEntries) {
    const oldestKey = cache.keys().next().value;

    if (typeof oldestKey !== "string") {
      return;
    }

    cache.delete(oldestKey);
  }
}

function createFetchDocsSourceMetadata({
  cache,
  documentationSource,
  officialDocs,
  result
}: {
  cache: FetchDocsCacheMetadata;
  documentationSource: DocumentationSourceClassification;
  officialDocs?: OfficialDocsSource;
  result: Record<string, unknown>;
}): Record<string, unknown> {
  const citation = createDocumentationCitation({
    documentationSource,
    accessedAt: cache.cachedAt ?? new Date().toISOString(),
    result
  });

  return {
    sourceType: documentationSource.type,
    trustedSource: documentationSource.trusted,
    sourceLabel: documentationSource.label,
    docsCatalogVersion: officialDocsSourceCatalogVersion,
    documentationSource,
    cache,
    citations: [citation],
    citationSummary: formatDocumentationCitationSummary(citation),
    ...(documentationSource.officialDocs ? { officialDocs: officialDocs ?? documentationSource.officialDocs } : {})
  };
}

function createDocumentationCitation({
  accessedAt,
  documentationSource,
  result
}: {
  accessedAt: string;
  documentationSource: DocumentationSourceClassification;
  result: Record<string, unknown>;
}): DocumentationCitation {
  const finalUrl = typeof result.finalUrl === "string"
    ? result.finalUrl
    : typeof result.url === "string"
      ? result.url
      : "";

  return {
    title: typeof result.title === "string" ? result.title : null,
    url: finalUrl,
    sourceLabel: documentationSource.label,
    sourceType: documentationSource.type,
    accessedAt,
    catalogVersion: officialDocsSourceCatalogVersion
  };
}

function formatDocumentationCitationSummary(citation: DocumentationCitation): string {
  const sourceKind = citation.sourceType === "official-docs"
    ? "Official docs"
    : citation.sourceType === "trusted-docs"
      ? "Trusted docs"
      : "Web";
  const title = citation.title ? `${citation.title} - ` : "";

  return `${sourceKind}: ${citation.sourceLabel} - ${title}${citation.url}`;
}

function createFetchDocsCacheMetadata(
  status: FetchDocsCacheMetadata["status"],
  ttlMs: number,
  cachedAtMs: number | null
): FetchDocsCacheMetadata {
  return {
    status,
    ttlMs,
    cachedAt: cachedAtMs === null ? null : new Date(cachedAtMs).toISOString(),
    expiresAt: cachedAtMs === null ? null : new Date(cachedAtMs + ttlMs).toISOString()
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

function clampContentLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 6000;
  }

  return Math.min(20_000, Math.max(500, Math.round(value)));
}

function clampFetchDocsCacheTtlMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fetchDocsDefaultCacheTtlMs;
  }

  return Math.min(60 * 60 * 1000, Math.max(0, Math.round(value)));
}

function clampFetchDocsFallbackLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
