import { Code2, FileCode2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClientAppConfig, DimensionBlueprintConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, DimensionType, ProjectRecord } from "../../shared/types";
import {
  generateBlueprintFromDimension,
  generateBlueprintYaml,
  validateBlueprintDraft
} from "../api/client";
import { ActionButton, StatusBadge } from "./ui";

export function BlueprintStudio({
  appConfig,
  dimensions,
  project
}: {
  appConfig: ClientAppConfig;
  dimensions: DimensionRecord[];
  project: ProjectRecord | null;
}) {
  const dimensionTypes = appConfig.dimensions.displayOrder.length
    ? appConfig.dimensions.displayOrder
    : appConfig.dimensions.enabledTypes;
  const [dimensionType, setDimensionType] = useState<DimensionType>(dimensionTypes[0] ?? "Account");
  const [draftText, setDraftText] = useState(() => stringifyDraft(appConfig.dimensions.blueprints[dimensionType]));
  const [yamlPreview, setYamlPreview] = useState("");
  const [status, setStatus] = useState("YAML remains the source of truth; Studio does not write config automatically.");
  const [valid, setValid] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedDimension = useMemo(
    () => dimensions.find((dimension) => dimension.dimensionType === dimensionType) ?? null,
    [dimensionType, dimensions]
  );

  useEffect(() => {
    setDraftText(stringifyDraft(appConfig.dimensions.blueprints[dimensionType]));
    setYamlPreview("");
    setValid(null);
    setStatus("YAML remains the source of truth; Studio does not write config automatically.");
  }, [appConfig.dimensions.blueprints, dimensionType]);

  async function validateDraft() {
    const parsed = parseDraftText(draftText);
    if (!parsed.ok) {
      setValid(false);
      setStatus(parsed.error);
      return;
    }

    setBusy(true);
    try {
      const result = await validateBlueprintDraft(dimensionType, parsed.value);
      setValid(result.valid);
      setStatus(result.valid ? "Draft is valid for the current configuration rules." : result.errors.join(" "));
    } catch (caught) {
      setValid(false);
      setStatus(caught instanceof Error ? caught.message : "Blueprint validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function previewYaml() {
    const parsed = parseDraftText(draftText);
    if (!parsed.ok) {
      setValid(false);
      setStatus(parsed.error);
      return;
    }

    setBusy(true);
    try {
      const result = await generateBlueprintYaml(dimensionType, parsed.value);
      setDraftText(stringifyDraft(result.blueprint));
      setYamlPreview(result.yaml);
      setValid(true);
      setStatus("YAML fragment generated. Review and apply it through your normal config change process.");
    } catch (caught) {
      setValid(false);
      setStatus(caught instanceof Error ? caught.message : "YAML generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateFromDimension() {
    if (!project || !selectedDimension) return;
    setBusy(true);
    try {
      const result = await generateBlueprintFromDimension(project.id, selectedDimension.id);
      setDraftText(stringifyDraft(result.blueprint));
      setYamlPreview(result.yaml);
      setValid(true);
      setStatus(`Generated a ${result.dimensionType} blueprint draft from ${selectedDimension.dimensionName}.`);
    } catch (caught) {
      setValid(false);
      setStatus(caught instanceof Error ? caught.message : "Blueprint generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyYaml() {
    if (!yamlPreview || !navigator.clipboard) return;
    await navigator.clipboard.writeText(yamlPreview);
    setStatus("YAML fragment copied.");
  }

  return (
    <section className="blueprint-studio" aria-label="Blueprint Studio">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Configuration authoring</span>
          <h3>Blueprint Studio</h3>
        </div>
        <StatusBadge tone={valid === false ? "danger" : valid ? "success" : "info"}>
          {valid === false ? "Needs fixes" : valid ? "Valid draft" : "Authoring aid"}
        </StatusBadge>
      </div>

      <p className="blueprint-studio-note">
        Author and validate dimension blueprint configurations. Select a dimension type, edit the JSON draft, then validate or preview the generated YAML.
      </p>

      <div className="blueprint-studio-form">
        <label>
          <span>Dimension type</span>
          <select value={dimensionType} onChange={(event) => setDimensionType(event.currentTarget.value as DimensionType)}>
            {dimensionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Current dimension source</span>
          <select
            value={selectedDimension?.id ?? ""}
            disabled={!project || !selectedDimension}
            onChange={() => undefined}
          >
            {selectedDimension ? (
              <option value={selectedDimension.id}>{selectedDimension.dimensionName}</option>
            ) : (
              <option value="">No {dimensionType} dimension in project</option>
            )}
          </select>
        </label>
      </div>

      <label className="blueprint-draft-editor">
        <span>Blueprint draft JSON</span>
        <textarea
          value={draftText}
          onChange={(event) => setDraftText(event.currentTarget.value)}
          spellCheck={false}
        />
      </label>

      <div className="blueprint-studio-actions">
        <ActionButton onClick={validateDraft} disabled={busy}>
          <Code2 size={16} /> Validate draft
        </ActionButton>
        <ActionButton onClick={previewYaml} disabled={busy}>
          <FileCode2 size={16} /> Preview YAML
        </ActionButton>
        <ActionButton onClick={generateFromDimension} disabled={busy || !project || !selectedDimension}>
          Generate from current dimension
        </ActionButton>
        <ActionButton onClick={copyYaml} disabled={!yamlPreview}>
          Copy YAML
        </ActionButton>
      </div>

      {status ? <p className="blueprint-studio-status" aria-live="polite" role="status">{status}</p> : null}
      {yamlPreview ? <pre className="blueprint-yaml-preview">{yamlPreview}</pre> : null}
    </section>
  );
}

function stringifyDraft(blueprint: DimensionBlueprintConfig | undefined): string {
  return JSON.stringify(blueprint ?? emptyBlueprint(), null, 2);
}

function emptyBlueprint(): DimensionBlueprintConfig {
  return {
    defaultDimensionName: "",
    rootMembers: ["Root"],
    memberKeyField: "",
    relationshipDefaults: {},
    allowMultipleParents: true
  };
}

function parseDraftText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? `Draft JSON is invalid: ${caught.message}` : "Draft JSON is invalid."
    };
  }
}
