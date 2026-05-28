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
    <section className="border-t border-[rgba(148,163,184,0.1)] bg-[#080d16]/96 px-5 py-4">
      <div className="mx-auto max-w-[880px] rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(13,22,36,0.96),rgba(9,16,28,0.98))] p-3 text-[#e5edf7] shadow-[0_18px_58px_rgba(0,0,0,0.3)] backdrop-blur-xl transition focus-within:border-[rgba(95,134,255,0.45)]">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          className="min-h-[68px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-[#718198]"
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff6b3d] text-[#08111f] shadow-[0_12px_30px_rgba(255,107,61,0.26)] transition hover:bg-[#ff815a] active:scale-[0.97]"
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
