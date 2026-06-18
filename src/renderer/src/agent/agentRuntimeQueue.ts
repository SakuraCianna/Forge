// 本文件说明: 封装 Agent 队列的预约, 取消检查和批量推进, 让 App.tsx 少关心运行时互斥细节
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  runAgentActionBatch,
  type AgentActionRunOutcome
} from "./agentActionExecutor.js";

export type AgentRuntimeQueueCoordinator = {
  hasReservedAgentAction: (threadId: string, actions: AgentAction[]) => boolean;
  isThreadCancelled: (threadId: string) => boolean;
  reserveAgentActionBatch: (threadId: string, actions: AgentAction[]) => () => void;
};

export type AgentRuntimeActionRunOptions = {
  approvedCommand?: boolean;
  skipReservation?: boolean;
};

// 单动作入口统一处理预约和取消状态; 真正的文件, 命令, Git 副作用仍由调用方注入。
export async function runAgentRuntimeQueuedAction({
  threadId,
  action,
  options = {},
  coordinator,
  runReservedAction
}: {
  threadId: string;
  action: AgentAction;
  options?: AgentRuntimeActionRunOptions;
  coordinator: AgentRuntimeQueueCoordinator;
  runReservedAction: (
    action: AgentAction,
    options: Pick<AgentRuntimeActionRunOptions, "approvedCommand">
  ) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
}): Promise<AgentActionRunOutcome> {
  if (!options.skipReservation) {
    if (coordinator.hasReservedAgentAction(threadId, [action])) {
      return { status: "running", continueBatch: false };
    }

    const releaseReservation = coordinator.reserveAgentActionBatch(threadId, [action]);

    try {
      return await runAgentRuntimeQueuedAction({
        threadId,
        action,
        options: {
          ...options,
          skipReservation: true
        },
        coordinator,
        runReservedAction
      });
    } finally {
      releaseReservation();
    }
  }

  if (coordinator.isThreadCancelled(threadId)) {
    return { status: "pending", continueBatch: false };
  }

  return runReservedAction(action, {
    approvedCommand: options.approvedCommand
  });
}

// 批量入口只负责队列互斥和停止条件, 避免 UI 主文件重复拼装 reservation/finally。
export async function runAgentRuntimeQueuedActionBatch({
  threadId,
  actions,
  coordinator,
  runReservedAction
}: {
  threadId: string;
  actions: AgentAction[];
  coordinator: AgentRuntimeQueueCoordinator;
  runReservedAction: (action: AgentAction) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
}): Promise<void> {
  if (actions.length === 0 || coordinator.hasReservedAgentAction(threadId, actions)) {
    return;
  }

  const releaseReservation = coordinator.reserveAgentActionBatch(threadId, actions);

  try {
    await runAgentActionBatch(actions, (action) => {
      if (coordinator.isThreadCancelled(threadId)) {
        return { status: "pending", continueBatch: false };
      }

      return runReservedAction(action);
    });
  } finally {
    releaseReservation();
  }
}
