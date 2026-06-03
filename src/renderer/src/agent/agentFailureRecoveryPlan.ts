// 本文件说明: 准备失败恢复计划所需的线程事件和模型提示词, 避免 App.tsx 内联恢复上下文拼装
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type {
  CommandRunResult,
  FailureRecoveryAttemptRecord,
  TaskThread,
  TaskThreadEvent
} from "@/state/taskThreads";
import { appendThreadEvents } from "@/state/taskThreads";
import { selectThreadById } from "@/state/threadSelectors";
import {
  createFailureFixTaskPrompt,
  findLatestCommandResultForAction
} from "@/agent/failureFixPrompt";
import { formatFailureFixPlanStartMessage } from "@/agent/agentRunMessages";

export type FailureFixPlanOptions = Pick<
  FailureRecoveryAttemptRecord,
  "source" | "attempt" | "limit"
>;

export type PreparedFailureFixPlan = {
  taskPrompt: string;
  startEvent: TaskThreadEvent;
  recoveryAttempt: FailureRecoveryAttemptRecord;
};

export type FailureFixPlanStartDecision =
  | {
      kind: "missing-thread";
    }
  | {
      kind: "missing-project";
      noticeKey: "projects.required";
      errorMessage: string;
    }
  | {
      kind: "missing-model-provider";
      thread: TaskThread;
      errorMessage: string;
    }
  | {
      kind: "ready";
      thread: TaskThread;
      model: ForgeModel;
      provider: ForgeProvider;
      projectScan: ProjectScanResult;
      preparedPlan: PreparedFailureFixPlan;
    };

export function resolveAgentFailureFixPlanStart({
  threads,
  threadId,
  action,
  language,
  models,
  providers,
  projectScan,
  commandResultOverride = null,
  options = { source: "manual" }
}: {
  threads: TaskThread[];
  threadId: string;
  action: AgentAction;
  language: Language;
  models: ForgeModel[];
  providers: ForgeProvider[];
  projectScan: ProjectScanResult | null;
  commandResultOverride?: CommandRunResult | null;
  options?: FailureFixPlanOptions;
}): FailureFixPlanStartDecision {
  const thread = selectThreadById(threads, threadId);

  if (!thread) {
    return {
      kind: "missing-thread"
    };
  }

  if (!projectScan) {
    return {
      kind: "missing-project",
      noticeKey: "projects.required",
      errorMessage:
        language === "zh-CN"
          ? "需要先打开并索引项目, 才能根据失败动作生成修复计划"
          : "Open and scan a project before generating a fix plan for a failed action."
    };
  }

  const model = models.find((candidate) => candidate.id === thread.modelId);
  const provider = model
    ? providers.find((candidate) => candidate.id === model.providerId)
    : null;

  if (!model || !provider) {
    return {
      kind: "missing-model-provider",
      thread,
      errorMessage:
        language === "zh-CN"
          ? "未找到当前模型或提供商配置"
          : "Current model or provider configuration was not found."
    };
  }

  return {
    kind: "ready",
    thread,
    model,
    provider,
    projectScan,
    preparedPlan: prepareAgentFailureFixPlan({
      thread,
      action,
      language,
      commandResultOverride,
      options
    })
  };
}

export function prepareAgentFailureFixPlan({
  thread,
  action,
  language,
  commandResultOverride = null,
  options = { source: "manual" },
  createdAt = new Date().toISOString()
}: {
  thread: TaskThread;
  action: AgentAction;
  language: Language;
  commandResultOverride?: CommandRunResult | null;
  options?: FailureFixPlanOptions;
  createdAt?: string;
}): PreparedFailureFixPlan {
  const recoveryAttempt: FailureRecoveryAttemptRecord = {
    actionId: action.id,
    label: action.label,
    source: options.source,
    ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
    ...(options.limit === undefined ? {} : { limit: options.limit })
  };
  const commandResult =
    commandResultOverride ?? findLatestCommandResultForAction(thread.events, action);
  const startEvent: TaskThreadEvent = {
    id: `${thread.id}-failure-fix-${action.id}-${createdAt}`,
    kind: "plan",
    message: formatFailureFixPlanStartMessage(language, action, recoveryAttempt),
    createdAt,
    failureRecoveryAttempt: recoveryAttempt
  };

  return {
    taskPrompt: createFailureFixTaskPrompt(thread, action, commandResult),
    startEvent,
    recoveryAttempt
  };
}

export function appendAgentFailureFixPlanStartEvent(
  threads: TaskThread[],
  {
    threadId,
    startEvent
  }: {
    threadId: string;
    startEvent: TaskThreadEvent;
  }
): TaskThread[] {
  return appendThreadEvents(threads, threadId, [startEvent], "running");
}
