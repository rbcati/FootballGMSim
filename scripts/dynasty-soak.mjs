#!/usr/bin/env node
/**
 * Dynasty soak CLI — must load fake IndexedDB before any DB/worker import.
 * @see src/testSupport/dynastySoakRunner.js
 *
 * Full worker sim (default 5 seasons) can take a long time on a 32-team save.
 * For CI, `npm run test:soak` runs fast Vitest audit coverage instead.
 */
import 'fake-indexeddb/auto';
import {
  parseDynastySoakArgv,
  resolveDynastySoakConfig,
  writeDynastySoakReports,
  DYNASTY_SOAK_USAGE,
} from '../src/testSupport/dynastySoakCli.js';

async function main() {
  const parsed = parseDynastySoakArgv(process.argv);
  if (parsed.errors.length) {
    console.error(DYNASTY_SOAK_USAGE);
    for (const err of parsed.errors) console.error(`[dynasty-soak] ${err}`);
    process.exitCode = 1;
    return;
  }

  const { errors, resolved } = resolveDynastySoakConfig(parsed.raw);
  if (errors.length || !resolved) {
    console.error(DYNASTY_SOAK_USAGE);
    for (const err of errors) console.error(`[dynasty-soak] ${err}`);
    process.exitCode = 1;
    return;
  }

  const { runDynastySoakOnce, runDynastySoakMultiSeed } = await import('../src/testSupport/dynastySoakRunner.js');

  console.log(
    `[dynasty-soak] profile=${resolved.auditProfile} runnerProfile=${resolved.runnerProfile} seeds=${resolved.seeds.join(',')} seasons=${resolved.seasons}${resolved.ci ? ' (ci short path)' : ''} deep=${resolved.deep} deepEachSeason=${resolved.deepEachSeason}`,
  );
  if (resolved.auditProfile === 'full' || resolved.isLongProfile) {
    console.warn(
      '[dynasty-soak] full profile is a manual full-season SIM_TO_PHASE audit; a single worker request may run for a long time before --max-runtime-ms is checked.',
    );
  }
  if (resolved.isLongProfile) {
    console.warn('[dynasty-soak] long-ci/stability/stability-v1 is optional/manual and is not part of default push CI.');
  }

  const result = resolved.isMultiSeed
    ? await runDynastySoakMultiSeed({
        ...resolved,
        onSeedStart(seed, index, total) {
          console.log(`[dynasty-soak] seed ${index}/${total} start seed=${seed}`);
        },
        onSeedComplete(seedResult, index, total) {
          console.log(`[dynasty-soak] seed ${index}/${total} done seed=${seedResult.seed} passed=${seedResult.passed} runtimeMs=${seedResult.runtimeMs} failures=${seedResult.failures?.length ?? 0} warnings=${seedResult.warnings?.length ?? 0}`);
        },
      })
    : await runDynastySoakOnce(resolved);

  const { outDir } = await writeDynastySoakReports(result, resolved.outDir || 'artifacts/dynasty-soak');

  console.log(
    result.multiSeed
      ? `[dynasty-soak] passed=${result.passed} seeds=${result.seedCount} pass=${result.passCount} fail=${result.failCount} runtimeMs=${result.runtimeMs} warningSeeds=${result.warningSeedCount}`
      : `[dynasty-soak] passed=${result.passed} runtimeMs=${result.runtimeMs} failures=${result.failures?.length ?? 0} warnings=${result.warnings?.length ?? 0}`,
  );
  if (result.failures?.length) {
    for (const f of result.failures.slice(0, 20)) {
      console.error(`  FAIL ${f.code}: ${f.message}`);
    }
  }
  if (result.warnings?.length) {
    for (const w of result.warnings.slice(0, 15)) {
      console.warn(`  WARN ${w.code}: ${w.message}`);
    }
  }
  console.log(`[dynasty-soak] reports -> ${outDir}/latest.{json,md}${result.multiSeed ? ' and latest-multi-seed.{json,md}' : ''}`);

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[dynasty-soak] fatal:', e);
  process.exitCode = 1;
});
