import assert from "node:assert/strict";
import test from "node:test";

import type { AgentAction } from "../src/shared/agentExecutionPlan.js";
import { supplementBareProjectScaffoldActions } from "../src/renderer/src/agent/agentScaffoldPlanQuality.js";
import { createFileChangeTaskPrompt } from "../src/renderer/src/agent/fileChangeTaskPrompt.js";
import type { TaskThread } from "../src/renderer/src/state/taskThreads.js";

const studentManagerPrompt =
  "写一个前后端分离项目，前端是vue3，后端是springboot 3.5.7，做一个简单的学生管理程序，数据库用h2，目前只需要能在前端展示学生列表即可";

test("bare Spring Boot Vue H2 student scaffold gains contract and verification actions", () => {
  const result = supplementBareProjectScaffoldActions({
    actions: [],
    bareProject: true,
    isCreationTask: true,
    prompt: studentManagerPrompt
  });
  const actionTargets = result.actions.map((action) => action.target ?? action.command);

  assert.ok(actionTargets.includes("Backend/pom.xml"));
  assert.ok(actionTargets.includes("Backend/src/main/resources/data.sql"));
  assert.ok(
    actionTargets.includes(
      "Backend/src/test/java/com/example/studentmanager/controller/StudentControllerTest.java"
    )
  );
  assert.ok(actionTargets.includes("Frontend/src/api/students.ts"));
  assert.ok(actionTargets.includes("Frontend/tsconfig.json"));
  assert.ok(actionTargets.includes("mvn -f Backend/pom.xml test"));
  assert.ok(actionTargets.includes("npm --prefix Frontend run build"));
  assert.ok(result.missingLayers.includes("dataSeed"));
  assert.ok(result.missingLayers.includes("backendContractTest"));
  assert.ok(result.missingLayers.includes("frontendApiClient"));
});

test("bare scaffold supplements run before existing verification commands", () => {
  const result = supplementBareProjectScaffoldActions({
    actions: [createRunAction("action-1", "mvn -f Backend/pom.xml test")],
    bareProject: true,
    isCreationTask: true,
    prompt: studentManagerPrompt
  });
  const actionTargets = result.actions.map((action) => action.target ?? action.command);
  const dataSeedIndex = actionTargets.indexOf("Backend/src/main/resources/data.sql");
  const verificationIndex = actionTargets.indexOf("mvn -f Backend/pom.xml test");

  assert.ok(dataSeedIndex >= 0);
  assert.ok(verificationIndex >= 0);
  assert.ok(dataSeedIndex < verificationIndex);
});

test("bare separated scaffold normalizes lowercase frontend and backend roots", () => {
  const result = supplementBareProjectScaffoldActions({
    actions: [
      createEditAction("action-1", "pom.xml"),
      createEditAction("action-2", "backend/src/main/resources/data.sql"),
      createEditAction("action-3", "frontend/src/App.vue"),
      createRunAction("action-4", "mvn -f backend/pom.xml test"),
      createRunAction("action-5", "npm --prefix frontend run build")
    ],
    bareProject: true,
    isCreationTask: true,
    prompt: studentManagerPrompt
  });
  const actionTargets = result.actions.map((action) => action.target ?? action.command);

  assert.ok(actionTargets.includes("Backend/pom.xml"));
  assert.ok(actionTargets.includes("Backend/src/main/resources/data.sql"));
  assert.ok(actionTargets.includes("Frontend/src/App.vue"));
  assert.ok(actionTargets.includes("mvn -f Backend/pom.xml test"));
  assert.ok(actionTargets.includes("npm --prefix Frontend run build"));
  assert.ok(!actionTargets.includes("backend/src/main/resources/data.sql"));
  assert.ok(!actionTargets.includes("frontend/src/App.vue"));
});

test("bare Vue TypeScript scaffold supplements missing frontend config files", () => {
  const result = supplementBareProjectScaffoldActions({
    actions: [
      createEditAction("action-1", "Frontend/package.json"),
      createEditAction("action-2", "Frontend/vite.config.ts")
    ],
    bareProject: true,
    isCreationTask: true,
    prompt: studentManagerPrompt
  });
  const actionTargets = result.actions.map((action) => action.target ?? action.command);

  assert.ok(actionTargets.includes("Frontend/package.json"));
  assert.ok(actionTargets.includes("Frontend/vite.config.ts"));
  assert.ok(actionTargets.includes("Frontend/index.html"));
  assert.ok(actionTargets.includes("Frontend/tsconfig.json"));
});

test("file change prompt repeats full-stack scaffold consistency guardrails", () => {
  const actions: AgentAction[] = [
    createEditAction("action-1", "Backend/src/main/java/com/example/studentmanager/entity/Student.java"),
    createEditAction("action-2", "Backend/src/main/resources/data.sql"),
    createEditAction("action-3", "Frontend/src/App.vue")
  ];
  const thread = {
    id: "thread-1",
    title: "Student manager",
    prompt: studentManagerPrompt,
    status: "planned",
    modelId: "deepseek-v4-flash",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-07T00:00:00.000Z",
    agentActions: actions,
    events: []
  } satisfies TaskThread;

  const prompt = createFileChangeTaskPrompt(thread, "Frontend/src/App.vue", actions[2]);

  assert.match(prompt, /Scaffold consistency guardrails/u);
  assert.match(prompt, /Backend\/.+Frontend\//u);
  assert.match(prompt, /id, name, age, gender/u);
  assert.match(prompt, /fetchStudents/u);
  assert.match(prompt, /GET \/api\/students/u);
  assert.match(prompt, /Do not import Lombok/u);
  assert.match(prompt, /H2 schema or seed files/u);
  assert.match(prompt, /@Table\(name = "students"\)/u);
  assert.match(prompt, /relative \/api request/u);
  assert.match(prompt, /tsconfig\.json/u);
});

function createEditAction(id: string, target: string): AgentAction {
  return {
    id,
    stepId: id,
    kind: "edit-file",
    label: `创建 ${target}`,
    status: "pending",
    target
  };
}

function createRunAction(id: string, command: string): AgentAction {
  return {
    id,
    stepId: id,
    kind: "run-command",
    label: `运行命令 ${command}`,
    status: "pending",
    command
  };
}
