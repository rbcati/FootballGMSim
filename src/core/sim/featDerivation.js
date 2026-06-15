/**
 * Pure adapter: derives feat entries from a rich-engine game result.
 *
 * Called at the same site in worker.js where result.feats is consumed for
 * legacy-engine results. Kept out of both the engine and the worker main loop
 * so it remains independently unit-testable.
 *
 * Thresholds: NFL "game-ball" tier — 300+ passing yards, 100+ rushing yards,
 * 100+ receiving yards.
 */

const PASS_YARD_THRESHOLD = 300;
const RUSH_YARD_THRESHOLD = 100;
const REC_YARD_THRESHOLD = 100;

/**
 * Derive feat entries from a rich-engine game result.
 *
 * Input: the mapped legacy result (from mapGameSummaryToLegacyResult).
 * The boxScore shape is { home: Record<pid, { name, pos, stats }>, away: ... }.
 *
 * Returns an array of feat objects that mirror the shape consumed by the
 * existing feat-processing loop in applyGameResultToCache, augmented with a
 * `teamSide` field so the caller can resolve teamAbbr / opponentAbbr from cache.
 *
 * @param {{ boxScore?: { home?: Record<string,{name:string,stats:Record<string,number>}>, away?: Record<string,{name:string,stats:Record<string,number>}> } }} result
 * @returns {{ playerId: string, name: string, teamSide: 'home'|'away', statValue: string, featDescription: string }[]}
 */
export function deriveFeatsFromRichGame(result) {
  if (!result?.boxScore) return [];
  const feats = [];

  for (const side of ['home', 'away']) {
    const box = result.boxScore[side];
    if (!box || typeof box !== 'object') continue;

    for (const [pid, entry] of Object.entries(box)) {
      if (!entry || typeof entry !== 'object') continue;
      const stats = entry.stats ?? {};
      const name = entry.name ?? String(pid);

      const passYd = Number(stats.passYd ?? 0);
      if (passYd >= PASS_YARD_THRESHOLD) {
        feats.push({ playerId: pid, name, teamSide: side, statValue: String(passYd), featDescription: 'passing yards' });
      }

      const rushYd = Number(stats.rushYd ?? 0);
      if (rushYd >= RUSH_YARD_THRESHOLD) {
        feats.push({ playerId: pid, name, teamSide: side, statValue: String(rushYd), featDescription: 'rushing yards' });
      }

      const recYd = Number(stats.recYd ?? 0);
      if (recYd >= REC_YARD_THRESHOLD) {
        feats.push({ playerId: pid, name, teamSide: side, statValue: String(recYd), featDescription: 'receiving yards' });
      }
    }
  }

  return feats;
}
