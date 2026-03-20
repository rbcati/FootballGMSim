import React, { useEffect, useState, useCallback } from "react";

export default function SaveManager({ actions, onCreate }) {
  const [saves, setSaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingSaveId, setLoadingSaveId] = useState(null);
  const [saveErrors, setSaveErrors] = useState({});
  const [deletingId, setDeletingId] = useState(null);

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
            setError(
              "Save index recovered from backup. Some saves may not load.",
            );
            setSaves(manifest.map((s) => ({ ...s, recovered: true })));
            return;
          }
        } catch (_me) {
          /* ignore parse errors */
        }
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

  useEffect(() => {
    fetchSaves();
  }, [fetchSaves]);

  const handleLoad = useCallback(async (saveId) => {
    if (loadingSaveId) return;
    setLoadingSaveId(saveId);
    setSaveErrors((prev) => ({ ...prev, [saveId]: null }));

    try {
      await actions.loadSave(saveId);
      // If loadSave succeeds, App.jsx will transition to LeagueDashboard
      // Set a timeout to catch cases where load silently fails
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
    if (
      !window.confirm(
        "Are you sure you want to delete this save? This cannot be undone.",
      )
    )
      return;
    setDeletingId(id);
    setSaveErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await actions.deleteSave(id);
      const updated = res?.saves || res?.payload?.saves || [];
      setSaves(updated);
      // Also clean up localStorage manifest
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

  if (loading) {
    return (
      <div className="sm-loading">
        <div className="sm-loading-spinner" />
        <p className="sm-loading-text">Loading saves...</p>
        <style>{smStyles}</style>
      </div>
    );
  }

  return (
    <div className="sm-root">
      <style>{smStyles}</style>

      <div className="sm-container">
        {/* Hero / Brand */}
        <div className="sm-hero">
          <div className="sm-logo">
            <div className="sm-logo-icon">GM</div>
          </div>
          <h1 className="sm-title">Football GM</h1>
          <p className="sm-subtitle">Build your dynasty</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="sm-error-banner">
            <span>{error}</span>
            <button className="sm-error-dismiss" onClick={() => setError(null)}>
              &times;
            </button>
          </div>
        )}

        {/* Save list */}
        <div className="sm-section">
          <div className="sm-section-header">
            <h2 className="sm-section-title">Your Leagues</h2>
            <span className="sm-save-count">{saves.length} save{saves.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="sm-save-list">
            {saves.length === 0 ? (
              <div className="sm-empty">
                <div className="sm-empty-icon">🏈</div>
                <div className="sm-empty-text">No saves found</div>
                <div className="sm-empty-hint">Create a new league to get started!</div>
              </div>
            ) : (
              saves.map((save) => {
                const isLoading = loadingSaveId === save.id;
                const isDeleting = deletingId === save.id;
                const saveError = saveErrors[save.id];
                const isBusy = isLoading || isDeleting;
                const lastPlayed = save.lastPlayed
                  ? formatRelativeDate(save.lastPlayed)
                  : "Unknown";

                return (
                  <div
                    key={save.id}
                    className={`sm-save-card ${isLoading ? "sm-save-loading" : ""} ${saveError ? "sm-save-errored" : ""} ${save.recovered ? "sm-save-recovered" : ""}`}
                    onClick={() => !isBusy && !saveError && handleLoad(save.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && !isBusy && !saveError && handleLoad(save.id)}
                  >
                    {/* Team badge */}
                    <div className="sm-save-badge">
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
                        {save.teamAbbr && <span> &middot; {save.teamAbbr}</span>}
                        <span> &middot; {lastPlayed}</span>
                      </div>
                      {saveError && (
                        <div className="sm-save-error">{saveError}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="sm-save-actions" onClick={(e) => e.stopPropagation()}>
                      {isLoading ? (
                        <div className="sm-save-spinner" />
                      ) : saveError ? (
                        <button
                          className="sm-btn sm-btn-retry"
                          onClick={() => {
                            setSaveErrors((prev) => ({ ...prev, [save.id]: null }));
                          }}
                        >
                          Retry
                        </button>
                      ) : (
                        <button
                          className="sm-btn sm-btn-load"
                          disabled={isBusy}
                          onClick={() => handleLoad(save.id)}
                        >
                          Load
                        </button>
                      )}
                      <button
                        className="sm-btn sm-btn-delete"
                        disabled={isBusy}
                        onClick={() => handleDelete(save.id)}
                        title="Delete save"
                      >
                        {isDeleting ? "..." : "✕"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Create new league */}
        <button className="sm-create-btn" onClick={onCreate}>
          <span className="sm-create-icon">+</span>
          <span>Create New League</span>
        </button>
      </div>
    </div>
  );
}

function formatRelativeDate(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const smStyles = `
  .sm-loading {
    display: flex; justify-content: center; align-items: center;
    height: 100vh; flex-direction: column; gap: 1rem;
    background: var(--bg);
  }
  .sm-loading-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--hairline);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: smSpin 0.7s linear infinite;
  }
  .sm-loading-text { color: var(--text-muted); font-size: var(--text-sm); }

  .sm-root {
    min-height: 100vh; min-height: 100dvh;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    background-image: radial-gradient(ellipse at 50% 0%, rgba(10,132,255,0.08) 0%, transparent 60%);
    padding: var(--space-4);
    padding-top: max(var(--space-4), env(safe-area-inset-top));
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  }

  .sm-container {
    width: 100%; max-width: 520px;
    display: flex; flex-direction: column; gap: var(--space-6);
  }

  /* Hero */
  .sm-hero {
    text-align: center;
    padding: var(--space-8) 0 var(--space-2);
  }
  .sm-logo {
    display: flex; justify-content: center; margin-bottom: var(--space-4);
  }
  .sm-logo-icon {
    width: 64px; height: 64px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, var(--accent), #5E5CE6);
    display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 20px; color: #fff;
    box-shadow: 0 4px 24px rgba(10,132,255,0.3);
  }
  .sm-title {
    font-size: var(--text-3xl); font-weight: 900;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; letter-spacing: -0.5px;
  }
  .sm-subtitle {
    color: var(--text-muted); font-size: var(--text-sm); margin-top: var(--space-1);
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
    font-size: 18px; cursor: pointer; padding: 4px 8px;
    line-height: 1;
  }

  /* Section */
  .sm-section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .sm-section-title {
    font-size: var(--text-lg); font-weight: 700; color: var(--text);
  }
  .sm-save-count {
    font-size: var(--text-xs); color: var(--text-subtle);
    background: var(--surface); padding: 2px 10px;
    border-radius: var(--radius-pill);
  }

  /* Save list */
  .sm-save-list {
    display: flex; flex-direction: column; gap: var(--space-2);
    max-height: 55vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-right: var(--space-1);
  }

  /* Empty state */
  .sm-empty {
    text-align: center; padding: var(--space-8) var(--space-4);
    background: var(--surface); border-radius: var(--radius-lg);
    border: 1px dashed var(--hairline-strong);
  }
  .sm-empty-icon { font-size: 40px; margin-bottom: var(--space-3); }
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
    min-height: 64px;
    user-select: none; -webkit-user-select: none;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .sm-save-card:hover {
    background: var(--surface-strong);
    border-color: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(10,132,255,0.12);
  }
  .sm-save-card:active {
    transform: scale(0.99);
  }
  .sm-save-card.sm-save-loading {
    border-color: var(--accent);
    background: var(--accent-muted);
    pointer-events: none;
  }
  .sm-save-card.sm-save-errored {
    border-color: var(--danger);
    background: rgba(255,69,58,0.05);
    cursor: default;
  }
  .sm-save-card.sm-save-recovered {
    border-style: dashed;
  }

  /* Team badge */
  .sm-save-badge {
    width: 44px; height: 44px; flex-shrink: 0;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--accent), #5E5CE6);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12px; color: #fff;
    letter-spacing: -0.5px;
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
    font-size: var(--text-xs); color: var(--text-muted);
    margin-top: 2px;
  }
  .sm-save-error {
    font-size: 11px; color: var(--danger); margin-top: 4px;
    font-weight: 500;
  }

  /* Actions */
  .sm-save-actions {
    display: flex; align-items: center; gap: var(--space-2);
    flex-shrink: 0;
  }
  .sm-save-spinner {
    width: 24px; height: 24px;
    border: 2px solid var(--hairline);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: smSpin 0.6s linear infinite;
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
  }
  .sm-btn:disabled { opacity: 0.4; pointer-events: none; }
  .sm-btn-load {
    background: var(--accent); color: #fff;
  }
  .sm-btn-load:hover { background: var(--accent-hover); }
  .sm-btn-retry {
    background: var(--warning); color: #000;
  }
  .sm-btn-delete {
    background: transparent; color: var(--text-muted);
    font-size: 14px; padding: var(--space-2);
  }
  .sm-btn-delete:hover { color: var(--danger); background: rgba(255,69,58,0.1); }

  /* Create button */
  .sm-create-btn {
    display: flex; align-items: center; justify-content: center;
    gap: var(--space-3); width: 100%;
    padding: var(--space-4); border: none;
    background: linear-gradient(135deg, var(--accent), #5E5CE6);
    color: #fff; font-size: var(--text-base); font-weight: 800;
    border-radius: var(--radius-lg); cursor: pointer;
    transition: all 200ms ease;
    min-height: 56px;
    touch-action: manipulation;
    box-shadow: 0 4px 20px rgba(10,132,255,0.25);
  }
  .sm-create-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(10,132,255,0.35);
  }
  .sm-create-btn:active { transform: scale(0.98); }
  .sm-create-icon { font-size: 20px; font-weight: 400; }

  @keyframes smSpin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .sm-hero { padding: var(--space-6) 0 0; }
    .sm-title { font-size: var(--text-2xl); }
    .sm-save-card { padding: var(--space-3); }
    .sm-save-badge { width: 38px; height: 38px; font-size: 11px; }
  }
`;
