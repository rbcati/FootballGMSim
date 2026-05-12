import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCache = {
  getTeam: vi.fn(),
  getPlayersByTeam: vi.fn(),
  getAllPlayers: vi.fn(),
  getAllTeams: vi.fn(),
  updatePlayer: vi.fn(),
  updateTeam: vi.fn(),
  getMeta: vi.fn(),
  setMeta: vi.fn(),
};

const mockBuildFreeAgencyMarketAnalysis = vi.fn();
const mockCalculateExtensionDemand = vi.fn();

vi.mock('../../db/cache.js', () => ({
  cache: mockCache,
}));

vi.mock('../player.js', async () => {
  const actual = await vi.importActual('../player.js');
  return {
    ...actual,
    calculateExtensionDemand: mockCalculateExtensionDemand,
  };
});

vi.mock('../freeAgency/freeAgencyMarketAnalysis.js', () => ({
  buildFreeAgencyMarketAnalysis: mockBuildFreeAgencyMarketAnalysis,
}));

vi.mock('../../db/index.js', () => ({
  Transactions: { add: vi.fn() },
}));
vi.mock('../news-engine.js', () => ({
  default: { logTransaction: vi.fn(), logNews: vi.fn() },
}));
vi.mock('../scheme-core.js', () => ({
  calculateOffensiveSchemeFit: vi.fn(() => 60),
  calculateDefensiveSchemeFit: vi.fn(() => 60),
}));
vi.mock('../contract-market.js', () => ({
  buildContractProfile: vi.fn(() => ({})),
  buildDemandFromProfile: vi.fn(() => ({ baseAnnual: 1, yearsTotal: 1, signingBonus: 0 })),
  computeMarketHeat: vi.fn(() => 0),
  scoreOffer: vi.fn(() => 1),
  inferTeamDirection: vi.fn(() => 'neutral'),
  buildDecisionTiming: vi.fn(() => ({ resolveNow: true, atWaitCap: false })),
}));
vi.mock('../teamContext/negotiationContext.js', () => ({
  getTeamContextForNegotiation: vi.fn(() => ({})),
}));
vi.mock('../contracts/negotiation.js', () => ({
  evaluateContractOffer: vi.fn(() => ({ score: 50 })),
}));
vi.mock('../retention/reSigning.js', () => ({
  evaluateReSigningPriority: vi.fn(() => ({ recommendation: 'extension_candidate' })),
}));

const { default: AiLogic } = await import('../ai-logic.js');

