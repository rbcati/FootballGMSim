import { describe, expect, it } from 'vitest';
import { summarizeEconomyRegressionSnapshot } from '../economyRegressionAudit.js';

const team = (overrides = {}) => ({ id: 1, name: 'Team', capRoom: 30, capUsed: 225, capTotal: 255, archetype: 'middle', ...overrides });
const offer = (overrides = {}) => ({ teamId: 1, contract: { baseAnnual: 12, yearsTotal: 1, signingBonus: 0 }, ...overrides });
const player = (overrides = {}) => ({ id: 101, name: 'Player', pos: 'WR', age: 27, ovr: 78, potential: 78, offers: [], ...overrides });

describe('economy regression audit summary', () => {
  it('counts overcommitted pending offers', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team({ capRoom: 12 })],
      freeAgents: [
        player({ id: 1, offers: [offer({ contract: { baseAnnual: 9, yearsTotal: 1 } })] }),
        player({ id: 2, pos: 'CB', offers: [offer({ contract: { baseAnnual: 8, yearsTotal: 1 } })] }),
      ],
    });

    expect(out.teamsWithPendingOfferOvercommit).toBe(1);
    expect(out.pendingOfferOvercommitCount).toBe(2);
    expect(out.pendingOfferTeamSummaries[0].capReservationStatus).toBe('overcommitted');
  });

  it('flags duplicate expensive same-position/group CPU offers', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team()],
      freeAgents: [
        player({ id: 1, pos: 'OT', offers: [offer({ contract: { baseAnnual: 16, yearsTotal: 2 } })] }),
        player({ id: 2, pos: 'OG', offers: [offer({ contract: { baseAnnual: 14, yearsTotal: 2 } })] }),
      ],
    });

    expect(out.duplicateExpensiveSameGroupOffers).toBe(1);
    expect(out.duplicateExpensiveSameGroupOfferFlags[0]).toEqual(expect.objectContaining({ positionGroup: 'OL', count: 2 }));
  });

  it('flags rebuild team offering an old expensive veteran', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team({ archetype: 'rebuild', capRoom: 40 })],
      freeAgents: [player({ id: 3, pos: 'WR', age: 33, offers: [offer({ contract: { baseAnnual: 13, yearsTotal: 2 } })] })],
    });

    expect(out.oldVeteranOffersByRebuildTeams).toBe(1);
  });

  it('does not treat contender short-term veteran offers as rebuild-vet mistakes', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team({ archetype: 'contender', capRoom: 35 })],
      freeAgents: [player({ id: 4, pos: 'WR', age: 32, offers: [offer({ contract: { baseAnnual: 11, yearsTotal: 1 } })] })],
    });

    expect(out.contenderVeteranOfferCount).toBe(1);
    expect(out.oldVeteranOffersByRebuildTeams).toBe(0);
  });

  it('recognizes severe QB need exception separately from normal over-aggression', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team({
        archetype: 'rebuild',
        capRoom: 25,
        positionalNeeds: [{ positionGroup: 'QB', priority: 90 }],
      })],
      freeAgents: [player({ id: 5, pos: 'QB', age: 29, offers: [offer({
        contract: { baseAnnual: 20, yearsTotal: 2 },
        contractModel: { marketRealism: { flags: ['qb_need_exception'] }, reasons: ['severe QB need exception'] },
      })] })],
    });

    expect(out.severeQbNeedOfferCount).toBe(1);
    expect(out.oldVeteranOffersByRebuildTeams).toBe(0);
  });

  it('flags a young premium player trade discount', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team()],
      incomingTradeOffers: [{
        id: 't1',
        offeringPlayerSnapshots: [{ id: 10, pos: 'QB', age: 23, ovr: 78, potential: 90, contract: { baseAnnual: 5 } }],
        receivingPlayerSnapshots: [{ id: 11, pos: 'RB', age: 30, ovr: 78, potential: 78, contract: { baseAnnual: 7 } }],
      }],
    });

    expect(out.premiumYoungPlayerTradeDiscountFlags).toBe(1);
  });

  it('flags an expensive veteran-for-veteran swap', () => {
    const out = summarizeEconomyRegressionSnapshot({
      teams: [team()],
      trades: [{
        id: 't2',
        offeringPlayerSnapshots: [{ id: 12, pos: 'WR', age: 33, ovr: 84, potential: 84, contract: { baseAnnual: 16 } }],
        receivingPlayerSnapshots: [{ id: 13, pos: 'CB', age: 32, ovr: 82, potential: 82, contract: { baseAnnual: 14 } }],
      }],
    });

    expect(out.expensiveVeteranSwapFlags).toBe(1);
  });

  it('returns unknown/skipped reasons for missing short-snapshot data without crashing', () => {
    const out = summarizeEconomyRegressionSnapshot({});

    expect(out.skippedReasons.map((row) => row.code)).toEqual(expect.arrayContaining(['teams_missing', 'pending_offers_missing', 'trades_missing']));
    expect(out.cpuOfferCount).toBe(0);
    expect(out.unknownOfferValueCount).toBe(0);
  });
});
