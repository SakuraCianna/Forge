// 本文件说明: 统一登记 Forge 的 70 个 Built-in Tools 元数据
import type {
  BuiltInToolCategory,
  BuiltInToolDefinition,
  BuiltInToolRiskLevel,
  BuiltInToolConfirmation,
  BuiltInToolAvailability,
  BuiltInToolPriority,
  NotImplementedToolResult
} from "./builtInToolTypes.js";

type ToolOptions = {
  name: string;
  displayName?: string;
  description: string;
  category: BuiltInToolCategory;
  riskLevel: BuiltInToolRiskLevel;
  priority: BuiltInToolPriority;
  availability?: BuiltInToolAvailability;
  requiresConfirmation?: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
  confirmation?: BuiltInToolConfirmation;
};

type AutoExecuteOptions = {
  confirmed?: boolean;
  fullAccess?: boolean;
  secondConfirmed?: boolean;
};

const emptyObjectSchema = {
  type: "object",
  properties: {}
} as const;

const genericObjectSchema = {
  type: "object",
  properties: {
    status: { type: "string" }
  }
} as const;

export const builtInToolCategories: Array<{
  id: BuiltInToolCategory;
  label: string;
  description: string;
}> = [
  {
    id: "project",
    label: "Project 项目理解",
    description: "Understand project structure, metadata, entrypoints and relationships."
  },
  {
    id: "file",
    label: "File 文件系统",
    description: "Read and manage project files inside the selected project boundary."
  },
  {
    id: "search",
    label: "Search 搜索",
    description: "Find files, text, code patterns and diagnostic context."
  },
  {
    id: "edit",
    label: "Edit 编辑与补丁",
    description: "Prepare, preview and apply controlled project edits."
  },
  {
    id: "terminal",
    label: "Terminal 命令执行",
    description: "Run and manage local project commands under command safety policy."
  },
  {
    id: "git",
    label: "Git 版本控制",
    description: "Inspect and manage version-control state with explicit gates for mutations."
  },
  {
    id: "diagnostics",
    label: "Diagnostics 诊断验证",
    description: "Collect, parse and run validation checks."
  },
  {
    id: "auxiliary",
    label: "Web / Browser / Memory / Instructions 辅助能力",
    description: "Public web, browser, memory, instruction and context helpers."
  }
];

