import React, { useState, useEffect } from 'react';

const NAV_GROUPS = [
  {
    title: 'Team',
    items: [
      { id: 'weekly', label: 'Hub', icon: WeeklyHubIcon },
      { id: 'roster', label: 'Roster', icon: RosterIcon },
      { id: 'staff', label: 'Staff', icon: StaffIcon },
      { id: 'training', label: 'Training', icon: TrainingIcon },
      { id: 'injuries', label: 'Injuries', icon: InjuryIcon },
    ],
  },
  {
    title: 'Front Office',
    items: [
      { id: 'trade', label: 'Trades', icon: TradesIcon },
      { id: 'freeagency', label: 'Free Agency', icon: FAIcon },
      { id: 'draft', label: 'Draft', icon: DraftIcon },
      { id: 'cap', label: 'Finances', icon: FinancesIcon },
      { id: 'advisor', label: 'GM Advisor', icon: AdvisorIcon },
    ],
  },
  {
    title: 'League',
    items: [
      { id: 'standings', label: 'Standings', icon: StandingsIcon },
      { id: 'schedule', label: 'Schedule', icon: ScheduleIcon },
      { id: 'leaders', label: 'Leaders', icon: LeadersIcon },
      { id: 'home', label: 'League Home', icon: HomeIcon },
    ],
  },
];

const BOTTOM_TABS = [
  { id: 'weekly', label: 'Hub', icon: WeeklyHubIcon },
  { id: 'roster', label: 'Team', icon: RosterIcon },
  { id: 'standings', label: 'League', icon: StandingsIcon },
  { id: 'trade', label: 'Actions', icon: TradesIcon },
];

export default function MobileNav({ activeTab, onTabChange, league }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [activeTab]);

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

  const handleNavClick = (tabKey) => {
    onTabChange?.(tabKey);
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

      <nav className={`mobile-nav-panel ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="mobile-nav-header">
          <h2 className="mobile-nav-title">Franchise Command</h2>
          {league && <p className="mobile-nav-subtitle">{league.year ?? league.seasonId} · {league.phase}</p>}
        </div>

        <div className="mobile-nav-items grouped">
          {NAV_GROUPS.map((group) => (
            <section key={group.title} className="mobile-nav-group">
              <h3 className="mobile-nav-group-title">{group.title}</h3>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button key={item.id} className={`mobile-nav-item ${isActive ? 'active' : ''}`} onClick={() => handleNavClick(item.id)}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </nav>

      <div className="mobile-bottom-bar">
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} className={`mobile-bottom-tab ${isActive ? 'active' : ''}`} onClick={() => handleNavClick(tab.id)} aria-label={tab.label}>
              <Icon size={20} />
              <span className="mobile-bottom-label">{tab.label}</span>
            </button>
          );
        })}
        <button className={`mobile-bottom-tab ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">
          <MoreIcon size={20} />
          <span className="mobile-bottom-label">Menu</span>
        </button>
      </div>
    </>
  );
}

function WeeklyHubIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></svg>; }
function HomeIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-6h6v6" /></svg>; }
function StandingsIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 6h14M5 12h14M5 18h14" /></svg>; }
function RosterIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></svg>; }
function LeadersIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 17 6-6 4 4 8-8" /></svg>; }
function FAIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4v8M20 8h-8" /><circle cx="8" cy="8" r="4" /><path d="M2 21v-1a5 5 0 0 1 5-5h2" /></svg>; }
function TradesIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>; }
function DraftIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z" /><path d="M14 2v6h6" /></svg>; }
function StaffIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function TrainingIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 12 5-5 4 4 6-6 5 5" /><path d="M2 20h20" /></svg>; }
function InjuryIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 2v7l-2 2 8 8 2-2-8-8 2-2h7" /></svg>; }
function FinancesIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20" /><path d="M17 6H9a3 3 0 1 0 0 6h6a3 3 0 1 1 0 6H6" /></svg>; }
function AdvisorIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>; }
function MoreIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>; }
function ScheduleIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>; }
