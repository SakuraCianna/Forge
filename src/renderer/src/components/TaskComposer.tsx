// 本文件说明: 渲染统一输入框, 附件菜单, 权限选择和模型入口
import type {
  ComponentType,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement
} from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  Command,
  Eye,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Plug,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Square,
  Target,
  WandSparkles,
  X
} from "lucide-react";
import type { AgentAttachmentContext, AgentImageAttachment } from "@shared/agentTypes";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { ProjectFile as ProjectScanFile } from "@shared/projectTypes";
import { useI18n } from "@/i18n/useI18n";
import {
  createDefaultGeneralPreferences,
  type GeneralPreferences
} from "@/state/generalPreferences";
import {
  composerAttachmentAccept,
  formatAttachmentSize,
  getComposerAttachmentLabel,
  type ComposerAttachment,
  type ComposerAttachmentKind
} from "@/state/composerAttachments";
import {
  createComposerContextAttachmentContexts,
  createComposerSuggestions,
  getContextKindLabel,
  type ComposerContextKind,
  type ComposerContextReference,
  type ComposerSuggestion,
  type ComposerSlashCommandId,
  type ForgePlugin
} from "@/state/pluginSkills";
import { ModelSelector } from "./ModelSelector";
import { ProjectFileIcon } from "./ProjectFileIcon";
import { useTaskComposerState } from "./useTaskComposerState";

type ComposerPermissionMode = "read-only" | "auto" | "full";

type TaskComposerProps = {
  busy?: boolean;
  settings: ModelSettings;
  generalPreferences?: GeneralPreferences;
  pluginCatalog?: ForgePlugin[];
  projectFiles?: ProjectScanFile[];
  onCancelTask?: () => void;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
  onSubmitTask: (
    prompt: string,
    attachments?: AgentImageAttachment[],
    attachmentContexts?: AgentAttachmentContext[]
  ) => void;
  onOpenSettings?: () => void;
  onPickProject?: () => void;
  onRunCommand?: (commandId: ComposerSlashCommandId) => void;
  onUpdateGeneralPreferences?: (preferences: GeneralPreferences) => void;
  focusSignal?: number;
  placeholder?: string;
  submitSignal?: number;
  variant?: "dock" | "hero";
  wallpaperActive?: boolean;
};

