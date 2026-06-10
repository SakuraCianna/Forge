import test from "node:test";
import assert from "node:assert/strict";
import { createComposerSuggestions } from "../src/renderer/src/state/pluginSkills.js";

test("slash command menu exposes init and context compaction commands", () => {
  const commands = createComposerSuggestions({
    language: "zh-CN",
    pluginCatalog: [],
    query: "",
    trigger: "/"
  });

  assert.ok(
    commands.some(
      (command) =>
        command.kind === "command" &&
        command.actionId === "init" &&
        command.label === "初始化" &&
        /AGENTS\.md/u.test(command.description)
    )
  );
  assert.ok(
    commands.some(
      (command) =>
        command.kind === "command" &&
        command.actionId === "compact" &&
        command.label === "压缩上下文"
    )
  );
});

test("slash command search can find opencode-style init command", () => {
  const commands = createComposerSuggestions({
    language: "en-US",
    pluginCatalog: [],
    query: "init",
    trigger: "/"
  });

  assert.deepEqual(commands.map((command) => command.actionId), ["init"]);
});
