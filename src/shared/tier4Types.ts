// Feature 21: Multi-Tenant Architecture
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  config: TenantConfig;
  status: 'active' | 'suspended' | 'deprovisioned';
  createdAt: string;
  updatedAt: string;
}

export interface TenantConfig {
  branding?: { primaryColor?: string; logoUrl?: string };
  maxUsers?: number;
  maxProjects?: number;
  features?: string[];
}

export interface TenantUsage {
  tenantId: string;
  userCount: number;
  projectCount: number;
  storageBytes: number;
  apiCallsThisMonth: number;
  capturedAt: string;
}

// Feature 22: Real-Time Collaboration
export interface PresenceInfo {
  userId: string;
  displayName: string;
  projectId: string;
  dimensionId: string | null;
  activeAt: string;
  cursorPosition: { memberKey?: string; field?: string } | null;
}

export interface CollaborationComment {
  id: string;
  projectId: string;
  dimensionId: string;
  memberKey: string | null;
  content: string;
  authorId: string;
  authorName: string;
  mentions: string[];
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Feature 23: Audit & Compliance
export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  projectId: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  ipAddress: string | null;
  timestamp: string;
}

export interface RetentionPolicy {
  id: string;
  tenantId: string | null;
  entityType: string;
  retentionDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface ComplianceReport {
  tenantId: string;
  generatedAt: string;
  segregationOfDuties: { violations: Array<{ userId: string; action: string; conflictingAction: string }> };
  auditCompleteness: { totalActions: number; loggedActions: number; coverage: number };
  retentionStatus: { policiesActive: number; oldestEntry: string | null };
}

// Feature 24: Performance & Scale
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    cursor: string | null;
  };
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
}

export interface PerformanceMetrics {
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  requestsPerMinute: number;
  cacheHitRate: number;
  activeConnections: number;
  memoryUsageMb: number;
}

export interface BackgroundJob {
  id: string;
  type: 'import' | 'export' | 'validation' | 'migration';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}
