export function resolvePlayerForProfile({ playerId, league, context = {} } = {}) {
  if (playerId == null) {
    return { player: null, team: null, statusHint: 'unknown', source: 'none', context };
  }

  const inputPlayer = typeof playerId === 'object' ? playerId : null;
  const targetId = inputPlayer?.id ?? inputPlayer?.prospectId ?? playerId;
  const idMatches = (p) => p && (String(p.id) === String(targetId) || String(p.prospectId) === String(targetId));

  const teams = Array.isArray(league?.teams) ? league.teams : [];
  for (const team of teams) {
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    const found = roster.find(idMatches);
    if (found) return { player: found, team, statusHint: 'roster', source: 'team_roster', context };
  }

  const freeAgents = Array.isArray(league?.freeAgents) ? league.freeAgents : [];
  const foundFa = freeAgents.find(idMatches);
  if (foundFa) return { player: foundFa, team: null, statusHint: 'free_agent', source: 'free_agents', context };

  const prospects = Array.isArray(league?.draftClass) ? league.draftClass : [];
  const foundProspect = prospects.find(idMatches);
  if (foundProspect) return { player: foundProspect, team: null, statusHint: 'draft_prospect', source: 'draft_class', context };

  const contextCandidates = [context?.player, context?.row?._player, context?.selectedPlayer, ...(Array.isArray(context?.players) ? context.players : [])].filter(Boolean);
  const foundContext = contextCandidates.find(idMatches);
  if (foundContext) {
    const statusHint = foundContext.teamId == null || foundContext.teamId === 'FA' ? 'free_agent' : 'roster';
    return { player: foundContext, team: null, statusHint, source: 'context', context };
  }

  return { player: null, team: null, statusHint: 'unknown', source: 'none', context };
}
