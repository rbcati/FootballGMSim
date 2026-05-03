import React, { useMemo, useState } from 'react';

export default function SchedulePage({ league }) {
  const [toast, setToast] = useState('');

  const rows = useMemo(() => {
    const teamsById = new Map((league?.teams ?? []).map((team) => [Number(team.id), team]));
    return (league?.schedule?.weeks ?? []).flatMap((weekBlock) =>
      (weekBlock.games ?? []).map((game, index) => ({
        key: `${weekBlock.week}-${index}`,
        week: weekBlock.week,
        away: teamsById.get(Number(game.away))?.name ?? `Team ${game.away}`,
        home: teamsById.get(Number(game.home))?.name ?? `Team ${game.home}`,
      })),
    );
  }, [league]);

  const showSoon = () => setToast('Feature coming soon');

  return (
    <section data-testid="schedule-page">
      <h2>Schedule</h2>
      {toast ? <p role="status">{toast}</p> : null}
      <table>
        <thead>
          <tr><th>Week</th><th>Away team</th><th>Home team</th><th>Watch</th><th>Sim</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.week}</td>
              <td>{row.away}</td>
              <td>{row.home}</td>
              <td><button type="button" onClick={showSoon}>Watch</button></td>
              <td><button type="button" onClick={showSoon}>Sim</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
