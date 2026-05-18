import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import { apiText } from "../api/client";
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
  xmlExportEnabled = true
}: {
  projectId: string;
  dimension: DimensionRecord;
  defaultScope?: "currentDimension" | "allDimensions";
  allowAllDimensions?: boolean;
  xmlExportEnabled?: boolean;
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
    setStatus("Loading XML preview...");
    void apiText(`/export/${projectId}/xml`)
      .then((nextXml) => {
        if (cancelled) return;
        setXml(nextXml);
        setStatus("");
      })
      .catch(() => {
        if (cancelled) return;
        setXml("");
        setStatus("XML preview unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, xmlExportEnabled]);

  useEffect(() => {
    setScope(mapDefaultScope(defaultScope, allowAllDimensions));
  }, [allowAllDimensions, defaultScope]);

  const preview = scope === "all" ? xml : extractDimensionXml(xml, dimension.dimensionName);

  async function copy() {
    await navigator.clipboard.writeText(preview);
    setStatus("Copied XML");
  }

  return (
    <div className="panel xml-panel">
      <div className="grid-toolbar">
        <select value={scope} onChange={(event) => setScope(event.target.value as XmlPreviewScope)}>
          {allowAllDimensions && <option value="all">All dimensions</option>}
          <option value="dimension">Current dimension</option>
        </select>
        <ActionButton onClick={() => void copy()}><Copy size={15} /> Copy</ActionButton>
        {xmlExportEnabled && (
          <ActionLink className="button-link" href={`/api/export/${projectId}/xml`} target="_blank" rel="noreferrer"><Download size={15} /> Download XML</ActionLink>
        )}
        <StatusBadge tone={status ? "info" : "neutral"}>{status || "Preview ready"}</StatusBadge>
      </div>
      <pre className="xml-preview">{preview || "XML preview will appear after import."}</pre>
    </div>
  );
}

function extractDimensionXml(xml: string, dimensionName: string): string {
  const start = xml.indexOf(`name="${dimensionName}"`);
  if (start === -1) return xml;
  const dimensionStart = xml.lastIndexOf("<dimension", start);
  const dimensionEnd = xml.indexOf("</dimension>", start);
  if (dimensionStart === -1 || dimensionEnd === -1) return xml;
  return xml.slice(dimensionStart, dimensionEnd + "</dimension>".length);
}
