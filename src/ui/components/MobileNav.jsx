/**
 * MobileNav.jsx — Mobile-first hamburger menu with slide-in overlay navigation
 *
 * Changes:
 *  - NEW FILE: Provides a bottom tab bar + hamburger slide-in panel for mobile
 *  - 44px minimum touch targets for all nav items (WCAG AA)
 *  - Smooth slide-in/out with backdrop overlay
 *  - Respects safe-area-inset for notched phones
 *  - Uses Tailwind utility classes + CSS custom properties for theming
 */

import React, { useState, useEffect, useRef } from 'react';

const NAV_SECTIONS = [
  { id: 'hub', label: 'Home', icon: HomeIcon },
  { id: 'standings', label: 'Standings', icon: StandingsIcon },
  { id: 'schedule', label: 'Schedule', icon: ScheduleIcon },
  { id: 'roster', label: 'Roster', icon: RosterIcon },
  { id: 'leaders', label: 'Leaders', icon: LeadersIcon },
  { id: 'free_agency', label: 'Free Agency', icon: FAIcon },
  { id: 'trades', label: 'Trades', icon: TradesIcon },
  { id: 'draft', label: 'Draft', icon: DraftIcon },
  { id: 'coaches', label: 'Coaches', icon: CoachesIcon },
  { id: 'financials', label: 'Finances', icon: FinancesIcon },
  { id: 'strategy', label: 'Strategy', icon: StrategyIcon },
  { id: 'news', label: 'News', icon: NewsIcon },
  { id: 'player_stats', label: 'Stats', icon: StatsIcon },
  { id: 'awards', label: 'Awards', icon: AwardsIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

// Bottom tab bar shows the 5 most-used tabs
const BOTTOM_TABS = ['hub', 'roster', 'standings', 'schedule', 'leaders'];

export default function MobileNav({ activeTab, onTabChange, league }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on tab change
  useEffect(() => {
    setMenuOpen(false);
  }, [activeTab]);

  // Close menu on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    if (menuOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const bottomTabs = NAV_SECTIONS.filter(s => BOTTOM_TABS.includes(s.id));

  return (
    <>
      {/* ── Hamburger Button (top-right, visible only on mobile) ── */}
      <button
        className="mobile-nav-hamburger"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
      >
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
      </button>

      {/* ── Slide-in Overlay Menu ── */}
      {menuOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        ref={menuRef}
        className={`mobile-nav-panel ${menuOpen ? 'open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="mobile-nav-header">
          <h2 className="mobile-nav-title">Football GM</h2>
          {league && (
            <p className="mobile-nav-subtitle">
              {league.year ?? league.seasonId} · {league.phase}
            </p>
          )}
        </div>
        <div className="mobile-nav-items">
          {NAV_SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = activeTab === section.id;
            return (
              <button
                key={section.id}
                className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onTabChange(section.id);
                  setMenuOpen(false);
                }}
              >
                <Icon size={20} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Bottom Tab Bar (mobile only) ── */}
      <div className="mobile-bottom-bar">
        {bottomTabs.map(section => {
          const Icon = section.icon;
          const isActive = activeTab === section.id;
          return (
            <button
              key={section.id}
              className={`mobile-bottom-tab ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(section.id)}
              aria-label={section.label}
            >
              <Icon size={22} />
              <span className="mobile-bottom-label">{section.label}</span>
            </button>
          );
        })}
        <button
          className={`mobile-bottom-tab ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="More tabs"
        >
          <MoreIcon size={22} />
          <span className="mobile-bottom-label">More</span>
        </button>
      </div>
    </>
  );
}

// ── SVG Icon Components (inline, no external deps) ──────────────────────────

function HomeIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function StandingsIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ScheduleIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function RosterIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LeadersIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function FAIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function TradesIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function DraftIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function CoachesIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
    </svg>
  );
}

function FinancesIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function StrategyIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function NewsIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <line x1="10" y1="6" x2="18" y2="6" /><line x1="10" y1="10" x2="18" y2="10" /><line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}

function StatsIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function AwardsIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  );
}

function HistoryIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function MoreIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  );
}
