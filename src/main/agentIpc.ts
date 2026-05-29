import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import { agentChannels } from "../shared/ipcChannels.js";

type AgentPlanGenerator = (request: GenerateAgentPlanRequest) => Promise<AgentPlanResult>;

type AgentFileChangeGenerator = (
  request: GenerateAgentFileChangeRequest
) => Promise<AgentFileChangeResult>;

type AgentAskGenerator = (request: GenerateAgentAskRequest) => Promise<AgentAskResult>;

type AgentAskStreamer = (
  request: GenerateAgentAskRequest,
  onDelta: (delta: string) => void
) => Promise<AgentAskResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { agentChannels };

export function registerAgentHandlers(
  generatePlan: AgentPlanGenerator,
  generateFileChange: AgentFileChangeGenerator,
  generateAsk: AgentAskGenerator,
  registerHandler: RegisterHandler,
  generateAskStream?: AgentAskStreamer
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
    registerHandler(agentChannels.generateAskStream, async (event, requestId, request) => {
      const normalizedRequestId = assertRequestId(requestId);
      const normalizedRequest = assertGenerateAgentAskRequest(request);

      try {
        const result = await generateAskStream(normalizedRequest, (delta) => {
          sendAskStreamChunk(event, {
            requestId: normalizedRequestId,
            type: "delta",
            delta
          });
        });

        sendAskStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "done",
          result
        });

        return result;
      } catch (error) {
        sendAskStreamChunk(event, {
          requestId: normalizedRequestId,
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    });
  }
}

function assertGenerateAgentPlanRequest(value: unknown): GenerateAgentPlanRequest {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.model)) {
    throw new Error("Invalid agent plan request");
  }

  if (typeof value.taskPrompt !== "string" || !isRecord(value.projectScan)) {
    throw new Error("Invalid agent plan request");
  }

  return value as GenerateAgentPlanRequest;
}

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

function assertGenerateAgentAskRequest(value: unknown): GenerateAgentAskRequest {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.model)) {
    throw new Error("Invalid agent ask request");
  }

  if (typeof value.prompt !== "string") {
    throw new Error("Invalid agent ask request");
  }

  return value as GenerateAgentAskRequest;
}

function assertRequestId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid agent ask stream request id");
  }

  return value;
}

function sendAskStreamChunk(event: unknown, chunk: AgentAskStreamChunk): void {
  if (!isRecord(event) || !isRecord(event.sender) || typeof event.sender.send !== "function") {
    return;
  }

  event.sender.send(agentChannels.askStreamChunk, chunk);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
