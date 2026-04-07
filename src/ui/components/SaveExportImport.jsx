/**
 * SaveExportImport.jsx — Export/Import game saves as JSON files
 *
 * Allows users to download their save data and upload saves from files.
 */

import React, { useState, useCallback, useRef } from "react";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SaveExportImport({ league, actions }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importData, setImportData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const clearMessages = () => { setError(null); setSuccess(null); };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    clearMessages();
    setExporting(true);
    try {
      const resp = await actions?.exportSave?.();
      const exportData = resp?.payload?.data;
      if (!exportData) throw new Error('No export payload received');
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      const teamAbbr = league?.teams?.find(t => t.id === league.userTeamId)?.abbr || "SAVE";
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `footballgm_${teamAbbr}_${league?.year || "2025"}_${date}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Exported "${filename}" (${formatBytes(blob.size)})`);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }, [league, actions]);

  const handleExportConfig = useCallback(async () => {
    clearMessages();
    try {
      const resp = await actions?.exportLeagueConfig?.();
      const exportData = resp?.payload?.data;
      if (!exportData) throw new Error("No config payload received");
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `footballgm_config_${league?.year || "2025"}_${date}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Exported league config "${filename}"`);
    } catch (err) {
      setError(`Config export failed: ${err.message}`);
    }
  }, [actions, league]);

  // ── Import ─────────────────────────────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    clearMessages();
    setImportPreview(null);
    setImportData(null);

    if (!file.name.endsWith(".json")) {
      setError("Please select a .json file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("File too large (max 50MB)");
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const isSave = !!(data.snapshot && data.version);
      const isConfig = !!(data.leagueConfig || data?.version === 1);
      if (!isSave && !isConfig) {
        setError("Invalid file: expected full save export or league config export");
        return;
      }

      setImportPreview({
        version: data.version,
        exportDate: data.exportedAt || data.exportDate,
        year: data.meta?.year,
        week: data.meta?.currentWeek,
        phase: data.meta?.phase,
        teamName: data.meta?.name || "Unknown",
        teamAbbr: "???",
        teamRecord: "-",
        teamsCount: data.snapshot?.teams?.length || data?.leagueConfig?.identity?.teams?.length || 0,
        fileType: isConfig ? "config" : "save",
        fileSize: formatBytes(file.size),
        fileName: file.name,
      });
      setImportData(data);
    } catch (err) {
      setError(`Invalid file: ${err.message}`);
    }
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const confirmImport = useCallback(async () => {
    if (!importData) return;
    clearMessages();
    setImporting(true);
    try {
      if (importData?.snapshot) {
        await actions?.importSave?.(importData, `Imported ${new Date().toLocaleDateString()}`);
        setSuccess("Save imported. Loading league...");
        setTimeout(() => window.location.reload(), 800);
      } else {
        await actions?.importLeagueConfig?.(importData);
        setSuccess("League config imported.");
      }
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [importData, actions]);

  // ── Clipboard ──────────────────────────────────────────────────────────────
  const copyToClipboard = useCallback(async () => {
    clearMessages();
    try {
      const exportData = {
        version: "2.0",
        exportDate: new Date().toISOString(),
        league: {
          year: league?.year,
          week: league?.week,
          phase: league?.phase,
          userTeamId: league?.userTeamId,
          teams: league?.teams,
          schedule: league?.schedule,
        },
      };
      await navigator.clipboard.writeText(JSON.stringify(exportData));
      setSuccess("Save data copied to clipboard!");
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  }, [league]);

  const cardStyle = {
    background: "var(--surface)",
    borderRadius: "var(--radius-lg, 12px)",
    border: "1px solid var(--hairline)",
    padding: 16,
    marginBottom: 16,
  };

  const btnStyle = (primary) => ({
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 700,
    background: primary ? "var(--accent)" : "var(--surface-strong, #1a1a2e)",
    color: primary ? "white" : "var(--text)",
    border: "none",
    borderRadius: "var(--radius-md, 8px)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  });

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ fontSize: "var(--text-lg, 18px)", fontWeight: 800, color: "var(--text)", marginBottom: 16 }}>
        Save Management
      </h2>

      {/* Messages */}
      {error && (
        <div style={{ ...cardStyle, background: "rgba(255,69,58,0.08)", borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ ...cardStyle, background: "rgba(52,199,89,0.08)", borderColor: "var(--success)", color: "var(--success)", fontSize: 13, fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* Export Section */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Export Save</span>
        </div>

        {league && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            <div>Team: <strong style={{ color: "var(--text)" }}>{league.teams?.find(t => t.id === league.userTeamId)?.name || "N/A"}</strong></div>
            <div>Season: <strong style={{ color: "var(--text)" }}>{league.year}</strong> · Week {league.week} · {league.phase}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyle(true)} onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download Save File"}
          </button>
          <button style={btnStyle(false)} onClick={handleExportConfig}>
            Export League Config
          </button>
          <button style={btnStyle(false)} onClick={copyToClipboard}>
            Copy to Clipboard
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Import Save</span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: 24, textAlign: "center", borderRadius: "var(--radius-md, 8px)",
            border: `2px dashed ${dragActive ? "var(--accent)" : "var(--hairline)"}`,
            background: dragActive ? "var(--accent)" + "11" : "var(--surface-strong, #1a1a2e)",
            cursor: "pointer", transition: "all 0.2s",
            marginBottom: importPreview ? 12 : 0,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>📁</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {dragActive ? "Drop file here" : "Drop a save file or click to browse"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 4 }}>JSON files up to 50MB</div>
        </div>
        <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: "none" }} />

        {/* Import Preview */}
        {importPreview && (
          <div style={{
            padding: 12, borderRadius: "var(--radius-md, 8px)",
            background: "var(--surface-strong, #1a1a2e)", marginTop: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Save Preview
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <div>File: <strong>{importPreview.fileName}</strong> ({importPreview.fileSize})</div>
              <div>Team: <strong style={{ color: "var(--text)" }}>{importPreview.teamName} ({importPreview.teamAbbr})</strong></div>
              <div>Record: <strong>{importPreview.teamRecord}</strong></div>
              <div>Season: <strong>{importPreview.year}</strong> · Week {importPreview.week} · {importPreview.phase}</div>
              <div>Type: {importPreview.fileType === "config" ? "League Config" : "Full Save"} · Teams: {importPreview.teamsCount} · Version: {importPreview.version}</div>
              {importPreview.exportDate && <div>Exported: {formatDate(importPreview.exportDate)}</div>}
            </div>
            <div style={{
              marginTop: 8, padding: 8, borderRadius: 6,
              background: "rgba(255,159,10,0.08)", fontSize: 11, color: "var(--warning)",
            }}>
              Warning: Importing will overwrite your current save data
            </div>
            <button
              style={{ ...btnStyle(true), width: "100%", justifyContent: "center", marginTop: 12 }}
              onClick={confirmImport}
              disabled={importing}
            >
              {importing ? "Importing..." : "Confirm Import"}
            </button>
          </div>
        )}
      </div>

      {/* Backup Info */}
      <div style={{ ...cardStyle, opacity: 0.8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          Backup Tips
        </div>
        <ul style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
          <li>Export regularly to avoid losing progress</li>
          <li>Save files work across devices and browsers</li>
          <li>Keep multiple exports for different points in your franchise</li>
          <li>Clearing browser data will delete your local saves</li>
        </ul>
      </div>
    </div>
  );
}
