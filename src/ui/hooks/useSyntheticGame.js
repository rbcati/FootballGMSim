import { useState, useRef, useCallback, useEffect } from 'react';

// Simplified play types for visual variety
const PLAY_TYPES = [
  { type: 'run', text: 'Rush up the middle', gain: [1, 3, 4, 2, 5, -1, 0, 12, 45] },
  { type: 'pass', text: 'Pass complete', gain: [5, 7, 12, 15, 25, 0, 0, 8, 55] },
  { type: 'incomplete', text: 'Pass incomplete', gain: [0] },
  { type: 'sack', text: 'Sacked', gain: [-5, -8, -2] },
];

export function useSyntheticGame(homeAbbr, awayAbbr) {
  const [gameState, setGameState] = useState({
    possession: 'home', // 'home' or 'away'
    ballLocation: 25,   // 0-100 (0 = home endzone, 100 = away endzone)
    down: 1,
    distance: 10,
    quarter: 1,
    clock: '15:00',
    lastPlay: null,
    driveStart: 25,
  });

  const generatePlay = useCallback(() => {
    const playType = PLAY_TYPES[Math.floor(Math.random() * PLAY_TYPES.length)];
    const gain = playType.gain[Math.floor(Math.random() * playType.gain.length)];

    setGameState(prev => {
      let nextLoc = prev.possession === 'home'
        ? prev.ballLocation + gain
        : prev.ballLocation - gain;

      let nextDown = prev.down + 1;
      let nextDist = prev.distance - gain;
      let nextPossession = prev.possession;
      let eventText = `${prev.possession === 'home' ? homeAbbr : awayAbbr}: ${playType.text} for ${gain} yds`;

      // Touchdown
      if (prev.possession === 'home' && nextLoc >= 100) {
        return {
          ...prev,
          ballLocation: 100,
          lastPlay: { text: `TOUCHDOWN ${homeAbbr}!`, type: 'score' },
          possession: 'away',
          down: 1, distance: 10
        };
      } else if (prev.possession === 'away' && nextLoc <= 0) {
         return {
          ...prev,
          ballLocation: 0,
          lastPlay: { text: `TOUCHDOWN ${awayAbbr}!`, type: 'score' },
          possession: 'home',
          down: 1, distance: 10
        };
      }

      // First down
      if (nextDist <= 0) {
        nextDown = 1;
        nextDist = 10;
        eventText += ' - 1st Down!';
      }

      // Turnover on downs (simplified)
      if (nextDown > 4) {
        nextPossession = prev.possession === 'home' ? 'away' : 'home';
        nextDown = 1;
        nextDist = 10;
        eventText = 'Turnover on downs!';
      }

      return {
        ...prev,
        ballLocation: nextLoc,
        down: nextDown,
        distance: nextDist,
        possession: nextPossession,
        lastPlay: { text: eventText, type: playType.type }
      };
    });

    return gameState.lastPlay;
  }, [homeAbbr, awayAbbr]);

  return { gameState, generatePlay };
}
