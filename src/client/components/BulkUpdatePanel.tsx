import { PlayCircle, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BulkUpdateOperation,
  BulkUpdatePreviewResult,
  BulkUpdateRequest,
  BulkUpdateTarget,
} from "../../shared/bulkUpdate";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { getPropertyDefinitionsForDimension } from "../../shared/oneStreamPropertyDictionary";
import type { DimensionRecord } from "../../shared/types";
import {
  applyBulkUpdate,
  previewBulkUpdate,
  validateProject,
} from "../api/client";
import { getValidationErrors } from "../ui/viewModel";
import { ActionButton, FactItem, FactStrip, Panel, StatusBadge } from "./ui";

export function BulkUpdatePanel({
  projectId,
  dimension,
  onApplied,
}: {
  projectId: string;
  dimension: DimensionRecord;
  onApplied?: () => void;
}) {
  const schema = getDimensionSchema(dimension.dimensionType);
  const [targetType, setTargetType] = useState<BulkUpdateTarget>("member");
  const [operation, setOperation] = useState<BulkUpdateOperation>("set");
  const [propertyName, setPropertyName] = useState("Text1");
  const [value, setValue] = useState("");
  const [sourcePropertyName, setSourcePropertyName] = useState("Description");
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [memberKeyContains, setMemberKeyContains] = useState("");
  const [parentKeyContains, setParentKeyContains] = useState("");
  const [childKeyContains, setChildKeyContains] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [preview, setPreview] = useState<BulkUpdatePreviewResult | null>(null);
  const [status, setStatus] = useState("Ready");
  const [validationStatus, setValidationStatus] = useState("");

  const propertyOptions = useMemo(() => {
    const schemaFields =
      targetType === "member" ? schema.memberFields : schema.relationshipFields;
    const dictionaryNames = getPropertyDefinitionsForDimension(
      dimension.dimensionType,
      targetType,
    ).map((definition) => definition.displayName);
    return Array.from(
      new Set([...schemaFields.map((field) => field.name), ...dictionaryNames]),
    ).sort((left, right) => left.localeCompare(right));
  }, [
    dimension.dimensionType,
    schema.memberFields,
    schema.relationshipFields,
    targetType,
  ]);

  useEffect(() => {
    if (propertyOptions.includes(propertyName)) return;
    setPropertyName(propertyOptions[0] ?? "");
  }, [propertyName, propertyOptions]);

  function buildRequest(): BulkUpdateRequest {
    return {
      targetType,
      operation,
      propertyName,
      value,
      sourcePropertyName,
      searchText,
      replaceText,
      regexPattern: searchText,
      filter: {
        dimensionId: dimension.id,
        activeOnly,
        memberKeyContains,
        parentKeyContains,
        childKeyContains,
      },
    };
  }

  async function runPreview() {
    setStatus("Previewing...");
    const result = await previewBulkUpdate(projectId, buildRequest());
    setPreview(result);
    setStatus(`${result.affectedCount} affected`);
  }

  async function applyPreview() {
    setStatus("Applying...");
    const result = await applyBulkUpdate(projectId, buildRequest());
    setPreview(null);
    setStatus(
      `Applied ${result.job.summary.affectedCount ?? result.items.length}`,
    );
    setValidationStatus(
      "Run validation after bulk updates to refresh project errors.",
    );
    onApplied?.();
  }

  async function runValidation() {
    setValidationStatus("Running validation...");
    const result = await validateProject(projectId);
    const errorCount = getValidationErrors(result.issues).length;
    setValidationStatus(
      `Validation returned ${errorCount} error${errorCount === 1 ? "" : "s"}.`,
    );
    onApplied?.();
  }

  const warningCount =
    (preview?.warnings.length ?? 0) +
    (preview?.previewItems.reduce(
      (count, item) => count + item.warnings.length,
      0,
    ) ?? 0);

  return (
    <Panel className="bulk-update-panel">
      <div className="bulk-update-toolbar">
        <div className="grid-toolbar-title">
          <strong>Bulk Update</strong>
          <span>
            Preview member or relationship property changes before applying them
          </span>
        </div>
        <StatusBadge
          tone={
            status.toLowerCase().includes("failed")
              ? "danger"
              : warningCount
                ? "warning"
                : "neutral"
          }
        >
          {status}
        </StatusBadge>
      </div>

      <div className="bulk-update-steps" aria-label="Bulk update wizard steps">
        <span>Target</span>
        <span>Filters</span>
        <span>Operation</span>
        <span>Preview</span>
        <span>Apply</span>
      </div>

      <div className="bulk-update-form">
        <label>
          <span>Target</span>
          <select
            value={targetType}
            onChange={(event) =>
              setTargetType(event.currentTarget.value as BulkUpdateTarget)
            }
          >
            <option value="member">Members</option>
            <option value="relationship">Relationships</option>
          </select>
        </label>
        <label>
          <span>Property</span>
          <select
            value={propertyName}
            onChange={(event) => setPropertyName(event.currentTarget.value)}
          >
            {propertyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Operation</span>
          <select
            value={operation}
            onChange={(event) =>
              setOperation(event.currentTarget.value as BulkUpdateOperation)
            }
          >
            <option value="set">Set</option>
            <option value="clear">Clear</option>
            <option value="replaceText">Replace text</option>
            <option value="append">Append</option>
            <option value="prepend">Prepend</option>
            <option value="copyFromProperty">Copy from property</option>
            <option value="deriveFromParent">Derive from parent</option>
            <option value="regexReplace">Regex replace</option>
          </select>
        </label>
        <label>
          <span>Value</span>
          <input
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Source property</span>
          <input
            value={sourcePropertyName}
            onChange={(event) =>
              setSourcePropertyName(event.currentTarget.value)
            }
          />
        </label>
        <label>
          <span>Find text / regex</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Replace text</span>
          <input
            value={replaceText}
            onChange={(event) => setReplaceText(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Member key contains</span>
          <input
            value={memberKeyContains}
            onChange={(event) =>
              setMemberKeyContains(event.currentTarget.value)
            }
            disabled={targetType !== "member"}
          />
        </label>
        <label>
          <span>Parent contains</span>
          <input
            value={parentKeyContains}
            onChange={(event) =>
              setParentKeyContains(event.currentTarget.value)
            }
            disabled={targetType !== "relationship"}
          />
        </label>
        <label>
          <span>Child contains</span>
          <input
            value={childKeyContains}
            onChange={(event) => setChildKeyContains(event.currentTarget.value)}
            disabled={targetType !== "relationship"}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.currentTarget.checked)}
          />
          <span>Active only</span>
        </label>
        <div className="bulk-update-actions">
          <ActionButton onClick={() => void runPreview()}>
            <PlayCircle size={15} /> Preview
          </ActionButton>
          <ActionButton
            variant="primary"
            disabled={!preview?.previewItems.length}
            onClick={() => void applyPreview()}
          >
            <Wand2 size={15} /> Apply
          </ActionButton>
          <ActionButton variant="ghost" onClick={() => void runValidation()}>
            Run Validation
          </ActionButton>
        </div>
      </div>

      {validationStatus && (
        <div className="bulk-update-validation-note">{validationStatus}</div>
      )}

      <FactStrip className="bulk-update-summary">
        <FactItem label="Affected" value={preview?.affectedCount ?? 0} />
        <FactItem label="Skipped" value={preview?.skippedCount ?? 0} />
        <FactItem
          label="Warnings"
          value={warningCount}
          tone={warningCount ? "warning" : "neutral"}
        />
      </FactStrip>

      <div
        className="bulk-update-table"
        role="table"
        aria-label="Bulk update preview"
      >
        <div className="bulk-update-row header" role="row">
          <span>Target</span>
          <span>Property</span>
          <span>Old</span>
          <span>New</span>
          <span>Warnings</span>
        </div>
        {(preview?.previewItems ?? []).map((item) => (
          <div
            key={`${item.targetId}-${item.propertyName}`}
            className="bulk-update-row"
            role="row"
          >
            <span>{item.targetKey}</span>
            <span>{item.propertyName}</span>
            <span>{item.oldValue}</span>
            <span>{item.newValue}</span>
            <span>{item.warnings.join("; ") || "-"}</span>
          </div>
        ))}
        {!preview?.previewItems.length && (
          <div className="bulk-update-empty">
            Run preview to review exact old and new values before applying
            changes.
          </div>
        )}
      </div>
    </Panel>
  );
}
