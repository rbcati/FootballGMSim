import React, { useEffect, useMemo, useState } from 'react';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import LeagueLeaders from './LeagueLeaders.jsx';
import { buildNewsDeskModel } from '../utils/newsDesk.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { CompactListRow, ScreenHeader, SectionCard, StatusChip, StatStrip, StatPill } from './ScreenSystem.jsx';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';

const LEAGUE_SECTIONS = ['Overview', 'Results', 'Standings', 'News', 'Leaders'];

function normalizeSection(section) {
  if (typeof section !== 'string') return 'Overview';
  return LEAGUE_SECTIONS.find((entry) => entry.toLowerCase() === section.toLowerCase()) ?? 'Overview';
}

export default function LeagueHub({
  league,
  actions,
  initialSection = 'Overview',
  onOpenGameDetail,
  onPlayerSelect,
  renderStandings,
  renderResults,
}) {
  const [section, setSection] = useState(() => normalizeSection(initialSection));

  useEffect(() => {
    setSection(normalizeSection(initialSection));
  }, [initialSection]);

  const week = Number(league?.week ?? 1);
  const recap = useMemo(() => buildWeeklyLeagueRecap(league, { week }), [league, week]);
  const newsDesk = useMemo(() => buildNewsDeskModel(league, { segment: 'league', limit: 80 }), [league]);

  const transactionRows = useMemo(() => {
    return (newsDesk.transactions ?? []).slice(0, 8).map((item) => {
      const raw = `${item?.headline ?? ''} ${item?.body ?? ''}`.toLowerCase();
      const type = raw.includes('trade')
        ? 'Trade'
        : raw.includes('release') || raw.includes('waive')
          ? 'Release'
          : raw.includes('draft')
            ? 'Draft'
            : 'Signing';
      return { ...item, _txType: type };
    });
  }, [newsDesk.transactions]);

  const spotlightRows = recap?.spotlights ?? [];

  return (
    <div className="app-screen-stack league-hub">
      <ScreenHeader
        title="League Desk"
        subtitle="Global standings, weekly results, and league-wide pulse."
        eyebrow={`${league?.year ?? 'Season'} · Week ${league?.week ?? 1}`}
      />
      <SectionSubnav items={LEAGUE_SECTIONS} activeItem={section} onChange={setSection} />

      {section === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <SectionCard title="League Pulse" variant="compact">
            <div style={{ display: 'grid', gap: 10 }}>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 'var(--text-sm)' }}>
                {(recap?.bullets ?? []).slice(0, 3).map((bullet, idx) => <li key={`pulse-bullet-${idx}`}>{bullet}</li>)}
              </ul>
              {(recap?.bullets ?? []).length === 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  Weekly pulse unlocks after game results are final.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Race Center" variant="compact">
            <StatStrip>
              <StatPill
                label="Hottest"
                value={recap?.raceCenter?.hottest?.[0] ? `${recap.raceCenter.hottest[0].team?.abbr} (${recap.raceCenter.hottest[0].streak.length}W)` : "—"}
              />
              <StatPill
                label="Coldest"
                value={recap?.raceCenter?.coldest?.[0] ? `${recap.raceCenter.coldest[0].team?.abbr} (${recap.raceCenter.coldest[0].streak.length}L)` : "—"}
              />
              <StatPill
                label="Mover"
                value={recap?.raceCenter?.biggestMover?.change > 0 ? `${recap.raceCenter.biggestMover.team?.abbr} (+${recap.raceCenter.biggestMover.change})` : "Stable"}
              />
            </StatStrip>
          </SectionCard>

          {spotlightRows.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <h3 style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Spotlight Games</h3>
              {spotlightRows.slice(0, 2).map((spotlight, idx) => (
                <CompactListRow
                  key={spotlight.key ?? `spotlight-${idx}`}
                  title={spotlight.score ?? 'Spotlight Matchup'}
                  subtitle={spotlight.reason ?? 'High-stakes weekly game'}
                  meta={<StatusChip label={`Week ${spotlight.week ?? week}`} tone="league" />}
                >
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => openResolvedBoxScore(spotlight.game, { seasonId: league?.seasonId, week: spotlight.week ?? week, source: 'league_overview_spotlight' }, onOpenGameDetail)}
                  >
                    Open
                  </button>
                </CompactListRow>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'Results' && renderResults?.('League')}
      {section === 'Standings' && renderStandings?.()}

      {section === 'News' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <SectionCard title="Transaction Volume" variant="compact">
            <StatStrip>
              {['Trade', 'Signing', 'Release', 'Draft'].map((label) => (
                <StatPill
                  key={label}
                  label={label}
                  value={transactionRows.filter((row) => row?._txType === label).length}
                />
              ))}
            </StatStrip>
          </SectionCard>
          <SocialFeed league={league} defaultFilter="league" maxItems={12} onPlayerSelect={onPlayerSelect} />
        </div>
      )}

      {section === 'Leaders' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <LeagueLeaders league={league} actions={actions} onPlayerSelect={onPlayerSelect} />
        </div>
      )}
    </div>
  );
}
