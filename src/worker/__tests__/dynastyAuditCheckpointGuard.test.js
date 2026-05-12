import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toUI, toWorker } from '../protocol.js';

describe('dynasty audit checkpoint worker guard', () => {
  it('declares explicit audit-only protocol messages', () => {
    expect(toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT).toBe('RUN_DYNASTY_AUDIT_CHECKPOINT');
    expect(toUI.DYNASTY_AUDIT_CHECKPOINT).toBe('DYNASTY_AUDIT_CHECKPOINT');
  });

  it('keeps checkpoint guarded and out of normal completed-season history paths', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');
    const handlerStart = workerSource.indexOf('async function handleRunDynastyAuditCheckpoint');
    const historyHandlerStart = workerSource.indexOf('// ── Handler: GET_SEASON_HISTORY');
    expect(handlerStart).toBeGreaterThan(-1);
    expect(historyHandlerStart).toBeGreaterThan(handlerStart);
    const handlerSource = workerSource.slice(handlerStart, historyHandlerStart);

    expect(handlerSource).toContain('__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ === true');
    expect(handlerSource).toContain('No league loaded for dynasty audit checkpoint.');
    expect(handlerSource).toContain('requires at least one real ADVANCE_WEEK');
    expect(handlerSource).toContain("archiveType: 'audit_checkpoint'");
    expect(handlerSource).toContain('completedSeason: false');
    expect(handlerSource).toContain('dynastyAuditCheckpoints');
    expect(handlerSource).not.toContain('archiveSeason(');
    expect(handlerSource).not.toContain('Seasons.save');
    expect(handlerSource).not.toContain('leagueHistory:');
  });
});
