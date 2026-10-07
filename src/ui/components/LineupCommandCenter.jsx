import React, { useMemo, useState } from 'react';
import { DEPTH_CHART_ROWS, getPlayerScrimmageUnitRow, getScrimmageDepthRow, isPlayerEligibleForDepthRow } from '../../core/depthChart.js';
import { calculatePlayerSchemeFit } from '../../core/scheme-core.js';
import { isAvailableForGameDay } from '../../core/holdouts/holdoutEngine.js';
import { buildReplacementUpdates, deriveEditableCanonicalLineup, deriveLineupRatingSnapshot, getPersistedDepthAssignment } from '../utils/lineupCommandCenter.js';
import { deriveRosterReadinessModel } from '../utils/rosterReadinessModel.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { deriveGameDayAvailability } from '../../core/gameDayAvailability.js';
import { isPlayerInjured } from '../utils/injuryReadinessModel.js';
import { deriveSpecialTeamsPresentationRating } from '../utils/hqCommandCenterV2.js';

const fitColor = (fit) => fit >= 75 ? 'var(--success)' : fit >= 40 ? 'var(--warning)' : 'var(--danger)';
const fitLabel = (fit) => fit >= 75 ? 'Good fit' : fit >= 40 ? 'Average fit' : 'Poor fit';
const unavailable = (player, teamId) => !isAvailableForGameDay(player, { teamId });

