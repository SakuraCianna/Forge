// 本文件说明: 渲染 Extensions 页面, 管理外部服务授权, 权限和调用日志
import type { FormEvent, ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  X
} from "lucide-react";
import type {
  ExtensionActionConfirmation,
  ExtensionActionRisk,
  ExtensionConfirmationPolicy,
  ExtensionCreateRequest,
  ExtensionCreateResult,
  ExtensionDeleteResult,
  ExtensionActionDefinition,
  ExtensionInvocationLogRecord,
  ExtensionInvocationRequest,
  ExtensionInvocationResult,
  ExtensionManifest,
  ExtensionPermissionDefinition,
  ExtensionPermissionMode,
  ExtensionRegistrySnapshot,
  ExtensionSettingsPatch,
  ExtensionUpdateRequest,
  ExtensionUpdateResult
} from "@shared/extensionTypes";
import {
  builtInToolCategories,
  builtInToolDefinitions
} from "@shared/builtInToolCatalog";
import {
  agentQualityMetricDefinitions,
  type AgentQualityMetricId,
  type AgentQualityMetricSnapshot,
  type AgentQualityMetricValue
} from "@shared/agentQualityMetrics";
import type {
  BuiltInToolAvailability,
  BuiltInToolCallLogRecord,
  BuiltInToolCategory,
  BuiltInToolDefinition,
  BuiltInToolRiskLevel
} from "@shared/builtInToolTypes";
import type { BuiltInToolQaRunResult } from "@shared/builtInToolQaTypes";
import type { Language } from "@shared/modelTypes";
import { InlineSelectMenu } from "@/components/InlineSelectMenu";
import {
  findExtensionSecretStatus,
  findExtensionSettings,
  getExtensionPermissionMode
} from "@/state/extensions";

type ExtensionsPanelProps = {
  agentQualityMetrics: AgentQualityMetricSnapshot | null;
  builtInToolLogs: BuiltInToolCallLogRecord[];
  developmentQaResult: BuiltInToolQaRunResult | null;
  developmentQaRunning: boolean;
  language: Language;
  logs: ExtensionInvocationLogRecord[];
  registry: ExtensionRegistrySnapshot;
  onConfirmInvocation: (token: string) => Promise<ExtensionInvocationResult>;
  onCreateExtension: (request: ExtensionCreateRequest) => Promise<ExtensionCreateResult>;
  onDeleteExtension: (extensionId: string) => Promise<ExtensionDeleteResult>;
  onInvoke: (request: ExtensionInvocationRequest) => Promise<ExtensionInvocationResult>;
  onRefresh: () => void;
  onRunDevelopmentQa: () => void;
  onSaveSecret: (extensionId: string, fieldId: string, value: string) => Promise<void>;
  onDeleteSecret: (extensionId: string, fieldId: string) => Promise<void>;
  onUpdateExtension: (request: ExtensionUpdateRequest) => Promise<ExtensionUpdateResult>;
  onUpdateSettings: (patch: ExtensionSettingsPatch) => Promise<void>;
};

type ComposeState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
};

type ExtensionSecretFieldDraft = {
  id: string;
  label: string;
  description: string;
  placeholder: string;
};

type ExtensionPermissionDraft = {
  id: string;
  label: string;
  description: string;
  defaultMode: ExtensionPermissionMode;
};

type ExtensionActionDraft = {
  id: string;
  label: string;
  description: string;
  permission: string;
  risk: ExtensionActionRisk;
  confirmation: ExtensionConfirmationPolicy;
  inputFields: string;
};

type ExtensionManifestDraft = {
  name: string;
  description: string;
  category: ExtensionManifest["category"];
  fields: ExtensionSecretFieldDraft[];
  permissions: ExtensionPermissionDraft[];
  actions: ExtensionActionDraft[];
};

type ExtensionDraftDialogState = {
  mode: "create" | "edit";
  extensionId?: string;
  draft: ExtensionManifestDraft;
};

type BuiltInToolCategoryGroup = {
  category: (typeof builtInToolCategories)[number];
  tools: BuiltInToolDefinition[];
};

type ExtensionsCopy = ReturnType<typeof getExtensionsCopy>;

const permissionModes: ExtensionPermissionMode[] = ["ask", "allow", "deny"];
const draftInputClassName =
  "h-9 min-w-0 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]";
