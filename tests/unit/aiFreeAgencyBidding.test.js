/**
 * aiFreeAgencyBidding.test.js
 *
 * Focused unit tests for AI Free Agency Bidding & Positional Need Sync.
 * Verifies that calculateTeamDepthDeficiencies is wired into the bidding
 * loop so AI teams only bid on CRITICAL/MODERATE roster holes and never
 * waste cap on SECURE positions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
const mockBuildAiTeamStrategy = vi.fn();

vi.mock('../../src/db/cache.js', () => ({ cache: mockCache }));

vi.mock('../../src/core/player.js', async () => {
  const actual = await vi.importActual('../../src/core/player.js');
  return { ...actual, calculateExtensionDemand: mockCalculateExtensionDemand };
});

vi.mock('../../src/core/freeAgency/freeAgencyMarketAnalysis.js', () => ({
  buildFreeAgencyMarketAnalysis: mockBuildFreeAgencyMarketAnalysis,
}));

// Mock aiTeamStrategy so we can inject controlled positional need scores,
// including scenarios where strategy flags QB as a need even when depth says SECURE.
vi.mock('../../src/core/aiTeamStrategy.js', () => ({
  buildAiTeamStrategy: mockBuildAiTeamStrategy,
}));

vi.mock('../../src/db/index.js', () => ({ Transactions: { add: vi.fn() } }));
vi.mock('../../src/core/news-engine.js', () => ({
  default: { logTransaction: vi.fn(), logNews: vi.fn() },
}));
vi.mock('../../src/core/scheme-core.js', () => ({
  calculateOffensiveSchemeFit: vi.fn(() => 60),
  calculateDefensiveSchemeFit: vi.fn(() => 60),
}));
vi.mock('../../src/core/contract-market.js', () => ({
  buildContractProfile: vi.fn(() => ({})),
  buildDemandFromProfile: vi.fn(() => ({ baseAnnual: 1, yearsTotal: 1, signingBonus: 0 })),
  computeMarketHeat: vi.fn(() => 0),
  scoreOffer: vi.fn(() => 1),
  inferTeamDirection: vi.fn(() => 'neutral'),
  buildDecisionTiming: vi.fn(() => ({ resolveNow: true, atWaitCap: false })),
}));
vi.mock('../../src/core/teamContext/negotiationContext.js', () => ({
  getTeamContextForNegotiation: vi.fn(() => ({})),
}));
vi.mock('../../src/core/contracts/negotiation.js', () => ({
  evaluateContractOffer: vi.fn(() => ({ score: 50 })),
}));
vi.mock('../../src/core/retention/reSigning.js', () => ({
  evaluateReSigningPriority: vi.fn(() => ({ recommendation: 'extension_candidate' })),
}));

const { default: AiLogic } = await import('../../src/core/ai-logic.js');

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a strategy where OL is flagged as a CRITICAL need (priority 80) and
 * QB is flagged as a moderate need (priority 40 / severity 'high').
 * QB's strategy-level score (needs.QB ≈ 1.28) would normally place it in
 * highNeedPositions, giving us a scenario where the SECURE depth gate must
 * prune it explicitly.
 */
