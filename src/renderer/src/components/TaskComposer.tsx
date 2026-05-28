import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
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
  focusSignal?: number;
  submitSignal?: number;
};

export function TaskComposer({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onSubmitTask,
  onOpenSettings,
  focusSignal = 0,
  submitSignal = 0
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  return (
    <section className="border-t border-[#ececf1] bg-white px-5 py-4">
      <div className="mx-auto max-w-[880px] rounded-[18px] border border-[#d9d9e3] bg-white p-3 text-[#202123] shadow-[0_12px_36px_rgba(0,0,0,0.08)] transition focus-within:border-[#202123]">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          className="min-h-[68px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-[#8e8ea0]"
          placeholder={t("composer.placeholder")}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <ModelSelector
            settings={settings}
            onSelectModel={onSelectModel}
            onSelectIntelligence={onSelectIntelligence}
            onSelectSpeed={onSelectSpeed}
            onOpenSettings={onOpenSettings}
          />
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
    </section>
  );
}
