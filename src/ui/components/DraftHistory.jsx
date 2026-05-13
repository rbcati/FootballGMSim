import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from '../utils/dataBrowser.js';

const EMPTY_COPY = 'Draft history will appear after completed drafts are logged in your dynasty.';
const DRAFT_SORT_OPTIONS = [
  { value: 'overall', label: 'Original order' },
  { value: 'playerName', label: 'Player' },
  { value: 'draftTeamAbbr', label: 'Team' },
  { value: 'redraftRank', label: 'Redraft rank' },
  { value: 'redraftDelta', label: 'Redraft delta' },
  { value: 'legacyScore', label: 'Legacy score' },
];

export default function DraftHistory({ league, actions, onPlayerSelect, onNavigate }) {
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [model, setModel] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('overall');
  const [sortDir, setSortDir] = useState('asc');

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
  const teamOptions = useMemo(() => uniqueFilterOptions(model?.picks ?? [], (pick) => pick?.draftTeamAbbr ?? ''), [model?.picks]);
  const positionOptions = useMemo(() => uniqueFilterOptions(model?.picks ?? [], (pick) => pick?.pos ?? ''), [model?.picks]);
  const fullClassRows = useMemo(() => {
    const filtered = (model?.picks ?? []).filter((pick) => {
      if (teamFilter !== 'ALL' && (pick?.draftTeamAbbr ?? '') !== teamFilter) return false;
      if (positionFilter !== 'ALL' && (pick?.pos ?? '') !== positionFilter) return false;
      return rowMatchesSearch(pick, search, [
        'overall',
        'playerName',
        'pos',
        'draftTeamAbbr',
        'outcomeLabel',
        'redraftRank',
        'redraftDelta',
      ]);
    });
    return stableSortRows(filtered, (pick) => pick?.[sortKey], sortDir, (pick) => pick?.overall ?? 999);
  }, [model?.picks, positionFilter, search, sortDir, sortKey, teamFilter]);
  const hasClassFilters = Boolean(search.trim()) || teamFilter !== 'ALL' || positionFilter !== 'ALL' || sortKey !== 'overall' || sortDir !== 'asc';

  useEffect(() => {
    if (teamFilter !== 'ALL' && !teamOptions.includes(teamFilter)) {
      setTeamFilter('ALL');
    }
    if (positionFilter !== 'ALL' && !positionOptions.includes(positionFilter)) {
      setPositionFilter('ALL');
    }
  }, [positionFilter, positionOptions, teamFilter, teamOptions]);

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
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input
                    aria-label="Search draft history picks"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search player, team, outcome"
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 220, flex: '1 1 220px' }}
                  />
                  <select
                    aria-label="Filter draft history picks by team"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 120 }}
                  >
                    <option value="ALL">All teams</option>
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter draft history picks by position"
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 120 }}
                  >
                    <option value="ALL">All positions</option>
                    {positionOptions.map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort draft history picks"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 140 }}
                  >
                    {DRAFT_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" aria-label="Toggle draft history sort direction" onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
                    {sortDir === 'asc' ? 'Lowest/A first' : 'Highest/Z first'}
                  </button>
                  {hasClassFilters ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSearch('');
                        setTeamFilter('ALL');
                        setPositionFilter('ALL');
                        setSortKey('overall');
                        setSortDir('asc');
                      }}
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>
                <div data-testid="draft-history-class-count" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  <span>{buildShowingLabel(fullClassRows.length, model.picks.length, 'pick')}</span>
                  <span>Sort: {DRAFT_SORT_OPTIONS.find((option) => option.value === sortKey)?.label ?? sortKey} {sortDir === 'asc' ? '↑' : '↓'}</span>
                  {teamFilter !== 'ALL' ? <span>Team: {teamFilter}</span> : null}
                  {positionFilter !== 'ALL' ? <span>Pos: {positionFilter}</span> : null}
                </div>
                {fullClassRows.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    No draft picks match those filters.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 md:hidden" data-testid="draft-history-class-cards">
                      {fullClassRows.map((p) => (
                        <div key={`card-${p.playerId ?? p.overall}`} data-testid={`draft-history-pick-card-${p.playerId ?? p.overall}`} className="card" style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <strong>#{p.overall ?? '—'}</strong>
                            <span style={{ color: 'var(--text-muted)' }}>{p.draftTeamAbbr ?? '—'} · {p.pos ?? '—'}</span>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 700 }}
                              onClick={() => p.playerId != null && onPlayerSelect?.(p.playerId)}
                            >
                              {p.playerName}
                            </button>
                          </div>
                          <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                            Redraft #{p.redraftRank ?? '—'}
                            {p.redraftDelta != null ? ` · Δ${p.redraftDelta}` : ''}
                          </div>
                          <div style={{ marginTop: 4 }}>{p.outcomeLabel ?? 'Outcome pending'}</div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                      <table className="table-compact" style={{ width: '100%', fontSize: 'var(--text-xs)' }}>
                        <thead>
                          <tr>
                            <th>Ovr</th>
                            <th>Player</th>
                            <th>Pos</th>
                            <th>By</th>
                            <th>Redraft</th>
                            <th>Delta</th>
                            <th>Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fullClassRows.map((p) => (
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
                              <td>{p.redraftDelta ?? '—'}</td>
                              <td>{p.outcomeLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
