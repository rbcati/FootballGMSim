import React, { useEffect, useState } from 'react';
import LeagueDashboard from './components/LeagueDashboard';
import LiveGameWrapper from './components/LiveGameWrapper';
import { saveLeague, loadLeague } from '../db';
import '../../ui-enhancements.css';

const worker = new Worker(new URL('../worker/worker.js', import.meta.url), { type: 'module' });

function App() {
  const [league, setLeague] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [view, setView] = useState('dashboard');
  const [gameParams, setGameParams] = useState(null);
  const userTeamId = 0; // Default user team (Team 1)

  useEffect(() => {
    if (league) {
        window.state = { league, userTeamId };
    }
  }, [league]);

  useEffect(() => {
    // Load from DB on mount
    loadLeague().then(l => {
      if (l) {
          console.log('Loaded league from DB:', l);
          setLeague(l);
      }
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      console.log('Received message from worker:', type);

      if (type === 'GENERATE_LEAGUE_SUCCESS') {
        setLeague(payload);
        saveLeague(payload);
      } else if (type === 'SIM_WEEK_SUCCESS') {
        const { league: updatedLeague } = payload;
        setLeague(updatedLeague);
        saveLeague(updatedLeague);
        setSimulating(false);
      } else if (type.endsWith('_ERROR')) {
        console.error('Worker Error:', payload);
        setSimulating(false);
        alert('Simulation Error: ' + payload.message);
      }
    };
  }, []);

  const handleGenerate = () => {
    worker.postMessage({
      type: 'GENERATE_LEAGUE',
      payload: {
        teams: Array(32).fill(0).map((_, i) => ({
            id: i,
            name: `Team ${i+1}`,
            abbr: `T${i+1}`,
            conf: i < 16 ? 'AFC' : 'NFC',
            div: ['North', 'South', 'East', 'West'][Math.floor(i/4) % 4]
        })),
        options: { year: 2025 }
      }
    });
  };

  const handleSimWeek = () => {
    if (!league) return;
    setSimulating(true);
    worker.postMessage({ type: 'SIM_WEEK', payload: { league: league } });
  };

  const handlePlayNextGame = () => {
      if (!league || !league.schedule) {
          alert("No schedule found.");
          return;
      }
      const weekIdx = (league.week || 1) - 1;
      const weeks = league.schedule.weeks || league.schedule;
      if (!weeks || !weeks[weekIdx]) {
          alert("Season complete or invalid week.");
          return;
      }

      const games = weeks[weekIdx].games;
      // Find game involving user
      const game = games.find(g => g.home === userTeamId || g.home.id === userTeamId || g.away === userTeamId || g.away.id === userTeamId);

      if (game) {
          // Resolve team objects
          const homeId = typeof game.home === 'object' ? game.home.id : game.home;
          const awayId = typeof game.away === 'object' ? game.away.id : game.away;

          const homeTeam = league.teams.find(t => t.id === homeId);
          const awayTeam = league.teams.find(t => t.id === awayId);

          if (homeTeam && awayTeam) {
              setGameParams({
                  homeTeam,
                  awayTeam,
                  userTeamId
              });
              setView('game');
          } else {
              alert("Error finding teams for match.");
          }
      } else {
          alert(`No game scheduled for your team in Week ${league.week} (Bye Week?)`);
      }
  };

  const handleGameEnd = (result) => {
      console.log("Game finished:", result);
      saveLeague(league); // Save state
      setLeague({...league}); // Force update
      setView('dashboard');
  };

  if (view === 'game' && gameParams) {
      return (
          <div>
              <button onClick={() => setView('dashboard')} style={{ margin: 10, padding: 5 }}>Back to Dashboard</button>
              <LiveGameWrapper
                  homeTeam={gameParams.homeTeam}
                  awayTeam={gameParams.awayTeam}
                  userTeamId={gameParams.userTeamId}
                  onGameEnd={handleGameEnd}
              />
          </div>
      );
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Football GM (React + Worker)</h1>
      {!league ? (
        <button onClick={handleGenerate} style={{ padding: '10px 20px', fontSize: '16px' }}>Generate League</button>
      ) : (
        <>
          <div style={{ marginBottom: 20, display: 'flex', gap: '10px' }}>
            <button onClick={handleSimWeek} disabled={simulating} style={{ padding: '10px 20px', fontSize: '16px' }}>
              {simulating ? 'Simulating...' : `Simulate Week ${league.week}`}
            </button>
            <button onClick={handlePlayNextGame} disabled={simulating} style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Play Next Game 🏈
            </button>
          </div>
          <LeagueDashboard league={league} />
        </>
      )}
    </div>
  );
}

export default App;
