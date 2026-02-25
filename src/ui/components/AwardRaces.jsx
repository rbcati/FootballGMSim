/**
 * AwardRaces.jsx
 *
 * ZenGM-style mid-season Award Races & Projected All-Pro Team viewer.
 *
 * Layout:
 *  - Week indicator header
 *  - Award Races sub-tabs: MVP | OPOY | DPOY | OROY | DROY | All-Pro
 *  - MVP: league-wide top-5 table
 *  - OPOY / DPOY / OROY / DROY: side-by-side AFC / NFC columns
 *  - All-Pro: 1st Team / 2nd Team depth chart grid
 */

import React, { useEffect, useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function posColor(pos) {
  const map = {
    QB: '#0A84FF', RB: '#34C759', WR: '#FF9F0A', TE: '#5E5CE6',
    OL: '#64D2FF', OT: '#64D2FF', OG: '#64D2FF', C: '#64D2FF',
    DL: '#FF453A', DE: '#FF453A', DT: '#FF453A', EDGE: '#FF453A',
    LB: '#FFD60A', CB: '#30D158', S: '#30D158', SS: '#30D158', FS: '#30D158',
    K: '#AEC6CF', P: '#AEC6CF',
  };
  return map[pos?.toUpperCase()] ?? 'var(--text-muted)';
}

function rankColor(rank) {
  if (rank === 1) return '#FFD60A';
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return 'var(--text-subtle)';
}

// ── Candidate row ─────────────────────────────────────────────────────────────

function CandidateRow({ candidate, rank, onPlayerSelect, showConf = false }) {
  if (!candidate) return null;
  const { name, pos, teamAbbr, keyStats = [], confLabel } = candidate;

  return (
    <div
      onClick={() => candidate.playerId != null && onPlayerSelect?.(candidate.playerId)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--hairline)',
        cursor: onPlayerSelect ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (onPlayerSelect) e.currentTarget.style.background = 'var(--surface-strong)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
    >
      {/* Rank */}
      <span style={{ width: 22, textAlign: 'center', fontWeight: 800, fontSize: 'var(--text-sm)', color: rankColor(rank), flexShrink: 0 }}>
        {rank}
      </span>

      {/* POS badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 6px',
        borderRadius: 'var(--radius-pill)', color: '#fff',
        background: posColor(pos), minWidth: 32, textAlign: 'center', flexShrink: 0,
      }}>
        {pos ?? '?'}
      </span>

      {/* Name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name ?? `Player ${candidate.playerId}`}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {teamAbbr ?? '???'}
          {showConf && confLabel ? ` · ${confLabel}` : ''}
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexShrink: 0 }}>
        {(keyStats ?? []).slice(0, 3).map((ks, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: 36 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{ks.label}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
              {typeof ks.value === 'number' ? ks.value.toLocaleString() : ks.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Award card ────────────────────────────────────────────────────────────────

function AwardCard({ title, subtitle, candidates = [], onPlayerSelect, showConf = false }) {
  if (candidates.length === 0) return (
    <div className="card" style={{ padding: 'var(--space-5)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 'var(--text-sm)' }}>
      No candidates yet — play through more weeks to see the race take shape.
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-strong)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)',
      }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>{subtitle}</span>
        )}
      </div>
      {candidates.map((c, i) => (
        <CandidateRow
          key={c.playerId ?? i}
          candidate={c}
          rank={i + 1}
          onPlayerSelect={onPlayerSelect}
          showConf={showConf}
        />
      ))}
    </div>
  );
}

// ── Conference split layout ───────────────────────────────────────────────────

function ConferenceSplit({ awardLabel, afcCandidates = [], nfcCandidates = [], onPlayerSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
      <AwardCard
        title={`${awardLabel} — AFC`}
        candidates={afcCandidates}
        onPlayerSelect={onPlayerSelect}
      />
      <AwardCard
        title={`${awardLabel} — NFC`}
        candidates={nfcCandidates}
        onPlayerSelect={onPlayerSelect}
      />
    </div>
  );
}

// ── MVP tab ───────────────────────────────────────────────────────────────────

function MVPTab({ award, onPlayerSelect }) {
  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 0, marginBottom: 'var(--space-5)' }}>
        League-wide ranking. QBs on winning teams carry a significant edge, but elite defensive performances can contend.
      </p>
      <AwardCard
        title="Most Valuable Player — League"
        candidates={award?.mvp?.league ?? []}
        onPlayerSelect={onPlayerSelect}
        showConf
      />
    </div>
  );
}

// ── OPOY tab ──────────────────────────────────────────────────────────────────

function OPOYTab({ award, onPlayerSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
        Best offensive player in each conference. QBs, RBs, WRs, and TEs all compete.
      </p>
      <ConferenceSplit
        awardLabel="Offensive Player of the Year"
        afcCandidates={award?.opoy?.afc ?? []}
        nfcCandidates={award?.opoy?.nfc ?? []}
        onPlayerSelect={onPlayerSelect}
      />
    </div>
  );
}

// ── DPOY tab ──────────────────────────────────────────────────────────────────

function DPOYTab({ award, onPlayerSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
        Best defensive player in each conference. Pass rushers, shutdown corners, and tackling machines all contend.
      </p>
      <ConferenceSplit
        awardLabel="Defensive Player of the Year"
        afcCandidates={award?.dpoy?.afc ?? []}
        nfcCandidates={award?.dpoy?.nfc ?? []}
        onPlayerSelect={onPlayerSelect}
      />
    </div>
  );
}

// ── OROY tab ──────────────────────────────────────────────────────────────────

function OROYTab({ award, onPlayerSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
        Best offensive rookie in each conference — first-year players only.
      </p>
      <ConferenceSplit
        awardLabel="Offensive Rookie of the Year"
        afcCandidates={award?.oroy?.afc ?? []}
        nfcCandidates={award?.oroy?.nfc ?? []}
        onPlayerSelect={onPlayerSelect}
      />
    </div>
  );
}

// ── DROY tab ──────────────────────────────────────────────────────────────────

function DROYTab({ award, onPlayerSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
        Best defensive rookie in each conference — first-year players only.
      </p>
      <ConferenceSplit
        awardLabel="Defensive Rookie of the Year"
        afcCandidates={award?.droy?.afc ?? []}
        nfcCandidates={award?.droy?.nfc ?? []}
        onPlayerSelect={onPlayerSelect}
      />
    </div>
  );
}

// ── All-Pro tab ───────────────────────────────────────────────────────────────

const ALL_PRO_POSITIONS = [
  { key: 'QB',   label: 'QB',          slots: 1 },
  { key: 'RB',   label: 'RB',          slots: 2 },
  { key: 'WR',   label: 'WR',          slots: 3 },
  { key: 'TE',   label: 'TE',          slots: 1 },
  { key: 'EDGE', label: 'EDGE / DE',   slots: 2 },
  { key: 'DT',   label: 'DT',          slots: 1 },
  { key: 'LB',   label: 'LB',          slots: 3 },
  { key: 'CB',   label: 'CB',          slots: 2 },
  { key: 'S',    label: 'S',           slots: 1 },
  { key: 'K',    label: 'K',           slots: 1 },
  { key: 'P',    label: 'P',           slots: 1 },
];

function AllProSlot({ player, onPlayerSelect }) {
  if (!player) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-sunken)',
        color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontStyle: 'italic',
      }}>
        TBD
      </div>
    );
  }
  return (
    <div
      onClick={() => player.playerId != null && onPlayerSelect?.(player.playerId)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-strong)',
        border: '1px solid var(--hairline)',
        cursor: onPlayerSelect ? 'pointer' : 'default',
        transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={e => { if (onPlayerSelect) { e.currentTarget.style.background = 'var(--accent)22'; e.currentTarget.style.borderColor = 'var(--accent)'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-strong)'; e.currentTarget.style.borderColor = 'var(--hairline)'; }}
    >
      <span style={{
        fontSize: 9, fontWeight: 700, padding: '1px 5px',
        borderRadius: 'var(--radius-pill)', color: '#fff',
        background: posColor(player.pos), flexShrink: 0,
      }}>
        {player.pos ?? '?'}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name ?? `Player ${player.playerId}`}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{player.teamAbbr ?? '???'}</div>
      </div>
      {/* Top stat */}
      {player.keyStats?.[0] && (
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{player.keyStats[0].label}</div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>
            {typeof player.keyStats[0].value === 'number'
              ? player.keyStats[0].value.toLocaleString()
              : player.keyStats[0].value}
          </div>
        </div>
      )}
    </div>
  );
}

function AllProTab({ allPro, onPlayerSelect }) {
  const [activeTeam, setActiveTeam] = useState('first');

  const team = allPro?.[activeTeam] ?? {};

  return (
    <div>
      {/* 1st / 2nd team toggle */}
      <div className="standings-tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {[{ key: 'first', label: '1st Team All-Pro' }, { key: 'second', label: '2nd Team All-Pro' }].map(({ key, label }) => (
          <button
            key={key}
            className={`standings-tab${activeTeam === key ? ' active' : ''}`}
            onClick={() => setActiveTeam(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 'var(--space-4)',
      }}>
        {ALL_PRO_POSITIONS.map(({ key, label, slots }) => {
          const players = team[key] ?? [];
          return (
            <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Position header */}
              <div style={{
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 'var(--radius-pill)', color: '#fff',
                  background: posColor(key), minWidth: 28, textAlign: 'center',
                }}>
                  {key}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {label}
                </span>
              </div>

              {/* Slot rows */}
              <div style={{ padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {Array.from({ length: slots }, (_, i) => (
                  <AllProSlot
                    key={i}
                    player={players[i] ?? null}
                    onPlayerSelect={onPlayerSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const AWARD_TABS = [
  { key: 'mvp',    label: 'MVP' },
  { key: 'opoy',   label: 'OPOY' },
  { key: 'dpoy',   label: 'DPOY' },
  { key: 'oroy',   label: 'OROY' },
  { key: 'droy',   label: 'DROY' },
  { key: 'allpro', label: 'All-Pro' },
];

export default function AwardRaces({ onPlayerSelect, actions }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState('mvp');

  useEffect(() => {
    setLoading(true);
    setError(null);
    actions.getAwardRaces()
      .then(resp => {
        setData(resp.payload ?? resp);
        setLoading(false);
      })
      .catch(err => {
        console.error('[AwardRaces] fetch failed:', err);
        setError(err.message ?? 'Failed to load award races');
        setLoading(false);
      });
  }, []);  // fetch once when tab mounts

  const { awards, allPro, week, year, phase } = data ?? {};

  const isOffseason = phase && phase !== 'regular';
  const weekLabel   = week ? `Week ${week}` : '';
  const yearLabel   = year ? `${year} Season` : '';

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800 }}>
            Award Races
          </h3>
          {!loading && data && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {weekLabel}{weekLabel && yearLabel ? ' · ' : ''}{yearLabel}
              {isOffseason ? ' · Offseason — final projections' : ' · Projected mid-season standings'}
            </span>
          )}
        </div>
        {!loading && !error && !isOffseason && (
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
            Rankings are updated each time you open this tab and reflect live stats through the latest week played.
          </p>
        )}
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-muted)' }}>
          Loading award races…
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: 'var(--space-6)', textAlign: 'center', color: 'var(--danger)',
          background: 'rgba(255,69,58,0.07)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--danger)',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && !data && (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🏆</div>
          <div>No award data available — play through at least a couple of weeks to see the races begin.</div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Sub-tab nav ── */}
          <div className="standings-tabs" style={{ marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
            {AWARD_TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`standings-tab${activeTab === key ? ' active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          {activeTab === 'mvp'    && <MVPTab  award={awards} onPlayerSelect={onPlayerSelect} />}
          {activeTab === 'opoy'   && <OPOYTab award={awards} onPlayerSelect={onPlayerSelect} />}
          {activeTab === 'dpoy'   && <DPOYTab award={awards} onPlayerSelect={onPlayerSelect} />}
          {activeTab === 'oroy'   && <OROYTab award={awards} onPlayerSelect={onPlayerSelect} />}
          {activeTab === 'droy'   && <DROYTab award={awards} onPlayerSelect={onPlayerSelect} />}
          {activeTab === 'allpro' && <AllProTab allPro={allPro} onPlayerSelect={onPlayerSelect} />}
        </>
      )}
    </div>
  );
}
