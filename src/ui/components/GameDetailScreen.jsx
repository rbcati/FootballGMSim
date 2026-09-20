import React, { useMemo, useRef } from 'react';
import BoxScorePanel from './BoxScorePanel.jsx';
import { EmptyState, ScreenHeader } from './ScreenSystem.jsx';
import { buildWeeklyDecisionImpact } from '../utils/weeklyDecisionImpact.js';
import { buildGameBookPresentation, unwrapBoxScoreResponse } from '../utils/boxScoreViewModel.js';
import useStableRouteRequest from '../hooks/useStableRouteRequest.js';
import { resolveCanonicalCompletedGame } from '../utils/canonicalCompletedGame.js';
import { getGame as getLocalArchivedGame } from '../../core/archive/gameArchive.ts';
import { buildLeagueCacheScopeKey } from '../utils/requestLoopGuard.js';

function findScheduleGame(league, gameId) {
  for (const week of league?.schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      const candidate = game?.gameId ?? game?.id;
      if (String(candidate) === String(gameId)) return { ...game, week: Number(week?.week ?? league?.week ?? 1) };
    }
  }
  return null;
}

export function classifyPreparationBullet(bullet) {
  if (typeof bullet !== 'string' || !bullet.trim()) return null;
  const text = bullet.trim();
  const knownShapes = [
    { key: 'game-plan', label: 'Game plan', pattern: /^(Game plan was saved before kickoff|No saved game-plan snapshot was found)/i },
    { key: 'practice', label: 'Practice', pattern: /^(Practice effects were logged|A prior practice plan exists|No weekly practice log was matched)/i },
    { key: 'injury-risk', label: 'Injury risk', pattern: /^(Injury\/availability risk was active|No pregame injury-risk marker was found)/i },
  ];
  const match = knownShapes.find(({ pattern }) => pattern.test(text));
  if (!match) return null;
  return { ...match, text, unavailable: text.startsWith('No ') };
}

// Compact route-owned return chrome. Matchup identity stays in the canonical
// BoxScore hero so the full Game Book exposes only one score surface.
function GameBookReturnBar({ week, onBack, backLabel }) {
  return (
    <div className="game-book-return-bar" data-testid="game-book-return-bar">
      <button
        type="button"
        className="btn btn-sm game-book-return-bar__back"
        onClick={onBack}
        data-testid="game-book-return"
      >
        ← {backLabel ?? 'Return to HQ'}
      </button>
      <span className="game-book-return-bar__context">
        {week != null ? `Wk ${week} Game Book` : 'Game Book'}
      </span>
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
    cacheScopeKey: buildLeagueCacheScopeKey(league),
    fetcher: () => actions.getBoxScore(gameId),
    warnLabel: 'GameDetailScreen',
  });
  const archivedGame = unwrapBoxScoreResponse(archiveResponse);
  // Synchronous localStorage archive written by PostGameScreen (onArchiveReady →
  // saveGame). It is available the moment the postgame screen mounts — before the
  // user can navigate — so consulting it lets the Game Book open the just-watched
  // game immediately instead of racing (and sometimes losing to) the async
  // worker fetch, which was landing on the recovery state intermittently.
  const localArchivedGame = useMemo(() => {
    try { return getLocalArchivedGame(gameId); } catch { return null; }
  }, [gameId]);
  const canonicalGame = resolveCanonicalCompletedGame({ league, gameId, scheduleGame, archivedGame, localArchivedGame });
  const userTeam = (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId));
  const prepContext = buildWeeklyDecisionImpact({ league, userTeam, lastGame: scheduleGame });
  const preparationBullets = (prepContext?.preparationBullets ?? []).filter((bullet) => typeof bullet === 'string' && bullet.trim());
  const categorizedPreparation = preparationBullets.map(classifyPreparationBullet).filter(Boolean);
  const genericPreparation = preparationBullets.filter((bullet) => !classifyPreparationBullet(bullet));
  const detailVm = useMemo(
    () => buildGameBookPresentation({
      league,
      game: canonicalGame,
      gameId,
      scheduleGame,
      context: { season: league?.seasonId, week: weekFromId ?? league?.week },
    }),
    [league, canonicalGame, gameId, scheduleGame, weekFromId],
  );

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

  // A "usable" record must carry a real final: resolveCanonicalCompletedGame
  // returns the best available reference even when no valid final exists
  // (e.g. an unplayed schedule row whose serialized scores default to 0-0),
  // so gate on played/score validity — never on object existence alone.
  const canonicalHasFinal = Boolean(
    canonicalGame
    && !(canonicalGame.played === false || canonicalGame.played === 0)
    && Number.isFinite(Number(canonicalGame.homeScore ?? canonicalGame.scoreHome))
    && Number.isFinite(Number(canonicalGame.awayScore ?? canonicalGame.scoreAway)),
  );

  // No canonical completed record anywhere (archive, schedule, league index):
  // keep the user anchored on an honest recovery surface with one clear exit
  // instead of rendering placeholder teams and a fake 0-0 final.
  if (!canonicalHasFinal && !archiveLoading) {
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

  if (!canonicalHasFinal && archiveLoading) {
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
      <GameBookReturnBar
        week={detailVm?.week ?? weekFromId ?? null}
        onBack={onBack}
        backLabel={backLabel}
      />
      <BoxScorePanel
        presentation={detailVm}
        gameId={gameId}
        actions={actions}
        league={league}
        onBack={onBack}
        onPlayerSelect={onPlayerSelect}
        onTeamSelect={onTeamSelect}
        scheduleGame={canonicalGame ?? scheduleGame}
        backLabel={backLabel}
        summarySupplement={(
          <>
            <section className="game-book-preparation" data-testid="game-book-decision-summary" aria-labelledby="game-book-preparation-heading">
              <h3 id="game-book-preparation-heading">Preparation Context</h3>
              <p className="game-book-preparation__note">Pregame context captured before kickoff. This does not assign direct causality.</p>
              <dl className="game-book-prep-context" aria-label="Preparation context">
                {categorizedPreparation.map((item) => (
                  <div key={item.key} className="game-book-prep-context__row">
                    <dt>{item.label}</dt>
                    <dd title={item.unavailable ? item.text : undefined}>{item.unavailable ? 'Not recorded' : item.text}</dd>
                    {item.unavailable ? <span className="sr-only">{item.text}</span> : null}
                  </div>
                ))}
              </dl>
              {genericPreparation.map((bullet, idx) => (
                <p key={`prep-context-generic-${idx}`} data-testid="game-book-prep-context-generic" className="app-hq-intel-item tone-info">{bullet}</p>
              ))}
              {!preparationBullets.length ? <p className="app-hq-intel-item tone-info">No pregame preparation markers were found for this game.</p> : null}
            </section>
            {onNavigate ? (
              <div className="game-book-summary-action">
                <button type="button" className="btn btn-sm" data-testid="game-book-review-next-week" onClick={() => onNavigate('Weekly Prep')}>
                  Review Next Week
                </button>
              </div>
            ) : null}
          </>
        )}
      />
    </div>
  );
}
