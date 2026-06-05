import test from "node:test";
import assert from "node:assert/strict";
import { getRequiredAgentPermissionForBuiltInTool } from "../src/shared/builtInToolAgentPermissions.js";

test("built-in tool permissions distinguish read, edit, command, git and web capabilities", () => {
  assert.equal(getRequiredAgentPermissionForBuiltInTool("readFile"), "read");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("createFile"), "edit");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("deleteFile"), "edit");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("getDiagnostics"), "read");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("runTypecheck"), "command");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("getGitStatus"), "git");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("webSearch"), "web");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("fetchDocs"), "web");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("openBrowserPreview"), "web");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("readProjectMemory"), "read");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("writeProjectMemory"), "edit");
  assert.equal(getRequiredAgentPermissionForBuiltInTool("updateProjectInstructions"), "edit");
});
