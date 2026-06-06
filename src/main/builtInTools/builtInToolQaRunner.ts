// 本文件说明: 在开发 QA 沙箱中运行 Built-in Tool 验证场景, 默认只在开发沙箱启用受控写入
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { developmentQaSandboxProject } from "../../shared/developmentSandboxConfig.js";
import type {
  BuiltInToolQaRunRequest,
  BuiltInToolQaRunResult,
  BuiltInToolQaMetricGate,
  BuiltInToolQaSafetyAssertionKind,
  BuiltInToolQaScenarioResult,
  BuiltInToolQaScenarioStatus
} from "../../shared/builtInToolQaTypes.js";
import type { BuiltInTool } from "../../shared/builtInToolTypes.js";
import { getBuiltInToolFromRegistry } from "./builtInToolRegistry.js";

type BuiltInToolQaScenario = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  confirmed?: boolean;
  fullAccess?: boolean;
  secondConfirmed?: boolean;
  typedConfirmation?: string;
};

export type DevelopmentBuiltInToolQaRunnerOptions = {
  registry: BuiltInTool[];
  request?: BuiltInToolQaRunRequest;
  now?: () => Date;
};

const defaultReadOnlyScenarios: BuiltInToolQaScenario[] = [
  { id: "project-tree", toolName: "getProjectTree", input: { limit: 800 } },
  { id: "project-summary", toolName: "getProjectSummary", input: {} },
  { id: "project-metadata", toolName: "getProjectMetadata", input: {} },
  { id: "entrypoints", toolName: "getEntrypoints", input: {} },
  { id: "dependency-graph", toolName: "getDependencyGraph", input: { limit: 120 } },
  { id: "list-root", toolName: "listFiles", input: { relativePath: ".", limit: 120 } },
  { id: "glob-source", toolName: "globFiles", input: { pattern: "**/*", limit: 80 } },
  { id: "search-todo", toolName: "searchText", input: { query: "TODO", limit: 40 } },
  { id: "search-regex-fixture", toolName: "searchRegex", input: { pattern: "fixture|hello" } },
  { id: "semantic-search-fixture", toolName: "searchSemantic", input: { query: "Forge QA fixture", limit: 10 } },
  {
    id: "search-diagnostics-fixture",
    toolName: "searchDiagnostics",
    input: {
      errorLog: "src/index.ts(1,1): error TS2304: Cannot find name 'fixture'.",
      limit: 20
    }
  },
  { id: "git-status", toolName: "getGitStatus", input: {} },
  { id: "git-diff", toolName: "getGitDiff", input: {} },
  { id: "git-log", toolName: "getGitLog", input: { limit: 5, timeoutMs: 30_000 } },
  { id: "diagnostics-empty", toolName: "getDiagnostics", input: {} },
  {
    id: "parse-error-log",
    toolName: "parseErrorLog",
    input: {
      errorLog: "src/index.ts(1,1): error TS2304: Cannot find name 'fixture'."
    }
  },
  {
    id: "validation-plan",
    toolName: "suggestValidationPlan",
    input: { changedFiles: ["src/index.ts"] }
  },
  { id: "running-commands", toolName: "listRunningCommands", input: {} },
  {
    id: "stop-missing-command",
    toolName: "stopCommand",
    input: { runId: "forge-qa-missing-run" },
    confirmed: true
  },
  {
    id: "command-echo",
    toolName: "runCommand",
    input: {
      command: "node -e \"console.log('Forge built-in tool command QA')\"",
      timeoutMs: 30000
    },
    confirmed: true
  },
  { id: "package-manager", toolName: "detectPackageManager", input: {} },
  { id: "read-project-memory", toolName: "readProjectMemory", input: {} },
  { id: "search-memory", toolName: "searchMemory", input: { query: "fixture" } },
  { id: "read-project-instructions", toolName: "readProjectInstructions", input: {} },
  {
    id: "context-budget",
    toolName: "getContextBudget",
    input: { contextBudget: 128_000, usedTokens: 4_096 }
  },
  {
    id: "summarize-context",
    toolName: "summarizeContext",
    input: {
      content: "Forge QA context summary fixture\nRead first, preview writes, confirm high risk.",
      maxChars: 120
    }
  }
];

