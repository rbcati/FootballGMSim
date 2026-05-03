import React, { useMemo } from 'react';
import { buildLeagueHistoryModel } from '../utils/leagueHistory.js';

function ScrollTable({ children }) {
  return <div style={{ overflowX: 'auto' }} data-testid="history-scroll">{children}</div>;
}

const TeamCell = ({ row, onNavigateTeam }) => (row?.teamId != null ? <button onClick={() => onNavigateTeam?.(row.teamId)}>{row.team}</button> : <span>{row?.team ?? '—'}</span>);
const PlayerCell = ({ row, onNavigatePlayer }) => (row?.playerId != null ? <button onClick={() => onNavigatePlayer?.(row.playerId)}>{row.player}</button> : <span>{row?.player ?? '—'}</span>);

export default function History({ league, onNavigateTeam, onNavigatePlayer }) {
  const model = useMemo(() => buildLeagueHistoryModel(league), [league]);
  return (
    <div className="space-y-3">
      <div className="card-premium" style={{ padding: 12 }}>
        <strong>History Overview</strong>
        <div>Season {model.currentSeasonSnapshot.season ?? '—'} · Week {model.currentSeasonSnapshot.week ?? '—'}</div>
        <div>Archived seasons: {model.seasons.length}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{model.seasons.length ? 'Archived season data' : 'Current season preview'}</div>
        {model.warnings.map((w) => <div key={w} style={{ color: 'var(--text-muted)' }}>{w}</div>)}
      </div>
      <ScrollTable><table><thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th></tr></thead><tbody>{model.champions.length ? model.champions.map((c) => <tr key={c.season}><td>{c.season}</td><td>{c.name ?? c.abbr}</td><td>{c.runnerUp?.name ?? '—'}</td></tr>) : <tr><td colSpan={3}>No champions have been archived yet. Completed seasons will appear here after a season rollover.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>Champion</th><th>Best Record</th><th>MVP</th><th>OPOY</th><th>DPOY</th><th>Notes</th></tr></thead><tbody>{model.seasonSummaries.some((s) => s.champion || s.bestRecord || s.mvp || s.opoy || s.dpoy) ? model.seasonSummaries.map((s) => <tr key={`ss-${s.season}`}><td>{s.season}</td><td>{s.champion?.name ?? '—'}</td><td>{s.bestRecord ? `${s.bestRecord.abbr ?? s.bestRecord.name ?? '—'} ${s.bestRecord.wins}-${s.bestRecord.losses}` : '—'}</td><td>{s.mvp?.name ?? '—'}</td><td>{s.opoy?.name ?? '—'}</td><td>{s.dpoy?.name ?? '—'}</td><td>{s.notes.join('; ') || '—'}</td></tr>) : <tr><td colSpan={7}>Season summaries will appear once completed seasons are archived.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>MVP</th><th>Note</th></tr></thead><tbody>{model.awards.some((a) => a.awards) ? model.awards.map((a) => <tr key={`a-${a.season}`}><td>{a.season}</td><td>{a.awards?.mvp?.name ?? '—'}</td><td>{a.source === 'derived' ? 'Derived from season stats' : 'Archived'}</td></tr>) : <tr><td colSpan={3}>Awards have not been recorded yet.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Record</th><th>Player</th><th>Team</th><th>Season</th><th>Value</th></tr></thead><tbody>{model.leagueRecords.length ? model.leagueRecords.map((r) => <tr key={r.key}><td>{r.label}</td><td><PlayerCell row={r} onNavigatePlayer={onNavigatePlayer} /></td><td><TeamCell row={r} onNavigateTeam={onNavigateTeam} /></td><td>{r.season ?? '—'}</td><td>{r.value}</td></tr>) : <tr><td colSpan={5}>Records will appear once season snapshots include stat leaders.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>Round</th><th>Winner</th><th>Loser</th><th>Result</th></tr></thead><tbody>{model.playoffHistory.length ? model.playoffHistory.map((r, idx) => <tr key={`po-${r.season}-${idx}`}><td>{r.season}</td><td>{r.round ?? '—'}</td><td>{r.winner?.name ?? r.winnerName ?? '—'}</td><td>{r.loser?.name ?? r.loserName ?? '—'}</td><td>{r.result ?? '—'}</td></tr>) : <tr><td colSpan={5}>Playoff history has not been recorded yet.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>Category</th><th>Player</th><th>Team</th><th>Value</th></tr></thead><tbody>{model.leaderSnapshots.length ? model.leaderSnapshots.map((r, idx) => <tr key={`ls-${r.season}-${idx}`}><td>{r.season}</td><td>{r.label}</td><td><PlayerCell row={r} onNavigatePlayer={onNavigatePlayer} /></td><td><TeamCell row={r} onNavigateTeam={onNavigateTeam} /></td><td>{r.value}</td></tr>) : <tr><td colSpan={5}>Archived leader snapshots are not available yet.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Team</th><th>Seasons</th><th>Best Record</th><th>Playoff Apps</th><th>Championships</th><th>Last Season Record</th></tr></thead><tbody>{model.teamHistory.length ? model.teamHistory.map((t) => <tr key={`th-${t.teamId}`}><td>{t.teamId != null ? <button onClick={() => onNavigateTeam?.(t.teamId)}>{t.team}</button> : t.team}</td><td>{t.seasons}</td><td>{t.bestRecord?.text ?? '—'}</td><td>{t.playoffApps}</td><td>{t.championships}</td><td>{t.lastSeasonRecord ?? '—'}</td></tr>) : <tr><td colSpan={6}>Team year-by-year history will appear once standings are archived.</td></tr>}</tbody></table></ScrollTable>
      <ScrollTable><table><thead><tr><th>Season</th><th>Warning</th></tr></thead><tbody>{model.archiveWarnings.length ? model.archiveWarnings.map((w, idx) => <tr key={`w-${idx}`}><td>{w.season}</td><td>{w.warning}</td></tr>) : <tr><td colSpan={2}>Partial archive notes will appear when archived seasons have missing fields.</td></tr>}</tbody></table></ScrollTable>
    </div>
  );
}
