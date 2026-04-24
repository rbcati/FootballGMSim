import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolvePublishDirectory,
  validateHeadersContent,
  validateRedirectsContent,
} from '../../scripts/validate-netlify-rules.mjs';

describe('validate-netlify-rules headers', () => {
  it('accepts valid multi-block _headers', () => {
    const lines = [
      '/index.html',
      '  Cache-Control: no-cache',
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
    ];

    expect(validateHeadersContent(lines)).toEqual([]);
  });

  it('fails when first block has no headers', () => {
    const lines = ['/index.html', '/assets/*', '  Cache-Control: public'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes("block '/index.html' has no headers"))).toBe(true);
  });

  it('fails when middle block has no headers', () => {
    const lines = ['/one', '  X-Test: 1', '/two', '/three', '  X-Test: 3'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes("block '/two' has no headers"))).toBe(true);
  });

  it('fails when final block has no headers', () => {
    const lines = ['/one', '  X-Test: 1', '/two'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes("block '/two' has no headers"))).toBe(true);
  });

  it('fails when header appears before any path block', () => {
    const lines = ['  X-Test: 1', '/one', '  X-Test: 2'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes('header appears before a path block'))).toBe(true);
  });

  it('fails on invalid header names', () => {
    const lines = ['/one', '  Bad Header: value'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes('invalid header name'))).toBe(true);
  });

  it('fails when path does not start with slash', () => {
    const lines = ['index.html', '  X-Test: 1'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes("path must start with '/'"))).toBe(true);
  });

  it('fails when path contains spaces', () => {
    const lines = ['/index html', '  X-Test: 1'];
    const errors = validateHeadersContent(lines);
    expect(errors.some((e) => e.includes('path must not contain spaces'))).toBe(true);
  });
});

describe('validate-netlify-rules redirects', () => {
  it('allows valid redirects and comments', () => {
    const lines = ['# comment', '/old /new 301', '/foo https://example.com 302'];
    expect(validateRedirectsContent(lines)).toEqual([]);
  });

  it('fails invalid redirects syntax', () => {
    const lines = ['  /old /new 301', 'old /new 301', '/old ftp://example.com 301', '/old /new 999', '/short /missing'];
    const errors = validateRedirectsContent(lines);
    expect(errors.some((e) => e.includes('must not be indented'))).toBe(true);
    expect(errors.some((e) => e.includes("source must start with '/'"))).toBe(true);
    expect(errors.some((e) => e.includes('destination must start'))).toBe(true);
    expect(errors.some((e) => e.includes('unsupported status'))).toBe(true);
    expect(errors.some((e) => e.includes("expected 'from to status'"))).toBe(true);
  });
});

describe('resolvePublishDirectory', () => {
  it('resolves relative publish directory from repo root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netlify-rules-'));
    fs.writeFileSync(path.join(dir, 'netlify.toml'), '[build]\n  command = "npm run build"\n  publish = "dist"\n');

    const result = resolvePublishDirectory({ repoRoot: dir });

    expect(result.errors).toEqual([]);
    expect(result.publish).toBe('dist');
    expect(result.resolvedPublishDir).toBe(path.join(dir, 'dist'));
  });
});
