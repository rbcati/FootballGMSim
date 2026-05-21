import React, { useEffect, useMemo, useState } from 'react';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { buildFranchiseHistoryModel, PLAYOFF_CALIBER_WINS } from '../../core/franchiseHistoryModel.js';
import { RECORD_BOOK_PLAYER_KEYS, RECORD_LABELS } from '../../core/recordBookV1.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from '../utils/dataBrowser.js';
import { buildActivityLogRows } from '../utils/activityLogViewModel.js';

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

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function seasonToken(value) {
  if (value == null || value === '') return null;
  const raw = String(value);
  const numeric = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : raw;
}

function seasonMatches(row, seasonRow) {
  const wanted = seasonToken(seasonRow?.seasonId ?? seasonRow?.year);
  if (!wanted) return false;
  const candidates = [
    row?.seasonId,
    row?.sourceSeasonId,
    row?.year,
    row?.season,
    row?.meta?.seasonId,
    row?.meta?.year,
    row?.meta?.season,
  ].map(seasonToken).filter(Boolean);
  return candidates.includes(wanted);
}

function teamMatches(row, teamId, teamAbbr) {
  const tid = num(teamId);
  if (tid != null) {
    const candidateIds = [
      row?.teamId,
      row?.id,
      row?.draftTeamId,
      row?.meta?.teamId,
      row?.meta?.draftTeamId,
      ...(Array.isArray(row?.participantTeamIds) ? row.participantTeamIds : []),
    ];
    if (candidateIds.some((id) => num(id) === tid)) return true;
  }
  const want = String(teamAbbr ?? '').trim().toUpperCase();
  if (!want) return false;
  const candidateAbbrs = [
    row?.teamAbbr,
    row?.abbr,
    row?.draftTeamAbbr,
    row?.meta?.team,
    row?.meta?.teamAbbr,
    row?.team?.abbr,
  ];
  return candidateAbbrs.some((abbr) => String(abbr ?? '').trim().toUpperCase() === want);
}

function recordLabel(row) {
  if (!row) return '-';
  return `${row.wins ?? 0}-${row.losses ?? 0}${row.ties ? `-${row.ties}` : ''}`;
}

function playoffResultLabel(row) {
  if (row?.champion) return 'Champion';
  if (row?.runnerUp) return 'Runner-up';
  if (row?.truePlayoff) return 'Postseason appearance';
  if (row?.playoffCaliber) return 'Playoff-caliber season';
  return 'No documented postseason';
}

function formatDiff(value) {
  const n = num(value, 0);
  return `${n > 0 ? '+' : ''}${n}`;
}

function normalizeSeasonGame(season, game, teamId, reason) {
  const teamMap = buildSeasonTeamMap(season);
  const homeId = num(game?.homeId);
  const awayId = num(game?.awayId);
  const homeScore = num(game?.homeScore);
  const awayScore = num(game?.awayScore);
  if (homeId == null || awayId == null || homeScore == null || awayScore == null) return null;
  if (homeId !== num(teamId) && awayId !== num(teamId)) return null;
  return {
    gameId: game?.gameId ?? game?.id,
    id: game?.id ?? game?.gameId,
    year: season?.year,
    seasonId: season?.seasonId ?? season?.id ?? null,
    week: game?.week,
    homeId,
    awayId,
    home: teamMap[homeId],
    away: teamMap[awayId],
    homeScore,
    awayScore,
    margin: Math.abs(homeScore - awayScore),
    total: homeScore + awayScore,
    reason,
  };
}

