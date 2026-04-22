import React, { useState, useEffect } from "react";
import { teamColor } from "../../data/team-utils.js";
import EmptyState from "./EmptyState.jsx";

function LeaderList({ title, players, onPlayerSelect }) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--hairline)",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
      >
        {players.map((p, i) => (
          <div
            key={p.playerId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "var(--text-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  color: "var(--text-subtle)",
                  fontWeight: 700,
                  fontSize: "10px",
                  width: 12,
                  textAlign: "right",
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontWeight: 600,
                  cursor: onPlayerSelect ? "pointer" : "default",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onClick={() => onPlayerSelect?.(p.playerId)}
                title={p.name}
              >
                {p.name}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 4px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: teamColor(p.teamAbbr) + "22",
                  color: teamColor(p.teamAbbr),
                }}
              >
                {p.teamAbbr}
              </span>
            </div>
            <div
              style={{
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                marginLeft: "var(--space-2)",
              }}
            >
              {p.value.toLocaleString()}
            </div>
          </div>
        ))}
        {players.length === 0 && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--text-xs)",
              padding: "var(--space-2) 0",
            }}
          >
            No stats available.
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatLeadersWidget({ onPlayerSelect, actions }) {
  const [mode, setMode] = useState("league"); // 'league' | 'team'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProjected, setShowProjected] = useState(false);

  useEffect(() => {
    setLoading(true);
    actions
      .getDashboardLeaders()
      .then((res) => {
        setData(res.payload ?? res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load dashboard leaders:", err);
        setLoading(false);
      });
  }, [actions]);

  if (loading) {
    return (
      <div
        className="card stat-box"
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 150,
        }}
      >
        <div style={{ color: "var(--text-muted)" }}>Loading stats...</div>
      </div>
    );
  }

  if (!data) return null;

  const currentData = mode === "league" ? data.league : data.team;

  const projectedLeaders = {
    passing: (data?.league?.passing || []).slice(0, 3),
    rushing: (data?.league?.rushing || []).slice(0, 3),
    receiving: (data?.league?.receiving || []).slice(0, 3),
  };

  // Determine if there's any data
  const hasData = ["passing", "rushing", "receiving"].some(
    (cat) => currentData[cat] && currentData[cat].length > 0,
  );

  return (
    <div
      className="card stat-box"
      style={{ gridColumn: "1 / -1", padding: "var(--space-4)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-4)",
        }}
      >
        <div className="stat-label" style={{ marginBottom: 0 }}>
          Stat Leaders
        </div>

        {/* Toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--surface-strong)",
            borderRadius: "var(--radius-pill)",
            padding: 2,
            border: "1px solid var(--hairline)",
          }}
        >
          <button
            className="btn"
            onClick={() => setMode("league")}
            style={{
              padding: "2px 12px",
              fontSize: "11px",
              fontWeight: 700,
              borderRadius: "var(--radius-pill)",
              border: "none",
              cursor: "pointer",
              background: mode === "league" ? "var(--accent)" : "transparent",
              color: mode === "league" ? "#fff" : "var(--text-muted)",
              transition: "all 0.2s ease",
            }}
          >
            LEAGUE
          </button>
          <button
            className="btn"
            onClick={() => setMode("team")}
            style={{
              padding: "2px 12px",
              fontSize: "11px",
              fontWeight: 700,
              borderRadius: "var(--radius-pill)",
              border: "none",
              cursor: "pointer",
              background: mode === "team" ? "var(--accent)" : "transparent",
              color: mode === "team" ? "#fff" : "var(--text-muted)",
              transition: "all 0.2s ease",
            }}
          >
            TEAM
          </button>
        </div>
      </div>

      {!hasData ? (
        <>
          <EmptyState
            icon="📊"
            title="Season kicks off this week"
            subtitle="Stat leaders will appear after Week 1 games are played."
            action={showProjected ? "Hide League Predictions" : "Preview League Predictions"}
            onAction={() => setShowProjected((prev) => !prev)}
          />
          {showProjected ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
              <LeaderList title="Projected Pass Yds" players={projectedLeaders.passing} onPlayerSelect={onPlayerSelect} />
              <LeaderList title="Projected Rush Yds" players={projectedLeaders.rushing} onPlayerSelect={onPlayerSelect} />
              <LeaderList title="Projected Rec Yds" players={projectedLeaders.receiving} onPlayerSelect={onPlayerSelect} />
            </div>
          ) : null}
        </>
      ) : (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-6)" }}
        >
          <LeaderList
            title="Passing Yds"
            players={currentData.passing || []}
            onPlayerSelect={onPlayerSelect}
          />
          <LeaderList
            title="Rushing Yds"
            players={currentData.rushing || []}
            onPlayerSelect={onPlayerSelect}
          />
          <LeaderList
            title="Receiving Yds"
            players={currentData.receiving || []}
            onPlayerSelect={onPlayerSelect}
          />
        </div>
      )}
    </div>
  );
}
