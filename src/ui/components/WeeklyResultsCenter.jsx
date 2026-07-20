import React, { useEffect, useMemo, useState } from 'react';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { deriveCompactResultRecap, getGameLifecycleBucket, resolveDefaultResultsWeek, selectWeekGames } from '../utils/gameCenterResults.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { buildWeeklyDecisionImpact } from '../utils/weeklyDecisionImpact.js';
import { buildBoxScoreViewModel } from '../utils/boxScoreViewModel.js';
import { getTopPerformers } from '../utils/gameBookHighlights.js';
import { hasValidPlayerProfileId, openPlayerProfile } from '../utils/playerProfileNavigation.js';
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
  // Canonical-ledger games publish no quarter table (#1700), so detect overtime
  // from the honest event flag instead of a fabricated quarter count.
  const events = Array.isArray(game?.canonicalEvents) ? game.canonicalEvents : [];
  if (events.some((e) => e && e.isOvertime)) return 'Final/OT';
  return 'Final';
}

function ResultRow({ row, seasonId, onGameSelect, source = 'weekly_results_center' }) {
  const presentation = buildCompletedGamePresentation(row.game, { seasonId, week: row.week, teamById: row.teamById, source });
  const vm = buildBoxScoreViewModel({ game: row.game, gameId: presentation.resolvedGameId, league: { teams: Object.values(row.teamById ?? {}) }, context: { season: seasonId, week: row.week } });
  const performers = getTopPerformers(vm);
  const margin = Number(vm?.margin);
  const contextLabel = Number.isFinite(margin)
    ? (margin <= 3 ? 'Close game' : margin >= 17 ? 'Blowout' : `${margin}-point margin`)
    : 'Final';
  const clickable = Boolean(presentation.canOpen && onGameSelect);

  return (
    <article className="app-game-center-card card">
      <div className="app-game-center-card__top">
        <strong>Week {row.week}</strong>
        <StatusChip label={formatPeriodLabel(row.game)} tone="ok" />
      </div>
      <div className="app-game-center-card__scoreline">
        {vm?.finalScoreLine ?? `${row.away.abbr} ${row.game?.awayScore ?? '—'} @ ${row.home.abbr} ${row.game?.homeScore ?? '—'}`}
      </div>
      <div className="app-game-center-context-strip" aria-label="Game quick context">
        <span>{contextLabel}</span>
        <span>{presentation.statusLabel}</span>
        <span>{performers.hasOffense ? performers.offense : 'Top player unavailable'}</span>
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
        <StatusChip label={presentation.statusLabel} tone={presentation.archiveQuality === 'full' ? 'ok' : presentation.archiveQuality === 'partial' ? 'info' : 'neutral'} />
      </div>
    </article>
  );
}


function TopPerformerCard({ title, performer, player, tone, onPlayerSelect, context }) {
  if (hasValidPlayerProfileId(player?.playerId) && onPlayerSelect) {
    return (
      <button
        type="button"
        className="app-compact-insight app-compact-insight--button"
        data-testid="weekly-results-top-performer-link"
        onClick={() => openPlayerProfile(player.playerId, onPlayerSelect, { ...context, player, statLine: player?.stats })}
      >
        <span>{title}</span>
        <strong>{performer}</strong>
      </button>
    );
  }
  return <CompactInsightCard title={title} subtitle={performer} tone={tone} />;
}