describe('AiLogic.makeFreeAgencyOffers stale contract handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.getTeam.mockReturnValue({ id: 1, name: 'Test Team', capRoom: 10 });
    mockCache.getPlayersByTeam.mockReturnValue([]);
    mockCache.getMeta.mockReturnValue({ year: 2026 });
    mockBuildFreeAgencyMarketAnalysis.mockImplementation(({ freeAgents }) => ({
      marketRows: freeAgents.map((p) => ({
        pos: p.pos,
        recommendation: 'pursue',
        capFit: 'affordable',
        costSource: p.contractDemand?.baseAnnual ? 'contractDemand' : 'unknown',
        fitScore: 85,
        _player: p,
      })),
    }));
  });

  it('creates an offer for released veteran when fresh demand is affordable', async () => {
    const fa = {
      id: 10,
      name: 'Released QB',
      pos: 'QB',
      status: 'free_agent',
      ovr: 75,
      age: 31,
      contract: { baseAnnual: 32 },
      offers: [],
    };
    const cheapDemand = { years: 1, yearsTotal: 1, baseAnnual: 4, signingBonus: 0 };
    mockCalculateExtensionDemand.mockReturnValue(cheapDemand);

    await AiLogic.makeFreeAgencyOffers(1, { QB: [fa] });

    expect(mockBuildFreeAgencyMarketAnalysis).toHaveBeenCalled();
    const analysisInput = mockBuildFreeAgencyMarketAnalysis.mock.calls[0][0].freeAgents[0];
    expect(analysisInput).not.toBe(fa);
    expect(analysisInput.contractDemand.baseAnnual).toBe(4);
    expect(mockCache.updatePlayer).toHaveBeenCalledTimes(1);
    expect(mockCache.updatePlayer).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        offers: expect.arrayContaining([
          expect.objectContaining({
            teamId: 1,
            contract: expect.objectContaining({ baseAnnual: 4.3, yearsTotal: 1 }),
            contractModel: expect.objectContaining({ marketTier: 'aging veteran' }),
          }),
        ]),
      }),
    );
  });

  it('does not create an offer when real calculated demand exceeds cap room', async () => {
    const expensiveFa = {
      id: 11,
      name: 'Expensive QB',
      pos: 'QB',
      status: 'free_agent',
      ovr: 80,
      age: 28,
      contract: { baseAnnual: 8 },
      offers: [],
    };
    mockCalculateExtensionDemand.mockReturnValue({ years: 1, yearsTotal: 1, baseAnnual: 12, signingBonus: 0 });

    await AiLogic.makeFreeAgencyOffers(1, { QB: [expensiveFa] });

    expect(mockCache.updatePlayer).not.toHaveBeenCalled();
  });

  it('falls back to shared free agent map when market analysis has no rows', async () => {
    const fa = {
      id: 12,
      name: 'Fallback QB',
      pos: 'QB',
      status: 'free_agent',
      ovr: 74,
      age: 26,
      offers: [],
    };
    mockBuildFreeAgencyMarketAnalysis.mockReturnValue({ marketRows: null });
    mockCalculateExtensionDemand.mockReturnValue({ years: 1, yearsTotal: 1, baseAnnual: 5, signingBonus: 0 });

    await AiLogic.makeFreeAgencyOffers(1, { QB: [fa] });

    expect(mockCache.updatePlayer).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ offers: expect.any(Array) }),
    );
  });

  it('rebuild profile avoids old expensive veteran offers', async () => {
    const veteran = {
      id: 31,
      name: 'Aging Star',
      pos: 'QB',
      status: 'free_agent',
      ovr: 81,
      age: 33,
      offers: [],
    };
    const young = {
      id: 32,
      name: 'Young Value',
      pos: 'QB',
      status: 'free_agent',
      ovr: 74,
      age: 24,
      offers: [],
    };
    mockCache.getTeam.mockReturnValue({
      id: 1,
      name: 'Rebuild Team',
      abbr: 'REB',
      wins: 3,
      losses: 14,
      capRoom: 24,
      capUsed: 298,
      deadCap: 18,
    });
    mockCache.getPlayersByTeam.mockReturnValue([{ id: 100, pos: 'QB', ovr: 62, age: 30, potential: 64, contract: { years: 1 } }]);
    mockCalculateExtensionDemand.mockImplementation((player) => {
      if (player.id === 31) return { years: 3, yearsTotal: 3, baseAnnual: 18, signingBonus: 8 };
      return { years: 2, yearsTotal: 2, baseAnnual: 6, signingBonus: 1 };
    });

    await AiLogic.makeFreeAgencyOffers(1, { QB: [veteran, young] });

    const updates = mockCache.updatePlayer.mock.calls.map((args) => args[0]);
    expect(updates).toContain(32);
    expect(updates).not.toContain(31);
  });

  it('processFreeAgencyDay carries stale-contract offer into evaluation and signing path', async () => {
    const releasedVeteran = {
      id: 21,
      name: 'Released Veteran QB',
      pos: 'QB',
      status: 'free_agent',
      teamId: null,
      ovr: 77,
      age: 33,
      contract: { baseAnnual: 36, years: 1, yearsTotal: 1, signingBonus: 0 },
      offers: [],
    };
    const team = { id: 1, name: 'Test Team', capRoom: 15 };
    const userTeam = { id: 99, name: 'User Team', capRoom: 15 };
    const cheapDemand = { years: 2, yearsTotal: 2, baseAnnual: 5, signingBonus: 2 };

    mockCache.getMeta.mockReturnValue({ year: 2026, userTeamId: 99, currentSeasonId: 's1', currentWeek: 1, phase: 'free_agency' });
    mockCache.getAllPlayers.mockReturnValue([releasedVeteran]);
    mockCache.getAllTeams.mockReturnValue([team, userTeam]);
    mockCache.getTeam.mockImplementation((id) => (Number(id) === 1 ? team : userTeam));
    mockCalculateExtensionDemand.mockReturnValue(cheapDemand);
    mockBuildFreeAgencyMarketAnalysis.mockImplementation(({ freeAgents }) => ({
      marketRows: freeAgents.map((p) => ({
        pos: p.pos,
        recommendation: 'pursue',
        // This is the stale-contract path that should still allow bidding.
        capFit: 'expensive',
        costSource: 'staleContract',
        fitScore: 90,
        _player: p,
      })),
    }));

    const realMakeOffers = AiLogic.makeFreeAgencyOffers.bind(AiLogic);
    const makeOffersSpy = vi
      .spyOn(AiLogic, 'makeFreeAgencyOffers')
      .mockImplementation((teamId, freeAgentsMap) => realMakeOffers(teamId, freeAgentsMap));
    const evaluateSpy = vi.spyOn(AiLogic, 'evaluateOffers');

    await AiLogic.processFreeAgencyDay(2);

    // processFreeAgencyDay should build a shared freeAgentsMap and pass it to offer generation.
    expect(makeOffersSpy).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        QB: expect.arrayContaining([expect.objectContaining({ id: 21 })]),
      }),
    );
    // Offer creation happened for stale-contract affordable demand.
    expect(mockCache.updatePlayer).toHaveBeenCalledWith(
      21,
      expect.objectContaining({
        offers: expect.arrayContaining([
          expect.objectContaining({
            teamId: 1,
            contract: expect.objectContaining({ baseAnnual: 5.4, yearsTotal: 1 }),
            contractModel: expect.objectContaining({ capFit: expect.any(String) }),
          }),
        ]),
      }),
    );
    // The later evaluation stage saw the generated offer.
    expect(evaluateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 21,
        offers: expect.arrayContaining([expect.objectContaining({ teamId: 1 })]),
      }),
      2,
    );
    // Signing path executed when cap allows, replacing free-agent status.
    expect(mockCache.updatePlayer).toHaveBeenCalledWith(
      21,
      expect.objectContaining({
        teamId: 1,
        status: 'active',
        contract: expect.objectContaining({ baseAnnual: 5.4, yearsTotal: 1 }),
        offers: [],
      }),
    );
  });

  it('skips non-urgent splash offers when cap hit exceeds tightened middle cap band', async () => {
    const splashFa = {
      id: 41,
      name: 'Splash WR',
      pos: 'WR',
      status: 'free_agent',
      ovr: 78,
      age: 28,
      offers: [],
    };
    mockCache.getTeam.mockReturnValue({
      id: 2,
      name: 'Middle Tight',
      abbr: 'MID',
      wins: 8,
      losses: 8,
      capRoom: 6,
      capUsed: 292,
      deadCap: 8,
    });
    mockCache.getPlayersByTeam.mockReturnValue([
      { id: 201, pos: 'WR', ovr: 66, age: 26, potential: 68, contract: { years: 2 } },
      { id: 202, pos: 'WR', ovr: 64, age: 25, potential: 66, contract: { years: 2 } },
      { id: 204, pos: 'QB', ovr: 78, age: 29, potential: 80, contract: { years: 2 } },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: 210 + i,
        pos: 'OL',
        ovr: 71,
        age: 26,
        potential: 74,
        contract: { years: 2 },
      })),
    ]);
    mockCalculateExtensionDemand.mockReturnValue({ years: 3, yearsTotal: 3, baseAnnual: 16, signingBonus: 10 });

    await AiLogic.makeFreeAgencyOffers(2, { WR: [splashFa] });

    expect(mockCache.updatePlayer).not.toHaveBeenCalled();
  });

  it('allows a controlled QB exception when cap is tight but QB need is severe', async () => {
    const qbFa = {
      id: 42,
      name: 'Bridge QB',
      pos: 'QB',
      status: 'free_agent',
      ovr: 76,
      age: 30,
      offers: [],
    };
    mockCache.getTeam.mockReturnValue({
      id: 3,
      name: 'QB Needy',
      abbr: 'QBN',
      wins: 4,
      losses: 13,
      capRoom: 10,
      capUsed: 290,
      deadCap: 6,
    });
    mockCache.getPlayersByTeam.mockReturnValue([
      { id: 301, pos: 'QB', ovr: 61, age: 32, potential: 63, contract: { years: 1 } },
      { id: 302, pos: 'WR', ovr: 80, age: 26, potential: 84, contract: { years: 2 } },
      { id: 303, pos: 'WR', ovr: 78, age: 25, potential: 82, contract: { years: 2 } },
      { id: 304, pos: 'WR', ovr: 76, age: 24, potential: 80, contract: { years: 2 } },
    ]);
    // Cap hit ~5.0M: above strict rebuild band for $10M room, but inside QB exception window.
    mockCalculateExtensionDemand.mockReturnValue({ years: 2, yearsTotal: 2, baseAnnual: 4.5, signingBonus: 1 });

    await AiLogic.makeFreeAgencyOffers(3, { QB: [qbFa] });

    expect(mockCache.updatePlayer).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        offers: expect.arrayContaining([expect.objectContaining({ teamId: 3 })]),
      }),
    );
  });

  it('calculateTeamNeeds keeps QB as high priority when QB room is weak', () => {
    mockCache.getTeam.mockReturnValue({
      id: 1,
      name: 'Need Team',
      abbr: 'NED',
      wins: 5,
      losses: 12,
      capRoom: 10,
      capUsed: 296,
      deadCap: 9,
    });
    mockCache.getPlayersByTeam.mockReturnValue([
      { id: 1, pos: 'QB', ovr: 61, age: 30, potential: 65, contract: { years: 1 } },
      { id: 2, pos: 'WR', ovr: 78, age: 26, potential: 82, contract: { years: 2 } },
      { id: 3, pos: 'WR', ovr: 76, age: 25, potential: 80, contract: { years: 2 } },
      { id: 4, pos: 'WR', ovr: 74, age: 24, potential: 79, contract: { years: 2 } },
    ]);
    mockCache.getMeta.mockReturnValue({ year: 2028, phase: 'regular' });

    const needs = AiLogic.calculateTeamNeeds(1);
    expect(needs.QB).toBeGreaterThanOrEqual(1.05);
    expect(needs.QB).toBeGreaterThan(needs.WR);
  });
});
