import React, { useState, useEffect, useCallback } from 'react';

const ROLE_HEAD_COACH = 'headCoach';
const ROLE_OC = 'offensiveCoordinator';
const ROLE_DC = 'defensiveCoordinator';

const ROLE_LABELS = {
  [ROLE_HEAD_COACH]: 'Head Coach',
  [ROLE_OC]: 'Offensive Coordinator',
  [ROLE_DC]: 'Defensive Coordinator',
};

const ROLE_KEYS = {
  [ROLE_HEAD_COACH]: 'headCoach',
  [ROLE_OC]: 'OC',
  [ROLE_DC]: 'DC',
};

function ratingColor(r) {
  if (r >= 80) return 'var(--success, #34c759)';
  if (r >= 65) return 'var(--accent, #007aff)';
  if (r >= 50) return 'var(--warning, #ff9f0a)';
  return 'var(--danger, #ff453a)';
}

function ratingTier(r) {
  if (r >= 80) return 'Elite';
  if (r >= 65) return 'Solid';
  if (r >= 50) return 'Average';
  return 'Poor';
}

function schemeMultiplierLabel(r) {
  if (r >= 80) return '+8% sim boost';
  if (r >= 65) return 'Neutral';
  if (r >= 50) return '−6% sim penalty';
  return '−12% sim penalty';
}

function CoachStaffCard({ role, coachData, onFire, onExtend, canFire, canExtend, phase }) {
  const name = coachData?.name ?? '(Vacant)';
  const rating = Number(coachData?.overallRating ?? coachData?.rating ?? 0);
  const scheme = coachData?.scheme ?? '—';
  const yearsLeft = Number(coachData?.contractYearsLeft ?? 0);
  const isHotSeat = !!coachData?.hotSeat;
  const hasCoach = !!coachData?.id || !!coachData?.name;

  const fireAllowed = canFire && hasCoach;
  const extendAllowed = canExtend && hasCoach && yearsLeft <= 1;

  return (
    <div
      className="card padding-md"
      style={{ marginBottom: 'var(--space-3)', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: 2 }}>
            {ROLE_LABELS[role]}
          </div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {name}
            {isHotSeat && (
              <span
                style={{ fontSize: 'var(--text-xs)', background: 'var(--danger, #ff453a)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}
                title="Hot seat: poor win% for 2+ seasons"
              >
                HOT SEAT
              </span>
            )}
          </div>
          {hasCoach && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
              Scheme: {scheme} · Contract: {yearsLeft} yr{yearsLeft !== 1 ? 's' : ''} left
            </div>
          )}
        </div>
        {hasCoach && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: ratingColor(rating) }}>{rating}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{ratingTier(rating)}</div>
          </div>
        )}
      </div>

      {hasCoach && (
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Sim effect: {schemeMultiplierLabel(rating)}
        </div>
      )}

      {!hasCoach && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          No coach assigned — hire from the market below.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
        {extendAllowed && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => onExtend(role, coachData)}
            title="Extend contract by 1–3 years (available when ≤1 year left)"
          >
            Extend Contract
          </button>
        )}
        {fireAllowed && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => onFire(role, coachData)}
          >
            Fire
          </button>
        )}
      </div>
    </div>
  );
}

function MarketCoachRow({ coach, onHire, targetRole, disabled }) {
  const rating = Number(coach?.overallRating ?? coach?.rating ?? 0);
  const scheme = coach?.scheme ?? '—';
  const salary  = coach?.salary ?? '—';

  return (
    <tr>
      <td style={{ fontWeight: 600, paddingLeft: 'var(--space-4)' }}>{coach.name}</td>
      <td style={{ color: ratingColor(rating), fontWeight: 700 }}>{rating}</td>
      <td>{scheme}</td>
      <td>{typeof salary === 'number' ? `$${salary}M` : salary}</td>
      <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => onHire(coach, targetRole)}
          disabled={disabled}
        >
          Hire
        </button>
      </td>
    </tr>
  );
}

function CoachHistoryLog({ history }) {
  if (!Array.isArray(history) || history.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No coaching history yet.</div>;
  }
  const recent = [...history].reverse().slice(0, 5);
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {recent.map((entry, i) => (
        <li key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '3px 0', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{entry.name ?? '?'}</span>
          {' '}({ROLE_LABELS[entry.role] ?? entry.role ?? '?'}) — Season {entry.firedSeason ?? entry.season ?? '?'}
          {entry.reason ? ` · ${entry.reason}` : ''}
        </li>
      ))}
    </ul>
  );
}

// ── ExtendModal ─────────────────────────────────────────────────────────────

