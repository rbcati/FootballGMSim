import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildShowingLabel } from "../utils/dataBrowser.js";
import { buildShowingLabel, stableSortRows } from "../utils/dataBrowser.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows } from "../utils/dataBrowser.js";

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "trade", label: "Trades" },
  { value: "signing", label: "Signings" },
  { value: "release", label: "Releases" },
  { value: "draft", label: "Draft" },
  { value: "retirement", label: "Retirements" },
  { value: "extension", label: "Extensions" },
];

const ACTIVITY_SORTS = {
  newest: {
    label: "Newest first",
    getValue: (r) => {
      const season = Number(String(r?.seasonId ?? "").replace(/[^0-9]/g, "")) || 0;
      const week = Number(r?.week ?? 0);
      return season * 1000 + week;
    },
    direction: "desc",
  },
  oldest: {
    label: "Oldest first",
    getValue: (r) => {
      const season = Number(String(r?.seasonId ?? "").replace(/[^0-9]/g, "")) || 0;
      const week = Number(r?.week ?? 0);
      return season * 1000 + week;
    },
    direction: "asc",
  },
  type: { label: "Type (A→Z)", getValue: (r) => r?.typeLabel ?? r?.type ?? "", direction: "asc" },
  team: { label: "Team (A→Z)", getValue: (r) => r?.teamAbbr ?? "", direction: "asc" },
};

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
  const [sortKey, setSortKey] = useState("newest");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

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

  const displayedRows = useMemo(() => {
    const def = ACTIVITY_SORTS[sortKey] ?? ACTIVITY_SORTS.newest;
    return stableSortRows(
      rows,
      def.getValue,
      def.direction,
      (r) => Number(r?.id ?? 0),
    );
  }, [rows, sortKey]);

  const filtersActive =
    seasonId !== "all" || teamId !== "all" || type !== "all" || Boolean(String(search ?? "").trim()) || sortKey !== "newest";
  const displayRows = useMemo(() => {
    const filtered = (rows ?? []).filter((tx) => {
      if (type !== "all" && tx?.type !== type && tx?.typeLabel !== type) return false;
      if (teamId !== "all") {
        const tid = Number(teamId);
        const matchesTeam = [tx?.teamId, tx?.fromTeamId, tx?.toTeamId].some((value) => Number(value) === tid);
        if (!matchesTeam) return false;
      }
      return rowMatchesSearch(tx, search, [
        "playerName",
        "teamAbbr",
        "fromTeamAbbr",
        "toTeamAbbr",
        "type",
        "typeLabel",
        "headline",
        "detail",
        "seasonId",
        "week",
      ]);
    });
    return stableSortRows(filtered, (tx) => {
      if (sort.key === "type") return tx?.typeLabel ?? tx?.type;
      if (sort.key === "player") return tx?.playerName ?? tx?.headline;
      if (sort.key === "team") return tx?.teamAbbr ?? tx?.fromTeamAbbr ?? tx?.toTeamAbbr;
      return `${tx?.seasonId ?? ""}-${String(tx?.week ?? 0).padStart(2, "0")}-${String(tx?.id ?? 0).padStart(8, "0")}`;
    }, sort.dir, (tx) => tx?.id ?? tx?.headline);
  }, [rows, type, teamId, search, sort]);

  const hasActiveFilters = seasonId !== "all" || teamId !== "all" || type !== "all" || search.trim() || sort.key !== "date" || sort.dir !== "desc";
  const resetFilters = () => {
    setSeasonId("all");
    setTeamId("all");
    setType("all");
    setSearch("");
    setSortKey("newest");
    setSort({ key: "date", dir: "desc" });
  };

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
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Sort
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            aria-label="Sort league activity"
          >
            {Object.entries(ACTIVITY_SORTS).map(([key, def]) => (
              <option key={key} value={key}>{def.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary h-9 text-sm" onClick={() => load()}>
          Refresh
        </button>
        {(type !== 'all' || teamId !== 'all' || seasonId !== 'all' || search.trim()) ? (
          <button
            type="button"
            className="btn btn-secondary h-9 text-sm"
            data-testid="league-activity-reset"
            onClick={() => { setSeasonId('all'); setTeamId('all'); setType('all'); setSearch(''); }}
          >
            Reset
          </button>
        ) : null}
      </div>

      {!loading && (
        <div className="text-xs text-[color:var(--text-muted)]" data-testid="league-activity-showing">
          {buildShowingLabel(rows.length, rows.length, 'transactions')}
          {(type !== 'all' || teamId !== 'all' || search.trim()) ? ' (filtered)' : ''}
        {(search || type !== "all" || teamId !== "all" || seasonId !== "all") && (
          <button
            type="button"
            className="btn btn-secondary h-9 text-sm"
            onClick={() => { setSearch(""); setType("all"); setTeamId("all"); setSeasonId("all"); }}
          >
            Reset filters
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary h-9 text-sm"
          onClick={() => { setSeasonId("all"); setTeamId("all"); setType("all"); setSearch(""); }}
          data-testid="league-activity-reset"
        >
          Reset
        </button>
        {filtersActive ? (
          <button
            type="button"
            className="btn btn-secondary h-9 text-sm"
            onClick={resetFilters}
            data-testid="league-activity-reset"
          >
            Reset filters
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center justify-between text-xs text-[color:var(--text-muted)]"
        data-testid="league-activity-count"
      >
        <span>{buildShowingLabel(displayedRows.length, rows.length, "transaction")}</span>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Sort
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={sort.key}
            onChange={(e) => setSort((curr) => ({ ...curr, key: e.target.value }))}
          >
            <option value="date">Date / week</option>
            <option value="type">Type</option>
            <option value="player">Player</option>
            <option value="team">Team</option>
          </select>
        </label>
        <button type="button" className="btn h-9 text-sm" onClick={() => setSort((curr) => ({ ...curr, dir: curr.dir === "asc" ? "desc" : "asc" }))}>
          {sort.dir === "asc" ? "Asc" : "Desc"}
        </button>
        <button type="button" className="btn btn-secondary h-9 text-sm" onClick={resetFilters}>
          Reset filters
        </button>
      </div>
      <div className="text-xs text-[color:var(--text-muted)]">
        {buildShowingLabel(displayRows.length, rows.length, "transaction")}
      </div>

      {!loading && (
        <div className="text-xs text-[color:var(--text-muted)]" data-testid="league-activity-showing-label">
          {buildShowingLabel(rows.length, rows.length, 'transaction')}
          {(type !== 'all' || teamId !== 'all' || seasonId !== 'all' || search) ? ' (filtered)' : ''}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-[color:var(--text-muted)]">Loading activity…</div>
      ) : !displayedRows.length ? (
      ) : !displayRows.length ? (
        <div className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-strong)]/30 px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
          {hasActiveFilters ? "No transactions match these filters." : "Transactions will appear as your league signs, drafts, trades, releases, and retires players."}
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
            {displayedRows.map((tx, idx) => (
              <li key={`${tx.id ?? idx}-${idx}`} className="px-3 py-3 text-sm">
            {displayRows.map((tx, idx) => (
              <li key={`${tx.id ?? idx}-${idx}`} className="px-3 py-3 text-sm" data-testid="league-activity-row">
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
