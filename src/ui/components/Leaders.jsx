/**
 * Leaders.jsx
 *
 * ZenGM-style comprehensive leaderboard tab.
 * Displays Season Leaders or All-Time Records, grouped by statistical category.
 * Fetches data silently so it never blocks the Advance button.
 */
import React, { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function posColor(pos) {
  const map = {
    QB: "#0A84FF",
    RB: "#34C759",
    WR: "#FF9F0A",
    TE: "#5E5CE6",
    OL: "#64D2FF",
    OT: "#64D2FF",
    OG: "#64D2FF",
    C: "#64D2FF",
    DL: "#FF453A",
    DE: "#FF453A",
    DT: "#FF453A",
    EDGE: "#FF453A",
    LB: "#FFD60A",
    CB: "#30D158",
    S: "#30D158",
    SS: "#30D158",
    FS: "#30D158",
    K: "#AEC6CF",
    P: "#AEC6CF",
  };
  return map[pos?.toUpperCase()] ?? "var(--text-muted)";
}

const CATEGORY_LABELS = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  defense: "Defense",
};

const STAT_LABELS = {
  // Passing
  passYards: { label: "Pass Yards", abbr: "Yds" },
  passTDs: { label: "Passing TDs", abbr: "TD" },
  passerRating: { label: "Passer Rating", abbr: "RTG" },
  completions: { label: "Completions", abbr: "Cmp" },
  // Rushing
  rushYards: { label: "Rush Yards", abbr: "Yds" },
  rushTDs: { label: "Rush TDs", abbr: "TD" },
  rushAttempts: { label: "Carries", abbr: "Car" },
  // Receiving
  recYards: { label: "Rec. Yards", abbr: "Yds" },
  recTDs: { label: "Receiving TDs", abbr: "TD" },
  receptions: { label: "Receptions", abbr: "Rec" },
  yac: { label: "Yards After Catch", abbr: "YAC" },
  // Defense
  sacks: { label: "Sacks", abbr: "Sacks" },
  tackles: { label: "Tackles", abbr: "Tkl" },
  interceptions: { label: "Interceptions", abbr: "INT" },
  forcedFumbles: { label: "Forced Fmbl.", abbr: "FF" },
  pressures: { label: "Pressures", abbr: "Pres" },
};

// ── Single leaderboard table ──────────────────────────────────────────────────

function LeaderTable({ title, rows, onPlayerSelect, userTeamId }) {
  if (!rows || rows.length === 0) return null;
  return (
    <Card className="card-premium hover-lift">
      <CardHeader
        className="py-3 px-4 border-b border-[color:var(--hairline)]"
        style={{ background: "var(--surface-strong)" }}
      >
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div style={{ padding: "var(--space-1) 0" }}>
          {rows.map((row, i) => {
            const isUserTeam = userTeamId != null && row.teamId === userTeamId;
            const rankColor =
              i === 0
                ? "#FFD60A"
                : i === 1
                  ? "#C0C0C0"
                  : i === 2
                    ? "#CD7F32"
                    : "var(--text-subtle)";
            return (
              <div
                key={row.playerId ?? i}
                onClick={() => onPlayerSelect?.(row.playerId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-4)",
                  borderBottom:
                    i < rows.length - 1 ? "1px solid var(--hairline)" : "none",
                  cursor:
                    onPlayerSelect && row.playerId != null ? "pointer" : "default",
                  transition: "background 0.1s",
                  background: isUserTeam ? "rgba(10, 132, 255, 0.08)" : undefined,
                  borderLeft: isUserTeam ? "3px solid var(--accent)" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (onPlayerSelect)
                    e.currentTarget.style.background = isUserTeam
                      ? "rgba(10, 132, 255, 0.14)"
                      : "var(--surface-strong)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isUserTeam
                    ? "rgba(10, 132, 255, 0.08)"
                    : "";
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    width: 20,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "var(--text-sm)",
                    color: rankColor,
                  }}
                >
                  {i + 1}
                </span>

                {/* POS badge */}
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold px-1.5 py-0 min-w-[28px] justify-center"
                  style={{
                    background: posColor(row.pos),
                    color: "#fff",
                    borderColor: posColor(row.pos),
                  }}
                >
                  {row.pos ?? "?"}
                </Badge>

                {/* Name + user star */}
                <span
                  style={{
                    flex: 1,
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name ?? `Player ${row.playerId}`}
                  {isUserTeam && (
                    <span
                      style={{
                        marginLeft: 4,
                        fontSize: 10,
                        color: "var(--accent)",
                        fontWeight: 700,
                      }}
                    >
                      ★
                    </span>
                  )}
                </span>

                {/* Value */}
                <span
                  style={{
                    fontSize: "var(--text-base)",
                    fontWeight: 800,
                    color: "var(--text)",
                  }}
                >
                  {typeof row.value === "number"
                    ? row.value.toLocaleString()
                    : row.value}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ catKey, stats, onPlayerSelect, userTeamId }) {
  const entries = Object.entries(stats || {});
  if (entries.length === 0) return null;
  return (
    <section>
      <h3
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: "var(--text-lg)",
          fontWeight: 700,
          borderBottom: "2px solid var(--accent)",
          paddingBottom: "var(--space-2)",
          display: "inline-block",
        }}
      >
        {CATEGORY_LABELS[catKey] ?? catKey}
      </h3>
      <div
        className="leaderboards-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {entries.map(([statKey, rows]) => (
          <LeaderTable
            key={statKey}
            title={STAT_LABELS[statKey]?.label ?? statKey}
            rows={rows}
            onPlayerSelect={onPlayerSelect}
            userTeamId={userTeamId}
          />
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  }, [mode]);

  const categories = data?.categories ?? {};
  const categoryKeys = Object.keys(categories);

  const hasData = categoryKeys.some((k) =>
    Object.values(categories[k] ?? {}).some((rows) => rows?.length > 0),
  );

  return (
    <div>
      {/* ── Controls ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="season">Season Leaders</TabsTrigger>
            <TabsTrigger value="alltime">All-Time Records</TabsTrigger>
          </TabsList>
        </Tabs>

        {data?.year && (
          <span
            style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
          >
            {mode === "season" ? `${data.year} Season` : "All Seasons Combined"}
          </span>
        )}
      </div>

      {/* ── Category nav ── */}
      {!loading && hasData && (
        <div style={{ marginBottom: "var(--space-6)" }}>
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList>
              {categoryKeys.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {CATEGORY_LABELS[k] ?? k}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* ── Content ── */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-12)",
            color: "var(--text-muted)",
          }}
        >
          Loading leaders…
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: "var(--space-6)",
            textAlign: "center",
            color: "var(--danger)",
            background: "rgba(255,69,58,0.07)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !hasData && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-12)",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "var(--space-3)" }}>
            📊
          </div>
          <div>
            No stats available yet — play through a season to see leaders
            appear.
          </div>
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
