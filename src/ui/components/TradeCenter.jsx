/**
 * TradeCenter.jsx
 *
 * ZenGM-inspired side-by-side trade interface.
 *
 * Layout:
 *  ┌─────────────────────────────────────┐
 *  │  Trade Partner dropdown  [Propose]  │  ← header card
 *  ├────────────────┬────────────────────┤
 *  │ Trade result banner (if any)        │
 *  ├────────────────┴────────────────────┤
 *  │ Value bar + Cap-Space-After display │  ← live math card
 *  ├────────────────┬────────────────────┤
 *  │  My roster     │  Their roster      │  ← two-pane panels
 *  │  (checkboxes)  │  (checkboxes)      │
 *  │  [+pick]       │  [+pick]           │
 *  └────────────────┴────────────────────┘
 *  ┌─────────────────────────────────────┐
 *  │  Trade Block Summary                │  ← staged assets
 *  └─────────────────────────────────────┘
 *
 * New in this build (Phase 3):
 *  - Cap-Space-After-Trade panel: shows both teams' projected cap room post-swap
 *  - Dynamic cap math (liberated + absorbed salary per side)
 *  - Trade Block Summary: visual "You Give ⇄ You Receive" pill strip
 *  - OVR-based AI evaluation: accepted if receive ≥ 85 % of give
 *
 * Data flow:
 *  Mount          → getRoster(userTeamId) + getRoster(targetTeamId)  [silent]
 *  Propose Trade  → actions.submitTrade(fromId, toId, offering, receiving)
 *                 → TRADE_RESPONSE { accepted, offerValue, receiveValue, reason }
 *  Accepted       → worker swaps players, recalculates caps, posts STATE_UPDATE
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return '#34C759';
  if (ovr >= 80) return '#30D158';
  if (ovr >= 70) return '#0A84FF';
  if (ovr >= 60) return '#FF9F0A';
  return '#FF453A';
}

const POS_MULT = {
  QB: 2.0, WR: 1.2, RB: 0.9, TE: 1.1, OL: 1.0,
  DL: 1.0, LB: 0.95, CB: 1.05, S: 0.9,
};

/** OVR^1.8 × position × age — mirrors worker's _tradeValue() exactly. */
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

/** Round-based pick value ladder mirrors worker's PICK_VALUES constant. */
const PICK_VALUES = [0, 800, 300, 150, 60, 25, 10, 3];

function fmtSalary(annual) {
  if (annual == null) return '—';
  return `$${Number(annual).toFixed(1)}M`;
}

// ── Shared visual sub-components ──────────────────────────────────────────────

function OvrBadge({ ovr }) {
  const col = ovrColor(ovr);
  return (
    <span style={{
      display: 'inline-block', minWidth: 28, padding: '1px 3px',
      borderRadius: 'var(--radius-pill)',
      background: col + '22', color: col,
      fontWeight: 800, fontSize: 11, textAlign: 'center',
    }}>
      {ovr}
    </span>
  );
}

// ── PlayerCheckRow ────────────────────────────────────────────────────────────

function PlayerCheckRow({ player, checked, onChange, onNameClick }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)',
      borderBottom: '1px solid var(--hairline)',
      cursor: 'pointer',
      background: checked ? 'var(--accent)11' : 'transparent',
      userSelect: 'none',
      transition: 'background .1s',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(player.id, e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
      />
      <OvrBadge ovr={player.ovr} />
      {/* POS pill */}
      <span style={{
        display: 'inline-block', minWidth: 26, padding: '1px 4px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-strong)',
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0,
      }}>
        {player.pos}
      </span>
      {/* Name */}
      <span
        onClick={(e) => {
          if (onNameClick) {
            e.preventDefault();
            onNameClick(player.id);
          }
        }}
        style={{
          flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          cursor: onNameClick ? 'pointer' : 'default', textDecoration: onNameClick ? 'underline' : 'none',
          textDecorationColor: 'var(--hairline)'
        }}
      >
        {player.name}
      </span>
      {/* Salary */}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        {fmtSalary(player.contract?.baseAnnual)}
      </span>
    </label>
  );
}

// ── ValueBar ──────────────────────────────────────────────────────────────────

