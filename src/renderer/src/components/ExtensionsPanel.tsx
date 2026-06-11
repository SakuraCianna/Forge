// 本文件说明: 渲染 Extensions 页面, 管理外部服务授权, 权限和调用日志
import type { FormEvent, ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  KeyRound,
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
  ExtensionOAuthDefinition,
  ExtensionOAuthStartRequest,
  ExtensionOAuthStartResult,
  ExtensionPermissionDefinition,
  ExtensionPermissionMode,
  ExtensionRegistrySnapshot,
  ExtensionSettingsPatch,
  ExtensionUpdateRequest,
  ExtensionUpdateResult
} from "@shared/extensionTypes";
import type { Language } from "@shared/modelTypes";
import { InlineSelectMenu } from "@/components/InlineSelectMenu";
import {
  findExtensionSecretStatus,
  findExtensionSettings,
  getExtensionPermissionMode
} from "@/state/extensions";

type ExtensionsPanelProps = {
  language: Language;
  logs: ExtensionInvocationLogRecord[];
  registry: ExtensionRegistrySnapshot;
  onConfirmInvocation: (token: string) => Promise<ExtensionInvocationResult>;
  onCreateExtension: (request: ExtensionCreateRequest) => Promise<ExtensionCreateResult>;
  onDeleteExtension: (extensionId: string) => Promise<ExtensionDeleteResult>;
  onInvoke: (request: ExtensionInvocationRequest) => Promise<ExtensionInvocationResult>;
  onOpenExternal: (url: string) => void;
  onRefresh: () => void;
  onSaveSecret: (extensionId: string, fieldId: string, value: string) => Promise<void>;
  onDeleteSecret: (extensionId: string, fieldId: string) => Promise<void>;
  onStartOAuth: (request: ExtensionOAuthStartRequest) => Promise<ExtensionOAuthStartResult>;
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

type ExtensionsCopy = ReturnType<typeof getExtensionsCopy>;

const permissionModes: ExtensionPermissionMode[] = ["ask", "allow", "deny"];
const draftInputClassName =
  "h-9 min-w-0 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]";
const draftIconButtonClassName =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d9d9e3] bg-white text-[#565869] transition hover:bg-[#f7f7f8]";
const extensionIconSources: Record<string, string> = {
  airtable: new URL("../assets/extension-icons/airtable.ico", import.meta.url).href,
  asana: new URL("../assets/extension-icons/asana.ico", import.meta.url).href,
  bitbucket: new URL("../assets/extension-icons/bitbucket.ico", import.meta.url).href,
  calendly: new URL("../assets/extension-icons/calendly.ico", import.meta.url).href,
  clickup: new URL("../assets/extension-icons/clickup.png", import.meta.url).href,
  cloudflare: new URL("../assets/extension-icons/cloudflare.ico", import.meta.url).href,
  confluence: new URL("../assets/extension-icons/confluence.ico", import.meta.url).href,
  datadog: new URL("../assets/extension-icons/datadog.ico", import.meta.url).href,
  discord: new URL("../assets/extension-icons/discord.ico", import.meta.url).href,
  dropbox: new URL("../assets/extension-icons/dropbox.ico", import.meta.url).href,
  figma: new URL("../assets/extension-icons/figma.png", import.meta.url).href,
  freshdesk: new URL("../assets/extension-icons/freshdesk.ico", import.meta.url).href,
  gmail: new URL("../assets/extension-icons/gmail.ico", import.meta.url).href,
  github: new URL("../assets/extension-icons/github.png", import.meta.url).href,
  gitlab: new URL("../assets/extension-icons/gitlab.ico", import.meta.url).href,
  "google-calendar": new URL("../assets/extension-icons/google-calendar.png", import.meta.url).href,
  "google-drive": new URL("../assets/extension-icons/google-drive.png", import.meta.url).href,
  hubspot: new URL("../assets/extension-icons/hubspot.png", import.meta.url).href,
  intercom: new URL("../assets/extension-icons/intercom.ico", import.meta.url).href,
  "jira-cloud": new URL("../assets/extension-icons/jira-cloud.ico", import.meta.url).href,
  linear: new URL("../assets/extension-icons/linear.svg", import.meta.url).href,
  "microsoft-365": new URL("../assets/extension-icons/microsoft-365.svg", import.meta.url).href,
  miro: new URL("../assets/extension-icons/miro.png", import.meta.url).href,
  monday: new URL("../assets/extension-icons/monday.ico", import.meta.url).href,
  mailchimp: new URL("../assets/extension-icons/mailchimp.ico", import.meta.url).href,
  notion: new URL("../assets/extension-icons/notion.png", import.meta.url).href,
  okta: new URL("../assets/extension-icons/okta.ico", import.meta.url).href,
  pagerduty: new URL("../assets/extension-icons/pagerduty.ico", import.meta.url).href,
  pipedrive: new URL("../assets/extension-icons/pipedrive.ico", import.meta.url).href,
  postmark: new URL("../assets/extension-icons/postmark.ico", import.meta.url).href,
  "qq-mail": new URL("../assets/extension-icons/qq-mail.ico", import.meta.url).href,
  salesforce: new URL("../assets/extension-icons/salesforce.ico", import.meta.url).href,
  sentry: new URL("../assets/extension-icons/sentry.ico", import.meta.url).href,
  shopify: new URL("../assets/extension-icons/shopify.ico", import.meta.url).href,
  slack: new URL("../assets/extension-icons/slack.png", import.meta.url).href,
  stripe: new URL("../assets/extension-icons/stripe.ico", import.meta.url).href,
  todoist: new URL("../assets/extension-icons/todoist.ico", import.meta.url).href,
  trello: new URL("../assets/extension-icons/trello.ico", import.meta.url).href,
  twilio: new URL("../assets/extension-icons/twilio.ico", import.meta.url).href,
  zendesk: new URL("../assets/extension-icons/zendesk.ico", import.meta.url).href,
  zoom: new URL("../assets/extension-icons/zoom.ico", import.meta.url).href
};

export function ExtensionsPanel({
  language,
  logs,
  registry,
  onConfirmInvocation,
  onCreateExtension,
  onDeleteExtension,
  onDeleteSecret,
  onInvoke,
  onOpenExternal,
  onRefresh,
  onSaveSecret,
  onStartOAuth,
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
  const [busyOAuthExtensionId, setBusyOAuthExtensionId] = useState<string | null>(null);
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
  const selectedExtensionDetail = selectedManifest
    ? createExtensionDetail(selectedManifest, language)
    : "";
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
  const selectedOAuth = selectedManifest?.auth.oauth;
  const selectedManualAuthFields = selectedManifest
    ? getManualAuthFields(selectedManifest)
    : [];
  const missingOAuthPrerequisiteLabels = selectedOAuth
    ? getMissingOAuthPrerequisiteLabels(selectedManifest, selectedSecretStatus)
    : [];
  const canStartSelectedOAuth =
    Boolean(selectedOAuth) &&
    selectedOAuth?.redirectUriMode !== "registered-https" &&
    missingOAuthPrerequisiteLabels.length === 0;
  const selectedOAuthUsesProductClient = selectedOAuth
    ? hasProductOAuthRuntime(selectedOAuth)
    : false;
  const showSelectedOAuthSetup =
    Boolean(selectedOAuth) &&
    !selectedManifest?.builtIn &&
    (!selectedOAuthUsesProductClient ||
      selectedOAuth?.redirectUriMode !== "loopback");

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

  async function startOAuthAuthorization(manifest: ExtensionManifest): Promise<void> {
    if (!manifest.auth.oauth) {
      return;
    }

    const missingFields = getMissingOAuthPrerequisiteLabels(manifest, selectedSecretStatus);

    if (missingFields.length > 0) {
      setNotice(copy.oauthMissingPrerequisites(missingFields));
      return;
    }

    setBusyOAuthExtensionId(manifest.id);
    setNotice(copy.oauthStarting(manifest.auth.oauth.provider));

    try {
      const result = await onStartOAuth({ extensionId: manifest.id });

      setNotice(copy.oauthSucceeded(result.provider, result.savedFields.length));
    } catch (error) {
      setNotice(
        `${copy.oauthFailed}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusyOAuthExtensionId(null);
    }
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
      <aside className="flex min-h-0 flex-col border-r border-[#ececf1] bg-[#fbfbfc] p-4">
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
        <div className="min-h-0 flex-1 scroll-pb-8 space-y-2 overflow-auto pb-8 pr-1">
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
                      <span className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#ececf1] bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
                        {extensionIconSources[manifest.id] ? (
                          <img
                            src={extensionIconSources[manifest.id]}
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            className="h-6 w-6 object-contain"
                          />
                        ) : (
                          <span className="h-3 w-3 rounded-full bg-[#202123]" />
                        )}
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
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-[#202123]">{selectedManifest.name}</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#565869]">
                  {selectedManifest.description}
                </p>
                <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6e6e80]">
                  {selectedExtensionDetail}
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
              {selectedManifest.auth.oauth ? (
                <div className="grid gap-3 rounded-[10px] border border-[#d9e7ff] bg-[#f8fbff] p-3">
                  <div className="flex items-start gap-2">
                    <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#202123]">
                        {copy.oauthTitle(selectedManifest.auth.oauth.provider)}
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[#565869]">
                        {copy.oauthDescription(
                          selectedManifest.auth.oauth.redirectUriMode,
                          selectedManifest.auth.oauth.scopes
                        )}
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[#565869]">
                        {copy.oauthSetupHint(
                          selectedManifest.auth.oauth.provider,
                          selectedOAuthUsesProductClient
                        )}
                      </div>
                    </div>
                  </div>
                  {missingOAuthPrerequisiteLabels.length > 0 ? (
                    <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
                      {copy.oauthMissingPrerequisites(missingOAuthPrerequisiteLabels)}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {showSelectedOAuthSetup ? (
                      <button
                        type="button"
                        onClick={() => onOpenExternal(selectedManifest.auth.oauth?.setupUrl ?? "")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#c7d7fe] bg-white px-2.5 text-[12px] font-semibold text-[#1d4ed8] transition hover:bg-[#eef4ff]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {copy.oauthSetup}
                      </button>
                    ) : null}
                    {selectedManifest.auth.oauth.redirectUriMode !== "registered-https" ? (
                      <button
                        type="button"
                        disabled={
                          busyOAuthExtensionId === selectedManifest.id ||
                          !canStartSelectedOAuth
                        }
                        onClick={() => void startOAuthAuthorization(selectedManifest)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#2563eb] px-2.5 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Globe2 className="h-3.5 w-3.5" />
                        {busyOAuthExtensionId === selectedManifest.id
                          ? copy.oauthAuthorizing
                          : canStartSelectedOAuth
                            ? copy.oauthStart
                            : copy.oauthMissingButton}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-8 items-center rounded-[10px] border border-[#d9e7ff] bg-white px-2.5 text-[12px] text-[#565869]">
                        {copy.oauthRegisteredCallback}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
              {selectedManifest.auth.fields.length === 0 ? (
                <p className="rounded-[10px] border border-[#ececf1] bg-[#fafafa] px-3 py-2 text-sm text-[#565869]">
                  {copy.noCredentialsRequired}
                </p>
              ) : selectedManualAuthFields.length === 0 ? (
                <p className="rounded-[10px] border border-[#d9e7ff] bg-[#f8fbff] px-3 py-2 text-sm leading-6 text-[#565869]">
                  {copy.oauthOnlyCredentials}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedManualAuthFields.map((field) => {
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
                          {isOAuthPrerequisiteField(selectedManifest.auth.oauth, field.id) ? (
                            <span className="ml-1 font-normal text-[#8e8ea0]">
                              {copy.requiredForOAuth}
                            </span>
                          ) : field.required === false ? (
                            <span className="ml-1 font-normal text-[#8e8ea0]">
                              {copy.optional}
                            </span>
                          ) : null}
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
                          placeholder={
                            status?.hasValue ? copy.savedSecret(status.last4) : field.placeholder
                          }
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

function renderDraftExtensionActions(
  manifest: ExtensionManifest,
  copy: ExtensionsCopy
): ReactElement {
  return (
    <div className="grid gap-3">
      <p className="rounded-[10px] border border-[#ececf1] bg-[#fafafa] px-3 py-2 text-sm leading-6 text-[#565869]">
        {manifest.builtIn ? copy.builtInServiceActionNotice : copy.draftExtensionNotice}
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

function getManualAuthFields(manifest: ExtensionManifest): ExtensionManifest["auth"]["fields"] {
  return manifest.auth.fields.filter((field) => field.manualInput !== false);
}

function getOAuthPrerequisiteFieldIds(oauth: ExtensionOAuthDefinition | undefined): string[] {
  if (!oauth) {
    return [];
  }

  if (oauth.redirectUriMode === "brokered") {
    return oauth.brokerAuthorizationUrl && oauth.brokerTokenUrl ? [] : ["Forge OAuth 授权服务地址"];
  }

  const hasProductClientId = Boolean(oauth.productClientId);
  const needsProductClientId =
    !hasProductClientId && oauth.productClientIdEnvVar ? oauth.productClientIdEnvVar : undefined;
  const needsUserClientId =
    !hasProductClientId && !needsProductClientId ? oauth.clientIdFieldId : undefined;
  const needsUserClientSecret =
    oauth.tokenRequestAuth !== "none" && !oauth.productClientSecretEnvVar
      ? oauth.clientSecretFieldId
      : undefined;

  return [
    ...(needsProductClientId ? [needsProductClientId] : []),
    ...(needsUserClientId ? [needsUserClientId] : []),
    ...(needsUserClientSecret ? [needsUserClientSecret] : [])
  ];
}

function hasProductOAuthRuntime(oauth: ExtensionOAuthDefinition): boolean {
  return Boolean(
    oauth.productClientId ||
      (oauth.redirectUriMode === "brokered" && oauth.brokerAuthorizationUrl && oauth.brokerTokenUrl)
  );
}

function getMissingOAuthPrerequisiteLabels(
  manifest: ExtensionManifest,
  secretStatus: ExtensionRegistrySnapshot["secretStatuses"][number] | null
): string[] {
  return getOAuthPrerequisiteFieldIds(manifest.auth.oauth)
    .filter((fieldId) => !secretStatus?.fields[fieldId]?.hasValue)
    .map((fieldId) => {
      const field = manifest.auth.fields.find((candidate) => candidate.id === fieldId);

      return field?.label ?? fieldId;
    });
}

function isOAuthPrerequisiteField(
  oauth: ExtensionOAuthDefinition | undefined,
  fieldId: string
): boolean {
  return getOAuthPrerequisiteFieldIds(oauth).includes(fieldId);
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

function createExtensionDetail(manifest: ExtensionManifest, language: Language): string {
  const actionLabels = manifest.actions.map((action) => action.label);
  const visibleActions = actionLabels.slice(0, 5).join(language === "zh-CN" ? "、" : ", ");
  const actionSummary =
    actionLabels.length > 5
      ? language === "zh-CN"
        ? `${visibleActions} 等 ${actionLabels.length} 个动作`
        : `${visibleActions}, and ${actionLabels.length - 5} more actions`
      : visibleActions;
  const credentialSummary = manifest.auth.oauth
    ? language === "zh-CN"
      ? "支持网页登录授权或连接器托管凭据, 授权成功后 token 会保存到本地安全存储"
      : "It supports browser authorization or connector-managed credentials, with tokens saved to local secure storage after authorization"
    : language === "zh-CN"
      ? "需要先在凭据区保存对应服务的访问令牌或 API key"
      : "It requires saving the service access token or API key in the credentials section first";
  const riskyActionCount = manifest.actions.filter((action) =>
    ["write", "send", "delete"].includes(action.risk)
  ).length;
  const safetySummary =
    riskyActionCount > 0
      ? language === "zh-CN"
        ? `其中 ${riskyActionCount} 个写入或发送类动作会继续遵守权限策略和二次确认`
        : `${riskyActionCount} write, send or delete actions still follow permission policy and confirmation`
      : language === "zh-CN"
        ? "当前内置动作以读取和检索为主, 适合让 Agent 先理解外部系统状态"
        : "Current built-in actions focus on reading and retrieval so the agent can understand external system state first";

  return language === "zh-CN"
    ? `这个扩展会让 Forge Agent 在你启用并授权后访问 ${manifest.name} 的官方 API。当前可执行 ${actionSummary}。${credentialSummary}。${safetySummary}。`
    : `This extension lets the Forge agent access the official ${manifest.name} API after you enable and authorize it. It can run ${actionSummary}. ${credentialSummary}. ${safetySummary}.`;
}

function getExtensionsCopy(language: Language) {
  const isChinese = language === "zh-CN";

  return {
    actions: isChinese ? "动作" : "Actions",
    autoAllowed: isChinese ? "可自动执行" : "Auto allowed",
    body: isChinese ? "正文" : "Body",
    builtInExtensions: isChinese ? "内置扩展" : "Built-in extensions",
    builtInServiceActionNotice: isChinese
      ? "这些是内置服务动作。启用扩展并保存凭据后, Agent 可以在权限和确认策略约束下调用。"
      : "These are built-in service actions. After enabling the extension and saving credentials, the agent can call them under the configured permission and confirmation policy.",
    cancel: isChinese ? "取消" : "Cancel",
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
    fieldDescription: isChinese ? "说明" : "Description",
    fieldLabel: isChinese ? "显示名称" : "Label",
    from: isChinese ? "发件人" : "From",
    inputFieldsPlaceholder: isChinese
      ? "输入字段, 用逗号分隔, 例如 query, limit"
      : "Input fields separated by commas, e.g. query, limit",
    logs: isChinese ? "调用日志" : "Invocation logs",
    myExtensions: isChinese ? "我的扩展" : "My extensions",
    noLogs: isChinese ? "暂无调用日志" : "No invocation logs",
    noCredentialsRequired: isChinese ? "暂无凭据要求" : "No credentials required",
    notConnected: isChinese ? "未连接" : "Not connected",
    oauthAuthorizing: isChinese ? "授权中" : "Authorizing",
    oauthOnlyCredentials: isChinese
      ? "此扩展通过网页登录授权连接, 不需要手动粘贴 token。授权完成后凭据会自动保存到本机安全存储。"
      : "This extension connects through browser authorization. Tokens do not need to be pasted manually and are saved to local secure storage after authorization.",
    oauthDescription: (redirectMode: string, scopes: string[]) => {
      const scopeText = scopes.length > 0 ? scopes.join(", ") : (isChinese ? "由服务端决定" : "service default");
      const modeText =
        redirectMode === "loopback"
          ? isChinese
            ? "点击网页登录授权后, Forge 会自动完成本地回调并保存 token"
            : "Authorize in the browser, then Forge saves tokens through the local callback"
          : redirectMode === "device-code"
            ? isChinese
              ? "点击网页登录授权后, 按浏览器中的一次性验证码完成连接"
              : "Authorize in the browser with the one-time code shown by Forge"
            : redirectMode === "brokered"
              ? isChinese
                ? "通过 Forge 官方授权服务完成登录, token 自动回写到本机安全存储"
                : "Uses the Forge OAuth service, then saves tokens back to local secure storage"
          : isChinese
            ? "需要 Forge 官方 HTTPS 授权回调服务"
            : "Requires Forge's official HTTPS OAuth callback service";

      return isChinese ? `${modeText}。Scope: ${scopeText}` : `${modeText}. Scope: ${scopeText}`;
    },
    oauthFailed: isChinese ? "网页登录授权失败" : "Browser authorization failed",
    oauthMissingButton: isChinese ? "当前构建未配置网页登录" : "OAuth not configured in this build",
    oauthMissingPrerequisites: (fields: string[]) =>
      isChinese
        ? `当前 Forge 构建缺少网页登录所需的维护者配置: ${fields.join(", ")}。这不是普通用户要填写的内容, 需要发布方先配置 Forge OAuth broker 或产品 OAuth app。`
        : `This Forge build is missing maintainer OAuth configuration: ${fields.join(", ")}. End users should not fill this in; the publisher must configure the Forge OAuth broker or product OAuth app first.`,
    oauthRegisteredCallback: isChinese ? "等待 Forge 官方授权服务" : "Waiting for Forge OAuth service",
    oauthSetup: isChinese ? "打开 OAuth 配置页" : "Open OAuth setup",
    oauthSetupHint: (provider: string, usesProductClient: boolean) =>
      usesProductClient
        ? isChinese
          ? `Forge 已内置 ${provider} 登录应用配置, 用户只需要点击网页登录授权。`
          : `Forge includes the ${provider} OAuth app configuration; users only need to authorize in the browser.`
        : isChinese
          ? `当前构建还没有内置 ${provider} OAuth app 或 Forge OAuth broker, 需要维护者配置后再发布给用户。`
          : `This build does not include a ${provider} OAuth app or Forge OAuth broker yet; the maintainer must configure it before release.`,
    oauthStart: isChinese ? "网页登录授权" : "Authorize in browser",
    oauthStarting: (provider: string) =>
      isChinese ? `正在打开 ${provider} 授权页` : `Opening ${provider} authorization`,
    oauthSucceeded: (provider: string, savedFieldCount: number) =>
      isChinese
        ? `${provider} 授权完成, 已保存 ${savedFieldCount} 个凭据字段`
        : `${provider} authorization completed, saved ${savedFieldCount} credential fields`,
    oauthTitle: (provider: string) =>
      isChinese ? `${provider} 网页授权` : `${provider} browser authorization`,
    optional: isChinese ? "可选" : "Optional",
    permission: isChinese ? "权限" : "Permission",
    permissions: isChinese ? "权限" : "Permissions",
    placeholder: isChinese ? "占位提示" : "Placeholder",
    query: isChinese ? "关键词" : "Query",
    readAction: isChinese ? "读取数据" : "Read data",
    readPermission: isChinese ? "读取权限" : "Read permission",
    refresh: isChinese ? "刷新扩展" : "Refresh extensions",
    requiredForOAuth: isChinese ? "网页登录必填" : "Required for browser auth",
    run: isChinese ? "执行" : "Run",
    save: isChinese ? "保存" : "Save",
    saveFailed: isChinese ? "保存失败" : "Save failed",
    secretSaved: isChinese ? "凭据已保存" : "Credential saved",
    subject: isChinese ? "主题" : "Subject",
    title: isChinese ? "扩展" : "Extensions",
    to: isChinese ? "收件人" : "To",
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
