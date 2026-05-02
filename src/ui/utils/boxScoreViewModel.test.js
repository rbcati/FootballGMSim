import { describe, it, expect } from 'vitest';
import { buildBoxScoreViewModel } from './boxScoreViewModel.js';
import { buildGameBookStory } from './gameBookStory.js';

describe('buildBoxScoreViewModel', () => {
  it('classifies full detail when major sections exist', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, quarterScores: { home: [7,7,7,0], away: [3,7,0,7] }, teamStats: { home: { passYards: 220 }, away: { passYards: 200 } }, playerStats: { home: { '10': { name: 'QB', stats: { passAtt: 20 } } }, away: {} } } });
    expect(vm.archiveQuality).toBe('Full detail');
    expect(vm.detailWarning).toBeNull();
  });

  it('classifies partial detail warning copy', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 10, awayScore: 7, teamStats: { home: { passYards: 100 }, away: {} } } });
    expect(vm.archiveQuality).toBe('Partial detail');
    expect(vm.detailWarning).toContain('Partial archive');
  });

  it('classifies score only data warning copy', () => {
    const vm = buildBoxScoreViewModel({ game: { played: true, homeScore: 3, awayScore: 0 } });
    expect(vm.archiveQuality).toBe('Score only');
    expect(vm.detailWarning).toContain('Detailed box score data');
  });

  it('classifies missing detail when score unavailable', () => {
    const vm = buildBoxScoreViewModel({});
    expect(vm.archiveQuality).toBe('Missing detail');
  });

  it('builds factual game story bullets from available data only', () => {
    const vm = buildBoxScoreViewModel({ game: { homeId: 1, awayId: 2, homeScore: 17, awayScore: 20, teamStats: { home: { turnovers: 2, totalYards: 290 }, away: { turnovers: 0, totalYards: 350 } }, playerStats: { away: { 1: { name: 'A QB', stats: { passYd: 294, passTD: 3 } } }, home: {} } } });
    const story = buildGameBookStory(vm).join(' ');
    expect(story).toContain('turnover battle');
    expect(story).toContain('294 passing yards');
  });
});
