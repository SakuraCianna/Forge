// Keeps recent Agent tool results bounded for follow-up file-change prompts.
import { useCallback, useRef } from "react";

export const maxRecentAgentToolResults = 8;

export type AgentToolResultStore = Map<string, string[]>;

export type AgentToolResults = {
  clearAgentToolResults: () => void;
  getRecentAgentToolResults: (threadId: string) => string[];
  rememberAgentToolResult: (threadId: string, message: string) => void;
};

export function useAgentToolResults(): AgentToolResults {
  const resultStoreRef = useRef<AgentToolResultStore>(new Map());

  const rememberAgentToolResult = useCallback((threadId: string, message: string): void => {
    rememberAgentToolResultMessage(resultStoreRef.current, threadId, message);
  }, []);

  const getRecentAgentToolResults = useCallback((threadId: string): string[] => {
    return getRecentAgentToolResultMessages(resultStoreRef.current, threadId);
  }, []);

  const clearAgentToolResults = useCallback((): void => {
    resultStoreRef.current.clear();
  }, []);

  return {
    clearAgentToolResults,
    getRecentAgentToolResults,
    rememberAgentToolResult
  };
}

export function rememberAgentToolResultMessage(
  store: AgentToolResultStore,
  threadId: string,
  message: string,
  limit = maxRecentAgentToolResults
): void {
  const normalized = message.trim();

  if (!threadId || !normalized || limit <= 0) {
    return;
  }

  const currentMessages = store.get(threadId) ?? [];
  const dedupedMessages = currentMessages.filter((item) => item !== normalized);
  const nextMessages = [...dedupedMessages, normalized].slice(-limit);

  store.set(threadId, nextMessages);
}

export function getRecentAgentToolResultMessages(
  store: AgentToolResultStore,
  threadId: string
): string[] {
  return [...(store.get(threadId) ?? [])];
}
