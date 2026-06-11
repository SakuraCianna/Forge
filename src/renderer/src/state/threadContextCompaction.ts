// 本文件说明: 以本地确定性摘要压缩线程上下文, 让长对话续写和续跑不会反复塞入完整历史
import type {
  CommandRunResult,
  TaskThread,
  TaskThreadEvent
} from "./taskThreads.js";

export const autoContextCompactionThreshold = 0.82;

export type CompactThreadContextOptions = {
  contextBudget: number;
  createdAt?: string;
  language: "zh-CN" | "en-US";
  reason: "manual" | "auto";
};

export type CompactThreadContextResult = {
  event: TaskThreadEvent;
  thread: TaskThread;
};

export function estimateThreadContextTokens(thread: TaskThread): number {
  const eventsForModelContext = getEventsAfterThreadContextCompaction(thread);
  const parts = [
    thread.prompt,
    thread.contextCompaction?.content,
    ...(thread.agentActions ?? []).map((action) =>
      [
        action.status,
        action.kind,
        action.label,
        action.target,
        action.command,
        action.builtInToolName,
        action.extensionActionId
      ]
        .filter((item): item is string => Boolean(item))
        .join(" ")
    ),
    ...eventsForModelContext.map(formatEventForTokenEstimate)
  ];

  return estimateTextTokens(parts.filter(Boolean).join("\n"));
}

export function shouldAutoCompactThreadContext(
  thread: TaskThread,
  contextBudget: number,
  threshold = autoContextCompactionThreshold
): boolean {
  if (!Number.isFinite(contextBudget) || contextBudget <= 0) {
    return false;
  }

  if (thread.events.length < 8) {
    return false;
  }

  const sourceEventCount = thread.contextCompaction?.sourceEventCount ?? 0;
  const eventsAfterCompaction = thread.events.length - sourceEventCount;

  // 已压缩后需要积累一些新事件再压缩, 避免每轮请求都追加重复摘要。
  if (thread.contextCompaction && eventsAfterCompaction < 6) {
    return false;
  }

  return estimateThreadContextTokens(thread) >= contextBudget * threshold;
}

export function compactThreadContext(
  thread: TaskThread,
  options: CompactThreadContextOptions
): CompactThreadContextResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const estimatedTokensBefore = estimateThreadContextTokens(thread);
  const content = createThreadContextCompactionSummary(thread);
  const retainedEvents = getEventsAfterThreadContextCompaction(thread).slice(-6);
  const estimatedTokensAfter =
    estimateTextTokens(thread.prompt) +
    estimateTextTokens(content) +
    estimateTextTokens(retainedEvents.map(formatEventForTokenEstimate).join("\n"));
  const event: TaskThreadEvent = {
    id: `${thread.id}-context-compact-${createdAt}`,
    kind: "plan",
    message:
      options.language === "zh-CN"
        ? `已${options.reason === "auto" ? "自动" : "手动"}压缩上下文: 约 ${estimatedTokensBefore} -> ${estimatedTokensAfter} tokens`
        : `${options.reason === "auto" ? "Auto" : "Manual"} context compaction complete: about ${estimatedTokensBefore} -> ${estimatedTokensAfter} tokens`,
    createdAt
  };

  return {
    event,
    thread: {
      ...thread,
      contextCompaction: {
        content,
        createdAt,
        estimatedTokensAfter,
        estimatedTokensBefore,
        reason: options.reason,
        retainedEventCount: retainedEvents.length,
        sourceEventCount: thread.events.length
      },
      events: [...thread.events, event]
    }
  };
}

export function getEventsAfterThreadContextCompaction(thread: TaskThread): TaskThreadEvent[] {
  const sourceEventCount = thread.contextCompaction?.sourceEventCount;

  if (sourceEventCount === undefined) {
    return thread.events;
  }

  return thread.events.slice(Math.max(0, Math.min(sourceEventCount, thread.events.length)));
}

export function formatThreadContextCompactionForPrompt(thread: TaskThread): string | null {
  const compaction = thread.contextCompaction;

  if (!compaction) {
    return null;
  }

  return [
    "Context compaction summary:",
    `Created at: ${compaction.createdAt}`,
    `Reason: ${compaction.reason}`,
    `Estimated tokens: ${compaction.estimatedTokensBefore} -> ${compaction.estimatedTokensAfter}`,
    compaction.content
  ].join("\n");
}

