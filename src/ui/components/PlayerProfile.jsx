/**
 * PlayerProfile.jsx
 *
 * Modal component that displays detailed player info and career stats.
 */
import React, { useEffect, useState } from 'react';
import { useWorker } from '../hooks/useWorker.js';

export default function PlayerProfile({ playerId, onClose }) {
  const { actions } = useWorker();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    let mounted = true;
    setLoading(true);

    actions.getPlayerCareer(playerId)
      .then(response => {
        if (mounted) {
          setData(response);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load player profile:', err);
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [playerId, actions]);

  if (!playerId) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', width: '90%', maxWidth: 900,
        maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)', border: '1px solid var(--hairline)',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* Injury Banner */}
        {data?.player?.injuries?.some(i => i.weeksRemaining > 0) && (
          <div style={{
            background: 'var(--danger)', color: '#fff', padding: 'var(--space-2) var(--space-5)',
            fontSize: 'var(--text-sm)', fontWeight: 700, textAlign: 'center'
          }}>
            INJURED: {data.player.injuries.find(i => i.weeksRemaining > 0).type} ({Math.max(...data.player.injuries.map(i=>i.weeksRemaining))} weeks remaining)
          </div>
        )}

        {/* Header */}
        <div style={{
          padding: 'var(--space-5)', borderBottom: '1px solid var(--hairline)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          background: 'var(--surface-strong)'
        }}>
          {loading ? (
             <div>Loading...</div>
          ) : data?.player ? (
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-sunken)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)'
              }}>
                {data.player.pos}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{data.player.name}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                   {data.player.pos} · {data.player.age} y/o · {data.player.status === 'active' ? (data.player.teamId !== null ? `Team ${data.player.teamId}` : 'Free Agent') : 'Retired'}
                </div>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <span className={`rating-pill rating-color-${data.player.ovr >= 85 ? 'elite' : data.player.ovr >= 75 ? 'good' : 'avg'}`}>
                    {data.player.ovr} OVR
                  </span>
                  {data.player.potential && (
                    <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>
                      Pot: {data.player.potential}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>Player not found</div>
          )}

          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem',
            lineHeight: 1, color: 'var(--text-muted)', padding: 'var(--space-1)'
          }}>×</button>
        </div>

        {/* Stats Table */}
        <div style={{ padding: 'var(--space-5)', flex: 1 }}>
          <h3 style={{ marginTop: 0, fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Career Stats</h3>

          {loading ? (
            <p>Loading stats...</p>
          ) : !data?.stats || data.stats.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No career stats recorded.</p>
          ) : (
            <div className="table-wrapper">
              <table className="standings-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 'var(--space-4)' }}>Year</th>
                    <th>Team</th>
                    <th style={{ textAlign: 'center' }}>GP</th>
                    <th style={{ textAlign: 'center' }}>Pass Yds</th>
                    <th style={{ textAlign: 'center' }}>Pass TD</th>
                    <th style={{ textAlign: 'center' }}>Int</th>
                    <th style={{ textAlign: 'center' }}>Rush Yds</th>
                    <th style={{ textAlign: 'center' }}>Rush TD</th>
                    <th style={{ textAlign: 'center' }}>Rec Yds</th>
                    <th style={{ textAlign: 'center' }}>Rec TD</th>
                    <th style={{ textAlign: 'center' }}>Sacks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.sort((a,b) => b.seasonId.localeCompare(a.seasonId)).map((s, i) => {
                    const t = s.totals || {};
                    // Logic to display year. Assumes s1 = 2025.
                    const year = s.seasonId.startsWith('s')
                      ? 2024 + parseInt(s.seasonId.replace('s',''))
                      : s.seasonId;

                    return (
                      <tr key={i}>
                        <td style={{ paddingLeft: 'var(--space-4)', fontWeight: 600 }}>{year}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.teamId ?? '-'}</td>
                        <td style={{ textAlign: 'center' }}>{t.gamesPlayed || '-'}</td>
                        <td style={{ textAlign: 'center', color: t.passingYards > 3000 ? 'var(--text)' : 'var(--text-muted)' }}>{t.passingYards || 0}</td>
                        <td style={{ textAlign: 'center' }}>{t.passTD || 0}</td>
                        <td style={{ textAlign: 'center' }}>{t.interceptions || 0}</td>
                        <td style={{ textAlign: 'center', color: t.rushingYards > 1000 ? 'var(--text)' : 'var(--text-muted)' }}>{t.rushingYards || 0}</td>
                        <td style={{ textAlign: 'center' }}>{t.rushTD || 0}</td>
                        <td style={{ textAlign: 'center', color: t.receivingYards > 1000 ? 'var(--text)' : 'var(--text-muted)' }}>{t.receivingYards || 0}</td>
                        <td style={{ textAlign: 'center' }}>{t.recTD || 0}</td>
                        <td style={{ textAlign: 'center' }}>{t.sacks || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
      <style>{`
        .rating-pill {
          display: inline-block; padding: 2px 8px; border-radius: var(--radius-pill);
          font-weight: 700; font-size: var(--text-sm); color: #fff;
        }
        .rating-color-elite { background: var(--accent); }
        .rating-color-good { background: var(--success); }
        .rating-color-avg { background: var(--warning); }
        .rating-color-bad { background: var(--danger); }
      `}</style>
    </div>
  );
}