export default function LineupCommandCenter({ league, team, roster, actions, onPlayerSelect, onNavigate }) {
  const [unit, setUnit] = useState('offense');
  const [changingId, setChangingId] = useState(null);
  const [projectedRoster, setProjectedRoster] = useState(null);
  const displayedRoster = projectedRoster ?? roster;
  const snapshot = useMemo(() => deriveLineupRatingSnapshot({ team, roster: displayedRoster }), [team, displayedRoster]);
  const specialTeamsRating = useMemo(() => deriveSpecialTeamsPresentationRating({ ...team, roster: displayedRoster }), [team, displayedRoster]);
  const offensePlayers = useMemo(() => deriveEditableCanonicalLineup({ roster: displayedRoster, simulationStarterIds: snapshot.offenseStarterIds, group: 'OFFENSE' }), [displayedRoster, snapshot.offenseStarterIds]);
  const defensePlayers = useMemo(() => deriveEditableCanonicalLineup({ roster: displayedRoster, simulationStarterIds: snapshot.defenseStarterIds, group: 'DEFENSE' }), [displayedRoster, snapshot.defenseStarterIds]);
  const specialPlayers = useMemo(() => DEPTH_CHART_ROWS
    .filter((row) => row.group === 'SPECIAL')
    .map((row) => displayedRoster
      .filter((player) => player?.depthChart?.rowKey === row.key && isPlayerEligibleForDepthRow(player, row))
      .sort((a, b) => Number(a?.depthChart?.order ?? a.depthOrder ?? 999) - Number(b?.depthChart?.order ?? b.depthOrder ?? 999))[0])
    .filter(Boolean), [displayedRoster]);
  const players = unit === 'offense' ? offensePlayers : unit === 'defense' ? defensePlayers : specialPlayers;
  const group = unit.toUpperCase();
  const scheme = unit === 'offense' ? snapshot.schemes.offense : snapshot.schemes.defense;
  const comparison = unit === 'offense' ? snapshot.offenseComparison : snapshot.defenseComparison;
  const availability = useMemo(() => deriveGameDayAvailability(displayedRoster, { teamId: team?.id }), [displayedRoster, team?.id]);
  // Use the same canonical slots shown below, including multi-player units.
  // Availability still comes from the shared game-day authority.
  const displayedStarterIds = new Set([...offensePlayers, ...defensePlayers, ...specialPlayers].map((player) => String(player.id)));
  const unavailableStarters = availability.unavailablePlayers.filter((player) => displayedStarterIds.has(String(player.id)));
  const readiness = useMemo(() => {
    // Keep persisted row ownership (including returners) when present. Legacy
    // rosters without row metadata use the readiness model's established fallback.
    const assignments = displayedRoster.some((player) => getPersistedDepthAssignment(player))
      ? Object.fromEntries(DEPTH_CHART_ROWS.map((row) => [row.key, displayedRoster
        .filter((player) => getPersistedDepthAssignment(player)?.rowKey === row.key)
        .sort((a, b) => getPersistedDepthAssignment(a).order - getPersistedDepthAssignment(b).order)
        .map((player) => player.id)])) : null;
    return deriveRosterReadinessModel({ league, team, roster: displayedRoster, assignments });
  }, [league, team, displayedRoster]);
  const starterHealthNeedsReview = readiness.injuryReplacementConcerns > 0
    || availability.injuredPlayers.some((player) => displayedStarterIds.has(String(player.id)))
    || [...offensePlayers, ...defensePlayers, ...specialPlayers].some(isPlayerInjured);
  const weakest = unit === 'special' ? null : [...players].sort((a, b) => Number(a.ovr ?? 0) - Number(b.ovr ?? 0))[0];

  const alternativesFor = (starter) => {
    const row = group === 'SPECIAL'
      ? DEPTH_CHART_ROWS.find((entry) => entry.key === starter?.depthChart?.rowKey)
      : getScrimmageDepthRow(starter, group) ?? getPlayerScrimmageUnitRow(starter, group);
    if (!row) return [];
    const starterIds = new Set([...offensePlayers, ...defensePlayers, ...specialPlayers].map((player) => String(player.id)));
    return roster.filter((candidate) => String(candidate.id) !== String(starter.id)
      && !starterIds.has(String(candidate.id))
      && (group !== 'SPECIAL' || [null, row.key].includes(getPersistedDepthAssignment(candidate)?.rowKey ?? null))
      && isPlayerEligibleForDepthRow(candidate, row) && !unavailable(candidate, team?.id))
      .sort((a, b) => Number(b.ovr ?? 0) - Number(a.ovr ?? 0));
  };

  const replace = async (starter, replacement) => {
    const updates = buildReplacementUpdates(roster, starter, replacement, group);
    if (!updates.length) return;
    const updateById = new Map(updates.map((update) => [String(update.playerId), update]));
    const nextRoster = roster.map((player) => {
      const update = updateById.get(String(player.id));
      return update ? { ...player, depthOrder: update.newOrder, depthChart: { ...(player.depthChart ?? {}), rowKey: update.rowKey, order: update.newOrder } } : player;
    });
    setProjectedRoster(nextRoster);
    setChangingId(null);
    try {
      await actions?.updateDepthChart?.(updates);
      const assignments = Object.fromEntries(DEPTH_CHART_ROWS.map((row) => [row.key, nextRoster
        .filter((player) => player?.depthChart?.rowKey === row.key)
        .sort((a, b) => Number(a?.depthChart?.order ?? a.depthOrder ?? 999) - Number(b?.depthChart?.order ?? b.depthOrder ?? 999))
        .map((player) => player.id)]));
      const readiness = deriveRosterReadinessModel({ league, team, roster: nextRoster, assignments, source: 'team-lineup' });
      if (readiness.safeToMarkLineupChecked) markWeeklyPrepStep(league, 'lineupChecked', true);
    } finally { setProjectedRoster(null); }
  };

  return <div className="lineup-command-center" data-testid="lineup-command-center">
    <section className="guided-week-summary" data-testid="lineup-what-matters" aria-label="What Matters This Week">
      <small>What Matters This Week</small>
      <strong>{unavailableStarters.length
        ? `${unavailableStarters.length} starter${unavailableStarters.length === 1 ? ' needs' : 's need'} attention`
        : readiness.missingStarterCount ? `${readiness.missingStarterCount} depth group${readiness.missingStarterCount === 1 ? ' needs' : 's need'} a starter`
        : starterHealthNeedsReview ? 'Starter health needs review'
        : snapshot.offensePlayers.length > 0 && snapshot.offensiveSchemeFit < 40 ? 'Starting lineup is ready · poor offensive scheme fit'
        : snapshot.defensePlayers.length > 0 && snapshot.defensiveSchemeFit < 40 ? 'Starting lineup is ready · poor defensive scheme fit'
        : '✓ Starting lineup is ready'}</strong>
      {unavailableStarters.length > 0 && <p>{unavailableStarters.map((player) => `${player.pos ?? player.position ?? "Player"} ${player.name ?? "Unnamed player"}`).join(', ')} unavailable. Use Change to review healthy backups.</p>}
      {!unavailableStarters.length && starterHealthNeedsReview && <p>Check starter injuries and healthy backups before game day.</p>}
      {(unavailableStarters.length > 0 || readiness.missingStarterCount > 0 || starterHealthNeedsReview) && <button className="btn btn-secondary" onClick={() => onNavigate?.('Depth Chart')}>{readiness.missingStarterCount > 0 ? 'Fill empty depth assignments' : unavailableStarters.length > 0 ? 'Review depth assignments' : 'Review starter health'}</button>}
    </section>
    <section className="lineup-summary" aria-label="Starting lineup strength">
      <div><small>{team?.abbr ?? team?.name ?? 'TEAM'}</small><strong>{snapshot.overall}</strong><span>TEAM</span></div>
      <div><strong>{snapshot.offense}</strong><span>OFF</span></div>
      <div><strong>{snapshot.defense}</strong><span>DEF</span></div>
      <div><strong>{specialTeamsRating ?? '—'}</strong><span>SPEC</span></div>
      <div className="lineup-summary__schemes"><span>{snapshot.schemes.offense.name} · {fitLabel(snapshot.offensiveSchemeFit)}</span><span>{snapshot.schemes.defense.name} · {fitLabel(snapshot.defensiveSchemeFit)}</span></div>
    </section>
    <details className="guided-detail"><summary>Why scheme fit matters</summary><p>Scheme fit reflects how well your assigned starters’ strengths match the system you are running. Compare talent and availability alongside fit; this score does not promise a fixed ratings bonus.</p></details>

    <div className="lineup-unit-tabs" role="tablist" aria-label="Lineup unit">
      {['offense', 'defense', 'special'].map((key) => <button key={key} role="tab" aria-selected={unit === key} onClick={() => { setUnit(key); setChangingId(null); }}>{key === 'special' ? 'Special Teams' : key}</button>)}
    </div>

    {weakest && <details className="guided-detail"><summary>Unit detail</summary><div className="lineup-insight"><span>Lowest starter OVR</span><strong>{getScrimmageDepthRow(weakest, group)?.key ?? weakest.pos} · {weakest.name} · {weakest.ovr ?? '—'} OVR</strong></div></details>}

    <div className="lineup-starters" data-testid={`${unit}-lineup`}>
      {players.map((player, playerIndex) => {
        const row = unit === 'special' ? DEPTH_CHART_ROWS.find((item) => item.key === player?.depthChart?.rowKey) : getScrimmageDepthRow(player, group) ?? getPlayerScrimmageUnitRow(player, group);
        const fit = unit === 'special' ? null : calculatePlayerSchemeFit(player, scheme);
        const isChanging = changingId === player.id;
        const selectedIds = unit === 'offense' ? snapshot.offenseStarterIds : snapshot.defenseStarterIds;
        const fallback = unit === 'special' || selectedIds.some((id) => String(id) === String(player.id)) ? null
          : (unit === 'offense' ? snapshot.offensePlayers : snapshot.defensePlayers).find((candidate) => {
            const candidateRow = getScrimmageDepthRow(candidate, group) ?? getPlayerScrimmageUnitRow(candidate, group);
            return candidateRow?.key === row?.key;
          });
        return <div className="lineup-starter" key={player.id ?? `lineup-${playerIndex}`} data-player-id={player.id}>
          <button className="lineup-starter__profile" onClick={() => onPlayerSelect?.(player.id)}>
            <span className="lineup-starter__role">{row?.key ?? player.pos}</span>
            <span className="lineup-starter__identity"><strong>{player.name ?? `Player #${player.id}`}</strong><small>{player.pos ?? '—'}{unavailable(player, team?.id) ? ' · Unavailable' : ' · Ready'}</small></span>
            <strong className="lineup-starter__ovr">{player.ovr ?? '—'}<small>OVR</small></strong>
            {fit != null && <strong className="lineup-starter__fit" style={{ color: fitColor(fit) }}>{fitLabel(fit)}</strong>}
          </button>
          {fallback && <small className="lineup-starter__fallback">Game-day fallback: {fallback.name ?? `Player #${fallback.id}`}</small>}
          <button className="lineup-change" onClick={() => setChangingId(isChanging ? null : player.id)}>Change</button>
          {isChanging && <div className="lineup-alternatives" aria-label={`Replace ${player.name}`}>
            {alternativesFor(player).map((candidate) => <button key={candidate.id} onClick={() => replace(player, candidate)}><span><strong>{candidate.name}</strong><small>{candidate.pos} · Ready</small></span><span>{candidate.ovr ?? '—'} OVR{unit === 'special' ? ' · Ready' : ` · ${fitLabel(calculatePlayerSchemeFit(candidate, scheme))}`}</span></button>)}
            {!alternativesFor(player).length && <p>No eligible available alternatives.</p>}
          </div>}
        </div>;
      })}
    </div>

    {unit !== 'special' && <details className="guided-detail"><summary>Compare scheme fits</summary><section className="scheme-comparison"><div><small>CURRENT · FIT SCORE / 100</small><strong>{scheme.name} — {comparison.find((item) => item.id === scheme.id)?.fit ?? 50}</strong></div>{comparison.filter((item) => item.id !== scheme.id).map((item, index) => <div key={item.id}><small>{index === 0 && item.fit > (comparison.find((entry) => entry.id === scheme.id)?.fit ?? 0) ? 'BEST PERSONNEL FIT' : 'OTHER FIT'}</small><strong>{item.name} — {item.fit}</strong></div>)}<button onClick={() => onNavigate?.('Game Plan')}>Review Game Plan</button></section></details>}
  </div>;
}
