import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SECTIONS = [
  { id: 'hq', label: 'HQ', icon: '🏠' },
  { id: 'team', label: 'Team', icon: '🛡️' },
  { id: 'league', label: 'League', icon: '🌍' },
  { id: 'news', label: 'News', icon: '🗞️' },
];

const MORE_GROUPS = [
  {
    title: 'Management',
    items: [
      { id: 'Roster', label: 'Roster' },
      { id: 'Weekly Prep', label: 'Game Plan' },
      { id: 'Financials', label: 'Financials' },
      { id: 'Coaches', label: 'Staff' },
    ],
  },
  {
    title: 'Transactions',
    items: [
      { id: 'Free Agency', label: 'Free Agency' },
      { id: 'Trades', label: 'Trade Center' },
      { id: 'Draft', label: 'Draft Board' },
    ],
  },
  {
    title: 'League Info',
    items: [
      { id: 'Standings', label: 'Standings' },
      { id: 'Weekly Results', label: 'Weekly Results' },
      { id: 'League:Leaders', label: 'Stats & Leaders' },
      { id: 'History Hub', label: 'Record Book' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'Saves', label: 'Save Manager' },
      { id: 'God Mode', label: 'Settings' },
    ],
  },
];

export default function MobileNav({
  activeSection,
  onSectionChange,
  onDestinationChange,
  onAdvance,
  advanceLabel,
  advanceDisabled,
  league,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const handleDestinationClick = (id) => {
    onDestinationChange(id);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* ── Slide-up "More" Drawer ── */}
      <div className={cn(
        "fixed inset-0 z-50 transition-all duration-300 pointer-events-none",
        isMoreOpen ? "opacity-100 pointer-events-auto" : "opacity-0"
      )}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMoreOpen(false)} />
        <div className={cn(
          "absolute bottom-0 left-0 right-0 bg-[color:var(--bg-secondary)] border-t border-[color:var(--hairline-strong)] rounded-t-2xl max-h-[85vh] overflow-y-auto transition-transform duration-300 ease-out p-4 pb-24",
          isMoreOpen ? "translate-y-0" : "translate-y-full"
        )}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-extrabold">Command Menu</h2>
            <button className="p-2 text-[color:var(--text-muted)]" onClick={() => setIsMoreOpen(false)}>✕</button>
          </div>

          <div className="grid gap-6">
            {MORE_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-widest text-[color:var(--text-subtle)] font-bold px-1">{group.title}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[color:var(--surface)] border border-[color:var(--hairline)] active:scale-[0.98] transition-transform text-sm font-semibold"
                      onClick={() => handleDestinationClick(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fixed Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[color:var(--bg-secondary)] border-t border-[color:var(--hairline-strong)] backdrop-blur-md bg-opacity-90 px-2 pb-[env(safe-area-inset-bottom)] pt-2 h-[calc(64px+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto flex items-center justify-around h-full">
          {SECTIONS.slice(0, 2).map((section) => (
            <button
              key={section.id}
              className={cn(
                "flex flex-col items-center gap-1 min-w-[56px] transition-colors",
                activeSection === section.id ? "text-[color:var(--accent)]" : "text-[color:var(--text-muted)]"
              )}
              onClick={() => onSectionChange(section.id)}
            >
              <span className="text-xl">{section.icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{section.label}</span>
            </button>
          ))}

          <div className="px-2">
             <Button
                variant="default"
                className="h-12 w-12 rounded-full p-0 shadow-lg shadow-[color:var(--accent-muted)] border-2 border-[color:var(--bg-secondary)]"
                onClick={onAdvance}
                disabled={advanceDisabled}
                title={advanceLabel}
              >
                <span className="text-xl">🏈</span>
              </Button>
          </div>

          {SECTIONS.slice(2, 4).map((section) => (
            <button
              key={section.id}
              className={cn(
                "flex flex-col items-center gap-1 min-w-[56px] transition-colors",
                activeSection === section.id ? "text-[color:var(--accent)]" : "text-[color:var(--text-muted)]"
              )}
              onClick={() => onSectionChange(section.id)}
            >
              <span className="text-xl">{section.icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{section.label}</span>
            </button>
          ))}

          <button
            className={cn(
              "flex flex-col items-center gap-1 min-w-[56px] transition-colors",
              isMoreOpen ? "text-[color:var(--accent)]" : "text-[color:var(--text-muted)]"
            )}
            onClick={() => setIsMoreOpen(true)}
          >
            <span className="text-xl">⋮</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
