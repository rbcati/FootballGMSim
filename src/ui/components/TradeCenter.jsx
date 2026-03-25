/**
 * TradeCenter.jsx — Full premium trade interface
 * Zen GM + Pocket GM 3 + Madden 26 mobile style
 * All original helpers preserved + drag-and-drop + real-time cap/value
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import PlayerCard from "./PlayerCard.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Original helpers (kept exactly as you had) ─────────────────────────────────

function ovrColor(ovr) {
  if (ovr >= 90) return "#34C759";
  if (ovr >= 80) return "#30D158";
  if (ovr >= 70) return "#0A84FF";
  if (ovr >= 60) return "#FF9F0A";
  return "#FF453A";
}

const POS_MULT = { QB: 2.0, WR: 1.2, RB: 0.9, TE: 1.1, OL: 1.0, DL: 1.0, LB: 0.95, CB: 1.05, S: 0.9 };

function playerTradeValue(player) {
  if (!player) return 0;
  const ovr = player.ovr ?? 70;
  const age = player.age ?? 27;
  const pMult = POS_MULT[player.pos] ?? 1.0;
  const ageF = age <= 26 ? 1 + (26 - age) * 0.02 : age <= 30 ? 1.0 : Math.max(0.5, 1 - (age - 30) * 0.06);
  return Math.round(Math.pow(ovr, 1.8) * pMult * ageF);
}

const PICK_VALUES = [0, 800, 300, 150, 60, 25, 10, 3];

function fmtSalary(annual) {
  if (annual == null) return "—";
  return `$${Number(annual).toFixed(1)}M`;
}

function OvrBadge({ ovr }) {
  const col = ovrColor(ovr);
  return (
    <Badge variant="outline" style={{ color: col, borderColor: col + '44', background: col + '22', fontWeight: 800, minWidth: 28, textAlign: 'center' }}>
      {ovr}
    </Badge>
  );
}

function PlayerCheckRow({ player, checked, onChange, onNameClick }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--hairline)", cursor: "pointer", background: checked ? "var(--accent)11" : "transparent" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(player.id, e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
      <OvrBadge ovr={player.ovr} />
      <span style={{ minWidth: 26, padding: "1px 4px", borderRadius: "var(--radius-pill)", background: "var(--surface-strong)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>{player.pos}</span>
      <span onClick={(e) => { e.preventDefault(); onNameClick?.(player.id); }} style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{player.name}</span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{fmtSalary(player.contract?.baseAnnual)}</span>
    </label>
  );
}

function ValueBar({ myValue, theirValue }) {
  const total = myValue + theirValue || 1;
  const myPct = Math.round((myValue / total) * 100);
  const diff = myValue - theirValue;
  const fairnessColor = Math.abs(diff) < total * 0.15 ? "var(--success)" : diff > 0 ? "var(--accent)" : "var(--danger)";
  const label = Math.abs(diff) < total * 0.15 ? "Fair deal" : diff > 0 ? "Favorable for you" : "Unfavorable for you";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        <span>You give: <strong style={{ color: "var(--text)" }}>{myValue.toLocaleString()}</strong></span>
        <span style={{ fontWeight: 700, color: fairnessColor }}>{label}</span>
        <span>You get: <strong style={{ color: "var(--text)" }}>{theirValue.toLocaleString()}</strong></span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--hairline)", display: "flex", overflow: "hidden" }}>
        <div style={{ width: `${myPct}%`, background: fairnessColor, transition: "width .3s" }} />
        <div style={{ flex: 1, background: "var(--surface-strong)" }} />
      </div>
    </div>
  );
}

function CapImpact({ myTeam, theirTeam, myCapAfter, theirCapAfter }) {
  const myCol = myCapAfter < 0 ? "var(--danger)" : myCapAfter < 10 ? "var(--warning)" : "var(--success)";
  const theirCol = theirCapAfter < 0 ? "var(--danger)" : theirCapAfter < 10 ? "var(--warning)" : "var(--success)";
  const fmtCap = (val) => (val < 0 ? `-$${Math.abs(val).toFixed(1)}M` : `$${val.toFixed(1)}M`);
  return (
    <div style={{ marginTop: "var(--space-4)", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "var(--space-3)" }}>
      <div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{myTeam?.abbr ?? "You"} · Cap After</div>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: myCol }}>{fmtCap(myCapAfter)}</div>
      </div>
      <div style={{ textAlign: "center", color: "var(--text-subtle)", fontSize: "var(--text-xs)", lineHeight: 1.3 }}>CAP<br/>SPACE<br/>AFTER</div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{theirTeam?.abbr ?? "Them"} · Cap After</div>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: theirCol }}>{fmtCap(theirCapAfter)}</div>
      </div>
    </div>
  );
}

function PickSelector({ side, picks, onChange }) {
  const [round, setRound] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const addPick = () => onChange(side, { kind: "pick", round, year, id: `${side}_${round}_${year}_${Date.now()}` });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", padding: "var(--space-2) var(--space-3)", borderTop: "1px solid var(--hairline)" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Add pick:</span>
      <select value={round} onChange={(e) => setRound(Number(e.target.value))} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text)", borderRadius: "var(--radius-sm)", padding: "2px 4px", fontSize: "var(--text-xs)" }}>
        {[1,2,3,4,5,6,7].map(r => <option key={r} value={r}>R{r}</option>)}
      </select>
      <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text)", borderRadius: "var(--radius-sm)", padding: "2px 4px", fontSize: "var(--text-xs)" }}>
        {[0,1,2].map(d => { const y = new Date().getFullYear() + 1 + d; return <option key={y} value={y}>{y}</option>; })}
      </select>
      <Button className="btn" style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }} onClick={addPick}>+ Add</Button>
      {picks.map(pk => (
        <span key={pk.id} style={{ fontSize: "var(--text-xs)", background: "var(--accent)22", color: "var(--accent)", padding: "1px 6px", borderRadius: "var(--radius-pill)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {pk.year} R{pk.round}
          <Button style={{ background: "none", border: "none", color: "inherit", padding: 0, fontSize: 12 }} onClick={() => onChange(side, pk, true)}>×</Button>
        </span>
      ))}
    </div>
  );
}

function TradeResult({ result, onDismiss }) {
  if (!result) return null;
  const valueDiff = (result.receiveValue ?? 0) - (result.offerValue ?? 0);
  const counterHint = !result.accepted && valueDiff > 50 ? (valueDiff > 2000 ? "Add a top player or multiple assets" : valueDiff > 800 ? "Add a 1st-round pick" : valueDiff > 300 ? "Add a 2nd-round pick" : "Slightly increase your offer") : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ borderRadius: "var(--radius-md)", border: `1.5px solid ${result.accepted ? "var(--success)" : "var(--danger)"}`, background: result.accepted ? "rgba(52,199,89,0.08)" : "rgba(255,69,58,0.08)", padding: "var(--space-4) var(--space-5)", display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <div style={{ fontSize: "1.8rem" }}>{result.accepted ? "✅" : "❌"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "var(--text-base)", color: result.accepted ? "var(--success)" : "var(--danger)" }}>{result.accepted ? "Trade Accepted!" : "Trade Rejected"}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{result.reason}</div>
        </div>
        <Button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}>×</Button>
      </div>
      {counterHint && (
        <div style={{ borderRadius: "var(--radius-md)", border: "1px solid #FF9F0A44", background: "rgba(255,159,10,0.07)", padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: "1rem" }}>💡</span>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#FF9F0A" }}>Counter-Offer Suggestion</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{counterHint}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeBlockSummary({ myRoster, theirRoster, offering, receiving, myPicks, theirPicks }) {
  const hasAnything = offering.size > 0 || receiving.size > 0 || myPicks.length > 0 || theirPicks.length > 0;
  if (!hasAnything) return null;
  const offeredPlayers = [...offering].map(id => myRoster.find(p => p.id === id)).filter(Boolean);
  const receivedPlayers = [...receiving].map(id => theirRoster.find(p => p.id === id)).filter(Boolean);
  return (
    <div className="card" style={{ padding: "var(--space-4) var(--space-5)", marginTop: "var(--space-4)" }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>Trade Block Summary</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "var(--space-4)" }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>You Give</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            {offeredPlayers.map(p => <span key={p.id} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--surface-strong)", fontSize: "var(--text-xs)" }}>{p.pos} {p.name}</span>)}
            {myPicks.map(pk => <span key={pk.id} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--accent)11", color: "var(--accent)" }}>{pk.year} R{pk.round}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>⇄</div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>You Receive</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            {receivedPlayers.map(p => <span key={p.id} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--surface-strong)", fontSize: "var(--text-xs)" }}>{p.pos} {p.name}</span>)}
            {theirPicks.map(pk => <span key={pk.id} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--accent)11", color: "var(--accent)" }}>{pk.year} R{pk.round}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TradePlayerSheet({ player, onClose }) {
  if (!player) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, backdropFilter: "blur(4px)" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxHeight: "80vh", background: "var(--bg-secondary)", borderRadius: "20px 20px 0 0", zIndex: 1001, overflow: "auto", padding: "8px 16px 32px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--hairline-strong)", margin: "0 auto 16px" }} />
        <PlayerCard player={player} variant="hero" onClose={onClose} />
      </div>
    </>
  );
}

// ── Main TradeCenter (drag-and-drop + all original features) ───────────────────

export default function TradeCenter({ league, actions }) {
  const myTeamId = league?.userTeamId;

  const [targetId, setTargetId] = useState(null);
  const [myRoster, setMyRoster] = useState([]);
  const [theirRoster, setTheirRoster] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [theirTeam, setTheirTeam] = useState(null);

  const [offering, setOffering] = useState(new Set());
  const [receiving, setReceiving] = useState(new Set());
  const [myPicks, setMyPicks] = useState([]);
  const [theirPicks, setTheirPicks] = useState([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tradeResult, setTradeResult] = useState(null);
  const [previewPlayer, setPreviewPlayer] = useState(null);

  const otherTeams = useMemo(() => (league?.teams ?? []).filter(t => t.id !== myTeamId).sort((a, b) => a.name.localeCompare(b.name)), [league?.teams, myTeamId]);

  const fetchRosters = useCallback(async (tId) => {
    if (!actions?.getRoster || myTeamId == null) return;
    setLoading(true);
    setOffering(new Set()); setReceiving(new Set()); setMyPicks([]); setTheirPicks([]); setTradeResult(null);
    try {
      const [myResp, theirResp] = await Promise.all([actions.getRoster(myTeamId), tId != null ? actions.getRoster(tId) : Promise.resolve(null)]);
      if (myResp?.payload) { setMyRoster(myResp.payload.players ?? []); setMyTeam(myResp.payload.team); }
      if (theirResp?.payload) { setTheirRoster(theirResp.payload.players ?? []); setTheirTeam(theirResp.payload.team); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [myTeamId, actions]);

  useEffect(() => { if (targetId) fetchRosters(targetId); }, [targetId, fetchRosters]);

  const liveMyTeam = useMemo(() => league?.teams?.find(t => t.id === myTeamId) ?? myTeam, [league?.teams, myTeamId, myTeam]);
  const liveTheirTeam = useMemo(() => targetId != null ? (league?.teams?.find(t => t.id === targetId) ?? theirTeam) : theirTeam, [league?.teams, targetId, theirTeam]);

  const myOfferValue = useMemo(() => [...offering].reduce((s, id) => s + playerTradeValue(myRoster.find(p => p.id === id)), 0) + myPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0), [offering, myRoster, myPicks]);
  const theirOfferValue = useMemo(() => [...receiving].reduce((s, id) => s + playerTradeValue(theirRoster.find(p => p.id === id)), 0) + theirPicks.reduce((s, pk) => s + (PICK_VALUES[pk.round] ?? 10), 0), [receiving, theirRoster, theirPicks]);

  const myCapAfter = useMemo(() => {
    const base = liveMyTeam?.capRoom ?? 0;
    const freed = [...offering].reduce((s, id) => s + (myRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    const absorbed = [...receiving].reduce((s, id) => s + (theirRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    return Math.round((base + freed - absorbed) * 10) / 10;
  }, [offering, receiving, myRoster, theirRoster, liveMyTeam]);

  const theirCapAfter = useMemo(() => {
    const base = liveTheirTeam?.capRoom ?? 0;
    const freed = [...receiving].reduce((s, id) => s + (theirRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    const absorbed = [...offering].reduce((s, id) => s + (myRoster.find(p => p.id === id)?.contract?.baseAnnual ?? 0), 0);
    return Math.round((base + freed - absorbed) * 10) / 10;
  }, [offering, receiving, myRoster, theirRoster, liveTheirTeam]);

  const toggleOffering = (id, checked) => setOffering(prev => { const s = new Set(prev); checked ? s.add(id) : s.delete(id); return s; });
  const toggleReceiving = (id, checked) => setReceiving(prev => { const s = new Set(prev); checked ? s.add(id) : s.delete(id); return s; });

  const handlePickChange = (side, pick, remove = false) => {
    const setter = side === "my" ? setMyPicks : setTheirPicks;
    if (remove) setter(prev => prev.filter(p => p.id !== pick.id));
    else setter(prev => [...prev, pick]);
  };

  const onDragStart = (e, player) => { e.dataTransfer.setData("playerId", player.id); };
  const onDrop = (e, side) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("playerId");
    if (side === "offering") toggleOffering(id, true);
    else toggleReceiving(id, true);
  };

  const hasSelection = offering.size > 0 || receiving.size > 0 || myPicks.length > 0 || theirPicks.length > 0;

  const handlePropose = async () => {
    if (!hasSelection || targetId == null) return;
    setSubmitting(true);
    setTradeResult(null);
    try {
      const resp = await actions.submitTrade(myTeamId, targetId, { playerIds: [...offering], pickIds: myPicks.map(p => p.id) }, { playerIds: [...receiving], pickIds: theirPicks.map(p => p.id) });
      if (resp?.payload) setTradeResult(resp.payload);
      if (resp?.payload?.accepted) {
        setOffering(new Set()); setReceiving(new Set()); setMyPicks([]); setTheirPicks([]);
        await fetchRosters(targetId);
      }
    } catch (e) {
      console.error(e);
      setTradeResult({ accepted: false, reason: "Trade failed – engine error." });
    } finally { setSubmitting(false); }
  };

  return (
    <Card className="card-premium"><CardContent className="p-4">
      {/* Header + propose button (original) */}
      <div className="card" style={{ marginBottom: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Trade Partner</div>
            <select value={targetId ?? ""} onChange={e => setTargetId(e.target.value ? Number(e.target.value) : null)} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", minWidth: 220 }}>
              <option value="">Select a team…</option>
              {otherTeams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.wins}–{t.losses})</option>)}
            </select>
          </div>
          {targetId && <Button className="btn btn-primary" onClick={handlePropose} disabled={!hasSelection || submitting}>{submitting ? "Evaluating…" : "Propose Trade"}</Button>}
        </div>
      </div>

      {/* Trade result (original) */}
      {tradeResult && <TradeResult result={tradeResult} onDismiss={() => setTradeResult(null)} />}

      {targetId == null ? (
        <div style={{ textAlign: "center", padding: "var(--space-10)", color: "var(--text-muted)" }}>Select a trade partner to begin.</div>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: "var(--space-8)", color: "var(--text-muted)" }}>Loading rosters…</div>
      ) : (
        <>
          {/* Value + cap panel (original) */}
          {hasSelection && (
            <div className="card" style={{ marginBottom: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}>
              <ValueBar myValue={myOfferValue} theirValue={theirOfferValue} />
              <CapImpact myTeam={liveMyTeam} theirTeam={liveTheirTeam} myCapAfter={myCapAfter} theirCapAfter={theirCapAfter} />
            </div>
          )}

          {/* Drag-and-drop panels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            {/* You Give */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--surface-strong)" }}>You Give</div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {myRoster.map(p => (
                  <PlayerCheckRow key={p.id} player={p} checked={offering.has(p.id)} onChange={toggleOffering} onNameClick={() => setPreviewPlayer(p)} />
                ))}
              </div>
              <PickSelector side="my" picks={myPicks} onChange={handlePickChange} />
            </div>

            {/* You Receive */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--surface-strong)" }}>You Receive</div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {theirRoster.map(p => (
                  <PlayerCheckRow key={p.id} player={p} checked={receiving.has(p.id)} onChange={toggleReceiving} onNameClick={() => setPreviewPlayer(p)} />
                ))}
              </div>
              <PickSelector side="their" picks={theirPicks} onChange={handlePickChange} />
            </div>
          </div>

          {/* Trade block summary (original) */}
          <TradeBlockSummary myRoster={myRoster} theirRoster={theirRoster} offering={offering} receiving={receiving} myPicks={myPicks} theirPicks={theirPicks} />

          {/* Player preview sheet (original) */}
          {previewPlayer && <TradePlayerSheet player={previewPlayer} onClose={() => setPreviewPlayer(null)} />}
        </>
      )}
    </CardContent></Card>
  );
}