function ExtendModal({ role, coachData, onConfirm, onCancel }) {
  const [years, setYears] = useState(2);
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onCancel}
    >
      <div
        className="card padding-md"
        style={{ maxWidth: 360, width: '100%', margin: 'var(--space-4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Extend Contract</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Extend <strong>{coachData?.name ?? 'coach'}</strong> ({ROLE_LABELS[role]}) contract by:
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)' }}>
          {[1, 2, 3].map((y) => (
            <button
              key={y}
              className={`btn btn-sm ${years === y ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setYears(y)}
            >
              {y} yr
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={() => onConfirm(years)}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Main: CoachingScreen ────────────────────────────────────────────────────

export default function CoachingScreen({ league, actions }) {
  const userTeamId = league?.userTeamId;
  const phase = league?.phase ?? 'regular';

  const [coachState, setCoachState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [activeHireRole, setActiveHireRole] = useState(null);
  const [extendTarget, setExtendTarget] = useState(null);

  const loadCoachingState = useCallback(async () => {
    if (!userTeamId || !actions?.getCoachingState) return;
    setLoading(true);
    try {
      const resp = await actions.getCoachingState(userTeamId);
      if (resp?.payload) setCoachState(resp.payload);
      setError(null);
    } catch (e) {
      setError(e?.message ?? 'Could not load coaching data.');
    } finally {
      setLoading(false);
    }
  }, [userTeamId, actions]);

  useEffect(() => { loadCoachingState(); }, [loadCoachingState]);

  const handleFire = async (role, coachData) => {
    if (!window.confirm(`Fire ${coachData?.name ?? 'this coach'}? This will trigger morale events for players and cannot be undone this season.`)) return;
    setBusy(true);
    try {
      const roleKey = ROLE_KEYS[role] ?? role;
      const resp = await actions.fireCoach({ teamId: userTeamId, role: roleKey });
      if (resp?.payload) setCoachState(resp.payload);
      setError(null);
    } catch (e) {
      setError(e?.message ?? 'Could not fire coach.');
    } finally {
      setBusy(false);
    }
  };

  const handleHire = async (coach, role) => {
    if (!window.confirm(`Hire ${coach?.name} as ${ROLE_LABELS[role]}?`)) return;
    setBusy(true);
    try {
      const roleKey = ROLE_KEYS[role] ?? role;
      const resp = await actions.hireCoach({ teamId: userTeamId, coachId: coach.id, role: roleKey });
      if (resp?.payload) setCoachState(resp.payload);
      setActiveHireRole(null);
      setError(null);
    } catch (e) {
      setError(e?.message ?? 'Could not hire coach.');
    } finally {
      setBusy(false);
    }
  };

  const handleExtendConfirm = async (years) => {
    if (!extendTarget) return;
    setBusy(true);
    try {
      const roleKey = ROLE_KEYS[extendTarget.role] ?? extendTarget.role;
      const resp = await actions.contractExtensionCoach({ teamId: userTeamId, role: roleKey, years });
      if (resp?.payload) setCoachState(resp.payload);
      setExtendTarget(null);
      setError(null);
    } catch (e) {
      setError(e?.message ?? 'Could not extend contract.');
    } finally {
      setBusy(false);
    }
  };

  // Determine which phases allow firing (offseason phases only per spec)
  const offseasonPhases = ['offseason', 'offseason_resign', 'offseason_draft', 'free_agency', 'preseason'];
  const canFire = offseasonPhases.includes(phase);

  const coach = coachState?.coach ?? {};
  const coachHistory = coachState?.coachHistory ?? [];
  const coachingMarket = coachState?.coachingMarket ?? [];

  const marketForRole = (role) => {
    if (!Array.isArray(coachingMarket)) return [];
    // Filter by role if coaches have a role property, otherwise show all
    return coachingMarket.filter((c) => {
      if (!c?.role || c.role === 'any') return true;
      if (role === ROLE_HEAD_COACH) return c.role === 'HC' || c.role === ROLE_HEAD_COACH;
      if (role === ROLE_OC) return c.role === 'OC' || c.role === ROLE_OC;
      if (role === ROLE_DC) return c.role === 'DC' || c.role === ROLE_DC;
      return true;
    });
  };

  if (loading && !coachState) {
    return <div className="card padding-md text-muted">Loading coaching staff…</div>;
  }

  const roles = [ROLE_HEAD_COACH, ROLE_OC, ROLE_DC];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Coaching Staff</h2>

      {error && (
        <div role="alert" className="card padding-md" style={{ marginBottom: 'var(--space-4)', border: '1.5px solid var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {!canFire && (
        <div className="card padding-md" style={{ marginBottom: 'var(--space-4)', background: 'var(--surface)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Coaching changes are only available during the offseason.
        </div>
      )}

      {roles.map((role) => (
        <CoachStaffCard
          key={role}
          role={role}
          coachData={coach[role]}
          phase={phase}
          canFire={canFire && !busy}
          canExtend={!busy}
          onFire={handleFire}
          onExtend={(r, d) => setExtendTarget({ role: r, coachData: d })}
        />
      ))}

      {/* Hire panel */}
      {canFire && coachingMarket.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Coaching Market</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)' }}>
            {roles.map((role) => (
              <button
                key={role}
                className={`btn btn-sm ${activeHireRole === role ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveHireRole(activeHireRole === role ? null : role)}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>

          {activeHireRole && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrapper">
                <table className="standings-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingLeft: 'var(--space-4)' }}>Name</th>
                      <th style={{ textAlign: 'left' }}>OVR</th>
                      <th style={{ textAlign: 'left' }}>Scheme</th>
                      <th style={{ textAlign: 'left' }}>Salary</th>
                      <th style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketForRole(activeHireRole).length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No coaches available for this role.</td></tr>
                    ) : (
                      marketForRole(activeHireRole).map((coach) => (
                        <MarketCoachRow
                          key={coach.id}
                          coach={coach}
                          targetRole={activeHireRole}
                          onHire={handleHire}
                          disabled={busy}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {canFire && coachingMarket.length === 0 && (
        <div className="card padding-md" style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          No coaches available in the market this offseason. Advance to a new season to refresh the market.
        </div>
      )}

      {/* Coaching history */}
      {coachHistory.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>Coaching History</h3>
          <div className="card padding-md">
            <CoachHistoryLog history={coachHistory} />
          </div>
        </div>
      )}

      {/* Extend modal */}
      {extendTarget && (
        <ExtendModal
          role={extendTarget.role}
          coachData={extendTarget.coachData}
          onConfirm={handleExtendConfirm}
          onCancel={() => setExtendTarget(null)}
        />
      )}
    </div>
  );
}