function createThreadContextCompactionSummary(thread: TaskThread): string {
  const events = getEventsAfterThreadContextCompaction(thread);
  const userMessages = events.filter((event) => event.kind === "user").map((event) => event.message);
  const assistantResults = events.filter((event) => event.kind === "result").map((event) => event.message);
  const fileChanges = collectFileChangeLines(events);
  const commandResults = collectCommandResultLines(events);
  const errors = events.filter((event) => event.kind === "error").map((event) => event.message);
  const priorSummary = thread.contextCompaction?.content;
  const actionSummary = collectActionSummary(thread);
  const timeline = events.slice(-12).map(formatTimelineEvent).filter(Boolean);
  const sections = [
    ["Original task", truncateBlock(thread.prompt, 1200)],
    priorSummary ? ["Previous compacted context", truncateBlock(priorSummary, 2400)] : null,
    userMessages.length > 0
      ? ["Recent user requests", userMessages.slice(-8).map((message) => `- ${truncateInline(message, 360)}`).join("\n")]
      : null,
    assistantResults.length > 0
      ? ["Recent assistant results", assistantResults.slice(-5).map((message) => `- ${truncateInline(message, 420)}`).join("\n")]
      : null,
    actionSummary ? ["Agent action state", actionSummary] : null,
    fileChanges.length > 0 ? ["File changes", fileChanges.slice(-12).join("\n")] : null,
    commandResults.length > 0 ? ["Command results", commandResults.slice(-8).join("\n")] : null,
    errors.length > 0
      ? ["Errors and blockers", errors.slice(-6).map((message) => `- ${truncateInline(message, 360)}`).join("\n")]
      : null,
    timeline.length > 0 ? ["Recent timeline", timeline.join("\n")] : null
  ].filter((section): section is [string, string] => Boolean(section));

  return sections.map(([title, content]) => `## ${title}\n${content}`).join("\n\n");
}

function collectActionSummary(thread: TaskThread): string | null {
  const actions = thread.agentActions ?? [];

  if (actions.length === 0) {
    return null;
  }

  const counts = actions.reduce<Record<string, number>>((current, action) => {
    current[action.status] = (current[action.status] ?? 0) + 1;
    return current;
  }, {});
  const countLine = Object.entries(counts)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  const actionLines = actions.slice(-12).map((action) => {
    const details = [
      action.target ? `target=${truncateInline(action.target, 120)}` : null,
      action.command ? `command=${truncateInline(action.command, 120)}` : null,
      action.builtInToolName ? `tool=${action.builtInToolName}` : null
    ]
      .filter((item): item is string => Boolean(item))
      .join(", ");

    return `- [${action.status}] ${truncateInline(action.label, 180)}${details ? ` (${details})` : ""}`;
  });

  return [`Counts: ${countLine}`, ...actionLines].join("\n");
}

function collectFileChangeLines(events: TaskThreadEvent[]): string[] {
  const latestByPath = new Map<string, string>();

  events.forEach((event) => {
    if (!event.fileChange) {
      return;
    }

    latestByPath.set(
      event.fileChange.relativePath,
      `- ${event.fileChange.changeKind}: ${event.fileChange.relativePath}`
    );
  });

  return Array.from(latestByPath.values());
}

function collectCommandResultLines(events: TaskThreadEvent[]): string[] {
  return events.flatMap((event) =>
    event.commandResult ? [formatCommandResultLine(event.createdAt, event.commandResult)] : []
  );
}

function formatCommandResultLine(createdAt: string, result: CommandRunResult): string {
  const output = result.stderr.trim() || result.stdout.trim();
  const status = result.cancelled
    ? "cancelled"
    : result.timedOut
      ? "timed out"
      : `exit ${result.exitCode}`;
  const outputSnippet = output ? `; output=${truncateInline(output, 260)}` : "";

  return `- ${createdAt}: ${truncateInline(result.command, 180)} -> ${status}${outputSnippet}`;
}

function formatTimelineEvent(event: TaskThreadEvent): string | null {
  if (event.kind === "user") {
    return `- user at ${event.createdAt}: ${truncateInline(event.message, 220)}`;
  }

  if (event.commandResult) {
    return formatCommandResultLine(event.createdAt, event.commandResult);
  }

  if (event.kind === "plan" || event.kind === "file" || event.kind === "error" || event.kind === "result") {
    return `- ${event.kind} at ${event.createdAt}: ${truncateInline(event.message, 220)}`;
  }

  return null;
}

function formatEventForTokenEstimate(event: TaskThreadEvent): string {
  return [
    event.kind,
    event.message,
    event.commandRun?.command,
    event.commandRun?.stdout,
    event.commandRun?.stderr,
    event.commandResult?.command,
    event.commandResult?.stdout,
    event.commandResult?.stderr,
    event.fileChange?.relativePath,
    event.fileChange?.nextContent
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

function estimateTextTokens(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return 0;
  }

  // UI 侧没有供应商 tokenizer, 用 chars/4 的保守估计作为触发阈值。
  return Math.ceil(normalized.length / 4);
}

function truncateInline(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function truncateBlock(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const marker = "\n...\n";
  const headLength = Math.floor((maxLength - marker.length) * 0.65);
  const tailLength = maxLength - marker.length - headLength;

  return `${normalized.slice(0, headLength)}${marker}${normalized.slice(-tailLength)}`;
}
