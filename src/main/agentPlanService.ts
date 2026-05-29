import type {
  AgentFileChangeResult,
  AgentAskResult,
  AgentPlanStep,
  AgentPlanStepKind,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import type { ForgeProvider } from "../shared/modelTypes.js";
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

type GenerateAgentAskStreamOptions = GenerateAgentAskOptions & {
  onDelta: (delta: string) => void;
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
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} agent request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = await readJsonBody(provider.label, response);
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(`${provider.label} returned an empty agent response`);
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    steps: parseAgentPlanSteps(text),
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
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} file change request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = await readJsonBody(provider.label, response);
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
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} ask request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = await readJsonBody(provider.label, response);
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

export async function generateAgentAskStream({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString(),
  onDelta
}: GenerateAgentAskStreamOptions): Promise<AgentAskResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${provider.label} API Key is not configured`);
  }

  const generationRequest = maybeEnableTextGenerationStreaming(
    provider,
    buildTextGenerationRequest({
      provider,
      model: request.model,
      apiKey: apiKey ?? "",
      instructions: createAskInstructions(request.personalization),
      input: createAskInput(request),
      intelligence: request.intelligence,
      speed: request.speed
    })
  );
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      `${provider.label} ask request failed: ${response.status} ${response.statusText}`
    );
  }

  if (!isEventStreamResponse(response)) {
    const body = await readJsonBody(provider.label, response);
    const text = extractGeneratedText(provider.kind, body).trim();
    const usage = extractTokenUsage(provider.kind, body);

    if (!text) {
      throw new Error(`${provider.label} returned an empty ask response`);
    }

    onDelta(text);

    return {
      providerId: provider.id,
      modelId: request.model.id,
      text,
      createdAt: now(),
      usage
    };
  }

  const text =
    (await readEventStreamText(response.clone(), provider.kind, onDelta)) ||
    readEventStreamTextFromBody(await response.text(), provider.kind, onDelta);

  if (!text.trim()) {
    throw new Error(`${provider.label} returned an empty ask response`);
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now()
  };
}

function createAgentPlanInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Generate a concise execution plan for the user's local project.",
    "Prefer a numbered list of concrete steps. Mention target files or commands in backticks when known.",
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
    "You are Forge in direct answer mode inside a coding workbench.",
    "Answer the user's question directly and concisely.",
    "If project context is provided, use it to answer project questions without turning the answer into an execution plan.",
    "Do not claim you edited files, ran commands, or inspected the workspace.",
    "Do not output scaffolding labels such as plan, steps, validation, or logs unless the user asks for them.",
    "Prefer Chinese when the user writes Chinese. Keep answers concise and useful."
  ], personalization);
}

function appendPersonalization(instructions: string[], personalization?: string): string {
  if (!personalization?.trim()) {
    return instructions.join("\n");
  }

  return [...instructions, "User personalization:", personalization.trim()].join("\n");
}

async function readJsonBody(providerLabel: string, response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error(`${providerLabel} returned an empty response`);
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    if (trimmedText.startsWith("<")) {
      throw new Error(
        `${providerLabel} returned HTML instead of JSON. Check Base URL and provider compatibility.`
      );
    }

    throw new Error(
      `${providerLabel} returned invalid JSON. Check Base URL and provider compatibility.`
    );
  }
}

function maybeEnableTextGenerationStreaming(
  provider: ForgeProvider,
  request: ReturnType<typeof buildTextGenerationRequest>
): ReturnType<typeof buildTextGenerationRequest> {
  if (provider.kind === "gemini") {
    return request;
  }

  const body = JSON.parse(request.init.body) as Record<string, unknown>;

  return {
    ...request,
    init: {
      ...request.init,
      body: JSON.stringify({
        ...body,
        stream: true
      })
    }
  };
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") ?? false;
}

async function readEventStreamText(
  response: Response,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Streaming response body is not available");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const delta = readStreamEventDeltaLine(line, providerKind);

      if (delta === "[DONE]") {
        return text;
      }

      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
  }

  const tail = decoder.decode();
  buffer += tail;

  if (buffer.trim()) {
    const delta = readStreamEventDeltaLine(buffer, providerKind);

    if (delta && delta !== "[DONE]") {
      text += delta;
      onDelta(delta);
    }
  }

  return text;
}

function readStreamEventDeltaLine(
  lineText: string,
  providerKind: ForgeProvider["kind"]
): string | null {
  const line = lineText.trim();

  if (!line.startsWith("data:")) {
    return null;
  }

  const data = line.slice(5).trim();

  if (data === "[DONE]") {
    return "[DONE]";
  }

  try {
    return extractStreamDelta(providerKind, JSON.parse(data) as unknown);
  } catch {
    return null;
  }
}

function readEventStreamTextFromBody(
  body: string,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): string {
  let text = "";

  for (const line of body.split(/\r?\n/)) {
    const delta = readStreamEventDeltaLine(line, providerKind);

    if (delta === "[DONE]") {
      return text;
    }

    if (delta) {
      text += delta;
      onDelta(delta);
    }
  }

  return text;
}

function extractStreamDelta(
  providerKind: ForgeProvider["kind"],
  event: unknown
): string | null {
  if (!isRecord(event)) {
    return null;
  }

  if (providerKind === "openai" && event.type === "response.output_text.delta") {
    return typeof event.delta === "string" ? event.delta : null;
  }

  if (providerKind === "anthropic" && event.type === "content_block_delta" && isRecord(event.delta)) {
    return typeof event.delta.text === "string" ? event.delta.text : null;
  }

  if (Array.isArray(event.choices)) {
    const firstChoice = event.choices[0];

    if (isRecord(firstChoice) && isRecord(firstChoice.delta)) {
      return typeof firstChoice.delta.content === "string" ? firstChoice.delta.content : null;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  const parts = [
    `User message:\n${request.prompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`
  ];

  if (request.projectScan) {
    const files = request.projectScan.files
      .slice(0, maxFilesBySpeed[request.speed])
      .map((file) => `- ${file.relativePath} (${file.size} bytes)`)
      .join("\n");

    parts.push(
      [
        "Project context:",
        `Root: ${request.projectScan.rootPath}`,
        `Indexed files:\n${files || "- No files indexed"}`,
        request.projectScan.truncated ? "Project scan was truncated." : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return parts.join("\n\n");
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);

  return match ? match[1] : value;
}

function parseAgentPlanSteps(text: string): AgentPlanStep[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) => {
      const match = /^(?:\d+[.)]|[-*])\s+(.+)$/.exec(line);

      return match ? [match[1].trim()] : [];
    })
    .filter(Boolean)
    .slice(0, 12)
    .map((description, index) => {
      const target = readStepTarget(description);

      return {
        id: `step-${index + 1}`,
        title: createStepTitle(description),
        description,
        kind: inferStepKind(description),
        status: "pending" as const,
        ...(target ? { target } : {})
      };
    });
}

function createStepTitle(description: string): string {
  const withoutTrailingPeriod = description.replace(/[.。]\s*$/, "");
  const sentenceBreak = withoutTrailingPeriod.search(/[。.!?]\s/);
  const title = sentenceBreak > 0 ? withoutTrailingPeriod.slice(0, sentenceBreak + 1) : withoutTrailingPeriod;

  return title.slice(0, 96);
}

function inferStepKind(description: string): AgentPlanStepKind {
  const normalized = description.toLowerCase();

  if (/(inspect|read|review|search|locate|analy[sz]e|查看|阅读|定位|分析|搜索)/.test(normalized)) {
    return "inspect";
  }

  if (/(test|verify|build|lint|typecheck|run|validate|测试|验证|构建|运行|检查)/.test(normalized)) {
    return "verify";
  }

  if (/(modify|edit|change|implement|add|remove|refactor|update|修改|实现|新增|删除|重构|更新)/.test(normalized)) {
    return "edit";
  }

  if (/(commit|git|提交)/.test(normalized)) {
    return "commit";
  }

  return "other";
}

function readStepTarget(description: string): string | undefined {
  const backtickTarget = /`([^`]+)`/.exec(description)?.[1]?.trim();

  if (backtickTarget) {
    return backtickTarget;
  }

  const pathTarget = /(?:^|\s)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?:\s|$|[.,;:])/u.exec(
    description
  )?.[1];

  return pathTarget;
}
