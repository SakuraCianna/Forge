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
  assert.match(source, /Separate discovery, mutation, and verification/u);
  assert.match(source, /plan web_search, fetchDocs, or another reliable documentation lookup/u);
  assert.match(source, /Do not include commit, branch switch, revert, dependency install, push, delete/u);
});

test("file change and direct answer prompts keep honesty and compatibility constraints", async () => {
  const source = await readFile("src/main/agentPlanService.ts", "utf8");

  assert.match(source, /Use the current file content as the source of truth/u);
  assert.match(source, /Do not remove existing behavior, exports, validation, accessibility/u);
  assert.match(source, /Do not silence failures by deleting code, weakening checks/u);
  assert.match(source, /table names and columns must exactly match the entity mapping/u);
  assert.match(source, /do not call getStudents if the API client exports fetchStudents/u);
  assert.match(source, /Separate verified facts from assumptions/u);
  assert.match(source, /Do not invent files, APIs, config keys, command outputs, tests/u);
});
