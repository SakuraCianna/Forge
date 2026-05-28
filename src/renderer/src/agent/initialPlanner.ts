import type { ProjectScanResult } from "@shared/projectTypes";
import type { SpeedMode } from "@shared/modelTypes";
import type { TaskThreadEvent } from "@/state/taskThreads";

type CreateInitialPlanEventsOptions = {
  threadId: string;
  prompt: string;
  speed: SpeedMode;
  projectScan: ProjectScanResult;
  now?: () => string;
};

const speedMessages: Record<SpeedMode, string> = {
  fast: "快速模式: 缩小代码扫描范围, 优先产出最小可用修改",
  balanced: "标准模式: 兼顾代码扫描范围和验证成本"
};

export function createInitialPlanEvents({
  threadId,
  speed,
  projectScan,
  now = () => new Date().toISOString()
}: CreateInitialPlanEventsOptions): TaskThreadEvent[] {
  const createdAt = now();
  const truncatedSuffix = projectScan.truncated ? ", 扫描结果已截断" : "";

  return [
    {
      id: `${threadId}-plan-1`,
      kind: "plan",
      message: `已索引 ${projectScan.files.length} 个文件${truncatedSuffix}, 准备为任务生成执行计划`,
      createdAt
    },
    {
      id: `${threadId}-plan-2`,
      kind: "plan",
      message: speedMessages[speed],
      createdAt
    },
    {
      id: `${threadId}-plan-3`,
      kind: "plan",
      message: "初始步骤: 理解需求 -> 定位相关文件 -> 小步修改 -> 运行验证 -> 展示 diff",
      createdAt
    }
  ];
}
