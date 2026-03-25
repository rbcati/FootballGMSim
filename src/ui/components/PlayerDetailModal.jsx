/**
 * PlayerDetailModal.jsx — Premium player detail overlay with radar chart,
 * contract info, personality flags, injury history, and comparison mode.
 * Uses stadium-theme glassmorphism, position badges, animated progression bars.
 *
 * Props:
 *  - player: player object
 *  - onClose: () => void
 *  - comparePlayer: optional second player for radar overlay
 *  - onCompareSelect: (playerId) => void — open roster picker for comparison
 *  - actions: worker actions (for release, extend, etc.)
 *  - league: league data for cap context
 */

import React, { useState, useMemo } from "react";
import PlayerRadarChart, { getPlayerRadarAttributes } from "./PlayerRadarChart.jsx";
import { OvrPill } from "./LeagueDashboard.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

// Map player ratings to labeled categories for display
function getRatingCategories(player) {
  const r = player.ratings || player;
  const pos = player.pos || player.position;

  const all = [];
  const safeGet = (key) => {
    const val = r[key] ?? player[key];
    return val !== undefined ? Math.round(Number(val) || 0) : null;
  };

  // Core physical
  const physical = [
    { label: "Speed", value: safeGet("speed") },
    { label: "Acceleration", value: safeGet("acceleration") },
    { label: "Agility", value: safeGet("agility") },
    { label: "Durability", value: safeGet("durability") },
  ].filter(x => x.value !== null);

  // Position-specific
  const skill = [];
  if (["QB"].includes(pos)) {
    skill.push(
      { label: "Throw Power", value: safeGet("throwPower") },
      { label: "Throw Accuracy", value: safeGet("throwAccuracy") },
      { label: "Awareness", value: safeGet("awareness") },
      { label: "Intelligence", value: safeGet("intelligence") },
    );
  }
  if (["RB"].includes(pos)) {
    skill.push(
      { label: "Trucking", value: safeGet("trucking") },
      { label: "Juking", value: safeGet("juking") },
      { label: "Catching", value: safeGet("catching") },
    );
  }
  if (["WR", "TE"].includes(pos)) {
    skill.push(
      { label: "Catching", value: safeGet("catching") },
      { label: "Catch in Traffic", value: safeGet("catchInTraffic") },
    );
  }
  if (["TE", "OL"].includes(pos)) {
    skill.push(
      { label: "Run Block", value: safeGet("runBlock") },
      { label: "Pass Block", value: safeGet("passBlock") },
    );
  }
  if (["DL"].includes(pos)) {
    skill.push(
      { label: "Pass Rush Spd", value: safeGet("passRushSpeed") },
      { label: "Pass Rush Pwr", value: safeGet("passRushPower") },
      { label: "Run Stop", value: safeGet("runStop") },
    );
  }
  if (["LB"].includes(pos)) {
    skill.push(
      { label: "Coverage", value: safeGet("coverage") },
      { label: "Run Stop", value: safeGet("runStop") },
      { label: "Pass Rush Spd", value: safeGet("passRushSpeed") },
    );
  }
  if (["CB", "S"].includes(pos)) {
    skill.push(
      { label: "Coverage", value: safeGet("coverage") },
      { label: "Run Stop", value: safeGet("runStop") },
    );
  }
  if (["K", "P"].includes(pos)) {
    skill.push(
      { label: "Kick Power", value: safeGet("kickPower") },
      { label: "Kick Accuracy", value: safeGet("kickAccuracy") },
    );
  }

  skill.push({ label: "Awareness", value: safeGet("awareness") });

  return {
    physical: physical.filter(x => x.value !== null),
    skill: skill.filter(x => x.value !== null),
  };
}

