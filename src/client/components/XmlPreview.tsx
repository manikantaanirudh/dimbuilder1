import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import { apiText } from "../api/client";
import type { ExportAvailability } from "../ui/viewModel";
import { ActionButton, ActionLink, StatusBadge } from "./ui";

type XmlPreviewScope = "all" | "dimension";

function mapDefaultScope(defaultScope: "currentDimension" | "allDimensions", allowAllDimensions: boolean): XmlPreviewScope {
  if (!allowAllDimensions) return "dimension";
  return defaultScope === "allDimensions" ? "all" : "dimension";
}

export function XmlPreview({
  projectId,
  dimension,
  defaultScope = "allDimensions",
  allowAllDimensions = true,
  xmlExportEnabled = true,
  exportAvailability,
  dimensionIssues = [],
}: {
  projectId: string;
  dimension: DimensionRecord;
  defaultScope?: "currentDimension" | "allDimensions";
  allowAllDimensions?: boolean;
  xmlExportEnabled?: boolean;
  exportAvailability: ExportAvailability;
  dimensionIssues?: ValidationIssue[];
}) {
  const [xml, setXml] = useState("");
  const [scope, setScope] = useState<XmlPreviewScope>(() => mapDefaultScope(defaultScope, allowAllDimensions));
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!xmlExportEnabled) {
      setXml("");
      setStatus("XML export is disabled.");
      return;
    }

    let cancelled = false;
    setXml("");
    setStatus("Loading XML preview...");
    const path = scope === "dimension"
      ? `/export/${projectId}/xml?preview=true&dimensionId=${encodeURIComponent(dimension.id)}`
      : `/export/${projectId}/xml?preview=true`;
    void apiText(path)
      .then((nextXml) => {
        if (cancelled) return;
        setXml(nextXml);
        setStatus("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setXml("");
        const message = error instanceof Error && error.message ? error.message : "XML preview unavailable.";
        setStatus(message.length > 200 ? `${message.slice(0, 200)}...` : message);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, xmlExportEnabled, scope, dimension.id]);

  useEffect(() => {
    setScope(mapDefaultScope(defaultScope, allowAllDimensions));
  }, [allowAllDimensions, defaultScope]);

  const preview = xml;
  
  // Calculate if the current dimension has errors
  const currentDimHasErrors = dimensionIssues.some((issue) => issue.severity === "error");

  // Enable download for current dimension if it has no errors, even if other dimensions do
  const downloadDisabled =
    scope === "dimension"
      ? currentDimHasErrors
      : exportAvailability.disabled;

  const downloadTitle = downloadDisabled
    ? scope === "dimension"
      ? "Dimension has validation errors. Fix errors to download."
      : exportAvailability.title
    : "Download XML";

  const downloadUrl =
    scope === "dimension"
      ? `/api/export/${projectId}/xml?dimensionId=${encodeURIComponent(dimension.id)}`
      : `/api/export/${projectId}/xml`;

  async function copy() {
    await navigator.clipboard.writeText(preview);
    setStatus("Copied XML");
  }

  return (
    <div className="panel xml-panel">
      <div className="xml-document">
        <div className="grid-toolbar xml-toolbar">
          <div className="xml-toolbar-title">
            <strong>OneStream XML</strong>
            <span>{scope === "all" ? "All dimensions" : dimension.dimensionName}</span>
          </div>
          <div className="xml-actions">
            <select
              className="xml-scope-control"
              aria-label="XML preview scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as XmlPreviewScope)}
            >
              {allowAllDimensions && <option value="all">All dimensions</option>}
              <option value="dimension">Current dimension</option>
            </select>
            <ActionButton aria-label="Copy XML preview" title="Copy XML preview" onClick={() => void copy()}><Copy size={15} /> Copy</ActionButton>
            {xmlExportEnabled && (
              <ActionLink
                className="button-link"
                aria-disabled={downloadDisabled}
                href={downloadDisabled ? undefined : downloadUrl}
                onClick={(event) => {
                  if (downloadDisabled) event.preventDefault();
                }}
                tabIndex={downloadDisabled ? -1 : undefined}
                download
                title={downloadTitle}
              >
                <Download size={15} /> Download XML
              </ActionLink>
            )}
            <StatusBadge tone={status ? "info" : "neutral"}>{status || "Preview ready"}</StatusBadge>
          </div>
        </div>
        <pre className="xml-preview xml-code-frame">{preview || "XML preview appears after import."}</pre>
      </div>
    </div>
  );
}
