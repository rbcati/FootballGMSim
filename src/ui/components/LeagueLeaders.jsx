import React, { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./EmptyState.jsx";
import { getSafeLeagueLeaderCategories } from "../../state/selectors.js";
import { buildLeagueStatsHubModel } from "../utils/leagueStatsHub.js";
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from "../utils/dataBrowser.js";
import { buildAdvancedStatsLeadersView, ADVANCED_LEADER_DEFS } from "../utils/advancedStatsLeadersViewModel.js";

const TABS = ["Passing", "Rushing", "Receiving", "Tackles", "Sacks", "Interceptions", "Kicking", "Advanced"];

const CATEGORY_CONFIG = {
  Passing: {
    primaryLabel: "Pass Yds",
    secondaryLabel: "TD / Cmp%",
    getPrimary: (player) => stat(player, ["passingYards", "passYards", "passYd", "passYds"]),
    getSecondary: (player) => {
      const td = stat(player, ["passTD", "passTDs", "passTd", "touchdowns"]);
      const comp = stat(player, ["completions", "passComp", "cmp"]);
      const att = stat(player, ["attempts", "passAtt", "att"]);
      const pct = comp == null || att == null ? undefined : att > 0 ? (comp / att) * 100 : 0;
      return `${displayNumber(td)} / ${displayNumber(pct, 1, "%")}`;
    },
  },
  Rushing: {
    primaryLabel: "Rush Yds",
    secondaryLabel: "TD / YPC",
    getPrimary: (player) => stat(player, ["rushingYards", "rushYd", "rushYds"]),
    getSecondary: (player) => {
      const td = stat(player, ["rushingTDs", "rushTD", "rushTDs", "rushTd"]);
      const yds = stat(player, ["rushingYards", "rushYd", "rushYds"]);
      const att = stat(player, ["rushingAttempts", "rushAtt"]);
      const ypc = yds == null || att == null ? undefined : att > 0 ? yds / att : 0;
      return `${displayNumber(td)} / ${displayNumber(ypc, 1)}`;
    },
  },
  Receiving: {
    primaryLabel: "Rec Yds",
    secondaryLabel: "Rec / TD",
    getPrimary: (player) => stat(player, ["receivingYards", "recYd", "recYds"]),
    getSecondary: (player) => {
      const rec = stat(player, ["receptions", "rec"]);
      const td = stat(player, ["receivingTDs", "recTD", "recTDs", "recTd"]);
      return `${displayNumber(rec)} / ${displayNumber(td)}`;
    },
  },
  Tackles: {
    primaryLabel: "Total Tkl",
    secondaryLabel: "Solo / Ast",
    getPrimary: (player) => {
      const solo = stat(player, ["soloTackles"]);
      const assist = stat(player, ["assistTackles"]);
      const tackles = stat(player, ["totalTackles", "tackles", "tkl"]);
      const hasSplits = solo != null && assist != null;
      if (tackles != null) return hasSplits ? Math.max(tackles, solo + assist) : tackles;
      return hasSplits ? solo + assist : undefined;
    },
    getSecondary: (player) => `${displayNumber(stat(player, ["soloTackles"]))} / ${displayNumber(stat(player, ["assistTackles"]))}`,
  },
  Sacks: {
    primaryLabel: "Sacks",
    secondaryLabel: "TFL / FF",
    getPrimary: (player) => stat(player, ["sacks", "sack"]),
    getSecondary: (player) => `${displayNumber(stat(player, ["tacklesForLoss", "tfl"]))} / ${displayNumber(stat(player, ["forcedFumbles", "ffum", "ff"]))}`,
  },
  Interceptions: {
    primaryLabel: "INT",
    secondaryLabel: "PD / Tkl",
    getPrimary: (player) => stat(player, ["interceptions", "defInterceptions", "ints", "defInt"]),
    getSecondary: (player) => `${displayNumber(stat(player, ["passesDefended", "pd"]))} / ${displayNumber(stat(player, ["tackles", "totalTackles", "tkl"]))}`,
  },
  Kicking: {
    primaryLabel: "FGM",
    secondaryLabel: "FG% / Pts",
    getPrimary: (player) => stat(player, ["fgm", "fgMade", "fieldGoalsMade"]),
    getSecondary: (player) => {
      const made = stat(player, ["fgm", "fgMade", "fieldGoalsMade"]);
      const att = stat(player, ["fga", "fgAtt", "fieldGoalsAttempted"]);
      const pts = stat(player, ["kickingPoints", "points", "pts"]);
      const pct = made == null || att == null ? undefined : att > 0 ? (made / att) * 100 : 0;
      return `${displayNumber(pct, 1, "%")} / ${displayNumber(pts)}`;
    },
  },
};

function stat(player, keys) {
  const hasCanonicalStats = player?.canonicalStats && typeof player.canonicalStats === "object";
  const sources = hasCanonicalStats
    ? [player?.totals, player.canonicalStats]
    : [player?.totals, player?.stats, player?.seasonStats, player];
  for (const source of sources) {
    for (const key of keys) {
      if (source === player && player?.statAvailability?.[key] === false) continue;
      if (source?.[key] != null && Number.isFinite(Number(source[key]))) return Number(source[key]);
    }
  }
  return undefined;
}

function displayNumber(value, decimals = 0, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const safe = Number(value);
  return `${safe.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

function normalizeLeaderRows(rawRows = []) {
  return (Array.isArray(rawRows) ? rawRows : []).map((row) => ({
    id: row?.playerId ?? row?.id ?? row?.pid ?? row?.player?.id ?? null,
    name: row?.name ?? row?.playerName ?? row?.player?.name ?? "—",
    teamAbbr: row?.teamAbbr ?? row?.abbr ?? row?.team ?? "—",
    teamId: row?.teamId ?? row?.tid ?? row?.team?.id ?? null,
    value: Number(row?.value ?? row?.stat ?? row?.amount ?? 0) || 0,
    raw: row,
  }));
}

function resolveTeamIdentity(row, teams) {
  const rawTeam = row?.teamAbbr ?? row?.abbr ?? row?.team ?? row?.player?.team;
  const rawTeamId = row?.teamId ?? row?.tid ?? row?.team?.id ?? row?.player?.teamId;
  const matchedTeam = teams.find((team) => String(team?.id) === String(rawTeamId));
  const label = typeof rawTeam === "string" ? rawTeam.trim() : rawTeam?.abbr ?? rawTeam?.name;
  return {
    teamId: rawTeamId ?? matchedTeam?.id ?? null,
    teamLabel: label && label !== "—" ? label : matchedTeam?.abbr ?? matchedTeam?.name ?? null,
  };
}

const API_TAB_MAP = Object.freeze({
  Passing: { category: "passing", primaryKey: "passYards" },
  Rushing: { category: "rushing", primaryKey: "rushYards" },
  Receiving: { category: "receiving", primaryKey: "recYards" },
  Tackles: { category: "defense", primaryKey: "tackles" },
  Sacks: { category: "defense", primaryKey: "sacks" },
  Interceptions: { category: "defense", primaryKey: "interceptions" },
  // Kicking leaders currently come from local aggregation only.
});

function AdvancedLeadersPanel({ league, onPlayerSelect }) {
  const [selectedMetric, setSelectedMetric] = useState(ADVANCED_LEADER_DEFS[0].statKey);

  // Memoize archive so its identity is stable across renders (the `{}` fallback
  // otherwise created a new object every render, defeating the view memo below
  // and forcing buildAdvancedStatsLeadersView to recompute on every render).
  const archive = useMemo(
    () => league?.playerSeasonStatsArchive ?? league?.meta?.playerSeasonStatsArchive ?? {},
    [league?.playerSeasonStatsArchive, league?.meta?.playerSeasonStatsArchive],
  );
  const teams = useMemo(() => (Array.isArray(league?.teams) ? league.teams : []), [league?.teams]);
  const allPlayers = useMemo(
    () => teams.flatMap((t) => (Array.isArray(t?.roster) ? t.roster : []).map((p) => ({ ...p, teamId: p.teamId ?? t.id, teamAbbr: p.teamAbbr ?? t.abbr }))),
    [teams],
  );

  const view = useMemo(
    () => buildAdvancedStatsLeadersView({ archive, players: allPlayers, teams }),
    [archive, allPlayers, teams],
  );

  const currentDef = ADVANCED_LEADER_DEFS.find((d) => d.statKey === selectedMetric) ?? ADVANCED_LEADER_DEFS[0];
  const rows = view.leaderboards[selectedMetric] ?? [];

  if (!view.hasData) {
    return (
      <EmptyState
        icon="📡"
        title="No advanced leaders yet"
        subtitle="Advanced leaderboards populate after rich games are simulated."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div
        role="group"
        aria-label="Select advanced metric"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {ADVANCED_LEADER_DEFS.map(({ statKey, statLabel }) => (
          <button
            key={statKey}
            type="button"
            role="radio"
            aria-checked={selectedMetric === statKey}
            className={`standings-tab${selectedMetric === statKey ? " active" : ""}`}
            onClick={() => setSelectedMetric(statKey)}
            style={{ fontSize: 11, padding: "5px 10px" }}
          >
            {statLabel}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", padding: "var(--space-4) 0" }}>
          No players have recorded {currentDef.statLabel} yet.
        </div>
      ) : (
        <div
          className="table-wrapper"
          style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}
        >
          <table
            className="standings-table"
            aria-label={`${currentDef.statLabel} leaders`}
            style={{ width: "100%", minWidth: 420 }}
          >
            <thead>
              <tr>
                <th style={{ width: 48 }}>Rank</th>
                <th>Player</th>
                <th>Pos</th>
                <th>Team</th>
                <th style={{ textAlign: "right" }}>{currentDef.statLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={`${entry.playerId}-${entry.statKey}-${entry.rank}`} className="card-enter">
                  <td>{entry.rank}</td>
                  <td>
                    <button
                      className="btn btn-link"
                      style={{ padding: 0, minHeight: 0 }}
                      onClick={() =>
                        onPlayerSelect?.({
                          id: entry.playerId,
                          name: entry.playerName,
                          pos: entry.pos,
                          teamName: entry.teamAbbr,
                        })
                      }
                    >
                      {entry.playerName}
                    </button>
                  </td>
                  <td>{entry.pos}</td>
                  <td>{entry.teamAbbr}</td>
                  <td style={{ textAlign: "right" }}>{entry.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LeagueLeaders({ league, actions, onPlayerSelect, onNavigate }) {
  const [activeTab, setActiveTab] = useState("Passing");
  const [leaderPayload, setLeaderPayload] = useState({ categories: null, source: null, phase: null });
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "primary", dir: "desc" });
  const firstTabRef = useRef(null);
  const teams = useMemo(() => (Array.isArray(league?.teams) ? league.teams : []), [league?.teams]);

  useEffect(() => {
    firstTabRef.current?.focus?.();
  }, []);

  useEffect(() => {
    let alive = true;
    actions?.getLeagueLeaders?.("season")
      .then((resp) => {
        if (!alive) return;
        setLeaderPayload({
          categories: resp?.payload?.categories ?? null,
          source: resp?.payload?.source ?? null,
          phase: resp?.payload?.phase ?? null,
        });
      })
      .catch(() => {
        if (!alive) return;
        setLeaderPayload({ categories: null, source: null, phase: null });
      });
    return () => { alive = false; };
  }, [actions, league?.activeLeagueId, league?.id, league?.franchiseGenerationId, league?.seasonId, league?.phase, league?.week]);

  const model = useMemo(() => buildLeagueStatsHubModel(league ?? {}), [league]);

  const remoteCategories = leaderPayload?.categories;
  const rows = useMemo(() => {
    const apiConfig = API_TAB_MAP[activeTab];
    if (remoteCategories && apiConfig) {
      const safeCategories = getSafeLeagueLeaderCategories(remoteCategories);
      const bucket = safeCategories?.[apiConfig.category] ?? {};
      const primaryRows = normalizeLeaderRows(bucket?.[apiConfig.primaryKey]).slice(0, 10);
      if (primaryRows.length > 0) {
        const config = CATEGORY_CONFIG[activeTab] ?? CATEGORY_CONFIG.Passing;
        return primaryRows.map((row) => {
          const identity = resolveTeamIdentity(row.raw, teams);
          return ({
            player: {
              ...row.raw,
              id: row.id,
              name: row.name,
              teamName: identity.teamLabel,
              teamId: identity.teamId,
              pos: row.raw?.pos ?? row.raw?.position ?? row.raw?.player?.pos ?? row.raw?.player?.position ?? "",
              isUserTeam: Number(identity.teamId) === Number(league?.userTeamId),
            },
            primary: row.value,
            secondary: config.getSecondary(row.raw),
          });
        });
      }
    }

    const config = CATEGORY_CONFIG[activeTab] ?? CATEGORY_CONFIG.Passing;
    const bucketKey =
      activeTab === "Passing"
        ? "passing"
        : activeTab === "Rushing"
        ? "rushing"
        : activeTab === "Receiving"
        ? "receiving"
        : activeTab === "Tackles" || activeTab === "Sacks" || activeTab === "Interceptions"
        ? "defense"
        : "kicking";

    const sourceRows = model.playerTables?.[bucketKey] ?? [];
    return sourceRows
      .map((row) => {
        const primary = config.getPrimary(row);
        return {
          player: {
            ...row,
            id: row.playerId,
            name: row.name,
            teamName: row.team,
            teamId: row.teamId,
            pos: row.pos ?? row.position ?? "",
            isUserTeam: Number(row.teamId) === Number(league?.userTeamId),
          },
          primary,
          secondary: config.getSecondary(row),
        };
      })
      .filter((entry) => Number.isFinite(entry.primary))
      .sort((a, b) => (b.primary ?? 0) - (a.primary ?? 0))
      .slice(0, 10);
  }, [activeTab, league?.userTeamId, model.playerTables, remoteCategories, teams]);


  const positionOptions = useMemo(() => uniqueFilterOptions(rows, (entry) => entry.player?.pos), [rows]);
  const teamOptions = useMemo(() => uniqueFilterOptions(rows, (entry) => entry.player?.teamName), [rows]);
  const visibleRows = useMemo(() => {
    const filtered = rows.filter((entry) => {
      if (positionFilter !== "ALL" && entry.player?.pos !== positionFilter) return false;
      if (teamFilter !== "ALL" && entry.player?.teamName !== teamFilter) return false;
      return rowMatchesSearch(entry.player, search, ["name", "teamName", "pos"]);
    });
    const getValue = (entry) => {
      if (sort.key === "name") return entry.player?.name;
      if (sort.key === "team") return entry.player?.teamName;
      if (sort.key === "secondary") return entry.secondary;
      return entry.primary;
    };
    return stableSortRows(filtered, getValue, sort.dir, (entry) => entry.player?.name);
  }, [rows, positionFilter, teamFilter, search, sort]);
  const resetFilters = () => { setSearch(""); setPositionFilter("ALL"); setTeamFilter("ALL"); };
  const hasActiveFilters = Boolean(search.trim()) || positionFilter !== "ALL" || teamFilter !== "ALL";
  const handleSort = (key) => setSort((current) => current.key === key
    ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "name" || key === "team" ? "asc" : "desc" });

  const config = CATEGORY_CONFIG[activeTab] ?? CATEGORY_CONFIG.Passing;
  const sourceLabel = leaderPayload?.source === "last_completed_regular_season"
    ? "Showing last completed regular-season leaders."
    : "Showing current regular-season leaders.";
  const emptyState = hasActiveFilters
    ? {
      title: "No matching league leaders",
      subtitle: "No players match the active leader filters.",
      action: "Reset filters",
      onAction: resetFilters,
    }
    : {
      title: "No league leaders yet",
      subtitle: "No players have logged enough stats this season.",
      action: "Open league",
      onAction: () => onNavigate?.("League"),
    };

  return (
    <div className="league-leaders-surface pfgm-density-surface" style={{ display: "grid", gap: "var(--space-3)" }}>
      <div className="standings-tabs profile-tab-row" role="tablist" aria-label="League leader categories" style={{ flexWrap: "nowrap", gap: 6, alignItems: "center" }}>
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={index === 0 ? firstTabRef : null}
            role="tab"
            aria-selected={activeTab === tab}
            className={`standings-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => { setActiveTab(tab); resetFilters(); setSort({ key: "primary", dir: "desc" }); }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Advanced" ? (
        <AdvancedLeadersPanel league={league} onPlayerSelect={onPlayerSelect} />
      ) : (
        <>
          <div style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{sourceLabel}</div>
          <div className="league-leaders-filters">
            <input aria-label="Search league leaders" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player/team" style={{ minHeight: 32, flex: "1 1 180px" }} />
            <select aria-label="Filter leaders by position" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} style={{ minHeight: 32 }}>
              <option value="ALL">All positions</option>
              {positionOptions.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
            </select>
            <select aria-label="Filter leaders by team" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ minHeight: 32 }}>
              <option value="ALL">All teams</option>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
            <select className="app-mobile-data-sort" aria-label="Sort league leaders" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }); }}>
              <option value="primary:desc">{config.primaryLabel}: high to low</option>
              <option value="primary:asc">{config.primaryLabel}: low to high</option>
              <option value="name:asc">Player: A to Z</option>
              <option value="name:desc">Player: Z to A</option>
              <option value="team:asc">Team: A to Z</option>
              <option value="team:desc">Team: Z to A</option>
            </select>
            {hasActiveFilters ? <button type="button" onClick={resetFilters} style={{ minHeight: 32 }}>Reset filters</button> : null}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{buildShowingLabel(visibleRows.length, rows.length, "leader")}</div>
          <div className="app-mobile-data-list" aria-label={`${activeTab} leaders mobile view`}>
            {visibleRows.map((entry, index) => (
              <div className="app-mobile-data-row" key={`mobile-${entry.player?.id ?? entry.player?.name ?? "player"}-${index}`}>
                <span className="app-mobile-data-row__rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                <div className="app-mobile-data-row__identity">
                  <button
                    className="app-entity-link league-leaders-player-link"
                    aria-label={`Open player profile for ${entry.player?.name ?? "player"}`}
                    onClick={() => onPlayerSelect?.(entry.player)}
                  >
                    {entry.player?.name ?? "—"}
                  </button>
                  <span>{entry.player?.teamName ?? "—"}</span>
                </div>
                <div className="app-mobile-data-row__metrics">
                  <strong>{displayNumber(entry.primary)} {config.primaryLabel}</strong>
                  <span>{entry.secondary ?? "—"} {config.secondaryLabel}</span>
                </div>
              </div>
            ))}
            {visibleRows.length === 0 ? (
              <div className="app-mobile-data-row__empty">
                <strong>{emptyState.title}</strong>
                <span>{emptyState.subtitle}</span>
                <button type="button" className="btn btn-sm" onClick={emptyState.onAction}>{emptyState.action}</button>
              </div>
            ) : null}
          </div>
          <div className="table-wrapper league-leaders-table-wrap app-desktop-data-table" style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
            <table className="standings-table league-leaders-table" style={{ width: "100%", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Rank</th>
                  <th><button type="button" onClick={() => handleSort("name")}>Player{sort.key === "name" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                  <th><button type="button" onClick={() => handleSort("team")}>Team{sort.key === "team" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                  <th style={{ textAlign: "right" }}><button type="button" onClick={() => handleSort("primary")}>{config.primaryLabel}{sort.key === "primary" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                  <th style={{ textAlign: "right" }}>{config.secondaryLabel}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((entry, index) => (
                  <tr
                    key={`${entry.player?.id ?? entry.player?.name ?? "player"}-${index}`}
                    className="card-enter"
                    style={entry.player?.isUserTeam ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)" } : undefined}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <button
                        className="app-entity-link league-leaders-player-link"
                        aria-label={`Open player profile for ${entry.player?.name ?? "player"}`}
                        onClick={() => onPlayerSelect?.(entry.player)}
                      >
                        {entry.player?.name ?? "—"}
                      </button>
                    </td>
                    <td>{entry.player?.teamName ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>{displayNumber(entry.primary)}</td>
                    <td style={{ textAlign: "right" }}>{entry.secondary ?? "—"}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <EmptyState
                        icon="📊"
                        title={emptyState.title}
                        subtitle={emptyState.subtitle}
                        action={emptyState.action}
                        onAction={emptyState.onAction}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
