import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { resolveEffectivePov, type EffectivePovTargetType } from "../../shared/effectivePov";
import type { DimensionType } from "../../shared/types";
import type { Repositories } from "../db/repositories";

/**
 * Effective OneStream POV Simulator (TASK-10). Resolves which property values effectively apply to
 * a target under a selected POV context, with the source of each value and conflict warnings.
 */
export function createEffectivePovRouter(repos: Repositories, _config: AppConfig): Router {
  const router = Router();

  router.post("/:projectId/effective-pov", (req, res) => {
    const project = repos.projects.get(req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });

    const body = req.body ?? {};
    const targetType = body.targetType as EffectivePovTargetType;
    if (targetType !== "member" && targetType !== "relationship" && targetType !== "dimension") {
      return res.status(400).json({ error: "targetType must be member, relationship, or dimension" });
    }

    const resolved = resolveTarget(repos, project.id, targetType, body);
    if ("error" in resolved) return res.status(resolved.status).json({ error: resolved.error });

    const context = {
      cubeType: typeof body.context?.cubeType === "string" ? body.context.cubeType : "",
      scenarioType: typeof body.context?.scenarioType === "string" ? body.context.scenarioType : "",
      timeMember: typeof body.context?.timeMember === "string" ? body.context.timeMember : ""
    };
    const propertyNames = Array.isArray(body.propertyNames)
      ? body.propertyNames.filter((n: unknown): n is string => typeof n === "string")
      : undefined;

    const varyingValues = repos.varyingProperties.listVaryingPropertyValuesForTarget(project.id, targetType, resolved.targetId);
    const report = resolveEffectivePov({
      dimensionType: resolved.dimensionType,
      targetType,
      baseProperties: resolved.baseProperties,
      varyingValues,
      context,
      propertyNames
    });

    res.json({ target: resolved.summary, ...report });
  });

  return router;
}

type ResolvedTarget =
  | { targetId: string; dimensionType: DimensionType; baseProperties: Record<string, unknown>; summary: Record<string, unknown> }
  | { error: string; status: number };

function resolveTarget(
  repos: Repositories,
  projectId: string,
  targetType: EffectivePovTargetType,
  body: Record<string, unknown>
): ResolvedTarget {
  if (targetType === "member") {
    const member = body.targetId
      ? repos.members.getById(String(body.targetId))
      : findMember(repos, projectId, String(body.dimensionId ?? ""), String(body.memberKey ?? ""));
    if (!member) return { error: "member not found", status: 404 };
    const dimension = repos.dimensions.get(member.dimensionId);
    if (!dimension || dimension.projectId !== projectId) return { error: "member not found", status: 404 };
    return {
      targetId: member.id,
      dimensionType: dimension.dimensionType,
      baseProperties: member.properties ?? {},
      summary: { targetType, memberKey: member.memberKey, dimensionType: dimension.dimensionType }
    };
  }

  if (targetType === "relationship") {
    const relationship = body.targetId
      ? repos.relationships.listByProject(projectId).find((r) => r.id === String(body.targetId))
      : findRelationship(repos, projectId, String(body.dimensionId ?? ""), String(body.parentKey ?? ""), String(body.childKey ?? ""));
    if (!relationship) return { error: "relationship not found", status: 404 };
    const dimension = repos.dimensions.get(relationship.dimensionId);
    if (!dimension || dimension.projectId !== projectId) return { error: "relationship not found", status: 404 };
    return {
      targetId: relationship.id,
      dimensionType: dimension.dimensionType,
      baseProperties: relationship.properties ?? {},
      summary: { targetType, parentKey: relationship.parentKey, childKey: relationship.childKey, dimensionType: dimension.dimensionType }
    };
  }

  // dimension
  const dimension = body.targetId
    ? repos.dimensions.get(String(body.targetId))
    : repos.dimensions.get(String(body.dimensionId ?? ""));
  if (!dimension || dimension.projectId !== projectId) return { error: "dimension not found", status: 404 };
  return {
    targetId: dimension.id,
    dimensionType: dimension.dimensionType,
    baseProperties: dimension.metadata ?? {},
    summary: { targetType, dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName }
  };
}

function findMember(repos: Repositories, projectId: string, dimensionId: string, memberKey: string) {
  if (!memberKey) return undefined;
  const target = memberKey.trim().toLowerCase();
  return repos.members
    .listByProject(projectId)
    .find((m) => (!dimensionId || m.dimensionId === dimensionId) && m.memberKey.trim().toLowerCase() === target);
}

function findRelationship(repos: Repositories, projectId: string, dimensionId: string, parentKey: string, childKey: string) {
  const parent = parentKey.trim().toLowerCase();
  const child = childKey.trim().toLowerCase();
  if (!child) return undefined;
  return repos.relationships
    .listByProject(projectId)
    .find((r) =>
      (!dimensionId || r.dimensionId === dimensionId) &&
      r.parentKey.trim().toLowerCase() === parent &&
      r.childKey.trim().toLowerCase() === child
    );
}
