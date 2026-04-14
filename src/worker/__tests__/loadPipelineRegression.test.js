import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('load pipeline regression guards', () => {
  it('does not reference removed contract normalization helper in load path', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    expect(workerSource.includes('normalizeContract(p)')).toBe(false);
    expect(workerSource.includes('normalizeContractLoading')).toBe(false);
  });
});

