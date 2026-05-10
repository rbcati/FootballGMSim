import React, { useEffect, useMemo, useState } from 'react';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { buildFranchiseHistoryModel, PLAYOFF_CALIBER_WINS } from '../../core/franchiseHistoryModel.js';
import { RECORD_BOOK_PLAYER_KEYS, RECORD_LABELS } from '../../core/recordBookV1.js';

function buildSeasonTeamMap(season) {
  const map = {};
  for (const row of season?.standings ?? []) {
    map[Number(row?.id)] = row;
  }
  return map;
}

function formatPct(p) {
  if (!Number.isFinite(p) || p <= 0) return '—';
  return `${(p * 100).toFixed(1)}%`;
}

function RecordRow({ label, value, detail }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-sm)', padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <strong>{value == null || value === '' ? '—' : value}</strong>
        {detail ? <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{detail}</div> : null}
      </span>
    </div>
  );
}

export default function TeamHistoryScreen({ league, actions, teamId, onPlayerSelect, onBack, onOpenBoxScore }) {
  const [seasons, setSeasons] = useState([]);
  const [hofPlayers, setHofPlayers] = useState([]);
  const [hofClasses, setHofClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryYear, setQueryYear] = useState('');
  const [scope, setScope] = useState('all');

  const activeTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(teamId ?? league?.userTeamId)),
    [league?.teams, league?.userTeamId, teamId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pSeasons = actions?.getAllSeasons?.().catch(() => ({ payload: { seasons: [] } })) ?? Promise.resolve({ payload: { seasons: [] } });
        const pHof = actions?.getHallOfFame?.().catch(() => ({ payload: { players: [], classes: [] } })) ?? Promise.resolve({ payload: { players: [], classes: [] } });
        const [sRes, hRes] = await Promise.all([pSeasons, pHof]);
        if (cancelled) return;
        setSeasons(sRes?.payload?.seasons ?? []);
        setHofPlayers(hRes?.payload?.players ?? []);
        setHofClasses(hRes?.payload?.classes ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actions]);

  const model = useMemo(
    () => buildFranchiseHistoryModel({
      teamId: activeTeam?.id ?? null,
      teamAbbr: activeTeam?.abbr ?? null,
      teamName: activeTeam?.name ?? null,
      archivedSeasons: seasons,
      hallOfFamePlayers: hofPlayers,
      hallOfFameClasses: hofClasses,
    }),
    [activeTeam?.abbr, activeTeam?.id, activeTeam?.name, seasons, hofPlayers, hofClasses],
  );

  const { summary, franchiseRecords, franchiseLegends, playoffHistory, bestGames, milestones } = model;

  const filteredTimeline = useMemo(() => {
    return (model.seasons ?? []).filter((row) => {
      if (scope === 'champions' && !row.champion) return false;
      if (scope === 'playoff' && !row.playoffCaliber) return false;
      if (scope === 'losing' && !row.losingSeason) return false;
      if (scope === 'elite' && !row.eliteSeason) return false;
      if (!queryYear.trim()) return true;
      return String(row.year).includes(queryYear.trim());
    });
  }, [model.seasons, queryYear, scope]);

  const completedGameRows = useMemo(() => {
    const rows = [];
    const targetTeamId = Number(activeTeam?.id);
    if (!Number.isFinite(targetTeamId)) return rows;

    for (const season of seasons ?? []) {
      const teamMap = buildSeasonTeamMap(season);
      for (const game of season?.gameIndex ?? []) {
        const homeId = Number(game?.homeId);
        const awayId = Number(game?.awayId);
        if (homeId !== targetTeamId && awayId !== targetTeamId) continue;
        rows.push({
          gameId: game?.id,
          id: game?.id,
          year: season?.year,
          week: game?.week,
          homeId,
          awayId,
          home: teamMap[homeId],
          away: teamMap[awayId],
          homeScore: game?.homeScore,
          awayScore: game?.awayScore,
        });
      }
    }

    return rows
      .sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.week) - Number(a.week)))
      .slice(0, 36);
  }, [activeTeam?.id, seasons]);

  if (loading) return <div className="card" style={{ padding: 'var(--space-4)' }}>Loading team history…</div>;

  const ab = activeTeam?.abbr ?? activeTeam?.name ?? 'Team';
  const postseason = summary.postseasonArchivePresent;
  const story = (model.seasons ?? []).length
    ? `${ab} archived ${summary.seasonsArchived} season${summary.seasonsArchived === 1 ? '' : 's'}${postseason ? `, ${summary.playoffAppearances} documented postseason appearance${summary.playoffAppearances === 1 ? '' : 's'}` : ''}${!postseason ? ` and ${summary.playoffCaliberYears} playoff-caliber year${summary.playoffCaliberYears === 1 ? '' : 's'} (${PLAYOFF_CALIBER_WINS}+ wins).` : '.'}`
    : 'Franchise history starts once completed seasons are archived.';

  const droughtLabel = summary.titles === 0
    ? 'No title yet'
    : `${summary.currentTitleDroughtSeasons} season${summary.currentTitleDroughtSeasons === 1 ? '' : 's'}`;

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title={`${activeTeam?.name ?? 'Team'} History`}
        subtitle="Franchise record book, legends, postseason truth, and season-by-season identity."
        onBack={onBack}
        backLabel="History Hub"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <div className="stat-box">
          <div className="stat-label">All-time record</div>
          <div className="stat-value-large" style={{ fontSize: 'clamp(1.1rem, 4vw, 1.35rem)' }}>
            {summary.seasonsArchived ? `${summary.allTimeWins}-${summary.allTimeLosses}${summary.allTimeTies ? `-${summary.allTimeTies}` : ''}` : '—'}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Win %</div>
          <div className="stat-value-large">{summary.seasonsArchived ? formatPct(summary.winPct) : '—'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Titles</div>
          <div className="stat-value-large">{summary.titles}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Runner-up</div>
          <div className="stat-value-large">{summary.runnerUpFinishes}</div>
        </div>
        {postseason ? (
          <div className="stat-box">
            <div className="stat-label">Playoff appearances</div>
            <div className="stat-value-large">{summary.playoffAppearances}</div>
            <div className="stat-label" style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>Documented postseason</div>
          </div>
        ) : (
          <div className="stat-box">
            <div className="stat-label">Playoff-caliber years</div>
            <div className="stat-value-large">{summary.playoffCaliberYears}</div>
            <div className="stat-label" style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>{`${PLAYOFF_CALIBER_WINS}+ wins (no bracket/champion data in this save)`}</div>
          </div>
        )}
        {postseason ? (
          <div className="stat-box">
            <div className="stat-label">Playoff-caliber years</div>
            <div className="stat-value-large">{summary.playoffCaliberYears}</div>
            <div className="stat-label" style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>{`${PLAYOFF_CALIBER_WINS}+ wins`}</div>
          </div>
        ) : null}
        <div className="stat-box">
          <div className="stat-label">Title drought</div>
          <div className="stat-value-large">{droughtLabel}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Avg wins (last 5)</div>
          <div className="stat-value-large">{summary.seasonsArchived ? summary.recentFiveYearAvgWins.toFixed(1) : '—'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Avg pt diff / yr</div>
          <div className="stat-value-large">{summary.seasonsArchived ? summary.avgPointDifferential.toFixed(1) : '—'}</div>
        </div>
      </div>

      <SectionCard title="Franchise memory capsule">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{story}</div>
        {milestones.length ? (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {milestones.map((m) => (
              <li key={m.text}>{m.text}</li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <SectionCard title="Franchise records" subtitle="Single-franchise stats from archived seasons only.">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Team season</div>
        {['wins', 'winPct', 'pointsFor', 'pointsAllowed', 'pointDifferential', 'pointsPerGame', 'pointsAllowedPerGame'].map((k) => {
          const row = franchiseRecords.teamSeason?.[k];
          const detail = row?.year ? `${row.year}` : null;
          return <RecordRow key={k} label={row?.label ?? k} value={row?.value} detail={detail} />;
        })}
        <div style={{ fontWeight: 700, margin: '14px 0 6px' }}>Player single-season (this franchise)</div>
        {RECORD_BOOK_PLAYER_KEYS.map((k) => {
          const row = franchiseRecords.playerSingleSeason?.[k];
          const label = RECORD_LABELS[k];
          const detail = row ? [row.year, row.playerName].filter(Boolean).join(' · ') : 'No leader in archive';
          return <RecordRow key={k} label={label} value={row?.value} detail={detail} />;
        })}
        <div style={{ fontWeight: 700, margin: '14px 0 6px' }}>Career franchise leaders</div>
        {franchiseRecords.careerFranchiseLeadersAvailable ? (
          RECORD_BOOK_PLAYER_KEYS.map((k) => {
            const top = franchiseRecords.careerFranchiseLeaders?.[k]?.[0];
            const label = RECORD_LABELS[k];
            if (!top) return <RecordRow key={`c-${k}`} label={label} value={null} detail="—" />;
            return <RecordRow key={`c-${k}`} label={label} value={top.value} detail={top.playerName} />;
          })
        ) : (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Career totals need per-season player stats stored on archived seasons. This save only carries league-wide stat leaders in each archive.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Franchise legends" subtitle="Hall of Famers, honors, and record-setters tied to this club.">
        {franchiseLegends.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Franchise legends will emerge as seasons archive.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {franchiseLegends.map((leg) => (
              <div key={String(leg.playerId)} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  {leg.playerId != null ? (
                    <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(leg.playerId)} style={{ fontWeight: 700 }}>
                      {leg.name ?? 'Player'}
                    </button>
                  ) : (
                    <strong>{leg.name ?? 'Player'}</strong>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{leg.pos ?? '—'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>{leg.topReason}</div>
                {leg.yearsSummary ? <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{leg.yearsSummary}</div> : null}
                {leg.legacyScore != null ? <div style={{ fontSize: 11, marginTop: 4 }}>Legacy score: {leg.legacyScore}</div> : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Playoff & title history" subtitle={postseason ? 'Titles, runner-up finishes, and bracket snapshots when archived.' : 'Postseason data unavailable for this era of saves — see playoff-caliber years above.'}>
        {playoffHistory.length === 0 ? (
          <EmptyState title="No documented postseason for this franchise yet" body="Win a title, reach the final, or archive seasons with playoff brackets to populate this list." />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {playoffHistory.map((row) => (
              <div key={row.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <strong>{row.year}</strong>
                {' · '}
                <span>{row.role === 'champion' ? 'Champion' : row.role === 'runner_up' ? 'Runner-up' : 'Playoffs'}</span>
                {row.finalsText ? <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{row.finalsText}</div> : null}
                {row.championshipScores ? (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Championship: {row.championshipScores.awayScore ?? '—'}-{row.championshipScores.homeScore ?? '—'}
                    {row.championshipScores.week != null ? ` · Week ${row.championshipScores.week}` : ''}
                  </div>
                ) : null}
                {row.bracketSummary ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{row.bracketSummary}</div>
                ) : postseason && row.role === 'playoffs' ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Postseason bracket not available for this era.</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Best and worst seasons">
        <div style={{ fontSize: 'var(--text-sm)' }}>
          Best:{' '}
          {summary.bestSeason
            ? `${summary.bestSeason.year} (${summary.bestSeason.wins}-${summary.bestSeason.losses}${summary.bestSeason.ties ? `-${summary.bestSeason.ties}` : ''})`
            : '—'}
        </div>
        <div style={{ fontSize: 'var(--text-sm)' }}>
          Worst:{' '}
          {summary.worstSeason
            ? `${summary.worstSeason.year} (${summary.worstSeason.wins}-${summary.worstSeason.losses}${summary.worstSeason.ties ? `-${summary.worstSeason.ties}` : ''})`
            : '—'}
        </div>
      </SectionCard>

      <SectionCard title="Defining games" subtitle="Highlights from notable games and score archives.">
        {bestGames.length === 0 ? (
          <EmptyState title="No scored games in archive yet" body="Complete seasons with final scores unlock this list." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {bestGames.map((row) => {
              const presentation = buildCompletedGamePresentation(row, { seasonId: row.year, week: row.week, source: 'team_history' });
              const clickable = Boolean(presentation.canOpen && onOpenBoxScore);
              return (
                <button
                  key={`def-${row.gameId}-${row.year}-${row.week}`}
                  type="button"
                  className="btn"
                  onClick={() => openResolvedBoxScore(row, { seasonId: row.year, week: row.week, source: 'team_history' }, onOpenBoxScore)}
                  style={{ textAlign: 'left', opacity: clickable ? 1 : 0.7, cursor: clickable ? 'pointer' : 'default' }}
                  title={clickable ? presentation.ctaLabel : presentation.statusLabel}
                >
                  <strong>
                    {row.year} · Week {row.week} · vs {row.opponentAbbr ?? 'OPP'} · {row.away?.abbr ?? 'AWY'} {row.awayScore ?? '—'}-{row.homeScore ?? '—'} {row.home?.abbr ?? 'HME'}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{row.reason}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{clickable ? presentation.ctaLabel : presentation.statusLabel}</div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Season-by-season timeline">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <input
            value={queryYear}
            onChange={(e) => setQueryYear(e.target.value)}
            placeholder="Filter by year"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 160 }}
          />
          {[
            { key: 'all', label: 'All-time' },
            { key: 'playoff', label: 'Playoff-caliber' },
            { key: 'champions', label: 'Championship years' },
            { key: 'elite', label: 'Elite seasons' },
            { key: 'losing', label: 'Losing seasons' },
          ].map((opt) => (
            <button key={opt.key} type="button" className="btn" onClick={() => setScope(opt.key)} style={{ opacity: scope === opt.key ? 1 : 0.7 }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {filteredTimeline.length === 0 ? (
            <EmptyState title="No team history for this filter" body="Adjust filters or archive more seasons." />
          ) : (
            filteredTimeline.slice().reverse().map((s) => (
              <div key={s.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{s.year}</strong>
                  <span>
                    {s.wins}-{s.losses}
                    {s.ties ? `-${s.ties}` : ''}
                    {s.champion ? ' · Champion' : ''}
                    {s.runnerUp ? ' · Runner-up' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  PF {s.pf} · PA {s.pa}
                  {s.truePlayoff ? ' · Postseason (documented)' : s.playoffCaliber ? ' · Playoff-caliber' : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {s.champion ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Title season</span> : null}
                  {s.eliteSeason ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Elite year</span> : null}
                  {s.losingSeason ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Losing season</span> : null}
                </div>
                {s.mvp?.playerId != null ? (
                  <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(s.mvp.playerId)}>
                    League MVP: {s.mvp.name}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="Completed game history">
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {completedGameRows.length === 0 ? (
            <EmptyState title="No archived results yet" body="Completed game links appear here as season history builds." />
          ) : (
            completedGameRows.map((row) => {
              const presentation = buildCompletedGamePresentation(row, { seasonId: row.year, week: row.week, source: 'team_history' });
              const clickable = Boolean(presentation.canOpen && onOpenBoxScore);
              return (
                <button
                  key={`${row.gameId}-${row.year}-${row.week}`}
                  type="button"
                  className="btn"
                  onClick={() => openResolvedBoxScore(row, { seasonId: row.year, week: row.week, source: 'team_history' }, onOpenBoxScore)}
                  style={{ textAlign: 'left', opacity: clickable ? 1 : 0.7, cursor: clickable ? 'pointer' : 'default' }}
                  title={clickable ? presentation.ctaLabel : presentation.statusLabel}
                >
                  <strong>
                    {row.year} · Week {row.week} · {row.away?.abbr ?? 'AWY'} {row.awayScore ?? '—'}-{row.homeScore ?? '—'} {row.home?.abbr ?? 'HME'}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{clickable ? presentation.ctaLabel : presentation.statusLabel}</div>
                </button>
              );
            })
          )}
        </div>
      </SectionCard>
    </div>
  );
}
