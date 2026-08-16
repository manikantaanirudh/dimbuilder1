import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getValidationRuleCatalog, type EffectiveValidationRule, type ValidationRuleClassification } from "../../shared/validationRuleCatalog";
import { fetchValidationRules, replaceValidationConfig } from "../api/client";
import { ActionButton, StatusBadge } from "./ui";

type RuleFilter = "all" | "active" | "inactive";

export function AdminPanel({ appConfig, projectId }: { appConfig: ClientAppConfig; projectId: string | null }) {
  const [rules, setRules] = useState<EffectiveValidationRule[]>(() => defaultRules());
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [legacyOverrides, setLegacyOverrides] = useState<Array<{ ruleCode: string; severity: string; reason: string }>>([]);
  const [catalogVersion, setCatalogVersion] = useState("1.0.0");
  const [targetVersion, setTargetVersion] = useState("9.2.0.18004");
  const [category, setCategory] = useState("all");
  const [activeFilter, setActiveFilter] = useState<RuleFilter>("all");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Keep the prop in the component contract while the catalog is now the source of truth.
  void appConfig;

  useEffect(() => {
    if (!projectId) {
      setRules(defaultRules());
      setOverrides(new Map());
      setLegacyOverrides([]);
      return;
    }
    setLoading(true);
    setStatus("Loading validation catalog...");
    void fetchValidationRules(projectId).then((result) => {
      setRules(result.rules);
      setCatalogVersion(result.catalogVersion);
      setTargetVersion(result.targetVersion);
      setLegacyOverrides(result.legacyOverrides);
      const next = new Map<string, string>();
      for (const rule of result.rules) if (rule.overridden) next.set(rule.code, rule.effectiveSeverity);
      setOverrides(next);
      setStatus(result.legacyOverrides.length > 0 ? "Loaded with ignored legacy overrides." : "Validation catalog loaded.");
    }).catch(() => setStatus("Failed to load validation catalog. Retry by reopening Admin."))
      .finally(() => setLoading(false));
  }, [projectId]);

  const categories = useMemo(() => ["all", ...new Set(rules.map((rule) => rule.category))], [rules]);
  const visibleRules = useMemo(() => rules
    .filter((rule) => category === "all" || rule.category === category)
    .filter((rule) => activeFilter === "all" || (activeFilter === "active" ? effectiveSeverity(rule, overrides) !== "off" : effectiveSeverity(rule, overrides) === "off")), [rules, category, activeFilter, overrides]);
  const groupedRules = useMemo(() => ["hard_error", "advisory", "informational"].map((classification) => ({
    classification: classification as ValidationRuleClassification,
    rules: visibleRules.filter((rule) => rule.classification === classification)
  })), [visibleRules]);

  function changeSeverity(code: string, severity: string) {
    const rule = rules.find((candidate) => candidate.code === code);
    if (!rule || rule.locked) return;
    const next = new Map(overrides);
    if (severity === "default") next.delete(code);
    else next.set(code, severity);
    setOverrides(next);
  }

  function toggleRule(rule: EffectiveValidationRule) {
    if (rule.locked) return;
    changeSeverity(rule.code, effectiveSeverity(rule, overrides) === "off" ? "default" : "off");
  }

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    setStatus("Saving validation configuration...");
    try {
      const payload = [...overrides.entries()].map(([ruleCode, severity]) => ({ ruleCode, severity }));
      await replaceValidationConfig(projectId, payload);
      setStatus("Saved. Run validation again to apply the updated rule configuration.");
    } catch {
      setStatus("Save failed. No validation configuration was changed.");
    } finally {
      setSaving(false);
    }
  }

  function exportRulesAsCsv() {
    const header = "Rule Code,Label,Description,Category,Classification,Allowed Severities,Effective Severity,Active,Locked,Blocks Export,Evidence,Target Version";
    const rows = rules.map((rule) => [
      rule.code,
      rule.label,
      rule.description,
      rule.category,
      rule.classification,
      rule.allowedSeverities.join(" | "),
      effectiveSeverity(rule, overrides),
      effectiveSeverity(rule, overrides) === "off" ? "No" : "Yes",
      rule.locked ? "Yes" : "No",
      rule.blocksExport && effectiveSeverity(rule, overrides) === "error" ? "Yes" : "No",
      rule.evidence.map((source) => source.url ? `${source.label} (${source.url})` : source.label).join(" | "),
      rule.targetVersion
    ].map(csvCell).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "validation-rule-catalog.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel admin-panel">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Administration</span>
            <h1>Validation Rules</h1>
            <p>OneStream target <strong>{targetVersion}</strong> · Catalog {catalogVersion}</p>
            <p className="admin-note">Only locked hard errors block export. Advisories and informational findings never block export.</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <ActionButton onClick={exportRulesAsCsv} disabled={loading}><Download size={14} /> Export CSV</ActionButton>
            {projectId && <ActionButton variant="primary" disabled={saving || loading} onClick={() => void handleSave()}>Save Configuration</ActionButton>}
          </div>
        </div>

        <div className="admin-status" role="status" aria-live="polite">{status}</div>
        {!projectId && <p className="admin-note">Open a project to view effective severities and change private project overrides.</p>}
        {legacyOverrides.length > 0 && <div className="admin-warning" role="alert">Ignored legacy overrides: {legacyOverrides.map((item) => `${item.ruleCode} (${item.reason})`).join(", ")}. Saving replaces the project configuration.</div>}

        <div className="admin-rule-filters" aria-label="Validation rule filters">
          <label>Category <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : item}</option>)}</select></label>
          <label>State <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as RuleFilter)}><option value="all">All rules</option><option value="active">Active</option><option value="inactive">Off</option></select></label>
        </div>

        {groupedRules.map((group) => <RuleGroup key={group.classification} classification={group.classification} rules={group.rules} overrides={overrides} projectId={projectId} onToggle={toggleRule} onChange={changeSeverity} />)}
      </div>
    </section>
  );
}

