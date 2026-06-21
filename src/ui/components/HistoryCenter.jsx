import React, { useState } from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';
import HonorsCenter from './HonorsCenter.jsx';

const TABS = ['Honor Roll', 'Record Book', 'Honors'];

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

export default function HistoryCenter({ league }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  const historyLedger = league?.historyLedger ?? [];
  const recordBook = league?.recordBook ?? null;
  const userTeamId = league?.userTeamId ?? null;
  const currentSeasonHonors = league?.currentSeasonHonors ?? null;

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
