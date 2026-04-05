/**
 * PlayerProfile.jsx
 *
 * Modal: accolades/legacy badges + position-aware career stats table.
 */
import React, { useEffect, useState } from "react";
import TraitBadge from "./TraitBadge";
import RadarChart from "./RadarChart";
import { getTeamIdentity } from "../../data/team-utils.js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Accolade badge config ─────────────────────────────────────────────────────

const ACCOLADE_META = {
  SB_RING: { icon: "🏆", label: (yr) => `${yr} SB Champ` },
  SB_MVP: { icon: "🌟", label: (yr) => `${yr} SB MVP` },
  MVP: { icon: "🏅", label: (yr) => `${yr} MVP` },
  OPOY: { icon: "⚡", label: (yr) => `${yr} OPOY` },
  DPOY: { icon: "🛡️", label: (yr) => `${yr} DPOY` },
  ROTY: { icon: "🌱", label: (yr) => `${yr} ROTY` },
};

// ── Position group → stat column definitions ──────────────────────────────────

function computePasserRating(t) {
  const att = t.passAtt || 0;
  if (att === 0) return "-";
  const a = Math.max(0, Math.min(2.375, ((t.passComp || 0) / att - 0.3) / 0.2));
  const b = Math.max(0, Math.min(2.375, ((t.passYd || 0) / att - 3) / 4));
  const c = Math.max(0, Math.min(2.375, (t.passTD || 0) / att / 0.05));
  const d = Math.max(
    0,
    Math.min(2.375, 2.375 - (t.interceptions || 0) / att / 0.04),
  );
  return (((a + b + c + d) / 6) * 100).toFixed(1);
}

const POS_COLUMNS = {
  QB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "passAtt", label: "Att" },
    { key: "passComp", label: "Cmp" },
    { key: "passYd", label: "Pass Yds", hi: 3000 },
    { key: "passTD", label: "TD" },
    { key: "interceptions", label: "INT" },
    { key: "sacks", label: "Sacked" },
    {
      key: "_compPct",
      label: "Cmp%",
      fmt: (t) =>
        t.passAtt
          ? (((t.passComp || 0) / t.passAtt) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "_passer", label: "RTG", fmt: computePasserRating },
  ],
  RB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "rushAtt", label: "Car" },
    { key: "rushYd", label: "Rush Yds", hi: 1000 },
    { key: "rushTD", label: "TD" },
    {
      key: "_ypc",
      label: "YPC",
      fmt: (t) => (t.rushAtt ? ((t.rushYd || 0) / t.rushAtt).toFixed(1) : "-"),
    },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds" },
    { key: "recTD", label: "RecTD" },
    { key: "fumbles", label: "Fum" },
  ],
  WR: [
    { key: "gamesPlayed", label: "GP" },
    { key: "targets", label: "Tgt" },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds", hi: 1000 },
    { key: "recTD", label: "TD" },
    {
      key: "_catchPct",
      label: "Catch%",
      fmt: (t) =>
        t.targets
          ? (((t.receptions || 0) / t.targets) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "yardsAfterCatch", label: "YAC" },
  ],
  TE: [
    { key: "gamesPlayed", label: "GP" },
    { key: "targets", label: "Tgt" },
    { key: "receptions", label: "Rec" },
    { key: "recYd", label: "Rec Yds", hi: 700 },
    { key: "recTD", label: "TD" },
    {
      key: "_catchPct",
      label: "Catch%",
      fmt: (t) =>
        t.targets
          ? (((t.receptions || 0) / t.targets) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "yardsAfterCatch", label: "YAC" },
  ],
  OL: [
    { key: "gamesPlayed", label: "GP" },
    { key: "passBlockSnaps", label: "PB Snaps" },
    { key: "runBlockSnaps", label: "RB Snaps" },
    { key: "sacksAllowed", label: "Sacks Alwd" },
  ],
  DL: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl" },
    { key: "sacks", label: "Sacks", hi: 5 },
    { key: "tacklesForLoss", label: "TFL" },
    { key: "forcedFumbles", label: "FF" },
    { key: "fumbleRecoveries", label: "FR" },
    { key: "pressures", label: "Pres" },
    { key: "passRushSnaps", label: "Rush Snaps" },
  ],
  LB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl", hi: 80 },
    { key: "sacks", label: "Sacks" },
    { key: "tacklesForLoss", label: "TFL" },
    { key: "forcedFumbles", label: "FF" },
    { key: "interceptions", label: "INT" },
    { key: "passesDefended", label: "PD" },
  ],
  CB: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl" },
    { key: "interceptions", label: "INT", hi: 3 },
    { key: "passesDefended", label: "PD" },
    { key: "targetsAllowed", label: "Tgt Alwd" },
    { key: "completionsAllowed", label: "Cmp Alwd" },
  ],
  S: [
    { key: "gamesPlayed", label: "GP" },
    { key: "tackles", label: "Tkl", hi: 80 },
    { key: "interceptions", label: "INT", hi: 3 },
    { key: "passesDefended", label: "PD" },
    { key: "targetsAllowed", label: "Tgt Alwd" },
  ],
  K: [
    { key: "gamesPlayed", label: "GP" },
    { key: "fgMade", label: "FGM" },
    { key: "fgAttempts", label: "FGA" },
    {
      key: "_fgPct",
      label: "FG%",
      fmt: (t) =>
        t.fgAttempts
          ? (((t.fgMade || 0) / t.fgAttempts) * 100).toFixed(1) + "%"
          : "-",
    },
    { key: "longestFG", label: "Lng" },
    { key: "xpMade", label: "XPM" },
    { key: "xpAttempts", label: "XPA" },
  ],
  P: [
    { key: "gamesPlayed", label: "GP" },
    { key: "punts", label: "Punts" },
    { key: "puntYards", label: "Yds" },
    {
      key: "_avgPunt",
      label: "Avg",
      fmt: (t) => (t.punts ? ((t.puntYards || 0) / t.punts).toFixed(1) : "-"),
    },
    { key: "longestPunt", label: "Lng" },
  ],
};

