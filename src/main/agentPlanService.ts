// 本文件说明: 调用模型生成 Agent 计划, 文件变更和流式问答
import type {
  AgentFileChangeResult,
  AgentAskResult,
  AgentPlanStep,
  AgentPlanStepKind,
  AgentPlanResult,
  AgentRuntime,
  AgentWorkMode,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import type { ForgeProvider } from "../shared/modelTypes.js";
import type { TokenUsage } from "../shared/usageTypes.js";
import { hydrateProviderFromCatalog } from "../shared/providerCatalog.js";
import {
  buildTextGenerationRequest,
  extractGeneratedText,
  extractTokenUsage
} from "../shared/textGeneration.js";
import {
  formatEmptyProviderResponse,
  formatEmptyProviderResult,
  formatHtmlInsteadOfJson,
  formatInvalidJson,
  formatMissingApiKey,
  formatProviderHttpError,
  formatStreamingBodyUnavailable
} from "../shared/userFacingErrors.js";

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

type GenerateAgentPlanStreamOptions = GenerateAgentPlanOptions & {
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
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
  usage?: TokenUsage;
};

type ParsedPlanStepDraft = {
  description: string;
  kind: AgentPlanStepKind;
  target?: string;
  title?: string;
};

type AgentVerificationPolicy = NonNullable<
  GenerateAgentPlanRequest["agentProfile"]
>["verificationPolicy"];

type StructuredToolHint =
  | "read"
  | "list-directory"
  | "glob"
  | "grep"
  | "git-status"
  | "bash"
  | "edit";

const maxFilesBySpeed = {
  fast: 24,
  balanced: 60
} as const;

const maxStreamContinuations = 1;
const structuredStepArrayKeys = ["steps", "actions", "tasks"] as const;
const structuredPlanObjectKeys = ["plan", "executionPlan", "execution_plan"] as const;
const projectEngineeringPresetInstructions = [
  "Think like a project engineer: understand the stack, repository layout, entrypoints, package managers, and existing conventions before editing.",
  "For feature requests, plan the smallest complete product slice: data/model changes, backend/API changes, frontend/UI changes, configuration, and verification when those layers are relevant.",
  "For full-stack requests, include both server and client entrypoints plus the integration contract between them.",
  "Do not satisfy app-building requests with only a dependency file or one isolated source file unless the existing project truly requires no other files.",
  "When the user names a framework or architecture, use the framework's normal project structure instead of inventing a flat demo.",
  "Project scaffolding requests are not tiny edits: if the project is empty or bare, plan a coherent skeleton with build config, source entrypoints, runtime config, and verification.",
  'For scaffold edit steps, prefer a "files" string array so Forge can expand one architectural step into several controlled file edits without wasting the plan budget.'
] as const;

// 生成可执行计划并解析成步骤, 这里只请求模型不直接改文件
export async function generateAgentPlan({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentPlanOptions): Promise<AgentPlanResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(formatMissingApiKey(provider.label));
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAgentPlanInstructions(request.personalization),
    input: createAgentPlanInput(request),
    attachments: request.attachments,
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "agent request", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(formatEmptyProviderResult(provider.label, "agent response"));
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    steps: parseAgentPlanSteps(text, getPlanStepLimit(request), getVerificationPolicy(request)),
    createdAt: now(),
    usage
  };
}

// 生成流式计划, 让主屏在等待执行时能持续收到模型输出
export async function generateAgentPlanStream({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString(),
  onDelta,
  signal
}: GenerateAgentPlanStreamOptions): Promise<AgentPlanResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(formatMissingApiKey(provider.label));
  }

  const generationRequest = maybeEnableTextGenerationStreaming(
    provider,
    buildTextGenerationRequest({
      provider,
      model: request.model,
      apiKey: apiKey ?? "",
      instructions: createAgentPlanInstructions(request.personalization),
      input: createAgentPlanInput(request),
      attachments: request.attachments,
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
      formatProviderHttpError(provider.label, "agent request", response.status, response.statusText)
    );
  }

  if (!isEventStreamResponse(response)) {
    const body = await readJsonBody(provider.label, response);
    const text = extractGeneratedText(provider.kind, body).trim();
    const usage = extractTokenUsage(provider.kind, body);

    if (!text) {
      throw new Error(formatEmptyProviderResult(provider.label, "agent response"));
    }

    onDelta(text);

    return {
      providerId: provider.id,
      modelId: request.model.id,
      text,
      steps: parseAgentPlanSteps(text, getPlanStepLimit(request), getVerificationPolicy(request)),
      createdAt: now(),
      usage
    };
  }

  const streamResult = await readStreamingResponseText(response, provider.kind, onDelta);
  const text = streamResult.text.trim();

  if (!text) {
    throw new Error(formatEmptyProviderResult(provider.label, "agent response"));
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    steps: parseAgentPlanSteps(text, getPlanStepLimit(request), getVerificationPolicy(request)),
    createdAt: now(),
    usage: streamResult.usage
  };
}

