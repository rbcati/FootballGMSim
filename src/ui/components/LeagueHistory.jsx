import React, { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";

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

export default function LeagueHistory({ onPlayerSelect, actions, league, onOpenBoxScore }) {
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
      ? api.getTransactions({}).catch(() => ({ payload: { transactions: [] } }))
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
          <SeasonExplorer seasons={seasons} onPlayerSelect={onPlayerSelect} onOpenBoxScore={onOpenBoxScore} />
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

function SeasonExplorer({ seasons, onPlayerSelect, onOpenBoxScore }) {
  const [selectedSeasonId, setSelectedSeasonId] = useState(seasons?.[0]?.id ?? null);

  useEffect(() => {
    if (!selectedSeasonId && seasons.length) setSelectedSeasonId(seasons[0].id);
  }, [seasons, selectedSeasonId]);

  if (!seasons?.length) {
    return <div className="py-8 text-center text-[color:var(--text-muted)]">No archived seasons yet.</div>;
  }

  const selected = seasons.find((s) => s.id === selectedSeasonId) ?? seasons[0];
  const sortedStandings = [...(selected?.standings ?? [])].sort((a, b) => b.pct - a.pct).slice(0, 8);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      <Card className="card-premium">
        <CardHeader><CardTitle>Season Archive</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <div className="divide-y divide-[color:var(--hairline)]">
              {seasons.map((s) => (
                <button
                  key={s.id}
                  className={`w-full text-left px-4 py-3 ${selected?.id === s.id ? "bg-[color:var(--surface-strong)]" : ""}`}
                  onClick={() => setSelectedSeasonId(s.id)}
                >
                  <div className="font-bold text-sm">{s.year}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">{s.champion?.abbr ?? "TBD"} champion</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardHeader>
          <CardTitle>{selected?.year} League Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryBox label="Champion" value={selected?.champion?.name ?? "TBD"} />
            <SummaryBox label="Runner-up" value={selected?.runnerUp?.name ?? "—"} muted={!selected?.runnerUp} />
            <SummaryBox label="MVP" value={selected?.awards?.mvp?.name ?? "—"} onClick={selected?.awards?.mvp?.playerId != null ? () => onPlayerSelect?.(selected.awards.mvp.playerId) : undefined} />
          </div>

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
          </section>

          <section>
            <h4 className="text-sm font-bold mb-2">Awards & Leaders</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <AwardLine label="MVP" award={selected?.awards?.mvp} onPlayerSelect={onPlayerSelect} />
              <AwardLine label="OPOY" award={selected?.awards?.opoy} onPlayerSelect={onPlayerSelect} />
              <AwardLine label="DPOY" award={selected?.awards?.dpoy} onPlayerSelect={onPlayerSelect} />
              <AwardLine label="ROTY" award={selected?.awards?.roty} onPlayerSelect={onPlayerSelect} />
            </div>
            <div className="text-xs text-[color:var(--text-muted)] mt-2">
              Playoff bracket/path is not currently stored in archived season summaries.
            </div>
          </section>
          <section>
            <h4 className="text-sm font-bold mb-2">Completed game archive</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {(selected?.gameIndex ?? []).slice(-12).reverse().map((game) => {
                const presentation = buildCompletedGamePresentation(game, { seasonId: selected?.year, source: "league_history" });
                const clickable = Boolean(presentation.canOpen && onOpenBoxScore);
                return (
                  <button
                    key={game.id}
                    className="rounded-md border border-[color:var(--hairline)] px-3 py-2 text-left"
                    onClick={() => openResolvedBoxScore(game, { seasonId: selected?.year, source: "league_history" }, onOpenBoxScore)}
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
        </CardContent>
      </Card>
    </div>
  );
}

function RecordsExplorer({ records, recordBook, seasons, onPlayerSelect }) {
  const [scope, setScope] = useState("singleSeason");

  if (!records) return <div className="py-8 text-center text-[color:var(--text-muted)]">No records tracked yet.</div>;

  const source = scope === "singleSeason" ? (recordBook?.singleSeason ?? records.singleSeason) : (recordBook?.career ?? records.allTime);

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
          <TabsTrigger value="singleSeason">Single-season</TabsTrigger>
          <TabsTrigger value="allTime">Career</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(recordBook?.singleSeason ?? RECORD_LABELS).map(([key, raw]) => {
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
                <TableHead>OPOY</TableHead>
                <TableHead>DPOY</TableHead>
                <TableHead>ROTY</TableHead>
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
  if (!transactions?.length) return <div className="py-8 text-center text-[color:var(--text-muted)]">No transaction history tracked yet.</div>;

  const rows = transactions.slice(0, 120);
  const describe = (tx) => {
    if (tx.type === "TRADE") return `${tx.fromTeamAbbr ?? "??"} ↔ ${tx.toTeamAbbr ?? "??"} completed a trade package.`;
    if (tx.type === "SIGN") return `${tx.teamAbbr ?? "??"} signed ${tx.playerName ?? "player"}.`;
    if (tx.type === "RELEASE") return `${tx.teamAbbr ?? "??"} released ${tx.playerName ?? "player"}.`;
    if (tx.type === "EXTEND") return `${tx.teamAbbr ?? "??"} extended ${tx.playerName ?? "player"}.`;
    if (tx.type === "RESTRUCTURE") return `${tx.teamAbbr ?? "??"} restructured ${tx.playerName ?? "player"}.`;
    if (tx.type === "FRANCHISE_TAG") return `${tx.teamAbbr ?? "??"} tagged ${tx.playerName ?? "player"}.`;
    return tx.typeLabel ?? tx.type;
  };

  return (
    <Card className="card-premium">
      <CardHeader><CardTitle>League Moves Log</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[560px]">
          <div className="divide-y divide-[color:var(--hairline)]">
            {rows.map((tx, idx) => (
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
          </div>
        </ScrollArea>
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
