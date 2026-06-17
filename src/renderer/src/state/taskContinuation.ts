// 本文件说明: 判断用户短指令是否应该续写上一轮项目任务线程
import { isContinuationPrompt } from "./conversationRouting.js";
import type { TaskThread } from "./taskThreads.js";

export function shouldSubmitAsContinuation(
  thread: TaskThread | null,
  currentProjectPath: string | null,
  prompt: string
): thread is TaskThread {
  if (!thread || thread.status === "running" || !isContinuationPrompt(prompt)) {
    return false;
  }

  if (thread.projectPath && currentProjectPath && thread.projectPath !== currentProjectPath) {
    return false;
  }

  return (
    (thread.agentActions?.length ?? 0) > 0 ||
    thread.events.some((event) =>
      event.kind === "plan" ||
      event.kind === "file" ||
      Boolean(event.commandRun) ||
      Boolean(event.commandResult)
    )
  );
}
