/**
 * Numeric-safety invariant.
 *
 * Recursively scans DURABLE game-state objects for NaN / ±Infinity, using a
 * schema-aware denylist so it never wanders into enormous narrative logs,
 * media blobs, or intentionally-nullable display objects. Scoped to teams,
 * rostered players, contracts, picks, standings and the completed-season
 * history — the state that must survive a long save.
 */
import { pass, fail, skip, scanNumericCorruption } from './helpers.js';
import { viewTeams, playerPool, leagueHistory } from './derive.js';

export const id = 'numericSafety';

// Keys whose subtrees are narrative/display/log noise, not durable numerics.
const SKIP_KEYS = new Set([
  'newsItems', 'weeklyHeadlines', 'leaguePulse', 'mediaStories', 'commissionerLog',
  'franchiseChronicle', 'seasonStorylines', 'franchiseSeasonReviews', 'developmentHistory',
  'history', 'injuryHistory', 'honorsHistory', 'personalityProfile', 'agent',
  'schedule', 'allTimeLeaderboards', 'allTimeLeaders', 'coachingMarket', 'stats',
  'ratings', 'trueRatings', 'visibleRatings', // covered by progression.ratings-numeric-safe
]);

export function check(ctx) {
  const out = [];
  const teams = viewTeams(ctx);
  const { players, source } = playerPool(ctx);
  const history = leagueHistory(ctx);

  const targets = [];
  if (teams.length) targets.push({ label: 'teams', node: teams });
  if (source !== 'none' && players.length) targets.push({ label: 'players', node: players });
  if (history.length) targets.push({ label: 'leagueHistory', node: history });

  if (!targets.length) {
    out.push(skip(ctx, 'numericSafety.durable-state-finite', 'No durable state captured at this checkpoint'));
    return out;
  }

  const findings = [];
  for (const { label, node } of targets) {
    const hits = scanNumericCorruption(node, { skipKeys: SKIP_KEYS, rootPath: label });
    for (const h of hits) findings.push(h);
  }

  if (findings.length) {
    for (const f of findings.slice(0, 15)) {
      out.push(fail(ctx, 'numericSafety.durable-state-finite', {
        entityType: 'league', entityId: null,
        message: `Numeric corruption (${f.kind}) at ${f.path}`,
        details: f,
      }));
    }
  } else {
    out.push(pass(ctx, 'numericSafety.durable-state-finite', `No NaN/Infinity in durable state (${targets.map((t) => t.label).join(', ')})`));
  }

  return out;
}
