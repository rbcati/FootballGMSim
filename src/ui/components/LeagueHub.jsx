import React, { useEffect, useMemo, useState } from 'react';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import LeagueLeaders from './LeagueLeaders.jsx';
import { buildNewsDeskModel } from '../utils/newsDesk.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { CompactListRow, ScreenHeader, StatusChip } from './ScreenSystem.jsx';
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
    <div className="app-screen-stack">
      <ScreenHeader
        title="League Command Center"
        subtitle="League-wide overview, results, standings pressure, news, and leaders."
        eyebrow={`${league?.year ?? 'Season'} · Week ${league?.week ?? 1}`}
      />
      <SectionSubnav items={LEAGUE_SECTIONS} activeItem={section} onChange={setSection} />

      {section === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <section className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>League Pulse</h3>
              <StatusChip label="Overview" tone="league" />
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {(recap?.bullets ?? []).slice(0, 3).map((bullet, idx) => <li key={`overview-bullet-${idx}`}>{bullet}</li>)}
            </ul>
            {(recap?.bullets ?? []).length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Weekly pulse unlocks once completed game results are available.
              </div>
            ) : null}
          </section>

          <section className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 6 }}>
            <h3 style={{ margin: 0 }}>Standings pressure</h3>
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hottest</div>
                <div style={{ fontWeight: 700 }}>
                  {recap?.raceCenter?.hottest?.[0]
                    ? `${recap.raceCenter.hottest[0].team?.abbr ?? recap.raceCenter.hottest[0].team?.name} (${recap.raceCenter.hottest[0].streak.length}W)`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coldest</div>
                <div style={{ fontWeight: 700 }}>
                  {recap?.raceCenter?.coldest?.[0]
                    ? `${recap.raceCenter.coldest[0].team?.abbr ?? recap.raceCenter.coldest[0].team?.name} (${recap.raceCenter.coldest[0].streak.length}L)`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mover</div>
                <div style={{ fontWeight: 700 }}>
                  {recap?.raceCenter?.biggestMover?.change > 0
                    ? `${recap.raceCenter.biggestMover.team?.abbr ?? recap.raceCenter.biggestMover.team?.name} (+${recap.raceCenter.biggestMover.change})`
                    : 'No major move'}
                </div>
              </div>
            </div>
          </section>

          {spotlightRows.length > 0 && (
            <section style={{ display: 'grid', gap: 6 }}>
              <h3 style={{ margin: 0 }}>Spotlight games</h3>
              {spotlightRows.slice(0, 2).map((spotlight, idx) => (
                <CompactListRow
                  key={spotlight.key ?? `spotlight-${idx}`}
                  title={spotlight.score ?? 'Spotlight game'}
                  subtitle={spotlight.reason ?? 'Weekly spotlight game'}
                  meta={<StatusChip label={`Week ${spotlight.week ?? week}`} tone="league" />}
                >
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openResolvedBoxScore(spotlight.game, { seasonId: league?.seasonId, week: spotlight.week ?? week, source: 'league_overview_spotlight' }, onOpenGameDetail)}
                  >
                    Open spotlight
                  </button>
                </CompactListRow>
              ))}
            </section>
          )}
        </div>
      )}

      {section === 'Results' && renderResults?.('League')}
      {section === 'Standings' && renderStandings?.()}

      {section === 'News' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <section className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>League activity center</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {['Trade', 'Signing', 'Release', 'Draft'].map((label) => (
                <div key={label} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{transactionRows.filter((row) => row?._txType === label).length}</div>
                </div>
              ))}
            </div>
          </section>
          <SocialFeed league={league} defaultFilter="league" maxItems={12} onPlayerSelect={onPlayerSelect} />
        </div>
      )}

      {section === 'Leaders' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <section className="card" style={{ padding: 'var(--space-3)' }}>
            <h3 style={{ margin: 0 }}>League leaders</h3>
            <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Season production leaders and race snapshots across the league.
            </div>
          </section>
          <LeagueLeaders league={league} actions={actions} onPlayerSelect={onPlayerSelect} />
        </div>
      )}
    </div>
  );
}
