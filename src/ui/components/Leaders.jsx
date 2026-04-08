import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPercent, toFiniteNumber } from "../utils/numberFormatting.js";
import { buildStorylineCards } from "../utils/leagueNarratives.js";
import { coerceLeaderboardSelection } from "../utils/leaderboardFilters.js";

const CATEGORY_LABELS = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  defense: "Defense",
};

const STAT_LABELS = {
  passYards: { label: "Pass Yards", abbr: "Yds" },
  passTDs: { label: "Pass TD", abbr: "TD" },
  passerRating: { label: "Pass Rating", abbr: "RTG" },
  completions: { label: "Completions", abbr: "Cmp" },
  rushYards: { label: "Rush Yards", abbr: "Yds" },
  rushTDs: { label: "Rush TD", abbr: "TD" },
  rushAttempts: { label: "Rush Attempts", abbr: "Att" },
  recYards: { label: "Rec Yards", abbr: "Yds" },
  recTDs: { label: "Rec TD", abbr: "TD" },
  receptions: { label: "Receptions", abbr: "Rec" },
  yac: { label: "YAC", abbr: "YAC" },
  sacks: { label: "Sacks", abbr: "Sack" },
  tackles: { label: "Tackles", abbr: "Tkl" },
  interceptions: { label: "Interceptions", abbr: "INT" },
  forcedFumbles: { label: "Forced Fumbles", abbr: "FF" },
  pressures: { label: "Pressures", abbr: "Prs" },
};

function valueDisplay(value) {
  const n = toFiniteNumber(value, null);
  if (n == null) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function LeaderboardTable({ rows, statLabel, onPlayerSelect, userTeamId }) {
  return (
    <div className="leaders-table-wrap">
      <table className="leaders-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Team</th>
            <th>{statLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rank = idx + 1;
            const isUser = row.teamId != null && Number(row.teamId) === Number(userTeamId);
            return (
              <tr key={`${row.playerId}-${rank}`} className={isUser ? "leaders-table__row-user" : ""}>
                <td className="leaders-rank">{rank}</td>
                <td>
                  {onPlayerSelect && row.playerId != null ? (
                    <button className="btn-link" onClick={() => onPlayerSelect(row.playerId)}>{row.name ?? `Player ${row.playerId}`}</button>
                  ) : (row.name ?? `Player ${row.playerId}`)}
                </td>
                <td>{row.pos ?? "—"}</td>
                <td>
                  <span className="leaders-team-cell">{row.teamAbbr ?? "FA"}{isUser ? <Badge variant="outline">You</Badge> : null}</span>
                </td>
                <td className="leaders-value">{valueDisplay(row.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Leaders({ onPlayerSelect, userTeamId, actions, onNavigate, league }) {
  const [scope, setScope] = useState("season");
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState({ category: "passing", statKey: "passYards" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const storyline = buildStorylineCards(league)[0] ?? null;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const mode = scope === "alltime" ? "alltime" : "season";
    actions.getLeagueLeaders(mode)
      .then((resp) => setData(resp.payload ?? resp))
      .catch((err) => setError(err?.message ?? "Failed to load leaders"))
      .finally(() => setLoading(false));
  }, [scope, actions]);

  const categories = data?.categories ?? {};
  const normalized = useMemo(() => coerceLeaderboardSelection({ categories, selection }), [categories, selection]);
  const rows = categories?.[normalized.category]?.[normalized.statKey] ?? [];

  useEffect(() => {
    setSelection((prev) => ({ category: normalized.category, statKey: normalized.statKey }));
  }, [normalized.category, normalized.statKey]);

  return (
    <div className="leaders-v2">
      {storyline ? (
        <Card className="card-premium">
          <CardContent className="leaders-story-card">
            <div>
              <strong>{storyline.title}</strong>
              <div>{storyline.detail}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.(storyline.tab ?? "Standings")}>Open {storyline.tab ?? "Standings"}</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="leaders-filter-bar card">
        <div className="leaders-filter-group">
          {[{ key: "season", label: "Season" }, { key: "alltime", label: "All-Time" }, { key: "year", label: `${data?.year ?? league?.year ?? "Year"}` }].map((item) => (
            <button
              key={item.key}
              className={`standings-tab${scope === item.key ? " active" : ""}`}
              onClick={() => setScope(item.key)}
              title={item.key === "year" ? "Current season year scope" : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="leaders-filter-group">
          {normalized.categoryKeys.map((cat) => (
            <button key={cat} className={`standings-tab${selection.category === cat ? " active" : ""}`} onClick={() => setSelection((prev) => ({ ...prev, category: cat }))}>
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        <div className="leaders-filter-group leaders-filter-group-scroll">
          {normalized.statKeys.map((statKey) => (
            <button key={statKey} className={`standings-tab${selection.statKey === statKey ? " active" : ""}`} onClick={() => setSelection((prev) => ({ ...prev, statKey }))}>
              {STAT_LABELS[statKey]?.label ?? statKey}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="leaders-empty">Loading leaders…</div> : null}
      {!loading && error ? <div className="leaders-empty" style={{ color: "var(--danger)" }}>{error}</div> : null}
      {!loading && !error && !rows.length ? <div className="leaders-empty">No stats available yet.</div> : null}

      {!loading && !error && rows.length > 0 ? (
        <Card className="card-premium">
          <CardContent className="leaders-board-shell">
            <div className="leaders-board-header">
              <div>
                <strong>{CATEGORY_LABELS[normalized.category] ?? normalized.category}</strong>
                <div>{STAT_LABELS[normalized.statKey]?.label ?? normalized.statKey} board · {scope === "alltime" ? "All-Time" : `${data?.year ?? league?.year ?? "Season"} Season`}</div>
              </div>
              {rows[0] ? <Badge variant="secondary">Leader {rows[0].name ?? "—"} · {valueDisplay(rows[0].value)}</Badge> : null}
            </div>
            <LeaderboardTable
              rows={rows}
              statLabel={STAT_LABELS[normalized.statKey]?.abbr ?? "Value"}
              onPlayerSelect={onPlayerSelect}
              userTeamId={userTeamId}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="leaders-footnote">
        <span>Completion % is shown when available: {formatPercent(rows?.[0]?.pct ?? rows?.[0]?.percentage, "—", { digits: 1, clamp: false })}.</span>
        <Button size="sm" variant="ghost" onClick={() => onNavigate?.("History")}>Open archive</Button>
      </div>
    </div>
  );
}
