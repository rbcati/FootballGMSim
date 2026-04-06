/**
 * Leaders.jsx
 *
 * Enriched leaderboard tab with compact, mobile-first rows.
 */
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPercent, toFiniteNumber } from "../utils/numberFormatting.js";

function posColor(pos) {
  const map = {
    QB: "#0A84FF", RB: "#34C759", WR: "#FF9F0A", TE: "#5E5CE6",
    OL: "#64D2FF", OT: "#64D2FF", OG: "#64D2FF", C: "#64D2FF",
    DL: "#FF453A", DE: "#FF453A", DT: "#FF453A", EDGE: "#FF453A",
    LB: "#FFD60A", CB: "#30D158", S: "#30D158", SS: "#30D158", FS: "#30D158",
  };
  return map[pos?.toUpperCase()] ?? "var(--text-muted)";
}

const CATEGORY_LABELS = {
  passing: "Passing", rushing: "Rushing", receiving: "Receiving", defense: "Defense",
};

const STAT_LABELS = {
  passYards: { label: "Pass Yards", abbr: "Yds" },
  passTDs: { label: "Passing TDs", abbr: "TD" },
  passerRating: { label: "Passer Rating", abbr: "RTG" },
  completions: { label: "Completions", abbr: "Cmp" },
  rushYards: { label: "Rush Yards", abbr: "Yds" },
  rushTDs: { label: "Rush TDs", abbr: "TD" },
  rushAttempts: { label: "Carries", abbr: "Car" },
  recYards: { label: "Rec. Yards", abbr: "Yds" },
  recTDs: { label: "Receiving TDs", abbr: "TD" },
  receptions: { label: "Receptions", abbr: "Rec" },
  yac: { label: "Yards After Catch", abbr: "YAC" },
  sacks: { label: "Sacks", abbr: "Sack" },
  tackles: { label: "Tackles", abbr: "Tkl" },
  interceptions: { label: "Interceptions", abbr: "INT" },
  forcedFumbles: { label: "Forced Fmbl.", abbr: "FF" },
  pressures: { label: "Pressures", abbr: "Pres" },
};

const META_KEYS = [
  ["gp", "GP"], ["games", "GP"], ["gamesPlayed", "GP"], ["season", "Season"],
  ["attempts", "Att"], ["targets", "Tgt"], ["passAttempts", "Att"],
  ["passTDs", "TD"], ["recTDs", "TD"], ["rushTDs", "TD"],
  ["interceptions", "INT"], ["ints", "INT"],
];

