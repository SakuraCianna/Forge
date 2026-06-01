// 本文件说明: 渲染个性化设置区, 避免 SettingsPanel 继续膨胀
import type { ReactElement } from "react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import type { PersonalizationSettings } from "@/state/personalization";
import { InlineSelectMenu } from "../InlineSelectMenu";

type PersonalizationSettingsSectionProps = {
  language: Language;
  personalization: PersonalizationSettings;
  onUpdatePersonalization: (settings: PersonalizationSettings) => void;
};

export function PersonalizationSettingsSection({
  language,
  personalization,
  onUpdatePersonalization
}: PersonalizationSettingsSectionProps): ReactElement {
  const { t } = useI18n(language);

  return (
    <section>
      <div className="grid gap-4">
        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-[#202123]">{t("settings.replyTone")}</span>
            <span className="mt-1 block text-xs text-[#6e6e80]">
              {t("settings.replyToneDescription")}
            </span>
          </span>
          <InlineSelectMenu
            ariaLabel={t("settings.replyTone")}
            value={personalization.replyTone}
            options={[
              { value: "friendly", label: t("settings.tone.friendly") },
              { value: "concise", label: t("settings.tone.concise") },
              { value: "technical", label: t("settings.tone.technical") }
            ]}
            onChange={(value) =>
              onUpdatePersonalization({
                ...personalization,
                replyTone: value as PersonalizationSettings["replyTone"]
              })
            }
          />
        </label>

        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-[#202123]">
              {t("settings.contextSuggestions")}
            </span>
            <span className="mt-1 block text-xs text-[#6e6e80]">
              {t("settings.contextSuggestionsDescription")}
            </span>
          </span>
          <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={personalization.contextSuggestionsEnabled}
              onChange={(event) =>
                onUpdatePersonalization({
                  ...personalization,
                  contextSuggestionsEnabled: event.currentTarget.checked
                })
              }
            />
            <span className="absolute inset-0 rounded-full bg-[#d9d9e3] transition peer-checked:bg-[#202123]" />
            <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition peer-checked:translate-x-5" />
          </span>
        </label>

        <label className="grid gap-2 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-[#202123]">
              {t("settings.customInstructions")}
            </span>
            <span className="mt-1 block text-xs text-[#6e6e80]">
              {t("settings.customInstructionsDescription")}
            </span>
          </span>
          <textarea
            value={personalization.customInstructions}
            onChange={(event) =>
              onUpdatePersonalization({
                ...personalization,
                customInstructions: event.currentTarget.value
              })
            }
            className="min-h-36 resize-y rounded-[14px] border border-[#d9d9e3] bg-white p-3 text-sm leading-6 text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
            placeholder={t("settings.customInstructionsPlaceholder")}
          />
        </label>
      </div>
    </section>
  );
}
