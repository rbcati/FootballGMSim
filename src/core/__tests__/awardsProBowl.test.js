import { describe, it, expect } from 'vitest';
import { selectProBowlers } from '../awards-logic.js';

// conf: 0 = AFC, 1 = NFC
const teams = [
  { id: 0, conf: 0, wins: 12 },
  { id: 1, conf: 0, wins: 4 },
  { id: 2, conf: 1, wins: 10 },
];

function qb(playerId, teamId, passYd, passTD) {
  return { playerId, pos: 'QB', teamId, totals: { gamesPlayed: 17, passYd, passTD, passAtt: 500, passComp: 350 } };
}

describe('selectProBowlers', () => {
  it('selects the top players per position per conference', () => {
    const entries = [
      qb(100, 0, 5000, 40), // AFC elite — should make it
      qb(101, 0, 4200, 30), // AFC good
      qb(102, 0, 3800, 22), // AFC ok
      qb(103, 2, 4800, 38), // NFC elite (team 2 = NFC) — should make it
      qb(104, 0, 1200, 5),  // AFC weak — 4th QB, only 3 AFC slots, excluded
    ];
    const pb = selectProBowlers(entries, teams, 2026);
    const ids = pb.map(p => p.playerId);

    expect(ids).toContain(100);
    expect(ids).toContain(103);
    // Only 3 QB slots per conference; the weakest AFC QB (104) is cut.
    expect(ids).not.toContain(104);
    // Each selection is stamped with conf + year.
    const afcQb = pb.find(p => p.playerId === 100);
    expect(afcQb.conf).toBe(0);
    expect(afcQb.year).toBe(2026);
    const nfcQb = pb.find(p => p.playerId === 103);
    expect(nfcQb.conf).toBe(1);
  });

  it('excludes players below the minimum games threshold', () => {
    const entries = [
      { playerId: 200, pos: 'QB', teamId: 0, totals: { gamesPlayed: 1, passYd: 6000, passTD: 50 } },
    ];
    const pb = selectProBowlers(entries, teams, 2026);
    expect(pb.map(p => p.playerId)).not.toContain(200);
  });

  it('returns an empty list when there are no eligible entries', () => {
    expect(selectProBowlers([], teams, 2026)).toEqual([]);
    expect(selectProBowlers(null, teams, 2026)).toEqual([]);
  });
});
