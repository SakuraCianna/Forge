// 本文件说明: 定义 Forge 插件, 技能目录和输入框上下文搜索
import type { AgentAttachmentContext } from "@shared/agentTypes";
import type { Language } from "@shared/modelTypes";
import type { LocalSkillManifest } from "@shared/pluginSkillTypes";
import type { ProjectFile } from "@shared/projectTypes";

export type ForgePluginScope = "personal" | "workspace";
export type ForgePluginInstallSource = "bundled" | "github" | "local";

export type ForgeSkill = {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  scope: ForgePluginScope;
  coreFiles: string[];
  deletable?: boolean;
  editable?: boolean;
  localPath?: string;
  localDirectoryPath?: string;
  sourceLabel?: string;
  userOwned?: boolean;
};

export type ForgePlugin = {
  id: string;
  name: string;
  description: string;
  scope: ForgePluginScope;
  accent: string;
  installSource: ForgePluginInstallSource;
  repositoryUrl?: string;
  sourceLabel?: string;
  localPath?: string;
  localDirectoryPath?: string;
  userOwned?: boolean;
  editable?: boolean;
  deletable?: boolean;
  skills: ForgeSkill[];
};

export type ComposerContextKind = "file" | "plugin" | "skill";

export type ComposerContextReference = {
  id: string;
  kind: ComposerContextKind;
  label: string;
  detail: string;
  content: string;
};

export type ComposerSuggestionKind = "command" | ComposerContextKind;

export type ComposerSlashCommandId =
  | "feedback"
  | "mcp"
  | "model"
  | "persona"
  | "quick"
  | "reasoning"
  | "status";

export type ComposerSuggestion = {
  actionId?: ComposerSlashCommandId;
  id: string;
  kind: ComposerSuggestionKind;
  label: string;
  description: string;
  category: string;
  insertText: string;
  context?: ComposerContextReference;
};

type SlashCommand = {
  actionId: ComposerSlashCommandId;
  id: string;
  label: string;
  description: string;
  insertText: string;
};

type ComposerSuggestionInput = {
  language: Language;
  pluginCatalog: ForgePlugin[];
  projectFiles?: ProjectFile[];
  query: string;
  trigger: "/" | "@";
  limit?: number;
};

type PluginSkillDefinition = [string, string, string[]?];

const maxSuggestionCount = 16;
const openAiSkillsRepositoryUrl = "https://github.com/openai/skills";

