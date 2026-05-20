import { useEffect, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { ActionButton } from "./ui";

export function ConfigEditor({ appConfig, onConfigSaved }: { appConfig: ClientAppConfig; onConfigSaved?: () => void }) {
  const [yamlText, setYamlText] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setYamlText(JSON.stringify(appConfig, null, 2));
  }, [appConfig]);

  async function handleSave() {
    setSaving(true);
    setStatus("Saving...");
    try {
      const parsed = JSON.parse(yamlText);
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      if (!response.ok) {
        setStatus(await response.text());
        return;
      }
      setStatus("Config saved and applied. Refresh to see changes.");
      onConfigSaved?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Administration</span>
            <h1>Configuration Editor</h1>
            <p>Edit the application configuration. Changes apply immediately.</p>
          </div>
          <ActionButton variant="primary" disabled={saving} onClick={() => void handleSave()}>
            Save Config
          </ActionButton>
        </div>
        {status && <div className="admin-status">{status}</div>}
        <textarea
          className="config-editor-textarea"
          value={yamlText}
          onChange={(e) => setYamlText(e.target.value)}
          spellCheck={false}
        />
      </div>
    </section>
  );
}