function formatRecord(team) {
  if (!team) return 'Record unavailable';
  const wins = Number(team.wins ?? 0);
  const losses = Number(team.losses ?? 0);
  const ties = Number(team.ties ?? 0);
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return 'Record unavailable';
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function buildUserTeamResult(row, userTeamId) {
  if (!row || userTeamId == null) return null;
  const homeId = Number(row?.game?.home?.id ?? row?.game?.home);
  const awayId = Number(row?.game?.away?.id ?? row?.game?.away);
  const isUserHome = homeId === Number(userTeamId);
  const isUserAway = awayId === Number(userTeamId);
  if (!isUserHome && !isUserAway) return null;
  const opponent = isUserHome ? row.away : row.home;
  const userScore = Number(isUserHome ? row?.game?.homeScore : row?.game?.awayScore);
  const oppScore = Number(isUserHome ? row?.game?.awayScore : row?.game?.homeScore);
  const outcome = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';
  return {
    ...row,
    opponent,
    isHome: isUserHome,
    userScore,
    oppScore,
    outcome,
    prepImpact: row?.game?.prepImpact?.[isUserHome ? 'home' : 'away'] ?? null,
  };
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

function normalizeRecentResultGame(result, { seasonId, fallbackWeek } = {}) {
  if (!result || typeof result !== 'object') return null;
  const homeId = Number(result?.homeId ?? result?.homeTeamId ?? result?.home?.id ?? result?.home);
  const awayId = Number(result?.awayId ?? result?.awayTeamId ?? result?.away?.id ?? result?.away);
  const homeScore = Number(result?.homeScore ?? result?.scoreHome ?? result?.score?.home);
  const awayScore = Number(result?.awayScore ?? result?.scoreAway ?? result?.score?.away);
  const week = Number(result?.week ?? fallbackWeek);
  if (!Number.isFinite(homeId) || !Number.isFinite(awayId) || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }
  return {
    ...result,
    gameId: result?.gameId ?? result?.id,
    seasonId: result?.seasonId ?? seasonId,
    week: Number.isFinite(week) ? week : fallbackWeek,
    home: homeId,
    away: awayId,
    homeId,
    awayId,
    homeScore,
    awayScore,
    played: true,
    summary: result?.summary ?? (result?.recapText ? { storyline: result.recapText } : undefined),
    recap: result?.recap ?? result?.recapText,
  };
}

function isSameMatchup(a, b) {
  if (!a || !b) return false;
  const aId = a?.gameId ?? a?.id;
  const bId = b?.gameId ?? b?.id;
  if (aId && bId && String(aId) === String(bId)) return true;
  const aHome = Number(a?.homeId ?? a?.home);
  const aAway = Number(a?.awayId ?? a?.away);
  const bHome = Number(b?.homeId ?? b?.home);
  const bAway = Number(b?.awayId ?? b?.away);
  return Number.isFinite(aHome)
    && Number.isFinite(aAway)
    && aHome === bHome
    && aAway === bAway;
}

function mergeRecentResultsIntoWeekGames(scheduleGames, recentGames) {
  if (!recentGames.length) return scheduleGames;
  const usedRecent = new Set();
  const merged = scheduleGames.map((game) => {
    const matchIndex = recentGames.findIndex((recent) => isSameMatchup(game, recent));
    if (matchIndex < 0) return game;
    usedRecent.add(matchIndex);
    const recent = recentGames[matchIndex];
    return {
      ...game,
      ...recent,
      id: game?.id ?? recent?.id,
      gameId: recent?.gameId ?? game?.gameId ?? game?.id,
      home: game?.home ?? recent?.home,
      away: game?.away ?? recent?.away,
    };
  });
  for (let index = 0; index < recentGames.length; index += 1) {
    if (!usedRecent.has(index)) merged.push(recentGames[index]);
  }
  return merged;
}

export default function WeeklyResultsCenter({ league, initialWeek = null, lastResults = [], lastSimWeek = null, onGameSelect, onNavigate, onPlayerSelect }) {
  const totalWeeks = Number(league?.schedule?.weeks?.length ?? 0);
  const recentResultsWeek = useMemo(() => {
    const parsed = Number(lastSimWeek ?? (Number(league?.week) - 1));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  }, [lastSimWeek, league?.week]);
  const recentResultGames = useMemo(() => {
    if (!Array.isArray(lastResults) || !recentResultsWeek) return [];
    return lastResults
      .map((result) => normalizeRecentResultGame(result, { seasonId: league?.seasonId, fallbackWeek: recentResultsWeek }))
      .filter(Boolean);
  }, [lastResults, league?.seasonId, recentResultsWeek]);
  const resolvedWeek = useMemo(() => {
    const parsedInitialWeek = Number(initialWeek);
    if (Number.isFinite(parsedInitialWeek) && parsedInitialWeek >= 1) return parsedInitialWeek;
    if (recentResultGames.length && recentResultsWeek) return recentResultsWeek;
    return resolveDefaultResultsWeek(league?.schedule, { initialWeek, currentWeek: league?.week });
  }, [initialWeek, league?.schedule, league?.week, recentResultGames.length, recentResultsWeek]);
  const [selectedWeek, setSelectedWeek] = useState(resolvedWeek);
  useEffect(() => { setSelectedWeek(resolvedWeek); }, [resolvedWeek]);

  const teamById = useMemo(() => {
    const out = {};
    for (const team of league?.teams ?? []) out[Number(team?.id)] = team;
    return out;
  }, [league?.teams]);

  const selectedWeekGames = useMemo(() => {
    const scheduleGames = selectWeekGames(league?.schedule, selectedWeek);
    const matchingRecentGames = recentResultGames.filter((game) => Number(game?.week) === Number(selectedWeek));
    return mergeRecentResultsIntoWeekGames(scheduleGames, matchingRecentGames);
  }, [league?.schedule, recentResultGames, selectedWeek]);

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
  const userTeamResult = useMemo(() => {
    const userTeamId = Number(league?.userTeamId);
    if (!Number.isFinite(userTeamId)) return null;
    return completed.map((row) => buildUserTeamResult(row, userTeamId)).find(Boolean) ?? null;
  }, [completed, league?.userTeamId]);
  const userResultPresentation = useMemo(
    () => (userTeamResult ? buildCompletedGamePresentation(userTeamResult.game, { seasonId: league?.seasonId, week: userTeamResult.week, teamById, source: 'weekly_results_user_game' }) : null),
    [league?.seasonId, teamById, userTeamResult],
  );
  const canOpenUserGame = Boolean(userResultPresentation?.canOpen && onGameSelect);

  const decisionReview = useMemo(() => {
    if (!userTeamResult) return null;
    return buildWeeklyDecisionImpact({
      league,
      userTeam: teamById[Number(league?.userTeamId)],
      lastGame: { ...userTeamResult.game, week: userTeamResult.week },
    });
  }, [league, teamById, userTeamResult]);

  const userGameVm = useMemo(() => (userTeamResult ? buildBoxScoreViewModel({ league, game: userTeamResult.game, gameId: userResultPresentation?.resolvedGameId, context: { season: league?.seasonId, week: userTeamResult.week } }) : null), [league, userResultPresentation?.resolvedGameId, userTeamResult]);
  const topPerformers = useMemo(() => getTopPerformers(userGameVm), [userGameVm]);
  const userTeam = teamById[Number(league?.userTeamId)] ?? null;
  const userTeamRecord = formatRecord(userTeam);

  if (!totalWeeks) {
    return <EmptyState title="No schedule data available for weekly results." body="Weekly game center will populate when league schedule weeks are present." />;
  }

  return (
    <div className="app-screen-stack app-weekly-results-screen" data-testid="weekly-results">
      <HeroCard
        eyebrow="Franchise HQ • Results"
        title="Weekly Results"
        subtitle="Review your latest final first, then scan league-wide outcomes and prep next steps."
        rightMeta={<StatusChip label={`Week ${selectedWeek}`} tone="info" />}
        actions={(
          <div className="app-weekly-results-nav" role="group" aria-label="Weekly results navigation">
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))} disabled={selectedWeek <= 1}>Prev</button>
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.min(totalWeeks, w + 1))} disabled={selectedWeek >= totalWeeks}>Next</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate?.('HQ')}>Back to HQ</button>
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

      {userTeamResult ? (
        <SectionCard title="Your Game Result" subtitle="Your completed matchup, team impact, and the next click." variant="info">
          <article className="app-game-center-card app-game-center-user card" data-testid="user-game-result-card">
            <div className="app-game-center-card__top">
              <strong>Week {userTeamResult.week} • {userTeamResult.outcome === 'W' ? 'Win' : userTeamResult.outcome === 'L' ? 'Loss' : 'Tie'} • {userTeamResult.isHome ? 'vs' : '@'} {userTeamResult.opponent?.abbr ?? 'TBD'}</strong>
              <div className="app-game-center-card__chips">
                <StatusChip label={`${userTeamResult.userScore}-${userTeamResult.oppScore}`} tone={userTeamResult.outcome === 'W' ? 'ok' : userTeamResult.outcome === 'L' ? 'warning' : 'info'} />
                <StatusChip label={userResultPresentation?.statusLabel ?? 'Archive unavailable'} tone={userResultPresentation?.archiveQuality === 'full' ? 'ok' : userResultPresentation?.archiveQuality === 'partial' ? 'info' : 'neutral'} />
              </div>
            </div>
            <div className="app-game-center-result-score" aria-label="Final score">
              <span>{userResultPresentation?.displayScoreLine ?? `${userTeamResult.userScore}-${userTeamResult.oppScore}`}</span>
              <small>Record after game: {userTeamRecord}</small>
            </div>
            <p className="app-game-center-card__scoreline">{userTeamResult.recap}</p>
            <div className="app-game-center-performers" aria-label="Top performers">
              <TopPerformerCard
                title="Top offensive player"
                performer={topPerformers.offense}
                player={topPerformers.offensePlayer}
                tone={topPerformers.hasOffense ? 'ok' : 'info'}
                onPlayerSelect={onPlayerSelect}
                context={{ source: 'weekly-results', gameId: userResultPresentation?.resolvedGameId, week: userTeamResult.week, role: 'Top offensive player', returnTo: 'weekly-results' }}
              />
              <TopPerformerCard
                title="Top defensive player"
                performer={topPerformers.defense}
                player={topPerformers.defensePlayer}
                tone={topPerformers.hasDefense ? 'ok' : 'info'}
                onPlayerSelect={onPlayerSelect}
                context={{ source: 'weekly-results', gameId: userResultPresentation?.resolvedGameId, week: userTeamResult.week, role: 'Top defensive player', returnTo: 'weekly-results' }}
              />
            </div>
            {userTeamResult?.prepImpact?.narrative ? (
              <CompactInsightCard
                title="Game-plan impact recap"
                subtitle={userTeamResult.prepImpact.narrative}
                tone="info"
              />
            ) : null}
            {Array.isArray(userTeamResult?.prepImpact?.activeReasons) && userTeamResult.prepImpact.activeReasons.length ? (
              <div className="app-hq-intel-list" role="list" aria-label="Game plan reasons">
                {userTeamResult.prepImpact.activeReasons.map((reason, idx) => (
                  <p key={`plan-reason-${idx}`} role="listitem" className="app-hq-intel-item tone-info">{reason}</p>
                ))}
              </div>
            ) : null}
            {decisionReview?.bullets?.length ? (
              <div className="app-hq-intel-list" role="list" aria-label="Decision review">
                {decisionReview.bullets.slice(0, 2).map((bullet, idx) => (
                  <p key={`user-impact-${idx}`} role="listitem" className="app-hq-intel-item tone-info">{bullet}</p>
                ))}
              </div>
            ) : null}
            <div className="app-game-center-card__footer app-game-center-card__footer--primary">
              <button
                type="button"
                className="btn btn-sm app-game-center-primary-cta"
                data-testid="game-book-primary-cta"
                onClick={canOpenUserGame ? () => openResolvedBoxScore(userTeamResult.game, { seasonId: league?.seasonId, week: userTeamResult.week, source: 'weekly_results_user_game' }, onGameSelect) : undefined}
                disabled={!canOpenUserGame}
                title={canOpenUserGame ? 'Open full Game Book' : (userResultPresentation?.statusLabel ?? 'Archive unavailable')}
              >
                {canOpenUserGame ? 'Open Game Book' : `Game Book unavailable (${userResultPresentation?.statusLabel ?? 'Archive unavailable'})`}
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate?.('HQ')}>Return to Franchise HQ</button>
              {decisionReview?.recommendedAction ? (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onNavigate?.(decisionReview.recommendedAction.route)}>{decisionReview.recommendedAction.label}</button>
              ) : null}
            </div>
          </article>
        </SectionCard>
      ) : null}

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
