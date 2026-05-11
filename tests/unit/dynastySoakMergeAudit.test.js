import { describe, expect, it } from 'vitest';
import { mergeAudit } from '../../src/testSupport/dynastySoakRunner.js';

function emptyAggregate() {
  return {
    passed: true,
    seasonsSimmed: 0,
    checks: [],
    warnings: [],
    failures: [],
    summary: {
      rosterHealth: 'ok',
      capHealth: 'ok',
      statHealth: 'ok',
      archiveHealth: 'ok',
      aiHealth: 'ok',
      transactionHealth: 'ok',
      draftHealth: 'ok',
      scoutingHealth: 'ok',
      developmentHealth: 'ok',
      historyHealth: 'ok',
    },
  };
}

describe('mergeAudit', () => {
  it('prefixes messages and merges failure state', () => {
    const into = emptyAggregate();
    mergeAudit(
      into,
      {
        passed: false,
        seasonsSimmed: 1,
        checks: [{ severity: 'failure', code: 'x', message: 'bad' }],
        warnings: [],
        failures: [{ code: 'cap_nan', message: 'nan' }],
        summary: { capHealth: 'fail', rosterHealth: 'ok' },
      },
      'S1',
    );
    expect(into.passed).toBe(false);
    expect(into.failures[0].message.startsWith('[S1]')).toBe(true);
    expect(into.summary.capHealth).toBe('fail');
  });
});