// 生成单文件新内容, 返回预览给渲染层审查
export async function generateAgentFileChange({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentFileChangeOptions): Promise<AgentFileChangeResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(formatMissingApiKey(provider.label));
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAgentFileChangeInstructions(request.personalization),
    input: createAgentFileChangeInput(request),
    attachments: request.attachments,
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "file change request", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const nextContent = stripMarkdownCodeFence(extractGeneratedText(provider.kind, body));
  const usage = extractTokenUsage(provider.kind, body);

  if (!nextContent.trim()) {
    throw new Error(formatEmptyProviderResult(provider.label, "file change"));
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

// 生成非流式问答结果, 用作流式不可用时的备用路径
export async function generateAgentAsk({
  request,
  keyVault,
  fetcher = fetch,
  now = () => new Date().toISOString()
}: GenerateAgentAskOptions): Promise<AgentAskResult> {
  const provider = hydrateProviderFromCatalog(request.provider);
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (provider.requiresApiKey !== false && !apiKey) {
    throw new Error(formatMissingApiKey(provider.label));
  }

  const generationRequest = buildTextGenerationRequest({
    provider,
    model: request.model,
    apiKey: apiKey ?? "",
    instructions: createAskInstructions(request.personalization, request.workMode),
    input: createAskInput(request),
    attachments: request.attachments,
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "ask request", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(formatEmptyProviderResult(provider.label, "ask response"));
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now(),
    usage
  };
}

// 生成流式问答并回传 delta, 结束时返回完整文本和用量
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
    throw new Error(formatMissingApiKey(provider.label));
  }

  const generationRequest = maybeEnableTextGenerationStreaming(
    provider,
    buildTextGenerationRequest({
      provider,
      model: request.model,
      apiKey: apiKey ?? "",
      instructions: createAskInstructions(request.personalization, request.workMode),
      input: createAskInput(request),
      attachments: request.attachments,
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
      formatProviderHttpError(provider.label, "ask request", response.status, response.statusText)
    );
  }

  if (!isEventStreamResponse(response)) {
    const body = await readJsonBody(provider.label, response);
    const text = extractGeneratedText(provider.kind, body).trim();
    const usage = extractTokenUsage(provider.kind, body);

    if (!text) {
      throw new Error(formatEmptyProviderResult(provider.label, "ask response"));
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
  let usage = streamResult.usage;

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
        instructions: createAskInstructions(request.personalization, request.workMode),
        input: createAskContinuationInput(request, text),
        attachments: request.attachments,
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
        formatProviderHttpError(
          provider.label,
          "ask continuation",
          continuationResponse.status,
          continuationResponse.statusText
        )
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
    usage = streamResult.usage ?? usage;
  }

  if (!text.trim()) {
    throw new Error(formatEmptyProviderResult(provider.label, "ask response"));
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now(),
    usage
  };
}

// 构造计划模式系统提示, 强调少量明确动作和验证
function createAgentPlanInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Generate a concise execution plan for the user's local project.",
    ...projectEngineeringPresetInstructions,
    "Keep the plan small and respect the Agent profile plan step limit from the request context.",
    "Follow the Agent profile verification policy from the request context.",
    'Prefer JSON only: return a JSON object with a "steps" array and no prose before or after it. Each step must include "kind", "description", and optional "target".',
    'When useful, include a "tool" field that names one Forge controlled tool: "read", "list_directory", "glob", "grep", "git_status", "bash", or "edit".',
    'For one step that edits multiple files, use a "files" string array so Forge can expand it into separate file actions.',
    "For edit steps, the target must be exactly one project-relative file path only. Put comparison notes or reasoning in description, never in target.",
    "For inspect steps, target must be one file, folder, glob pattern, or search query. Do not combine several unrelated paths in one target string.",
    "For verify steps, target must be a runnable command such as npm run build, npm run typecheck, mvn test, or git status --short.",
    "For JavaScript or TypeScript scaffold work, install project dependencies before the first package build/test command when package.json is created or already present but local dependencies may not be installed. For subprojects prefer commands like npm --prefix frontend install before npm --prefix frontend run build.",
    'Allowed step kinds: "inspect", "edit", "verify", "commit", "other".',
    'Use "read" for exact files, "list_directory" for folders, "glob" for file patterns, "grep" for text search queries, and "git_status" for git status or diff checks.',
    "Do not use shell commands for directory listing, file globbing, text search, or git status/diff when a controlled tool can express the same step.",
    "If you cannot produce JSON, use a numbered list of concrete steps and mention target files or commands in backticks when known.",
    "If the user asks to create, write, or save a named file, include an edit step targeting that exact file path in backticks.",
    "If a requested file does not exist and the user asked to write or create it, create it instead of treating the missing file as a failure.",
    "Do not reveal hidden chain-of-thought. Show only actionable engineering steps.",
    "Prefer Chinese when the user writes Chinese. Keep file paths exact when mentioned.",
    "Do not claim you changed files or ran commands. This response is planning only."
  ], personalization);
}

