#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const headersPath = path.join(DIST_DIR, '_headers');
const redirectsPath = path.join(DIST_DIR, '_redirects');

const allowedRedirectStatus = new Set([200, 301, 302, 303, 307, 308, 404, 410, 451]);

function fail(message) {
  console.error(`[netlify-rules] ERROR: ${message}`);
  process.exitCode = 1;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function isCommentOrBlank(line) {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

function validateHeadersFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${path.relative(process.cwd(), filePath)} (expected after build).`);
    return;
  }

  const lines = readLines(filePath);
  let currentBlock = null;
  let headerCountInBlock = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];

    if (isCommentOrBlank(raw)) {
      continue;
    }

    const isIndented = /^\s+/.test(raw);
    if (!isIndented) {
      currentBlock = raw.trim();
      headerCountInBlock = 0;

      if (!currentBlock.startsWith('/')) {
        fail(`${path.basename(filePath)}:${lineNo} path must start with '/': ${currentBlock}`);
      }

      if (/\s/.test(currentBlock)) {
        fail(`${path.basename(filePath)}:${lineNo} path must not contain spaces: ${currentBlock}`);
      }

      continue;
    }

    if (!currentBlock) {
      fail(`${path.basename(filePath)}:${lineNo} header appears before a path block.`);
      continue;
    }

    const match = raw.match(/^\s+([^:\s][^:]*)\s*:\s*(.+)\s*$/);
    if (!match) {
      fail(`${path.basename(filePath)}:${lineNo} invalid header line: ${raw.trim()}`);
      continue;
    }

    const headerName = match[1].trim();
    const headerValue = match[2].trim();

    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(headerName)) {
      fail(`${path.basename(filePath)}:${lineNo} invalid header name: ${headerName}`);
    }

    if (headerValue.length === 0) {
      fail(`${path.basename(filePath)}:${lineNo} empty value for header ${headerName}`);
    }

    headerCountInBlock += 1;
  }

  if (currentBlock && headerCountInBlock === 0) {
    fail(`${path.basename(filePath)} final block '${currentBlock}' has no headers.`);
  }
}

function validateRedirectsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[netlify-rules] INFO: ${path.relative(process.cwd(), filePath)} not present (optional).`);
    return;
  }

  const lines = readLines(filePath);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];

    if (isCommentOrBlank(raw)) {
      continue;
    }

    if (/^\s/.test(raw)) {
      fail(`${path.basename(filePath)}:${lineNo} redirects lines must not be indented.`);
      continue;
    }

    const tokens = raw.trim().split(/\s+/);
    if (tokens.length < 3) {
      fail(`${path.basename(filePath)}:${lineNo} expected 'from to status', got: ${raw.trim()}`);
      continue;
    }

    const [from, to, statusToken] = tokens;
    const status = Number.parseInt(statusToken, 10);

    if (!from.startsWith('/')) {
      fail(`${path.basename(filePath)}:${lineNo} source must start with '/': ${from}`);
    }

    if (!to.startsWith('/') && !/^https?:\/\//.test(to)) {
      fail(`${path.basename(filePath)}:${lineNo} destination must start with '/' or http(s):// : ${to}`);
    }

    if (!Number.isInteger(status) || !allowedRedirectStatus.has(status)) {
      fail(`${path.basename(filePath)}:${lineNo} unsupported status '${statusToken}'.`);
    }
  }
}

function validateTomlFallback() {
  const tomlPath = path.resolve(process.cwd(), 'netlify.toml');
  if (!fs.existsSync(tomlPath)) {
    fail('Missing netlify.toml.');
    return;
  }

  const toml = fs.readFileSync(tomlPath, 'utf8');
  const hasBuildCommand = /\[build\][\s\S]*?command\s*=\s*"[^"]+"/m.test(toml);
  const hasPublish = /\[build\][\s\S]*?publish\s*=\s*"[^"]+"/m.test(toml);

  if (!hasBuildCommand) {
    fail('netlify.toml is missing [build].command.');
  }

  if (!hasPublish) {
    fail('netlify.toml is missing [build].publish.');
  }
}

validateTomlFallback();
validateHeadersFile(headersPath);
validateRedirectsFile(redirectsPath);

if (process.exitCode) {
  console.error('[netlify-rules] Validation failed.');
  process.exit(process.exitCode);
}

console.log('[netlify-rules] OK: dist/_headers and dist/_redirects passed syntax validation.');
