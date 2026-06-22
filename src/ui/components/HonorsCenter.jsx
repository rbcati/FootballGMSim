import React from 'react';
import { SectionCard } from './ScreenSystem.jsx';

const PRESTIGE_POSITIONS = ['QB', 'RB', 'WR', 'DL'];

const HONOR_LABELS = {
  FIRST_TEAM_ALL_PRO: 'First-Team All-Pro',
  SECOND_TEAM_ALL_PRO: 'Second-Team All-Pro',
  PRO_BOWL: 'Pro Bowl',
};

const BADGE_STYLES = {
  FIRST_TEAM_ALL_PRO: {
    background: 'var(--accent)',
    color: '#fff',
    border: '1px solid var(--accent)',
    fontWeight: 700,
  },
  SECOND_TEAM_ALL_PRO: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    fontWeight: 600,
  },
  PRO_BOWL: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    fontWeight: 400,
  },
};

function HonorBadge({ type }) {
  const style = BADGE_STYLES[type] ?? BADGE_STYLES.PRO_BOWL;
  return (
    <span
      data-testid={`honor-badge-${type}`}
      style={{
        ...style,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 'var(--text-xs, 11px)',
        whiteSpace: 'nowrap',
      }}
    >
      {HONOR_LABELS[type] ?? type}
    </span>
  );
}

function HonorTable({ entries, honorType }) {
  const hasEntries = entries && PRESTIGE_POSITIONS.some(pos => (entries[pos]?.length ?? 0) > 0);
  if (!hasEntries) return null;
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <HonorBadge type={honorType} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingBottom: 4 }}>Pos</th>
            <th style={{ textAlign: 'left', paddingBottom: 4 }}>Player</th>
            <th style={{ textAlign: 'left', paddingBottom: 4 }}>Team</th>
            <th style={{ textAlign: 'right', paddingBottom: 4 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {PRESTIGE_POSITIONS.flatMap(pos => {
            const posEntries = entries[pos] ?? [];
            return posEntries.map((e, i) => (
              <tr key={`${pos}-${i}`} data-testid={`honor-row-${honorType}-${pos}`}>
                <td style={{ paddingRight: 8, color: 'var(--text-muted)' }}>{pos}</td>
                <td>{e.playerName}</td>
                <td style={{ color: 'var(--text-muted)' }}>{e.teamAbbr ?? e.teamName ?? '—'}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                  {typeof e.score === 'number' ? e.score.toFixed(1) : '—'}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HonorsCenter({ honors }) {
  if (!honors) {
    return (
      <SectionCard title="Pro Bowl & All-Pro Honors">
        <p
          style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}
          data-testid="honors-empty"
        >
          No honors awarded yet. Complete a season to see Pro Bowl & All-Pro selections.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Pro Bowl & All-Pro Honors">
      <div data-testid="honors-center">
        <HonorTable honorType="FIRST_TEAM_ALL_PRO" entries={honors.FIRST_TEAM_ALL_PRO} />
        <HonorTable honorType="SECOND_TEAM_ALL_PRO" entries={honors.SECOND_TEAM_ALL_PRO} />
        <HonorTable honorType="PRO_BOWL" entries={honors.PRO_BOWL} />
      </div>
    </SectionCard>
  );
}
