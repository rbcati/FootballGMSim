/**
 * MilestoneModal.jsx
 *
 * Visual milestone modals for key league transitions:
 *  1. Playoff Bracket Reveal — shows the 14-team bracket (7 per conference)
 *  2. Season Complete Splash — shows the champion after the Super Bowl
 *
 * Both are non-blocking overlays that dismiss on click or button press.
 */

import React, { useState, useEffect } from "react";
import { teamColor } from "../../data/team-utils.js";

// ── Playoff Bracket Modal ────────────────────────────────────────────────────

function PlayoffBracketModal({ playoffSeeds, teams, onDismiss }) {
  if (!playoffSeeds || !teams?.length) return null;

  const teamMap = {};
  teams.forEach((t) => {
    teamMap[t.id] = t;
  });

  // Resolve conference keys (could be 0/1 or 'AFC'/'NFC')
  const confKeys = Object.keys(playoffSeeds);
  const confLabels = { 0: "AFC", 1: "NFC", AFC: "AFC", NFC: "NFC" };

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: "var(--space-6)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-8)",
          maxWidth: 700,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          cursor: "default",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: "var(--text-2xl)",
            fontWeight: 900,
            marginBottom: "var(--space-6)",
            letterSpacing: "-0.5px",
          }}
        >
          PLAYOFF BRACKET
        </div>

        <div style={{ marginBottom: "var(--space-4)", display: "grid", gap: 6 }}>
          {confKeys.map((confKey) => {
            const seeds = playoffSeeds[confKey] || [];
            const top = seeds[0];
            const bubble = seeds[6];
            const topTeam = top ? teamMap[top.teamId] : null;
            const bubbleTeam = bubble ? teamMap[bubble.teamId] : null;
            return (
              <div key={`story-${confKey}`} style={{ fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "6px 8px" }}>
                <strong style={{ color: "var(--text)" }}>{confLabels[confKey] || confKey}:</strong>{" "}
                {topTeam ? `${topTeam.abbr} secured the #1 seed.` : "Top seed set."}{" "}
                {bubbleTeam ? `${bubbleTeam.abbr} grabbed the final playoff slot.` : "Final berth locked."}
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-6)",
          }}
        >
          {confKeys.map((confKey) => {
            const seeds = playoffSeeds[confKey] || [];
            const label = confLabels[confKey] || `Conf ${confKey}`;

            return (
              <div key={confKey}>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "var(--text-lg)",
                    fontWeight: 800,
                    marginBottom: "var(--space-4)",
                    textTransform: "uppercase",
                    letterSpacing: "2px",
                    color: "var(--accent)",
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  {seeds.map((entry, idx) => {
                    const team = teamMap[entry.teamId];
                    const color = teamColor(team?.abbr ?? "");
                    const isBye = idx === 0;

                    return (
                      <div
                        key={entry.teamId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-3)",
                          padding: "var(--space-2) var(--space-3)",
                          background: isBye
                            ? `${color}22`
                            : "var(--surface-strong)",
                          border: `2px solid ${isBye ? color : "var(--hairline)"}`,
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: color,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            fontSize: 12,
                            flexShrink: 0,
                          }}
                        >
                          {entry.seed}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "var(--text-sm)",
                            color: "var(--text)",
                            flex: 1,
                          }}
                        >
                          {team?.name ?? `Team ${entry.teamId}`}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {team ? `${team.wins}-${team.losses}` : ""}
                        </span>
                        {isBye && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: color,
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                            }}
                          >
                            BYE
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Wildcard matchups */}
                <div
                  style={{
                    marginTop: "var(--space-4)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  Wildcard Round
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  {seeds.length >= 7 &&
                    [
                      [seeds[1], seeds[6]],
                      [seeds[2], seeds[5]],
                      [seeds[3], seeds[4]],
                    ].map(([high, low], i) => {
                      const hTeam = teamMap[high.teamId];
                      const lTeam = teamMap[low.teamId];
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "var(--space-2)",
                            fontSize: "var(--text-xs)",
                            fontWeight: 700,
                            color: "var(--text)",
                          }}
                        >
                          <span style={{ color: teamColor(hTeam?.abbr) }}>
                            #{high.seed} {hTeam?.abbr ?? "?"}
                          </span>
                          <span style={{ color: "var(--text-subtle)" }}>
                            vs
                          </span>
                          <span style={{ color: teamColor(lTeam?.abbr) }}>
                            #{low.seed} {lTeam?.abbr ?? "?"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: "var(--space-6)" }}>
          <button
            className="btn btn-primary"
            onClick={onDismiss}
            style={{ minWidth: 200 }}
          >
            Let's Go!
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Season Complete Splash ──────────────────────────────────────────────────

function SeasonCompleteSplash({ championTeamId, teams, onProceed }) {
  if (championTeamId == null || !teams?.length) return null;

  const champ = teams.find((t) => t.id === championTeamId);
  if (!champ) return null;

  const color = teamColor(champ.abbr ?? "");
  const winPct = (champ.wins + champ.losses) > 0 ? champ.wins / (champ.wins + champ.losses) : null;
  let recap = null;
  if (winPct != null) {
    recap = `${champ.wins}-${champ.losses} (${(winPct * 100).toFixed(1)}% win rate) and finished on top.`;
  } else if (Number.isFinite(champ.ovr)) {
    recap = `Closed the year with a ${champ.ovr} OVR title run.`;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "radial-gradient(circle at top, rgba(214,178,94,0.18), rgba(0,0,0,0.92) 45%)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-3)",
        padding: "var(--space-5)",
      }}
    >
      <div
        style={{
          fontSize: 58,
          lineHeight: 1,
          filter: "drop-shadow(0 0 16px rgba(214,178,94,0.4))",
        }}
      >
        🏆
      </div>
      <div
        style={{
          fontSize: "var(--text-2xl)",
          fontWeight: 900,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "2px",
          textAlign: "center",
        }}
      >
        Season Complete
      </div>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: `${color}28`,
          border: `4px solid ${color}`,
          boxShadow: `0 0 0 6px ${color}22, 0 18px 45px rgba(0,0,0,0.45)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 24,
          color: color,
        }}
      >
        {champ.abbr?.slice(0, 3) ?? "?"}
      </div>
      <div
        style={{
          fontSize: "var(--text-lg)",
          fontWeight: 800,
          color: color,
          textAlign: "center",
        }}
      >
        {champ.name}
      </div>
      <div
        style={{
          fontSize: "var(--text-sm)",
          color: "#fff",
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        Super Bowl Champions
      </div>
      <div
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        {champ.wins}-{champ.losses} Record · Championship clinched
      </div>
      {recap && (
        <div style={{
          minWidth: 280,
          maxWidth: 440,
          background: "rgba(17,24,39,0.72)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: "10px 12px",
        }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>
            {recap}
          </div>
        </div>
      )}
      <button
        className="btn btn-primary"
        onClick={onProceed}
        style={{
          marginTop: "var(--space-2)",
          minWidth: 220,
          fontSize: "var(--text-base)",
          fontWeight: 800,
        }}
      >
        Proceed to Offseason
      </button>
    </div>
  );
}

// ── Wrapper Component ────────────────────────────────────────────────────────

export default function MilestoneModal({
  league,
  onDismissPlayoffs,
  onDismissChampion,
}) {
  const [showPlayoffs, setShowPlayoffs] = useState(false);
  const [showChampion, setShowChampion] = useState(false);

  // Track seen milestones to prevent re-showing
  const [seenPlayoffSeeds, setSeenPlayoffSeeds] = useState(null);
  const [seenChampion, setSeenChampion] = useState(null);

  // Detect playoff phase entry
  useEffect(() => {
    if (
      league?.phase === "playoffs" &&
      league?.playoffSeeds &&
      JSON.stringify(league.playoffSeeds) !== JSON.stringify(seenPlayoffSeeds)
    ) {
      setShowPlayoffs(true);
      setSeenPlayoffSeeds(league.playoffSeeds);
    }
  }, [league?.phase, league?.playoffSeeds]);

  // Detect season complete (transition to offseason_resign with a champion)
  useEffect(() => {
    if (
      league?.phase === "offseason_resign" &&
      league?.championTeamId != null &&
      league?.championTeamId !== seenChampion
    ) {
      setShowChampion(true);
      setSeenChampion(league.championTeamId);
    }
  }, [league?.phase, league?.championTeamId]);

  return (
    <>
      {showPlayoffs && (
        <PlayoffBracketModal
          playoffSeeds={league?.playoffSeeds}
          teams={league?.teams}
          onDismiss={() => {
            setShowPlayoffs(false);
            onDismissPlayoffs?.();
          }}
        />
      )}
      {showChampion && (
        <SeasonCompleteSplash
          championTeamId={league?.championTeamId}
          teams={league?.teams}
          onProceed={() => {
            setShowChampion(false);
            onDismissChampion?.();
          }}
        />
      )}
    </>
  );
}

export { PlayoffBracketModal, SeasonCompleteSplash };
