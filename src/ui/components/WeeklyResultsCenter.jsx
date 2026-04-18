import React, { useMemo, useState } from 'react';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { deriveCompactResultRecap, getGameLifecycleBucket, selectWeekGames } from '../utils/gameCenterResults.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import {
  CompactInsightCard,
  EmptyState,
  HeroCard,
  SectionCard,
  SectionHeader,
  StatStrip,
  StatusChip,
} from './ScreenSystem.jsx';

function normalizeTeam(team) {
  if (!team || typeof team !== 'object') return { abbr: '—', name: 'Unknown' };
  return { abbr: team.abbr ?? team.name ?? '—', name: team.name ?? team.abbr ?? 'Unknown' };
}

function formatPeriodLabel(game) {
  const quarterCount = Number(game?.quarterScores?.home?.length ?? game?.quarterScores?.away?.length ?? 0);
  if (quarterCount > 4) return `Final/OT${quarterCount - 4 > 1 ? quarterCount - 4 : ''}`;
  return 'Final';
}

function ResultRow({ row, seasonId, onGameSelect, source = 'weekly_results_center' }) {
  const presentation = buildCompletedGamePresentation(row.game, { seasonId, week: row.week, teamById: row.teamById, source });
  const clickable = Boolean(presentation.canOpen && onGameSelect);

  return (
    <article className="app-game-center-card card">
      <div className="app-game-center-card__top">
        <strong>Week {row.week}</strong>
        <StatusChip label={formatPeriodLabel(row.game)} tone="ok" />
      </div>
      <div className="app-game-center-card__scoreline">
        {row.away.abbr} {row.game?.awayScore ?? '—'} @ {row.home.abbr} {row.game?.homeScore ?? '—'}
      </div>
      <p className="app-game-center-card__summary">{row.recap}</p>
      <div className="app-game-center-card__footer">
        <button
          type="button"
          className="btn btn-sm"
          onClick={clickable ? () => openResolvedBoxScore(row.game, { seasonId, week: row.week, source }, onGameSelect) : undefined}
          disabled={!clickable}
          title={clickable ? (presentation?.ctaLabel ?? 'Open Game Book') : (presentation?.statusLabel ?? 'Archive unavailable')}
        >
          {clickable ? 'Open Game Book' : (presentation?.statusLabel ?? 'Archive unavailable')}
        </button>
      </div>
    </article>
  );
}

function LiveOrUpcomingRow({ row, label, tone = 'info' }) {
  return (
    <article className="app-game-center-card card is-compact">
      <div className="app-game-center-card__top">
        <strong>Week {row.week}</strong>
        <StatusChip label={label} tone={tone} />
      </div>
      <div className="app-game-center-card__scoreline">
        {row.away.abbr} @ {row.home.abbr}
      </div>
      <p className="app-game-center-card__summary">{row.recap}</p>
    </article>
  );
}

function SpotlightCard({ row, seasonId, onGameSelect }) {
  const presentation = buildCompletedGamePresentation(row.game, { seasonId, week: row.week, source: 'weekly_results_spotlight' });
  const clickable = Boolean(presentation.canOpen && onGameSelect);
  const awayId = Number(row?.game?.away?.id ?? row?.game?.away);
  const homeId = Number(row?.game?.home?.id ?? row?.game?.home);

  return (
    <article className="app-game-center-card card is-spotlight">
      <div className="app-game-center-card__top">
        <strong>Spotlight game</strong>
        <StatusChip label={`Score ${row.score}`} tone="warning" />
      </div>
      <div className="app-game-center-card__scoreline">
        {row.teamById[awayId]?.abbr ?? 'AWY'} {row.game?.awayScore ?? '—'} @ {row.teamById[homeId]?.abbr ?? 'HME'} {row.game?.homeScore ?? '—'}
      </div>
      <p className="app-game-center-card__summary">{row.reason}</p>
      <div className="app-game-center-card__footer">
        <button
          type="button"
          className="btn btn-sm"
          onClick={clickable ? () => openResolvedBoxScore(row.game, { seasonId, week: row.week, source: 'weekly_results_spotlight' }, onGameSelect) : undefined}
          disabled={!clickable}
        >
          {clickable ? 'Open spotlight' : (presentation?.statusLabel ?? 'Archive unavailable')}
        </button>
      </div>
    </article>
  );
}

