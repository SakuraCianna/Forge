// 本文件说明: 主进程 Agent 执行计划服务
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
  signal?: AbortSignal;
};

type StreamReadResult = {
  text: string;
  truncated: boolean;
};

const maxFilesBySpeed = {
  fast: 24,
  balanced: 60
} as const;

const maxStreamContinuations = 1;

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
  onDelta,
  signal
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
  const response = await fetcher(generationRequest.url, {
    ...generationRequest.init,
    signal
  });

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

  let streamResult = await readStreamingResponseText(response, provider.kind, onDelta);
  let text = streamResult.text;

  for (
    let continuationIndex = 0;
    streamResult.truncated && continuationIndex < maxStreamContinuations;
    continuationIndex += 1
  ) {
    const continuationRequest = maybeEnableTextGenerationStreaming(
      provider,
      buildTextGenerationRequest({
        provider,
        model: request.model,
        apiKey: apiKey ?? "",
        instructions: createAskInstructions(request.personalization),
        input: createAskContinuationInput(request, text),
        intelligence: request.intelligence,
        speed: request.speed
      })
    );
    const continuationResponse = await fetcher(continuationRequest.url, {
      ...continuationRequest.init,
      signal
    });

    if (!continuationResponse.ok) {
      throw new Error(
        `${provider.label} ask continuation failed: ${continuationResponse.status} ${continuationResponse.statusText}`
      );
    }

    if (!isEventStreamResponse(continuationResponse)) {
      const body = await readJsonBody(provider.label, continuationResponse);
      const continuationText = extractGeneratedText(provider.kind, body).trim();

      if (continuationText) {
        text += continuationText;
        onDelta(continuationText);
      }

      break;
    }

    streamResult = await readStreamingResponseText(continuationResponse, provider.kind, onDelta);
    text += streamResult.text;
  }

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

async function readStreamingResponseText(
  response: Response,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): Promise<StreamReadResult> {
  const streamResult = await readEventStreamText(response.clone(), providerKind, onDelta);

  if (streamResult.text || streamResult.truncated) {
    return streamResult;
  }

  return readEventStreamTextFromBody(await response.text(), providerKind, onDelta);
}

async function readEventStreamText(
  response: Response,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): Promise<StreamReadResult> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Streaming response body is not available");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = readStreamEventDeltaLine(line, providerKind);

      if (event.truncated) {
        truncated = true;
      }

      if (event.done) {
        return { text, truncated };
      }

      if (event.delta) {
        text += event.delta;
        onDelta(event.delta);
      }
    }
  }

  const tail = decoder.decode();
  buffer += tail;

  if (buffer.trim()) {
    const event = readStreamEventDeltaLine(buffer, providerKind);

    if (event.truncated) {
      truncated = true;
    }

    if (event.delta && !event.done) {
      text += event.delta;
      onDelta(event.delta);
    }
  }

  return { text, truncated };
}

function readStreamEventDeltaLine(
  lineText: string,
  providerKind: ForgeProvider["kind"]
): { delta: string | null; done: boolean; truncated: boolean } {
  const line = lineText.trim();

  if (!line.startsWith("data:")) {
    return { delta: null, done: false, truncated: false };
  }

  const data = line.slice(5).trim();

  if (data === "[DONE]") {
    return { delta: null, done: true, truncated: false };
  }

  try {
    const event = JSON.parse(data) as unknown;

    return {
      delta: extractStreamDelta(providerKind, event),
      done: false,
      truncated: isStreamTruncated(providerKind, event)
    };
  } catch {
    return { delta: null, done: false, truncated: false };
  }
}

