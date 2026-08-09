import { Clock, GitBranch, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectVersionRecord } from "../../shared/types";
import { fetchProjectVersions } from "../api/client";
import { ActionButton, StatusBadge } from "./ui";

export function SeededVersionHistoryModal({
  open,
  projectId,
  projectName,
  onClose,
}: {
  open: boolean;
  projectId: string | null;
  projectName?: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<ProjectVersionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const loaded = await fetchProjectVersions(projectId!);
        if (!cancelled) setVersions(loaded);
      } catch (err) {
        console.error("Failed to load version history:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{ maxWidth: 640, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border, #e2e8f0)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={18} />
            <h2 id="version-history-title" style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
              Seeded Version History
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close modal"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {projectName && (
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", opacity: 0.8 }}>
              Project: <strong>{projectName}</strong> • {versions.length} version(s) recorded
            </p>
          )}

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: "13px", opacity: 0.7 }}>
              Loading version history...
            </div>
          ) : versions.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: "13px", opacity: 0.7 }}>
              No recorded version history available for this project.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--color-bg-subtle, #f8fafc)",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-subtle, #cbd5e1)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StatusBadge tone={ver.versionNumber === Math.max(...versions.map((v) => v.versionNumber)) ? "info" : "neutral"}>
                      {ver.versionLabel}
                    </StatusBadge>
                    <span style={{ fontWeight: 500, fontSize: "13px" }}>
                      {ver.sourceFileName || "Seeded Metadata"}
                    </span>
                    {ver.versionNumber === Math.max(...versions.map((v) => v.versionNumber)) && (
                      <span
                        style={{
                          fontSize: "11px",
                          background: "var(--color-primary-light, #e0f2fe)",
                          color: "var(--color-primary, #0284c7)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", opacity: 0.8 }}>
                    <Clock size={12} />
                    <span>{new Date(ver.seededAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border, #e2e8f0)",
          }}
        >
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
    </div>
  );
}
