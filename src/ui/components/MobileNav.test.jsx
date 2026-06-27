import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import MobileNav from './MobileNav.jsx';
import { SHELL_SECTIONS } from '../utils/shellNavigation.js';

describe('MobileNav', () => {
  it('renders premium bottom nav and marks the active shell tab', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.team}
        activeTab="Team:Roster / Depth"
        onSectionChange={vi.fn()}
        onDestinationChange={vi.fn()}
        league={{ year: 2026, phase: 'regular', userTeamId: 1, teams: [{ id: 1, roster: [{ id: 7, injuryWeeksRemaining: 2 }] }] }}
      />,
    );

    expect(html).toContain('premium-bottom-nav');
    expect(html).toContain('premium-bottom-tab active" aria-label="Team"');
    expect(html).toContain('Team');
    expect(html).toContain('mobile-bottom-tab__badge');
  });

  it('keeps command menu destinations wired for more drawer entries', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.hq}
        onSectionChange={vi.fn()}
        onDestinationChange={vi.fn()}
        league={{ year: 2026, phase: 'regular' }}
      />,
    );

    expect(html).toContain('Command Menu');
    expect(html).toContain('Trade');
    expect(html).toContain('Free Agency');
    expect(html).toContain('League');
  });

  it('surfaces the weekly-loop group first with core destinations reachable', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.hq}
        onSectionChange={vi.fn()}
        onDestinationChange={vi.fn()}
        league={{ year: 2026, phase: 'regular' }}
      />,
    );

    // Weekly Loop group is present and ordered ahead of Front Office.
    expect(html).toContain('Weekly Loop');
    expect(html).toContain('Front Office');
    expect(html.indexOf('Weekly Loop')).toBeLessThan(html.indexOf('Front Office'));

    // Core weekly-loop destinations are reachable from the drawer on mobile.
    for (const label of ['Weekly Results', 'Schedule', 'Standings', 'League Stats']) {
      expect(html).toContain(label);
    }
    // No vague "office/management" hub headings remain in the drawer.
    expect(html).not.toContain('League Office');
    expect(html).not.toContain('Team Management');
  });
});
