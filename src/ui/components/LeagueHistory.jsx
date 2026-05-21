import React, { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { AWARD_DISPLAY_NAMES } from '../../core/footballMeta';
import { buildLeagueHistoryTopPerformers } from '../../core/playerSeasonStatsArchive.js';
import { normalizeArchivedMajorTransactions } from '../../core/transactionTimeline.js';
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from "../utils/dataBrowser.js";
import { buildLeagueRecordsRows, filterRecordRows, SCOPE_OPTIONS, CATEGORY_OPTIONS } from '../utils/leagueRecordsViewModel.js';

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

        <TabsContent value="seasons">
          <SeasonExplorer seasons={seasons} actions={api} onPlayerSelect={onPlayerSelect} onOpenBoxScore={onOpenBoxScore} league={league} initialSelectedSeasonId={initialSelectedSeasonId} />
        </TabsContent>

        <TabsContent value="records">
          <RecordsExplorer records={records} recordBook={recordBook} seasons={seasons} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="awards">
          <AwardsHistory seasons={seasons} onPlayerSelect={onPlayerSelect} />
        </TabsContent>

        <TabsContent value="office">
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
        <CardHeader><CardTitle>Season Archive</CardTitle></CardHeader>
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
              {selected?.champion?.abbr ?? selected?.champion?.name ?? "Champion TBD"}
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
            <SummaryBox label="Champion" value={selected?.champion?.name ?? "TBD"} />
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
  // V1 state — always declared before any conditional returns
  const v1Rows = useMemo(() => buildLeagueRecordsRows(recordBook), [recordBook]);
  const [v1Scope, setV1Scope] = useState('all');
  const [v1Category, setV1Category] = useState('all');
  const [v1Search, setV1Search] = useState('');
  const filteredV1Rows = useMemo(
    () => filterRecordRows(v1Rows, { scope: v1Scope, category: v1Category, search: v1Search }),
    [v1Rows, v1Scope, v1Category, v1Search],
  );

  // Legacy state — always declared
  const [legacyScope, setLegacyScope] = useState('singleSeason');
  const legacyTeamSeasonRecords = useMemo(() => {
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

  const hasV1Data = v1Rows.length > 0;
  const hasV1Filters = v1Scope !== 'all' || v1Category !== 'all' || Boolean(v1Search.trim());

  // ── V1 path ─────────────────────────────────────────────────────────────────
  if (hasV1Data) {
    return (
      <div className="space-y-4" data-testid="records-v1-view">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Scope filter">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={v1Scope === opt.value}
                className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                  v1Scope === opt.value
                    ? 'bg-[color:var(--accent)] text-white border-[color:var(--accent)]'
                    : 'border-[color:var(--hairline)] bg-[color:var(--surface)] text-[color:var(--text)]'
                }`}
                onClick={() => setV1Scope(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              aria-label="Search records"
              type="search"
              value={v1Search}
              onChange={(e) => setV1Search(e.target.value)}
              placeholder="Search player, team, year…"
              className="h-9 flex-1 min-w-[180px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            />
            <select
              aria-label="Filter records by category"
              className="h-9 min-w-[160px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
              value={v1Category}
              onChange={(e) => setV1Category(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {hasV1Filters ? (
              <button
                type="button"
                className="btn btn-secondary h-9 text-sm"
                onClick={() => { setV1Scope('all'); setV1Category('all'); setV1Search(''); }}
              >
                Reset filters
              </button>
            ) : null}
          </div>
          <div data-testid="records-count" className="text-xs text-[color:var(--text-muted)]">
            {buildShowingLabel(filteredV1Rows.length, v1Rows.length, 'record')}
          </div>
        </div>

        {filteredV1Rows.length === 0 ? (
          <div className="rounded-md border border-[color:var(--hairline)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
            No records match these filters.
          </div>
        ) : (
          <Card className="card-premium">
            <CardContent className="p-0">
              <ScrollArea className="h-[560px]">
                <div className="divide-y divide-[color:var(--hairline)]">
                  {filteredV1Rows.map((row) => (
                    <RecordRow key={row.id} row={row} onPlayerSelect={onPlayerSelect} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!records) {
    return (
      <div data-testid="records-empty-state" className="py-10 text-center text-[color:var(--text-muted)]">
        <div className="font-semibold text-[color:var(--text)]">Records will populate as seasons are archived.</div>
        <div className="mt-2 text-sm">Complete seasons to build your league's historical record book.</div>
      </div>
    );
  }

  // ── Legacy path (pre-V1 saves) ───────────────────────────────────────────────
  const legacySource = legacyScope === 'singleSeason'
    ? (recordBook?.singleSeason ?? records.singleSeason)
    : legacyScope === 'game'
      ? (recordBook?.singleGame ?? records.singleGame)
      : (recordBook?.career ?? records.allTime);

  return (
    <div className="space-y-4">
      <Tabs value={legacyScope} onValueChange={setLegacyScope}>
        <TabsList>
          <TabsTrigger value="game">Single-game</TabsTrigger>
          <TabsTrigger value="singleSeason">Single-season</TabsTrigger>
          <TabsTrigger value="allTime">Career</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="text-xs text-[color:var(--text-muted)]">
        {legacyScope === 'game' ? 'Highest one-game outputs in archive.' : legacyScope === 'singleSeason' ? 'Best one-season marks and team highs.' : 'All-time career records and long-run leaders.'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(legacyScope === 'singleSeason' ? (recordBook?.singleSeason ?? RECORD_LABELS) : (legacySource ?? {})).map(([key, raw]) => {
          const label = typeof raw === 'string' ? raw : RECORD_LABELS[key] ?? key;
          const rec = legacySource?.[key];
          if (!rec?.playerId) return null;
          return (
            <Card key={key} className="card-premium cursor-pointer" onClick={() => onPlayerSelect?.(rec.playerId)}>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">{label}</div>
                <div className="text-2xl font-black text-[color:var(--accent)]">{Number(rec.value ?? 0).toLocaleString()}</div>
                <div className="text-sm font-semibold">{rec.name} ({rec.pos})</div>
                <div className="text-xs text-[color:var(--text-muted)]">{rec.team} · {rec.year ?? rec.lastYear ?? '—'}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="card-premium">
        <CardHeader><CardTitle>Team & Franchise Season Records</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <RecordLine label="Most wins" record={legacyTeamSeasonRecords.bestWins} />
          <RecordLine label="Fewest wins" record={legacyTeamSeasonRecords.worstWins} />
          <RecordLine label="Most points for" record={legacyTeamSeasonRecords.bestPF} />
          <RecordLine label="Most points allowed" record={legacyTeamSeasonRecords.worstPA} />
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

function RecordRow({ row, onPlayerSelect }) {
  const canOpenPlayer = row.playerId != null && onPlayerSelect != null;
  const scopeLabel = row.scope === 'singleSeason'
    ? 'Season record'
    : row.scope === 'career'
      ? `Career · #${row.rank}`
      : 'Team record';
  const categoryLabel = String(row.category ?? '').charAt(0).toUpperCase() + String(row.category ?? '').slice(1);

  return (
    <div className="px-4 py-3" data-testid={`record-row-${row.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--text-muted)] mb-0.5">
            <span className="font-semibold">{scopeLabel}</span>
            <span>·</span>
            <span>{categoryLabel}</span>
          </div>
          <div className="text-sm font-semibold text-[color:var(--text)] truncate">{row.label}</div>
          <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
            {canOpenPlayer ? (
              <button
                type="button"
                className="text-[color:var(--accent)] font-semibold hover:underline"
                onClick={() => onPlayerSelect(row.playerId)}
                data-testid={`record-row-player-btn-${row.id}`}
              >
                {row.playerName ?? 'Player'}
              </button>
            ) : row.playerName ? (
              <span className="font-semibold">{row.playerName}</span>
            ) : null}
            {row.position ? ` (${row.position})` : ''}
            {(row.teamAbbr ?? row.teamName) ? ` · ${row.teamAbbr ?? row.teamName}` : ''}
            {row.year ? ` · ${row.year}` : ''}
          </div>
        </div>
        <div className="text-xl font-black text-[color:var(--accent)] tabular-nums shrink-0">
          {row.displayValue}
        </div>
      </div>
    </div>
  );
}

function AwardsHistory({ seasons, onPlayerSelect }) {
  if (!seasons?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No award history yet.</div>;

  return (
    <Card className="card-premium">
      <CardHeader><CardTitle>Awards by Season</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[560px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Year</TableHead>
                <TableHead>Champion</TableHead>
                <TableHead>MVP</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.opoy}</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.dpoy}</TableHead>
                <TableHead>{AWARD_DISPLAY_NAMES.roty}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasons.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-5 font-bold">{s.year}</TableCell>
                  <TableCell>{s.champion?.abbr ?? "—"}</TableCell>
                  <TableCell><AwardCell award={s.awards?.mvp} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.opoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.dpoy} onPlayerSelect={onPlayerSelect} /></TableCell>
                  <TableCell><AwardCell award={s.awards?.roty} onPlayerSelect={onPlayerSelect} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LeagueOfficeHistory({ transactions, onPlayerSelect }) {
  const [search, setSearch] = useState("");
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
  };

  const typeOptions = useMemo(
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
        transactionTypeLabel,
      ]);
    });
    return stableSortRows(filtered, transactionSortStamp, sortDir, (tx) => tx?.headline ?? tx?.playerName ?? "");
  }, [search, sortDir, transactions, typeFilter]);

  const hasFilters = Boolean(search.trim()) || typeFilter !== "ALL" || sortDir !== "desc";

  if (!transactions?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No transaction history tracked yet.</div>;

  return (
    <Card className="card-premium">
      <CardHeader><CardTitle>League Moves Log</CardTitle></CardHeader>
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
