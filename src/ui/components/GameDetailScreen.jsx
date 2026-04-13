import React from 'react';
import BoxScorePanel from './BoxScorePanel.jsx';
import { ScreenHeader, EmptyState } from './ScreenSystem.jsx';

export default function GameDetailScreen({ gameId, league, actions, onBack, onPlayerSelect, onTeamSelect }) {
  if (!gameId) {
    return (
      <div className="app-screen-stack">
        <ScreenHeader
          title="Game Detail"
          subtitle="Select any completed game to view full postgame data."
          onBack={onBack}
          backLabel="Back"
          metadata={[{ label: 'Season', value: league?.seasonId ?? '—' }]}
        />
        <EmptyState
          title="No completed game selected yet."
          body="Open a final score from Schedule, Weekly Hub, or recent results to load the full game book."
        />
      </div>
    );
  }

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="Game Book"
        subtitle="Final score, recap, box score stats, and archived game detail."
        onBack={onBack}
        backLabel="Back"
        metadata={[{ label: 'Game ID', value: gameId }]}
      />
      <BoxScorePanel
        gameId={gameId}
        actions={actions}
        league={league}
        onBack={onBack}
        onPlayerSelect={onPlayerSelect}
        onTeamSelect={onTeamSelect}
      />
    </div>
  );
}