function getColumns(pos) {
  if (!pos) return POS_COLUMNS.QB;
  const p = pos.toUpperCase();
  if (POS_COLUMNS[p]) return POS_COLUMNS[p];
  if (["DE", "DT", "EDGE"].includes(p)) return POS_COLUMNS.DL;
  if (["SS", "FS"].includes(p)) return POS_COLUMNS.S;
  if (["OT", "OG", "C", "G", "T"].includes(p)) return POS_COLUMNS.OL;
  return POS_COLUMNS.QB; // fallback
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(t, col) {
  if (col.fmt) return col.fmt(t);
  const v = t[col.key];
  if (v === undefined || v === null) return "-";
  // Format large integers with locale commas (e.g. 6122 → 6,122)
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 1000) {
    return v.toLocaleString();
  }
  return v;
}

function isHigh(t, col) {
  if (!col.hi) return false;
  const v = t[col.key];
  return typeof v === "number" && v >= col.hi;
}

function seasonYear(seasonId) {
  if (!seasonId) return "?";
  if (seasonId.startsWith("s")) {
    const n = parseInt(seasonId.replace("s", ""), 10);
    return isNaN(n) ? seasonId : 2024 + n;
  }
  return seasonId;
}

// ── Extension Modal ───────────────────────────────────────────────────────────

