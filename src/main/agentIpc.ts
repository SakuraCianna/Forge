// 本文件说明: 注册 Agent 相关 IPC, 统一校验请求并转发流式片段
import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanStreamChunk,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import { agentChannels } from "../shared/ipcChannels.js";

type AgentPlanGenerator = (request: GenerateAgentPlanRequest) => Promise<AgentPlanResult>;

type AgentPlanStreamer = (
  request: GenerateAgentPlanRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
) => Promise<AgentPlanResult>;

type AgentFileChangeGenerator = (
  request: GenerateAgentFileChangeRequest
) => Promise<AgentFileChangeResult>;

type AgentAskGenerator = (request: GenerateAgentAskRequest) => Promise<AgentAskResult>;

type AgentAskStreamer = (
  request: GenerateAgentAskRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
) => Promise<AgentAskResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { agentChannels };

// 注册计划, 文件修改, 问答和取消流式回答的主进程处理器
export function registerAgentHandlers(
  generatePlan: AgentPlanGenerator,
  generateFileChange: AgentFileChangeGenerator,
  generateAsk: AgentAskGenerator,
  registerHandler: RegisterHandler,
  generateAskStream?: AgentAskStreamer,
  generatePlanStream?: AgentPlanStreamer
): void {
  registerHandler(agentChannels.generatePlan, async (_event, request) =>
    generatePlan(assertGenerateAgentPlanRequest(request))
  );
  registerHandler(agentChannels.generateFileChange, async (_event, request) =>
    generateFileChange(assertGenerateAgentFileChangeRequest(request))
  );
  registerHandler(agentChannels.generateAsk, async (_event, request) =>
    generateAsk(assertGenerateAgentAskRequest(request))
  );

  if (generateAskStream) {
    const activeAskStreams = new Map<string, AbortController>();

    registerHandler(agentChannels.generateAskStream, async (event, requestId, request) => {
      const normalizedRequestId = assertRequestId(requestId);
      const normalizedRequest = assertGenerateAgentAskRequest(request);
      const controller = new AbortController();

      activeAskStreams.set(normalizedRequestId, controller);

      try {
        const result = await generateAskStream(normalizedRequest, (delta) => {
          sendAskStreamChunk(event, {
            requestId: normalizedRequestId,
            type: "delta",
            delta
          });
        }, controller.signal);

        sendAskStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "done",
          result
        });

        return result;
      } catch (error) {
        if (isAgentStreamCancellation(error, "Agent ask stream cancelled")) {
          const result = createCancelledAskResult(normalizedRequest);
          sendAskStreamChunk(event, {
            requestId: normalizedRequestId,
            type: "done",
            result
          });
          return result;
        }

        sendAskStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      } finally {
        activeAskStreams.delete(normalizedRequestId);
      }
    });

    registerHandler(agentChannels.cancelAskStream, async (_event, requestId) => {
      const normalizedRequestId = assertRequestId(requestId);
      const controller = activeAskStreams.get(normalizedRequestId);

      if (!controller) {
        return { ok: false, requestId: normalizedRequestId };
      }

      controller.abort(new Error("Agent ask stream cancelled"));

      return { ok: true, requestId: normalizedRequestId };
    });
  }

  if (generatePlanStream) {
    const activePlanStreams = new Map<string, AbortController>();

    registerHandler(agentChannels.generatePlanStream, async (event, requestId, request) => {
      const normalizedRequestId = assertRequestId(requestId);
      const normalizedRequest = assertGenerateAgentPlanRequest(request);
      const controller = new AbortController();

      activePlanStreams.set(normalizedRequestId, controller);

      try {
        const result = await generatePlanStream(normalizedRequest, (delta) => {
          sendPlanStreamChunk(event, {
            requestId: normalizedRequestId,
            type: "delta",
            delta
          });
        }, controller.signal);

        sendPlanStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "done",
          result
        });

        return result;
      } catch (error) {
        if (isAgentStreamCancellation(error, "Agent plan stream cancelled")) {
          const result = createCancelledPlanResult(normalizedRequest);
          sendPlanStreamChunk(event, {
            requestId: normalizedRequestId,
            type: "done",
            result
          });
          return result;
        }

        sendPlanStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      } finally {
        activePlanStreams.delete(normalizedRequestId);
      }
    });

    registerHandler(agentChannels.cancelPlanStream, async (_event, requestId) => {
      const normalizedRequestId = assertRequestId(requestId);
      const controller = activePlanStreams.get(normalizedRequestId);

      if (!controller) {
        return { ok: false, requestId: normalizedRequestId };
      }

      controller.abort(new Error("Agent plan stream cancelled"));

      return { ok: true, requestId: normalizedRequestId };
    });
  }
}

// 校验生成计划请求的最小结构, 防止渲染层传入脏数据
function assertGenerateAgentPlanRequest(value: unknown): GenerateAgentPlanRequest {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.model)) {
    throw new Error("Invalid agent plan request");
  }

  if (typeof value.taskPrompt !== "string" || !isRecord(value.projectScan)) {
    throw new Error("Invalid agent plan request");
  }

  return value as GenerateAgentPlanRequest;
}

// 校验文件修改请求, 确保模型只拿到明确的项目文件内容
function assertGenerateAgentFileChangeRequest(value: unknown): GenerateAgentFileChangeRequest {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.model)) {
    throw new Error("Invalid agent file change request");
  }

  if (
    typeof value.taskPrompt !== "string" ||
    typeof value.relativePath !== "string" ||
    typeof value.currentContent !== "string"
  ) {
    throw new Error("Invalid agent file change request");
  }

  return value as GenerateAgentFileChangeRequest;
}

// 校验问答请求, conversation 必须保持数组结构才能拼接上下文
function assertGenerateAgentAskRequest(value: unknown): GenerateAgentAskRequest {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.model)) {
    throw new Error("Invalid agent ask request");
  }

  if (typeof value.prompt !== "string") {
    throw new Error("Invalid agent ask request");
  }

  return value as GenerateAgentAskRequest;
}

// 校验流式请求 id, 取消和分片事件都依赖这个稳定标识
function assertRequestId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid agent stream request ID");
  }

  return value;
}

function isAgentStreamCancellation(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}

function createCancelledAskResult(request: GenerateAgentAskRequest): AgentAskResult {
  return {
    providerId: request.provider.id,
    modelId: request.model.id,
    text: "",
    createdAt: new Date().toISOString()
  };
}

function createCancelledPlanResult(request: GenerateAgentPlanRequest): AgentPlanResult {
  return {
    providerId: request.provider.id,
    modelId: request.model.id,
    text: "",
    steps: [],
    createdAt: new Date().toISOString()
  };
}

// 把回答分片发回原窗口, 窗口已关闭时直接忽略
function sendAskStreamChunk(event: unknown, chunk: AgentAskStreamChunk): void {
  if (!isRecord(event) || !isRecord(event.sender) || typeof event.sender.send !== "function") {
    return;
  }

  event.sender.send(agentChannels.askStreamChunk, chunk);
}

function sendPlanStreamChunk(event: unknown, chunk: AgentPlanStreamChunk): void {
  if (!isRecord(event) || !isRecord(event.sender) || typeof event.sender.send !== "function") {
    return;
  }

  event.sender.send(agentChannels.planStreamChunk, chunk);
}

// 将 unknown 缩窄成对象后再读取 IPC 请求字段
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
