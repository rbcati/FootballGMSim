/**
 * Season-archive champion reference — the archive must carry a canonical,
 * stable `championTeamId` (not only a display snapshot) so history consumers
 * and the durability invariant resolve the champion after save/reload and after
 * any later re-branding of the live team.
 */
import { describe, it, expect } from 'vitest';
import { buildSeasonArchiveSummary } from '../../src/core/league-memory.js';

const baseArgs = (champion) => ({
  year: 2026,
  seasonId: 's1',
  standings: [
    { id: 0, wins: 10, losses: 7, ties: 0 },
    { id: 6, wins: 14, losses: 3, ties: 0 },
  ],
  awards: {},
  leaders: {},
  champion,
  runnerUp: { id: 0, name: 'Arizona', abbr: 'ARI' },
  userTeamId: 0,
  teams: [
    { id: 0, name: 'Arizona', abbr: 'ARI' },
    { id: 6, name: 'Cleveland Browns', abbr: 'CLE' },
  ],
});

describe('buildSeasonArchiveSummary — canonical champion reference', () => {
  it('emits championTeamId derived from a full champion object', () => {
    const out = buildSeasonArchiveSummary(baseArgs({ id: 6, name: 'Cleveland Browns', abbr: 'CLE', wins: 14 }));
    expect(out.championTeamId).toBe(6);
    // display snapshot is retained separately
    expect(out.champion).toMatchObject({ id: 6, abbr: 'CLE' });
  });

  it('emits championTeamId for team 0 as champion (0 is a real team)', () => {
    const out = buildSeasonArchiveSummary(baseArgs({ id: 0, name: 'Arizona', abbr: 'ARI', wins: 15 }));
    expect(out.championTeamId).toBe(0);
  });

  it('leaves championTeamId null when there is no champion (honest unavailable)', () => {
    const out = buildSeasonArchiveSummary(baseArgs(null));
    expect(out.championTeamId).toBeNull();
  });

  it('emits a runnerUpTeamId alongside the champion', () => {
    const out = buildSeasonArchiveSummary(baseArgs({ id: 6, abbr: 'CLE' }));
    expect(out.runnerUpTeamId).toBe(0);
  });
});
