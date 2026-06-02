// 本文件说明: 生成已处理折叠标题里的恢复状态短摘要
import type { Language } from "@shared/modelTypes";
import type { AutoFailureRecoverySkipRecord, TaskThread } from "@/state/taskThreads";
import { collectAgentRecoverySummaryStats } from "./agentCompletionSummary";

export function getProcessedRecoverySummary(
  thread: TaskThread,
  language: Language
): string | null {
  const stats = collectAgentRecoverySummaryStats(thread);
  const parts: string[] = [];

  if (stats.autoAttempts > 0) {
    parts.push(
      language === "zh-CN"
        ? `自动 ${stats.autoAttempts}`
        : `auto ${stats.autoAttempts}`
    );
  }

  if (stats.manualAttempts > 0) {
    parts.push(
      language === "zh-CN"
        ? `人工 ${stats.manualAttempts}`
        : `manual ${stats.manualAttempts}`
    );
  }

  if (stats.paused.length > 0) {
    const reasons = formatPausedReasonSummary(stats.paused, language);

    parts.push(
      language === "zh-CN"
        ? `暂停 ${stats.paused.length}${reasons ? ` (${reasons})` : ""}`
        : `paused ${stats.paused.length}${reasons ? ` (${reasons})` : ""}`
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return language === "zh-CN" ? `恢复 ${parts.join(" / ")}` : `recovery ${parts.join(" / ")}`;
}

function formatPausedReasonSummary(
  paused: AutoFailureRecoverySkipRecord[],
  language: Language
): string {
  const reasons = Array.from(
    new Set(paused.map((item) => formatPausedReason(item.reason, language)))
  );

  if (reasons.length <= 2) {
    return reasons.join(language === "zh-CN" ? "、" : ", ");
  }

  return language === "zh-CN"
    ? `${reasons.slice(0, 2).join("、")} 等`
    : `${reasons.slice(0, 2).join(", ")} and more`;
}

function formatPausedReason(
  reason: AutoFailureRecoverySkipRecord["reason"],
  language: Language
): string {
  if (language === "zh-CN") {
    return {
      "requires-permission": "权限",
      "requires-dependency": "依赖",
      "user-cancelled": "取消"
    }[reason];
  }

  return {
    "requires-permission": "permission",
    "requires-dependency": "dependency",
    "user-cancelled": "cancelled"
  }[reason];
}