function ValueBar({ myValue, theirValue }) {
  const total         = myValue + theirValue || 1;
  const myPct         = Math.round((myValue / total) * 100);
  const diff          = myValue - theirValue;
  const fairnessColor = Math.abs(diff) < total * 0.15
    ? 'var(--success)'
    : diff > 0 ? 'var(--accent)'  // we receive more
    :            'var(--danger)'; // we give more

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

// ── CapImpact ─────────────────────────────────────────────────────────────────
// Shows projected cap space for BOTH teams after the proposed trade executes.
// Salary freed = players you give away; salary absorbed = players you receive.

function CapImpact({ myTeam, theirTeam, myCapAfter, theirCapAfter }) {
  const myCol    = myCapAfter    < 0 ? 'var(--danger)' : myCapAfter    < 10 ? 'var(--warning)' : 'var(--success)';
  const theirCol = theirCapAfter < 0 ? 'var(--danger)' : theirCapAfter < 10 ? 'var(--warning)' : 'var(--success)';

  const fmtCap = (val) => {
    if (val < 0) return `-$${Math.abs(val).toFixed(1)}M`;
    return `$${val.toFixed(1)}M`;
  };

  return (
    <div style={{
      marginTop: 'var(--space-4)',
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', gap: 'var(--space-3)',
    }}>
      {/* My cap after */}
      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
          {myTeam?.abbr ?? 'You'} · Cap After Trade
        </div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: myCol, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
          {fmtCap(myCapAfter)}
          {myCapAfter < 0 && (
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--danger)' }}>OVER</span>
          )}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
          currently {fmtSalary(myTeam?.capRoom)}
        </div>
      </div>

      {/* Centre divider */}
      <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', lineHeight: 1.3, padding: '0 var(--space-2)' }}>
        CAP<br/>SPACE<br/>AFTER
      </div>

      {/* Their cap after */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
          {theirTeam?.abbr ?? 'Them'} · Cap After Trade
        </div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: theirCol, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          {theirCapAfter < 0 && (
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--danger)' }}>OVER</span>
          )}
          {fmtCap(theirCapAfter)}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
          currently {fmtSalary(theirTeam?.capRoom)}
        </div>
      </div>
    </div>
  );
}

// ── PickSelector ──────────────────────────────────────────────────────────────

