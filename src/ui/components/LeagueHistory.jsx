/**
 * LeagueHistory.jsx
 *
 * Tabbed view combining:
 *  - Super Bowl Champions history table
 *  - Record Book (single-season & all-time career records)
 *
 * Mobile-first Tailwind v4 with dark: mode support.
 */
import React, { useEffect, useState } from "react";
import ResponsivePlayerAvatar from "./ResponsivePlayerAvatar.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const RECORD_LABELS = {
  passYd: "Passing Yards",
  rushYd: "Rushing Yards",
  recYd: "Receiving Yards",
  passTD: "Passing TDs",
  sacks: "Sacks",
};

export default function LeagueHistory({ onPlayerSelect, actions }) {
  const [seasons, setSeasons] = useState(null);
  const [records, setRecords] = useState(null);
  const [activeTab, setActiveTab] = useState("champions");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      actions.getAllSeasons().catch(() => ({ payload: { seasons: [] } })),
      actions.getRecords().catch(() => ({ payload: { records: null } })),
    ]).then(([seasonsRes, recordsRes]) => {
      if (!mounted) return;
      setSeasons(seasonsRes?.payload?.seasons ?? seasonsRes?.seasons ?? []);
      setRecords(recordsRes?.payload?.records ?? null);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [actions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        Loading history...
      </div>
    );
  }

  const hasSeasons = seasons && seasons.length > 0;
  const hasRecords = records && (
    Object.values(records.singleSeason || {}).some(r => r.playerId) ||
    Object.values(records.allTime || {}).some(r => r.playerId)
  );

  if (!hasSeasons && !hasRecords) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        No history available yet. Complete a season to see it here!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="champions">Champions</TabsTrigger>
          <TabsTrigger value="records">Record Book</TabsTrigger>
        </TabsList>
        <TabsContent value="champions">
          <ChampionsTable seasons={seasons} onPlayerSelect={onPlayerSelect} />
        </TabsContent>
        <TabsContent value="records">
          <RecordBook records={records} onPlayerSelect={onPlayerSelect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Champions Table ─────────────────────────────────────────────────────── */

function ChampionsTable({ seasons, onPlayerSelect }) {
  if (!seasons || seasons.length === 0) {
    return (
      <div className="py-8 text-center text-[color:var(--text-muted)]">
        No champions yet.
      </div>
    );
  }

  return (
    <Card className="card-premium">
      <CardHeader>
        <CardTitle>Super Bowl Champions</CardTitle>
      </CardHeader>

      {/* Mobile: card layout, Desktop: table */}
      <CardContent className="p-0">
        <div className="hidden md:block">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Year</TableHead>
                  <TableHead>Champion</TableHead>
                  <TableHead>Best Record</TableHead>
                  <TableHead>MVP</TableHead>
                  <TableHead>OPOY</TableHead>
                  <TableHead>DPOY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasons.map((s) => {
                  const bestTeam = s.standings?.sort((a, b) => b.pct - a.pct)[0];
                  const bestRecord = bestTeam
                    ? `${bestTeam.wins}-${bestTeam.losses}${bestTeam.ties > 0 ? "-" + bestTeam.ties : ""}`
                    : "-";

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="pl-5 font-bold">{s.year}</TableCell>
                      <TableCell>
                        {s.champion ? (
                          <span className="font-semibold text-[color:var(--text)]">
                            {s.champion.name}{" "}
                            <span className="text-xs text-[color:var(--text-muted)]">
                              ({s.champion.abbr})
                            </span>
                          </span>
                        ) : "N/A"}
                      </TableCell>
                      <TableCell>
                        {bestTeam ? (
                          <span>
                            {bestTeam.abbr}{" "}
                            <span className="text-[color:var(--text-muted)]">{bestRecord}</span>
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <AwardCell award={s.awards?.mvp} onPlayerSelect={onPlayerSelect} highlight />
                      </TableCell>
                      <TableCell>
                        <AwardCell award={s.awards?.opoy} onPlayerSelect={onPlayerSelect} />
                      </TableCell>
                      <TableCell>
                        <AwardCell award={s.awards?.dpoy} onPlayerSelect={onPlayerSelect} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-[color:var(--hairline)]">
          {seasons.map((s) => {
            const bestTeam = s.standings?.sort((a, b) => b.pct - a.pct)[0];
            const bestRecord = bestTeam
              ? `${bestTeam.wins}-${bestTeam.losses}${bestTeam.ties > 0 ? "-" + bestTeam.ties : ""}`
              : "";
            return (
              <div key={s.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[color:var(--text)]">{s.year}</span>
                  {s.champion && (
                    <span className="font-semibold text-sm text-[color:var(--accent)]">
                      {s.champion.abbr}
                    </span>
                  )}
                </div>
                {s.champion && (
                  <div className="text-sm text-[color:var(--text)]">{s.champion.name}</div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--text-muted)]">
                  {bestTeam && <span>Best: {bestTeam.abbr} {bestRecord}</span>}
                  {s.awards?.mvp && (
                    <span
                      className="cursor-pointer text-[color:var(--accent)] font-semibold"
                      onClick={() => onPlayerSelect?.(s.awards.mvp.playerId)}
                    >
                      MVP: {s.awards.mvp.name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AwardCell({ award, onPlayerSelect, highlight }) {
  if (!award) return <span className="text-[color:var(--text-muted)]">-</span>;
  return (
    <span
      className={`cursor-pointer interactive-player-name ${highlight ? "text-[color:var(--accent)] font-semibold" : ""}`}
      onClick={() => onPlayerSelect?.(award.playerId)}
    >
      {award.pos} {award.name}
    </span>
  );
}

/* ── Record Book ─────────────────────────────────────────────────────────── */

function RecordBook({ records, onPlayerSelect }) {
  const [recordTab, setRecordTab] = useState("singleSeason");

  if (!records) {
    return (
      <div className="py-8 text-center text-[color:var(--text-muted)]">
        No records tracked yet. Complete a season to populate the Record Book!
      </div>
    );
  }

  const data = recordTab === "singleSeason" ? records.singleSeason : records.allTime;
  const hasData = data && Object.values(data).some(r => r?.playerId);

  return (
    <div className="space-y-4">
      {/* Record type tabs */}
      <Tabs value={recordTab} onValueChange={setRecordTab}>
        <TabsList>
          <TabsTrigger value="singleSeason">Single Season</TabsTrigger>
          <TabsTrigger value="allTime">All-Time Career</TabsTrigger>
        </TabsList>
        <TabsContent value="singleSeason">
          {!hasData ? (
            <div className="py-8 text-center text-[color:var(--text-muted)]">
              No single-season records yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(RECORD_LABELS).map(([key, label]) => {
                const rec = data?.[key];
                if (!rec?.playerId) return null;
                return (
                  <RecordCard
                    key={key}
                    label={label}
                    record={rec}
                    isCareer={recordTab === "allTime"}
                    onPlayerSelect={onPlayerSelect}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="allTime">
          {!hasData ? (
            <div className="py-8 text-center text-[color:var(--text-muted)]">
              No all-time records yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(RECORD_LABELS).map(([key, label]) => {
                const rec = data?.[key];
                if (!rec?.playerId) return null;
                return (
                  <RecordCard
                    key={key}
                    label={label}
                    record={rec}
                    isCareer={recordTab === "allTime"}
                    onPlayerSelect={onPlayerSelect}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Record History Log */}
      {records.history && records.history.length > 0 && (
        <Card className="rounded-xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)]">
          <CardHeader className="px-5 py-3 bg-[color:var(--surface-strong)] border-b border-[color:var(--hairline)]">
            <CardTitle className="text-sm font-bold text-[color:var(--text)] m-0">
              Record History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[color:var(--hairline)] max-h-64 overflow-y-auto">
              {[...records.history].reverse().slice(0, 20).map((entry, i) => (
                <div key={i} className="px-4 py-2 text-sm flex items-center gap-2">
                  <span className="text-[color:var(--text-muted)] text-xs font-mono shrink-0">
                    {entry.year}
                  </span>
                  <span className="text-[color:var(--text)]">
                    <span className="font-semibold">{entry.player}</span>
                    {" "}
                    <span className="text-[color:var(--text-muted)]">({entry.pos}, {entry.team})</span>
                    {" "}set {entry.type === "singleSeason" ? "single-season" : "all-time"}{" "}
                    {entry.label} record:{" "}
                    <span className="font-bold text-[color:var(--accent)]">
                      {entry.newValue.toLocaleString()}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecordCard({ label, record, isCareer, onPlayerSelect }) {
  return (
    <div
      className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--hairline)] p-4
                 hover:border-[color:var(--accent)] transition-colors cursor-pointer"
      onClick={() => record.playerId && onPlayerSelect?.(record.playerId)}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-3">
        {label}
      </div>

      <div className="flex items-center gap-3">
        <ResponsivePlayerAvatar
          teamColor="var(--accent)"
          text={record.pos || "?"}
          position={record.pos}
          showPositionBadge
          style={{ width: 48, height: 48, flexShrink: 0 }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[color:var(--text)] truncate">
            {record.name}
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">
            {record.team} &middot; {isCareer ? `Through ${record.lastYear ?? record.year}` : record.year}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-[color:var(--accent)]">
            {record.value?.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
