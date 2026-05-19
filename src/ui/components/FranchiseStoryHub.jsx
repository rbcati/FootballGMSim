import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, SectionCard, StatusChip } from './ScreenSystem.jsx';
import { CHRONICLE_EVENT_LABELS, persistFranchiseChronicle, resolveChronicleEventType, syncFranchiseChronicle } from '../utils/franchiseChronicle.js';

const EVENT_STYLE = {
  game: { color: 'var(--text-subtle)', tone: 'neutral' },
  trade: { color: 'var(--accent)', tone: 'info' },
  contract: { color: 'var(--success)', tone: 'ok' },
  draft: { color: 'var(--warning)', tone: 'warning' },
  injury: { color: 'var(--danger)', tone: 'danger' },
  milestone: { color: 'var(--accent-2, var(--accent))', tone: 'ok' },
  custom: { color: 'var(--text-subtle)', tone: 'info' },
  event: { color: 'var(--text-subtle)', tone: 'info' },
};

function toneForResult(result) {
  const r = String(result ?? '').toUpperCase();
  if (r === 'W') return 'var(--success)';
  if (r === 'L') return 'var(--danger)';
  return 'var(--text-subtle)';
}

function getEventStyle(entry) {
  const type = resolveChronicleEventType(entry);
  if (type === 'game') return { ...EVENT_STYLE.game, color: toneForResult(entry?.result) };
  return EVENT_STYLE[type] ?? EVENT_STYLE.event;
}

function formatMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `$${Math.round(n * 10) / 10}M`;
}

function compactPlayer(player) {
  if (!player) return null;
  if (typeof player === 'string') return player;
  return [
    player.name,
    player.pos,
    player.ovr != null ? `${player.ovr} OVR` : null,
  ].filter(Boolean).join(' - ');
}

function compactPlayers(players = []) {
  return (Array.isArray(players) ? players : [])
    .map(compactPlayer)
    .filter(Boolean)
    .join(', ');
}

function metadataLines(entry) {
  const type = resolveChronicleEventType(entry);
  const meta = entry?.meta ?? {};
  const lines = [];

  if (type === 'game') {
    const score = entry?.score ?? {};
    const scoreLine = score.awayAbbr && score.homeAbbr && score.away != null && score.home != null
      ? `${score.awayAbbr} ${score.away} - ${score.homeAbbr} ${score.home}`
      : entry?.summary;
    if (scoreLine) lines.push({ label: 'Final', value: scoreLine });
    if (entry?.result) lines.push({ label: 'Result', value: String(entry.result).toUpperCase() });
    if (entry?.standingsPosition != null) lines.push({ label: 'Conf standing', value: `#${entry.standingsPosition}` });
    if (entry?.standout?.name) lines.push({ label: 'Standout', value: [entry.standout.name, entry.standout.detail].filter(Boolean).join(' - ') });
    if (entry?.season != null) lines.push({ label: 'Season', value: entry.season });
  } else if (type === 'trade') {
    const players = compactPlayers(meta.players);
    const incoming = compactPlayers(meta.incomingPlayers);
    const outgoing = compactPlayers(meta.outgoingPlayers);
    const picks = [...(meta.picks ?? []), ...(meta.incomingPicks ?? []), ...(meta.outgoingPicks ?? [])].filter(Boolean).join(', ');
    const teams = (meta.teams ?? []).filter(Boolean).join(', ');
    if (incoming) lines.push({ label: 'Added', value: incoming });
    if (outgoing) lines.push({ label: 'Sent', value: outgoing });
    if (!incoming && !outgoing && players) lines.push({ label: 'Players', value: players });
    if (picks) lines.push({ label: 'Picks', value: picks });
    if (teams) lines.push({ label: 'Teams', value: teams });
  } else if (type === 'contract') {
    const player = compactPlayer(meta.player);
    const term = [
      meta.years ? `${meta.years} yr` : null,
      formatMoney(meta.totalValue),
      meta.aav != null ? `${formatMoney(meta.aav)} AAV` : null,
    ].filter(Boolean).join(' - ');
    if (player) lines.push({ label: 'Player', value: player });
    if (term) lines.push({ label: 'Terms', value: term });
  } else if (type === 'draft') {
    const player = compactPlayer(meta.player);
    const slot = meta.pickLabel ?? [meta.round ? `Round ${meta.round}` : null, meta.pick ? `Pick ${meta.pick}` : null].filter(Boolean).join(' ');
    if (player) lines.push({ label: 'Player', value: player });
    if (slot) lines.push({ label: 'Selection', value: slot });
    if (meta.potential != null) lines.push({ label: 'Potential', value: meta.potential });
  } else if (type === 'injury') {
    const player = compactPlayer(meta.player);
    if (player) lines.push({ label: 'Player', value: player });
    if (meta.injury) lines.push({ label: 'Injury', value: meta.injury });
    if (meta.duration) lines.push({ label: 'Duration', value: meta.duration });
  } else if (type === 'milestone') {
    if (meta.label) lines.push({ label: 'Milestone', value: meta.label });
    if (meta.description) lines.push({ label: 'Detail', value: meta.description });
    if (meta.unlockedOn) lines.push({ label: 'Unlocked', value: meta.unlockedOn });
  }

  return lines;
}

