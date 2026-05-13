import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from "../utils/dataBrowser.js";
import { AWARD_DISPLAY_NAMES } from '../../core/footballMeta';
import { buildLeagueHistoryTopPerformers } from '../../core/playerSeasonStatsArchive.js';
import { normalizeArchivedMajorTransactions } from '../../core/transactionTimeline.js';
import { normalizeSearchText, rowMatchesSearch, stableSortRows, buildShowingLabel } from '../utils/dataBrowser.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from "../utils/dataBrowser.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from '../utils/dataBrowser.js';
import { rowMatchesSearch, buildShowingLabel } from "../utils/dataBrowser.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from '../utils/dataBrowser.js';

const AWARDS_HISTORY_SORTS = {
  yearDesc: { label: 'Year (newest)', getValue: (s) => Number(s?.year ?? 0), direction: 'desc' },
  yearAsc: { label: 'Year (oldest)', getValue: (s) => Number(s?.year ?? 0), direction: 'asc' },
  champion: { label: 'Champion', getValue: (s) => s?.champion?.abbr ?? '', direction: 'asc' },
  mvp: { label: 'MVP name', getValue: (s) => s?.awards?.mvp?.name ?? '', direction: 'asc' },
};
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from "../utils/dataBrowser.js";

const RECORD_LABELS = {
  passYd: "Passing Yards",
  rushYd: "Rushing Yards",
  recYd: "Receiving Yards",
  passTD: "Passing TDs",
  sacks: "Sacks",
};

const POSITION_STAT_KEYS = {
  QB: ["passYd", "passTD", "interceptions", "passComp", "passAtt"],
  RB: ["rushYd", "rushTD", "rushAtt", "receptions", "recYd"],
  WR: ["receptions", "recYd", "recTD", "targets", "yardsAfterCatch"],
  TE: ["receptions", "recYd", "recTD", "targets"],
  DL: ["tackles", "sacks", "forcedFumbles", "pressures"],
  LB: ["tackles", "sacks", "interceptions", "forcedFumbles"],
  CB: ["interceptions", "passesDefended", "tackles"],
  S: ["interceptions", "tackles", "passesDefended"],
};

const STAT_LABELS = {
  passYd: "Pass Yds",
  passTD: "Pass TD",
  interceptions: "INT",
  passComp: "Cmp",
  passAtt: "Att",
  rushYd: "Rush Yds",
  rushTD: "Rush TD",
  rushAtt: "Car",
  receptions: "Rec",
  recYd: "Rec Yds",
  recTD: "Rec TD",
  targets: "Tgt",
  yardsAfterCatch: "YAC",
  tackles: "Tkl",
  sacks: "Sacks",
  forcedFumbles: "FF",
  pressures: "Pres",
  passesDefended: "PD",
};
const NOOP_ACTIONS = {};
const AWARD_KEYS = ["mvp", "opoy", "dpoy", "roty", "sbMvp"];
const AWARDS_V1_EXTRA = ["oroy", "droy", "bestQB", "bestRB", "bestWrTe", "bestDefensivePlayer", "bestKicker"];
const AWARDS_V1_LABELS = {
  bestQB: "Best QB",
  bestRB: "Best RB",
  bestWrTe: "Best WR/TE",
  bestDefensivePlayer: "Best Defensive Player",
  bestKicker: "Best Kicker",
};

const PLAYER_LEADER_LABELS = {
  passingYards: "Passing yards",
  passingTd: "Passing TD",
  rushingYards: "Rushing yards",
  rushingTd: "Rushing TD",
  receivingYards: "Receiving yards",
  receivingTd: "Receiving TD",
  tackles: "Tackles",
  sacks: "Sacks",
  interceptions: "Interceptions",
  fieldGoalsMade: "Field goals",
};

const SEASON_SORT_OPTIONS = [
  { value: "year", label: "Year" },
  { value: "champion", label: "Champion" },
  { value: "userWins", label: "Your wins" },
];

function buildSeasonArchiveSearchText(season) {
  return [
    season?.year,
    season?.champion?.abbr,
    season?.champion?.name,
    season?.runnerUp?.abbr,
    season?.runnerUp?.name,
    season?.awards?.mvp?.name,
    (season?.standings ?? []).map((team) => `${team?.abbr ?? ""} ${team?.name ?? ""}`).join(" "),
  ].filter(Boolean).join(" ");
}

function transactionTypeLabel(tx) {
  return tx?.typeLabel ?? tx?.type ?? tx?.legacyType ?? "Other";
}

function transactionSortStamp(tx) {
  return `${tx?.seasonId ?? tx?.year ?? ""} ${tx?.week ?? ""} ${tx?.id ?? tx?.rawId ?? ""}`;
}

function pct(row) {
  const wins = Number(row?.wins ?? 0);
  const losses = Number(row?.losses ?? 0);
  const ties = Number(row?.ties ?? 0);
  const games = wins + losses + ties;
  if (!games) return 0;
  return (wins + ties * 0.5) / games;
}

