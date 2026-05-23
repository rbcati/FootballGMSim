import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const REPLAY_INTERVAL_MS = 1800;

const mdash = "—";

function buildEventList(gfs) {
  if (!gfs || typeof gfs !== "object") return [];
  const scores = Array.isArray(gfs.scoringTimeline) ? gfs.scoringTimeline : [];
  const turns = Array.isArray(gfs.turningPoints) ? gfs.turningPoints : [];
  const mapped = [
    ...scores
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        kind: "score",
        quarter: typeof e.quarter === "number" && e.quarter > 0 ? e.quarter : 1,
        label: String(e.label ?? "Score"),
        description: String(e.description ?? ""),
        score: e.scoreAfter && typeof e.scoreAfter === "object" ? e.scoreAfter : null,
        teamId: e.teamId ?? null,
      })),
    ...turns
      .filter((tp) => tp && typeof tp === "object")
      .map((tp) => ({
        kind: "turning_point",
        quarter: typeof tp.quarter === "number" && tp.quarter > 0 ? tp.quarter : 1,
        label: String(tp.label ?? "Key Play"),
        description: String(tp.description ?? ""),
        score:
          tp.scoreContext && typeof tp.scoreContext === "object" ? tp.scoreContext : null,
        teamId: tp.teamId ?? null,
      })),
  ];
  // Stable sort by quarter — scoring events precede turning points from same quarter
  return mapped.sort((a, b) => a.quarter - b.quarter);
}

function formatScoreLine(score) {
  if (!score || typeof score !== "object") return null;
  const a = score.away ?? null;
  const h = score.home ?? null;
  if (a == null && h == null) return null;
  return `${a ?? mdash}${mdash}${h ?? mdash}`;
}

function resolveTeamLabel(event, homeTeam, awayTeam) {
  if (event.teamId == null) return null;
  const tid = String(event.teamId);
  if (homeTeam?.id != null && tid === String(homeTeam.id)) return homeTeam.abbr ?? "Home";
  if (awayTeam?.id != null && tid === String(awayTeam.id)) return awayTeam.abbr ?? "Away";
  return null;
}

