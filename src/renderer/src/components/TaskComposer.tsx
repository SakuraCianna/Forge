import type { ReactElement } from "react";
import { useState } from "react";
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
};

export function TaskComposer({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onSubmitTask
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [prompt, setPrompt] = useState("");

  function submitTask(): void {
    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      return;
    }

    onSubmitTask(normalizedPrompt);
    setPrompt("");
  }

  return (
    <section className="border-t border-white/10 bg-[#101114] px-8 py-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/12 bg-[#f7f5f0] p-3 text-[#222] shadow-2xl">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          className="min-h-20 w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-[#8a8178]"
          placeholder={t("composer.placeholder")}
        />
        <div className="mt-2 flex items-center justify-between">
          <ModelSelector
            settings={settings}
            onSelectModel={onSelectModel}
            onSelectIntelligence={onSelectIntelligence}
            onSelectSpeed={onSelectSpeed}
          />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#222] text-white hover:bg-[#333]"
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
