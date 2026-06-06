// Turns a composer submission into a structured route before App side effects run.
import type {
  AgentAttachmentContext,
  AgentImageAttachment,
  AgentProfileContext
} from "@shared/agentTypes";
import type { ModelSettings } from "@shared/modelTypes";
import { canAppendDirectAnswerToThread, isDirectAnswerPrompt } from "./conversationRouting.js";
import {
  createThreadFromSettings,
  type TaskThread
} from "./taskThreads.js";

export type TaskSubmissionRoute =
  | { kind: "invalid"; reason: "empty-prompt" | "missing-model" }
  | { kind: "project-required" }
  | { kind: "project-scanning" }
  | { kind: "ask-follow-up"; draftThread: TaskThread; thread: TaskThread }
  | { kind: "ask-new"; thread: TaskThread }
  | { kind: "project-follow-up"; draftThread: TaskThread; thread: TaskThread }
  | { kind: "project-new"; thread: TaskThread };

type CreateTaskSubmissionRouteOptions = {
  activeThread: TaskThread | null;
  agentProfile?: AgentProfileContext;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
  createId?: () => string;
  currentProjectPath: string | null;
  hasProjectScan: boolean;
  now?: () => string;
  prompt: string;
  settings: ModelSettings;
};

export function createTaskSubmissionRoute({
  activeThread,
  agentProfile,
  attachments,
  attachmentContexts,
  createId,
  currentProjectPath,
  hasProjectScan,
  now,
  prompt,
  settings
}: CreateTaskSubmissionRouteOptions): TaskSubmissionRoute {
  if (isDirectAnswerPrompt(prompt)) {
    const result = createThreadFromSettings(settings, prompt, {
      agentProfile,
      attachments,
      attachmentContexts,
      createId,
      now
    });

    if (!result.ok) {
      return { kind: "invalid", reason: result.reason };
    }

    if (
      activeThread &&
      activeThread.status !== "running" &&
      canAppendDirectAnswerToThread(activeThread.projectPath, currentProjectPath)
    ) {
      return { kind: "ask-follow-up", draftThread: result.thread, thread: activeThread };
    }

    return {
      kind: "ask-new",
      thread: {
        ...result.thread,
        projectPath: currentProjectPath,
        status: "running",
        events: []
      }
    };
  }

  if (!currentProjectPath) {
    return { kind: "project-required" };
  }

  if (!hasProjectScan) {
    return { kind: "project-scanning" };
  }

  const result = createThreadFromSettings(settings, prompt, {
    agentProfile,
    attachments,
    attachmentContexts,
    createId,
    now
  });

  if (!result.ok) {
    return { kind: "invalid", reason: result.reason };
  }

  return {
    kind: "project-new",
    thread: {
      ...result.thread,
      status: "running",
      projectPath: currentProjectPath
    }
  };
}
