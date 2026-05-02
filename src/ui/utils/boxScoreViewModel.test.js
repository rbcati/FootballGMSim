import { describe, it, expect } from 'vitest';
import { buildBoxScoreViewModel } from './boxScoreViewModel.js';

describe('buildBoxScoreViewModel', () => {
  it('classifies full detail when major sections exist', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 220 }, away: { passYards: 200 } }, playerStats: { home: { '10': { name: 'QB', stats: { passAtt: 20 } } }, away: {} } } });
    expect(vm.archiveQuality).toBe('Full detail');
  });

  it('classifies partial detail when only some detail exists', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 10, awayScore: 7, teamStats: { home: { passYards: 100 }, away: {} } } });
    expect(vm.archiveQuality).toBe('Partial detail');
  });

  it('classifies score only data', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 3, awayScore: 0 } });
    expect(vm.archiveQuality).toBe('Score only');
  });

  it('classifies missing detail when score unavailable', () => {
    const vm = buildBoxScoreViewModel({});
    expect(vm.archiveQuality).toBe('Missing detail');
  });
});
