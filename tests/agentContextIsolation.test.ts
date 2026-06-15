import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectMemoryWriteRequest,
  extractAgentMemoryCandidate,
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
