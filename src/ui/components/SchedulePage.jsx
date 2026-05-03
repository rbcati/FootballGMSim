import React, { useMemo } from 'react';

export default function SchedulePage({ league, onAdvanceWeek, onViewGameBook }) {
  const rows = useMemo(() => {
    const teamsById = new Map((league?.teams ?? []).map((team) => [Number(team.id), team]));
    return (league?.schedule?.weeks ?? []).flatMap((weekBlock) =>
      (weekBlock.games ?? []).map((game, index) => ({
        key: `${weekBlock.week}-${index}`,
        week: weekBlock.week,
        away: teamsById.get(Number(game.away))?.name ?? `Team ${game.away}`,
        home: teamsById.get(Number(game.home))?.name ?? `Team ${game.home}`,
        played: !!game.played,
        game,
      })),
    );
  }, [league]);

  return (
    <section data-testid="schedule-page">
      <h2>Schedule</h2>
      <table>
        <thead>
          <tr><th>Week</th><th>Away team</th><th>Home team</th><th>Action</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.week}</td>
              <td>{row.away}</td>
              <td>{row.home}</td>
              <td>
                {row.played ? (
                  <button type="button" onClick={() => onViewGameBook?.(row.game)}>
                    View Game Book
                  </button>
                ) : (
                  <button type="button" onClick={() => onAdvanceWeek?.()}>
                    Advance Week
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
