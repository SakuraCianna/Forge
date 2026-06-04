// 本文件说明: 渲染插件和技能目录视图
import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Package,
  Plus,
  Search,
  X
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type {
  LocalPluginSkillCreateKind,
  LocalPluginSkillCreateRequest,
  LocalPluginSkillCreateResult,
  LocalSkillFileContent
} from "@shared/pluginSkillTypes";
import type { ForgePlugin, ForgeSkill } from "@/state/pluginSkills";
import { getContextKindLabel } from "@/state/pluginSkills";

type PluginLibraryPanelProps = {
  language: Language;
  plugins: ForgePlugin[];
  onCreateLocalItem?: (
    request: LocalPluginSkillCreateRequest
  ) => Promise<LocalPluginSkillCreateResult>;
  onOpenExternal?: (url: string) => void;
  onReadCoreFile?: (filePath: string) => Promise<LocalSkillFileContent>;
};

type PluginLibraryMode = "plugins" | "skills";

type SkillListItem = {
  plugin: ForgePlugin;
  skill: ForgeSkill;
};

type PluginLibraryCopy = {
  allSkills: string;
  catalogSource: string;
  cancel: string;
  create: string;
  createDescription: string;
  createDescriptionPlaceholder: string;
  createFailed: string;
  createHint: string;
  createName: string;
  createNamePlaceholder: (kind: LocalPluginSkillCreateKind) => string;
  createPlugin: string;
  createSkill: string;
  createTitle: (kind: LocalPluginSkillCreateKind) => string;
  createdLocalItem: (path: string) => string;
  creating: string;
  coreFiles: string;
  downloadFromGithub: string;
  empty: string;
  extensionSource: string;
  fileContent: string;
  githubExtensions: string;
  githubPlaceholder: string;
  loadingFile: string;
  localFile: string;
  noCoreFiles: string;
  previewUnavailable: string;
  readFileFailed: string;
  openRepository: string;
  plugins: string;
  repository: string;
  search: string;
  skillCount: (count: number) => string;
  skills: string;
  source: string;
};

