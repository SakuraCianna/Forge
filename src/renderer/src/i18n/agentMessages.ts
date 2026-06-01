// 本文件说明: 统一整理 Agent 执行和命令安全策略的用户可读文案
import type { Language } from "@shared/modelTypes";
import type { AgentActionPermissionResult } from "@/agent/agentActionExecutor";

type AgentToolPermission = Extract<AgentActionPermissionResult, { ok: false }>["tool"];

const builtInCommandReasonTranslations: Record<string, string> = {
  "command may change dependencies or project state": "命令会修改依赖或项目状态",
  "command may change Git history or remote state": "命令会修改 Git 历史或远端状态",
  "command can delete files or rewrite history": "命令可能删除文件或重写历史",
  "command is not in the safe allowlist": "命令不在安全自动执行白名单中",
  "command may write files through shell redirection": "命令可能通过 shell 重定向写入文件"
};

const agentToolLabels: Record<AgentToolPermission, { zh: string; en: string }> = {
  read: {
    zh: "读取文件",
    en: "read"
  },
  edit: {
    zh: "编辑操作",
    en: "edit"
  },
  command: {
    zh: "运行命令",
    en: "command"
  },
  git: {
    zh: "Git 操作",
    en: "git"
  }
};

// 只翻译 Forge 内置原因, 用户自定义规则原因保持原样
export function formatAgentCommandRiskReason(language: Language, reason: string): string {
  if (language !== "zh-CN") {
    return reason;
  }

  return builtInCommandReasonTranslations[reason] ?? reason;
}

// 生成命令被安全策略拒绝时的可读提示
export function formatAgentCommandDenied(language: Language, reason: string): string {
  const localizedReason = formatAgentCommandRiskReason(language, reason);

  if (language === "zh-CN") {
    return `命令已被安全策略拒绝: ${localizedReason}`;
  }

  return `Command denied by safety policy: ${localizedReason}`;
}

// 生成命令需要用户确认时的可读提示
export function formatAgentCommandNeedsApproval(
  language: Language,
  command: string,
  reason: string
): string {
  const localizedReason = formatAgentCommandRiskReason(language, reason);

  if (language === "zh-CN") {
    return `命令需要确认后才能运行: ${command} (${localizedReason})`;
  }

  return `Command requires full access confirmation: ${command} (${localizedReason})`;
}

// 生成智能体配置缺少工具权限时的可读提示
export function formatAgentPermissionDenied(
  language: Language,
  profileName: string,
  tool: AgentToolPermission
): string {
  if (language === "zh-CN") {
    return `智能体配置 ${profileName} 不允许执行${agentToolLabels[tool].zh}`;
  }

  return `Agent profile ${profileName} does not allow ${agentToolLabels[tool].en} actions`;
}
