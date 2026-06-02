// Manages paused Agent threads and reserved auto-run actions.
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { AgentAction } from "@shared/agentExecutionPlan";

export type AgentRunState = {
  cancelledThreadIdsRef: MutableRefObject<Set<string>>;
  clearPausedAgentThread: (threadId: string) => void;
  clearPausedAgentThreads: () => void;
  clearReservedAgentActions: () => void;
  hasReservedAgentAction: (threadId: string, actions: AgentAction[]) => boolean;
  markThreadCancelled: (threadId: string) => void;
  pauseAgentThread: (threadId: string) => void;
  pausedThreadIds: ReadonlySet<string>;
  reserveAgentActionBatch: (threadId: string, actions: AgentAction[]) => () => void;
};

export function useAgentRunState(): AgentRunState {
  const [pausedThreadIds, setPausedThreadIds] = useState<Set<string>>(() => new Set());
  const cancelledThreadIdsRef = useRef<Set<string>>(new Set());
  const activeAgentAutoRunActionIdsRef = useRef<Map<string, Set<string>>>(new Map());

  const markThreadCancelled = useCallback((threadId: string): void => {
    cancelledThreadIdsRef.current.add(threadId);
  }, []);

  const pauseAgentThread = useCallback((threadId: string): void => {
    cancelledThreadIdsRef.current.add(threadId);
    setPausedThreadIds((current) => {
      if (current.has(threadId)) {
        return current;
      }

      const next = new Set(current);
      next.add(threadId);
      return next;
    });
  }, []);

  const clearPausedAgentThread = useCallback((threadId: string): void => {
    cancelledThreadIdsRef.current.delete(threadId);
    setPausedThreadIds((current) => {
      if (!current.has(threadId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(threadId);
      return next;
    });
  }, []);

  const clearPausedAgentThreads = useCallback((): void => {
    cancelledThreadIdsRef.current.clear();
    setPausedThreadIds(new Set());
  }, []);

  const hasReservedAgentAction = useCallback((threadId: string, actions: AgentAction[]): boolean => {
    const reservedActionIds = activeAgentAutoRunActionIdsRef.current.get(threadId);

    return Boolean(reservedActionIds && actions.some((action) => reservedActionIds.has(action.id)));
  }, []);

  const reserveAgentActionBatch = useCallback((threadId: string, actions: AgentAction[]): (() => void) => {
    const reservedActionIds =
      activeAgentAutoRunActionIdsRef.current.get(threadId) ?? new Set<string>();

    for (const action of actions) {
      reservedActionIds.add(action.id);
    }

    activeAgentAutoRunActionIdsRef.current.set(threadId, reservedActionIds);

    return () => {
      const currentReservedActionIds = activeAgentAutoRunActionIdsRef.current.get(threadId);

      if (!currentReservedActionIds) {
        return;
      }

      for (const action of actions) {
        currentReservedActionIds.delete(action.id);
      }

      if (currentReservedActionIds.size === 0) {
        activeAgentAutoRunActionIdsRef.current.delete(threadId);
      }
    };
  }, []);

  const clearReservedAgentActions = useCallback((): void => {
    activeAgentAutoRunActionIdsRef.current.clear();
  }, []);

  return {
    cancelledThreadIdsRef,
    clearPausedAgentThread,
    clearPausedAgentThreads,
    clearReservedAgentActions,
    hasReservedAgentAction,
    markThreadCancelled,
    pauseAgentThread,
    pausedThreadIds,
    reserveAgentActionBatch
  };
}
