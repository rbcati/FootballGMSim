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

function parseArgs(argv) {
  const out = { ci: false, seasons: null, seed: null, outDir: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--ci') out.ci = true;
    else if (a.startsWith('--seasons=')) out.seasons = Number(a.split('=')[1]);
    else if (a.startsWith('--seed=')) out.seed = Number(a.split('=')[1]);
    else if (a.startsWith('--outDir=')) out.outDir = a.split('=').slice(1).join('=');
    else if (a === '--seasons' && argv[i + 1]) {
      out.seasons = Number(argv[i + 1]);
      i += 1;
    } else if (a === '--seed' && argv[i + 1]) {
      out.seed = Number(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

function mdEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function buildMarkdownReport(result) {
  const lines = [];
  lines.push('# Dynasty soak report');
  lines.push('');
  lines.push(`- **Seed:** ${result.seed}`);
  lines.push(`- **Seasons:** ${result.seasonsSimmed}`);
  lines.push(`- **Runtime ms:** ${result.runtimeMs}`);
  lines.push(`- **Passed:** ${result.passed ? 'yes' : 'no'}`);
  lines.push(`- **Severity:** ${result.severity}`);
  lines.push('');
  lines.push('## Summary buckets');
  lines.push('');
  lines.push('| Bucket | Status |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(result.summary || {})) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push('## Failures');
  lines.push('');
  if (!result.failures?.length) lines.push('_None_');
  else {
    for (const f of result.failures) {
      lines.push(`- **${f.code}:** ${mdEscape(f.message)}`);
    }
  }
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (!result.warnings?.length) lines.push('_None_');
  else {
    for (const w of result.warnings) {
      lines.push(`- **${w.code}:** ${mdEscape(w.message)}`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Failures block CI; warnings are informational.');
  lines.push('- Thresholds are intentionally broad (audit V1, not balance tuning).');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const seed = Number.isFinite(args.seed) ? args.seed : 1383;
  const seasons = Number.isFinite(args.seasons)
    ? args.seasons
    : args.ci
      ? 1
      : 5;

  const { runDynastySoakOnce } = await import('../src/testSupport/dynastySoakRunner.js');

  console.log(`[dynasty-soak] seed=${seed} seasons=${seasons}${args.ci ? ' (ci)' : ''}`);
  const result = await runDynastySoakOnce({ seasons, seed });
  result.seed = seed;

  const outDir = resolve(process.cwd(), args.outDir || 'artifacts/dynasty-soak');
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'latest.json'), JSON.stringify(result, null, 2), 'utf8');
  const md = buildMarkdownReport(result);
  await writeFile(resolve(outDir, 'latest.md'), md, 'utf8');

  console.log(`[dynasty-soak] passed=${result.passed} runtimeMs=${result.runtimeMs} failures=${result.failures?.length ?? 0} warnings=${result.warnings?.length ?? 0}`);
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
