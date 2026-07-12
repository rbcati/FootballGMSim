import React, { useMemo, useRef } from 'react';
import BoxScorePanel from './BoxScorePanel.jsx';
import { EmptyState, ScreenHeader, SectionCard } from './ScreenSystem.jsx';
import { buildWeeklyDecisionImpact } from '../utils/weeklyDecisionImpact.js';
import { buildBoxScoreViewModel, unwrapBoxScoreResponse } from '../utils/boxScoreViewModel.js';
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';
import { resolveCanonicalCompletedGame } from '../utils/canonicalCompletedGame.js';

function findScheduleGame(league, gameId) {
  for (const week of league?.schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      const candidate = game?.gameId ?? game?.id;
      if (String(candidate) === String(gameId)) return { ...game, week: Number(week?.week ?? league?.week ?? 1) };
    }
  }
  return null;
}

// Compact, mobile-first sticky chrome for the Game Book. Keeps the final score,
// W/L result, week, and a return action above the fold so the user never has to
// scroll to see the outcome or get back to HQ. Presentational only — it reads
// from the already-built box-score view model and never recomputes any result.
function GameBookStickyHeader({ detailVm, userTeamId, week, onBack, backLabel }) {
  const hasFinal = Boolean(detailVm?.availableData?.finalScore);
  const home = detailVm?.homeTeam ?? null;
  const away = detailVm?.awayTeam ?? null;
  const homeScore = detailVm?.finalScore?.home;
  const awayScore = detailVm?.finalScore?.away;

  let outcome = null; // { label, tone }
  if (hasFinal && userTeamId != null && home && away) {
    const userIsHome = Number(home.id) === Number(userTeamId);
    const userIsAway = Number(away.id) === Number(userTeamId);
    if (userIsHome || userIsAway) {
      const userScore = userIsHome ? homeScore : awayScore;
      const oppScore = userIsHome ? awayScore : homeScore;
      if (Number(userScore) === Number(oppScore)) outcome = { label: 'T', tone: 'info' };
      else if (Number(userScore) > Number(oppScore)) outcome = { label: 'W', tone: 'ok' };
      else outcome = { label: 'L', tone: 'danger' };
    }
  }

  return (
    <div className="game-book-sticky-header" data-testid="game-book-sticky-header">
      <button
        type="button"
        className="btn btn-sm game-book-sticky-header__back"
        onClick={onBack}
        data-testid="game-book-sticky-back"
      >
        ← {backLabel ?? 'Return to HQ'}
      </button>
      <span className="game-book-sticky-header__week" data-testid="game-book-sticky-week">
        {week != null ? `Wk ${week}` : 'Game Book'}
      </span>
      {hasFinal ? (
        <span className="game-book-sticky-header__score" data-testid="game-book-sticky-score">
          {outcome ? (
            <span className={`game-book-sticky-header__badge tone-${outcome.tone}`} aria-hidden="true">{outcome.label}</span>
          ) : null}
          <span className="game-book-sticky-header__teams">
            {away?.abbr ?? 'AWY'} {awayScore ?? '—'} – {homeScore ?? '—'} {home?.abbr ?? 'HME'}
          </span>
        </span>
      ) : (
        <span className="game-book-sticky-header__score game-book-sticky-header__score--pending" data-testid="game-book-sticky-score">
          Final pending
        </span>
      )}
    </div>
  );
}


