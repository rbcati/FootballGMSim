/**
 * TradeCenter.jsx
 *
 * ZenGM-inspired side-by-side trade interface.
 *
 * Features:
 *  - Your roster on the left, target AI team roster on the right
 *  - Checkboxes to select players to offer / request
 *  - Real-time OVR-based trade value bar (green = fair, red = unfair for you)
 *  - Draft picks can be included on either side (round selector)
 *  - "Propose Trade" → worker evaluates → AI accept/counter display
 *  - Cap validation: proposed deal must not exceed either team's cap
 *
 * Data flow:
 *  Mount → getRoster(userTeamId) + getRoster(targetTeamId)
 *  Propose → actions.submitTrade(…) → TRADE_RESPONSE
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 85) return '#34C759';
  if (ovr >= 75) return '#0A84FF';
  if (ovr >= 65) return '#FF9F0A';
  return '#FF453A';
}

const POS_MULT = { QB: 2.0, WR: 1.2, RB: 0.9, TE: 1.1, OL: 1.0,
                   DL: 1.0, LB: 0.95, CB: 1.05, S: 0.9 };

function playerTradeValue(player) {
  if (!player) return 0;
  const ovr   = player.ovr ?? 70;
  const age   = player.age ?? 27;
  const pMult = POS_MULT[player.pos] ?? 1.0;
  const ageF  = age <= 26 ? 1 + (26 - age) * 0.02
              : age <= 30 ? 1.0
              :             Math.max(0.5, 1 - (age - 30) * 0.06);
  return Math.round(Math.pow(ovr, 1.8) * pMult * ageF);
}

const PICK_VALUES = [0, 800, 300, 150, 60, 25, 10, 3];

function fmtSalary(annual) {
  if (!annual && annual !== 0) return '—';
  return `$${annual.toFixed(1)}M`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Single player row with a checkbox */
function PlayerCheckRow({ player, checked, onChange, dimmed }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)',
      borderBottom: '1px solid var(--hairline)',
      cursor: 'pointer',
      background: checked ? 'var(--accent)11' : 'transparent',
      opacity: dimmed ? 0.4 : 1,
      userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(player.id, e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
      />
      {/* OVR pill */}
      <span style={{
        display: 'inline-block', width: 28, padding: '1px 0',
        borderRadius: 'var(--radius-pill)',
        background: ovrColor(player.ovr) + '22',
        color: ovrColor(player.ovr),
        fontWeight: 800, fontSize: 11, textAlign: 'center', flexShrink: 0,
      }}>
        {player.ovr}
      </span>
      {/* Pos pill */}
      <span style={{
        display: 'inline-block', minWidth: 26, padding: '1px 4px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-strong)',
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0,
      }}>
        {player.pos}
      </span>
      <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        {fmtSalary(player.contract?.baseAnnual)}
      </span>
    </label>
  );
}

/** Trade value bar */
function ValueBar({ myValue, theirValue }) {
  const total = myValue + theirValue || 1;
  const myPct = Math.round((myValue / total) * 100);
  const diff  = myValue - theirValue;
  const fairnessColor = Math.abs(diff) < total * 0.15
    ? 'var(--success)'
    : diff > 0 ? 'var(--accent)'   // we're getting more
    :            'var(--danger)';   // we're giving more

  const label = Math.abs(diff) < total * 0.15
    ? 'Fair deal'
    : diff > 0 ? 'Favorable for you'
    :            'Unfavorable for you';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <span>You give: <strong style={{ color: 'var(--text)' }}>{myValue.toLocaleString()}</strong></span>
        <span style={{ fontWeight: 700, color: fairnessColor }}>{label}</span>
        <span>You get: <strong style={{ color: 'var(--text)' }}>{theirValue.toLocaleString()}</strong></span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--hairline)', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${myPct}%`, background: fairnessColor, transition: 'width .3s' }} />
        <div style={{ flex: 1, background: 'var(--surface-strong)' }} />
      </div>
    </div>
  );
}

