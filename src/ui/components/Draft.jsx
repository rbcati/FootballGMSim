/**
 * Draft.jsx
 *
 * Offseason NFL Draft interface.  Follows the ZenGM data-dense aesthetic:
 * sortable/filterable prospects table, live pick order panel, and inline
 * action buttons for user picks.
 *
 * Lifecycle:
 *  1. On mount — fetches current draft state (may be "not started yet").
 *  2. Pre-draft  — "Advance Offseason" (progression/retirements) → "Start Draft".
 *  3. AI on clock — "Sim to My Pick" auto-advances all AI picks.
 *  4. User on clock — prospect rows show a "Draft This Player" button.
 *  5. Draft complete — summary + "Start New Season" button.
 *
 * Priority 2 fixes:
 *  - Explicit "Draft This Player" button on every prospect row when user is on clock
 *  - Responsive grid (single column on mobile via .draft-board-grid CSS)
 *  - Data-dense .data-table styling with overflow-x-auto for mobile
 *
 * Receives { league, actions } from LeagueDashboard (same shape as other tabs).
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TraitBadge from './TraitBadge';
import PlayerProfile from './PlayerProfile';

// ── Helpers ────────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return '#34C759';
  if (ovr >= 80) return '#30D158';
  if (ovr >= 70) return '#0A84FF';
  if (ovr >= 60) return '#FF9F0A';
  return '#FF453A';
}

function OvrBadge({ ovr }) {
  const c = ovrColor(ovr);
  return (
    <span style={{
      display: 'inline-block', minWidth: 26,
      padding: '0 3px', borderRadius: 3,
      background: c + '22', color: c,
      fontWeight: 800, fontSize: 11, textAlign: 'center',
    }}>
      {ovr}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PreDraftPanel({ league, actions, onDraftStarted }) {
  const [progressing, setProgressing]   = useState(false);
  const [progressResult, setProgressResult] = useState(null);
  const [starting, setStarting]         = useState(false);
  const [error, setError]               = useState(null);

  const progressionDone = league?.offseasonProgressionDone ?? false;

  const handleProgression = async () => {
    setProgressing(true);
    setError(null);
    try {
      const res = await actions.advanceOffseason();
      setProgressResult(res?.payload ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgressing(false);
    }
  };

  const handleStartDraft = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await actions.startDraft();
      if (res?.payload && !res.payload.notStarted) {
        onDraftStarted(res.payload);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h2 style={{
        fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text)',
        marginBottom: 'var(--space-6)',
      }}>
        Offseason Operations
      </h2>

      {error && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgba(255,69,58,0.1)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--danger)',
          marginBottom: 'var(--space-5)',
          fontSize: 'var(--text-sm)',
        }}>
          {error}
        </div>
      )}

      {/* Step 1: Player Progression */}
      <div className="card" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              marginBottom: 'var(--space-2)',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: progressionDone ? 'var(--success)' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-xs)', fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {progressionDone ? '✓' : '1'}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                Player Progression &amp; Retirements
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, paddingLeft: 36 }}>
              Age every player by one year. Young players (&lt;26) develop; veterans (30+) decline.
              Players 34+ have a chance to retire.
            </p>
            {progressResult && (
              <div style={{ paddingLeft: 36, marginTop: 'var(--space-3)' }}>
                <p style={{ color: 'var(--success)', fontSize: 'var(--text-xs)', margin: 0 }}>
                  {progressResult.message}
                </p>
                {progressResult.retired?.length > 0 && (
                  <div style={{
                    marginTop: 'var(--space-2)',
                    maxHeight: 100, overflowY: 'auto',
                    fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                  }}>
                    {progressResult.retired.map(r => (
                      <span key={r.id} style={{ marginRight: 8 }}>
                        {r.name} ({r.pos}, Age {r.age})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="btn"
            disabled={progressing || progressionDone}
            onClick={handleProgression}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {progressing ? 'Processing…' : progressionDone ? 'Completed' : 'Run Progression'}
          </button>
        </div>
      </div>

      {/* Step 2: Start Draft */}
      <div className="card" style={{ padding: 'var(--space-5)', opacity: progressionDone ? 1 : 0.55 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              marginBottom: 'var(--space-2)',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-xs)', fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                2
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                NFL Draft
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, paddingLeft: 36 }}>
              Generate a draft class of rookies (Age 21). Worst record picks first;
              Super Bowl winner picks last. 5 rounds.
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={!progressionDone || starting}
            onClick={handleStartDraft}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {starting ? 'Starting…' : 'Start Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftBoard({ draftState, userTeamId, onSimToMyPick, onDraftPlayer, onPlayerClick, simming }) {
  const [sortKey, setSortKey] = useState('ovr');
  const [sortDir, setSortDir] = useState(-1);   // -1 = descending
  const [filterPos, setFilterPos] = useState('');
  const [nameFilter, setNameFilter] = useState('');

  const { currentPick, isUserPick, isDraftComplete, prospects = [],
          completedPicks = [], upcomingPicks = [] } = draftState;

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const sortedProspects = useMemo(() => {
    let list = [...prospects];
    if (filterPos)   list = list.filter(p => p.pos === filterPos);
    if (nameFilter)  list = list.filter(p => p.name.toLowerCase().includes(nameFilter.toLowerCase()));
    list.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * ((bv ?? 0) - (av ?? 0));
    });
    return list;
  }, [prospects, filterPos, nameFilter, sortKey, sortDir]);

  const posOptions = useMemo(() =>
    [...new Set(prospects.map(p => p.pos))].sort(), [prospects]);

  const SortTh = ({ label, sKey, style = {} }) => {
    const active = sortKey === sKey;
    return (
      <th
        onClick={() => toggleSort(sKey)}
        style={{
          cursor: 'pointer', userSelect: 'none',
          color: active ? 'var(--accent)' : undefined,
          fontWeight: active ? 800 : undefined,
          ...style,
        }}
      >
        {label}{active ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
      </th>
    );
  };

  return (
    <div className="draft-board-grid">

      {/* ── Left Panel: Draft Board ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* Current pick clock */}
        <div className="card" style={{ padding: 'var(--space-3)', overflow: 'hidden' }}>
          {isDraftComplete ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: 14 }}>Draft Complete</div>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '1px',
                color: 'var(--text-muted)', marginBottom: 'var(--space-1)',
              }}>
                On the Clock
              </div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-xl)', color: 'var(--text)', marginBottom: 2 }}>
                {currentPick?.teamAbbr ?? '???'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                {currentPick?.teamName ?? '—'}
              </div>
              <div style={{
                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                background: isUserPick ? 'var(--accent)22' : 'var(--surface-strong)',
                border: `1px solid ${isUserPick ? 'var(--accent)' : 'var(--hairline)'}`,
                color: isUserPick ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 10,
                display: 'inline-block', marginBottom: 'var(--space-2)',
              }}>
                {isUserPick ? '★ YOUR PICK' : 'AI PICKING'}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text)',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Round {currentPick?.round}</span>
                <span style={{ color: 'var(--text-muted)' }}>Overall #{currentPick?.overall}</span>
              </div>
            </>
          )}
        </div>

        {/* Sim button (only when AI is picking) */}
        {!isDraftComplete && !isUserPick && (
          <button
            className="btn btn-primary"
            disabled={simming}
            onClick={onSimToMyPick}
            style={{ width: '100%' }}
          >
            {simming ? 'Simulating…' : 'Sim to My Pick'}
          </button>
        )}

        {/* Upcoming order */}
        {!isDraftComplete && upcomingPicks.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '3px 8px',
              background: 'var(--surface-strong)',
              borderBottom: '1px solid var(--hairline)',
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)',
            }}>
              Pick Order
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {upcomingPicks.map((pk, i) => (
                <div
                  key={pk.overall}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                    padding: '3px 8px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: i === 0
                      ? (pk.isUser ? 'rgba(10,132,255,0.06)' : 'var(--surface-strong)')
                      : 'transparent',
                    fontWeight: i === 0 ? 700 : 400,
                  }}
                >
                  <span style={{ minWidth: 22, textAlign: 'center', fontSize: 10, color: 'var(--text-subtle)' }}>
                    {pk.overall}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 11,
                    color: pk.isUser ? 'var(--accent)' : 'var(--text)',
                    fontWeight: pk.isUser ? 700 : 400,
                  }}>
                    {pk.teamAbbr}
                    {pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
                    R{pk.round}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently completed (last 10) */}
        {completedPicks.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '3px 8px',
              background: 'var(--surface-strong)',
              borderBottom: '1px solid var(--hairline)',
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)',
            }}>
              Recent Picks
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {[...completedPicks].reverse().slice(0, 10).map(pk => (
                <div
                  key={pk.overall}
                  style={{
                    padding: '3px 8px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', marginBottom: 1, fontSize: 10 }}>
                    #{pk.overall} {pk.teamAbbr}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {pk.playerName}
                    <span style={{ marginLeft: 6, color: 'var(--text-subtle)' }}>
                      {pk.playerPos} · <OvrBadge ovr={pk.playerOvr ?? 0} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Main Panel: Prospects Table ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* User pick banner — bold call to action */}
        {isUserPick && !isDraftComplete && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(10,132,255,0.1)',
            border: '2px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700, color: 'var(--accent)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            fontSize: 13,
          }}>
            <span style={{ fontSize: '1.1rem' }}>★</span>
            You're on the clock! Round {currentPick?.round}, Pick #{currentPick?.overall} — click "Draft This Player" to make your selection.
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search name…"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              background: 'var(--surface-strong)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 12,
              width: 150,
            }}
          />
          <select
            value={filterPos}
            onChange={e => setFilterPos(e.target.value)}
            style={{
              padding: '4px 8px',
              background: 'var(--surface-strong)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 12,
            }}
          >
            <option value="">All Pos</option>
            {posOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {sortedProspects.length} prospect{sortedProspects.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Prospects table — data-dense */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="data-table" style={{ minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 8, textAlign: 'center', width: 28 }}>#</th>
                  <SortTh label="Pos" sKey="pos" style={{ textAlign: 'center', width: 36 }} />
                  <SortTh label="Name" sKey="name" style={{ textAlign: 'left' }} />
                  <th style={{ textAlign: 'center' }}>Traits</th>
                  <SortTh label="Age" sKey="age" style={{ textAlign: 'center', width: 32 }} />
                  <SortTh label="OVR" sKey="ovr" style={{ textAlign: 'center', width: 36 }} />
                  <SortTh label="Pot" sKey="potential" style={{ textAlign: 'center', width: 36 }} />
                  <SortTh label="College" sKey="college" style={{ textAlign: 'left' }} />
                  {/* ACTION column always shown when user is on the clock */}
                  {isUserPick && !isDraftComplete && (
                    <th style={{ textAlign: 'center', minWidth: 110 }}>Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedProspects.length === 0 && (
                  <tr>
                    <td
                      colSpan={isUserPick ? 9 : 8}
                      style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}
                    >
                      {isDraftComplete ? 'All prospects have been drafted.' : 'No prospects match the filter.'}
                    </td>
                  </tr>
                )}
                {sortedProspects.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ paddingLeft: 8, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 10, fontWeight: 700 }}>
                      {i + 1}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '0 4px',
                        borderRadius: 3, background: 'var(--surface-strong)',
                        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      }}>
                        {p.pos}
                      </span>
                    </td>
                    <td>
                      <span
                        className="player-link"
                        onClick={() => onPlayerClick && onPlayerClick(p.id)}
                        style={{ fontSize: 12 }}
                      >
                        {p.name}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(p.traits || []).map(t => <TraitBadge key={t} traitId={t} />)}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{p.age}</td>
                    <td style={{ textAlign: 'center' }}><OvrBadge ovr={p.ovr} /></td>
                    <td style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 11 }}>
                      {p.potential ?? '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.college ?? '—'}
                    </td>
                    {/* ── "Draft This Player" button — explicit action mechanism ── */}
                    {isUserPick && !isDraftComplete && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDraftPlayer(p.id); }}
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            border: '2px solid var(--accent)',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--accent)',
                            color: '#fff',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'filter 0.1s',
                          }}
                          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                          onMouseOut={e => e.currentTarget.style.filter = 'none'}
                        >
                          Draft This Player
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftCompletePanel({ actions, draftState }) {
  const { completedPicks = [], totalPicks = 0 } = draftState;
  const userPicks = completedPicks.filter(pk => pk.isUser);

  return (
    <div>
      <div style={{
        textAlign: 'center', padding: 'var(--space-6) 0',
        borderBottom: '1px solid var(--hairline)',
        marginBottom: 'var(--space-5)',
      }}>
        <h2 style={{ fontWeight: 800, fontSize: 'var(--text-xl)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
          Draft Complete
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>
          {totalPicks} picks made. Your team added {userPicks.length} new player{userPicks.length !== 1 ? 's' : ''}.
        </p>
        <button
          className="btn btn-primary"
          style={{ fontSize: 'var(--text-base)' }}
          onClick={() => actions.startNewSeason()}
        >
          Start New Season
        </button>
      </div>

      {/* Full pick history — data-dense */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '4px 8px',
          background: 'var(--surface-strong)',
          borderBottom: '1px solid var(--hairline)',
          fontWeight: 700, fontSize: 10,
          textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)',
        }}>
          All Picks
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: 480, overflowY: 'auto' }}>
          <table className="data-table" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 8, width: 32 }}>#</th>
                <th>Rd</th>
                <th>Team</th>
                <th>Player</th>
                <th>Pos</th>
                <th style={{ textAlign: 'center' }}>OVR</th>
              </tr>
            </thead>
            <tbody>
              {completedPicks.map(pk => (
                <tr key={pk.overall} className={pk.isUser ? 'user-row' : ''}>
                  <td style={{ paddingLeft: 8, color: 'var(--text-subtle)', fontWeight: 700, fontSize: 10 }}>
                    {pk.overall}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>R{pk.round}</td>
                  <td style={{ fontWeight: pk.isUser ? 700 : 400, color: pk.isUser ? 'var(--accent)' : 'var(--text)', fontSize: 12 }}>
                    {pk.teamAbbr}
                    {pk.isUser && <span style={{ marginLeft: 3 }}>★</span>}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{pk.playerName ?? '—'}</td>
                  <td style={{ fontSize: 11 }}>
                    <span style={{
                      display: 'inline-block', padding: '0 4px', borderRadius: 3,
                      background: 'var(--surface-strong)', fontSize: 10, fontWeight: 700,
                      color: 'var(--text-muted)',
                    }}>
                      {pk.playerPos ?? '—'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {pk.playerOvr != null ? <OvrBadge ovr={pk.playerOvr} /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function Draft({ league, actions }) {
  const [draftState, setDraftState] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [simming, setSimming]       = useState(false);
  const [profilePlayerId, setProfilePlayerId] = useState(null);

  // Enrich each pick with isUser flag for the completed-picks panel
  const enrichedDraftState = useMemo(() => {
    if (!draftState) return null;
    return {
      ...draftState,
      completedPicks: (draftState.completedPicks ?? []).map(pk => ({
        ...pk,
        isUser: pk.teamId === league?.userTeamId,
      })),
    };
  }, [draftState, league?.userTeamId]);

  // Load draft state on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await actions.getDraftState();
        if (!cancelled && res?.payload) {
          setDraftState(res.payload.notStarted ? null : res.payload);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actions]);

  const handleDraftStarted = useCallback((state) => {
    setDraftState(state);
  }, []);

  const handleSimToMyPick = useCallback(async () => {
    setSimming(true);
    setError(null);
    try {
      const res = await actions.simDraftPick();
      if (res?.payload) setDraftState(res.payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimming(false);
    }
  }, [actions]);

  const handleDraftPlayer = useCallback(async (playerId) => {
    setError(null);
    try {
      const res = await actions.makeDraftPick(playerId);
      if (res?.payload) setDraftState(res.payload);
    } catch (err) {
      setError(err.message);
    }
  }, [actions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'var(--space-4)',
      }}>
        <div>
          <h1 style={{
            fontWeight: 800, fontSize: 'var(--text-xl)',
            color: 'var(--text)', margin: 0, lineHeight: 1.2,
          }}>
            NFL Draft
          </h1>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {league?.year ?? ''} Season · Offseason
          </div>
        </div>
        {draftState && !draftState.notStarted && !draftState.isDraftComplete && (
          <div style={{
            padding: '3px 10px',
            background: 'var(--surface-strong)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            {draftState.currentPickIndex ?? 0} / {draftState.totalPicks ?? 0} picks made
          </div>
        )}
      </div>

      {/* Global error notice */}
      {error && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgba(255,69,58,0.1)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--danger)',
          marginBottom: 'var(--space-4)',
          fontSize: 'var(--text-sm)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button
            className="btn"
            style={{ padding: '2px 10px', fontSize: 10 }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)' }}>
          Loading draft data…
        </div>
      )}

      {/* Pre-draft: no draft started yet */}
      {!loading && !draftState && (
        <PreDraftPanel
          league={league}
          actions={actions}
          onDraftStarted={handleDraftStarted}
        />
      )}

      {/* Draft board: draft in progress */}
      {!loading && draftState && !draftState.isDraftComplete && (
        <DraftBoard
          draftState={enrichedDraftState}
          userTeamId={league?.userTeamId}
          onSimToMyPick={handleSimToMyPick}
          onDraftPlayer={handleDraftPlayer}
          onPlayerClick={setProfilePlayerId}
          simming={simming}
        />
      )}

      {/* Draft complete */}
      {!loading && draftState && draftState.isDraftComplete && (
        <DraftCompletePanel
          actions={actions}
          draftState={enrichedDraftState}
        />
      )}

      {/* Player profile modal — opened by clicking a prospect's name */}
      {profilePlayerId && (
        <PlayerProfile
          playerId={profilePlayerId}
          onClose={() => setProfilePlayerId(null)}
          actions={actions}
          isUserOnClock={enrichedDraftState?.isUserPick && !enrichedDraftState?.isDraftComplete}
          onDraftPlayer={(pid) => {
            handleDraftPlayer(pid);
            setProfilePlayerId(null);
          }}
        />
      )}
    </div>
  );
}
