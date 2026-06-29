import { useCallback, useEffect, useState } from "react";
import type { NLQueryResult } from "../../shared/aiTypes";

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: NLQueryResult;
  timestamp: string;
}

const STORAGE_KEY = "dimbuilder:query-history";
const MAX_MESSAGES_PER_PROJECT = 100;

const memoryCache = new Map<string, QueryMessage[]>();

function readStorage(): Record<string, QueryMessage[]> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, QueryMessage[]> : {};
  } catch {
    return {};
  }
}

function writeStorage(projectId: string, messages: QueryMessage[]): void {
  try {
    const all = readStorage();
    all[projectId] = messages;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // sessionStorage may be unavailable; in-memory cache still works for the session.
  }
}

function loadMessages(projectId: string): QueryMessage[] {
  if (memoryCache.has(projectId)) {
    return memoryCache.get(projectId)!;
  }
  const stored = readStorage()[projectId];
  const messages = stored ?? [];
  memoryCache.set(projectId, messages);
  return messages;
}

function persistMessages(projectId: string, messages: QueryMessage[]): void {
  const trimmed = messages.length > MAX_MESSAGES_PER_PROJECT
    ? messages.slice(-MAX_MESSAGES_PER_PROJECT)
    : messages;
  memoryCache.set(projectId, trimmed);
  writeStorage(projectId, trimmed);
}

export function useQueryHistory(projectId: string | null) {
  const [messages, setMessagesState] = useState<QueryMessage[]>([]);

  useEffect(() => {
    if (!projectId) {
      setMessagesState([]);
      return;
    }
    setMessagesState(loadMessages(projectId));
  }, [projectId]);

  const setMessages = useCallback((
    value: QueryMessage[] | ((previous: QueryMessage[]) => QueryMessage[])
  ) => {
    setMessagesState((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      if (projectId) persistMessages(projectId, next);
      return next;
    });
  }, [projectId]);

  const clearHistory = useCallback(() => {
    if (!projectId) return;
    memoryCache.delete(projectId);
    try {
      const all = readStorage();
      delete all[projectId];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    setMessagesState([]);
  }, [projectId]);

  return { messages, setMessages, clearHistory };
}