export default function ReplayableGameFlowViewer({
  gameFlowSummary,
  homeTeam,
  awayTeam,
  finalScore,
  initialMode,
}) {
  const events = useMemo(() => buildEventList(gameFlowSummary), [gameFlowSummary]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(initialMode === "playing");
  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start interval while playing; cleanup on pause or dependency change
  useEffect(() => {
    if (!isPlaying || events.length === 0) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev >= events.length - 1 ? prev : prev + 1));
    }, REPLAY_INTERVAL_MS);
    return stopTimer;
  }, [isPlaying, events.length, stopTimer]);

  // Auto-stop when the last event is reached
  useEffect(() => {
    if (isPlaying && index >= events.length - 1) {
      stopTimer();
      setIsPlaying(false);
    }
  }, [isPlaying, index, events.length, stopTimer]);

  // Always clear timer on unmount
  useEffect(() => stopTimer, [stopTimer]);

  if (events.length === 0) return null;

  const total = events.length;
  const atEnd = index >= total - 1;
  const current = events[index] ?? null;
  const revealed = events.slice(0, index);

  const gfs = gameFlowSummary;
  const homeFlow =
    gfs?.teamFlow && homeTeam?.id != null
      ? gfs.teamFlow[String(homeTeam.id)] ?? null
      : null;
  const awayFlow =
    gfs?.teamFlow && awayTeam?.id != null
      ? gfs.teamFlow[String(awayTeam.id)] ?? null
      : null;

  const teamFlowRows = [
    ["Scoring Drives", awayFlow?.scoringDrives, homeFlow?.scoringDrives],
    ["Turnovers", awayFlow?.turnovers, homeFlow?.turnovers],
    [
      "Red Zone (Scr/Trips)",
      awayFlow != null ? `${awayFlow.redZoneScores}/${awayFlow.redZoneTrips}` : null,
      homeFlow != null ? `${homeFlow.redZoneScores}/${homeFlow.redZoneTrips}` : null,
    ],
    ["Explosive Plays", awayFlow?.explosivePlays, homeFlow?.explosivePlays],
  ].filter(([, a, h]) => a != null || h != null);

  return (
    <div data-testid="rgfv-root" style={{ display: "grid", gap: "0.75rem" }}>
      {/* Progress */}
      <div className="bs-section-header">
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>
          Event {index + 1} of {total}
        </span>
        <span
          className="bs-section-count"
          data-testid="rgfv-progress"
          aria-live="polite"
          aria-atomic="true"
        >
          {isPlaying ? "Playing…" : atEnd ? "Complete" : "Paused"}
        </span>
      </div>

      {/* Controls */}
      <div
        data-testid="rgfv-controls"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
      >
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          data-testid="rgfv-btn-restart"
          onClick={() => {
            stopTimer();
            setIsPlaying(false);
            setIndex(0);
          }}
          aria-label="Restart replay from beginning"
        >
          Restart
        </button>
        {isPlaying ? (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            data-testid="rgfv-btn-pause"
            onClick={() => {
              stopTimer();
              setIsPlaying(false);
            }}
            aria-label="Pause replay"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            data-testid="rgfv-btn-play"
            onClick={() => {
              if (!atEnd) setIsPlaying(true);
            }}
            disabled={atEnd}
            aria-label="Play replay"
          >
            Play
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          data-testid="rgfv-btn-step"
          onClick={() => {
            if (!atEnd) {
              stopTimer();
              setIsPlaying(false);
              setIndex((prev) => Math.min(prev + 1, total - 1));
            }
          }}
          disabled={atEnd}
          aria-label="Step to next event"
        >
          Step
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          data-testid="rgfv-btn-skip-end"
          onClick={() => {
            stopTimer();
            setIsPlaying(false);
            setIndex(total - 1);
          }}
          disabled={atEnd}
          aria-label="Skip to final event"
        >
          Skip to End
        </button>
      </div>

      {/* Active event card */}
      {current && (
        <div
          className="bs-list-item"
          data-testid="rgfv-current-event"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            display: "grid",
            gap: "4px",
            background: "var(--surface-strong)",
            borderRadius: "8px",
            padding: "10px 12px",
          }}
        >
          <strong data-testid="rgfv-current-label">
            {`Q${current.quarter} · ${current.label}`}
            {resolveTeamLabel(current, homeTeam, awayTeam)
              ? ` · ${resolveTeamLabel(current, homeTeam, awayTeam)}`
              : ""}
          </strong>
          {current.description ? (
            <span data-testid="rgfv-current-desc">{current.description}</span>
          ) : null}
          {formatScoreLine(current.score) ? (
            <span
              data-testid="rgfv-current-score"
              style={{ fontSize: "0.8rem", color: "var(--text-subtle)" }}
            >
              {formatScoreLine(current.score)}
            </span>
          ) : null}
        </div>
      )}

      {/* Previously revealed events */}
      {revealed.length > 0 && (
        <div
          data-testid="rgfv-history"
          aria-label="Previously revealed game events"
          style={{ maxHeight: "180px", overflowY: "auto", overflowX: "hidden" }}
        >
          <ul className="bs-list" style={{ margin: 0, listStyle: "none", padding: 0 }}>
            {revealed.map((ev, i) => (
              <li
                key={i}
                className="bs-list-item"
                data-testid="rgfv-history-item"
                style={{ fontSize: "0.8rem", opacity: 0.65 }}
              >
                <strong>{`Q${ev.quarter} · ${ev.label}`}</strong>
                {ev.description ? <span>{ev.description}</span> : null}
                {formatScoreLine(ev.score) ? (
                  <span>{formatScoreLine(ev.score)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Team flow summary */}
      {teamFlowRows.length > 0 && (
        <div data-testid="rgfv-team-flow">
          <h5
            style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.25rem" }}
          >
            Team Flow
          </h5>
          <div className="bs-table-wrap" role="region" aria-label="Team flow snapshot">
            <table className="box-score-table">
              <caption className="sr-only">
                Team flow: scoring drives, turnovers, red zone, explosive plays
              </caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">{awayTeam?.abbr ?? "Away"}</th>
                  <th scope="col">{homeTeam?.abbr ?? "Home"}</th>
                </tr>
              </thead>
              <tbody>
                {teamFlowRows.map(([label, away, home]) => (
                  <tr key={label} data-testid="rgfv-team-flow-row">
                    <td>{label}</td>
                    <td>{away ?? mdash}</td>
                    <td>{home ?? mdash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Final score — shown once replay reaches the last event */}
      {atEnd && finalScore && (
        <div
          data-testid="rgfv-final-score"
          style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem" }}
        >
          {`Final: ${finalScore.away ?? mdash}${mdash}${finalScore.home ?? mdash}`}
        </div>
      )}
    </div>
  );
}
