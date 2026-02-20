import React, { useEffect, useRef } from 'react';
import { LiveGameViewer } from '../../../live-game-viewer.js';
import '../../../ui-enhancements.css';

const LiveGameWrapper = ({ homeTeam, awayTeam, userTeamId, onGameEnd }) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !homeTeam || !awayTeam) return;

    console.log("Initializing LiveGameViewer...", { home: homeTeam.name, away: awayTeam.name });

    // Initialize viewer
    const viewer = new LiveGameViewer();
    viewerRef.current = viewer;

    // Setup callback
    viewer.onGameEndCallback = (result) => {
        console.log("Game Ended:", result);
        if (onGameEnd) onGameEnd(result);
    };

    try {
        // Initialize logic
        viewer.initGame(homeTeam, awayTeam, userTeamId);

        // Render to the specific container ID
        // Note: LiveGameViewer expects a selector string
        viewer.renderToView('#game-sim');

        // Start simulation loop
        viewer.startSim();
    } catch (e) {
        console.error("Failed to start live game:", e);
    }

    // Cleanup on unmount
    return () => {
      if (viewerRef.current) {
        console.log("Destroying LiveGameViewer instance");
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [homeTeam, awayTeam, userTeamId]);

  return (
    <div className="live-game-wrapper" style={{ width: '100%', minHeight: '800px', position: 'relative' }}>
      {/*
          The LiveGameViewer looks for #game-sim.
          We provide it here.
          Ideally we'd refactor LiveGameViewer to take a ref, but we stick to existing API.
      */}
      <div id="game-sim" ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
};

export default LiveGameWrapper;
