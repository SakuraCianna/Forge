// 本文件说明: 渲染统一输入框, 附件菜单, 权限选择和模型入口
import type {
  ComponentType,
  ReactElement
} from "react";
import { useCallback, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  File,
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
  X
} from "lucide-react";
import type { AgentAttachmentContext, AgentImageAttachment } from "@shared/agentTypes";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
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
import { ModelSelector } from "./ModelSelector";
import { useTaskComposerState } from "./useTaskComposerState";

type ComposerPermissionMode = "read-only" | "auto" | "full";

type TaskComposerProps = {
  busy?: boolean;
  settings: ModelSettings;
  generalPreferences?: GeneralPreferences;
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
  onUpdateGeneralPreferences?: (preferences: GeneralPreferences) => void;
  focusSignal?: number;
  placeholder?: string;
  submitSignal?: number;
  variant?: "dock" | "hero";
};

// 控制输入框提交和底部工具条布局, 新会话和线程底栏共用
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
  onUpdateGeneralPreferences,
  focusSignal = 0,
  placeholder,
  submitSignal = 0,
  variant = "dock"
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
    focusSignal,
    onSubmitTask,
    submitShortcut: resolvedGeneralPreferences.composerSubmitShortcut,
    submitSignal,
    supportsImageAttachments
  });

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
      className={`relative bg-white p-1.5 text-[#202123] transition focus-within:border-[#202123] ${
        isHero
          ? "rounded-[18px] border-0 shadow-none"
          : "rounded-[18px] border border-[#d9d9e3] shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
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
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        onKeyDown={handlePromptKeyDown}
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
    <section className="bg-white px-5 py-2">
      <div className="mx-auto max-w-[880px]">{inputPanel}</div>
    </section>
  );

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
            {[
              { key: "goal", Icon: Target, label: copy.goalMode },
              { key: "plugins", Icon: Plug, label: copy.pluginSystem }
            ].map((item) => (
              <DropdownMenu.Item
                key={item.key}
                disabled
                className="flex h-9 cursor-default items-center justify-between gap-2 rounded-[10px] px-2 text-[#8e8ea0] outline-none data-[disabled]:opacity-100"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <item.Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  aria-hidden="true"
                  data-testid={`add-menu-${item.key}-switch`}
                  className="flex h-5 w-9 items-center rounded-full bg-[#e5e5ea] px-0.5"
                >
                  <span
                    data-testid={`add-menu-${item.key}-switch-knob`}
                    className="h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                  />
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }
}

// 根据语言返回输入框文案, 让组件主体只关心布局
function getComposerCopy(language: ModelSettings["language"]): {
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
  sensitiveAttachmentsSkipped: (count: number) => string;
  stopResponse: string;
} {
  if (language === "zh-CN") {
    return {
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
      sensitiveAttachmentsSkipped: (count) => `${count} 个敏感附件已跳过。`,
      stopResponse: "停止回答"
    };
  }

  return {
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
