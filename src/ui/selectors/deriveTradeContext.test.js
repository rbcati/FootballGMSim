import { describe, it, expect } from 'vitest';
import { FRONT_OFFICE_PERSONAS } from '../../core/ai/frontOfficePersonaEngine.js';
import {
  deriveTradeContext,
  TRADE_BALANCE,
  MOTIVATION_CODES,
  TRADE_CONTEXT_PERSONAS,
} from './deriveTradeContext.js';


describe('deriveTradeContext — front-office persona mirror', () => {
  it('trade context persona mirror matches known front office personas', () => {
    for (const key of Object.values(TRADE_CONTEXT_PERSONAS)) {
      expect(Object.values(FRONT_OFFICE_PERSONAS)).toContain(key);
    }
  });
});

// ── Builders ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    age: 27,
    ovr: 74,
    contract: { baseAnnual: 6 },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return {
    id: 10,
    name: 'Test Team',
    abbr: 'TT',
    capRoom: 20,
    frontOffice: { persona: 'PLAYER_LOYALIST' },
    ...overrides,
  };
}

function makePick(overrides = {}) {
  return { id: 'pk1', round: 1, season: 2027, ...overrides };
}

/** A balanced two-player swap with no motivation triggers. */
function baseInput(overrides = {}) {
  return {
    userGivesPlayers: [makePlayer({ id: 1, pos: 'WR', age: 27, ovr: 74, contract: { baseAnnual: 6 } })],
    userGetsPlayers: [makePlayer({ id: 2, pos: 'RB', age: 27, ovr: 74, contract: { baseAnnual: 6 } })],
    userGivesPicks: [],
    userGetsPicks: [],
    userOfferValue: 1000,
    otherOfferValue: 1000,
    otherTeam: makeTeam(),
    otherTeamNeeds: [],
    userCapRoomBefore: 20,
    userCapRoomAfter: 20,
    ...overrides,
  };
}

// ── Determinism ───────────────────────────────────────────────────────────────

describe('deriveTradeContext — determinism', () => {
  it('returns identical output for identical inputs', () => {
    const input = baseInput({
      otherTeamNeeds: ['WR'],
      otherTeam: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
      userGivesPlayers: [makePlayer({ ovr: 84 })],
    });
    const a = deriveTradeContext(input);
    const b = deriveTradeContext(input);
    expect(a).toEqual(b);
  });
});

// ── Immutability (required guardrail) ─────────────────────────────────────────

describe('deriveTradeContext — immutability', () => {
  it('does not mutate any input', () => {
    const input = baseInput({
      otherTeamNeeds: ['WR', 'QB'],
      userGivesPicks: [makePick()],
      userGetsPicks: [makePick({ id: 'pk2', round: 3 })],
      otherTeam: makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } }),
    });
    const before = structuredClone(input);
    deriveTradeContext(input);
    expect(input).toEqual(before);
  });
});

// ── Empty / unknown states ────────────────────────────────────────────────────

describe('deriveTradeContext — empty and unknown states', () => {
  it('returns UNKNOWN with no signals for an empty trade', () => {
    const ctx = deriveTradeContext({});
    expect(ctx.userBalance).toBe(TRADE_BALANCE.UNKNOWN);
    expect(ctx.otherTeamMotivation).toEqual([]);
    expect(ctx.motivationLabels).toEqual([]);
    expect(ctx.capNote).toBeNull();
  });

  it('returns UNKNOWN when no arguments are provided at all', () => {
    const ctx = deriveTradeContext();
    expect(ctx.userBalance).toBe(TRADE_BALANCE.UNKNOWN);
    expect(typeof ctx.userBalanceLabel).toBe('string');
    expect(ctx.userBalanceLabel.length).toBeGreaterThan(0);
  });

  it('returns UNKNOWN when assets exist but values are missing', () => {
    const ctx = deriveTradeContext(baseInput({
      userOfferValue: undefined,
      otherOfferValue: undefined,
    }));
    expect(ctx.userBalance).toBe(TRADE_BALANCE.UNKNOWN);
  });
});

// ── Balance classification ────────────────────────────────────────────────────