function makeStrategyWithOlCriticalQbNeed() {
  return {
    archetype: 'middle',
    capHealth: 60,
    rosterStrength: 72,
    positionalNeeds: [
      { positionGroup: 'OL', priority: 80, severity: 'critical' },
      // QB priority 40 + severity 'high' → multiplier 1 + (40/100 * 0.7) = 1.28
      // This pushes needs.QB to 1.28 which would normally land it in highNeedPositions.
      { positionGroup: 'QB', priority: 40, severity: 'high' },
    ],
    roster: [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AI Free Agency Bidding — Positional Need Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCache.getMeta.mockReturnValue({ year: 2026, phase: 'free_agency' });

    // Market analysis: all players get 'pursue' with affordable cap fit.
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

  // ── Test 1 ────────────────────────────────────────────────────────────────────

  it('bids on a CRITICAL OL need and ignores a SECURE QB even when strategy flags QB as a target', async () => {
    /**
     * Setup:
     *  - Roster: one QB at 92 OVR  → QB avgStarterOvr = 92 ≥ 80 → SECURE
     *  - Roster: zero OL players   → OL has missingStarters > 0  → CRITICAL
     *  - FA pool: 85 OVR QB (id 201) and 80 OVR OT (id 202)
     *
     * Without the depth-need sync, the mocked strategy would include QB in
     * highNeedPositions (needs.QB ≈ 1.28 ≥ 1.2).  With the sync, the SECURE
     * gate prunes QB from highNeedPositions and blocks it in the candidate loop,
     * so only the OL offer is submitted.
     */
    const team = {
      id: 10,
      name: 'Depth Gate FC',
      abbr: 'DGF',
      wins: 8,
      losses: 8,
      capRoom: 30,
      capUsed: 270,
      deadCap: 0,
    };

    // Roster with a SECURE QB and no offensive linemen.
    const teamRoster = [
      { id: 100, pos: 'QB', ovr: 92, age: 28, potential: 93, contract: { years: 3, yearsRemaining: 3, baseAnnual: 22 } },
    ];

    const faQb = {
      id: 201,
      name: 'Available Elite QB',
      pos: 'QB',
      status: 'free_agent',
      ovr: 85,
      age: 27,
      offers: [],
    };
    const faOt = {
      id: 202,
      name: 'Solid OT',
      pos: 'OT',
      status: 'free_agent',
      ovr: 80,
      age: 26,
      offers: [],
    };

    mockCache.getTeam.mockReturnValue(team);
    mockCache.getPlayersByTeam.mockReturnValue(teamRoster);
    mockBuildAiTeamStrategy.mockReturnValue(makeStrategyWithOlCriticalQbNeed());

    // Affordable demand for both FAs.
    mockCalculateExtensionDemand.mockImplementation((player) => {
      if (player.id === 201) return { years: 3, yearsTotal: 3, baseAnnual: 18, signingBonus: 3 };
      return { years: 3, yearsTotal: 3, baseAnnual: 10, signingBonus: 1 };
    });

    // freeAgentsMap: QB bucket and OL bucket.
    await AiLogic.makeFreeAgencyOffers(10, { QB: [faQb], OL: [faOt] });

    const updatedIds = mockCache.updatePlayer.mock.calls.map((args) => args[0]);

    // OL/OT is CRITICAL — the AI must have submitted an offer.
    expect(updatedIds).toContain(202);

    // QB is SECURE (92 OVR starter already on roster) — no offer must be submitted.
    expect(updatedIds).not.toContain(201);
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────────

  it('does not submit bids when the minimum asking price exceeds available cap space', async () => {
    /**
     * Setup:
     *  - Roster: zero OL players → OL is CRITICAL
     *  - FA: 80 OVR OT with demand 25M/yr
     *  - Team cap room: 10M
     *
     * The final cap check (capRoom > capHit + 1) must reject the offer:
     *   10 > (25 + 1) → false → no offer.
     */
    const team = {
      id: 11,
      name: 'Cap Strapped SC',
      abbr: 'CSS',
      wins: 5,
      losses: 12,
      capRoom: 10,
      capUsed: 290,
      deadCap: 0,
    };

    mockCache.getTeam.mockReturnValue(team);
    mockCache.getPlayersByTeam.mockReturnValue([]); // Empty roster — all positions CRITICAL.
    mockBuildAiTeamStrategy.mockReturnValue({
      archetype: 'rebuild',
      capHealth: 40,
      rosterStrength: 62,
      positionalNeeds: [
        { positionGroup: 'OL', priority: 90, severity: 'critical' },
      ],
      roster: [],
    });

    const expensiveOt = {
      id: 301,
      name: 'Pricey OT',
      pos: 'OT',
      status: 'free_agent',
      ovr: 80,
      age: 26,
      offers: [],
    };

    // Demand far exceeds available cap space.
    mockCalculateExtensionDemand.mockReturnValue({
      years: 3,
      yearsTotal: 3,
      baseAnnual: 25,
      signingBonus: 0,
    });

    await AiLogic.makeFreeAgencyOffers(11, { OL: [expensiveOt] });

    // No offer should be submitted — the cap is insufficient.
    expect(mockCache.updatePlayer).not.toHaveBeenCalled();
  });
});
