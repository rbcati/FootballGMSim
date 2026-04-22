import React, { useMemo, useState } from 'react';
import { EmptyState, SectionCard, StatusChip } from './ScreenSystem.jsx';
import { syncFranchiseChronicle } from '../utils/franchiseChronicle.js';

function toneForResult(result) {
  const r = String(result ?? '').toUpperCase();
  if (r === 'W') return 'var(--success)';
  if (r === 'L') return 'var(--danger)';
  return 'var(--text-subtle)';
}

export default function FranchiseStoryHub({ league }) {
  const [expandedId, setExpandedId] = useState(null);
  const story = useMemo(() => syncFranchiseChronicle(league), [league]);
  const entries = [...(story.entries ?? [])].reverse();

  return (
    <div className="app-screen-stack franchise-story-hub">
      <SectionCard title="Franchise Chronicle" subtitle="A living timeline of each week in your dynasty run." variant="compact">
        {!entries.length ? (
          <EmptyState title="No story entries yet" body="Play your first game to start the chronicle." />
        ) : (
          <div className="app-list-stack">
            {entries.map((entry) => {
              const open = expandedId === entry.id;
              return (
                <article key={entry.id} className="app-story-card" style={{ borderLeft: `4px solid ${toneForResult(entry.result)}`, paddingLeft: 'var(--space-3)' }}>
                  <button type="button" className="app-story-card__header" onClick={() => setExpandedId(open ? null : entry.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0 }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Week {entry.week} · {entry.summary}</p>
                    <strong>{entry.headline}</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Conf standing: #{entry.standingsPosition ?? '—'} {entry.standout?.name ? `· Standout: ${entry.standout.name}` : ''}</p>
                  </button>
                  {open ? (
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      {!!entry.events?.length && (
                        <>
                          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Franchise events</p>
                          {entry.events.map((event, idx) => <p key={`${entry.id}-e-${idx}`} style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>• {event}</p>)}
                        </>
                      )}
                      {!!entry.moments?.length && (
                        <>
                          <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>Game moments</p>
                          {entry.moments.map((moment) => <p key={moment.id} style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>• {moment.text}</p>)}
                        </>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Season in Review" subtitle="Auto-generated recap when the year closes." variant="compact">
        {story.seasonReview ? <p style={{ margin: 0 }}>{story.seasonReview.text}</p> : <EmptyState title="Season still in progress" body="Finish the regular season to unlock your review card." />}
      </SectionCard>

      <SectionCard title="Milestone Badges" subtitle="Persistent dynasty achievements." variant="compact">
        <div className="app-chip-row" style={{ gap: 'var(--space-2)' }}>
          {(story.badges ?? []).map((badge) => (
            <StatusChip key={badge.id} label={badge.unlocked ? `🏆 ${badge.label}` : `🔒 ${badge.label}`} tone={badge.unlocked ? 'ok' : 'info'} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
