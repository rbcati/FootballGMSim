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
            contract: expect.objectContaining({ baseAnnual: 4 }),
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
            contract: expect.objectContaining({ baseAnnual: 5, yearsTotal: 2 }),
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
        contract: expect.objectContaining({ baseAnnual: 5, yearsTotal: 2 }),
        offers: [],
      }),
    );
  });
});
