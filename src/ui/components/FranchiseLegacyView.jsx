/** @jsxImportSource react */
import React from 'react';
import { SectionCard } from './ScreenSystem.jsx';
import LegendsBrowser from './LegendsBrowser.jsx';

function safeNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function formatStatValue(v) {
  if (v == null || v === 0) return '—';
  return safeNum(v, 0).toLocaleString();
}

// ── Ring of Honor gallery ─────────────────────────────────────────────────────

function RohCard({ member, onRetireNumber, retiredNumbers = [] }) {
  const { name, position, jerseyNumber, yearsPlayedWithTeam, accolades, inductionYear,
          totalPassingYards, totalRushingYards, totalReceivingYards, totalSacks } = member;

  const hasStats = totalPassingYards || totalRushingYards || totalReceivingYards || totalSacks;
  const numRetired = jerseyNumber != null && Array.isArray(retiredNumbers) && retiredNumbers.includes(Number(jerseyNumber));
  const canRetire  = jerseyNumber != null && !numRetired && typeof onRetireNumber === 'function';

  return (
    <div
      data-testid="roh-card"
      style={{
        padding: 'var(--space-4, 16px)',
        borderRadius: 'var(--radius-xl, 12px)',
        background: 'linear-gradient(135deg, var(--surface-raised, #f8fafc) 0%, var(--surface, #f1f5f9) 100%)',
        border: '1px solid var(--hairline, rgba(0,0,0,0.08))',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {jerseyNumber != null && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 800,
              color: 'var(--warning, #f59e0b)',
              lineHeight: 1,
              minWidth: 28,
            }}
          >
            #{jerseyNumber}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm, 14px)', color: 'var(--text)', truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
            <span>{position}</span>
            <span>·</span>
            <span>{yearsPlayedWithTeam}</span>
          </div>
        </div>
        {inductionYear > 0 && (
          <span style={{ fontSize: 'var(--text-xs, 11px)', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
            {inductionYear}
          </span>
        )}
      </div>

      {hasStats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 'var(--text-xs, 11px)', color: 'var(--text-muted)' }}>
          {totalPassingYards ? <span>{formatStatValue(totalPassingYards)} pass yds</span> : null}
          {totalRushingYards ? <span>{formatStatValue(totalRushingYards)} rush yds</span> : null}
          {totalReceivingYards ? <span>{formatStatValue(totalReceivingYards)} rec yds</span> : null}
          {totalSacks ? <span>{formatStatValue(totalSacks)} sacks</span> : null}
        </div>
      )}

      {Array.isArray(accolades) && accolades.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {accolades.slice(0, 4).map((a, i) => (
            <li
              key={i}
              style={{
                fontSize: 'var(--text-xs, 11px)',
                background: 'var(--chip-bg, rgba(99,102,241,0.10))',
                color: 'var(--chip-text, var(--primary, #6366f1))',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '1px 6px',
              }}
            >
              {a}
            </li>
          ))}
        </ul>
      )}

      {numRetired && (
        <span
          data-testid="jersey-retired-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--warning, #f59e0b)',
            fontWeight: 700,
          }}
        >
          ★ #{jerseyNumber} Retired
        </span>
      )}

      {canRetire && (
        <button
          data-testid="retire-number-button"
          type="button"
          onClick={() => onRetireNumber(member.id, member.jerseyNumber)}
          style={{
            marginTop: 2,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'transparent',
            color: 'var(--warning, #f59e0b)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: 'var(--text-xs, 11px)',
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Retire #{jerseyNumber}
        </button>
      )}
    </div>
  );
}

// ── Retired Numbers panel ─────────────────────────────────────────────────────

function RetiredNumbersPanel({ retiredNumberDisplay }) {
  const items = Array.isArray(retiredNumberDisplay) ? retiredNumberDisplay : [];

  return (
    <div data-testid="retired-numbers-panel">
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map(({ jerseyNumber, surname }) => (
            <span
              key={jerseyNumber}
              data-testid="retired-number-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: 'var(--warning, #f59e0b)',
                fontSize: 'var(--text-sm, 13px)',
                fontWeight: 700,
                letterSpacing: '0.03em',
              }}
            >
              #{jerseyNumber}{surname ? ` ${surname.toUpperCase()}` : ''}
            </span>
          ))}
        </div>
      ) : (
        <p
          data-testid="retired-numbers-empty"
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: 'var(--text-sm, 13px)',
            textAlign: 'center',
            padding: 'var(--space-4, 16px) 0',
          }}
        >
          No retired numbers yet.
        </p>
      )}
    </div>
  );
}

// ── All-time leaders panel ─────────────────────────────────────────────────────

const LEADER_ROWS = [
  { key: 'passingYards',   label: 'Passing Yards' },
  { key: 'rushingYards',   label: 'Rushing Yards' },
  { key: 'receivingYards', label: 'Receiving Yards' },
  { key: 'sacks',          label: 'Sacks' },
];

