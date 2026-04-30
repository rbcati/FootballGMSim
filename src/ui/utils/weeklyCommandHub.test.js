import { describe, expect, it } from 'vitest';
import { buildWeeklyCommandHub } from './weeklyCommandHub.js';

describe('buildWeeklyCommandHub', () => {
  it('creates must-handle action for injured starter', () => {
    const result = buildWeeklyCommandHub({ league: { userTeamId: 1, teams: [{ id: 1, roster: [{ id: 10, depthChart: { rowKey: 'QB1' }, injury: { gamesRemaining: 2 } }] }] } });
    expect(result.sections[0].actions.some((a) => a.id === 'injured-starters')).toBe(true);
  });

  it('creates must-handle action for urgent roster need', () => {
    const result = buildWeeklyCommandHub({ teamBuilder: { urgentNeed: 'OL' } });
    expect(result.sections[0].actions.some((a) => /roster need/i.test(a.label))).toBe(true);
  });

  it('creates tactical edge for game plan and training when incomplete', () => {
    const result = buildWeeklyCommandHub({ league: { userTeamId: 1, teams: [{ id: 1, weeklyPrep: {} }] } });
    expect(result.sections[1].actions.some((a) => a.id === 'game-plan-review')).toBe(true);
    expect(result.sections[1].actions.some((a) => a.id === 'training-focus')).toBe(true);
  });

  it('creates after action game book action after completed game', () => {
    const result = buildWeeklyCommandHub({ lastGame: { played: true } });
    expect(result.sections[2].actions.some((a) => a.id === 'postgame-film-room')).toBe(true);
  });

  it('sorts critical above medium/low', () => {
    const result = buildWeeklyCommandHub({
      league: { userTeamId: 1, teams: [{ id: 1, weeklyPrep: {}, roster: [{ depthChart: { rowKey: 'QB1' }, injury: { gamesRemaining: 3 } }, { depthChart: { rowKey: 'WR1' }, injury: { gamesRemaining: 2 } }] }] },
    });
    expect(result.actions[0].priority).toBe('critical');
  });

  it('does not crash with missing data', () => {
    const result = buildWeeklyCommandHub({});
    expect(result.status).toBe('ready');
  });
});
