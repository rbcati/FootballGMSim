import React from 'react';
import BoxScorePanel from './BoxScorePanel.jsx';
import { EmptyState, ScreenHeader, SectionCard, StatusChip } from './ScreenSystem.jsx';

export default function GameDetailScreen({ gameId, league, actions, onBack, onPlayerSelect, onTeamSelect }) {
  const weekFromId = typeof gameId === 'string' ? gameId.match(/_w(\d+)_/i)?.[1] : null;

  if (!gameId) {
    return (
      <div className="app-screen-stack">
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
    <div className="app-screen-stack">
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
