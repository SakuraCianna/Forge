// 本文件说明: 验证渲染入口的 Agent 自动执行闭环和真实文件写入路径
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentPlanResult } from "@shared/agentTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import { createDefaultGeneralPreferences, saveGeneralPreferences } from "@/state/generalPreferences";
import { addManualModel, createDefaultModelSettings, saveModelSettings } from "@/state/modelSettings";
import { saveRecentProjects } from "@/state/projects";
import { App } from "./App";

const projectRoot = "E:\\CodeHome\\Werewolf";

describe("App agent execution", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    setupPersistedState();
  });

  it("continues from a missing inspect step and writes a newly generated file in full access mode", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Create ProjectGuide.md",
      createdAt: "2026-05-31T01:00:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Inspect guide",
          description: "Inspect ProjectGuide.md",
          kind: "inspect",
          status: "pending",
          target: "ProjectGuide.md"
        },
        {
          id: "step-2",
          title: "Create guide",
          description: "Create ProjectGuide.md",
          kind: "edit",
          status: "pending",
          target: "ProjectGuide.md"
        }
      ]
    };
    const nextFile: ProjectTextFile = {
      relativePath: "ProjectGuide.md",
      content: "# Project Guide\n\nUse this project.",
      size: 33
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "ProjectGuide.md",
      currentContent: "",
      nextContent: nextFile.content,
      diff: [{ kind: "add", newLineNumber: 1, text: "# Project Guide" }]
    };
    const forge = createForgeMock({ plan, preview, writtenFile: nextFile });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    const promptInput = screen.getByRole("textbox");
    await user.type(promptInput, "Create ProjectGuide.md explaining how to use this project");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.writeText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "ProjectGuide.md",
        nextContent: nextFile.content
      })
    );
    const fileChangeRequest = vi.mocked(forge.agent.generateFileChange).mock.calls[0]?.[0];
    expect(fileChangeRequest).toEqual(
      expect.objectContaining({
        currentContent: "",
        relativePath: "ProjectGuide.md"
      })
    );
    expect(fileChangeRequest?.taskPrompt).toContain(
      "Original task:\nCreate ProjectGuide.md explaining how to use this project"
    );
    expect(fileChangeRequest?.taskPrompt).toContain("Target file:\nProjectGuide.md");
  });
});

// 准备一个已打开项目和可用模型, 让 App 启动后直接进入项目工作区
function setupPersistedState(): void {
  const settings = addManualModel(createDefaultModelSettings(), "openai", "gpt-test");
  saveModelSettings(window.localStorage, settings);
  saveGeneralPreferences(window.localStorage, {
    ...createDefaultGeneralPreferences(),
    fullAccess: true
  });
  saveRecentProjects(window.localStorage, [
    {
      name: "Werewolf",
      path: projectRoot,
      openedAt: "2026-05-31T00:00:00.000Z"
    }
  ]);
}

// 构造渲染层依赖的 preload API, 只模拟本测试需要穿过的 IPC 边界
function createForgeMock({
  plan,
  preview,
  writtenFile
}: {
  plan: AgentPlanResult;
  preview: ProjectFileChangePreview;
  writtenFile: ProjectTextFile;
}): Window["forge"] {
  return {
    appName: "Forge",
    windowControls: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    },
    secrets: {
      saveProviderKey: vi.fn(async () => undefined),
      getProviderKeyStatus: vi.fn(async () => ({ hasKey: true, last4: "test" })),
      deleteProviderKey: vi.fn(async () => undefined)
    },
    models: {
      fetchProviderModels: vi.fn()
    },
    agent: {
      generatePlan: vi.fn(async () => plan),
      generateFileChange: vi.fn(async () => ({
        providerId: "openai",
        modelId: "openai:gpt-test",
        relativePath: preview.relativePath,
        nextContent: preview.nextContent,
        createdAt: "2026-05-31T01:00:01.000Z"
      })),
      generateAsk: vi.fn(),
      generateAskStream: vi.fn(),
      cancelAskStream: vi.fn(async (requestId: string) => ({ ok: true, requestId })),
      onAskStreamChunk: vi.fn(() => () => undefined)
    },
    projects: {
      pickDirectory: vi.fn(async () => null),
      scan: vi.fn(async () => ({
        rootPath: projectRoot,
        files: [],
        truncated: false
      }))
    },
    commands: {
      run: vi.fn(),
      cancel: vi.fn(async (request: { runId: string }) => ({ ok: true, runId: request.runId })),
      onOutput: vi.fn(() => () => undefined)
    },
    git: {
      status: vi.fn(async () => ({
        isRepo: true,
        changedFiles: [],
        changes: [],
        rawStatus: ""
      })),
      commit: vi.fn(),
      createWorktree: vi.fn()
    },
    files: {
      readText: vi.fn(async () => {
        throw new Error("ENOENT: no such file or directory");
      }),
      previewTextUpdate: vi.fn(async () => preview),
      writeText: vi.fn(async () => writtenFile)
    }
  };
}
