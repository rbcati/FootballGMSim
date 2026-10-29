import { afterEach, describe, it, expect, vi } from 'vitest';
import { makeLeague } from '../../src/core/league.js';
import { buildDefaultLeague } from '../../src/data/defaultLeague.ts';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { makeAccurateSchedule } from '../../src/core/schedule.js';
import { runDynastySoakAudit } from '../../src/core/dynastySoakAudit.js';
import * as timeline from '../../src/core/transactionTimeline.js';
import * as draft from '../../src/core/draftClassHistory.js';

afterEach(() => vi.restoreAllMocks());
describe('player association in the production dynasty audit', () => {
  for (const source of ['normal', 'fallback']) it(`${source} preserves distinct transaction and draft player associations`, () => {
    const league = source === 'normal' ? makeLeague(DEFAULT_TEAMS, { year: 2026 }, { makeSchedule: makeAccurateSchedule }) : buildDefaultLeague({ year: 2026 });
    const [a, b] = league.teams[0].roster;
    const transactions = [
      { id: 'sign-a', type: 'SIGN', teamId: 0, seasonId: '2026', week: 1, details: { playerId: a.id } },
      ...[a, b].map((p, index) => ({ id: `draft-${index}`, type: 'DRAFT', teamId: 0, seasonId: '2026', week: 1, details: { playerId: p.id, round: 1, overall: index + 1 } })),
    ];
    const normalize = vi.spyOn(timeline, 'normalizeRawTransaction');
    const classes = vi.spyOn(draft, 'buildDraftClassModel');
    runDynastySoakAudit({ viewState: { ...league, userTeamId: 0 }, transactions });
    expect(normalize.mock.calls).toHaveLength(3);
    const ctx = normalize.mock.calls[0][1];
    expect(ctx.playersById.size).toBe(1696);
    expect(ctx.playersById.get(String(a.id))?.name).toBe(a.name);
    expect(ctx.playersById.get(String(b.id))?.name).toBe(b.name);
    expect(normalize.mock.results[0].value).toMatchObject({ playerId: a.id, playerName: a.name });
    expect(classes.mock.calls).toHaveLength(1);
    const model = classes.mock.results[0].value;
    expect(model.picks.map(p => p.playerId)).toEqual([a.id, b.id]);
    expect(model.picks.map(p => p.playerName)).toEqual([a.name, b.name]);
    expect(new Set(model.picks.map(p => p.redraftRank)).size).toBe(2);
    expect(draft.buildPlayerDraftContext(b, model, transactions).redraftRank).toBe(model.picks.find(p => p.playerId === b.id).redraftRank);
  });
});