function RuleGroup({ classification, rules, overrides, projectId, onToggle, onChange }: { classification: ValidationRuleClassification; rules: EffectiveValidationRule[]; overrides: Map<string, string>; projectId: string | null; onToggle: (rule: EffectiveValidationRule) => void; onChange: (code: string, severity: string) => void }) {
  if (rules.length === 0) return null;
  const title = classification === "hard_error" ? "Blocking Errors" : classification === "advisory" ? "Advisories" : "Informational Rules";
  return <section className="admin-rule-group" aria-labelledby={`rule-group-${classification}`}>
    <div className="admin-rule-group-heading"><h2 id={`rule-group-${classification}`}>{title}</h2><span>{rules.length} rules</span></div>
    <div className="admin-rules-table"><table className="rules-table"><thead><tr><th>Active</th><th>Rule</th><th>Classification</th><th>Description and evidence</th><th>Severity</th><th>Export</th></tr></thead><tbody>
      {rules.map((rule) => {
        const severity = effectiveSeverity(rule, overrides);
        return <tr key={rule.code} className={severity === "off" ? "rule-disabled" : rule.blocksExport ? "blocking-rule" : ""}>
          <td><input type="checkbox" checked={severity !== "off"} disabled={!projectId || rule.locked} onChange={() => onToggle(rule)} aria-label={`${severity === "off" ? "Enable" : "Disable"} ${rule.code}`} /></td>
          <td><code>{rule.code}</code><br /><span>{rule.label}</span></td>
          <td><StatusBadge tone={classification === "hard_error" ? "danger" : classification === "advisory" ? "warning" : "info"}>{classification.replace("_", " ")}</StatusBadge>{rule.locked && <small> Locked</small>}</td>
          <td><div>{rule.description}</div><div className="admin-rule-evidence">{rule.evidence.map((source) => source.url ? <a key={source.label} href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : <span key={source.label}>{source.label}</span>)}</div></td>
          <td><select value={overrides.get(rule.code) ?? "default"} disabled={!projectId || rule.locked} onChange={(event) => onChange(rule.code, event.target.value)} aria-label={`Severity for ${rule.code}`}><option value="default">Default ({rule.defaultSeverity})</option>{rule.allowedSeverities.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
          <td>{rule.blocksExport && severity === "error" ? "Yes" : "No"}</td>
        </tr>;
      })}
    </tbody></table></div>
  </section>;
}

function defaultRules(): EffectiveValidationRule[] {
  return getValidationRuleCatalog().map((rule) => ({ ...rule, effectiveSeverity: rule.defaultSeverity, active: true, overridden: false }));
}

function effectiveSeverity(rule: EffectiveValidationRule, overrides: Map<string, string>): string {
  return overrides.get(rule.code) ?? rule.effectiveSeverity;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