// 构造文件修改提示, 要求模型只输出完整文件内容
function createAgentFileChangeInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Rewrite the selected file to satisfy the user task.",
    "Return only the complete replacement file content.",
    "Do not include explanations, markdown fences, diffs, or patch markers.",
    "Preserve existing style and imports unless the task requires changes."
  ], personalization);
}

// 构造普通问答提示, 保持简洁并允许 Markdown
function createAskInstructions(personalization?: string, workMode: AgentWorkMode = "code"): string {
  return appendPersonalization([
    "You are Forge in direct answer mode inside a coding workbench.",
    "Answer the user's question directly and concisely.",
    "If project context is provided, use it to answer project questions without turning the answer into an execution plan.",
    "Do not claim you edited files, ran commands, or inspected the workspace.",
    "Do not expose raw internal logs, hidden reasoning, or provider/tool implementation details unless the user asks for debugging details.",
    "When summarizing completed work, mention concrete files, checks, and remaining risks instead of generic success phrases.",
    "Use clean Markdown with short paragraphs and compact bullets only when they improve readability.",
    "Do not output scaffolding labels such as plan, steps, validation, or logs unless the user asks for them.",
    ...getWorkModeInstructionLines(workMode),
    "Prefer Chinese when the user writes Chinese. Keep answers concise and useful."
  ], personalization);
}

// 把用户个性化提示拼到系统提示末尾, 空值直接跳过
function getWorkModeInstructionLines(workMode: AgentWorkMode): string[] {
  if (workMode === "daily") {
    return [
      "Daily work mode is enabled: keep technical power available, but avoid implementation-heavy detail unless the user asks for it.",
      "Prefer a short, conversational answer with only the most relevant project details."
    ];
  }

  return [
    "Code work mode is enabled: prefer concrete engineering detail, file or command specifics, and verification context when useful."
  ];
}

function appendPersonalization(instructions: string[], personalization?: string): string {
  if (!personalization?.trim()) {
    return instructions.join("\n");
  }

  return [...instructions, "User personalization:", personalization.trim()].join("\n");
}

// 读取 JSON 响应并把解析失败包装成供应商错误
async function readJsonBody(providerLabel: string, response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error(formatEmptyProviderResponse(providerLabel));
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    if (trimmedText.startsWith("<")) {
      throw new Error(formatHtmlInsteadOfJson(providerLabel, "provider API compatibility"));
    }

    throw new Error(formatInvalidJson(providerLabel, "provider API compatibility"));
  }
}

// 在请求体支持时打开流式参数, 不破坏非流式供应商
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

// 根据响应头判断是否是 SSE 流
function isEventStreamResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") ?? false;
}

// 优先读取 SSE 增量, 非 SSE 响应回退到普通 JSON
async function readStreamingResponseText(
  response: Response,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): Promise<StreamReadResult> {
  const streamResult = await readEventStreamText(response.clone(), providerKind, onDelta);

  if (streamResult.text || streamResult.truncated || streamResult.usage) {
    return streamResult;
  }

  return readEventStreamTextFromBody(await response.text(), providerKind, onDelta);
}

// 解析 SSE 文本并累计最终回答, 同时把 delta 发给 UI
async function readEventStreamText(
  response: Response,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): Promise<StreamReadResult> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error(formatStreamingBodyUnavailable());
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let truncated = false;
  let usage: TokenUsage | undefined;

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

      usage = event.usage ?? usage;

      if (event.done) {
        return { text, truncated, usage };
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

    usage = event.usage ?? usage;

    if (event.delta && !event.done) {
      text += event.delta;
      onDelta(event.delta);
    }
  }

  return { text, truncated, usage };
}

// 读取单行 SSE 事件里的文本增量
function readStreamEventDeltaLine(
  lineText: string,
  providerKind: ForgeProvider["kind"]
): { delta: string | null; done: boolean; truncated: boolean; usage?: TokenUsage } {
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
    const usage = isRecord(event) ? extractTokenUsage(providerKind, event) : undefined;

    return {
      delta: extractStreamDelta(providerKind, event),
      done: false,
      truncated: isStreamTruncated(providerKind, event),
      usage
    };
  } catch {
    return { delta: null, done: false, truncated: false };
  }
}

