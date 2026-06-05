import type { ChangeSetStatus } from "./types";

export type WorkflowStageStatus = "not_started" | "needs_attention" | "ready" | "complete";

export interface WorkflowStage {
  key: string;
  label: string;
  status: WorkflowStageStatus;
  blockers: string[];
  warnings: string[];
  recommendedAction: string;
  /** Client route/tab hint for navigation. */
  linkTarget: string;
  /** Optional analysis stages are not required for release. */
  optional: boolean;
}

export interface WorkflowStatusReport {
  generatedAt: string;
  stages: WorkflowStage[];
  completedStages: number;
  totalStages: number;
  nextBestAction: { stageKey: string; label: string; action: string; linkTarget: string } | null;
}

export interface WorkflowInput {
  dimensionCount: number;
  memberCount: number;
  validation: { hasRun: boolean; errorCount: number; warningCount: number };
  certificationStatus: "passed" | "passed_with_warnings" | "failed" | null;
  readiness?: { score: number; band: string } | null;
  impactRunCount: number;
  baselineCount: number;
  changeSet: { latestStatus: ChangeSetStatus | null; hasPackage: boolean };
}

/**
 * Computes guided-workflow stage status from real project state. This is advisory navigation;
 * it never restricts access to existing tabs for power users.
 */
export function computeWorkflowStatus(input: WorkflowInput): WorkflowStatusReport {
  const stages: WorkflowStage[] = [];

  // 1. Create / import project
  stages.push(stage("create-import", "Create or import project", "import", false, () => {
    if (input.dimensionCount > 0) return done("Project has imported metadata.");
    return notStarted("Import a OneStream workbook or metadata XML to begin.");
  }));

  // 2. Review dimensions
  stages.push(stage("review-dimensions", "Review dimensions", "dimensions", false, () => {
    if (input.dimensionCount === 0) return notStarted("Import metadata before reviewing dimensions.");
    if (input.memberCount === 0) return attention("Dimensions exist but contain no members.", [], "Review dimension contents.");
    return done(`${input.dimensionCount} dimension(s) available for review.`);
  }));

  // 3. Edit metadata
  stages.push(stage("edit-metadata", "Edit metadata", "members", false, () => {
    if (input.memberCount === 0) return notStarted("Add or import members before editing.");
    return done(`${input.memberCount} member(s) present.`);
  }));

  // 4. Validate
  stages.push(stage("validate", "Validate", "validation", false, () => {
    if (input.memberCount === 0) return notStarted("Add metadata before validating.");
    if (!input.validation.hasRun) return ready("Run validation to check OneStream compliance.");
    if (input.validation.errorCount > 0) {
      return attention(
        `${input.validation.errorCount} validation error(s) must be resolved.`,
        [`${input.validation.errorCount} error(s) block a clean release.`],
        "Resolve validation errors."
      );
    }
    if (input.validation.warningCount > 0) {
      return readyWithWarning(`Validation passed with ${input.validation.warningCount} warning(s).`, "Review validation warnings.");
    }
    return done("Validation passed with no errors.");
  }));

  // 5. XML certification
  stages.push(stage("xml-certification", "Run XML certification", "xml", false, () => {
    if (input.memberCount === 0) return notStarted("Add metadata before certifying XML.");
    if (input.certificationStatus === null) return ready("Run XML round-trip certification to confirm export fidelity.");
    if (input.certificationStatus === "failed") {
      return attention("XML round-trip certification failed.", ["Metadata loss detected on round-trip."], "Fix XML certification failures.");
    }
    if (input.certificationStatus === "passed_with_warnings") {
      return readyWithWarning("XML certification passed with warnings.", "Review XML certification warnings.");
    }
    return done("XML round-trip certification passed.");
  }));

  // 6. Analyze hierarchy and cross-dimension behavior (optional analysis)
  stages.push(stage("analyze-structure", "Analyze hierarchy and cross-dimension behavior", "hierarchy", true, () => {
    if (input.memberCount === 0) return notStarted("Add metadata before structural analysis.");
    return ready("Optional: review hierarchy depth and cross-dimension consistency.");
  }));

  // 7. Analyze impact (optional)
  stages.push(stage("analyze-impact", "Analyze impact", "impact", true, () => {
    if (input.memberCount === 0) return notStarted("Add metadata before impact analysis.");
    if (input.impactRunCount > 0) return done(`${input.impactRunCount} impact analysis run(s) recorded.`);
    return ready("Optional: run impact analysis on referenced members.");
  }));

  // 8. Compare against baseline (optional)
  stages.push(stage("compare-baseline", "Compare against baseline", "diff", true, () => {
    if (input.baselineCount > 0) return done(`${input.baselineCount} baseline(s) available for comparison.`);
    return ready("Optional: capture a baseline to compare changes over time.");
  }));

  // 9. Create / approve change set
  stages.push(stage("change-set", "Create and approve change set", "change-sets", false, () => {
    const status = input.changeSet.latestStatus;
    if (status === null) return notStarted("Create a change set from the latest diff.");
    if (status === "rejected") return attention("Latest change set was rejected.", [], "Create a new change set or revise.");
    if (status === "approved" || status === "exported") return done(`Change set is ${status}.`);
    return attention(`Change set is in '${status}' state.`, [], "Validate and approve the change set.");
  }));

  // 10. Generate release evidence package
  stages.push(stage("release-package", "Generate release package", "change-sets", false, () => {
    if (input.changeSet.hasPackage) return done("A release package has been generated.");
    if (input.changeSet.latestStatus === "approved" || input.changeSet.latestStatus === "exported") {
      return ready("Package the approved change set.");
    }
    return notStarted("Approve a change set before packaging.");
  }));

  // 11. Export XML or handoff
  stages.push(stage("export-handoff", "Export XML or hand off", "xml", false, () => {
    if (input.changeSet.hasPackage || input.changeSet.latestStatus === "exported") {
      return ready("Export XML or assemble the handoff package for ACM/EPMware.");
    }
    if (input.memberCount === 0) return notStarted("Add metadata before exporting.");
    return ready("Export XML for review. Package a change set for a full handoff.");
  }));

  const completedStages = stages.filter((s) => s.status === "complete").length;
  const nextBestAction = resolveNextBestAction(stages);

  return {
    generatedAt: new Date().toISOString(),
    stages,
    completedStages,
    totalStages: stages.length,
    nextBestAction
  };
}

