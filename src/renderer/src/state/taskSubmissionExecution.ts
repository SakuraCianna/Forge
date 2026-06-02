// 本文件说明: 把任务提交路由转换为 App 可执行的副作用计划, 避免 App.tsx 持续堆叠分支细节。
import type {
  AgentAttachmentContext,
  AgentImageAttachment
} from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider, ModelSettings } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import {
  createThreadConversation,
  resolveVisionAttachments,
  type ThreadConversationTurn
} from "./threadSelectors";
import type { TaskThread } from "./taskThreads";
import type { TaskSubmissionRoute } from "./taskSubmissionRouting";

export type TaskSubmissionNoticeReason =
  | "empty-prompt"
  | "missing-model"
  | "project-required"
  | "project-scanning";

export type TaskSubmissionFollowUpEvent = {
  id: string;
  message: string;
  createdAt: string;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
};

export type TaskSubmissionThreadMutation =
  | {
      kind: "append-follow-up";
      threadId: string;
      event: TaskSubmissionFollowUpEvent;
    }
  | {
      kind: "prepend-thread";
      thread: TaskThread;
      selectThread: boolean;
    };

export type TaskSubmissionMemoryCue = {
  threadId: string;
  prompt: string;
  projectPath: string | null;
};

export type TaskSubmissionModelExecution =
  | { kind: "missing-model"; threadId: string }
  | {
      kind: "ask";
      threadId: string;
      prompt: string;
      model: ForgeModel;
      provider: ForgeProvider;
      attachments?: AgentImageAttachment[];
      attachmentContexts?: AgentAttachmentContext[];
      projectScan?: ProjectScanResult | null;
      conversation?: ThreadConversationTurn[];
    }
  | {
      kind: "plan";
      threadId: string;
      taskPrompt: string;
      model: ForgeModel;
      provider: ForgeProvider;
      attachments?: AgentImageAttachment[];
      attachmentContexts?: AgentAttachmentContext[];
      projectScan: ProjectScanResult;
    };

export type TaskSubmissionExecution =
  | { kind: "notice"; reason: TaskSubmissionNoticeReason }
  | {
      kind: "run";
      clearPausedThreadId: string;
      threadMutation: TaskSubmissionThreadMutation;
      remember?: TaskSubmissionMemoryCue;
      modelExecution: TaskSubmissionModelExecution;
    };

