/**
 * HallOfFame.jsx
 *
 * Premium gallery view of Hall of Fame inductees.
 * Displays players as gold-accented cards with SVG PlayerAvatars,
 * career stats, and accolade summaries.
 *
 * Mobile-first responsive Tailwind v4 with dark: mode.
 */
import React, { useEffect, useState } from "react";
import ResponsivePlayerAvatar from "./ResponsivePlayerAvatar.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function HallOfFame({ onPlayerSelect, actions }) {
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    actions
      .getHallOfFame()
      .then((response) => {
        if (mounted) {
          setPlayers(response?.payload?.players ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load Hall of Fame:", err);
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [actions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        Loading Hall of Fame...
      </div>
    );
  }

  if (!players || players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-5xl">&#127942;</div>
        <div className="text-[color:var(--text-muted)] text-center max-w-sm">
          The Hall of Fame is empty. Legendary players will be inducted here
          when they retire with outstanding careers.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-xl font-black text-[color:var(--text)] m-0">
          Hall of Fame
        </h2>
        <Badge variant="secondary">
          {players.length} {players.length === 1 ? "Legend" : "Legends"}
        </Badge>
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map((player) => (
          <HofCard
            key={player.id}
            player={player}
            onPlayerSelect={onPlayerSelect}
          />
        ))}
      </div>
    </div>
  );
}

function HofCard({ player, onPlayerSelect }) {
  const { stats, accoladeSummary } = player;

  // Determine primary stat to feature
  const primaryStat = getPrimaryStat(player);

  return (
    <Card
      className="card-premium relative rounded-xl overflow-hidden cursor-pointer
                 border-2 border-yellow-500/40
                 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/10
                 transition-all duration-200 group"
      onClick={() => onPlayerSelect?.(player.id)}
    >
      <CardContent className="p-0">
        {/* Gold gradient header */}
        <div className="relative bg-gradient-to-r from-yellow-600/20 via-yellow-500/10 to-yellow-600/20
                        dark:from-yellow-500/15 dark:via-yellow-400/5 dark:to-yellow-500/15
                        px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Avatar with gold ring */}
            <div className="relative shrink-0">
              <div className="rounded-full p-0.5 bg-gradient-to-br from-yellow-400 to-yellow-600
                              shadow-md shadow-yellow-500/20">
                <div className="rounded-full overflow-hidden bg-[color:var(--surface)]">
                  <ResponsivePlayerAvatar
                    teamColor={player.teamColor || "#555"}
                    text={player.number ?? player.pos ?? "?"}
                    position={player.pos}
                    showPositionBadge
                    style={{ width: 56, height: 56 }}
                  />
                </div>
              </div>
            </div>

            {/* Name & info */}
            <div className="min-w-0 flex-1">
              <div className="font-black text-base text-[color:var(--text)] truncate
                              group-hover:text-yellow-500 transition-colors">
                {player.name}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-[color:var(--accent)]">{player.pos}</span>
                <span className="text-[color:var(--text-muted)]">&middot;</span>
                <span className="text-[color:var(--text-muted)]">{player.primaryTeam || "N/A"}</span>
              </div>
              <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                {player.seasonsPlayed > 0 && `${player.seasonsPlayed} season${player.seasonsPlayed !== 1 ? "s" : ""}`}
                {player.inductionYear && ` \u00B7 Inducted ${player.inductionYear}`}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="px-4 py-3 space-y-3">
          {/* Accolades row */}
          {(accoladeSummary.mvps > 0 || accoladeSummary.superBowls > 0 || accoladeSummary.proBowls > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {accoladeSummary.mvps > 0 && (
                <AccoladeBadge label={`${accoladeSummary.mvps}x MVP`} gold />
              )}
              {accoladeSummary.superBowls > 0 && (
                <AccoladeBadge label={`${accoladeSummary.superBowls}x SB`} gold />
              )}
              {accoladeSummary.proBowls > 0 && (
                <AccoladeBadge label={`${accoladeSummary.proBowls}x Pro Bowl`} />
              )}
            </div>
          )}

          {/* Career stat grid */}
          <div className="grid grid-cols-3 gap-2">
            {primaryStat.map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-sm font-black text-[color:var(--text)]">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] font-medium">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HOF badge */}
        <div className="absolute top-2 right-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600
                          flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 20 20" className="w-4 h-4 text-white fill-current">
              <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.27 5.23 15.71l.91-5.32L2.27 6.62l5.34-.78L10 1z" />
            </svg>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccoladeBadge({ label, gold }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-bold uppercase tracking-wide
        ${gold
          ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
          : "bg-[color:var(--surface-strong)] text-[color:var(--text-muted)] border-[color:var(--hairline)]"
        }`}
    >
      {label}
    </Badge>
  );
}

/**
 * Determine the 3 most relevant career stats to display based on position.
 */
function getPrimaryStat(player) {
  const s = player.stats || {};
  const pos = player.pos;

  if (pos === "QB") {
    return [
      { label: "Pass Yds", value: s.passYds },
      { label: "Pass TDs", value: s.passTDs },
      { label: "Games", value: s.gamesPlayed },
    ];
  }
  if (pos === "RB") {
    return [
      { label: "Rush Yds", value: s.rushYds },
      { label: "Rec Yds", value: s.recYds },
      { label: "Games", value: s.gamesPlayed },
    ];
  }
  if (pos === "WR" || pos === "TE") {
    return [
      { label: "Rec Yds", value: s.recYds },
      { label: "Pass Yds", value: s.passYds > 0 ? s.passYds : undefined },
      { label: "Games", value: s.gamesPlayed },
    ].filter(s => s.value !== undefined);
  }
  if (["DL", "LB", "CB", "S"].includes(pos)) {
    return [
      { label: "Sacks", value: s.sacks },
      { label: "Games", value: s.gamesPlayed },
      { label: "Rush Yds", value: s.rushYds > 100 ? s.rushYds : undefined },
    ].filter(s => s.value !== undefined);
  }

  // Fallback: show the biggest stat
  return [
    { label: "Games", value: s.gamesPlayed },
    { label: "Pass Yds", value: s.passYds },
    { label: "Rush Yds", value: s.rushYds },
  ];
}