export const builtInToolDefinitions: BuiltInToolDefinition[] = [
  tool({
    name: "getProjectTree",
    description: "获取项目文件树, 让 Agent 快速了解项目结构。",
    category: "project",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "getProjectSummary",
    description: "生成或读取项目摘要, 理解项目技术栈、目录职责、入口文件。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getProjectMetadata",
    description: "读取 package.json、tsconfig、Vite、Electron 等项目元信息。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getEntrypoints",
    description: "识别 main、App、index.html、Electron main/preload/renderer 等入口文件。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getDependencyGraph",
    description: "分析模块之间 import/export 关系。",
    category: "project",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "getFileSymbols",
    description: "提取文件中的函数、类、组件、接口、导出项。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "findReferences",
    description: "查找函数、组件或变量引用, 用于改代码前判断影响范围。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getRelatedFiles",
    description: "根据当前文件查找组件、样式、测试、类型定义、调用方等相关文件。",
    category: "project",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "listFiles",
    description: "列出目录文件。",
    category: "file",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "readFile",
    description: "读取单个项目文件。",
    category: "file",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "readManyFiles",
    description: "批量读取多个项目文件。",
    category: "file",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "readFileChunk",
    description: "按行号或字节范围读取大文件的一部分, 避免上下文过载。",
    category: "file",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "statFile",
    description: "获取文件大小、修改时间、是否目录、是否二进制等信息。",
    category: "file",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "detectFileType",
    description: "检测文本、图片、PDF、二进制、音频、视频等文件类型。",
    category: "file",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "createFile",
    description: "创建新文件, 例如组件、配置、文档或测试文件。",
    category: "file",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("创建文件", "会在项目中写入新文件。", true, "文件")
  }),
  tool({
    name: "deleteFile",
    description: "删除项目文件。",
    category: "file",
    riskLevel: "critical",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: typedConfirmation("删除文件", "会从磁盘删除项目文件。", false, "文件名", "DELETE")
  }),
  tool({
    name: "moveFile",
    description: "移动或重命名项目文件。",
    category: "file",
    riskLevel: "high",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("移动文件", "会改变文件路径并影响引用。", true, "文件")
  }),
  tool({
    name: "copyFile",
    description: "复制文件, 例如复制模板、备份或生成类似文件。",
    category: "file",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("复制文件", "会在项目中写入复制文件。", true, "文件")
  }),
  tool({
    name: "searchText",
    description: "全文搜索关键词、函数名、错误信息。",
    category: "search",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "globFiles",
    description: "按 glob pattern 查找文件。",
    category: "search",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "searchRegex",
    description: "正则搜索代码模式。",
    category: "search",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "searchSemantic",
    description: "语义搜索代码或文档, 例如用户说登录逻辑在哪。",
    category: "search",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "searchDiagnostics",
    description: "根据当前错误、构建失败或类型错误反向定位相关代码。",
    category: "search",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "proposeEdit",
    description: "生成待审查修改, 不直接写入磁盘。",
    category: "edit",
    riskLevel: "medium",
    priority: "P0"
  }),
  tool({
    name: "applyEdit",
    description: "应用用户确认后的修改, 真正写入文件。",
    category: "edit",
    riskLevel: "high",
    priority: "P0",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("应用修改", "会把已审查内容写入项目文件。", true, "文件")
  }),
  tool({
    name: "applyPatch",
    description: "应用 unified diff 或结构化 patch。",
    category: "edit",
    riskLevel: "high",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("应用补丁", "会按补丁修改一个或多个项目文件。", true, "补丁")
  }),
  tool({
    name: "replaceText",
    description: "小范围替换文本片段。",
    category: "edit",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("替换文本", "会修改项目文件内容。", true, "文件")
  }),
  tool({
    name: "insertText",
    description: "插入函数、导入语句或配置项。",
    category: "edit",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("插入文本", "会修改项目文件内容。", true, "文件")
  }),
  tool({
    name: "formatFile",
    description: "调用项目 formatter 格式化指定文件。",
    category: "edit",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("格式化文件", "会重写目标文件的格式。", true, "文件")
  }),
  tool({
    name: "revertFile",
    description: "恢复某个文件到修改前状态, 撤销 Agent 的错误修改。",
    category: "edit",
    riskLevel: "high",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("恢复文件", "会撤销目标文件的当前修改。", false, "文件")
  }),
  tool({
    name: "previewDiff",
    description: "预览即将应用的 diff, 让用户审查。",
    category: "edit",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "runCommand",
    description: "运行终端命令, 例如 npm run build、typecheck 或 git status。",
    category: "terminal",
    riskLevel: "medium",
    priority: "P0",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行命令", "会在项目目录中启动本地命令。", true, "命令")
  }),
  tool({
    name: "stopCommand",
    description: "停止正在运行的命令。",
    category: "terminal",
    riskLevel: "medium",
    priority: "P0",
    requiresConfirmation: true,
    confirmation: singleConfirmation("停止命令", "会终止正在运行的进程。", false, "命令")
  }),
  tool({
    name: "listRunningCommands",
    description: "列出正在运行的命令, 管理后台任务。",
    category: "terminal",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "runPackageScript",
    description: "运行 package.json scripts, 比裸 runCommand 更安全。",
    category: "terminal",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行包脚本", "会执行项目 package script。", true, "脚本")
  }),
  tool({
    name: "installDependency",
    description: "安装依赖。",
    category: "terminal",
    riskLevel: "high",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("安装依赖", "会修改依赖目录和锁文件。", true, "依赖")
  }),
  tool({
    name: "detectPackageManager",
    description: "检测 npm、pnpm、yarn、bun。",
    category: "terminal",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getGitStatus",
    description: "查看 Git 状态。",
    category: "git",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "getGitDiff",
    description: "查看 Git diff, 审查改动。",
    category: "git",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "getGitLog",
    description: "查看提交历史, 理解最近改动或定位回归。",
    category: "git",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "getGitBlame",
    description: "查看某行代码的历史修改信息。",
    category: "git",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "createCommit",
    description: "创建 Git commit。",
    category: "git",
    riskLevel: "high",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("创建提交", "会写入 Git 历史。", true, "提交")
  }),
  tool({
    name: "createBranch",
    description: "创建任务隔离分支。",
    category: "git",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("创建分支", "会创建本地 Git 分支。", true, "分支")
  }),
  tool({
    name: "checkoutBranch",
    description: "切换 Git 分支。",
    category: "git",
    riskLevel: "critical",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: typedConfirmation("切换分支", "会改变工作区基准分支。", false, "分支名", "CHECKOUT")
  }),
  tool({
    name: "createWorktree",
    description: "创建 Git worktree, 隔离任务开发环境。",
    category: "git",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("创建工作树", "会在仓库旁创建新目录。", true, "目录")
  }),
  tool({
    name: "revertChanges",
    description: "撤销未提交修改。",
    category: "git",
    riskLevel: "critical",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: typedConfirmation("撤销改动", "会丢弃未提交修改。", false, "文件或范围", "REVERT")
  }),
  tool({
    name: "gitPush",
    description: "推送到远程。",
    category: "git",
    riskLevel: "critical",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: typedConfirmation("推送远程", "会把本地提交推送到远程仓库。", false, "远程/分支", "PUSH")
  }),
  tool({
    name: "getDiagnostics",
    description: "获取 TypeScript、ESLint、构建错误等当前诊断信息。",
    category: "diagnostics",
    riskLevel: "low",
    priority: "P0"
  }),
  tool({
    name: "runTypecheck",
    description: "运行类型检查, 例如 npm run typecheck 或 tsc --noEmit。",
    category: "diagnostics",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行类型检查", "会启动项目验证命令。", true, "命令")
  }),
  tool({
    name: "runLint",
    description: "运行 lint。",
    category: "diagnostics",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行 lint", "会启动项目验证命令。", true, "命令")
  }),
  tool({
    name: "runBuild",
    description: "运行构建。",
    category: "diagnostics",
    riskLevel: "medium",
    priority: "P1",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行构建", "会启动项目构建命令。", true, "命令")
  }),
  tool({
    name: "runTests",
    description: "运行单元测试或集成测试。",
    category: "diagnostics",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行测试", "会启动项目测试命令。", true, "命令")
  }),
  tool({
    name: "runTargetedTest",
    description: "运行指定测试文件或测试用例。",
    category: "diagnostics",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("运行指定测试", "会启动项目测试命令。", true, "命令")
  }),
  tool({
    name: "parseErrorLog",
    description: "把终端错误日志解析成结构化错误。",
    category: "diagnostics",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "suggestValidationPlan",
    description: "根据本次修改生成验证计划。",
    category: "diagnostics",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "webSearch",
    description: "高优先级网页搜索, 查官方文档、版本 API 或报错。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P1"
  }),
  tool({
    name: "fetchUrl",
    description: "读取网页内容, 例如文档页、GitHub issue 或官方 API 文档。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P2"
  }),
  tool({
    name: "fetchDocs",
    description: "按常用框架、语言、平台映射优先读取官方文档。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P1"
  }),
  tool({
    name: "openBrowserPreview",
    description: "打开本地预览页面或开发服务器。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P2"
  }),
  tool({
    name: "takeScreenshot",
    description: "对页面截图, 辅助分析 UI 问题。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P2"
  }),
  tool({
    name: "inspectPageConsole",
    description: "读取浏览器控制台错误, 调试前端 runtime error。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P2"
  }),
  tool({
    name: "readProjectMemory",
    description: "读取项目 MEMORY.md 长期偏好、架构约定、用户规则。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "writeProjectMemory",
    description: "无感维护项目 MEMORY.md 长期规则, 只写受控记忆区并在落盘前脱敏。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "searchMemory",
    description: "查找之前的任务决策、项目约定。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P2"
  }),
  tool({
    name: "deleteMemory",
    description: "移除错误或过期记忆。",
    category: "auxiliary",
    riskLevel: "critical",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: typedConfirmation("删除记忆", "会移除长期记忆记录。", false, "记忆", "DELETE")
  }),
  tool({
    name: "readProjectInstructions",
    description: "读取 AGENTS.md、CLAUDE.md、Cursor Rules、Copilot Instructions 等项目指令。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "createProjectInstructions",
    description: "创建 AGENTS.md。",
    category: "auxiliary",
    riskLevel: "medium",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: singleConfirmation("创建项目指令", "会在项目中创建规则文件。", true, "文件")
  }),
  tool({
    name: "updateProjectInstructions",
    description: "修改 AGENTS.md 或 Forge 项目规则。",
    category: "auxiliary",
    riskLevel: "high",
    priority: "P2",
    requiresConfirmation: true,
    confirmation: doubleConfirmation("更新项目指令", "会改变 Agent 后续行为规则。", true, "文件")
  }),
  tool({
    name: "getContextBudget",
    description: "查看当前上下文预算, 避免塞入过多文件。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P1"
  }),
  tool({
    name: "summarizeContext",
    description: "压缩当前上下文, 支持长任务稳定执行。",
    category: "auxiliary",
    riskLevel: "low",
    priority: "P1"
  })
];

