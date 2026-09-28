import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');

function extractFunction(name) {
  const start = workerSource.indexOf(`async function ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const rest = workerSource.slice(start);
  const next = rest.slice(1).search(/\n(async )?function \w+\(/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('Watch Game canonical authority', () => {
  const watch = extractFunction('handleWatchGame');

  it('uses the shared canonical matchup builder and normal engine router', () => {
    expect(watch).toContain('buildWeekMatchupsFromLeague(');
    expect(watch).toContain('_weekGames: [userGame]');
    expect(watch).toContain('simulateWithOptionalNewEngine({');
    expect(watch).toContain("getLeagueSetting('useNewSimulationEngine', false)");
    expect(watch).not.toContain('ENGINE ROUTING — INTENTIONAL');
  });

  it('keeps legacy simulation only behind the shared fallback callback', () => {
    const fallback = watch.indexOf('legacySimulate: () => simulateBatch([userGame]');
    expect(fallback).toBeGreaterThan(watch.indexOf('simulateWithOptionalNewEngine({'));
    expect(watch.match(/simulateBatch\(\[userGame\]/g)).toHaveLength(1);
  });

  it('applies once and marks the schedule game played before presenting it', () => {
    expect(watch.match(/applyGameResultToCache\(res, week, seasonId\)/g)).toHaveLength(1);
    const applied = watch.indexOf('applyGameResultToCache(res, week, seasonId)');
    const markedPlayed = watch.indexOf('slimGame.played = true');
    const presented = watch.indexOf('postScoped(toUI.PLAY_LOGS');
    expect(markedPlayed).toBeGreaterThan(applied);
    expect(presented).toBeGreaterThan(markedPlayed);
  });

  it('emits the canonical viewer payload without a presentation re-simulation', () => {
    for (const field of ['playerStats:', 'teamStats:', 'canonicalEvents:', 'scoringSummary:', 'quarterScores:', 'gameReasoningFlags:']) {
      expect(watch).toContain(field);
    }
    expect(watch.slice(watch.indexOf('post(toUI.PLAY_LOGS'))).not.toContain('simulateBatch(');
  });
});