export function PluginLibraryPanel({
  language,
  onCreateLocalItem,
  onOpenExternal,
  onReadCoreFile,
  plugins
}: PluginLibraryPanelProps): ReactElement {
  const copy = getPluginLibraryCopy(language);
  const [mode, setMode] = useState<PluginLibraryMode>("plugins");
  const [query, setQuery] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState(plugins[0]?.id ?? "");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [creationDialogKind, setCreationDialogKind] =
    useState<LocalPluginSkillCreateKind | null>(null);
  const [creationDescription, setCreationDescription] = useState("");
  const [creationName, setCreationName] = useState("");
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [creationBusy, setCreationBusy] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const skillItems = useMemo(
    () =>
      plugins.flatMap((plugin) =>
        plugin.skills.map((skill) => ({
          plugin,
          skill
        }))
      ),
    [plugins]
  );
  const filteredPlugins = useMemo(
    () =>
      plugins.filter((plugin) =>
        normalizeSearchCorpus(
          `${plugin.name} ${plugin.description} ${plugin.sourceLabel ?? ""} ${plugin.skills
            .map((skill) => `${skill.name} ${skill.description}`)
            .join(" ")}`
        ).includes(normalizedQuery)
      ),
    [normalizedQuery, plugins]
  );
  const filteredSkillItems = useMemo(
    () =>
      skillItems.filter(({ plugin, skill }) =>
        normalizeSearchCorpus(
          `${skill.name} ${skill.description} ${plugin.name} ${skill.sourceLabel ?? ""} ${
            skill.localPath ?? ""
          } ${getSkillCoreFiles(skill).join(" ")}`
        ).includes(normalizedQuery)
      ),
    [normalizedQuery, skillItems]
  );
  const selectedPlugin =
    plugins.find((plugin) => plugin.id === selectedPluginId) ??
    filteredPlugins[0] ??
    plugins[0] ??
    null;
  const activeSkillItem =
    skillItems.find(({ skill }) => skill.id === selectedSkillId) ??
    (mode === "skills" ? filteredSkillItems[0] ?? skillItems[0] : null);

  function selectPlugin(plugin: ForgePlugin): void {
    setMode("plugins");
    setSelectedPluginId(plugin.id);
    setSelectedSkillId(null);
  }

  function selectSkill(item: SkillListItem): void {
    setMode("skills");
    setSelectedPluginId(item.plugin.id);
    setSelectedSkillId(item.skill.id);
  }

  function switchMode(nextMode: PluginLibraryMode): void {
    setMode(nextMode);

    if (nextMode === "plugins") {
      setSelectedSkillId(null);
    }
  }

  function openCreationDialog(kind: LocalPluginSkillCreateKind): void {
    setCreationDialogKind(kind);
    setCreationName("");
    setCreationDescription("");
    setCreationNotice(null);
  }

  async function submitCreation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!creationDialogKind || !onCreateLocalItem || !creationName.trim()) {
      return;
    }

    setCreationBusy(true);
    setCreationNotice(null);

    try {
      const result = await onCreateLocalItem({
        kind: creationDialogKind,
        name: creationName,
        description: creationDescription
      });

      setMode(result.kind === "plugin" ? "plugins" : "skills");
      setCreationDialogKind(null);
      setCreationName("");
      setCreationDescription("");
      setCreationNotice(copy.createdLocalItem(result.primaryFilePath));
    } catch (error) {
      setCreationNotice(
        `${copy.createFailed}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setCreationBusy(false);
    }
  }

  function openGithubExtension(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedGithubUrl = normalizeGithubUrl(githubUrl);
    const targetUrl = githubUrl.trim() ? normalizedGithubUrl : selectedPlugin?.repositoryUrl;

    if (targetUrl) {
      onOpenExternal?.(targetUrl);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,340px)_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#ececf1] bg-[#fbfbfc] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="inline-flex rounded-[13px] bg-[#f1f1f4] p-1">
              {(["plugins", "skills"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => switchMode(item)}
                  className={`h-8 rounded-[10px] px-3 text-[13px] transition ${
                    mode === item
                      ? "bg-white font-medium text-[#202123] shadow-[0_1px_5px_rgba(0,0,0,0.08)]"
                      : "text-[#6e6e80] hover:text-[#202123]"
                  }`}
                >
                  {item === "plugins" ? copy.plugins : copy.skills}
                </button>
              ))}
            </div>
            {onCreateLocalItem ? (
              <button
                type="button"
                onClick={() => openCreationDialog(mode === "plugins" ? "plugin" : "skill")}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8]"
              >
                <Plus className="h-3.5 w-3.5" />
                {mode === "plugins" ? copy.createPlugin : copy.createSkill}
              </button>
            ) : null}
          </div>

          <label className="mb-4 flex h-10 shrink-0 items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-[12px] text-[#8e8ea0]">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={copy.search}
              className="min-w-0 flex-1 bg-transparent text-[#202123] outline-none placeholder:text-[#b4b4bf]"
            />
          </label>

          {creationNotice ? (
            <p className="mb-3 rounded-[10px] border border-[#d9d9e3] bg-white px-3 py-2 text-[12px] leading-5 text-[#565869]">
              {creationNotice}
            </p>
          ) : null}

          <div className="mb-2 shrink-0 px-1 text-[10px] uppercase tracking-normal text-[#8e8ea0]">
            {mode === "plugins" ? copy.plugins : copy.allSkills}
          </div>
          <div className="min-h-0 flex-1 scroll-pb-8 space-y-2.5 overflow-auto pb-8 pr-1">
            {mode === "plugins"
              ? filteredPlugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => selectPlugin(plugin)}
                    className={`grid min-h-[58px] w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-3 py-3 text-left transition active:scale-[0.99] ${
                      selectedPlugin?.id === plugin.id && selectedSkillId === null
                        ? "bg-white shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
                        : "hover:bg-white/85"
                    }`}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white"
                      style={{ backgroundColor: plugin.accent }}
                    >
                      <Package className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium leading-5 text-[#202123]">
                        {plugin.name}
                      </span>
                      <span className="block truncate text-[12px] leading-5 text-[#8e8ea0]">
                        {copy.skillCount(plugin.skills.length)}
                      </span>
                    </span>
                  </button>
                ))
              : filteredSkillItems.map((item) => (
                  <button
                    key={item.skill.id}
                    type="button"
                    onClick={() => selectSkill(item)}
                    className={`grid min-h-[62px] w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-3 py-3 text-left transition active:scale-[0.99] ${
                      activeSkillItem?.skill.id === item.skill.id
                        ? "bg-white shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
                        : "hover:bg-white/85"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#565869] shadow-[inset_0_0_0_1px_#ececf1]">
                      <Box className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium leading-5 text-[#202123]">
                        {item.skill.name}
                      </span>
                      <span className="block truncate text-[12px] leading-5 text-[#8e8ea0]">
                        {item.plugin.name}
                      </span>
                    </span>
                  </button>
                ))}
            {(mode === "plugins" ? filteredPlugins.length : filteredSkillItems.length) === 0 ? (
              <p className="px-1 py-3 text-[12px] text-[#8e8ea0]">{copy.empty}</p>
            ) : null}
          </div>
        </aside>

        <div className="min-h-0 overflow-auto px-6 py-6">
          {mode === "skills" && activeSkillItem ? (
            <SkillDetail
              copy={copy}
              item={activeSkillItem}
              language={language}
              onOpenExternal={onOpenExternal}
              onReadCoreFile={onReadCoreFile}
            />
          ) : selectedPlugin ? (
            <PluginDetail
              copy={copy}
              githubUrl={githubUrl}
              language={language}
              onGithubUrlChange={setGithubUrl}
              onOpenGithubExtension={openGithubExtension}
              onSelectSkill={(skill) => selectSkill({ plugin: selectedPlugin, skill })}
              plugin={selectedPlugin}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[#8e8ea0]">
              {copy.empty}
            </div>
          )}
        </div>
      </div>
      {creationDialogKind ? (
        <CreationDialog
          busy={creationBusy}
          copy={copy}
          description={creationDescription}
          kind={creationDialogKind}
          name={creationName}
          onCancel={() => setCreationDialogKind(null)}
          onDescriptionChange={setCreationDescription}
          onNameChange={setCreationName}
          onSubmit={(event) => void submitCreation(event)}
        />
      ) : null}
    </section>
  );
}

