/**
 * PlayerProfile.jsx
 *
 * Modal: accolades/legacy badges + position-aware career stats table.
 */
import React, { useEffect, useState } from 'react';
import { useWorker } from '../hooks/useWorker.js';
import TraitBadge from './TraitBadge';

// ── Accolade badge config ─────────────────────────────────────────────────────

const ACCOLADE_META = {
  SB_RING: { icon: '🏆', label: yr => `${yr} SB Champ` },
  SB_MVP:  { icon: '🌟', label: yr => `${yr} SB MVP`   },
  MVP:     { icon: '🏅', label: yr => `${yr} MVP`      },
  OPOY:    { icon: '⚡',  label: yr => `${yr} OPOY`    },
  DPOY:    { icon: '🛡️',  label: yr => `${yr} DPOY`   },
  ROTY:    { icon: '🌱', label: yr => `${yr} ROTY`     },
};

// ── Position group → stat column definitions ──────────────────────────────────

function computePasserRating(t) {
  const att = t.passAtt || 0;
  if (att === 0) return '-';
  const a = Math.max(0, Math.min(2.375, ((t.passComp || 0) / att - 0.3) / 0.2));
  const b = Math.max(0, Math.min(2.375, ((t.passYd   || 0) / att - 3)   / 4));
  const c = Math.max(0, Math.min(2.375, ((t.passTD   || 0) / att)        / 0.05));
  const d = Math.max(0, Math.min(2.375, 2.375 - ((t.interceptions || 0) / att) / 0.04));
  return (((a + b + c + d) / 6) * 100).toFixed(1);
}

const POS_COLUMNS = {
  QB: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'passAtt',      label: 'Att'     },
    { key: 'passComp',     label: 'Cmp'     },
    { key: 'passYd',       label: 'Pass Yds', hi: 3000 },
    { key: 'passTD',       label: 'TD'      },
    { key: 'interceptions',label: 'INT'     },
    { key: 'sacks',        label: 'Sacked'  },
    { key: '_compPct',     label: 'Cmp%',   fmt: t => t.passAtt ? ((t.passComp || 0) / t.passAtt * 100).toFixed(1) + '%' : '-' },
    { key: '_passer',      label: 'RTG',    fmt: computePasserRating },
  ],
  RB: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'rushAtt',      label: 'Car'     },
    { key: 'rushYd',       label: 'Rush Yds', hi: 1000 },
    { key: 'rushTD',       label: 'TD'      },
    { key: '_ypc',         label: 'YPC',    fmt: t => t.rushAtt ? ((t.rushYd || 0) / t.rushAtt).toFixed(1) : '-' },
    { key: 'receptions',   label: 'Rec'     },
    { key: 'recYd',        label: 'Rec Yds' },
    { key: 'recTD',        label: 'RecTD'   },
    { key: 'fumbles',      label: 'Fum'     },
  ],
  WR: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'targets',      label: 'Tgt'     },
    { key: 'receptions',   label: 'Rec'     },
    { key: 'recYd',        label: 'Rec Yds', hi: 1000 },
    { key: 'recTD',        label: 'TD'      },
    { key: '_catchPct',    label: 'Catch%', fmt: t => t.targets ? ((t.receptions || 0) / t.targets * 100).toFixed(1) + '%' : '-' },
    { key: 'yardsAfterCatch', label: 'YAC' },
  ],
  TE: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'targets',      label: 'Tgt'     },
    { key: 'receptions',   label: 'Rec'     },
    { key: 'recYd',        label: 'Rec Yds', hi: 700 },
    { key: 'recTD',        label: 'TD'      },
    { key: '_catchPct',    label: 'Catch%', fmt: t => t.targets ? ((t.receptions || 0) / t.targets * 100).toFixed(1) + '%' : '-' },
    { key: 'yardsAfterCatch', label: 'YAC' },
  ],
  OL: [
    { key: 'gamesPlayed',   label: 'GP'       },
    { key: 'passBlockSnaps', label: 'PB Snaps' },
    { key: 'runBlockSnaps',  label: 'RB Snaps' },
    { key: 'sacksAllowed',   label: 'Sacks Alwd' },
  ],
  DL: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'tackles',      label: 'Tkl'     },
    { key: 'sacks',        label: 'Sacks', hi: 5 },
    { key: 'tacklesForLoss', label: 'TFL'  },
    { key: 'forcedFumbles', label: 'FF'    },
    { key: 'fumbleRecoveries', label: 'FR' },
    { key: 'pressures',    label: 'Pres'   },
    { key: 'passRushSnaps', label: 'Rush Snaps' },
  ],
  LB: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'tackles',      label: 'Tkl', hi: 80 },
    { key: 'sacks',        label: 'Sacks'   },
    { key: 'tacklesForLoss', label: 'TFL'   },
    { key: 'forcedFumbles', label: 'FF'    },
    { key: 'interceptions', label: 'INT'   },
    { key: 'passesDefended', label: 'PD'   },
  ],
  CB: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'tackles',      label: 'Tkl'     },
    { key: 'interceptions', label: 'INT', hi: 3 },
    { key: 'passesDefended', label: 'PD'   },
    { key: 'targetsAllowed', label: 'Tgt Alwd' },
    { key: 'completionsAllowed', label: 'Cmp Alwd' },
  ],
  S: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'tackles',      label: 'Tkl', hi: 80 },
    { key: 'interceptions', label: 'INT', hi: 3 },
    { key: 'passesDefended', label: 'PD'   },
    { key: 'targetsAllowed', label: 'Tgt Alwd' },
  ],
  K: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'fgMade',       label: 'FGM'     },
    { key: 'fgAttempts',   label: 'FGA'     },
    { key: '_fgPct',       label: 'FG%',    fmt: t => t.fgAttempts ? ((t.fgMade || 0) / t.fgAttempts * 100).toFixed(1) + '%' : '-' },
    { key: 'longestFG',    label: 'Lng'     },
    { key: 'xpMade',       label: 'XPM'     },
    { key: 'xpAttempts',   label: 'XPA'     },
  ],
  P: [
    { key: 'gamesPlayed',  label: 'GP'      },
    { key: 'punts',        label: 'Punts'   },
    { key: 'puntYards',    label: 'Yds'     },
    { key: '_avgPunt',     label: 'Avg',    fmt: t => t.punts ? ((t.puntYards || 0) / t.punts).toFixed(1) : '-' },
    { key: 'longestPunt',  label: 'Lng'     },
  ],
};

