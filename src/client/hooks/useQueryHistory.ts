import { useCallback, useEffect, useState, useMemo } from "react";
import type { NLQueryResult } from "../../shared/aiTypes";

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: NLQueryResult;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: QueryMessage[];
}

const STORAGE_KEY = "dimbuilder:query-sessions";

function readStorage(): Record<string, ChatSession[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ChatSession[]>) : {};
  } catch {
    return {};
  }
}

function writeStorage(projectId: string, sessions: ChatSession[]): void {
  try {
    const all = readStorage();
    all[projectId] = sessions;
    const json = JSON.stringify(all);
    localStorage.setItem(STORAGE_KEY, json);
    sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore quota/security errors
  }
}

export function useQueryHistory(projectId: string | null) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  // Load sessions from storage when projectId changes
  useEffect(() => {
    if (!projectId) {
      setSessions([]);
      setActiveSessionId("");
      return;
    }

    const all = readStorage();
    let projSessions = all[projectId] ?? [];

    if (projSessions.length === 0) {
      const initialSession: ChatSession = {
        id: Date.now().toString(),
        title: "New Chat Session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      };
      projSessions = [initialSession];
      writeStorage(projectId, projSessions);
    }

    setSessions(projSessions);
    setActiveSessionId(projSessions[0].id);
  }, [projectId]);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const messages = useMemo(() => {
    return activeSession ? activeSession.messages : [];
  }, [activeSession]);

  const setMessages = useCallback((
    value: QueryMessage[] | ((previous: QueryMessage[]) => QueryMessage[])
  ) => {
    if (!projectId) return;

    setSessions(prevSessions => {
      if (prevSessions.length === 0) return prevSessions;

      const currentActiveId = activeSessionId || prevSessions[0].id;
      const targetSessionIndex = prevSessions.findIndex(s => s.id === currentActiveId);
      if (targetSessionIndex === -1) return prevSessions;

      const targetSession = prevSessions[targetSessionIndex];
      const nextMessages = typeof value === "function" ? value(targetSession.messages) : value;

      // Update title based on first user query if still generic
      let updatedTitle = targetSession.title;
      if (targetSession.title === "New Chat Session") {
        const firstUserMsg = nextMessages.find(m => m.role === "user");
        if (firstUserMsg) {
          updatedTitle = firstUserMsg.content.length > 38
            ? firstUserMsg.content.slice(0, 35) + "..."
            : firstUserMsg.content;
        }
      }

      const updatedSession: ChatSession = {
        ...targetSession,
        title: updatedTitle,
        updatedAt: new Date().toISOString(),
        messages: nextMessages
      };

      const nextSessions = [...prevSessions];
      nextSessions[targetSessionIndex] = updatedSession;

      // Sort sessions with most recently updated first
      nextSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      writeStorage(projectId, nextSessions);
      return nextSessions;
    });
  }, [projectId, activeSessionId]);

  const createNewSession = useCallback(() => {
    if (!projectId) return;

    // Check if active session is already empty
    const currentActive = sessions.find(s => s.id === activeSessionId);
    if (currentActive && currentActive.messages.length === 0) {
      return; // Already in a fresh empty session
    }

    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };

    setSessions(prev => {
      const next = [newSession, ...prev];
      writeStorage(projectId, next);
      return next;
    });

    setActiveSessionId(newSession.id);
  }, [projectId, sessions, activeSessionId]);

  const selectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    if (!projectId) return;

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      let nextSessions = filtered;

      if (nextSessions.length === 0) {
        const fresh: ChatSession = {
          id: Date.now().toString(),
          title: "New Chat Session",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: []
        };
        nextSessions = [fresh];
      }

      writeStorage(projectId, nextSessions);

      if (activeSessionId === sessionId) {
        setActiveSessionId(nextSessions[0].id);
      }

      return nextSessions;
    });
  }, [projectId, activeSessionId]);

  const clearAllSessions = useCallback(() => {
    if (!projectId) return;

    const freshSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };

    const nextSessions = [freshSession];
    writeStorage(projectId, nextSessions);
    setSessions(nextSessions);
    setActiveSessionId(freshSession.id);
  }, [projectId]);

  return {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    createNewSession,
    selectSession,
    deleteSession,
    clearAllSessions
  };
}