// 控制输入框提交和底部工具条布局, 新会话和线程底栏共用
export function TaskComposer({
  busy = false,
  settings,
  generalPreferences,
  pluginCatalog = [],
  projectFiles = [],
  onCancelTask,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onSubmitTask,
  onOpenSettings,
  onUpdateGeneralPreferences,
  onRunCommand,
  focusSignal = 0,
  placeholder,
  submitSignal = 0,
  variant = "dock",
  wallpaperActive = false
}: TaskComposerProps): ReactElement {
  const { t } = useI18n(settings.language);
  const isHero = variant === "hero";
  const placeholderText = placeholder ?? t("composer.placeholder");
  const copy = getComposerCopy(settings.language);
  const resolvedGeneralPreferences = generalPreferences ?? createDefaultGeneralPreferences();
  const currentModel = useMemo(
    () => settings.models.find((model) => model.id === settings.currentModelId) ?? null,
    [settings.currentModelId, settings.models]
  );
  const supportsImageAttachments = currentModel?.capabilities.vision === true;
  const [composerContexts, setComposerContexts] = useState<ComposerContextReference[]>([]);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState<string | null>(null);
  const composerContextAttachmentContexts = useMemo(
    () => createComposerContextAttachmentContexts(composerContexts, settings.language),
    [composerContexts, settings.language]
  );
  const clearComposerContextsAfterSubmit = useCallback((): void => {
    setComposerContexts([]);
  }, []);

  const {
    attachments,
    attachmentNotice,
    fileInputRef,
    handleAttachmentInputChange,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    handlePromptKeyDown,
    handlePromptPaste,
    isDraggingAttachments,
    openAttachmentPicker,
    prompt,
    removeAttachment,
    setPrompt,
    submitTask,
    textareaRef
  } = useTaskComposerState({
    copy: {
      attachmentContextHeader: copy.attachmentContextHeader,
      attachmentContextIntro: copy.attachmentContextIntro,
      attachmentContextTruncated: copy.attachmentContextTruncated,
      attachmentPromptFallback: copy.attachmentPromptFallback,
      attachmentsProcessing: copy.attachmentsProcessing,
      attachmentTooLarge: copy.attachmentTooLarge,
      attachmentUnsupported: copy.attachmentUnsupported,
      sensitiveAttachmentsSkipped: copy.sensitiveAttachmentsSkipped
    },
    extraAttachmentContexts: composerContextAttachmentContexts,
    focusSignal,
    onSubmitted: clearComposerContextsAfterSubmit,
    onSubmitTask,
    submitShortcut: resolvedGeneralPreferences.composerSubmitShortcut,
    submitSignal,
    supportsImageAttachments
  });

  const promptTrigger = useMemo(
    () => resolvePromptTrigger(prompt, textareaRef.current?.selectionStart ?? prompt.length),
    [prompt, textareaRef]
  );
  const composerSuggestions = useMemo(
    () =>
      promptTrigger
        ? createComposerSuggestions({
            language: settings.language,
            pluginCatalog,
            projectFiles,
            query: promptTrigger.query,
            trigger: promptTrigger.trigger
          })
        : [],
    [pluginCatalog, projectFiles, promptTrigger, settings.language]
  );
  const addMenuContextSuggestions = useMemo(
    () =>
      createComposerSuggestions({
        language: settings.language,
        pluginCatalog,
        projectFiles: [],
        query: "",
        trigger: "@",
        limit: 200
      }).filter((suggestion) => suggestion.kind === "plugin" || suggestion.kind === "skill"),
    [pluginCatalog, settings.language]
  );
  const addMenuPluginSuggestions = addMenuContextSuggestions.filter(
    (suggestion) => suggestion.kind === "plugin"
  );
  const addMenuSkillSuggestions = addMenuContextSuggestions.filter(
    (suggestion) => suggestion.kind === "skill"
  );
  const suggestionKey = promptTrigger
    ? `${promptTrigger.start}:${promptTrigger.end}:${promptTrigger.trigger}:${promptTrigger.query}`
    : null;
  const showSuggestions =
    Boolean(promptTrigger) &&
    composerSuggestions.length > 0 &&
    suggestionKey !== dismissedSuggestionKey;

  useEffect(() => {
    setHighlightedSuggestionIndex(0);
  }, [suggestionKey]);

  const addComposerContext = useCallback((context: ComposerContextReference): void => {
    setComposerContexts((current) =>
      current.some((item) => item.id === context.id) ? current : [...current, context]
    );
  }, []);

  const addContextFromMenu = useCallback(
    (suggestion: ComposerSuggestion): void => {
      if (suggestion.context) {
        addComposerContext(suggestion.context);
      }

      const mention = suggestion.insertText || `@${suggestion.label} `;
      const nextPrompt = prompt.trim().length > 0 && !prompt.endsWith(" ")
        ? `${prompt} ${mention}`
        : `${prompt}${mention}`;
      const nextCursor = nextPrompt.length;

      setPrompt(nextPrompt);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [addComposerContext, prompt, setPrompt, textareaRef]
  );

  const removeComposerContext = useCallback((contextId: string): void => {
    setComposerContexts((current) => current.filter((context) => context.id !== contextId));
  }, []);

  const insertPromptFragment = useCallback(
    (start: number, end: number, fragment: string): void => {
      const nextPrompt = `${prompt.slice(0, start)}${fragment}${prompt.slice(end)}`;
      const nextCursor = start + fragment.length;

      setPrompt(nextPrompt);
      setDismissedSuggestionKey(null);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [prompt, setPrompt, textareaRef]
  );

  const applyComposerSuggestion = useCallback(
    (suggestion: ComposerSuggestion): void => {
      if (!promptTrigger) {
        return;
      }

      if (suggestion.kind === "command" && suggestion.actionId) {
        insertPromptFragment(promptTrigger.start, promptTrigger.end, "");
        onRunCommand?.(suggestion.actionId);
        return;
      }

      if (suggestion.context) {
        addComposerContext(suggestion.context);
      }

      insertPromptFragment(promptTrigger.start, promptTrigger.end, suggestion.insertText);
      setDismissedSuggestionKey(`${promptTrigger.start}:${promptTrigger.start + suggestion.insertText.length}`);
    },
    [addComposerContext, insertPromptFragment, onRunCommand, promptTrigger]
  );

  const handlePromptChange = useCallback(
    (value: string): void => {
      setPrompt(value);
      setDismissedSuggestionKey(null);
    },
    [setPrompt]
  );

  const handleComposerPromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
      if (showSuggestions && composerSuggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlightedSuggestionIndex((current) => (current + 1) % composerSuggestions.length);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlightedSuggestionIndex(
            (current) => (current - 1 + composerSuggestions.length) % composerSuggestions.length
          );
          return;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const selectedSuggestion = composerSuggestions[highlightedSuggestionIndex] ?? composerSuggestions[0];

          if (selectedSuggestion) {
            applyComposerSuggestion(selectedSuggestion);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDismissedSuggestionKey(suggestionKey);
          return;
        }
      }

      handlePromptKeyDown(event);
    },
    [
      applyComposerSuggestion,
      composerSuggestions,
      handlePromptKeyDown,
      highlightedSuggestionIndex,
      showSuggestions,
      suggestionKey
    ]
  );

  const handlePrimaryAction = useCallback((): void => {
    if (busy) {
      onCancelTask?.();
      return;
    }

    submitTask();
  }, [busy, onCancelTask, submitTask]);

  const inputPanel = (
    <div
      onDragLeave={handleComposerDragLeave}
      onDragOver={handleComposerDragOver}
      onDrop={handleComposerDrop}
      className={`relative p-1.5 text-[#202123] transition focus-within:border-[#202123] ${
        isHero
          ? "rounded-[18px] border-0 shadow-none"
          : "rounded-[18px] border border-[#d9d9e3] shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
      } ${
        wallpaperActive ? "bg-white/84 backdrop-blur-md" : "bg-white"
      } ${
        isDraggingAttachments
          ? "ring-2 ring-[#2563eb]/30"
          : ""
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={composerAttachmentAccept}
        onChange={handleAttachmentInputChange}
        className="hidden"
        aria-label={copy.addAttachments}
      />
      {renderComposerSuggestionPanel()}
      {attachments.length > 0 ? (
        <div className="mb-1 flex flex-wrap gap-1.5 px-1">
          {attachments.map((attachment) =>
            renderAttachmentPreview(attachment, {
              copy,
              onRemove: removeAttachment
            })
          )}
        </div>
      ) : null}
      {attachmentNotice ? (
        <p className="mb-1 px-1 text-[10px] leading-4 text-[#b45309]">{attachmentNotice}</p>
      ) : null}
      {composerContexts.length > 0 ? (
        <div className="mb-1 flex flex-wrap gap-1.5 px-1">
          {composerContexts.map((context) =>
            renderComposerContextChip(context, {
              copy,
              language: settings.language,
              onRemove: removeComposerContext
            })
          )}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => handlePromptChange(event.currentTarget.value)}
        onKeyDown={handleComposerPromptKeyDown}
        onPaste={handlePromptPaste}
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
          {renderAddMenu()}
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
            showTooltip={false}
          />
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202123] text-white outline-none transition hover:bg-black active:scale-[0.97] focus:outline-none focus-visible:outline-none"
            aria-label={busy ? copy.stopResponse : t("composer.send")}
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
    <section className={`${wallpaperActive ? "bg-transparent" : "bg-white"} px-5 py-2`}>
      <div className="mx-auto w-full max-w-[760px] xl:ml-[clamp(36px,4vw,76px)] xl:mr-auto">
        {inputPanel}
      </div>
    </section>
  );

  // 渲染 / 和 @ 触发的上下文列表, 列表项可键盘选择或鼠标点击
  function renderComposerSuggestionPanel(): ReactElement | null {
    if (!showSuggestions) {
      return null;
    }

    let suggestionIndex = 0;

    return (
      <div
        data-testid="composer-suggestion-panel"
        className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 max-h-[360px] overflow-auto rounded-[16px] border border-[#ececf1] bg-white p-2 text-[#202123] shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
      >
        {groupComposerSuggestions(composerSuggestions).map((group) => (
          <div key={group.category} className="mb-3 last:mb-0">
            <div className="px-2 pb-1.5 pt-1 text-[11px] text-[#8e8ea0]">{group.category}</div>
            {group.items.map((suggestion) => {
              const currentIndex = suggestionIndex;
              const active = currentIndex === highlightedSuggestionIndex;

              suggestionIndex += 1;

              return (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyComposerSuggestion(suggestion)}
                  className={`grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-2.5 py-1.5 text-left transition ${
                    active ? "bg-[#ececf1]" : "hover:bg-[#f7f7f8]"
                  }`}
                >
                  {renderSuggestionIcon(suggestion)}
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] leading-5 text-[#202123]">
                      {suggestion.label}
                    </span>
                    <span className="block truncate text-[12px] leading-5 text-[#8e8ea0]">
                      {suggestion.description}
                    </span>
                  </span>
                  <span className="text-[11px] text-[#8e8ea0]">
                    {suggestion.kind === "command" ? "/" : "@"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // 渲染权限模式菜单, 对齐代码 Agent 常见的只读, 审查和完全访问三档
  function renderPermissionSelector(): ReactElement {
    const permissionMode = getPermissionMode(resolvedGeneralPreferences);
    const permissionOption = getPermissionOption(copy, permissionMode);

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`inline-flex h-7 min-w-0 max-w-[190px] items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-2 text-[10px] font-medium outline-none transition hover:bg-[#f7f7f8] active:scale-[0.99] focus:outline-none focus-visible:outline-none ${
              permissionMode === "full" ? "text-[#f05a1a]" : "text-[#565869]"
            }`}
            aria-label={permissionOption.label}
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
            {(["read-only", "auto", "full"] as const).map((mode) => {
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

  // 渲染加号菜单, 预留未来目标模式和插件系统入口
  function renderAddMenu(): ReactElement {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={copy.openAddMenu}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#565869] outline-none transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.97] focus:outline-none focus-visible:outline-none"
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="forge-dropdown-content forge-dropdown-fast z-50 w-56 rounded-[14px] border border-[#d9d9e3] bg-white p-1.5 text-[13px] text-[#202123] shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
          >
            <DropdownMenu.Item
              onSelect={(event) => {
                event.preventDefault();
                openAttachmentPicker();
              }}
              className="flex h-9 cursor-default items-center gap-2 rounded-[10px] px-2 outline-none data-[highlighted]:bg-[#f7f7f8]"
            >
              {supportsImageAttachments ? (
                <FileImage className="h-4 w-4 shrink-0 text-[#565869]" />
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-[#565869]" />
              )}
              <span>{copy.addAttachments}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-[#ececf1]" />
            <DropdownMenu.Item
              disabled
              className="flex h-9 cursor-default items-center justify-between gap-2 rounded-[10px] px-2 text-[#8e8ea0] outline-none data-[disabled]:opacity-100"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Target className="h-4 w-4 shrink-0" />
                <span className="truncate">{copy.goalMode}</span>
              </span>
              <span
                aria-hidden="true"
                data-testid="add-menu-goal-switch"
                className="flex h-5 w-9 items-center rounded-full bg-[#e5e5ea] px-0.5"
              >
                <span
                  data-testid="add-menu-goal-switch-knob"
                  className="h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                />
              </span>
            </DropdownMenu.Item>
            {renderContextSubMenu({
              Icon: Plug,
              items: addMenuPluginSuggestions,
              label: copy.addPlugin,
              testId: "plugins"
            })}
            {renderContextSubMenu({
              Icon: Box,
              items: addMenuSkillSuggestions,
              label: copy.addSkill,
              testId: "skills"
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  // 渲染加号菜单里的插件和技能二级菜单
  function renderContextSubMenu({
    Icon,
    items,
    label,
    testId
  }: {
    Icon: ComponentType<{ className?: string }>;
    items: ComposerSuggestion[];
    label: string;
    testId: string;
  }): ReactElement {
    return (
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger className="flex h-9 cursor-default items-center justify-between gap-2 rounded-[10px] px-2 outline-none data-[highlighted]:bg-[#f7f7f8]">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-[#565869]" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-[#8e8ea0]" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent
            sideOffset={8}
            alignOffset={-4}
            className="forge-dropdown-content forge-dropdown-fast z-50 max-h-80 w-80 overflow-auto rounded-[14px] border border-[#d9d9e3] bg-white p-2 text-[13px] text-[#202123] shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
          >
            {items.map((item) => (
              <DropdownMenu.Item
                key={item.id}
                onSelect={() => addContextFromMenu(item)}
                data-testid={`add-menu-${testId}-${item.id}`}
                className="grid min-h-12 cursor-default grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-2.5 py-1.5 outline-none data-[highlighted]:bg-[#f7f7f8]"
              >
                {renderSuggestionIcon(item)}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] leading-5 text-[#202123]">{item.label}</span>
                  <span className="block truncate text-[11px] leading-5 text-[#8e8ea0]">{item.description}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    );
  }
}

type ComposerPromptTrigger = {
  end: number;
  query: string;
  start: number;
  trigger: "/" | "@";
};

function renderComposerContextChip(
  context: ComposerContextReference,
  options: {
    copy: ReturnType<typeof getComposerCopy>;
    language: ModelSettings["language"];
    onRemove: (id: string) => void;
  }
): ReactElement {
  return (
    <span
      key={context.id}
      className="group inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-[10px] border border-[#cfe2ff] bg-[#eef6ff] px-2.5 font-medium text-[#0b5cab]"
      title={`${getContextKindLabel(context.kind, options.language)}: ${context.label}\n${context.detail}`}
    >
      {renderContextChipIcon(context.kind)}
      <span className="min-w-0 truncate">@{context.label}</span>
      <button
        type="button"
        aria-label={options.copy.removeContext}
        onClick={() => options.onRemove(context.id)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#5b7fa8] opacity-70 transition hover:bg-[#dbeafe] hover:text-[#0b5cab] group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function renderSuggestionIcon(suggestion: ComposerSuggestion): ReactElement {
  if (suggestion.kind === "file") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f8]">
        <ProjectFileIcon
          className="h-4 w-4 shrink-0"
          relativePath={suggestion.insertText.slice(1).trim()}
        />
      </span>
    );
  }

  const Icon = getSuggestionIcon(suggestion.kind);

  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f8] text-[#565869]">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function renderContextChipIcon(kind: ComposerContextKind): ReactElement {
  const Icon = getSuggestionIcon(kind);

  return <Icon className="h-3.5 w-3.5 shrink-0" />;
}

function getSuggestionIcon(kind: ComposerSuggestion["kind"]): ComponentType<{ className?: string }> {
  if (kind === "command") {
    return Command;
  }

  if (kind === "plugin") {
    return Plug;
  }

  if (kind === "skill") {
    return WandSparkles;
  }

  return FileCode2;
}

function groupComposerSuggestions(
  suggestions: ComposerSuggestion[]
): Array<{ category: string; items: ComposerSuggestion[] }> {
  const groups = new Map<string, ComposerSuggestion[]>();

  suggestions.forEach((suggestion) => {
    groups.set(suggestion.category, [...(groups.get(suggestion.category) ?? []), suggestion]);
  });

  return Array.from(groups, ([category, items]) => ({ category, items }));
}

function resolvePromptTrigger(prompt: string, cursorIndex: number): ComposerPromptTrigger | null {
  const beforeCursor = prompt.slice(0, cursorIndex);
  const match = /(^|\s)([/@])([^\s/@]*)$/u.exec(beforeCursor);

  if (!match) {
    return null;
  }

  const trigger = match[2];
  const query = match[3] ?? "";

  if (trigger !== "/" && trigger !== "@") {
    return null;
  }

  return {
    end: cursorIndex,
    query,
    start: cursorIndex - trigger.length - query.length,
    trigger
  };
}

// 根据语言返回输入框文案, 让组件主体只关心布局
function getComposerCopy(language: ModelSettings["language"]): {
  addPlugin: string;
  addSkill: string;
  addAttachments: string;
  attachmentContextHeader: string;
  attachmentContextIntro: string;
  attachmentContextTruncated: string;
  attachmentPromptFallback: string;
  attachmentReady: string;
  attachmentsProcessing: string;
  attachmentTooLarge: (count: number, maxSize: string) => string;
  attachmentUnsupported: (count: number) => string;
  autoReviewPermission: string;
  fullAccessPermission: string;
  goalMode: string;
  openAddMenu: string;
  pastedImage: string;
  pluginSystem: string;
  readOnlyPermission: string;
  removeAttachment: string;
  removeContext: string;
  sensitiveAttachmentsSkipped: (count: number) => string;
  stopResponse: string;
} {
  if (language === "zh-CN") {
    return {
      addPlugin: "引入插件",
      addSkill: "引入技能",
      addAttachments: "添加照片和文件",
      attachmentContextHeader: "附件本地解析内容:",
      attachmentContextIntro:
        "以下内容由 Forge 在本地从用户拖入或粘贴的附件中提取, 可能存在 OCR 或表格截断误差。",
      attachmentContextTruncated: "[内容已截断]",
      attachmentPromptFallback: "请根据附件内容回答。",
      attachmentReady: "已解析",
      attachmentsProcessing: "附件仍在本地解析中，请稍后发送。",
      attachmentTooLarge: (count, maxSize) => `${count} 个附件超过 ${maxSize}，已跳过。`,
      attachmentUnsupported: (count) => `${count} 个附件类型暂不支持，已跳过。`,
      autoReviewPermission: "自动审查",
      fullAccessPermission: "完全访问权限",
      goalMode: "追求目标",
      openAddMenu: "打开添加菜单",
      pastedImage: "粘贴的图片",
      pluginSystem: "插件系统",
      readOnlyPermission: "只读模式",
      removeAttachment: "移除附件",
      removeContext: "移除上下文",
      sensitiveAttachmentsSkipped: (count) => `${count} 个敏感附件已跳过。`,
      stopResponse: "停止回答"
    };
  }

  return {
    addPlugin: "Add plugin",
    addSkill: "Add skill",
    addAttachments: "Add photos and files",
    attachmentContextHeader: "Local attachment context:",
    attachmentContextIntro:
      "Forge extracted the following content locally from files the user pasted or dropped. OCR and table content may be imperfect or truncated.",
    attachmentContextTruncated: "[Content truncated]",
    attachmentPromptFallback: "Please answer based on the attached files.",
    attachmentReady: "Parsed",
    attachmentsProcessing: "Attachments are still being parsed locally. Please send again in a moment.",
    attachmentTooLarge: (count, maxSize) => `${count} attachments over ${maxSize} were skipped.`,
    attachmentUnsupported: (count) => `${count} unsupported attachments were skipped.`,
    autoReviewPermission: "Auto review",
    fullAccessPermission: "Full access",
    goalMode: "Goal mode",
    openAddMenu: "Open add menu",
    pastedImage: "Pasted image",
    pluginSystem: "Plugin system",
    readOnlyPermission: "Read only",
    removeAttachment: "Remove attachment",
    removeContext: "Remove context",
    sensitiveAttachmentsSkipped: (count) => `${count} sensitive attachments were skipped.`,
    stopResponse: "Stop response"
  };
}

function renderAttachmentPreview(
  attachment: ComposerAttachment,
  options: {
    copy: ReturnType<typeof getComposerCopy>;
    onRemove: (id: string) => void;
  }
): ReactElement {
  if (attachment.imageAttachment?.dataUrl) {
    return (
      <div
        key={attachment.id}
        className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[12px] border border-[#d9d9e3] bg-[#f7f7f8]"
        title={attachment.name}
      >
        <img
          src={attachment.imageAttachment.dataUrl}
          alt={attachment.name || options.copy.pastedImage}
          className="h-full w-full object-cover"
        />
        {attachment.status === "processing" ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/75 text-[#565869]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        ) : null}
        <span className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
          {formatAttachmentSize(attachment.size)}
        </span>
        {renderAttachmentRemoveButton(attachment.id, options)}
      </div>
    );
  }

  const Icon = getAttachmentPreviewIcon(attachment.kind);
  const statusLabel =
    attachment.status === "processing"
      ? options.copy.attachmentsProcessing
      : attachment.status === "failed"
        ? attachment.error || options.copy.attachmentUnsupported(1)
        : options.copy.attachmentReady;

  return (
    <div
      key={attachment.id}
      className="group relative flex h-16 max-w-[180px] items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-[#f7f7f8] px-2 pr-7"
      title={`${attachment.name}\n${statusLabel}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#565869]">
        {attachment.status === "processing" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium leading-4 text-[#202123]">
          {attachment.name}
        </span>
        <span className="block truncate text-[10px] leading-3 text-[#8e8ea0]">
          {getComposerAttachmentLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
        </span>
      </span>
      {renderAttachmentRemoveButton(attachment.id, options)}
    </div>
  );
}

function renderAttachmentRemoveButton(
  id: string,
  options: {
    copy: ReturnType<typeof getComposerCopy>;
    onRemove: (id: string) => void;
  }
): ReactElement {
  return (
    <button
      type="button"
      aria-label={options.copy.removeAttachment}
      onClick={() => options.onRemove(id)}
      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white opacity-0 outline-none transition hover:bg-black group-hover:opacity-100 focus:outline-none focus-visible:outline-none"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function getAttachmentPreviewIcon(kind: ComposerAttachmentKind): ComponentType<{ className?: string }> {
  if (kind === "image") {
    return FileImage;
  }

  if (kind === "spreadsheet") {
    return FileSpreadsheet;
  }

  if (kind === "pdf" || kind === "word" || kind === "text") {
    return FileText;
  }

  return File;
}

// 从通用偏好读取当前权限模式, 旧值统一回退自动审查
function getPermissionMode(preferences: GeneralPreferences): ComposerPermissionMode {
  if (preferences.readOnly) {
    return "read-only";
  }

  if (preferences.fullAccess) {
    return "full";
  }

  return "auto";
}

// 将权限选择写回通用偏好结构
function applyPermissionMode(
  preferences: GeneralPreferences,
  mode: ComposerPermissionMode
): GeneralPreferences {
  return {
    ...preferences,
    defaultPermission: true,
    autoReview: true,
    fullAccess: mode === "full",
    readOnly: mode === "read-only"
  };
}

// 找到权限菜单选项, 缺失时回退自动审查
function getPermissionOption(
  copy: ReturnType<typeof getComposerCopy>,
  mode: ComposerPermissionMode
): {
  Icon: ComponentType<{ className?: string }>;
  label: string;
} {
  if (mode === "read-only") {
    return { Icon: Eye, label: copy.readOnlyPermission };
  }

  if (mode === "full") {
    return { Icon: ShieldAlert, label: copy.fullAccessPermission };
  }

  return { Icon: ShieldCheck, label: copy.autoReviewPermission };
}
