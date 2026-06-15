import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompactedProjectMemoryWriteRequest,
  createProjectMemoryWriteFailureEvent,
  createProjectMemoryWriteRequest,
  extractAgentMemoryCandidate,
  formatProjectMemoryWriteFailure,
  mergeAgentMemoriesWithProjectScan,
  selectRelevantAgentMemoriesForProject,
  selectRelevantAgentMemories,
  type AgentMemoryEntry
} from "../src/renderer/src/state/agentMemory.js";
import { canAppendDirectAnswerToThread } from "../src/renderer/src/state/conversationRouting.js";

function memory(
  id: string,
  scope: AgentMemoryEntry["scope"],
  projectPath: string | null,
  content: string
): AgentMemoryEntry {
  return {
    id,
    scope,
    projectPath,
    content,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z"
  };
}

test("project-bound memory retrieval excludes global and other-project memories", () => {
  const result = selectRelevantAgentMemories(
    [
      memory("global", "global", null, "Use Flask for old wedding site project"),
      memory("current", "project", "E:\\CodeHome\\Forge", "Forge uses Electron and React"),
      memory("other", "project", "E:\\CodeHome\\Other", "Other project uses Flask")
    ],
    "e:\\codehome\\forge",
    8,
    "explain this project"
  );

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["current"]
  );
});

test("projectless memory retrieval can use global memories", () => {
  const result = selectRelevantAgentMemories(
    [
      memory("global", "global", null, "Preferred answer style is concise"),
      memory("project", "project", "E:\\CodeHome\\Forge", "Forge-specific note")
    ],
    null,
    8,
    "answer style"
  );

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["global"]
  );
});

test("explicit project memories can be mirrored into MEMORY.md writes", () => {
  const candidate = extractAgentMemoryCandidate(
    "请记住 Forge 修改代码前先读真实文件",
    "E:\\CodeHome\\Forge"
  );

  assert.ok(candidate);

  const request = createProjectMemoryWriteRequest(candidate);

  assert.ok(request);
  assert.equal(request.toolName, "writeProjectMemory");
  assert.equal(request.projectRoot, "E:\\CodeHome\\Forge");
  assert.equal(request.input.content, "Forge 修改代码前先读真实文件");
  assert.match(request.input.id, /^explicit-/u);
  assert.deepEqual(request.input.tags, ["explicit"]);
});

test("global memories stay in local storage instead of project MEMORY.md", () => {
  const candidate = extractAgentMemoryCandidate("remember answer in concise Chinese", null);

  assert.ok(candidate);
  assert.equal(createProjectMemoryWriteRequest(candidate), null);
});

test("compacted project context can become an automatic MEMORY.md write", () => {
  const request = createCompactedProjectMemoryWriteRequest({
    id: "thread-compact",
    projectPath: "E:\\CodeHome\\Forge",
    contextCompaction: {
      content:
        "## Decisions\nForge should mirror durable project rules into MEMORY.md after explicit remember requests.\n\n## Verified commands\nnpm test and npm run typecheck passed for the memory bridge.",
      createdAt: "2026-06-15T10:00:00.000Z",
      estimatedTokensAfter: 120,
      estimatedTokensBefore: 980,
      reason: "auto",
      retainedEventCount: 6,
      sourceEventCount: 18
    }
  });

  assert.ok(request);
  assert.equal(request.toolName, "writeProjectMemory");
  assert.equal(request.projectRoot, "E:\\CodeHome\\Forge");
  assert.equal(request.input.id, "compact-thread-compact");
  assert.match(request.input.content, /Forge should mirror durable project rules into MEMORY\.md/u);
  assert.deepEqual(request.input.tags, ["auto-memory", "compaction", "auto"]);
});

test("compacted context memory writes require a project and useful summary", () => {
  assert.equal(
    createCompactedProjectMemoryWriteRequest({
      id: "global-thread",
      contextCompaction: {
        content: "## Short\nToo small",
        createdAt: "2026-06-15T10:00:00.000Z",
        estimatedTokensAfter: 12,
        estimatedTokensBefore: 60,
        reason: "manual",
        retainedEventCount: 1,
        sourceEventCount: 2
      }
    }),
    null
  );
  assert.equal(
    createCompactedProjectMemoryWriteRequest({
      id: "project-thread",
      projectPath: "E:\\CodeHome\\Forge",
      contextCompaction: {
        content: "## Short\nToo small",
        createdAt: "2026-06-15T10:00:00.000Z",
        estimatedTokensAfter: 12,
        estimatedTokensBefore: 60,
        reason: "manual",
        retainedEventCount: 1,
        sourceEventCount: 2
      }
    }),
    null
  );
});

