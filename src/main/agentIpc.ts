import type { AgentPlanResult, GenerateAgentPlanRequest } from "../shared/agentTypes.js";
import { agentChannels } from "../shared/ipcChannels.js";

type AgentPlanGenerator = (request: GenerateAgentPlanRequest) => Promise<AgentPlanResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { agentChannels };

export function registerAgentHandlers(
  generatePlan: AgentPlanGenerator,
  registerHandler: RegisterHandler
): void {
  registerHandler(agentChannels.generatePlan, async (_event, request) =>
    generatePlan(assertGenerateAgentPlanRequest(request))
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
