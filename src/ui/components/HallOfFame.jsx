/**
 * HallOfFame.jsx
 *
 * Premium gallery view of Hall of Fame inductees.
 */
import React, { useEffect, useMemo, useState } from "react";
import ResponsivePlayerAvatar from "./ResponsivePlayerAvatar.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader, EmptyState } from "./ScreenSystem.jsx";

function resolvedLegacyScore(player) {
  const n = Number(player?.legacyScore ?? player?.hofScore);
  if (Number.isFinite(n) && n > 0) return n;
  return getLegacyScoreFallback(player);
}

function getLegacyScoreFallback(player) {
  const summary = player?.accoladeSummary ?? {};
  const rings = summary.superBowls ?? 0;
  const mvps = summary.mvps ?? 0;
  const pro = summary.proBowls ?? 0;
  const peak = player?.peakOvr ?? player?.ovr ?? 0;
  return (rings * 12) + (mvps * 10) + (pro * 2) + Math.round(peak / 5);
}

export default function HallOfFame({ onPlayerSelect, actions }) {
  const [players, setPlayers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("legacy");
  const [classFilter, setClassFilter] = useState("ALL");

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    actions
      .getHallOfFame()
      .then((response) => {
        if (mounted) {
          setPlayers(response?.payload?.players ?? []);
          setClasses(response?.payload?.classes ?? []);
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

  const classOptions = useMemo(() => {
    const fromClasses = (classes ?? []).map((c) => String(c.year));
    const fromPlayers = (players ?? []).map((p) => String(p.inductionYear ?? ""));
    const merged = [...new Set([...fromClasses, ...fromPlayers].filter(Boolean))];
    return ["ALL", ...merged.sort((a, b) => Number(b) - Number(a))];
  }, [players, classes]);

  const filteredPlayers = useMemo(() => {
    const list = (players ?? []).filter((p) => {
      if (positionFilter !== "ALL" && p.pos !== positionFilter) return false;
      if (classFilter !== "ALL") {
        const cls = (classes ?? []).find((c) => String(c.year) === classFilter);
        const ids = new Set((cls?.inductees ?? []).map((i) => String(i.playerId)));
        if (ids.size) {
          if (!ids.has(String(p.id))) return false;
        } else if (String(p.inductionYear ?? "") !== classFilter) {
          return false;
        }
      }
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.pos, p.primaryTeam, p.primaryTeamAbbr]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => sortHallPlayers(a, b, sortKey));
  }, [players, classes, positionFilter, classFilter, search, sortKey]);

  const latestClass = useMemo(() => {
    const sorted = [...(classes ?? [])].sort((a, b) => Number(b.year) - Number(a.year));
    const yr = sorted[0]?.year;
    if (yr == null) {
      const yr2 = classOptions.find((value) => value !== "ALL");
      return yr2 ? filteredPlayers.filter((p) => String(p.inductionYear) === yr2).slice(0, 3) : filteredPlayers.slice(0, 3);
    }
    return filteredPlayers.filter((p) => String(p.inductionYear) === String(yr)).slice(0, 3);
  }, [classes, classOptions, filteredPlayers]);

  const sortedClasses = useMemo(
    () => [...(classes ?? [])].sort((a, b) => Number(b.year) - Number(a.year)),
    [classes],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        Loading Hall of Fame...
      </div>
    );
  }

  const hasPlayers = players && players.length > 0;
  const hasClasses = classes && classes.length > 0;
  if (!hasPlayers && !hasClasses) {
    return (
      <div className="app-screen-stack" data-testid="hall-of-fame-empty">
        <ScreenHeader title="Hall of Fame" subtitle="Career achievement archive and notable induction classes." />
        <EmptyState
          title="No Hall of Fame classes yet."
          body="Retired legends will appear here after their careers are complete."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 app-screen-stack" data-testid="hall-of-fame-screen">
      <ScreenHeader
        title="Hall of Fame"
        subtitle="Explore inductions, teams, awards, and peak greatness."
        metadata={[{ label: "Legends", value: `${filteredPlayers.length}/${(players ?? []).length}` }]}
      />
      {sortedClasses.length > 0 && (
        <Card className="card-premium" data-testid="hall-of-fame-classes">
          <CardContent className="p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Induction classes</div>
            {sortedClasses.map((c) => (
              <div key={c.classId ?? `hof-${c.year}`} className="border border-[color:var(--hairline)] rounded-lg p-3 space-y-2">
                <div className="text-sm font-semibold">Class of {c.year}</div>
                <ul className="space-y-2 text-sm">
                  {(c.inductees ?? []).map((ind, idx) => (
                    <li key={ind?.playerId != null ? String(ind.playerId) : `hof-${c.year ?? "y"}-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <button
                        type="button"
                        className="text-left font-medium text-[color:var(--accent)] hover:underline"
                        onClick={() => onPlayerSelect?.(ind.playerId)}
                      >
                        {ind.name}
                        <span className="text-[color:var(--text-muted)] font-normal"> · {ind.pos}</span>
                        {ind.primaryTeamAbbr ? <span className="text-[color:var(--text-muted)] font-normal"> · {ind.primaryTeamAbbr}</span> : null}
                      </button>
                      <div className="flex flex-wrap gap-1 items-center text-xs text-[color:var(--text-muted)]">
                        {ind.tier ? <Badge variant="outline" className="text-[10px]">{String(ind.tier)}</Badge> : null}
                        <span>Legacy {ind.legacyScore ?? ind.score ?? "—"}</span>
                        {Array.isArray(ind.reasons) && ind.reasons.length > 0 ? (
                          <span className="hidden sm:inline">· {ind.reasons.slice(0, 3).join(" · ")}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {latestClass.length > 0 && (
        <Card className="card-premium">
          <CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Class spotlight</div>
            <div className="text-sm font-semibold">Latest class standouts</div>
            <div className="flex flex-wrap gap-2">
              {latestClass.map((p) => (
                <button key={`spot-${p.id}`} className="rounded-full border border-[color:var(--hairline)] px-3 py-1 text-xs" onClick={() => onPlayerSelect?.(p.id)}>
                  {p.inductionYear ?? "—"} · {p.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {hasPlayers && (
        <>
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
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-sm"
                >
                  {classOptions.map((option) => (
                    <option key={option} value={option}>{option === "ALL" ? "All classes" : `Class of ${option}`}</option>
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
                <div className="h-9 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-xs text-[color:var(--text-muted)] flex items-center sm:col-span-2">
                  Click any card to open full player archive.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="hall-of-fame-cards">
            {filteredPlayers.map((player) => (
              <HofCard
                key={player.id}
                player={player}
                onPlayerSelect={onPlayerSelect}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HofCard({ player, onPlayerSelect }) {
  const { accoladeSummary } = player;
  const summary = accoladeSummary ?? { mvps: 0, superBowls: 0, proBowls: 0 };
  const primaryStat = getPrimaryStat(player);
  const legacyScore = resolvedLegacyScore(player);
  const tier = player.tier;

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
                <span className="text-[color:var(--text-muted)]">{player.primaryTeam || player.primaryTeamAbbr || "N/A"}</span>
              </div>
              <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                {player.seasonsPlayed > 0 && `${player.seasonsPlayed} season${player.seasonsPlayed !== 1 ? "s" : ""}`}
                {player.inductionYear && ` · Inducted ${player.inductionYear}`}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {(summary.mvps > 0 || summary.superBowls > 0 || summary.proBowls > 0 || legacyScore > 0 || tier) && (
            <div className="flex flex-wrap gap-1.5">
              {tier ? <AccoladeBadge label={String(tier)} gold /> : null}
              {summary.mvps > 0 && <AccoladeBadge label={`${summary.mvps}x MVP`} gold />}
              {summary.superBowls > 0 && <AccoladeBadge label={`${summary.superBowls}x SB`} gold />}
              {summary.proBowls > 0 && <AccoladeBadge label={`${summary.proBowls}x Pro Bowl`} />}
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
              Why inducted: {player.inductionReasons.slice(0, 4).join(" · ")}
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
  return resolvedLegacyScore(b) - resolvedLegacyScore(a);
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