// 按字节读取响应体, 处理跨 chunk 的 SSE 行
function readEventStreamTextFromBody(
  body: string,
  providerKind: ForgeProvider["kind"],
  onDelta: (delta: string) => void
): StreamReadResult {
  let text = "";
  let truncated = false;
  let usage: TokenUsage | undefined;

  for (const line of body.split(/\r?\n/)) {
    const event = readStreamEventDeltaLine(line, providerKind);

    if (event.truncated) {
      truncated = true;
    }

    usage = event.usage ?? usage;

    if (event.done) {
      return { text, truncated, usage };
    }

    if (event.delta) {
      text += event.delta;
      onDelta(event.delta);
    }
  }

  return { text, truncated, usage };
}

// 从不同供应商的流式事件中提取文本片段
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

// 判断流是否可能因为长度或截断原因提前结束
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

// 将 unknown 缩窄成对象, 供响应解析安全读字段
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 把项目扫描, 记忆和用户目标整理成计划模型输入
function createAgentPlanInput(request: GenerateAgentPlanRequest): string {
  const files = request.projectScan.files
    .slice(0, maxFilesBySpeed[request.speed])
    .map((file) => `- ${file.relativePath} (${file.size} bytes)`)
    .join("\n");
  const truncatedNote = request.projectScan.truncated ? "\nProject scan was truncated." : "";
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);
  const planStepLimit = getPlanStepLimit(request);
  const verificationPolicy = getVerificationPolicy(request);
  const scaffoldPlanningContext = formatProjectScaffoldPlanningContext(request);

  return [
    `Task:\n${request.taskPrompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`,
    `Plan step limit:\nUse no more than ${planStepLimit} executable steps unless the user explicitly asks for a longer staged plan.`,
    `Verification policy:\n${formatVerificationPolicyInstruction(verificationPolicy)}`,
    formatWorkModeContext(request.workMode),
    formatAgentRuntimeContext(request.agentRuntime),
    profileContext,
    memoryContext,
    instructionContext,
    scaffoldPlanningContext,
    `Project root:\n${request.projectScan.rootPath}`,
    `Indexed files:\n${files || "- No files indexed"}${truncatedNote}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

// 新项目和全栈任务需要显式工程骨架要求, 否则模型容易把计划压缩成一个依赖文件和一个入口文件。
function formatProjectScaffoldPlanningContext(request: GenerateAgentPlanRequest): string {
  if (!hasProjectScaffoldPlanningIntent(request.taskPrompt)) {
    return "";
  }

  const files = request.projectScan.files;
  const bareProject =
    files.length === 0 || !files.some((file) => isKnownProjectFoundationFile(file.relativePath));
  const stackHints = detectProjectStackHints(request.taskPrompt);
  const lines = [
    "Project scaffold planning:",
    bareProject
      ? "The selected project appears empty or bare. Treat this as a scaffold task, not a single-file edit."
      : "The selected project already has files. Preserve its structure and fill the missing layers only.",
    "The plan must cover these layers when relevant: dependency/build files, backend entrypoint, domain/model, API/controller, runtime configuration, frontend package/config, frontend entrypoint, UI component/page, and verification command.",
    "For frontend package scaffolds, include dependency installation before verification so local binaries such as tsc and vite exist before build commands run.",
    'Use grouped edit steps with a "files" array for related files, for example backend foundation files or frontend foundation files.',
    "Do not use shell heredocs or PowerShell file-writing scripts to create project files; use Forge edit steps instead."
  ];

  if (stackHints.length > 0) {
    lines.push(`Detected stack hints: ${stackHints.join(", ")}`);
  }

  return lines.join("\n");
}

function hasProjectScaffoldPlanningIntent(prompt: string): boolean {
  return (
    /(创建|新建|生成|搭建|实现|做一个|写一个|开发|create|generate|scaffold|build|make|implement)/iu.test(
      prompt
    ) &&
    /(项目|工程|系统|应用|页面|接口|数据库|前端|后端|前后端|project|app|application|system|frontend|backend|spring|vue|react|vite|api)/iu.test(
      prompt
    )
  );
}

function isKnownProjectFoundationFile(relativePath: string): boolean {
  const normalizedPath = relativePath.trim().replace(/\\/gu, "/").toLocaleLowerCase();

  return (
    /(^|\/)(package\.json|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod)$/u.test(
      normalizedPath
    ) ||
    /(^|\/)src\/main\/(?:java|kotlin|resources)\//u.test(normalizedPath) ||
    /(^|\/)(src|frontend|client|app)\/(?:main|app|index|router|views|components)\./u.test(
      normalizedPath
    ) ||
    /(^|\/)frontend\/src\//u.test(normalizedPath)
  );
}

function detectProjectStackHints(prompt: string): string[] {
  const hints: string[] = [];
  const normalizedPrompt = prompt.toLocaleLowerCase();

  for (const [label, pattern] of [
    ["Spring Boot", /spring\s*boot|springboot/u],
    ["Vue", /\bvue\b|vue3|vue\s*3/u],
    ["React", /\breact\b/u],
    ["Vite", /\bvite\b/u],
    ["H2", /\bh2\b/u],
    ["Maven", /\bmaven\b|pom\.xml/u],
    ["Gradle", /\bgradle\b/u]
  ] as const) {
    if (pattern.test(normalizedPrompt)) {
      hints.push(label);
    }
  }

  return hints;
}

// 把文件内容和任务要求整理成单文件修改输入
function createAgentFileChangeInput(request: GenerateAgentFileChangeRequest): string {
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);

  return [
    `Task:\n${request.taskPrompt}`,
    `Speed mode:\n${request.speed}`,
    formatWorkModeContext(request.workMode),
    formatAgentRuntimeContext(request.agentRuntime),
    profileContext,
    memoryContext,
    instructionContext,
    `File path:\n${request.relativePath}`,
    `Current file content:\n${request.currentContent}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

// 把历史对话, 项目信息和记忆整理成普通问答输入
function createAskInput(request: GenerateAgentAskRequest): string {
  const profileContext = formatAgentProfile(request.agentProfile);
  const memoryContext = formatAgentMemories(request.memories);
  const instructionContext = formatProjectInstructions(request.projectScan);
  const parts = [
    `User message:\n${request.prompt}`,
    `Selected model:\n${request.model.label} (${request.model.modelName})`,
    `Speed mode:\n${request.speed}`,
    formatWorkModeContext(request.workMode),
    formatAgentRuntimeContext(request.agentRuntime)
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

// 将选中的长期记忆转成提示词块, 未命中时返回空字符串
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

// 把智能体配置转成模型可读约束, 控制权限和工具边界
function formatWorkModeContext(workMode: AgentWorkMode = "code"): string {
  if (workMode === "daily") {
    return [
      "Work mode:",
      "daily - keep answers lighter and less implementation-heavy unless the user asks for code-level detail."
    ].join("\n");
  }

  return [
    "Work mode:",
    "code - include concrete engineering details, relevant files, commands, and verification context when useful."
  ].join("\n");
}

function formatAgentRuntimeContext(agentRuntime: AgentRuntime = "windows-native"): string {
  if (agentRuntime === "wsl") {
    return [
      "Agent runtime:",
      "wsl - prefer Linux shell semantics and WSL-friendly commands when proposing command steps."
    ].join("\n");
  }

  return [
    "Agent runtime:",
    "windows-native - prefer Windows-compatible commands and PowerShell-safe examples unless the user asks otherwise."
  ].join("\n");
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
    `Plan step limit: ${agentProfile.planStepLimit}`,
    `Auto-run batch size: ${agentProfile.autoRunBatchSize}`,
    `Verification policy: ${agentProfile.verificationPolicy}`,
    `Failure recovery policy: ${agentProfile.failureRecoveryPolicy}`,
    `Max failure recovery attempts: ${agentProfile.maxFailureRecoveryAttempts}`,
    `Tools: ${agentProfile.enabledTools.length > 0 ? agentProfile.enabledTools.join(", ") : "none"}`,
    "Instructions:",
    agentProfile.instructions
  ].join("\n");
}

// 压缩项目说明文件, 保留路径名帮助模型判断来源
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

// 流被截断时请求模型续写, 只要求补剩余回答
function createAskContinuationInput(request: GenerateAgentAskRequest, partialAnswer: string): string {
  return [
    createAskInput(request),
    "The previous assistant answer stopped because the provider reached the output token limit.",
    "Continue exactly where the previous answer stopped. Do not repeat existing content.",
    `Partial assistant answer:\n${partialAnswer}`
  ].join("\n\n");
}

// 去掉模型包裹的代码块, 文件写入需要纯内容
function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);

  return match ? match[1] : value;
}

