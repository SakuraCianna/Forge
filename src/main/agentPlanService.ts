import type {
  AgentFileChangeResult,
  AgentPlanResult,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
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

const maxFilesBySpeed = {
  fast: 24,
  balanced: 60,
  careful: 120
} as const;

export async function generateAgentPlan({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentPlanOptions): Promise<AgentPlanResult> {
  const apiKey = await keyVault.readProviderKey(request.provider.id);

  if (!apiKey) {
    throw new Error(`${request.provider.label} API Key is not configured`);
  }

  const generationRequest = buildTextGenerationRequest({
    provider: request.provider,
    model: request.model,
    apiKey,
    instructions: createAgentPlanInstructions(request.personalization),
    input: createAgentPlanInput(request),
    intelligence: request.intelligence
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${request.provider.label} agent request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as unknown;
  const text = extractGeneratedText(request.provider.kind, body).trim();
  const usage = extractTokenUsage(request.provider.kind, body);

  if (!text) {
    throw new Error(`${request.provider.label} returned an empty agent response`);
  }

  return {
    providerId: request.provider.id,
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
  const apiKey = await keyVault.readProviderKey(request.provider.id);

  if (!apiKey) {
    throw new Error(`${request.provider.label} API Key is not configured`);
  }

  const generationRequest = buildTextGenerationRequest({
    provider: request.provider,
    model: request.model,
    apiKey,
    instructions: createAgentFileChangeInstructions(request.personalization),
    input: createAgentFileChangeInput(request),
    intelligence: request.intelligence
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${request.provider.label} file change request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as unknown;
  const nextContent = stripMarkdownCodeFence(extractGeneratedText(request.provider.kind, body));
  const usage = extractTokenUsage(request.provider.kind, body);

  if (!nextContent.trim()) {
    throw new Error(`${request.provider.label} returned an empty file change`);
  }

  return {
    providerId: request.provider.id,
    modelId: request.model.id,
    relativePath: request.relativePath,
    nextContent,
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

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);

  return match ? match[1] : value;
}
