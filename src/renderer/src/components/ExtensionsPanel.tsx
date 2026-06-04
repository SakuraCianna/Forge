// 本文件说明: 渲染 Extensions 页面, 管理外部服务授权, 权限和调用日志
import type { FormEvent, ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Play,
  RefreshCcw,
  ShieldAlert,
  Trash2
} from "lucide-react";
import type {
  ExtensionActionConfirmation,
  ExtensionInvocationLogRecord,
  ExtensionInvocationRequest,
  ExtensionInvocationResult,
  ExtensionManifest,
  ExtensionPermissionMode,
  ExtensionRegistrySnapshot,
  ExtensionSettingsPatch
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
  onInvoke: (request: ExtensionInvocationRequest) => Promise<ExtensionInvocationResult>;
  onRefresh: () => void;
  onSaveSecret: (extensionId: string, fieldId: string, value: string) => Promise<void>;
  onDeleteSecret: (extensionId: string, fieldId: string) => Promise<void>;
  onUpdateSettings: (patch: ExtensionSettingsPatch) => Promise<void>;
};

type ComposeState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
};

const permissionModes: ExtensionPermissionMode[] = ["ask", "allow", "deny"];

export function ExtensionsPanel({
  language,
  logs,
  registry,
  onConfirmInvocation,
  onDeleteSecret,
  onInvoke,
  onRefresh,
  onSaveSecret,
  onUpdateSettings
}: ExtensionsPanelProps): ReactElement {
  const copy = getExtensionsCopy(language);
  const [selectedExtensionId, setSelectedExtensionId] = useState(registry.manifests[0]?.id ?? "");
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
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

  async function updateSelectedExtensionEnabled(enabled: boolean): Promise<void> {
    if (!selectedManifest) {
      return;
    }

    await onUpdateSettings({
      extensionId: selectedManifest.id,
      enabled
    });
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#202123]">{copy.title}</h2>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#d9d9e3] bg-white text-[#565869] transition hover:bg-[#f7f7f8]"
            aria-label={copy.refresh}
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {registry.manifests.map((manifest) => {
            const settings = findExtensionSettings(registry, manifest.id);
            const secretStatus = findExtensionSecretStatus(registry, manifest.id);
            const active = selectedManifest?.id === manifest.id;

            return (
              <button
                key={manifest.id}
                type="button"
                onClick={() => setSelectedExtensionId(manifest.id)}
                className={`grid min-h-[64px] w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-3 py-3 text-left transition ${
                  active ? "bg-white shadow-[0_6px_18px_rgba(0,0,0,0.07)]" : "hover:bg-white/85"
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
                    {secretStatus?.configured ? copy.connected : copy.notConnected}
                  </span>
                </span>
              </button>
            );
          })}
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
              </div>
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
              {renderQQMailActions()}
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
    body: isChinese ? "正文" : "Body",
    cancel: isChinese ? "取消" : "Cancel",
    confirm: isChinese ? "确认执行" : "Confirm",
    confirmRequired: isChinese ? "需要确认后执行" : "Confirmation required",
    confirmTitle: isChinese ? "敏感操作确认" : "Sensitive action confirmation",
    connected: isChinese ? "已连接" : "Connected",
    credentials: isChinese ? "凭据" : "Credentials",
    delete: isChinese ? "删除" : "Delete",
    disabled: isChinese ? "未启用" : "Disabled",
    empty: isChinese ? "暂无扩展" : "No extensions",
    emptySecret: isChinese ? "请输入凭据" : "Enter a credential value",
    enable: isChinese ? "启用" : "Enable",
    enabled: isChinese ? "已启用" : "Enabled",
    from: isChinese ? "发件人" : "From",
    logs: isChinese ? "调用日志" : "Invocation logs",
    noLogs: isChinese ? "暂无调用日志" : "No invocation logs",
    notConnected: isChinese ? "未连接" : "Not connected",
    permissions: isChinese ? "权限" : "Permissions",
    query: isChinese ? "关键词" : "Query",
    refresh: isChinese ? "刷新扩展" : "Refresh extensions",
    run: isChinese ? "执行" : "Run",
    save: isChinese ? "保存" : "Save",
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
        : `Saved${last4 ? `, ending ${last4}` : ""}`
  };
}
