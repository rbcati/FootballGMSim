import { describe, it, expect } from 'vitest';
import { buildBoxScoreViewModel } from './boxScoreViewModel.js';

describe('buildBoxScoreViewModel', () => {
  it('normalizes full data payload', () => {
    const vm = buildBoxScoreViewModel({ league: { teams: [{ id: 1, abbr: 'H' }, { id: 2, abbr: 'A' }] }, game: { gameId: 'g1', played: true, homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, playerStats: { home: { '10': { name: 'QB', stats: { passAtt: 20 } } }, away: {} } } });
    expect(vm.archiveQuality).toBe('Full detail');
    expect(vm.finalScore.home).toBe(21);
    expect(vm.hasDetailedStats).toBe(true);
  });
  it('handles partial data', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, home: 1, away: 2, homeScore: 10, awayScore: 7, teamStats: { home: { passYards: 100 }, away: {} } } });
    expect(vm.hasDetailedStats).toBe(true);
  });
  it('handles score only data', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 3, awayScore: 0 } });
    expect(vm.archiveQuality).toBe('Score only');
    expect(vm.missingDetailReason).toContain('Detailed box score');
  });
  it('does not crash when data missing', () => {
    const vm = buildBoxScoreViewModel({});
    expect(vm.status).toBe('unavailable');
  });
});
