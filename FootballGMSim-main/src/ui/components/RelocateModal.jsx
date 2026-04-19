import React, { useState } from 'react';

export default function RelocateModal({ team, actions, onClose }) {
  const [city, setCity] = useState(team.city || '');
  const [name, setName] = useState(team.name || '');
  const [abbr, setAbbr] = useState(team.abbr || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!city || !name || !abbr) return;
    await actions.relocateTeam(team.id, city, name, abbr);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card fade-in"
        style={{
          width: '90%',
          maxWidth: 400,
          background: 'var(--surface)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', borderBottom: '1px solid var(--hairline)', paddingBottom: 'var(--space-3)' }}>
          Relocate Franchise
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
             <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>City</label>
             <input type="text" className="input" value={city} onChange={e => setCity(e.target.value)} required />
          </div>
          <div>
             <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Mascot / Name</label>
             <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
             <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Abbreviation</label>
             <input type="text" className="input" value={abbr} onChange={e => setAbbr(e.target.value.toUpperCase())} maxLength={3} required />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
             <button type="button" className="btn" onClick={onClose}>Cancel</button>
             <button type="submit" className="btn btn-primary">Confirm Relocation</button>
          </div>
        </form>
      </div>
    </div>
  );
}
