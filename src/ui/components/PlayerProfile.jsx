/**
 * PlayerProfile.jsx
 *
 * Modal component that displays detailed player info and career stats.
 */
import React, { useEffect, useState } from 'react';
import { useWorker } from '../hooks/useWorker.js';
import TraitBadge from './TraitBadge';

function ExtensionModal({ player, actions, teamId, onClose, onComplete }) {
  const [ask, setAsk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    actions.getExtensionAsk(player.id).then(resp => {
      if (resp.payload?.ask) setAsk(resp.payload.ask);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [player.id, actions]);

  const handleAccept = async () => {
    if (!ask) return;
    setLoading(true);
    await actions.extendContract(player.id, teamId, ask);
    onComplete();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000
    }}>
      <div className="card" style={{ width: 400, padding: 'var(--space-6)', boxShadow: 'var(--shadow-lg)', background: 'var(--surface)' }}>
        <h3 style={{ marginTop: 0 }}>Extend {player.name}</h3>
        {loading ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Negotiating...</div>
        ) : ask ? (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Agent Demand:</p>
            <div style={{
              fontSize: '1.5em', fontWeight: 800, margin: 'var(--space-4) 0',
              color: 'var(--accent)', textAlign: 'center',
              background: 'var(--surface-strong)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)'
            }}>
              {ask.years} Years<br/>
              <span style={{ fontSize: '0.6em', color: 'var(--text)' }}>${ask.baseAnnual}M / yr</span>
            </div>
            <div style={{ fontSize: '0.85em', color: 'var(--text-subtle)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              Includes ${ask.signingBonus}M Signing Bonus
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Reject</button>
              <button className="btn btn-primary" onClick={handleAccept} style={{ background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }}>
                Accept Deal
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p>Player refuses to negotiate at this time.</p>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerProfile({ playerId, onClose }) {
  const { actions } = useWorker();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);

  const fetchProfile = () => {
    if (!playerId) return;
    setLoading(true);
    actions.getPlayerCareer(playerId)
      .then(response => {
        setData(response);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load player profile:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProfile();
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
                {data.player.traits && data.player.traits.length > 0 && (
                  <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center' }}>
                    {data.player.traits.map(t => <TraitBadge key={t} traitId={t} />)}
                  </div>
                )}
                {data.player.status === 'active' && data.player.contract?.years === 1 && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <button
                      className="btn"
                      onClick={() => setExtending(true)}
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 12px', background: 'var(--surface)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                    >
                      Negotiate Extension
                    </button>
                  </div>
                )}
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
      {extending && data?.player && (
        <ExtensionModal
          player={data.player}
          actions={actions}
          teamId={data.player.teamId}
          onClose={() => setExtending(false)}
          onComplete={() => { setExtending(false); fetchProfile(); }}
        />
      )}
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
