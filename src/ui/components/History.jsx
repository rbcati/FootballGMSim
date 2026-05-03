import React, { useMemo } from 'react';
import { buildLeagueHistoryModel } from '../utils/leagueHistory.js';

function ScrollTable({ children }) {
  return <div style={{ overflowX: 'auto' }} data-testid="history-scroll">{children}</div>;
}

export default function History({ league, onNavigateTeam, onNavigatePlayer }) {
  const model = useMemo(() => buildLeagueHistoryModel(league), [league]);
  return (
    <div className="space-y-3">
      <div className="card-premium" style={{ padding: 12 }}>
        <strong>History Overview</strong>
        <div>Season {model.currentSeasonSnapshot.season ?? '—'} · Week {model.currentSeasonSnapshot.week ?? '—'}</div>
        <div>Archived seasons: {model.seasons.length}</div>
        {model.warnings.map((w) => <div key={w} style={{ color: 'var(--text-muted)' }}>{w}</div>)}
      </div>
      <ScrollTable><table><thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th></tr></thead><tbody>{model.champions.length ? model.champions.map((c) => <tr key={c.season}><td>{c.season}</td><td>{c.name ?? c.abbr}</td><td>{c.runnerUp?.name ?? '—'}</td></tr>) : <tr><td colSpan={3}>No champions have been archived yet.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>MVP</th><th>Note</th></tr></thead><tbody>{model.awards.some((a) => a.awards) ? model.awards.map((a) => <tr key={`a-${a.season}`}><td>{a.season}</td><td>{a.awards?.mvp?.name ?? '—'}</td><td>{a.source === 'derived' ? 'Derived from season stats' : 'Archived'}</td></tr>) : <tr><td colSpan={3}>Awards have not been recorded yet.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Record</th><th>Player</th><th>Team</th><th>Season</th><th>Value</th></tr></thead><tbody>{model.leagueRecords.length ? model.leagueRecords.map((r) => <tr key={r.key}><td>{r.label}</td><td><button onClick={() => onNavigatePlayer?.(r.playerId)}>{r.player}</button></td><td><button onClick={() => onNavigateTeam?.(r.teamId)}>{r.team}</button></td><td>{r.season ?? '—'}</td><td>{r.value}</td></tr>) : <tr><td colSpan={5}>Records will appear once season snapshots include stat leaders.</td></tr>}</tbody></table></ScrollTable>
    </div>
  );
}
