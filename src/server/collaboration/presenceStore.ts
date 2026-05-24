/**
 * In-memory presence store for real-time collaboration.
 * Users heartbeat their presence; entries expire after a timeout.
 * No WebSocket needed — clients poll GET /presence every 5-10 seconds.
 */

export interface PresenceEntry {
  userId: string;
  userName: string;
  projectId: string;
  dimensionId?: string;
  memberKey?: string;
  cursor?: { line?: number; field?: string };
  lastSeenAt: number; // epoch ms
}

export interface PresenceStore {
  heartbeat(entry: Omit<PresenceEntry, 'lastSeenAt'>): void;
  leave(userId: string, projectId: string): void;
  getProjectPresence(projectId: string): PresenceEntry[];
  cleanup(): void;
}

const PRESENCE_TIMEOUT_MS = 30000; // 30 seconds — if no heartbeat, considered gone

export function createPresenceStore(): PresenceStore {
  // Map key: `${userId}:${projectId}`
  const store = new Map<string, PresenceEntry>();

  function heartbeat(entry: Omit<PresenceEntry, 'lastSeenAt'>): void {
    const key = `${entry.userId}:${entry.projectId}`;
    store.set(key, { ...entry, lastSeenAt: Date.now() });
  }

  function leave(userId: string, projectId: string): void {
    store.delete(`${userId}:${projectId}`);
  }

  function getProjectPresence(projectId: string): PresenceEntry[] {
    const now = Date.now();
    const result: PresenceEntry[] = [];
    for (const [key, entry] of store) {
      if (entry.projectId === projectId) {
        if (now - entry.lastSeenAt < PRESENCE_TIMEOUT_MS) {
          result.push(entry);
        } else {
          store.delete(key); // expired
        }
      }
    }
    return result;
  }

  function cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.lastSeenAt >= PRESENCE_TIMEOUT_MS) {
        store.delete(key);
      }
    }
  }

  return { heartbeat, leave, getProjectPresence, cleanup };
}