export async function runDevelopmentBuiltInToolQa({
  now = () => new Date(),
  registry,
  request
}: DevelopmentBuiltInToolQaRunnerOptions): Promise<BuiltInToolQaRunResult> {
  const startedAtDate = now();
  const projectRoot = request?.projectRoot ?? developmentQaSandboxProject.path;
  const modelId = request?.modelId ?? developmentQaSandboxProject.modelId;

  if (!projectRoot) {
    const endedAtDate = now();

    return createQaRunResult({
      endedAt: endedAtDate.toISOString(),
      modelId,
      projectRoot: "",
      registry,
      scenarios: [],
      skippedReason:
        "Development QA sandbox project is not configured. Set FORGE_QA_PROJECT_ROOT to run QA against a sandbox project.",
      startedAt: startedAtDate.toISOString(),
      status: "skipped"
    });
  }

  const existingProject = await stat(projectRoot).catch(() => null);

  if (!existingProject?.isDirectory()) {
    const endedAtDate = now();

    return createQaRunResult({
      endedAt: endedAtDate.toISOString(),
      modelId,
      projectRoot,
      registry,
      scenarios: [],
      skippedReason: `Development QA sandbox project does not exist: ${projectRoot}`,
      startedAt: startedAtDate.toISOString(),
      status: "skipped"
    });
  }

  const scenarios: BuiltInToolQaScenarioResult[] = [];

  for (const scenario of defaultReadOnlyScenarios) {
    scenarios.push(await executeQaScenario({ now, projectRoot, registry, scenario }));
  }

  const readableCandidate = findReadableCandidate(scenarios);

  if (readableCandidate) {
    const readFileResult = await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "read-file",
        toolName: "readFile",
        input: { relativePath: readableCandidate, maxBytes: 120_000 }
      }
    });
    scenarios.push(readFileResult);

    scenarios.push(
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "read-file-chunk",
          toolName: "readFileChunk",
          input: { relativePath: readableCandidate, startLine: 1, lineCount: 80 }
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "stat-file",
          toolName: "statFile",
          input: { relativePath: readableCandidate }
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "detect-file-type",
          toolName: "detectFileType",
          input: { relativePath: readableCandidate, maxBytes: 120_000 }
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "file-symbols",
          toolName: "getFileSymbols",
          input: { relativePath: readableCandidate, maxBytes: 120_000 }
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "related-files",
          toolName: "getRelatedFiles",
          input: { relativePath: readableCandidate }
        }
      })
    );

    const readContent = extractContentFromScenario(readFileResult);

    if (readContent !== null) {
      scenarios.push(
        await executeQaScenario({
          now,
          projectRoot,
          registry,
          scenario: {
            id: "read-many-files",
            toolName: "readManyFiles",
            input: { relativePaths: [readableCandidate], maxBytesPerFile: 120_000 }
          }
        }),
        await executeQaScenario({
          now,
          projectRoot,
          registry,
          scenario: {
            id: "propose-edit",
            toolName: "proposeEdit",
            input: { relativePath: readableCandidate, nextContent: readContent }
          }
        }),
        await executeQaScenario({
          now,
          projectRoot,
          registry,
          scenario: {
            id: "find-references-fixture",
            toolName: "findReferences",
            input: { query: "fixture", limit: 40 }
          }
        }),
        await executeQaScenario({
          now,
          projectRoot,
          registry,
          scenario: {
            id: "git-blame",
            toolName: "getGitBlame",
            input: { relativePath: readableCandidate, startLine: 1, endLine: 1, timeoutMs: 30_000 }
          }
        }),
        await executeQaScenario({
          now,
          projectRoot,
          registry,
          scenario: {
            id: "preview-diff",
            toolName: "previewDiff",
            input: { relativePath: readableCandidate, nextContent: readContent }
          }
        })
      );
    }
  } else {
    scenarios.push(createSkippedScenario("read-file", "readFile", "No readable text file candidate found."));
  }

  scenarios.push(...(await executeBrowserQa({ now, projectRoot, registry, request })));
  scenarios.push(...(await executeWebQa({ now, projectRoot, registry, request })));

  if (shouldRunMutationChecks(projectRoot, request)) {
    scenarios.push(...(await executeControlledMutationQa({ now, projectRoot, registry })));
  }

  const endedAtDate = now();
  const failedCount = scenarios.filter((scenario) =>
    ["failed", "blocked", "not_implemented"].includes(scenario.status)
  ).length;

  return createQaRunResult({
    endedAt: endedAtDate.toISOString(),
    modelId,
    projectRoot,
    registry,
    scenarios,
    startedAt: startedAtDate.toISOString(),
    status: failedCount === 0 ? "passed" : "failed"
  });
}