// 从模型文本里解析步骤列表, 失败时回退到单个说明步骤
function parseAgentPlanSteps(
  text: string,
  stepLimit = 12,
  verificationPolicy: AgentVerificationPolicy = "suggest"
): AgentPlanStep[] {
  const normalizedStepLimit = clampPlanStepLimit(stepLimit);
  const structuredSteps = parseStructuredAgentPlanSteps(text);
  const descriptions: ParsedPlanStepDraft[] =
    structuredSteps.length > 0
      ? structuredSteps
      : text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .flatMap((line) => {
            const match = /^(?:\d+[.)]|[-*])\s+(.+)$/.exec(line);

            return match
              ? [
                  {
                    description: match[1].trim(),
                    kind: inferStepKind(match[1])
                  }
                ]
              : [];
          })
          .filter((step) => step.description);

  const steps = descriptions
    .slice(0, normalizedStepLimit)
    .map((step, index) => {
      const kind = step.kind;
      const target = step.target ?? readStepTarget(step.description, kind);

      return {
        id: `step-${index + 1}`,
        title: step.title?.trim() || createStepTitle(step.description),
        description: step.description,
        kind,
        status: "pending" as const,
        ...(target ? { target } : {})
      };
    });

  return applyVerificationPolicy(steps, normalizedStepLimit, verificationPolicy);
}

