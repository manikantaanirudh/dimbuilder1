import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import { apiText } from "../api/client";

export function XmlPreview({ projectId, dimension }: { projectId: string; dimension: DimensionRecord }) {
  const [xml, setXml] = useState("");
  const [scope, setScope] = useState<"all" | "dimension">("all");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void apiText(`/export/${projectId}/xml`).then(setXml);
  }, [projectId]);

  const preview = scope === "all" ? xml : extractDimensionXml(xml, dimension.dimensionName);

  async function copy() {
    await navigator.clipboard.writeText(preview);
    setStatus("Copied XML");
  }

  return (
    <div className="panel xml-panel">
      <div className="grid-toolbar">
        <select value={scope} onChange={(event) => setScope(event.target.value as "all" | "dimension")}>
          <option value="all">All dimensions</option>
          <option value="dimension">Current dimension</option>
        </select>
        <button onClick={() => void copy()}><Copy size={15} /> Copy</button>
        <a className="button-link" href={`/api/export/${projectId}/xml`} target="_blank" rel="noreferrer"><Download size={15} /> Download XML</a>
        <span className="grid-status">{status}</span>
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

