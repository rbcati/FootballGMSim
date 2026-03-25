/**
 * FreeAgencyHub.jsx — Premium live bidding experience
 * Keeps ALL your original UI (ticker, MiniStat header, search, sort, filters, grid)
 * + new ContractNegotiation bottom sheet + live AI bids + correct useWorker actions
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import PlayerCard from "./PlayerCard.jsx";
import ContractNegotiation from "./ContractNegotiation.jsx";

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

function MiniStat({ label, value, color = "var(--text)" }) {
  return (
    <div className="card-premium" style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--text-base)", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

export default function FreeAgencyHub({ league, actions }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("ovr");
  const [search, setSearch] = useState("");
  const [biddingPlayer, setBiddingPlayer] = useState(null);
  const [aiBids, setAiBids] = useState({}); // {playerId: {bid, teamAbbr, timeLeft}}

  const freeAgents = league?.freeAgents || [];
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const capRoom = userTeam?.capRoom ?? 0;

  // Live AI bids simulation (updates every 2.5s)
  useEffect(() => {
    const interval = setInterval(() => {
      const updated = { ...aiBids };
      freeAgents.slice(0, 8).forEach(fa => {
        if (!updated[fa.id]) {
          updated[fa.id] = {
            bid: (fa.baseAnnual || 4),
            teamAbbr: "AI",
            timeLeft: 48,
          };
        }
        updated[fa.id].bid = Math.max(
          updated[fa.id].bid,
          (fa.baseAnnual || 4) * (0.9 + Math.random() * 0.5)
        );
        updated[fa.id].timeLeft = Math.max(0, updated[fa.id].timeLeft - 1);
      });
      setAiBids(updated);
    }, 2500);
    return () => clearInterval(interval);
  }, [freeAgents, aiBids]);

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

  const topFAs = useMemo(() =>
    [...freeAgents].sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 5),
    [freeAgents]
  );

  const handleOffer = useCallback((offer) => {
    if (!biddingPlayer) return;
    actions.submitOffer(biddingPlayer.id, league.userTeamId, {
      years: offer.years,
      baseAnnual: offer.annual,
      guaranteePct: offer.guaranteePct,
      signingBonus: offer.bonus,
    });
    setBiddingPlayer(null);
  }, [actions, biddingPlayer, league.userTeamId]);

  const handleSignImmediately = useCallback(() => {
    if (!biddingPlayer) return;
    actions.signPlayer(biddingPlayer.id, league.userTeamId, {
      years: 3,
      baseAnnual: biddingPlayer.baseAnnual || 8,
    });
    setBiddingPlayer(null);
  }, [actions, biddingPlayer, league.userTeamId]);

  return (
    <div className="fade-in">
      {/* Market Ticker (original) */}
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

      {/* Header stats (original) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <MiniStat label="Available" value={freeAgents.length} />
        <MiniStat label="Cap Room" value={`$${capRoom.toFixed(1)}M`} color={capRoom > 10 ? "var(--success)" : capRoom > 0 ? "var(--warning)" : "var(--danger)"} />
        <MiniStat label="Top OVR" value={topFAs[0]?.ovr || "—"} />
      </div>

      {/* Controls (original) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-4)", alignItems: "center" }}>
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

      {/* Position filter (original) */}
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

      {/* FA Grid (original) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-3)" }}>
        {filtered.slice(0, 60).map((fa, i) => {
          const pos = fa.pos || fa.position;
          const posColor = POS_COLORS[pos] || "#9ca3af";
          const currentBid = aiBids[fa.id] || { bid: fa.baseAnnual || 4, teamAbbr: "—", timeLeft: 48 };

          return (
            <div
              key={fa.id}
              className={`card-premium hover-lift fade-in stagger-${Math.min(i + 1, 8)}`}
              style={{ padding: "var(--space-3) var(--space-4)", borderLeft: `3px solid ${posColor}`, cursor: "pointer" }}
              onClick={() => setBiddingPlayer(fa)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${posColor}22`, border: `2px solid ${posColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, color: posColor, flexShrink: 0 }}>
                  {fa.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fa.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 2 }}>
                    <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
                    <PlayerCard player={fa} variant="compact" style={{ margin: 0, padding: 0 }} />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Age {fa.age}</span>
                  </div>
                </div>

                {/* Bid info */}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                    {currentBid.bid.toFixed(1)}M
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
                    {currentBid.teamAbbr}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contract Negotiation Sheet */}
      {biddingPlayer && (
        <ContractNegotiation
          player={biddingPlayer}
          capRoom={capRoom}
          onOffer={handleOffer}
          onSignImmediately={handleSignImmediately}
          onClose={() => setBiddingPlayer(null)}
        />
      )}
    </div>
  );
}