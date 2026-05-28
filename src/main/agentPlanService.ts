import type {
  AgentFileChangeResult,
  AgentAskResult,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import { hydrateProviderFromCatalog } from "../shared/providerCatalog.js";
import {
  buildTextGenerationRequest,
  extractGeneratedText,
  extractTokenUsage
} from "../shared/textGeneration.js";

type KeyReader = {
  readProviderKey: (providerId: string) => Promise<string | null>;
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type GenerateAgentPlanOptions = {
  request: GenerateAgentPlanRequest;
  keyVault: KeyReader;
  fetcher?: Fetcher;
  now?: () => string;
};

type GenerateAgentFileChangeOptions = {
  request: GenerateAgentFileChangeRequest;
  keyVault: KeyReader;
  fetcher?: Fetcher;
  now?: () => string;
};

type GenerateAgentAskOptions = {
  request: GenerateAgentAskRequest;
  keyVault: KeyReader;
  fetcher?: Fetcher;
  now?: () => string;
};

const maxFilesBySpeed = {
  fast: 24,
  balanced: 60
} as const;

export async function generateAgentPlan({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentPlanOptions): Promise<AgentPlanResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${provider.label} API Key is not configured`);
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAgentPlanInstructions(request.personalization),
    input: createAgentPlanInput(request),
    intelligence: request.intelligence
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} agent request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as unknown;
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(`${provider.label} returned an empty agent response`);
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now(),
    usage
  };
}

export async function generateAgentFileChange({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentFileChangeOptions): Promise<AgentFileChangeResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${provider.label} API Key is not configured`);
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAgentFileChangeInstructions(request.personalization),
    input: createAgentFileChangeInput(request),
    intelligence: request.intelligence
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} file change request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as unknown;
  const nextContent = stripMarkdownCodeFence(extractGeneratedText(provider.kind, body));
  const usage = extractTokenUsage(provider.kind, body);

  if (!nextContent.trim()) {
    throw new Error(`${provider.label} returned an empty file change`);
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    relativePath: request.relativePath,
    nextContent,
    createdAt: now(),
    usage
  };
}

export async function generateAgentAsk({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentAskOptions): Promise<AgentAskResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${provider.label} API Key is not configured`);
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAskInstructions(request.personalization),
    input: createAskInput(request),
    intelligence: request.intelligence
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} ask request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as unknown;
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(`${provider.label} returned an empty ask response`);
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now(),
    usage
  };
}

function createAgentPlanInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Generate a concise execution plan for the user's local project.",
    "Do not reveal hidden chain-of-thought. Show only actionable engineering steps.",
    "Prefer Chinese when the user writes Chinese. Keep file paths exact when mentioned.",
    "Do not claim you changed files or ran commands. This response is planning only."
  ], personalization);
}

function createAgentFileChangeInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Rewrite the selected file to satisfy the user task.",
    "Return only the complete replacement file content.",
    "Do not include explanations, markdown fences, diffs, or patch markers.",
    "Preserve existing style and imports unless the task requires changes."
  ], personalization);
}

function createAskInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge in ASK mode, a direct chat assistant.",
    "Answer the user's question without assuming access to a local project.",
    "Do not claim you edited files, ran commands, or inspected the workspace.",
    "Prefer Chinese when the user writes Chinese. Keep answers concise and useful."
  ], personalization);
}

function appendPersonalization(instructions: string[], personalization?: string): string {
  if (!personalization?.trim()) {
    return instructions.join("\n");
  }

  return [...instructions, "User personalization:", personalization.trim()].join("\n");
}

function createAgentPlanInput(request: GenerateAgentPlanRequest): string {
  const files = request.projectScan.files
    .slice(0, maxFilesBySpeed[request.speed])
    .map((file) => `- ${file.relativePath} (${file.size} bytes)`)
    .join("\n");
  const truncatedNote = request.projectScan.truncated ? "\nProject scan was truncated." : "";

  return [
    `Task:\n${request.taskPrompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`,
    `Project root:\n${request.projectScan.rootPath}`,
    `Indexed files:\n${files || "- No files indexed"}${truncatedNote}`
  ].join("\n\n");
}

function createAgentFileChangeInput(request: GenerateAgentFileChangeRequest): string {
  return [
    `Task:\n${request.taskPrompt}`,
    `Speed mode:\n${request.speed}`,
    `File path:\n${request.relativePath}`,
    `Current file content:\n${request.currentContent}`
  ].join("\n\n");
}

function createAskInput(request: GenerateAgentAskRequest): string {
  return [
    `User message:\n${request.prompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`
  ].join("\n\n");
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);

  return match ? match[1] : value;
}
