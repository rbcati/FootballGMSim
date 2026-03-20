/**
 * FreeAgencyHub.jsx — Premium free agency bidding screen.
 * Stadium-theme glassmorphism cards, position filters, bidding UI,
 * and live market ticker.
 *
 * Props:
 *  - league: league view-model
 *  - actions: worker actions
 *  - onPlayerSelect: (playerId) => void
 */

import React, { useState, useMemo, useCallback } from "react";
import { OvrPill } from "./LeagueDashboard.jsx";
import PlayerRadarChart, { getPlayerRadarAttributes } from "./PlayerRadarChart.jsx";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];
const SORT_KEYS = [
  { key: "ovr", label: "OVR" },
  { key: "age", label: "Age" },
  { key: "salary", label: "Ask" },
];

function BiddingModal({ player, onBid, onClose, capRoom }) {
  const [years, setYears] = useState(2);
  const [annual, setAnnual] = useState(
    Math.max(0.75, Math.round((player.baseAnnual || player.askingPrice || 2) * 10) / 10)
  );

  const pos = player.pos || player.position;
  const posColor = POS_COLORS[pos] || "#9ca3af";
  const radarAttrs = getPlayerRadarAttributes({ ...player, ...(player.ratings || {}) });

  const totalCost = annual * years;
  const canAfford = totalCost <= (capRoom || 999);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9100,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card-premium fade-in-scale"
        style={{
          width: "100%", maxWidth: 400, padding: "var(--space-5)",
          borderTop: `3px solid ${posColor}`,
        }}
      >
        {/* Player header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--space-3)",
          marginBottom: "var(--space-4)",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: `${posColor}22`, border: `2px solid ${posColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 14, color: posColor, flexShrink: 0,
          }}>
            {player.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "var(--text-base)", color: "var(--text)" }}>
              {player.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 2 }}>
              <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
              <OvrPill ovr={player.ovr || 50} />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Age {player.age}
              </span>
            </div>
          </div>
        </div>

        {/* Mini radar */}
        <PlayerRadarChart attributes={radarAttrs} size={160} color={posColor} />

        {/* Bidding controls */}
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{
            fontSize: "var(--text-xs)", fontWeight: 700,
            color: "var(--text-muted)", textTransform: "uppercase",
            letterSpacing: "0.5px", marginBottom: "var(--space-3)",
          }}>
            Your Offer
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Years
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <button
                  className="btn-premium"
                  onClick={() => setYears(y => Math.max(1, y - 1))}
                  style={{ width: 32, height: 32, background: "var(--surface-strong)", color: "var(--text)" }}
                >-</button>
                <span style={{ fontSize: "var(--text-lg)", fontWeight: 900, color: "var(--text)", minWidth: 24, textAlign: "center" }}>
                  {years}
                </span>
                <button
                  className="btn-premium"
                  onClick={() => setYears(y => Math.min(5, y + 1))}
                  style={{ width: 32, height: 32, background: "var(--surface-strong)", color: "var(--text)" }}
                >+</button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Annual ($M)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <button
                  className="btn-premium"
                  onClick={() => setAnnual(a => Math.max(0.5, Math.round((a - 0.5) * 10) / 10))}
                  style={{ width: 32, height: 32, background: "var(--surface-strong)", color: "var(--text)" }}
                >-</button>
                <span style={{
                  fontSize: "var(--text-lg)", fontWeight: 900, color: "var(--text)",
                  minWidth: 48, textAlign: "center", fontVariantNumeric: "tabular-nums",
                }}>
                  {annual.toFixed(1)}
                </span>
                <button
                  className="btn-premium"
                  onClick={() => setAnnual(a => Math.round((a + 0.5) * 10) / 10)}
                  style={{ width: 32, height: 32, background: "var(--surface-strong)", color: "var(--text)" }}
                >+</button>
              </div>
            </div>
          </div>

          {/* Total and cap impact */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--bg)", borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)", color: "var(--text-muted)",
          }}>
            <span>Total: <strong style={{ color: "var(--text)" }}>${totalCost.toFixed(1)}M</strong></span>
            <span>Cap Room: <strong style={{ color: canAfford ? "var(--success)" : "var(--danger)" }}>${(capRoom || 0).toFixed(1)}M</strong></span>
          </div>

          {/* Action buttons */}
          <div style={{
            display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)",
          }}>
            <button
              className="btn-premium"
              onClick={onClose}
              style={{
                flex: 1, background: "var(--surface-strong)",
                color: "var(--text-muted)", border: "1px solid var(--hairline)",
              }}
            >
              Cancel
            </button>
            <button
              className="btn-premium btn-primary-premium"
              onClick={() => onBid({ playerId: player.id, years, annual })}
              disabled={!canAfford}
              style={{
                flex: 2, opacity: canAfford ? 1 : 0.5,
              }}
            >
              Make Offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FreeAgencyHub({ league, actions, onPlayerSelect }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [search, setSearch] = useState("");
  const [biddingPlayer, setBiddingPlayer] = useState(null);

  const freeAgents = league?.freeAgents || [];
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const capRoom = userTeam?.capRoom ?? 0;

  const filtered = useMemo(() => {
    let players = [...freeAgents];

    if (posFilter !== "ALL") {
      players = players.filter(p => (p.pos || p.position) === posFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      players = players.filter(p => p.name?.toLowerCase().includes(q));
    }

    players.sort((a, b) => {
      switch (sortKey) {
        case "ovr": return (b.ovr || 0) - (a.ovr || 0);
        case "age": return (a.age || 0) - (b.age || 0);
        case "salary": return (b.baseAnnual || 0) - (a.baseAnnual || 0);
        default: return 0;
      }
    });

    return players;
  }, [freeAgents, posFilter, sortKey, search]);

  const handleBid = useCallback((offer) => {
    if (actions?.signFreeAgent) {
      actions.signFreeAgent(offer.playerId, offer.years, offer.annual);
    }
    setBiddingPlayer(null);
  }, [actions]);

  const topFAs = useMemo(() =>
    [...freeAgents].sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 5),
    [freeAgents]
  );

  return (
    <div className="fade-in">
      {/* ── Market Ticker ── */}
      {topFAs.length > 0 && (
        <div className="news-ticker" style={{ marginBottom: "var(--space-4)", borderRadius: "var(--radius-md)" }}>
          <div className="news-ticker-content">
            {topFAs.concat(topFAs).map((fa, i) => (
              <div key={`${fa.id}-${i}`} className="news-ticker-item">
                <span className="news-ticker-dot" />
                <span style={{ fontWeight: 700 }}>{fa.name}</span>
                <span className={`pos-badge pos-${(fa.pos || "").toLowerCase()}`} style={{ fontSize: 9 }}>
                  {fa.pos}
                </span>
                <span>{fa.ovr} OVR</span>
                <span style={{ color: "var(--success)" }}>${(fa.baseAnnual || 0).toFixed(1)}M</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header stats ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
        gap: "var(--space-3)", marginBottom: "var(--space-4)",
      }}>
        <MiniStat label="Available" value={freeAgents.length} />
        <MiniStat label="Cap Room" value={`$${capRoom.toFixed(1)}M`}
          color={capRoom > 10 ? "var(--success)" : capRoom > 0 ? "var(--warning)" : "var(--danger)"} />
        <MiniStat label="Top OVR" value={topFAs[0]?.ovr || "—"} />
      </div>

      {/* ── Controls ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "var(--space-3)",
        marginBottom: "var(--space-4)", alignItems: "center",
      }}>
        <input
          type="text"
          placeholder="Search free agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="settings-input"
          style={{ flex: "1 1 180px", maxWidth: 280 }}
        />
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {SORT_KEYS.map(s => (
            <button
              key={s.key}
              className={`division-tab${sortKey === s.key ? " active" : ""}`}
              onClick={() => setSortKey(s.key)}
              style={{ fontSize: 11 }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Position filter ── */}
      <div className="division-tabs" style={{ marginBottom: "var(--space-4)" }}>
        {POS_FILTERS.map(p => (
          <button
            key={p}
            className={`division-tab${posFilter === p ? " active" : ""}`}
            onClick={() => setPosFilter(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── FA List ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {filtered.slice(0, 60).map((fa, i) => {
          const pos = fa.pos || fa.position;
          const posColor = POS_COLORS[pos] || "#9ca3af";

          return (
            <div
              key={fa.id}
              className={`card-premium hover-lift fade-in stagger-${Math.min(i + 1, 8)}`}
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderLeft: `3px solid ${posColor}`,
                cursor: "pointer",
              }}
              onClick={() => onPlayerSelect?.(fa.id)}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: `${posColor}22`, border: `2px solid ${posColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 12, color: posColor, flexShrink: 0,
                }}>
                  {fa.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {fa.name}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "var(--space-2)",
                    marginTop: 2,
                  }}>
                    <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
                    <OvrPill ovr={fa.ovr || 50} />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      Age {fa.age}
                    </span>
                  </div>
                </div>

                {/* Asking price + bid button */}
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: "var(--text-sm)", fontWeight: 700,
                    color: "var(--success)", fontVariantNumeric: "tabular-nums",
                  }}>
                    ${(fa.baseAnnual || 0).toFixed(1)}M
                  </div>
                  <button
                    className="btn-premium"
                    onClick={(e) => { e.stopPropagation(); setBiddingPlayer(fa); }}
                    style={{
                      fontSize: 10, padding: "2px 8px", minHeight: 24,
                      background: "var(--accent)", color: "#fff",
                      marginTop: 4,
                    }}
                  >
                    Bid
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{
            gridColumn: "1/-1", textAlign: "center",
            padding: "var(--space-8)", color: "var(--text-muted)",
          }}>
            No free agents found
          </div>
        )}
      </div>

      {/* ── Bidding Modal ── */}
      {biddingPlayer && (
        <BiddingModal
          player={biddingPlayer}
          onBid={handleBid}
          onClose={() => setBiddingPlayer(null)}
          capRoom={capRoom}
        />
      )}
    </div>
  );
}

function MiniStat({ label, value, color = "var(--text)" }) {
  return (
    <div className="card-premium" style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--text-base)", fontWeight: 900, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}