function ExtensionModal({ player, actions, teamId, onClose, onComplete }) {
  const [ask, setAsk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    actions
      .getExtensionAsk(player.id)
      .then((resp) => {
        if (resp.payload?.ask) setAsk(resp.payload.ask);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [player.id, actions]);

  const handleAccept = async () => {
    if (!ask) return;
    setLoading(true);
    await actions.extendContract(player.id, teamId, ask);
    onComplete();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <Card
        className="card-premium"
        style={{
          width: "min(420px, calc(100vw - 24px))",
          maxHeight: "min(88vh, 640px)",
          overflowY: "auto",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-lg)",
          background: "var(--surface)",
        }}
      >
        <CardContent>
        <h3 style={{ marginTop: 0 }}>Extend {player.name}</h3>
        {loading ? (
          <div
            style={{
              padding: "var(--space-4)",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            Negotiating…
          </div>
        ) : ask ? (
          <div>
            <p
              style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}
            >
              Agent Demand:
            </p>
            <div
              style={{
                fontSize: "1.5em",
                fontWeight: 800,
                margin: "var(--space-4) 0",
                color: "var(--accent)",
                textAlign: "center",
                background: "var(--surface-strong)",
                padding: "var(--space-4)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {ask.years} Years
              <br />
              <span style={{ fontSize: "0.6em", color: "var(--text)" }}>
                ${ask.baseAnnual}M / yr
              </span>
            </div>
            <div
              style={{
                fontSize: "0.85em",
                color: "var(--text-subtle)",
                textAlign: "center",
                marginBottom: "var(--space-6)",
              }}
            >
              Includes ${ask.signingBonus}M Signing Bonus
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                justifyContent: "flex-end",
              }}
            >
              <Button className="btn" onClick={onClose}>
                Reject
              </Button>
              <Button
                className="btn btn-primary"
                onClick={handleAccept}
                style={{
                  background: "var(--success)",
                  borderColor: "var(--success)",
                  color: "#fff",
                }}
              >
                Accept Deal
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div
              style={{
                border: "1px solid rgba(255,159,10,0.45)",
                background: "rgba(255,159,10,0.10)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              <p style={{ margin: 0, fontWeight: 700 }}>Negotiation unavailable</p>
              <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                Player refuses to negotiate at this time.
              </p>
            </div>
            <Button className="btn" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Look up a team's full name, delegating to the shared getTeamIdentity utility. */
function getTeamName(teamId, teams) {
  return getTeamIdentity(teamId, teams).name;
}

export default function PlayerProfile({
  playerId,
  onClose,
  actions,
  teams = [],
  isUserOnClock = false,
  onDraftPlayer = null,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);

  const fetchProfile = React.useCallback(() => {
    if (!playerId) return;
    setLoading(true);
    actions
      .getPlayerCareer(playerId)
      .then((response) => {
        setData(response.payload ?? response);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load player profile:", err);
        setLoading(false);
      });
  }, [playerId, actions]);

  useEffect(() => {
    let stale = false;
    if (!playerId) return;
    setLoading(true);
    actions
      .getPlayerCareer(playerId)
      .then((response) => {
        if (!stale) {
          setData(response.payload ?? response);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!stale) {
          console.error("Failed to load player profile:", err);
          setLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [playerId, actions]);

  if (!playerId) return null;

  const player = data?.player;
  const stats = data?.stats ?? [];
  const columns = getColumns(player?.pos);

  // Group accolades: condense SB_RING into count
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const ringCount = accolades.filter((a) => a.type === "SB_RING").length;
  const nonRing = accolades
    .filter((a) => a.type !== "SB_RING")
    .sort((a, b) => b.year - a.year);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.6)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, var(--surface-elevated), var(--surface))",
          width: "92%",
          maxWidth: 960,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--hairline-strong)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Draft Banner (only when user is on the clock) ── */}
        {isUserOnClock && onDraftPlayer && player && (
          <div
            style={{
              padding: "var(--space-3) var(--space-5)",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "#fff",
                fontSize: "var(--text-sm)",
              }}
            >
              ★ You're on the clock! Draft {player.name}?
            </span>
            <Button
              className="btn"
              style={{
                background: "#fff",
                color: "var(--accent)",
                border: "none",
                fontWeight: 800,
                padding: "6px 18px",
                fontSize: "var(--text-sm)",
                borderRadius: "var(--radius-pill)",
                flexShrink: 0,
              }}
              onClick={() => onDraftPlayer(player.id)}
            >
              Draft This Player
            </Button>
          </div>
        )}

        {/* ── Header ── */}
        <div
          style={{
            padding: "var(--space-5)",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
          }}
        >
          {loading ? (
            <div style={{ color: "var(--text-muted)" }}>Loading…</div>
          ) : player ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                alignItems: "flex-start",
                flex: 1,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: "var(--surface-sunken)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                {player.pos}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.35rem, 2.8vw, 1.8rem)",
                    fontWeight: 900,
                  }}
                >
                  {player.name}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {player.pos} · Age {player.age} ·{" "}
                  {player.status === "active"
                    ? getTeamName(player.teamId, teams)
                    : "Retired"}
                </div>

                {/* OVR + progression delta + potential */}
                <div
                  style={{
                    marginTop: "var(--space-2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className={`rating-pill rating-color-${player.ovr >= 85 ? "elite" : player.ovr >= 75 ? "good" : "avg"}`}
                  >
                    {player.ovr} OVR
                  </span>
                  {player.progressionDelta != null &&
                    player.progressionDelta !== 0 && (
                      <span
                        className={
                          player.progressionDelta > 0
                            ? "text-success"
                            : "text-danger"
                        }
                        style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}
                      >
                        ({player.progressionDelta > 0 ? "+" : ""}
                        {player.progressionDelta})
                      </span>
                    )}
                  {player.potential && (
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 700,
                      }}
                    >
                      Pot: {player.potential}
                    </span>
                  )}
                </div>

                {/* Traits */}
                {player.traits?.length > 0 && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    {player.traits.map((t) => (
                      <TraitBadge key={t} traitId={t} />
                    ))}
                  </div>
                )}

                {/* ── Accolades / Legacy ── */}
                {(ringCount > 0 || nonRing.length > 0) && (
                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                    }}
                  >
                    {ringCount > 0 && (
                      <span style={badgeStyle("#B8860B", "#ffe066")}>
                        🏆 {ringCount}x SB Champ
                      </span>
                    )}
                    {nonRing.map((acc, i) => {
                      const meta = ACCOLADE_META[acc.type];
                      if (!meta) return null;
                      return (
                        <span
                          key={i}
                          style={badgeStyle(
                            "var(--accent)",
                            "var(--surface-strong)",
                          )}
                        >
                          {meta.icon} {meta.label(acc.year)}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Extension button */}
                {player.status === "active" && player.contract?.years === 1 && (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <Button
                      className="btn"
                      onClick={() => setExtending(true)}
                      style={{
                        fontSize: "var(--text-xs)",
                        padding: "4px 12px",
                        border: "1px solid var(--accent)",
                        color: "var(--accent)",
                      }}
                    >
                      Negotiate Extension
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>Player not found</div>
          )}

          <Button
            className="btn"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.5rem",
              lineHeight: 1,
              color: "var(--text-muted)",
              padding: "var(--space-1)",
              marginLeft: "var(--space-2)",
            }}
          >
            ×
          </Button>
        </div>

        {/* ── Career Stats ── */}
        <div style={{ padding: "var(--space-5)", flex: 1 }}>
          <h3
            style={{
              marginTop: 0,
              fontSize: "var(--text-lg)",
              marginBottom: "var(--space-3)",
            }}
          >
            Career Stats
          </h3>

          {loading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading stats…</p>
          ) : stats.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No career stats recorded yet.
            </p>
          ) : (
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <Table
                className="standings-table"
                style={{ width: "100%", minWidth: 480, fontSize: "0.79rem", lineHeight: 1.35 }}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead
                      style={{
                        paddingLeft: "var(--space-4)",
                        textAlign: "left",
                      }}
                    >
                      Year
                    </TableHead>
                    <TableHead style={{ textAlign: "left" }}>Team</TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        style={{ textAlign: "center", whiteSpace: "nowrap" }}
                      >
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...stats]
                    .sort((a, b) =>
                      (b.seasonId || "").localeCompare(a.seasonId || ""),
                    )
                    .map((s, i) => {
                      const t = s.totals || {};
                      return (
                        <TableRow key={i}>
                          <TableCell
                            style={{
                              paddingLeft: "var(--space-4)",
                              fontWeight: 600,
                            }}
                          >
                            {seasonYear(s.seasonId)}
                          </TableCell>
                          <TableCell
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "var(--text-xs)",
                            }}
                          >
                            {s.teamId != null
                              ? getTeamName(s.teamId, teams)
                              : "FA"}
                          </TableCell>
                          {columns.map((col) => (
                            <TableCell
                              key={col.key}
                              style={{
                                textAlign: "center",
                                color: isHigh(t, col)
                                  ? "var(--accent)"
                                  : "var(--text)",
                                fontWeight: isHigh(t, col) ? 700 : 400,
                              }}
                            >
                              {fmt(t, col)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Career totals row */}
          {!loading &&
            stats.length > 1 &&
            (() => {
              const totals = {};
              stats.forEach((s) => {
                Object.entries(s.totals || {}).forEach(([k, v]) => {
                  if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
                });
              });
              return (
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--surface-strong)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    gap: "var(--space-6)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Career
                  </span>
                  {columns
                    .filter((c) => !c.fmt && c.key !== "gamesPlayed")
                    .slice(0, 6)
                    .map((col) => {
                      const v = totals[col.key];
                      if (v === undefined) return null;
                      return (
                        <span
                          key={col.key}
                          style={{ fontSize: "var(--text-sm)" }}
                        >
                          <span
                            style={{
                              color: "var(--text-muted)",
                              marginRight: 4,
                            }}
                          >
                            {col.label}
                          </span>
                          <strong>{v}</strong>
                        </span>
                      );
                    })}
                </div>
              );
            })()}

          {/* ── Per-season Career Stats (from player.careerStats archive) ── */}
          {!loading && player?.careerStats?.length > 0 && (
            <div style={{ marginTop: "var(--space-6)" }}>
              <h3
                style={{
                  fontSize: "var(--text-base)",
                  fontWeight: 700,
                  marginBottom: "var(--space-3)",
                  marginTop: 0,
                }}
              >
                Season Log
              </h3>
              <div className="table-wrapper" style={{ overflowX: "auto" }}>
                <Table
                  className="standings-table"
                  style={{
                    width: "100%",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 360,
                  }}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        style={{
                          textAlign: "left",
                          paddingLeft: "var(--space-4)",
                        }}
                      >
                        Season
                      </TableHead>
                      <TableHead style={{ textAlign: "left" }}>Team</TableHead>
                      <TableHead style={{ textAlign: "center" }}>GP</TableHead>
                      {["QB"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>YDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>TD</TableHead>
                          <TableHead style={{ textAlign: "center" }}>INT</TableHead>
                          <TableHead style={{ textAlign: "center" }}>CMP%</TableHead>
                        </>
                      )}
                      {["RB", "FB"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>RYDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>RTD</TableHead>
                          <TableHead style={{ textAlign: "center" }}>REC</TableHead>
                          <TableHead style={{ textAlign: "center" }}>RCYDS</TableHead>
                        </>
                      )}
                      {["WR", "TE"].includes(player.pos) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>REC</TableHead>
                          <TableHead style={{ textAlign: "center" }}>YDS</TableHead>
                          <TableHead style={{ textAlign: "center" }}>TD</TableHead>
                        </>
                      )}
                      {["DE", "DT", "LB", "CB", "S", "DL"].includes(
                        player.pos,
                      ) && (
                        <>
                          <TableHead style={{ textAlign: "center" }}>TKL</TableHead>
                          <TableHead style={{ textAlign: "center" }}>SCK</TableHead>
                          <TableHead style={{ textAlign: "center" }}>FF</TableHead>
                        </>
                      )}
                      <TableHead style={{ textAlign: "center" }}>OVR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...player.careerStats].reverse().map((line, i) => (
                      <TableRow key={i}>
                        <TableCell
                          style={{
                            paddingLeft: "var(--space-4)",
                            fontWeight: 600,
                          }}
                        >
                          {line.season}
                        </TableCell>
                        <TableCell
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "var(--text-xs)",
                          }}
                        >
                          {line.team}
                        </TableCell>
                        <TableCell style={{ textAlign: "center" }}>
                          {line.gamesPlayed}
                        </TableCell>
                        {["QB"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.passYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.passTDs}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.ints}</TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.compPct?.toFixed(1)}%
                            </TableCell>
                          </>
                        )}
                        {["RB", "FB"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.rushYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.rushTDs}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.receptions}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recYds?.toLocaleString()}
                            </TableCell>
                          </>
                        )}
                        {["WR", "TE"].includes(player.pos) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.receptions}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recYds?.toLocaleString()}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.recTDs}
                            </TableCell>
                          </>
                        )}
                        {["DE", "DT", "LB", "CB", "S", "DL"].includes(
                          player.pos,
                        ) && (
                          <>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.tackles}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>
                              {line.sacks}
                            </TableCell>
                            <TableCell style={{ textAlign: "center" }}>{line.ffum}</TableCell>
                          </>
                        )}
                        <TableCell style={{ textAlign: "center" }}>
                          <strong>{line.ovr}</strong>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Extension modal */}
      {extending && player && (
        <ExtensionModal
          player={player}
          actions={actions}
          teamId={player.teamId}
          onClose={() => setExtending(false)}
          onComplete={() => {
            setExtending(false);
            fetchProfile();
          }}
        />
      )}

      <style>{`
        .rating-pill {
          display: inline-block; padding: 2px 8px;
          border-radius: var(--radius-pill);
          font-weight: 700; font-size: var(--text-sm); color: #fff;
        }
        .rating-color-elite { background: var(--accent); }
        .rating-color-good  { background: var(--success); }
        .rating-color-avg   { background: var(--warning); }
        .rating-color-bad   { background: var(--danger); }
      `}</style>
    </div>
  );
}

function badgeStyle(borderColor, bg) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--text-xs)",
    fontWeight: 700,
    border: `1px solid ${borderColor}`,
    background: bg,
    color: "var(--text)",
  };
}
