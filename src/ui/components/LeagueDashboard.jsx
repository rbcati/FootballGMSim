import React from 'react';

export default function LeagueDashboard({ league }) {
  if (!league) return null;
  if (!league.schedule || !league.schedule.weeks) {
    return (
      <div style={{
        padding: '20px',
        color: '#721c24',
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px'
      }}>
        Error: Schedule data missing
      </div>
    );
  }

  const sortedTeams = [...league.teams].sort((a, b) => b.wins - a.wins);

  return (
    <div>
      <h2>Standings (Week {league.week})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th>Rank</th>
              <th>Team</th>
              <th>Record</th>
              <th>PF</th>
              <th>PA</th>
              <th>Cap Space</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, index) => (
              <tr key={team.id}>
                <td>{index + 1}</td>
                <td>{team.name} ({team.abbr})</td>
                <td>{team.wins}-{team.losses}-{team.ties}</td>
                <td>{team.ptsFor}</td>
                <td>{team.ptsAgainst}</td>
                <td>${(team.capRoom || 0).toFixed(2)}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