function getPlanStepLimit(request: GenerateAgentPlanRequest): number {
  return clampPlanStepLimit(request.agentProfile?.planStepLimit ?? 6);
}

function getVerificationPolicy(request: GenerateAgentPlanRequest): AgentVerificationPolicy {
  return request.agentProfile?.verificationPolicy ?? "suggest";
}

function formatVerificationPolicyInstruction(policy: AgentVerificationPolicy): string {
  if (policy === "require") {
    return "require - include a verification step for plans that edit files or code. Prefer concrete tests, type checks, build commands, or git status checks.";
  }

  if (policy === "skip") {
    return "skip - do not add a standalone verification step unless the user explicitly asks for one.";
  }

  return "suggest - include verification when it is clearly useful for the requested task.";
}

function applyVerificationPolicy(
  steps: AgentPlanStep[],
  stepLimit: number,
  verificationPolicy: AgentVerificationPolicy
): AgentPlanStep[] {
  if (
    verificationPolicy !== "require" ||
    !steps.some((step) => step.kind === "edit") ||
    steps.some((step) => step.kind === "verify")
  ) {
    return steps;
  }

  const verificationStep: AgentPlanStep = {
    id: `step-${Math.max(1, Math.min(stepLimit, steps.length + 1))}`,
    title: "Verify changes",
    description: "Check the resulting project state before finishing.",
    kind: "verify",
    status: "pending",
    target: "git status"
  };

  if (steps.length < stepLimit) {
    return renumberPlanSteps([...steps, verificationStep]);
  }

  const removableIndex = findVerificationInsertionRemovalIndex(steps);
  const nextSteps = steps.filter((_, index) => index !== removableIndex);

  return renumberPlanSteps([...nextSteps, verificationStep]);
}

function findVerificationInsertionRemovalIndex(steps: AgentPlanStep[]): number {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].kind !== "edit") {
      return index;
    }
  }

  return Math.max(0, steps.length - 1);
}

function renumberPlanSteps(steps: AgentPlanStep[]): AgentPlanStep[] {
  return steps.map((step, index) => ({ ...step, id: `step-${index + 1}` }));
}

function clampPlanStepLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 6;
  }

  return Math.min(12, Math.max(2, Math.round(value)));
}

// 优先解析模型输出的结构化 JSON steps, 失败时让自然语言列表解析接管
function parseStructuredAgentPlanSteps(text: string): ParsedPlanStepDraft[] {
  for (const candidate of readJsonPlanCandidates(text)) {
    const value = parseJsonPlanCandidate(candidate);

    if (!value.ok) {
      continue;
    }

    const steps = readStructuredStepsArray(value.value)
      .flatMap(normalizeStructuredPlanStep)
      .filter((step): step is ParsedPlanStepDraft => Boolean(step));

    if (steps.length > 0) {
      return steps;
    }
  }

  return [];
}

// 提取 fenced json, 纯 JSON, 以及混合文本里的顶层 JSON 对象作为候选
function readJsonPlanCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) {
    const candidate = match[1]?.trim();

    if (candidate) {
      candidates.push(candidate);
    }
  }

  const trimmed = text.trim();

  if (trimmed) {
    candidates.push(trimmed);
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  const balancedObject = readBalancedJsonCandidate(trimmed, "{", "}");

  if (balancedObject) {
    candidates.push(balancedObject);
  }

  const balancedArray = readBalancedJsonCandidate(trimmed, "[", "]");

  if (balancedArray) {
    candidates.push(balancedArray);
  }

  return [...new Set(candidates)];
}

// 解析计划 JSON 时允许常见模型瑕疵, 例如尾逗号和 BOM
function parseJsonPlanCandidate(
  candidate: string
): { ok: true; value: unknown } | { ok: false } {
  const normalized = candidate.trim().replace(/^\uFEFF/u, "");

  for (const value of [
    normalized,
    normalized.replace(/,\s*([}\]])/gu, "$1")
  ]) {
    try {
      return { ok: true, value: JSON.parse(value) as unknown };
    } catch {
      continue;
    }
  }

  return { ok: false };
}