export default function WeeklyResultsCenter({ league, initialWeek, onGameSelect }) {
  const totalWeeks = Number(league?.schedule?.weeks?.length ?? 0);
  const currentWeek = Number(initialWeek ?? league?.week ?? 1);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const teamById = useMemo(() => {
    const out = {};
    for (const team of league?.teams ?? []) out[Number(team?.id)] = team;
    return out;
  }, [league?.teams]);

  const selectedWeekGames = useMemo(() => {
    return selectWeekGames(league?.schedule, selectedWeek);
  }, [league?.schedule, selectedWeek]);

  const rows = useMemo(() => selectedWeekGames.map((game, idx) => {
    const homeId = Number(game?.home?.id ?? game?.home);
    const awayId = Number(game?.away?.id ?? game?.away);
    return {
      key: game?.id ?? game?.gameId ?? `${selectedWeek}-${homeId}-${awayId}-${idx}`,
      week: selectedWeek,
      game,
      away: normalizeTeam(teamById[awayId]),
      home: normalizeTeam(teamById[homeId]),
      recap: deriveCompactResultRecap(game, { awayTeam: teamById[awayId], homeTeam: teamById[homeId] }),
      bucket: getGameLifecycleBucket(game),
      teamById,
    };
  }), [selectedWeekGames, selectedWeek, teamById]);

  const completed = rows.filter((row) => row.bucket === 'completed');
  const live = rows.filter((row) => row.bucket === 'live');
  const upcoming = rows.filter((row) => row.bucket === 'upcoming');

  const leagueRecap = useMemo(() => buildWeeklyLeagueRecap(league, { week: selectedWeek }), [league, selectedWeek]);
  const spotlightRows = useMemo(() => leagueRecap.spotlights.map((spotlight) => ({ ...spotlight, teamById })), [leagueRecap.spotlights, teamById]);

  if (!totalWeeks) {
    return <EmptyState title="No schedule data available for weekly results." body="Weekly game center will populate when league schedule weeks are present." />;
  }

  return (
    <div className="app-screen-stack">
      <HeroCard
        eyebrow="Game Center"
        title="Weekly Results"
        subtitle="Track finals, live windows, and upcoming slates from one command view."
        rightMeta={<StatusChip label={`Week ${selectedWeek}`} tone="info" />}
        actions={(
          <div className="app-weekly-results-nav">
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))} disabled={selectedWeek <= 1}>Prev</button>
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.min(totalWeeks, w + 1))} disabled={selectedWeek >= totalWeeks}>Next</button>
          </div>
        )}
      >
        <StatStrip
          items={[
            { label: 'Completed', value: completed.length, tone: 'ok' },
            { label: 'Live', value: live.length, tone: live.length ? 'warning' : 'neutral' },
            { label: 'Upcoming', value: upcoming.length, tone: 'info' },
            { label: 'Games', value: rows.length, tone: 'neutral' },
          ]}
        />
        {leagueRecap.bullets[0] ? (
          <CompactInsightCard
            title="Featured weekly recap"
            subtitle={leagueRecap.bullets[0]}
            tone="info"
          />
        ) : null}
      </HeroCard>

      {leagueRecap.bullets.length > 0 && (
        <SectionCard
          title="Weekly League Recap"
          subtitle="Race center trends, movement, and macro context from this week."
          variant="info"
        >
          <div className="app-weekly-results-recap-grid">
            <div className="app-weekly-results-bullets">
              {leagueRecap.bullets.map((bullet, idx) => (
                <CompactInsightCard key={`bullet-${idx}`} title={bullet} tone="info" />
              ))}
            </div>
            <div className="app-weekly-results-bullets">
              <CompactInsightCard
                title="Race center"
                subtitle={`Hottest: ${leagueRecap.raceCenter.hottest[0] ? `${leagueRecap.raceCenter.hottest[0].team?.abbr ?? leagueRecap.raceCenter.hottest[0].team?.name} (${leagueRecap.raceCenter.hottest[0].streak.length}W)` : '—'}`}
                tone="ok"
              />
              <CompactInsightCard
                title="Playoff pressure"
                subtitle={`Coldest: ${leagueRecap.raceCenter.coldest[0] ? `${leagueRecap.raceCenter.coldest[0].team?.abbr ?? leagueRecap.raceCenter.coldest[0].team?.name} (${leagueRecap.raceCenter.coldest[0].streak.length}L)` : '—'}`}
                tone="warning"
              />
              <CompactInsightCard
                title="Biggest mover"
                subtitle={leagueRecap.raceCenter.biggestMover?.change > 0
                  ? `${leagueRecap.raceCenter.biggestMover.team?.abbr ?? leagueRecap.raceCenter.biggestMover.team?.name} (+${leagueRecap.raceCenter.biggestMover.change})`
                  : 'No major move'}
                tone="info"
              />
              <CompactInsightCard
                title="Bubble context"
                subtitle={leagueRecap.raceCenter.bubble
                  ? `${(leagueRecap.raceCenter.bubble.gap * 100).toFixed(1)} pct gap`
                  : 'Bubble context unlocks as standings deepen.'}
                tone="info"
              />
            </div>
          </div>
        </SectionCard>
      )}

      {spotlightRows.length > 0 && (
        <section className="app-screen-stack">
          <SectionHeader title="Weekly Spotlight" subtitle="High-leverage finals and headline outcomes." />
          <div className="app-weekly-results-grid">
            {spotlightRows.map((row) => <SpotlightCard key={row.key} row={row} seasonId={league?.seasonId} onGameSelect={onGameSelect} />)}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="app-screen-stack">
          <SectionHeader title="Completed" subtitle="Finals available to open in Game Book." />
          <div className="app-weekly-results-grid">
            {completed.map((row) => <ResultRow key={row.key} row={row} seasonId={league?.seasonId} onGameSelect={onGameSelect} />)}
          </div>
        </section>
      )}

      {live.length > 0 && (
        <section className="app-screen-stack">
          <SectionHeader title="In progress" subtitle="Live windows and in-flight game scripts." />
          <div className="app-weekly-results-grid">
            {live.map((row) => <LiveOrUpcomingRow key={row.key} row={row} label="Live" tone="warning" />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="app-screen-stack">
          <SectionHeader title="Upcoming" subtitle="Scheduled matchups waiting to kick off." />
          <div className="app-weekly-results-grid">
            {upcoming.map((row) => <LiveOrUpcomingRow key={row.key} row={row} label="Upcoming" tone="info" />)}
          </div>
        </section>
      )}

      {rows.length === 0 ? <EmptyState title={`No games scheduled for week ${selectedWeek}.`} body="Try another week to view slate and recap context." /> : null}
    </div>
  );
}
