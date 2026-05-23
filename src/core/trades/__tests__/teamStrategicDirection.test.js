import { describe, expect, it } from 'vitest';
import {
  TEAM_STRATEGIC_POSTURE,
  applyStrategicValuationModifiers,
  classifyTeamStrategicPosture,
  getTeamContextSnapshot,
} from '../teamStrategicDirection.js';

describe('teamStrategicDirection', () => {
  it('defaults to NEUTRAL when sample is incomplete', () => {
    const posture = classifyTeamStrategicPosture({ wins: 2, losses: 1, roster: [{ age: 25 }, { age: 26 }] }, { currentSeason: 2027 });
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.NEUTRAL);
  });

  it('classifies contender with strong record and mature roster', () => {
    const posture = classifyTeamStrategicPosture(
      { wins: 9, losses: 3, capRoom: 8, roster: Array.from({ length: 53 }, () => ({ age: 28 })) },
      { currentSeason: 2027 },
    );
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.CONTENDER);
  });

  it('classifies rebuilder with poor record and young roster', () => {
    const posture = classifyTeamStrategicPosture(
      { wins: 2, losses: 9, capRoom: -9, roster: Array.from({ length: 53 }, () => ({ age: 24 })) },
      { currentSeason: 2027 },
    );
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.REBUILDER);
  });

  it('rebuilders value picks above neutral', () => {
    const pick = { assetType: 'pick', season: 2029, round: 1 };
    const neutral = applyStrategicValuationModifiers(pick, 200, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2027 });
    const rebuilder = applyStrategicValuationModifiers(pick, 200, TEAM_STRATEGIC_POSTURE.REBUILDER, { currentSeason: 2027 });
    expect(rebuilder).toBeGreaterThan(neutral);
  });

  it('contenders value immediate high OVR contributors above neutral', () => {
    const player = { assetType: 'player', age: 27, ovr: 86, potential: 87, salary: 11 };
    const neutral = applyStrategicValuationModifiers(player, 300, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2027 });
    const contender = applyStrategicValuationModifiers(player, 300, TEAM_STRATEGIC_POSTURE.CONTENDER, { currentSeason: 2027 });
    expect(contender).toBeGreaterThan(neutral);
  });

  it('rebuilders discount aging expensive veterans', () => {
    const vet = { assetType: 'player', age: 32, ovr: 82, potential: 82, salary: 18 };
    const neutral = applyStrategicValuationModifiers(vet, 250, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2027 });
    const rebuilder = applyStrategicValuationModifiers(vet, 250, TEAM_STRATEGIC_POSTURE.REBUILDER, { currentSeason: 2027 });
    expect(rebuilder).toBeLessThan(neutral);
  });

  it('contenders mildly discount far-future picks', () => {
    const pick = { assetType: 'pick', season: 2030, round: 1 };
    const neutral = applyStrategicValuationModifiers(pick, 220, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2027 });
    const contender = applyStrategicValuationModifiers(pick, 220, TEAM_STRATEGIC_POSTURE.CONTENDER, { currentSeason: 2027 });
    expect(contender).toBeLessThan(neutral);
  });

  it('snapshot/helper calls are deterministic and non-mutating', () => {
    const team = { wins: 7, losses: 5, roster: [{ age: 26 }], capRoom: 3 };
    const frozenBefore = JSON.stringify(team);
    const one = getTeamContextSnapshot(team, { currentSeason: 2027 });
    const two = getTeamContextSnapshot(team, { currentSeason: 2027 });
    expect(one).toEqual(two);
    expect(JSON.stringify(team)).toBe(frozenBefore);
  });
});