// 从混合文本里读取第一个平衡 JSON 片段, 避免 lastIndexOf 把解释文字吞进去
function readBalancedJsonCandidate(
  text: string,
  openChar: "{" | "[",
  closeChar: "}" | "]"
): string | null {
  const start = text.indexOf(openChar);

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

// 兼容 { steps: [...] }, { plan: { steps: [...] } } 和直接返回数组等结构化计划
function readStructuredStepsArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of structuredStepArrayKeys) {
    const steps = value[key];

    if (Array.isArray(steps)) {
      return steps;
    }
  }

  for (const key of structuredPlanObjectKeys) {
    const steps = readStructuredStepsArray(value[key]);

    if (steps.length > 0) {
      return steps;
    }
  }

  return [];
}

// 把结构化 step 的别名字段归一化成 Forge 内部计划步骤草稿
function normalizeStructuredPlanStep(value: unknown): ParsedPlanStepDraft[] {
  if (!isRecord(value)) {
    return [];
  }

  const title = readStringField(value, ["title", "label", "name"]);
  const description =
    readStringField(value, ["description", "task", "action", "summary"]) ?? title ?? "";
  const toolHint = normalizeStructuredToolHint(readStringField(value, ["tool", "toolName", "tool_name"]));
  const rawTarget = readStringField(value, [
    "target",
    "file",
    "path",
    "directory",
    "pattern",
    "query",
    "command"
  ]);
  const rawKind = readStringField(value, ["kind", "type"]);
  const kind = normalizePlanStepKind(rawKind, `${description} ${rawTarget ?? ""}`, toolHint);
  const structuredTargets =
    kind === "verify" ? [] : readStringArrayField(value, ["targets", "files", "paths"]);
  const fallbackTarget = readStepTarget(description, kind);
  const target =
    normalizeStructuredToolTarget(toolHint, rawTarget, fallbackTarget) ??
    structuredTargets[0] ??
    fallbackTarget;
  const finalDescription = description.trim() || target || "Review this plan step";
  const targets = structuredTargets.length > 0 ? structuredTargets : target ? [target] : [];
  const baseStep = {
    description: finalDescription,
    kind,
    ...(title ? { title } : {})
  };

  if (targets.length === 0) {
    return [baseStep];
  }

  return targets.map((target) => ({
    ...baseStep,
    target
  }));
}

// 读取结构化计划里的字符串字段, 忽略数组和对象等不安全类型
function readStringField(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const fieldValue = value[key];

    if (typeof fieldValue === "string" && fieldValue.trim()) {
      return normalizePlanTargetText(fieldValue);
    }
  }

  return undefined;
}

// 兼容编码智能体常见的 files/targets/paths 数组输出, 让一个结构化 step 能展开成多个文件动作
function readStringArrayField(value: Record<string, unknown>, keys: string[]): string[] {
  const targets: string[] = [];

  for (const key of keys) {
    const fieldValue = value[key];

    if (!Array.isArray(fieldValue)) {
      continue;
    }

    for (const item of fieldValue) {
      if (typeof item !== "string") {
        continue;
      }

      const normalized = normalizePlanTargetText(item);

      if (normalized) {
        targets.push(normalized);
      }
    }
  }

  return [...new Set(targets)];
}

// 读取模型输出里的工具名, 兼容 Claude Code 和 OpenCode 常见命名
function normalizeStructuredToolHint(tool: string | undefined): StructuredToolHint | null {
  const normalized = tool?.trim().toLowerCase().replace(/[\s_]+/g, "-");

  if (!normalized) {
    return null;
  }

  if (["read", "view", "open"].includes(normalized)) {
    return "read";
  }

  if (["ls", "list", "list-directory", "directory-list"].includes(normalized)) {
    return "list-directory";
  }

  if (["glob", "file-glob"].includes(normalized)) {
    return "glob";
  }

  if (["grep", "search", "text-search"].includes(normalized)) {
    return "grep";
  }

  if (["git", "git-status", "git-diff"].includes(normalized)) {
    return "git-status";
  }

  if (["bash", "shell", "command", "run-command"].includes(normalized)) {
    return "bash";
  }

  if (["edit", "write", "patch", "apply-patch"].includes(normalized)) {
    return "edit";
  }

  return null;
}

// 让工具字段优先决定目标形态, 没有目标时给目录和 Git 检查合理默认值
function normalizeStructuredToolTarget(
  toolHint: StructuredToolHint | null,
  rawTarget: string | undefined,
  fallbackTarget: string | undefined
): string | undefined {
  const target =
    (rawTarget ? normalizePlanTargetText(rawTarget) : "") ||
    (fallbackTarget ? normalizePlanTargetText(fallbackTarget) : "");

  if (toolHint === "list-directory") {
    return target || ".";
  }

  if (toolHint === "git-status") {
    if (target && /^git\s+(?:status|diff)(?:\s|$)/iu.test(target)) {
      return target;
    }

    return "git status --short";
  }

  return target || undefined;
}

