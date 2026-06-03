import React, { useCallback } from "react";
import EmptyState from "../components/EmptyState.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SortIcon } from "./DraftBadges.jsx";
import { DRAFT_ROOM_PHASES } from "./draftShared.js";
import { useDraftBoard } from "./useDraftBoard.js";
import { DraftTicker } from "./DraftTicker.jsx";
import { DraftWarRoomBanner } from "./DraftWarRoomBanner.jsx";
import { DraftLeftPanel } from "./DraftLeftPanel.jsx";
import { DraftTradeDownPanel } from "./DraftTradeDownPanel.jsx";
import { ProspectFilters } from "./ProspectFilters.jsx";
import { ProspectRow } from "./ProspectRow.jsx";

const PROSPECT_COLUMNS = [
  { key: "boardRank", label: "BOARD" },
  { key: "pos", label: "POS" },
  { key: "name", label: "NAME" },
  { key: "traits", label: "TRAITS" },
  { key: "age", label: "AGE" },
  { key: "compare", label: "CMP" },
];

function DraftBoard({
  draftState,
  userTeamId,
  onSimToMyPick,
  onDraftPlayer,
  onPlayerClick,
  simming,
  league,
  actions,
  disabled = false,
}) {
  const board = useDraftBoard({ draftState, onDraftPlayer, onSimToMyPick, league });

  const userTeam = (league?.teams ?? []).find((t) => t.id === league?.userTeamId);

  const handleAcceptTradeDown = useCallback(async () => {
    board.setTradeDownProcessing(true);
    try {
      const res = await actions.acceptDraftTrade(board.pendingTradeProposal);
      if (res?.payload) {
        board.setShowTradeDown(false);
        onSimToMyPick();
      }
    } catch (e) {
      console.error("[Draft] acceptDraftTrade failed:", e);
    } finally {
      board.setTradeDownProcessing(false);
    }
  }, [actions, board, onSimToMyPick]);

  const handleDeclineTradeDown = useCallback(async () => {
    await actions.rejectDraftTrade?.();
    board.setShowTradeDown(false);
  }, [actions, board]);

  const ovrLabel = board.isDraftComplete ? "OVR" : "GRADE";
  const potLabel = board.isDraftComplete ? "POT" : "???";

  const gradeColumns = [
    { key: "ovr", label: ovrLabel },
    { key: "potential", label: potLabel },
    { key: "fortyTime", label: "40Y" },
    { key: "benchPress", label: "BENCH" },
    { key: "college", label: "COLLEGE" },
  ];

  const allColumns = [...PROSPECT_COLUMNS, ...gradeColumns];

  return (
    <div>
      <DraftWarRoomBanner
        isUserPick={board.isUserPick}
        currentPick={board.currentPick}
        isDraftComplete={board.isDraftComplete}
      />

      <DraftTicker completedPicks={board.completedPicks} />

      {board.pickOrder.length === 0 && (
        <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "rgba(255,69,58,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "var(--text-sm)" }}>
          Draft cannot start — no teams found.
        </div>
      )}

      <div
        className="draft-layout"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)", gap: "var(--space-5)", alignItems: "start" }}
      >
        <style>{`@media (max-width: 900px) { .draft-layout { grid-template-columns: minmax(0, 1fr); } }`}</style>

        <DraftLeftPanel
          isDraftComplete={board.isDraftComplete}
          isUserPick={board.isUserPick}
          currentPick={board.currentPick}
          draftPhase={board.draftPhase}
          pickClock={board.pickClock}
          userAutoPick={board.userAutoPick}
          onAutoPickChange={board.setUserAutoPick}
          simming={simming}
          disabled={disabled}
          onSimToMyPick={onSimToMyPick}
          actions={actions}
          showTradeUp={board.showTradeUp}
          onShowTradeUp={() => board.setShowTradeUp(true)}
          onHideTradeUp={() => board.setShowTradeUp(false)}
          upcomingPicks={board.upcomingPicks}
          completedPicks={board.completedPicks}
          activeRound={board.activeRound}
          league={league}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {board.isUserPick && !board.isDraftComplete && (
            <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--accent)18", border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span style={{ fontSize: "1.1rem" }}>★</span>
              <span style={{ flex: 1 }}>
                You're on the clock! Round {board.currentPick?.round}, Pick #{board.currentPick?.overall} — select a prospect below.
              </span>
              {board.pendingTradeProposal && (
                <Button
                  className="btn"
                  onClick={() => board.setShowTradeDown(true)}
                  style={{ flexShrink: 0, fontSize: "var(--text-xs)", fontWeight: 700, border: "1px solid var(--warning, #FF9F0A)", color: "var(--warning, #FF9F0A)", background: "rgba(255,159,10,0.12)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-sm)", animation: "pulse 2s infinite" }}
                >
                  Trade Down / View Offers
                </Button>
              )}
            </div>
          )}

          {board.recommendedPick && !board.isDraftComplete && (
            <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.45)", color: "var(--text)" }}>
              <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: 1, color: "var(--success)" }}>Recommended pick</div>
              <div style={{ fontWeight: 700 }}>
                #{board.recommendedPick.rank ?? 1} on your board · {board.sortedProspects.find((p) => String(p.id) === String(board.recommendedPick.playerId))?.name ?? "Top option"}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{board.recommendedPick.reason}</div>
            </div>
          )}

          {board.isUserPick && !board.isDraftComplete && board.pendingTradeProposal && board.showTradeDown && (
            <DraftTradeDownPanel
              pendingTradeProposal={board.pendingTradeProposal}
              processing={board.tradeDownProcessing}
              onAccept={handleAcceptTradeDown}
              onDecline={handleDeclineTradeDown}
              onClose={() => board.setShowTradeDown(false)}
            />
          )}

          <ProspectFilters
            nameFilter={board.nameFilter}
            onNameFilterChange={board.setNameFilter}
            filterPos={board.filterPos}
            onFilterPosChange={board.setFilterPos}
            posOptions={board.posOptions}
            prospectCount={board.sortedProspects.length}
            showAdvancedFilters={board.showAdvancedFilters}
            onToggleAdvancedFilters={() => board.setShowAdvancedFilters((v) => !v)}
            advancedFilters={board.advancedFilters}
            onAdvancedFiltersChange={board.setAdvancedFilters}
            draftAdvancedFields={board.draftAdvancedFields}
            compareIds={board.compareIds}
            showComparison={board.showComparison}
            comparePlayerA={board.comparePlayerA}
            comparePlayerB={board.comparePlayerB}
            onCloseComparison={() => board.setShowComparison(false)}
            onToggleCompare={board.toggleCompare}
            onOpenCompare={() => board.setShowComparison(true)}
            onClearCompare={() => board.setCompareIds([])}
            resolvePlayer={(id) => board.sortedProspects.find((p) => p.id === id)}
          />

          <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
            <CardContent style={{ padding: 0 }}>
              <div className="table-wrapper" style={{ overflowX: "auto" }}>
                <Table className="standings-table" style={{ width: "100%", fontSize: "var(--text-sm)" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 36, textAlign: "center", paddingLeft: "var(--space-3)" }}>#</TableHead>
                      {allColumns.map((col) => (
                        <TableHead key={col.key} onClick={() => board.toggleSort(col.key)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                          {col.label}
                          <SortIcon active={board.sortKey === col.key} dir={board.sortDir} />
                        </TableHead>
                      ))}
                      {board.isUserPick && !board.isDraftComplete && (
                        <TableHead style={{ textAlign: "right", paddingRight: "var(--space-4)" }}>ACTION</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.sortedProspects.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={board.isUserPick ? 12 : 11} style={{ padding: 0 }}>
                          <EmptyState
                            icon="🎯"
                            title={board.isDraftComplete ? "No prospects remain" : "No prospects match"}
                            subtitle={board.isDraftComplete ? "All prospects have been drafted." : "Adjust your filters to broaden the board."}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    {board.sortedProspects.map((p, i) => (
                      <ProspectRow
                        key={p.id}
                        prospect={p}
                        rank={i + 1}
                        boardRank={Math.max(1, board.manualBoard.indexOf(String(p.id)) + 1)}
                        isUserPick={board.isUserPick}
                        isDraftComplete={board.isDraftComplete}
                        draftPhase={board.draftPhase}
                        onDraftPlayer={onDraftPlayer}
                        onPlayerClick={onPlayerClick}
                        compareIds={board.compareIds}
                        onToggleCompare={board.toggleCompare}
                        onMoveUp={() => board.setManualBoard((prev) => {
                          const next = [...prev];
                          const idx = next.indexOf(String(p.id));
                          if (idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })}
                        onMoveDown={() => board.setManualBoard((prev) => {
                          const next = [...prev];
                          const idx = next.indexOf(String(p.id));
                          if (idx > -1 && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          return next;
                        })}
                        disabled={disabled}
                        userTeam={userTeam}
                        isRecommended={String(p.id) === String(board.recommendedPick?.playerId ?? "")}
                        isTopByPos={board.topProspectByPos.get(p.pos) === String(p.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="card-premium" style={{ marginTop: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, marginRight: 6 }}>Round Navigator</span>
            {Array.from({ length: 7 }).map((_, idx) => {
              const round = idx + 1;
              const userPicksInRound = board.userPickCountsByRound.get(round) ?? 0;
              return (
                <button key={round} className="btn" onClick={() => board.setActiveRound(round)} style={{ fontSize: "var(--text-xs)", padding: "3px 8px", borderColor: board.activeRound === round ? "var(--accent)" : "var(--hairline)", color: board.activeRound === round ? "var(--accent)" : "var(--text-muted)" }}>
                  R{round}: {userPicksInRound > 0 ? "✓" : "—"} {userPicksInRound} pick{userPicksInRound === 1 ? "" : "s"}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const ProspectTable = React.memo(DraftBoard);
export { ProspectTable, DraftBoard };
export default ProspectTable;