export function createTaskSubmissionExecution({
  route,
  prompt,
  settings,
  submittedAttachments,
  currentProjectPath,
  projectScan,
  now = () => new Date().toISOString()
}: {
  route: TaskSubmissionRoute;
  prompt: string;
  settings: ModelSettings;
  submittedAttachments?: AgentImageAttachment[];
  currentProjectPath: string | null;
  projectScan?: ProjectScanResult | null;
  now?: () => string;
}): TaskSubmissionExecution {
  if (route.kind === "invalid") {
    return { kind: "notice", reason: route.reason };
  }

  if (route.kind === "project-required" || route.kind === "project-scanning") {
    return { kind: "notice", reason: route.kind };
  }

  if (route.kind === "ask-follow-up") {
    const modelPair = findThreadModelPair(settings, route.draftThread.modelId);
    const createdAt = now();
    const threadProjectScan = resolveThreadProjectScan(
      route.thread,
      currentProjectPath,
      projectScan
    );

    return {
      kind: "run",
      clearPausedThreadId: route.thread.id,
      threadMutation: createFollowUpMutation(route.thread, prompt, createdAt, {
        attachments: submittedAttachments,
        attachmentContexts: route.draftThread.attachmentContexts
      }),
      remember: {
        threadId: route.thread.id,
        prompt,
        projectPath: threadProjectScan?.rootPath ?? route.thread.projectPath ?? null
      },
      modelExecution: modelPair
        ? {
            kind: "ask",
            threadId: route.thread.id,
            prompt,
            model: modelPair.model,
            provider: modelPair.provider,
            attachments: resolveVisionAttachments(modelPair.model, submittedAttachments),
            attachmentContexts: route.draftThread.attachmentContexts,
            projectScan: threadProjectScan,
            conversation: createThreadConversation(route.thread)
          }
        : { kind: "missing-model", threadId: route.thread.id }
    };
  }

  if (route.kind === "ask-new") {
    const modelPair = findThreadModelPair(settings, route.thread.modelId);

    return {
      kind: "run",
      clearPausedThreadId: route.thread.id,
      threadMutation: {
        kind: "prepend-thread",
        thread: route.thread,
        selectThread: true
      },
      remember: {
        threadId: route.thread.id,
        prompt,
        projectPath: route.thread.projectPath ?? null
      },
      modelExecution: modelPair
        ? {
            kind: "ask",
            threadId: route.thread.id,
            prompt: route.thread.prompt,
            model: modelPair.model,
            provider: modelPair.provider,
            attachments: resolveVisionAttachments(modelPair.model, submittedAttachments),
            attachmentContexts: route.thread.attachmentContexts,
            projectScan: currentProjectPath ? projectScan ?? null : null
          }
        : { kind: "missing-model", threadId: route.thread.id }
    };
  }

  if (route.kind === "project-follow-up") {
    if (!projectScan) {
      return { kind: "notice", reason: "project-scanning" };
    }

    const modelPair = findThreadModelPair(settings, route.draftThread.modelId);
    const createdAt = now();

    return {
      kind: "run",
      clearPausedThreadId: route.thread.id,
      threadMutation: createFollowUpMutation(route.thread, prompt, createdAt, {
        attachments: submittedAttachments,
        attachmentContexts: route.draftThread.attachmentContexts
      }),
      modelExecution: modelPair
        ? {
            kind: "plan",
            threadId: route.thread.id,
            taskPrompt: prompt,
            model: modelPair.model,
            provider: modelPair.provider,
            attachments: resolveVisionAttachments(modelPair.model, submittedAttachments),
            attachmentContexts: route.draftThread.attachmentContexts,
            projectScan
          }
        : { kind: "missing-model", threadId: route.thread.id }
    };
  }

  if (!projectScan) {
    return { kind: "notice", reason: "project-scanning" };
  }

  const modelPair = findThreadModelPair(settings, route.thread.modelId);

  return {
    kind: "run",
    clearPausedThreadId: route.thread.id,
    threadMutation: {
      kind: "prepend-thread",
      thread: route.thread,
      selectThread: true
    },
    modelExecution: modelPair
      ? {
          kind: "plan",
          threadId: route.thread.id,
          taskPrompt: route.thread.prompt,
          model: modelPair.model,
          provider: modelPair.provider,
          attachments: resolveVisionAttachments(modelPair.model, route.thread.attachments),
          attachmentContexts: route.thread.attachmentContexts,
          projectScan
        }
      : { kind: "missing-model", threadId: route.thread.id }
  };
}

function createFollowUpMutation(
  thread: TaskThread,
  prompt: string,
  createdAt: string,
  attachments: {
    attachments?: AgentImageAttachment[];
    attachmentContexts?: AgentAttachmentContext[];
  }
): TaskSubmissionThreadMutation {
  // follow-up 的事件 id 必须稳定携带线程 id 和时间, 这样 timeline、折叠摘要和重试记录能追踪同一轮提交。
  return {
    kind: "append-follow-up",
    threadId: thread.id,
    event: {
      id: `${thread.id}-user-${createdAt}`,
      message: prompt,
      createdAt,
      attachments: attachments.attachments,
      attachmentContexts: attachments.attachmentContexts
    }
  };
}

function findThreadModelPair(
  settings: ModelSettings,
  modelId: string
): { model: ForgeModel; provider: ForgeProvider } | null {
  const model = settings.models.find((candidate) => candidate.id === modelId) ?? null;
  const provider = model
    ? settings.providers.find((candidate) => candidate.id === model.providerId) ?? null
    : null;

  return model && provider ? { model, provider } : null;
}

function resolveThreadProjectScan(
  thread: TaskThread,
  currentProjectPath: string | null,
  projectScan: ProjectScanResult | null | undefined
): ProjectScanResult | null {
  if (!currentProjectPath || !projectScan) {
    return null;
  }

  return !thread.projectPath || thread.projectPath === currentProjectPath ? projectScan : null;
}
