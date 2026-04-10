import React from 'react';

export default function Scorebug({ homeTeam, awayTeam, state }) {
  const possession = state?.possessionTeamId;
  return (
    <div className="live-scorebug">
      <div className={`sb-team ${possession === awayTeam?.id ? 'has-ball' : ''}`}>
        <span>{awayTeam?.abbr || 'AWY'}</span>
        <strong>{state?.score?.away ?? 0}</strong>
      </div>
      <div className="sb-center">
        <div>Q{state?.quarter ?? 1} · {state?.clock ?? '15:00'}</div>
        <div>{state?.downDistance || '—'} · {state?.ballSpot || 'Ball on --'}</div>
      </div>
      <div className={`sb-team ${possession === homeTeam?.id ? 'has-ball' : ''}`}>
        <span>{homeTeam?.abbr || 'HME'}</span>
        <strong>{state?.score?.home ?? 0}</strong>
      </div>
    </div>
  );
}
