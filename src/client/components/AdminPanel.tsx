import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { fetchValidationConfig, saveValidationConfig } from "../api/client";
import { ActionButton, StatusBadge } from "./ui";

interface ValidationRuleDisplay {
  code: string;
  description: string;
  severity: string;
  category: string;
  blocksExport: boolean;
}

interface RuleOverride {
  ruleCode: string;
  severity: string;
}

export function AdminPanel({ appConfig, projectId }: { appConfig: ClientAppConfig; projectId: string | null }) {
  const rules = buildValidationRuleList(appConfig);
  const blockedSeverities = appConfig.validation.exportBlockedBySeverities;
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void fetchValidationConfig(projectId).then((result) => {
      const map = new Map<string, string>();
      for (const o of result.overrides) map.set(o.ruleCode, o.severity);
      setOverrides(map);
    }).catch(() => setStatus("Failed to load overrides"));
  }, [projectId]);

  function toggleRule(code: string, currentSeverity: string) {
    const next = new Map(overrides);
    if (next.get(code) === "off") {
      next.delete(code);
    } else {
      next.set(code, "off");
    }
    setOverrides(next);
  }

  function changeSeverity(code: string, severity: string) {
    const next = new Map(overrides);
    if (severity === "default") {
      next.delete(code);
    } else {
      next.set(code, severity);
    }
    setOverrides(next);
  }

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    setStatus("Saving...");
    try {
      const payload: RuleOverride[] = [...overrides.entries()].map(([ruleCode, severity]) => ({ ruleCode, severity }));
      await saveValidationConfig(projectId, payload);
      setStatus("Saved. Re-run validation to apply changes.");
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function getEffectiveSeverity(rule: ValidationRuleDisplay): string {
    return overrides.get(rule.code) ?? rule.severity;
  }

  function isRuleDisabled(code: string): boolean {
    return overrides.get(code) === "off";
  }

  function exportRulesAsCsv() {
    const header = "Rule Code,Description,Category,Severity,Active,Blocks Export";
    const rows = rules.map(r => {
      const effectiveSev = getEffectiveSeverity(r);
      const active = effectiveSev !== "off" ? "Yes" : "No";
      const blocks = (blockedSeverities as string[]).includes(effectiveSev) ? "Yes" : "No";
      return `"${r.code}","${r.description}","${r.category}","${effectiveSev}","${active}","${blocks}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-rules-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel admin-panel">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Administration</span>
            <h1>Validation Rules</h1>
            <p>Rules at severity <b>{blockedSeverities.join(", ")}</b> block export. Toggle rules off or change severity per project.</p>
          </div>
          {projectId && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <ActionButton onClick={exportRulesAsCsv}>
                <Download size={14} /> Export Rules
              </ActionButton>
              <ActionButton variant="primary" disabled={saving} onClick={() => void handleSave()}>
                Save Overrides
              </ActionButton>
            </div>
          )}
        </div>
        {status && <div className="admin-status">{status}</div>}
        {!projectId && <p className="admin-note">Open a project to configure per-project rule overrides.</p>}

        <div className="admin-rules-table">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Active</th>
                <th>Rule Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Blocks Export</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const disabled = isRuleDisabled(rule.code);
                const effectiveSeverity = getEffectiveSeverity(rule);
                return (
                  <tr key={rule.code} className={disabled ? "rule-disabled" : rule.blocksExport ? "blocking-rule" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!disabled}
                        onChange={() => toggleRule(rule.code, rule.severity)}
                        disabled={!projectId}
                        title={disabled ? "Enable this rule" : "Disable this rule"}
                      />
                    </td>
                    <td><code>{rule.code}</code></td>
                    <td>{rule.description}</td>
                    <td>{rule.category}</td>
                    <td>
                      {projectId ? (
                        <select
                          value={overrides.has(rule.code) ? overrides.get(rule.code) : "default"}
                          onChange={(e) => changeSeverity(rule.code, e.target.value)}
                          disabled={disabled}
                          className="severity-select"
                        >
                          <option value="default">Default ({rule.severity})</option>
                          <option value="error">error</option>
                          <option value="warning">warning</option>
                          <option value="info">info</option>
                          <option value="off">off</option>
                        </select>
                      ) : (
                        <StatusBadge tone={rule.severity === "error" ? "danger" : rule.severity === "warning" ? "warning" : "info"}>
                          {rule.severity}
                        </StatusBadge>
                      )}
                    </td>
                    <td>{!disabled && blockedSeverities.includes(effectiveSeverity as any) ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function buildValidationRuleList(config: ClientAppConfig): ValidationRuleDisplay[] {
  const blocked = config.validation.exportBlockedBySeverities;
  const profile = config.validation.oneStreamProfile;
  const rules: ValidationRuleDisplay[] = [
    { code: "MEMBER_KEY_REQUIRED", description: "Member key field is empty", severity: config.validation.missingRequiredFieldSeverity, category: "Member", blocksExport: blocked.includes(config.validation.missingRequiredFieldSeverity) },
    { code: "DUPLICATE_MEMBER", description: "Member appears more than once in the dimension", severity: config.validation.duplicateMemberSeverity, category: "Member", blocksExport: blocked.includes(config.validation.duplicateMemberSeverity) },
    { code: "INVALID_BOOLEAN", description: "Boolean field contains non-TRUE/FALSE value", severity: "error", category: "Member", blocksExport: blocked.includes("error") },
    { code: "INVALID_NUMBER", description: "Numeric field contains non-numeric value", severity: "error", category: "Member", blocksExport: blocked.includes("error") },
    { code: "FORMULA_ERROR_VALUE", description: "Cell contains Excel formula error", severity: "error", category: "Member", blocksExport: blocked.includes("error") },
    { code: "XML_INVALID_CHARACTER", description: "Value contains XML-invalid control characters", severity: "error", category: "Member", blocksExport: blocked.includes("error") },
    { code: "ORPHAN_MEMBER", description: "Member not reachable from hierarchy root", severity: "warning", category: "Member", blocksExport: blocked.includes("warning") },
    { code: "RELATIONSHIP_PARENT_REQUIRED", description: "Relationship missing parent key", severity: config.validation.missingRequiredFieldSeverity, category: "Relationship", blocksExport: blocked.includes(config.validation.missingRequiredFieldSeverity) },
    { code: "RELATIONSHIP_CHILD_REQUIRED", description: "Relationship missing child key", severity: config.validation.missingRequiredFieldSeverity, category: "Relationship", blocksExport: blocked.includes(config.validation.missingRequiredFieldSeverity) },
    { code: "UNKNOWN_RELATIONSHIP_CHILD", description: "Relationship child is not a known member", severity: config.validation.unknownRelationshipMemberSeverity, category: "Relationship", blocksExport: blocked.includes(config.validation.unknownRelationshipMemberSeverity) },
    { code: "DUPLICATE_RELATIONSHIP", description: "Same parent-child pair appears more than once", severity: config.validation.duplicateRelationshipSeverity, category: "Relationship", blocksExport: blocked.includes(config.validation.duplicateRelationshipSeverity) },
    { code: "CIRCULAR_HIERARCHY", description: "Circular parent-child reference detected", severity: config.validation.circularHierarchySeverity, category: "Hierarchy", blocksExport: blocked.includes(config.validation.circularHierarchySeverity) },
    { code: "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS", description: "Dimension has relationships but no local members", severity: config.validation.relationshipsWithNoLocalMembersSeverity, category: "Hierarchy", blocksExport: blocked.includes(config.validation.relationshipsWithNoLocalMembersSeverity) },
    { code: "DIMENSION_TYPE_REQUIRED", description: "Dimension type is missing", severity: config.validation.missingRequiredFieldSeverity, category: "Dimension", blocksExport: blocked.includes(config.validation.missingRequiredFieldSeverity) },
    { code: "DIMENSION_NAME_REQUIRED", description: "Dimension name is missing", severity: config.validation.missingRequiredFieldSeverity, category: "Dimension", blocksExport: blocked.includes(config.validation.missingRequiredFieldSeverity) },
    { code: "XML_UNKNOWN_MEMBER_ATTRIBUTE", description: "Imported XML attribute not mapped - preserved on export", severity: "info", category: "XML Preservation", blocksExport: blocked.includes("info") },
    { code: "XML_UNKNOWN_DIMENSION_ATTRIBUTE", description: "Imported dimension XML attribute not mapped", severity: "info", category: "XML Preservation", blocksExport: blocked.includes("info") },
    { code: "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE", description: "Imported relationship XML attribute not mapped", severity: "info", category: "XML Preservation", blocksExport: blocked.includes("info") },
    { code: "XML_UNSUPPORTED_ELEMENT_PRESERVED", description: "Unsupported XML element preserved for round-trip", severity: "info", category: "XML Preservation", blocksExport: blocked.includes("info") },
  ];
  if (profile.enabled) {
    rules.push(
      { code: "MEMBER_NAME_TOO_LONG", description: `Member name exceeds ${profile.memberNameMaxLength} characters`, severity: "error", category: "OneStream Profile", blocksExport: blocked.includes("error") },
      { code: "MEMBER_NAME_RESTRICTED_CHAR", description: "Member name contains restricted character", severity: "error", category: "OneStream Profile", blocksExport: blocked.includes("error") },
      { code: "MEMBER_NAME_RESERVED_WORD", description: "Member name matches a reserved word", severity: "warning", category: "OneStream Profile", blocksExport: blocked.includes("warning") },
      { code: "DUPLICATE_ALIAS", description: "Alias duplicates another member's key or alias", severity: profile.duplicateAliasSeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.duplicateAliasSeverity) },
      { code: "INVALID_SORT_ORDER", description: "Sort order is not a valid integer", severity: profile.invalidSortOrderSeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.invalidSortOrderSeverity) },
      { code: "SHARED_MEMBER_DETECTED", description: "Member in multiple parent relationships", severity: profile.sharedMemberSeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.sharedMemberSeverity) },
      { code: "UNKNOWN_PROPERTY", description: "Property not in OneStream dictionary", severity: profile.unknownPropertySeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.unknownPropertySeverity) },
      { code: "INVALID_ENUM_VALUE", description: "Value not in allowed enumeration", severity: profile.invalidEnumSeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.invalidEnumSeverity) },
      { code: "INVALID_PROPERTY_TYPE", description: "Value type mismatch (expected boolean/number)", severity: profile.invalidPropertyTypeSeverity, category: "OneStream Profile", blocksExport: blocked.includes(profile.invalidPropertyTypeSeverity) },
    );
  }
  return rules.sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));
}
