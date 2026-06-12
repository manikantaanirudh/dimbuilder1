/**
 * Auto-advance rules engine for workflow steps.
 * 
 * Evaluates conditions defined in workflow definition's autoAdvanceRules
 * and automatically approves steps when conditions are met.
 * 
 * Rule format in workflow definition:
 * autoAdvanceRules: {
 *   [stepIndex: number]: {
 *     conditions: Array<{
 *       type: 'quality_score_above' | 'no_validation_errors' | 'time_elapsed' | 'all_properties_filled',
 *       threshold?: number,
 *       hoursElapsed?: number
 *     }>,
 *     operator: 'all' | 'any'  // default: 'all'
 *   }
 * }
 */

import type { Repositories } from "../db/repositories";
import { scoreDimensionQuality } from "../tier3/tier3Engine";

export interface AutoAdvanceCondition {
  type: 'quality_score_above' | 'no_validation_errors' | 'time_elapsed' | 'all_properties_filled';
  threshold?: number;
  hoursElapsed?: number;
}

export interface AutoAdvanceRule {
  conditions: AutoAdvanceCondition[];
  operator: 'all' | 'any';
}

export interface AutoAdvanceResult {
  instanceId: string;
  stepIndex: number;
  shouldAdvance: boolean;
  conditionsEvaluated: Array<{ condition: AutoAdvanceCondition; passed: boolean; detail: string }>;
}

/**
 * Evaluate auto-advance rules for a given workflow instance.
 * Returns whether the current step should be automatically advanced.
 */
export async function evaluateAutoAdvance(
  repos: Repositories,
  instanceId: string
): Promise<AutoAdvanceResult | null> {
  const instance = await repos.workflows.instances.get(instanceId);
  if (!instance || instance.status !== 'in_progress') return null;

  const definition = await repos.workflows.definitions.get(instance.definitionId);
  if (!definition || !definition.autoAdvanceRules) return null;

  const rules = definition.autoAdvanceRules as Record<string, AutoAdvanceRule>;
  const stepKey = String(instance.currentStepIndex);
  const rule = rules[stepKey];
  if (!rule || !rule.conditions || rule.conditions.length === 0) return null;

  const results: Array<{ condition: AutoAdvanceCondition; passed: boolean; detail: string }> = [];

  for (const condition of rule.conditions) {
    const evaluation = await evaluateCondition(repos, instance.projectId, instance, condition);
    results.push(evaluation);
  }

  const operator = rule.operator || 'all';
  const shouldAdvance = operator === 'all'
    ? results.every(r => r.passed)
    : results.some(r => r.passed);

  return {
    instanceId,
    stepIndex: instance.currentStepIndex,
    shouldAdvance,
    conditionsEvaluated: results
  };
}

/**
 * Run auto-advance evaluation on all in-progress workflow instances.
 * Advances steps that meet their auto-advance criteria.
 */
export async function runAutoAdvanceCheck(repos: Repositories): Promise<Array<{ instanceId: string; advanced: boolean }>> {
  const results: Array<{ instanceId: string; advanced: boolean }> = [];

  // Get all projects and their active workflow instances
  const projects = await repos.projects.list();
  for (const project of projects) {
    const instances = await repos.workflows.instances.listByProject(project.id, 'in_progress');
    for (const instance of instances) {
      const evaluation = await evaluateAutoAdvance(repos, instance.id);
      if (evaluation && evaluation.shouldAdvance) {
        // Auto-approve by recording a system approval
        await repos.workflows.stepActions.record({
          instanceId: instance.id,
          stepIndex: instance.currentStepIndex,
          action: 'approve',
          actorId: 'system:auto-advance',
          comment: `Auto-advanced: ${evaluation.conditionsEvaluated.filter(c => c.passed).map(c => c.detail).join('; ')}`
        });

        // Check if we can advance
        const definition = await repos.workflows.definitions.get(instance.definitionId);
        if (definition) {
          const currentStep = definition.steps[instance.currentStepIndex];
          const approvalCount = await repos.workflows.stepActions.countApprovalsForStep(instance.id, instance.currentStepIndex);

          if (currentStep && approvalCount >= currentStep.minApprovals) {
            const nextStepIndex = instance.currentStepIndex + 1;
            if (nextStepIndex >= definition.steps.length) {
              await repos.workflows.instances.updateStatus(instance.id, 'approved', new Date().toISOString());
              await repos.changeSets.update(instance.projectId, instance.changeSetId, { status: 'approved' });
            } else {
              await repos.workflows.instances.advanceStep(instance.id, nextStepIndex);
            }
            results.push({ instanceId: instance.id, advanced: true });
          } else {
            results.push({ instanceId: instance.id, advanced: false });
          }
        }
      }
    }
  }

  return results;
}

async function evaluateCondition(
  repos: Repositories,
  projectId: string,
  instance: { createdAt: string },
  condition: AutoAdvanceCondition
): Promise<{ condition: AutoAdvanceCondition; passed: boolean; detail: string }> {
  switch (condition.type) {
    case 'quality_score_above': {
      const threshold = condition.threshold ?? 80;
      const dimensions = await repos.dimensions.listByProject(projectId);
      const members = await repos.members.listByProject(projectId);
      const rules = await repos.qualityRules.listByProject(projectId);
      const issues = await repos.issues.listByProject(projectId);

      if (dimensions.length === 0) {
        return { condition, passed: true, detail: `No dimensions to score (passes by default)` };
      }

      const scores = dimensions.map(dim => {
        const dimMembers = members.filter(m => m.dimensionId === dim.id);
        const dimIssues = issues.filter(i => i.dimensionId === dim.id);
        return scoreDimensionQuality(dim, dimMembers, rules, dimIssues);
      });
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length);

      return { condition, passed: avgScore >= threshold, detail: `Quality score ${avgScore}/${threshold}` };
    }

    case 'no_validation_errors': {
      const dimensions = await repos.dimensions.listByProject(projectId);
      const members = await repos.members.listByProject(projectId);
      // Simple check: ensure no orphan members (members with no relationships)
      const relationships = await repos.relationships.listByProject(projectId);
      const childKeys = new Set(relationships.map(r => r.childKey));
      const parentKeys = new Set(relationships.map(r => r.parentKey));
      const orphans = members.filter(m => !childKeys.has(m.memberKey) && !parentKeys.has(m.memberKey));
      const passed = orphans.length === 0;
      return { condition, passed, detail: passed ? 'No validation errors' : `${orphans.length} orphan members found` };
    }

    case 'time_elapsed': {
      const hours = condition.hoursElapsed ?? 24;
      const createdAt = new Date(instance.createdAt).getTime();
      const elapsed = (Date.now() - createdAt) / (1000 * 60 * 60);
      const passed = elapsed >= hours;
      return { condition, passed, detail: `${Math.round(elapsed)}h elapsed (need ${hours}h)` };
    }

    case 'all_properties_filled': {
      const members = await repos.members.listByProject(projectId);
      const unfilled = members.filter(m => {
        const props = typeof m.properties === 'string' ? JSON.parse(m.properties || '{}') : (m.properties || {});
        return Object.keys(props).length === 0;
      });
      const passed = unfilled.length === 0;
      return { condition, passed, detail: passed ? 'All members have properties' : `${unfilled.length} members without properties` };
    }

    default:
      return { condition, passed: false, detail: `Unknown condition type: ${condition.type}` };
  }
}
