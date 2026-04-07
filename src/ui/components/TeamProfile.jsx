/**
 * TeamProfile.jsx
 *
 * Modal: franchise history, all-time record, titles, and current top roster.
 * Opens when a team name is clicked in Standings or other views.
 */
import React, { useEffect, useState, useMemo } from "react";
import RelocateModal from "./RelocateModal.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { deriveTeamCapSnapshot, formatMoneyM, safeRound, toFiniteNumber } from "../utils/numberFormatting.js";
import { buildTeamIntelligence } from "../utils/teamIntelligence.js";
import { deriveTeamCoachingIdentity } from "../utils/coachingIdentity.js";
import { buildTeamChemistrySummary } from "../utils/teamChemistry.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function winPct(w, l, t) {
  const g = w + l + t;
  if (g === 0) return ".000";
  return ((w + t * 0.5) / g).toFixed(3).replace(/^0/, "");
}

function ovrColor(ovr) {
  if (ovr >= 85) return "var(--accent)";
  if (ovr >= 75) return "var(--success)";
  if (ovr >= 65) return "var(--warning)";
  return "var(--danger)";
}

const sectionHeadingStyle = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--text-sm)",
  fontWeight: 800,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, sub }) {
  return (
    <div
      style={{
        background: "var(--surface-strong)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        textAlign: "center",
        minWidth: 100,
      }}
    >
      <div
        style={{
          fontSize: "var(--text-2xl)",
          fontWeight: 800,
          color: "var(--text)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-subtle)",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamProfile({ teamId, onClose, onPlayerSelect, actions, onNavigate = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRelocate, setShowRelocate] = useState(false);

  useEffect(() => {
    if (!teamId && teamId !== 0) return;
    setLoading(true);
    setData(null);
    actions
      .getTeamProfile(teamId)
      .then((resp) => {
        setData(resp.payload ?? resp);
        setLoading(false);
      })
      .catch((err) => {
        console.error("TeamProfile fetch failed:", err);
        setLoading(false);
      });
  }, [teamId]);

  if (teamId == null) return null;

  const team = data?.team;
  const franchise = data?.franchise;
  const players = data?.currentPlayers ?? [];
  const color = teamColor(team?.abbr ?? "");
  const capSnapshot = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const gp = toFiniteNumber(team?.wins, 0) + toFiniteNumber(team?.losses, 0) + toFiniteNumber(team?.ties, 0);
  const ppg = gp > 0 ? toFiniteNumber(team?.ptsFor, 0) / gp : 0;
  const papg = gp > 0 ? toFiniteNumber(team?.ptsAgainst, 0) / gp : 0;
  const diff = toFiniteNumber(team?.ptsFor, 0) - toFiniteNumber(team?.ptsAgainst, 0);
  const diffPerGame = gp > 0 ? diff / gp : 0;
  const avgAge = players.length ? (players.reduce((sum, p) => sum + toFiniteNumber(p.age, 0), 0) / players.length) : 0;
  const injuryCount = players.filter((p) => toFiniteNumber(p.injuryWeeksRemaining, 0) > 0).length;
  const expiringCount = players.filter((p) => toFiniteNumber(p.contract?.years ?? p.years, 0) <= 1).length;
  const teamIntel = useMemo(() => buildTeamIntelligence({ ...team, roster: players }, { week: 10 }), [team, players]);
  const coachingIdentity = useMemo(() => deriveTeamCoachingIdentity({ ...team, roster: players }, { intel: teamIntel, direction: teamIntel?.direction }), [team, players, teamIntel]);
  const chemistry = useMemo(() => buildTeamChemistrySummary({ ...team, roster: players }, { week: data?.meta?.week ?? 1, direction: teamIntel?.direction }), [team, players, data?.meta?.week, teamIntel]);

  return (
    <>
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
          background: "var(--surface)",
          width: "min(860px, 100%)",
          maxWidth: 820,
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderBottom: "1px solid var(--hairline)",
            background: "var(--surface-strong)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {loading ? (
            <div style={{ color: "var(--text-muted)" }}>
              Loading franchise history…
            </div>
          ) : team ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                alignItems: "center",
              }}
            >
              {/* Team logo */}
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background: `${color}22`,
                  border: `3px solid ${color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 18,
                  color,
                  flexShrink: 0,
                }}
              >
                {(team.abbr ?? "?").slice(0, 3)}
              </div>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.1rem, 5vw, 1.6rem)",
                    fontWeight: 800,
                    lineHeight: 1.15,
                  }}
                >
                  {team.name}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    marginTop: 2,
                  }}
                >
                  {team.conf} · {team.div} · OVR{" "}
                  <strong style={{ color: ovrColor(team.ovr) }}>
                    {team.ovr}
                  </strong>
                </div>
                <div
                  style={{
                    color: "var(--text-subtle)",
                    fontSize: "var(--text-xs)",
                    marginTop: 3,
                  }}
                >
                  {team.wins}-{team.losses}
                  {team.ties > 0 ? `-${team.ties}` : ""} · {safeRound(toFiniteNumber(team.ptsFor, 0), 0)} PF /{" "}
                  {safeRound(toFiniteNumber(team.ptsAgainst, 0), 0)} PA
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>Team not found</div>
          )}
          <Button
            className="btn"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              lineHeight: 1,
              color: "var(--text-muted)",
              padding: "4px 8px",
              marginLeft: "var(--space-2)",
              minWidth: 36,
              minHeight: 36,
            }}
          >
            ×
          </Button>
        </div>

        {/* ── Body ── */}
        {!loading && team && franchise && (
          <div
            style={{
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-5)",
            }}
          >
            <section>
              <h3 style={sectionHeadingStyle}>Current Season Identity</h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Analytics")}>Team analytics</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Injuries")}>Injury report</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Financials")}>Financials</Button>
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <StatBox label="Points/Game" value={safeRound(ppg, 1)} sub={`Allowed ${safeRound(papg, 1)}/G`} />
                <StatBox label="Point Differential" value={`${diff >= 0 ? "+" : ""}${safeRound(diff, 0)}`} sub={`${diffPerGame >= 0 ? "+" : ""}${safeRound(diffPerGame, 1)} per game`} />
                <StatBox label="Roster Age" value={safeRound(avgAge, 1)} sub={avgAge >= 29 ? "Veteran-heavy" : avgAge <= 25 ? "Young core" : "Balanced"} />
                <StatBox label="Availability Pressure" value={injuryCount} sub={`${expiringCount} expiring deals`} />
              </div>
            </section>

            {coachingIdentity && (
              <section>
                <h3 style={sectionHeadingStyle}>Coaching & Franchise Tone</h3>
                <div style={{ display: "grid", gap: 8, marginBottom: "var(--space-2)" }}>
                  <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", background: "var(--surface-strong)" }}>
                    <strong>{coachingIdentity.teamTone}</strong> · {coachingIdentity.continuity.label} · {coachingIdentity.seat.label}
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4 }}>
                      {coachingIdentity.philosophy.offSchemeName} ({coachingIdentity.philosophy.offense}) / {coachingIdentity.philosophy.defSchemeName} ({coachingIdentity.philosophy.defense})
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    {coachingIdentity.staffRows.map((row) => (
                      <div key={row.role} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-2)", background: "var(--surface-strong)" }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", textTransform: "uppercase", fontWeight: 700 }}>{row.role}</div>
                        <div style={{ fontWeight: 700 }}>{row.name}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{row.tenureLabel}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(coachingIdentity.continuity.tags?.length ? coachingIdentity.continuity.tags : ["No major continuity tags"]).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                  </div>
                  {(coachingIdentity.rosterFitNotes ?? []).slice(0, 2).map((note, idx) => (
                    <div key={`${note}-${idx}`} style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>• {note}</div>
                  ))}
                </div>
              </section>
            )}


            <section>
              <h3 style={sectionHeadingStyle}>Locker-Room Chemistry</h3>
              <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", background: "var(--surface-strong)", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge variant={chemistry?.state === "Fragmented" ? "destructive" : chemistry?.state === "Uneasy" ? "secondary" : "outline"}>{chemistry?.state ?? "Stable"}</Badge>
                  <Badge variant="outline">Score {chemistry?.score ?? "—"}</Badge>
                  <Badge variant="secondary">Morale avg {chemistry?.moraleAverage ?? "—"}</Badge>
                </div>
                {(chemistry?.reasons ?? []).slice(0, 2).map((reason, idx) => (
                  <div key={`chem-r-${idx}`} style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>• {reason}</div>
                ))}
                {(chemistry?.leaders ?? []).slice(0, 3).map((leader) => (
                  <div key={`leader-${leader.playerId}`} style={{ fontSize: "var(--text-sm)" }}>
                    <strong>{leader.name}</strong> ({leader.pos}) · {leader.role}
                  </div>
                ))}
                {(chemistry?.tensions ?? []).slice(0, 2).map((tension, idx) => (
                  <div key={`ten-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--warning)" }}>⚠ {tension.text}</div>
                ))}
              </div>
            </section>

            {/* ── Franchise Stats ── */}
            <section>
              <h3
                style={sectionHeadingStyle}
              >
                Franchise Records
              </h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("History")}>Season archive</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Hall of Fame")}>Hall of Fame</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("Leaders")}>Leaders</Button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <StatBox
                  label="All-Time Record"
                  value={`${safeRound(toFiniteNumber(franchise.allTimeWins, 0), 0)}-${safeRound(toFiniteNumber(franchise.allTimeLosses, 0), 0)}`}
                  sub={winPct(
                    toFiniteNumber(franchise.allTimeWins, 0),
                    toFiniteNumber(franchise.allTimeLosses, 0),
                    toFiniteNumber(franchise.allTimeTies, 0),
                  )}
                />
                <StatBox label="Seasons" value={franchise.seasonsPlayed || 0} />
                <StatBox
                  label="Super Bowls"
                  value={franchise.sbTitles || 0}
                  sub={
                    franchise.sbTitles > 0
                      ? "🏆".repeat(Math.min(franchise.sbTitles, 5))
                      : ""
                  }
                />
                <StatBox label="Div. Titles" value={franchise.divTitles || 0} />
                <StatBox label="Playoff Apps" value={franchise.playoffAppearances || 0} />
              </div>
            </section>

            {/* ── Cap snapshot ── */}
            <section>
              <h3
                style={sectionHeadingStyle}
              >
                Current Salary Cap
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <StatBox
                  label="Cap Total"
                  value={formatMoneyM(capSnapshot.capTotal, "—", { digits: 0 })}
                />
                <StatBox
                  label="Cap Used"
                  value={formatMoneyM(capSnapshot.capUsed)}
                />
                <StatBox
                  label="Cap Space"
                  value={formatMoneyM(capSnapshot.capRoom)}
                  sub={capSnapshot.capRoom < 0 ? "Over cap" : "Available"}
                />
              </div>
            </section>

            {/* ── Season history ── */}
            {franchise.seasonHistory?.length > 0 && (
              <section>
                <h3
                  style={sectionHeadingStyle}
                >
                  Season History (last {franchise.seasonHistory.length})
                </h3>
                <div className="table-wrapper" style={{ overflowX: "auto" }}>
                  <Table
                    className="standings-table"
                    style={{ width: "100%", minWidth: 420, fontSize: "0.76rem", lineHeight: 1.25 }}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          style={{
                            textAlign: "left",
                            paddingLeft: "var(--space-3)",
                          }}
                        >
                          Year
                        </TableHead>
                        <TableHead style={{ textAlign: "center" }}>W</TableHead>
                        <TableHead style={{ textAlign: "center" }}>L</TableHead>
                        <TableHead style={{ textAlign: "center" }}>T</TableHead>
                        <TableHead style={{ textAlign: "center" }}>PCT</TableHead>
                        <TableHead style={{ textAlign: "center" }}>PF</TableHead>
                        <TableHead style={{ textAlign: "center" }}>PA</TableHead>
                        <TableHead style={{ textAlign: "center" }}>Titles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {franchise.seasonHistory.map((row, i) => (
                        <TableRow key={i} className={row.champion ? "selected" : ""}>
                          <TableCell
                            style={{
                              paddingLeft: "var(--space-3)",
                              fontWeight: 600,
                            }}
                          >
                            {row.year}
                          </TableCell>
                          <TableCell style={{ textAlign: "center", fontWeight: 700 }}>
                            {safeRound(toFiniteNumber(row.wins, 0), 0)}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>{safeRound(toFiniteNumber(row.losses, 0), 0)}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{safeRound(toFiniteNumber(row.ties, 0), 0)}</TableCell>
                          <TableCell style={{ textAlign: "center", fontWeight: 600 }}>
                            {winPct(toFiniteNumber(row.wins, 0), toFiniteNumber(row.losses, 0), toFiniteNumber(row.ties, 0))}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>{safeRound(toFiniteNumber(row.pf, 0), 0)}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{safeRound(toFiniteNumber(row.pa, 0), 0)}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>
                            {row.champion && (
                              <span title="Super Bowl Champion">🏆</span>
                            )}
                            {row.divTitle && (
                              <span
                                title="Division Title"
                                style={{ marginLeft: 2 }}
                              >
                                🥇
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {(franchise.bestSeasons?.length > 0 || franchise.worstSeasons?.length > 0) && (
              <section>
                <h3 style={sectionHeadingStyle}>Franchise Legacy Highlights</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-2)" }}>
                  <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Best Seasons</div>
                    {(franchise.bestSeasons ?? []).slice(0, 3).map((row) => (
                      <div key={`best-${row.year}`} style={{ marginTop: 6, fontSize: "var(--text-sm)" }}>
                        <strong>{row.year}</strong> · {row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""} {row.champion ? "🏆" : ""}
                      </div>
                    ))}
                  </div>
                  <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Toughest Seasons</div>
                    {(franchise.worstSeasons ?? []).slice(0, 3).map((row) => (
                      <div key={`worst-${row.year}`} style={{ marginTop: 6, fontSize: "var(--text-sm)" }}>
                        <strong>{row.year}</strong> · {row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {franchise.hallOfFamers?.length > 0 && (
              <section>
                <h3 style={sectionHeadingStyle}>Hall of Famers Tied to Franchise</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {franchise.hallOfFamers.slice(0, 10).map((p) => (
                    <button
                      key={`hof-${p.id}`}
                      onClick={() => onPlayerSelect && onPlayerSelect(p.id)}
                      style={{
                        border: "1px solid var(--hairline)",
                        background: "var(--surface-strong)",
                        borderRadius: "var(--radius-pill)",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: "var(--text-xs)",
                        color: "var(--text)",
                      }}
                    >
                      🏛️ {p.name} ({p.pos})
                    </button>
                  ))}
                </div>
              </section>
            )}

            {franchise.franchiseLeaders && (
              <section>
                <h3 style={sectionHeadingStyle}>Franchise Leaders</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-2)" }}>
                  {Object.entries(franchise.franchiseLeaders).map(([key, rows]) => (
                    <div key={key} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        {rows?.[0]?.label ?? key}
                      </div>
                      {(rows ?? []).slice(0, 3).map((row) => (
                        <div
                          key={`${key}-${row.playerId}`}
                          onClick={() => onPlayerSelect && onPlayerSelect(row.playerId)}
                          style={{ marginTop: 6, fontSize: "var(--text-sm)", cursor: "pointer" }}
                        >
                          <strong>{row.name}</strong> ({row.pos}) · {safeRound(toFiniteNumber(row.value, 0), 0).toLocaleString()}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Top current players ── */}
            {players.length > 0 && (
              <section>
                <h3
                  style={sectionHeadingStyle}
                >
                  Current Roster (Top 12)
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(170px, 1fr))",
                    gap: "var(--space-2)",
                  }}
                >
                  {players.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => onPlayerSelect && onPlayerSelect(p.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        padding: "var(--space-2) var(--space-3)",
                        background: "var(--surface-strong)",
                        borderRadius: "var(--radius-md)",
                        cursor: onPlayerSelect ? "pointer" : "default",
                        border: "1px solid var(--hairline)",
                        minHeight: 46,
                      }}
                    >
                      <Badge
                        variant="outline"
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                          background: "var(--surface-sunken)",
                          borderRadius: 4,
                          padding: "2px 5px",
                          color: "var(--text-muted)",
                          minWidth: 28,
                          textAlign: "center",
                        }}
                      >
                        {p.pos}
                      </Badge>
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          fontWeight: 500,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                      <Badge
                        variant="outline"
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                          color: ovrColor(p.ovr),
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {p.ovr}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!loading && !team && (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            Team data not available.
          </div>
        )}
      </div>
    </div>
    {showRelocate && team && (
        <RelocateModal team={team} actions={actions} onClose={() => { setShowRelocate(false); onClose(); }} />
    )}
    </>
  );
}