function resolveNextBestAction(stages: WorkflowStage[]): WorkflowStatusReport["nextBestAction"] {
  // Prefer the earliest required stage needing attention, then earliest required not-started/ready.
  const attentionStage = stages.find((s) => !s.optional && s.status === "needs_attention");
  if (attentionStage) return toAction(attentionStage);
  const pending = stages.find((s) => !s.optional && (s.status === "not_started" || s.status === "ready"));
  if (pending) return toAction(pending);
  const optionalPending = stages.find((s) => s.status === "ready" || s.status === "not_started");
  if (optionalPending) return toAction(optionalPending);
  return null;
}

function toAction(stage: WorkflowStage): WorkflowStatusReport["nextBestAction"] {
  return { stageKey: stage.key, label: stage.label, action: stage.recommendedAction, linkTarget: stage.linkTarget };
}

interface StageOutcome {
  status: WorkflowStageStatus;
  blockers: string[];
  warnings: string[];
  recommendedAction: string;
}

function stage(
  key: string,
  label: string,
  linkTarget: string,
  optional: boolean,
  compute: () => StageOutcome
): WorkflowStage {
  const outcome = compute();
  return { key, label, linkTarget, optional, ...outcome };
}

function done(action: string): StageOutcome {
  return { status: "complete", blockers: [], warnings: [], recommendedAction: action };
}
function ready(action: string): StageOutcome {
  return { status: "ready", blockers: [], warnings: [], recommendedAction: action };
}
function readyWithWarning(warning: string, action: string): StageOutcome {
  return { status: "ready", blockers: [], warnings: [warning], recommendedAction: action };
}
function notStarted(action: string): StageOutcome {
  return { status: "not_started", blockers: [], warnings: [], recommendedAction: action };
}
function attention(reason: string, blockers: string[], action: string): StageOutcome {
  return { status: "needs_attention", blockers: blockers.length ? blockers : [reason], warnings: [], recommendedAction: action };
}
