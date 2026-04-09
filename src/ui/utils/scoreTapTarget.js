export function createBoxScoreTapHandler({ gameId, onOpenBoxScore } = {}) {
  if (!gameId || typeof onOpenBoxScore !== "function") return undefined;

  return (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onOpenBoxScore(gameId);
  };
}