function AllTimeLeadersPanel({ allTimeLeaders }) {
  return (
    <div data-testid="all-time-leaders-panel" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {LEADER_ROWS.map(({ key, label }) => {
        const entry = allTimeLeaders?.[key];
        return (
          <div
            key={key}
            data-testid={`leader-row-${key}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr auto',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--hairline, rgba(0,0,0,0.06))',
              fontSize: 'var(--text-sm, 13px)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {entry ? entry.name : '—'}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--text)',
                minWidth: 60,
                textAlign: 'right',
              }}
            >
              {entry ? formatStatValue(entry.value) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Induction prompt card ──────────────────────────────────────────────────────

function InductionPromptCard({ candidate, onInduct, onDismiss }) {
  return (
    <div
      data-testid="roh-induction-prompt"
      style={{
        padding: 'var(--space-3, 12px) var(--space-4, 16px)',
        borderRadius: 'var(--radius-lg, 8px)',
        border: '1px solid var(--warning-border, rgba(245,158,11,0.35))',
        background: 'var(--warning-bg, rgba(245,158,11,0.07))',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-sm, 14px)', color: 'var(--warning, #f59e0b)' }}>
          {candidate.title}
        </div>
        <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)', marginTop: 2 }}>
          {candidate.body}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid="induct-roh-button"
          type="button"
          onClick={() => onInduct?.(candidate.playerId, candidate.teamId)}
          style={{
            flex: 1,
            padding: '6px 12px',
            borderRadius: 'var(--radius-md, 6px)',
            background: 'var(--warning, #f59e0b)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 'var(--text-xs, 12px)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Induct into Ring of Honor
        </button>
        {onDismiss && (
          <button
            data-testid="dismiss-roh-button"
            type="button"
            onClick={() => onDismiss?.(candidate.playerId)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md, 6px)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontWeight: 500,
              fontSize: 'var(--text-xs, 12px)',
              border: '1px solid var(--hairline)',
              cursor: 'pointer',
            }}
          >
            Not Now
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main FranchiseLegacyView ───────────────────────────────────────────────────

/**
 * FranchiseLegacyView — Ring of Honor gallery + franchise leaders + retired numbers.
 *
 * Props:
 *   ringOfHonor          {Object[]} - Array of ROH members
 *   allTimeLeaders       {Object}   - { passingYards, rushingYards, receivingYards, sacks }
 *   pendingRohCandidates {Object[]} - Pending induction notifications
 *   retiredNumbers       {number[]} - Array of retired jersey numbers
 *   retiredNumberDisplay {Object[]} - Display objects: { jerseyNumber, surname }
 *   onInduct             {Function} - (playerId, teamId) => void
 *   onDismissCandidate   {Function} - (playerId) => void (optional)
 *   onRetireNumber       {Function} - (playerId, jerseyNumber) => void (optional)
 */
export default function FranchiseLegacyView({
  ringOfHonor = [],
  allTimeLeaders = null,
  pendingRohCandidates = [],
  retiredNumbers = [],
  retiredNumberDisplay = [],
  awardHistory = [],
  onInduct,
  onDismissCandidate,
  onRetireNumber,
}) {
  const hasCandidates = Array.isArray(pendingRohCandidates) && pendingRohCandidates.length > 0;
  const hasMembers    = Array.isArray(ringOfHonor) && ringOfHonor.length > 0;

  return (
    <div data-testid="franchise-legacy-view" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Offseason induction prompts */}
      {hasCandidates && (
        <SectionCard
          title="Ring of Honor Candidates"
          subtitle="Retiring legends — induct them now or decide later."
          variant="compact"
          data-testid="roh-candidates-section"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingRohCandidates.map((c) => (
              <InductionPromptCard
                key={c.playerId}
                candidate={c}
                onInduct={onInduct}
                onDismiss={onDismissCandidate}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Ring of Honor — Legends Browser replaces the flat card grid */}
      <SectionCard
        title="Ring of Honor"
        subtitle="Franchise legends inducted into the Ring of Honor."
        variant="compact"
        data-testid="roh-gallery-section"
      >
        {hasMembers ? (
          <LegendsBrowser
            ringOfHonor={ringOfHonor}
            retiredNumbers={retiredNumbers}
            awardHistory={awardHistory}
            onRetireNumber={onRetireNumber}
          />
        ) : (
          <p
            data-testid="roh-empty-state"
            style={{
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm, 13px)',
              textAlign: 'center',
              padding: 'var(--space-6, 24px) 0',
              margin: 0,
            }}
          >
            No members yet. Legends earn their place here after retirement.
          </p>
        )}
      </SectionCard>

      {/* Retired Numbers panel */}
      <SectionCard
        title="Retired Numbers"
        subtitle="Jersey numbers retired by this franchise."
        variant="compact"
        data-testid="retired-numbers-section"
      >
        <RetiredNumbersPanel retiredNumberDisplay={retiredNumberDisplay} />
      </SectionCard>

      {/* All-time franchise leaders */}
      <SectionCard
        title="Franchise Leaders"
        subtitle="All-time career statistical leaders for this franchise."
        variant="compact"
        data-testid="franchise-leaders-section"
      >
        <AllTimeLeadersPanel allTimeLeaders={allTimeLeaders} />
      </SectionCard>

    </div>
  );
}
