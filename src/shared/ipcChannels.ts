export const keyVaultChannels = {
  save: "forge:provider-key:save",
  status: "forge:provider-key:status",
  delete: "forge:provider-key:delete"
} as const;

export const providerModelChannels = {
  fetch: "forge:provider-models:fetch"
} as const;

export const projectChannels = {
  pickDirectory: "forge:project:pick-directory",
  scan: "forge:project:scan"
} as const;

export const commandChannels = {
  run: "forge:command:run"
} as const;
