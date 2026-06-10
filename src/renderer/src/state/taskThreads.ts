// 本文件说明: 维护任务线程的生命周期, 流式输出, 命令回放和记忆快照
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type {
  AgentAttachmentContext,
  AgentImageAttachment,
  AgentMemoryContext,
  AgentProfileContext
} from "@shared/agentTypes";
import type { CommandOutputChunk } from "@shared/commandTypes";
import type { ProjectFileChangePreview } from "@shared/fileTypes";

type TaskThreadStatus = "planned" | "running" | "blocked" | "completed";

type TaskThreadEventKind = "user" | "plan" | "command" | "file" | "error" | "result";

export type CommandRunResult = {
  runId?: string;
  actionId?: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

type CommandRunState = {
  runId?: string;
  actionId?: string;
  command: string;
  status: "running";
  stdout?: string;
  stderr?: string;
};

type CommandApprovalRecord = {
  command: string;
  reason: string;
  approvedAt: string;
};

export type FailureRecoveryAttemptRecord = {
  actionId: string;
  label: string;
  source: "manual" | "auto";
  attempt?: number;
  limit?: number;
};

export type AutoFailureRecoverySkipRecord = {
  actionId: string;
  label: string;
  reason: "requires-permission" | "requires-dependency" | "user-cancelled";
  detail: string;
};

export type AgentActionRunRecord = {
  actionId: string;
  label: string;
  status: "started" | "completed" | "failed" | "waiting" | "confirmed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  reason?: string;
};

export type FileChangeRecord = {
  relativePath: string;
  changeKind: "create" | "edit" | "delete";
  previousContent?: string | null;
  nextContent?: string | null;
};

export type ThreadFileRevertOperation = {
  relativePath: string;
  previousContent: string | null;
};

export type ThreadPromptRetryPlan = {
  prompt: string;
  fileReverts: ThreadFileRevertOperation[];
  retainedEvents: TaskThreadEvent[];
};

export type ThreadContextCompaction = {
  content: string;
  createdAt: string;
  estimatedTokensAfter: number;
  estimatedTokensBefore: number;
  reason: "manual" | "auto";
  retainedEventCount: number;
  sourceEventCount: number;
};

export type TaskThreadEvent = {
  id: string;
  kind: TaskThreadEventKind;
  message: string;
  createdAt: string;
  completedAt?: string;
  commandRun?: CommandRunState;
  commandResult?: CommandRunResult;
  commandApproval?: CommandApprovalRecord;
  agentActionRun?: AgentActionRunRecord;
  fileChange?: FileChangeRecord;
  failureRecoveryAttempt?: FailureRecoveryAttemptRecord;
  autoFailureRecoverySkip?: AutoFailureRecoverySkipRecord;
};

export type TaskThread = {
  id: string;
  title: string;
  prompt: string;
  status: TaskThreadStatus;
  modelId: string;
  intelligence: IntelligenceLevel;
  speed: SpeedMode;
  createdAt: string;
  pinned?: boolean;
  archived?: boolean;
  projectPath?: string | null;
  contextCompaction?: ThreadContextCompaction;
  contextMemories?: AgentMemoryContext[];
  agentProfile?: AgentProfileContext;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
  agentActions?: AgentAction[];
  events: TaskThreadEvent[];
};

type ThreadDeps = {
  createId?: () => string;
  now?: () => string;
  agentProfile?: AgentProfileContext;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
};

type ThreadMemorySource = AgentMemoryContext & {
  createdAt?: string;
  updatedAt?: string;
  sourceThreadId?: string;
};

type CreateThreadResult =
  | { ok: true; thread: TaskThread }
  | { ok: false; reason: "empty-prompt" | "missing-model" };

// 根据当前模型设置创建线程, 这里只记录用户请求本身而不塞入模板步骤
export function createThreadFromSettings(
  settings: ModelSettings,
  prompt: string,
  deps: ThreadDeps = {}
): CreateThreadResult {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    return { ok: false, reason: "empty-prompt" };
  }

  const enabledModels = getEnabledThreadModels(settings);
  const selectedModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;

  if (!selectedModel) {
    return { ok: false, reason: "missing-model" };
  }

  const id = deps.createId?.() ?? crypto.randomUUID();
  const createdAt = deps.now?.() ?? new Date().toISOString();

  return {
    ok: true,
    thread: {
      id,
      title: normalizedPrompt.slice(0, 32),
      prompt: normalizedPrompt,
      status: "planned",
      modelId: selectedModel.id,
      intelligence: settings.intelligence,
      speed: settings.speed,
      createdAt,
      agentProfile: deps.agentProfile ? cloneAgentProfileContext(deps.agentProfile) : undefined,
      attachments: deps.attachments?.map(cloneAgentImageAttachment),
      attachmentContexts: deps.attachmentContexts?.map(cloneAgentAttachmentContext),
      // 新线程不写入占位计划事件, 真实进度只来自模型输出和命令结果
      events: []
    }
  };
}

