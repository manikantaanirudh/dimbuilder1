export type VcsBranchStatus = 'active' | 'merged' | 'deleted';

export interface VcsCommit {
  id: string;
  projectId: string;
  branchId: string;
  message: string;
  snapshotData: Record<string, unknown>;
  parentCommitId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface VcsBranch {
  id: string;
  projectId: string;
  name: string;
  status: VcsBranchStatus;
  headCommitId: string | null;
  baseBranchId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface VcsTag {
  id: string;
  projectId: string;
  name: string;
  commitId: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface VcsDiffEntry {
  path: string;
  changeType: 'added' | 'modified' | 'deleted';
  oldValue?: unknown;
  newValue?: unknown;
}

export interface VcsDiff {
  fromCommitId: string;
  toCommitId: string;
  entries: VcsDiffEntry[];
  summary: { added: number; modified: number; deleted: number };
}

export interface VcsMergeResult {
  success: boolean;
  commitId: string | null;
  conflicts: VcsMergeConflict[];
}

export interface VcsMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
  baseValue: unknown;
}

export interface VcsHistory {
  commits: VcsCommit[];
  branches: VcsBranch[];
  tags: VcsTag[];
}

export interface ProjectSnapshot {
  project: { name: string; description: string };
  dimensions: Array<{
    dimensionType: string;
    dimensionName: string;
    members: Array<{ memberKey: string; description: string; properties: Record<string, unknown> }>;
    relationships: Array<{ parentKey: string; childKey: string; aggregationWeight?: number | null }>;
  }>;
}
