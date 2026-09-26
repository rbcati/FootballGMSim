import React, { useMemo, useState } from 'react';
import { DEPTH_CHART_ROWS, getPlayerScrimmageUnitRow, getScrimmageDepthRow, isPlayerEligibleForDepthRow } from '../../core/depthChart.js';
import { calculatePlayerSchemeFit } from '../../core/scheme-core.js';
import { isAvailableForGameDay } from '../../core/holdouts/holdoutEngine.js';
import { buildReplacementUpdates, deriveLineupRatingSnapshot } from '../utils/lineupCommandCenter.js';

const fitColor = (fit) => fit >= 80 ? 'var(--success)' : fit >= 65 ? 'var(--warning)' : 'var(--danger)';
const unavailable = (player, teamId) => !isAvailableForGameDay(player, { teamId });

export default function LineupCommandCenter({ team, roster, actions, onPlayerSelect, onNavigate }) {
  const [unit, setUnit] = useState('offense');
  const [changingId, setChangingId] = useState(null);
  const [projectedRoster, setProjectedRoster] = useState(null);
  const displayedRoster = projectedRoster ?? roster;
  const snapshot = useMemo(() => deriveLineupRatingSnapshot({ team, roster: displayedRoster }), [team, displayedRoster]);
  const players = unit === 'offense' ? snapshot.offensePlayers : unit === 'defense' ? snapshot.defensePlayers
    : roster.filter((player) => ['K', 'P'].includes(player.pos) || player?.depthChart?.rowKey === 'RS');
  const group = unit.toUpperCase();
  const scheme = unit === 'offense' ? snapshot.schemes.offense : snapshot.schemes.defense;
  const comparison = unit === 'offense' ? snapshot.offenseComparison : snapshot.defenseComparison;
  const weakest = unit === 'special' ? null : [...players].sort((a, b) => Number(a.ovr ?? 0) - Number(b.ovr ?? 0))[0];

  const alternativesFor = (starter) => {
    const row = getScrimmageDepthRow(starter, group) ?? getPlayerScrimmageUnitRow(starter, group);
    if (!row) return [];
    const starterIds = new Set([...snapshot.offenseStarterIds, ...snapshot.defenseStarterIds].map(String));
    return roster.filter((candidate) => String(candidate.id) !== String(starter.id)
      && !starterIds.has(String(candidate.id)) && isPlayerEligibleForDepthRow(candidate, row) && !unavailable(candidate, team?.id))
      .sort((a, b) => Number(b.ovr ?? 0) - Number(a.ovr ?? 0));
  };

  const replace = async (starter, replacement) => {
    const updates = buildReplacementUpdates(roster, starter, replacement, group);
    if (!updates.length) return;
    const updateById = new Map(updates.map((update) => [String(update.playerId), update]));
    setProjectedRoster(roster.map((player) => {
      const update = updateById.get(String(player.id));
      return update ? { ...player, depthOrder: update.newOrder, depthChart: { ...(player.depthChart ?? {}), rowKey: update.rowKey, order: update.newOrder } } : player;
    }));
    setChangingId(null);
    try { await actions?.updateDepthChart?.(updates); } finally { setProjectedRoster(null); }
  };

  return <div className="lineup-command-center" data-testid="lineup-command-center">
    <section className="lineup-summary" aria-label="Starting lineup strength">
      <div><small>{team?.abbr ?? team?.name ?? 'TEAM'}</small><strong>{snapshot.overall}</strong><span>TEAM</span></div>
      <div><strong>{snapshot.offense}</strong><span>OFF</span></div>
      <div><strong>{snapshot.defense}</strong><span>DEF</span></div>
      <div className="lineup-summary__schemes"><span>{snapshot.schemes.offense.name} · {snapshot.offensiveSchemeFit}% fit</span><span>{snapshot.schemes.defense.name} · {snapshot.defensiveSchemeFit}% fit</span></div>
    </section>

    <div className="lineup-unit-tabs" role="tablist" aria-label="Lineup unit">
      {['offense', 'defense', 'special'].map((key) => <button key={key} role="tab" aria-selected={unit === key} onClick={() => { setUnit(key); setChangingId(null); }}>{key === 'special' ? 'Special Teams' : key}</button>)}
    </div>

    {weakest && <div className="lineup-insight"><span>Weakest starter</span><strong>{getScrimmageDepthRow(weakest, group)?.key ?? weakest.pos} · {weakest.name} · {weakest.ovr ?? '—'} OVR</strong></div>}

    <div className="lineup-starters" data-testid={`${unit}-lineup`}>
      {players.map((player, playerIndex) => {
        const row = unit === 'special' ? DEPTH_CHART_ROWS.find((item) => item.key === player?.depthChart?.rowKey) : getScrimmageDepthRow(player, group) ?? getPlayerScrimmageUnitRow(player, group);
        const fit = unit === 'special' ? null : calculatePlayerSchemeFit(player, scheme);
        const isChanging = changingId === player.id;
        return <div className="lineup-starter" key={player.id ?? `lineup-${playerIndex}`} data-player-id={player.id}>
          <button className="lineup-starter__profile" onClick={() => onPlayerSelect?.(player.id)}>
            <span className="lineup-starter__role">{row?.key ?? player.pos}</span>
            <span className="lineup-starter__identity"><strong>{player.name ?? `Player #${player.id}`}</strong><small>{player.pos ?? '—'}{unavailable(player, team?.id) ? ' · Unavailable' : ' · Ready'}</small></span>
            <strong className="lineup-starter__ovr">{player.ovr ?? '—'}<small>OVR</small></strong>
            {fit != null && <strong className="lineup-starter__fit" style={{ color: fitColor(fit) }}>{fit}%<small>FIT</small></strong>}
          </button>
          {unit !== 'special' && <button className="lineup-change" onClick={() => setChangingId(isChanging ? null : player.id)}>Change</button>}
          {isChanging && <div className="lineup-alternatives" aria-label={`Replace ${player.name}`}>
            {alternativesFor(player).map((candidate) => <button key={candidate.id} onClick={() => replace(player, candidate)}><span><strong>{candidate.name}</strong><small>{candidate.pos} · Ready</small></span><span>{candidate.ovr ?? '—'} OVR · {calculatePlayerSchemeFit(candidate, scheme)}% FIT</span></button>)}
            {!alternativesFor(player).length && <p>No eligible available alternatives.</p>}
          </div>}
        </div>;
      })}
    </div>

    {unit !== 'special' && <section className="scheme-comparison"><div><small>CURRENT</small><strong>{scheme.name} — {comparison.find((item) => item.id === scheme.id)?.fit ?? 50}%</strong></div>{comparison.filter((item) => item.id !== scheme.id).map((item, index) => <div key={item.id}><small>{index === 0 && item.fit > (comparison.find((entry) => entry.id === scheme.id)?.fit ?? 0) ? 'BEST PERSONNEL FIT' : 'OTHER FIT'}</small><strong>{item.name} — {item.fit}%</strong></div>)}<button onClick={() => onNavigate?.('Game Plan')}>Review Game Plan</button></section>}
  </div>;
}
