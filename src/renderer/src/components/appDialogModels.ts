// 本文件说明: 提供 App 级弹窗的纯文案模型和反馈链接构造
import type { Language } from "@shared/modelTypes";
import type { LocalSkillScanResult } from "@shared/pluginSkillTypes";
import type { TaskThread } from "@/state/taskThreads";

export type CommandDialogState = {
  title: string;
  description: string;
  rows: Array<{
    label: string;
    value: string;
  }>;
};

export type FeedbackIssueUrlInput = {
  category: string;
  currentModelId: string | null;
  currentProjectName: string | null;
  detail: string;
  includeStatus: boolean;
  localSkillCount: number;
  threadCount: number;
};

export function createMcpCommandDialog(
  language: Language,
  localSkillScan: LocalSkillScanResult | null
): CommandDialogState {
  const isChinese = language === "zh-CN";

  return {
    title: isChinese ? "MCP 状态" : "MCP Status",
    description: isChinese
      ? "Forge 当前还没有接入 MCP 运行时, 本页只显示本机可用上下文能力。"
      : "Forge has not connected an MCP runtime yet. This only reports local context capabilities.",
    rows: [
      {
        label: isChinese ? "Forge MCP" : "Forge MCP",
        value: isChinese ? "未接入" : "Not connected"
      },
      {
        label: isChinese ? "本机 Skills" : "Local skills",
        value: `${localSkillScan?.skills.length ?? 0}`
      },
      {
        label: isChinese ? "扫描目录" : "Scanned roots",
        value: localSkillScan?.scannedRoots.join("\n") || (isChinese ? "未发现" : "None found")
      }
    ]
  };
}

export function createProjectInstructionsCommandDialog(
  language: Language,
  status: "created" | "exists",
  relativePath: string
): CommandDialogState {
  const isChinese = language === "zh-CN";

  return {
    title: isChinese ? "项目指令初始化" : "Project Instructions Init",
    description:
      status === "created"
        ? isChinese
          ? "Forge 已创建默认 AGENTS.md, 后续 Agent 会把它作为项目规则来源。"
          : "Forge created the default AGENTS.md for future agent project rules."
        : isChinese
          ? "AGENTS.md 已存在, Forge 没有覆盖现有项目规则。"
          : "AGENTS.md already exists, so Forge did not overwrite existing project rules.",
    rows: [
      {
        label: isChinese ? "文件" : "File",
        value: relativePath
      },
      {
        label: isChinese ? "状态" : "Status",
        value:
          status === "created"
            ? isChinese
              ? "已创建"
              : "Created"
            : isChinese
              ? "已存在"
              : "Already exists"
      }
    ]
  };
}

export function createContextCompactionCommandDialog(
  language: Language,
  thread: TaskThread
): CommandDialogState {
  const isChinese = language === "zh-CN";
  const compaction = thread.contextCompaction;

  return {
    title: isChinese ? "上下文已压缩" : "Context Compacted",
    description: isChinese
      ? "Forge 会保留旧对话的摘要, 后续模型请求只带摘要和压缩后的新消息。"
      : "Forge keeps a summary of older messages and sends only that summary plus new messages afterward.",
    rows: [
      {
        label: isChinese ? "线程" : "Thread",
        value: thread.title
      },
      {
        label: isChinese ? "触发方式" : "Reason",
        value: compaction?.reason ?? "-"
      },
      {
        label: isChinese ? "估算 tokens" : "Estimated tokens",
        value: compaction
          ? `${compaction.estimatedTokensBefore} -> ${compaction.estimatedTokensAfter}`
          : "-"
      },
      {
        label: isChinese ? "已压缩事件" : "Compacted events",
        value: `${compaction?.sourceEventCount ?? 0}`
      }
    ]
  };
}

export function createStatusCommandDialog(
  language: Language,
  input: {
    currentModelId: string | null;
    currentProjectName: string | null;
    currentProjectPath: string | null;
    estimatedContextTokens: number;
    indexedFileCount: number;
    localSkillCount: number;
    threadCount: number;
  }
): CommandDialogState {
  const isChinese = language === "zh-CN";

  return {
    title: isChinese ? "当前状态" : "Current Status",
    description: isChinese ? "Forge 当前工作区和上下文状态。" : "Current Forge workspace and context status.",
    rows: [
      {
        label: isChinese ? "项目" : "Project",
        value: input.currentProjectName || (isChinese ? "未选择" : "Not selected")
      },
      {
        label: isChinese ? "项目路径" : "Project path",
        value: input.currentProjectPath || "-"
      },
      {
        label: isChinese ? "模型" : "Model",
        value: input.currentModelId || (isChinese ? "未选择" : "Not selected")
      },
      {
        label: isChinese ? "索引文件" : "Indexed files",
        value: `${input.indexedFileCount}`
      },
      {
        label: isChinese ? "上下文估算" : "Context estimate",
        value: `${input.estimatedContextTokens} tokens`
      },
      {
        label: isChinese ? "本机 Skills" : "Local skills",
        value: `${input.localSkillCount}`
      },
      {
        label: isChinese ? "可见对话" : "Visible chats",
        value: `${input.threadCount}`
      }
    ]
  };
}

export function createFeedbackIssueUrl({
  category,
  currentModelId,
  currentProjectName,
  detail,
  includeStatus,
  localSkillCount,
  threadCount
}: FeedbackIssueUrlInput): string {
  const title = `[Feedback] ${category}`;
  const statusBlock = includeStatus
    ? [
        "",
        "## Forge status",
        `- Project: ${currentProjectName ?? "Not selected"}`,
        `- Model: ${currentModelId ?? "Not selected"}`,
        `- Local skills: ${localSkillCount}`,
        `- Visible chats: ${threadCount}`
      ].join("\n")
    : "";
  const body = [`## Category`, category, "", "## Detail", detail.trim(), statusBlock].join("\n");
  const params = new URLSearchParams({
    title,
    body,
    labels: "feedback"
  });

  return `https://github.com/SakuraCianna/Forge/issues/new?${params.toString()}`;
}

export function getFeedbackDialogCopy(language: Language): {
  categories: string[];
  close: string;
  includeStatus: string;
  placeholder: string;
  submit: string;
  title: string;
} {
  if (language === "zh-CN") {
    return {
      categories: ["错误", "结果异常", "结果正常", "安全检查", "其他"],
      close: "关闭",
      includeStatus: "包含当前 Forge 状态摘要",
      placeholder: "填写详情（必填）",
      submit: "提交",
      title: "提交反馈"
    };
  }

  return {
    categories: ["Bug", "Unexpected result", "Good result", "Safety check", "Other"],
    close: "Close",
    includeStatus: "Include current Forge status summary",
    placeholder: "Describe the feedback (required)",
    submit: "Submit",
    title: "Submit Feedback"
  };
}
