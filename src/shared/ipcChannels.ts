// 本文件说明: 集中定义主进程和渲染进程之间的 IPC 通道名
export const keyVaultChannels = {
  save: "forge:provider-key:save",
  status: "forge:provider-key:status",
  delete: "forge:provider-key:delete",
  clearAll: "forge:provider-key:clear-all"
} as const;

export const providerModelChannels = {
  fetch: "forge:provider-models:fetch",
  refreshOpenRouterCatalog: "forge:provider-models:refresh-openrouter-catalog"
} as const;

export const agentChannels = {
  generatePlan: "forge:agent:generate-plan",
  generatePlanStream: "forge:agent:generate-plan-stream",
  cancelPlanStream: "forge:agent:cancel-plan-stream",
  planStreamChunk: "forge:agent:plan-stream-chunk",
  generateFileChange: "forge:agent:generate-file-change",
  generateAsk: "forge:agent:generate-ask",
  generateAskStream: "forge:agent:generate-ask-stream",
  cancelAskStream: "forge:agent:cancel-ask-stream",
  askStreamChunk: "forge:agent:ask-stream-chunk"
} as const;

export const projectChannels = {
  pickDirectory: "forge:project:pick-directory",
  scan: "forge:project:scan"
} as const;

export const commandChannels = {
  run: "forge:command:run",
  cancel: "forge:command:cancel",
  output: "forge:command:output"
} as const;

export const gitChannels = {
  status: "forge:git:status",
  commit: "forge:git:commit",
  push: "forge:git:push",
  createWorktree: "forge:git:create-worktree"
} as const;

export const fileChannels = {
  readText: "forge:file:read-text",
  preview: "forge:file:preview",
  listDirectory: "forge:file:list-directory",
  globFiles: "forge:file:glob-files",
  searchText: "forge:file:search-text",
  previewTextUpdate: "forge:file:preview-text-update",
  writeText: "forge:file:write-text",
  deleteFile: "forge:file:delete-file"
} as const;

export const webSearchChannels = {
  search: "forge:web-search:search"
} as const;

export const localSkillChannels = {
  scan: "forge:local-skills:scan",
  readFile: "forge:local-skills:read-file",
  create: "forge:local-skills:create",
  update: "forge:local-skills:update",
  delete: "forge:local-skills:delete"
} as const;

export const extensionChannels = {
  registry: "forge:extensions:registry",
  updateSettings: "forge:extensions:update-settings",
  saveSecret: "forge:extensions:save-secret",
  deleteSecret: "forge:extensions:delete-secret",
  invoke: "forge:extensions:invoke",
  confirmInvocation: "forge:extensions:confirm-invocation",
  logs: "forge:extensions:logs",
  create: "forge:extensions:create",
  update: "forge:extensions:update",
  delete: "forge:extensions:delete"
} as const;

export const builtInToolChannels = {
  catalog: "forge:built-in-tools:catalog",
  execute: "forge:built-in-tools:execute",
  logs: "forge:built-in-tools:logs",
  metrics: "forge:built-in-tools:metrics",
  recordMetric: "forge:built-in-tools:record-metric",
  developmentQa: "forge:built-in-tools:development-qa"
} as const;

export const systemChannels = {
  openExternal: "forge:system:open-external"
} as const;

export const windowChannels = {
  minimize: "forge:window:minimize",
  toggleMaximize: "forge:window:toggle-maximize",
  close: "forge:window:close"
} as const;
