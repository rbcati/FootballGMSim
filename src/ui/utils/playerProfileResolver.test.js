import { describe, it, expect } from 'vitest';
import { resolvePlayerForProfile } from './playerProfileResolver';

const rosterPlayer = { id: 7, name: 'Roster Guy', teamId: 1 };
const freeAgent = { id: 99, name: 'FA Guy', teamId: null };
const prospect = { id: 501, prospectId: 'P-501', name: 'Prospect Guy', status: 'draft_eligible' };

const league = {
  teams: [{ id: 1, name: 'Sharks', roster: [rosterPlayer] }],
  freeAgents: [freeAgent],
  draftClass: [prospect],
};

describe('resolvePlayerForProfile', () => {
  it('resolves roster player by id', () => {
    const res = resolvePlayerForProfile({ playerId: 7, league });
    expect(res.player?.name).toBe('Roster Guy');
    expect(res.statusHint).toBe('roster');
    expect(res.source).toBe('team_roster');
  });

  it('resolves free agent by id', () => {
    const res = resolvePlayerForProfile({ playerId: 99, league });
    expect(res.player?.name).toBe('FA Guy');
    expect(res.statusHint).toBe('free_agent');
    expect(res.source).toBe('free_agents');
  });

  it('resolves draft prospect by id', () => {
    const res = resolvePlayerForProfile({ playerId: 501, league });
    expect(res.player?.name).toBe('Prospect Guy');
    expect(res.statusHint).toBe('draft_prospect');
    expect(res.source).toBe('draft_class');
  });

  it('resolves prospect by prospectId', () => {
    const res = resolvePlayerForProfile({ playerId: 'P-501', league });
    expect(res.player?.name).toBe('Prospect Guy');
    expect(res.statusHint).toBe('draft_prospect');
  });

  it('returns safe null for missing id', () => {
    const res = resolvePlayerForProfile({ league });
    expect(res.player).toBeNull();
    expect(res.statusHint).toBe('unknown');
    expect(res.source).toBe('none');
  });

  it('does not crash with null league', () => {
    const res = resolvePlayerForProfile({ playerId: 1, league: null });
    expect(res.player).toBeNull();
    expect(res.statusHint).toBe('unknown');
  });

  it('resolves context player and reports context source', () => {
    const contextPlayer = { id: 42, name: 'Context Guy', teamId: 'FA' };
    const res = resolvePlayerForProfile({ playerId: 42, league: null, context: { row: { _player: contextPlayer } } });
    expect(res.player?.name).toBe('Context Guy');
    expect(res.source).toBe('context');
    expect(res.statusHint).toBe('free_agent');
  });
});