async function executeQaScenario({
  now,
  projectRoot,
  registry,
  scenario
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
  scenario: BuiltInToolQaScenario;
}): Promise<BuiltInToolQaScenarioResult> {
  const startedAt = now();

  try {
    const tool = getBuiltInToolFromRegistry(registry, scenario.toolName);
    const result = await tool.execute(scenario.input, {
      projectRoot,
      confirmed: scenario.confirmed,
      fullAccess: scenario.fullAccess,
      secondConfirmed: scenario.secondConfirmed,
      typedConfirmation: scenario.typedConfirmation
    });
    const endedAt = now();
    const status = classifyToolResult(result);

    return {
      id: scenario.id,
      toolName: scenario.toolName,
      status,
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      inputSummary: summarizeValue(scenario.input),
      outputSummary: summarizeValue(result),
      ...(readProblemMessage(result) ? { errorMessage: readProblemMessage(result) ?? undefined } : {})
    };
  } catch (error) {
    const endedAt = now();

    return {
      id: scenario.id,
      toolName: scenario.toolName,
      status: "failed",
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      inputSummary: summarizeValue(scenario.input),
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function executeControlledMutationQa({
  now,
  projectRoot,
  registry
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
}): Promise<BuiltInToolQaScenarioResult[]> {
  const relativePath = ".forge/qa/built-in-tool-write-check.txt";
  const fixtureContent = "Forge built-in tool QA fixture\n";
  const scenarios: BuiltInToolQaScenarioResult[] = [];
  const fixtureExists = await stat(resolve(projectRoot, relativePath)).then(() => true).catch(() => false);
  let baselineContent: string | null;

  if (!fixtureExists) {
    const createResult = await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-create-file",
        toolName: "createFile",
        input: { relativePath, content: fixtureContent },
        confirmed: true
      }
    });

    scenarios.push(createResult);
    baselineContent = createResult.status === "succeeded" ? fixtureContent : null;
  } else {
    const initialRead = await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-read-baseline",
        toolName: "readFile",
        input: { relativePath, maxBytes: 120_000 }
      }
    });

    scenarios.push(initialRead);
    baselineContent = extractContentFromScenario(initialRead);
  }

  if (baselineContent === null) {
    scenarios.push(
      createSkippedScenario(
        "mutation-apply-edit",
        "applyEdit",
        "Could not establish a baseline QA fixture file."
      )
    );
    return scenarios;
  }

  scenarios.push(...(await executeFullAccessBlockedQa({ now, projectRoot, registry })));
  scenarios.push(...(await executeSandboxFileOperationQa({ baselineContent, now, projectRoot, registry })));
  scenarios.push(...(await executePackageScriptQa({ now, projectRoot, registry })));
  scenarios.push(...(await executeProjectMemoryMutationQa({ now, projectRoot, registry })));

  const editedContent = `${baselineContent.replace(/\s+$/u, "")}\nQA write check\n`;

  scenarios.push(
    await executeBlockedMutationSafetyScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-apply-edit-blocked-before-confirmation",
        toolName: "applyEdit",
        input: { relativePath, nextContent: editedContent }
      },
      expectedContent: baselineContent,
      relativePath,
      safetyKind: "write_before_confirmation"
    }),
    await executeBlockedMutationSafetyScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-delete-file-blocked-before-typed-confirmation",
        toolName: "deleteFile",
        input: { relativePath },
        confirmed: true,
        typedConfirmation: "wrong"
      },
      expectedContent: baselineContent,
      relativePath,
      safetyKind: "critical_typed_confirmation"
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-preview-diff",
        toolName: "previewDiff",
        input: { relativePath, nextContent: editedContent }
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-apply-edit",
        toolName: "applyEdit",
        input: { relativePath, nextContent: editedContent },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-revert-file",
        toolName: "revertFile",
        input: { relativePath, previousContent: baselineContent },
        confirmed: true
      }
    })
  );

  return scenarios;
}

async function executeBlockedMutationSafetyScenario({
  expectedContent,
  now,
  projectRoot,
  registry,
  relativePath,
  scenario,
  safetyKind
}: {
  expectedContent: string;
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
  relativePath: string;
  scenario: BuiltInToolQaScenario;
  safetyKind: BuiltInToolQaSafetyAssertionKind;
}): Promise<BuiltInToolQaScenarioResult> {
  const result = await executeQaScenario({ now, projectRoot, registry, scenario });
  const currentContent = await readQaTextFile(projectRoot, relativePath);
  const blockedAsExpected = result.status === "blocked" && currentContent === expectedContent;
  const details = {
    expectedBlockedStatus: "blocked",
    actualStatus: result.status,
    fileUnchanged: currentContent === expectedContent,
    blockedMessage: result.errorMessage ?? null
  };
  const { errorMessage: _expectedBlockedMessage, ...safeResult } = result;

  return {
    ...safeResult,
    status: blockedAsExpected ? "succeeded" : "failed",
    outputSummary: summarizeValue(details),
    safetyAssertion: {
      kind: safetyKind,
      passed: blockedAsExpected,
      message: blockedAsExpected
        ? "Mutation was blocked before disk state changed."
        : "Mutation safety gate did not block before disk change.",
      fileUnchanged: currentContent === expectedContent
    },
    ...(blockedAsExpected ? {} : { errorMessage: "Mutation safety gate did not block before disk change." })
  };
}