test("MEMORY.md managed entries become project scoped agent memories", () => {
  const memories = mergeAgentMemoriesWithProjectScan([], {
    rootPath: "E:\\CodeHome\\Forge",
    files: [],
    truncated: false,
    instructionFiles: [
      {
        relativePath: "MEMORY.md",
        truncated: false,
        content: [
          "# MEMORY.md",
          "",
          "<!-- forge-memory:managed:start -->",
          "## Forge Managed Memories",
          "",
          '- <!-- forge-memory-entry id="ipc-boundary" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture,explicit" --> Forge renderer must access fs through main-process IPC.',
          "",
          "<!-- forge-memory:managed:end -->"
        ].join("\n")
      }
    ]
  });
  const relevant = selectRelevantAgentMemories(
    memories,
    "E:\\CodeHome\\Forge",
    8,
    "renderer fs boundary"
  );

  assert.deepEqual(
    relevant.map((entry) => ({
      id: entry.id,
      scope: entry.scope,
      projectPath: entry.projectPath,
      content: entry.content,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })),
    [
      {
        id: "memory-md:ipc-boundary",
        scope: "project",
        projectPath: "E:\\CodeHome\\Forge",
        content: "Forge renderer must access fs through main-process IPC.",
        createdAt: "2026-06-15T09:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      }
    ]
  );
});

test("MEMORY.md managed entries do not duplicate local project memories", () => {
  const memories = mergeAgentMemoriesWithProjectScan(
    [
      memory(
        "local-ipc",
        "project",
        "E:\\CodeHome\\Forge",
        "Forge renderer must access fs through main-process IPC."
      )
    ],
    {
      rootPath: "E:\\CodeHome\\Forge",
      files: [],
      truncated: false,
      instructionFiles: [
        {
          relativePath: "MEMORY.md",
          truncated: false,
          content:
            '<!-- forge-memory:managed:start -->\n- <!-- forge-memory-entry id="ipc-boundary" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture" --> Forge renderer must access fs through main-process IPC.\n<!-- forge-memory:managed:end -->'
        }
      ]
    }
  );

  assert.deepEqual(
    memories.map((entry) => entry.id),
    ["local-ipc"]
  );
});

test("project memory selection includes MEMORY.md managed memories", () => {
  const relevant = selectRelevantAgentMemoriesForProject({
    agentMemories: [],
    projectScan: {
      rootPath: "E:\\CodeHome\\Forge",
      files: [],
      truncated: false,
      instructionFiles: [
        {
          relativePath: "MEMORY.md",
          truncated: false,
          content:
            '<!-- forge-memory:managed:start -->\n- <!-- forge-memory-entry id="ipc-boundary" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture" --> Forge renderer must access fs through main-process IPC.\n<!-- forge-memory:managed:end -->'
        }
      ]
    },
    query: "检查 renderer fs boundary 约定"
  });

  assert.deepEqual(
    relevant.map((entry) => entry.id),
    ["memory-md:ipc-boundary"]
  );
});

test("MEMORY.md managed memories are redacted before model injection", () => {
  const memories = mergeAgentMemoriesWithProjectScan([], {
    rootPath: "E:\\CodeHome\\Forge",
    files: [],
    truncated: false,
    instructionFiles: [
      {
        relativePath: "MEMORY.md",
        truncated: false,
        content:
          '<!-- forge-memory:managed:start -->\n- <!-- forge-memory-entry id="secret-note" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="secret" --> Deployment uses api_key=sk-1234567890abcdef and Authorization: Bearer ghp_1234567890abcdef plus AKIA1234567890ABCDEF.\n<!-- forge-memory:managed:end -->'
      }
    ]
  });
  const content = memories[0]?.content ?? "";

  assert.match(content, /api_key=\[redacted\]/u);
  assert.match(content, /Bearer \[redacted\]/u);
  assert.match(content, /\[redacted aws access key\]/u);
  assert.doesNotMatch(content, /sk-1234567890abcdef/u);
  assert.doesNotMatch(content, /ghp_1234567890abcdef/u);
  assert.doesNotMatch(content, /AKIA1234567890ABCDEF/u);
});

test("project memory write failures become auditable non-blocking thread events", () => {
  const message = formatProjectMemoryWriteFailure(
    "zh-CN",
    "内置工具 writeProjectMemory 执行失败: disk is read-only"
  );
  const event = createProjectMemoryWriteFailureEvent({
    createdAt: "2026-06-15T08:30:00.000Z",
    message,
    threadId: "thread-1"
  });

  assert.equal(message, "项目 MEMORY.md 记忆写入失败: 内置工具 writeProjectMemory 执行失败: disk is read-only");
  assert.deepEqual(event, {
    id: "thread-1-memory-write-error-2026-06-15T08:30:00.000Z",
    kind: "error",
    message,
    createdAt: "2026-06-15T08:30:00.000Z"
  });
});

test("direct answer follow-up cannot append across different project scopes", () => {
  assert.equal(
    canAppendDirectAnswerToThread("E:\\CodeHome\\OldProject", "E:\\CodeHome\\Forge"),
    false
  );
});

test("direct answer follow-up can append inside the same project scope", () => {
  assert.equal(
    canAppendDirectAnswerToThread("E:\\CodeHome\\Forge", "e:\\codehome\\forge"),
    true
  );
});
