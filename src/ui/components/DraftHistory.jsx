import React, { useCallback, useEffect, useState } from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';

const EMPTY_COPY = 'Draft history will appear after completed drafts are logged in your dynasty.';

export default function DraftHistory({ league, actions, onPlayerSelect, onNavigate }) {
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [model, setModel] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);
  const [error, setError] = useState(null);

  const loadList = useCallback(() => {
    if (!actions?.getDraftClasses) return Promise.resolve();
    setLoadingList(true);
    setError(null);
    return actions
      .getDraftClasses()
      .then((res) => {
        const list = res?.payload?.classes ?? [];
        setClasses(list);
        setSelectedId((prev) => prev ?? (list[0]?.seasonId ?? null));
      })
      .catch(() => {
        setClasses([]);
        setError('Could not load draft classes.');
      })
      .finally(() => setLoadingList(false));
  }, [actions]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId || !actions?.getDraftClass) {
      setModel(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingModel(true);
    actions
      .getDraftClass({ seasonId: selectedId })
      .then((res) => {
        if (cancelled) return;
        setModel(res?.payload?.model ?? null);
      })
      .catch(() => {
        if (!cancelled) setModel(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingModel(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, actions]);

  const summary = model?.classSummary;
  const developing = summary?.isDevelopingClass;

  return (
    <div className="app-screen-stack" data-testid="draft-history-root">
      <ScreenHeader
        title="Draft History"
        subtitle="Redraft boards, class grades, and how picks aged — built from your logged DRAFT transactions."
        metadata={league?.year != null ? [{ label: 'League year', value: String(league.year) }] : []}
      />

      <SectionCard title="Season / class" subtitle="Pick a draft year (by season id) with logged picks.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate?.('History Hub')}>
            Back to History Hub
          </button>
          {loadingList ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading classes…</span>
          ) : null}
        </div>
        {error ? <div style={{ marginTop: 8, color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div> : null}
        {!loadingList && classes.length === 0 ? (
          <div style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{EMPTY_COPY}</div>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {classes.map((c) => (
              <button
                key={c.seasonId}
                type="button"
                className={`btn${selectedId === c.seasonId ? '' : ' btn-secondary'}`}
                data-testid={`draft-history-season-${c.seasonId}`}
                onClick={() => setSelectedId(c.seasonId)}
              >
                {c.year ?? c.seasonId} · {c.pickCount} picks
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedId && (
        <>
          <SectionCard title="Class summary" subtitle={developing ? 'Developing class — redraft is provisional.' : 'Career-weighted snapshot for this draft.'}>
            {loadingModel ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading class…</div>
            ) : !model?.picks?.length ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{EMPTY_COPY}</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, fontSize: 'var(--text-xs)' }}>
                <div>
                  <strong>Status:</strong> {summary?.classLeagueStatus ?? '—'} ·{' '}
                  <strong>Picks:</strong> {summary?.totalPicks ?? 0} · <strong>Avg legacy:</strong>{' '}
                  {summary?.avgLegacyScore != null ? summary.avgLegacyScore : '—'}
                </div>
                <div>
                  <strong>Stars + HOF:</strong> {summary?.starCount ?? 0} · <strong>Contributors+:</strong>{' '}
                  {summary?.starterCount ?? 0}
                </div>
              </div>
            )}
          </SectionCard>

          {model?.redraftTop10?.length > 0 && (
            <SectionCard title="Redraft top 10" subtitle="Sorted by career outcome score (legacy + production signals).">
              <div style={{ display: 'grid', gap: 6 }}>
                {model.redraftTop10.map((row, i) => (
                  <div
                    key={row.playerId ?? i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 'var(--text-xs)',
                      borderBottom: '1px solid var(--hairline)',
                      paddingBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>{row.redraftRank}</span>
                    <div>
                      <button
                        type="button"
                        className="linkish"
                        style={{ fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)' }}
                        onClick={() => row.playerId != null && onPlayerSelect?.(row.playerId)}
                      >
                        {row.playerName}
                      </button>
                      <span style={{ color: 'var(--text-muted)' }}> · {row.pos} · was #{row.originalOverall ?? '—'}</span>
                      <div style={{ color: 'var(--text-muted)' }}>{row.outcomeLabel}{row.reason ? ` — ${row.reason}` : ''}</div>
                    </div>
                    <span style={{ color: row.redraftDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>Δ{row.redraftDelta}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {model?.steals?.length > 0 && (
            <SectionCard title="Biggest values vs slot" subtitle="Large positive redraft delta; requires a few seasons of separation.">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-xs)' }}>
                {model.steals.map((s) => (
                  <li key={s.playerId}>{s.playerName}: {s.note}</li>
                ))}
              </ul>
            </SectionCard>
          )}

          {model?.busts?.length > 0 && (
            <SectionCard title="Reached / missed" subtitle="Only when late-career data supports the label — never for developing classes.">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-xs)' }}>
                {model.busts.map((s) => (
                  <li key={s.playerId}>{s.playerName}: {s.note}</li>
                ))}
              </ul>
            </SectionCard>
          )}

          {model?.teamGrades?.length > 0 && (
            <SectionCard title="Team draft grades" subtitle="Incomplete when the class is still young or a team only has one pick.">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {model.teamGrades.map((g) => (
                  <div key={g.teamId} className="card" style={{ padding: 'var(--space-3)', minWidth: 140, fontSize: 'var(--text-xs)' }}>
                    <div style={{ fontWeight: 800 }}>
                      {(league?.teams ?? []).find((t) => Number(t?.id) === Number(g.teamId))?.abbr ?? `Team ${g.teamId}`}
                    </div>
                    <div>Grade: {g.gradeLabel}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Avg value {g.avgValue} · Picks {g.pickCount}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {model?.picks?.length > 0 && (
            <SectionCard title="Full class" subtitle="Original order · redraft rank · outcome.">
              <div style={{ overflowX: 'auto' }}>
                <table className="table-compact" style={{ width: '100%', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr>
                      <th>Ovr</th>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>By</th>
                      <th>Redraft</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.picks.map((p) => (
                      <tr key={p.playerId}>
                        <td>{p.overall ?? '—'}</td>
                        <td>
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}
                            onClick={() => p.playerId != null && onPlayerSelect?.(p.playerId)}
                          >
                            {p.playerName}
                          </button>
                        </td>
                        <td>{p.pos}</td>
                        <td>{p.draftTeamAbbr ?? '—'}</td>
                        <td>{p.redraftRank ?? '—'}</td>
                        <td>{p.outcomeLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