function getEnabledThreadModels(settings: ModelSettings): ModelSettings["models"] {
  return [...settings.models]
    .filter((model) => model.enabled)
    .sort((first, second) => {
      if (first.id === settings.currentModelId && second.id !== settings.currentModelId) {
        return -1;
      }

      if (second.id === settings.currentModelId && first.id !== settings.currentModelId) {
        return 1;
      }

      const selectionDelta = (second.selectionCount ?? 0) - (first.selectionCount ?? 0);

      if (selectionDelta !== 0) {
        return selectionDelta;
      }

      const recencyDelta =
        Date.parse(second.lastSelectedAt ?? "") - Date.parse(first.lastSelectedAt ?? "");

      if (Number.isFinite(recencyDelta) && recencyDelta !== 0) {
        return recencyDelta;
      }

      return first.label.localeCompare(second.label);
    });
}

function cloneAgentProfileContext(agentProfile: AgentProfileContext): AgentProfileContext {
  return {
    ...agentProfile,
    enabledTools: [...agentProfile.enabledTools]
  };
}

function cloneAgentImageAttachment(attachment: AgentImageAttachment): AgentImageAttachment {
  return { ...attachment };
}

function cloneAgentAttachmentContext(context: AgentAttachmentContext): AgentAttachmentContext {
  return { ...context };
}

function mergeAgentImageAttachments(
  current: AgentImageAttachment[] | undefined,
  incoming: AgentImageAttachment[] | undefined
): AgentImageAttachment[] | undefined {
  if (!incoming?.length) {
    return current;
  }

  const byId = new Map((current ?? []).map((attachment) => [attachment.id, attachment]));

  incoming.forEach((attachment) => {
    byId.set(attachment.id, cloneAgentImageAttachment(attachment));
  });

  return Array.from(byId.values());
}

function mergeAgentAttachmentContexts(
  current: AgentAttachmentContext[] | undefined,
  incoming: AgentAttachmentContext[] | undefined
): AgentAttachmentContext[] | undefined {
  if (!incoming?.length) {
    return current;
  }

  const byId = new Map((current ?? []).map((context) => [context.id, context]));

  incoming.forEach((context) => {
    byId.set(context.id, cloneAgentAttachmentContext(context));
  });

  return Array.from(byId.values());
}

// 追加线程事件并按需要更新状态, 保持事件历史只通过不可变更新写入
export function appendThreadEvents(
  threads: TaskThread[],
  threadId: string,
  events: TaskThreadEvent[],
  status?: TaskThreadStatus
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: status ?? thread.status,
          events: [...thread.events, ...events]
        }
      : thread
  );
}

// 把追问作为用户事件追加到同一线程, 避免问答和执行任务被强行分离
export function appendThreadFollowUpPrompt(
  threads: TaskThread[],
  threadId: string,
  event: {
    id: string;
    message: string;
    createdAt: string;
    attachments?: AgentImageAttachment[];
    attachmentContexts?: AgentAttachmentContext[];
  }
): TaskThread[] {
  // 追问可能带新附件。这里把附件快照合并进原线程, 后续失败恢复、续跑和文件修改
  // 才能继续拿到同一批本地解析上下文, 而不是只在当前这一轮模型请求里生效。
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: "running",
          attachments: mergeAgentImageAttachments(thread.attachments, event.attachments),
          attachmentContexts: mergeAgentAttachmentContexts(
            thread.attachmentContexts,
            event.attachmentContexts
          ),
          events: [
            ...thread.events,
            {
              id: event.id,
              kind: "user",
              message: event.message,
              createdAt: event.createdAt
            }
          ]
        }
      : thread
  );
}