function RatingBar({ label, value, max = 99 }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 90 ? "#FFD700" :
                value >= 80 ? "var(--success)" :
                value >= 70 ? "var(--accent)" :
                value >= 60 ? "var(--warning)" : "var(--danger)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--space-3)",
      padding: "var(--space-1) 0",
    }}>
      <span style={{
        width: 90, fontSize: "var(--text-xs)", fontWeight: 600,
        color: "var(--text-muted)", flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: "var(--hairline)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 3, background: color,
          width: `${pct}%`,
          transition: "width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }} />
      </div>
      <span style={{
        width: 28, fontSize: "var(--text-xs)", fontWeight: 800,
        color, textAlign: "right", fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

function StatLine({ label, value, sub }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--text-base)", fontWeight: 800,
        color: "var(--text)", fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: "var(--text-subtle)" }}>{sub}</div>}
    </div>
  );
}

export default function PlayerDetailModal({
  player,
  onClose,
  comparePlayer,
  onCompareSelect,
  actions,
  league,
}) {
  const [activeSection, setActiveSection] = useState("overview");

  const pos = player ? (player.pos || player.position) : null;
  const posColor = POS_COLORS[pos] || "#9ca3af";
  const radarAttrs = player
    ? getPlayerRadarAttributes({ ...player, ...(player.ratings || {}) })
    : null;
  const compareAttrs = comparePlayer
    ? getPlayerRadarAttributes({ ...comparePlayer, ...(comparePlayer.ratings || {}) })
    : null;

  const ratings = player ? getRatingCategories(player) : { physical: [], skill: [] };
  const salary = player ? (player.baseAnnual || player.contract?.baseAnnual || 0) : 0;
  const yearsLeft = player ? (player.years ?? player.contract?.years ?? 0) : 0;
  const isInjured = player ? (player.injuryWeeksRemaining || 0) > 0 : false;

  const seasonStats = player?.stats?.season || {};
  const careerStats = player?.stats?.career || {};

  const devLabel = player?.devTrait === "X-Factor" ? "X-Factor" :
                   player?.devTrait === "Superstar" ? "Superstar" :
                   player?.devTrait === "Star" ? "Star" : "Normal";

  const sections = ["overview", "ratings", "stats", "contract"];

  return (
    <Dialog open={!!player} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="card-premium fade-in-up"
        style={{
          width: "100%",
          maxWidth: 520,
          padding: 0,
          borderTop: `3px solid ${posColor}`,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {player && (
          <>
            <DialogHeader style={{
              padding: "var(--space-5) var(--space-5) var(--space-4)",
              background: `linear-gradient(180deg, ${posColor}10, transparent)`,
              flexShrink: 0,
            }}>
              {/* Close button */}
              <Button
                variant="ghost"
                onClick={onClose}
                style={{
                  position: "absolute", top: 12, right: 12,
                  background: "var(--surface)", border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-md)", width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--text-muted)", fontSize: 16,
                  padding: 0,
                }}
              >
                x
              </Button>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                {/* Avatar circle */}
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: `${posColor}22`, border: `3px solid ${posColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 20, color: posColor,
                  flexShrink: 0,
                }}>
                  {player.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <DialogTitle style={{
                    fontSize: "var(--text-lg)", fontWeight: 900, color: "var(--text)",
                    letterSpacing: "-0.5px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {player.name}
                  </DialogTitle>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "var(--space-2)",
                    marginTop: 4,
                  }}>
                    <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
                    <OvrPill ovr={player.ovr || 50} size="lg" />
                    {player.devTrait && player.devTrait !== "Normal" && (
                      <Badge
                        style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          background: player.devTrait === "X-Factor" ? "rgba(255,215,0,0.15)" : "rgba(168,85,247,0.15)",
                          color: player.devTrait === "X-Factor" ? "#FFD700" : "#a855f7",
                          border: "none",
                        }}
                      >
                        {devLabel}
                      </Badge>
                    )}
                    {isInjured && (
                      <Badge
                        style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(255,69,58,0.15)", color: "var(--danger)",
                          border: "none",
                        }}
                      >
                        INJ {player.injuryWeeksRemaining}w
                      </Badge>
                    )}
                  </div>
                  <div style={{
                    display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)",
                  }}>
                    <StatLine label="Age" value={player.age} />
                    <StatLine label="POT" value={player.potential || "—"} />
                    <StatLine label="Morale" value={player.morale ?? "—"} />
                    <StatLine label="College" value={player.college?.slice(0, 8) || "—"} />
                  </div>
                </div>
              </div>

              {/* Personality traits */}
              {player.personality?.traits?.length > 0 && (
                <div style={{
                  display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)",
                  flexWrap: "wrap",
                }}>
                  {player.personality.traits.map(t => (
                    <Badge key={t} style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--surface-strong)", color: "var(--text-muted)",
                      border: "1px solid var(--hairline)",
                    }}>
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </DialogHeader>

            {/* ── Section tabs ── */}
            <div className="division-tabs" style={{
              padding: "0 var(--space-4)", borderBottom: "1px solid var(--hairline)",
              marginBottom: 0,
              flexShrink: 0,
            }}>
              {sections.map(s => (
                <Button
                  key={s}
                  variant="ghost"
                  className={`division-tab${activeSection === s ? " active" : ""}`}
                  onClick={() => setActiveSection(s)}
                  style={{ textTransform: "capitalize" }}
                >
                  {s}
                </Button>
              ))}
            </div>

            {/* ── Section Content ── */}
            <ScrollArea className="max-h-[70vh]" style={{ flex: 1 }}>
              <div style={{ padding: "var(--space-4) var(--space-5) var(--space-5)" }}>

                {activeSection === "overview" && (
                  <div className="fade-in">
                    {/* Radar Chart */}
                    <PlayerRadarChart
                      attributes={radarAttrs}
                      size={240}
                      color={posColor}
                      compareAttributes={compareAttrs}
                      compareColor="#FF9F0A"
                    />

                    {comparePlayer && (
                      <div style={{
                        textAlign: "center", fontSize: "var(--text-xs)",
                        color: "var(--text-muted)", marginTop: "var(--space-2)",
                      }}>
                        Comparing with: <strong style={{ color: "#FF9F0A" }}>{comparePlayer.name}</strong>
                      </div>
                    )}

                    {onCompareSelect && (
                      <Button
                        variant="ghost"
                        className="btn-premium"
                        onClick={() => onCompareSelect(player.id)}
                        style={{
                          width: "100%", marginTop: "var(--space-3)",
                          background: "var(--surface-strong)", color: "var(--text-muted)",
                          border: "1px solid var(--hairline)",
                        }}
                      >
                        {comparePlayer ? "Change Comparison" : "Compare Player"}
                      </Button>
                    )}

                    {/* Combine stats */}
                    {player.combineStats && (
                      <div style={{
                        marginTop: "var(--space-4)", padding: "var(--space-3)",
                        background: "var(--bg)", borderRadius: "var(--radius-md)",
                        fontSize: "var(--text-xs)", color: "var(--text-muted)",
                        fontFamily: "monospace", textAlign: "center",
                      }}>
                        {player.combineStats}
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "ratings" && (
                  <div className="fade-in">
                    {ratings.physical.length > 0 && (
                      <div style={{ marginBottom: "var(--space-4)" }}>
                        <div style={{
                          fontSize: "var(--text-xs)", fontWeight: 700,
                          color: "var(--text-muted)", textTransform: "uppercase",
                          letterSpacing: "0.5px", marginBottom: "var(--space-2)",
                        }}>
                          Physical
                        </div>
                        {ratings.physical.map(r => (
                          <RatingBar key={r.label} label={r.label} value={r.value} />
                        ))}
                      </div>
                    )}
                    {ratings.skill.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: "var(--text-xs)", fontWeight: 700,
                          color: "var(--text-muted)", textTransform: "uppercase",
                          letterSpacing: "0.5px", marginBottom: "var(--space-2)",
                        }}>
                          Position Skills
                        </div>
                        {ratings.skill.map(r => (
                          <RatingBar key={r.label} label={r.label} value={r.value} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "stats" && (
                  <div className="fade-in">
                    <div style={{
                      fontSize: "var(--text-xs)", fontWeight: 700,
                      color: "var(--text-muted)", textTransform: "uppercase",
                      letterSpacing: "0.5px", marginBottom: "var(--space-3)",
                    }}>
                      Season Stats
                    </div>
                    <StatsGrid pos={pos} stats={seasonStats} label="Season" />

                    {player.careerStats?.length > 0 && (
                      <div style={{ marginTop: "var(--space-5)" }}>
                        <div style={{
                          fontSize: "var(--text-xs)", fontWeight: 700,
                          color: "var(--text-muted)", textTransform: "uppercase",
                          letterSpacing: "0.5px", marginBottom: "var(--space-3)",
                        }}>
                          Career Log
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <Table style={{
                            width: "100%", fontSize: "var(--text-xs)",
                          }}>
                            <TableHeader>
                              <TableRow>
                                <TableHead style={thStyle}>YR</TableHead>
                                <TableHead style={thStyle}>GP</TableHead>
                                <TableHead style={thStyle}>OVR</TableHead>
                                {pos === "QB" && <><TableHead style={thStyle}>YDS</TableHead><TableHead style={thStyle}>TD</TableHead><TableHead style={thStyle}>INT</TableHead></>}
                                {pos === "RB" && <><TableHead style={thStyle}>YDS</TableHead><TableHead style={thStyle}>TD</TableHead></>}
                                {["WR", "TE"].includes(pos) && <><TableHead style={thStyle}>REC</TableHead><TableHead style={thStyle}>YDS</TableHead><TableHead style={thStyle}>TD</TableHead></>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {player.careerStats.map((cs, i) => (
                                <TableRow key={i}>
                                  <TableCell style={tdStyle}>{cs.season || i + 1}</TableCell>
                                  <TableCell style={tdStyle}>{cs.gamesPlayed || 0}</TableCell>
                                  <TableCell style={tdStyle}>{cs.ovr || "—"}</TableCell>
                                  {pos === "QB" && <><TableCell style={tdStyle}>{cs.passYds || 0}</TableCell><TableCell style={tdStyle}>{cs.passTDs || 0}</TableCell><TableCell style={tdStyle}>{cs.ints || 0}</TableCell></>}
                                  {pos === "RB" && <><TableCell style={tdStyle}>{cs.rushYds || 0}</TableCell><TableCell style={tdStyle}>{cs.rushTDs || 0}</TableCell></>}
                                  {["WR", "TE"].includes(pos) && <><TableCell style={tdStyle}>{cs.receptions || 0}</TableCell><TableCell style={tdStyle}>{cs.recYds || 0}</TableCell><TableCell style={tdStyle}>{cs.recTDs || 0}</TableCell></>}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "contract" && (
                  <div className="fade-in">
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: "var(--space-3)", marginBottom: "var(--space-4)",
                    }}>
                      <ContractStat label="Base Annual" value={`$${salary.toFixed(1)}M`} />
                      <ContractStat label="Years Left" value={`${yearsLeft}`}
                        color={yearsLeft <= 1 ? "var(--warning)" : "var(--text)"} />
                      <ContractStat label="Signing Bonus"
                        value={`$${(player.signingBonus || 0).toFixed(1)}M`} />
                      <ContractStat label="Guaranteed"
                        value={`${Math.round((player.guaranteedPct || 0.5) * 100)}%`} />
                    </div>

                    {/* Scout grade */}
                    {player.scoutStatus?.grade && (
                      <div style={{
                        padding: "var(--space-3)", background: "var(--bg)",
                        borderRadius: "var(--radius-md)", textAlign: "center",
                        marginBottom: "var(--space-3)",
                      }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
                          Scout Grade
                        </div>
                        <div style={{ fontWeight: 800, color: "var(--accent)" }}>
                          {player.scoutStatus.grade}
                        </div>
                      </div>
                    )}

                    {/* XP / Progression */}
                    {player.progression && (
                      <div style={{
                        padding: "var(--space-3)", background: "var(--bg)",
                        borderRadius: "var(--radius-md)",
                      }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                          Progression
                        </div>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          fontSize: "var(--text-xs)", color: "var(--text)",
                          marginBottom: 4,
                        }}>
                          <span>XP: {player.progression.xp}/1000</span>
                          <span>SP: {player.progression.skillPoints}</span>
                        </div>
                        <div style={{
                          height: 6, borderRadius: 3,
                          background: "var(--hairline)", overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            background: "var(--accent)",
                            width: `${Math.min(100, (player.progression.xp / 1000) * 100)}%`,
                            transition: "width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)",
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──

function StatsGrid({ pos, stats, label }) {
  const entries = [];

  if (["QB"].includes(pos)) {
    entries.push(
      { label: "Pass Yds", value: stats.passYd || 0 },
      { label: "Pass TD", value: stats.passTD || 0 },
      { label: "INT", value: stats.interceptions || 0 },
      { label: "Comp %", value: stats.passAtt > 0 ? `${((stats.passComp / stats.passAtt) * 100).toFixed(1)}` : "—" },
      { label: "Sacks", value: stats.sacks || 0 },
      { label: "Rush Yds", value: stats.rushYd || 0 },
    );
  } else if (["RB"].includes(pos)) {
    entries.push(
      { label: "Rush Yds", value: stats.rushYd || 0 },
      { label: "Rush TD", value: stats.rushTD || 0 },
      { label: "Att", value: stats.rushAtt || 0 },
      { label: "Rec Yds", value: stats.recYd || 0 },
      { label: "Fumbles", value: stats.fumbles || 0 },
    );
  } else if (["WR", "TE"].includes(pos)) {
    entries.push(
      { label: "Rec Yds", value: stats.recYd || 0 },
      { label: "Rec TD", value: stats.recTD || 0 },
      { label: "Rec", value: stats.receptions || 0 },
      { label: "Targets", value: stats.targets || 0 },
    );
  } else if (["DL", "LB", "CB", "S"].includes(pos)) {
    entries.push(
      { label: "Tackles", value: stats.tackles || 0 },
      { label: "Sacks", value: stats.sacks || 0 },
      { label: "TFL", value: stats.tacklesForLoss || 0 },
      { label: "FF", value: stats.forcedFumbles || 0 },
      { label: "PD", value: stats.passesDefended || 0 },
    );
  } else if (["K"].includes(pos)) {
    entries.push(
      { label: "FG", value: `${stats.fgMade || 0}/${stats.fgAttempts || 0}` },
      { label: "XP", value: `${stats.xpMade || 0}/${stats.xpAttempts || 0}` },
    );
  }

  entries.push({ label: "Games", value: stats.gamesPlayed || 0 });

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-2)",
    }}>
      {entries.map(e => (
        <div key={e.label} style={{
          background: "var(--bg)", borderRadius: "var(--radius-md)",
          padding: "var(--space-2)", textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: "var(--text-subtle)", marginBottom: 2 }}>
            {e.label}
          </div>
          <div style={{
            fontSize: "var(--text-sm)", fontWeight: 800,
            color: "var(--text)", fontVariantNumeric: "tabular-nums",
          }}>
            {e.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractStat({ label, value, color = "var(--text)" }) {
  return (
    <div style={{
      background: "var(--bg)", borderRadius: "var(--radius-md)",
      padding: "var(--space-3)", textAlign: "center",
    }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--text-base)", fontWeight: 800, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

const thStyle = {
  padding: "4px 6px", textAlign: "center", fontWeight: 700,
  color: "var(--text-muted)", borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "3px 6px", textAlign: "center",
  color: "var(--text)", fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid var(--hairline)",
};
