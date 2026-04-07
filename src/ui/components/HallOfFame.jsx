/**
 * HallOfFame.jsx
 *
 * Premium gallery view of Hall of Fame inductees.
 */
import React, { useEffect, useMemo, useState } from "react";
import ResponsivePlayerAvatar from "./ResponsivePlayerAvatar.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HallOfFame({ onPlayerSelect, actions }) {
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("legacy");

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

    return () => {
      mounted = false;
    };
  }, [actions]);

  const positions = useMemo(() => {
    const set = new Set((players ?? []).map((p) => p.pos).filter(Boolean));
    return ["ALL", ...[...set].sort()];
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const list = (players ?? []).filter((p) => {
      if (positionFilter !== "ALL" && p.pos !== positionFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.pos, p.primaryTeam]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => sortHallPlayers(a, b, sortKey));
  }, [players, positionFilter, search, sortKey]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-[color:var(--text)] m-0">Hall of Fame</h2>
          <Badge variant="secondary">
            {filteredPlayers.length}/{players.length} {players.length === 1 ? "Legend" : "Legends"}
          </Badge>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          Explore inductions, teams, awards, and peak greatness.
        </div>
      </div>

      <Card className="card-premium">
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search legends"
              className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            />
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            >
              {positions.map((pos) => (
                <option key={pos} value={pos}>{pos === "ALL" ? "All positions" : pos}</option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
            >
              <option value="legacy">Sort: Legacy Score</option>
              <option value="inductionYear">Sort: Induction Year</option>
              <option value="awards">Sort: Awards</option>
              <option value="rings">Sort: Rings</option>
              <option value="peak">Sort: Peak OVR</option>
            </select>
            <div className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-xs text-[color:var(--text-muted)] flex items-center">
              Click any card to open full player archive.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlayers.map((player) => (
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
  const primaryStat = getPrimaryStat(player);
  const legacyScore = getLegacyScore(player);

  return (
    <Card
      className="card-premium relative rounded-xl overflow-hidden cursor-pointer
                 border-2 border-yellow-500/40
                 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/10
                 transition-all duration-200 group"
      onClick={() => onPlayerSelect?.(player.id)}
    >
      <CardContent className="p-0">
        <div className="relative bg-gradient-to-r from-yellow-600/20 via-yellow-500/10 to-yellow-600/20
                        dark:from-yellow-500/15 dark:via-yellow-400/5 dark:to-yellow-500/15
                        px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
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
                {player.inductionYear && ` · Inducted ${player.inductionYear}`}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {(accoladeSummary.mvps > 0 || accoladeSummary.superBowls > 0 || accoladeSummary.proBowls > 0 || legacyScore > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {accoladeSummary.mvps > 0 && <AccoladeBadge label={`${accoladeSummary.mvps}x MVP`} gold />}
              {accoladeSummary.superBowls > 0 && <AccoladeBadge label={`${accoladeSummary.superBowls}x SB`} gold />}
              {accoladeSummary.proBowls > 0 && <AccoladeBadge label={`${accoladeSummary.proBowls}x Pro Bowl`} />}
              {legacyScore > 0 && <AccoladeBadge label={`Legacy ${legacyScore}`} />}
            </div>
          )}

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

          {Array.isArray(player.teamHistory) && player.teamHistory.length > 0 && (
            <div className="text-[10px] text-[color:var(--text-muted)] border-t border-[color:var(--hairline)] pt-2">
              Career path: {player.teamHistory.slice(0, 4).join(" → ")}
              {player.teamHistory.length > 4 ? " …" : ""}
            </div>
          )}
          {Array.isArray(player.inductionReasons) && player.inductionReasons.length > 0 && (
            <div className="text-[10px] text-[color:var(--text-muted)]">
              Why inducted: {player.inductionReasons.slice(0, 2).join(" · ")}
            </div>
          )}
        </div>

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

function sortHallPlayers(a, b, sortKey) {
  if (sortKey === "inductionYear") return (b.inductionYear ?? 0) - (a.inductionYear ?? 0);
  if (sortKey === "rings") return (b.accoladeSummary?.superBowls ?? 0) - (a.accoladeSummary?.superBowls ?? 0);
  if (sortKey === "awards") return ((b.accoladeSummary?.mvps ?? 0) + (b.accoladeSummary?.proBowls ?? 0)) - ((a.accoladeSummary?.mvps ?? 0) + (a.accoladeSummary?.proBowls ?? 0));
  if (sortKey === "peak") return (b.peakOvr ?? b.ovr ?? 0) - (a.peakOvr ?? a.ovr ?? 0);
  return getLegacyScore(b) - getLegacyScore(a);
}

function getLegacyScore(player) {
  const summary = player?.accoladeSummary ?? {};
  const rings = summary.superBowls ?? 0;
  const mvps = summary.mvps ?? 0;
  const pro = summary.proBowls ?? 0;
  const peak = player?.peakOvr ?? player?.ovr ?? 0;
  return (rings * 12) + (mvps * 10) + (pro * 2) + Math.round(peak / 5);
}

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
    ].filter((line) => line.value !== undefined);
  }
  if (["DL", "LB", "CB", "S"].includes(pos)) {
    return [
      { label: "Sacks", value: s.sacks },
      { label: "Games", value: s.gamesPlayed },
      { label: "Rush Yds", value: s.rushYds > 100 ? s.rushYds : undefined },
    ].filter((line) => line.value !== undefined);
  }

  return [
    { label: "Games", value: s.gamesPlayed },
    { label: "Pass Yds", value: s.passYds },
    { label: "Rush Yds", value: s.rushYds },
  ];
}