export function createDefaultPluginCatalog(
  language: Language,
  localSkills: LocalSkillManifest[] = []
): ForgePlugin[] {
  const isChinese = language === "zh-CN";

  return [
    createPlugin({
      id: "documents",
      name: "Documents",
      description: isChinese ? "创建, 编辑和整理文档材料" : "Create, edit, and organize document artifacts",
      accent: "#2563eb",
      repositoryUrl: openAiSkillsRepositoryUrl,
      skillNames: [
        [
          "Document Drafting",
          isChinese ? "起草结构化文档和说明材料" : "Draft structured documents and written materials",
          ["SKILL.md"]
        ],
        [
          "Document Review",
          isChinese ? "审阅文档逻辑, 格式和遗漏" : "Review document structure, clarity, and gaps",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "spreadsheets",
      name: "Spreadsheets",
      description: isChinese ? "创建, 分析和整理电子表格" : "Create, analyze, and maintain spreadsheet files",
      accent: "#1f9d55",
      repositoryUrl: openAiSkillsRepositoryUrl,
      skillNames: [
        [
          "Workbook Analysis",
          isChinese ? "分析表格结构, 指标和异常值" : "Analyze workbook structure, metrics, and outliers",
          ["SKILL.md"]
        ],
        [
          "Spreadsheet Cleanup",
          isChinese ? "整理列名, 数据格式和导出结构" : "Clean columns, formats, and export-ready structure",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "presentations",
      name: "Presentations",
      description: isChinese ? "创建和编辑演示文稿" : "Create and edit presentation decks",
      accent: "#d97706",
      repositoryUrl: openAiSkillsRepositoryUrl,
      skillNames: [
        [
          "Deck Builder",
          isChinese ? "把大纲转成清晰的幻灯片结构" : "Turn outlines into clear slide structure",
          ["SKILL.md"]
        ],
        [
          "Slide Polish",
          isChinese ? "优化页面层级, 文案和视觉节奏" : "Improve slide hierarchy, copy, and visual rhythm",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "google-calendar",
      name: "Google Calendar",
      description: isChinese ? "管理日程, 会议和可用时间" : "Manage calendar events, meetings, and availability",
      accent: "#4285f4",
      skillNames: [
        [
          "Daily Brief",
          isChinese ? "生成当天日程简报和准备事项" : "Create a daily schedule brief and prep list",
          ["SKILL.md"]
        ],
        [
          "Group Scheduler",
          isChinese ? "查找多人会议候选时间" : "Find candidate times for group meetings",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "gmail",
      name: "Gmail",
      description: isChinese ? "读取, 整理和处理邮件" : "Read, triage, and manage Gmail",
      accent: "#ea4335",
      skillNames: [
        [
          "Inbox Triage",
          isChinese ? "按优先级整理收件箱" : "Prioritize and organize inbox items",
          ["SKILL.md"]
        ],
        [
          "Reply Drafting",
          isChinese ? "根据上下文起草邮件回复" : "Draft replies from thread context",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "canva",
      name: "Canva",
      description: isChinese ? "搜索, 创建和编辑设计素材" : "Search, create, and edit designs",
      accent: "#8b5cf6",
      skillNames: [
        [
          "Brand Design",
          isChinese ? "按品牌风格生成视觉资产" : "Generate visual assets in a brand style",
          ["SKILL.md"]
        ],
        [
          "Social Resize",
          isChinese ? "为不同社媒尺寸调整设计" : "Resize designs for social channels",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "figma",
      name: "Figma",
      description: isChinese ? "设计到代码, 原型和设计系统流程" : "Design-to-code, prototype, and design-system workflows",
      accent: "#f24e1e",
      skillNames: [
        [
          "Generate Design",
          isChinese ? "从产品需求生成可评审设计" : "Generate reviewable design directions from a brief",
          ["SKILL.md"]
        ],
        [
          "Implement Design",
          isChinese ? "把设计语义转换成前端实现" : "Translate design intent into frontend implementation",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "hugging-face",
      name: "Hugging Face",
      description: isChinese ? "检索模型, 数据集, Spaces 和研究资料" : "Inspect models, datasets, Spaces, and research",
      accent: "#f59e0b",
      skillNames: [
        [
          "Model Research",
          isChinese ? "查找模型能力, 限制和替代方案" : "Research model capabilities, limits, and alternatives",
          ["SKILL.md"]
        ],
        [
          "Dataset Review",
          isChinese ? "检查数据集结构和适用场景" : "Inspect dataset structure and fit",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "superpowers",
      name: "Superpowers",
      description: isChinese
        ? "规划, TDD, 调试和交付工作流合集"
        : "Planning, TDD, debugging, and delivery workflows for coding agents",
      accent: "#111827",
      repositoryUrl: "https://github.com/openai/codex",
      skillNames: [
        [
          "Brainstorming",
          isChinese ? "先探索意图, 需求和设计取舍" : "Explore intent, requirements, and design tradeoffs first",
          ["SKILL.md"]
        ],
        [
          "Writing Plans",
          isChinese ? "把规格拆成详细实施计划" : "Turn specs into detailed implementation plans",
          ["SKILL.md"]
        ],
        [
          "Systematic Debugging",
          isChinese ? "用可复现证据定位问题" : "Use reproducible evidence to isolate issues",
          ["SKILL.md"]
        ],
        [
          "Verification Before Completion",
          isChinese ? "完成前做明确验证和风险说明" : "Verify explicitly before calling work complete",
          ["SKILL.md"]
        ]
      ]
    }),
    createPlugin({
      id: "build-web-apps",
      name: "Build Web Apps",
      description: isChinese ? "React, 前端测试和 Web 应用构建指引" : "React, frontend testing, and web app build guidance",
      accent: "#0891b2",
      repositoryUrl: openAiSkillsRepositoryUrl,
      skillNames: [
        [
          "React Best Practices",
          isChinese ? "应用 React 性能和组件实践" : "Apply React performance and component practices",
          ["SKILL.md"]
        ],
        [
          "Frontend Testing",
          isChinese ? "用浏览器验证界面状态和交互" : "Verify UI states and interactions in the browser",
          ["SKILL.md"]
        ],
        [
          "Shadcn",
          isChinese ? "管理 shadcn/ui 组件和主题" : "Manage shadcn/ui components and theme",
          ["SKILL.md"]
        ],
        [
          "Stripe Best Practices",
          isChinese ? "设计支付和结账安全流程" : "Design safe payment and checkout flows",
          ["SKILL.md"]
        ]
      ]
    }),
    ...createLocalSkillPlugins(language, localSkills)
  ];
}

export function createComposerSuggestions({
  language,
  pluginCatalog,
  projectFiles = [],
  query,
  trigger,
  limit = maxSuggestionCount
}: ComposerSuggestionInput): ComposerSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  const suggestions =
    trigger === "/"
      ? createSlashSuggestions(language, pluginCatalog)
      : createMentionSuggestions(language, pluginCatalog, projectFiles, normalizedQuery, limit);

  return suggestions
    .filter((suggestion) => matchesSuggestion(suggestion, normalizedQuery))
    .slice(0, limit);
}

export function createComposerContextAttachmentContexts(
  contexts: ComposerContextReference[],
  language: Language
): AgentAttachmentContext[] {
  if (contexts.length === 0) {
    return [];
  }

  const intro =
    language === "zh-CN"
      ? "以下是用户本轮通过 Forge 输入框引入的插件, 技能或文件引用。这些引用只表示工作流上下文, 不代表已经获得外部服务授权或真实插件执行能力。"
      : "The user introduced these Forge plugin, skill, or file references in the composer. They are workflow context only and do not imply external service authorization or real plugin execution capability.";

  return contexts.map((context, index) => {
    const content = [
      intro,
      `${index + 1}. ${getContextKindLabel(context.kind, language)}: ${context.label}`,
      context.detail,
      context.content
    ].join("\n");

    return {
      id: `forge-context-${context.id}`,
      kind: "text",
      name: `${getContextKindLabel(context.kind, language)}: ${context.label}`,
      size: content.length,
      content
    };
  });
}

export function getContextKindLabel(kind: ComposerContextKind, language: Language): string {
  if (language === "zh-CN") {
    if (kind === "plugin") {
      return "插件";
    }

    if (kind === "skill") {
      return "技能";
    }

    return "文件";
  }

  if (kind === "plugin") {
    return "Plugin";
  }

  if (kind === "skill") {
    return "Skill";
  }

  return "File";
}

function createPlugin({
  accent,
  description,
  id,
  name,
  repositoryUrl,
  skillNames
}: {
  accent: string;
  description: string;
  id: string;
  name: string;
  repositoryUrl?: string;
  skillNames: PluginSkillDefinition[];
}): ForgePlugin {
  return {
    id,
    name,
    description,
    accent,
    installSource: repositoryUrl ? "github" : "bundled",
    repositoryUrl,
    scope: "personal",
    skills: skillNames.map(([skillName, skillDescription, coreFiles]) => ({
      id: `${id}:${slugify(skillName)}`,
      pluginId: id,
      name: skillName,
      description: skillDescription,
      coreFiles: coreFiles ?? ["SKILL.md"],
      scope: "personal"
    }))
  };
}

function createLocalSkillPlugins(
  language: Language,
  localSkills: LocalSkillManifest[]
): ForgePlugin[] {
  if (localSkills.length === 0) {
    return [];
  }

  const isChinese = language === "zh-CN";
  const groups = new Map<string, LocalSkillManifest[]>();

  localSkills.forEach((skill) => {
    const groupName = skill.pluginName || skill.sourceLabel;
    groups.set(groupName, [...(groups.get(groupName) ?? []), skill]);
  });

  return Array.from(groups, ([groupName, skills]) => {
    const pluginUserOwned = skills.some((skill) => skill.source === "plugin-local" && skill.userOwned);
    const firstSkill = skills[0];

    return {
      id: `local-${slugify(groupName)}`,
      name:
        pluginUserOwned && firstSkill?.pluginName
          ? firstSkill.pluginName
          : isChinese
            ? `本机 ${groupName}`
            : `Local ${groupName}`,
      description: isChinese
        ? "从这台电脑上的 SKILL.md 自动发现"
        : "Discovered automatically from SKILL.md files on this computer",
      accent: "#0f766e",
      installSource: "local" as const,
      deletable: pluginUserOwned,
      editable: pluginUserOwned,
      localDirectoryPath: firstSkill?.directoryPath,
      localPath: firstSkill?.filePath,
      sourceLabel: groupName,
      scope: "personal" as const,
      userOwned: pluginUserOwned,
      skills: skills.map((skill) => ({
        id: skill.id,
        pluginId: `local-${slugify(groupName)}`,
        name: skill.name,
        description: skill.description,
        coreFiles: skill.coreFiles?.length ? skill.coreFiles : [skill.filePath],
        deletable: skill.deletable,
        editable: skill.editable,
        localDirectoryPath: skill.directoryPath,
        scope: "personal" as const,
        localPath: skill.filePath,
        sourceLabel: skill.sourceLabel,
        userOwned: skill.userOwned
      }))
    };
  });
}

function createSlashSuggestions(language: Language, pluginCatalog: ForgePlugin[]): ComposerSuggestion[] {
  const commandCategory = language === "zh-CN" ? "命令" : "Commands";
  const skillCategory = language === "zh-CN" ? "技能" : "Skills";

  return [
    ...createSlashCommands(language).map((command) => ({
      actionId: command.actionId,
      id: `command:${command.id}`,
      kind: "command" as const,
      label: command.label,
      description: command.description,
      category: commandCategory,
      insertText: command.insertText
    })),
    ...pluginCatalog.flatMap((plugin) =>
      plugin.skills.map((skill) => ({
        id: `skill:${skill.id}`,
        kind: "skill" as const,
        label: skill.name,
        description: skill.description,
        category: skillCategory,
        insertText: `@${skill.name} `,
        context: createSkillContext(plugin, skill)
      }))
    )
  ];
}

function createMentionSuggestions(
  language: Language,
  pluginCatalog: ForgePlugin[],
  projectFiles: ProjectFile[],
  query: string,
  limit: number
): ComposerSuggestion[] {
  const pluginCategory = language === "zh-CN" ? "插件" : "Plugins";
  const skillCategory = language === "zh-CN" ? "技能" : "Skills";
  const fileCategory = language === "zh-CN" ? "文件" : "Files";
  const fileCandidates = query
    ? projectFiles
        .filter((file) => normalizeSearchText(file.relativePath).includes(query))
        .slice(0, limit)
    : projectFiles.slice(0, Math.min(6, limit));

  return [
    ...pluginCatalog.map((plugin) => ({
      id: `plugin:${plugin.id}`,
      kind: "plugin" as const,
      label: plugin.name,
      description: plugin.description,
      category: pluginCategory,
      insertText: `@${plugin.name} `,
      context: createPluginContext(plugin)
    })),
    ...pluginCatalog.flatMap((plugin) =>
      plugin.skills.map((skill) => ({
        id: `skill:${skill.id}`,
        kind: "skill" as const,
        label: skill.name,
        description: `${plugin.name} - ${skill.description}`,
        category: skillCategory,
        insertText: `@${skill.name} `,
        context: createSkillContext(plugin, skill)
      }))
    ),
    ...fileCandidates.map((file) => ({
      id: `file:${file.relativePath}`,
      kind: "file" as const,
      label: getFileName(file.relativePath),
      description: getFileParent(file.relativePath),
      category: fileCategory,
      insertText: `@${file.relativePath} `,
      context: createFileContext(file, language)
    }))
  ];
}

function createPluginContext(plugin: ForgePlugin): ComposerContextReference {
  const skillList = plugin.skills.map((skill) => skill.name).join(", ");

  return {
    id: `plugin-${plugin.id}`,
    kind: "plugin",
    label: plugin.name,
    detail: plugin.description,
    content: `Plugin: ${plugin.name}\nDescription: ${plugin.description}\nBundled skills: ${skillList}`
  };
}

function createSkillContext(plugin: ForgePlugin, skill: ForgeSkill): ComposerContextReference {
  const localPathLine = skill.localPath ? `\nLocal skill file: ${skill.localPath}` : "";
  const coreFiles = getSkillCoreFiles(skill);
  const coreFilesLine =
    coreFiles.length > 0 ? `\nCore files: ${coreFiles.join(", ")}` : "";

  return {
    id: `skill-${skill.id}`,
    kind: "skill",
    label: skill.name,
    detail: `${plugin.name} - ${skill.description}`,
    content: `Skill: ${skill.name}\nPlugin: ${plugin.name}\nDescription: ${skill.description}${localPathLine}${coreFilesLine}`
  };
}

function getSkillCoreFiles(skill: ForgeSkill): string[] {
  if (skill.coreFiles?.length) {
    return skill.coreFiles;
  }

  return skill.localPath ? [skill.localPath] : ["SKILL.md"];
}

function createFileContext(file: ProjectFile, language: Language): ComposerContextReference {
  const detail =
    language === "zh-CN"
      ? `项目文件路径, 大小 ${formatFileSize(file.size)}`
      : `Project file path, ${formatFileSize(file.size)}`;

  return {
    id: `file-${file.relativePath}`,
    kind: "file",
    label: getFileName(file.relativePath),
    detail,
    content: `Project file reference: ${file.relativePath}`
  };
}

function createSlashCommands(language: Language): SlashCommand[] {
  if (language === "zh-CN") {
    return [
      { actionId: "mcp", id: "mcp", label: "MCP", description: "显示 Forge MCP 服务状态", insertText: "" },
      { actionId: "persona", id: "persona", label: "个性", description: "打开回应方式和个性化设置", insertText: "" },
      { actionId: "feedback", id: "feedback", label: "反馈", description: "提交有关此聊天的反馈", insertText: "" },
      { actionId: "quick", id: "quick", label: "快速", description: "切换更快的响应方式", insertText: "" },
      { actionId: "reasoning", id: "reasoning", label: "推理模式", description: "切换到更强推理", insertText: "" },
      { actionId: "model", id: "model", label: "模型", description: "打开模型配置", insertText: "" },
      { actionId: "status", id: "status", label: "状态", description: "显示对话和上下文状态", insertText: "" }
    ];
  }

  return [
    { actionId: "mcp", id: "mcp", label: "MCP", description: "Show Forge MCP server status", insertText: "" },
    { actionId: "persona", id: "persona", label: "Persona", description: "Open response style settings", insertText: "" },
    { actionId: "feedback", id: "feedback", label: "Feedback", description: "Submit feedback about this chat", insertText: "" },
    { actionId: "quick", id: "quick", label: "Quick", description: "Switch to a faster response mode", insertText: "" },
    { actionId: "reasoning", id: "reasoning", label: "Reasoning", description: "Switch to stronger reasoning", insertText: "" },
    { actionId: "model", id: "model", label: "Model", description: "Open model configuration", insertText: "" },
    { actionId: "status", id: "status", label: "Status", description: "Show conversation and context status", insertText: "" }
  ];
}

function matchesSuggestion(suggestion: ComposerSuggestion, query: string): boolean {
  if (!query) {
    return true;
  }

  return normalizeSearchText(
    `${suggestion.label} ${suggestion.description} ${suggestion.category}`
  ).includes(query);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function getFileName(relativePath: string): string {
  return relativePath.split(/[\\/]/u).pop() ?? relativePath;
}

function getFileParent(relativePath: string): string {
  const segments = relativePath.split(/[\\/]/u);

  if (segments.length <= 1) {
    return "";
  }

  return segments.slice(0, -1).join("/");
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