// 目标字段必须可执行或可定位, 这里只清理包装字符, 不把普通句子猜成路径
function normalizePlanTargetText(value: string): string {
  return value
    .trim()
    .replace(/^["'`“”‘’]+/u, "")
    .replace(/["'`“”‘’]+$/u, "")
    .replace(/[。；;，,]+$/u, "")
    .trim();
}

// 支持模型常见 kind 别名, 没有可信 kind 时回退到文本推断
function normalizePlanStepKind(
  rawKind: string | undefined,
  fallbackText: string,
  toolHint: StructuredToolHint | null = null
): AgentPlanStepKind {
  const normalized = rawKind?.trim().toLowerCase().replace(/[_\s]+/g, "-");

  if (toolHint === "bash" || toolHint === "git-status") {
    return "verify";
  }

  if (toolHint === "read" || toolHint === "list-directory" || toolHint === "glob" || toolHint === "grep") {
    return "inspect";
  }

  if (toolHint === "edit") {
    return "edit";
  }

  if (normalized === "inspect" || normalized === "read" || normalized === "search") {
    return "inspect";
  }

  if (normalized === "edit" || normalized === "write" || normalized === "modify" || normalized === "create") {
    return "edit";
  }

  if (
    normalized === "verify" ||
    normalized === "run" ||
    normalized === "run-command" ||
    normalized === "test" ||
    normalized === "build"
  ) {
    return "verify";
  }

  if (normalized === "commit" || normalized === "git") {
    return "commit";
  }

  if (normalized === "other" || normalized === "manual") {
    return "other";
  }

  return inferStepKind(fallbackText);
}

// 为步骤生成短标题, UI 队列只展示前几个字
function createStepTitle(description: string): string {
  const withoutTrailingPeriod = description.replace(/[.。]\s*$/, "");
  const sentenceBreak = withoutTrailingPeriod.search(/[。.!?]\s/);
  const title = sentenceBreak > 0 ? withoutTrailingPeriod.slice(0, sentenceBreak + 1) : withoutTrailingPeriod;

  return title.slice(0, 96);
}

// 根据步骤文本推断动作类型, 用于后续执行器分派
function inferStepKind(description: string): AgentPlanStepKind {
  const normalized = description.toLowerCase();

  if (/(inspect|read|review|search|locate|analy[sz]e|查看|阅读|定位|分析|搜索)/.test(normalized)) {
    return "inspect";
  }

  if (/(commit|git commit|提交)/.test(normalized)) {
    return "commit";
  }

  if (/(test|verify|build|lint|typecheck|run|validate|测试|验证|构建|运行|检查)/.test(normalized)) {
    return "verify";
  }

  if (/(modify|edit|change|implement|add|remove|refactor|update|create|write|save|修改|实现|新增|删除|重构|更新|创建|新建|写|写入|保存)/.test(normalized)) {
    return "edit";
  }

  return "other";
}

// 从步骤文本里提取文件路径或命令目标, verify 步骤优先识别未加反引号的命令
function readStepTarget(
  description: string,
  kind: AgentPlanStepKind = inferStepKind(description)
): string | undefined {
  const backtickTarget = /`([^`]+)`/.exec(description)?.[1]?.trim();

  if (backtickTarget) {
    return backtickTarget;
  }

  if (kind === "verify") {
    const commandTarget = readCommandTarget(description);

    if (commandTarget) {
      return commandTarget;
    }
  }

  const pathTarget = /(?:^|\s)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?:\s|$|[.,;:])/u.exec(
    description
  )?.[1];

  if (pathTarget) {
    return pathTarget;
  }

  const fileNameTarget = /(?:^|\s)([^\s`"'“”<>|]+?\.[A-Za-z0-9]{1,12})(?=\s|$|[，。.,;:；：])/u.exec(
    description
  )?.[1];

  return fileNameTarget;
}

// 识别常见本地验证命令, 兼容模型没有用反引号包裹命令的计划文本
function readCommandTarget(description: string): string | undefined {
  const colonCommand = /[:：]\s*([^。；;，,\r\n]+)/u.exec(description)?.[1]?.trim();
  const candidates = [colonCommand, description].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const match =
      /\b((?:npm|pnpm|yarn|bun|npx|node|vitest|tsc|eslint|prettier|git|rg|ls|dir|Get-ChildItem|Get-Content)\b[^。；;，,\r\n]*)/iu.exec(
        candidate
      );
    const command = match?.[1] ? normalizeCommandTarget(match[1]) : undefined;

    if (command) {
      return command;
    }
  }

  return undefined;
}

// 去掉模型附在命令后的自然语言说明, 保留真正要执行的命令文本
function normalizeCommandTarget(value: string): string {
  return value
    .trim()
    .replace(/\s+(?:to|for)\s+.+$/iu, "")
    .replace(/\s+(?:验证|检查|确认|测试|构建|运行|执行).+$/u, "")
    .replace(/[.。；;，,]+$/u, "")
    .trim();
}
