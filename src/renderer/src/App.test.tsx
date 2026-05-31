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

  it("blocks edit actions when global read only mode is enabled", async () => {
    const user = userEvent.setup();
    saveGeneralPreferences(window.localStorage, {
      ...createDefaultGeneralPreferences(),
      readOnly: true
    });
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Edit README.md",
      createdAt: "2026-05-31T01:10:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Edit README",
          description: "Edit README.md",
          kind: "edit",
          status: "pending",
          target: "README.md"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "README.md",
      currentContent: "old",
      nextContent: "new",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "README.md",
        content: "new",
        size: 3
      }
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Update README.md");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/未允许编辑文件/)).toBeInTheDocument();
    expect(forge.agent.generateFileChange).not.toHaveBeenCalled();
    expect(forge.files.writeText).not.toHaveBeenCalled();
  });

  it("runs project search actions without invoking the shell command runner", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Search for submit handler",
      createdAt: "2026-05-31T01:20:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Search submit handler",
          description: "Search for handleSubmit before editing.",
          kind: "inspect",
          status: "pending",
          target: "handleSubmit"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "README.md",
      currentContent: "",
      nextContent: "",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "README.md",
        content: "",
        size: 0
      }
    });

    vi.mocked(forge.files.searchText).mockResolvedValueOnce({
      query: "handleSubmit",
      matches: [
        {
          relativePath: "src/App.tsx",
          lineNumber: 42,
          preview: "function handleSubmit() {"
        }
      ],
      truncated: false
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Find handleSubmit");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.searchText).toHaveBeenCalledWith({
        projectRoot,
        query: "handleSubmit",
        limit: 40
      })
    );
    expect(forge.commands.run).not.toHaveBeenCalled();
    expect(await screen.findByText(/项目搜索完成: handleSubmit/)).toBeInTheDocument();
    expect(screen.getByText(/src\/App\.tsx:42/)).toBeInTheDocument();
  });

  it("runs project glob actions without invoking the shell command runner", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Find TSX files",
      createdAt: "2026-05-31T01:25:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Find TSX files",
          description: "Find TSX files before editing.",
          kind: "inspect",
          status: "pending",
          target: "src/**/*.tsx"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "README.md",
      currentContent: "",
      nextContent: "",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "README.md",
        content: "",
        size: 0
      }
    });

    vi.mocked(forge.files.globFiles).mockResolvedValueOnce({
      pattern: "src/**/*.tsx",
      matches: [
        {
          relativePath: "src/App.tsx",
          size: 128
        }
      ],
      truncated: false
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Find TSX files");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.globFiles).toHaveBeenCalledWith({
        projectRoot,
        pattern: "src/**/*.tsx",
        limit: 80
      })
    );
    expect(forge.commands.run).not.toHaveBeenCalled();
    expect(await screen.findByText(/文件匹配完成: src\/\*\*\/\*\.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/src\/App\.tsx/)).toBeInTheDocument();
  });

  it("runs controlled Git status actions without invoking the shell command runner", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Check Git changes",
      createdAt: "2026-05-31T01:30:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Check Git status",
          description: "Inspect working tree before commit.",
          kind: "verify",
          status: "pending",
          target: "git status --short"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "README.md",
      currentContent: "",
      nextContent: "",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "README.md",
        content: "",
        size: 0
      }
    });

    vi.mocked(forge.git.status).mockResolvedValue({
      isRepo: true,
      changedFiles: ["src/App.tsx"],
      changes: [
        {
          path: "src/App.tsx",
          status: "M",
          diff: "diff --git a/src/App.tsx b/src/App.tsx\n+changed"
        }
      ],
      rawStatus: " M src/App.tsx\n"
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Check git status");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(forge.git.status).toHaveBeenCalledWith({ projectRoot }));
    expect(forge.commands.run).not.toHaveBeenCalled();
    expect(await screen.findByText(/Git 状态完成: 1 个文件有改动/)).toBeInTheDocument();
    expect(screen.getByText(/src\/App\.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/Diff 摘要/)).toBeInTheDocument();
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
      globFiles: vi.fn(async () => ({
        pattern: "",
        matches: [],
        truncated: false
      })),
      searchText: vi.fn(async () => ({
        query: "",
        matches: [],
        truncated: false
      })),
      previewTextUpdate: vi.fn(async () => preview),
      writeText: vi.fn(async () => writtenFile)
    }
  };
}
