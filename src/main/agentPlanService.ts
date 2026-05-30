// 本文件说明: 调用模型生成 Agent 计划, 文件变更和流式问答
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
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "Agent 计划", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(formatEmptyProviderResult(provider.label, "Agent 计划"));
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
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "文件修改", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const nextContent = stripMarkdownCodeFence(extractGeneratedText(provider.kind, body));
  const usage = extractTokenUsage(provider.kind, body);

  if (!nextContent.trim()) {
    throw new Error(formatEmptyProviderResult(provider.label, "文件修改内容"));
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
    instructions: createAskInstructions(request.personalization),
    input: createAskInput(request),
    intelligence: request.intelligence,
    speed: request.speed
  });
  const response = await fetcher(generationRequest.url, generationRequest.init);

  if (!response.ok) {
    throw new Error(
      formatProviderHttpError(provider.label, "问答", response.status, response.statusText)
    );
  }

  const body = await readJsonBody(provider.label, response);
  const text = extractGeneratedText(provider.kind, body).trim();
  const usage = extractTokenUsage(provider.kind, body);

  if (!text) {
    throw new Error(formatEmptyProviderResult(provider.label, "问答内容"));
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
      formatProviderHttpError(provider.label, "问答", response.status, response.statusText)
    );
  }

  if (!isEventStreamResponse(response)) {
    const body = await readJsonBody(provider.label, response);
    const text = extractGeneratedText(provider.kind, body).trim();
    const usage = extractTokenUsage(provider.kind, body);

    if (!text) {
      throw new Error(formatEmptyProviderResult(provider.label, "问答内容"));
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
        formatProviderHttpError(
          provider.label,
          "问答续写",
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
  }

  if (!text.trim()) {
    throw new Error(formatEmptyProviderResult(provider.label, "问答内容"));
  }

  return {
    providerId: provider.id,
    modelId: request.model.id,
    text,
    createdAt: now()
  };
}

// 构造计划模式系统提示, 强调少量明确动作和验证
function createAgentPlanInstructions(personalization?: string): string {
  return appendPersonalization([
    "You are Forge, an open-source local AI coding agent.",
    "Generate a concise execution plan for the user's local project.",
    "Prefer a numbered list of concrete steps. Mention target files or commands in backticks when known.",
    "If the user asks to create, write, or save a named file, include an edit step targeting that exact file path in backticks.",
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

// 把用户个性化提示拼到系统提示末尾, 空值直接跳过
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
      throw new Error(formatHtmlInsteadOfJson(providerLabel, "提供商接口兼容性"));
    }

    throw new Error(formatInvalidJson(providerLabel, "提供商接口兼容性"));
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

  if (streamResult.text || streamResult.truncated) {
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

// 读取单行 SSE 事件里的文本增量
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

// 按字节读取响应体, 处理跨 chunk 的 SSE 行
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

// 把文件内容和任务要求整理成单文件修改输入
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

// 把历史对话, 项目信息和记忆整理成普通问答输入
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

// 把 Agent 配置转成模型可读约束, 控制权限和工具边界
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

  if (/(test|verify|build|lint|typecheck|run|validate|测试|验证|构建|运行|检查)/.test(normalized)) {
    return "verify";
  }

  if (/(modify|edit|change|implement|add|remove|refactor|update|create|write|save|修改|实现|新增|删除|重构|更新|创建|新建|写|写入|保存)/.test(normalized)) {
    return "edit";
  }

  if (/(commit|git|提交)/.test(normalized)) {
    return "commit";
  }

  return "other";
}

// 从步骤文本里提取文件路径或命令目标
function readStepTarget(description: string): string | undefined {
  const backtickTarget = /`([^`]+)`/.exec(description)?.[1]?.trim();

  if (backtickTarget) {
    return backtickTarget;
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