const builtInToolDefinitionsByName = new Map(
  builtInToolDefinitions.map((definition) => [definition.name, definition])
);

export function getBuiltInToolDefinition(toolName: string): BuiltInToolDefinition {
  const definition = builtInToolDefinitionsByName.get(toolName);

  if (!definition) {
    throw new Error(`Unknown built-in tool: ${toolName}`);
  }

  return definition;
}

export function canAutoExecuteBuiltInTool(
  definition: BuiltInToolDefinition,
  { confirmed = false, fullAccess = false, secondConfirmed = false }: AutoExecuteOptions = {}
): boolean {
  if (fullAccess) {
    return definition.availability === "available";
  }

  if (definition.riskLevel === "critical") {
    return definition.requiresConfirmation && confirmed && secondConfirmed;
  }

  if (definition.riskLevel === "high") {
    return definition.requiresConfirmation && confirmed;
  }

  if (definition.requiresConfirmation) {
    return confirmed;
  }

  return definition.riskLevel === "low";
}

export function createNotImplementedToolResult(
  definition: Pick<BuiltInToolDefinition, "name">
): NotImplementedToolResult {
  return {
    status: "not_implemented",
    toolName: definition.name,
    message: `Built-in tool ${definition.name} is registered but not implemented yet.`,
    suggestedNextStep: "Use another available Forge tool or stop and ask the user before continuing."
  };
}

