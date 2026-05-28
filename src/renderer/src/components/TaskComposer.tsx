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
    <section className="border-t border-[#e0e5ec] bg-[#fbfcfe] px-6 py-4">
      <div className="mx-auto rounded-xl border border-[#d8dee8] bg-white p-3 text-[#202124] shadow-[0_18px_50px_rgba(31,35,40,0.12)]">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          className="min-h-[76px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-[#8a919c]"
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111315] text-white shadow-sm transition hover:bg-[#30343a]"
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
