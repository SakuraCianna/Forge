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
  writeText: "forge:file:write-text"
} as const;

export const windowChannels = {
  minimize: "forge:window:minimize",
  toggleMaximize: "forge:window:toggle-maximize",
  close: "forge:window:close"
} as const;
