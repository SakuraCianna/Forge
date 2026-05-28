import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUp, BotMessageSquare, Check, ChevronDown, FolderOpen, Plus } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import type { ForgeProject } from "@/state/projects";
import { getProjectDisplayName } from "@/state/projects";
import { ModelSelector } from "./ModelSelector";

export type ComposerContextMode = "ask" | "project";

type TaskComposerProps = {
  settings: ModelSettings;
  contextMode?: ComposerContextMode;
  onSelectContextMode?: (mode: ComposerContextMode) => void;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectProject?: (projectPath: string) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
  onSubmitTask: (prompt: string) => void;
  onOpenSettings?: () => void;
  onPickProject?: () => void;
  focusSignal?: number;
  placeholder?: string;
  projectName?: string | null;
  projectPath?: string | null;
  projects?: ForgeProject[];
  submitSignal?: number;
  variant?: "dock" | "hero";
};

export function TaskComposer({
  settings,
  contextMode = "project",
  onSelectContextMode,
  onSelectModel,
  onSelectIntelligence,
  onSelectProject,
  onSelectSpeed,
  onSubmitTask,
  onOpenSettings,
  onPickProject,
  focusSignal = 0,
  placeholder,
  projectName,
  projectPath,
  projects = [],
  submitSignal = 0,
  variant = "dock"
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isHero = variant === "hero";
  const placeholderText = placeholder ?? t("composer.placeholder");
  const copy = getComposerCopy(settings.language);
  const selectedProjectByPath = projects.find((project) => project.path === projectPath);
  const selectedProjectByName = projectName
    ? projects.find((project) => project.name === projectName)
    : undefined;
  const selectedProject =
    selectedProjectByPath ??
    selectedProjectByName ??
    (projectName && projectPath ? { name: projectName, path: projectPath, openedAt: "" } : null);

  const submitTask = useCallback((): void => {
    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      return;
    }

    onSubmitTask(normalizedPrompt);
    setPrompt("");
  }, [onSubmitTask, prompt]);

  useEffect(() => {
    if (focusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    if (submitSignal > 0) {
      submitTask();
    }
  }, [submitSignal, submitTask]);

  const inputPanel = (
    <div
      className={`bg-white p-3 text-[#202123] transition focus-within:border-[#202123] ${
        isHero
          ? "rounded-t-[22px] border-0 shadow-none"
          : "rounded-[20px] border border-[#d9d9e3] shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
      }`}
    >
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        className={`w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-[#b4b4bf] ${
          isHero ? "min-h-[58px]" : "min-h-[68px]"
        }`}
        placeholder={placeholderText}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {isHero ? (
            <button
              type="button"
              aria-label={copy.addProject}
              title={copy.addProject}
              onClick={onPickProject}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#565869] transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.97]"
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : null}
          <ModelSelector
            settings={settings}
            onSelectModel={onSelectModel}
            onSelectIntelligence={onSelectIntelligence}
            onSelectSpeed={onSelectSpeed}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#202123] text-white transition hover:bg-black active:scale-[0.97]"
          aria-label={t("composer.send")}
          title={t("composer.send")}
          onClick={submitTask}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  if (isHero) {
    return (
      <section className="w-full">
        <div className="mx-auto max-w-[760px] overflow-visible rounded-[22px] border border-[#d9d9e3] bg-white shadow-[0_18px_54px_rgba(0,0,0,0.10)] transition focus-within:border-[#202123]">
          {inputPanel}
          {renderContextSelector()}
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-[#ececf1] bg-white px-5 py-4">
      <div className="mx-auto max-w-[880px]">{inputPanel}</div>
    </section>
  );

  function renderContextSelector(): ReactElement {
    const triggerLabel =
      contextMode === "ask"
        ? copy.askOnly
        : selectedProject
          ? `${t("composer.projectContext")} ${getProjectDisplayName(selectedProject, projects)}`
          : t("composer.enterProject");

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-12 w-full items-center gap-2 rounded-b-[22px] border-t border-[#ececf1] bg-white px-4 text-left text-sm text-[#565869] transition hover:bg-[#f7f7f8] hover:text-[#202123]"
          >
            {contextMode === "ask" ? (
              <BotMessageSquare className="h-4 w-4 shrink-0" />
            ) : (
              <FolderOpen className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-64px)] rounded-[18px] border border-[#d9d9e3] bg-white p-2 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
          >
            <ContextItem
              selected={contextMode === "ask"}
              onSelect={() => onSelectContextMode?.("ask")}
            >
              <BotMessageSquare className="h-4 w-4" />
              <span className="min-w-0">
                <span className="block truncate">{copy.askOnly}</span>
                <span className="block truncate text-xs text-[#8e8ea0]">{copy.askHint}</span>
              </span>
            </ContextItem>
            <DropdownMenu.Separator className="my-1 h-px bg-[#ececf1]" />
            {projects.map((project) => {
              const displayName = getProjectDisplayName(project, projects);

              return (
                <ContextItem
                  key={project.path}
                  selected={contextMode === "project" && project.path === projectPath}
                  onSelect={() => {
                    onSelectContextMode?.("project");
                    onSelectProject?.(project.path);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="min-w-0">
                    <span className="block truncate">{displayName}</span>
                    <span className="block truncate text-xs text-[#8e8ea0]">{project.path}</span>
                  </span>
                </ContextItem>
              );
            })}
            <DropdownMenu.Separator className="my-1 h-px bg-[#ececf1]" />
            <ContextItem onSelect={onPickProject}>
              <Plus className="h-4 w-4" />
              <span>{copy.addProject}</span>
            </ContextItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }
}

function ContextItem({
  children,
  onSelect,
  selected = false
}: {
  children: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
}): ReactElement {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="grid min-h-11 cursor-default select-none grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-2 rounded-[11px] px-2.5 py-2 outline-none transition data-[highlighted]:bg-[#f7f7f8]"
    >
      {children}
      {selected ? <Check className="h-4 w-4 text-[#202123]" /> : <span />}
    </DropdownMenu.Item>
  );
}

function getComposerCopy(language: ModelSettings["language"]): {
  addProject: string;
  askHint: string;
  askOnly: string;
} {
  if (language === "zh-CN") {
    return {
      addProject: "新增项目",
      askHint: "纯聊天, 不读取项目文件",
      askOnly: "ASK 独立对话"
    };
  }

  return {
    addProject: "Add project",
    askHint: "Plain chat, no project files",
    askOnly: "ASK only conversation"
  };
}
