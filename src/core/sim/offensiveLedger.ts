/** Live offensive ownership. No RNG, inferred longest gains, or postgame redistribution. */
export type OffensiveStats = Record<string, number>;
export type OffensivePlay =
  | { type: 'rush'; runnerId: string; yards: number; touchdown?: boolean; fumbleLost?: boolean }
  | { type: 'pass'; passerId: string; targetId?: string; yards: number; complete: boolean; sack?: boolean; interception?: boolean; touchdown?: boolean; fumbleLost?: boolean };

export function createOffensiveLedger(playerIds: string[], context: string) {
  const eligible = new Set(playerIds);
  if (eligible.size !== playerIds.length || playerIds.some((id) => !id.trim() || ['undefined', 'null', 'NaN', 'Infinity', '[object Object]'].includes(id))) {
    throw new Error(`Stat attribution ${context}: missing or duplicate player ID`);
  }
  const rows = new Map<string, OffensiveStats>();
  const totals = { passAtt: 0, passComp: 0, passYd: 0, passTD: 0, rushAtt: 0, rushYd: 0, rushTD: 0, sacksAllowed: 0 };
  const row = (id: string) => {
    if (!eligible.has(id)) throw new Error(`Stat attribution ${context}: ineligible player ${id}`);
    let stats = rows.get(id);
    if (!stats) { stats = {}; rows.set(id, stats); }
    return stats;
  };
  const add = (s: OffensiveStats, key: string, value = 1) => { s[key] = (s[key] ?? 0) + value; };
  const longest = (s: OffensiveStats, key: string, gain: number) => { s[key] = s[key] == null ? gain : Math.max(s[key], gain); };
  const credit = (play: OffensivePlay) => {
    if (!Number.isSafeInteger(play.yards)) throw new Error(`Stat attribution ${context}: invalid gain ${play.yards}`);
    const yards = play.yards + 0; // Canonicalize IEEE -0 before save/reload.
    // Validate the entire event before changing the ledger.
    if (play.type === 'pass' && ((play.sack && play.interception) || (play.complete && (play.sack || play.interception)) || (play.touchdown && !play.complete))) {
      throw new Error(`Stat attribution ${context}: contradictory pass event for ${play.passerId}`);
    }
    const ids = play.type === 'rush' ? [play.runnerId] : [play.passerId, ...(!play.sack ? [play.targetId ?? ''] : [])];
    for (const id of ids) if (!eligible.has(id)) throw new Error(`Stat attribution ${context}: ineligible player ${id}`);
    if (play.type === 'rush') {
      const r = row(play.runnerId);
      r.fumbles ??= 0;
      add(r, 'rushAtt'); add(r, 'rushYd', yards);
      longest(r, 'longestRun', yards);
      totals.rushAtt++; totals.rushYd += yards;
      if (play.touchdown) { add(r, 'rushTD'); totals.rushTD++; }
      if (play.fumbleLost) { add(r, 'fumbles'); add(r, 'fumblesLost'); }
      return;
    }
    const qb = row(play.passerId);
    add(qb, 'dropbacks');
    if (play.sack) {
      add(qb, 'sacked'); add(qb, 'sacksTaken'); add(qb, 'sackYards', -yards);
      totals.sacksAllowed++;
    } else {
      add(qb, 'passAtt'); totals.passAtt++;
      const receiver = row(play.targetId!);
      receiver.drops ??= 0;
      add(receiver, 'targets');
      if (play.complete) {
        add(qb, 'passComp'); add(qb, 'passYd', yards);
        add(receiver, 'receptions'); add(receiver, 'recYd', yards);
        longest(qb, 'longestPass', yards); longest(receiver, 'longestCatch', yards);
        totals.passComp++; totals.passYd += yards;
        if (play.touchdown) { add(qb, 'passTD'); add(receiver, 'recTD'); totals.passTD++; }
      }
      if (play.interception) add(qb, 'interceptions');
      if (play.fumbleLost && play.complete) { add(receiver, 'fumbles'); add(receiver, 'fumblesLost'); }
    }
    if (play.fumbleLost && (!play.complete || play.sack)) { add(qb, 'fumbles'); add(qb, 'fumblesLost'); }
  };
  return {
    get players(): Record<string, OffensiveStats> { return Object.fromEntries(rows); },
    totals, credit,
    creditDrop(id: string) { const stats = row(id); add(stats, 'drops'); },
  };
}
