import { describe, expect, it } from "vitest";
import { createInitialPlanEvents } from "./initialPlanner";

describe("initialPlanner", () => {
  it("creates visible planning events from a project scan", () => {
    const events = createInitialPlanEvents({
      threadId: "thread-1",
      prompt: "实现设置持久化",
      speed: "balanced",
      projectScan: {
        rootPath: "E:\\CodeHome\\Forge",
        files: [
          { relativePath: "package.json", size: 2 },
          { relativePath: "src/renderer/src/App.tsx", size: 1200 }
        ],
        truncated: false
      },
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(events).toEqual([
      {
        id: "thread-1-plan-1",
        kind: "plan",
        message: "已索引 2 个文件, 准备为任务生成执行计划",
        createdAt: "2026-05-27T13:00:00.000Z"
      },
      {
        id: "thread-1-plan-2",
        kind: "plan",
        message: "标准模式: 兼顾代码扫描范围和验证成本",
        createdAt: "2026-05-27T13:00:00.000Z"
      },
      {
        id: "thread-1-plan-3",
        kind: "plan",
        message: "初始步骤: 理解需求 -> 定位相关文件 -> 小步修改 -> 运行验证 -> 展示 diff",
        createdAt: "2026-05-27T13:00:00.000Z"
      }
    ]);
  });
});
