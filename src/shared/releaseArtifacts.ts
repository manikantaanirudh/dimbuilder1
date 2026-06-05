import type {
  ChangeSetDetail,
  ChangeSetItemRecord,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord
} from "./types";
import { exportProjectXml, type ExportProjectXmlOptions } from "./xmlExport";

export type ReleaseXmlMode =
  | "full"
  | "incremental"
  | "addOnly"
  | "updateOnly"
  | "relationshipOperations"
  | "rollback";

export interface ReleaseArtifactSnapshot {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export interface ReleaseXmlArtifact {
  fileName: string;
  content: string;
  kind: "full" | "incremental" | "rollback" | "instructions";
  description: string;
}

export interface RollbackArtifact {
  /** True when a reversible rollback.xml was generated. */
  generated: boolean;
  /** True when at least one operation cannot be represented as automatic rollback XML. */
  requiresManualReview: boolean;
  instructionsMarkdown: string;
}

export interface ReleaseArtifactsResult {
  mode: ReleaseXmlMode;
  artifacts: ReleaseXmlArtifact[];
  rollback: RollbackArtifact;
  /** File names actually generated (for a truthful manifest). */
  fileNames: string[];
  warnings: string[];
}

const ALL_MODES: ReleaseXmlMode[] = [
  "full",
  "incremental",
  "addOnly",
  "updateOnly",
  "relationshipOperations",
  "rollback"
];

export function isReleaseXmlMode(value: unknown): value is ReleaseXmlMode {
  return typeof value === "string" && (ALL_MODES as string[]).includes(value);
}

/**
 * Build mode-specific release XML artifacts plus rollback output from a change set.
 *
 * - full: complete current metadata.
 * - addOnly: members/relationships added by the change set.
 * - updateOnly: members whose properties were updated (current values).
 * - relationshipOperations: relationship add/move/copy/delete operations.
 * - incremental: adds + updates + relationship operations.
 * - rollback: reversible rollback.xml when all changes are property updates; otherwise
 *   rollback-instructions.md flags that manual review is required.
 *
 * Filtered XML is produced by exporting a snapshot subset through the existing XML renderer.
 */
export function buildReleaseArtifacts(
  detail: ChangeSetDetail,
  snapshot: ReleaseArtifactSnapshot,
  mode: ReleaseXmlMode,
  exportOptions: ExportProjectXmlOptions = {}
): ReleaseArtifactsResult {
  const warnings: string[] = [];
  const artifacts: ReleaseXmlArtifact[] = [];
  const options: ExportProjectXmlOptions = { prettyPrint: true, ...exportOptions };

  const dimensionsByType = new Map<string, DimensionRecord>();
  for (const dimension of snapshot.dimensions) {
    if (!dimensionsByType.has(dimension.dimensionType)) dimensionsByType.set(dimension.dimensionType, dimension);
  }
  const membersByKey = new Map<string, DimensionMemberRecord>();
  const dimensionById = new Map(snapshot.dimensions.map((d) => [d.id, d]));
  for (const member of snapshot.members) {
    const dim = dimensionById.get(member.dimensionId);
    if (!dim) continue;
    membersByKey.set(memberLookup(dim.dimensionType, member.memberKey), member);
  }
  const relationshipsByKey = new Map<string, DimensionRelationshipRecord>();
  for (const relationship of snapshot.relationships) {
    const dim = dimensionById.get(relationship.dimensionId);
    if (!dim) continue;
    relationshipsByKey.set(relLookup(dim.dimensionType, relationship.parentKey, relationship.childKey), relationship);
  }

  const items = detail.items;
  const addedMembers = collectMembers(items, "add", membersByKey);
  const updatedMembers = collectUpdatedMembers(items, membersByKey);
  const relationshipItems = items.filter((i) => i.itemType === "relationship");

  // full
  const fullXml = exportProjectXml(snapshot, options);
  artifacts.push({ fileName: "metadata-full.xml", content: fullXml, kind: "full", description: "Complete current metadata." });

  // addOnly
  if (mode === "addOnly" || mode === "incremental") {
    if (addedMembers.length > 0) {
      artifacts.push({
        fileName: "metadata-adds.xml",
        content: exportSubset(snapshot, addedMembers, [], options),
        kind: "incremental",
        description: "Members added by this change set."
      });
    } else {
      warnings.push("No added members found; metadata-adds.xml was not generated.");
    }
  }

  // updateOnly
  if (mode === "updateOnly" || mode === "incremental") {
    if (updatedMembers.length > 0) {
      artifacts.push({
        fileName: "metadata-updates.xml",
        content: exportSubset(snapshot, updatedMembers, [], options),
        kind: "incremental",
        description: "Members whose properties were updated (current values)."
      });
    } else {
      warnings.push("No updated members found; metadata-updates.xml was not generated.");
    }
  }

  // relationshipOperations
  if (mode === "relationshipOperations" || mode === "incremental") {
    const affectedRelationships = collectRelationships(relationshipItems, relationshipsByKey);
    if (affectedRelationships.length > 0) {
      artifacts.push({
        fileName: "relationship-operations.xml",
        content: exportSubset(snapshot, [], affectedRelationships, options),
        kind: "incremental",
        description: "Relationship add/move/copy operations present in the current model."
      });
    } else if (relationshipItems.length > 0) {
      warnings.push("Relationship operations include deletes/breaks that are not present in the current model; see rollback-instructions.md.");
    }
  }

  // rollback
  const rollback = buildRollback(detail, snapshot, membersByKey, options);
  if (rollback.rollbackXml) {
    artifacts.push({
      fileName: "rollback.xml",
      content: rollback.rollbackXml,
      kind: "rollback",
      description: "Reversible rollback (restores prior property values)."
    });
  }
  artifacts.push({
    fileName: "rollback-instructions.md",
    content: rollback.artifact.instructionsMarkdown,
    kind: "instructions",
    description: "Manual rollback guidance (always generated)."
  });

  return {
    mode,
    artifacts,
    rollback: rollback.artifact,
    fileNames: artifacts.map((a) => a.fileName),
    warnings
  };
}

function buildRollback(
  detail: ChangeSetDetail,
  snapshot: ReleaseArtifactSnapshot,
  membersByKey: Map<string, DimensionMemberRecord>,
  options: ExportProjectXmlOptions
): { artifact: RollbackArtifact; rollbackXml?: string } {
  const propertyUpdates = detail.items.filter((i) => i.changeType === "update" && i.propertyName);
  const irreversible = detail.items.filter(
    (i) => i.changeType === "add" || i.changeType === "delete" || i.changeType === "move" || i.changeType === "copy"
  );

  const requiresManualReview = irreversible.length > 0;
  let rollbackXml: string | undefined;

  // Only generate reversible rollback.xml when every change is a property update.
  if (propertyUpdates.length > 0 && irreversible.length === 0) {
    const restored: DimensionMemberRecord[] = [];
    const seen = new Set<string>();
    for (const item of propertyUpdates) {
      if (item.itemType !== "member" && item.itemType !== "property") continue;
      const lookup = memberLookup(item.dimensionType, item.objectKey);
      const member = membersByKey.get(lookup);
      if (!member) continue;
      const existing = restored.find((m) => m.id === member.id) ?? cloneMember(member);
      existing.properties = { ...existing.properties, [item.propertyName]: item.oldValue };
      if (!seen.has(member.id)) {
        restored.push(existing);
        seen.add(member.id);
      }
    }
    if (restored.length > 0) {
      rollbackXml = exportSubset(snapshot, restored, [], options);
    }
  }

  const instructionsMarkdown = renderRollbackInstructions(detail, {
    generated: Boolean(rollbackXml),
    requiresManualReview,
    irreversibleCount: irreversible.length,
    propertyUpdateCount: propertyUpdates.length
  });

  return {
    artifact: { generated: Boolean(rollbackXml), requiresManualReview, instructionsMarkdown },
    rollbackXml
  };
}

function renderRollbackInstructions(
  detail: ChangeSetDetail,
  state: { generated: boolean; requiresManualReview: boolean; irreversibleCount: number; propertyUpdateCount: number }
): string {
  const lines = [
    `# Rollback Instructions - ${detail.changeSet.name}`,
    "",
    state.generated
      ? "An automatic `rollback.xml` was generated. It restores prior property values for updated members."
      : "No automatic rollback XML was generated for this package.",
    ""
  ];
  if (state.requiresManualReview) {
    lines.push(
      "**Rollback requires manual review.** This change set includes add/delete/move/copy operations",
      "that cannot be safely represented as automatic rollback XML. Plan rollback manually:",
      ""
    );
  }
  lines.push("## Reverse these operations", "");
  const reversers: Record<string, string> = {
    add: "Delete the added member/relationship",
    delete: "Re-create the deleted member/relationship from the baseline snapshot",
    move: "Move the relationship back to its previous parent",
    copy: "Remove the copied relationship",
    update: "Restore the previous property value"
  };
  if (detail.items.length === 0) {
    lines.push("- No change items recorded.");
  } else {
    for (const item of detail.items) {
      const reverser = reversers[item.changeType] ?? "Review manually";
      const propertyNote = item.propertyName ? ` (${item.propertyName}: ${item.newValue} -> ${item.oldValue})` : "";
      lines.push(`- [${item.changeType}] ${item.dimensionType} ${item.objectKey}${propertyNote}: ${reverser}.`);
    }
  }
  lines.push(
    "",
    "Always restore from the change set baseline snapshot if available, then re-validate before re-import."
  );
  return lines.join("\n");
}

function collectMembers(
  items: ChangeSetItemRecord[],
  changeType: ChangeSetItemRecord["changeType"],
  membersByKey: Map<string, DimensionMemberRecord>
): DimensionMemberRecord[] {
  const result: DimensionMemberRecord[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.itemType !== "member" || item.changeType !== changeType) continue;
    const member = membersByKey.get(memberLookup(item.dimensionType, item.objectKey));
    if (member && !seen.has(member.id)) {
      result.push(member);
      seen.add(member.id);
    }
  }
  return result;
}

