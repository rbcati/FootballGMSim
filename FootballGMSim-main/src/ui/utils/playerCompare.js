import { useMemo, useState } from 'react';

export function nextCompareIds(prev, playerId, max = 2) {
  if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
  if (prev.length >= max) return [...prev.slice(1), playerId];
  return [...prev, playerId];
}

export function usePlayerCompare(players = [], max = 2) {
  const [compareIds, setCompareIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  const toggleCompare = (player) => {
    if (!player?.id) return;
    setCompareIds((prev) => nextCompareIds(prev, player.id, max));
  };

  const comparePlayerA = useMemo(() => players.find((p) => p.id === compareIds[0]), [players, compareIds]);
  const comparePlayerB = useMemo(() => players.find((p) => p.id === compareIds[1]), [players, compareIds]);

  return {
    compareIds,
    setCompareIds,
    showComparison,
    setShowComparison,
    toggleCompare,
    comparePlayerA,
    comparePlayerB,
  };
}
