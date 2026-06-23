/**
 * NavigationShellPolish.test.jsx
 *
 * Smoke + regression coverage for the mobile shell / navigation polish pass:
 *  - bottom nav renders with the correct active state per shell section
 *  - the app shell reserves safe-area-aware bottom space for the floating nav
 *  - LiveGame's sticky scorebug (top) and the shell nav (bottom) cannot collide
 *  - PostGame's primary action keeps clearance above the nav / home indicator
 *  - desktop layout stays sane when the mobile shell classes are present
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import MobileNav from '../MobileNav.jsx';
import PostGameScreen from '../PostGameScreen.jsx';
import { SHELL_SECTIONS } from '../../utils/shellNavigation.js';

const readStyle = (relPath) =>
  readFileSync(fileURLToPath(new URL(`../../styles/${relPath}`, import.meta.url)), 'utf8');

const baseCss = readStyle('base.css');
const appMobileCss = readStyle('app-mobile.css');
const componentsCss = readStyle('components.css');

const league = {
  year: 2026,
  phase: 'regular',
  userTeamId: 1,
  teams: [{ id: 1, roster: [] }],
  newsItems: [],
};

describe('MobileNav — bottom nav active state per shell section', () => {
  for (const [section, label] of [
    [SHELL_SECTIONS.hq, 'HQ'],
    [SHELL_SECTIONS.team, 'Team'],
    [SHELL_SECTIONS.league, 'League'],
  ]) {
    it(`marks the ${label} tab active when on the ${section} section`, () => {
      const html = renderToString(
        <MobileNav
          activeSection={section}
          onSectionChange={() => {}}
          onDestinationChange={() => {}}
          league={league}
        />,
      );
      expect(html).toContain('premium-bottom-nav');
      expect(html).toContain(`premium-bottom-tab active" aria-label="${label}"`);
    });
  }

  it('marks the News tab active when the active destination is News', () => {
    const html = renderToString(
      <MobileNav
        activeSection={SHELL_SECTIONS.hq}
        activeTab="News"
        onSectionChange={() => {}}
        onDestinationChange={() => {}}
        league={league}
      />,
    );
    expect(html).toContain('premium-bottom-tab active" aria-label="News"');
  });
});

describe('Shell CSS — safe-area aware bottom spacing tokens', () => {
  it('defines centralized mobile shell spacing tokens', () => {
    expect(baseCss).toMatch(/--mobile-nav-height:/);
    expect(baseCss).toMatch(/--mobile-bottom-clearance:\s*calc\(/);
    expect(baseCss).toMatch(/--page-bottom-padding:/);
    // Clearance must fold in the device safe-area inset.
    expect(baseCss).toMatch(/--mobile-bottom-clearance[\s\S]*var\(--safe-bottom\)/);
  });

  it('app shell reserves nav clearance for content instead of a hardcoded height', () => {
    const shellBlock = appMobileCss.match(/\.app-shell\s*\{[\s\S]*?\}/)[0];
    expect(shellBlock).toMatch(/padding-bottom:\s*var\(--page-bottom-padding\)/);
    // The old hardcoded "+ 80px" must be gone so notched devices get real clearance.
    expect(shellBlock).not.toMatch(/padding-bottom:[^;]*80px/);
  });

  it('keeps desktop layout sane: app shell drops the mobile nav clearance >=768px', () => {
    const desktop = appMobileCss.match(
      /@media\s*\(min-width:\s*768px\)\s*\{\s*\.app-shell\s*\{[\s\S]*?\}/,
    );
    expect(desktop).toBeTruthy();
    expect(desktop[0]).toMatch(/padding-bottom:\s*var\(--space-6\)/);
  });
});

describe('LiveGame scorebug vs shell nav — no overlap', () => {
  it('pins the scorebug to the top and the bottom nav to the bottom', () => {
    const scorebug = componentsCss.match(/\.lg-scorebug\s*\{[\s\S]*?\}/)[0];
    expect(scorebug).toMatch(/position:\s*sticky/);
    expect(scorebug).toMatch(/top:\s*0/);

    const nav = appMobileCss.match(/\.mobile-bottom-bar\s*\{[\s\S]*?\}/)[0];
    expect(nav).toMatch(/position:\s*fixed/);
    expect(nav).toMatch(/bottom:\s*0/);
    // Scorebug z-index stays below the nav's so the nav is always reachable.
    const scorebugZ = Number(scorebug.match(/z-index:\s*(\d+)/)[1]);
    const navZ = Number(nav.match(/z-index:\s*(\d+)/)[1]);
    expect(navZ).toBeGreaterThan(scorebugZ);
  });
});

describe('PostGameScreen — primary action clears the bottom nav / home indicator', () => {
  it('renders the Back to Hub action with safe-area-aware bottom padding', () => {
    const html = renderToString(
      <PostGameScreen
        homeTeam={{ id: 1, abbr: 'HME', name: 'Home' }}
        awayTeam={{ id: 2, abbr: 'AWY', name: 'Away' }}
        homeScore={21}
        awayScore={14}
        userTeamId={1}
        onContinue={() => {}}
      />,
    );
    expect(html).toContain('Back to Hub');
    // The scroll container pads its bottom with the safe-area inset so the CTA
    // is never hidden behind the iOS home indicator / PWA chrome.
    expect(html).toMatch(/env\(safe-area-inset-bottom/);
  });
});
