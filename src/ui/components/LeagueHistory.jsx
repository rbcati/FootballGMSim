/**
 * LeagueHistory.jsx
 *
 * Displays a historical record of all completed seasons.
 */
import React, { useEffect, useState } from 'react';
import { useWorker } from '../hooks/useWorker.js';

export default function LeagueHistory({ onPlayerSelect }) {
  const { actions } = useWorker();
  const [seasons, setSeasons] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // Fetch all seasons from history using the action wrapper
    actions.getAllSeasons()
      .then(response => {
        if (mounted && response?.seasons) {
          setSeasons(response.seasons);
        }
        if (mounted) setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load history:', err);
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [actions]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading history...
      </div>
    );
  }

  if (!seasons || seasons.length === 0) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        No history available yet. Complete a season to see it here!
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
       <div style={{ padding: 'var(--space-3) var(--space-5)', background: 'var(--surface-strong)', borderBottom: '1px solid var(--hairline)' }}>
          <span className="hub-section-title" style={{ marginBottom: 0 }}>League History</span>
       </div>

       <div className="table-wrapper">
         <table className="standings-table" style={{ width: '100%' }}>
           <thead>
             <tr>
               <th style={{ paddingLeft: 'var(--space-5)' }}>Year</th>
               <th>Champion</th>
               <th>Best Record</th>
               <th>MVP</th>
               <th>OPOY</th>
               <th>DPOY</th>
             </tr>
           </thead>
           <tbody>
             {seasons.map(s => {
               // Determine best record
               const bestTeam = s.standings?.sort((a,b) => b.pct - a.pct)[0];
               const bestRecord = bestTeam ? `${bestTeam.wins}-${bestTeam.losses}${bestTeam.ties > 0 ? '-' + bestTeam.ties : ''}` : '-';

               return (
                 <tr key={s.id}>
                   <td style={{ paddingLeft: 'var(--space-5)', fontWeight: 700 }}>{s.year}</td>
                   <td>
                     {s.champion ? (
                       <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                         {s.champion.name} <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({s.champion.abbr})</span>
                       </span>
                     ) : 'N/A'}
                   </td>
                   <td>
                     {bestTeam ? (
                       <span>
                         {bestTeam.abbr} <span style={{ color: 'var(--text-muted)' }}>{bestRecord}</span>
                       </span>
                     ) : '-'}
                   </td>
                   <td>
                     {s.awards?.mvp ? (
                       <span
                         className="interactive-player-name"
                         onClick={() => onPlayerSelect && onPlayerSelect(s.awards.mvp.playerId)}
                         style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}
                       >
                         {s.awards.mvp.pos} {s.awards.mvp.name}
                       </span>
                     ) : '-'}
                   </td>
                   <td>
                     {s.awards?.opoy ? (
                       <span
                         className="interactive-player-name"
                         onClick={() => onPlayerSelect && onPlayerSelect(s.awards.opoy.playerId)}
                         style={{ cursor: 'pointer' }}
                       >
                         {s.awards.opoy.pos} {s.awards.opoy.name}
                       </span>
                     ) : '-'}
                   </td>
                   <td>
                     {s.awards?.dpoy ? (
                       <span
                         className="interactive-player-name"
                         onClick={() => onPlayerSelect && onPlayerSelect(s.awards.dpoy.playerId)}
                         style={{ cursor: 'pointer' }}
                       >
                         {s.awards.dpoy.pos} {s.awards.dpoy.name}
                       </span>
                     ) : '-'}
                   </td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>
    </div>
  );
}
