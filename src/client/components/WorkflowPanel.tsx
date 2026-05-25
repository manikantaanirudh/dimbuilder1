import { CheckCircle2, Clock, PlayCircle, XCircle, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkflowDefinition, WorkflowInstance, WorkflowInstanceDetail } from "../../shared/workflowTypes";
import {
  fetchWorkflowDefinitions,
  fetchWorkflowInstances,
  fetchWorkflowInstanceDetail,
  submitWorkflow,
  approveWorkflowStep,
  rejectWorkflowInstance,
  cancelWorkflowInstance,
  evaluateAutoAdvance
} from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

export function WorkflowPanel({
  projectId,
  changeSetId
}: {
  projectId: string;
  changeSetId?: string;
}) {
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<WorkflowInstanceDetail | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [selectedDefinition, setSelectedDefinition] = useState("");
  const [autoAdvanceResult, setAutoAdvanceResult] = useState<{ shouldAdvance: boolean; conditionsEvaluated: Array<{ condition: { type: string }; passed: boolean; detail: string }> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [defs, insts] = await Promise.all([
          fetchWorkflowDefinitions(),
          fetchWorkflowInstances(projectId)
        ]);
        if (cancelled) return;
        setDefinitions(defs);
        setInstances(insts);
        if (defs.length > 0 && !selectedDefinition) setSelectedDefinition(defs[0].id);
        setStatus(insts.length ? `${insts.length} workflow${insts.length === 1 ? "" : "s"}` : "No workflows yet");
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    async function loadDetail() {
      try {
        const d = await fetchWorkflowInstanceDetail(selectedId);
        if (!cancelled) setDetail(d);
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load detail");
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  async function handleSubmit() {
    if (!changeSetId) return;
    try {
      const instance = await submitWorkflow({ changeSetId, definitionId: selectedDefinition || undefined });
      setInstances((prev) => [instance, ...prev]);
      setSelectedId(instance.id);
      setStatus("Workflow submitted");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Submit failed");
    }
  }

  async function handleApprove() {
    if (!selectedId) return;
    try {
      const result = await approveWorkflowStep(selectedId, { comment: comment || undefined });
      setDetail(result);
      setComment("");
      setStatus("Approved");
      refreshInstances();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Approve failed");
    }
  }

  async function handleReject() {
    if (!selectedId) return;
    try {
      const result = await rejectWorkflowInstance(selectedId, { comment: comment || undefined });
      setDetail(result);
      setComment("");
      setStatus("Rejected");
      refreshInstances();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Reject failed");
    }
  }

  async function handleCancel() {
    if (!selectedId) return;
    try {
      const result = await cancelWorkflowInstance(selectedId);
      setDetail(result);
      setStatus("Cancelled");
      refreshInstances();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Cancel failed");
    }
  }

  async function refreshInstances() {
    try {
      const insts = await fetchWorkflowInstances(projectId);
      setInstances(insts);
    } catch { /* ignore */ }
  }

  async function handleAutoAdvanceCheck() {
    if (!selectedId) return;
    try {
      const result = await evaluateAutoAdvance(selectedId);
      setAutoAdvanceResult(result);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Auto-advance check failed");
    }
  }

  const statusTone = (s: string) => {
    if (s === "approved") return "success";
    if (s === "rejected" || s === "cancelled") return "danger";
    return "warning";
  };

  return (
    <Panel title={`Workflows — ${status}`}>
      {!changeSetId && instances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)' }}>
          <Clock size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
          <h4 style={{ margin: '0.5rem 0', color: 'var(--fg)' }}>No workflow in progress</h4>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            Start a review workflow from the <b>Change Sets</b> tab to begin the approval process for this dimension.
          </p>
        </div>
      )}

      {changeSetId && definitions.length > 0 && (
        <div className="workflow-submit-section" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select value={selectedDefinition} onChange={(e) => setSelectedDefinition(e.target.value)}>
            {definitions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <ActionButton onClick={handleSubmit}>
            <PlayCircle size={14} /> Submit for Review
          </ActionButton>
        </div>
      )}

      {instances.length > 0 && (
        <div className="workflow-list" style={{ marginBottom: "1rem" }}>
          <table style={{ width: "100%", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Workflow</th>
                <th style={{ textAlign: "left" }}>Status</th>
                <th style={{ textAlign: "left" }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <tr
                  key={inst.id}
                  style={{ cursor: "pointer", background: inst.id === selectedId ? "var(--bg-muted, #f5f5f5)" : undefined }}
                  onClick={() => setSelectedId(inst.id)}
                >
                  <td>{inst.id.slice(0, 8)}</td>
                  <td>
                    <StatusBadge tone={statusTone(inst.status)}>
                      {inst.status === "in_progress" && <Clock size={12} />}
                      {inst.status === "approved" && <CheckCircle2 size={12} />}
                      {inst.status === "rejected" && <XCircle size={12} />}
                      {inst.status}
                    </StatusBadge>
                  </td>
                  <td>{new Date(inst.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="workflow-detail">
          <h4>
            {detail.definition.name} — Step {detail.instance.currentStepIndex + 1} of {detail.definition.steps.length}
          </h4>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted, #666)" }}>
            Current step: {detail.definition.steps[detail.instance.currentStepIndex]?.name ?? "Complete"}
          </p>

          {detail.actions.length > 0 && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
              <strong>Actions:</strong>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {detail.actions.map((a) => (
                  <li key={a.id}>
                    {a.action} by {a.actorId} {a.comment && `— "${a.comment}"`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.instance.status === "in_progress" && (
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexDirection: "column" }}>
              <textarea
                placeholder="Comment (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                style={{ width: "100%", resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <ActionButton onClick={handleApprove}><CheckCircle2 size={14} /> Approve</ActionButton>
                <ActionButton onClick={handleReject}><XCircle size={14} /> Reject</ActionButton>
                <ActionButton onClick={handleCancel}><XCircle size={14} /> Cancel</ActionButton>
                <ActionButton onClick={() => void handleAutoAdvanceCheck()}>
                  <Zap size={14} /> Check Auto-Advance
                </ActionButton>
              </div>
              {autoAdvanceResult && (
                <div className="auto-advance-result" style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--surface-subtle)", borderRadius: "8px", fontSize: "0.85rem" }}>
                  <strong><Zap size={12} /> Auto-Advance: </strong>
                  <StatusBadge tone={autoAdvanceResult.shouldAdvance ? "success" : "warning"}>
                    {autoAdvanceResult.shouldAdvance ? "Ready to advance" : "Conditions not met"}
                  </StatusBadge>
                  <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
                    {autoAdvanceResult.conditionsEvaluated.map((c, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                        {c.passed ? <CheckCircle2 size={12} color="var(--success)" /> : <XCircle size={12} color="var(--danger)" />}
                        <span>{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
