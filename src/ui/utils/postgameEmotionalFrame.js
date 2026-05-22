/**
 * postgameEmotionalFrame.js
 *
 * Deterministic, rule-based emotional context for the post-game summary.
 * No LLM, no randomness — derives takeaways from actual game data.
 */

function num(v, fallback = 0) {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function toId(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'object') return num(raw.id, NaN);
  return num(raw, NaN);
}

// ── Tone helpers ──────────────────────────────────────────────────────────────

function momentumTone(change) {
  if (num(change) > 1) return 'ok';
  if (num(change) < -1) return 'danger';
  return 'info';
}

// ── Positive takeaway rules ───────────────────────────────────────────────────

function deriveBiggestPositive(opts) {
  const { won, margin, isOT, isComeback, leaders, injuryCount, phase } = opts;

  if (!won) return null;

  if (phase === 'playoffs') {
    if (isComeback) return { label: 'Playoff Comeback', detail: 'Refused to quit — rallied late to advance.' };
    if (margin >= 14) return { label: 'Playoff Statement', detail: 'Dominated when it mattered most.' };
    return { label: 'Playoff Win', detail: 'One step closer to the championship.' };
  }

  if (isComeback) return { label: 'Comeback Win', detail: 'Team showed resilience and refused to fold late.' };
  if (isOT) return { label: 'Overtime Winner', detail: 'Clutch performance when every drive counted.' };
  if (margin >= 21) return { label: 'Dominant Win', detail: 'Complete team performance — offense and defense firing.' };
  if (margin >= 10) return { label: 'Solid Victory', detail: 'Controlled the game from start to finish.' };
  if (margin <= 3) return { label: 'Gutsy Win', detail: 'Found a way to win in a tight, well-contested game.' };

  const topLeader = leaders?.[0];
  if (topLeader) return {
    label: `${topLeader.name ?? 'Star performer'} delivered`,
    detail: `A standout ${topLeader.pos ?? 'performance'} helped seal the win.`,
  };

  return { label: 'Hard-Fought Win', detail: 'Team executed when it mattered.' };
}

// ── Concern rules ─────────────────────────────────────────────────────────────

function deriveBiggestConcern(opts) {
  const { won, margin, injuries, leaders, teamStats, userIsHome } = opts;

  const severeInjuries = (injuries ?? []).filter((p) => num(p?.injuryWeeksRemaining ?? p?.injury?.gamesRemaining, 0) >= 4);
  if (severeInjuries.length > 0) {
    const top = severeInjuries[0];
    const _composed = `${top?.firstName ?? ''} ${top?.lastName ?? ''}`.trim();
    const name = top?.name ?? (_composed || 'Key player');
    const weeks = num(top?.injuryWeeksRemaining ?? top?.injury?.gamesRemaining, 0);
    return {
      label: 'Injury concern',
      detail: `${name} is out ${weeks} week${weeks === 1 ? '' : 's'} — roster depth will be tested.`,
      tone: weeks >= 8 ? 'danger' : 'warning',
    };
  }

  if (!won && margin >= 21) {
    return { label: 'Performance review needed', detail: 'A lopsided result raises questions on both sides of the ball.', tone: 'danger' };
  }

  const userOffSide = userIsHome ? teamStats?.home : teamStats?.away;
  const turnoversCommitted = num(userOffSide?.turnovers, 0);
  if (turnoversCommitted >= 3) {
    return { label: 'Turnover problem', detail: `Gave the ball away ${turnoversCommitted} times — cannot sustain that going forward.`, tone: 'warning' };
  }

  const passYds = num(userOffSide?.passYds, 0);
  const rushYds = num(userOffSide?.rushYds, 0);
  if (passYds < 150 && rushYds < 80) {
    return { label: 'Offense stalled', detail: 'Struggling to move the chains in both phases — game plan needs adjustment.', tone: 'warning' };
  }

  if (!won && margin <= 3) {
    return { label: 'Execution at the margins', detail: 'This game came down to a play or two — focus on red zone efficiency.', tone: 'info' };
  }

  if (won) return null;
  return { label: 'Respond next week', detail: 'A tough result — use the film room to diagnose what went wrong.', tone: 'info' };
}

// ── Standout player ───────────────────────────────────────────────────────────

function deriveStandoutPlayer(leaders) {
  if (!Array.isArray(leaders) || leaders.length === 0) return null;
  return leaders[0] ?? null;
}

// ── Momentum direction ────────────────────────────────────────────────────────