describe('deriveTradeContext — user balance', () => {
  it('reads EVEN inside the ±15% band', () => {
    const ctx = deriveTradeContext(baseInput({ userOfferValue: 1000, otherOfferValue: 1100 }));
    expect(ctx.userBalance).toBe(TRADE_BALANCE.EVEN);
  });

  it('reads FAVORABLE when the user gets meaningfully more', () => {
    const ctx = deriveTradeContext(baseInput({ userOfferValue: 500, otherOfferValue: 1500 }));
    expect(ctx.userBalance).toBe(TRADE_BALANCE.FAVORABLE);
  });

  it('reads UNFAVORABLE when the user gives meaningfully more', () => {
    const ctx = deriveTradeContext(baseInput({ userOfferValue: 1500, otherOfferValue: 500 }));
    expect(ctx.userBalance).toBe(TRADE_BALANCE.UNFAVORABLE);
  });

  it('always returns a non-empty userBalanceLabel', () => {
    const inputs = [
      deriveTradeContext(),
      deriveTradeContext(baseInput()),
      deriveTradeContext(baseInput({ userOfferValue: 0, otherOfferValue: 0 })),
      deriveTradeContext(baseInput({ userOfferValue: 9999, otherOfferValue: 1 })),
    ];
    for (const ctx of inputs) {
      expect(typeof ctx.userBalanceLabel).toBe('string');
      expect(ctx.userBalanceLabel.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Motivation signals: fires / does not fire ─────────────────────────────────

describe('deriveTradeContext — NEEDS_POSITION', () => {
  it('fires when a player they receive matches a visible need', () => {
    const ctx = deriveTradeContext(baseInput({ otherTeamNeeds: ['WR'] }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.NEEDS_POSITION);
    expect(ctx.motivationLabels.some((l) => l.includes('help at WR'))).toBe(true);
  });

  it('does not fire when no received player matches a need', () => {
    const ctx = deriveTradeContext(baseInput({ otherTeamNeeds: ['QB'] }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.NEEDS_POSITION);
  });
});

describe('deriveTradeContext — WIN_NOW_ACQUIRE', () => {
  it('fires for a WIN_NOW front office receiving a high-OVR player', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
      userGivesPlayers: [makePlayer({ ovr: 85 })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.WIN_NOW_ACQUIRE);
  });

  it('does not fire for a WIN_NOW team receiving only depth players', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
      userGivesPlayers: [makePlayer({ ovr: 70 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.WIN_NOW_ACQUIRE);
  });

  it('does not fire for a non-WIN_NOW persona receiving a star', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } }),
      userGivesPlayers: [makePlayer({ ovr: 90 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.WIN_NOW_ACQUIRE);
  });
});

describe('deriveTradeContext — REBUILDER_SHED', () => {
  it('fires when a PATIENT_BUILDER sends a high-OVR veteran', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } }),
      userGetsPlayers: [makePlayer({ ovr: 84, age: 31 })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.REBUILDER_SHED);
  });

  it('fires when a CAP_HOARDER sends a high-OVR veteran', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'CAP_HOARDER' } }),
      userGetsPlayers: [makePlayer({ ovr: 84, age: 31 })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.REBUILDER_SHED);
  });

  it('does not fire when the veteran sent is not star caliber', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } }),
      userGetsPlayers: [makePlayer({ ovr: 72, age: 32 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.REBUILDER_SHED);
  });

  it('does not fire when the star sent is young', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'PATIENT_BUILDER' } }),
      userGetsPlayers: [makePlayer({ ovr: 85, age: 24 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.REBUILDER_SHED);
  });
});

