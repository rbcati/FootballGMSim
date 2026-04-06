export function toFiniteNumber(value, fallback = null) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeRound(value, digits = 0, fallback = 0) {
  const n = toFiniteNumber(value, null);
  if (n == null) return fallback;
  const factor = 10 ** Math.max(0, digits);
  return Math.round(n * factor) / factor;
}

export function clampPercent(value, fallback = null) {
  const n = toFiniteNumber(value, fallback);
  if (n == null) return fallback;
  return Math.max(0, Math.min(100, n));
}

export function formatMoneyM(value, fallbackText = "—", { digits = 1, signed = false } = {}) {
  const n = toFiniteNumber(value, null);
  if (n == null) return fallbackText;
  const abs = Math.abs(n).toFixed(digits);
  if (signed) {
    if (n < 0) return `-$${abs}M`;
    if (n > 0) return `+$${abs}M`;
  }
  return `$${n.toFixed(digits)}M`;
}

export function formatPercent(value, fallbackText = "—", { digits = 0, clamp = true } = {}) {
  const n = toFiniteNumber(value, null);
  if (n == null) return fallbackText;
  const pct = clamp ? clampPercent(n, 0) : n;
  return `${pct.toFixed(digits)}%`;
}

export function deriveTeamCapSnapshot(team, { fallbackCapTotal = 255 } = {}) {
  const capTotal = toFiniteNumber(team?.capTotal, fallbackCapTotal);
  const inputCapRoom = toFiniteNumber(team?.capRoom ?? team?.capSpace, null);
  const deadCap = Math.max(0, toFiniteNumber(team?.deadCap, 0));
  const inputCapUsed = toFiniteNumber(team?.capUsed, null);

  const capUsed = inputCapUsed != null
    ? Math.max(0, inputCapUsed)
    : inputCapRoom != null
      ? Math.max(0, capTotal - inputCapRoom)
      : 0;

  const capRoom = inputCapRoom != null ? inputCapRoom : capTotal - capUsed;
  const activeCap = Math.max(0, capUsed - deadCap);
  const usedPct = capTotal > 0 ? clampPercent((capUsed / capTotal) * 100, 0) : 0;

  return {
    capTotal,
    capUsed,
    capRoom,
    deadCap,
    activeCap,
    usedPct,
  };
}