function deriveMomentumDirection(opts) {
  const { won, margin, momentumChange, recentResults } = opts;

  const tail = Array.isArray(recentResults) ? [...recentResults].reverse().slice(0, 3) : [];
  const recentWins = tail.filter((r) => String(r).toUpperCase() === 'W').length;

  const change = num(momentumChange, 0);

  const lastTwo = tail.slice(0, 2);
  const backToBackWins = lastTwo.length === 2 && lastTwo.every((r) => String(r).toUpperCase() === 'W');
  if (won && backToBackWins && margin >= 7) {
    return { label: 'Rising fast', detail: 'Back-to-back wins — building real momentum heading into next week.', tone: 'ok', icon: '↑' };
  }
  if (won && change > 0) {
    return { label: 'Trending up', detail: 'A confidence-building win adds to a positive run of form.', tone: 'ok', icon: '↑' };
  }
  if (!won && recentWins === 0 && tail.length >= 2) {
    return { label: 'Under pressure', detail: 'Back-to-back losses — need a response before things unravel.', tone: 'danger', icon: '↓' };
  }
  if (!won && change < 0) {
    return { label: 'Slipping', detail: 'A dip in form after this result — bounce back starts in practice.', tone: 'warning', icon: '↓' };
  }
  return { label: 'Balanced', detail: 'Even keel — form fluctuating but season still on track.', tone: 'info', icon: '→' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build an emotional frame for the post-game summary.
 *
 * @param {object}  gameResult      - The gameResult object from PostGameSummary
 * @param {Array}   [leaders]       - Game leaders array (name, pos, statLine)
 * @param {Array}   [injuries]      - Injured players array
 * @param {number}  [momentumChange]- Momentum delta (positive = up)
 * @param {Array}   [recentResults] - Recent W/L results for user team
 * @returns {{
 *   biggestPositive: { label: string, detail: string } | null,
 *   biggestConcern:  { label: string, detail: string, tone: string } | null,
 *   standoutPlayer:  { name: string, pos: string, statLine: string } | null,
 *   momentumDirection: { label: string, detail: string, tone: string, icon: string }
 * }}
 */
export function buildPostgameEmotionalFrame(gameResult, leaders = [], injuries = [], momentumChange = 0, recentResults = []) {
  if (!gameResult) return null;

  const { homeScore = 0, awayScore = 0, userTeamId, phase } = gameResult;
  const homeId = toId(gameResult.homeTeam ?? gameResult.homeId ?? gameResult.home);
  const awayId = toId(gameResult.awayTeam ?? gameResult.awayId ?? gameResult.away);
  const userIsHome = !isNaN(homeId) && num(homeId) === num(userTeamId);
  const userScore = userIsHome ? homeScore : awayScore;
  const oppScore = userIsHome ? awayScore : homeScore;
  const margin = Math.abs(userScore - oppScore);
  const won = userScore > oppScore;
  const tied = userScore === oppScore;

  const teamStats = gameResult.teamStats ?? null;

  // Detect OT from score parity + quarter count
  const isOT = !!(
    num(gameResult.ot, 0) > 0 ||
    num(gameResult.overtimePeriods, 0) > 0 ||
    (Array.isArray(gameResult.quarterScores) &&
      Array.isArray(gameResult.quarterScores[0]) &&
      gameResult.quarterScores[0].length > 4)
  );

  // Detect comeback: trailing after 3 quarters but won
  let isComeback = false;
  if (won && Array.isArray(gameResult.quarterScores) && gameResult.quarterScores.length >= 2) {
    const homeThrough3 = (gameResult.quarterScores[0] ?? []).slice(0, 3).reduce((s, q) => s + num(q), 0);
    const awayThrough3 = (gameResult.quarterScores[1] ?? []).slice(0, 3).reduce((s, q) => s + num(q), 0);
    const deficit = userIsHome ? awayThrough3 - homeThrough3 : homeThrough3 - awayThrough3;
    if (deficit >= 7) isComeback = true;
  }

  const biggestPositive = tied ? null : deriveBiggestPositive({
    won, margin, isOT, isComeback, leaders, injuryCount: injuries.length, phase,
  });

  const biggestConcern = deriveBiggestConcern({
    won, margin, injuries, leaders, teamStats, userIsHome,
  });

  const standoutPlayer = deriveStandoutPlayer(leaders);

  const momentumDirection = deriveMomentumDirection({
    won, margin, momentumChange, recentResults,
  });

  return { biggestPositive, biggestConcern, standoutPlayer, momentumDirection };
}