function CreationDialog({
  busy,
  copy,
  description,
  kind,
  name,
  onCancel,
  onDescriptionChange,
  onNameChange,
  onSubmit
}: {
  busy: boolean;
  copy: PluginLibraryCopy;
  description: string;
  kind: LocalPluginSkillCreateKind;
  name: string;
  onCancel: () => void;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <form
        onSubmit={onSubmit}
        className="grid w-full max-w-[520px] gap-4 rounded-[16px] border border-[#ececf1] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold text-[#202123]">
              {copy.createTitle(kind)}
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-[#6e6e80]">{copy.createHint}</p>
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
          <span className="text-[12px] font-semibold text-[#202123]">{copy.createName}</span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            placeholder={copy.createNamePlaceholder(kind)}
            className="h-10 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-[14px] text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[#202123]">
            {copy.createDescription}
          </span>
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            placeholder={copy.createDescriptionPlaceholder}
            rows={4}
            className="min-h-[104px] rounded-[12px] border border-[#d9d9e3] bg-white px-3 py-2 text-[14px] leading-6 text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#202123]"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-[13px] font-semibold text-[#565869] transition hover:bg-[#f7f7f8]"
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#202123] px-3 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {busy ? copy.creating : copy.create}
          </button>
        </div>
      </form>
    </div>
  );
}

function PluginDetail({
  copy,
  githubUrl,
  language,
  onGithubUrlChange,
  onOpenGithubExtension,
  onSelectSkill,
  plugin
}: {
  copy: PluginLibraryCopy;
  githubUrl: string;
  language: Language;
  onGithubUrlChange: (url: string) => void;
  onOpenGithubExtension: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSkill: (skill: ForgeSkill) => void;
  plugin: ForgePlugin;
}): ReactElement {
  const normalizedGithubUrl = normalizeGithubUrl(githubUrl);
  const hasValidGithubTarget = githubUrl.trim()
    ? Boolean(normalizedGithubUrl)
    : Boolean(plugin.repositoryUrl);

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-6 flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-white"
          style={{ backgroundColor: plugin.accent }}
        >
          <Package className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="mb-1 inline-flex rounded-full bg-[#f1f1f4] px-2 py-0.5 text-[10px] text-[#6e6e80]">
            {getContextKindLabel("plugin", language)}
          </span>
          <h2 className="truncate text-[19px] font-semibold text-[#202123]">{plugin.name}</h2>
          <p className="mt-1 max-w-[720px] text-[12px] leading-5 text-[#6e6e80]">
            {plugin.description}
          </p>
        </span>
      </div>

      <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[12px] border border-[#ececf1] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailTile label={copy.source} value={getInstallSourceLabel(plugin.installSource, language)} />
            <DetailTile label={copy.extensionSource} value={plugin.sourceLabel ?? copy.catalogSource} />
            <DetailTile label={copy.skills} value={copy.skillCount(plugin.skills.length)} />
          </div>
        </div>
        <form
          onSubmit={onOpenGithubExtension}
          className="rounded-[12px] border border-[#ececf1] bg-[#fbfbfc] p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#202123]">
            <GitBranch className="h-4 w-4" />
            {copy.githubExtensions}
          </div>
          <div className="flex gap-2">
            <input
              value={githubUrl}
              onChange={(event) => onGithubUrlChange(event.currentTarget.value)}
              placeholder={plugin.repositoryUrl ?? copy.githubPlaceholder}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#d9d9e3] bg-white px-3 text-[12px] text-[#202123] outline-none placeholder:text-[#b4b4bf] focus:border-[#2563eb]"
            />
            <button
              type="submit"
              disabled={!hasValidGithubTarget}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#202123] px-3 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#a3a3a3]"
            >
              <Download className="h-3.5 w-3.5" />
              {copy.downloadFromGithub}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[#202123]">{copy.skills}</h3>
        <span className="text-[12px] text-[#8e8ea0]">{copy.skillCount(plugin.skills.length)}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {plugin.skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            onClick={() => onSelectSkill(skill)}
            className="rounded-[12px] border border-[#ececf1] bg-white p-4 text-left transition hover:border-[#d9d9e3] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#f7f7f8] text-[#565869]">
                <Box className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[#202123]">
                  {skill.name}
                </span>
                <span className="block text-[11px] text-[#8e8ea0]">
                  {getContextKindLabel("skill", language)}
                </span>
              </span>
            </div>
            {getDisplayDescription(skill.description) ? (
              <p className="text-[13px] leading-6 text-[#6e6e80]">
                {getDisplayDescription(skill.description)}
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillDetail({
  copy,
  item,
  language,
  onOpenExternal,
  onReadCoreFile
}: {
  copy: PluginLibraryCopy;
  item: SkillListItem;
  language: Language;
  onOpenExternal?: (url: string) => void;
  onReadCoreFile?: (filePath: string) => Promise<LocalSkillFileContent>;
}): ReactElement {
  const { plugin, skill } = item;
  const coreFiles = getSkillCoreFiles(skill);
  const coreFileKey = coreFiles.join("\n");
  const [selectedCoreFile, setSelectedCoreFile] = useState<string | null>(coreFiles[0] ?? null);
  const [coreFilePreview, setCoreFilePreview] = useState<{
    content?: string;
    error?: string;
    filePath?: string;
    size?: number;
    status: "idle" | "loading" | "ready" | "error";
  }>({ status: "idle" });

  useEffect(() => {
    setSelectedCoreFile(coreFiles[0] ?? null);
  }, [coreFileKey, skill.id]);

  useEffect(() => {
    if (!selectedCoreFile) {
      setCoreFilePreview({ status: "idle" });
      return;
    }

    if (!onReadCoreFile || !isLocalCoreFilePath(selectedCoreFile)) {
      setCoreFilePreview({ filePath: selectedCoreFile, status: "idle" });
      return;
    }

    let disposed = false;

    setCoreFilePreview({ filePath: selectedCoreFile, status: "loading" });
    void onReadCoreFile(selectedCoreFile)
      .then((result) => {
        if (!disposed) {
          setCoreFilePreview({
            content: result.content,
            filePath: result.filePath,
            size: result.size,
            status: "ready"
          });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setCoreFilePreview({
            error: error instanceof Error ? error.message : String(error),
            filePath: selectedCoreFile,
            status: "error"
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [onReadCoreFile, selectedCoreFile]);

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#f7f7f8] text-[#565869] shadow-[inset_0_0_0_1px_#ececf1]">
          <Box className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="mb-1 inline-flex rounded-full bg-[#f1f1f4] px-2 py-0.5 text-[10px] text-[#6e6e80]">
            {getContextKindLabel("skill", language)}
          </span>
          <h2 className="truncate text-[19px] font-semibold text-[#202123]">{skill.name}</h2>
          {getDisplayDescription(skill.description) ? (
            <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-[#6e6e80]">
              {getDisplayDescription(skill.description)}
            </p>
          ) : null}
        </span>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <DetailTile label={getContextKindLabel("plugin", language)} value={plugin.name} />
        <DetailTile label={copy.source} value={getInstallSourceLabel(plugin.installSource, language)} />
        <DetailTile label={copy.extensionSource} value={skill.sourceLabel ?? plugin.sourceLabel ?? copy.catalogSource} />
        <DetailTile label={copy.repository} value={plugin.repositoryUrl ?? "-"} />
      </div>

      {skill.localPath ? (
        <div className="mb-5 rounded-[12px] border border-[#ececf1] bg-white p-4">
          <div className="mb-2 text-[12px] font-semibold text-[#202123]">{copy.localFile}</div>
          <p className="break-all rounded-[10px] bg-[#f7f7f8] px-3 py-2 text-[12px] leading-5 text-[#565869]">
            {skill.localPath}
          </p>
        </div>
      ) : null}

      <div className="rounded-[12px] border border-[#ececf1] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-[#202123]">{copy.coreFiles}</h3>
          {plugin.repositoryUrl ? (
            <button
              type="button"
              onClick={() => onOpenExternal?.(plugin.repositoryUrl ?? "")}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2563eb] transition hover:text-[#1d4ed8]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {copy.openRepository}
            </button>
          ) : null}
        </div>
        {coreFiles.length > 0 ? (
          <div className="space-y-2">
            {coreFiles.map((filePath) => (
              <button
                key={filePath}
                type="button"
                onClick={() => setSelectedCoreFile(filePath)}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[10px] px-3 py-2 text-left transition ${
                  selectedCoreFile === filePath
                    ? "bg-[#ececf1]"
                    : "bg-[#f7f7f8] hover:bg-[#f1f1f4]"
                }`}
              >
                <FileText className="h-4 w-4 text-[#565869]" />
                <span className="min-w-0 break-all text-[13px] leading-5 text-[#202123]">
                  {filePath}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#8e8ea0]">{copy.noCoreFiles}</p>
        )}
        {selectedCoreFile ? (
          <div className="mt-4 overflow-hidden rounded-[12px] border border-[#ececf1] bg-[#fafafa]">
            <div className="flex items-center justify-between gap-3 border-b border-[#ececf1] px-3 py-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-[#202123]">
                {copy.fileContent}
              </span>
              {coreFilePreview.size !== undefined ? (
                <span className="shrink-0 text-[11px] text-[#8e8ea0]">
                  {formatFileSize(coreFilePreview.size)}
                </span>
              ) : null}
            </div>
            {coreFilePreview.status === "loading" ? (
              <div className="p-3 text-[13px] text-[#8e8ea0]">{copy.loadingFile}</div>
            ) : coreFilePreview.status === "ready" ? (
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-6 text-[#202123]">
                {coreFilePreview.content}
              </pre>
            ) : coreFilePreview.status === "error" ? (
              <div className="p-3 text-[13px] leading-5 text-[#b45309]">
                {copy.readFileFailed}: {coreFilePreview.error}
              </div>
            ) : (
              <div className="p-3 text-[13px] text-[#8e8ea0]">{copy.previewUnavailable}</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="min-w-0 rounded-[10px] bg-[#f7f7f8] px-3 py-3">
      <div className="mb-1 text-[11px] text-[#8e8ea0]">{label}</div>
      <div className="truncate text-[12px] font-medium text-[#202123]" title={value}>
        {value}
      </div>
    </div>
  );
}

function getPluginLibraryCopy(language: Language): PluginLibraryCopy {
  if (language === "zh-CN") {
    return {
      allSkills: "全部技能",
      catalogSource: "Forge 目录",
      cancel: "取消",
      create: "创建",
      createDescription: "说明",
      createDescriptionPlaceholder: "描述这个插件或技能解决什么问题, 什么时候使用",
      createFailed: "创建失败",
      createHint: "Forge 会创建本地模板文件, 不会执行任何外部代码。",
      createName: "名称",
      createNamePlaceholder: (kind) => (kind === "plugin" ? "例如 项目交付插件" : "例如 代码审查技能"),
      createPlugin: "创建插件",
      createSkill: "创建技能",
      createTitle: (kind) => (kind === "plugin" ? "创建本地插件" : "创建本地技能"),
      createdLocalItem: (path) => `已创建: ${path}`,
      creating: "创建中",
      coreFiles: "核心文件",
      downloadFromGithub: "打开仓库",
      empty: "没有匹配的插件或技能",
      extensionSource: "扩展来源",
      fileContent: "文件内容",
      githubExtensions: "GitHub 扩展",
      githubPlaceholder: "https://github.com/owner/repo",
      loadingFile: "正在读取文件内容",
      localFile: "本机技能文件",
      noCoreFiles: "没有可展示的核心文件",
      previewUnavailable: "此核心文件不是本机扫描到的可预览文件，可从仓库查看。",
      readFileFailed: "读取失败",
      openRepository: "打开仓库",
      plugins: "插件",
      repository: "仓库",
      search: "搜索插件或技能",
      skillCount: (count) => `${count} 个技能`,
      skills: "技能",
      source: "来源"
    };
  }

  return {
    allSkills: "All skills",
    catalogSource: "Forge catalog",
    cancel: "Cancel",
    create: "Create",
    createDescription: "Description",
    createDescriptionPlaceholder: "Describe what this plugin or skill helps with and when to use it",
    createFailed: "Create failed",
    createHint: "Forge creates local template files and does not execute external code.",
    createName: "Name",
    createNamePlaceholder: (kind) => (kind === "plugin" ? "Project Delivery Plugin" : "Code Review Skill"),
    createPlugin: "Create plugin",
    createSkill: "Create skill",
    createTitle: (kind) => (kind === "plugin" ? "Create Local Plugin" : "Create Local Skill"),
    createdLocalItem: (path) => `Created: ${path}`,
    creating: "Creating",
    coreFiles: "Core files",
    downloadFromGithub: "Open repo",
    empty: "No matching plugins or skills",
    extensionSource: "Extension source",
    fileContent: "File content",
    githubExtensions: "GitHub extensions",
    githubPlaceholder: "https://github.com/owner/repo",
    loadingFile: "Reading file content",
    localFile: "Local skill file",
    noCoreFiles: "No core files to show",
    previewUnavailable: "This core file is not a locally scanned previewable file. Open the repository to inspect it.",
    readFileFailed: "Read failed",
    openRepository: "Open repository",
    plugins: "Plugins",
    repository: "Repository",
    search: "Search plugins or skills",
    skillCount: (count) => `${count} skill${count === 1 ? "" : "s"}`,
    skills: "Skills",
    source: "Source"
  };
}

function getInstallSourceLabel(source: ForgePlugin["installSource"], language: Language): string {
  const isChinese = language === "zh-CN";

  if (source === "local") {
    return isChinese ? "本机发现" : "Local discovery";
  }

  if (source === "github") {
    return isChinese ? "GitHub 扩展" : "GitHub extension";
  }

  return isChinese ? "内置目录" : "Bundled catalog";
}

function normalizeGithubUrl(url: string): string | null {
  const value = url.trim();

  if (!value) {
    return null;
  }

  if (/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/iu.test(value)) {
    return value;
  }

  if (/^[^/\s]+\/[^/\s]+$/u.test(value)) {
    return `https://github.com/${value}`;
  }

  return null;
}

function normalizeSearchCorpus(value: string): string {
  return value.trim().toLowerCase();
}

function getDisplayDescription(description: string): string {
  const value = description.trim();

  return value === "|" || value === ">" ? "" : value;
}

function getSkillCoreFiles(skill: ForgeSkill): string[] {
  if (skill.coreFiles?.length) {
    return skill.coreFiles;
  }

  return skill.localPath ? [skill.localPath] : ["SKILL.md"];
}

function isLocalCoreFilePath(filePath: string): boolean {
  return /^[a-z]:[\\/]/iu.test(filePath) || /^\\\\/u.test(filePath);
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
