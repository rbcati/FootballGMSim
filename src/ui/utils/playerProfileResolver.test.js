import { describe, it, expect } from 'vitest';
import { resolvePlayerForProfile } from './playerProfileResolver';

const league = {
  teams: [{ id: 1, name: 'A', roster: [{ id: 10, name: 'Roster Guy', teamId: 1 }] }],
  freeAgents: [{ id: 20, name: 'FA Guy', teamId: 'FA' }],
  draftClass: [{ prospectId: 30, name: 'Prospect', isProspect: true }],
};

describe('resolvePlayerForProfile', () => {
  it('resolves roster player by id', () => {
    const res = resolvePlayerForProfile({ playerId: 10, league });
    expect(res.player?.name).toBe('Roster Guy');
    expect(res.statusHint).toBe('roster');
  });

  it('resolves free agent by id', () => {
    const res = resolvePlayerForProfile({ playerId: 20, league });
    expect(res.statusHint).toBe('free_agent');
  });

  it('resolves draft prospect by id', () => {
    const res = resolvePlayerForProfile({ playerId: 30, league });
    expect(res.statusHint).toBe('draft_prospect');
  });

  it('resolves prospect by prospectId', () => {
    const res = resolvePlayerForProfile({ playerId: '30', league });
    expect(res.player?.name).toBe('Prospect');
  });

  it('returns safe null for missing id', () => {
    const res = resolvePlayerForProfile({ playerId: null, league });
    expect(res.player).toBeNull();
  });

  it('does not crash with null league', () => {
    const res = resolvePlayerForProfile({ playerId: 1, league: null });
    expect(res.player).toBeNull();
  });

  it('returns context source and status hint', () => {
    const res = resolvePlayerForProfile({ playerId: 99, league: {}, context: { player: { id: 99, teamId: 'FA' } } });
    expect(res.source).toBe('context');
    expect(res.statusHint).toBe('free_agent');
  });
});
