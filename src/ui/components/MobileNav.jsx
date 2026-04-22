import React, { useState, useEffect } from 'react';
import { NAV_LABELS } from '../constants/navigationCopy.js';
import { SHELL_SECTIONS } from '../utils/shellNavigation.js';

const MORE_GROUPS = [
  {
    title: 'Team Management',
    items: [
      { id: 'Team:Overview', label: 'Team Hub', icon: HomeIcon },
      { id: 'Team:Roster / Depth', label: 'Roster / Depth', icon: RosterIcon },
      { id: 'Staff', label: 'Staff', icon: StaffIcon },
      { id: 'Training', label: 'Training', icon: TrainingIcon },
      { id: 'Injuries', label: 'Injuries', icon: InjuryIcon },
      { id: '💰 Cap', label: 'Cap / Financials', icon: FinancesIcon },
      { id: 'Contract Center', label: 'Contracts', icon: ContractIcon },
    ],
  },
  {
    title: 'League Office',
    items: [
      { id: 'League:Overview', label: 'League Hub', icon: StandingsIcon },
      { id: 'League:Results', label: 'Weekly Results', icon: StandingsIcon },
      { id: 'Transactions', label: 'Trades', icon: TradesIcon },
      { id: 'Free Agency', label: 'Free Agency', icon: FAIcon },
      { id: 'Draft', label: 'Draft', icon: DraftIcon },
      { id: 'league-leaders', label: 'League Leaders', icon: StandingsIcon },
      { id: 'History Hub', label: 'History', icon: HomeIcon },
      { id: 'Analytics', label: 'Analytics', icon: AnalyticsIcon },
      { id: 'Saves', label: 'Saves', icon: SaveIcon },
      { id: '🤖 GM Advisor', label: 'GM Advisor', icon: AdvisorIcon },
      { id: 'God Mode', label: 'God Mode', icon: GodModeIcon },
    ],
  },
];

const BOTTOM_TABS = [
  { id: 'Home', label: 'Home', icon: HomeIcon, action: 'section', value: SHELL_SECTIONS.hq },
  { id: 'Lineup', label: 'Lineup', icon: RosterIcon, action: 'destination', value: 'Team:Roster / Depth' },
  { id: 'Scouting', label: 'Scouting', icon: DraftIcon, action: 'destination', value: 'Weekly Prep' },
  { id: 'Office', label: 'Office', icon: StaffIcon, action: 'destination', value: 'Staff' },
];

export default function MobileNav({ activeSection, activeTab, onSectionChange, onDestinationChange, onAdvance, advanceLabel, advanceDisabled, league }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [activeSection]);

  useEffect(() => {
    const handleKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    if (menuOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const handleSectionClick = (sectionId) => {
    onSectionChange?.(sectionId);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleDestinationClick = (tab) => {
    onDestinationChange?.(tab);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <button className="mobile-nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation menu" aria-expanded={menuOpen}>
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
      </button>

      {menuOpen && <div className="mobile-nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <nav className={`mobile-nav-panel mobile-nav-panel-premium ${menuOpen ? 'open' : ''}`} aria-label="More navigation">
        <div className="mobile-nav-header">
          <h2 className="mobile-nav-title">Command Menu</h2>
          {league && <p className="mobile-nav-subtitle">{league.year ?? league.seasonId} · {league.phase}</p>}
        </div>

        <div className="mobile-nav-items grouped">
          {MORE_GROUPS.map((group) => (
            <section key={group.title} className="mobile-nav-group">
              <h3 className="mobile-nav-group-title">{group.title}</h3>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className="mobile-nav-item mobile-nav-item-premium" onClick={() => handleDestinationClick(item.id)}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </nav>

      <div className="mobile-bottom-bar premium-bottom-nav">
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = (tab.action === 'section' && activeSection === tab.value)
            || (tab.action === 'destination' && activeTab === tab.value);
          const onClick = () => (tab.action === 'section' ? handleSectionClick(tab.value) : handleDestinationClick(tab.value));
          return (
            <button key={tab.id} className={`mobile-bottom-tab premium-bottom-tab ${isActive ? 'active' : ''}`} onClick={onClick} aria-label={tab.label}>
              <Icon size={20} />
              <span className="mobile-bottom-label">{tab.label}</span>
            </button>
          );
        })}

        <button
          className="mobile-bottom-tab premium-bottom-tab mobile-bottom-tab-advance"
          onClick={onAdvance}
          disabled={advanceDisabled}
          aria-label={advanceLabel || 'Advance'}
        >
          <PlayIcon size={22} />
          <span className="mobile-bottom-label">{advanceLabel || 'Advance'}</span>
        </button>

        <button className={`mobile-bottom-tab premium-bottom-tab ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Open more menu">
          <MoreIcon size={20} />
          <span className="mobile-bottom-label">{NAV_LABELS.more}</span>
        </button>
      </div>
    </>
  );
}

function HomeIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-6h6v6" /></svg>; }
function StandingsIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 6h14M5 12h14M5 18h14" /></svg>; }
function RosterIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></svg>; }
function NewsIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h14a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>; }
function PlayIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z" /></svg>; }
function FAIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4v8M20 8h-8" /><circle cx="8" cy="8" r="4" /><path d="M2 21v-1a5 5 0 0 1 5-5h2" /></svg>; }
function TradesIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>; }
function DraftIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z" /><path d="M14 2v6h6" /></svg>; }
function StaffIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function TrainingIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 12 5-5 4 4 6-6 5 5" /><path d="M2 20h20" /></svg>; }
function InjuryIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 2v7l-2 2 8 8 2-2-8-8 2-2h7" /></svg>; }
function FinancesIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20" /><path d="M17 6H9a3 3 0 1 0 0 6h6a3 3 0 1 1 0 6H6" /></svg>; }
function AdvisorIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>; }
function ContractIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3h8l5 5v13H3V3z" /><path d="M8 3v5h5" /></svg>; }
function SaveIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /></svg>; }
function GodModeIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /></svg>; }
function AnalyticsIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>; }
function MoreIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>; }
