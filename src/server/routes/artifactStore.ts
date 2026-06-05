import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectArtifactType,
  scanArtifactReferences,
  type ArtifactReference,
  type ArtifactType
} from "../../shared/artifactReferenceScanner";

export interface StoredArtifact {
  id: string;
  projectId: string;
  name: string;
  artifactType: ArtifactType;
  originalFileName: string;
  contentHash: string;
  uploadedBy: string;
  uploadedAt: string;
  scanStatus: "unscanned" | "scanned";
  scannedAt: string | null;
  referenceCount: number;
}

interface ArtifactIndexEntry extends StoredArtifact {
  references: ArtifactReference[];
}

interface ArtifactIndex {
  artifacts: ArtifactIndexEntry[];
}

/**
 * File-based persistence for uploaded OneStream artifacts and their scanned references.
 * Stored under <exportsDirectory>/artifacts/<projectId>/ to avoid schema changes; the content of
 * each artifact is written separately so the index stays small.
 */
export class ArtifactStore {
  constructor(private readonly exportsDirectory: string) {}

  private projectDir(projectId: string): string {
    return join(this.exportsDirectory, "artifacts", projectId);
  }

  private indexPath(projectId: string): string {
    return join(this.projectDir(projectId), "index.json");
  }

  private contentPath(projectId: string, artifactId: string): string {
    return join(this.projectDir(projectId), `${artifactId}.content.txt`);
  }

  private readIndex(projectId: string): ArtifactIndex {
    const path = this.indexPath(projectId);
    if (!existsSync(path)) return { artifacts: [] };
    try {
      return JSON.parse(readFileSync(path, "utf8")) as ArtifactIndex;
    } catch {
      return { artifacts: [] };
    }
  }

  private writeIndex(projectId: string, index: ArtifactIndex): void {
    mkdirSync(this.projectDir(projectId), { recursive: true });
    writeFileSync(this.indexPath(projectId), JSON.stringify(index, null, 2));
  }

  upload(projectId: string, input: { name: string; fileName: string; content: string; artifactType?: ArtifactType; uploadedBy?: string }): StoredArtifact {
    const id = `artifact-${createHash("sha1").update(`${projectId}:${input.fileName}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16)}`;
    const contentHash = createHash("sha256").update(input.content).digest("hex");
    const now = new Date().toISOString();
    const artifact: ArtifactIndexEntry = {
      id,
      projectId,
      name: input.name || input.fileName,
      artifactType: input.artifactType ?? detectArtifactType(input.fileName),
      originalFileName: input.fileName,
      contentHash,
      uploadedBy: input.uploadedBy ?? "local-admin",
      uploadedAt: now,
      scanStatus: "unscanned",
      scannedAt: null,
      referenceCount: 0,
      references: []
    };
    mkdirSync(this.projectDir(projectId), { recursive: true });
    writeFileSync(this.contentPath(projectId, id), input.content);
    const index = this.readIndex(projectId);
    index.artifacts.push(artifact);
    this.writeIndex(projectId, index);
    return toMetadata(artifact);
  }

  list(projectId: string): StoredArtifact[] {
    return this.readIndex(projectId).artifacts.map(toMetadata);
  }

  get(projectId: string, artifactId: string): ArtifactIndexEntry | null {
    return this.readIndex(projectId).artifacts.find((a) => a.id === artifactId) ?? null;
  }

  scan(projectId: string, artifactId: string, knownMembers?: Array<{ dimensionType: string; memberKey: string }>): { artifact: StoredArtifact; references: ArtifactReference[] } | null {
    const index = this.readIndex(projectId);
    const entry = index.artifacts.find((a) => a.id === artifactId);
    if (!entry) return null;
    const contentPath = this.contentPath(projectId, artifactId);
    if (!existsSync(contentPath)) return null;
    const content = readFileSync(contentPath, "utf8");
    const references = scanArtifactReferences(content, { knownMembers });
    entry.references = references;
    entry.referenceCount = references.length;
    entry.scanStatus = "scanned";
    entry.scannedAt = new Date().toISOString();
    this.writeIndex(projectId, index);
    return { artifact: toMetadata(entry), references };
  }

  /** All scanned artifacts with their references, for where-used aggregation. */
  scannedArtifacts(projectId: string): Array<{ artifactId: string; artifactName: string; references: ArtifactReference[] }> {
    return this.readIndex(projectId)
      .artifacts
      .filter((a) => a.scanStatus === "scanned")
      .map((a) => ({ artifactId: a.id, artifactName: a.name, references: a.references }));
  }
}

function toMetadata(entry: ArtifactIndexEntry): StoredArtifact {
  const { references: _references, ...metadata } = entry;
  void _references;
  return metadata;
}
