/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MobileNav, { BOTTOM_TABS, MORE_GROUPS } from './MobileNav.jsx';
import { isKnownDashboardTab, SHELL_SECTIONS } from '../utils/shellNavigation.js';

describe('MobileNav', () => {
  beforeEach(() => { window.scrollTo = vi.fn(); });
  afterEach(() => cleanup());

  it('gives every rendered entry one valid owner without duplicate ids', () => {
    const items = MORE_GROUPS.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      if (item.action === 'app') {
        expect(item).toMatchObject({ id: 'Saves', value: 'saves' });
      } else {
        expect(isKnownDashboardTab(item.id), item.id).toBe(true);
      }
    }
    expect(BOTTOM_TABS.map((tab) => tab.action)).toEqual(['section', 'section', 'section', 'destination', 'menu']);
    expect(BOTTOM_TABS.filter((tab) => tab.action === 'section').every((tab) => Object.values(SHELL_SECTIONS).includes(tab.value))).toBe(true);
    expect(isKnownDashboardTab(BOTTOM_TABS.find((tab) => tab.action === 'destination').value)).toBe(true);
  });

  it('routes Saves to its App owner and closes the drawer', () => {
    const onAppAction = vi.fn();
    const onDestinationChange = vi.fn();
    render(<MobileNav activeSection={SHELL_SECTIONS.hq} onSectionChange={vi.fn()} onDestinationChange={onDestinationChange} onAppAction={onAppAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Saves' }));

    expect(onAppAction).toHaveBeenCalledWith('saves');
    expect(onDestinationChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the drawer on Escape and when collapsed', () => {
    const { container, rerender } = render(<MobileNav activeSection={SHELL_SECTIONS.hq} onSectionChange={vi.fn()} onDestinationChange={vi.fn()} />);
    const toggle = () => container.querySelector('button[aria-label="More"]');
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle());
    rerender(<MobileNav activeSection={SHELL_SECTIONS.hq} onSectionChange={vi.fn()} onDestinationChange={vi.fn()} collapsed />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
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
    expect(html).toContain('premium-bottom-tab active" aria-label="Team" aria-current="page"');
    expect(html).toContain('Team');
    expect(html).toContain('mobile-bottom-tab__badge');
  });

  it.each([
    [SHELL_SECTIONS.team, undefined, 'Team'],
    [SHELL_SECTIONS.hq, undefined, 'HQ'],
    [SHELL_SECTIONS.league, undefined, 'League'],
    [SHELL_SECTIONS.hq, 'News', 'News'],
  ])('marks the active %s destination as the current page', (activeSection, activeTab, label) => {
    render(<MobileNav activeSection={activeSection} activeTab={activeTab} onSectionChange={vi.fn()} onDestinationChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: label }).getAttribute('aria-current')).toBe('page');
  });

  it('exposes More as an expanded menu toggle, never as the current page', () => {
    render(<MobileNav activeSection={SHELL_SECTIONS.hq} onSectionChange={vi.fn()} onDestinationChange={vi.fn()} />);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('button', { name: 'HQ' }).getAttribute('aria-current')).toBe('page');
  });

  it('owns mobile glossary access inside More instead of a floating trigger', () => {
    render(<MobileNav activeSection={SHELL_SECTIONS.hq} onSectionChange={vi.fn()} onDestinationChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    const glossary = screen.getByRole('button', { name: 'Open rules glossary' });
    expect(glossary.className).toContain('mobile-nav-item');
    expect(glossary.style.position).toBe('static');
    fireEvent.click(glossary);
    const panel = screen.getByRole('dialog', { name: 'Rules Glossary' });
    expect(panel.closest('.mobile-nav-panel')).toBeNull();
    expect(panel.parentElement).toBe(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'Close glossary' }));
    expect(screen.queryByRole('dialog', { name: 'Rules Glossary' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Standings' }));
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('false');
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

  it('collapses the sole bottom navigation when Game Book focus mode is active', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.hq}
        onSectionChange={vi.fn()}
        onDestinationChange={vi.fn()}
        league={{ year: 2026, phase: 'regular' }}
        collapsed
      />,
    );

    // Bottom bar carries the collapsed marker so CSS hides it during review.
    expect(html).toContain('mobile-bottom-bar premium-bottom-nav is-collapsed');
    expect(html).toContain('data-collapsed="true"');
    expect(html).not.toContain('mobile-nav-hamburger');
  });

  it('keeps the bottom nav visible (no collapsed class) by default — restored on return to HQ', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.hq}
        onSectionChange={vi.fn()}
        onDestinationChange={vi.fn()}
        league={{ year: 2026, phase: 'regular' }}
      />,
    );

    expect(html).not.toContain('is-collapsed');
    expect(html).toContain('data-collapsed="false"');
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