function buildChampionMap(seasons = []) {
  const map = new Map();
  for (const season of seasons) {
    const abbr = season?.champion?.abbr;
    if (!abbr) continue;
    map.set(abbr, (map.get(abbr) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizeSeasonStoryline(season, userTeamId) {
  if (!season) return "Season summary is not yet archived.";
  const champion = season?.champion?.name ?? season?.champion?.abbr ?? null;
  const runnerUp = season?.runnerUp?.name ?? season?.runnerUp?.abbr;
  const userRow = (season?.standings ?? []).find((row) => Number(row?.id) === Number(userTeamId));
  const mvp = season?.awards?.mvp?.name;
  const lines = [
    champion
      ? `${season.year}: ${champion}${runnerUp ? ` defeated ${runnerUp}` : ""}.`
      : `${season.year}: Championship result is unavailable in this archive.`,
    mvp ? `${mvp} defined the regular season as MVP.` : "Award winners were recorded for this season archive.",
  ];
  if (userRow) {
    lines.push(`Your franchise finished ${userRow.wins}-${userRow.losses}${userRow.ties ? `-${userRow.ties}` : ""}.`);
  }
  return lines.join(" ");
}

function userTeamStandingForSeason(season, userTeamId) {
  return (season?.standings ?? []).find((row) => Number(row?.id) === Number(userTeamId)) ?? null;
}

function seasonArchiveSortValue(season, sortKey, userTeamId) {
  if (sortKey === "champion") return season?.champion?.abbr ?? season?.champion?.name ?? "";
  if (sortKey === "teams") return season?.standings?.length ?? 0;
  if (sortKey === "userWins") return userTeamStandingForSeason(season, userTeamId)?.wins ?? "";
  return season?.year;
}

function seasonArchiveSearchFields(season) {
  return [
    season?.year,
    season?.champion?.abbr,
    season?.champion?.name,
    season?.runnerUp?.abbr,
    season?.runnerUp?.name,
    season?.awards?.mvp?.name,
    ...(season?.standings ?? []).flatMap((team) => [team?.abbr, team?.name, `${team?.wins ?? 0}-${team?.losses ?? 0}`]),
  ].filter(Boolean).join(" ");
}

export default function LeagueHistory({ onPlayerSelect, actions, league, onOpenBoxScore, initialSelectedSeasonId = null }) {
  const api = actions ?? NOOP_ACTIONS;
  const [seasons, setSeasons] = useState([]);
  const [records, setRecords] = useState(null);
  const [recordBook, setRecordBook] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState("seasons");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const txPromise = api.getTransactions
      ? api.getTransactions({ mode: "recent", limit: 300 }).catch(() => ({ payload: { transactions: [] } }))
      : Promise.resolve({ payload: { transactions: [] } });

    Promise.all([
      api.getAllSeasons ? api.getAllSeasons().catch(() => ({ payload: { seasons: [] } })) : Promise.resolve({ payload: { seasons: [] } }),
      api.getRecords ? api.getRecords().catch(() => ({ payload: { records: null } })) : Promise.resolve({ payload: { records: null } }),
      api.getAllPlayerStats ? api.getAllPlayerStats({}).catch(() => ({ payload: { stats: [] } })) : Promise.resolve({ payload: { stats: [] } }),
      txPromise,
    ]).then(([seasonsRes, recordsRes, playersRes, txRes]) => {
      if (!mounted) return;
      setSeasons(seasonsRes?.payload?.seasons ?? seasonsRes?.seasons ?? []);
      setRecords(recordsRes?.payload?.records ?? null);
      setRecordBook(recordsRes?.payload?.recordBook ?? null);
      setAllPlayers(playersRes?.payload?.stats ?? []);
      setTransactions(txRes?.payload?.transactions ?? []);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [actions, api]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">Loading history...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{seasons.length} archived seasons</Badge>
        <Badge variant="outline">{buildChampionMap(seasons)[0] ? `${buildChampionMap(seasons)[0][0]} leads titles (${buildChampionMap(seasons)[0][1]})` : "No champions yet"}</Badge>
        <Badge variant="outline">{allPlayers.length.toLocaleString()} active player rows available for compare</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="seasons">Season Archive</TabsTrigger>
          <TabsTrigger value="records">Record Book</TabsTrigger>
          <TabsTrigger value="awards">Awards History</TabsTrigger>
          <TabsTrigger value="office">League Office</TabsTrigger>
          <TabsTrigger value="draft">Draft History</TabsTrigger>
          <TabsTrigger value="compare">Compare Players</TabsTrigger>
        </TabsList>

        <TabsContent value="seasons" data-testid="league-history-season-archive-browser">
          <SeasonExplorer seasons={seasons} actions={api} onPlayerSelect={onPlayerSelect} onOpenBoxScore={onOpenBoxScore} league={league} initialSelectedSeasonId={initialSelectedSeasonId} />
        </TabsContent>

        <TabsContent value="records">
          <RecordsExplorer records={records} recordBook={recordBook} seasons={seasons} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="awards" forceMount style={activeTab !== "awards" ? { display: "none" } : undefined}>
          <AwardsHistory seasons={seasons} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="office" data-testid="league-history-office-tab">
          <LeagueOfficeHistory transactions={transactions} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="draft">
          <DraftHistoryExplorer seasons={seasons} league={league} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="compare">
          <PlayerCompare actions={api} pool={allPlayers} onPlayerSelect={onPlayerSelect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DraftHistoryExplorer({ seasons, league, onPlayerSelect }) {
  const currentClass = useMemo(() => {
    const picks = league?.draftState?.picks ?? [];
    return picks.filter((p) => p.playerId != null).slice(0, 96);
  }, [league?.draftState?.picks]);

  const archivedHints = useMemo(() => {
    return (seasons ?? [])
      .filter((s) => Array.isArray(s?.draftResults) || Array.isArray(s?.draftClass))
      .slice(-12)
      .reverse();
  }, [seasons]);

  return (
    <div className="space-y-3">
      <Card className="card-premium">
        <CardHeader><CardTitle>Draft Archive Browser</CardTitle></CardHeader>
        <CardContent className="text-sm text-[color:var(--text-muted)]">
          Historical full-class draft results are shown when present in archived season storage. This save currently exposes in-progress/current draft picks and linked player profiles.
        </CardContent>
      </Card>

      {currentClass.length > 0 && (
        <Card className="card-premium">
          <CardHeader><CardTitle>Current Class Results</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[460px]">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">Pick</TableHead><TableHead>Team</TableHead><TableHead>Player</TableHead><TableHead>Pos</TableHead><TableHead>Round</TableHead></TableRow></TableHeader>
                <TableBody>
                  {currentClass.map((pk) => (
                    <TableRow key={`draft-${pk.overall}`}>
                      <TableCell className="pl-4 font-semibold">#{pk.overall}</TableCell>
                      <TableCell>{pk.teamAbbr ?? "—"}</TableCell>
                      <TableCell>
                        {pk.playerId != null ? <button className="text-[color:var(--accent)]" onClick={() => onPlayerSelect?.(pk.playerId)}>{pk.playerName ?? "Open profile"}</button> : "—"}
                      </TableCell>
                      <TableCell>{pk.playerPos ?? "—"}</TableCell>
                      <TableCell>R{pk.round ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Card className="card-premium">
        <CardHeader><CardTitle>Archived Draft Data Coverage</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {archivedHints.length > 0 ? archivedHints.map((s) => (
            <div key={`dc-${s.id}`} className="rounded-md border border-[color:var(--hairline)] px-3 py-2">
              <strong>{s.year}</strong> has stored draft artifacts ({Array.isArray(s?.draftResults) ? `${s.draftResults.length} picks` : "class data"}).
            </div>
          )) : (
            <div className="text-[color:var(--text-muted)]">No historical draft-class tables were found in archived season records for this save.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SeasonDraftClassSnippet({ seasonId, year, actions, onPlayerSelect }) {
  const [model, setModel] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!seasonId || !actions?.getDraftClass) {
      setModel(null);
      return undefined;
    }
    let cancelled = false;
    setErr(false);
    actions
      .getDraftClass({ seasonId: String(seasonId) })
      .then((res) => {
        if (cancelled) return;
        const m = res?.payload?.model;
        if (!m?.picks?.length) {
          setModel(null);
          return;
        }
        setModel(m);
      })
      .catch(() => {
        if (!cancelled) {
          setErr(true);
          setModel(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [seasonId, actions]);

  if (err || !model?.picks?.length) return null;

  const sortedByOvr = [...model.picks].sort((a, b) => Number(a?.overall ?? 999) - Number(b?.overall ?? 999));
  const topPick = sortedByOvr[0];
  const best = [...model.picks].sort((a, b) => Number(b?.legacyScore ?? 0) - Number(a?.legacyScore ?? 0))[0];
  const status = model?.classSummary?.classLeagueStatus ?? '—';

  return (
    <section className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-strong)]/30 p-4 space-y-2" data-testid="league-season-draft-snippet">
      <div className="text-xs font-black uppercase tracking-wide text-[color:var(--text-subtle)]">Draft class memory</div>
      <div className="text-sm text-[color:var(--text-muted)]">
        Class status: <span className="font-semibold text-[color:var(--text)]">{status}</span>
        {year != null ? <span> · {year} class</span> : null}
      </div>
      {topPick ? (
        <div className="text-sm">
          <span className="text-[color:var(--text-muted)]">Top pick (by slot): </span>
          {topPick.playerId != null ? (
            <button type="button" className="text-[color:var(--accent)] font-semibold" onClick={() => onPlayerSelect?.(topPick.playerId)}>
              {topPick.playerName ?? '—'}
            </button>
          ) : (
            <span className="font-semibold">{topPick.playerName ?? '—'}</span>
          )}
          <span className="text-[color:var(--text-muted)]"> #{topPick.overall ?? '—'}</span>
        </div>
      ) : null}
      {best ? (
        <div className="text-sm">
          <span className="text-[color:var(--text-muted)]">Best résumé so far: </span>
          {best.playerId != null ? (
            <button type="button" className="text-[color:var(--accent)] font-semibold" onClick={() => onPlayerSelect?.(best.playerId)}>
              {best.playerName ?? '—'}
            </button>
          ) : (
            <span className="font-semibold">{best.playerName ?? '—'}</span>
          )}
          <span className="text-[color:var(--text-muted)]"> · {best.outcomeLabel ?? '—'}</span>
        </div>
      ) : null}
      {model.classSummary?.isDevelopingClass ? (
        <div className="text-xs text-[color:var(--text-muted)]">Developing class — redraft labels stay soft until more seasons pass.</div>
      ) : null}
    </section>
  );
}

function SeasonExplorer({ seasons, actions, onPlayerSelect, onOpenBoxScore, league, initialSelectedSeasonId = null }) {
  const [selectedSeasonId, setSelectedSeasonId] = useState(initialSelectedSeasonId ?? seasons?.[0]?.id ?? null);
  const [seasonSearch, setSeasonSearch] = useState('');
  const [seasonSearch, setSeasonSearch] = useState("");
  const [seasonArchiveQuery, setSeasonArchiveQuery] = useState('');
  const [championFilter, setChampionFilter] = useState('all');
  const [seasonArchiveSort, setSeasonArchiveSort] = useState('desc');

  const championFilterOptions = useMemo(() => {
    const rows = seasons ?? [];
    const withAbbr = uniqueFilterOptions(
      rows.filter((s) => s?.champion?.abbr || s?.champion?.name),
      (s) => s?.champion?.abbr ?? s?.champion?.name,
    );
    const noneAvailable = rows.some((s) => !s?.champion);
    return { withAbbr, noneAvailable };
  }, [seasons]);

  const filteredArchiveSeasons = useMemo(() => {
    let rows = [...(seasons ?? [])];
    if (championFilter === '__none__') {
      rows = rows.filter((s) => !s?.champion);
    } else if (championFilter !== 'all') {
      rows = rows.filter((s) => {
        const ab = s?.champion?.abbr ?? s?.champion?.name ?? '';
        return String(ab) === championFilter;
      });
    }
    rows = rows.filter((s) =>
      rowMatchesSearch(s, seasonArchiveQuery, [
        'year',
        (x) => x?.id,
        (x) => x?.champion?.abbr,
        (x) => x?.champion?.name,
        (x) => x?.runnerUp?.abbr,
        (x) => x?.runnerUp?.name,
      ]),
    );
    const dir = seasonArchiveSort === 'asc' ? 'asc' : 'desc';
    return stableSortRows(rows, (x) => Number(x?.year ?? 0), dir, (x) => String(x?.id ?? ''));
  }, [seasons, seasonArchiveQuery, championFilter, seasonArchiveSort]);

  const seasonArchiveShowingLabel = buildShowingLabel(filteredArchiveSeasons.length, (seasons ?? []).length, 'season');

  const selected = useMemo(
    () => (!seasons?.length ? null : seasons.find((s) => s.id === selectedSeasonId) ?? seasons[0] ?? null),
    [seasons, selectedSeasonId],
  );

  const topPerformers = useMemo(
    () => (selected ? buildLeagueHistoryTopPerformers(selected, { perBucket: 2 }) : null),
    [selected],
  );

  const seasonMajorTx = useMemo(() => {
    if (!selected) return [];
    const v1 = selected?.transactionTimelineV1?.rows;
    if (Array.isArray(v1) && v1.length) return v1.slice(0, 10);
    const raw = selected?.majorTransactions;
    if (!Array.isArray(raw) || !raw.length) return [];
    const teams = league?.teams ?? [];
    const teamsById = new Map(teams.map((t) => [Number(t.id), t]));
    return normalizeArchivedMajorTransactions(raw, {
      teams,
      teamsById,
      year: selected?.year ?? null,
      phase: null,
    }).slice(0, 10);
  }, [selected, league?.teams]);
  const [seasonListSearch, setSeasonListSearch] = useState("");

  const filteredSeasonList = useMemo(() => {
    if (!seasonListSearch.trim()) return seasons ?? [];
    return (seasons ?? []).filter((s) =>
      rowMatchesSearch(s, seasonListSearch, [
        (row) => String(row?.year ?? ""),
        (row) => row?.champion?.abbr,
        (row) => row?.champion?.name,
      ])
    );
  }, [seasons, seasonListSearch]);
  const [seasonSearch, setSeasonSearch] = useState("");
  const [seasonSort, setSeasonSort] = useState({ key: "year", dir: "desc" });
  const [search, setSearch] = useState("");
  const [championFilter, setChampionFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("year");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (!seasons?.length) return;
    if (initialSelectedSeasonId != null) {
      const exists = seasons.some((s) => String(s?.id) === String(initialSelectedSeasonId));
      setSelectedSeasonId(exists ? initialSelectedSeasonId : (seasons[0]?.id ?? null));
      return;
    }
    setSelectedSeasonId((prev) => prev ?? seasons[0]?.id ?? null);
  }, [initialSelectedSeasonId, seasons]);

  const filteredSeasons = useMemo(() => {
    const q = normalizeSearchText(seasonSearch);
    if (!q) return seasons;
    return seasons.filter((s) => {
      const yr = String(s.year ?? '');
      const champ = String(s.champion?.abbr ?? s.champion?.name ?? '');
      return yr.includes(q) || normalizeSearchText(champ).includes(q);
    });
  }, [seasons, seasonSearch]);
  const browsedSeasons = useMemo(() => {
    const filtered = (seasons ?? []).filter((season) => rowMatchesSearch(season, seasonSearch, [
      "year",
      (s) => s?.champion?.abbr,
      (s) => s?.champion?.name,
      (s) => s?.runnerUp?.abbr,
      (s) => s?.runnerUp?.name,
      (s) => s?.awards?.mvp?.name,
      seasonArchiveSearchFields,
    ]));
    return stableSortRows(filtered, (season) => seasonArchiveSortValue(season, seasonSort.key, league?.userTeamId), seasonSort.dir, (season) => season?.year);
  }, [seasons, seasonSearch, seasonSort, league?.userTeamId]);

  const resetSeasonBrowser = () => {
    setSeasonSearch("");
    setSeasonSort({ key: "year", dir: "desc" });
  };
  const championOptions = useMemo(
    () => uniqueFilterOptions(seasons, (season) => season?.champion?.abbr ?? season?.champion?.name ?? ""),
    [seasons],
  );

  const filteredSeasons = useMemo(() => {
    const rows = (seasons ?? []).filter((season) => {
      const champion = season?.champion?.abbr ?? season?.champion?.name ?? "";
      if (championFilter !== "ALL" && champion !== championFilter) return false;
      return rowMatchesSearch(season, search, [
        "year",
        buildSeasonArchiveSearchText,
      ]);
    });
    return stableSortRows(rows, (season) => {
      if (sortKey === "champion") return season?.champion?.abbr ?? season?.champion?.name ?? "";
      if (sortKey === "userWins") {
        return (season?.standings ?? []).find((row) => Number(row?.id) === Number(league?.userTeamId))?.wins ?? -1;
      }
      return season?.year ?? 0;
    }, sortDir, (season) => season?.year ?? 0);
  }, [championFilter, league?.userTeamId, search, seasons, sortDir, sortKey]);

  useEffect(() => {
    if (!filteredSeasons.length) return;
    const exists = filteredSeasons.some((season) => String(season?.id) === String(selectedSeasonId));
    if (!exists) {
      setSelectedSeasonId(filteredSeasons[0]?.id ?? null);
    }
  }, [filteredSeasons, selectedSeasonId]);

  if (!seasons?.length) {
    return (
      <Card className="card-premium">
        <CardContent className="py-10 text-center text-[color:var(--text-muted)]">
          <div className="font-semibold text-[color:var(--text)]">No archived seasons yet.</div>
          <div className="mt-2 text-sm">Finish your first season to start a living archive with champions, awards, and records.</div>
        </CardContent>
      </Card>
    );
  }

  const filteredSeasons = useMemo(() => {
    if (!seasonSearch.trim()) return seasons;
    return seasons.filter((s) =>
      rowMatchesSearch(s, seasonSearch, [
        (r) => String(r.year ?? ''),
        (r) => r.champion?.abbr ?? '',
        (r) => r.champion?.name ?? '',
      ]),
    );
  }, [seasons, seasonSearch]);

  const seasonListLabel = useMemo(
    () => buildShowingLabel(filteredSeasons.length, seasons.length, 'season'),
    [filteredSeasons.length, seasons.length],
  );

  const selected = seasons.find((s) => s.id === selectedSeasonId) ?? seasons[0];
  const selected = filteredSeasons.find((s) => s.id === selectedSeasonId) ?? filteredSeasons[0] ?? null;
  const sortedStandings = [...(selected?.standings ?? [])].sort((a, b) => pct(b) - pct(a)).slice(0, 8);
  const championBoard = buildChampionMap(seasons).slice(0, 5);
  const playoffMentions = (selected?.standings ?? []).filter((row) => Number(row?.wins ?? 0) >= 10).slice(0, 6);
  const seasonStoryline = summarizeSeasonStoryline(selected, league?.userTeamId);
  const teamLookup = (tid) => (selected?.standings ?? []).find((t) => Number(t?.id) === Number(tid));
  const highScoreGame = (selected?.notableGames ?? []).find((g) => g?.type === "highest_scoring") ?? null;
  const playerStatLeaders = selected?.playerStatLeaders && typeof selected.playerStatLeaders === "object" ? selected.playerStatLeaders : null;
  const teamStatLeaders = selected?.teamStatLeaders && typeof selected.teamStatLeaders === "object" ? selected.teamStatLeaders : null;
  const playoffSnap = selected?.playoffBracketSnapshot ?? null;
  const awardLeaders = AWARD_KEYS
    .map((key) => ({ key, label: AWARD_DISPLAY_NAMES[key] ?? key.toUpperCase(), award: selected?.awards?.[key] }))
    .filter((entry) => entry.award?.name);
  const championshipGame = (selected?.gameIndex ?? []).find((g) => String(g?.id) === String(selected?.championshipGameId)) ?? null;
  const notableGames = Array.isArray(selected?.notableGames) ? selected.notableGames : [];
  const selectedSeasonIndex = seasons.findIndex((s) => s.id === selected?.id);
  const selectedSeasonIndex = filteredSeasons.findIndex((s) => s.id === selected?.id);
  const topPerformers = useMemo(() => buildLeagueHistoryTopPerformers(selected, { perBucket: 2 }), [selected]);
  const hasSeasonFilters = Boolean(search.trim()) || championFilter !== "ALL" || sortKey !== "year" || sortDir !== "desc";

  const seasonMajorTx = useMemo(() => {
    const v1 = selected?.transactionTimelineV1?.rows;
    if (Array.isArray(v1) && v1.length) return v1.slice(0, 10);
    const raw = selected?.majorTransactions;
    if (!Array.isArray(raw) || !raw.length) return [];
    const teams = league?.teams ?? [];
    const teamsById = new Map(teams.map((t) => [Number(t.id), t]));
    return normalizeArchivedMajorTransactions(raw, {
      teams,
      teamsById,
      year: selected?.year ?? null,
      phase: null,
    }).slice(0, 10);
  }, [selected, league?.teams]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      <Card className="card-premium">
        <CardHeader>
          <CardTitle>Season Archive</CardTitle>
          <div className="text-xs text-[color:var(--text-muted)]" data-testid="league-history-season-count">
            {buildShowingLabel(filteredSeasons.length, seasons.length, 'seasons')}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-3 py-2">
            <input
              type="search"
              value={seasonSearch}
              onChange={(e) => setSeasonSearch(e.target.value)}
              placeholder="Search year or champion…"
              data-testid="league-history-season-search"
              className="h-8 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
            />
          </div>
          <ScrollArea className="h-[480px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {filteredSeasons.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[color:var(--text-muted)]">No seasons match your search.</div>
              ) : filteredSeasons.map((s) => (
          <input
            type="text"
            value={seasonSearch}
            onChange={(e) => setSeasonSearch(e.target.value)}
            placeholder="Search year or champion…"
            aria-label="Search seasons"
            className="mt-2 h-8 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
            data-testid="league-history-season-search"
          />
          <div className="text-[10px] text-[color:var(--text-muted)] mt-1" data-testid="league-history-season-showing">{seasonListLabel}</div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[480px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {filteredSeasons.map((s) => (
        <CardHeader><CardTitle>Season Archive</CardTitle></CardHeader>
        <CardContent className="p-0 space-y-0">
          <div className="p-3 space-y-2 border-b border-[color:var(--hairline)]">
            <input
              type="search"
              value={seasonArchiveQuery}
              onChange={(e) => setSeasonArchiveQuery(e.target.value)}
              placeholder="Search year, teams, champion…"
              className="h-9 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
              aria-label="Search archived seasons"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-[color:var(--text-muted)] flex items-center gap-1">
                Champion
                <select
                  value={championFilter}
                  onChange={(e) => setChampionFilter(e.target.value)}
                  className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-1 text-xs max-w-[140px]"
                >
                  <option value="all">All</option>
                  {championFilterOptions.noneAvailable ? <option value="__none__">No champion in archive</option> : null}
                  {championFilterOptions.withAbbr.map((abbr) => (
                    <option key={abbr} value={abbr}>{abbr}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setSeasonArchiveSort((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                Year {seasonArchiveSort === 'asc' ? '↑' : '↓'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSeasonArchiveQuery('');
                  setChampionFilter('all');
                  setSeasonArchiveSort('desc');
                }}
              >
                Reset
              </button>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-[color:var(--hairline)]">
            <input
              type="search"
              value={seasonListSearch}
              onChange={(e) => setSeasonListSearch(e.target.value)}
              placeholder="Search year or champion…"
              aria-label="Search seasons"
              className="h-8 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
              data-testid="league-history-season-search"
            />
            <div
              className="mt-1 text-[10px] text-[color:var(--text-muted)]"
              data-testid="league-history-season-showing"
            >
              {buildShowingLabel(filteredSeasonList.length, (seasons ?? []).length, "season")}
            </div>
          </div>
          <ScrollArea className="h-[460px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {filteredSeasonList.length === 0 ? (
                <div className="px-4 py-4 text-xs text-[color:var(--text-muted)]">No seasons match your search.</div>
              ) : (
                filteredSeasonList.map((s) => (
                  <button
                    key={s.id}
                    className={`w-full text-left px-4 py-3 ${selected?.id === s.id ? "bg-[color:var(--surface-strong)]" : ""}`}
                    onClick={() => setSelectedSeasonId(s.id)}
                  >
                    <div className="font-bold text-sm">{s.year}</div>
                    <div className="text-xs text-[color:var(--text-muted)]">{s.champion?.abbr ?? "TBD"} champion</div>
                  </button>
                ))
              )}
          <div className="p-3 space-y-2 border-b border-[color:var(--hairline)]">
            <input
              type="search"
              value={seasonSearch}
              onChange={(e) => setSeasonSearch(e.target.value)}
              placeholder="Search year, team, champion, MVP"
              className="h-9 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
              aria-label="Search archived seasons"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={seasonSort.key}
                onChange={(e) => setSeasonSort((curr) => ({ ...curr, key: e.target.value }))}
                className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
                aria-label="Sort archived seasons"
              >
                <option value="year">Year</option>
                <option value="champion">Champion</option>
                <option value="userWins">User wins</option>
                <option value="teams">Teams</option>
              </select>
              <button type="button" className="btn text-xs" onClick={() => setSeasonSort((curr) => ({ ...curr, dir: curr.dir === "asc" ? "desc" : "asc" }))}>
                {seasonSort.dir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-muted)]">
              <span>{buildShowingLabel(browsedSeasons.length, seasons.length, "season")}</span>
              <button type="button" className="text-[color:var(--accent)]" onClick={resetSeasonBrowser}>Reset filters</button>
            </div>
          </div>
          <ScrollArea className="h-[520px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {browsedSeasons.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[color:var(--text-muted)]">No archived seasons match this search.</div>
              ) : browsedSeasons.map((s) => (
                <button
                  key={s.id}
                  className={`w-full text-left px-4 py-3 ${selected?.id === s.id ? "bg-[color:var(--surface-strong)]" : ""}`}
                  onClick={() => setSelectedSeasonId(s.id)}
                  data-testid="league-history-season-row"
                >
                  <div className="font-bold text-sm">{s.year}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {s.champion?.abbr || s.champion?.name ? `${s.champion?.abbr ?? s.champion?.name} champion` : "Champion unavailable"}
                    {s.runnerUp?.abbr || s.runnerUp?.name ? ` · over ${s.runnerUp?.abbr ?? s.runnerUp?.name}` : ""}
                  </div>
        <CardContent className="p-3 space-y-3">
          <div className="space-y-2">
            <input
              aria-label="Search league history seasons"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search year, champion, team, MVP"
              className="h-9 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Filter league history seasons by champion"
                className="h-9 min-w-[130px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
                value={championFilter}
                onChange={(e) => setChampionFilter(e.target.value)}
              >
                <option value="ALL">All champions</option>
                {championOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select
                aria-label="Sort league history seasons"
                className="h-9 min-w-[120px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
              >
                {SEASON_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary h-9 text-sm"
                aria-label="Toggle league history season sort direction"
                onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
              >
                {sortDir === "desc" ? "Newest/highest first" : "Oldest/lowest first"}
              </button>
              {hasSeasonFilters ? (
                <button
                  type="button"
                  className="btn btn-secondary h-9 text-sm"
                  onClick={() => {
                    setSearch("");
                    setChampionFilter("ALL");
                    setSortKey("year");
                    setSortDir("desc");
                  }}
                >
                  Reset filters
                </button>
              ))}
              {filteredSeasons.length === 0 && (
                <div className="px-4 py-3 text-xs text-[color:var(--text-muted)]">No seasons match your search.</div>
              )}
              ) : null}
            </div>
            <div
              data-testid="league-season-archive-count"
              className="flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]"
            >
              <span>{buildShowingLabel(filteredSeasons.length, seasons.length, "season")}</span>
              <span>Sort: {SEASON_SORT_OPTIONS.find((option) => option.value === sortKey)?.label ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}</span>
              {championFilter !== "ALL" ? <span>Champion: {championFilter}</span> : null}
            </div>
          </div>
          <ScrollArea className="h-[520px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {filteredSeasons.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[color:var(--text-muted)]">
                  No archived seasons match these filters.
                </div>
              ) : filteredSeasons.map((s) => {
                const userRow = (s?.standings ?? []).find((row) => Number(row?.id) === Number(league?.userTeamId));
                return (
                  <button
                    key={s.id}
                    data-testid={`league-season-button-${s.id}`}
                    className={`w-full text-left px-4 py-3 ${selected?.id === s.id ? "bg-[color:var(--surface-strong)]" : ""}`}
                    onClick={() => setSelectedSeasonId(s.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm">{s.year}</div>
                      {s.champion?.abbr ? <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{s.champion.abbr}</Badge> : null}
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      {s.champion?.abbr ?? s.champion?.name ?? "Champion TBD"}
                      {s.runnerUp?.abbr || s.runnerUp?.name ? ` over ${s.runnerUp?.abbr ?? s.runnerUp?.name}` : ""}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-muted)] mt-1">
                      {userRow ? `You: ${userRow.wins}-${userRow.losses}${userRow.ties ? `-${userRow.ties}` : ""}` : "League snapshot"}
                      {s.awards?.mvp?.name ? ` · MVP ${s.awards.mvp.name}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-[color:var(--text-muted)] leading-tight">{seasonArchiveShowingLabel}</div>
          </div>
          <ScrollArea className="h-[460px] lg:h-[520px]">
            {filteredArchiveSeasons.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
                No seasons match these filters. Clear search or reset to see the full archive.
              </div>
            ) : (
              <div className="divide-y divide-[color:var(--hairline)]" data-testid="league-history-season-archive-list">
                {filteredArchiveSeasons.map((s) => (
                  <button
                    key={s.id}
                    className={`w-full text-left px-4 py-2.5 sm:py-3 ${selected?.id === s.id ? "bg-[color:var(--surface-strong)]" : ""}`}
                    onClick={() => setSelectedSeasonId(s.id)}
                  >
                    <div className="font-bold text-sm leading-tight">{s.year}</div>
                    <div className="text-[11px] sm:text-xs text-[color:var(--text-muted)] leading-snug">
                      {(s.champion?.abbr ?? s.champion?.name) || "—"}
                      <span className="text-[color:var(--text-subtle)]"> · champ</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardHeader>
          <CardTitle>{selected?.year ?? "Filtered"} League Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <div className="rounded-md border border-[color:var(--hairline)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              No archived seasons match the current search or champion filter.
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => selectedSeasonIndex > 0 && setSelectedSeasonId(filteredSeasons[selectedSeasonIndex - 1].id)} disabled={selectedSeasonIndex <= 0}>Previous season</button>
            <button className="btn" onClick={() => selectedSeasonIndex < filteredSeasons.length - 1 && setSelectedSeasonId(filteredSeasons[selectedSeasonIndex + 1].id)} disabled={selectedSeasonIndex >= filteredSeasons.length - 1}>Next season</button>
          </div>
          <div className="rounded-md border border-[color:var(--hairline)] px-3 py-2 text-sm text-[color:var(--text-muted)]">{seasonStoryline}</div>

          <SeasonDraftClassSnippet seasonId={selected?.id} year={selected?.year} actions={actions} onPlayerSelect={onPlayerSelect} />

          <section className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-strong)]/40 p-4 space-y-3" data-testid={`league-history-season-story-${selected?.id ?? 'none'}`}>
            <div className="text-xs font-black uppercase tracking-wide text-[color:var(--text-subtle)]">Season story</div>
            <div className="text-lg font-black text-[color:var(--text)]">
              {selected?.champion?.abbr ?? selected?.champion?.name ?? "Champion unavailable"}
              {selected?.runnerUp?.abbr || selected?.runnerUp?.name ? (
                <span className="text-[color:var(--text-muted)] font-semibold text-base"> over {selected?.runnerUp?.abbr ?? selected?.runnerUp?.name}</span>
              ) : null}
            </div>
            <div className="text-sm text-[color:var(--text-muted)]">
              MVP:{" "}
              {selected?.awards?.mvp?.name ? (
                <button type="button" className="text-[color:var(--accent)] font-semibold" onClick={() => onPlayerSelect?.(selected.awards.mvp.playerId)}>
                  {selected.awards.mvp.name}
                </button>
              ) : (
                "—"
              )}
            </div>
            {highScoreGame ? (
              <div className="text-sm">
                <span className="text-[color:var(--text-muted)]">Highest-scoring game: </span>
                <span className="font-semibold">
                  {teamLookup(highScoreGame.awayId)?.abbr ?? "Away"} {highScoreGame.awayScore ?? "—"} at {teamLookup(highScoreGame.homeId)?.abbr ?? "Home"} {highScoreGame.homeScore ?? "—"}
                </span>
                {highScoreGame.totalPoints != null ? (
                  <span className="text-[color:var(--text-muted)]"> ({highScoreGame.totalPoints} pts)</span>
                ) : null}
                {highScoreGame.gameId != null && onOpenBoxScore ? (
                  <button type="button" className="ml-2 text-xs text-[color:var(--accent)]" onClick={() => openResolvedBoxScore({ id: highScoreGame.gameId, week: highScoreGame.week, homeId: highScoreGame.homeId, awayId: highScoreGame.awayId, homeScore: highScoreGame.homeScore, awayScore: highScoreGame.awayScore }, { seasonId: selected?.year, week: highScoreGame.week, source: "league_history_story" }, onOpenBoxScore)}>
                    Game Book
                  </button>
                ) : null}
              </div>
            ) : null}
            {teamStatLeaders?.pointsPerGame?.teamAbbr ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                Best offense (PPG): <span className="font-semibold text-[color:var(--text)]">{teamStatLeaders.pointsPerGame.teamAbbr}</span> ({teamStatLeaders.pointsPerGame.value})
              </div>
            ) : null}
            {teamStatLeaders?.pointsAllowed?.teamAbbr ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                Best defense (Pts allowed / game): <span className="font-semibold text-[color:var(--text)]">{teamStatLeaders.pointsAllowed.teamAbbr}</span> ({teamStatLeaders.pointsAllowed.value})
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryBox label="Champion" value={selected?.champion?.name ?? selected?.champion?.abbr ?? "—"} muted={!selected?.champion} />
            <SummaryBox label="Runner-up" value={selected?.runnerUp?.name ?? "—"} muted={!selected?.runnerUp} />
            <SummaryBox label="MVP" value={selected?.awards?.mvp?.name ?? "—"} onClick={selected?.awards?.mvp?.playerId != null ? () => onPlayerSelect?.(selected.awards.mvp.playerId) : undefined} />
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">
            Championship game: {championshipGame ? (
              <button
                className="text-[color:var(--accent)]"
                onClick={() => openResolvedBoxScore(championshipGame, { seasonId: selected?.year, week: championshipGame?.week, source: "league_history_championship" }, onOpenBoxScore)}
              >
                Week {championshipGame.week} · {championshipGame.awayScore ?? "—"}-{championshipGame.homeScore ?? "—"} (open Game Book)
              </button>
            ) : "Unavailable in this archive. This season may be missing explicit postseason metadata."}
          </div>

          <section>
            <h4 className="text-sm font-bold mb-2">League memory board</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {championBoard.map(([abbr, count]) => (
                <div key={abbr} className="rounded-md border border-[color:var(--hairline)] px-3 py-2 flex justify-between">
                  <span>{abbr} championships</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
              {championBoard.length === 0 && <div className="text-[color:var(--text-muted)]">Champion leaderboard will appear after completed seasons.</div>}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold mb-2">Standings Snapshot</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {sortedStandings.map((team) => (
                <div key={team.id} className="rounded-md border border-[color:var(--hairline)] px-3 py-2 flex justify-between">
                  <span>{team.name}</span>
                  <span className="font-semibold">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ""}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-[color:var(--text-muted)] mt-2">
              Playoff-caliber clubs (10+ wins): {playoffMentions.length ? playoffMentions.map((team) => `${team.abbr ?? team.name} ${team.wins}-${team.losses}`).join(" · ") : "none archived"}
            </div>
          </section>

          <section data-testid={`league-history-playoff-bracket-${selected?.id ?? 'none'}`}>
            <h4 className="text-sm font-bold mb-2">Playoff snapshot</h4>
            {!playoffSnap || playoffSnap.mode === "empty" ? (
              <div className="text-xs text-[color:var(--text-muted)] rounded-md border border-[color:var(--hairline)] px-3 py-2">
                No postseason bracket snapshot is stored for this season. Complete a playoff run and re-archive (or use a newer save) to see round-by-round results here.
              </div>
            ) : (
              <div className="space-y-3">
                {playoffSnap.note ? <div className="text-xs text-[color:var(--text-muted)]">{playoffSnap.note}</div> : null}
                {(playoffSnap.rounds ?? []).map((round) => (
                  <div key={round.label} className="rounded-md border border-[color:var(--hairline)] p-3 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-subtle)]">{round.label}</div>
                    <div className="grid gap-2">
                      {(round.games ?? []).map((g) => {
                        const presentation = buildCompletedGamePresentation(g, { seasonId: selected?.year, week: g?.week, source: "league_history_playoff" });
                        const clickable = Boolean(presentation.canOpen && onOpenBoxScore && g.gameId != null);
                        return (
                          <div key={String(g.gameId ?? `${g.week}-${g.homeId}-${g.awayId}`)} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-[color:var(--hairline)]/60 pb-2 last:border-0 last:pb-0">
                            <div>
                              <span className="text-[color:var(--text-muted)] text-xs">Wk {g.week ?? "—"}</span>{" "}
                              <span className="font-semibold">{g.awayAbbr} {g.awayScore ?? "—"} @ {g.homeAbbr} {g.homeScore ?? "—"}</span>
                              {g.winnerId != null ? (
                                <span className="text-xs text-[color:var(--text-muted)]"> · Winner: {teamLookup(g.winnerId)?.abbr ?? g.winnerId}</span>
                              ) : null}
                            </div>
                            {clickable ? (
                              <button type="button" className="text-xs text-[color:var(--accent)] shrink-0" onClick={() => openResolvedBoxScore({ id: g.gameId, week: g.week, homeId: g.homeId, awayId: g.awayId, homeScore: g.homeScore, awayScore: g.awayScore }, { seasonId: selected?.year, week: g.week, source: "league_history_playoff" }, onOpenBoxScore)}>
                                Game Book
                              </button>
                            ) : (
                              <span className="text-xs text-[color:var(--text-muted)]">{presentation.statusLabel}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 className="text-sm font-bold mb-2">Awards & Leaders</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <AwardLine label="MVP" award={selected?.awards?.mvp} onPlayerSelect={onPlayerSelect} />
              <AwardLine label={AWARD_DISPLAY_NAMES.opoy} award={selected?.awards?.opoy} onPlayerSelect={onPlayerSelect} />
              <AwardLine label={AWARD_DISPLAY_NAMES.dpoy} award={selected?.awards?.dpoy} onPlayerSelect={onPlayerSelect} />
              <AwardLine label={AWARD_DISPLAY_NAMES.roty} award={selected?.awards?.roty} onPlayerSelect={onPlayerSelect} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {awardLeaders.map((entry) => (
                <button key={entry.key} className="rounded-full border border-[color:var(--hairline)] px-2 py-1 text-xs" onClick={() => entry.award?.playerId != null ? onPlayerSelect?.(entry.award.playerId) : null}>
                  {entry.label}: {entry.award?.name}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-[color:var(--hairline)] p-3" data-testid="league-history-award-winners-card">
              <div className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-subtle)] mb-2">Full award sheet</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {AWARDS_V1_EXTRA.map((k) => {
                  const a = selected?.awards?.[k];
                  if (!a?.name) return null;
                  return (
                    <div key={k} className="flex justify-between gap-2 border-b border-[color:var(--hairline)]/50 pb-1">
                      <span className="text-[color:var(--text-muted)]">{AWARD_DISPLAY_NAMES[k] ?? AWARDS_V1_LABELS[k] ?? k}</span>
                      <button type="button" className="font-semibold text-[color:var(--accent)] text-right" onClick={() => a.playerId != null && onPlayerSelect?.(a.playerId)}>
                        {a.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {topPerformers && Object.values(topPerformers).some((arr) => Array.isArray(arr) && arr.length) ? (
            <section className="rounded-md border border-[color:var(--hairline)] p-3" data-testid={`league-history-top-performers-${selected?.id ?? 'none'}`}>
              <h4 className="text-sm font-bold mb-2">Top performers (archived stat snapshots)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(topPerformers).map(([bucket, arr]) => (
                  (arr ?? []).length > 0 ? (
                    <div key={bucket} className="space-y-1">
                      <div className="font-semibold text-[color:var(--text-muted)] uppercase tracking-wide">{(arr[0] && arr[0].category) || bucket}</div>
                      {(arr ?? []).map((r) => (
                        <div key={`${bucket}-${r.playerId}`} className="flex justify-between gap-2 border-b border-[color:var(--hairline)]/40 pb-1 last:border-0">
                          <button type="button" className="text-left text-[color:var(--accent)] font-semibold truncate" onClick={() => r.playerId != null && onPlayerSelect?.(r.playerId)}>
                            {r.playerName ?? "—"}{r.pos ? ` · ${r.pos}` : ""}{r.teamAbbr ? ` (${r.teamAbbr})` : ""}
                          </button>
                          <span className="tabular-nums shrink-0">{r.value?.toLocaleString?.() ?? r.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                ))}
              </div>
            </section>
          ) : null}

          {seasonMajorTx.length > 0 ? (
            <section className="rounded-md border border-[color:var(--hairline)] p-3" data-testid={`league-history-major-tx-${selected?.id ?? 'none'}`}>
              <h4 className="text-sm font-bold mb-2">Major transactions</h4>
              <ul className="space-y-2 text-xs">
                {seasonMajorTx.map((tx, idx) => (
                  <li key={`${tx.id ?? tx.rawId ?? idx}`} className="border-b border-[color:var(--hairline)]/40 pb-2 last:border-0">
                    <div className="font-semibold text-[color:var(--text)]">{tx.headline ?? tx.typeLabel ?? tx.type}</div>
                    <div className="text-[color:var(--text-muted)]">
                      {tx.typeLabel ?? tx.type}
                      {tx.week != null ? ` · Week ${tx.week}` : ""}
                    </div>
                    {tx.playerId != null ? (
                      <button type="button" className="text-[color:var(--accent)] font-semibold mt-1" onClick={() => onPlayerSelect?.(tx.playerId)}>
                        {tx.playerName ?? "Player"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {playerStatLeaders && Object.keys(playerStatLeaders).length > 0 ? (
            <section data-testid={`league-history-player-stat-leaders-${selected?.id ?? 'none'}`}>
              <h4 className="text-sm font-bold mb-2">Stat leaders</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(playerStatLeaders).map(([key, row]) => {
                  if (!row?.playerName) return null;
                  return (
                    <div key={key} className="rounded-md border border-[color:var(--hairline)] px-3 py-2 flex justify-between gap-2">
                      <span className="text-[color:var(--text-muted)] text-xs uppercase">{PLAYER_LEADER_LABELS[key] ?? key}</span>
                      <span className="text-right">
                        <button type="button" className="text-[color:var(--accent)] font-semibold" onClick={() => row.playerId != null && onPlayerSelect?.(row.playerId)}>
                          {row.playerName}
                        </button>
                        <span className="text-[color:var(--text-muted)] text-xs"> {row.value != null ? `· ${row.value}` : ""}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section>
            <h4 className="text-sm font-bold mb-2">Completed game archive</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {(selected?.gameIndex ?? []).slice(-12).reverse().map((game) => {
                const presentation = buildCompletedGamePresentation(game, { seasonId: selected?.year, week: game?.week, source: "league_history" });
                const clickable = Boolean(presentation.canOpen && onOpenBoxScore);
                return (
                  <button
                    key={game.id}
                    className="rounded-md border border-[color:var(--hairline)] px-3 py-2 text-left"
                    onClick={() => openResolvedBoxScore(game, { seasonId: selected?.year, week: game?.week, source: "league_history" }, onOpenBoxScore)}
                    style={{ cursor: clickable ? "pointer" : "default", opacity: clickable ? 1 : 0.75 }}
                    title={clickable ? presentation.ctaLabel : presentation.statusLabel}
                  >
                    <strong>Week {game.week}: {game.awayScore ?? "—"} - {game.homeScore ?? "—"}</strong>
                    <div className="text-xs text-[color:var(--text-muted)]">{clickable ? presentation.ctaLabel : presentation.statusLabel}</div>
                  </button>
                );
              })}
              {(selected?.gameIndex ?? []).length === 0 && (
                <div className="text-[color:var(--text-muted)]">No completed-game index stored for this archived season.</div>
              )}
            </div>
          </section>
          {notableGames.length > 0 && (
            <section>
              <h4 className="text-sm font-bold mb-2">Notable games</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {notableGames.map((game, idx) => (
                  <div key={`${game.type}-${game.gameId ?? idx}`} className="rounded-md border border-[color:var(--hairline)] px-3 py-2">
                    <div className="font-semibold">{game.type === 'highest_scoring' ? 'Highest scoring game' : 'Championship game'}</div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      Week {game.week ?? "—"} · {game.awayScore ?? "—"}-{game.homeScore ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecordsExplorer({ records, recordBook, seasons, onPlayerSelect }) {
  const [scope, setScope] = useState("singleSeason");

  if (!records) return <div className="py-8 text-center text-[color:var(--text-muted)]">No records tracked yet.</div>;

  const source = scope === "singleSeason"
    ? (recordBook?.singleSeason ?? records.singleSeason)
    : scope === "game"
      ? (recordBook?.singleGame ?? records.singleGame)
      : (recordBook?.career ?? records.allTime);

  const teamSeasonRecords = useMemo(() => {
    const bestWins = { year: null, team: null, value: -1 };
    const worstWins = { year: null, team: null, value: 999 };
    const bestPF = { year: null, team: null, value: -1 };
    const worstPA = { year: null, team: null, value: -1 };

    (seasons ?? []).forEach((season) => {
      (season.standings ?? []).forEach((team) => {
        if ((team.wins ?? 0) > bestWins.value) Object.assign(bestWins, { year: season.year, team: team.abbr, value: team.wins ?? 0 });
        if ((team.wins ?? 0) < worstWins.value) Object.assign(worstWins, { year: season.year, team: team.abbr, value: team.wins ?? 0 });
        if ((team.pf ?? 0) > bestPF.value) Object.assign(bestPF, { year: season.year, team: team.abbr, value: team.pf ?? 0 });
        if ((team.pa ?? 0) > worstPA.value) Object.assign(worstPA, { year: season.year, team: team.abbr, value: team.pa ?? 0 });
      });
    });

    return { bestWins, worstWins, bestPF, worstPA };
  }, [seasons]);

  return (
    <div className="space-y-4">
      <Tabs value={scope} onValueChange={setScope}>
        <TabsList>
          <TabsTrigger value="game">Single-game</TabsTrigger>
          <TabsTrigger value="singleSeason">Single-season</TabsTrigger>
          <TabsTrigger value="allTime">Career</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="text-xs text-[color:var(--text-muted)]">
        {scope === "game" ? "Highest one-game outputs in archive." : scope === "singleSeason" ? "Best one-season marks and team highs." : "All-time career records and long-run leaders."}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(scope === "singleSeason" ? (recordBook?.singleSeason ?? RECORD_LABELS) : (source ?? {})).map(([key, raw]) => {
          const label = typeof raw === "string" ? raw : RECORD_LABELS[key] ?? key;
          const rec = source?.[key];
          if (!rec?.playerId) return null;
          return (
            <Card key={key} className="card-premium cursor-pointer" onClick={() => onPlayerSelect?.(rec.playerId)}>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">{label}</div>
                <div className="text-2xl font-black text-[color:var(--accent)]">{Number(rec.value ?? 0).toLocaleString()}</div>
                <div className="text-sm font-semibold">{rec.name} ({rec.pos})</div>
                <div className="text-xs text-[color:var(--text-muted)]">{rec.team} · {rec.year ?? rec.lastYear ?? "—"}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="card-premium">
        <CardHeader><CardTitle>Team & Franchise Season Records</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <RecordLine label="Most wins" record={teamSeasonRecords.bestWins} />
          <RecordLine label="Fewest wins" record={teamSeasonRecords.worstWins} />
          <RecordLine label="Most points for" record={teamSeasonRecords.bestPF} />
          <RecordLine label="Most points allowed" record={teamSeasonRecords.worstPA} />
        </CardContent>
      </Card>

      {records.history?.length > 0 && (
        <Card className="card-premium">
          <CardHeader><CardTitle>Record Timeline</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[color:var(--hairline)] max-h-64 overflow-y-auto">
              {[...records.history].reverse().slice(0, 40).map((entry, idx) => (
                <div key={`${entry.year}-${idx}`} className="px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-[color:var(--text-muted)] mr-2">{entry.year}</span>
                  <strong>{entry.player}</strong> ({entry.team}) set {entry.label}: <strong className="text-[color:var(--accent)]">{entry.newValue.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AwardsHistory({ seasons, onPlayerSelect }) {
  const [awardSearch, setAwardSearch] = useState('');
  const [awardSortDir, setAwardSortDir] = useState('desc');
  const [awardsSearch, setAwardsSearch] = useState("");
  const [awardsSortDir, setAwardsSortDir] = useState("desc");

  const filteredAwardSeasons = useMemo(() => {
    let rows = seasons ?? [];
    if (awardsSearch.trim()) {
      rows = rows.filter((s) =>
        rowMatchesSearch(s, awardsSearch, [
          (r) => String(r.year ?? ''),
          (r) => r.champion?.abbr ?? '',
          (r) => r.awards?.mvp?.name ?? '',
          (r) => r.awards?.opoy?.name ?? '',
          (r) => r.awards?.dpoy?.name ?? '',
          (r) => r.awards?.roty?.name ?? '',
        ]),
      );
    }
    return stableSortRows(rows, (r) => r.year ?? 0, awardsSortDir);
  }, [seasons, awardsSearch, awardsSortDir]);

  const filteredAwardSeasons = useMemo(() => {
    if (!awardsSearch.trim()) return seasons ?? [];
    return (seasons ?? []).filter((s) =>
      rowMatchesSearch(s, awardsSearch, [
        (row) => String(row?.year ?? ""),
        (row) => row?.champion?.abbr,
        (row) => row?.champion?.name,
        (row) => row?.awards?.mvp?.name,
        (row) => row?.awards?.opoy?.name,
        (row) => row?.awards?.dpoy?.name,
        (row) => row?.awards?.roty?.name,
      ])
    );
  }, [seasons, awardsSearch]);

  if (!seasons?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No award history yet.</div>;
export function AwardsHistory({ seasons, onPlayerSelect }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('yearDesc');

  const totalSeasons = (seasons ?? []).length;
  const displayedSeasons = useMemo(() => {
    const trimmed = String(search ?? '').trim();
    const filtered = (seasons ?? []).filter((s) =>
      !trimmed
        ? true
        : rowMatchesSearch(
            s,
            trimmed,
            [
              (r) => r?.year ?? '',
              (r) => r?.champion?.abbr ?? '',
              (r) => r?.champion?.name ?? '',
              (r) => r?.awards?.mvp?.name ?? '',
              (r) => r?.awards?.opoy?.name ?? '',
              (r) => r?.awards?.dpoy?.name ?? '',
              (r) => r?.awards?.roty?.name ?? '',
            ],
          ),
    );
    const def = AWARDS_HISTORY_SORTS[sortKey] ?? AWARDS_HISTORY_SORTS.yearDesc;
    return stableSortRows(filtered, def.getValue, def.direction, (r) => Number(r?.year ?? 0));
  }, [seasons, search, sortKey]);

  const filtersActive = Boolean(String(search ?? '').trim()) || sortKey !== 'yearDesc';

  if (!totalSeasons) return <div className="py-8 text-center text-[color:var(--text-muted)]">No award history yet.</div>;

  const awardsShowingLabel = buildShowingLabel(filteredAwardSeasons.length, seasons.length, 'season');

  const q = normalizeSearchText(awardSearch);
  const filtered = q
    ? seasons.filter((s) => {
        const fields = [
          String(s.year ?? ''),
          s.champion?.abbr, s.champion?.name,
          s.awards?.mvp?.name, s.awards?.opoy?.name, s.awards?.dpoy?.name, s.awards?.roty?.name,
        ];
        return fields.some((f) => f && normalizeSearchText(f).includes(q));
      })
    : seasons;
  const sorted = [...filtered].sort((a, b) => awardSortDir === 'desc' ? (b.year ?? 0) - (a.year ?? 0) : (a.year ?? 0) - (b.year ?? 0));

  return (
    <Card className="card-premium">
      <CardHeader>
        <CardTitle>Awards by Season</CardTitle>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <input
            type="search"
            value={awardSearch}
            onChange={(e) => setAwardSearch(e.target.value)}
            placeholder="Search year, champion, or award winner…"
            data-testid="awards-history-search"
            className="h-8 w-full sm:w-64 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
          />
          <span className="text-xs text-[color:var(--text-muted)]" data-testid="awards-history-count">
            {buildShowingLabel(sorted.length, seasons.length, 'seasons')}
          </span>
          {q && (
            <button type="button" className="text-xs text-[color:var(--accent)]" onClick={() => setAwardSearch('')}>
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <input
            type="text"
            value={awardsSearch}
            onChange={(e) => setAwardsSearch(e.target.value)}
            placeholder="Search year, champion, or player…"
            aria-label="Search awards"
            className="h-8 w-full sm:w-64 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
            data-testid="awards-history-search"
          />
          <button
            type="button"
            className="btn text-xs"
            onClick={() => setAwardsSortDir((d) => d === "asc" ? "desc" : "asc")}
          >
            Year {awardsSortDir === "asc" ? "▲" : "▼"}
          </button>
          {awardsSearch && (
            <button type="button" className="btn btn-secondary text-xs" onClick={() => setAwardsSearch("")}>Reset</button>
          )}
        </div>
        <div className="text-[10px] text-[color:var(--text-muted)] mt-1" data-testid="awards-history-showing">{awardsShowingLabel}</div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[color:var(--hairline)]">
          <input
            type="search"
            value={awardsSearch}
            onChange={(e) => setAwardsSearch(e.target.value)}
            placeholder="Search year, champion, or winner…"
            aria-label="Search awards"
            className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs flex-1 min-w-[160px]"
            data-testid="league-history-awards-search"
          />
          {awardsSearch ? (
            <button
              type="button"
              className="btn text-xs px-2 py-1"
              onClick={() => setAwardsSearch("")}
              data-testid="league-history-awards-reset"
            >
              Clear
            </button>
          ) : null}
          <span
            className="text-[10px] text-[color:var(--text-muted)]"
            data-testid="league-history-awards-showing"
          >
            {buildShowingLabel(filteredAwardSeasons.length, (seasons ?? []).length, "season")}
          </span>
        </div>
        <ScrollArea className="h-[520px]">
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[color:var(--hairline)]"
          data-testid="league-history-awards-controls"
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search year, champion, or winner"
            aria-label="Search awards history"
            className="h-9 flex-1 min-w-[180px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--text-muted)]">
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              aria-label="Sort awards history"
              className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            >
              {Object.entries(AWARDS_HISTORY_SORTS).map(([key, def]) => (
                <option key={key} value={key}>{def.label}</option>
              ))}
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="btn btn-secondary h-9 text-xs"
              onClick={() => { setSearch(''); setSortKey('yearDesc'); }}
              data-testid="league-history-awards-reset"
            >
              Reset
            </button>
          ) : null}
          <span
            className="text-xs text-[color:var(--text-muted)] ml-auto"
            data-testid="league-history-awards-count"
          >
            {buildShowingLabel(displayedSeasons.length, totalSeasons, 'season')}
          </span>
        </div>
        <ScrollArea className="h-[560px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="pl-5"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setAwardSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                >
                  Year {awardSortDir === 'asc' ? '↑' : '↓'}
                </TableHead>
                <TableHead>Champion</TableHead>
                <TableHead>MVP</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.opoy}</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.dpoy}</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.roty}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-[color:var(--text-muted)]">No awards match your search.</TableCell></TableRow>
              ) : sorted.map((s) => (
              {filteredAwardSeasons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[color:var(--text-muted)] py-6">No awards match your search.</TableCell>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-[color:var(--text-muted)]">No seasons match your search.</TableCell>
              {displayedSeasons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="pl-5 py-6 text-center text-[color:var(--text-muted)]">
                    No award seasons match the current filters.
                  </TableCell>
                </TableRow>
              ) : null}
              {displayedSeasons.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-5 font-bold">{s.year}</TableCell>
                  <TableCell>{s.champion?.abbr ?? "—"}</TableCell>
                  <TableCell><AwardCell award={s.awards?.mvp} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.opoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.dpoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.roty} onPlayerSelect={onPlayerSelect} /></TableCell>
                </TableRow>
              ) : (
                filteredAwardSeasons.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-5 font-bold">{s.year}</TableCell>
                    <TableCell>{s.champion?.abbr ?? "—"}</TableCell>
                    <TableCell><AwardCell award={s.awards?.mvp} onPlayerSelect={onPlayerSelect} /></TableCell>
                    <TableCell><AwardCell award={s.awards?.opoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                    <TableCell><AwardCell award={s.awards?.dpoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                    <TableCell><AwardCell award={s.awards?.roty} onPlayerSelect={onPlayerSelect} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LeagueOfficeHistory({ transactions, onPlayerSelect }) {
  const [officeSearch, setOfficeSearch] = useState("");
  const [officeType, setOfficeType] = useState("all");
  const [txQuery, setTxQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [txSortNewest, setTxSortNewest] = useState(true);

  const describeTx = useCallback((tx) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortDir, setSortDir] = useState("desc");

  const describe = (tx) => {
    const leg = tx.legacyType ?? "";
    const bucket = tx.type ?? "";
    const isTrade = leg === "TRADE" || bucket === "trade";
    const isSign = leg === "SIGN" || bucket === "signing";
    const isRelease = leg === "RELEASE" || bucket === "release";
    const isExtend = leg === "EXTEND" || bucket === "extension";
    const isRestructure = leg === "RESTRUCTURE" || bucket === "restructure";
    const isTag = leg === "FRANCHISE_TAG" || bucket === "franchise_tag";
    const isDraft = leg === "DRAFT" || bucket === "draft";
    const isRetire = leg === "RETIREMENT" || bucket === "retirement";
    if (isTrade) return `${tx.fromTeamAbbr ?? "??"} ↔ ${tx.toTeamAbbr ?? "??"} completed a trade package.`;
    if (isSign) return `${tx.teamAbbr ?? "??"} signed ${tx.playerName ?? "player"}.`;
    if (isRelease) return `${tx.teamAbbr ?? "??"} released ${tx.playerName ?? "player"}.`;
    if (isExtend) return `${tx.teamAbbr ?? "??"} extended ${tx.playerName ?? "player"}.`;
    if (isRestructure) return `${tx.teamAbbr ?? "??"} restructured ${tx.playerName ?? "player"}.`;
    if (isTag) return `${tx.teamAbbr ?? "??"} tagged ${tx.playerName ?? "player"}.`;
    if (isDraft) return `${tx.teamAbbr ?? "??"} drafted ${tx.playerName ?? "player"}.`;
    if (isRetire) return `${tx.playerName ?? "Player"} retired${tx.detail ? ` (${tx.detail})` : ""}.`;
    return tx.headline ?? tx.typeLabel ?? tx.type;
  }, []);

  const typeOptions = useMemo(
    () => uniqueFilterOptions(transactions ?? [], (t) => t?.typeLabel ?? t?.type),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    let rows = [...(transactions ?? [])];
    if (txTypeFilter !== 'all') {
      rows = rows.filter((t) => String(t?.typeLabel ?? t?.type ?? '') === txTypeFilter);
    }
    rows = rows.filter((t) =>
      rowMatchesSearch(t, txQuery, [
        'playerName',
        'teamAbbr',
        'fromTeamAbbr',
        'toTeamAbbr',
        'typeLabel',
        'type',
        'headline',
        'seasonId',
        (x) => describeTx(x),
      ]),
    );
    const dir = txSortNewest ? 'desc' : 'asc';
    const seasonOrdinal = (sid) => {
      const s = String(sid ?? '');
      const m = /^s(\d+)$/i.exec(s);
      if (m) return Number(m[1]);
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    return stableSortRows(
      rows,
      (t) => seasonOrdinal(t?.seasonId) * 1e4 + Number(t?.week ?? 0),
      dir,
      (t) => Number(t?.id ?? t?.rawId ?? 0),
    );
  }, [transactions, txQuery, txTypeFilter, txSortNewest, describeTx]);

  const txCap = 200;
  const visibleTransactions = filteredTransactions.slice(0, txCap);
  const txShowingLabel = buildShowingLabel(visibleTransactions.length, filteredTransactions.length, 'move');

  if (!transactions?.length) {
    return (
      <div className="py-8 text-center text-[color:var(--text-muted)]" data-testid="league-office-history-empty">
        No transaction history tracked yet.
      </div>
    );
  }

  const typeOptions = useMemo(
    () => ["all", ...uniqueFilterOptions(transactions ?? [], (tx) => tx?.typeLabel ?? tx?.type).slice(0, 12)],
    [transactions],
  );

  const browsedRows = useMemo(() => {
    const filtered = (transactions ?? []).filter((tx) => {
      const txType = tx?.typeLabel ?? tx?.type ?? "";
      if (typeFilter !== "all" && txType !== typeFilter) return false;
      return rowMatchesSearch(tx, search, [
        "type",
        "typeLabel",
    () => uniqueFilterOptions(transactions, (tx) => transactionTypeLabel(tx)),
    [transactions],
  );

  const rows = useMemo(() => {
    const filtered = (transactions ?? []).filter((tx) => {
      if (typeFilter !== "ALL" && transactionTypeLabel(tx) !== typeFilter) return false;
      return rowMatchesSearch(tx, search, [
        "headline",
        "detail",
        "playerName",
        "teamAbbr",
        "fromTeamAbbr",
        "toTeamAbbr",
        "seasonId",
        "week",
        describe,
      ]);
    });
    const sorted = stableSortRows(filtered, (tx) => {
      if (sort.key === "type") return tx?.typeLabel ?? tx?.type;
      if (sort.key === "player") return tx?.playerName ?? tx?.headline;
      if (sort.key === "team") return tx?.teamAbbr ?? tx?.fromTeamAbbr ?? tx?.toTeamAbbr;
      return `${tx?.seasonId ?? ""}-${String(tx?.week ?? 0).padStart(2, "0")}-${String(tx?.id ?? 0).padStart(8, "0")}`;
    }, sort.dir, (tx) => tx?.id ?? tx?.headline);
    return sorted.slice(0, 120);
  }, [transactions, typeFilter, search, sort]);

  const resetOfficeBrowser = () => {
    setSearch("");
    setTypeFilter("all");
    setSort({ key: "date", dir: "desc" });
  };
        transactionTypeLabel,
      ]);
    });
    return stableSortRows(filtered, transactionSortStamp, sortDir, (tx) => tx?.headline ?? tx?.playerName ?? "");
  }, [search, sortDir, transactions, typeFilter]);

  const hasFilters = Boolean(search.trim()) || typeFilter !== "ALL" || sortDir !== "desc";

  if (!transactions?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No transaction history tracked yet.</div>;

  const txBucket = (tx) => {
    const leg = tx.legacyType ?? "";
    const bucket = tx.type ?? "";
    if (leg === "TRADE" || bucket === "trade") return "trade";
    if (leg === "SIGN" || bucket === "signing") return "signing";
    if (leg === "RELEASE" || bucket === "release") return "release";
    if (leg === "DRAFT" || bucket === "draft") return "draft";
    if (leg === "RETIREMENT" || bucket === "retirement") return "retirement";
    if (leg === "EXTEND" || bucket === "extension") return "extension";
    return bucket || "other";
  };

  const q = normalizeSearchText(txSearch);
  const allRows = transactions.slice(0, 200);
  const filtered = allRows.filter((tx) => {
    if (txType !== 'all' && (tx.type ?? tx.legacyType ?? '').toLowerCase() !== txType) return false;
    if (!q) return true;
    return [tx.playerName, tx.teamAbbr, tx.typeLabel, tx.headline, tx.fromTeamAbbr, tx.toTeamAbbr]
      .some((f) => f && normalizeSearchText(f).includes(q));
  });

  const typeOptions = [...new Set(allRows.map((tx) => tx.type ?? tx.legacyType).filter(Boolean))].sort();
  const hasFilters = q || txType !== 'all';
  const allRows = useMemo(() => (transactions ?? []).slice(0, 120), [transactions]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (officeType !== "all") rows = rows.filter((tx) => txBucket(tx) === officeType);
    if (officeSearch.trim()) {
      rows = rows.filter((tx) =>
        rowMatchesSearch(tx, officeSearch, ['playerName', 'teamAbbr', 'headline', 'typeLabel', 'fromTeamAbbr', 'toTeamAbbr']),
      );
    }
    return rows;
  }, [allRows, officeType, officeSearch]);

  if (!transactions?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No transaction history tracked yet.</div>;

  const officeShowingLabel = buildShowingLabel(filteredRows.length, allRows.length, 'transaction');

  return (
    <Card className="card-premium">
      <CardHeader>
        <CardTitle>League Moves Log</CardTitle>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <input
            type="search"
            value={txSearch}
            onChange={(e) => setTxSearch(e.target.value)}
            placeholder="Search player or team…"
            data-testid="league-office-tx-search"
            className="h-8 w-full sm:w-56 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
          />
          <select
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            data-testid="league-office-tx-type"
            className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
          >
            <option value="all">All types</option>
            {typeOptions.map((t) => <option key={t} value={t.toLowerCase()}>{t}</option>)}
          </select>
          <span className="text-xs text-[color:var(--text-muted)]" data-testid="league-office-tx-count">
            {buildShowingLabel(filtered.length, allRows.length, 'moves')}
          </span>
          {hasFilters && (
            <button type="button" className="text-xs text-[color:var(--accent)]" onClick={() => { setTxSearch(''); setTxType('all'); }}>
              Reset
            </button>
          )}
        </div>
      </CardHeader>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <input
            type="text"
            value={officeSearch}
            onChange={(e) => setOfficeSearch(e.target.value)}
            placeholder="Search player or team…"
            aria-label="Search transactions"
            className="h-8 w-full sm:w-48 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
            data-testid="office-history-search"
          />
          <select
            value={officeType}
            onChange={(e) => setOfficeType(e.target.value)}
            className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs"
            data-testid="office-history-type-filter"
          >
            <option value="all">All types</option>
            <option value="trade">Trades</option>
            <option value="signing">Signings</option>
            <option value="release">Releases</option>
            <option value="draft">Draft</option>
            <option value="retirement">Retirements</option>
            <option value="extension">Extensions</option>
          </select>
          {(officeSearch || officeType !== "all") && (
            <button type="button" className="btn btn-secondary text-xs" onClick={() => { setOfficeSearch(""); setOfficeType("all"); }}>Reset</button>
          )}
        </div>
        <div className="text-[10px] text-[color:var(--text-muted)] mt-1" data-testid="office-history-showing">{officeShowingLabel}</div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[520px]">
          <div className="divide-y divide-[color:var(--hairline)]">
            {filteredRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">No transactions match your search.</div>
            ) : (
              filteredRows.map((tx, idx) => (
                <div key={`${tx.id ?? idx}`} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{tx.typeLabel ?? tx.type}</strong>
                    <span className="text-xs text-[color:var(--text-muted)]">Week {tx.week ?? "?"}</span>
                  </div>
                  <div className="text-[color:var(--text-muted)] mt-1">{describe(tx)}</div>
                  {tx.playerId != null && (
                    <button className="btn mt-2 text-xs" onClick={() => onPlayerSelect?.(tx.playerId)}>Open player</button>
                  )}
                </div>
              ))
            )}
    <Card className="card-premium" data-testid="league-office-history-browser">
      <CardHeader><CardTitle>League Moves Log</CardTitle></CardHeader>
      <CardContent className="p-0 space-y-0">
        <div className="px-4 py-3 space-y-2 border-b border-[color:var(--hairline)]">
          <input
            type="search"
            value={txQuery}
            onChange={(e) => setTxQuery(e.target.value)}
            placeholder="Search player, team, headline, season…"
            className="h-9 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            aria-label="Search transactions"
          />
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-[color:var(--text-muted)] flex items-center gap-1">
              Type
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs max-w-[160px]"
              >
                <option value="all">All types</option>
                {typeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-sm" onClick={() => setTxSortNewest((v) => !v)}>
              {txSortNewest ? 'Newest first' : 'Oldest first'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setTxQuery('');
                setTxTypeFilter('all');
                setTxSortNewest(true);
              }}
            >
              Reset
            </button>
          </div>
          <div className="text-[10px] text-[color:var(--text-muted)]">{txShowingLabel}{filteredTransactions.length > txCap ? ' (list capped)' : ''}</div>
        </div>
        {visibleTransactions.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[color:var(--text-muted)]" data-testid="league-office-history-filtered-empty">
            No moves match these filters. Reset to see the full log.
          </div>
        ) : (
          <ScrollArea className="h-[520px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {visibleTransactions.map((tx, idx) => (
                <div key={`${tx.id ?? idx}`} className="px-4 py-2.5 sm:py-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <strong className="text-[13px] sm:text-sm">{tx.typeLabel ?? tx.type}</strong>
                    <span className="text-[10px] sm:text-xs text-[color:var(--text-muted)] tabular-nums shrink-0">
                      {tx.seasonId != null ? `${tx.seasonId} · ` : ''}Week {tx.week ?? "?"}
                    </span>
                  </div>
                  <div className="text-[color:var(--text-muted)] mt-1 text-xs sm:text-sm leading-snug">{describeTx(tx)}</div>
                  {tx.playerId != null && (
                    <button type="button" className="btn mt-2 text-xs" onClick={() => onPlayerSelect?.(tx.playerId)}>Open player</button>
      <CardContent className="p-0">
        <div className="p-3 space-y-2 border-b border-[color:var(--hairline)]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player, team, type, detail"
            className="h-9 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            aria-label="Search league office transactions"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs" aria-label="Filter league office transactions by type">
              {typeOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All types" : option}</option>)}
            </select>
            <select value={sort.key} onChange={(e) => setSort((curr) => ({ ...curr, key: e.target.value }))} className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-xs" aria-label="Sort league office transactions">
              <option value="date">Sort: Date</option>
              <option value="type">Sort: Type</option>
              <option value="player">Sort: Player</option>
              <option value="team">Sort: Team</option>
            </select>
            <button type="button" className="btn text-xs" onClick={() => setSort((curr) => ({ ...curr, dir: curr.dir === "asc" ? "desc" : "asc" }))}>
              {sort.dir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-muted)]">
            <span>{buildShowingLabel(browsedRows.length, transactions.length, "transaction")}</span>
            <button type="button" className="text-[color:var(--accent)]" onClick={resetOfficeBrowser}>Reset filters</button>
          </div>
        </div>
        <ScrollArea className="h-[560px]">
          <div className="divide-y divide-[color:var(--hairline)]">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">No moves match your filters.</div>
            ) : filtered.map((tx, idx) => (
            {browsedRows.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[color:var(--text-muted)]">No transactions match these filters.</div>
            ) : browsedRows.map((tx, idx) => (
              <div key={`${tx.id ?? idx}`} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{tx.typeLabel ?? tx.type}</strong>
                  <span className="text-xs text-[color:var(--text-muted)]">Week {tx.week ?? "?"}</span>
                </div>
                <div className="text-[color:var(--text-muted)] mt-1">{describe(tx)}</div>
                {tx.playerId != null && (
                  <button className="btn mt-2 text-xs" onClick={() => onPlayerSelect?.(tx.playerId)}>Open player</button>
                )}
              </div>
            ))}
      <CardContent className="p-3 space-y-3">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              aria-label="Search league office transactions"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player, team, type"
              className="h-9 flex-1 min-w-[180px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            />
            <select
              aria-label="Filter league office transactions by type"
              className="h-9 min-w-[150px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All types</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              aria-label="Sort league office transactions"
              className="h-9 min-w-[140px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
            {hasFilters ? (
              <button
                type="button"
                className="btn btn-secondary h-9 text-sm"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("ALL");
                  setSortDir("desc");
                }}
              >
                Reset filters
              </button>
            ) : null}
          </div>
          <div data-testid="league-office-count" className="flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
            <span>{buildShowingLabel(rows.length, transactions.length, "transaction")}</span>
            {typeFilter !== "ALL" ? <span>Type: {typeFilter}</span> : null}
            <span>Sort: {sortDir === "desc" ? "Newest first" : "Oldest first"}</span>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-md border border-[color:var(--hairline)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
            No transactions match these filters.
          </div>
        ) : (
          <ScrollArea className="h-[560px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {rows.map((tx, idx) => (
                <div key={`${tx.id ?? idx}`} data-testid={`league-office-row-${tx.id ?? idx}`} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{transactionTypeLabel(tx)}</strong>
                    <span className="text-xs text-[color:var(--text-muted)]">
                      {tx.seasonId ?? tx.year ?? "Season ?"}
                      {tx.week != null ? ` · Week ${tx.week}` : ""}
                    </span>
                  </div>
                  <div className="text-[color:var(--text-muted)] mt-1">{describe(tx)}</div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {[tx.teamAbbr, tx.fromTeamAbbr && tx.toTeamAbbr ? `${tx.fromTeamAbbr} ↔ ${tx.toTeamAbbr}` : null].filter(Boolean).join(" · ")}
                  </div>
                  {tx.playerId != null && (
                    <button className="btn mt-2 text-xs" onClick={() => onPlayerSelect?.(tx.playerId)}>Open player</button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerCompare({ actions, pool, onPlayerSelect }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [scope, setScope] = useState("career");
  const [search, setSearch] = useState("");

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (pool ?? []).filter((p) => !q || `${p.name} ${p.pos} ${p.teamAbbr}`.toLowerCase().includes(q));
    return rows.slice(0, 120);
  }, [pool, search]);

  useEffect(() => {
    if (selectedIds.length < 2) {
      setProfiles([]);
      return;
    }
    let cancelled = false;
    Promise.all(selectedIds.map((id) => actions.getPlayerCareer(id).then((res) => res?.payload ?? res).catch(() => null))).then((rows) => {
      if (!cancelled) setProfiles(rows.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIds, actions]);

  const statKeys = useMemo(() => {
    const positions = new Set(profiles.map((p) => p?.player?.pos));
    const pos = positions.size === 1 ? [...positions][0] : "QB";
    return POSITION_STAT_KEYS[pos] ?? POSITION_STAT_KEYS.QB;
  }, [profiles]);

  return (
    <div className="space-y-3">
      <Card className="card-premium">
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find players to compare"
              className="h-9 w-full md:w-72 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            />
            <Tabs value={scope} onValueChange={setScope}>
              <TabsList>
                <TabsTrigger value="career">Career</TabsTrigger>
                <TabsTrigger value="season">Single-season peak</TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="secondary">{selectedIds.length} selected (2+ to compare)</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
            {filteredPool.map((p) => {
              const active = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedIds((curr) => active ? curr.filter((id) => id !== p.id) : [...curr, p.id].slice(0, 4))}
                  className={`rounded-md border px-3 py-2 text-left ${active ? "border-[color:var(--accent)] bg-[color:var(--surface-strong)]" : "border-[color:var(--hairline)]"}`}
                >
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">{p.pos} · {p.teamAbbr ?? "FA"} · OVR {p.ovr ?? "—"}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {profiles.length >= 2 ? (
        <Card className="card-premium">
          <CardHeader><CardTitle>Comparison Matrix</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Metric</TableHead>
                  {profiles.map((profile) => <TableHead key={profile.player.id}>{profile.player.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                <CompareRow label="Bio" values={profiles.map((p) => `${p.player.pos} · Age ${p.player.age ?? "—"}`)} />
                <CompareRow label="Contract" values={profiles.map((p) => `${p.player.contract?.years ?? "—"}y · $${p.player.contract?.baseAnnual ?? "—"}M`)} />
                <CompareRow label="Hall of Fame" values={profiles.map((p) => (p.player.hof ? "Yes" : "No"))} />
                <CompareRow label="Championships" values={profiles.map((p) => countAccolade(p.player, "SB_RING"))} />
                <CompareRow label="Awards (MVP/OPOY/DPOY)" values={profiles.map((p) => countAccolade(p.player, "MVP") + countAccolade(p.player, "OPOY") + countAccolade(p.player, "DPOY"))} />
                {statKeys.map((key) => (
                  <CompareRow
                    key={key}
                    label={STAT_LABELS[key] ?? key}
                    values={profiles.map((p) => formatNumber(scope === "career" ? sumCareerStat(p.stats, key) : peakSeasonStat(p.stats, key)))}
                  />
                ))}
                <TableRow>
                  <TableCell className="pl-4 font-semibold">Actions</TableCell>
                  {profiles.map((p) => (
                    <TableCell key={`action-${p.player.id}`}>
                      <button className="text-xs text-[color:var(--accent)]" onClick={() => onPlayerSelect?.(p.player.id)}>
                        Open profile
                      </button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center text-[color:var(--text-muted)] py-8">Select at least two players to compare career vs season value, awards, and context.</div>
      )}
    </div>
  );
}

function AwardCell({ award, onPlayerSelect }) {
  if (!award) return <span className="text-[color:var(--text-muted)]">—</span>;
  return (
    <button className="text-left text-[color:var(--accent)] text-xs sm:text-sm" onClick={() => onPlayerSelect?.(award.playerId)}>
      {award.pos} {award.name}
    </button>
  );
}

function AwardLine({ label, award, onPlayerSelect }) {
  return (
    <div className="rounded-md border border-[color:var(--hairline)] px-3 py-2 text-sm flex justify-between gap-3">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      {award ? (
        <button className="font-semibold text-[color:var(--accent)]" onClick={() => onPlayerSelect?.(award.playerId)}>{award.name}</button>
      ) : (
        <span className="text-[color:var(--text-muted)]">—</span>
      )}
    </div>
  );
}

function SummaryBox({ label, value, muted, onClick }) {
  const content = (
    <div className={`rounded-md border border-[color:var(--hairline)] px-3 py-2 ${onClick ? "cursor-pointer" : ""}`}>
      <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${muted ? "text-[color:var(--text-muted)]" : ""}`}>{value}</div>
    </div>
  );
  if (!onClick) return content;
  return <button onClick={onClick} className="text-left">{content}</button>;
}

function RecordLine({ label, record }) {
  return (
    <div className="rounded-md border border-[color:var(--hairline)] px-3 py-2">
      <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold">{record.team ?? "—"} · {formatNumber(record.value)} ({record.year ?? "—"})</div>
    </div>
  );
}

function CompareRow({ label, values }) {
  return (
    <TableRow>
      <TableCell className="pl-4 font-semibold text-xs uppercase tracking-wide text-[color:var(--text-muted)]">{label}</TableCell>
      {values.map((value, idx) => <TableCell key={`${label}-${idx}`}>{value}</TableCell>)}
    </TableRow>
  );
}

function sumCareerStat(stats = [], key) {
  return stats.reduce((sum, row) => sum + (row?.totals?.[key] ?? 0), 0);
}

function peakSeasonStat(stats = [], key) {
  return stats.reduce((best, row) => Math.max(best, row?.totals?.[key] ?? 0), 0);
}

function countAccolade(player, type) {
  return (player?.accolades ?? []).filter((a) => a.type === type).length;
}

function formatNumber(v) {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return String(v);
}