function secondaryLine(entry) {
  const type = resolveChronicleEventType(entry);
  if (type === 'game') {
    return `Conf standing: #${entry?.standingsPosition ?? '-'}${entry?.standout?.name ? ` - Standout: ${entry.standout.name}` : ''}`;
  }
  return entry?.summary ?? CHRONICLE_EVENT_LABELS[type] ?? 'Franchise event';
}

export default function FranchiseStoryHub({ league, actions = null }) {
  const [expandedId, setExpandedId] = useState(null);
  const lastPersistedKeyRef = useRef('');
  const story = useMemo(() => syncFranchiseChronicle(league), [league]);
  const entries = [...(story.entries ?? [])].reverse();
  const entryKey = (story.entries ?? []).map((entry) => entry?.id).filter(Boolean).join('|');

  useEffect(() => {
    if (!actions?.updateFranchiseChronicle || !Array.isArray(league?.franchiseChronicle)) return;
    if (!entryKey || lastPersistedKeyRef.current === entryKey) return;
    lastPersistedKeyRef.current = entryKey;
    persistFranchiseChronicle(actions, league);
  }, [actions, entryKey, league]);

  return (
    <div className="app-screen-stack franchise-story-hub">
      <SectionCard title="Franchise Chronicle" subtitle="A living timeline of each week in your dynasty run." variant="compact">
        {!entries.length ? (
          <EmptyState title="No story entries yet" body="Play your first game to start the chronicle." />
        ) : (
          <div className="app-list-stack" data-testid="franchise-story-list">
            {entries.map((entry) => {
              const open = expandedId === entry.id;
              const type = resolveChronicleEventType(entry);
              const style = getEventStyle(entry);
              const label = CHRONICLE_EVENT_LABELS[type] ?? CHRONICLE_EVENT_LABELS.event;
              const metaLines = metadataLines(entry);
              return (
                <article
                  key={entry.id}
                  className="app-story-card"
                  data-testid="franchise-story-event"
                  data-event-type={type}
                  style={{ borderLeft: `4px solid ${style.color}`, paddingLeft: 'var(--space-3)' }}
                >
                  <button
                    type="button"
                    className="app-story-card__header"
                    onClick={() => setExpandedId(open ? null : entry.id)}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0 }}
                  >
                    <div className="app-chip-row" style={{ gap: 'var(--space-2)', marginBottom: 4 }}>
                      <StatusChip label={label} tone={style.tone} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Week {entry.week}</span>
                      {type === 'game' && entry.result ? <StatusChip label={String(entry.result).toUpperCase()} tone={String(entry.result).toUpperCase() === 'W' ? 'ok' : String(entry.result).toUpperCase() === 'L' ? 'danger' : 'neutral'} /> : null}
                    </div>
                    <strong>{entry.headline}</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{secondaryLine(entry)}</p>
                  </button>
                  {open ? (
                    <div style={{ marginTop: 'var(--space-2)' }} data-testid="franchise-story-event-details">
                      {metaLines.length ? (
                        <div style={{ display: 'grid', gap: 4, marginBottom: 'var(--space-2)' }}>
                          {metaLines.map((line) => (
                            <p key={`${entry.id}-${line.label}`} style={{ margin: 0, color: 'var(--text-muted)' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{line.label}:</strong> {line.value}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {!!entry.events?.length && (
                        <>
                          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Franchise events</p>
                          {entry.events.map((event, idx) => <p key={`${entry.id}-e-${idx}`} style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>- {event}</p>)}
                        </>
                      )}
                      {!!entry.moments?.length && (
                        <>
                          <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>Game moments</p>
                          {entry.moments.map((moment) => <p key={moment.id} style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>- {moment.text}</p>)}
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
            <StatusChip key={badge.id} label={badge.unlocked ? badge.label : `Locked: ${badge.label}`} tone={badge.unlocked ? 'ok' : 'info'} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
