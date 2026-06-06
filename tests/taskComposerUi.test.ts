import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("composer keeps plugin and skill context labels out of prompt text", async () => {
  const source = await readFile("src/renderer/src/components/TaskComposer.tsx", "utf8");

  assert.match(source, /function getSuggestionPromptInsertText/u);
  assert.match(
    source,
    /suggestion\.kind === "plugin" \|\| suggestion\.kind === "skill" \? "" : suggestion\.insertText/u
  );
  assert.match(source, /const promptFragment = getSuggestionPromptInsertText\(suggestion\);/u);
  assert.match(source, /insertPromptFragment\(promptTrigger\.start, promptTrigger\.end, promptFragment\);/u);
});

test("composer context chips use compact typography", async () => {
  const source = await readFile("src/renderer/src/components/TaskComposer.tsx", "utf8");

  assert.match(source, /h-6 max-w-\[220px\]/u);
  assert.match(source, /text-\[12px\]/u);
  assert.match(source, /leading-4/u);
});
