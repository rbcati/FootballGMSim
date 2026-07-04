/**
 * GET_ROSTER handler — extracted behavior parity.
 *
 * Pins the ROSTER_DATA response shape the UI depends on: team cap slice,
 * per-player view-model fields (including legacy flat-contract
 * normalization), the roster-building analysis, and requestId echo. Also
 * pins the team-not-found ERROR path.
 */
import { describe, expect, it } from 'vitest';
import { toUI } from '../../../../src/worker/protocol.js';
import { handleGetRoster } from '../../../../src/worker/handlers/rosterHandlers.js';
import { makeFakeCache, makeCtx, makeFaMeta, makeUserTeam } from './testContext.js';

function makeRosterPlayer(overrides = {}) {
  return {
    id: 11,
    name: 'Roster Ricky',
    pos: 'QB',
    age: 26,
    ovr: 84,
    potential: 88,
    status: 'active',
    teamId: 3,
    morale: 70,
    traits: ['leader'],
    contract: { years: 2, yearsTotal: 4, yearsRemaining: 2, baseAnnual: 12, signingBonus: 6, guaranteedPct: 0.6 },
    ...overrides,
  };
}

function setup({ players } = {}) {
  const team = makeUserTeam({
    id: 3,
    name: 'Testville Turbines',
    abbr: 'TVT',
    capUsed: 141.5,
    capRoom: 58.5,
    capTotal: 200,
    deadCap: 2.5,
    deadMoneyNextYear: 1,
    staff: { headCoach: { offScheme: 'West Coast', defScheme: '4-3' } },
  });
  const cache = makeFakeCache({
    meta: makeFaMeta({ userTeamId: 3 }),
    teams: [team],
    players: players ?? [
      makeRosterPlayer(),
      // Legacy flat-contract player: no nested contract object.
      makeRosterPlayer({
        id: 12,
        name: 'Legacy Larry',
        pos: 'LB',
        contract: undefined,
        years: 3,
        yearsTotal: 3,
        baseAnnual: 4.5,
        signingBonus: 1.5,
        guaranteedPct: 0.4,
      }),
    ],
  });
  return { cache, ctx: makeCtx(cache) };
}

describe('handleGetRoster', () => {
  it('posts ROSTER_DATA with the team cap slice and the requestId echoed', async () => {
    const { ctx } = setup();
    await handleGetRoster({ teamId: 3 }, 'msg_roster_1', ctx);

    expect(ctx.posts).toHaveLength(1);
    const { type, payload, id } = ctx.posts[0];
    expect(type).toBe(toUI.ROSTER_DATA);
    expect(id).toBe('msg_roster_1');
    expect(payload.teamId).toBe(3);
    expect(payload.team).toEqual({
      id: 3,
      name: 'Testville Turbines',
      abbr: 'TVT',
      capUsed: 141.5,
      capRoom: 58.5,
      capTotal: 200,
      deadCap: 2.5,
      deadMoneyNextYear: 1,
      staff: { headCoach: { offScheme: 'West Coast', defScheme: '4-3' } },
    });
    expect(payload.analysis).toBeTruthy();
  });

  it('maps players into the roster view-model shape (same keys as the monolith)', async () => {
    const { ctx } = setup();
    await handleGetRoster({ teamId: 3 }, 'msg_roster_2', ctx);

    const { players } = ctx.posts[0].payload;
    expect(players).toHaveLength(2);
    const ricky = players.find((p) => p.id === 11);
    expect(Object.keys(ricky).sort()).toEqual([
      'age', 'contract', 'id', 'morale', 'name', 'onTradeBlock', 'ovr',
      'pos', 'potential', 'progressionDelta', 'schemeFit', 'status', 'traits',
    ].sort());
    expect(ricky.contract).toEqual({ years: 2, yearsTotal: 4, yearsRemaining: 2, baseAnnual: 12, signingBonus: 6, guaranteedPct: 0.6 });
    expect(typeof ricky.schemeFit).toBe('number');
    expect(typeof ricky.morale).toBe('number');
  });

  it('normalizes legacy flat contract fields into a nested contract', async () => {
    const { ctx } = setup();
    await handleGetRoster({ teamId: 3 }, 'msg_roster_3', ctx);

    const larry = ctx.posts[0].payload.players.find((p) => p.id === 12);
    expect(larry.contract).toEqual({
      years: 3,
      yearsTotal: 3,
      yearsRemaining: 3,
      baseAnnual: 4.5,
      signingBonus: 1.5,
      guaranteedPct: 0.4,
    });
  });

  it('posts ERROR with the requestId when the team does not exist', async () => {
    const { ctx } = setup();
    await handleGetRoster({ teamId: 99 }, 'msg_roster_4', ctx);

    expect(ctx.posts).toEqual([
      { type: toUI.ERROR, payload: { message: 'Team 99 not found' }, id: 'msg_roster_4' },
    ]);
  });
});
