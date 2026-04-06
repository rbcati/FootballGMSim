/**
 * TradeFinder.jsx — Basic trade finder with team browser,
 * value comparison, and stadium-theme premium styling.
 *
 * Props:
 *  - league: league view-model
 *  - actions: worker actions
 *  - onPlayerSelect: (playerId) => void
 */

import React, { useState, useMemo, useCallback } from "react";
import { OvrPill } from "./LeagueDashboard.jsx";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function PlayerChip({ player, selected, onClick }) {
  const pos = player.pos || player.position;
  const posColor = POS_COLORS[pos] || "#9ca3af";

  return (
    <div
      onClick={onClick}
      className={`hover-lift ${selected ? "pulse-glow" : ""}`}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        background: selected ? "var(--accent-muted)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--hairline)"}`,
        borderRadius: "var(--radius-md)",
        cursor: "pointer", transition: "all 0.15s ease",
        borderLeft: `3px solid ${posColor}`,
      }}
    >
      <span className={`pos-badge pos-${pos?.toLowerCase()}`} style={{ fontSize: 9 }}>{pos}</span>
      <span style={{
        fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text)",
        flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {player.name}
      </span>
      <OvrPill ovr={player.ovr || 50} />
      <span style={{ fontSize: 9, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        ${(player.baseAnnual || 0).toFixed(1)}M
      </span>
    </div>
  );
}

function TradeValueBar({ label, value, maxValue, color }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", width: 40, textAlign: "right" }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 8, borderRadius: 4,
        background: "var(--hairline)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 4, background: color,
          width: `${pct}%`,
          transition: "width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }} />
      </div>
      <span style={{
        fontSize: "var(--text-xs)", fontWeight: 700, color,
        width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums",
      }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

export default function TradeFinder({ league, actions, onPlayerSelect }) {
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [userOffering, setUserOffering] = useState([]); // player IDs from user team
  const [partnerOffering, setPartnerOffering] = useState([]); // player IDs from partner team
  const [posFilter, setPosFilter] = useState("ALL");

  const teams = league?.teams || [];
  const userTeamId = league?.userTeamId;
  const userTeam = teams.find(t => t.id === userTeamId);
  const partnerTeam = selectedPartner != null ? teams.find(t => t.id === selectedPartner) : null;

  const otherTeams = useMemo(() =>
    teams.filter(t => t.id !== userTeamId).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)),
    [teams, userTeamId]
  );

  const userRoster = useMemo(() => {
    let roster = [...(userTeam?.roster || [])];
    if (posFilter !== "ALL") {
      roster = roster.filter(p => (p.pos || p.position) === posFilter);
    }
    return roster.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  }, [userTeam?.roster, posFilter]);

  const partnerRoster = useMemo(() => {
    let roster = [...(partnerTeam?.roster || [])];
    if (posFilter !== "ALL") {
      roster = roster.filter(p => (p.pos || p.position) === posFilter);
    }
    return roster.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  }, [partnerTeam?.roster, posFilter]);

  // Simple trade value calculation
  const calcValue = useCallback((playerIds, roster) => {
    return playerIds.reduce((sum, id) => {
      const p = roster?.find(r => r.id === id);
      if (!p) return sum;
      const ovr = p.ovr || 50;
      const age = p.age || 25;
      const ageFactor = age < 27 ? 1.15 : age < 30 ? 1.0 : age < 33 ? 0.8 : 0.6;
      return sum + (ovr * ageFactor);
    }, 0);
  }, []);

  const userValue = calcValue(userOffering, userTeam?.roster);
  const partnerValue = calcValue(partnerOffering, partnerTeam?.roster);
  const maxValue = Math.max(userValue, partnerValue, 1);
  const tradeDelta = userValue - partnerValue;
  const fairnessTone = Math.abs(tradeDelta) < 8 ? "#34C759" : Math.abs(tradeDelta) < 20 ? "#FF9F0A" : "#FF453A";

  const toggleUserPlayer = (id) => {
    setUserOffering(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const togglePartnerPlayer = (id) => {
    setPartnerOffering(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handlePropose = useCallback(() => {
    if (actions?.proposeTrade && userOffering.length > 0 && partnerOffering.length > 0) {
      actions.proposeTrade({
        teamId: selectedPartner,
        offering: userOffering,
        requesting: partnerOffering,
      });
    }
  }, [actions, selectedPartner, userOffering, partnerOffering]);

  const posFilters = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];

  return (
    <div className="fade-in">
      {/* ── Team Selector ── */}
      {!selectedPartner && (
        <div>
          <div style={{
            fontSize: "var(--text-sm)", fontWeight: 800, color: "var(--text)",
            marginBottom: "var(--space-3)",
          }}>
            Select Trade Partner
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-2)",
          }}>
            {otherTeams.map(team => (
              <div
                key={team.id}
                className="card-premium hover-lift"
                onClick={() => {
                  setSelectedPartner(team.id);
                  setUserOffering([]);
                  setPartnerOffering([]);
                }}
                style={{
                  padding: "var(--space-3)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "var(--space-2)",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: `${teamColor(team.abbr)}22`,
                  border: `2px solid ${teamColor(team.abbr)}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 10, color: teamColor(team.abbr),
                  flexShrink: 0,
                }}>
                  {team.abbr?.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {team.abbr}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                    {team.wins || 0}-{team.losses || 0} · OVR {team.ovr || "?"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trade Interface ── */}
      {selectedPartner && (
        <div>
          {/* Back + partner header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}>
            <button
              className="btn-premium"
              onClick={() => setSelectedPartner(null)}
              style={{
                background: "var(--surface-strong)", color: "var(--text-muted)",
                border: "1px solid var(--hairline)", minHeight: 36,
              }}
            >
              Back
            </button>
            <div style={{
              fontSize: "var(--text-sm)", fontWeight: 800, color: "var(--text)",
            }}>
              Trade with {partnerTeam?.name || partnerTeam?.abbr}
            </div>
          </div>

          {/* Position filter */}
          <div className="division-tabs" style={{ marginBottom: "var(--space-3)" }}>
            {posFilters.map(p => (
              <button
                key={p}
                className={`division-tab${posFilter === p ? " active" : ""}`}
                onClick={() => setPosFilter(p)}
                style={{ fontSize: 10 }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Trade value comparison */}
          <div className="card-premium" style={{
            padding: "var(--space-3) var(--space-4)",
            marginBottom: "var(--space-4)",
          }}>
            <div style={{
              fontSize: "var(--text-xs)", fontWeight: 700,
              color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "0.5px", marginBottom: "var(--space-2)",
            }}>
              Trade Value
            </div>
            <TradeValueBar
              label={userTeam?.abbr || "YOU"}
              value={userValue}
              maxValue={maxValue}
              color="var(--accent)"
            />
            <div style={{ height: 4 }} />
            <TradeValueBar
              label={partnerTeam?.abbr || "THEM"}
              value={partnerValue}
              maxValue={maxValue}
              color="var(--warning)"
            />
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 4 }}>
                <span>Balance Meter</span>
                <span style={{ color: fairnessTone, fontWeight: 800 }}>
                  {tradeDelta > 0 ? `You +${Math.round(tradeDelta)}` : `Them +${Math.round(Math.abs(tradeDelta))}`}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "linear-gradient(90deg,#34C759 0%, #FF9F0A 50%, #FF453A 100%)", opacity: 0.35 }} />
            </div>

            {userOffering.length > 0 && partnerOffering.length > 0 && (
              <div style={{
                marginTop: "var(--space-3)", textAlign: "center",
              }}>
                <span style={{
                  fontSize: "var(--text-xs)", fontWeight: 700,
                  color: fairnessTone,
                }}>
                  {Math.abs(userValue - partnerValue) < 10
                    ? "Fair Trade"
                    : userValue > partnerValue
                      ? "You're overpaying"
                      : "You're getting a deal"
                  }
                </span>
              </div>
            )}
          </div>

          {/* Side by side rosters */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-3)",
          }}>
            {/* User side */}
            <div>
              <div style={{
                fontSize: "var(--text-xs)", fontWeight: 800,
                color: "var(--accent)", marginBottom: "var(--space-2)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Your Players ({userOffering.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {userRoster.slice(0, 30).map(p => (
                  <PlayerChip
                    key={p.id}
                    player={p}
                    selected={userOffering.includes(p.id)}
                    onClick={() => toggleUserPlayer(p.id)}
                  />
                ))}
              </div>
            </div>

            {/* Partner side */}
            <div>
              <div style={{
                fontSize: "var(--text-xs)", fontWeight: 800,
                color: "var(--warning)", marginBottom: "var(--space-2)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Their Players ({partnerOffering.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {partnerRoster.slice(0, 30).map(p => (
                  <PlayerChip
                    key={p.id}
                    player={p}
                    selected={partnerOffering.includes(p.id)}
                    onClick={() => togglePartnerPlayer(p.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Propose button */}
          {userOffering.length > 0 && partnerOffering.length > 0 && (
            <button
              className="btn-premium btn-primary-premium"
              onClick={handlePropose}
              style={{
                width: "100%", marginTop: "var(--space-4)",
                fontSize: "var(--text-sm)",
              }}
            >
              Propose Trade ({userOffering.length} for {partnerOffering.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
