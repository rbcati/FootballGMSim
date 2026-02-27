import React, { useEffect, useState } from 'react';

export default function SaveManager({ actions, onCreate }) {
  const [saves, setSaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSaves = async () => {
    try {
      setLoading(true);
      const res = await actions.getAllSaves();
      const idbSaves = res.saves || [];
      if (idbSaves.length === 0) {
        // IDB returned nothing — check localStorage heartbeat manifest.
        // On iOS Safari PWA, IDB can be silently wiped while backgrounded.
        // The manifest is updated on every flushDirty() so it survives.
        try {
          const manifest = JSON.parse(localStorage.getItem('gmsim_save_manifest') || '[]');
          if (manifest.length > 0) {
            setError('Save index recovered from backup. Tap Load to attempt recovery.');
            setSaves(manifest.map(s => ({ ...s, recovered: true })));
            return;
          }
        } catch (_me) { /* ignore parse errors */ }
      }
      setSaves(idbSaves);
    } catch (err) {
      console.error(err);
      // IDB failure — fall back to localStorage manifest for recovery.
      try {
        const manifest = JSON.parse(localStorage.getItem('gmsim_save_manifest') || '[]');
        setSaves(manifest.map(s => ({ ...s, recovered: true })));
        setError(`IDB error — showing recovered saves: ${err.message}`);
      } catch (_me) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSaves();
  }, [actions]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this save? This cannot be undone.")) return;
    try {
      const res = await actions.deleteSave(id);
      setSaves(res.saves || []);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
            <div className="spinner"></div>
            <p className="muted">Loading saves...</p>
        </div>
      );
  }

  return (
    <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 'var(--space-4)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 600, padding: 'var(--space-6)' }}>
        <h1 style={{
            textAlign: 'center',
            marginBottom: 'var(--space-6)',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: 'var(--text-3xl)',
            fontWeight: 800
        }}>
          Football GM
        </h1>

        <h2 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-xl)' }}>Select Save</h2>

        {error && (
            <div style={{
                background: 'var(--error-bg)',
                color: 'var(--error-text)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)'
            }}>
                {error}
            </div>
        )}

        <div className="save-slot-list" style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 'var(--space-6)' }}>
          {saves.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
              No saves found. Start a new career!
            </div>
          ) : (
            saves.map(save => (
              <div key={save.id} className="save-slot">
                <div className="save-slot-details">
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text)' }}>{save.name}</div>
                  <div className="muted small">
                    {save.year} Season · {save.teamAbbr} · Last played: {new Date(save.lastPlayed).toLocaleDateString()}
                  </div>
                </div>
                <div className="save-slot-actions">
                  <button className="btn primary" onClick={() => actions.loadSave(save.id)}>
                    Load
                  </button>
                  <button className="btn danger" onClick={() => handleDelete(save.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button id="create-league-btn" className="btn primary" style={{ width: '100%', padding: 'var(--space-4)', fontSize: 'var(--text-lg)' }} onClick={onCreate}>
            + Create New League
          </button>
        </div>
      </div>
    </div>
  );
}