function tool({
  availability = "available",
  confirmation,
  inputSchema = emptyObjectSchema,
  outputSchema = genericObjectSchema,
  requiresConfirmation,
  ...definition
}: ToolOptions): BuiltInToolDefinition {
  return {
    ...definition,
    availability,
    requiresConfirmation:
      requiresConfirmation ??
      (definition.riskLevel === "high" || definition.riskLevel === "critical"),
    inputSchema,
    outputSchema,
    ...(confirmation ? { confirmation } : {})
  };
}

function singleConfirmation(
  title: string,
  consequence: string,
  reversible: boolean,
  targetLabel?: string
): BuiltInToolConfirmation {
  return {
    kind: "single",
    title,
    consequence,
    reversible,
    targetLabel
  };
}

function doubleConfirmation(
  title: string,
  consequence: string,
  reversible: boolean,
  targetLabel?: string
): BuiltInToolConfirmation {
  return {
    kind: "double",
    title,
    consequence,
    reversible,
    targetLabel
  };
}

function typedConfirmation(
  title: string,
  consequence: string,
  reversible: boolean,
  targetLabel: string,
  confirmationKeyword: string
): BuiltInToolConfirmation {
  return {
    kind: "typed",
    title,
    consequence,
    reversible,
    targetLabel,
    confirmationKeyword
  };
}
