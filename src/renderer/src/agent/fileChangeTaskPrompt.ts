// 本文件说明: 为 Agent 文件修改请求补充动作级上下文, 提升多文件执行准确度
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";

// 生成文件修改任务提示, 让模型知道当前动作在整个执行队列里的位置
export function createFileChangeTaskPrompt(
  thread: TaskThread,
  relativePath: string,
  action?: AgentAction | null,
  options: { toolResults?: string[] } = {}
): string {
  const actionQueueContext = formatActionQueueContext(thread.agentActions ?? [], action?.id ?? null);
  const currentActionContext = action ? formatCurrentActionContext(action) : null;
  const toolResultContext = formatControlledToolResultContext(thread, options.toolResults ?? []);
  const scaffoldConsistencyContext = formatScaffoldConsistencyContext(
    thread.prompt,
    thread.agentActions ?? []
  );

  return [
    formatPromptSection("original_task", thread.prompt),
    formatPromptSection("target_file", relativePath),
    currentActionContext ? formatPromptSection("current_edit_action", currentActionContext) : null,
    actionQueueContext ? formatPromptSection("action_queue", actionQueueContext) : null,
    scaffoldConsistencyContext
      ? formatPromptSection("scaffold_consistency_guardrails", scaffoldConsistencyContext)
      : null,
    toolResultContext ? formatPromptSection("prior_controlled_tool_results", toolResultContext) : null,
    formatPromptSection(
      "file_change_instructions",
      [
        "Rewrite only the target file shown above.",
        "Satisfy the current edit action first, then preserve the original task intent.",
        "If the target file is empty, create the complete file content from scratch.",
        "Before returning, check that this file has matching imports/exports, valid references to companion files, and no undeclared dependencies.",
        "Do not invent changes for other files. Mention required follow-up files only through the execution plan, not inside this file."
      ].join("\n")
    )
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function formatPromptSection(name: string, content: string): string {
  return `<${name}>\n${content.trim()}\n</${name}>`;
}

function formatScaffoldConsistencyContext(prompt: string, actions: AgentAction[]): string | null {
  if (!hasScaffoldConsistencyRisk(prompt, actions)) {
    return null;
  }

  const normalizedPrompt = prompt.toLocaleLowerCase();
  const isStudentTask = /(学生|student)/iu.test(prompt);
  const isSpringBoot = /spring\s*boot|springboot/u.test(normalizedPrompt);
  const isH2 = /\bh2\b/u.test(normalizedPrompt);
  const isVueOrVite = /\bvue\b|vue3|vue\s*3|\bvite\b/u.test(normalizedPrompt);
  const hasBackendAndFrontend =
    /(前后端|frontend|front-end|client|前端)/iu.test(prompt) &&
    /(backend|back-end|server|后端|接口|api|spring)/iu.test(prompt);
  const lines = [
    "Use one shared contract across all queued files before writing this file."
  ];

  if (hasBackendAndFrontend && isSpringBoot) {
    lines.push(
      "For a new separated Spring Boot + frontend scaffold, keep backend files under Backend/, frontend files under Frontend/, run Maven as mvn -f Backend/pom.xml ..., and run frontend package commands as npm --prefix Frontend ... unless the existing repository or user explicitly names different roots."
    );
  }

  if (isStudentTask) {
    lines.push(
      "For a simple student-list task with no custom fields requested, keep the Student shape minimal and stable: id, name, age, gender. Do not add email, studentClass, className, or other fields unless the original task explicitly asks for them.",
      "Use one frontend API function name consistently; prefer fetchStudents, export it from src/api/students.ts, and import/call that exact symbol from Vue components."
    );
  }

  if (hasBackendAndFrontend) {
    lines.push(
      isStudentTask
        ? "Use GET /api/students for the student list unless the existing plan already establishes a different route; backend route, frontend client path, JSON fields, and rendered columns must match exactly."
        : "Backend route, frontend client path, JSON fields, and rendered columns must match exactly."
    );
  }

  if (isSpringBoot) {
    lines.push(
      "Do not import Lombok or use Lombok annotations unless the Maven/Gradle file declares Lombok; otherwise write plain Java constructors, getters, and setters."
    );
  }

  if (isH2) {
    lines.push(
      "For H2 schema or seed files, every table and column must match the JPA entity mapping exactly; do not seed columns that the entity does not define.",
      'For Spring Data JPA + data.sql, either provide matching schema.sql or configure spring.jpa.defer-datasource-initialization=true; for the default student demo use @Table(name = "students") and insert into students (id, name, age, gender).'
    );
  }

  if (isVueOrVite) {
    lines.push(
      "For Vue/Vite frontend files, prefer a relative /api request through vite.config proxy instead of hardcoding http://localhost origins inside components.",
      "For new separated Vue/Vite scaffolds, keep frontend files under Frontend/.",
      "For Vue/Vite TypeScript scaffolds, include tsconfig.json and make sure package scripts reference only locally declared dependencies."
    );
  }

  lines.push(
    "Package files must declare the local tools used by queued verification commands, and tests should exercise the generated API contract when a backend is present.",
    "Before returning this file, self-check that imports have matching exports, generated commands point at existing folders, and the file does not rely on undeclared dependencies."
  );

  return lines.map((line) => `- ${line}`).join("\n");
}

function hasScaffoldConsistencyRisk(prompt: string, actions: AgentAction[]): boolean {
  const isCreationTask =
    /(创建|新建|生成|搭建|实现|做一个|写一个|开发|create|generate|scaffold|build|make|implement)/iu.test(
      prompt
    ) &&
    /(项目|工程|系统|应用|页面|接口|数据库|前端|后端|前后端|project|app|application|system|frontend|backend|spring|vue|react|vite|api)/iu.test(
      prompt
    );

  if (!isCreationTask) {
    return false;
  }

  const editTargets = actions
    .filter((action) => action.kind === "edit-file" && action.target)
    .map((action) => action.target ?? "");

  return (
    editTargets.length >= 3 ||
    /(前后端|spring\s*boot|springboot|\bvue\b|vue3|\bh2\b|frontend|backend)/iu.test(prompt)
  );
}

// 提取前置受控工具结果, 让后续编辑能利用目录, 搜索, glob 和 Git 检查输出
function formatControlledToolResultContext(thread: TaskThread, extraToolResults: string[]): string | null {
  const eventToolResults = thread.events
    .filter((event) => event.kind === "file" && isControlledToolResultMessage(event.message))
    .map((event) => event.message);
  const toolResults = [...eventToolResults, ...extraToolResults]
    .map((message) => message.trim())
    .filter(Boolean)
    .filter((message, index, current) => current.indexOf(message) === index)
    .slice(-6)
    .map((message) => truncateBlock(message));

  return toolResults.length > 0 ? toolResults.map((message) => `- ${message}`).join("\n") : null;
}

// 只把读类工具结果放进编辑上下文, 避免混入文件应用日志
function isControlledToolResultMessage(message: string): boolean {
  return /^(文件读取完成|File read complete|目录列表完成|Directory list complete|文件匹配完成|File glob complete|项目搜索完成|Project search complete|Git 状态完成|Git status complete):/u.test(
    message.trim()
  );
}

// 整理当前动作的关键字段, 避免只靠原始用户请求导致多文件步骤混淆
function formatCurrentActionContext(action: AgentAction): string {
  return [
    `Label: ${action.label}`,
    `Kind: ${action.kind}`,
    `Status: ${action.status}`,
    action.target ? `Target: ${action.target}` : null,
    action.command ? `Command: ${action.command}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

// 把动作队列压缩成短上下文, 让模型复用已完成步骤并聚焦当前文件
function formatActionQueueContext(actions: AgentAction[], currentActionId: string | null): string | null {
  if (actions.length === 0) {
    return null;
  }

  const maxActions = 12;
  const currentIndex =
    currentActionId === null ? 0 : Math.max(0, actions.findIndex((candidate) => candidate.id === currentActionId));
  const startIndex = Math.max(0, Math.min(currentIndex - 4, actions.length - maxActions));
  const visibleActions = actions.slice(startIndex, startIndex + maxActions);
  const lines = visibleActions.map((candidate) => formatActionQueueLine(candidate, currentActionId));

  if (startIndex > 0) {
    lines.unshift(`- ... ${startIndex} earlier actions omitted`);
  }

  const omittedAfter = actions.length - startIndex - visibleActions.length;

  if (omittedAfter > 0) {
    lines.push(`- ... ${omittedAfter} later actions omitted`);
  }

  return lines.join("\n");
}

// 把单个动作压成可读行, 保留目标和命令但限制长度
function formatActionQueueLine(action: AgentAction, currentActionId: string | null): string {
  const currentMarker = action.id === currentActionId ? ", current" : "";
  const details = [
    `kind=${action.kind}`,
    action.target ? `target=${truncateInline(action.target)}` : null,
    action.command ? `command=${truncateInline(action.command)}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(", ");

  return `- [${action.status}${currentMarker}] ${truncateInline(action.label)}${
    details ? ` (${details})` : ""
  }`;
}

// 压缩单行提示词内容, 防止长路径和长命令撑大上下文
function truncateInline(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

// 压缩多行工具输出, 保留前几行给模型判断后续编辑范围
function truncateBlock(value: string, maxLength = 1400): string {
  const normalized = value
    .split(/\r?\n/u)
    .slice(0, 24)
    .join("\n")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}