const draftIconButtonClassName =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d9d9e3] bg-white text-[#565869] transition hover:bg-[#f7f7f8]";

export function ExtensionsPanel({
  agentQualityMetrics,
  builtInToolLogs,
  developmentQaResult,
  developmentQaRunning,
  language,
  logs,
  registry,
  onConfirmInvocation,
  onCreateExtension,
  onDeleteExtension,
  onDeleteSecret,
  onInvoke,
  onRefresh,
  onRunDevelopmentQa,
  onSaveSecret,
  onUpdateExtension,
  onUpdateSettings
}: ExtensionsPanelProps): ReactElement {
  const copy = getExtensionsCopy(language);
  const [selectedExtensionId, setSelectedExtensionId] = useState(registry.manifests[0]?.id ?? "");
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [draftDialog, setDraftDialog] = useState<ExtensionDraftDialogState | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ExtensionActionConfirmation | null>(null);
  const [listLimit, setListLimit] = useState("10");
  const [readUid, setReadUid] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchLimit, setSearchLimit] = useState("10");
  const [draftCompose, setDraftCompose] = useState<ComposeState>(createEmptyComposeState);
  const [sendCompose, setSendCompose] = useState<ComposeState>(createEmptyComposeState);
  const selectedManifest =
    registry.manifests.find((manifest) => manifest.id === selectedExtensionId) ??
    registry.manifests[0] ??
    null;
  const selectedSettings = selectedManifest
    ? findExtensionSettings(registry, selectedManifest.id)
    : null;
  const selectedSecretStatus = selectedManifest
    ? findExtensionSecretStatus(registry, selectedManifest.id)
    : null;
  const selectedLogs = useMemo(
    () =>
      selectedManifest
        ? logs.filter((log) => log.extensionId === selectedManifest.id).slice(0, 10)
        : [],
    [logs, selectedManifest]
  );
  const builtInToolGroups = useMemo(() => groupBuiltInToolsByCategory(), []);
  const permissionModeOptions = permissionModes.map((mode) => ({
    value: mode,
    label: copy.permissionMode(mode)
  }));
  const selectedActionLabels = useMemo(
    () =>
      new Map(
        selectedManifest?.actions.map((action) => [action.id, action.label]) ?? []
      ),
    [selectedManifest]
  );
  const groupedManifests = useMemo(
    () => [
      {
        label: copy.myExtensions,
        items: registry.manifests.filter((manifest) => !manifest.builtIn)
      },
      {
        label: copy.builtInExtensions,
        items: registry.manifests.filter((manifest) => manifest.builtIn)
      }
    ],
    [copy.builtInExtensions, copy.myExtensions, registry.manifests]
  );

  async function updateSelectedExtensionEnabled(enabled: boolean): Promise<void> {
    if (!selectedManifest) {
      return;
    }

    await onUpdateSettings({
      extensionId: selectedManifest.id,
      enabled
    });
  }

  async function submitExtensionDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!draftDialog || !draftDialog.draft.name.trim()) {
      return;
    }

    setDraftBusy(true);
    setNotice(null);

    try {
      if (draftDialog.mode === "create") {
        const result = await onCreateExtension(createRequestFromDraft(draftDialog.draft));

        setSelectedExtensionId(result.manifest.id);
        setDraftDialog(null);
        setNotice(copy.extensionCreated(result.manifestPath));
      } else if (selectedManifest) {
        const result = await onUpdateExtension({
          extensionId: draftDialog.extensionId ?? selectedManifest.id,
          manifest: createManifestFromDraft(draftDialog.draft, selectedManifest)
        });

        setSelectedExtensionId(result.manifest.id);
        setDraftDialog(null);
        setNotice(copy.extensionUpdated(result.manifestPath));
      }
    } catch (error) {
      setNotice(
        `${copy.saveFailed}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setDraftBusy(false);
    }
  }

  function openCreateExtensionDialog(): void {
    setDraftDialog({
      mode: "create",
      draft: createDefaultExtensionDraft(language)
    });
    setNotice(null);
  }

  function openEditExtensionDialog(manifest: ExtensionManifest): void {
    if (manifest.builtIn) {
      return;
    }

    setDraftDialog({
      mode: "edit",
      extensionId: manifest.id,
      draft: createDraftFromManifest(manifest)
    });
    setNotice(null);
  }

  async function deleteSelectedExtension(manifest: ExtensionManifest): Promise<void> {
    if (manifest.builtIn || !window.confirm(copy.deleteExtensionConfirm(manifest.name))) {
      return;
    }

    setNotice(null);

    try {
      const result = await onDeleteExtension(manifest.id);

      setSelectedExtensionId(result.registry.manifests[0]?.id ?? "");
      setNotice(copy.extensionDeleted);
    } catch (error) {
      setNotice(
        `${copy.deleteFailed}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function updatePermissionMode(
    manifest: ExtensionManifest,
    permissionId: string,
    mode: ExtensionPermissionMode
  ): Promise<void> {
    const settings = findExtensionSettings(registry, manifest.id);
    const currentPermissions = settings?.permissions ?? [];
    const nextPermissions = manifest.permissions.map((permission) => ({
      permissionId: permission.id,
      mode:
        permission.id === permissionId
          ? mode
          : currentPermissions.find((item) => item.permissionId === permission.id)?.mode ??
            permission.defaultMode
    }));

    await onUpdateSettings({
      extensionId: manifest.id,
      permissions: nextPermissions
    });
  }

  async function saveSecret(
    event: FormEvent<HTMLFormElement>,
    manifest: ExtensionManifest,
    fieldId: string
  ): Promise<void> {
    event.preventDefault();
    const key = `${manifest.id}:${fieldId}`;
    const value = secretDrafts[key]?.trim() ?? "";

    if (!value) {
      setNotice(copy.emptySecret);
      return;
    }

    await onSaveSecret(manifest.id, fieldId, value);
    setSecretDrafts((current) => ({ ...current, [key]: "" }));
    setNotice(copy.secretSaved);
  }

  async function invokeAction(
    actionId: string,
    input: Record<string, unknown>
  ): Promise<void> {
    if (!selectedManifest) {
      return;
    }

    setBusyAction(actionId);
    setNotice(null);

    try {
      const result = await onInvoke({
        extensionId: selectedManifest.id,
        actionId,
        input
      });

      handleInvocationResult(result);
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmPendingInvocation(): Promise<void> {
    if (!pendingConfirmation) {
      return;
    }

    setBusyAction(pendingConfirmation.actionId);
    setNotice(null);

    try {
      const result = await onConfirmInvocation(pendingConfirmation.token);
      setPendingConfirmation(null);
      handleInvocationResult(result);
    } finally {
      setBusyAction(null);
    }
  }

  function handleInvocationResult(result: ExtensionInvocationResult): void {
    if (result.ok) {
      setNotice(result.outputSummary);
      return;
    }

    if ("requiresConfirmation" in result && result.requiresConfirmation) {
      setPendingConfirmation(result.confirmation);
      setNotice(copy.confirmRequired);
      return;
    }

    setNotice(
      "error" in result
        ? result.error
        : language === "zh-CN"
          ? "扩展操作仍需要确认"
          : "The extension action still requires confirmation."
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 border-r border-[#ececf1] bg-[#fbfbfc] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#202123]">{copy.title}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateExtensionDialog}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8]"
            >
              <Plus className="h-3.5 w-3.5" />
              {copy.createExtension}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#d9d9e3] bg-white text-[#565869] transition hover:bg-[#f7f7f8]"
              aria-label={copy.refresh}
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 space-y-2 overflow-auto pb-8">
          {groupedManifests.map((group) =>
            group.items.length > 0 ? (
              <div key={group.label} className="space-y-2">
                <div className="px-1 pt-1 text-[11px] font-medium text-[#8e8ea0]">
                  {group.label}
                </div>
                {group.items.map((manifest) => {
                  const settings = findExtensionSettings(registry, manifest.id);
                  const secretStatus = findExtensionSecretStatus(registry, manifest.id);
                  const active = selectedManifest?.id === manifest.id;

                  return (
                    <button
                      key={manifest.id}
                      type="button"
                      onClick={() => setSelectedExtensionId(manifest.id)}
                      className={`grid min-h-[64px] w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-3 py-3 text-left transition ${
                        active
                          ? "bg-white shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
                          : "hover:bg-white/85"
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#202123] text-white">
                        <Mail className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-[#202123]">
                          {manifest.name}
                        </span>
                        <span className="block truncate text-[12px] text-[#8e8ea0]">
                          {settings?.enabled ? copy.enabled : copy.disabled}
                          {" · "}
                          {manifest.auth.fields.length === 0
                            ? copy.noCredentialsRequired
                            : secretStatus?.configured
                              ? copy.connected
                              : copy.notConnected}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null
          )}
        </div>
      </aside>

      <div className="min-h-0 overflow-auto px-6 py-6">
        {selectedManifest && selectedSettings ? (
          <div className="mx-auto grid max-w-5xl gap-5">
            {renderBuiltInToolsSection(
              builtInToolGroups,
              builtInToolLogs,
              agentQualityMetrics,
              developmentQaResult,
              developmentQaRunning,
              onRunDevelopmentQa,
              copy
            )}

            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-[#202123]">{selectedManifest.name}</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#565869]">
                  {selectedManifest.description}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!selectedManifest.builtIn ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditExtensionDialog(selectedManifest)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-sm font-semibold text-[#202123] transition hover:bg-[#f7f7f8]"
                    >
                      <Pencil className="h-4 w-4" />
                      {copy.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedExtension(selectedManifest)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f4c7c7] bg-white px-3 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff5f5]"
                    >
                      <Trash2 className="h-4 w-4" />
                      {copy.delete}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void updateSelectedExtensionEnabled(!selectedSettings.enabled)}
                  aria-pressed={selectedSettings.enabled}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-2.5 pr-3 text-sm font-semibold transition active:scale-[0.99] ${
                    selectedSettings.enabled
                      ? "border-[#b9ead8] bg-[#effaf6] text-[#087443] hover:bg-[#e2f7ee]"
                      : "border-[#d9d9e3] bg-white text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                      selectedSettings.enabled
                        ? "justify-end bg-[#10a37f]"
                        : "justify-start bg-[#d9d9e3]"
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
                  </span>
                  {selectedSettings.enabled ? copy.enabled : copy.enable}
                </button>
              </div>
            </header>

            {notice ? (
              <div className="rounded-[10px] border border-[#d9d9e3] bg-[#fafafa] px-3 py-2 text-sm text-[#202123]">
                {notice}
              </div>
            ) : null}

            {pendingConfirmation ? (
              <section className="rounded-[12px] border border-[#f4c7ab] bg-[#fffaf5] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#9a3412]">
                  <ShieldAlert className="h-4 w-4" />
                  {copy.confirmTitle}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#565869]">
                  {pendingConfirmation.inputSummary}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => void confirmPendingInvocation()}
                    className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#9a3412] px-3 text-sm font-semibold text-white transition hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {copy.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingConfirmation(null)}
                    className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#f4c7ab] bg-white px-3 text-sm font-semibold text-[#9a3412] transition hover:bg-[#fff7ed]"
                  >
                    {copy.cancel}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 rounded-[12px] border border-[#ececf1] p-4">
              <h3 className="text-sm font-semibold text-[#202123]">{copy.credentials}</h3>
              {selectedManifest.auth.fields.length === 0 ? (
                <p className="rounded-[10px] border border-[#ececf1] bg-[#fafafa] px-3 py-2 text-sm text-[#565869]">
                  {copy.noCredentialsRequired}
                </p>
              ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedManifest.auth.fields.map((field) => {
                  const key = `${selectedManifest.id}:${field.id}`;
                  const status = selectedSecretStatus?.fields[field.id];

                  return (
                    <form
                      key={field.id}
                      onSubmit={(event) => void saveSecret(event, selectedManifest, field.id)}
                      className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3"
                    >
                      <label className="text-[12px] font-semibold text-[#202123]">
                        {field.label}
                      </label>
                      <input
                        type="password"
                        value={secretDrafts[key] ?? ""}
                        onChange={(event) =>
                          setSecretDrafts((current) => ({
                            ...current,
                            [key]: event.currentTarget.value
                          }))
                        }
                        placeholder={status?.hasValue ? copy.savedSecret(status.last4) : field.placeholder}
                        className="h-9 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none focus:border-[#202123]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#202123] px-2.5 text-[12px] font-semibold text-white"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {copy.save}
                        </button>
                        {status?.hasValue ? (
                          <button
                            type="button"
                            onClick={() => void onDeleteSecret(selectedManifest.id, field.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[12px] font-semibold text-[#565869]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {copy.delete}
                          </button>
                        ) : null}
                      </div>
                    </form>
                  );
                })}
              </div>
              )}
            </section>

            <section className="grid gap-3 rounded-[12px] border border-[#ececf1] p-4">
              <h3 className="text-sm font-semibold text-[#202123]">{copy.permissions}</h3>
              <div className="grid gap-2">
                {selectedManifest.permissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3 md:grid-cols-[minmax(0,1fr)_150px]"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-[#202123]">
                        {permission.label}
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[#565869]">
                        {permission.description}
                      </div>
                    </div>
                    <InlineSelectMenu<ExtensionPermissionMode>
                      align="end"
                      ariaLabel={`${permission.label} ${copy.permissions}`}
                      value={getExtensionPermissionMode(
                        selectedManifest,
                        selectedSettings,
                        permission.id
                      )}
                      options={permissionModeOptions}
                      triggerClassName="w-full justify-between rounded-[12px]"
                      contentClassName="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                      onChange={(mode) =>
                        void updatePermissionMode(
                          selectedManifest,
                          permission.id,
                          mode
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3 rounded-[12px] border border-[#ececf1] p-4">
              <h3 className="text-sm font-semibold text-[#202123]">{copy.actions}</h3>
              {selectedManifest.id === "qq-mail"
                ? renderQQMailActions()
                : renderDraftExtensionActions(selectedManifest, copy)}
            </section>

            <section className="grid gap-3 rounded-[12px] border border-[#ececf1] p-4">
              <h3 className="text-sm font-semibold text-[#202123]">{copy.logs}</h3>
              <div className="grid gap-2">
                {selectedLogs.length > 0 ? (
                  selectedLogs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <span className="font-semibold text-[#202123]">{log.actionLabel}</span>
                        <span className="text-[#8e8ea0]">{log.status}</span>
                      </div>
                      <p className="mt-1 break-words text-[12px] leading-5 text-[#565869]">
                        {log.outputSummary ?? log.errorMessage ?? log.inputSummary}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-[#8e8ea0]">{copy.noLogs}</p>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#8e8ea0]">
            {copy.empty}
          </div>
        )}
      </div>
      {draftDialog ? (
        <ExtensionManifestDialog
          busy={draftBusy}
          copy={copy}
          draft={draftDialog.draft}
          mode={draftDialog.mode}
          onCancel={() => setDraftDialog(null)}
          onDraftChange={(draft) =>
            setDraftDialog((current) => (current ? { ...current, draft } : current))
          }
          onSubmit={(event) => void submitExtensionDraft(event)}
        />
      ) : null}
    </section>
  );

  function renderQQMailActions(): ReactElement {
    return (
      <div className="grid gap-3">
        <ActionRow title={selectedActionLabels.get("listInbox") ?? "listInbox"}>
          <input
            value={listLimit}
            onChange={(event) => setListLimit(event.currentTarget.value)}
            className="h-9 w-24 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
          />
          <ActionButton
            busy={busyAction === "listInbox"}
            label={copy.run}
            onClick={() => void invokeAction("listInbox", { limit: Number(listLimit) })}
          />
        </ActionRow>

        <ActionRow title={selectedActionLabels.get("readEmail") ?? "readEmail"}>
          <input
            value={readUid}
            onChange={(event) => setReadUid(event.currentTarget.value)}
            placeholder="UID"
            className="h-9 w-32 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
          />
          <ActionButton
            busy={busyAction === "readEmail"}
            label={copy.run}
            onClick={() => void invokeAction("readEmail", { uid: Number(readUid) })}
          />
        </ActionRow>

        <ActionRow title={selectedActionLabels.get("searchEmails") ?? "searchEmails"}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder={copy.query}
            className="h-9 min-w-[180px] rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
          />
          <input
            value={searchFrom}
            onChange={(event) => setSearchFrom(event.currentTarget.value)}
            placeholder={copy.from}
            className="h-9 min-w-[160px] rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
          />
          <input
            value={searchLimit}
            onChange={(event) => setSearchLimit(event.currentTarget.value)}
            className="h-9 w-24 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
          />
          <ActionButton
            busy={busyAction === "searchEmails"}
            label={copy.run}
            onClick={() =>
              void invokeAction("searchEmails", {
                from: searchFrom,
                limit: Number(searchLimit),
                query: searchQuery
              })
            }
          />
        </ActionRow>

        <ComposeAction
          busy={busyAction === "createDraft"}
          copy={copy}
          state={draftCompose}
          title={selectedActionLabels.get("createDraft") ?? "createDraft"}
          onChange={setDraftCompose}
          onSubmit={() => void invokeAction("createDraft", createComposeInput(draftCompose))}
        />
        <ComposeAction
          busy={busyAction === "sendEmail"}
          copy={copy}
          state={sendCompose}
          title={selectedActionLabels.get("sendEmail") ?? "sendEmail"}
          onChange={setSendCompose}
          onSubmit={() => void invokeAction("sendEmail", createComposeInput(sendCompose))}
        />
      </div>
    );
  }
}

function groupBuiltInToolsByCategory(): BuiltInToolCategoryGroup[] {
  const toolsByCategory = new Map<BuiltInToolCategory, BuiltInToolDefinition[]>();

  for (const tool of builtInToolDefinitions) {
    toolsByCategory.set(tool.category, [...(toolsByCategory.get(tool.category) ?? []), tool]);
  }

  return builtInToolCategories.map((category) => ({
    category,
    tools: toolsByCategory.get(category.id) ?? []
  }));
}

function renderBuiltInToolsSection(
  groups: BuiltInToolCategoryGroup[],
  logs: BuiltInToolCallLogRecord[],
  metrics: AgentQualityMetricSnapshot | null,
  developmentQaResult: BuiltInToolQaRunResult | null,
  developmentQaRunning: boolean,
  onRunDevelopmentQa: () => void,
  copy: ExtensionsCopy
): ReactElement {
  const latestLogByToolName = createLatestBuiltInToolLogMap(logs);
  const featuredMetrics = getFeaturedAgentQualityMetrics(metrics);
  const reviewMetrics = getReviewAgentQualityMetrics(metrics);

  return (
    <section className="grid gap-4 rounded-[16px] border border-[#ececf1] bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202123]">{copy.builtInTools}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#565869]">
            {copy.builtInToolsDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-[#d9d9e3] bg-[#fafafa] px-3 py-1 text-[12px] font-semibold text-[#202123]">
            {copy.builtInToolCount(builtInToolDefinitions.length)}
          </span>
          <button
            type="button"
            disabled={developmentQaRunning}
            onClick={onRunDevelopmentQa}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {developmentQaRunning ? (
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {developmentQaRunning ? copy.qaRunning : copy.runDevelopmentQa}
          </button>
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-4">
        {featuredMetrics.map((metric) => (
          <div
            key={metric.id}
            className="rounded-[12px] border border-[#ececf1] bg-[#fbfbfc] px-3 py-2"
          >
            <div className="truncate text-[11px] font-medium text-[#8e8ea0]">
              {copy.qualityMetricLabel(metric.id)}
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[#202123]">
              {formatMetricPercent(metric)}
            </div>
            <div className={`mt-1 text-[11px] ${getMetricStatusClassName(metric)}`}>
              {copy.metricStatus(metric)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-[12px] border border-[#ececf1] bg-[#fbfbfc] p-3">
        <div className="text-[12px] font-semibold text-[#202123]">
          {copy.qualityMetricsReview}
        </div>
        <div className="grid gap-2">
          {reviewMetrics.map((metric) => (
            <div
              key={metric.id}
              className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-white px-3 py-2 text-[12px] text-[#565869] md:grid-cols-[minmax(160px,1.3fr)_repeat(5,minmax(0,auto))] md:items-center"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#202123]">
                  {copy.qualityMetricLabel(metric.id)}
                </div>
                <div className="mt-0.5 text-[11px] text-[#8e8ea0]">
                  {copy.metricSampleSize(metric)}
                </div>
              </div>
              <span className="font-mono text-[#202123]">{formatMetricPercent(metric)}</span>
              <span>{metric.numerator}/{metric.denominator}</span>
              <span>{copy.mvpTier}: {copy.metricTierStatus(metric.mvpPassed)}</span>
              <span>{copy.usableTier}: {copy.metricTierStatus(metric.usablePassed)}</span>
              <span>{copy.excellentTier}: {copy.metricTierStatus(metric.excellentPassed)}</span>
            </div>
          ))}
        </div>
      </div>

      {developmentQaResult ? (
        <div className="grid gap-3 rounded-[12px] border border-[#ececf1] bg-[#fbfbfc] p-3 text-[12px] text-[#565869] md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 font-semibold ${getQaStatusClassName(
                  developmentQaResult.status
                )}`}
              >
                {copy.qaStatus}: {copy.qaRunStatus(developmentQaResult.status)}
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                {copy.qaSuccessRate}: {formatQaSuccessRate(developmentQaResult)}
              </span>
              <span className="rounded-full bg-white px-2 py-1">
                {copy.qaModel}: {developmentQaResult.modelId}
              </span>
            </div>
            <div className="mt-2 truncate font-mono text-[11px] text-[#8e8ea0]">
              {copy.qaProject}: {developmentQaResult.projectRoot}
            </div>
            {developmentQaResult.skippedReason ? (
              <div className="mt-1 text-[11px] text-[#9a3412]">
                {copy.qaSkippedReason}: {developmentQaResult.skippedReason}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2 text-right md:grid-cols-6">
            <QaSummaryPill label={copy.qaTotal} value={developmentQaResult.summary.total} />
            <QaSummaryPill label={copy.qaSucceeded} value={developmentQaResult.summary.succeeded} />
            <QaSummaryPill label={copy.qaFailed} value={developmentQaResult.summary.failed} />
            <QaSummaryPill label={copy.qaBlocked} value={developmentQaResult.summary.blocked} />
            <QaSummaryPill
              label={copy.qaNotImplemented}
              value={developmentQaResult.summary.notImplemented}
            />
            <QaSummaryPill label={copy.qaSkipped} value={developmentQaResult.summary.skipped} />
          </div>
          {developmentQaResult.summary.safety.total > 0 ? (
            <div className="grid grid-cols-2 gap-2 text-right md:col-span-2 md:grid-cols-4">
              <QaSummaryPill
                label={copy.qaSafetyTotal}
                value={developmentQaResult.summary.safety.total}
              />
              <QaSummaryPill
                label={copy.qaSafetyPassed}
                value={developmentQaResult.summary.safety.passed}
              />
              <QaSummaryPill
                label={copy.qaWriteBeforeConfirmationFailures}
                value={developmentQaResult.summary.safety.writeBeforeConfirmationFailures}
              />
              <QaSummaryPill
                label={copy.qaCriticalConfirmationFailures}
                value={developmentQaResult.summary.safety.criticalConfirmationFailures}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 text-right md:col-span-2 md:grid-cols-5">
            <QaSummaryPill
              label={copy.qaMvpGate}
              value={copy.qaMetricGateStatus(developmentQaResult.summary.quality.mvpPassed)}
            />
            <QaSummaryPill
              label={copy.qaToolCallSuccessRate}
              value={formatQaMetricGateValue(developmentQaResult.summary.quality.toolCallSuccessRate)}
            />
            <QaSummaryPill
              label={copy.qaP0ToolErrorRate}
              value={formatQaMetricGateValue(developmentQaResult.summary.quality.p0ToolErrorRate)}
            />
            <QaSummaryPill
              label={copy.qaWriteBeforeConfirmationFailureRate}
              value={formatQaMetricGateValue(
                developmentQaResult.summary.quality.writeBeforeConfirmationFailureRate
              )}
            />
            <QaSummaryPill
              label={copy.qaCriticalConfirmationFailureRate}
              value={formatQaMetricGateValue(
                developmentQaResult.summary.quality.criticalConfirmationFailureRate
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-right md:col-span-2 md:grid-cols-6">
            <QaSummaryPill
              label={copy.qaRegisteredTools}
              value={developmentQaResult.summary.coverage.registeredTools}
            />
            <QaSummaryPill
              label={copy.qaAvailableTools}
              value={developmentQaResult.summary.coverage.availableTools}
            />
            <QaSummaryPill
              label={copy.qaScenarioTools}
              value={developmentQaResult.summary.coverage.scenarioTools}
            />
            <QaSummaryPill
              label={copy.qaAttemptedScenarioTools}
              value={developmentQaResult.summary.coverage.attemptedScenarioTools}
            />
            <QaSummaryPill
              label={copy.qaSucceededScenarioTools}
              value={developmentQaResult.summary.coverage.succeededScenarioTools}
            />
            <QaSummaryPill
              label={copy.qaP0P1ScenarioTools}
              value={
                developmentQaResult.summary.coverage.p0SucceededScenarioTools +
                developmentQaResult.summary.coverage.p1SucceededScenarioTools
              }
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        {groups.map((group) => (
          <details
            key={group.category.id}
            open={group.category.id === "project" || group.category.id === "file"}
            className="rounded-[12px] border border-[#ececf1] bg-[#fbfbfc]"
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[#202123]">
              <span>{group.category.label}</span>
              <span className="text-[12px] font-medium text-[#8e8ea0]">
                {copy.builtInToolCount(group.tools.length)}
              </span>
            </summary>
            <div className="grid gap-2 border-t border-[#ececf1] p-3">
              {group.tools.map((tool) => {
                const latestLog = latestLogByToolName.get(tool.name);

                return (
                  <div
                    key={tool.name}
                    className="grid gap-3 rounded-[10px] bg-white p-3 shadow-[inset_0_0_0_1px_#ececf1] lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.2fr)_minmax(220px,0.9fr)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-[#202123]">
                        {tool.displayName ?? tool.name}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-[#8e8ea0]">
                        {tool.name}
                      </div>
                    </div>
                    <p className="text-[12px] leading-5 text-[#565869]">{tool.description}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#565869]">
                        {copy.category}: {group.category.id}
                      </span>
                      <span className={`rounded-full px-2 py-1 ${getToolRiskClassName(tool.riskLevel)}`}>
                        {copy.risk}: {copy.toolRisk(tool.riskLevel)}
                      </span>
                      <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#565869]">
                        {tool.requiresConfirmation
                          ? copy.confirmationRequired
                          : copy.autoAllowed}
                      </span>
                      <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#565869]">
                        {copy.availability}: {copy.toolAvailability(tool.availability)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${
                          latestLog
                            ? getToolCallStatusClassName(latestLog.status)
                            : "bg-[#f7f7f8] text-[#565869]"
                        }`}
                      >
                        {copy.recentStatus}:{" "}
                        {latestLog
                          ? copy.toolCallStatus(latestLog.status)
                          : copy.noRecentToolCall}
                      </span>
                      {latestLog ? (
                        <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#565869]">
                          {latestLog.durationMs}ms
                        </span>
                      ) : null}
                      {latestLog?.errorMessage ? (
                        <span className="max-w-full truncate rounded-full bg-[#fff1f1] px-2 py-1 text-[#b42318]">
                          {latestLog.errorMessage}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function QaSummaryPill({
  label,
  value
}: {
  label: string;
  value: number | string;
}): ReactElement {
  return (
    <div className="rounded-[10px] bg-white px-2 py-1">
      <div className="text-[10px] font-medium text-[#8e8ea0]">{label}</div>
      <div className="mt-0.5 font-semibold text-[#202123]">{value}</div>
    </div>
  );
}

function formatQaSuccessRate(result: BuiltInToolQaRunResult): string {
  return result.summary.total === 0 ? "-" : `${Math.round(result.summary.successRate * 100)}%`;
}

function formatQaMetricGateValue(
  metric: BuiltInToolQaRunResult["summary"]["quality"]["toolCallSuccessRate"]
): string {
  return metric.value === null ? "-" : `${Math.round(metric.value * 100)}%`;
}

function getQaStatusClassName(status: BuiltInToolQaRunResult["status"]): string {
  if (status === "passed") {
    return "bg-[#effaf6] text-[#087443]";
  }

  if (status === "skipped") {
    return "bg-[#fffbeb] text-[#92400e]";
  }

  return "bg-[#fff1f1] text-[#b42318]";
}

function getToolRiskClassName(riskLevel: BuiltInToolDefinition["riskLevel"]): string {
  if (riskLevel === "critical") {
    return "bg-[#fff1f1] text-[#b42318]";
  }

  if (riskLevel === "high") {
    return "bg-[#fff5eb] text-[#9a3412]";
  }

  if (riskLevel === "medium") {
    return "bg-[#fffbeb] text-[#92400e]";
  }

  return "bg-[#effaf6] text-[#087443]";
}

function createLatestBuiltInToolLogMap(
  logs: BuiltInToolCallLogRecord[]
): Map<string, BuiltInToolCallLogRecord> {
  const latestLogByToolName = new Map<string, BuiltInToolCallLogRecord>();

  for (const log of logs) {
    if (!latestLogByToolName.has(log.toolName)) {
      latestLogByToolName.set(log.toolName, log);
    }
  }

  return latestLogByToolName;
}

function getFeaturedAgentQualityMetrics(
  snapshot: AgentQualityMetricSnapshot | null
): AgentQualityMetricValue[] {
  const featuredMetricIds: AgentQualityMetricId[] = [
    "toolCallSuccessRate",
    "p0ToolErrorRate",
    "highRiskMisfireRate",
    "writeBeforeConfirmationRate"
  ];

  return featuredMetricIds.map((id) => {
    const metric = snapshot?.metrics.find((candidate) => candidate.id === id);

    return (
      metric ?? {
        id,
        numerator: 0,
        denominator: 0,
        value: null,
        mvpPassed: null,
        usablePassed: null,
        excellentPassed: null
      }
    );
  });
}

function getReviewAgentQualityMetrics(
  snapshot: AgentQualityMetricSnapshot | null
): AgentQualityMetricValue[] {
  return agentQualityMetricDefinitions.map((definition) => {
    const metric = snapshot?.metrics.find((candidate) => candidate.id === definition.id);

    return (
      metric ?? {
        id: definition.id,
        numerator: 0,
        denominator: 0,
        value: null,
        mvpPassed: null,
        usablePassed: null,
        excellentPassed: null
      }
    );
  });
}

function formatMetricPercent(metric: AgentQualityMetricValue): string {
  return metric.value === null ? "-" : `${Math.round(metric.value * 100)}%`;
}

function getMetricStatusClassName(metric: AgentQualityMetricValue): string {
  if (metric.mvpPassed === true) {
    return "text-[#087443]";
  }

  if (metric.mvpPassed === false) {
    return "text-[#b42318]";
  }

  return "text-[#8e8ea0]";
}

function getToolCallStatusClassName(status: BuiltInToolCallLogRecord["status"]): string {
  if (status === "succeeded") {
    return "bg-[#effaf6] text-[#087443]";
  }

  if (status === "blocked" || status === "not_implemented") {
    return "bg-[#fff5eb] text-[#9a3412]";
  }

  if (status === "failed") {
    return "bg-[#fff1f1] text-[#b42318]";
  }

  return "bg-[#f7f7f8] text-[#565869]";
}

function renderDraftExtensionActions(
  manifest: ExtensionManifest,
  copy: ExtensionsCopy
): ReactElement {
  return (
    <div className="grid gap-3">
      <p className="rounded-[10px] border border-[#ececf1] bg-[#fafafa] px-3 py-2 text-sm leading-6 text-[#565869]">
        {copy.draftExtensionNotice}
      </p>
      {manifest.actions.map((action) => (
        <article
          key={action.id}
          className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-[#202123]">{action.label}</div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] text-[#6e6e80] shadow-[inset_0_0_0_1px_#ececf1]">
              {copy.riskLabel(action.risk)}
            </span>
          </div>
          <p className="text-[12px] leading-5 text-[#565869]">{action.description}</p>
          <div className="text-[12px] text-[#8e8ea0]">
            {copy.permission}: {action.permission} · {copy.confirmation}:{" "}
            {copy.confirmationPolicy(action.confirmation)}
          </div>
        </article>
      ))}
    </div>
  );
}

function ExtensionManifestDialog({
  busy,
  copy,
  draft,
  mode,
  onCancel,
  onDraftChange,
  onSubmit
}: {
  busy: boolean;
  copy: ReturnType<typeof getExtensionsCopy>;
  draft: ExtensionManifestDraft;
  mode: ExtensionDraftDialogState["mode"];
  onCancel: () => void;
  onDraftChange: (draft: ExtensionManifestDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  const permissionOptions = draft.permissions.map((permission) => ({
    value: permission.id,
    label: permission.label || permission.id
  }));

  function updateField(index: number, patch: Partial<ExtensionSecretFieldDraft>): void {
    onDraftChange({
      ...draft,
      fields: draft.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    });
  }

  function updatePermission(index: number, patch: Partial<ExtensionPermissionDraft>): void {
    onDraftChange({
      ...draft,
      permissions: draft.permissions.map((permission, permissionIndex) =>
        permissionIndex === index ? { ...permission, ...patch } : permission
      )
    });
  }

  function updateAction(index: number, patch: Partial<ExtensionActionDraft>): void {
    onDraftChange({
      ...draft,
      actions: draft.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action
      )
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <form
        onSubmit={onSubmit}
        className="grid max-h-[86vh] w-full max-w-[760px] gap-4 overflow-auto rounded-[16px] border border-[#ececf1] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold text-[#202123]">
              {mode === "create" ? copy.createExtensionTitle : copy.editExtensionTitle}
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-[#6e6e80]">
              {copy.createExtensionHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#565869] transition hover:bg-[#f7f7f8]"
            aria-label={copy.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[#202123]">{copy.extensionName}</span>
          <input
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.currentTarget.value })}
            placeholder={copy.extensionNamePlaceholder}
            className="h-10 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[#202123]">
            {copy.extensionDescription}
          </span>
          <textarea
            value={draft.description}
            onChange={(event) =>
              onDraftChange({ ...draft, description: event.currentTarget.value })
            }
            placeholder={copy.extensionDescriptionPlaceholder}
            rows={4}
            className="min-h-[104px] rounded-[12px] border border-[#d9d9e3] bg-white px-3 py-2 text-sm leading-6 text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]"
          />
        </label>

        <DraftSection title={copy.credentialFields} onAdd={() =>
          onDraftChange({
            ...draft,
            fields: [
              ...draft.fields,
              { id: "api_key", label: "API Key", description: "", placeholder: "" }
            ]
          })
        }>
          {draft.fields.length === 0 ? (
            <p className="text-[12px] text-[#8e8ea0]">{copy.noCredentialsRequired}</p>
          ) : (
            draft.fields.map((field, index) => (
              <div key={index} className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3 md:grid-cols-4">
                <input value={field.id} onChange={(event) => updateField(index, { id: event.currentTarget.value })} placeholder="id" className={draftInputClassName} />
                <input value={field.label} onChange={(event) => updateField(index, { label: event.currentTarget.value })} placeholder={copy.fieldLabel} className={draftInputClassName} />
                <input value={field.description} onChange={(event) => updateField(index, { description: event.currentTarget.value })} placeholder={copy.fieldDescription} className={draftInputClassName} />
                <div className="flex gap-2">
                  <input value={field.placeholder} onChange={(event) => updateField(index, { placeholder: event.currentTarget.value })} placeholder={copy.placeholder} className={draftInputClassName} />
                  <button type="button" onClick={() => onDraftChange({ ...draft, fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index) })} className={draftIconButtonClassName}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </DraftSection>

        <DraftSection title={copy.permissions} onAdd={() =>
          onDraftChange({
            ...draft,
            permissions: [
              ...draft.permissions,
              { id: "external.read", label: copy.readPermission, description: "", defaultMode: "ask" }
            ]
          })
        }>
          {draft.permissions.map((permission, index) => (
            <div key={index} className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3 md:grid-cols-[1fr_1fr_1.3fr_120px_auto]">
              <input value={permission.id} onChange={(event) => updatePermission(index, { id: event.currentTarget.value })} placeholder="permission.id" className={draftInputClassName} />
              <input value={permission.label} onChange={(event) => updatePermission(index, { label: event.currentTarget.value })} placeholder={copy.fieldLabel} className={draftInputClassName} />
              <input value={permission.description} onChange={(event) => updatePermission(index, { description: event.currentTarget.value })} placeholder={copy.fieldDescription} className={draftInputClassName} />
              <InlineSelectMenu<ExtensionPermissionMode>
                ariaLabel={copy.permissions}
                value={permission.defaultMode}
                options={permissionModes.map((value) => ({ value, label: copy.permissionMode(value) }))}
                triggerClassName="w-full justify-between rounded-[10px]"
                onChange={(defaultMode) => updatePermission(index, { defaultMode })}
              />
              <button type="button" onClick={() => onDraftChange({ ...draft, permissions: draft.permissions.filter((_, permissionIndex) => permissionIndex !== index) })} className={draftIconButtonClassName}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </DraftSection>

        <DraftSection title={copy.actions} onAdd={() =>
          onDraftChange({
            ...draft,
            actions: [
              ...draft.actions,
              {
                id: "readData",
                label: copy.readAction,
                description: "",
                permission: draft.permissions[0]?.id ?? "external.read",
                risk: "read",
                confirmation: "ask",
                inputFields: "query"
              }
            ]
          })
        }>
          {draft.actions.map((action, index) => (
            <div key={index} className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <input value={action.id} onChange={(event) => updateAction(index, { id: event.currentTarget.value })} placeholder="action.id" className={draftInputClassName} />
                <input value={action.label} onChange={(event) => updateAction(index, { label: event.currentTarget.value })} placeholder={copy.fieldLabel} className={draftInputClassName} />
                <input value={action.description} onChange={(event) => updateAction(index, { description: event.currentTarget.value })} placeholder={copy.fieldDescription} className={draftInputClassName} />
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_120px_150px_auto]">
                <InlineSelectMenu<string>
                  ariaLabel={copy.permission}
                  value={permissionOptions.some((option) => option.value === action.permission) ? action.permission : permissionOptions[0]?.value ?? ""}
                  options={permissionOptions}
                  triggerClassName="w-full justify-between rounded-[10px]"
                  onChange={(permission) => updateAction(index, { permission })}
                />
                <InlineSelectMenu<ExtensionActionRisk>
                  ariaLabel={copy.actions}
                  value={action.risk}
                  options={(["read", "write", "send", "delete"] as ExtensionActionRisk[]).map((value) => ({ value, label: copy.riskLabel(value) }))}
                  triggerClassName="w-full justify-between rounded-[10px]"
                  onChange={(risk) => updateAction(index, { risk, confirmation: risk === "read" ? action.confirmation : "always" })}
                />
                <InlineSelectMenu<ExtensionConfirmationPolicy>
                  ariaLabel={copy.confirmation}
                  value={action.confirmation}
                  options={(["ask", "always", "never"] as ExtensionConfirmationPolicy[]).map((value) => ({ value, label: copy.confirmationPolicy(value) }))}
                  triggerClassName="w-full justify-between rounded-[10px]"
                  onChange={(confirmation) => updateAction(index, { confirmation })}
                />
                <button type="button" onClick={() => onDraftChange({ ...draft, actions: draft.actions.filter((_, actionIndex) => actionIndex !== index) })} className={draftIconButtonClassName}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input value={action.inputFields} onChange={(event) => updateAction(index, { inputFields: event.currentTarget.value })} placeholder={copy.inputFieldsPlaceholder} className={draftInputClassName} />
            </div>
          ))}
        </DraftSection>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-sm font-semibold text-[#565869] transition hover:bg-[#f7f7f8]"
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || !draft.name.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#202123] px-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {busy ? copy.creating : mode === "create" ? copy.createExtension : copy.save}
          </button>
        </div>
      </form>
    </div>
  );
}

function DraftSection({
  children,
  onAdd,
  title
}: {
  children: ReactElement | ReactElement[];
  onAdd: () => void;
  title: string;
}): ReactElement {
  return (
    <section className="grid gap-2 rounded-[12px] border border-[#ececf1] p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-[#202123]">{title}</h4>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8]"
        >
          <Plus className="h-3.5 w-3.5" />
          {title}
        </button>
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function ActionRow({
  children,
  title
}: {
  children: ReactElement | ReactElement[];
  title: string;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3">
      <span className="min-w-[120px] text-[13px] font-semibold text-[#202123]">{title}</span>
      {children}
    </div>
  );
}

function ActionButton({
  busy,
  label,
  onClick
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#202123] px-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Play className="h-4 w-4" />
      {label}
    </button>
  );
}

function ComposeAction({
  busy,
  copy,
  onChange,
  onSubmit,
  state,
  title
}: {
  busy: boolean;
  copy: ReturnType<typeof getExtensionsCopy>;
  onChange: (state: ComposeState) => void;
  onSubmit: () => void;
  state: ComposeState;
  title: string;
}): ReactElement {
  return (
    <div className="grid gap-2 rounded-[10px] border border-[#ececf1] bg-[#fafafa] p-3">
      <div className="text-[13px] font-semibold text-[#202123]">{title}</div>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          value={state.to}
          onChange={(event) => onChange({ ...state, to: event.currentTarget.value })}
          placeholder={copy.to}
          className="h-9 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
        />
        <input
          value={state.cc}
          onChange={(event) => onChange({ ...state, cc: event.currentTarget.value })}
          placeholder="CC"
          className="h-9 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
        />
        <input
          value={state.bcc}
          onChange={(event) => onChange({ ...state, bcc: event.currentTarget.value })}
          placeholder="BCC"
          className="h-9 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
        />
      </div>
      <input
        value={state.subject}
        onChange={(event) => onChange({ ...state, subject: event.currentTarget.value })}
        placeholder={copy.subject}
        className="h-9 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-sm"
      />
      <textarea
        value={state.text}
        onChange={(event) => onChange({ ...state, text: event.currentTarget.value })}
        placeholder={copy.body}
        rows={4}
        className="min-h-[96px] rounded-[10px] border border-[#d9d9e3] bg-white px-2 py-2 text-sm"
      />
      <div>
        <ActionButton busy={busy} label={copy.run} onClick={onSubmit} />
      </div>
    </div>
  );
}

function createEmptyComposeState(): ComposeState {
  return {
    bcc: "",
    cc: "",
    subject: "",
    text: "",
    to: ""
  };
}

function createComposeInput(state: ComposeState): Record<string, unknown> {
  return {
    bcc: splitRecipients(state.bcc),
    cc: splitRecipients(state.cc),
    subject: state.subject,
    text: state.text,
    to: splitRecipients(state.to)
  };
}

function createDefaultExtensionDraft(language: Language): ExtensionManifestDraft {
  const isChinese = language === "zh-CN";

  return {
    name: "",
    description: "",
    category: "other",
    fields: [],
    permissions: [
      {
        id: "external.read",
        label: isChinese ? "读取外部数据" : "Read external data",
        description: isChinese
          ? "允许扩展读取外部系统中的数据"
          : "Allow the extension to read data from an external system",
        defaultMode: "ask"
      },
      {
        id: "external.write",
        label: isChinese ? "修改外部数据" : "Modify external data",
        description: isChinese
          ? "允许扩展创建或修改外部系统中的真实数据"
          : "Allow the extension to create or modify real external data",
        defaultMode: "ask"
      }
    ],
    actions: [
      {
        id: "readData",
        label: isChinese ? "读取数据" : "Read data",
        description: isChinese ? "读取外部系统数据" : "Read external data",
        permission: "external.read",
        risk: "read",
        confirmation: "ask",
        inputFields: "query"
      },
      {
        id: "writeData",
        label: isChinese ? "写入数据" : "Write data",
        description: isChinese ? "创建或修改外部系统数据" : "Create or modify external data",
        permission: "external.write",
        risk: "write",
        confirmation: "always",
        inputFields: "title, content"
      }
    ]
  };
}

function createDraftFromManifest(manifest: ExtensionManifest): ExtensionManifestDraft {
  return {
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    fields: manifest.auth.fields.map((field) => ({
      id: field.id,
      label: field.label,
      description: field.description,
      placeholder: field.placeholder ?? ""
    })),
    permissions: manifest.permissions.map((permission) => ({
      id: permission.id,
      label: permission.label,
      description: permission.description,
      defaultMode: permission.defaultMode
    })),
    actions: manifest.actions.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      permission: action.permission,
      risk: action.risk,
      confirmation: action.confirmation,
      inputFields: Object.keys(action.inputSchema.properties).join(", ")
    }))
  };
}

function createRequestFromDraft(draft: ExtensionManifestDraft): ExtensionCreateRequest {
  const permissions = createPermissionsFromDraft(draft);

  return {
    name: draft.name,
    description: draft.description,
    category: draft.category,
    auth: {
      type: "secret",
      fields: draft.fields
        .filter((field) => field.id.trim() && field.label.trim())
        .map((field) => ({
          id: field.id.trim(),
          label: field.label.trim(),
          description: field.description.trim() || field.label.trim(),
          placeholder: field.placeholder.trim() || undefined
        }))
    },
    permissions,
    actions: createActionsFromDraft(draft, permissions)
  };
}

function createManifestFromDraft(
  draft: ExtensionManifestDraft,
  existingManifest: ExtensionManifest
): ExtensionManifest {
  return {
    ...existingManifest,
    ...createRequestFromDraft(draft),
    id: existingManifest.id,
    builtIn: false,
    version: existingManifest.version
  };
}

function createPermissionsFromDraft(
  draft: ExtensionManifestDraft
): ExtensionPermissionDefinition[] {
  return draft.permissions
    .filter((permission) => permission.id.trim() && permission.label.trim())
    .map((permission) => ({
      id: permission.id.trim(),
      label: permission.label.trim(),
      description: permission.description.trim() || permission.label.trim(),
      defaultMode: permission.defaultMode
    }));
}

function createActionsFromDraft(
  draft: ExtensionManifestDraft,
  permissions: ExtensionPermissionDefinition[]
): ExtensionActionDefinition[] {
  const fallbackPermission = permissions[0]?.id ?? "external.read";

  return draft.actions
    .filter((action) => action.id.trim() && action.label.trim())
    .map((action) => {
      const inputFields = action.inputFields
        .split(/[,\n]/u)
        .map((field) => field.trim())
        .filter(Boolean);
      const risk = action.risk;

      return {
        id: action.id.trim(),
        label: action.label.trim(),
        description: action.description.trim() || action.label.trim(),
        permission:
          permissions.some((permission) => permission.id === action.permission)
            ? action.permission
            : fallbackPermission,
        risk,
        confirmation: risk === "read" ? action.confirmation : "always",
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            inputFields.map((field) => [field, { type: "string" }])
          )
        },
        outputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" }
          }
        }
      };
    });
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[;,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getExtensionsCopy(language: Language) {
  const isChinese = language === "zh-CN";

  return {
    actions: isChinese ? "动作" : "Actions",
    autoAllowed: isChinese ? "可自动执行" : "Auto allowed",
    availability: isChinese ? "可用性" : "Availability",
    body: isChinese ? "正文" : "Body",
    builtInExtensions: isChinese ? "内置扩展" : "Built-in extensions",
    builtInToolCount: (count: number) => (isChinese ? `${count} 个工具` : `${count} tools`),
    builtInTools: isChinese ? "Built-in Tools 内置工具" : "Built-in Tools",
    builtInToolsDescription: isChinese
      ? "Forge 内置工具按 8 大类统一展示。Full Access 下, Agent 队列会自动执行本地内置工具; 未来不可用工具仍会明确标记为 not_implemented。"
      : "Forge built-in tools are grouped into 8 categories. In Full Access, the agent queue auto-executes local built-in tools, and future unavailable tools remain marked not_implemented.",
    cancel: isChinese ? "取消" : "Cancel",
    category: isChinese ? "分类" : "Category",
    confirmation: isChinese ? "确认策略" : "Confirmation",
    confirmationRequired: isChinese ? "需要确认" : "Confirmation required",
    createExtension: isChinese ? "创建扩展" : "Create extension",
    createExtensionHint: isChinese
      ? "Forge 会创建本地扩展 manifest 草稿, 需要接入运行器后才能执行动作。"
      : "Forge creates a local extension manifest draft. Actions need a runner before they can execute.",
    createExtensionTitle: isChinese ? "创建本地扩展" : "Create Local Extension",
    createFailed: isChinese ? "创建失败" : "Create failed",
    creating: isChinese ? "创建中" : "Creating",
    confirm: isChinese ? "确认执行" : "Confirm",
    confirmRequired: isChinese ? "需要确认后执行" : "Confirmation required",
    confirmTitle: isChinese ? "敏感操作确认" : "Sensitive action confirmation",
    connected: isChinese ? "已连接" : "Connected",
    credentials: isChinese ? "凭据" : "Credentials",
    credentialFields: isChinese ? "凭据字段" : "Credential fields",
    delete: isChinese ? "删除" : "Delete",
    deleteExtensionConfirm: (name: string) =>
      isChinese
        ? `确定删除“${name}”吗？这个操作会删除该本地扩展草稿。`
        : `Delete "${name}"? This removes the local extension draft.`,
    deleteFailed: isChinese ? "删除失败" : "Delete failed",
    disabled: isChinese ? "未启用" : "Disabled",
    draftExtensionNotice: isChinese
      ? "这是本地扩展草稿, 当前仅展示 manifest 中定义的权限和动作 schema。动作运行器接入后才可执行。"
      : "This is a local extension draft. Forge is showing permissions and action schemas from the manifest; actions require a runner before execution.",
    empty: isChinese ? "暂无扩展" : "No extensions",
    emptySecret: isChinese ? "请输入凭据" : "Enter a credential value",
    enable: isChinese ? "启用" : "Enable",
    enabled: isChinese ? "已启用" : "Enabled",
    edit: isChinese ? "编辑" : "Edit",
    editExtensionTitle: isChinese ? "编辑本地扩展" : "Edit Local Extension",
    extensionDeleted: isChinese ? "扩展已删除" : "Extension deleted",
    extensionCreated: (path: string) =>
      isChinese ? `扩展草稿已创建: ${path}` : `Extension draft created: ${path}`,
    extensionDescription: isChinese ? "说明" : "Description",
    extensionDescriptionPlaceholder: isChinese
      ? "描述这个扩展会连接哪个外部系统, 能做哪些动作"
      : "Describe the external service this extension connects to and what it can do",
    extensionName: isChinese ? "扩展名称" : "Extension name",
    extensionNamePlaceholder: isChinese ? "例如 飞书任务扩展" : "Linear Tasks Extension",
    extensionUpdated: (path: string) =>
      isChinese ? `扩展草稿已更新: ${path}` : `Extension draft updated: ${path}`,
    excellentTier: isChinese ? "Excellent" : "Excellent",
    fieldDescription: isChinese ? "说明" : "Description",
    fieldLabel: isChinese ? "显示名称" : "Label",
    from: isChinese ? "发件人" : "From",
    inputFieldsPlaceholder: isChinese
      ? "输入字段, 用逗号分隔, 例如 query, limit"
      : "Input fields separated by commas, e.g. query, limit",
    logs: isChinese ? "调用日志" : "Invocation logs",
    mvpTier: isChinese ? "MVP" : "MVP",
    myExtensions: isChinese ? "我的扩展" : "My extensions",
    noRecentToolCall: isChinese ? "暂无记录" : "No recent call",
    noLogs: isChinese ? "暂无调用日志" : "No invocation logs",
    noCredentialsRequired: isChinese ? "暂无凭据要求" : "No credentials required",
    notConnected: isChinese ? "未连接" : "Not connected",
    permission: isChinese ? "权限" : "Permission",
    permissions: isChinese ? "权限" : "Permissions",
    placeholder: isChinese ? "占位提示" : "Placeholder",
    query: isChinese ? "关键词" : "Query",
    qaBlocked: isChinese ? "阻止" : "Blocked",
    qaAvailableTools: isChinese ? "可用工具" : "Available tools",
    qaAttemptedScenarioTools: isChinese ? "尝试工具" : "Attempted tools",
    qaFailed: isChinese ? "失败" : "Failed",
    qaModel: isChinese ? "模型" : "Model",
    qaNotImplemented: isChinese ? "未实现" : "Not impl.",
    qaProject: isChinese ? "沙箱" : "Sandbox",
    qaP0P1ScenarioTools: isChinese ? "P0/P1 触达" : "P0/P1 covered",
    qaP0ToolErrorRate: isChinese ? "P0 错误率" : "P0 error",
    qaRegisteredTools: isChinese ? "注册工具" : "Registered tools",
    qaRunning: isChinese ? "运行中" : "Running",
    qaCriticalConfirmationFailureRate: isChinese ? "critical 失败率" : "Critical fail",
    qaCriticalConfirmationFailures: isChinese ? "critical 确认失败" : "Critical confirm failures",
    qaMetricGateStatus: (passed: boolean) => {
      if (passed) {
        return isChinese ? "通过" : "Pass";
      }

      return isChinese ? "未通过" : "Fail";
    },
    qaMvpGate: isChinese ? "MVP Gate" : "MVP gate",
    qaSafetyPassed: isChinese ? "安全通过" : "Safety passed",
    qaSafetyTotal: isChinese ? "安全断言" : "Safety assertions",
    qaSkipped: isChinese ? "跳过" : "Skipped",
    qaSkippedReason: isChinese ? "跳过原因" : "Skipped reason",
    qaStatus: isChinese ? "开发 QA" : "Dev QA",
    qaScenarioTools: isChinese ? "QA 触达工具" : "QA-covered tools",
    qaSucceeded: isChinese ? "成功" : "Passed",
    qaSucceededScenarioTools: isChinese ? "成功工具" : "Succeeded tools",
    qaSuccessRate: isChinese ? "成功率" : "Success",
    qaToolCallSuccessRate: isChinese ? "工具成功率" : "Tool success",
    qaTotal: isChinese ? "总数" : "Total",
    qaWriteBeforeConfirmationFailureRate: isChinese ? "写盘失败率" : "Write fail",
    qaWriteBeforeConfirmationFailures: isChinese ? "确认前写盘失败" : "Write-before-confirm failures",
    qualityMetricsReview: isChinese ? "质量指标复盘" : "Quality metrics review",
    readAction: isChinese ? "读取数据" : "Read data",
    readPermission: isChinese ? "读取权限" : "Read permission",
    refresh: isChinese ? "刷新扩展" : "Refresh extensions",
    recentStatus: isChinese ? "最近调用" : "Recent status",
    risk: isChinese ? "风险" : "Risk",
    run: isChinese ? "执行" : "Run",
    runDevelopmentQa: isChinese ? "运行开发 QA" : "Run dev QA",
    save: isChinese ? "保存" : "Save",
    saveFailed: isChinese ? "保存失败" : "Save failed",
    secretSaved: isChinese ? "凭据已保存" : "Credential saved",
    subject: isChinese ? "主题" : "Subject",
    title: isChinese ? "扩展" : "Extensions",
    to: isChinese ? "收件人" : "To",
    usableTier: isChinese ? "Usable" : "Usable",
    permissionMode: (mode: ExtensionPermissionMode) => {
      if (!isChinese) {
        return mode;
      }

      return {
        allow: "允许",
        ask: "询问",
        deny: "拒绝"
      }[mode];
    },
    savedSecret: (last4: string | null) =>
      isChinese
        ? `已保存${last4 ? `, 尾号 ${last4}` : ""}`
        : `Saved${last4 ? `, ending ${last4}` : ""}`,
    metricStatus: (metric: AgentQualityMetricValue) => {
      if (metric.value === null) {
        return isChinese ? "等待数据" : "Waiting for data";
      }

      if (metric.mvpPassed) {
        return isChinese ? "达到 MVP" : "MVP met";
      }

      return isChinese ? "低于 MVP" : "Below MVP";
    },
    metricSampleSize: (metric: AgentQualityMetricValue) =>
      isChinese ? `样本 ${metric.denominator}` : `Samples ${metric.denominator}`,
    metricTierStatus: (passed: boolean | null) => {
      if (passed === null) {
        return isChinese ? "未证明" : "Unproven";
      }

      return passed ? (isChinese ? "通过" : "Pass") : isChinese ? "未通过" : "Fail";
    },
    qaRunStatus: (status: BuiltInToolQaRunResult["status"]) => {
      if (!isChinese) {
        return status;
      }

      return {
        failed: "失败",
        passed: "通过",
        skipped: "已跳过"
      }[status];
    },
    qualityMetricLabel: (metricId: AgentQualityMetricId) => {
      const labels: Record<AgentQualityMetricId, string> = isChinese
        ? {
            complexTaskFirstPassCompletionRate: "复杂任务一次完成率",
            failureRecoveryRate: "失败后可恢复率",
            highRiskMisfireRate: "高风险误触发率",
            mediumTaskFirstPassCompletionRate: "中等任务一次完成率",
            p0ToolErrorRate: "P0 工具错误率",
            postModificationBuildPassRate: "build 通过率",
            postModificationLintPassRate: "lint 通过率",
            postModificationTypecheckPassRate: "typecheck 通过率",
            simpleTaskFirstPassCompletionRate: "简单任务一次完成率",
            toolCallSuccessRate: "工具调用成功率",
            unrelatedCodeChangeRate: "无关代码改动率",
            wrongFileModificationRate: "错误文件修改率",
            writeBeforeConfirmationRate: "确认前写盘率"
          }
        : {
            complexTaskFirstPassCompletionRate: "Complex first-pass",
            failureRecoveryRate: "Failure recovery",
            highRiskMisfireRate: "High-risk misfire",
            mediumTaskFirstPassCompletionRate: "Medium first-pass",
            p0ToolErrorRate: "P0 error rate",
            postModificationBuildPassRate: "Build pass rate",
            postModificationLintPassRate: "Lint pass rate",
            postModificationTypecheckPassRate: "Typecheck pass rate",
            simpleTaskFirstPassCompletionRate: "Simple first-pass",
            toolCallSuccessRate: "Tool success rate",
            unrelatedCodeChangeRate: "Unrelated change rate",
            wrongFileModificationRate: "Wrong file rate",
            writeBeforeConfirmationRate: "Write before confirmation"
          };

      return labels[metricId];
    },
    confirmationPolicy: (policy: ExtensionConfirmationPolicy) => {
      if (!isChinese) {
        return policy;
      }

      return {
        always: "始终确认",
        ask: "按权限询问",
        never: "无需确认"
      }[policy];
    },
    toolAvailability: (availability: BuiltInToolAvailability) => {
      if (!isChinese) {
        return availability;
      }

      return {
        available: "可用",
        not_implemented: "未实现"
      }[availability];
    },
    toolRisk: (risk: BuiltInToolRiskLevel) => {
      if (!isChinese) {
        return risk;
      }

      return {
        critical: "critical",
        high: "高",
        low: "低",
        medium: "中"
      }[risk];
    },
    toolCallStatus: (status: BuiltInToolCallLogRecord["status"]) => {
      if (!isChinese) {
        return status;
      }

      return {
        blocked: "已阻止",
        cancelled: "已取消",
        failed: "失败",
        not_implemented: "未实现",
        succeeded: "成功"
      }[status];
    },
    riskLabel: (risk: ExtensionActionRisk) => {
      if (!isChinese) {
        return risk;
      }

      return {
        delete: "删除",
        read: "读取",
        send: "发送",
        write: "写入"
      }[risk];
    }
  };
}
