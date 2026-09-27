import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('LeagueDashboard RosterHub navigation wiring', () => {
  it('passes the canonical dashboard tab setter to RosterHub', () => {
    const source = readFileSync(fileURLToPath(new URL('../LeagueDashboard.jsx', import.meta.url)), 'utf8');
    const rosterHub = source.slice(source.indexOf('<RosterHub'), source.indexOf('/>', source.indexOf('<RosterHub')));
    expect(rosterHub).toContain('onNavigate={setActiveTab}');
  });
});