async function executeFullAccessBlockedQa({
  now,
  projectRoot,
  registry
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
}): Promise<BuiltInToolQaScenarioResult[]> {
  const scenarios: BuiltInToolQaScenario[] = [
    {
      id: "full-access-install-dependency-blocked",
      toolName: "installDependency",
      input: { packages: ["left-pad"], dev: true },
      fullAccess: true
    },
    {
      id: "full-access-create-commit-blocked",
      toolName: "createCommit",
      input: { message: "Forge QA should not create a commit" },
      fullAccess: true
    },
    {
      id: "full-access-create-branch-blocked",
      toolName: "createBranch",
      input: { branch: "forge-qa-branch" },
      fullAccess: true
    },
    {
      id: "full-access-checkout-branch-typed-blocked",
      toolName: "checkoutBranch",
      input: { branch: "main" },
      confirmed: true,
      fullAccess: true,
      typedConfirmation: "wrong"
    },
    {
      id: "full-access-create-worktree-blocked",
      toolName: "createWorktree",
      input: { name: "forge-qa-worktree" },
      fullAccess: true
    },
    {
      id: "full-access-revert-changes-typed-blocked",
      toolName: "revertChanges",
      input: { scope: "all" },
      confirmed: true,
      fullAccess: true,
      typedConfirmation: "wrong"
    },
    {
      id: "full-access-git-push-typed-blocked",
      toolName: "gitPush",
      input: { remote: "origin", branch: "codex/Forge" },
      confirmed: true,
      fullAccess: true,
      typedConfirmation: "wrong"
    },
    {
      id: "full-access-delete-memory-typed-blocked",
      toolName: "deleteMemory",
      input: { id: "forge-qa-memory" },
      confirmed: true,
      fullAccess: true,
      typedConfirmation: "wrong"
    },
    {
      id: "full-access-create-instructions-blocked",
      toolName: "createProjectInstructions",
      input: { content: "# Forge QA\n" },
      fullAccess: true
    },
    {
      id: "full-access-update-instructions-blocked",
      toolName: "updateProjectInstructions",
      input: { relativePath: "AGENTS.md", content: "# Forge QA\n" },
      fullAccess: true
    }
  ];

  const results = [];

  for (const scenario of scenarios) {
    results.push(await executeExpectedBlockedScenario({ now, projectRoot, registry, scenario }));
  }

  return results;
}

async function executeSandboxFileOperationQa({
  baselineContent,
  now,
  projectRoot,
  registry
}: {
  baselineContent: string;
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
}): Promise<BuiltInToolQaScenarioResult[]> {
  const relativePath = ".forge/qa/built-in-tool-write-check.txt";
  const createdRelativePath = ".forge/qa/built-in-tool-create-check.txt";
  const copiedRelativePath = ".forge/qa/built-in-tool-copy-check.txt";
  const movedRelativePath = ".forge/qa/built-in-tool-move-check.txt";
  const baselineFirstLine = baselineContent.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  const results: BuiltInToolQaScenarioResult[] = [];

  await cleanupQaPath(projectRoot, copiedRelativePath);
  await cleanupQaPath(projectRoot, movedRelativePath);
  await cleanupQaPath(projectRoot, createdRelativePath);

  results.push(
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-replace-text-preview",
        toolName: "replaceText",
        input: { relativePath, search: "Forge", replace: "Forge QA" },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-insert-text-preview",
        toolName: "insertText",
        input: { relativePath, index: 0, text: "QA insert preview\n" },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-apply-patch",
        toolName: "applyPatch",
        input: {
          patch: createSingleLineAddPatch(relativePath, baselineFirstLine, "QA patch check")
        },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-revert-after-patch",
        toolName: "revertFile",
        input: { relativePath, previousContent: baselineContent },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-create-scratch-file",
        toolName: "createFile",
        input: { relativePath: createdRelativePath, content: "Forge QA create file\n\n" },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-format-file",
        toolName: "formatFile",
        input: { relativePath: createdRelativePath },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-copy-file",
        toolName: "copyFile",
        input: { from: createdRelativePath, to: copiedRelativePath },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-move-file",
        toolName: "moveFile",
        input: { from: copiedRelativePath, to: movedRelativePath },
        confirmed: true
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-delete-moved-file",
        toolName: "deleteFile",
        input: { relativePath: movedRelativePath },
        confirmed: true,
        typedConfirmation: "DELETE"
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "mutation-delete-created-file",
        toolName: "deleteFile",
        input: { relativePath: createdRelativePath },
        confirmed: true,
        typedConfirmation: "DELETE"
      }
    })
  );

  await cleanupQaPath(projectRoot, copiedRelativePath);
  await cleanupQaPath(projectRoot, movedRelativePath);
  await cleanupQaPath(projectRoot, createdRelativePath);

  return results;
}

