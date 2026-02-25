/**
 * LeagueDashboard.jsx
 *
 * Tabbed dashboard using the legacy CSS design system (hub.css, components.css,
 * base.css).  Receives the view-model slice from the Web Worker via `league` prop.
 *
 * Tabs:
 *  - Standings   — AFC/NFC conference tables (conf/div numeric + string safe)
 *  - Schedule    — Current-week matchup cards with final scores
 *  - Leaders     — Simple per-stat top-5 tables
 *  - Roster      — Full player grid with release controls
 *  - Free Agency — FA pool with sign / filter controls
 *  - Trades      — Side-by-side roster trade interface
 */

import React, { useState, useMemo, Component } from 'react';
import Roster          from './Roster.jsx';
import Coaches         from './Coaches.jsx';
import FreeAgency     from './FreeAgency.jsx';
import TradeCenter     from './TradeCenter.jsx';
import BoxScore        from './BoxScore.jsx';
import LeagueHistory   from './LeagueHistory.jsx';
import PlayerProfile   from './PlayerProfile.jsx';
import TeamProfile     from './TeamProfile.jsx';
import Leaders         from './Leaders.jsx';
import AwardRaces      from './AwardRaces.jsx';

// ── TabErrorBoundary ─────────────────────────────────────────────────────────
// Catches render-phase exceptions inside individual tabs.  A crash in one tab
// surfaces a localised error panel rather than tearing down the whole dashboard.

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[TabErrorBoundary] Tab render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ?? 'This tab';
    return (
      <div style={{
        padding: 'var(--space-8)',
        textAlign: 'center',
        color: 'var(--danger)',
        background: 'rgba(255,69,58,0.07)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--danger)',
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-3)' }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>
          {label} encountered a render error
        </div>
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          marginBottom: 'var(--space-4)', fontFamily: 'monospace',
          maxWidth: 480, margin: '0 auto var(--space-4)',
        }}>
          {this.state.error?.message ?? String(this.state.error)}
        </div>
        <button
          className="btn"
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          Retry
        </button>
      </div>
    );
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ['Standings', 'Schedule', 'Leaders', 'Award Races', 'Roster', 'Coaches', 'Free Agency', 'Trades', 'History'];

// Division display labels and their numeric indices (from App.jsx DEFAULT_TEAMS).
// div: 0=East  1=North  2=South  3=West
const DIVS = [
  { name: 'East',  idx: 0 },
  { name: 'North', idx: 1 },
  { name: 'South', idx: 2 },
  { name: 'West',  idx: 3 },
];

