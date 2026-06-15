import React, { useEffect, useMemo, useState } from 'react';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import LeagueLeaders from './LeagueLeaders.jsx';
import { buildNewsDeskModel } from '../utils/newsDesk.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { CompactListRow, StatusChip, HeroCard, SectionCard, StatStrip, CompactInsightCard } from './ScreenSystem.jsx';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';

const LEAGUE_SECTIONS = ['Overview', 'Results', 'Standings', 'News', 'Leaders', 'Coaching'];

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
      <HeroCard
        eyebrow={`${league?.year ?? 'Season'} · Week ${league?.week ?? 1}`}
        title="League Command Center"
        subtitle="Results, standings pressure, league activity, and leaders."
        rightMeta={<StatusChip label={section} tone="league" />}
      >
        <StatStrip items={[
          { label: 'Spotlights', value: `${spotlightRows.length}`, tone: 'league' },
          { label: 'Trades', value: `${transactionRows.filter((row) => row?._txType === 'Trade').length}`, tone: 'info' },
          { label: 'Signings', value: `${transactionRows.filter((row) => row?._txType === 'Signing').length}`, tone: 'neutral' },
          { label: 'Releases', value: `${transactionRows.filter((row) => row?._txType === 'Release').length}`, tone: transactionRows.some((row) => row?._txType === 'Release') ? 'warning' : 'neutral' },
        ]} />
      </HeroCard>

      <SectionSubnav items={LEAGUE_SECTIONS} activeItem={section} onChange={setSection} />

      {section === 'Overview' && (
        <div className="app-screen-stack">
          <SectionCard title="League pulse" subtitle="What changed this week." variant="compact">
            <div className="app-row-stack">
              {(recap?.bullets ?? []).slice(0, 3).map((bullet, idx) => (
                <CompactInsightCard key={`overview-bullet-${idx}`} title={bullet} tone="info" />
              ))}
              {(recap?.bullets ?? []).length === 0 ? <CompactInsightCard title="Pulse unlocks after results" subtitle="Complete games to populate weekly pulse and race context." tone="info" /> : null}
            </div>
          </SectionCard>

          <SectionCard title="Standings pressure" variant="compact">
            <StatStrip items={[
              {
                label: 'Hottest',
                value: recap?.raceCenter?.hottest?.[0]
                  ? `${recap.raceCenter.hottest[0].team?.abbr ?? recap.raceCenter.hottest[0].team?.name} (${recap.raceCenter.hottest[0].streak.length}W)`
                  : '—',
                tone: 'ok',
              },
              {
                label: 'Coldest',
                value: recap?.raceCenter?.coldest?.[0]
                  ? `${recap.raceCenter.coldest[0].team?.abbr ?? recap.raceCenter.coldest[0].team?.name} (${recap.raceCenter.coldest[0].streak.length}L)`
                  : '—',
                tone: 'warning',
              },
              {
                label: 'Mover',
                value: recap?.raceCenter?.biggestMover?.change > 0
                  ? `${recap.raceCenter.biggestMover.team?.abbr ?? recap.raceCenter.biggestMover.team?.name} (+${recap.raceCenter.biggestMover.change})`
                  : 'No major move',
                tone: 'league',
              },
            ]} />
          </SectionCard>

          {spotlightRows.length > 0 && (
            <SectionCard title="Spotlight games" variant="compact">
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
            </SectionCard>
          )}
        </div>
      )}

      {section === 'Results' && renderResults?.('League')}
      {section === 'Standings' && renderStandings?.()}

      {section === 'News' && (
        <div className="app-screen-stack">
          <SectionCard title="League activity" subtitle="Transaction mix this week." variant="compact">
            <StatStrip items={['Trade', 'Signing', 'Release', 'Draft'].map((label) => ({
              label,
              value: `${transactionRows.filter((row) => row?._txType === label).length}`,
              tone: label === 'Release' ? 'warning' : 'league',
            }))} />
          </SectionCard>
          <SocialFeed league={league} defaultFilter="league" maxItems={12} onPlayerSelect={onPlayerSelect} />
        </div>
      )}

      {section === 'Leaders' && (
        <div className="app-screen-stack">
          <SectionCard title="League leaders" subtitle="Season production and race snapshots." variant="compact" />
          <LeagueLeaders league={league} actions={actions} onPlayerSelect={onPlayerSelect} />
        </div>
      )}

      {section === 'Coaching' && (
        <CoachingCarouselPanel league={league} />
      )}
    </div>
  );
}

function CoachingCarouselPanel({ league }) {
  const phase = league?.phase ?? 'regular';
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const coachingMarket = Array.isArray(league?.coachingMarket) ? league.coachingMarket : [];

  const offseasonPhases = ['offseason', 'offseason_resign', 'offseason_draft', 'free_agency', 'preseason', 'draft'];
  const isOffseason = offseasonPhases.includes(phase);

  const hotSeatTeams = teams.filter((t) => t?.coachHotSeat);

  return (
    <div className="app-screen-stack">
      <SectionCard
        title="Coaching Carousel"
        subtitle={isOffseason ? 'Hot seats and coaching market this offseason.' : 'Coaching carousel data available during the offseason.'}
        variant="compact"
      >
        {!isOffseason && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-2) 0' }}>
            Coaching changes are processed at the end of each season.
          </div>
        )}
      </SectionCard>

      {hotSeatTeams.length > 0 && (
        <SectionCard title="Hot seat coaches" subtitle="Coaches at risk of being fired." variant="compact">
          <div className="app-row-stack">
            {hotSeatTeams.map((team) => (
              <CompactListRow
                key={team.id}
                title={`${team.name ?? team.abbr}`}
                subtitle={team.coachHCName ? `HC: ${team.coachHCName}` : 'Head Coach'}
                meta={
                  <StatusChip
                    label={`OVR ${team.coachHCRating ?? '—'}`}
                    tone={team.coachHCRating >= 65 ? 'info' : 'warning'}
                  />
                }
              >
                <StatusChip label="HOT SEAT" tone="danger" />
              </CompactListRow>
            ))}
          </div>
        </SectionCard>
      )}

      {hotSeatTeams.length === 0 && isOffseason && (
        <SectionCard title="Hot seat coaches" variant="compact">
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-2) 0' }}>
            No coaches currently on the hot seat.
          </div>
        </SectionCard>
      )}

      {isOffseason && coachingMarket.length > 0 && (
        <SectionCard title="Coaching market" subtitle={`${coachingMarket.length} coaches available`} variant="compact">
          <div className="app-row-stack">
            {coachingMarket.slice(0, 6).map((coach) => (
              <CompactInsightCard
                key={coach.id ?? coach.name}
                title={coach.name ?? 'Unknown'}
                subtitle={`OVR ${coach.overallRating ?? coach.rating ?? '—'} · ${coach.scheme ?? '—'}`}
                tone={coach.overallRating >= 75 ? 'ok' : coach.overallRating >= 60 ? 'info' : 'neutral'}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