async function executePackageScriptQa({
  now,
  projectRoot,
  registry
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
}): Promise<BuiltInToolQaScenarioResult[]> {
  const packageDirectoryRelativePath = ".forge/qa/package-script-fixture";
  const packageRelativePath = ".forge/qa/package-script-fixture/package.json";
  const packageCwd = dirname(resolve(projectRoot, packageRelativePath));
  const packageContent = `${JSON.stringify(
    {
      scripts: {
        build: "node -e \"console.log('Forge QA build')\"",
        lint: "node -e \"console.log('Forge QA lint')\"",
        "qa:noop": "node -e \"console.log('Forge QA package script')\"",
        test: "node -e \"console.log('Forge QA test')\"",
        typecheck: "node -e \"console.log('Forge QA typecheck')\""
      }
    },
    null,
    2
  )}\n`;
  const results: BuiltInToolQaScenarioResult[] = [];

  try {
    results.push(
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-script-fixture-write",
          toolName: "applyEdit",
          input: { relativePath: packageRelativePath, nextContent: packageContent },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-script-run",
          toolName: "runPackageScript",
          input: { cwd: packageCwd, script: "qa:noop", timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-run-typecheck",
          toolName: "runTypecheck",
          input: { cwd: packageCwd, timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-run-lint",
          toolName: "runLint",
          input: { cwd: packageCwd, timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-run-build",
          toolName: "runBuild",
          input: { cwd: packageCwd, timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-run-tests",
          toolName: "runTests",
          input: { cwd: packageCwd, timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-run-targeted-test",
          toolName: "runTargetedTest",
          input: { cwd: packageCwd, script: "test", target: "forge-qa-target", timeoutMs: 30_000 },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "package-script-fixture-delete",
          toolName: "deleteFile",
          input: { relativePath: packageRelativePath },
          confirmed: true,
          typedConfirmation: "DELETE"
        }
      })
    );
  } finally {
    await cleanupQaPath(projectRoot, packageRelativePath);
    await cleanupQaDirectory(projectRoot, packageDirectoryRelativePath);
  }

  return results;
}

async function executeProjectMemoryMutationQa({
  now,
  projectRoot,
  registry
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
}): Promise<BuiltInToolQaScenarioResult[]> {
  const memoryRelativePath = ".forge/project-memory.json";
  const previousMemory = await readQaTextFile(projectRoot, memoryRelativePath);
  const entryId = "forge-qa-memory";
  const results: BuiltInToolQaScenarioResult[] = [];

  try {
    results.push(
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "memory-write-project-memory",
          toolName: "writeProjectMemory",
          input: {
            id: entryId,
            content: "Forge QA memory fixture",
            tags: ["forge-qa"]
          },
          confirmed: true
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "memory-search-written-memory",
          toolName: "searchMemory",
          input: { query: "Forge QA memory" }
        }
      }),
      await executeQaScenario({
        now,
        projectRoot,
        registry,
        scenario: {
          id: "memory-delete-project-memory",
          toolName: "deleteMemory",
          input: { id: entryId },
          confirmed: true,
          typedConfirmation: "DELETE"
        }
      })
    );
  } finally {
    await restoreQaTextFile(projectRoot, memoryRelativePath, previousMemory);
  }

  return results;
}

async function executeExpectedBlockedScenario({
  now,
  projectRoot,
  registry,
  scenario
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
  scenario: BuiltInToolQaScenario;
}): Promise<BuiltInToolQaScenarioResult> {
  const result = await executeQaScenario({ now, projectRoot, registry, scenario });
  const blockedAsExpected = result.status === "blocked";
  const details = {
    expectedBlockedStatus: "blocked",
    actualStatus: result.status,
    blockedMessage: result.errorMessage ?? null,
    fullAccess: Boolean(scenario.fullAccess)
  };
  const { errorMessage: _expectedBlockedMessage, ...safeResult } = result;

  return {
    ...safeResult,
    status: blockedAsExpected ? "succeeded" : "failed",
    outputSummary: summarizeValue(details),
    ...(blockedAsExpected ? {} : { errorMessage: "Expected tool call to be blocked before execution." })
  };
}