function collectUpdatedMembers(
  items: ChangeSetItemRecord[],
  membersByKey: Map<string, DimensionMemberRecord>
): DimensionMemberRecord[] {
  const result: DimensionMemberRecord[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const isMemberUpdate =
      (item.itemType === "member" && item.changeType === "update") ||
      (item.itemType === "property" && item.changeType === "update");
    if (!isMemberUpdate) continue;
    const member = membersByKey.get(memberLookup(item.dimensionType, item.objectKey));
    if (member && !seen.has(member.id)) {
      result.push(member);
      seen.add(member.id);
    }
  }
  return result;
}

function collectRelationships(
  items: ChangeSetItemRecord[],
  relationshipsByKey: Map<string, DimensionRelationshipRecord>
): DimensionRelationshipRecord[] {
  const result: DimensionRelationshipRecord[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.itemType !== "relationship") continue;
    const [parent, child] = parseRelationshipObjectKey(item.objectKey);
    if (!parent || !child) continue;
    const relationship = relationshipsByKey.get(relLookup(item.dimensionType, parent, child));
    if (relationship && !seen.has(relationship.id)) {
      result.push(relationship);
      seen.add(relationship.id);
    }
  }
  return result;
}

function exportSubset(
  snapshot: ReleaseArtifactSnapshot,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  options: ExportProjectXmlOptions
): string {
  const dimensionIds = new Set<string>();
  for (const member of members) dimensionIds.add(member.dimensionId);
  for (const relationship of relationships) dimensionIds.add(relationship.dimensionId);
  const dimensions = snapshot.dimensions.filter((d) => dimensionIds.has(d.id));
  return exportProjectXml(
    { project: snapshot.project, dimensions, members, relationships },
    { ...options, skipBlankMemberRows: true }
  );
}

function cloneMember(member: DimensionMemberRecord): DimensionMemberRecord {
  return { ...member, properties: { ...member.properties } };
}

function memberLookup(dimensionType: string, memberKey: string): string {
  return `${dimensionType.toLowerCase()}::${memberKey.trim().toLowerCase()}`;
}

function relLookup(dimensionType: string, parentKey: string, childKey: string): string {
  return `${dimensionType.toLowerCase()}::${parentKey.trim().toLowerCase()}->${childKey.trim().toLowerCase()}`;
}

function parseRelationshipObjectKey(objectKey: string): [string, string] {
  const idx = objectKey.indexOf(" -> ");
  if (idx === -1) return ["", ""];
  return [objectKey.slice(0, idx).trim(), objectKey.slice(idx + 4).trim()];
}