const CONFS = ['AFC', 'NFC'];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deterministic colour from team abbreviation so logos feel branded
function teamColor(abbr = '') {
  const palette = [
    '#0A84FF', '#34C759', '#FF9F0A', '#FF453A',
    '#5E5CE6', '#64D2FF', '#FFD60A', '#30D158',
    '#FF6961', '#AEC6CF', '#FF6B35', '#B4A0E5',
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++) hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Normalise a conf value to the 0/1 index regardless of whether teams store
 * it as a number (0=AFC, 1=NFC) or a string ('AFC'/'NFC').
 */
function confIdx(val) {
  if (typeof val === 'number') return val;
  return val === 'AFC' ? 0 : 1;
}

/** Normalise a div value to its 0-3 index. */
function divIdx(val) {
  if (typeof val === 'number') return val;
  const map = { East: 0, North: 1, South: 2, West: 3 };
  return map[val] ?? 0;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Circular team "logo" placeholder with first 3 chars of abbreviation. */
function TeamLogo({ abbr, size = 56, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `${color}22`,
        border: `3px solid ${isUser ? 'var(--accent)' : color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: size * 0.28,
        color: isUser ? 'var(--accent)' : color,
        flexShrink: 0,
        letterSpacing: '-0.5px',
      }}
    >
      {abbr?.slice(0, 3) ?? '?'}
    </div>
  );
}

/** Win-pct helper. */
function winPct(wins, losses, ties) {
  const games = wins + losses + ties;
  if (games === 0) return '.000';
  return ((wins + ties * 0.5) / games).toFixed(3).replace(/^0/, '');
}

/** Colour-coded OVR pill. */
function OvrPill({ ovr }) {
  let cls = 'rating-color-avg';
  if (ovr >= 85) cls = 'rating-color-elite';
  else if (ovr >= 75) cls = 'rating-color-good';
  else if (ovr < 65)  cls = 'rating-color-bad';

  return (
    <span
      style={{
        display: 'inline-block',
        width: 32,
        padding: '2px 0',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-xs)',
        fontWeight: 700,
        textAlign: 'center',
        color: '#fff',
      }}
      className={cls}
    >
      {ovr}
    </span>
  );
}

// ── Standings Tab ─────────────────────────────────────────────────────────────

function StandingsTab({ teams, userTeamId, onTeamSelect }) {
  const [activeConf, setActiveConf] = useState('AFC');

  // Normalise activeConf label → numeric index for comparison
  const activeConfIdx = activeConf === 'AFC' ? 0 : 1;

  const grouped = useMemo(() => {
    const confTeams = teams.filter(t => confIdx(t.conf) === activeConfIdx);
    const groups = DIVS.map(({ name, idx }) => ({
      div: name,
      teams: confTeams
        .filter(t => divIdx(t.div) === idx)
        .sort((a, b) => {
          const pa = winPct(a.wins, a.losses, a.ties);
          const pb = winPct(b.wins, b.losses, b.ties);
          return pb - pa || b.wins - a.wins;
        }),
    })).filter(g => g.teams.length > 0);

    // Sort groups so the user's division is first
    if (userTeamId) {
      groups.sort((a, b) => {
        const aHasUser = a.teams.some(t => t.id === userTeamId);
        const bHasUser = b.teams.some(t => t.id === userTeamId);
        if (aHasUser && !bHasUser) return -1;
        if (!aHasUser && bHasUser) return 1;
        return 0;
      });
    }
    return groups;
  }, [teams, activeConfIdx, userTeamId]);

  return (
    <div>
      {/* Conference tab pills */}
      <div className="standings-tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {CONFS.map(c => (
          <button
            key={c}
            className={`standings-tab${activeConf === c ? ' active' : ''}`}
            onClick={() => setActiveConf(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Division blocks */}
      <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
        {grouped.map(({ div, teams: divTeams }) => (
          <div key={div} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: 'var(--space-3) var(--space-5)',
                background: 'var(--surface-strong)',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--text-muted)',
                }}
              >
                {activeConf} {div}
              </span>
            </div>

            <div className="table-wrapper" style={{ padding: '0 var(--space-2)' }}>
              <table className="standings-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 'var(--space-5)' }}>Team</th>
                    <th style={{ textAlign: 'center' }}>W</th>
                    <th style={{ textAlign: 'center' }}>L</th>
                    <th style={{ textAlign: 'center' }}>T</th>
                    <th style={{ textAlign: 'center' }}>PCT</th>
                    <th style={{ textAlign: 'center' }}>PF</th>
                    <th style={{ textAlign: 'center' }}>PA</th>
                    <th style={{ textAlign: 'center' }}>OVR</th>
                    <th style={{ textAlign: 'right', paddingRight: 'var(--space-5)' }}>CAP</th>
                  </tr>
                </thead>
                <tbody>
                  {divTeams.map((team, idx) => {
                    const isUser = team.id === userTeamId;
                    return (
                      <tr key={team.id} className={isUser ? 'selected' : ''}>
                        <td style={{ paddingLeft: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ width: 20, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                              {idx + 1}
                            </span>
                            <TeamLogo abbr={team.abbr} size={32} isUser={isUser} />
                            <div>
                              <div
                                style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
                                onClick={() => onTeamSelect?.(team.id)}
                              >
                                {team.name}
                                {isUser && <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 700 }}>★</span>}
                              </div>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{team.abbr}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>{team.wins}</td>
                        <td style={{ textAlign: 'center' }}>{team.losses}</td>
                        <td style={{ textAlign: 'center' }}>{team.ties}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{winPct(team.wins, team.losses, team.ties)}</td>
                        <td style={{ textAlign: 'center' }}>{team.ptsFor}</td>
                        <td style={{ textAlign: 'center' }}>{team.ptsAgainst}</td>
                        <td style={{ textAlign: 'center' }}><OvrPill ovr={team.ovr} /></td>
                        <td style={{ textAlign: 'right', paddingRight: 'var(--space-4)', color: 'var(--success)', fontSize: 'var(--text-sm)' }}>
                          ${(team.capRoom ?? 0).toFixed(1)}M
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-8)' }}>
            No teams found for {activeConf}.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

function ScheduleTab({ schedule, teams, currentWeek, userTeamId, nextGameStakes, seasonId, onGameSelect }) {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const teamById = useMemo(() => {
    const map = {};
    teams.forEach(t => { map[t.id] = t; });
    return map;
  }, [teams]);

  const totalWeeks = schedule?.weeks?.length ?? 0;
  const weekData   = schedule?.weeks?.find(w => w.week === selectedWeek);
  const games      = weekData?.games ?? [];

  return (
    <div>
      {/* Week selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 600 }}>Week</span>
        <div className="standings-tabs" style={{ flexWrap: 'wrap' }}>
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              className={`standings-tab${selectedWeek === w ? ' active' : ''}`}
              onClick={() => setSelectedWeek(w)}
              style={{ minWidth: 36 }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Game cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        {games.map((game, idx) => {
          const home      = teamById[game.home] ?? { name: `Team ${game.home}`, abbr: '???', wins: 0, losses: 0, ties: 0 };
          const away      = teamById[game.away] ?? { name: `Team ${game.away}`, abbr: '???', wins: 0, losses: 0, ties: 0 };
          const isUserGame = home.id === userTeamId || away.id === userTeamId;
          const showStakes = isUserGame && !game.played && nextGameStakes > 50 && selectedWeek === currentWeek;
          const isClickable = game.played && onGameSelect && seasonId;
          const handleCardClick = isClickable
            ? () => onGameSelect(`${seasonId}_w${selectedWeek}_${game.home}_${game.away}`)
            : undefined;

          return (
            <div
              key={idx}
              className="matchup-card"
              onClick={handleCardClick}
              style={{
                ...(isUserGame ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent), var(--shadow-lg)' } : {}),
                ...(isClickable ? { cursor: 'pointer' } : {}),
              }}
            >
              {/* Card header */}
              <div className="matchup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span>Week {selectedWeek}</span>
                  {showStakes && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                      background: nextGameStakes > 80 ? 'var(--danger)' : 'var(--warning)',
                      color: '#fff', fontWeight: 700, fontSize: 'var(--text-xs)',
                      letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      {nextGameStakes > 80 ? '🔥 RIVALRY' : '⚠️ STAKES'}
                    </span>
                  )}
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                  background: game.played ? 'var(--success)22' : 'var(--accent)22',
                  color: game.played ? 'var(--success)' : 'var(--accent)',
                  fontWeight: 700,
                }}>
                  {game.played ? 'Final' : 'Scheduled'}
                </span>
              </div>

              {/* Final score display */}
              {game.played && game.homeScore !== undefined && (
                <>
                  <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'baseline',
                    gap: 'var(--space-3)', padding: 'var(--space-1) 0',
                    fontSize: 'var(--text-xl)', fontWeight: 800,
                  }}>
                    <span style={{ color: game.awayScore > game.homeScore ? 'var(--text)' : 'var(--text-muted)' }}>
                      {away.abbr} {game.awayScore}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-subtle)', fontWeight: 400 }}>–</span>
                    <span style={{ color: game.homeScore > game.awayScore ? 'var(--text)' : 'var(--text-muted)' }}>
                      {game.homeScore} {home.abbr}
                    </span>
                  </div>
                  {isClickable && (
                    <div style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--accent)', marginBottom: 'var(--space-1)' }}>
                      View Box Score →
                    </div>
                  )}
                </>
              )}

              {/* Teams */}
              <div className="matchup-content">
                <div className="matchup-team away">
                  <TeamLogo abbr={away.abbr} size={64} isUser={away.id === userTeamId} />
                  <div className="team-name-matchup">{away.abbr}</div>
                  <div className="team-record-matchup">{away.wins}-{away.losses}{away.ties > 0 ? `-${away.ties}` : ''}</div>
                </div>
                <div className="matchup-vs">
                  <span className="vs-badge">VS</span>
                  <span className="at-badge">at</span>
                </div>
                <div className="matchup-team home">
                  <TeamLogo abbr={home.abbr} size={64} isUser={home.id === userTeamId} />
                  <div className="team-name-matchup">{home.abbr}</div>
                  <div className="team-record-matchup">{home.wins}-{home.losses}{home.ties > 0 ? `-${home.ties}` : ''}</div>
                </div>
              </div>
            </div>
          );
        })}

        {games.length === 0 && (
          <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center', padding: 'var(--space-8)' }}>
            No games found for week {selectedWeek}.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Leaders Tab ───────────────────────────────────────────────────────────────

function LeadersTab({ teams }) {
  const leaders = useMemo(() => [
    {
      label: 'Most Wins',
      rows: [...teams].sort((a, b) => b.wins - a.wins).slice(0, 5),
      value: t => `${t.wins}W`,
    },
    {
      label: 'Top Offense (PF)',
      rows: [...teams].sort((a, b) => b.ptsFor - a.ptsFor).slice(0, 5),
      value: t => `${t.ptsFor} pts`,
    },
    {
      label: 'Best Defense (PA)',
      rows: [...teams].sort((a, b) => a.ptsAgainst - b.ptsAgainst).slice(0, 5),
      value: t => `${t.ptsAgainst} PA`,
    },
    {
      label: 'Highest Rated',
      rows: [...teams].sort((a, b) => b.ovr - a.ovr).slice(0, 5),
      value: t => `OVR ${t.ovr}`,
    },
  ], [teams]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-6)' }}>
      {leaders.map(({ label, rows, value }) => (
        <div key={label} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-3) var(--space-5)', background: 'var(--surface-strong)', borderBottom: '1px solid var(--hairline)' }}>
            <span className="hub-section-title" style={{ marginBottom: 0 }}>{label}</span>
          </div>
          <div className="hub-rankings-list" style={{ padding: 'var(--space-3)' }}>
            {rows.map((team, i) => (
              <div key={team.id} className="hub-ranking-item">
                <span className="hub-ranking-rank" style={i === 0 ? { color: 'var(--warning)' } : {}}>{i + 1}</span>
                <TeamLogo abbr={team.abbr} size={28} />
                <span className="hub-ranking-team">{team.name}</span>
                <span className="hub-ranking-record" style={{ fontWeight: 600, color: 'var(--text)' }}>{value(team)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LeagueDashboard({ league, busy, actions }) {
  const [activeTab, setActiveTab]           = useState('Standings');
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  if (!league) return null;

  if (!league.schedule?.weeks) {
    return (
      <div style={{
        padding: 'var(--space-5)', color: 'var(--danger)',
        background: 'rgba(255,69,58,0.1)', border: '1px solid var(--danger)',
        borderRadius: 'var(--radius-md)',
      }}>
        Error: Schedule data missing from league state.
      </div>
    );
  }

  const userTeam   = league.teams?.find(t => t.id === league.userTeamId);
  const userAbbr   = userTeam?.abbr ?? '---';
  const userRecord = userTeam
    ? `${userTeam.wins}-${userTeam.losses}${userTeam.ties ? `-${userTeam.ties}` : ''}`
    : '0-0';

  const totalGames = league.teams.reduce((s, t) => s + t.wins + t.losses + t.ties, 0) / 2;
  const avgScore   = league.teams.length
    ? Math.round(league.teams.reduce((s, t) => s + t.ptsFor, 0) / Math.max(1, totalGames * 2))
    : 0;
  const avgOvr     = league.teams.length
    ? Math.round(league.teams.reduce((s, t) => s + t.ovr, 0) / league.teams.length)
    : 75;

  const capTotal = userTeam?.capTotal ?? 255;
  const capUsed  = userTeam?.capUsed ?? 0;
  const deadCap  = userTeam?.deadCap ?? 0;
  const capRoom  = userTeam?.capRoom ?? (capTotal - capUsed);

  return (
    <div>
      {/* ── Hub Header ── */}
      <div className="hub-header">
        <div className="hub-header-content">
          <div className="team-identity">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <TeamLogo abbr={userAbbr} size={56} isUser />
              <div>
                <div className="team-name-large">{userTeam?.name ?? 'No Team Selected'}</div>
                <div className="team-record-large">
                  {userRecord}
                  {userTeam && (
                    <span className="division-rank-badge">
                      {userTeam.conf} {userTeam.div}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="season-context">
            <div className="current-week-large">Week {league.week}</div>
            <div className="season-year-large">{league.year ?? 2025} Season · {league.phase}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
               <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)' }}>
                 Owner: <span style={{ color: 'var(--success)' }}>85%</span>
               </div>
               <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)' }}>
                 Fan: <span style={{ color: 'var(--warning)' }}>72%</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expiring Contracts Banner ── */}
      {league.phase === 'offseason_resign' && (
        <div
          onClick={() => setActiveTab('Roster')}
          style={{
          background: 'rgba(52, 199, 89, 0.15)', border: '1px solid var(--success)',
          color: 'var(--success)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-6)', fontWeight: 700, textAlign: 'center',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
          fontSize: 'var(--text-lg)'
        }}>
          <span>✍️</span>
          <span>Expiring Contracts</span>
          <span style={{ fontWeight: 400, fontSize: 'var(--text-base)', color: 'var(--text)' }}>
            — Review and extend players before Free Agency.
          </span>
        </div>
      )}

      {/* ── Preseason Cutdown Banner ── */}
      {league.phase === 'preseason' && (
        <div style={{
          background: 'rgba(255,159,10,0.15)', border: '1px solid var(--warning)',
          color: 'var(--warning)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-6)', fontWeight: 700, textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
          fontSize: 'var(--text-lg)'
        }}>
          <span>⚠️</span>
          <span>
            Roster Cutdown: <span style={{ color: (userTeam?.rosterCount ?? 0) > 53 ? 'var(--danger)' : 'var(--success)' }}>{userTeam?.rosterCount ?? 0}</span> / 53
          </span>
          <span style={{ fontWeight: 400, fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            — You must release {(userTeam?.rosterCount ?? 0) > 53 ? (userTeam.rosterCount - 53) : 0} players to advance.
          </span>
        </div>
      )}

      {/* ── Status Grid (Financials + Last Game) ── */}
      <div className="status-grid">
        {/* Last Game Widget */}
        {(() => {
          const prevWeek = (league.week || 1) - 1;
          const weekData = league.schedule?.weeks?.find(w => w.week === prevWeek);
          const game = weekData?.games?.find(g =>
              (g.home === league.userTeamId || (typeof g.home === 'object' && g.home.id === league.userTeamId)) ||
              (g.away === league.userTeamId || (typeof g.away === 'object' && g.away.id === league.userTeamId))
          );

          if (game && game.played) {
              const homeId = typeof game.home === 'object' ? game.home.id : game.home;
              const isHome = homeId === league.userTeamId;
              const userScore = isHome ? game.homeScore : game.awayScore;
              const oppScore  = isHome ? game.awayScore : game.homeScore;
              const win = userScore > oppScore;
              const resultChar = win ? 'W' : (userScore === oppScore ? 'T' : 'L');
              const resultColor = win ? 'var(--success)' : (userScore === oppScore ? 'var(--text-muted)' : 'var(--danger)');

              return (
                  <div className="stat-box">
                      <div className="stat-label">Last Game</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: resultColor }}>{resultChar}</span>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                              {userScore}-{oppScore}
                          </div>
                      </div>
                  </div>
              );
          }
          return null;
        })()}

        {[
          { label: 'Total Cap',       value: `$${capTotal.toFixed(1)}M`, pct: 100, color: 'var(--text-muted)' },
          { label: 'Cap Used',        value: `$${capUsed.toFixed(1)}M`,  pct: Math.min(100, (capUsed/capTotal)*100), color: 'var(--accent)' },
          { label: 'Dead Cap',        value: `$${deadCap.toFixed(1)}M`,  pct: Math.min(100, (deadCap/capTotal)*100), color: 'var(--text-subtle)' },
          { label: 'Cap Space',       value: `$${capRoom.toFixed(1)}M`,  pct: Math.min(100, (capRoom/capTotal)*100), color: capRoom > 10 ? 'var(--success)' : 'var(--danger)' },
        ].map(({ label, value, pct, color }) => (
          <div key={label} className="stat-box">
            <div className="stat-label">{label}</div>
            <div className="stat-value-large" style={{ color: color || 'var(--text)' }}>{value}</div>
            <div className="stat-bar-container">
              <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color || 'var(--accent)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Navigation ── */}
      <div className="standings-tabs" style={{ marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`standings-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab Content — each tab is independently error-bounded ── */}
      {activeTab === 'Standings' && (
        <TabErrorBoundary label="Standings">
          <StandingsTab teams={league.teams} userTeamId={league.userTeamId} onTeamSelect={setSelectedTeamId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Schedule' && (
        <TabErrorBoundary label="Schedule">
          <ScheduleTab
            schedule={league.schedule}
            teams={league.teams}
            currentWeek={league.week}
            userTeamId={league.userTeamId}
            nextGameStakes={league.nextGameStakes}
            seasonId={league.seasonId}
            onGameSelect={setSelectedGameId}
          />
        </TabErrorBoundary>
      )}
      {activeTab === 'Leaders' && (
        <TabErrorBoundary label="Leaders">
          <Leaders onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Award Races' && (
        <TabErrorBoundary label="Award Races">
          <AwardRaces onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Roster' && (
        <TabErrorBoundary label="Roster">
          <Roster league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Coaches' && (
        <TabErrorBoundary label="Coaches">
          <Coaches league={league} actions={actions} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Free Agency' && (
        <TabErrorBoundary label="Free Agency">
          <FreeAgency league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'Trades' && (
        <TabErrorBoundary label="Trades">
          <TradeCenter league={league} actions={actions} onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}
      {activeTab === 'History' && (
        <TabErrorBoundary label="History">
          <LeagueHistory onPlayerSelect={setSelectedPlayerId} />
        </TabErrorBoundary>
      )}

      {/* ── Box Score modal (portal-style, rendered above all tabs) ── */}
      {selectedGameId && (
        <TabErrorBoundary label="Box Score">
          <BoxScore
            gameId={selectedGameId}
            actions={actions}
            onClose={() => setSelectedGameId(null)}
          />
        </TabErrorBoundary>
      )}

      {/* ── Player Profile modal ── */}
      {selectedPlayerId && (
        <TabErrorBoundary label="Player Profile">
          <PlayerProfile
            playerId={selectedPlayerId}
            onClose={() => setSelectedPlayerId(null)}
          />
        </TabErrorBoundary>
      )}

      {/* ── Team Profile modal ── */}
      {selectedTeamId != null && (
        <TabErrorBoundary label="Team Profile">
          <TeamProfile
            teamId={selectedTeamId}
            onClose={() => setSelectedTeamId(null)}
            onPlayerSelect={id => { setSelectedTeamId(null); setSelectedPlayerId(id); }}
          />
        </TabErrorBoundary>
      )}
    </div>
  );
}
