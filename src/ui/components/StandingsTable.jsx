import React from "react";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

function safeWinPct(wins = 0, losses = 0, ties = 0) {
  const games = Number(wins) + Number(losses) + Number(ties);
  if (games <= 0) return ".000";
  return ((Number(wins) + Number(ties) * 0.5) / games).toFixed(3).replace(/^0/, "");
}

export default function StandingsTable({ teams = [], userTeamId = null, onTeamSelect = null }) {
  const safeTeams = Array.isArray(teams) ? teams : [];

  return (
    <ScrollArea className="h-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={{ paddingLeft: "var(--space-5)" }}>Team</TableHead>
            <TableHead style={{ textAlign: "center" }}>W</TableHead>
            <TableHead style={{ textAlign: "center" }}>L</TableHead>
            <TableHead style={{ textAlign: "center" }}>T</TableHead>
            <TableHead style={{ textAlign: "center" }}>PCT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {safeTeams.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                No standings data available.
              </TableCell>
            </TableRow>
          )}
          {safeTeams.map((team, idx) => {
            const wins = Number(team?.wins ?? 0);
            const losses = Number(team?.losses ?? 0);
            const ties = Number(team?.ties ?? 0);
            const isUser = Number(team?.id) === Number(userTeamId);
            return (
              <TableRow key={team?.id ?? `${team?.abbr ?? "team"}-${idx}`} className={isUser ? "user-team-row" : ""}>
                <TableCell style={{ paddingLeft: "var(--space-4)" }}>
                  <button className="btn btn-link" onClick={() => onTeamSelect?.(team?.id)}>
                    {team?.name ?? team?.abbr ?? "Unknown"}
                  </button>
                </TableCell>
                <TableCell style={{ textAlign: "center" }}>{wins}</TableCell>
                <TableCell style={{ textAlign: "center" }}>{losses}</TableCell>
                <TableCell style={{ textAlign: "center" }}>{ties}</TableCell>
                <TableCell style={{ textAlign: "center" }}>{safeWinPct(wins, losses, ties)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