export default function GameDetailScreen({ gameId, league, actions, onBack, onPlayerSelect, onTeamSelect, onNavigate, backLabel }) {
  const weekFromId = typeof gameId === 'string' ? gameId.match(/_w(\d+)_/i)?.[1] : null;

  const scheduleGame = findScheduleGame(league, gameId);
  const canLoadArchive = Boolean(gameId && typeof actions?.getBoxScore === 'function');
  const { data: archiveResponse, loading: archiveLoading } = useStableRouteRequest({
    requestKey: canLoadArchive ? `boxscore:${gameId}` : null,
    enabled: canLoadArchive,
    cacheScopeKey: league?.id ?? league?.leagueId ?? 'global',
    fetcher: () => actions.getBoxScore(gameId),
    warnLabel: 'GameDetailScreen',
  });
  const archivedGame = unwrapBoxScoreResponse(archiveResponse);
  const canonicalGame = resolveCanonicalCompletedGame({ league, gameId, scheduleGame, archivedGame });
  const userTeam = (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId));
  const prepContext = buildWeeklyDecisionImpact({ league, userTeam, lastGame: scheduleGame });
  const detailVm = useMemo(
    () => buildBoxScoreViewModel({
      league,
      game: canonicalGame,
      gameId,
      scheduleGame,
      context: { season: league?.seasonId, week: weekFromId ?? league?.week },
    }),
    [league, canonicalGame, gameId, scheduleGame, weekFromId],
  );
  const screenTitle = detailVm?.availableData?.finalScore ? detailVm.headlineSummary : 'Game Book';
  const screenSubtitle = detailVm?.availableData?.finalScore
    ? `${detailVm.finalScoreLine} · Game Book sections show only data recorded for this final.`
    : 'Scan the final, review the recap narrative, compare team stats, then drill into player leaders and play detail.';

  // Recovery guard: onBack navigates exactly once even if the recovery action
  // is tapped repeatedly while the route transition is in flight.
  const backFiredRef = useRef(false);
  const handleBackOnce = () => {
    if (backFiredRef.current) return;
    backFiredRef.current = true;
    onBack?.();
  };

  if (!gameId) {
    return (
      <div className="app-screen-stack" data-testid="game-book">
        <ScreenHeader
          eyebrow="Game Book"
          title="Game Book"
          subtitle="Open any game to view score context, recap, and box score details when available."
          onBack={onBack}
          backLabel="Return to HQ"
          metadata={[{ label: 'Season', value: league?.seasonId ?? '—' }, { label: 'Status', value: 'No game selected' }]}
        />
        <EmptyState
          title="No completed game selected yet."
          body="Open a final score from Schedule, Weekly Results, or recent surfaces to load the full Game Book."
        />
      </div>
    );
  }

  // No canonical record anywhere (archive, schedule, league index): keep the
  // user anchored on an honest recovery surface with one clear exit instead
  // of rendering placeholder teams and a fake 0-0 final.
  if (!canonicalGame && !archiveLoading) {
    return (
      <div className="app-screen-stack" data-testid="game-book">
        <div
          role="alert"
          data-testid="game-book-recovery"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '40px 20px', textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem' }} aria-hidden="true">📖</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
            Game Book unavailable
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.5 }}>
            The detailed recap for this game could not be loaded. Your league
            results are unaffected.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="game-book-recovery-return"
            onClick={handleBackOnce}
            style={{ minHeight: 44, padding: '10px 26px' }}
          >
            {backLabel ?? 'Return to HQ'}
          </button>
        </div>
      </div>
    );
  }

  if (!canonicalGame && archiveLoading) {
    return (
      <div className="app-screen-stack" data-testid="game-book">
        <div
          role="status"
          data-testid="game-book-loading"
          style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}
        >
          Loading Game Book…
        </div>
      </div>
    );
  }

  return (
    <div className="app-screen-stack" data-testid="game-book">
      <GameBookStickyHeader
        detailVm={detailVm}
        userTeamId={league?.userTeamId}
        week={detailVm?.week ?? weekFromId ?? null}
        onBack={onBack}
        backLabel={backLabel}
      />
      <ScreenHeader
        eyebrow="Game Book"
        title={screenTitle}
        subtitle={screenSubtitle}
        onBack={onBack}
        backLabel={backLabel ?? "Return to HQ"}
        primaryAction={(
          <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('Weekly Prep')}>
            Review Next Week
          </button>
        )}
        metadata={[
          { label: 'Game ID', value: gameId },
          { label: 'Season', value: league?.seasonId ?? '—' },
          { label: 'Week', value: detailVm?.week ?? weekFromId ?? '—' },
          { label: 'Final', value: detailVm?.finalScoreLine ?? '—' },
        ]}
      />
      <div data-testid="game-book-decision-summary">
        <SectionCard variant="compact" title="Preparation Context" subtitle="Pregame context captured before kickoff. This strip does not assign direct causality.">
          <div className="app-hq-intel-list" role="list" aria-label="Preparation context">
            {(prepContext?.preparationBullets ?? []).slice(0, 3).map((bullet, idx) => (
              <p key={`prep-context-${idx}`} role="listitem" className="app-hq-intel-item tone-info">{bullet}</p>
            ))}
            {!(prepContext?.preparationBullets ?? []).length ? <p className="app-hq-intel-item tone-info">No pregame preparation markers were found for this game.</p> : null}
          </div>
        </SectionCard>
      </div>
      <SectionCard variant="info" title="Game Book Detail" subtitle="Summary → Team stats → Player leaders → Drive/play recap.">
        <BoxScorePanel
          gameId={gameId}
          actions={actions}
          league={league}
          onBack={onBack}
          onPlayerSelect={onPlayerSelect}
          onTeamSelect={onTeamSelect}
          scheduleGame={canonicalGame ?? scheduleGame}
          backLabel={backLabel}
        />
      </SectionCard>
    </div>
  );
}

