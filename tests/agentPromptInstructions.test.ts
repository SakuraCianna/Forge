import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("agent system instructions preserve evidence, scope and verification guardrails", async () => {
  const source = await readFile("src/main/agentPlanService.ts", "utf8");

  assert.match(source, /Base decisions on observed files and tool results/u);
  assert.match(source, /plan an inspect step instead of guessing/u);
  assert.match(source, /Keep scope tight/u);
  assert.match(source, /Never delete features, comment out core logic, hide errors, or bypass validation/u);
  assert.match(source, /backend files under Backend\/ and Vite frontend files under Frontend\//u);
  assert.match(source, /TypeScript project config required by the queued build command/u);
  assert.match(source, /observable acceptance signal/u);
  assert.match(source, /minimal but production-shaped code/u);
  assert.match(source, /Follow a durable software engineering workflow/u);
  assert.match(source, /inspect the current project, design the smallest coherent change/u);
  assert.match(source, /Treat verification as part of implementation/u);
  assert.match(source, /Finish with auditable evidence/u);
  assert.match(source, /Treat the project file list as a budgeted overview/u);
  assert.match(source, /Do not assume omitted files are absent/u);
  assert.match(source, /Separate discovery, mutation, and verification/u);
  assert.match(source, /plan web_search, fetchDocs, or another reliable documentation lookup/u);
  assert.match(source, /Do not include commit, branch switch, revert, dependency install, push, delete/u);
  assert.match(source, /Example shape:/u);
});

test("file change and direct answer prompts keep honesty and compatibility constraints", async () => {
  const source = await readFile("src/main/agentPlanService.ts", "utf8");

  assert.match(source, /Use the current file content as the source of truth/u);
  assert.match(source, /natural first token/u);
  assert.match(source, /Do not remove existing behavior, exports, validation, accessibility/u);
  assert.match(source, /Do not silence failures by deleting code, weakening checks/u);
  assert.match(source, /self-check imports, exports, package declarations/u);
  assert.match(source, /table names and columns must exactly match the entity mapping/u);
  assert.match(source, /do not call getStudents if the API client exports fetchStudents/u);
  assert.match(source, /Separate verified facts from assumptions/u);
  assert.match(source, /Treat budgeted project context as a partial index/u);
  assert.match(source, /Do not invent files, APIs, config keys, command outputs, tests/u);
});

test("agent action prompts use tagged context and explicit self-checks", async () => {
  const fileChangeSource = await readFile("src/renderer/src/agent/fileChangeTaskPrompt.ts", "utf8");
  const failureSource = await readFile("src/renderer/src/agent/failureFixPrompt.ts", "utf8");
  const continuationSource = await readFile(
    "src/renderer/src/agent/continuationPlanPrompt.ts",
    "utf8"
  );

  assert.match(fileChangeSource, /formatPromptSection/u);
  assert.match(fileChangeSource, /"original_task"/u);
  assert.match(fileChangeSource, /"target_file"/u);
  assert.match(fileChangeSource, /"scaffold_consistency_guardrails"/u);
  assert.match(fileChangeSource, /matching imports\/exports/u);
  assert.match(failureSource, /"failure_context"/u);
  assert.match(failureSource, /"recovery_instructions"/u);
  assert.match(continuationSource, /"continuation_instructions"/u);
  assert.match(continuationSource, /does not skip required validation/u);
});
