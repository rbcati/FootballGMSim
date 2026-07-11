import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SIM_TO_PHASE draft user-pick auto-advance wiring', () => {
  const workerSource = readFileSync(resolve(process.cwd(), 'src/worker/worker.js'), 'utf8');

  it('keeps normal SIM_DRAFT_PICK manual-safe by default', () => {
    expect(workerSource).toContain("const allowUserAutoPick = payload?.allowUserAutoPick === true && payload?.source === 'sim_to_phase';");
    expect(workerSource).toContain('if (pick.teamId === userTeamId && !allowUserAutoPick)');
    expect(workerSource).toContain("reason: 'user_pick'");
  });

  it('opts only SIM_TO_PHASE preseason draft batches into user auto-pick', () => {
    expect(workerSource).toContain("handleSimDraftPick({ allowUserAutoPick: targetPhase === 'preseason', source: 'sim_to_phase' }, null)");
    expect(workerSource).toContain("case toWorker.SIM_DRAFT_PICK:     return await handleSimDraftPick(payload, id);");
  });

  it('reuses the canonical weighted draft-board selector instead of highest-OVR shortcuting user picks', () => {
    const helperStart = workerSource.indexOf('function selectCanonicalDraftProspectForTeam');
    expect(helperStart).toBeGreaterThan(-1);
    const helperEnd = workerSource.indexOf('// ── Handler: SIM_DRAFT_PICK', helperStart);
    const helperSource = workerSource.slice(helperStart, helperEnd);
    expect(helperSource).toContain('scoreDraftBoardEntry');
    expect(helperSource).toContain('buildAiTeamStrategy');
    expect(helperSource).toContain('AiLogic.calculateTeamNeeds');
    expect(helperSource).toContain('getAIDraftBoardAdjustment');
    expect(helperSource).not.toContain('sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0]');
  });

  it('enforces a no-progress contract around lifecycle draft batch steps', () => {
    expect(workerSource).toContain('captureDraftProgressState(cache.getMeta())');
    expect(workerSource).toContain('draftBatchMadeProgress(beforeDraftStep, afterDraftStep, draftStepResult)');
    expect(workerSource).toContain('throw createDraftNoProgressError(beforeDraftStep, afterDraftStep, draftStepResult)');
    expect(workerSource).toContain("err.code = 'DRAFT_BATCH_NO_PROGRESS'");
  });
});