function readEventStreamTextFromBody(
  body: string,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): StreamReadResult {
  let text = "";
  let truncated = false;

  for (const line of body.split(/\r?\n/)) {
    const event = readStreamEventDeltaLine(line, providerKind);

    if (event.truncated) {
      truncated = true;
    }

    if (event.done) {
      return { text, truncated };
    }

    if (event.delta) {
      text += event.delta;
      onDelta(event.delta);
    }
  }

  return { text, truncated };
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

function isStreamTruncated(
  providerKind: ForgeProvider["kind"],
  event: unknown
): boolean {
  if (!isRecord(event)) {
    return false;
  }

  if (
    providerKind === "openai" &&
    isRecord(event.response) &&
    isRecord(event.response.incomplete_details) &&
    event.response.incomplete_details.reason === "max_output_tokens"
  ) {
    return true;
  }

  if (
    providerKind === "anthropic" &&
    event.type === "message_delta" &&
    isRecord(event.delta) &&
    event.delta.stop_reason === "max_tokens"
  ) {
    return true;
  }

  if (!Array.isArray(event.choices)) {
    return false;
  }

  return event.choices.some(
    (choice) =>
      isRecord(choice) &&
      (choice.finish_reason === "length" || choice.finish_reason === "max_tokens")
  );
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
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);

  return [
    `Task:\n${request.taskPrompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`,
    profileContext,
    memoryContext,
    instructionContext,
    `Project root:\n${request.projectScan.rootPath}`,
    `Indexed files:\n${files || "- No files indexed"}${truncatedNote}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function createAgentFileChangeInput(request: GenerateAgentFileChangeRequest): string {
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);

  return [
    `Task:\n${request.taskPrompt}`,
    `Speed mode:\n${request.speed}`,
    profileContext,
    memoryContext,
    instructionContext,
    `File path:\n${request.relativePath}`,
    `Current file content:\n${request.currentContent}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function createAskInput(request: GenerateAgentAskRequest): string {
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);
  const parts = [
    `User message:\n${request.prompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`
  ];

  if (profileContext) {
    parts.push(profileContext);
  }

  if (memoryContext) {
    parts.push(memoryContext);
  }

  if (instructionContext) {
    parts.push(instructionContext);
  }

  if (request.conversation?.length) {
    parts.push(
      [
        "Previous conversation:",
        ...request.conversation.slice(-8).map((turn) => {
          const label = turn.role === "assistant" ? "Assistant" : "User";

          return `${label}: ${turn.content}`;
        })
      ].join("\n")
    );
  }

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

function formatAgentMemories(
  memories: GenerateAgentAskRequest["memories"] | GenerateAgentPlanRequest["memories"]
): string {
  const lines =
    memories
      ?.map((memory) => memory.content.trim())
      .filter(Boolean)
      .slice(0, 8) ?? [];

  if (lines.length === 0) {
    return "";
  }

  return ["Relevant memories:", ...lines.map((line) => `- ${line}`)].join("\n");
}

function formatAgentProfile(
  agentProfile?: GenerateAgentAskRequest["agentProfile"] | GenerateAgentPlanRequest["agentProfile"]
): string {
  if (!agentProfile) {
    return "";
  }

  return [
    "Agent profile:",
    `Name: ${agentProfile.name}`,
    `Description: ${agentProfile.description}`,
    `Permission mode: ${agentProfile.permissionMode}`,
    `Context budget: ${agentProfile.contextBudget}`,
    `Tools: ${agentProfile.enabledTools.length > 0 ? agentProfile.enabledTools.join(", ") : "none"}`,
    "Instructions:",
    agentProfile.instructions
  ].join("\n");
}

function formatProjectInstructions(projectScan?: GenerateAgentAskRequest["projectScan"]): string {
  const instructionFiles =
    projectScan?.instructionFiles
      ?.map((file) => ({
        ...file,
        content: file.content.trim()
      }))
      .filter((file) => file.content)
      .slice(0, 6) ?? [];

  if (instructionFiles.length === 0) {
    return "";
  }

  return [
    "Project instructions:",
    ...instructionFiles.map((file) =>
      [`From ${file.relativePath}${file.truncated ? " (truncated)" : ""}:`, file.content].join(
        "\n"
      )
    )
  ].join("\n\n");
}

function createAskContinuationInput(request: GenerateAgentAskRequest, partialAnswer: string): string {
  return [
    createAskInput(request),
    "The previous assistant answer stopped because the provider reached the output token limit.",
    "Continue exactly where the previous answer stopped. Do not repeat existing content.",
    `Partial assistant answer:\n${partialAnswer}`
  ].join("\n\n");
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
