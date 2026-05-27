import type { AgentPlanResult, GenerateAgentPlanRequest } from "../shared/agentTypes.js";
import { buildTextGenerationRequest, extractGeneratedText } from "../shared/textGeneration.js";

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
    instructions: createAgentPlanInstructions(),
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

  if (!text) {
    throw new Error(`${request.provider.label} returned an empty agent response`);
  }

  return {
    providerId: request.provider.id,
    modelId: request.model.id,
    text,
    createdAt: now()
  };
}

function createAgentPlanInstructions(): string {
  return [
    "You are Forge, an open-source local AI coding agent.",
    "Generate a concise execution plan for the user's local project.",
    "Do not reveal hidden chain-of-thought. Show only actionable engineering steps.",
    "Prefer Chinese when the user writes Chinese. Keep file paths exact when mentioned.",
    "Do not claim you changed files or ran commands. This response is planning only."
  ].join("\n");
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
