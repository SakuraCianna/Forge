// 本文件说明: 覆盖 Agent 记忆的持久化, 去重, 项目隔离和中文召回
import { describe, expect, it } from "vitest";
import {
  createAgentMemoryEntry,
  extractAgentMemoryCandidate,
  loadAgentMemories,
  saveAgentMemories,
  selectRelevantAgentMemories,
  upsertAgentMemory,
  type AgentMemoryEntry
} from "./agentMemory";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  // 让被测逻辑可以像真实 localStorage 一样读取键数量
  get length(): number {
    return this.values.size;
  }

  // 清空测试存储, 每个用例都能从干净状态开始
  clear(): void {
    this.values.clear();
  }

  // 按 Storage 接口返回字符串或 null, 避免测试依赖 Map 细节
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  // 支持按索引读取键名, 补齐 Storage 接口契约
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  // 删除单个键, 用于模拟浏览器存储的移除行为
  removeItem(key: string): void {
    this.values.delete(key);
  }

  // 写入字符串值, 与 localStorage 的序列化边界保持一致
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const deps = {
  createId: () => "memory-1",
  now: () => "2026-05-30T10:00:00.000Z"
};

describe("agentMemory", () => {
  it("creates and persists local agent memories", () => {
    const storage = new MemoryStorage();
    const entry = createAgentMemoryEntry(
      {
        content: "Use PowerShell-safe commands in this project",
        projectPath: "E:\\CodeHome\\Forge",
        sourceThreadId: "thread-1"
      },
      deps
    );

    saveAgentMemories(storage, [entry]);

    expect(loadAgentMemories(storage)).toEqual([entry]);
    expect(entry).toMatchObject({
      id: "memory-1",
      scope: "project",
      projectPath: "E:\\CodeHome\\Forge",
      content: "Use PowerShell-safe commands in this project"
    });
  });

  it("selects global and matching project memories without leaking other project memories", () => {
    const memories: AgentMemoryEntry[] = [
      createMemory("global", null, "Use concise answers", "2026-05-30T10:00:00.000Z"),
      createMemory("project", "E:\\CodeHome\\Forge", "Forge uses Electron", "2026-05-30T10:02:00.000Z"),
      createMemory("project", "E:\\CodeHome\\Aiko", "Aiko uses Live2D", "2026-05-30T10:03:00.000Z")
    ];

    expect(selectRelevantAgentMemories(memories, "E:\\CodeHome\\Forge").map((memory) => memory.content)).toEqual([
      "Forge uses Electron",
      "Use concise answers"
    ]);
  });

  it("prioritizes memories that match the current task query before freshness", () => {
    const memories: AgentMemoryEntry[] = [
      createMemory("project", "E:\\CodeHome\\Forge", "Use Playwright for browser checks", "2026-05-30T09:00:00.000Z"),
      createMemory("project", "E:\\CodeHome\\Forge", "Prefer concise UI copy", "2026-05-30T10:30:00.000Z"),
      createMemory("global", null, "Use PowerShell-safe commands", "2026-05-30T10:20:00.000Z")
    ];

    expect(
      selectRelevantAgentMemories(
        memories,
        "E:\\CodeHome\\Forge",
        2,
        "Run Playwright from PowerShell after changing browser layout"
      ).map((memory) => memory.content)
    ).toEqual(["Use Playwright for browser checks", "Use PowerShell-safe commands"]);
  });

  it("matches Chinese memory fragments with short semantic grams", () => {
    const memories: AgentMemoryEntry[] = [
      createMemory("project", "E:\\CodeHome\\Forge", "这个项目默认终端是 PowerShell", "2026-05-30T09:00:00.000Z"),
      createMemory("project", "E:\\CodeHome\\Forge", "提交后需要推送到 main", "2026-05-30T10:30:00.000Z")
    ];

    expect(
      selectRelevantAgentMemories(
        memories,
        "E:\\CodeHome\\Forge",
        1,
        "这个项目的默认终端是什么"
      ).map((memory) => memory.content)
    ).toEqual(["这个项目默认终端是 PowerShell"]);
  });

  it("extracts explicit remember requests and upserts duplicates", () => {
    const candidate = extractAgentMemoryCandidate(
      "请记住: 这个项目的默认终端是 PowerShell",
      "E:\\CodeHome\\Forge"
    );

    expect(candidate).toEqual({
      content: "这个项目的默认终端是 PowerShell",
      projectPath: "E:\\CodeHome\\Forge"
    });

    const first = upsertAgentMemory([], { ...candidate!, sourceThreadId: "thread-1" }, deps);
    const second = upsertAgentMemory(
      first,
      { ...candidate!, sourceThreadId: "thread-2" },
      { createId: () => "memory-2", now: () => "2026-05-30T10:05:00.000Z" }
    );

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      id: "memory-1",
      updatedAt: "2026-05-30T10:05:00.000Z",
      sourceThreadId: "thread-2"
    });
  });
});

// 快速构造不同作用域的记忆记录, 让排序和过滤断言更聚焦
function createMemory(
  scope: AgentMemoryEntry["scope"],
  projectPath: string | null,
  content: string,
  createdAt: string
): AgentMemoryEntry {
  return {
    id: `${scope}-${content}`,
    scope,
    projectPath,
    content,
    createdAt,
    updatedAt: createdAt
  };
}