function getColumns(pos) {
  if (!pos) return POS_COLUMNS.QB;
  const p = pos.toUpperCase();
  if (POS_COLUMNS[p]) return POS_COLUMNS[p];
  if (['DE', 'DT', 'EDGE'].includes(p)) return POS_COLUMNS.DL;
  if (['SS', 'FS'].includes(p))         return POS_COLUMNS.S;
  if (['OT', 'OG', 'C', 'G', 'T'].includes(p)) return POS_COLUMNS.OL;
  return POS_COLUMNS.QB; // fallback
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(t, col) {
  if (col.fmt) return col.fmt(t);
  const v = t[col.key];
  if (v === undefined || v === null) return '-';
  return v;
}

function isHigh(t, col) {
  if (!col.hi) return false;
  const v = t[col.key];
  return typeof v === 'number' && v >= col.hi;
}

function seasonYear(seasonId) {
  if (!seasonId) return '?';
  if (seasonId.startsWith('s')) {
    const n = parseInt(seasonId.replace('s', ''), 10);
    return isNaN(n) ? seasonId : 2024 + n;
  }
  return seasonId;
}

// ── Extension Modal ───────────────────────────────────────────────────────────

function ExtensionModal({ player, actions, teamId, onClose, onComplete }) {
  const [ask, setAsk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    actions.getExtensionAsk(player.id).then(resp => {
      if (resp.payload?.ask) setAsk(resp.payload.ask);
      setLoading(false);
    }).catch(() => setLoading(false));
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
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 10000,
    }}>
      <div className="card" style={{ width: 400, padding: 'var(--space-6)', boxShadow: 'var(--shadow-lg)', background: 'var(--surface)' }}>
        <h3 style={{ marginTop: 0 }}>Extend {player.name}</h3>
        {loading ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Negotiating…</div>
        ) : ask ? (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Agent Demand:</p>
            <div style={{
              fontSize: '1.5em', fontWeight: 800, margin: 'var(--space-4) 0',
              color: 'var(--accent)', textAlign: 'center',
              background: 'var(--surface-strong)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
            }}>
              {ask.years} Years<br/>
              <span style={{ fontSize: '0.6em', color: 'var(--text)' }}>${ask.baseAnnual}M / yr</span>
            </div>
            <div style={{ fontSize: '0.85em', color: 'var(--text-subtle)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              Includes ${ask.signingBonus}M Signing Bonus
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Reject</button>
              <button className="btn btn-primary" onClick={handleAccept}
                style={{ background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }}>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerProfile({ playerId, onClose }) {
  const { actions } = useWorker();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [extending, setExtending] = useState(false);

  const fetchProfile = () => {
    if (!playerId) return;
    setLoading(true);
    actions.getPlayerCareer(playerId)
      .then(response => { setData(response.payload ?? response); setLoading(false); })
      .catch(err => { console.error('Failed to load player profile:', err); setLoading(false); });
  };

  useEffect(() => { fetchProfile(); }, [playerId]);

  if (!playerId) return null;

  const player  = data?.player;
  const stats   = data?.stats ?? [];
  const columns = getColumns(player?.pos);

  // Group accolades: condense SB_RING into count
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const ringCount = accolades.filter(a => a.type === 'SB_RING').length;
  const nonRing   = accolades.filter(a => a.type !== 'SB_RING').sort((a, b) => b.year - a.year);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', width: '92%', maxWidth: 960,
          maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)', border: '1px solid var(--hairline)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: 'var(--space-5)', borderBottom: '1px solid var(--hairline)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          background: 'var(--surface-strong)',
        }}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : player ? (
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flex: 1 }}>
              {/* Avatar */}
              <div style={{
                width: 68, height: 68, borderRadius: '50%', background: 'var(--surface-sunken)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0,
              }}>
                {player.pos}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{player.name}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                  {player.pos} · Age {player.age} ·{' '}
                  {player.status === 'active'
                    ? (player.teamId != null ? `Team ${player.teamId}` : 'Free Agent')
                    : 'Retired'}
                </div>

                {/* OVR + potential */}
                <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span className={`rating-pill rating-color-${player.ovr >= 85 ? 'elite' : player.ovr >= 75 ? 'good' : 'avg'}`}>
                    {player.ovr} OVR
                  </span>
                  {player.potential && (
                    <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>
                      Pot: {player.potential}
                    </span>
                  )}
                </div>

                {/* Traits */}
                {player.traits?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {player.traits.map(t => <TraitBadge key={t} traitId={t} />)}
                  </div>
                )}

                {/* ── Accolades / Legacy ── */}
                {(ringCount > 0 || nonRing.length > 0) && (
                  <div style={{
                    marginTop: 'var(--space-3)',
                    display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
                  }}>
                    {ringCount > 0 && (
                      <span style={badgeStyle('#B8860B', '#ffe066')}>
                        🏆 {ringCount}x SB Champ
                      </span>
                    )}
                    {nonRing.map((acc, i) => {
                      const meta = ACCOLADE_META[acc.type];
                      if (!meta) return null;
                      return (
                        <span key={i} style={badgeStyle('var(--accent)', 'var(--surface-strong)')}>
                          {meta.icon} {meta.label(acc.year)}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Extension button */}
                {player.status === 'active' && player.contract?.years === 1 && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <button
                      className="btn"
                      onClick={() => setExtending(true)}
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 12px', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                    >
                      Negotiate Extension
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Player not found</div>
          )}

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, color: 'var(--text-muted)', padding: 'var(--space-1)', marginLeft: 'var(--space-2)' }}
          >×</button>
        </div>

        {/* ── Career Stats ── */}
        <div style={{ padding: 'var(--space-5)', flex: 1 }}>
          <h3 style={{ marginTop: 0, fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Career Stats</h3>

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading stats…</p>
          ) : stats.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No career stats recorded yet.</p>
          ) : (
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="standings-table" style={{ width: '100%', minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 'var(--space-4)', textAlign: 'left' }}>Year</th>
                    <th style={{ textAlign: 'left' }}>Team</th>
                    {columns.map(col => (
                      <th key={col.key} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...stats].sort((a, b) => (b.seasonId || '').localeCompare(a.seasonId || '')).map((s, i) => {
                    const t = s.totals || {};
                    return (
                      <tr key={i}>
                        <td style={{ paddingLeft: 'var(--space-4)', fontWeight: 600 }}>
                          {seasonYear(s.seasonId)}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                          {s.teamId != null ? `T${s.teamId}` : 'FA'}
                        </td>
                        {columns.map(col => (
                          <td
                            key={col.key}
                            style={{
                              textAlign: 'center',
                              color: isHigh(t, col) ? 'var(--accent)' : 'var(--text)',
                              fontWeight: isHigh(t, col) ? 700 : 400,
                            }}
                          >
                            {fmt(t, col)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Career totals row */}
          {!loading && stats.length > 1 && (() => {
            const totals = {};
            stats.forEach(s => {
              Object.entries(s.totals || {}).forEach(([k, v]) => {
                if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
              });
            });
            return (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-strong)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Career</span>
                {columns.filter(c => !c.fmt && c.key !== 'gamesPlayed').slice(0, 6).map(col => {
                  const v = totals[col.key];
                  if (v === undefined) return null;
                  return (
                    <span key={col.key} style={{ fontSize: 'var(--text-sm)' }}>
                      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{col.label}</span>
                      <strong>{v}</strong>
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Extension modal */}
      {extending && player && (
        <ExtensionModal
          player={player}
          actions={actions}
          teamId={player.teamId}
          onClose={() => setExtending(false)}
          onComplete={() => { setExtending(false); fetchProfile(); }}
        />
      )}

      <style>{`
        .rating-pill {
          display: inline-block; padding: 2px 8px;
          border-radius: var(--radius-pill);
          font-weight: 700; font-size: var(--text-sm); color: #fff;
        }
        .rating-color-elite { background: var(--accent); }
        .rating-color-good  { background: var(--success); }
        .rating-color-avg   { background: var(--warning); }
        .rating-color-bad   { background: var(--danger); }
      `}</style>
    </div>
  );
}

function badgeStyle(borderColor, bg) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-xs)', fontWeight: 700,
    border: `1px solid ${borderColor}`,
    background: bg,
    color: 'var(--text)',
  };
}
