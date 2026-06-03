import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OvrBadge } from "./DraftBadges.jsx";
import { DRAFT_ROOM_PHASES, formatClock } from "./draftShared.js";
import { TradeUpModal } from "./TradeUpModal.jsx";

export function DraftLeftPanel({
  isDraftComplete,
  isUserPick,
  currentPick,
  draftPhase,
  pickClock,
  userAutoPick,
  onAutoPickChange,
  simming,
  disabled,
  onSimToMyPick,
  actions,
  showTradeUp,
  onShowTradeUp,
  onHideTradeUp,
  upcomingPicks,
  completedPicks,
  activeRound,
  league,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card className="card-premium" style={{ overflow: "hidden" }}>
        <CardContent style={{ padding: "var(--space-4)" }}>
          {isDraftComplete ? (
            <div style={{ textAlign: "center", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>🏈</div>
              <div style={{ fontWeight: 800, color: "var(--success)" }}>Draft Complete</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                On the Clock
              </div>
              <div style={{ fontWeight: 800, fontSize: "var(--text-xl)", color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface-strong)", border: "1px solid var(--hairline)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                  {currentPick?.teamAbbr?.slice(0, 2) ?? "TM"}
                </span>
                {currentPick?.teamAbbr ?? "???"}
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                {currentPick?.teamName ?? "—"}
              </div>
              <div style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: isUserPick ? "var(--accent)22" : "var(--surface-strong)", border: `1px solid ${isUserPick ? "var(--accent)" : "var(--hairline)"}`, color: isUserPick ? "var(--accent)" : "var(--text-muted)", fontWeight: 700, fontSize: "var(--text-xs)", display: "inline-block", marginBottom: "var(--space-3)" }}>
                {isUserPick ? "★ YOUR PICK" : "AI PICKING"}
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                <span>Round {currentPick?.round}</span>
                <span style={{ color: "var(--text-muted)" }}>Overall #{currentPick?.overall}</span>
              </div>
              {draftPhase === DRAFT_ROOM_PHASES.ON_THE_CLOCK && (
                <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                  Clock: {formatClock(pickClock)}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>
                Phase: {draftPhase.replaceAll("_", " ")}
              </div>
              {currentPick?.isCompensatory && (
                <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                  Compensatory pick · {currentPick?.compensatoryForName ? `for loss of ${currentPick.compensatoryForName}` : "NFL comp selection"}
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                <input type="checkbox" checked={userAutoPick} onChange={(e) => onAutoPickChange(e.target.checked)} />
                Enable Auto-Pick (BPA)
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {!isDraftComplete && !isUserPick && (
        <Button className="btn btn-primary" disabled={simming || disabled} onClick={onSimToMyPick} style={{ width: "100%" }}>
          {simming ? "Simulating…" : "Sim to My Pick"}
        </Button>
      )}

      {!isDraftComplete && !isUserPick && actions && (
        <Button className="btn" onClick={onShowTradeUp} style={{ width: "100%" }}>
          Trade for this Pick
        </Button>
      )}

      {showTradeUp && currentPick && !isUserPick && !isDraftComplete && (
        <TradeUpModal
          currentPick={currentPick}
          league={league}
          actions={actions}
          onClose={onHideTradeUp}
          onTradeComplete={() => onSimToMyPick()}
        />
      )}

      {!isDraftComplete && upcomingPicks.length > 0 && (
        <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
          <CardHeader style={{ padding: "var(--space-2) var(--space-3)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
            <CardTitle style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
              Pick Order
            </CardTitle>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            <ScrollArea style={{ maxHeight: 320 }}>
              {upcomingPicks.map((pk, i) => (
                <div key={pk.overall} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--hairline)", background: i === 0 ? (pk.isUser ? "var(--accent)11" : "var(--surface-strong)") : "transparent", fontWeight: i === 0 ? 700 : 400 }}>
                  <span style={{ minWidth: 24, textAlign: "center", fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{pk.overall}</span>
                  <span style={{ flex: 1, fontSize: "var(--text-xs)", color: pk.isUser ? "var(--accent)" : "var(--text)", fontWeight: pk.isUser ? 700 : 400 }}>
                    {pk.teamAbbr}{pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                  </span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>R{pk.round}{pk.isCompensatory ? " · COMP" : ""}</span>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {completedPicks.length > 0 && (
        <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
          <CardHeader style={{ padding: "var(--space-2) var(--space-3)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
            <CardTitle style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
              Recent Picks
            </CardTitle>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            <ScrollArea style={{ maxHeight: 240 }}>
              {[...completedPicks]
                .reverse()
                .filter((pk) => Number(pk.round) === Number(activeRound))
                .slice(0, 8)
                .map((pk) => (
                  <div key={pk.overall} style={{ padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--hairline)", fontSize: "var(--text-xs)" }}>
                    <div style={{ color: "var(--text-muted)", marginBottom: 1 }}>
                      #{pk.overall} {pk.teamAbbr}{pk.isCompensatory ? " · COMP" : ""}
                    </div>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>
                      {pk.playerName}
                      <span style={{ marginLeft: 6, color: "var(--text-subtle)" }}>
                        {pk.playerPos} · <OvrBadge ovr={pk.playerOvr ?? 0} />
                      </span>
                    </div>
                  </div>
                ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DraftLeftPanel;
