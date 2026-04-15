import React from 'react';

export default function Scorebug({ homeTeam, awayTeam, state }) {
  const possession = state?.possessionTeamId;
  const quarter = Number(state?.quarter ?? 1);
  const clock = String(state?.clock ?? '15:00');
  const minutesLeft = Number(clock.split(':')[0] ?? 15);
  const fieldPosition = Number(state?.fieldPosition ?? 50);
  const inRedZone = Number.isFinite(fieldPosition) && fieldPosition >= 80;
  const twoMinute = quarter >= 2 && minutesLeft <= 2;
  const isOvertime = quarter > 4;
  return (
    <div className="live-scorebug">
      <div className={`sb-team ${possession === awayTeam?.id ? 'has-ball' : ''}`}>
        <span>{awayTeam?.abbr || 'AWY'}</span>
        <strong>{state?.score?.away ?? 0}</strong>
      </div>
      <div className="sb-center">
        <div>Q{state?.quarter ?? 1} · {state?.clock ?? '15:00'}</div>
        <div>{state?.downDistance || '—'} · {state?.ballSpot || 'Ball on --'}</div>
        <div className="sb-flags">
          {isOvertime ? <span className="sb-flag overtime">OVERTIME</span> : null}
          {twoMinute ? <span className="sb-flag clutch">2:00 DRILL</span> : null}
          {inRedZone ? <span className="sb-flag redzone">RED ZONE</span> : null}
        </div>
      </div>
      <div className={`sb-team ${possession === homeTeam?.id ? 'has-ball' : ''}`}>
        <span>{homeTeam?.abbr || 'HME'}</span>
        <strong>{state?.score?.home ?? 0}</strong>
      </div>
    </div>
  );
}
