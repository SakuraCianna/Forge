import test from "node:test";
import assert from "node:assert/strict";
import { formatBuiltInToolCatalogForPrompt } from "../src/shared/builtInToolPromptContext.js";
import { builtInToolDefinitions } from "../src/shared/builtInToolCatalog.js";

test("built-in tool prompt context exposes catalog and safety rules", () => {
  const prompt = formatBuiltInToolCatalogForPrompt();

  assert.match(prompt, /Forge Built-in Tools/u);
  assert.match(prompt, /"tool": "built_in_tool"/u);
  assert.match(prompt, /Full Access mode, Forge auto-executes/u);
  assert.match(prompt, /Before any code or file mutation/u);
  assert.match(prompt, /previewDiff or proposeEdit/u);
  assert.match(prompt, /Use exact tool names and input field names/u);
  assert.match(prompt, /Never read, search, summarize, or inject sensitive project files/u);
  assert.match(prompt, /\.env, private keys, certificates, tokens, cookies/u);
  assert.match(prompt, /include a concrete validation step/u);
  assert.match(prompt, /current public docs, package behavior, API changes/u);
  assert.match(prompt, /webSearch, fetchDocs, or fetchUrl/u);
  assert.match(prompt, /fails, is unavailable, is blocked, or is not_implemented/u);
  assert.match(prompt, /not_implemented/u);

  for (const tool of builtInToolDefinitions) {
    assert.match(prompt, new RegExp(`\\b${tool.name}\\b`, "u"), tool.name);
  }
});

test("built-in tool prompt can omit not implemented tools for compact contexts", () => {
  const prompt = formatBuiltInToolCatalogForPrompt({ includeUnavailable: false });

  assert.match(prompt, /\breadFile\b/u);
  assert.match(prompt, /\bsearchSemantic\b/u);
  assert.match(prompt, /\btakeScreenshot\b/u);
  assert.match(prompt, /\binspectPageConsole\b/u);
});
