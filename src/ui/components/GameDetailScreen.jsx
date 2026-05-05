import React from 'react';
import BoxScorePanel from './BoxScorePanel.jsx';
import { EmptyState, ScreenHeader, SectionCard, StatusChip } from './ScreenSystem.jsx';
import { buildWeeklyDecisionImpact } from '../utils/weeklyDecisionImpact.js';

function findScheduleGame(league, gameId) {
  for (const week of league?.schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      const candidate = game?.gameId ?? game?.id;
      if (String(candidate) === String(gameId)) return { ...game, week: Number(week?.week ?? league?.week ?? 1) };
    }
  }
  return null;
}


export default function GameDetailScreen({ gameId, league, actions, onBack, onPlayerSelect, onTeamSelect }) {
  const weekFromId = typeof gameId === 'string' ? gameId.match(/_w(\d+)_/i)?.[1] : null;

  const scheduleGame = findScheduleGame(league, gameId);
  const userTeam = (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId));
  const prepContext = buildWeeklyDecisionImpact({ league, userTeam, lastGame: scheduleGame });

  if (!gameId) {
    return (
      <div className="app-screen-stack" data-testid="game-book">
        <ScreenHeader
          eyebrow="Game Book"
          title="Game Book"
          subtitle="Open any game to view score context, recap, and box score details when available."
          onBack={onBack}
          backLabel="Back"
          metadata={[{ label: 'Season', value: league?.seasonId ?? '—' }, { label: 'Status', value: 'No game selected' }]}
        />
        <EmptyState
          title="No completed game selected yet."
          body="Open a final score from Schedule, Weekly Results, or recent surfaces to load the full Game Book."
        />
      </div>
    );
  }

  return (
    <div className="app-screen-stack" data-testid="game-book">
      <ScreenHeader
        eyebrow="Game Book"
        title="Game Book"
        subtitle="Scan the final, review the recap narrative, compare team stats, then drill into player leaders and play detail."
        onBack={onBack}
        backLabel="Back"
        primaryAction={<StatusChip label="Command View" tone="info" />}
        metadata={[
          { label: 'Game ID', value: gameId },
          { label: 'Season', value: league?.seasonId ?? '—' },
          { label: 'Week', value: weekFromId ?? '—' },
        ]}
      />
      <SectionCard variant="compact" title="Preparation Context" subtitle="Pregame context captured before kickoff. This strip does not assign direct causality.">
        <div className="app-hq-intel-list" role="list" aria-label="Preparation context">
          {(prepContext?.preparationBullets ?? []).slice(0, 3).map((bullet, idx) => (
            <p key={`prep-context-${idx}`} role="listitem" className="app-hq-intel-item tone-info">{bullet}</p>
          ))}
          {!(prepContext?.preparationBullets ?? []).length ? <p className="app-hq-intel-item tone-info">No pregame preparation markers were found for this game.</p> : null}
        </div>
      </SectionCard>
      <SectionCard variant="info" title="Game Book Detail" subtitle="Summary → Team stats → Player leaders → Drive/play recap.">
        <BoxScorePanel
          gameId={gameId}
          actions={actions}
          league={league}
          onBack={onBack}
          onPlayerSelect={onPlayerSelect}
          onTeamSelect={onTeamSelect}
        />
      </SectionCard>
    </div>
  );
}
