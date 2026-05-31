// 本文件说明: 维护任务线程的生命周期, 流式输出, 命令回放和记忆快照
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentMemoryContext } from "@shared/agentTypes";
import type { CommandOutputChunk } from "@shared/commandTypes";
import type { ProjectFileChangePreview } from "@shared/fileTypes";
import { getEnabledModels } from "./modelSettings";

export type TaskThreadStatus = "planned" | "running" | "blocked" | "completed";

export type TaskThreadEventKind = "user" | "plan" | "command" | "file" | "error" | "result";

export type CommandRunResult = {
  runId?: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

export type CommandRunState = {
  runId?: string;
  command: string;
  status: "running";
  stdout?: string;
  stderr?: string;
};

export type CommandApprovalRecord = {
  command: string;
  reason: string;
  approvedAt: string;
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
  contextMemories?: AgentMemoryContext[];
  agentActions?: AgentAction[];
  events: TaskThreadEvent[];
};

type ThreadDeps = {
  createId: () => string;
  now: () => string;
};

type ThreadMemorySource = AgentMemoryContext & {
  createdAt?: string;
  updatedAt?: string;
  sourceThreadId?: string;
};

export type CreateThreadResult =
  | { ok: true; thread: TaskThread }
  | { ok: false; reason: "empty-prompt" | "missing-model" };

// 根据当前模型设置创建线程, 这里只记录用户请求本身而不塞入模板步骤
export function createThreadFromSettings(
  settings: ModelSettings,
  prompt: string,
  deps: ThreadDeps = {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString()
  }
): CreateThreadResult {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    return { ok: false, reason: "empty-prompt" };
  }

  const enabledModels = getEnabledModels(settings);
  const selectedModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;

  if (!selectedModel) {
    return { ok: false, reason: "missing-model" };
  }

  const id = deps.createId();
  const createdAt = deps.now();

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
      // 新线程不写入占位计划事件, 真实进度只来自模型输出和命令结果
      events: []
    }
  };
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
  event: { id: string; message: string; createdAt: string }
): TaskThread[] {
  return appendThreadEvents(
    threads,
    threadId,
    [
      {
        id: event.id,
        kind: "user",
        message: event.message,
        createdAt: event.createdAt
      }
    ],
    "running"
  );
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
                message: delta.finalText ?? `${event.message}${delta.delta}`,
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
    message: `Command approved: ${command} (${reason})`,
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
          agentActions: actions
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
    status: getThreadStatusForAgentActions(agentActions, thread.status),
    agentActions
  };
}

// 从动作队列推导线程状态, 失败优先于运行中和完成态
function getThreadStatusForAgentActions(
  actions: AgentAction[] | undefined,
  currentStatus: TaskThreadStatus
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
