/**
 * TeamProfile.jsx
 *
 * Modal: franchise history, all-time record, titles, and current top roster.
 * Opens when a team name is clicked in Standings or other views.
 */
import React, { useEffect, useState } from "react";
import RelocateModal from "./RelocateModal.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export default function TeamProfile({ teamId, onClose, onPlayerSelect, actions }) {
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
          width: "92%",
          maxWidth: 820,
          maxHeight: "90vh",
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
            padding: "var(--space-4) var(--space-5)",
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
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: `${color}22`,
                  border: `3px solid ${color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 22,
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
                    fontSize: "calc(var(--text-2xl) - 1px)",
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
                  {team.conf} · {team.div} Division · OVR{" "}
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
                  This Season: {team.wins}-{team.losses}
                  {team.ties > 0 ? `-${team.ties}` : ""} · {team.ptsFor} PF /{" "}
                  {team.ptsAgainst} PA
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
              fontSize: "1.5rem",
              lineHeight: 1,
              color: "var(--text-muted)",
              padding: "var(--space-1)",
              marginLeft: "var(--space-2)",
              minWidth: 34,
              minHeight: 34,
            }}
          >
            ×
          </Button>
        </div>

        {/* ── Body ── */}
        {!loading && team && franchise && (
          <div
            style={{
              padding: "var(--space-4) var(--space-5) var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-5)",
            }}
          >
            {/* ── Franchise Stats ── */}
            <section>
              <h3
                style={sectionHeadingStyle}
              >
                Franchise Records
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <StatBox
                  label="All-Time Record"
                  value={`${franchise.allTimeWins}-${franchise.allTimeLosses}`}
                  sub={winPct(
                    franchise.allTimeWins,
                    franchise.allTimeLosses,
                    franchise.allTimeTies,
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
                  value={`$${(team.capTotal || 255).toFixed(0)}M`}
                />
                <StatBox
                  label="Cap Used"
                  value={`$${(team.capUsed || 0).toFixed(1)}M`}
                />
                <StatBox
                  label="Cap Space"
                  value={`$${(team.capRoom || 0).toFixed(1)}M`}
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
                    style={{ width: "100%", minWidth: 420 }}
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
                            {row.wins}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>{row.losses}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{row.ties}</TableCell>
                          <TableCell style={{ textAlign: "center", fontWeight: 600 }}>
                            {winPct(row.wins, row.losses, row.ties)}
                          </TableCell>
                          <TableCell style={{ textAlign: "center" }}>{row.pf}</TableCell>
                          <TableCell style={{ textAlign: "center" }}>{row.pa}</TableCell>
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
                      "repeat(auto-fill, minmax(200px, 1fr))",
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
                        borderRadius: "var(--radius-sm)",
                        cursor: onPlayerSelect ? "pointer" : "default",
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
