#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const allowedRedirectStatus = new Set([200, 301, 302, 303, 307, 308, 404, 410, 451]);

function parseBuildBlock(tomlContent) {
  const sectionMatch = tomlContent.match(/(^|\n)\[build\]\s*\n([\s\S]*?)(?=\n\s*\[[^\]]+\]\s*\n|$)/);
  return sectionMatch ? sectionMatch[2] : null;
}

function parseTomlStringValue(block, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^\\s*${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, 'm');
  const match = block.match(regex);
  return match ? match[1] : null;
}

export function resolvePublishDirectory({ repoRoot = process.cwd(), tomlPath = path.resolve(repoRoot, 'netlify.toml') } = {}) {
  if (!fs.existsSync(tomlPath)) {
    return { errors: ['Missing netlify.toml.'] };
  }

  const toml = fs.readFileSync(tomlPath, 'utf8');
  const buildBlock = parseBuildBlock(toml);

  if (!buildBlock) {
    return { errors: ['netlify.toml is missing [build] section.'] };
  }

  const buildCommand = parseTomlStringValue(buildBlock, 'command');
  const publish = parseTomlStringValue(buildBlock, 'publish');
  const errors = [];

  if (!buildCommand) {
    errors.push('netlify.toml is missing [build].command.');
  }

  if (!publish) {
    errors.push('netlify.toml is missing [build].publish.');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const resolvedPublishDir = path.resolve(repoRoot, publish);
  return {
    buildCommand,
    publish,
    resolvedPublishDir,
    errors: [],
  };
}

function isCommentOrBlank(line) {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function validateHeaderBlock(errors, fileLabel, block, lineNo) {
  if (!block) {
    return;
  }

  if (block.headerCount === 0) {
    errors.push(`${fileLabel}:${lineNo} block '${block.path}' has no headers.`);
  }
}

export function validateHeadersContent(lines, fileLabel = '_headers') {
  const errors = [];
  let currentBlock = null;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];

    if (isCommentOrBlank(raw)) {
      continue;
    }

    const isIndented = /^\s+/.test(raw);
    if (!isIndented) {
      validateHeaderBlock(errors, fileLabel, currentBlock, lineNo - 1);

      const blockPath = raw.trim();
      currentBlock = {
        path: blockPath,
        headerCount: 0,
      };

      if (!blockPath.startsWith('/')) {
        errors.push(`${fileLabel}:${lineNo} path must start with '/': ${blockPath}`);
      }

      if (/\s/.test(blockPath)) {
        errors.push(`${fileLabel}:${lineNo} path must not contain spaces: ${blockPath}`);
      }

      continue;
    }

    if (!currentBlock) {
      errors.push(`${fileLabel}:${lineNo} header appears before a path block.`);
      continue;
    }

    const match = raw.match(/^\s+([^:\s][^:]*)\s*:\s*(.+)\s*$/);
    if (!match) {
      errors.push(`${fileLabel}:${lineNo} invalid header line: ${raw.trim()}`);
      continue;
    }

    const headerName = match[1].trim();
    const headerValue = match[2].trim();

    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(headerName)) {
      errors.push(`${fileLabel}:${lineNo} invalid header name: ${headerName}`);
    }

    if (headerValue.length === 0) {
      errors.push(`${fileLabel}:${lineNo} empty value for header ${headerName}`);
    }

    currentBlock.headerCount += 1;
  }

  validateHeaderBlock(errors, fileLabel, currentBlock, lines.length);

  return errors;
}

export function validateRedirectsContent(lines, fileLabel = '_redirects') {
  const errors = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];

    if (isCommentOrBlank(raw)) {
      continue;
    }

    if (/^\s/.test(raw)) {
      errors.push(`${fileLabel}:${lineNo} redirects lines must not be indented.`);
      continue;
    }

    const tokens = raw.trim().split(/\s+/);
    if (tokens.length < 3) {
      errors.push(`${fileLabel}:${lineNo} expected 'from to status', got: ${raw.trim()}`);
      continue;
    }

    const [from, to, statusToken] = tokens;
    const status = Number.parseInt(statusToken, 10);

    if (!from.startsWith('/')) {
      errors.push(`${fileLabel}:${lineNo} source must start with '/': ${from}`);
    }

    if (!to.startsWith('/') && !/^https?:\/\//.test(to)) {
      errors.push(`${fileLabel}:${lineNo} destination must start with '/' or http(s):// : ${to}`);
    }

    if (!Number.isInteger(status) || !allowedRedirectStatus.has(status)) {
      errors.push(`${fileLabel}:${lineNo} unsupported status '${statusToken}'.`);
    }
  }

  return errors;
}

export function validateNetlifyRules({ repoRoot = process.cwd() } = {}) {
  const failures = [];
  const publishInfo = resolvePublishDirectory({ repoRoot });

  failures.push(...publishInfo.errors);
  if (publishInfo.errors.length > 0) {
    return { failures, publishInfo: null };
  }

  const { resolvedPublishDir, publish } = publishInfo;
  const headersPath = path.join(resolvedPublishDir, '_headers');
  const redirectsPath = path.join(resolvedPublishDir, '_redirects');
  const indexPath = path.join(resolvedPublishDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    failures.push(`Missing ${path.relative(repoRoot, indexPath)} (expected after build).`);
  }

  if (!fs.existsSync(headersPath)) {
    failures.push(`Missing ${path.relative(repoRoot, headersPath)} (expected after build).`);
  } else {
    failures.push(...validateHeadersContent(readLines(headersPath), path.basename(headersPath)));
  }

  if (!fs.existsSync(redirectsPath)) {
    // Optional in Netlify builds.
  } else {
    failures.push(...validateRedirectsContent(readLines(redirectsPath), path.basename(redirectsPath)));
  }

  return {
    failures,
    publishInfo: {
      ...publishInfo,
      publish,
      headersPath,
      redirectsPath,
      indexPath,
    },
  };
}

function runCli() {
  const { failures, publishInfo } = validateNetlifyRules();

  if (publishInfo) {
    console.log(`[netlify-rules] netlify.toml build.publish='${publishInfo.publish}'`);
    console.log(`[netlify-rules] resolved publish directory: ${publishInfo.resolvedPublishDir}`);
    console.log(`[netlify-rules] checking ${path.relative(process.cwd(), publishInfo.indexPath)}`);
    console.log(`[netlify-rules] checking ${path.relative(process.cwd(), publishInfo.headersPath)}`);

    if (!fs.existsSync(publishInfo.redirectsPath)) {
      console.log(`[netlify-rules] INFO: ${path.relative(process.cwd(), publishInfo.redirectsPath)} not present (optional).`);
    } else {
      console.log(`[netlify-rules] checking ${path.relative(process.cwd(), publishInfo.redirectsPath)}`);
    }
  }

  if (failures.length > 0) {
    for (const message of failures) {
      console.error(`[netlify-rules] ERROR: ${message}`);
    }
    console.error('[netlify-rules] Validation failed.');
    process.exit(1);
  }

  console.log('[netlify-rules] OK: Netlify publish artifacts passed validation.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