async function readQaTextFile(projectRoot: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(resolve(projectRoot, relativePath), "utf8");
  } catch {
    return null;
  }
}

async function cleanupQaPath(projectRoot: string, relativePath: string): Promise<void> {
  await rm(resolve(projectRoot, relativePath), { force: true });
}

async function cleanupQaDirectory(projectRoot: string, relativePath: string): Promise<void> {
  await rm(resolve(projectRoot, relativePath), { force: true, recursive: true });
}

async function restoreQaTextFile(
  projectRoot: string,
  relativePath: string,
  content: string | null
): Promise<void> {
  const absolutePath = resolve(projectRoot, relativePath);

  if (content === null) {
    await rm(absolutePath, { force: true });
    return;
  }

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function createSingleLineAddPatch(
  relativePath: string,
  contextLine: string,
  addedLine: string
): string {
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    "@@ -1,1 +1,2 @@",
    ` ${contextLine}`,
    `+${addedLine}`,
    ""
  ].join("\n");
}

async function executeBrowserQa({
  now,
  projectRoot,
  registry,
  request
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
  request: BuiltInToolQaRunRequest | undefined;
}): Promise<BuiltInToolQaScenarioResult[]> {
  if (request?.includeBrowserChecks === false) {
    return [];
  }

  const browserPreviewUrl = request?.browserPreviewUrl;

  if (!browserPreviewUrl) {
    return [
      createSkippedScenario(
        "browser-screenshot",
        "takeScreenshot",
        "No browserPreviewUrl configured for Browser QA."
      ),
      createSkippedScenario(
        "browser-console",
        "inspectPageConsole",
        "No browserPreviewUrl configured for Browser QA."
      )
    ];
  }

  return [
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "browser-screenshot",
        toolName: "takeScreenshot",
        input: {
          url: browserPreviewUrl,
          width: 1280,
          height: 800,
          waitMs: 500,
          includeDataUrl: false
        }
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "browser-console",
        toolName: "inspectPageConsole",
        input: {
          url: browserPreviewUrl,
          width: 1280,
          height: 800,
          waitMs: 500,
          limit: 80
        }
      }
    })
  ];
}

async function executeWebQa({
  now,
  projectRoot,
  registry,
  request
}: {
  now: () => Date;
  projectRoot: string;
  registry: BuiltInTool[];
  request: BuiltInToolQaRunRequest | undefined;
}): Promise<BuiltInToolQaScenarioResult[]> {
  if (!request?.includeWebChecks || !request.browserPreviewUrl) {
    return [];
  }

  return [
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "web-fetch-url",
        toolName: "fetchUrl",
        input: { url: request.browserPreviewUrl, maxChars: 1_200, timeoutMs: 10_000 }
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "web-fetch-docs-explicit-url",
        toolName: "fetchDocs",
        input: { url: request.browserPreviewUrl, maxChars: 1_200, timeoutMs: 10_000 }
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "web-open-browser-preview",
        toolName: "openBrowserPreview",
        input: { url: request.browserPreviewUrl }
      }
    }),
    await executeQaScenario({
      now,
      projectRoot,
      registry,
      scenario: {
        id: "web-search-local-fixture",
        toolName: "webSearch",
        input: { query: "Forge Browser QA fixture", limit: 2 }
      }
    })
  ];
}

function shouldRunMutationChecks(
  projectRoot: string,
  request: BuiltInToolQaRunRequest | undefined
): boolean {
  return request?.includeMutationChecks ?? developmentQaSandboxProject.path === projectRoot;
}