function buildSeasonKeyGames(season, teamId) {
  const candidates = [];
  const add = (game) => {
    if (!game?.gameId && !game?.id) return;
    const key = `${game.year}-${game.week}-${game.gameId ?? game.id}`;
    if (!candidates.some((row) => `${row.year}-${row.week}-${row.gameId ?? row.id}` === key)) {
      candidates.push(game);
    }
  };

  for (const game of season?.notableGames ?? []) {
    const type = String(game?.type ?? '').toLowerCase();
    const reason = type === 'championship'
      ? 'Championship game'
      : type.includes('playoff')
        ? 'Postseason game'
        : type.includes('highest')
          ? 'High-scoring game'
          : 'Notable game';
    add(normalizeSeasonGame(season, game, teamId, reason));
  }

  const allGames = (season?.gameIndex ?? [])
    .map((game) => normalizeSeasonGame(season, game, teamId, 'Archived game'))
    .filter(Boolean);
  const wins = allGames.filter((game) => {
    const homeTeam = num(game.homeId) === num(teamId);
    return homeTeam ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
  });
  const biggestWin = [...wins].sort((a, b) => b.margin - a.margin || num(a.week, 0) - num(b.week, 0))[0];
  if (biggestWin) add({ ...biggestWin, reason: 'Biggest win' });
  const closest = [...allGames]
    .filter((game) => game.margin > 0)
    .sort((a, b) => a.margin - b.margin || num(b.week, 0) - num(a.week, 0))[0];
  if (closest) add({ ...closest, reason: 'Closest game' });

  return candidates.slice(0, 5);
}

function buildSeasonLeaders(season, teamId, teamAbbr) {
  const rows = [];
  for (const [key, leader] of Object.entries(season?.playerStatLeaders ?? {})) {
    if (!teamMatches(leader, teamId, teamAbbr)) continue;
    rows.push({
      key,
      label: RECORD_LABELS[key] ?? String(key).replace(/([A-Z])/g, ' $1').trim(),
      playerId: leader?.playerId ?? leader?.id ?? null,
      name: leader?.playerName ?? leader?.name ?? 'Player',
      value: leader?.value ?? leader?.stat ?? leader?.total ?? null,
    });
  }
  return rows.slice(0, 5);
}

function buildSeasonHonors(season, teamId, teamAbbr) {
  const rows = [];
  for (const [key, award] of Object.entries(season?.awards ?? {})) {
    if (!award || typeof award !== 'object' || Array.isArray(award)) continue;
    if (!teamMatches(award, teamId, teamAbbr)) continue;
    rows.push({
      key,
      label: String(key).replace(/([A-Z])/g, ' $1').trim().toUpperCase(),
      playerId: award?.playerId ?? award?.id ?? null,
      name: award?.name ?? award?.playerName ?? 'Player',
    });
  }
  return rows.slice(0, 5);
}

