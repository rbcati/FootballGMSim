/**
 * TrainingCamp.jsx — Training Camp & Weekly Practice system
 *
 * Allows users to run drills for position groups, manage practice intensity,
 * and develop players through focused training sessions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { buildTrainingPlanModel, POSITION_GROUPS } from '../utils/trainingPlanModel.js';

const INTENSITY_LEVELS = [
  { id: 'light', label: 'Light', color: '#34C759', devMult: 0.6, injuryChance: 0.01, desc: 'Low risk, moderate gains' },
  { id: 'normal', label: 'Normal', color: '#FFD60A', devMult: 1.0, injuryChance: 0.03, desc: 'Balanced risk and reward' },
  { id: 'hard', label: 'Hard', color: '#FF453A', devMult: 1.5, injuryChance: 0.07, desc: 'High gains, injury risk' },
];

const DRILL_TYPES = [
  { id: 'technique', label: 'Technique', desc: 'Fundamentals and position skills' },
  { id: 'conditioning', label: 'Conditioning', desc: 'Speed, stamina, durability' },
  { id: 'teamwork', label: 'Team Drills', desc: 'Coordination and chemistry' },
  { id: 'film', label: 'Film Study', desc: 'Mental preparation and awareness' },
];

function seededRandom(seed) {
  let s = seed;
  return function seeded() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function PlayerDrillRow({ player, result, onSelect }) {
  if (!player) return null;
  const change = result?.change ?? 0;
  const injured = result?.injured ?? false;

  return (
    <div
      onClick={() => onSelect?.(player.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        borderBottom: '1px solid var(--hairline)', cursor: 'pointer',
        background: injured ? 'rgba(255,69,58,0.05)' : 'transparent',
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-strong, #1a1a2e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0,
        }}
      >
        {player.pos}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Age {player.age} · OVR {player.ovr}
          {player.potential != null && ` · POT ${player.potential}`}
        </div>
      </div>
      {result && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {injured ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>INJURED</span>
          ) : change !== 0 ? (
            <span
              style={{
                fontSize: 12, fontWeight: 800,
                color: change > 0 ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {change > 0 ? '+' : ''}
              {change}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>No change</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingCamp({ league, actions, onPlayerSelect, onNavigate }) {
  const [intensity, setIntensity] = useState('normal');
  const [focusGroups, setFocusGroups] = useState(new Set());
  const [drillType, setDrillType] = useState('technique');
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(new Set(['qb']));
  const [drillsRun, setDrillsRun] = useState(0);
  const [persistState, setPersistState] = useState('idle');

  const model = useMemo(() => buildTrainingPlanModel({ league, intensity, drillType, drillsRun, actions }), [league, intensity, drillType, drillsRun, actions]);
  const { roster, drillsRemaining } = model;

  const groups = useMemo(() => {
    const map = {};
    POSITION_GROUPS.forEach((g) => { map[g.id] = { ...g, players: [] }; });
    roster.forEach((p) => {
      const group = POSITION_GROUPS.find((g) => g.positions.includes(String(p?.pos ?? '').toUpperCase()));
      if (group && map[group.id]) map[group.id].players.push(p);
    });
    return map;
  }, [roster]);

  const toggleFocus = useCallback((groupId) => {
    setFocusGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else if (next.size < 2) next.add(groupId);
      return next;
    });
  }, []);

  const applyRecommendation = useCallback((recommendation) => {
    if (!recommendation) return;
    setFocusGroups(new Set([recommendation.groupId]));
    setDrillType(recommendation.suggestedDrillType);
    setIntensity(recommendation.suggestedIntensity);
  }, []);

  const toggleExpand = useCallback((groupId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const runDrills = useCallback(async () => {
    if (drillsRemaining <= 0) return;

    const seed = (league?.year ?? 2025) * 1000 + (league?.week ?? 1) * 100 + drillsRun;
    const rng = seededRandom(seed);
    const config = INTENSITY_LEVELS.find((l) => l.id === intensity) ?? INTENSITY_LEVELS[1];
    const newResults = {};

    roster.forEach((p) => {
      const group = POSITION_GROUPS.find((g) => g.positions.includes(String(p?.pos ?? '').toUpperCase()));
      if (!group) return;

      const isFocused = focusGroups.has(group.id);
      const baseDev = config.devMult * (isFocused ? 1.5 : 1.0);
      const potGap = (p.potential ?? p.ovr + 5) - p.ovr;
      const ageDecay = Math.max(0, 1 - (p.age - 26) * 0.05);
      const devChance = Math.min(0.7, 0.3 + potGap * 0.02) * baseDev * ageDecay;

      const roll = rng();
      let change = 0;
      if (roll < devChance * 0.3) change = 2;
      else if (roll < devChance) change = 1;

      const injured = rng() < config.injuryChance * (intensity === 'hard' ? 1.5 : 1);

      newResults[p.id] = { change, injured, devChance };
    });

    setResults(newResults);
    setDrillsRun((prev) => prev + 1);

    if (typeof actions?.conductDrill === 'function') {
      try {
        const teamId = league?.userTeamId;
        const posGroups = focusGroups.size > 0 ? Array.from(focusGroups) : [];
        await actions.conductDrill(teamId, intensity, drillType, posGroups);
        setPersistState('persisted');
      } catch {
        setPersistState('preview');
      }
    } else {
      setPersistState('preview');
    }
  }, [drillsRemaining, league, drillsRun, intensity, roster, focusGroups, drillType, actions]);

  const summary = useMemo(() => {
    if (!results) return null;
    let improved = 0; let injured = 0; let totalGain = 0;
    Object.values(results).forEach((r) => {
      if (r.change > 0) improved += 1;
      if (r.injured) injured += 1;
      totalGain += r.change;
    });
    return { improved, injured, totalGain, total: Object.keys(results).length };
  }, [results]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 16 }}>
      <div className="stat-box" style={{ marginBottom: 'var(--space-4, 16px)', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg, 18px)', fontWeight: 800, color: 'var(--text)' }}>{model.phaseLabel}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs, 12px)', color: 'var(--text-muted)' }}>{model.weekLabel} · {model.practiceStateLabel}</p>
          </div>
          <span style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '6px 10px', alignSelf: 'flex-start' }}>
            {model.risk.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10, fontSize: 12 }}>
          <div>Drills Remaining: <strong>{model.drillsRemaining}/{model.maxDrills}</strong></div>
          <div>Intensity: <strong>{intensity}</strong></div>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{model.recommendedNextAction}</p>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-subtle)' }}>{model.matchupTrainingNote}</p>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-subtle)' }}>{model.prepSupportLabel}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('Weekly Prep')}>Back to Weekly Prep</button>
          <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('HQ')}>Back to HQ</button>
        </div>
      </div>

      {model.recommendedFocus.length > 0 && (
        <div className="stat-box" style={{ marginBottom: 'var(--space-4, 16px)', padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Recommended Focus</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {model.recommendedFocus.map((rec) => (
              <article key={rec.groupId} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{rec.groupLabel}</strong>
                  <button type="button" className="btn btn-xs" onClick={() => applyRecommendation(rec)}>Select this focus</button>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{rec.reason}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-subtle)' }}>
                  Suggested: {rec.suggestedDrillType} · {rec.suggestedIntensity} intensity · {rec.riskNote}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {model.developmentCandidates.length > 0 && (
        <div className="stat-box" style={{ marginBottom: 'var(--space-4, 16px)', padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Development Candidates</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {model.developmentCandidates.map((player) => (
              <div key={player.playerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--hairline)', paddingBottom: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{player.name} · {player.pos}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age {player.age} · OVR {player.ovr} · POT {player.potential}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{player.reason}</div>
                </div>
                {onPlayerSelect ? <button type="button" className="btn btn-xs" onClick={() => onPlayerSelect(player.playerId)}>View Player</button> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-box" style={{ marginBottom: 'var(--space-4, 16px)', padding: '12px' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Practice Intensity
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {INTENSITY_LEVELS.map((level) => (
              <button
                key={level.id}
                className="btn"
                onClick={() => setIntensity(level.id)}
                aria-pressed={intensity === level.id}
                style={{
                  flex: 1, padding: '8px', fontSize: 12, fontWeight: 700,
                  background: intensity === level.id ? `${level.color}22` : 'var(--surface-strong, #1a1a2e)',
                  color: intensity === level.id ? level.color : 'var(--text-muted)',
                  border: `2px solid ${intensity === level.id ? level.color : 'transparent'}`,
                  borderRadius: 'var(--radius-md, 8px)', cursor: 'pointer',
                }}
              >
                {level.label}
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{level.desc}</div>
              </button>
            ))}
          </div>
          {intensity === 'hard' && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--warning)' }}>Hard intensity increases drill injury risk this week.</p>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Drill Focus
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DRILL_TYPES.map((drill) => (
              <button
                key={drill.id}
                className="btn"
                onClick={() => setDrillType(drill.id)}
                aria-pressed={drillType === drill.id}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 600,
                  background: drillType === drill.id ? 'var(--accent)22' : 'var(--surface-strong, #1a1a2e)',
                  color: drillType === drill.id ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${drillType === drill.id ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 'var(--radius-pill, 100px)', cursor: 'pointer',
                }}
              >
                {drill.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Focus Groups (pick up to 2 for bonus development)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {POSITION_GROUPS.map((g) => (
              <button
                key={g.id}
                className="btn"
                onClick={() => toggleFocus(g.id)}
                aria-pressed={focusGroups.has(g.id)}
                style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: 600,
                  background: focusGroups.has(g.id) ? 'var(--accent)22' : 'var(--surface-strong, #1a1a2e)',
                  color: focusGroups.has(g.id) ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${focusGroups.has(g.id) ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 'var(--radius-pill, 100px)', cursor: 'pointer',
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn"
          onClick={runDrills}
          disabled={drillsRemaining <= 0}
          style={{
            width: '100%', padding: '12px', fontSize: 14, fontWeight: 800,
            background: drillsRemaining > 0 ? 'var(--accent)' : 'var(--surface-strong, #1a1a2e)',
            color: drillsRemaining > 0 ? 'white' : 'var(--text-subtle)',
            border: 'none', borderRadius: 'var(--radius-md, 8px)', cursor: drillsRemaining > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          {drillsRemaining > 0 ? `Run Drills (${drillsRemaining} remaining)` : 'No Drills Remaining This Week'}
        </button>
      </div>

      {summary && (
        <div className="stat-box fade-in" style={{ marginBottom: 'var(--space-4, 16px)', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{summary.improved}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Players Improved</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>+{summary.totalGain}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total OVR Gained</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: summary.injured > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{summary.injured}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Injuries</div>
          </div>
        </div>
      )}

      {results && (
        <div className="stat-box" style={{ marginBottom: 12, padding: 10, fontSize: 12 }}>
          {persistState === 'persisted' ? 'Drill effects were sent to simulation via conductDrill (weekly boosts/injury risk persist for this week).' : 'Persistence unavailable — this run is a local preview for planning only.'}
        </div>
      )}

      {POSITION_GROUPS.map((group) => {
        const data = groups[group.id];
        if (!data || data.players.length === 0) return null;
        const isExpanded = expanded.has(group.id);
        const isFocused = focusGroups.has(group.id);
        const groupResults = results ? data.players.map((p) => ({ player: p, result: results[p.id] })) : null;
        const groupImproved = groupResults?.filter((r) => r.result?.change > 0).length ?? 0;

        return (
          <div key={group.id} className="stat-box" style={{ marginBottom: 'var(--space-3, 12px)', overflow: 'hidden', border: isFocused ? '1px solid var(--accent)' : undefined }}>
            <div
              onClick={() => toggleExpand(group.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--hairline)' : 'none' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {group.label}
                  {isFocused && <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 6, fontWeight: 800 }}>FOCUS</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {data.players.length} players
                  {groupResults && ` · ${groupImproved} improved`}
                </div>
              </div>
              <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: 14, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                ▼
              </div>
            </div>
            {isExpanded && (
              <div>
                {data.players
                  .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
                  .map((p) => (
                    <PlayerDrillRow
                      key={p.id}
                      player={p}
                      result={results?.[p.id]}
                      onSelect={onPlayerSelect}
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}

      {roster.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏈</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No roster data available</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Load a league to access training camp</div>
        </div>
      )}
    </div>
  );
}
