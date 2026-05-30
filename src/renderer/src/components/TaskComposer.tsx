import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUp, Check, ChevronDown, Hand, Plus, ShieldAlert, ShieldCheck, Square } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import {
  createDefaultGeneralPreferences,
  type GeneralPreferences
} from "@/state/generalPreferences";
import { ModelSelector } from "./ModelSelector";

type ComposerPermissionMode = "default" | "auto" | "full";

type TaskComposerProps = {
  busy?: boolean;
  settings: ModelSettings;
  generalPreferences?: GeneralPreferences;
  onCancelTask?: () => void;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
  onSubmitTask: (prompt: string) => void;
  onOpenSettings?: () => void;
  onPickProject?: () => void;
  onUpdateGeneralPreferences?: (preferences: GeneralPreferences) => void;
  focusSignal?: number;
  placeholder?: string;
  submitSignal?: number;
  variant?: "dock" | "hero";
};

export function TaskComposer({
  busy = false,
  settings,
  generalPreferences,
  onCancelTask,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onSubmitTask,
  onOpenSettings,
  onPickProject,
  onUpdateGeneralPreferences,
  focusSignal = 0,
  placeholder,
  submitSignal = 0,
  variant = "dock"
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isHero = variant === "hero";
  const placeholderText = placeholder ?? t("composer.placeholder");
  const copy = getComposerCopy(settings.language);
  const resolvedGeneralPreferences = generalPreferences ?? createDefaultGeneralPreferences();

  const submitTask = useCallback((): void => {
    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      return;
    }

    onSubmitTask(normalizedPrompt);
    setPrompt("");
  }, [onSubmitTask, prompt]);

  const handlePrimaryAction = useCallback((): void => {
    if (busy) {
      onCancelTask?.();
      return;
    }

    submitTask();
  }, [busy, onCancelTask, submitTask]);

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

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    // Enter 直接发送, Shift+Enter 保留换行
    event.preventDefault();
    submitTask();
  }

  const inputPanel = (
    <div
      className={`bg-white p-1.5 text-[#202123] transition focus-within:border-[#202123] ${
        isHero
          ? "rounded-[18px] border-0 shadow-none"
          : "rounded-[18px] border border-[#d9d9e3] shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
      }`}
    >
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        onKeyDown={handlePromptKeyDown}
        className={`w-full resize-none bg-transparent px-1.5 py-0.5 text-[10px] leading-4 outline-none placeholder:text-[#b4b4bf] ${
          isHero ? "min-h-[28px]" : "min-h-[22px]"
        }`}
        placeholder={placeholderText}
      />
      <div
        data-testid="composer-control-row"
        className="mt-1 flex items-center justify-between gap-2 overflow-visible"
      >
        <div
          data-testid="composer-left-controls"
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible"
        >
          <button
            type="button"
            aria-label={copy.addProject}
            title={copy.addProject}
            onClick={onPickProject}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#565869] outline-none transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.97] focus:outline-none focus-visible:outline-none"
          >
            <Plus className="h-4 w-4" />
          </button>
          {renderPermissionSelector()}
        </div>
        <div
          data-testid="composer-right-controls"
          className="flex min-w-0 items-center justify-end gap-1.5 overflow-visible"
        >
          <ModelSelector
            settings={settings}
            onSelectModel={onSelectModel}
            onSelectIntelligence={onSelectIntelligence}
            onSelectSpeed={onSelectSpeed}
            onOpenSettings={onOpenSettings}
          />
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202123] text-white outline-none transition hover:bg-black active:scale-[0.97] focus:outline-none focus-visible:outline-none"
            aria-label={busy ? copy.stopResponse : t("composer.send")}
            title={busy ? copy.stopResponse : t("composer.send")}
            onClick={handlePrimaryAction}
          >
            {busy ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  if (isHero) {
    return (
      <section className="w-full">
        <div className="mx-auto max-w-[680px] overflow-visible rounded-[18px] border border-[#d9d9e3] bg-white shadow-[0_14px_42px_rgba(0,0,0,0.10)] transition focus-within:border-[#202123]">
          {inputPanel}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white px-5 py-2">
      <div className="mx-auto max-w-[880px]">{inputPanel}</div>
    </section>
  );

  function renderPermissionSelector(): ReactElement {
    const permissionMode = getPermissionMode(resolvedGeneralPreferences);
    const permissionOption = getPermissionOption(copy, permissionMode);

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`inline-flex h-7 min-w-0 max-w-[190px] items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-2 text-[12px] font-medium outline-none transition hover:bg-[#f7f7f8] active:scale-[0.99] focus:outline-none focus-visible:outline-none ${
              permissionMode === "full" ? "text-[#f05a1a]" : "text-[#565869]"
            }`}
            aria-label={permissionOption.label}
            title={permissionOption.label}
          >
            <permissionOption.Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{permissionOption.label}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="forge-dropdown-content forge-dropdown-fast z-50 w-44 rounded-[12px] border border-[#d9d9e3] bg-white p-1 text-[12px] text-[#202123] shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
          >
            {(["default", "auto", "full"] as const).map((mode) => {
              const option = getPermissionOption(copy, mode);

              return (
                <DropdownMenu.Item
                  key={mode}
                  onSelect={() => onUpdateGeneralPreferences?.(applyPermissionMode(resolvedGeneralPreferences, mode))}
                  className="flex h-8 cursor-default items-center justify-between gap-2 rounded-[9px] px-2 outline-none data-[highlighted]:bg-[#f7f7f8]"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <option.Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </span>
                  {permissionMode === mode ? <Check className="h-4 w-4 shrink-0 text-[#202123]" /> : null}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }
}

function getComposerCopy(language: ModelSettings["language"]): {
  addProject: string;
  autoReviewPermission: string;
  defaultPermission: string;
  fullAccessPermission: string;
  stopResponse: string;
} {
  if (language === "zh-CN") {
    return {
      addProject: "新增项目",
      autoReviewPermission: "自动审查",
      defaultPermission: "默认权限",
      fullAccessPermission: "完全访问权限",
      stopResponse: "停止回答"
    };
  }

  return {
    addProject: "Add project",
    autoReviewPermission: "Auto review",
    defaultPermission: "Default permission",
    fullAccessPermission: "Full access",
    stopResponse: "Stop response"
  };
}

function getPermissionMode(preferences: GeneralPreferences): ComposerPermissionMode {
  if (preferences.fullAccess) {
    return "full";
  }

  if (preferences.autoReview) {
    return "auto";
  }

  return "default";
}

function applyPermissionMode(
  preferences: GeneralPreferences,
  mode: ComposerPermissionMode
): GeneralPreferences {
  return {
    ...preferences,
    defaultPermission: true,
    autoReview: mode === "auto" || mode === "full",
    fullAccess: mode === "full"
  };
}

function getPermissionOption(
  copy: ReturnType<typeof getComposerCopy>,
  mode: ComposerPermissionMode
): {
  Icon: typeof Hand;
  label: string;
} {
  if (mode === "full") {
    return { Icon: ShieldAlert, label: copy.fullAccessPermission };
  }

  if (mode === "auto") {
    return { Icon: ShieldCheck, label: copy.autoReviewPermission };
  }

  return { Icon: Hand, label: copy.defaultPermission };
}