/** Draft pick selector row */
function PickSelector({ side, picks, onChange }) {
  const [round, setRound] = useState(1);
  const [year,  setYear]  = useState(new Date().getFullYear() + 1);
  const add = () => {
    onChange(side, { kind: 'pick', round, year, id: `${side}_${round}_${year}_${Date.now()}` });
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--hairline)',
    }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>Add pick:</span>
      <select value={round} onChange={e => setRound(Number(e.target.value))}
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)',
                 borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 'var(--text-xs)' }}>
        {[1,2,3,4,5,6,7].map(r => <option key={r} value={r}>R{r}</option>)}
      </select>
      <select value={year} onChange={e => setYear(Number(e.target.value))}
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)',
                 borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 'var(--text-xs)' }}>
        {[0,1,2].map(d => {
          const y = new Date().getFullYear() + 1 + d;
          return <option key={y} value={y}>{y}</option>;
        })}
      </select>
      <button className="btn" style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }} onClick={add}>
        + Add
      </button>

      {picks.length > 0 && (
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {picks.map(pk => (
            <span key={pk.id} style={{
              fontSize: 'var(--text-xs)', background: 'var(--accent)22', color: 'var(--accent)',
              padding: '1px 6px', borderRadius: 'var(--radius-pill)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {pk.year} R{pk.round}
              <button onClick={() => onChange(side, pk, true)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Response display ──────────────────────────────────────────────────────────

function TradeResult({ result, onDismiss }) {
  if (!result) return null;
  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${result.accepted ? 'var(--success)' : 'var(--danger)'}`,
      background: result.accepted ? 'rgba(52,199,89,0.08)' : 'rgba(255,69,58,0.08)',
      padding: 'var(--space-4) var(--space-5)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
    }}>
      <div style={{ fontSize: '1.8rem' }}>{result.accepted ? '✅' : '❌'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: result.accepted ? 'var(--success)' : 'var(--danger)', fontSize: 'var(--text-base)' }}>
          {result.accepted ? 'Trade Accepted!' : 'Trade Rejected'}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
          {result.reason}
          {result.offerValue !== undefined && (
            <span style={{ marginLeft: 8 }}>
              · Your value: {result.offerValue?.toLocaleString()} / Their value: {result.receiveValue?.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TradeCenter({ league, actions }) {
  const myTeamId = league?.userTeamId;

  // The "other" team the user wants to trade with
  const [targetId,    setTargetId]    = useState(null);
  const [myRoster,    setMyRoster]    = useState([]);
  const [theirRoster, setTheirRoster] = useState([]);
  const [myTeam,      setMyTeam]      = useState(null);
  const [theirTeam,   setTheirTeam]   = useState(null);

  // Selected player IDs on each side
  const [offering,    setOffering]    = useState(new Set());   // I give
  const [receiving,   setReceiving]   = useState(new Set());   // I get

  // Draft picks included in the deal
  const [myPicks,     setMyPicks]     = useState([]);          // I give
  const [theirPicks,  setTheirPicks]  = useState([]);          // I get

  const [loading,     setLoading]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [tradeResult, setTradeResult] = useState(null);
  const [searchMy,    setSearchMy]    = useState('');
  const [searchTheir, setSearchTheir] = useState('');

  // All other teams for the dropdown
  const otherTeams = useMemo(() =>
    (league?.teams ?? []).filter(t => t.id !== myTeamId).sort((a, b) => a.name.localeCompare(b.name)),
    [league?.teams, myTeamId]
  );

  const fetchRosters = useCallback(async (tId) => {
    if (!actions?.getRoster || myTeamId == null) return;
    setLoading(true);
    setOffering(new Set()); setReceiving(new Set());
    setMyPicks([]); setTheirPicks([]); setTradeResult(null);
    try {
      const [myResp, theirResp] = await Promise.all([
        actions.getRoster(myTeamId),
        tId != null ? actions.getRoster(tId) : Promise.resolve(null),
      ]);
      if (myResp?.payload) { setMyRoster(myResp.payload.players ?? []); setMyTeam(myResp.payload.team); }
      if (theirResp?.payload) { setTheirRoster(theirResp.payload.players ?? []); setTheirTeam(theirResp.payload.team); }
    } catch (e) {
      console.error('fetchRosters failed:', e);
    } finally {
      setLoading(false);
    }
  }, [myTeamId, actions]);

  useEffect(() => {
    fetchRosters(targetId);
  }, [targetId, fetchRosters]);

  // Calculate trade values
  const myOfferValue = useMemo(() => {
    const playerVal = [...offering].reduce((s, id) => {
      const p = myRoster.find(p => p.id === id);
      return s + playerTradeValue(p);
    }, 0);
    const pickVal = myPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0);
    return playerVal + pickVal;
  }, [offering, myRoster, myPicks]);

  const theirOfferValue = useMemo(() => {
    const playerVal = [...receiving].reduce((s, id) => {
      const p = theirRoster.find(p => p.id === id);
      return s + playerTradeValue(p);
    }, 0);
    const pickVal = theirPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0);
    return playerVal + pickVal;
  }, [receiving, theirRoster, theirPicks]);

  const handlePickChange = (side, pick, remove = false) => {
    const setter = side === 'my' ? setMyPicks : setTheirPicks;
    if (remove) {
      setter(prev => prev.filter(p => p.id !== pick.id));
    } else {
      setter(prev => [...prev, pick]);
    }
  };

  const toggleOffering  = (id, chk) => setOffering(prev => { const s = new Set(prev); chk ? s.add(id) : s.delete(id); return s; });
  const toggleReceiving = (id, chk) => setReceiving(prev => { const s = new Set(prev); chk ? s.add(id) : s.delete(id); return s; });

  const canPropose = offering.size > 0 || myPicks.length > 0 || receiving.size > 0 || theirPicks.length > 0;

  const handlePropose = async () => {
    if (!canPropose || targetId == null) return;
    setSubmitting(true);
    setTradeResult(null);
    try {
      const resp = await actions.submitTrade(myTeamId, targetId, {
        playerIds: [...offering],
        pickIds:   myPicks.map(p => p.id),
      }, {
        playerIds: [...receiving],
        pickIds:   theirPicks.map(p => p.id),
      });
      if (resp?.payload) {
        setTradeResult(resp.payload);
        if (resp.payload.accepted) {
          // Refresh rosters after a successful trade
          setOffering(new Set()); setReceiving(new Set());
          setMyPicks([]); setTheirPicks([]);
          await fetchRosters(targetId);
        }
      }
    } catch (e) {
      console.error('submitTrade failed:', e);
      setTradeResult({ accepted: false, reason: 'Error communicating with the game engine.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filterRoster = (roster, q) => {
    if (!q.trim()) return roster;
    return roster.filter(p => p.name?.toLowerCase().includes(q.toLowerCase()));
  };

  const myFiltered    = useMemo(() => filterRoster(myRoster, searchMy).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)), [myRoster, searchMy]);
  const theirFiltered = useMemo(() => filterRoster(theirRoster, searchTheir).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)), [theirRoster, searchTheir]);

  return (
    <div>
      {/* Team selector */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              Trade partner
            </div>
            <select
              value={targetId ?? ''}
              onChange={e => setTargetId(e.target.value ? Number(e.target.value) : null)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--hairline)',
                color: 'var(--text)', borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)',
                minWidth: 220,
              }}
            >
              <option value="">Select a team…</option>
              {otherTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.wins}–{t.losses})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          {targetId != null && (
            <button
              className="btn btn-primary"
              onClick={handlePropose}
              disabled={!canPropose || submitting}
              style={{ fontWeight: 700, padding: 'var(--space-2) var(--space-6)' }}
            >
              {submitting ? 'Evaluating…' : 'Propose Trade'}
            </button>
          )}
        </div>
      </div>

      {/* Trade result banner */}
      {tradeResult && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <TradeResult result={tradeResult} onDismiss={() => setTradeResult(null)} />
        </div>
      )}

      {targetId == null ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)' }}>
          Select a trade partner above to begin.
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          Loading rosters…
        </div>
      ) : (
        <>
          {/* Value bar */}
          {(offering.size > 0 || receiving.size > 0 || myPicks.length > 0 || theirPicks.length > 0) && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
              <ValueBar myValue={myOfferValue} theirValue={theirOfferValue} />
            </div>
          )}

          {/* Side-by-side panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>

            {/* My side */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
                    {myTeam?.name ?? 'My Team'} · You Give
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {offering.size} player{offering.size !== 1 ? 's' : ''} + {myPicks.length} pick{myPicks.length !== 1 ? 's' : ''} selected
                  </div>
                </div>
                <input
                  type="text" placeholder="Filter…" value={searchMy}
                  onChange={e => setSearchMy(e.target.value)}
                  style={{ width: 100, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 'var(--text-xs)' }}
                />
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {myFiltered.map(p => (
                  <PlayerCheckRow
                    key={p.id} player={p}
                    checked={offering.has(p.id)}
                    onChange={toggleOffering}
                  />
                ))}
              </div>
              <PickSelector side="my" picks={myPicks} onChange={handlePickChange} />
            </div>

            {/* Their side */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                    {theirTeam?.name ?? 'Their Team'} · You Receive
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {receiving.size} player{receiving.size !== 1 ? 's' : ''} + {theirPicks.length} pick{theirPicks.length !== 1 ? 's' : ''} selected
                  </div>
                </div>
                <input
                  type="text" placeholder="Filter…" value={searchTheir}
                  onChange={e => setSearchTheir(e.target.value)}
                  style={{ width: 100, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 'var(--text-xs)' }}
                />
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {theirFiltered.map(p => (
                  <PlayerCheckRow
                    key={p.id} player={p}
                    checked={receiving.has(p.id)}
                    onChange={toggleReceiving}
                  />
                ))}
              </div>
              <PickSelector side="their" picks={theirPicks} onChange={handlePickChange} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