function formatStatValue(value) {
  const n = toFiniteNumber(value, null);
  if (n == null) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function metadataChips(row, valueKey) {
  const chips = [];
  for (const [key, label] of META_KEYS) {
    if (key === valueKey) continue;
    const n = toFiniteNumber(row?.[key], null);
    if (n != null && n !== 0) chips.push({ label, value: Number.isInteger(n) ? n : n.toFixed(1) });
    if (chips.length >= 3) break;
  }

  if (chips.length === 0) {
    const pct = toFiniteNumber(row?.pct ?? row?.percentage, null);
    if (pct != null) chips.push({ label: "%", value: formatPercent(pct, "—", { digits: 1, clamp: false }) });
  }
  return chips;
}

function LeaderRow({ row, index, onPlayerSelect, userTeamId, valueKey }) {
  const rank = index + 1;
  const isUserTeam = userTeamId != null && row.teamId === userTeamId;
  const chips = metadataChips(row, valueKey);

  return (
    <button
      onClick={() => onPlayerSelect?.(row.playerId)}
      disabled={!onPlayerSelect || row.playerId == null}
      style={{
        width: "100%",
        border: "none",
        borderBottom: "1px solid var(--hairline)",
        background: isUserTeam ? "rgba(10,132,255,0.08)" : "transparent",
        padding: "10px 12px",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "42px 1fr auto",
        gap: 10,
        cursor: onPlayerSelect && row.playerId != null ? "pointer" : "default",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 12, color: rank <= 3 ? "#FFD60A" : "var(--text-subtle)" }}>{rankBadge(rank)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.name ?? `Player ${row.playerId ?? "—"}`}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{row.teamAbbr ?? "FA"}</span>
          <Badge variant="outline" style={{ background: posColor(row.pos), borderColor: posColor(row.pos), color: "#fff", fontSize: 10, padding: "0 6px" }}>
            {row.pos ?? "?"}
          </Badge>
          {isUserTeam && <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 800 }}>YOUR TEAM</span>}
        </div>
        {chips.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chips.map((chip) => (
              <span key={`${chip.label}-${chip.value}`} style={{ fontSize: 10, color: "var(--text-subtle)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 6px" }}>
                {chip.label} {chip.value}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", alignSelf: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>{formatStatValue(row.value)}</div>
      </div>
    </button>
  );
}

function LeaderTable({ title, rows, onPlayerSelect, userTeamId, statKey }) {
  if (!rows?.length) return null;
  const leader = rows[0];
  return (
    <Card className="card-premium">
      <CardHeader className="py-2 px-3 border-b border-[color:var(--hairline)]" style={{ background: "linear-gradient(90deg, rgba(10,132,255,0.16), rgba(10,132,255,0.03))" }}>
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-[color:var(--text-muted)]">{title}</CardTitle>
        {leader && (
          <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 4 }}>
            Leader: <strong style={{ color: "var(--text)" }}>{leader.name ?? "—"}</strong> · {formatStatValue(leader.value)}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rows.map((row, i) => (
          <LeaderRow key={row.playerId ?? `${title}-${i}`} row={row} index={i} onPlayerSelect={onPlayerSelect} userTeamId={userTeamId} valueKey={statKey} />
        ))}
      </CardContent>
    </Card>
  );
}

function CategorySection({ catKey, stats, onPlayerSelect, userTeamId }) {
  const entries = Object.entries(stats || {}).filter(([, rows]) => rows?.length);
  if (!entries.length) return null;

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 800, letterSpacing: ".02em" }}>{CATEGORY_LABELS[catKey] ?? catKey}</h3>
        <span style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>{entries.length} boards</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {entries.map(([statKey, rows]) => (
          <LeaderTable
            key={statKey}
            title={STAT_LABELS[statKey]?.label ?? statKey}
            rows={rows}
            onPlayerSelect={onPlayerSelect}
            userTeamId={userTeamId}
            statKey={statKey}
          />
        ))}
      </div>
    </section>
  );
}

export default function Leaders({ onPlayerSelect, userTeamId, actions }) {
  const [mode, setMode] = useState("season");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("passing");

  useEffect(() => {
    setLoading(true);
    setError(null);
    actions
      .getLeagueLeaders(mode)
      .then((resp) => {
        setData(resp.payload ?? resp);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Leaders fetch failed:", err);
        setError(err.message ?? "Failed to load leaders");
        setLoading(false);
      });
  }, [mode, actions]);

  const categories = data?.categories ?? {};
  const categoryKeys = Object.keys(categories);
  const hasData = categoryKeys.some((k) => Object.values(categories[k] ?? {}).some((rows) => rows?.length > 0));

  useEffect(() => {
    if (categoryKeys.length && !categoryKeys.includes(activeCategory)) {
      setActiveCategory(categoryKeys[0]);
    }
  }, [activeCategory, categoryKeys]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="season">Season Leaders</TabsTrigger>
            <TabsTrigger value="alltime">All-Time Records</TabsTrigger>
          </TabsList>
        </Tabs>
        {data?.year && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{mode === "season" ? `${data.year} Season` : "All Seasons Combined"}</span>}
      </div>

      {!loading && hasData && (
        <div style={{ overflowX: "auto", paddingBottom: 2 }}>
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList>
              {categoryKeys.map((k) => (
                <TabsTrigger key={k} value={k}>{CATEGORY_LABELS[k] ?? k}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--text-muted)" }}>Loading leaders…</div>}
      {!loading && error && <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--danger)", background: "rgba(255,69,58,0.07)", borderRadius: "var(--radius-md)", border: "1px solid var(--danger)" }}>{error}</div>}
      {!loading && !error && !hasData && (
        <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "var(--space-3)" }}>📊</div>
          <div>No stats available yet — play through a season to see leaders appear.</div>
        </div>
      )}

      {!loading && !error && hasData && (
        <CategorySection
          catKey={activeCategory}
          stats={categories[activeCategory]}
          onPlayerSelect={onPlayerSelect}
          userTeamId={userTeamId}
        />
      )}
    </div>
  );
}
