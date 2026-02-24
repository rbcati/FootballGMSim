import React, { useState } from 'react';
import { DEFAULT_TEAMS } from '../../data/default-teams.js';

export default function NewLeagueSetup({ actions, onCancel }) {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [year, setYear] = useState(2025);
  const [creating, setCreating] = useState(false);

  const handleStart = async () => {
    if (selectedTeam === null) return;
    setCreating(true);
    // This triggers BUSY state in useWorker, showing loading spinner in App if implemented there
    // Or we just show local loading state.
    await actions.newLeague(DEFAULT_TEAMS, { userTeamId: selectedTeam, year });
  };

  return (
    <div style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    }}>
        <div style={{ width: '100%', maxWidth: 1200 }}>
            <h1 style={{
                textAlign: 'center',
                marginBottom: 'var(--space-2)',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: 'var(--text-3xl)',
                fontWeight: 800
            }}>
                Select Your Team
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
                Choose a franchise to lead to glory in the {year} season.
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-8)'
            }}>
                {DEFAULT_TEAMS.map(team => (
                    <button
                        key={team.id}
                        onClick={() => setSelectedTeam(team.id)}
                        className={`btn ${selectedTeam === team.id ? 'selected' : ''}`}
                        style={{
                            padding: 'var(--space-4)',
                            border: selectedTeam === team.id ? '2px solid var(--accent)' : '1px solid var(--hairline)',
                            background: selectedTeam === team.id ? 'var(--accent-muted)' : 'var(--surface)',
                            cursor: 'pointer',
                            borderRadius: 'var(--radius-lg)',
                            textAlign: 'left',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 'var(--space-1)',
                            transition: 'all 0.2s ease',
                            transform: selectedTeam === team.id ? 'scale(1.02)' : 'scale(1)'
                        }}
                    >
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text)' }}>{team.name}</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {team.conf === 0 ? 'AFC' : 'NFC'} {['East','North','South','West'][team.div]}
                        </div>
                    </button>
                ))}
            </div>

            <div style={{
                position: 'sticky',
                bottom: 'var(--space-6)',
                background: 'var(--surface-elevated)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--hairline)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-xl)',
                maxWidth: 600,
                margin: '0 auto'
            }}>
                <button
                    className="btn"
                    onClick={onCancel}
                    disabled={creating}
                    style={{ flex: 1, fontSize: 'var(--text-lg)' }}
                >
                    Back
                </button>
                <button
                    className="btn primary"
                    onClick={handleStart}
                    disabled={selectedTeam === null || creating}
                    style={{ flex: 2, fontSize: 'var(--text-lg)' }}
                >
                    {creating ? 'Creating League...' : 'Start Career'}
                </button>
            </div>
        </div>
    </div>
  );
}