// 为“从上一条提示词重发”构造回滚计划。只回滚有明确旧内容快照的文件事件。
export function createThreadPromptRetryPlan({
  thread,
  userEventId
}: {
  thread: TaskThread;
  userEventId?: string;
}): ThreadPromptRetryPlan {
  const userEventIndex =
    userEventId === undefined
      ? -1
      : thread.events.findIndex((event) => event.id === userEventId && event.kind === "user");
  const retryUserEvent = userEventIndex >= 0 ? thread.events[userEventIndex] : null;
  const eventsAfterPrompt = thread.events.slice(userEventIndex + 1);
  const retainedEvents = userEventIndex >= 0 ? thread.events.slice(0, userEventIndex) : [];
  const fileReverts: ThreadFileRevertOperation[] = [];

  for (let index = eventsAfterPrompt.length - 1; index >= 0; index -= 1) {
    const fileChange = eventsAfterPrompt[index]?.fileChange;

    if (!fileChange || !Object.prototype.hasOwnProperty.call(fileChange, "previousContent")) {
      continue;
    }

    if (fileChange.previousContent === undefined) {
      continue;
    }

    fileReverts.push({
      relativePath: fileChange.relativePath,
      previousContent: fileChange.previousContent
    });
  }

  return {
    prompt: retryUserEvent?.message ?? thread.prompt,
    fileReverts,
    retainedEvents
  };
}

// 固定本次请求注入模型的记忆快照, 让界面能解释回答用了哪些上下文
export function attachThreadMemoryContext(
  threads: TaskThread[],
  threadId: string,
  memories: ThreadMemorySource[]
): TaskThread[] {
  const contextMemories = memories.map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    content: memory.content,
    projectPath: memory.projectPath ?? null
  }));

  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          contextMemories
        }
      : thread
  );
}

// 用户终止后把线程置为阻塞并追加可读错误, 不改写已有输出内容
export function cancelThread(
  threads: TaskThread[],
  threadId: string,
  event: { createdAt: string; message: string }
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: "blocked",
          events: [
            ...thread.events,
            {
              id: `${threadId}-cancelled-${event.createdAt}`,
              kind: "error",
              message: event.message,
              createdAt: event.createdAt
            }
          ]
        }
      : thread
  );
}

// 合并模型流式返回的文本片段, 服务端提前结束时用 finalText 覆盖最终回答
export function appendThreadResultDelta(
  threads: TaskThread[],
  threadId: string,
  delta: {
    eventId: string;
    createdAt: string;
    completedAt?: string;
    delta: string;
    done: boolean;
    finalText?: string;
    replace?: boolean;
  }
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const existingEvent = thread.events.find((event) => event.id === delta.eventId);
    const events = existingEvent
      ? thread.events.map((event) =>
          event.id === delta.eventId
            ? {
                ...event,
                message:
                  delta.finalText ?? (delta.replace ? delta.delta : `${event.message}${delta.delta}`),
                completedAt: delta.completedAt ?? event.completedAt
              }
            : event
        )
      : [
          ...thread.events,
          {
            id: delta.eventId,
            kind: "result" as const,
            message: delta.finalText ?? delta.delta,
            createdAt: delta.createdAt,
            completedAt: delta.completedAt
          }
        ];

    return {
      ...thread,
      status: delta.done ? "completed" : "running",
      events
    };
  });
}

