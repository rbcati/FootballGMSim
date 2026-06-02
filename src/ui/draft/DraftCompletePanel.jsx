import React, { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OvrBadge } from "./DraftBadges.jsx";

export default function DraftCompletePanel({ actions, draftState }) {
  const { completedPicks = [], totalPicks = 0 } = draftState;
  const userPicks = completedPicks.filter((pk) => pk.isUser);

  return (
    <div>
      <div
        style={{
          textAlign: "center",
          padding: "var(--space-8) 0",
          borderBottom: "1px solid var(--hairline)",
          marginBottom: "var(--space-6)",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>
          🏈
        </div>
        <h2
          style={{
            fontWeight: 800,
            fontSize: "var(--text-xl)",
            color: "var(--text)",
            marginBottom: "var(--space-2)",
          }}
        >
          Draft Complete
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-5)",
          }}
        >
          {totalPicks} picks made. Your team added {userPicks.length} new player
          {userPicks.length !== 1 ? "s" : ""}.
        </p>
        <Button
          className="btn btn-primary"
          style={{ fontSize: "var(--text-base)" }}
          onClick={() => actions.startNewSeason()}
        >
          Start New Season →
        </Button>
      </div>

      {/* Full pick history */}
      <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
        <CardHeader style={{ padding: "var(--space-3) var(--space-5)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
          <CardTitle style={{ fontWeight: 700, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
            All Picks
          </CardTitle>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
        <ScrollArea style={{ maxHeight: 480 }}>
        <div
          className="table-wrapper"
          style={{ overflowX: "auto" }}
        >
          <Table
            className="standings-table"
            style={{ width: "100%", fontSize: "var(--text-sm)" }}
          >
            <TableHeader>
              <TableRow>
                <TableHead style={{ paddingLeft: "var(--space-4)" }}>#</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>POS</TableHead>
                <TableHead style={{ paddingRight: "var(--space-4)" }}>OVR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedPicks.map((pk) => (
                <TableRow key={pk.overall} className={pk.isUser ? "selected" : ""}>
                  <TableCell
                    style={{
                      paddingLeft: "var(--space-4)",
                      color: "var(--text-subtle)",
                      fontWeight: 700,
                    }}
                  >
                    {pk.overall}
                  </TableCell>
                  <TableCell style={{ color: "var(--text-muted)" }}>R{pk.round}</TableCell>
                  <TableCell
                    style={{
                      fontWeight: pk.isUser ? 700 : 400,
                      color: pk.isUser ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {pk.teamAbbr}
                    {pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                  </TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{pk.playerName ?? "—"}</TableCell>
                  <TableCell style={{ color: "var(--text-muted)" }}>
                    {pk.playerPos ?? "—"}
                  </TableCell>
                  <TableCell style={{ paddingRight: "var(--space-4)" }}>
                    {pk.playerOvr != null ? (
                      <OvrBadge ovr={pk.playerOvr} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────
