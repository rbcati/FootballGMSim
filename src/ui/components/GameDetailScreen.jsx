import React from 'react';
import BoxScore from './BoxScore.jsx';

export default function GameDetailScreen({ gameId, league, actions, onBack, onPlayerSelect, onTeamSelect }) {
  if (!gameId) {
    return (
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ marginTop: 0 }}>Completed Game Detail</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>
          Select a final score from Schedule, Weekly Hub, or the recent-results module to open a full game detail.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Completed Game Detail</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Box score, leaders, quarter flow, recap, and team/player drill-down.</div>
        </div>
        <button className="btn" onClick={onBack}>← Back</button>
      </div>

      <BoxScore
        gameId={gameId}
        actions={actions}
        league={league}
        embedded
        onBack={onBack}
        onPlayerSelect={onPlayerSelect}
        onTeamSelect={onTeamSelect}
      />
    </div>
  );
}
