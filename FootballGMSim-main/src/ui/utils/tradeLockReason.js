export function getTradeLockReason({ tradeLocked, tradeDeadline, phase }) {
  if (!tradeLocked) return null;
  const week = tradeDeadline?.deadlineWeek;
  if (phase === 'offseason' || phase === 'offseason_resign' || phase === 'free_agency') {
    return 'Trading is disabled during this offseason phase. Trading reopens during preseason.';
  }
  if (week != null) {
    return `The trade deadline passed after Week ${week}. Trading reopens in the offseason/preseason window.`;
  }
  return 'Trading is currently locked by league rules.';
}