function createQaRunResult({
  endedAt,
  modelId,
  projectRoot,
  registry,
  scenarios,
  skippedReason,
  startedAt,
  status
}: {
  endedAt: string;
  modelId: string;
  projectRoot: string;
  registry: BuiltInTool[];
  scenarios: BuiltInToolQaScenarioResult[];
  skippedReason?: string;
  startedAt: string;
  status: BuiltInToolQaRunResult["status"];
}): BuiltInToolQaRunResult {
  const total = scenarios.length;
  const succeeded = scenarios.filter((scenario) => scenario.status === "succeeded").length;
  const failed = scenarios.filter((scenario) => scenario.status === "failed").length;
  const blocked = scenarios.filter((scenario) => scenario.status === "blocked").length;
  const notImplemented = scenarios.filter((scenario) => scenario.status === "not_implemented").length;
  const skipped = scenarios.filter((scenario) => scenario.status === "skipped").length;
  const attempted = total - skipped;
  const safetyAssertions = scenarios
    .map((scenario) => scenario.safetyAssertion)
    .filter((assertion): assertion is NonNullable<BuiltInToolQaScenarioResult["safetyAssertion"]> =>
      Boolean(assertion)
    );
  const scenarioToolNames = new Set(scenarios.map((scenario) => scenario.toolName));
  const scenarioTools = registry.filter((tool) => scenarioToolNames.has(tool.name));
  const attemptedScenarioToolNames = new Set(
    scenarios.filter((scenario) => scenario.status !== "skipped").map((scenario) => scenario.toolName)
  );
  const attemptedScenarioTools = registry.filter((tool) => attemptedScenarioToolNames.has(tool.name));
  const succeededScenarioToolNames = new Set(
    scenarios.filter((scenario) => scenario.status === "succeeded").map((scenario) => scenario.toolName)
  );
  const succeededScenarioTools = registry.filter((tool) => succeededScenarioToolNames.has(tool.name));
  const p0ScenarioTools = scenarioTools.filter((tool) => tool.priority === "P0");
  const p1ScenarioTools = scenarioTools.filter((tool) => tool.priority === "P1");
  const p2ScenarioTools = scenarioTools.filter((tool) => tool.priority === "P2");
  const p0SucceededScenarioTools = succeededScenarioTools.filter((tool) => tool.priority === "P0");
  const p1SucceededScenarioTools = succeededScenarioTools.filter((tool) => tool.priority === "P1");
  const p2SucceededScenarioTools = succeededScenarioTools.filter((tool) => tool.priority === "P2");
  const writeBeforeConfirmationAssertions = safetyAssertions.filter(
    (assertion) => assertion.kind === "write_before_confirmation"
  );
  const criticalConfirmationAssertions = safetyAssertions.filter(
    (assertion) => assertion.kind === "critical_typed_confirmation"
  );
  const writeBeforeConfirmationFailures = writeBeforeConfirmationAssertions.filter(
    (assertion) => !assertion.passed
  ).length;
  const criticalConfirmationFailures = criticalConfirmationAssertions.filter(
    (assertion) => !assertion.passed
  ).length;
  const quality = createQaQualitySummary({
    attempted,
    criticalConfirmationFailures,
    criticalConfirmationTotal: criticalConfirmationAssertions.length,
    p0ScenarioTools: p0ScenarioTools.length,
    p0SucceededScenarioTools: p0SucceededScenarioTools.length,
    succeeded,
    writeBeforeConfirmationFailures,
    writeBeforeConfirmationTotal: writeBeforeConfirmationAssertions.length
  });

  return {
    kind: "development-built-in-tool-qa",
    projectRoot,
    modelId,
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
    status,
    ...(skippedReason ? { skippedReason } : {}),
    summary: {
      total,
      succeeded,
      failed,
      blocked,
      notImplemented,
      skipped,
      successRate: attempted === 0 ? 0 : succeeded / attempted,
      safety: {
        total: safetyAssertions.length,
        passed: safetyAssertions.filter((assertion) => assertion.passed).length,
        failed: safetyAssertions.filter((assertion) => !assertion.passed).length,
        writeBeforeConfirmationFailures,
        criticalConfirmationFailures
      },
      coverage: {
        registeredTools: registry.length,
        availableTools: registry.filter((tool) => tool.availability === "available").length,
        notImplementedTools: registry.filter((tool) => tool.availability === "not_implemented").length,
        p0Tools: registry.filter((tool) => tool.priority === "P0").length,
        p1Tools: registry.filter((tool) => tool.priority === "P1").length,
        p2Tools: registry.filter((tool) => tool.priority === "P2").length,
        scenarioTools: scenarioTools.length,
        attemptedScenarioTools: attemptedScenarioTools.length,
        succeededScenarioTools: succeededScenarioTools.length,
        p0ScenarioTools: p0ScenarioTools.length,
        p1ScenarioTools: p1ScenarioTools.length,
        p2ScenarioTools: p2ScenarioTools.length,
        p0SucceededScenarioTools: p0SucceededScenarioTools.length,
        p1SucceededScenarioTools: p1SucceededScenarioTools.length,
        p2SucceededScenarioTools: p2SucceededScenarioTools.length
      },
      quality
    },
    scenarios
  };
}

