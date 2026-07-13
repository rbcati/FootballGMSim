import React from 'react';

function finiteScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Broadcast-style score strip for the live viewer.
 *
 * Score authority: `state.score` is rendered only when the caller supplies it
 * (the canonical league-recorded final). While the narrated replay is running
 * the caller passes `score: null` because the per-play narration snapshots are
 * not trustworthy — the bug then shows an explicit "–" placeholder instead of
 * a number that could contradict the recorded result.
 *
 * Clock authority: no per-play clock exists (drive-granular estimates only),
 * so the center shows quarter + an event-progress label instead of a
 * fabricated ticking clock.
 */
export default function Scorebug({ homeTeam, awayTeam, state }) {
  const possession = state?.possessionTeamId;
  const quarter = Number(state?.quarter ?? 1);
  const homeScore = finiteScore(state?.score?.home);
  const awayScore = finiteScore(state?.score?.away);
  const hasScore = homeScore != null && awayScore != null;
  const fieldPosition = Number(state?.fieldPosition ?? 50);
  const inRedZone = Number.isFinite(fieldPosition) && fieldPosition >= 80;
  const isOvertime = quarter > 4;
  const isFinal = Boolean(state?.isFinal);
  const scoreCell = (value, teamLabel) => (
    hasScore
      ? <strong>{value}</strong>
      : (
        <strong
          className="sb-score-pending"
          aria-label={`${teamLabel} score shown at the final whistle`}
        >
          –
        </strong>
      )
  );
  return (
    <div className="live-scorebug" data-testid="watch-scorebug">
      <div className={`sb-team ${possession === awayTeam?.id ? 'has-ball' : ''}`}>
        <span>{awayTeam?.abbr || 'AWY'}</span>
        {scoreCell(awayScore, awayTeam?.abbr || 'Away')}
      </div>
      <div className="sb-center">
        <div>Q{quarter}{state?.progressLabel ? ` · ${state.progressLabel}` : ''}</div>
        <div>{state?.downDistance || '—'} · {state?.ballSpot || 'Ball on --'}</div>
        <div className="sb-flags">
          {isFinal ? <span className="sb-flag final">FINAL</span> : null}
          {isOvertime ? <span className="sb-flag overtime">OVERTIME</span> : null}
          {inRedZone && !isFinal ? <span className="sb-flag redzone">RED ZONE</span> : null}
        </div>
      </div>
      <div className={`sb-team ${possession === homeTeam?.id ? 'has-ball' : ''}`}>
        <span>{homeTeam?.abbr || 'HME'}</span>
        {scoreCell(homeScore, homeTeam?.abbr || 'Home')}
      </div>
    </div>
  );
}
