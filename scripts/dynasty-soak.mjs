#!/usr/bin/env node
/**
 * Dynasty soak CLI — must load fake IndexedDB before any DB/worker import.
 * @see src/testSupport/dynastySoakRunner.js
 *
 * Full worker sim (default 5 seasons) can take a long time on a 32-team save.
 * For CI, `npm run test:soak` runs fast Vitest audit coverage instead.
 */
import 'fake-indexeddb/auto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseDynastySoakArgv,
  resolveDynastySoakConfig,
  buildMarkdownReport,
  slimDynastySoakResultForJson,
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

  const { runDynastySoakOnce } = await import('../src/testSupport/dynastySoakRunner.js');

  console.log(
    `[dynasty-soak] profile=${resolved.auditProfile} seed=${resolved.seed} seasons=${resolved.seasons}${resolved.ci ? ' (ci short path)' : ''} deep=${resolved.deep} deepEachSeason=${resolved.deepEachSeason}`,
  );
  const result = await runDynastySoakOnce(resolved);

  const outDir = resolve(process.cwd(), resolved.outDir || 'artifacts/dynasty-soak');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, 'latest.json'),
    JSON.stringify(slimDynastySoakResultForJson(result), null, 2),
    'utf8',
  );
  const md = buildMarkdownReport(result);
  await writeFile(resolve(outDir, 'latest.md'), md, 'utf8');

  console.log(
    `[dynasty-soak] passed=${result.passed} runtimeMs=${result.runtimeMs} failures=${result.failures?.length ?? 0} warnings=${result.warnings?.length ?? 0}`,
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
  console.log(`[dynasty-soak] reports -> ${outDir}/latest.{json,md}`);

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[dynasty-soak] fatal:', e);
  process.exitCode = 1;
});
