import { describe, it, expect } from 'vitest';
import { buildMergedPlayerAwardTimeline, buildPlayerAwardHeaderBadges } from '../playerAwardTimeline.js';

const teams = [{ id: 1, abbr: 'DAL' }];

describe('playerAwardTimeline', () => {
  it('deduplicates MVP from accolades and season archive', () => {
    const merged = buildMergedPlayerAwardTimeline(
      11,
      [{ type: 'MVP', year: 2030 }],
      [{ year: 2030, awards: { mvp: { playerId: 11, name: 'A', teamId: 1 } } }],
      teams,
    );
    expect(merged.rows.filter((r) => r.canonical === 'mvp')).toHaveLength(1);
  });

  it('skips duplicate OROY/ROTY archive rows for the same player', () => {
    const merged = buildMergedPlayerAwardTimeline(
      11,
      [],
      [{
        year: 2031,
        awards: {
          oroy: { playerId: 11, name: 'R', teamId: 1 },
          roty: { playerId: 11, name: 'R', teamId: 1 },
        },
      }],
      teams,
    );
    const rookieRows = merged.rows.filter((r) => r.canonical === 'roty' || r.canonical === 'oroy');
    expect(rookieRows).toHaveLength(1);
  });

  it('builds compact MVP header badges', () => {
    const merged = buildMergedPlayerAwardTimeline(
      11,
      [],
      [
        { year: 2028, awards: { mvp: { playerId: 11, name: 'A', teamId: 1 } } },
        { year: 2029, awards: { mvp: { playerId: 11, name: 'A', teamId: 1 } } },
      ],
      teams,
    );
    const chips = buildPlayerAwardHeaderBadges(merged);
    expect(chips.some((c) => c.text === '2x MVP')).toBe(true);
  });
});
