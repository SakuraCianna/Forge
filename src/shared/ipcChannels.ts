export const keyVaultChannels = {
  save: "forge:provider-key:save",
  status: "forge:provider-key:status",
  delete: "forge:provider-key:delete"
} as const;

export const providerModelChannels = {
  fetch: "forge:provider-models:fetch"
} as const;

export const agentChannels = {
  generatePlan: "forge:agent:generate-plan",
  generateFileChange: "forge:agent:generate-file-change",
  generateAsk: "forge:agent:generate-ask"
} as const;

export const projectChannels = {
  pickDirectory: "forge:project:pick-directory",
  scan: "forge:project:scan"
} as const;

export const commandChannels = {
  run: "forge:command:run"
} as const;

export const gitChannels = {
  status: "forge:git:status",
  commit: "forge:git:commit"
} as const;

export const fileChannels = {
  readText: "forge:file:read-text",
  previewTextUpdate: "forge:file:preview-text-update",
  writeText: "forge:file:write-text"
} as const;

export const windowChannels = {
  minimize: "forge:window:minimize",
  toggleMaximize: "forge:window:toggle-maximize",
  close: "forge:window:close"
} as const;
