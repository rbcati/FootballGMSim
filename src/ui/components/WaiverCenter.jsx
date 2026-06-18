/**
 * WaiverCenter.jsx — Post-Deadline Waiver Wire UI
 *
 * Displays active waiver players, user's priority position, and claim controls.
 * Props:
 *   league: { waiverWindowOpen, waiverPlayers, waiverPriorityPosition, userWaiverClaims, userTeamId, teams }
 *   actions: { submitWaiverClaim, cancelWaiverClaim }
 */

import React from 'react';

function capHit(contract) {
  if (!contract) return 0;
  const base = contract.baseAnnual ?? 0;
  const bonus = contract.signingBonus ?? 0;
  const years = contract.yearsTotal || 1;
  return base + bonus / years;
}

function formatContract(contract) {
  if (!contract) return 'No Contract';
  const hit = capHit(contract);
  const years = contract.yearsTotal ?? contract.years ?? 1;
  return `$${hit.toFixed(1)}M/yr (${years}yr)`;
}

export default function WaiverCenter({ league, actions }) {
  const waiverWindowOpen = league?.waiverWindowOpen ?? false;
  const waiverPlayers = Array.isArray(league?.waiverPlayers) ? league.waiverPlayers : [];
  const waiverPriorityPosition = league?.waiverPriorityPosition ?? null;
  const userWaiverClaims = Array.isArray(league?.userWaiverClaims) ? league.userWaiverClaims : [];
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const userTeamId = league?.userTeamId ?? null;

  // Don't render if no active waiver window and no waiver players
  if (!waiverWindowOpen && waiverPlayers.length === 0) return null;

  const userTeam = teams.find(t => String(t.id) === String(userTeamId));
  const userCapRoom = userTeam?.capRoom ?? 0;

  const getPreviousTeamName = (previousTeamId) => {
    if (previousTeamId == null) return 'FA';
    const team = teams.find(t => String(t.id) === String(previousTeamId));
    return team?.abbr ?? team?.name ?? String(previousTeamId);
  };

  const canAfford = (player) => {
    const hit = capHit(player.waiverContract);
    return userCapRoom >= hit;
  };

  const handleClaim = (playerId) => {
    if (actions?.submitWaiverClaim) {
      actions.submitWaiverClaim(playerId);
    }
  };

  const handleCancel = (playerId) => {
    if (actions?.cancelWaiverClaim) {
      actions.cancelWaiverClaim(playerId);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 18 }}>Waiver Wire</h3>
        {!waiverWindowOpen && (
          <div style={{ color: '#FF9F0A', fontSize: 13 }}>Waiver window is closed</div>
        )}
        {waiverWindowOpen && (
          <div style={{ color: '#34C759', fontSize: 13 }}>
            Waiver window open (Weeks 11-14)
            {waiverPriorityPosition != null && (
              <span style={{ marginLeft: 12, color: '#fff' }}>
                Your Waiver Priority: <strong>#{waiverPriorityPosition} / 32</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {waiverPlayers.length === 0 ? (
        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No players currently on waivers.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Name</th>
                <th style={{ padding: '6px 8px' }}>Pos</th>
                <th style={{ padding: '6px 8px' }}>OVR</th>
                <th style={{ padding: '6px 8px' }}>Age</th>
                <th style={{ padding: '6px 8px' }}>Contract</th>
                <th style={{ padding: '6px 8px' }}>Prev. Team</th>
                <th style={{ padding: '6px 8px' }}>Expires</th>
                <th style={{ padding: '6px 8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {waiverPlayers.map(player => {
                const playerIdStr = String(player.id);
                const hasClaim = userWaiverClaims.includes(playerIdStr);
                const affordable = canAfford(player);

                return (
                  <tr
                    key={player.id}
                    style={{
                      borderBottom: '1px solid #1f2937',
                      background: hasClaim ? 'rgba(52, 199, 89, 0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{player.name}</td>
                    <td style={{ padding: '8px 8px', color: '#9ca3af' }}>{player.pos}</td>
                    <td style={{ padding: '8px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        minWidth: 32,
                        textAlign: 'center',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontWeight: 600,
                        background: (player.ovr ?? 0) >= 85 ? '#4ade80' : (player.ovr ?? 0) >= 75 ? '#facc15' : '#6b7280',
                        color: (player.ovr ?? 0) >= 85 ? '#14532d' : (player.ovr ?? 0) >= 75 ? '#713f12' : '#fff',
                      }}>
                        {player.ovr ?? '??'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 8px', color: '#9ca3af' }}>{player.age ?? '??'}</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontSize: 12 }}>
                      {formatContract(player.waiverContract)}
                    </td>
                    <td style={{ padding: '8px 8px', color: '#9ca3af' }}>
                      {getPreviousTeamName(player.previousTeamId)}
                    </td>
                    <td style={{ padding: '8px 8px', color: '#9ca3af', fontSize: 12 }}>
                      Wk {player.waiverWeekExpires ?? '??'}
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      {hasClaim ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(52, 199, 89, 0.15)',
                            color: '#34C759',
                            fontSize: 11,
                            fontWeight: 600,
                          }}>
                            Claim Pending
                          </span>
                          <button
                            onClick={() => handleCancel(player.id)}
                            disabled={!waiverWindowOpen}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid #FF453A',
                              background: 'transparent',
                              color: '#FF453A',
                              cursor: waiverWindowOpen ? 'pointer' : 'not-allowed',
                              fontSize: 11,
                              opacity: waiverWindowOpen ? 1 : 0.5,
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : affordable ? (
                        <button
                          onClick={() => handleClaim(player.id)}
                          disabled={!waiverWindowOpen}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: waiverWindowOpen ? '#3b82f6' : '#374151',
                            color: '#fff',
                            cursor: waiverWindowOpen ? 'pointer' : 'not-allowed',
                            fontSize: 12,
                            fontWeight: 500,
                            opacity: waiverWindowOpen ? 1 : 0.7,
                          }}
                        >
                          Claim Player
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{
                            padding: '4px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: '#374151',
                            color: '#6b7280',
                            cursor: 'not-allowed',
                            fontSize: 12,
                          }}
                        >
                          Insufficient cap space
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {waiverWindowOpen && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#1f2937', borderRadius: 6, fontSize: 12, color: '#9ca3af' }}>
          Claims are processed at the start of each advance. Higher priority teams (worse record) claim first.
          If awarded, the winning team moves to the bottom of the priority list.
        </div>
      )}
    </div>
  );
}