// 合并计划生成阶段的流式文本, 这类内部输出默认会折叠进 compact 的“已处理”
export function appendThreadPlanDelta(
  threads: TaskThread[],
  threadId: string,
  delta: {
    eventId: string;
    createdAt: string;
    completedAt?: string;
    delta: string;
    done: boolean;
    finalText?: string;
    replace?: boolean;
  }
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const existingEvent = thread.events.find((event) => event.id === delta.eventId);
    const events = existingEvent
      ? thread.events.map((event) =>
          event.id === delta.eventId
            ? {
                ...event,
                message:
                  delta.finalText ?? (delta.replace ? delta.delta : `${event.message}${delta.delta}`),
                completedAt: delta.completedAt ?? event.completedAt
              }
            : event
        )
      : [
          ...thread.events,
          {
            id: delta.eventId,
            kind: "plan" as const,
            message: delta.finalText ?? delta.delta,
            createdAt: delta.createdAt,
            completedAt: delta.completedAt
          }
        ];

    return {
      ...thread,
      status: "running",
      events
    };
  });
}

// 把命令实时 stdout 和 stderr 拼回对应事件, 供终端面板持续刷新
export function appendCommandRunOutput(
  threads: TaskThread[],
  output: CommandOutputChunk
): TaskThread[] {
  return threads.map((thread) => {
    let changed = false;
    const events = thread.events.map((event) => {
      if (!event.commandRun || !commandRunMatchesOutput(event.commandRun, output)) {
        return event;
      }

      changed = true;
      const currentOutput = event.commandRun[output.stream] ?? "";

      return {
        ...event,
        commandRun: {
          ...event.commandRun,
          [output.stream]: limitLiveCommandOutput(`${currentOutput}${output.chunk}`)
        }
      };
    });

    return changed ? { ...thread, events } : thread;
  });
}

// 记录用户批准的单次命令, 让时间线和命令页都能追溯
export function createCommandApprovalEvent({
  threadId,
  actionId,
  command,
  reason,
  createdAt
}: {
  threadId: string;
  actionId: string;
  command: string;
  reason: string;
  createdAt: string;
}): TaskThreadEvent {
  return {
    id: `${threadId}-command-approved-${actionId}-${createdAt}`,
    kind: "command",
    message: `命令已批准: ${command} (${reason})`,
    createdAt,
    commandApproval: {
      command,
      reason,
      approvedAt: createdAt
    }
  };
}

// 保存模型规划出的 Agent 动作队列, 后续执行器按这个快照推进
export function attachThreadAgentActions(
  threads: TaskThread[],
  threadId: string,
  actions: AgentAction[]
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: thread.status === "completed" && actions.length > 0 ? "planned" : thread.status,
          agentActions: actions,
          events: thread.events.filter((event) => !isAgentCompletionSummaryEvent(threadId, event))
        }
      : thread
  );
}

// 按动作 id 更新执行状态, 同时重新计算线程整体状态
export function updateThreadAgentActionStatus(
  threads: TaskThread[],
  threadId: string,
  actionId: string,
  status: AgentAction["status"]
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? updateThreadActionStatus(thread, actionId, status) : thread
  );
}

export function updateThreadAgentAction(
  threads: TaskThread[],
  threadId: string,
  actionId: string,
  updater: (action: AgentAction) => AgentAction
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId || !thread.agentActions) {
      return thread;
    }

    return {
      ...thread,
      agentActions: thread.agentActions.map((action) =>
        action.id === actionId ? updater(action) : action
      )
    };
  });
}

// 将指定类型的下一个待执行动作标为完成, 用于文件变更和命令结果回写
export function completeNextPendingAgentAction(
  threads: TaskThread[],
  threadId: string,
  kind: AgentAction["kind"]
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const action = thread.agentActions?.find(
      (candidate) => candidate.kind === kind && candidate.status === "pending"
    );

    return action ? updateThreadActionStatus(thread, action.id, "completed") : thread;
  });
}

// 根据文件变更预览来源更新对应 Agent 动作, 避免切换会话后写错线程
export function updateThreadAgentActionFromFileChangePreview(
  threads: TaskThread[],
  preview: ProjectFileChangePreview | null | undefined,
  status: AgentAction["status"]
): TaskThread[] {
  if (!preview?.source?.threadId || !preview.source.actionId) {
    return threads;
  }

  return updateThreadAgentActionStatus(
    threads,
    preview.source.threadId,
    preview.source.actionId,
    status
  );
}

