import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ovrColor } from "./draftShared.js";

export function TradeUpModal({ currentPick, league, actions, onClose, onTradeComplete }) {
  const [loading, setLoading] = useState(false);
  const [myRoster, setMyRoster] = useState([]);
  const [offering, setOffering] = useState(new Set());
  const [myPicks, setMyPicks] = useState([]);
  const [result, setResult] = useState(null);

  const targetTeamId = currentPick?.teamId;
  const userTeamId = league?.userTeamId;

  useEffect(() => {
    if (!actions?.getRoster || userTeamId == null) return;
    (async () => {
      setLoading(true);
      try {
        const res = await actions.getRoster(userTeamId);
        if (res?.payload) setMyRoster(res.payload.players ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [actions, userTeamId]);

  const togglePlayer = (id) => {
    setOffering((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const addPick = (round) => {
    setMyPicks((prev) => [...prev, { id: `up_${round}_${Date.now()}`, round, year: (league?.year ?? 2025) + 1 }]);
  };

  const removePick = (id) => setMyPicks((prev) => prev.filter((p) => p.id !== id));

  const handlePropose = async () => {
    if (targetTeamId == null || (offering.size === 0 && myPicks.length === 0)) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await actions.submitTrade(
        userTeamId,
        targetTeamId,
        { playerIds: [...offering], pickIds: myPicks.map((p) => p.id) },
        { playerIds: [], pickIds: [] },
      );
      if (resp?.payload) {
        setResult(resp.payload);
        if (resp.payload.accepted) {
          setTimeout(() => { onTradeComplete?.(); onClose(); }, 1500);
        }
      }
    } catch (e) {
      setResult({ accepted: false, reason: "Error: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  const hasSelection = offering.size > 0 || myPicks.length > 0;

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "var(--text-lg)", color: "var(--text)" }}>Trade for Pick #{currentPick?.overall}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Currently owned by {currentPick?.teamAbbr} · Round {currentPick?.round}</div>
          </div>
          <Button className="btn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>x</Button>
        </div>

        {result && (
          <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: `1px solid ${result.accepted ? "var(--success)" : "var(--danger)"}`, background: result.accepted ? "rgba(52,199,89,0.1)" : "rgba(255,69,58,0.1)", marginBottom: "var(--space-4)", fontWeight: 700, fontSize: "var(--text-sm)", color: result.accepted ? "var(--success)" : "var(--danger)" }}>
            {result.accepted ? "Trade Accepted! Pick is yours." : `Rejected: ${result.reason}`}
          </div>
        )}

        <div style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>Offer Draft Picks</div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5].map((r) => (
              <Button key={r} className="btn" style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }} onClick={() => addPick(r)}>+ R{r}</Button>
            ))}
          </div>
          {myPicks.length > 0 && (
            <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              {myPicks.map((pk) => (
                <span key={pk.id} style={{ fontSize: "var(--text-xs)", padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "var(--accent)22", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {pk.year} R{pk.round}{pk.isCompensatory ? " COMP" : ""}
                  <Button className="btn" onClick={() => removePick(pk.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 11 }}>x</Button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>Offer Players</div>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)" }}>
            {loading && <div style={{ padding: "var(--space-3)", color: "var(--text-muted)", textAlign: "center", fontSize: "var(--text-sm)" }}>Loading roster...</div>}
            {myRoster
              .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
              .map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--hairline)", cursor: "pointer", fontSize: "var(--text-xs)", background: offering.has(p.id) ? "var(--accent)11" : "transparent" }}>
                  <Input type="checkbox" checked={offering.has(p.id)} onChange={() => togglePlayer(p.id)} style={{ accentColor: "var(--accent)", width: 12, height: 12 }} />
                  <Badge variant="outline" style={{ padding: "0 3px", borderRadius: "var(--radius-pill)", background: `${ovrColor(p.ovr)}22`, color: ovrColor(p.ovr), fontWeight: 700, fontSize: 10 }}>{p.ovr}</Badge>
                  <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{p.pos}</span>
                  <span style={{ flex: 1, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                </label>
              ))}
          </div>
        </div>

        <Button className="btn btn-primary" onClick={handlePropose} disabled={!hasSelection || loading} style={{ width: "100%", fontWeight: 700 }}>
          {loading ? "Evaluating..." : "Propose Trade"}
        </Button>
      </div>
    </div>
  );
}

export default TradeUpModal;
