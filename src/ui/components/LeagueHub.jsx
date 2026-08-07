import React, { useEffect, useMemo, useState } from 'react';
import SectionSubnav from './SectionSubnav.jsx';
import SocialFeed from './SocialFeed.jsx';
import LeagueLeaders from './LeagueLeaders.jsx';
import { buildNewsDeskModel } from '../utils/newsDesk.js';
import { buildLeagueSeasonPulse } from '../utils/leagueSeasonPulse.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { CompactListRow, StatusChip, HeroCard, SectionCard, StatStrip, CompactInsightCard } from './ScreenSystem.jsx';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { buildTradeDeadlineContext } from '../../core/tradeDeadlineContext.js';

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
  onNavigateTrade,
}) {
  const [section, setSection] = useState(() => normalizeSection(initialSection));

  useEffect(() => {
    setSection(normalizeSection(initialSection));
  }, [initialSection]);

  const week = Number(league?.week ?? 1);
  const seasonPulse = useMemo(() => buildLeagueSeasonPulse({ league, week }), [league, week]);
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
  const userTeam = (league?.teams ?? []).find((team) => String(team?.id) === String(league?.userTeamId));
  const tradeDeadline = useMemo(() => buildTradeDeadlineContext({ league, team: userTeam, roster: userTeam?.roster }), [league, userTeam]);

  return (
    <div className="app-screen-stack">
      <HeroCard
        eyebrow={`${league?.year ?? 'Season'} · Week ${league?.week ?? 1}`}
        title="League Season Pulse"
        subtitle="What matters around the league right now."
        rightMeta={<StatusChip label={section} tone="league" />}
      >
        <StatStrip items={[
          { label: 'Stories', value: `${seasonPulse.headlineStories.length}`, tone: 'league' },
          { label: 'Trades', value: `${transactionRows.filter((row) => row?._txType === 'Trade').length}`, tone: 'info' },
          { label: 'Signings', value: `${transactionRows.filter((row) => row?._txType === 'Signing').length}`, tone: 'neutral' },
          { label: 'Releases', value: `${transactionRows.filter((row) => row?._txType === 'Release').length}`, tone: transactionRows.some((row) => row?._txType === 'Release') ? 'warning' : 'neutral' },
        ]} />
      </HeroCard>

      <SectionSubnav items={LEAGUE_SECTIONS} activeItem={section} onChange={setSection} />

      {section === 'Overview' && (
        <div className="app-screen-stack">
          {tradeDeadline.deadline.deadlineActive && <TradeDeadlineSection context={tradeDeadline} onNavigateTrade={onNavigateTrade} />}
          {seasonPulse.availableData.headlines && <SectionCard title="Around the League" subtitle={`The most meaningful recorded results from Week ${seasonPulse.week}.`} variant="compact">
            <div className="app-row-stack">
              {seasonPulse.headlineStories.map((story) => (
                <CompactInsightCard key={story.key} title={story.text} tone="info" />
              ))}
            </div>
          </SectionCard>}

          {seasonPulse.availableData.trends && <SectionCard title="Trending Teams" subtitle="Only established multi-game runs are shown." variant="compact">
            <div className="app-row-stack">{seasonPulse.trendingTeams.map((trend) => <CompactListRow key={`${trend.label}-${trend.teamId}`} title={trend.reason} subtitle={trend.label} meta={<StatusChip label={trend.value} tone={trend.label === 'Losing streak' ? 'warning' : 'ok'} />} />)}</div>
          </SectionCard>}

          {seasonPulse.availableData.awards && <SectionCard title="Award Watch" subtitle="Leaders from the league's recorded award boards." variant="compact">
            <div className="app-row-stack">{seasonPulse.awardWatch.map((award) => <CompactListRow key={award.award} title={award.playerName} subtitle={[award.position, award.team].filter(Boolean).join(' · ')} meta={<StatusChip label={award.award} tone="league" />} />)}</div>
          </SectionCard>}

          {seasonPulse.availableData.injuries && <SectionCard title="League Health" subtitle="Longest active recorded absences." variant="compact">
            <div className="app-row-stack">{seasonPulse.majorInjuries.map((injury) => <CompactListRow key={injury.playerId} title={injury.playerName} subtitle={[injury.position, injury.injury].filter(Boolean).join(' · ')} meta={<StatusChip label={`${injury.weeksRemaining} wk${injury.weeksRemaining === 1 ? '' : 's'}`} tone="warning" />} />)}</div>
          </SectionCard>}

          {seasonPulse.availableData.standings && <SectionCard title="Standings Context" subtitle={seasonPulse.omittedReasons.standingsMovement ?? 'Recorded movement this week.'} variant="compact">
            <div className="app-row-stack">{seasonPulse.standingsImpact.slice(0, 4).map((item) => <CompactInsightCard key={item.key ?? `${item.type}-${item.teamId}`} title={item.text} tone="league" />)}</div>
          </SectionCard>}

          {seasonPulse.nextWeekHighlight && <SectionCard title="Next Week" subtitle="One matchup selected by stable, factual rules." variant="compact">
            <CompactListRow title={`${seasonPulse.nextWeekHighlight.awayTeam} at ${seasonPulse.nextWeekHighlight.homeTeam}`} subtitle={seasonPulse.nextWeekHighlight.reason} meta={<StatusChip label={`Week ${seasonPulse.nextWeekHighlight.week}`} tone="info" />} />
          </SectionCard>}

          {spotlightRows.length > 0 && <SectionCard title="Spotlight Games" subtitle="Open a recorded weekly result in Game Book." variant="compact">
            <div className="app-row-stack">{spotlightRows.slice(0, 2).map((spotlight, index) => <CompactListRow
              key={spotlight.key ?? `spotlight-${index}`}
              title={spotlight.score ?? 'Spotlight game'}
              subtitle={spotlight.reason ?? 'Weekly spotlight game'}
              meta={<StatusChip label={`Week ${spotlight.week ?? seasonPulse.week ?? week}`} tone="league" />}
            >
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openResolvedBoxScore(spotlight.game, { seasonId: league?.seasonId, week: spotlight.week ?? seasonPulse.week ?? week, source: 'league_overview_spotlight' }, onOpenGameDetail)}
              >
                Open Game
              </button>
            </CompactListRow>)}</div>
          </SectionCard>}

          {!Object.values(seasonPulse.availableData).some(Boolean) && <SectionCard title="Season Pulse" variant="compact"><CompactInsightCard title="No league pulse is available yet" subtitle="Complete games to unlock factual weekly context." tone="info" /></SectionCard>}

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

function ordinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
}

function TradeDeadlineSection({ context, onNavigateTrade }) {
  const { deadline, teamContext, reviewCandidates } = context;
  const record = teamContext?.record;
  const teamSummary = [
    record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : null,
    teamContext?.divisionPosition ? `${ordinal(teamContext.divisionPosition)} in division` : null,
    teamContext?.streak ? `${teamContext.streak.length}-game ${teamContext.streak.result === 'W' ? 'winning' : 'losing'} streak` : null,
  ].filter(Boolean).join(' · ');
  return <SectionCard
    title="Trade Deadline"
    subtitle={`Week ${deadline.currentWeek} · ${deadline.weeksUntilDeadline === 0 ? 'Deadline week' : `${deadline.weeksUntilDeadline} week${deadline.weeksUntilDeadline === 1 ? '' : 's'} remaining`}`}
    variant="compact"
  >
    <div className="app-row-stack" data-testid="trade-deadline-context">
      {teamSummary && <CompactInsightCard title="Your context" subtitle={teamSummary} tone="league" />}
      {reviewCandidates.length ? reviewCandidates.map((candidate) => <CompactListRow
        key={candidate.playerId}
        title={candidate.name}
        subtitle={[candidate.position, ...candidate.reasons].filter(Boolean).join(' · ')}
        meta={<StatusChip label={`Value ${candidate.tradeValue}`} tone="info" />}
      >
        <button type="button" className="btn btn-sm" onClick={() => onNavigateTrade?.()}>Review Trade</button>
      </CompactListRow>) : <CompactInsightCard title="No roster decisions currently require trade review." tone="info" />}
      <button type="button" className="btn" onClick={() => onNavigateTrade?.()}>Open Trade Center</button>
    </div>
  </SectionCard>;
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
