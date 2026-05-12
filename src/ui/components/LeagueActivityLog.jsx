import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildShowingLabel } from "../utils/dataBrowser.js";

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "trade", label: "Trades" },
  { value: "signing", label: "Signings" },
  { value: "release", label: "Releases" },
  { value: "draft", label: "Draft" },
  { value: "retirement", label: "Retirements" },
  { value: "extension", label: "Extensions" },
];

/**
 * League-wide transaction / activity feed (mobile-first).
 */
export default function LeagueActivityLog({ league, actions, onPlayerSelect, onTeamSelect }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState("all");
  const [teamId, setTeamId] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  const teams = league?.teams ?? [];
  const [archiveSeasons, setArchiveSeasons] = useState([]);
  useEffect(() => {
    let m = true;
    (actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }))
      .then((res) => {
        if (!m) return;
        setArchiveSeasons(res?.payload?.seasons ?? res?.seasons ?? []);
      })
      .catch(() => { if (m) setArchiveSeasons([]); });
    return () => { m = false; };
  }, [actions]);

  const seasonsOptions = useMemo(() => {
    const map = new Map();
    if (league?.seasonId != null) {
      map.set(String(league.seasonId), { id: String(league.seasonId), label: `Current (${league?.year ?? "—"})` });
    }
    for (const s of archiveSeasons || []) {
      const sid = s?.id != null ? String(s.id) : null;
      if (!sid || map.has(sid)) continue;
      map.set(sid, { id: sid, label: `${s.year ?? "—"} · ${s?.champion?.abbr ?? "season"}` });
    }
    return [...map.values()];
  }, [league?.seasonId, league?.year, archiveSeasons]);

  const load = useCallback(async () => {
    if (!actions?.getTransactions) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = { limit: 400, search: search.trim() || undefined };
      if (type !== "all") payload.type = type;
      if (teamId !== "all") payload.teamId = Number(teamId);
      if (seasonId === "all") {
        payload.mode = "recent";
      } else {
        payload.seasonId = seasonId;
      }
      const res = await actions.getTransactions(payload);
      const list = res?.payload?.transactions ?? res?.transactions ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [actions, seasonId, teamId, type, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3" data-testid="league-activity-log">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Season
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            <option value="all">All seasons (recent)</option>
            {seasonsOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.label ?? s.id}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Team
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm min-w-[140px]"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.abbr ?? t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Type
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)] flex-1 min-w-[160px]">
          Search
          <input
            type="search"
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm w-full"
            placeholder="Player or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </label>
        <button type="button" className="btn btn-secondary h-9 text-sm" onClick={() => load()}>
          Refresh
        </button>
        <button
          type="button"
          className="btn btn-secondary h-9 text-sm"
          onClick={() => { setSeasonId("all"); setTeamId("all"); setType("all"); setSearch(""); }}
          data-testid="league-activity-reset"
        >
          Reset
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[color:var(--text-muted)]">Loading activity…</div>
      ) : !rows.length ? (
        <div className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-strong)]/30 px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
          Transactions will appear as your league signs, drafts, trades, releases, and retires players.
        </div>
      ) : (
        <>
          <div
            className="text-xs text-[color:var(--text-muted)] px-1"
            data-testid="league-activity-showing"
          >
            {buildShowingLabel(rows.length, rows.length, "transaction")}
          </div>
        <ScrollArea className="h-[min(520px,65vh)] rounded-lg border border-[color:var(--hairline)]">
          <ul className="divide-y divide-[color:var(--hairline)]">
            {rows.map((tx, idx) => (
              <li key={`${tx.id ?? idx}-${idx}`} className="px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {tx.typeLabel ?? tx.type ?? "—"}
                  </Badge>
                  <span className="text-[11px] text-[color:var(--text-muted)]">
                    {tx.dateLabel ?? (tx.week != null ? `Week ${tx.week}` : "")}
                    {tx.teamAbbr ? ` · ${tx.teamAbbr}` : ""}
                  </span>
                </div>
                <div className="mt-1 font-semibold text-[color:var(--text)]">{tx.headline ?? tx.typeLabel}</div>
                {tx.detail ? <div className="mt-0.5 text-xs text-[color:var(--text-muted)]">{tx.detail}</div> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {tx.playerId != null ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-[color:var(--accent)]"
                      onClick={() => onPlayerSelect?.(tx.playerId)}
                    >
                      {tx.playerName ?? "Player profile"}
                    </button>
                  ) : null}
                  {tx.teamId != null ? (
                    <button
                      type="button"
                      className="text-xs text-[color:var(--accent)]"
                      onClick={() => onTeamSelect?.(tx.teamId)}
                    >
                      {tx.teamAbbr ?? `Team ${tx.teamId}`}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
        </>
      )}
    </div>
  );
}
