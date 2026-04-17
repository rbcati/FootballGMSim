import React, { useMemo, useState } from 'react';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { deriveCompactResultRecap, getGameLifecycleBucket, selectWeekGames } from '../utils/gameCenterResults.js';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';

function normalizeTeam(team) {
  if (!team || typeof team !== 'object') return { abbr: '—', name: 'Unknown' };
  return { abbr: team.abbr ?? team.name ?? '—', name: team.name ?? team.abbr ?? 'Unknown' };
}

function formatPeriodLabel(game) {
  const quarterCount = Number(game?.quarterScores?.home?.length ?? game?.quarterScores?.away?.length ?? 0);
  if (quarterCount > 4) return `Final/OT${quarterCount - 4 > 1 ? quarterCount - 4 : ''}`;
  return 'Final';
}

function ResultRow({ row, seasonId, onGameSelect }) {
  const presentation = buildCompletedGamePresentation(row.game, { seasonId, week: row.week, teamById: row.teamById, source: 'weekly_results_center' });
  const clickable = Boolean(presentation.canOpen && onGameSelect);

  return (
    <article className="premium-game-card is-completed" style={{ padding: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong>Week {row.week}</strong>
        <span className="badge">{formatPeriodLabel(row.game)}</span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>
        {row.away.abbr} {row.game?.awayScore ?? '—'} @ {row.home.abbr} {row.game?.homeScore ?? '—'}
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.recap}</div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={clickable ? () => openResolvedBoxScore(row.game, { seasonId, week: row.week, source: 'weekly_results_center' }, onGameSelect) : undefined}
          disabled={!clickable}
          title={clickable ? (presentation?.ctaLabel ?? 'Open Game Book') : (presentation?.statusLabel ?? 'Archive unavailable')}
        >
          {clickable ? 'Open Game Book' : (presentation?.statusLabel ?? 'Archive unavailable')}
        </button>
      </div>
    </article>
  );
}



function SpotlightCard({ row, seasonId, onGameSelect }) {
  const presentation = buildCompletedGamePresentation(row.game, { seasonId, week: row.week, source: 'weekly_results_spotlight' });
  const clickable = Boolean(presentation.canOpen && onGameSelect);
  const awayId = Number(row?.game?.away?.id ?? row?.game?.away);
  const homeId = Number(row?.game?.home?.id ?? row?.game?.home);

  return (
    <article className="card" style={{ padding: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong>Spotlight game</strong>
        <span className="badge">Score {row.score}</span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>
        {row.teamById[awayId]?.abbr ?? 'AWY'} {row.game?.awayScore ?? '—'} @ {row.teamById[homeId]?.abbr ?? 'HME'} {row.game?.homeScore ?? '—'}
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.reason}</div>
      <div style={{ marginTop: 8 }}>
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

export default function WeeklyResultsCenter({ league, initialWeek, onGameSelect }) {
  const totalWeeks = Number(league?.schedule?.weeks?.length ?? 0);
  const currentWeek = Number(initialWeek ?? league?.week ?? 1);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const teamById = useMemo(() => {
    const out = {};
    for (const team of league?.teams ?? []) out[Number(team?.id)] = team;
    return out;
  }, [league?.teams]);

  const selectedWeekGames = useMemo(() => {
    return selectWeekGames(league?.schedule, selectedWeek);
  }, [league?.schedule, selectedWeek]);

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

  if (!totalWeeks) {
    return <div className="card" style={{ padding: 'var(--space-4)' }}>No schedule data available for weekly results.</div>;
  }

  return (
    <div className="app-screen-stack">
      <section className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Game Center</div>
            <h2 style={{ margin: 0 }}>Weekly Results</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))} disabled={selectedWeek <= 1}>Prev</button>
            <span className="badge">Week {selectedWeek}</span>
            <button type="button" className="btn btn-sm" onClick={() => setSelectedWeek((w) => Math.min(totalWeeks, w + 1))} disabled={selectedWeek >= totalWeeks}>Next</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge">Completed {completed.length}</span>
          <span className="badge">Live {live.length}</span>
          <span className="badge">Upcoming {upcoming.length}</span>
        </div>
      </section>


      {leagueRecap.bullets.length > 0 && (
        <section className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Weekly League Recap</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {leagueRecap.bullets.map((bullet, idx) => <li key={`bullet-${idx}`} style={{ fontSize: 'var(--text-sm)' }}>{bullet}</li>)}
          </ul>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Race center</div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <strong>Hottest:</strong> {leagueRecap.raceCenter.hottest[0] ? `${leagueRecap.raceCenter.hottest[0].team?.abbr ?? leagueRecap.raceCenter.hottest[0].team?.name} (${leagueRecap.raceCenter.hottest[0].streak.length}W)` : '—'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <strong>Coldest:</strong> {leagueRecap.raceCenter.coldest[0] ? `${leagueRecap.raceCenter.coldest[0].team?.abbr ?? leagueRecap.raceCenter.coldest[0].team?.name} (${leagueRecap.raceCenter.coldest[0].streak.length}L)` : '—'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <strong>Mover:</strong> {leagueRecap.raceCenter.biggestMover?.change > 0 ? `${leagueRecap.raceCenter.biggestMover.team?.abbr ?? leagueRecap.raceCenter.biggestMover.team?.name} (+${leagueRecap.raceCenter.biggestMover.change})` : 'No major move'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {leagueRecap.raceCenter.bubble ? `Bubble: ${(leagueRecap.raceCenter.bubble.gap * 100).toFixed(1)} pct gap` : 'Bubble context unlocks as standings deepen.'}
              </div>
            </div>
            <div className="card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Team trajectories</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {leagueRecap.trajectories.slice(0, 3).map((team) => (
                  <div key={team.teamId ?? team.label} style={{ fontSize: 'var(--text-xs)' }}><strong>{team.label}:</strong> {team.snippet}</div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {spotlightRows.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Weekly Spotlight</h3>
          {spotlightRows.map((row) => <SpotlightCard key={row.key} row={row} seasonId={league?.seasonId} onGameSelect={onGameSelect} />)}
        </section>
      )}

      {completed.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Completed</h3>
          {completed.map((row) => <ResultRow key={row.key} row={row} seasonId={league?.seasonId} onGameSelect={onGameSelect} />)}
        </section>
      )}

      {live.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>In progress</h3>
          {live.map((row) => (
            <article key={row.key} className="card" style={{ padding: 'var(--space-3)' }}>
              <strong>{row.away.abbr} @ {row.home.abbr}</strong>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.recap}</div>
            </article>
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Upcoming</h3>
          {upcoming.map((row) => (
            <article key={row.key} className="card" style={{ padding: 'var(--space-3)' }}>
              <strong>{row.away.abbr} @ {row.home.abbr}</strong>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.recap}</div>
            </article>
          ))}
        </section>
      )}

      {rows.length === 0 ? <div className="card" style={{ padding: 'var(--space-4)' }}>No games scheduled for week {selectedWeek}.</div> : null}
    </div>
  );
}
