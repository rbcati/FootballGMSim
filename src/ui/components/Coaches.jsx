import React, { useState, useEffect, useCallback } from 'react';

// ── Components ──────────────────────────────────────────────────────────────

function CoachCard({ coach, onFire, isUserCoach }) {
  if (!coach) return <div className="card padding-md text-muted">No Head Coach hired.</div>;

  return (
    <div className="card padding-md" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>{coach.name}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                    Head Coach · {coach.age} years old · {coach.years}yr contract
                </div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--accent)' }}>{coach.rating}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>OVR</div>
            </div>
        </div>

        <div className="grid two" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-4)' }}>
            <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Offensive Scheme</div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{coach.offScheme}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Defensive Scheme</div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{coach.defScheme}</div>
            </div>
        </div>

        {isUserCoach && (
            <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
                <button className="btn btn-danger" onClick={() => onFire(coach)}>Fire Coach</button>
            </div>
        )}
    </div>
  );
}

function CoachRow({ coach, onHire }) {
    return (
        <tr>
            <td style={{ fontWeight: 600 }}>{coach.name}</td>
            <td>{coach.age}</td>
            <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{coach.rating}</td>
            <td>{coach.offScheme}</td>
            <td>{coach.defScheme}</td>
            <td>${coach.salary}M</td>
            <td style={{ textAlign: 'right' }}>
                <button className="btn btn-sm btn-primary" onClick={() => onHire(coach)}>Hire</button>
            </td>
        </tr>
    );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Coaches({ league, actions }) {
    const teamId = league?.userTeamId;
    const [rosterData, setRosterData] = useState(null);
    const [availableCoaches, setAvailableCoaches] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchCoaches = useCallback(async () => {
        if (teamId == null) return;
        setLoading(true);
        try {
            // Get current staff
            const rosterResp = await actions.getRoster(teamId);
            if (rosterResp?.payload) {
                setRosterData(rosterResp.payload);
            }

            if (actions.getAvailableCoaches) {
                const availResp = await actions.getAvailableCoaches();
                if (availResp?.payload?.coaches) {
                    setAvailableCoaches(availResp.payload.coaches);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [teamId, actions]);

    useEffect(() => { fetchCoaches(); }, [fetchCoaches]);

    const handleFire = async (coach) => {
        if (confirm(`Are you sure you want to fire ${coach.name}?`)) {
            await actions.fireCoach({ teamId, role: 'HC' });
            fetchCoaches();
        }
    };

    const handleHire = async (coach) => {
        if (confirm(`Hire ${coach.name} for $${coach.salary}M/yr? This will replace your current coach.`)) {
            await actions.hireCoach({ teamId, coach, role: 'HC' });
            fetchCoaches();
        }
    };

    const headCoach = rosterData?.team?.staff?.headCoach;

    if (loading && !rosterData) return <div className="card padding-md text-muted">Loading coaches...</div>;

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-4)' }}>Coaching Staff</h1>

            <CoachCard coach={headCoach} onFire={handleFire} isUserCoach={true} />

            <h3 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-3)' }}>Available Head Coaches</h3>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrapper">
                    <table className="standings-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', paddingLeft: 'var(--space-4)' }}>Name</th>
                                <th style={{ textAlign: 'left' }}>Age</th>
                                <th style={{ textAlign: 'left' }}>OVR</th>
                                <th style={{ textAlign: 'left' }}>Off Scheme</th>
                                <th style={{ textAlign: 'left' }}>Def Scheme</th>
                                <th style={{ textAlign: 'left' }}>Salary</th>
                                <th style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableCoaches.filter(c => c.position === 'HC').map(coach => (
                                <CoachRow key={coach.id} coach={coach} onHire={handleHire} />
                            ))}
                            {availableCoaches.length === 0 && <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center' }}>No coaches available.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
