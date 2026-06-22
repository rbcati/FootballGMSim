import React, { useState } from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';
import HonorsCenter from './HonorsCenter.jsx';
import { summarizeSeasonAwards } from '../../core/awards/awardHistory.js';

const TABS = ['Honor Roll', 'Awards', 'Record Book', 'Honors'];

const RECORD_LABELS = {
  passingYards: 'Passing Yards',
  passingTds: 'Passing TDs',
  rushingYards: 'Rushing Yards',
  sacks: 'Sacks',
};

const RECORD_KEYS = ['passingYards', 'passingTds', 'rushingYards', 'sacks'];

function TabBar({ activeTab, onSelect }) {
  return (
    <div role="tablist" aria-label="History sections" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      {TABS.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => onSelect(tab)}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: activeTab === tab ? 'var(--accent)' : 'transparent',
            color: activeTab === tab ? '#fff' : 'var(--text)',
            fontWeight: activeTab === tab ? 700 : 400,
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function RecordRow({ label, holder }) {
  if (!holder) {
    return (
      <tr>
        <td>{label}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{label}</td>
      <td>{holder.metricValue}</td>
      <td>{holder.playerName} ({holder.teamNameAtTime})</td>
      <td>{holder.yearAchieved || '—'}</td>
    </tr>
  );
}

function RecordSection({ title, records, testId }) {
  return (
    <SectionCard title={title}>
      <div className="responsive-data-wrap" data-testid={testId} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Record</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Value</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Player (Team)</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Year</th>
            </tr>
          </thead>
          <tbody>
            {RECORD_KEYS.map((k) => (
              <RecordRow key={k} label={RECORD_LABELS[k]} holder={records?.[k] ?? null} />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function HonorRollTab({ historyLedger, userTeamId }) {
  const rows = Array.isArray(historyLedger) ? [...historyLedger].reverse() : [];

  if (rows.length === 0) {
    return (
      <SectionCard title="Honor Roll">
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }} data-testid="honor-roll-empty">
          No completed seasons archived yet. Complete a season to see the championship history.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Honor Roll">
      <div className="responsive-data-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Year</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Champion</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Runner-Up</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Score</th>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>MVP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isUserChamp = userTeamId != null && row.championTeamId != null
                && Number(row.championTeamId) === Number(userTeamId);
              return (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td
                    data-testid={isUserChamp ? 'user-champion-cell' : undefined}
                    style={isUserChamp ? { fontWeight: 700, color: 'var(--accent)' } : undefined}
                  >
                    {row.championName}
                  </td>
                  <td>{row.runnerUpName}</td>
                  <td>{row.superBowlScore}</td>
                  <td>{row.mvpName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RecordBookTab({ recordBook }) {
  const singleGame = recordBook?.singleGame ?? {};
  const singleSeasonBests = recordBook?.singleSeasonBests ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <RecordSection
        title="Single-Game Records"
        records={singleGame}
        testId="single-game-records"
      />
      <RecordSection
        title="Single-Season Records"
        records={singleSeasonBests}
        testId="single-season-records"
      />
    </div>
  );
}

function SeasonAwardsTab({ awardHistory }) {
  const entries = Array.isArray(awardHistory) ? awardHistory : [];
  const seasons = [...entries]
    .map((e) => summarizeSeasonAwards(e))
    .filter((s) => s.year != null)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  if (seasons.length === 0) {
    return (
      <SectionCard title="Season Awards">
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }} data-testid="season-awards-empty">
          No awards recorded yet. Complete a season to populate the award history.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Season Awards">
      <div data-testid="season-awards-panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {seasons.map((s) => (
          <div
            key={s.year}
            data-testid={`season-awards-${s.year}`}
            style={{ borderBottom: '1px solid var(--border-subtle, var(--border))', paddingBottom: 'var(--space-2)' }}
          >
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 4 }}>{s.year}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              {s.majorAwards.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>No major award winners recorded.</span>
              ) : (
                s.majorAwards.map((a) => (
                  <span key={a.key} style={{ color: 'var(--text)' }}>
                    <strong>{a.label}:</strong> {a.playerName}
                    {a.pos ? ` (${a.pos}${a.teamAbbr ? ` · ${a.teamAbbr}` : ''})` : ''}
                  </span>
                ))
              )}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              All-Pro: {s.firstTeamCount} 1st · {s.secondTeamCount} 2nd · Pro Bowl: {s.proBowlCount}
            </div>
            {s.leaders.length > 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                Leaders — {s.leaders.map((l) => `${l.label}: ${l.playerName} (${l.value})`).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export default function HistoryCenter({ league }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  const historyLedger = league?.historyLedger ?? [];
  const recordBook = league?.recordBook ?? null;
  const userTeamId = league?.userTeamId ?? null;
  const currentSeasonHonors = league?.currentSeasonHonors ?? null;
  const awardHistory = league?.awardHistory ?? [];

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="History Center"
        subtitle="Season champions, award winners, and all-time records."
      />
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />
      <div role="tabpanel">
        {activeTab === 'Honor Roll' && (
          <HonorRollTab historyLedger={historyLedger} userTeamId={userTeamId} />
        )}
        {activeTab === 'Awards' && (
          <SeasonAwardsTab awardHistory={awardHistory} />
        )}
        {activeTab === 'Record Book' && (
          <RecordBookTab recordBook={recordBook} />
        )}
        {activeTab === 'Honors' && (
          <HonorsCenter honors={currentSeasonHonors} />
        )}
      </div>
    </div>
  );
}
