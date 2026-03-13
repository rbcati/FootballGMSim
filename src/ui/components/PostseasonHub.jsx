/**
 * PostseasonHub.jsx
 *
 * Dedicated "Postseason" tab that shows the playoff bracket updating in real-time
 * as games finish. Active from wildcard round through Super Bowl.
 */

import React, { useMemo } from "react";

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF",
    "#34C759",
    "#FF9F0A",
    "#FF453A",
    "#5E5CE6",
    "#64D2FF",
    "#FFD60A",
    "#30D158",
    "#FF6961",
    "#AEC6CF",
    "#FF6B35",
    "#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

const ROUND_LABELS = {
  19: "Wild Card",
  20: "Divisional",
  21: "Conference Championship",
  22: "Super Bowl",
};

function MatchupCard({ game, teams, userTeamId, seedByTeam }) {
  if (!game) return null;
  const home = teams[game.home] ?? { abbr: "???", name: "TBD" };
  const away = teams[game.away] ?? { abbr: "???", name: "TBD" };
  const isUserGame = game.home === userTeamId || game.away === userTeamId;
  const homeSeed = seedByTeam[game.home];
  const awaySeed = seedByTeam[game.away];

  const homeWon = game.played && game.homeScore > game.awayScore;
  const awayWon = game.played && game.awayScore > game.homeScore;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `2px solid ${isUserGame ? "var(--accent)" : "var(--hairline)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        minWidth: 220,
        boxShadow: isUserGame
          ? "0 0 12px rgba(10,132,255,0.2)"
          : "var(--shadow-sm)",
      }}
    >
      {/* Away team row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-1) 0",
          opacity: game.played && !awayWon ? 0.5 : 1,
        }}
      >
        {awaySeed && (
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: teamColor(away.abbr),
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {awaySeed}
          </span>
        )}
        <span
          style={{
            flex: 1,
            fontWeight: awayWon ? 800 : 600,
            fontSize: "var(--text-sm)",
            color: "var(--text)",
          }}
        >
          {away.abbr}
        </span>
        {game.played && (
          <span
            style={{
              fontWeight: awayWon ? 800 : 400,
              fontSize: "var(--text-sm)",
              color: awayWon ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {game.awayScore}
          </span>
        )}
      </div>

      <div
        style={{ height: 1, background: "var(--hairline)", margin: "2px 0" }}
      />

      {/* Home team row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-1) 0",
          opacity: game.played && !homeWon ? 0.5 : 1,
        }}
      >
        {homeSeed && (
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: teamColor(home.abbr),
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {homeSeed}
          </span>
        )}
        <span
          style={{
            flex: 1,
            fontWeight: homeWon ? 800 : 600,
            fontSize: "var(--text-sm)",
            color: "var(--text)",
          }}
        >
          {home.abbr}
        </span>
        {game.played && (
          <span
            style={{
              fontWeight: homeWon ? 800 : 400,
              fontSize: "var(--text-sm)",
              color: homeWon ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {game.homeScore}
          </span>
        )}
      </div>

      {/* Status badge */}
      <div style={{ textAlign: "center", marginTop: "var(--space-1)" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: "var(--radius-pill)",
            background: game.played ? "var(--success)22" : "var(--accent)22",
            color: game.played ? "var(--success)" : "var(--accent)",
          }}
        >
          {game.played ? "FINAL" : "UPCOMING"}
        </span>
      </div>
    </div>
  );
}

export default function PostseasonHub({ league }) {
  const { schedule, teams, playoffSeeds, userTeamId, week, championTeamId } =
    league;

  const teamMap = useMemo(() => {
    const m = {};
    (teams ?? []).forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }, [teams]);

  const seedByTeam = useMemo(() => {
    if (!playoffSeeds) return {};
    const map = {};
    for (const confSeeds of Object.values(playoffSeeds)) {
      for (const s of confSeeds) {
        map[s.teamId] = s.seed;
      }
    }
    return map;
  }, [playoffSeeds]);

  // Check if user's team is in the playoffs
  const userInPlayoffs = useMemo(() => {
    if (!playoffSeeds) return false;
    for (const confSeeds of Object.values(playoffSeeds)) {
      if (confSeeds.some((s) => s.teamId === userTeamId)) return true;
    }
    return false;
  }, [playoffSeeds, userTeamId]);

  // Gather playoff weeks (19-22)
  const playoffWeeks = useMemo(() => {
    if (!schedule?.weeks) return [];
    return schedule.weeks
      .filter((w) => w.week >= 19 && w.week <= 22)
      .sort((a, b) => a.week - b.week);
  }, [schedule]);

  if (!playoffSeeds) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--space-8)",
          color: "var(--text-muted)",
        }}
      >
        The postseason hasn't started yet. Advance through the regular season to
        see the bracket.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "var(--space-6)",
          padding: "var(--space-4)",
          background:
            "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(192,192,192,0.08))",
          border: "1px solid rgba(255,215,0,0.2)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 900,
            letterSpacing: "-0.5px",
            color: "var(--text)",
            marginBottom: "var(--space-1)",
          }}
        >
          NFL PLAYOFFS
        </div>
        {userInPlayoffs && (
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--accent)",
              fontWeight: 700,
            }}
          >
            Your team is in the hunt!
          </div>
        )}
        {championTeamId != null && (
          <div
            style={{
              marginTop: "var(--space-2)",
              fontSize: "var(--text-lg)",
              fontWeight: 800,
              color: teamColor(teamMap[championTeamId]?.abbr ?? ""),
            }}
          >
            Champion: {teamMap[championTeamId]?.name ?? "TBD"}
          </div>
        )}
      </div>

      {/* Bracket rounds */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {playoffWeeks.map((weekData) => {
          const roundLabel =
            ROUND_LABELS[weekData.week] || `Week ${weekData.week}`;
          const isCurrent = weekData.week === week;
          const allPlayed = weekData.games?.every((g) => g.played);

          return (
            <div key={weekData.week}>
              {/* Round header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  marginBottom: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "var(--text-base)",
                    color: isCurrent ? "var(--accent)" : "var(--text)",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {roundLabel}
                </div>
                {isCurrent && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--accent)22",
                      color: "var(--accent)",
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    CURRENT
                  </span>
                )}
                {allPlayed && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--success)22",
                      color: "var(--success)",
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    COMPLETE
                  </span>
                )}
              </div>

              {/* Games grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {(weekData.games ?? []).map((game, idx) => (
                  <MatchupCard
                    key={idx}
                    game={game}
                    teams={teamMap}
                    userTeamId={userTeamId}
                    seedByTeam={seedByTeam}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {playoffWeeks.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-6)",
            color: "var(--text-muted)",
          }}
        >
          Playoff schedule not generated yet. Advance the week to see matchups.
        </div>
      )}
    </div>
  );
}
