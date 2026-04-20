import React, { useMemo } from 'react';

const rows = [
  ['mostPassingYardsSeason', 'Most Passing Yards (Season)'],
  ['mostRushingYardsSeason', 'Most Rushing Yards (Season)'],
  ['mostWinsSeason', 'Most Wins (Season)'],
  ['mostChampionships', 'Most Championships'],
  ['highestOvrPlayer', 'Highest OVR Player'],
];

export default function RecordBook({ league }) {
  const records = league?.records ?? null;
  const hasAny = useMemo(() => rows.some(([key]) => !!records?.[key]), [records]);

  if (!hasAny) {
    return <div className="card" style={{ padding: 'var(--space-4)', marginTop: 12 }}>No records yet — play a season!</div>;
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginTop: 12 }}>
      <h3 style={{ marginBottom: 8 }}>Record Book</h3>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr><th align="left">Record</th><th align="left">Holder</th><th align="left">Value</th><th align="left">Season</th></tr>
        </thead>
        <tbody>
          {rows.map(([key, label]) => {
            const rec = records?.[key];
            return (
              <tr key={key}>
                <td>{label}</td>
                <td>{rec?.playerName ?? rec?.teamName ?? '-'}</td>
                <td>{rec?.value ?? '-'}</td>
                <td>{rec?.season ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
