import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { stableSortRows } from "../utils/dataBrowser.js";
import { ACTIVITY_LOG_FILTERS, buildActivityLogViewModel } from "../utils/activityLogViewModel.js";

const SORT_OPTIONS = [
  { value: "date", label: "Date / week" },
  { value: "type", label: "Type" },
  { value: "player", label: "Player" },
  { value: "team", label: "Team" },
];

function transactionStamp(tx) {
  if (Number.isFinite(Number(tx?.sortDate))) return Number(tx.sortDate);
  const seasonNumber = Number(String(tx?.seasonId ?? "").replace(/[^0-9]/g, "")) || Number(tx?.season ?? 0) || Number(tx?.year ?? 0) || 0;
  return seasonNumber * 1000 + Number(tx?.week ?? 0);
}

function sortValue(tx, key) {
  if (key === "type") return tx?.label ?? tx?.typeLabel ?? tx?.type ?? "";
  if (key === "player") return tx?.playerName ?? tx?.headline ?? "";
  if (key === "team") return tx?.teamAbbr ?? tx?.fromTeamAbbr ?? tx?.toTeamAbbr ?? tx?.team?.abbr ?? "";
  return transactionStamp(tx);
}

function buildActivityShowingLabel(visible, total) {
  const safeVisible = Number.isFinite(Number(visible)) ? Number(visible) : 0;
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  return `Showing ${safeVisible} of ${safeTotal} ${safeTotal === 1 ? "activity" : "activities"}`;
}

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
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [archiveSeasons, setArchiveSeasons] = useState([]);

  const teams = league?.teams ?? [];

  useEffect(() => {
    let mounted = true;
    (actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }))
      .then((res) => {
        if (!mounted) return;
        setArchiveSeasons(res?.payload?.seasons ?? res?.seasons ?? []);
      })
      .catch(() => {
        if (mounted) setArchiveSeasons([]);
      });
    return () => {
      mounted = false;
    };
  }, [actions]);

  const seasonOptions = useMemo(() => {
    const map = new Map();
    if (league?.seasonId != null) {
      map.set(String(league.seasonId), {
        id: String(league.seasonId),
        label: `Current (${league?.year ?? "-"})`,
      });
    }
    for (const season of archiveSeasons) {
      const id = season?.id != null ? String(season.id) : null;
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        label: `${season?.year ?? id}${season?.champion?.abbr ? ` - ${season.champion.abbr}` : ""}`,
      });
    }
    return [...map.values()];
  }, [archiveSeasons, league?.seasonId, league?.year]);

  const loadTransactions = useCallback(async () => {
    if (!actions?.getTransactions) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = { limit: 400 };
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
  }, [actions, seasonId]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const activityModel = useMemo(() => buildActivityLogViewModel({
    league,
    transactions: rows,
  }, {
    seasonId,
    teamId,
    type,
    search,
  }), [league, rows, search, seasonId, teamId, type]);

  const displayRows = useMemo(() => (
    stableSortRows(activityModel.rows, (tx) => sortValue(tx, sort.key), sort.dir, (tx) => String(tx?.id ?? ""))
  ), [activityModel.rows, sort.dir, sort.key]);

  const filtersActive = seasonId !== "all" || teamId !== "all" || type !== "all" || Boolean(search.trim()) || sort.key !== "date" || sort.dir !== "desc";

  const resetFilters = () => {
    setSeasonId("all");
    setTeamId("all");
    setType("all");
    setSearch("");
    setSort({ key: "date", dir: "desc" });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Season
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            aria-label="Season"
          >
            <option value="all">All seasons</option>
            {seasonOptions.map((season) => (
              <option key={season.id} value={season.id}>{season.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Team
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-label="Team"
          >
            <option value="all">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.abbr ?? team.name ?? `Team ${team.id}`}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Type
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Type"
          >
            {ACTIVITY_LOG_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)] md:col-span-2">
          Search
          <input
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player, team, type"
            aria-label="Search"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--text-muted)]">
          Sort
          <select
            className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 text-sm"
            value={sort.key}
            onChange={(e) => setSort((curr) => ({ ...curr, key: e.target.value }))}
            aria-label="Sort league activity"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn h-9 text-sm"
          onClick={() => setSort((curr) => ({ ...curr, dir: curr.dir === "asc" ? "desc" : "asc" }))}
        >
          {sort.dir === "asc" ? "Asc" : "Desc"}
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

      <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]" data-testid="league-activity-count">
        <span data-testid="league-activity-showing">{buildActivityShowingLabel(displayRows.length, activityModel.counts.total)}</span>
        <span>Sort: {SORT_OPTIONS.find((option) => option.value === sort.key)?.label ?? sort.key} {sort.dir === "asc" ? "up" : "down"}</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[color:var(--text-muted)]">Loading activity...</div>
      ) : !displayRows.length ? (
        <div className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-strong)]/30 px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
          {filtersActive ? "No activity matches these filters." : "Activity will appear as your league signs, drafts, trades, releases, and retires players."}
        </div>
      ) : (
        <ScrollArea className="h-[min(520px,65vh)] rounded-lg border border-[color:var(--hairline)]">
          <ul className="divide-y divide-[color:var(--hairline)]">
            {displayRows.map((tx, idx) => (
              <li key={`${tx.id ?? idx}-${idx}`} className="px-3 py-3 text-sm" data-testid="league-activity-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {tx.label ?? tx.typeLabel ?? tx.type ?? "Activity"}
                  </Badge>
                  <span className="text-[11px] text-[color:var(--text-muted)]">
                    {tx.dateLabel ?? (tx.week != null ? `Week ${tx.week}` : "")}
                    {tx.teamAbbr ? ` - ${tx.teamAbbr}` : ""}
                  </span>
                </div>
                <div className="mt-1 font-semibold text-[color:var(--text)]">{tx.headline ?? tx.summary ?? tx.label ?? "League activity"}</div>
                {tx.detail ? <div className="mt-0.5 text-xs text-[color:var(--text-muted)]">{tx.detail}</div> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {tx.playerId != null ? (
                    <button type="button" className="text-xs font-semibold text-[color:var(--accent)]" onClick={() => onPlayerSelect?.(tx.playerId)}>
                      {tx.playerName ?? "Player profile"}
                    </button>
                  ) : null}
                  {tx.teamId != null ? (
                    <button type="button" className="text-xs text-[color:var(--accent)]" onClick={() => onTeamSelect?.(tx.teamId)}>
                      {tx.teamAbbr ?? `Team ${tx.teamId}`}
                    </button>
                  ) : null}
                  <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
                    {tx.source}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