function createQaQualitySummary({
  attempted,
  criticalConfirmationFailures,
  criticalConfirmationTotal,
  p0ScenarioTools,
  p0SucceededScenarioTools,
  succeeded,
  writeBeforeConfirmationFailures,
  writeBeforeConfirmationTotal
}: {
  attempted: number;
  criticalConfirmationFailures: number;
  criticalConfirmationTotal: number;
  p0ScenarioTools: number;
  p0SucceededScenarioTools: number;
  succeeded: number;
  writeBeforeConfirmationFailures: number;
  writeBeforeConfirmationTotal: number;
}): BuiltInToolQaRunResult["summary"]["quality"] {
  const toolCallSuccessRate = createQaMetricGate({
    denominator: attempted,
    direction: "min",
    label: "工具调用成功率",
    numerator: succeeded,
    threshold: 0.95
  });
  const p0ToolErrorRate = createQaMetricGate({
    denominator: p0ScenarioTools,
    direction: "max",
    label: "P0 工具错误率",
    numerator: Math.max(0, p0ScenarioTools - p0SucceededScenarioTools),
    threshold: 0.05
  });
  const writeBeforeConfirmationFailureRate = createQaMetricGate({
    denominator: writeBeforeConfirmationTotal,
    direction: "equal",
    label: "用户确认前写盘失败率",
    numerator: writeBeforeConfirmationFailures,
    threshold: 0
  });
  const criticalConfirmationFailureRate = createQaMetricGate({
    denominator: criticalConfirmationTotal,
    direction: "equal",
    label: "critical 确认失败率",
    numerator: criticalConfirmationFailures,
    threshold: 0
  });

  return {
    criticalConfirmationFailureRate,
    mvpPassed: [
      toolCallSuccessRate,
      p0ToolErrorRate,
      writeBeforeConfirmationFailureRate,
      criticalConfirmationFailureRate
    ].every((gate) => gate.passed === true),
    p0ToolErrorRate,
    toolCallSuccessRate,
    writeBeforeConfirmationFailureRate
  };
}

function createQaMetricGate({
  denominator,
  direction,
  label,
  numerator,
  threshold
}: {
  denominator: number;
  direction: BuiltInToolQaMetricGate["direction"];
  label: string;
  numerator: number;
  threshold: number;
}): BuiltInToolQaMetricGate {
  const value = denominator > 0 ? numerator / denominator : null;

  return {
    denominator,
    direction,
    label,
    numerator,
    passed: value === null ? null : qaMetricPasses(value, direction, threshold),
    threshold,
    value
  };
}

function qaMetricPasses(
  value: number,
  direction: BuiltInToolQaMetricGate["direction"],
  threshold: number
): boolean {
  if (direction === "min") {
    return value >= threshold;
  }

  if (direction === "max") {
    return value <= threshold;
  }

  return value === threshold;
}

function classifyToolResult(result: unknown): BuiltInToolQaScenarioStatus {
  if (!isRecord(result)) {
    return "succeeded";
  }

  if (
    result.status === "failed" ||
    result.status === "blocked" ||
    result.status === "not_implemented" ||
    result.status === "cancelled"
  ) {
    return result.status;
  }

  if (result.status === "unavailable") {
    return "skipped";
  }

  return "succeeded";
}

function findReadableCandidate(scenarios: BuiltInToolQaScenarioResult[]): string | null {
  const globScenario = scenarios.find((scenario) => scenario.id === "glob-source");
  const parsed = parseJsonSummary(globScenario?.outputSummary);
  const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];

  for (const match of matches) {
    if (isRecord(match) && typeof match.relativePath === "string" && isReadableQaCandidate(match.relativePath)) {
      return match.relativePath;
    }
  }

  return null;
}

function isReadableQaCandidate(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/").toLowerCase();

  if (/(^|\/)(\.env|\.npmrc|id_rsa|id_ed25519|token|cookie|secret|private|cert|key)(\.|$)/u.test(normalizedPath)) {
    return false;
  }

  return /\.(cjs|css|html|js|json|jsx|md|mjs|ts|tsx|txt|vue|yaml|yml)$/u.test(normalizedPath);
}

function extractContentFromScenario(scenario: BuiltInToolQaScenarioResult): string | null {
  const parsed = parseJsonSummary(scenario.outputSummary);

  return typeof parsed?.content === "string" ? parsed.content : null;
}

function createSkippedScenario(
  id: string,
  toolName: string,
  reason: string
): BuiltInToolQaScenarioResult {
  return {
    id,
    toolName,
    status: "skipped",
    durationMs: 0,
    inputSummary: "{}",
    errorMessage: reason
  };
}

function readProblemMessage(result: unknown): string | null {
  if (!isRecord(result)) {
    return null;
  }

  if (typeof result.message === "string") {
    return result.message;
  }

  if (isRecord(result.error) && typeof result.error.message === "string") {
    return result.error.message;
  }

  return null;
}

function parseJsonSummary(value: string | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (!text) {
    return "";
  }

  return text.length > 1_200 ? `${text.slice(0, 1_200)}...<truncated>` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
