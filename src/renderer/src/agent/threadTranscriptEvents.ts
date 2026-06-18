// 本文件说明: 判断紧凑线程主屏应该直接展示哪些事件
import type { TaskThread, TaskThreadEvent } from "../state/taskThreads.js";

// 紧凑主屏在运行中展开可读执行过程, 完成后再折叠回最终总结
export function shouldShowCompactTranscriptEvent(
  event: TaskThreadEvent,
  threadStatus: TaskThread["status"]
): boolean {
  if (event.kind === "user") {
    return true;
  }

  if (event.kind === "result" && !isReadableLiveProgressEvent(event)) {
    return true;
  }

  if (threadStatus === "completed") {
    return false;
  }

  return isReadableLiveProgressEvent(event);
}

export function isReadableLiveProgressEvent(event: TaskThreadEvent): boolean {
  if (isRawPlanStreamEvent(event)) {
    return false;
  }

  if (event.agentActionRun) {
    return false;
  }

  if (isInternalAgentToolResultEvent(event)) {
    return false;
  }

  return (
    Boolean(event.commandRun) ||
    Boolean(event.commandResult) ||
    Boolean(event.commandApproval) ||
    Boolean(event.fileChange) ||
    Boolean(event.failureRecoveryAttempt) ||
    Boolean(event.autoFailureRecoverySkip) ||
    event.kind === "file" ||
    event.kind === "error" ||
    event.kind === "command" ||
    event.kind === "plan"
  );
}

function isInternalAgentToolResultEvent(event: TaskThreadEvent): boolean {
  return (
    /^.+-agent-(?:list-directory|git-status|glob|search|web-search|read-file|built-in-tool|extension)-/u.test(
      event.id
    ) || /^Built-in tool .+ result:/u.test(event.message)
  );
}

function isRawPlanStreamEvent(event: TaskThreadEvent): boolean {
  return event.kind === "plan" && event.id.includes("-plan-stream-");
}