function PickSelector({ side, picks, onChange }) {
  const [round, setRound] = useState(1);
  const [year,  setYear]  = useState(new Date().getFullYear() + 1);

  const addPick = () => {
    onChange(side, { kind: 'pick', round, year, id: `${side}_${round}_${year}_${Date.now()}` });
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
      padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--hairline)',
    }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        Add pick:
      </span>
      {/* Round selector */}
      <select
        value={round} onChange={e => setRound(Number(e.target.value))}
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 'var(--text-xs)' }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map(r => <option key={r} value={r}>R{r}</option>)}
      </select>
      {/* Year selector */}
      <select
        value={year} onChange={e => setYear(Number(e.target.value))}
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 'var(--text-xs)' }}
      >
        {[0, 1, 2].map(d => {
          const y = new Date().getFullYear() + 1 + d;
          return <option key={y} value={y}>{y}</option>;
        })}
      </select>
      <button
        className="btn"
        style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', flexShrink: 0 }}
        onClick={addPick}
      >
        + Add
      </button>
      {/* Staged picks */}
      {picks.map(pk => (
        <span key={pk.id} style={{
          fontSize: 'var(--text-xs)', background: 'var(--accent)22', color: 'var(--accent)',
          padding: '1px 6px', borderRadius: 'var(--radius-pill)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {pk.year} R{pk.round}
          <button
            onClick={() => onChange(side, pk, true)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ── TradeResult banner ────────────────────────────────────────────────────────

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
        <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: result.accepted ? 'var(--success)' : 'var(--danger)' }}>
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
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}

// ── TradeBlockSummary ─────────────────────────────────────────────────────────
// Visual "staged trade" pill strip rendered below the two panels.

function TradeBlockSummary({ myRoster, theirRoster, offering, receiving, myPicks, theirPicks }) {
  const hasAnything = offering.size > 0 || receiving.size > 0 || myPicks.length > 0 || theirPicks.length > 0;
  if (!hasAnything) return null;

  const offeredPlayers  = [...offering ].map(id => myRoster.find(p => p.id === id)).filter(Boolean);
  const receivedPlayers = [...receiving].map(id => theirRoster.find(p => p.id === id)).filter(Boolean);

  const PlayerPill = ({ p }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px 2px 6px', borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-strong)', fontSize: 'var(--text-xs)',
      fontWeight: 600, color: 'var(--text)',
      border: '1px solid var(--hairline)',
    }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{p.pos}</span>
      {p.name}
      <OvrBadge ovr={p.ovr} />
    </span>
  );

  const PickPill = ({ pk }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
      background: 'var(--accent)11', fontSize: 'var(--text-xs)',
      fontWeight: 700, color: 'var(--accent)',
      border: '1px solid var(--accent)33',
    }}>
      {pk.year} R{pk.round}
    </span>
  );

  const EmptyNote = () => (
    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
      nothing selected
    </span>
  );

  return (
    <div className="card" style={{ padding: 'var(--space-4) var(--space-5)', marginTop: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{
        fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
      }}>
        Trade Block Summary
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
        {/* You Give */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
            You Give
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {offeredPlayers.map(p => <PlayerPill key={p.id} p={p} />)}
            {myPicks.map(pk => <PickPill key={pk.id} pk={pk} />)}
            {offeredPlayers.length === 0 && myPicks.length === 0 && <EmptyNote />}
          </div>
        </div>

        {/* Centre arrow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
          <span style={{ fontSize: 'var(--text-xl)', color: 'var(--text-subtle)' }}>⇄</span>
        </div>

        {/* You Receive */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
            You Receive
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {receivedPlayers.map(p => <PlayerPill key={p.id} p={p} />)}
            {theirPicks.map(pk => <PickPill key={pk.id} pk={pk} />)}
            {receivedPlayers.length === 0 && theirPicks.length === 0 && <EmptyNote />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TradeCenter({ league, actions, onPlayerSelect }) {
  const myTeamId = league?.userTeamId;

  // ── State ──────────────────────────────────────────────────────────────────

  const [targetId,    setTargetId]    = useState(null);
  const [myRoster,    setMyRoster]    = useState([]);
  const [theirRoster, setTheirRoster] = useState([]);
  const [myTeam,      setMyTeam]      = useState(null);
  const [theirTeam,   setTheirTeam]   = useState(null);

  // Selected player IDs
  const [offering,    setOffering]    = useState(new Set()); // I give
  const [receiving,   setReceiving]   = useState(new Set()); // I receive

  // Draft picks in the deal
  const [myPicks,     setMyPicks]     = useState([]);  // I give
  const [theirPicks,  setTheirPicks]  = useState([]);  // I receive

  const [loading,     setLoading]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [tradeResult, setTradeResult] = useState(null);
  const [searchMy,    setSearchMy]    = useState('');
  const [searchTheir, setSearchTheir] = useState('');

  // All teams the user can trade with
  const otherTeams = useMemo(() =>
    (league?.teams ?? []).filter(t => t.id !== myTeamId).sort((a, b) => a.name.localeCompare(b.name)),
    [league?.teams, myTeamId],
  );

  // ── Roster fetching ────────────────────────────────────────────────────────

  const fetchRosters = useCallback(async (tId) => {
    if (!actions?.getRoster || myTeamId == null) return;
    setLoading(true);
    setOffering(new Set()); setReceiving(new Set());
    setMyPicks([]); setTheirPicks([]);
    setTradeResult(null);
    try {
      const [myResp, theirResp] = await Promise.all([
        actions.getRoster(myTeamId),
        tId != null ? actions.getRoster(tId) : Promise.resolve(null),
      ]);
      if (myResp?.payload)    { setMyRoster(myResp.payload.players ?? []);    setMyTeam(myResp.payload.team);    }
      if (theirResp?.payload) { setTheirRoster(theirResp.payload.players ?? []); setTheirTeam(theirResp.payload.team); }
    } catch (e) {
      console.error('[TradeCenter] fetchRosters failed:', e);
    } finally {
      setLoading(false);
    }
  }, [myTeamId, actions]);

  useEffect(() => { fetchRosters(targetId); }, [targetId, fetchRosters]);

  // ── Sync myTeam / theirTeam with the live league.teams prop ───────────────
  // After a week is simulated or a previous trade executes, league.teams carries
  // updated cap figures.  Using stale fetchRoster data here would show wrong
  // cap-after-trade numbers, so we overlay the live team object when available.

  const liveMyTeam    = useMemo(
    () => league?.teams?.find(t => t.id === myTeamId) ?? myTeam,
    [league?.teams, myTeamId, myTeam],
  );
  const liveTheirTeam = useMemo(
    () => (targetId != null ? (league?.teams?.find(t => t.id === targetId) ?? theirTeam) : theirTeam),
    [league?.teams, targetId, theirTeam],
  );

  // ── Trade value math ───────────────────────────────────────────────────────

  const myOfferValue = useMemo(() => {
    const pv = [...offering].reduce((s, id) => s + playerTradeValue(myRoster.find(p => p.id === id)), 0);
    const kv = myPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0);
    return pv + kv;
  }, [offering, myRoster, myPicks]);

  const theirOfferValue = useMemo(() => {
    const pv = [...receiving].reduce((s, id) => s + playerTradeValue(theirRoster.find(p => p.id === id)), 0);
    const kv = theirPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0);
    return pv + kv;
  }, [receiving, theirRoster, theirPicks]);

  // ── Cap-space-after-trade math ─────────────────────────────────────────────
  // When I give a player away  → I free up their salary  → my room increases
  // When I receive a player    → I absorb their salary   → my room decreases

  const myCapAfter = useMemo(() => {
    const base     = liveMyTeam?.capRoom ?? 0;
    const freed    = [...offering ].reduce((s, id) => s + (myRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    const absorbed = [...receiving].reduce((s, id) => s + (theirRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    return Math.round((base + freed - absorbed) * 10) / 10;
  }, [offering, receiving, myRoster, theirRoster, liveMyTeam]);

  const theirCapAfter = useMemo(() => {
    const base     = liveTheirTeam?.capRoom ?? 0;
    const freed    = [...receiving].reduce((s, id) => s + (theirRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    const absorbed = [...offering ].reduce((s, id) => s + (myRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    return Math.round((base + freed - absorbed) * 10) / 10;
  }, [offering, receiving, myRoster, theirRoster, liveTheirTeam]);

  // ── Selection toggles ──────────────────────────────────────────────────────

  const toggleOffering  = (id, chk) => setOffering (prev => { const s = new Set(prev); chk ? s.add(id) : s.delete(id); return s; });
  const toggleReceiving = (id, chk) => setReceiving(prev => { const s = new Set(prev); chk ? s.add(id) : s.delete(id); return s; });

  const handlePickChange = (side, pick, remove = false) => {
    const setter = side === 'my' ? setMyPicks : setTheirPicks;
    if (remove) setter(prev => prev.filter(p => p.id !== pick.id));
    else        setter(prev => [...prev, pick]);
  };

  const hasSelection = offering.size > 0 || receiving.size > 0 || myPicks.length > 0 || theirPicks.length > 0;

  // ── Propose trade ──────────────────────────────────────────────────────────

  const handlePropose = async () => {
    if (!hasSelection || targetId == null) return;
    setSubmitting(true);
    setTradeResult(null);
    try {
      const resp = await actions.submitTrade(
        myTeamId, targetId,
        { playerIds: [...offering],  pickIds: myPicks.map(p => p.id) },
        { playerIds: [...receiving], pickIds: theirPicks.map(p => p.id) },
      );
      if (resp?.payload) {
        setTradeResult(resp.payload);
        if (resp.payload.accepted) {
          // Clear staged assets and refresh rosters after successful trade
          setOffering(new Set()); setReceiving(new Set());
          setMyPicks([]); setTheirPicks([]);
          await fetchRosters(targetId);
        }
      }
    } catch (e) {
      console.error('[TradeCenter] submitTrade failed:', e);
      setTradeResult({ accepted: false, reason: 'Error communicating with the game engine.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered rosters for search ────────────────────────────────────────────

  const filterRoster = (roster, q) =>
    q.trim()
      ? roster.filter(p => p.name?.toLowerCase().includes(q.toLowerCase()))
      : roster;

  const myFiltered    = useMemo(() => filterRoster(myRoster,    searchMy   ).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)), [myRoster,    searchMy]);
  const theirFiltered = useMemo(() => filterRoster(theirRoster, searchTheir).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)), [theirRoster, searchTheir]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header card: team selector + propose button ── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <div style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4,
            }}>
              Trade Partner
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
                <option key={t.id} value={t.id}>
                  {t.name} ({t.wins}–{t.losses})
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }} />

          {targetId != null && (
            <button
              className="btn btn-primary"
              onClick={handlePropose}
              disabled={!hasSelection || submitting}
              style={{ fontWeight: 700, padding: 'var(--space-2) var(--space-6)', fontSize: 'var(--text-sm)' }}
            >
              {submitting ? 'Evaluating…' : 'Propose Trade'}
            </button>
          )}
        </div>
      </div>

      {/* ── Trade result banner ── */}
      {tradeResult && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <TradeResult result={tradeResult} onDismiss={() => setTradeResult(null)} />
        </div>
      )}

      {/* ── Main content (hidden until partner is selected) ── */}
      {targetId == null ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)' }}>
          Select a trade partner above to begin building a deal.
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          Loading rosters…
        </div>
      ) : (
        <>
          {/* ── Live value + cap math card ── */}
          {hasSelection && (
            <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
              {/* OVR trade value bar */}
              <ValueBar myValue={myOfferValue} theirValue={theirOfferValue} />

              {/* Separator */}
              <div style={{ height: 1, background: 'var(--hairline)', margin: 'var(--space-4) 0' }} />

              {/* Cap-space-after-trade panel */}
              <CapImpact
                myTeam={liveMyTeam}
                theirTeam={liveTheirTeam}
                myCapAfter={myCapAfter}
                theirCapAfter={theirCapAfter}
              />
            </div>
          )}

          {/* ── Side-by-side roster panels ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>

            {/* ─ My side (You Give) ─ */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
                    {liveMyTeam?.name ?? 'My Team'} · You Give
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {offering.size} player{offering.size !== 1 ? 's' : ''} + {myPicks.length} pick{myPicks.length !== 1 ? 's' : ''} selected
                    {offering.size > 0 && (
                      <span style={{ marginLeft: 6, color: myCapAfter < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        · cap after: {fmtSalary(myCapAfter)}
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="text" placeholder="Filter…" value={searchMy}
                  onChange={e => setSearchMy(e.target.value)}
                  style={{ width: 100, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 'var(--text-xs)' }}
                />
              </div>
              {/* Player list */}
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {myFiltered.map(p => (
                  <PlayerCheckRow
                    key={p.id} player={p}
                    checked={offering.has(p.id)}
                    onChange={toggleOffering}
                    onNameClick={onPlayerSelect}
                  />
                ))}
                {myFiltered.length === 0 && (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    No players match filter.
                  </div>
                )}
              </div>
              {/* Pick adder */}
              <PickSelector side="my" picks={myPicks} onChange={handlePickChange} />
            </div>

            {/* ─ Their side (You Receive) ─ */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                    {liveTheirTeam?.name ?? 'Their Team'} · You Receive
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {receiving.size} player{receiving.size !== 1 ? 's' : ''} + {theirPicks.length} pick{theirPicks.length !== 1 ? 's' : ''} selected
                    {receiving.size > 0 && (
                      <span style={{ marginLeft: 6, color: theirCapAfter < 0 ? 'var(--danger)' : 'var(--text-subtle)' }}>
                        · their cap after: {fmtSalary(theirCapAfter)}
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="text" placeholder="Filter…" value={searchTheir}
                  onChange={e => setSearchTheir(e.target.value)}
                  style={{ width: 100, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 'var(--text-xs)' }}
                />
              </div>
              {/* Player list */}
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {theirFiltered.map(p => (
                  <PlayerCheckRow
                    key={p.id} player={p}
                    checked={receiving.has(p.id)}
                    onChange={toggleReceiving}
                    onNameClick={onPlayerSelect}
                  />
                ))}
                {theirFiltered.length === 0 && (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    No players match filter.
                  </div>
                )}
              </div>
              {/* Pick adder */}
              <PickSelector side="their" picks={theirPicks} onChange={handlePickChange} />
            </div>
          </div>

          {/* ── Trade block summary strip ── */}
          <TradeBlockSummary
            myRoster={myRoster}
            theirRoster={theirRoster}
            offering={offering}
            receiving={receiving}
            myPicks={myPicks}
            theirPicks={theirPicks}
          />
        </>
      )}
    </div>
  );
}