function buildSeasonDetail({ seasonRow, seasons, teamId, teamAbbr, majorMoves, draftFlash, league }) {
  if (!seasonRow) return null;
  const archivedSeason = (seasons ?? []).find((season) => {
    const sameYear = num(season?.year) === num(seasonRow?.year);
    const sameId = seasonRow?.seasonId != null && String(season?.seasonId ?? season?.id ?? '') === String(seasonRow.seasonId);
    return sameYear || sameId;
  }) ?? null;
  const moves = buildActivityLogRows({ league, transactions: majorMoves })
    .filter((row) => seasonMatches(row, seasonRow) && teamMatches(row, teamId, teamAbbr))
    .slice(0, 8);
  const draft = (draftFlash ?? [])
    .filter((row) => seasonMatches(row, seasonRow))
    .slice(0, 3);
  return {
    season: archivedSeason,
    seasonRow,
    keyGames: buildSeasonKeyGames(archivedSeason, teamId),
    majorMoves: moves,
    draftFlash: draft,
    leaders: buildSeasonLeaders(archivedSeason, teamId, teamAbbr),
    honors: buildSeasonHonors(archivedSeason, teamId, teamAbbr),
  };
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

const TIMELINE_SORT_OPTIONS = [
  { value: 'year', label: 'Year' },
  { value: 'wins', label: 'Wins' },
  { value: 'losses', label: 'Losses' },
  { value: 'playoffResult', label: 'Playoff result' },
  { value: 'pf', label: 'Points for' },
  { value: 'pointDifferential', label: 'Point diff' },
];

function timelinePlayoffResultValue(row) {
  if (row?.champion) return 4;
  if (row?.runnerUp) return 3;
  if (row?.truePlayoff) return 2;
  if (row?.playoffCaliber) return 1;
  return 0;
}

function buildTimelineSearchText(row) {
  return [
    row?.year,
    row?.teamAbbr,
    `${row?.wins ?? 0}-${row?.losses ?? 0}${row?.ties ? `-${row.ties}` : ''}`,
    row?.champion ? 'champion title season' : '',
    row?.runnerUp ? 'runner up finals' : '',
    row?.truePlayoff ? 'documented postseason playoff bracket' : '',
    row?.playoffCaliber ? 'playoff caliber' : '',
    row?.eliteSeason ? 'elite season' : '',
    row?.losingSeason ? 'losing season' : '',
    row?.mvp?.name,
  ].filter(Boolean).join(' ');
}

export default function TeamHistoryScreen({ league, actions, teamId, onPlayerSelect, onBack, onOpenBoxScore, onOpenDraftHistory }) {
  const [seasons, setSeasons] = useState([]);
  const [hofPlayers, setHofPlayers] = useState([]);
  const [hofClasses, setHofClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineSortKey, setTimelineSortKey] = useState('year');
  const [timelineSortDir, setTimelineSortDir] = useState('desc');
  const [scope, setScope] = useState('all');
  const [majorMoves, setMajorMoves] = useState([]);
  const [draftFlash, setDraftFlash] = useState([]);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState(null);

  const activeTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(teamId ?? league?.userTeamId)),
    [league?.teams, league?.userTeamId, teamId],
  );

  useEffect(() => {
    setSelectedSeasonKey(null);
  }, [activeTeam?.id]);

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

  useEffect(() => {
    let cancelled = false;
    const tid = activeTeam?.id;
    if (tid == null || !actions?.getTransactions) {
      setMajorMoves([]);
      return () => { cancelled = true; };
    }
    actions
      .getTransactions({ teamId: Number(tid), limit: 120 })
      .then((res) => {
        if (cancelled) return;
        const rows = res?.payload?.transactions ?? [];
        const sorted = [...rows].sort((a, b) => {
          const sa = String(b?.seasonId ?? '').localeCompare(String(a?.seasonId ?? ''));
          if (sa !== 0) return sa;
          const wa = Number(b?.week ?? 0) - Number(a?.week ?? 0);
          if (wa !== 0) return wa;
          return Number(b?.id ?? 0) - Number(a?.id ?? 0);
        });
        setMajorMoves(sorted.slice(0, 120));
      })
      .catch(() => {
        if (!cancelled) setMajorMoves([]);
      });
    return () => { cancelled = true; };
  }, [actions, activeTeam?.id]);

  useEffect(() => {
    let cancelled = false;
    const tid = Number(activeTeam?.id);
    if (!Number.isFinite(tid) || !actions?.getDraftClasses || !actions?.getDraftClass) {
      setDraftFlash([]);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const res = await actions.getDraftClasses();
        const list = res?.payload?.classes ?? [];
        const mine = list.filter((c) => Array.isArray(c.teamIds) && c.teamIds.includes(tid)).slice(0, 4);
        const rows = [];
        for (const entry of mine) {
          if (cancelled) return;
          const mRes = await actions.getDraftClass({ seasonId: entry.seasonId }).catch(() => null);
          const m = mRes?.payload?.model;
          if (!m?.picks?.length) continue;
          const g = (m.teamGrades || []).find((x) => Number(x.teamId) === tid);
          const teamPicks = m.picks.filter((p) => Number(p.draftTeamId) === tid);
          const best = [...teamPicks].sort((a, b) => Number(b.legacyScore ?? 0) - Number(a.legacyScore ?? 0))[0];
          const steal = teamPicks.filter((p) => Number(p.redraftDelta) >= 40).sort((a, b) => Number(b.redraftDelta) - Number(a.redraftDelta))[0];
          rows.push({
            year: entry.year ?? m.year,
            seasonId: entry.seasonId,
            grade: g?.gradeLabel ?? '—',
            bestName: best?.playerName,
            stealName: steal?.playerName,
            pickCount: teamPicks.length,
          });
        }
        if (!cancelled) setDraftFlash(rows);
      } catch {
        if (!cancelled) setDraftFlash([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actions, activeTeam?.id]);

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
      return rowMatchesSearch(row, timelineSearch, [
        'year',
        'wins',
        'losses',
        'ties',
        'pf',
        'pa',
        buildTimelineSearchText,
      ]);
    });
  }, [model.seasons, scope, timelineSearch]);

  const timelineRows = useMemo(() => {
    const getSortValue = (row) => {
      if (timelineSortKey === 'playoffResult') return timelinePlayoffResultValue(row);
      if (timelineSortKey === 'pointDifferential') {
        return Number(row?.pointDifferential ?? (Number(row?.pf ?? 0) - Number(row?.pa ?? 0)));
      }
      return row?.[timelineSortKey];
    };
    return stableSortRows(filteredTimeline, getSortValue, timelineSortDir, (row) => row?.year);
  }, [filteredTimeline, timelineSortDir, timelineSortKey]);

  const hasTimelineFilters = Boolean(timelineSearch.trim()) || scope !== 'all' || timelineSortKey !== 'year' || timelineSortDir !== 'desc';

  const selectedSeasonRow = useMemo(() => {
    if (!selectedSeasonKey) return null;
    return (model.seasons ?? []).find((row) => String(row?.seasonId ?? row?.year) === String(selectedSeasonKey)) ?? null;
  }, [model.seasons, selectedSeasonKey]);

  const selectedSeasonDetail = useMemo(() => buildSeasonDetail({
    seasonRow: selectedSeasonRow,
    seasons,
    teamId: activeTeam?.id,
    teamAbbr: activeTeam?.abbr,
    majorMoves,
    draftFlash,
    league,
  }), [activeTeam?.abbr, activeTeam?.id, draftFlash, league, majorMoves, seasons, selectedSeasonRow]);

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

      <SectionCard title="Draft classes" subtitle="Recent classes where this franchise held picks (from DRAFT transaction log).">
        <div data-testid="team-history-draft-classes">
        {draftFlash.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No logged draft classes yet for this team, or data is still accumulating. Open Draft History for the full redraft board.
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {draftFlash.map((d) => (
              <li key={d.seasonId} style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--text)' }}>{d.year ?? d.seasonId}</strong>
                {` · Grade ${d.grade} · ${d.pickCount} pick${d.pickCount === 1 ? '' : 's'}`}
                {d.bestName ? <span>{` · Best: ${d.bestName}`}</span> : null}
                {d.stealName ? <span style={{ color: 'var(--success)' }}>{` · Value: ${d.stealName}`}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {typeof onOpenDraftHistory === 'function' ? (
          <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => onOpenDraftHistory()}>
            Open Draft History
          </button>
        ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Major moves" subtitle="Recent signings, trades, draft picks, and releases involving this franchise (from transaction log).">
        {majorMoves.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No structured transactions yet for this team. Moves appear after signings, trades, draft picks, and releases are logged during your dynasty.
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {majorMoves.slice(0, 15).map((tx, idx) => (
              <li
                key={`${tx.id ?? idx}-${idx}`}
                style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '8px 10px', fontSize: 'var(--text-sm)' }}
                data-testid={`team-history-major-move-${idx}`}
              >
                <div style={{ fontWeight: 700 }}>{tx.headline ?? tx.typeLabel ?? 'Move'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tx.typeLabel ?? tx.type}
                  {tx.week != null ? ` · Week ${tx.week}` : ''}
                </div>
                {tx.playerId != null ? (
                  <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => onPlayerSelect?.(tx.playerId)}>
                    {tx.playerName ?? 'Player profile'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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

      <SectionCard title="Season-by-season timeline" subtitle="Tap View season to open the archived season recap without changing your filters.">
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              aria-label="Search team history seasons"
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Search year, result, phase, MVP"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 220, flex: '1 1 220px' }}
            />
            <select
              aria-label="Sort team history seasons"
              value={timelineSortKey}
              onChange={(e) => setTimelineSortKey(e.target.value)}
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 150 }}
            >
              {TIMELINE_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Toggle team history season sort direction"
              onClick={() => setTimelineSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            >
              {timelineSortDir === 'desc' ? 'Newest/highest first' : 'Oldest/lowest first'}
            </button>
            {hasTimelineFilters ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setTimelineSearch('');
                  setTimelineSortKey('year');
                  setTimelineSortDir('desc');
                  setScope('all');
                }}
              >
                Reset filters
              </button>
            ) : null}
          </div>
          <div
            data-testid="team-history-timeline-count"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
          >
            <span>{buildShowingLabel(timelineRows.length, model.seasons?.length ?? 0, 'season')}</span>
            <span>
              Sort: {TIMELINE_SORT_OPTIONS.find((opt) => opt.value === timelineSortKey)?.label ?? timelineSortKey} {timelineSortDir === 'asc' ? '↑' : '↓'}
            </span>
            {scope !== 'all' ? <span>Scope: {scope}</span> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
        </div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {timelineRows.length === 0 ? (
            <EmptyState title="No team history for this filter" body="Adjust filters or archive more seasons." />
          ) : (
            timelineRows.map((s) => (
              <div
                key={s.year}
                data-testid={`team-history-season-${s.year}`}
                style={{
                  border: selectedSeasonKey === String(s.seasonId ?? s.year) ? '1px solid var(--accent)' : '1px solid var(--hairline)',
                  borderRadius: 10,
                  padding: 10,
                  background: selectedSeasonKey === String(s.seasonId ?? s.year) ? 'var(--surface)' : 'transparent',
                }}
              >
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
                  {s.pointDifferential != null ? ` · Diff ${s.pointDifferential > 0 ? '+' : ''}${s.pointDifferential}` : ''}
                  {s.truePlayoff ? ' · Postseason (documented)' : s.playoffCaliber ? ' · Playoff-caliber' : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {s.champion ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Title season</span> : null}
                  {s.eliteSeason ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Elite year</span> : null}
                  {s.losingSeason ? <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}>Losing season</span> : null}
                  <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px', color: 'var(--text-muted)' }}>Season detail</span>
                </div>
                {s.mvp?.playerId != null ? (
                  <button type="button" className="btn-link" onClick={() => onPlayerSelect?.(s.mvp.playerId)}>
                    League MVP: {s.mvp.name}
                  </button>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className={selectedSeasonKey === String(s.seasonId ?? s.year) ? 'btn btn-sm btn-secondary' : 'btn btn-sm'}
                    onClick={() => setSelectedSeasonKey(String(s.seasonId ?? s.year))}
                    aria-label={selectedSeasonKey === String(s.seasonId ?? s.year) ? `${s.year} season selected` : `View ${s.year} season detail`}
                    data-testid={`team-history-view-season-${s.year}`}
                    style={{ minHeight: 36 }}
                  >
                    {selectedSeasonKey === String(s.seasonId ?? s.year) ? 'Season selected' : 'View season'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {selectedSeasonDetail ? (
        <SectionCard
          title={`${selectedSeasonDetail.seasonRow.year} Season Detail`}
          subtitle="Season summary, postseason finish, biggest games, and front office context from the archive."
        >
          <div data-testid="team-history-season-detail" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0 }}>Season archive</div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {selectedSeasonDetail.seasonRow.year} - {recordLabel(selectedSeasonDetail.seasonRow)}
                </div>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedSeasonKey(null)}>
                Back to all seasons
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
              <div className="stat-box" data-testid="team-history-season-detail-record">
                <div className="stat-label">Record</div>
                <div className="stat-value-large">{recordLabel(selectedSeasonDetail.seasonRow)}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">PF / PA</div>
                <div className="stat-value-large" style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)' }}>
                  {selectedSeasonDetail.seasonRow.pf ?? '-'} / {selectedSeasonDetail.seasonRow.pa ?? '-'}
                </div>
              </div>
              <div className="stat-box" data-testid="team-history-season-detail-diff">
                <div className="stat-label">Point diff</div>
                <div className="stat-value-large">{formatDiff(selectedSeasonDetail.seasonRow.pointDifferential)}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Postseason/title finish</div>
                <div className="stat-value-large" style={{ fontSize: 'clamp(0.95rem, 4vw, 1.15rem)' }}>
                  {playoffResultLabel(selectedSeasonDetail.seasonRow)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Biggest games</div>
                {selectedSeasonDetail.keyGames.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No scored game rows were saved for this season.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedSeasonDetail.keyGames.map((row) => {
                      const presentation = buildCompletedGamePresentation(row, { seasonId: row.year, week: row.week, source: 'team_history_season_detail' });
                      const clickable = Boolean(presentation.canOpen && onOpenBoxScore);
                      return (
                        <button
                          key={`${row.reason}-${row.gameId ?? row.id}-${row.week}`}
                          type="button"
                          className="btn"
                          data-testid="team-history-season-detail-game"
                          disabled={!clickable}
                          onClick={clickable ? () => openResolvedBoxScore(row, { seasonId: row.year, week: row.week, source: 'team_history_season_detail' }, onOpenBoxScore) : undefined}
                          style={{ textAlign: 'left', opacity: clickable ? 1 : 0.7, cursor: clickable ? 'pointer' : 'default' }}
                          title={clickable ? presentation.ctaLabel : presentation.statusLabel}
                        >
                          <strong>
                            {row.reason} - Week {row.week ?? '-'}
                          </strong>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            {row.away?.abbr ?? 'AWY'} {row.awayScore ?? '-'}-{row.homeScore ?? '-'} {row.home?.abbr ?? 'HME'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{clickable ? presentation.ctaLabel : 'Game Book unavailable'}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Front office moves</div>
                {selectedSeasonDetail.majorMoves.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No trades, signings, contracts, draft picks, or releases were logged for this team season.</div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {selectedSeasonDetail.majorMoves.map((move) => (
                      <li key={move.id} data-testid="team-history-season-detail-move" style={{ fontSize: 'var(--text-sm)' }}>
                        <strong>{move.label}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{move.summary}</div>
                        {move.week != null ? <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Week {move.week}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Draft snapshot</div>
                {selectedSeasonDetail.draftFlash.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No draft class snapshot is linked to this season yet.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    {selectedSeasonDetail.draftFlash.map((row) => (
                      <li key={row.seasonId}>
                        <strong style={{ color: 'var(--text)' }}>Grade {row.grade}</strong>
                        {` - ${row.pickCount} pick${row.pickCount === 1 ? '' : 's'}`}
                        {row.bestName ? ` - Best: ${row.bestName}` : ''}
                        {row.stealName ? ` - Value: ${row.stealName}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Leaders and honors</div>
                {selectedSeasonDetail.leaders.length === 0 && selectedSeasonDetail.honors.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No team-matched leader or award rows were saved for this season.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedSeasonDetail.leaders.map((leader) => (
                      <div key={`leader-${leader.key}`} style={{ fontSize: 'var(--text-sm)' }}>
                        <strong>{leader.label}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {leader.name}{leader.value != null ? ` - ${leader.value}` : ''}
                        </div>
                      </div>
                    ))}
                    {selectedSeasonDetail.honors.map((honor) => (
                      <div key={`honor-${honor.key}`} style={{ fontSize: 'var(--text-sm)' }}>
                        <strong>{honor.label}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{honor.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

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