describe('deriveTradeContext — SHEDDING_CAP', () => {
  it('fires when they send meaningfully more salary than they receive', () => {
    const ctx = deriveTradeContext(baseInput({
      userGetsPlayers: [makePlayer({ id: 2, contract: { baseAnnual: 14 } })],
      userGivesPlayers: [makePlayer({ id: 1, contract: { baseAnnual: 4 } })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.SHEDDING_CAP);
  });

  it('does not fire on a near-even salary swap', () => {
    const ctx = deriveTradeContext(baseInput({
      userGetsPlayers: [makePlayer({ id: 2, contract: { baseAnnual: 7 } })],
      userGivesPlayers: [makePlayer({ id: 1, contract: { baseAnnual: 6 } })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.SHEDDING_CAP);
  });
});

describe('deriveTradeContext — PICK_ACCUMULATION', () => {
  it('fires when they send players and receive picks', () => {
    const ctx = deriveTradeContext(baseInput({
      userGivesPlayers: [],
      userGivesPicks: [makePick()],
      userGetsPlayers: [makePlayer({ id: 2 })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.PICK_ACCUMULATION);
  });

  it('does not fire when no picks head their way', () => {
    const ctx = deriveTradeContext(baseInput());
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.PICK_ACCUMULATION);
  });
});

describe('deriveTradeContext — ACQUIRING_YOUTH', () => {
  it('fires when the players they receive are meaningfully younger', () => {
    const ctx = deriveTradeContext(baseInput({
      userGivesPlayers: [makePlayer({ id: 1, age: 23 })],
      userGetsPlayers: [makePlayer({ id: 2, age: 31 })],
    }));
    expect(ctx.otherTeamMotivation).toContain(MOTIVATION_CODES.ACQUIRING_YOUTH);
  });

  it('does not fire on a same-age swap', () => {
    const ctx = deriveTradeContext(baseInput({
      userGivesPlayers: [makePlayer({ id: 1, age: 27 })],
      userGetsPlayers: [makePlayer({ id: 2, age: 27 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.ACQUIRING_YOUTH);
  });

  it('does not fire when ages are missing (skips silently)', () => {
    const ctx = deriveTradeContext(baseInput({
      userGivesPlayers: [makePlayer({ id: 1, age: undefined })],
      userGetsPlayers: [makePlayer({ id: 2, age: 33 })],
    }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.ACQUIRING_YOUTH);
  });
});

// ── Cap note ──────────────────────────────────────────────────────────────────

describe('deriveTradeContext — capNote', () => {
  it('flags cap pressure when the trade worsens an already-tight cap', () => {
    const ctx = deriveTradeContext(baseInput({ userCapRoomBefore: 6, userCapRoomAfter: 2 }));
    expect(ctx.capNote).toBe('This tightens your cap picture.');
  });

  it('flags cap relief when the trade meaningfully improves cap room', () => {
    const ctx = deriveTradeContext(baseInput({ userCapRoomBefore: 10, userCapRoomAfter: 18 }));
    expect(ctx.capNote).toBe('This creates cap flexibility.');
  });

  it('stays null for a small cap change with room to spare', () => {
    const ctx = deriveTradeContext(baseInput({ userCapRoomBefore: 40, userCapRoomAfter: 39 }));
    expect(ctx.capNote).toBeNull();
  });

  it('stays null when cap figures are missing', () => {
    const ctx = deriveTradeContext(baseInput({
      userCapRoomBefore: undefined,
      userCapRoomAfter: undefined,
    }));
    expect(ctx.capNote).toBeNull();
  });
});

// ── Label cap + label hygiene ─────────────────────────────────────────────────

describe('deriveTradeContext — label constraints', () => {
  it('caps motivationLabels at 2 even when many signals fire', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
      otherTeamNeeds: ['WR'],
      userGivesPlayers: [makePlayer({ id: 1, pos: 'WR', ovr: 85, age: 23, contract: { baseAnnual: 3 } })],
      userGetsPlayers: [makePlayer({ id: 2, pos: 'RB', ovr: 76, age: 32, contract: { baseAnnual: 15 } })],
      userGivesPicks: [makePick()],
    }));
    expect(ctx.otherTeamMotivation.length).toBeGreaterThan(2);
    expect(ctx.motivationLabels.length).toBe(2);
  });

  it('never leaks raw signal codes into user-facing labels', () => {
    const ctx = deriveTradeContext(baseInput({
      otherTeam: makeTeam({ frontOffice: { persona: 'WIN_NOW' } }),
      otherTeamNeeds: ['WR'],
      userGivesPlayers: [makePlayer({ id: 1, pos: 'WR', ovr: 85, age: 23, contract: { baseAnnual: 3 } })],
      userGetsPlayers: [makePlayer({ id: 2, pos: 'RB', ovr: 80, age: 32, contract: { baseAnnual: 15 } })],
      userGivesPicks: [makePick()],
      userCapRoomBefore: 6,
      userCapRoomAfter: 2,
    }));
    const userFacing = [ctx.userBalanceLabel, ...ctx.motivationLabels, ctx.capNote ?? ''].join(' ');
    for (const code of Object.values(MOTIVATION_CODES)) {
      expect(userFacing).not.toContain(code);
    }
    for (const code of Object.values(TRADE_BALANCE)) {
      expect(userFacing).not.toContain(code);
    }
  });
});

// ── Old / incomplete save shapes ──────────────────────────────────────────────

describe('deriveTradeContext — resilience to missing fields', () => {
  it('does not crash on players with no contract, pos, ovr, or age', () => {
    const bare = { id: 99, name: 'Bare Player' };
    expect(() => deriveTradeContext({
      userGivesPlayers: [bare, null, undefined],
      userGetsPlayers: [{}],
      userGivesPicks: [null],
      userGetsPicks: [{}],
      otherTeam: {},
      otherTeamNeeds: null,
    })).not.toThrow();
  });

  it('does not crash when otherTeam has no frontOffice', () => {
    const ctx = deriveTradeContext(baseInput({ otherTeam: { id: 5 } }));
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.WIN_NOW_ACQUIRE);
    expect(ctx.otherTeamMotivation).not.toContain(MOTIVATION_CODES.REBUILDER_SHED);
  });

  it('does not crash on non-array asset inputs', () => {
    expect(() => deriveTradeContext({
      userGivesPlayers: 'nope',
      userGetsPlayers: 42,
      userGivesPicks: {},
      userGetsPicks: null,
    })).not.toThrow();
  });
});
