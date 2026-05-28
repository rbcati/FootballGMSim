import { describe, it, expect } from 'vitest';
import { getCurrentStandoutPlayers, summarizeGameSwing, getEventTags } from './liveGamePresentation.js';

// Helper to build a minimal log entry with a player object
function makeLog(type, player, extras = {}) {
  return {
    raw: { type, player, passer: extras.passer ?? null, ...extras },
    eventType: type,
    headline: extras.headline ?? '',
    score: { home: 0, away: 0 },
  };
}

describe('getCurrentStandoutPlayers — placeholder name filtering', () => {
  it('does not show raw starter names in standout QB slot', () => {
    const passerPlaceholder = { id: 1, name: 'QB Starter 7-2', pos: 'QB' };
    const events = [
      { raw: { type: 'pass', passer: passerPlaceholder, passYds: 120, passAtt: 1, completed: true } },
    ];
    const result = getCurrentStandoutPlayers(events, events.length);
    if (result.qb) {
      expect(result.qb.player).not.toMatch(/Starter/i);
      expect(result.qb.player).not.toMatch(/QB QB/i);
    }
  });

  it('does not show raw starter names in standout rusher slot', () => {
    const runner = { id: 5, name: 'RB Starter 2-1', pos: 'RB' };
    const events = [
      { raw: { type: 'run', player: runner, rushYds: 80 } },
    ];
    const result = getCurrentStandoutPlayers(events, events.length);
    if (result.rusher) {
      expect(result.rusher.player).not.toMatch(/Starter/i);
    }
  });

  it('does not show H QB1-style fallback names in standout slots', () => {
    const passer = { id: 2, name: 'H QB1', pos: 'QB' };
    const events = [
      { raw: { type: 'pass', passer, passYds: 200, passAtt: 2, completed: true } },
    ];
    const result = getCurrentStandoutPlayers(events, events.length);
    if (result.qb) {
      expect(result.qb.player).not.toMatch(/^H QB1$/);
    }
  });

  it('uses compact F. LastName format for real player names', () => {
    const passer = { id: 10, name: 'Patrick Mahomes', pos: 'QB' };
    const events = [
      { raw: { type: 'pass', passer, passYds: 300, passAtt: 3, completed: true } },
    ];
    const result = getCurrentStandoutPlayers(events, events.length);
    expect(result.qb).not.toBeNull();
    expect(result.qb.player).toBe('P. Mahomes');
  });

  it('falls back to "QB #id" for placeholder-named passer', () => {
    const passer = { id: 99, name: 'QB Starter 1-1', pos: 'QB' };
    const events = [
      { raw: { type: 'pass', passer, passYds: 150, passAtt: 2, completed: true } },
    ];
    const result = getCurrentStandoutPlayers(events, events.length);
    if (result.qb) {
      expect(result.qb.player).toMatch(/QB\s*#99/);
    }
  });
});

describe('getEventTags', () => {
  it('returns TD tag for touchdown event', () => {
    expect(getEventTags({ eventType: 'touchdown' })).toContain('TD');
  });

  it('returns SACK tag for sack event', () => {
    expect(getEventTags({ eventType: 'sack' })).toContain('SACK');
  });

  it('returns INT tag for interception turnover', () => {
    expect(getEventTags({ eventType: 'turnover', headline: 'interception' })).toContain('INT');
  });

  it('returns FUM tag for fumble turnover', () => {
    expect(getEventTags({ eventType: 'turnover', headline: 'fumble' })).toContain('FUM');
  });

  it('returns BIG PLAY for explosive_play events', () => {
    expect(getEventTags({ eventType: 'explosive_play' })).toContain('BIG PLAY');
  });

  it('returns RED ZONE for red_zone_entry events', () => {
    expect(getEventTags({ eventType: 'red_zone_entry' })).toContain('RED ZONE');
  });
});

describe('summarizeGameSwing', () => {
  it('returns neutral label when events are empty', () => {
    expect(summarizeGameSwing([])).toEqual({ label: 'Game still in balance', tone: 'neutral' });
  });

  it('returns offense tone when multiple recent scores', () => {
    const events = [
      { eventType: 'touchdown' },
      { eventType: 'touchdown' },
      { eventType: 'field_goal' },
    ];
    expect(summarizeGameSwing(events, events.length).tone).toBe('offense');
  });

  it('returns defense tone when multiple recent turnovers', () => {
    const events = [
      { eventType: 'turnover' },
      { eventType: 'turnover' },
    ];
    expect(summarizeGameSwing(events, events.length).tone).toBe('defense');
  });
});
