import React, { useEffect, useMemo, useState } from 'react';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';
import { buildCompletedGamePresentation, openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from '../utils/dataBrowser.js';
import { buildFranchiseHistoryModel, PLAYOFF_CALIBER_WINS } from '../../core/franchiseHistoryModel.js';
import { RECORD_BOOK_PLAYER_KEYS, RECORD_LABELS } from '../../core/recordBookV1.js';
import { stableSortRows, buildShowingLabel } from '../utils/dataBrowser.js';
import { buildShowingLabel, stableSortRows } from '../utils/dataBrowser.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from '../utils/dataBrowser.js';
import { stableSortRows, buildShowingLabel } from '../utils/dataBrowser.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from '../utils/dataBrowser.js';

const TIMELINE_SORT_OPTIONS = [
  { value: 'yearDesc', label: 'Year (newest)', key: 'year', direction: 'desc' },
  { value: 'yearAsc', label: 'Year (oldest)', key: 'year', direction: 'asc' },
  { value: 'winsDesc', label: 'Wins (most)', key: 'wins', direction: 'desc' },
  { value: 'winsAsc', label: 'Wins (fewest)', key: 'wins', direction: 'asc' },
  { value: 'pfDesc', label: 'Points for', key: 'pf', direction: 'desc' },
  { value: 'paAsc', label: 'Points against (fewest)', key: 'pa', direction: 'asc' },
  { value: 'diffDesc', label: 'Point diff (best)', key: 'pointDifferential', direction: 'desc' },
];

const TIMELINE_SORT_BY_VALUE = TIMELINE_SORT_OPTIONS.reduce((acc, opt) => {
  acc[opt.value] = opt;
  return acc;
}, {});

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

function teamSeasonResultLabel(row) {
  if (row?.champion) return 'Champion';
  if (row?.runnerUp) return 'Runner-up';
  if (row?.truePlayoff) return 'Documented postseason';
  if (row?.playoffCaliber) return 'Playoff-caliber';
  if (row?.eliteSeason) return 'Elite season';
  if (row?.losingSeason) return 'Losing season';
  return 'Archived season';
}

function teamSeasonSortValue(row, sortKey) {
  if (sortKey === 'wins') return row?.wins;
  if (sortKey === 'losses') return row?.losses;
  if (sortKey === 'pf') return row?.pf;
  if (sortKey === 'pa') return row?.pa;
  if (sortKey === 'pointDifferential') return row?.pointDifferential;
  if (sortKey === 'result') return teamSeasonResultLabel(row);
  return row?.year;
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
  const [seasonQueryText, setSeasonQueryText] = useState('');
  const [scope, setScope] = useState('all');
  const [timelineSortKey, setTimelineSortKey] = useState('year');
  const [timelineSortDir, setTimelineSortDir] = useState('desc');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineSortKey, setTimelineSortKey] = useState('year');
  const [timelineSortDir, setTimelineSortDir] = useState('desc');
  const [scope, setScope] = useState('all');
  const [sortKey, setSortKey] = useState('year');
  const [sortDir, setSortDir] = useState('desc');
  const [sortField, setSortField] = useState('year');
  const [sortDir, setSortDir] = useState('desc');
  const [timelineSort, setTimelineSort] = useState('yearDesc');
  const [timelineSort, setTimelineSort] = useState({ key: 'year', dir: 'desc' });
  const [majorMoves, setMajorMoves] = useState([]);
  const [draftFlash, setDraftFlash] = useState([]);

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
        setMajorMoves(sorted.slice(0, 15));
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

  const scopeFilteredSeasonRows = useMemo(
    () =>
      (model.seasons ?? []).filter((row) => {
        if (scope === 'champions' && !row.champion) return false;
        if (scope === 'playoff' && !row.playoffCaliber) return false;
        if (scope === 'losing' && !row.losingSeason) return false;
        if (scope === 'elite' && !row.eliteSeason) return false;
        return true;
      }),
    [model.seasons, scope],
  );

  const searchFilteredSeasonRows = useMemo(
    () =>
      scopeFilteredSeasonRows.filter((row) =>
        rowMatchesSearch(row, seasonQueryText, [
          'year',
          (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`,
          (r) => (r.champion ? 'champion title ring' : ''),
          (r) => (r.runnerUp ? 'runner-up finalist' : ''),
          (r) => (r.truePlayoff ? 'postseason playoffs bracket' : ''),
          (r) => (r.playoffCaliber ? 'playoff-caliber' : ''),
          (r) => (r.eliteSeason ? 'elite' : ''),
          (r) => (r.losingSeason ? 'losing season' : ''),
          (r) => r.mvp?.name,
          (r) => r.pf,
          (r) => r.pa,
          (r) => r.pointDifferential,
        ]),
      ),
    [scopeFilteredSeasonRows, seasonQueryText],
  );

  const displaySeasonTimeline = useMemo(() => {
    const getters = {
      year: (r) => Number(r.year ?? 0),
      wins: (r) => Number(r.wins ?? 0),
      losses: (r) => Number(r.losses ?? 0),
      pf: (r) => Number(r.pf ?? 0),
      pa: (r) => Number(r.pa ?? 0),
      winPct: (r) => Number(r.winPct ?? 0),
    };
    const get = getters[timelineSortKey] ?? getters.year;
    return stableSortRows(searchFilteredSeasonRows, get, timelineSortDir, (r) => Number(r.year ?? 0));
  }, [searchFilteredSeasonRows, timelineSortKey, timelineSortDir]);

  const seasonTimelineShowingLabel = buildShowingLabel(
    displaySeasonTimeline.length,
    scopeFilteredSeasonRows.length,
    'season',
  );
  const totalTimeline = (model.seasons ?? []).length;

  const filteredTimeline = useMemo(() => {
    const filtered = (model.seasons ?? []).filter((row) => {
    const rows = (model.seasons ?? []).filter((row) => {
      if (scope === 'champions' && !row.champion) return false;
      if (scope === 'playoff' && !row.playoffCaliber) return false;
      if (scope === 'losing' && !row.losingSeason) return false;
      if (scope === 'elite' && !row.eliteSeason) return false;
      const trimmed = queryYear.trim();
      if (!trimmed) return true;
      if (String(row.year).includes(trimmed)) return true;
      return rowMatchesSearch(
        row,
        trimmed,
        [(r) => r?.mvp?.name ?? '', (r) => (r?.champion ? 'champion' : '')],
      );
    });
    const sortDef = TIMELINE_SORT_BY_VALUE[timelineSort] ?? TIMELINE_SORT_BY_VALUE.yearDesc;
    return stableSortRows(
      filtered,
      (r) => r?.[sortDef.key],
      sortDef.direction,
      (r) => r?.year,
    );
  }, [model.seasons, queryYear, scope, timelineSort]);

  const filtersActive = Boolean(queryYear.trim()) || scope !== 'all' || timelineSort !== 'yearDesc';
  const resetTimelineFilters = () => {
    setQueryYear('');
    setScope('all');
    setTimelineSort('yearDesc');
  };
      return rowMatchesSearch(row, queryYear, [
        'year',
        'wins',
        'losses',
        'pf',
        'pa',
        (r) => `${r?.wins ?? 0}-${r?.losses ?? 0}${r?.ties ? `-${r.ties}` : ''}`,
        (r) => teamSeasonResultLabel(r),
        (r) => r?.mvp?.name,
      ]);
    });
    return stableSortRows(filtered, (r) => r[sortField] ?? r.year, sortDir);
  }, [model.seasons, queryYear, scope, sortField, sortDir]);
    return stableSortRows(rows, (row) => teamSeasonSortValue(row, timelineSort.key), timelineSort.dir, (row) => row?.year);
  }, [model.seasons, queryYear, scope, timelineSort]);

  const resetTimelineFilters = () => {
    setQueryYear('');
    setScope('all');
    setTimelineSort({ key: 'year', dir: 'desc' });
  };
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
    return stableSortRows(filtered, sortKey, sortDir);
  }, [model.seasons, queryYear, scope, sortKey, sortDir]);

  const totalSeasonCount = (model.seasons ?? []).length;
  const hasActiveFilters = scope !== 'all' || queryYear.trim() !== '';
  const resetFilters = () => { setQueryYear(''); setScope('all'); setSortKey('year'); setSortDir('desc'); };
  const toggleSort = (key) => {
    if (sortKey === key) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir(key === 'year' ? 'desc' : 'desc'); }
  };
    const getValue = (row) => {
      if (sortKey === 'wins') return row.wins ?? 0;
      if (sortKey === 'losses') return row.losses ?? 0;
      if (sortKey === 'pf') return row.pf ?? 0;
      if (sortKey === 'pa') return row.pa ?? 0;
      return row.year ?? 0;
    };
    return stableSortRows(filtered, getValue, sortDir, (r) => r.year ?? 0);
  }, [model.seasons, queryYear, scope, sortKey, sortDir]);

  const timelineShowingLabel = useMemo(
    () => buildShowingLabel(filteredTimeline.length, (model.seasons ?? []).length, 'season'),
    [filteredTimeline.length, model.seasons],
  );

  const toggleTimelineSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'year' ? 'desc' : 'desc');
    }
  };

  const resetTimelineFilters = () => {
    setQueryYear('');
    setScope('all');
    setSortKey('year');
    setSortDir('desc');
  };
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
            {majorMoves.map((tx, idx) => (
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

      <SectionCard title="Season-by-season timeline" subtitle="Search and sort archived franchise seasons. Counts reflect the current scope chips.">
        {(model.seasons ?? []).length === 0 ? (
          <EmptyState
            title="No franchise seasons in the archive yet"
            body="Finish and archive seasons to unlock year-by-year records, tags, and MVP links for this team."
          />
        ) : (
          <div data-testid="team-history-season-timeline">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <input
                value={seasonQueryText}
                onChange={(e) => setSeasonQueryText(e.target.value)}
                placeholder="Search year, record, MVP, PF/PA…"
                aria-label="Search franchise seasons"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: 'var(--text)',
                  minWidth: 0,
                  flex: '1 1 160px',
                  maxWidth: '100%',
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>Sort</span>
                <select
                  value={timelineSortKey}
                  onChange={(e) => setTimelineSortKey(e.target.value)}
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '4px 8px', color: 'var(--text)' }}
                >
                  <option value="year">Year</option>
                  <option value="wins">Wins</option>
                  <option value="losses">Losses</option>
                  <option value="pf">Points for</option>
                  <option value="pa">Points allowed</option>
                  <option value="winPct">Win %</option>
                </select>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setTimelineSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  aria-label={`Sort direction ${timelineSortDir === 'asc' ? 'ascending' : 'descending'}`}
                >
                  {timelineSortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
                </button>
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSeasonQueryText('');
                  setScope('all');
                  setTimelineSortKey('year');
                  setTimelineSortDir('desc');
      <SectionCard title="Season-by-season timeline">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <input
            value={queryYear}
            onChange={(e) => setQueryYear(e.target.value)}
            placeholder="Filter by year"
            data-testid="team-history-year-filter"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 120, maxWidth: 160 }}
            aria-label="Filter by year"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 120, maxWidth: 160 }}
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 130 }}
        <div
          data-testid="team-history-timeline-controls"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}
        >
          <input
            value={queryYear}
            onChange={(e) => setQueryYear(e.target.value)}
            placeholder="Search year or MVP"
            aria-label="Search seasons by year or MVP"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 160, flex: '1 1 160px' }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Sort
            <select
              value={timelineSort}
              onChange={(e) => setTimelineSort(e.target.value)}
              aria-label="Sort seasons"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 8px', color: 'var(--text)' }}
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            value={queryYear}
            onChange={(e) => setQueryYear(e.target.value)}
            placeholder="Search year, record, result, MVP"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 160 }}
            aria-label="Search team seasons"
          />
          <select
            value={timelineSort.key}
            onChange={(e) => setTimelineSort((curr) => ({ ...curr, key: e.target.value }))}
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)' }}
            aria-label="Sort team seasons"
          >
            <option value="year">Sort: Year</option>
            <option value="wins">Sort: Wins</option>
            <option value="losses">Sort: Losses</option>
            <option value="pf">Sort: Points for</option>
            <option value="pa">Sort: Points allowed</option>
            <option value="pointDifferential">Sort: Point diff</option>
            <option value="result">Sort: Result</option>
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => setTimelineSort((curr) => ({ ...curr, dir: curr.dir === 'asc' ? 'desc' : 'asc' }))}
          >
            {timelineSort.dir === 'asc' ? 'Asc' : 'Desc'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetTimelineFilters}>
            Reset filters
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {buildShowingLabel(filteredTimeline.length, model.seasons?.length ?? 0, 'season')}
          </span>
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
          </label>
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
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
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
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>{seasonTimelineShowingLabel}</div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflow: 'auto' }}>
              {displaySeasonTimeline.length === 0 ? (
                <EmptyState
                  title="No seasons match these filters"
                  body="Clear search text, reset filters, or pick a different scope to see the full franchise timeline."
                />
              ) : (
                displaySeasonTimeline.map((s) => (
                  <div
                    key={String(s.seasonId ?? `year-${s.year}`)}
                    style={{
                      border: '1px solid var(--hairline)',
                      borderRadius: 8,
                      padding: 'clamp(6px, 2vw, 10px)',
                      fontSize: 'clamp(0.72rem, 2.8vw, var(--text-sm))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
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
          </div>
        )}
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
            <button key={opt.key} type="button" className="btn" onClick={() => setScope(opt.key)} style={{ opacity: scope === opt.key ? 1 : 0.7, fontSize: 'var(--text-xs)' }}>
              {opt.label}
            </button>
          ))}
          {hasActiveFilters ? (
            <button type="button" className="btn btn-secondary" onClick={resetFilters} style={{ fontSize: 'var(--text-xs)' }} data-testid="team-history-reset-filters">
              Reset
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} data-testid="team-history-showing-label">
            {buildShowingLabel(filteredTimeline.length, totalSeasonCount, 'seasons')}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>·</span>
          {(queryYear || scope !== 'all' || sortKey !== 'year' || sortDir !== 'desc') ? (
            <button type="button" className="btn btn-secondary" onClick={resetTimelineFilters} style={{ fontSize: 'var(--text-xs)' }}>
              Reset filters
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: 4 }}>Sort by:</span>
          {[
            { key: 'year', label: 'Year' },
            { key: 'wins', label: 'Wins' },
            { key: 'losses', label: 'Losses' },
            { key: 'pf', label: 'PF' },
            { key: 'pa', label: 'PA' },
          ].map((col) => (
            <button
              key={col.key}
              type="button"
              className="btn"
              onClick={() => toggleSort(col.key)}
              data-testid={`team-history-sort-${col.key}`}
              style={{ fontSize: 11, opacity: sortKey === col.key ? 1 : 0.6, padding: '2px 8px', minWidth: 0 }}
            >
              {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>

              onClick={() => toggleTimelineSort(col.key)}
              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', opacity: sortKey === col.key ? 1 : 0.6 }}
              data-testid={`team-history-sort-${col.key}`}
            >
              {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }} data-testid="team-history-showing-label">
          {timelineShowingLabel}
          {filtersActive ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetTimelineFilters}
              data-testid="team-history-timeline-reset"
            >
              Reset filters
            </button>
          ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>Sort:</span>
          {[
            { key: 'year', label: 'Year' },
            { key: 'wins', label: 'Wins' },
            { key: 'losses', label: 'Losses' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="btn"
              onClick={() => {
                if (sortField === opt.key) {
                  setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField(opt.key);
                  setSortDir(opt.key === 'year' ? 'desc' : 'desc');
                }
              }}
              style={{ fontSize: 'var(--text-xs)', opacity: sortField === opt.key ? 1 : 0.6, fontWeight: sortField === opt.key ? 700 : 400 }}
              aria-pressed={sortField === opt.key}
            >
              {opt.label}{sortField === opt.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setQueryYear(''); setScope('all'); setSortField('year'); setSortDir('desc'); }}
            style={{ fontSize: 'var(--text-xs)', marginLeft: 4 }}
            data-testid="team-history-reset-filters"
          >
            Reset
          </button>
          <span
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 4 }}
            data-testid="team-history-showing-label"
          >
            {buildShowingLabel(filteredTimeline.length, (model.seasons ?? []).length, 'season')}
          </span>
        </div>
        {totalTimeline > 0 ? (
          <div
            data-testid="team-history-timeline-count"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}
          >
            {buildShowingLabel(filteredTimeline.length, totalTimeline, 'season')}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {filteredTimeline.length === 0 ? (
            <EmptyState title={(model.seasons ?? []).length ? 'No team history for this filter' : 'No archived team seasons yet'} body={(model.seasons ?? []).length ? 'Adjust filters or archive more seasons.' : 'Complete and archive seasons to populate this franchise timeline.'} />
          ) : (
            filteredTimeline.map((s) => (
              <div key={s.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }} data-testid="team-history-season-row">
          {timelineRows.length === 0 ? (
            <EmptyState title="No team history for this filter" body="Adjust filters or archive more seasons." />
          ) : (
            filteredTimeline.map((s) => (
              <div key={s.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }} data-testid={`team-history-season-${s.year}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div key={s.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
            timelineRows.map((s) => (
              <div key={s.year} data-testid={`team-history-season-${s.year}`} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{s.year}</strong>
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    {s.wins}-{s.losses}
                    {s.ties ? `-${s.ties}` : ''}
                    {s.champion ? ' · Champion' : ''}
                    {s.runnerUp ? ' · Runner-up' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {teamSeasonResultLabel(s)} · PF {s.pf} · PA {s.pa} · Diff {s.pointDifferential}
                  PF {s.pf} · PA {s.pa}
                  {s.pointDifferential != null ? ` · Diff ${s.pointDifferential > 0 ? '+' : ''}${s.pointDifferential}` : ''}
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
