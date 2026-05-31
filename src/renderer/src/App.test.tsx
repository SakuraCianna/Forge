// 本文件说明: 验证渲染入口的 Agent 自动执行闭环和真实文件写入路径
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentPlanResult } from "@shared/agentTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import {
  agentApprovedCommandRuleReason,
  createDefaultGeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences
} from "@/state/generalPreferences";
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

  it("lets users persist an exact allow rule from a command approval gate", async () => {
    const user = userEvent.setup();
    const englishSettings = addManualModel(createDefaultModelSettings(), "openai", "gpt-test");
    saveModelSettings(window.localStorage, { ...englishSettings, language: "en-US" });
    saveGeneralPreferences(window.localStorage, {
      ...createDefaultGeneralPreferences(),
      fullAccess: false
    });
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Install dependencies",
      createdAt: "2026-05-31T01:15:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Install dependencies",
          description: "Run npm install",
          kind: "verify",
          status: "pending",
          target: "npm install"
        }
      ]
    };
    const forge = createForgeMock({
      plan,
      preview: {
        relativePath: "README.md",
        currentContent: "",
        nextContent: "",
        diff: []
      },
      writtenFile: {
        relativePath: "README.md",
        content: "",
        size: 0
      }
    });

    vi.mocked(forge.commands.run).mockResolvedValueOnce({
      runId: "run-1",
      command: "npm install",
      cwd: projectRoot,
      exitCode: 0,
      stdout: "installed",
      stderr: "",
      timedOut: false
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Install dependencies");
    await user.keyboard("{Enter}");

    await user.click(
      await screen.findByRole("button", { name: "Always allow queued command npm install" })
    );

    await waitFor(() =>
      expect(forge.commands.run).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRoot,
          cwd: projectRoot,
          command: "npm install"
        })
      )
    );
    expect(screen.queryByText("Allowed exact command for future agent runs: npm install")).not.toBeInTheDocument();
    expect(loadGeneralPreferences(window.localStorage).commandSafetyRules).toEqual([
      {
        id: expect.stringMatching(/^agent-allow-/u),
        pattern: "npm install",
        level: "allow",
        reason: agentApprovedCommandRuleReason
      }
    ]);
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
    expect(screen.queryByText(/项目搜索完成: handleSubmit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/App\.tsx:42/)).not.toBeInTheDocument();
  });

  it("passes controlled tool results into the following file edit prompt", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Search and edit submit handler",
      createdAt: "2026-05-31T01:22:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Search submit handler",
          description: "Search for handleSubmit before editing.",
          kind: "inspect",
          status: "pending",
          target: "handleSubmit"
        },
        {
          id: "step-2",
          title: "Edit App",
          description: "Update the submit handler.",
          kind: "edit",
          status: "pending",
          target: "src/App.tsx"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "src/App.tsx",
      currentContent: "",
      nextContent: "export const App = () => null;",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "src/App.tsx",
        content: "export const App = () => null;",
        size: 30
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

    await user.type(screen.getByRole("textbox"), "Update handleSubmit");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(forge.agent.generateFileChange).toHaveBeenCalled());

    const fileChangeRequest = vi.mocked(forge.agent.generateFileChange).mock.calls[0]?.[0];
    expect(fileChangeRequest?.taskPrompt).toContain("Prior controlled tool results:");
    expect(fileChangeRequest?.taskPrompt).toContain("项目搜索完成: handleSubmit");
    expect(fileChangeRequest?.taskPrompt).toContain("src/App.tsx:42 function handleSubmit()");
  });

  it("passes inspected file content into the following file edit prompt", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Inspect package and edit app",
      createdAt: "2026-05-31T01:23:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Inspect package",
          description: "Inspect package.json before editing.",
          kind: "inspect",
          status: "pending",
          target: "package.json"
        },
        {
          id: "step-2",
          title: "Edit App",
          description: "Update App with package script context.",
          kind: "edit",
          status: "pending",
          target: "src/App.tsx"
        }
      ]
    };
    const preview: ProjectFileChangePreview = {
      relativePath: "src/App.tsx",
      currentContent: "export const App = () => null;",
      nextContent: "export const App = () => 'updated';",
      diff: []
    };
    const forge = createForgeMock({
      plan,
      preview,
      writtenFile: {
        relativePath: "src/App.tsx",
        content: "export const App = () => 'updated';",
        size: 36
      }
    });

    vi.mocked(forge.files.readText).mockImplementation(async (request) => {
      if (request.relativePath === "package.json") {
        return {
          relativePath: "package.json",
          content: "{\"scripts\":{\"test\":\"vitest\"}}",
          size: 29
        };
      }

      return {
        relativePath: "src/App.tsx",
        content: "export const App = () => null;",
        size: 30
      };
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Use package script context in App");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(forge.agent.generateFileChange).toHaveBeenCalled());

    const fileChangeRequest = vi.mocked(forge.agent.generateFileChange).mock.calls[0]?.[0];
    expect(fileChangeRequest?.taskPrompt).toContain("Prior controlled tool results:");
    expect(fileChangeRequest?.taskPrompt).toContain("文件读取完成: package.json");
    expect(fileChangeRequest?.taskPrompt).toContain("\"scripts\":{\"test\":\"vitest\"}");
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
    expect(screen.queryByText(/文件匹配完成: src\/\*\*\/\*\.tsx/)).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/App\.tsx/)).not.toBeInTheDocument();
  });

  it("runs project directory list actions without invoking the shell command runner", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "List source directory",
      createdAt: "2026-05-31T01:28:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "List source directory",
          description: "List src before editing.",
          kind: "inspect",
          status: "pending",
          target: "src"
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

    vi.mocked(forge.files.listDirectory).mockResolvedValueOnce({
      relativePath: "src",
      entries: [
        {
          name: "App.tsx",
          relativePath: "src/App.tsx",
          kind: "file",
          size: 128
        },
        {
          name: "components",
          relativePath: "src/components",
          kind: "directory"
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

    await user.type(screen.getByRole("textbox"), "List src before editing");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.listDirectory).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "src",
        limit: 80
      })
    );
    expect(forge.commands.run).not.toHaveBeenCalled();
    expect(screen.queryByText(/目录列表完成: src/)).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/App\.tsx/)).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/components\//)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/Git 状态完成: 1 个文件有改动/)).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/App\.tsx/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Diff 摘要/)).not.toBeInTheDocument();
  });

  it("skips a blocked agent command and continues with the next safe action", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Skip unsafe command and inspect README",
      createdAt: "2026-05-31T01:35:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Unsafe command",
          description: "Try a destructive command.",
          kind: "verify",
          status: "pending",
          target: "Remove-Item -Recurse src"
        },
        {
          id: "step-2",
          title: "Inspect README",
          description: "Inspect README.md after skipping the unsafe command.",
          kind: "inspect",
          status: "pending",
          target: "README.md"
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
        content: "# Forge",
        size: 7
      }
    });

    vi.mocked(forge.files.readText).mockResolvedValueOnce({
      relativePath: "README.md",
      content: "# Forge",
      size: 7
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Skip the unsafe command and inspect README");
    await user.keyboard("{Enter}");

    await user.click(await screen.findByRole("button", { name: /跳过动作 Run Remove-Item -Recurse src/ }));

    await waitFor(() =>
      expect(forge.files.readText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "README.md"
      })
    );
    expect(forge.commands.run).not.toHaveBeenCalled();
    expect(screen.queryByText(/已跳过 Agent 动作: Run Remove-Item -Recurse src/)).not.toBeInTheDocument();
  });

  it("uses a pending agent commit suggestion from source control and records the commit action", async () => {
    const user = userEvent.setup();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Commit changes",
      createdAt: "2026-05-31T01:40:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Commit changes",
          description: "Commit the completed work.",
          kind: "commit",
          status: "pending",
          target: "git commit -m \"完善 Agent 提交门禁\""
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
    const dirtyStatus = {
      isRepo: true,
      changedFiles: ["README.md"],
      changes: [
        {
          path: "README.md",
          status: "M",
          diff: "diff --git a/README.md b/README.md\n+updated"
        }
      ],
      rawStatus: " M README.md\n"
    };

    vi.mocked(forge.git.status).mockResolvedValue(dirtyStatus);
    vi.mocked(forge.git.commit).mockResolvedValueOnce({
      output: "[main abc123] 完善 Agent 提交门禁",
      status: {
        isRepo: true,
        changedFiles: [],
        changes: [],
        rawStatus: ""
      }
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Commit with agent suggestion");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "源代码管理" }));

    expect(await screen.findByText("Agent 提交建议")).toBeInTheDocument();
    expect(screen.getByText("完善 Agent 提交门禁")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "使用 Agent 提交建议" }));
    expect(screen.getByLabelText("提交信息")).toHaveValue("完善 Agent 提交门禁");

    await user.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() =>
      expect(forge.git.commit).toHaveBeenCalledWith({
        projectRoot,
        message: "完善 Agent 提交门禁"
      })
    );
    expect(await screen.findByText("已创建 Git 提交")).toBeInTheDocument();

    const threadRow = screen.getByText("Commit with agent suggestion").closest("button");
    expect(threadRow).not.toBeNull();
    await user.click(threadRow!);

    expect(screen.queryByText(/已完成 Agent 提交动作: 完善 Agent 提交门禁/)).not.toBeInTheDocument();
  });

  it("pauses an active agent batch and resumes remaining safe actions", async () => {
    const user = userEvent.setup();
    const firstRead = createDeferred<ProjectTextFile>();
    const plan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Inspect files",
      createdAt: "2026-05-31T01:45:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Inspect README",
          description: "Inspect README.md",
          kind: "inspect",
          status: "pending",
          target: "README.md"
        },
        {
          id: "step-2",
          title: "Inspect package",
          description: "Inspect package.json",
          kind: "inspect",
          status: "pending",
          target: "package.json"
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

    vi.mocked(forge.files.readText).mockImplementation(async (request) => {
      if (request.relativePath === "README.md") {
        return firstRead.promise;
      }

      return {
        relativePath: "package.json",
        content: "{\"name\":\"forge\"}",
        size: 16
      };
    });

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Inspect README and package");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.readText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "README.md"
      })
    );
    await user.click(screen.getByRole("button", { name: "停止回答" }));

    firstRead.resolve({
      relativePath: "README.md",
      content: "# Forge",
      size: 7
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "恢复 Agent" })).toBeInTheDocument());
    expect(vi.mocked(forge.files.readText).mock.calls).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "恢复 Agent" }));

    await waitFor(() =>
      expect(forge.files.readText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "package.json"
      })
    );
    expect(screen.queryByText("已恢复 Agent 执行")).not.toBeInTheDocument();
  });

  it("generates a continuation plan from completed agent context and runs the next safe action", async () => {
    const user = userEvent.setup();
    const englishSettings = addManualModel(createDefaultModelSettings(), "openai", "gpt-test");
    saveModelSettings(window.localStorage, { ...englishSettings, language: "en-US" });
    const initialPlan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Inspect README first",
      createdAt: "2026-05-31T01:50:00.000Z",
      steps: [
        {
          id: "step-1",
          title: "Inspect README",
          description: "Inspect README.md before continuing.",
          kind: "inspect",
          status: "pending",
          target: "README.md"
        }
      ]
    };
    const continuationPlan: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-test",
      text: "Inspect package next",
      createdAt: "2026-05-31T01:51:00.000Z",
      steps: [
        {
          id: "step-2",
          title: "Inspect package",
          description: "Inspect package.json after reviewing README.",
          kind: "inspect",
          status: "pending",
          target: "package.json"
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
      plan: initialPlan,
      preview,
      writtenFile: {
        relativePath: "README.md",
        content: "",
        size: 0
      }
    });

    vi.mocked(forge.agent.generatePlan)
      .mockResolvedValueOnce(initialPlan)
      .mockResolvedValueOnce(continuationPlan);
    vi.mocked(forge.files.readText).mockImplementation(async (request) => ({
      relativePath: request.relativePath,
      content:
        request.relativePath === "README.md"
          ? "# Forge\nInitial context"
          : "{\"name\":\"forge\"}",
      size: request.relativePath === "README.md" ? 23 : 16
    }));

    Object.defineProperty(window, "forge", {
      configurable: true,
      value: forge
    });

    render(<App />);

    await waitFor(() => expect(forge.projects.scan).toHaveBeenCalledWith(projectRoot));

    await user.type(screen.getByRole("textbox"), "Inspect README and then continue planning");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(forge.files.readText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "README.md"
      })
    );
    await user.click(await screen.findByRole("button", { name: "Generate next plan" }));

    await waitFor(() => expect(forge.agent.generatePlan).toHaveBeenCalledTimes(2));
    const continuationRequest = vi.mocked(forge.agent.generatePlan).mock.calls[1]?.[0];
    expect(continuationRequest?.taskPrompt).toContain(
      "Generate the next execution plan from the current state."
    );
    expect(continuationRequest?.taskPrompt).toContain("[completed] Inspect README.md");
    expect(continuationRequest?.taskPrompt).toContain("File read complete: README.md");
    expect(continuationRequest?.taskPrompt).toContain("do not repeat completed or skipped actions");

    await waitFor(() =>
      expect(forge.files.readText).toHaveBeenCalledWith({
        projectRoot,
        relativePath: "package.json"
      })
    );
    expect(screen.queryByText("Generating a continuation plan from current thread state")).not.toBeInTheDocument();
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
      listDirectory: vi.fn(async () => ({
        relativePath: ".",
        entries: [],
        truncated: false
      })),
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

// 构造可手动 resolve 的 Promise, 用于测试 Stop 后批次不会继续冒进
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}
