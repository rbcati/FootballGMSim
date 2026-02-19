import React, { useEffect, useState } from 'react';
import LeagueDashboard from './components/LeagueDashboard';
import { saveLeague, loadLeague } from '../db';

const worker = new Worker(new URL('../worker/worker.js', import.meta.url), { type: 'module' });

function App() {
  const [league, setLeague] = useState(null);
  const [simulating, setSimulating] = useState(false);

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

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Football GM (React + Worker)</h1>
      {!league ? (
        <button onClick={handleGenerate} style={{ padding: '10px 20px', fontSize: '16px' }}>Generate League</button>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <button onClick={handleSimWeek} disabled={simulating} style={{ padding: '10px 20px', fontSize: '16px' }}>
              {simulating ? 'Simulating...' : `Simulate Week ${league.week}`}
            </button>
          </div>
          <LeagueDashboard league={league} />
        </>
      )}
    </div>
  );
}

export default App;
