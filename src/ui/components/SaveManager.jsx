import React, { useEffect, useState, useCallback } from "react";
import { teamColor } from "../../data/team-utils.js";

export default function SaveManager({ actions, onCreate }) {
  const [saves, setSaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingSaveId, setLoadingSaveId] = useState(null);
  const [saveErrors, setSaveErrors] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchSaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await actions.getAllSaves();
      const idbSaves = res?.saves || res?.payload?.saves || [];
      if (idbSaves.length === 0) {
        try {
          const manifest = JSON.parse(
            localStorage.getItem("gmsim_save_manifest") || "[]",
          );
          if (manifest.length > 0) {
            setError("Save index recovered from backup. Some saves may not load.");
            setSaves(manifest.map((s) => ({ ...s, recovered: true })));
            return;
          }
        } catch (_me) { /* ignore */ }
      }
      setSaves(idbSaves);
    } catch (err) {
      console.error(err);
      try {
        const manifest = JSON.parse(
          localStorage.getItem("gmsim_save_manifest") || "[]",
        );
        setSaves(manifest.map((s) => ({ ...s, recovered: true })));
        setError(`Database error — showing recovered saves`);
      } catch (_me) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => { fetchSaves(); }, [fetchSaves]);

  const handleLoad = useCallback(async (saveId) => {
    if (loadingSaveId) return;
    setLoadingSaveId(saveId);
    setSaveErrors((prev) => ({ ...prev, [saveId]: null }));
    try {
      await actions.loadSave(saveId);
      setTimeout(() => {
        setLoadingSaveId((current) => {
          if (current === saveId) {
            setSaveErrors((prev) => ({
              ...prev,
              [saveId]: "Save data may be corrupted. Try deleting and starting fresh.",
            }));
            return null;
          }
          return current;
        });
      }, 8000);
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [saveId]: err.message || "Failed to load save",
      }));
      setLoadingSaveId(null);
    }
  }, [actions, loadingSaveId]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm("Delete this save permanently? This cannot be undone."))
      return;
    setDeletingId(id);
    setSaveErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await actions.deleteSave(id);
      const updated = res?.saves || res?.payload?.saves || [];
      setSaves(updated);
      try {
        const manifest = JSON.parse(
          localStorage.getItem("gmsim_save_manifest") || "[]",
        );
        const filtered = manifest.filter((s) => s.id !== id);
        localStorage.setItem("gmsim_save_manifest", JSON.stringify(filtered));
      } catch (_) {}
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [id]: "Delete failed: " + err.message,
      }));
    } finally {
      setDeletingId(null);
    }
  }, [actions]);

  const handleRenameStart = useCallback((save) => {
    setRenamingId(save.id);
    setRenameValue(save.name || `League ${save.id?.slice(0, 6)}`);
  }, []);

  const handleRenameConfirm = useCallback(async (id) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      const res = await actions.renameSave(id, trimmed);
      const updated = res?.saves || res?.payload?.saves || [];
      if (updated.length > 0) setSaves(updated);
      else setSaves(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s));
    } catch (err) {
      setSaveErrors(prev => ({ ...prev, [id]: "Rename failed: " + err.message }));
    } finally {
      setRenamingId(null);
    }
  }, [actions, renameValue]);

  if (loading) {
    return (
      <div className="sm-root">
        <style>{smStyles}</style>
        <div className="sm-container" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="sm-loading-spinner" />
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: 12 }}>
            Loading saves...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sm-root">
      <style>{smStyles}</style>

      <div className="sm-container">
        {/* Hero */}
        <div className="sm-hero">
          <div className="sm-hero-bg" />
          <div className="sm-logo-ring">
            <div className="sm-logo-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="12" rx="10" ry="6" />
                <path d="M12 6v12" />
                <path d="M8 8.5l8 7" />
                <path d="M16 8.5l-8 7" />
              </svg>
            </div>
          </div>
          <h1 className="sm-title">Football GM</h1>
          <p className="sm-subtitle">Build your dynasty. Own the league.</p>
          <div className="sm-version">v2.0</div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="sm-error-banner fade-in">
            <span>{error}</span>
            <button className="sm-error-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Create new league — prominent CTA */}
        <button className="sm-create-btn fade-in-up" onClick={onCreate}>
          <div className="sm-create-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="sm-create-text">
            <span className="sm-create-label">New Career</span>
            <span className="sm-create-desc">Start a new franchise from scratch</span>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.5, flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Saved leagues */}
        {saves.length > 0 && (
          <div className="sm-section fade-in-up stagger-2">
            <div className="sm-section-header">
              <h2 className="sm-section-title">Continue Playing</h2>
              <span className="sm-save-count">{saves.length}</span>
            </div>

            <div className="sm-save-list">
              {saves.map((save, idx) => {
                const isLoading = loadingSaveId === save.id;
                const isDeleting = deletingId === save.id;
                const saveError = saveErrors[save.id];
                const isBusy = isLoading || isDeleting;
                const lastPlayed = save.lastPlayed ? formatRelativeDate(save.lastPlayed) : "Unknown";
                const color = teamColor(save.teamAbbr || "");

                return (
                  <div
                    key={save.id}
                    className={`sm-save-card ${isLoading ? "sm-save-loading" : ""} ${saveError ? "sm-save-errored" : ""} ${save.recovered ? "sm-save-recovered" : ""}`}
                    onClick={() => !isBusy && !saveError && handleLoad(save.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && !isBusy && !saveError && handleLoad(save.id)}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    {/* Team badge with team color */}
                    <div
                      className="sm-save-badge"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                    >
                      {save.teamAbbr || "???"}
                    </div>

                    {/* Info */}
                    <div className="sm-save-info">
                      <div className="sm-save-name">
                        {save.name || `League ${save.id?.slice(0, 6)}`}
                        {save.recovered && (
                          <span className="sm-save-recovered-tag">Recovered</span>
                        )}
                      </div>
                      <div className="sm-save-meta">
                        {save.year && <span>{save.year} Season</span>}
                        {save.teamAbbr && <span> · {save.teamAbbr}</span>}
                        <span> · {lastPlayed}</span>
                      </div>
                      {saveError && (
                        <div className="sm-save-error">{saveError}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="sm-save-actions" onClick={(e) => e.stopPropagation()}>
                      {renamingId === save.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleRenameConfirm(save.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            style={{
                              fontSize: 12, padding: "3px 7px",
                              background: "var(--surface)", color: "var(--text)",
                              border: "1px solid var(--accent)", borderRadius: 5,
                              width: 120, outline: "none",
                            }}
                          />
                          <button
                            className="sm-btn sm-btn-load"
                            onClick={() => handleRenameConfirm(save.id)}
                            style={{ padding: "3px 8px", fontSize: 11 }}
                          >✓</button>
                          <button
                            className="sm-btn sm-btn-delete"
                            onClick={() => setRenamingId(null)}
                            style={{ padding: "3px 8px", fontSize: 11 }}
                          >✕</button>
                        </div>
                      ) : (
                        <>
                          {isLoading ? (
                            <div className="sm-save-spinner" />
                          ) : saveError ? (
                            <button
                              className="sm-btn sm-btn-retry"
                              onClick={() => setSaveErrors((prev) => ({ ...prev, [save.id]: null }))}
                            >
                              Retry
                            </button>
                          ) : (
                            <button
                              className="sm-btn sm-btn-load"
                              disabled={isBusy}
                              onClick={() => handleLoad(save.id)}
                            >
                              Play
                            </button>
                          )}
                          <button
                            className="sm-btn sm-btn-delete"
                            disabled={isBusy}
                            onClick={() => handleRenameStart(save)}
                            title="Rename save"
                            style={{ opacity: isBusy ? 0.4 : 1 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="sm-btn sm-btn-delete"
                            disabled={isBusy}
                            onClick={() => handleDelete(save.id)}
                            title="Delete save"
                          >
                            {isDeleting ? (
                              <div className="sm-save-spinner" style={{ width: 16, height: 16 }} />
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {saves.length === 0 && (
          <div className="sm-empty fade-in-up stagger-2">
            <div className="sm-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="1.5" strokeLinecap="round">
                <ellipse cx="12" cy="12" rx="10" ry="6" />
                <path d="M12 6v12" />
                <path d="M8 8.5l8 7" />
                <path d="M16 8.5l-8 7" />
              </svg>
            </div>
            <div className="sm-empty-text">No saved careers</div>
            <div className="sm-empty-hint">Create a new career to start building your dynasty</div>
          </div>
        )}

        {/* Footer */}
        <div className="sm-footer">
          <span>Football GM Simulator</span>
          <span>·</span>
          <span>100% Free & Offline</span>
        </div>
      </div>
    </div>
  );
}

function formatRelativeDate(timestamp) {
  const normalizeEpoch = (value) => {
    if (!Number.isFinite(value)) return NaN;
    return value < 1e12 ? value * 1000 : value;
  };

  let parsed = NaN;
  if (typeof timestamp === "number") {
    parsed = normalizeEpoch(timestamp);
  } else if (typeof timestamp === "string") {
    const trimmed = timestamp.trim();
    if (/^\d+$/.test(trimmed)) {
      parsed = normalizeEpoch(Number(trimmed));
    } else {
      parsed = Date.parse(trimmed);
    }
  }

  if (!Number.isFinite(parsed)) return "Unknown";
  const now = Date.now();
  const diff = Math.max(0, now - parsed);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const smStyles = `
  .sm-root {
    min-height: 100vh; min-height: 100dvh;
    display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(ellipse 120% 80% at 50% -20%, rgba(10,132,255,0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 100%, rgba(94,92,230,0.04) 0%, transparent 50%),
      var(--bg);
    padding: var(--space-4);
    padding-top: max(var(--space-4), env(safe-area-inset-top));
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  }

  .sm-container {
    width: 100%; max-width: 520px;
    display: flex; flex-direction: column; gap: var(--space-5);
  }

  /* Hero */
  .sm-hero {
    text-align: center;
    padding: var(--space-10) 0 var(--space-4);
    position: relative;
    animation: fadeInDown 0.5s var(--ease) both;
  }

  .sm-hero-bg {
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle at 50% 30%, rgba(10,132,255,0.08) 0%, transparent 60%);
    pointer-events: none;
  }

  .sm-logo-ring {
    display: flex; justify-content: center; margin-bottom: var(--space-5);
    position: relative;
  }

  .sm-logo-icon {
    width: 72px; height: 72px;
    border-radius: var(--radius-2xl);
    background: linear-gradient(135deg, var(--accent), #5E5CE6);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    box-shadow:
      0 4px 24px rgba(10,132,255,0.3),
      0 0 0 4px var(--bg),
      0 0 0 6px rgba(10,132,255,0.15);
    position: relative;
  }

  .sm-title {
    font-size: clamp(1.75rem, 6vw, 2.25rem);
    font-weight: 900;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; letter-spacing: -1px;
    margin-bottom: var(--space-1);
    position: relative;
  }

  .sm-subtitle {
    color: var(--text-muted); font-size: var(--text-sm);
    position: relative;
  }

  .sm-version {
    display: inline-block;
    margin-top: var(--space-3);
    font-size: 10px;
    font-weight: 700;
    color: var(--text-subtle);
    background: var(--surface);
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    letter-spacing: 0.5px;
    position: relative;
  }

  /* Error banner */
  .sm-error-banner {
    display: flex; align-items: center; gap: var(--space-3);
    background: rgba(255,69,58,0.1); color: var(--danger);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm); font-weight: 500;
    border: 1px solid rgba(255,69,58,0.2);
  }
  .sm-error-banner span { flex: 1; }
  .sm-error-dismiss {
    background: none; border: none; color: var(--danger);
    font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1;
  }

  /* Create button — premium CTA */
  .sm-create-btn {
    display: flex; align-items: center; gap: var(--space-4);
    width: 100%; padding: var(--space-4) var(--space-5);
    border: 1px solid rgba(10,132,255,0.3);
    background: linear-gradient(135deg, rgba(10,132,255,0.1), rgba(94,92,230,0.08));
    color: #fff; font-size: var(--text-base);
    border-radius: var(--radius-xl); cursor: pointer;
    transition: all 200ms ease;
    min-height: 72px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    text-align: left;
  }
  .sm-create-btn:hover {
    background: linear-gradient(135deg, rgba(10,132,255,0.15), rgba(94,92,230,0.12));
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(10,132,255,0.2);
  }
  .sm-create-btn:active { transform: scale(0.99); }

  .sm-create-icon-wrap {
    width: 44px; height: 44px; flex-shrink: 0;
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--accent), #5E5CE6);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    box-shadow: 0 4px 16px rgba(10,132,255,0.3);
  }

  .sm-create-text { flex: 1; }
  .sm-create-label {
    display: block; font-weight: 800; font-size: var(--text-base);
    color: var(--text); letter-spacing: -0.3px;
  }
  .sm-create-desc {
    display: block; font-size: var(--text-xs); color: var(--text-muted);
    margin-top: 2px; font-weight: 400;
  }

  /* Section */
  .sm-section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .sm-section-title {
    font-size: var(--text-base); font-weight: 800; color: var(--text);
    letter-spacing: -0.3px;
  }
  .sm-save-count {
    font-size: var(--text-xs); color: var(--text-subtle);
    background: var(--surface); padding: 2px 10px;
    border-radius: var(--radius-pill); font-weight: 700;
  }

  /* Save list */
  .sm-save-list {
    display: flex; flex-direction: column; gap: var(--space-2);
    max-height: 50vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-right: var(--space-1);
  }

  /* Empty state */
  .sm-empty {
    text-align: center; padding: var(--space-8) var(--space-4);
    background: var(--surface); border-radius: var(--radius-lg);
    border: 1px dashed var(--hairline-strong);
  }
  .sm-empty-icon { margin-bottom: var(--space-3); }
  .sm-empty-text { font-weight: 700; color: var(--text); margin-bottom: var(--space-1); }
  .sm-empty-hint { color: var(--text-muted); font-size: var(--text-sm); }

  /* Save card */
  .sm-save-card {
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 150ms ease;
    min-height: 68px;
    user-select: none; -webkit-user-select: none;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    animation: fadeInUp 0.3s var(--ease) both;
  }
  .sm-save-card:hover {
    background: var(--surface-strong);
    border-color: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(10,132,255,0.1);
  }
  .sm-save-card:active { transform: scale(0.99); }
  .sm-save-card.sm-save-loading {
    border-color: var(--accent);
    background: var(--accent-muted);
    pointer-events: none;
    animation: borderPulse 1.5s ease infinite;
  }
  .sm-save-card.sm-save-errored {
    border-color: var(--danger);
    background: rgba(255,69,58,0.05);
    cursor: default;
  }
  .sm-save-card.sm-save-recovered { border-style: dashed; }

  /* Team badge */
  .sm-save-badge {
    width: 44px; height: 44px; flex-shrink: 0;
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12px; color: #fff;
    letter-spacing: -0.5px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  /* Save info */
  .sm-save-info { flex: 1; min-width: 0; }
  .sm-save-name {
    font-weight: 700; font-size: var(--text-sm); color: var(--text);
    display: flex; align-items: center; gap: var(--space-2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sm-save-recovered-tag {
    font-size: 10px; font-weight: 700; color: var(--warning);
    background: var(--warning-bg); padding: 1px 6px;
    border-radius: var(--radius-pill); flex-shrink: 0;
  }
  .sm-save-meta {
    font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;
  }
  .sm-save-error {
    font-size: 11px; color: var(--danger); margin-top: 4px; font-weight: 500;
  }

  /* Actions */
  .sm-save-actions {
    display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;
  }
  .sm-save-spinner {
    width: 24px; height: 24px;
    border: 2px solid var(--hairline);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: smSpin 0.6s linear infinite;
  }
  .sm-loading-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--hairline);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: smSpin 0.7s linear infinite;
  }

  /* Buttons */
  .sm-btn {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs); font-weight: 700;
    border: none; cursor: pointer;
    min-height: 36px; min-width: 36px;
    touch-action: manipulation;
    transition: all 150ms ease;
    display: flex; align-items: center; justify-content: center;
  }
  .sm-btn:disabled { opacity: 0.4; pointer-events: none; }
  .sm-btn-load {
    background: var(--accent); color: #fff;
    padding: var(--space-2) var(--space-4);
  }
  .sm-btn-load:hover { background: var(--accent-hover); }
  .sm-btn-retry { background: var(--warning); color: #000; }
  .sm-btn-delete {
    background: transparent; color: var(--text-muted);
    padding: var(--space-2);
  }
  .sm-btn-delete:hover { color: var(--danger); background: rgba(255,69,58,0.1); }

  /* Footer */
  .sm-footer {
    display: flex; align-items: center; justify-content: center;
    gap: var(--space-2);
    font-size: 11px; color: var(--text-subtle);
    padding: var(--space-4) 0;
    opacity: 0.6;
  }

  @keyframes smSpin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .sm-hero { padding: var(--space-8) 0 var(--space-2); }
    .sm-title { font-size: var(--text-2xl); }
    .sm-save-card { padding: var(--space-3); }
    .sm-save-badge { width: 40px; height: 40px; font-size: 11px; }
    .sm-create-btn { padding: var(--space-3) var(--space-4); min-height: 64px; }
  }
`;
