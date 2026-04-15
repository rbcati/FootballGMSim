import React from "react";

function winnerState(game) {
  const awayScore = Number(game?.awayScore);
  const homeScore = Number(game?.homeScore);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return { awayWon: false, homeWon: false, tied: false };
  }
  return {
    awayWon: awayScore > homeScore,
    homeWon: homeScore > awayScore,
    tied: awayScore === homeScore,
  };
}

function StatusPill({ tone = "default", children }) {
  return <span className={`game-card-pill game-card-pill--${tone}`}>{children}</span>;
}

function TeamLine({ team, score, won = false, side }) {
  return (
    <div className={`game-team-line game-team-line--${side} ${won ? "is-winner" : ""}`}>
      <span className="game-team-line__abbr">{team?.abbr ?? "—"}</span>
      {score != null ? <span className="game-team-line__score">{score}</span> : null}
    </div>
  );
}

export function CompactGameResultRow({
  week,
  away,
  home,
  game,
  actionLabel,
  onOpen,
  disabled = false,
  note,
}) {
  const { awayWon, homeWon } = winnerState(game);
  const interactive = Boolean(onOpen && !disabled);
  return (
    <button
      type="button"
      className={`compact-game-row ${interactive ? "is-clickable" : "is-disabled"}`}
      onClick={interactive ? onOpen : undefined}
      disabled={!interactive}
      title={actionLabel}
    >
      <div className="compact-game-row__main">
        <span className="compact-game-row__week">W{week}</span>
        <TeamLine team={away} score={game?.awayScore} won={awayWon} side="away" />
        <span className="compact-game-row__at">@</span>
        <TeamLine team={home} score={game?.homeScore} won={homeWon} side="home" />
      </div>
      <div className="compact-game-row__meta">
        <span>{actionLabel}</span>
        {note ? <span>{note}</span> : null}
      </div>
    </button>
  );
}

export function CompletedGameCard({
  week,
  away,
  home,
  game,
  isUserGame = false,
  canOpenBoxScore = false,
  canOpenResult = false,
  statusLabel,
  archiveQuality = "missing",
  recap,
  summary,
  onOpen,
  secondaryActions,
}) {
  const { awayWon, homeWon, tied } = winnerState(game);
  const interactive = Boolean(onOpen && (canOpenBoxScore || canOpenResult));
  const primaryLabel = canOpenBoxScore ? "Open box score" : canOpenResult ? "View result" : "Unavailable";
  return (
    <article className={`premium-game-card is-completed ${isUserGame ? "is-user-game" : ""} ${interactive ? "is-clickable" : "is-disabled"}`}>
      <div className="premium-game-card__head">
        <div className="premium-game-card__week">Week {week}</div>
        <div className="premium-game-card__chips">
          <StatusPill tone="result">Final</StatusPill>
          <StatusPill tone={isUserGame ? "user" : "league"}>{isUserGame ? "User game" : "League game"}</StatusPill>
        </div>
      </div>
      <button
        type="button"
        className="premium-game-card__scoreblock"
        onClick={interactive ? onOpen : undefined}
        disabled={!interactive}
        aria-label={interactive ? `${primaryLabel}: ${away?.abbr} at ${home?.abbr}` : undefined}
      >
        <TeamLine team={away} score={game?.awayScore} won={awayWon} side="away" />
        <span className="premium-game-card__at">@</span>
        <TeamLine team={home} score={game?.homeScore} won={homeWon} side="home" />
      </button>
      <div className="premium-game-card__statusline">
        <strong>{primaryLabel}</strong>
        <span>{statusLabel ?? "Archive status unavailable"}</span>
      </div>
      {!interactive ? (
        <div className={`premium-game-card__fallback ${archiveQuality === "partial" ? "is-partial" : "is-missing"}`}>
          <strong>{archiveQuality === "partial" ? "Partial archive available" : "Detailed box score unavailable"}</strong>
          <p>
            {archiveQuality === "partial"
              ? "Final score and summary are saved, but full drive/play data was not archived."
              : "Result is recorded for standings and history, but full game details were not archived."}
          </p>
          {summary ? <p>{summary}</p> : null}
          {recap ? <p>{recap}</p> : null}
        </div>
      ) : null}
      {(tied || recap || summary) && interactive ? (
        <div className="premium-game-card__story">
          {summary ? <strong>{summary}</strong> : null}
          <span>{recap ?? (tied ? "Final ended tied." : "Open game for full breakdown.")}</span>
        </div>
      ) : null}
      {secondaryActions ? <div className="premium-game-card__actions">{secondaryActions}</div> : null}
    </article>
  );
}

export function UpcomingGameCard({ week, away, home, isUserGame = false, onOpenGame, canOpenGame = false, angles = [], secondaryActions }) {
  return (
    <article className={`premium-game-card is-upcoming ${isUserGame ? "is-user-game" : ""}`}>
      <div className="premium-game-card__head">
        <div className="premium-game-card__week">Week {week}</div>
        <div className="premium-game-card__chips">
          <StatusPill tone="upcoming">Upcoming</StatusPill>
          <StatusPill tone={isUserGame ? "user" : "league"}>{isUserGame ? "User game" : "League game"}</StatusPill>
        </div>
      </div>
      <div className="premium-game-card__matchup">
        <TeamLine team={away} side="away" />
        <span className="premium-game-card__at">@</span>
        <TeamLine team={home} side="home" />
      </div>
      <div className="premium-game-card__statusline">
        <strong>{canOpenGame ? "Open game" : "Scheduled"}</strong>
        <span>{canOpenGame ? "Open matchup context and team detail." : "Game detail unlocks when available."}</span>
      </div>
      {angles?.length ? (
        <div className="premium-game-card__angles">
          {angles.map((angle) => <span key={angle.key} className={`premium-game-card__angle tone-${angle.tone ?? "neutral"}`}>{angle.label}</span>)}
        </div>
      ) : null}
      <div className="premium-game-card__actions">
        <button className="btn btn-sm" onClick={onOpenGame} disabled={!canOpenGame}>Open game</button>
        {secondaryActions}
      </div>
    </article>
  );
}

export function LinkedGameSummaryCard({ title, subtitle, label, onOpen, disabled = false }) {
  const interactive = Boolean(onOpen && !disabled);
  return (
    <button
      type="button"
      className={`linked-game-summary ${interactive ? "is-clickable" : "is-disabled"}`}
      onClick={interactive ? onOpen : undefined}
      disabled={!interactive}
    >
      <div className="linked-game-summary__eyebrow">{label}</div>
      <div className="linked-game-summary__title">{title}</div>
      <div className="linked-game-summary__subtitle">{subtitle}</div>
      <div className="linked-game-summary__cta">{interactive ? "Open game →" : "Unavailable"}</div>
    </button>
  );
}
