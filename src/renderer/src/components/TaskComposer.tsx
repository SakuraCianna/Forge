import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, FolderOpen, Plus } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import { ModelSelector } from "./ModelSelector";

type TaskComposerProps = {
  settings: ModelSettings;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
  onSubmitTask: (prompt: string) => void;
  onOpenSettings?: () => void;
  onPickProject?: () => void;
  focusSignal?: number;
  placeholder?: string;
  projectName?: string | null;
  submitSignal?: number;
  variant?: "dock" | "hero";
};

export function TaskComposer({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onSubmitTask,
  onOpenSettings,
  onPickProject,
  focusSignal = 0,
  placeholder,
  projectName,
  submitSignal = 0,
  variant = "dock"
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isHero = variant === "hero";
  const placeholderText = placeholder ?? t("composer.placeholder");

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
      className={`rounded-[20px] border border-[#d9d9e3] bg-white p-3 text-[#202123] transition focus-within:border-[#202123] ${
        isHero ? "shadow-[0_8px_34px_rgba(0,0,0,0.10)]" : "shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
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
          <div className="flex min-w-0 items-center gap-1.5">
            {isHero ? (
              <button
                type="button"
                aria-label={t("projects.pick")}
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#202123] text-white transition hover:bg-black active:scale-[0.97]"
            aria-label={t("composer.send")}
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
        <div className="mx-auto max-w-[760px] overflow-hidden rounded-[22px] bg-[#f7f7f8] shadow-[0_16px_48px_rgba(0,0,0,0.08)]">
          {inputPanel}
          <button
            type="button"
            onClick={onPickProject}
            className="flex h-12 w-full items-center gap-2 px-4 text-left text-sm text-[#6e6e80] transition hover:bg-[#ececf1] hover:text-[#202123] disabled:cursor-default disabled:hover:bg-[#f7f7f8]"
            disabled={!onPickProject}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {projectName ? `${t("composer.projectContext")} ${projectName}` : t("composer.enterProject")}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-[#ececf1] bg-white px-5 py-4">
      <div className="mx-auto max-w-[880px]">{inputPanel}</div>
    </section>
  );
}