// 更新单个动作并保留其他动作顺序, 线程状态由动作集合推导
function updateThreadActionStatus(
  thread: TaskThread,
  actionId: string,
  status: AgentAction["status"]
): TaskThread {
  const agentActions = thread.agentActions?.map((action) =>
    action.id === actionId ? { ...action, status } : action
  );

  return {
    ...thread,
    status: getThreadStatusForAgentActions(agentActions, thread.status, {
      fullAccess: thread.agentProfile?.permissionMode === "full"
    }),
    agentActions
  };
}

function isAgentCompletionSummaryEvent(threadId: string, event: TaskThreadEvent): boolean {
  return event.kind === "result" && event.id.startsWith(`${threadId}-agent-summary-`);
}

// 从动作队列推导线程状态; full access 线程里的 manual/commit 只是可自动完成的动作, 不应提前把线程标成 blocked。
function getThreadStatusForAgentActions(
  actions: AgentAction[] | undefined,
  currentStatus: TaskThreadStatus,
  options: { fullAccess?: boolean } = {}
): TaskThreadStatus {
  if (!actions || actions.length === 0) {
    return currentStatus;
  }

  if (actions.some((action) => action.status === "failed")) {
    return "blocked";
  }

  if (actions.some((action) => action.status === "running")) {
    return "running";
  }

  if (actions.every((action) => action.status === "completed" || action.status === "skipped")) {
    return "completed";
  }

  const nextIncompleteAction = actions.find(
    (action) => action.status !== "completed" && action.status !== "skipped"
  );

  if (
    !options.fullAccess &&
    nextIncompleteAction?.status === "pending" &&
    (nextIncompleteAction.kind === "manual" || nextIncompleteAction.kind === "commit")
  ) {
    return "blocked";
  }

  return currentStatus;
}

// 切换会话置顶状态, 侧边栏排序直接依赖这个字段
export function toggleThreadPinned(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, pinned: !thread.pinned } : thread
  );
}

// 归档单个会话时同步取消置顶, 避免归档列表和置顶列表冲突
export function archiveThread(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, archived: true, pinned: false } : thread
  );
}

// 永久移除单个会话记录, 不触碰项目文件和执行产物
export function deleteThread(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.filter((thread) => thread.id !== threadId);
}

// 从归档恢复会话, 只恢复可见性不自动恢复置顶
export function restoreThread(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, archived: false } : thread
  );
}

// 批量归档全部会话, 设置页清理入口会调用这里
export function archiveAllThreads(threads: TaskThread[]): TaskThread[] {
  return threads.map((thread) => ({ ...thread, archived: true, pinned: false }));
}

// 只归档指定项目下的会话, 保留其他项目的工作流历史
export function archiveProjectThreads(threads: TaskThread[], projectPath: string): TaskThread[] {
  return threads.map((thread) =>
    thread.projectPath === projectPath ? { ...thread, archived: true, pinned: false } : thread
  );
}

const maxLiveCommandOutputLength = 12000;
const liveCommandOutputTruncationNotice =
  "[Forge output truncated; showing latest command output]\n";

// 优先用 runId 匹配命令输出, 旧事件没有 runId 时回退到命令文本
function commandRunMatchesOutput(
  commandRun: CommandRunState,
  output: CommandOutputChunk
): boolean {
  if (commandRun.runId && output.runId) {
    return commandRun.runId === output.runId;
  }

  return !commandRun.runId && !output.runId && commandRun.command === output.command;
}

// 限制实时命令输出长度, 防止长日志让线程状态变得沉重
function limitLiveCommandOutput(value: string): string {
  if (value.length <= maxLiveCommandOutputLength) {
    return value;
  }

  const tailLength = maxLiveCommandOutputLength - liveCommandOutputTruncationNotice.length;

  return `${liveCommandOutputTruncationNotice}${value.slice(-tailLength)}`;
}
