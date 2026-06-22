/**
 * AlmanacView — two-pane historical almanac for the Franchise Chronicle Engine.
 *
 * Pane 1: Champions & Award Archive — tabular ledger of every completed season.
 * Pane 2: Hall of Fame Gallery — retired legends with career stats and accolades.
 */

import React, { useMemo, useState } from 'react';
import type { ChampionRecord, HallOfFameMember, SeasonAwardWinner } from '../../types/history.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

type LeagueHistorySeason = {
  year?: number;
  season?: number;
  champion?: { id?: string | number; name?: string; abbr?: string; wins?: number; losses?: number } | null;
  runnerUp?: { id?: string | number; name?: string; abbr?: string } | null;
  awards?: {
    mvp?: { name?: string; playerId?: string };
    opoy?: { name?: string };
    dpoy?: { name?: string };
    oroy?: { name?: string };
    droy?: { name?: string };
  } | null;
  score?: string;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>
        {message}
      </td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <td style={{ padding: '8px 10px', fontSize: 'var(--text-sm)', fontWeight: bold ? 700 : 400, borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
      {children}
    </td>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-2, rgba(255,255,255,0.06))', borderRadius: 6, padding: '2px 6px', fontSize: 'var(--text-xs)' }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  );
}

// ── Pane 1: Champions Archive ─────────────────────────────────────────────────

interface ChampionsArchivePaneProps {
  seasons: LeagueHistorySeason[];
  champions: ChampionRecord[];
  awards: SeasonAwardWinner[];
}

function ChampionsArchivePane({ seasons, champions, awards }: ChampionsArchivePaneProps) {
  // Merge all sources into one unified row per season
  const rows = useMemo(() => {
    const byYear = new Map<number, {
      year: number;
      champion: string;
      record: string;
      score: string;
      runnerUp: string;
      mvp: string;
      opoy: string;
      dpoy: string;
    }>();

    // From leagueHistory (archived seasons)
    for (const s of seasons) {
      const year = num(s.year ?? s.season, 0);
      if (!year) continue;
      const champName = s.champion?.name ?? s.champion?.abbr ?? '—';
      const champWins = num(s.champion?.wins, 0);
      const champLosses = num((s as { champion?: { losses?: number } }).champion?.losses, 0);
      const record = champWins || champLosses ? `${champWins}-${champLosses}` : '—';
      byYear.set(year, {
        year,
        champion: champName,
        record,
        score: s.score ?? '—',
        runnerUp: s.runnerUp?.name ?? s.runnerUp?.abbr ?? '—',
        mvp: s.awards?.mvp?.name ?? '—',
        opoy: s.awards?.opoy?.name ?? '—',
        dpoy: s.awards?.dpoy?.name ?? '—',
      });
    }

    // Overlay with typed ChampionRecord (takes priority)
    for (const c of champions) {
      const year = num(c.year, 0);
      if (!year) continue;
      byYear.set(year, {
        year,
        champion: c.teamName ?? '—',
        record: c.record ?? '—',
        score: c.score ?? '—',
        runnerUp: c.runnerUpName ?? '—',
        mvp: c.mvpName ?? '—',
        opoy: byYear.get(year)?.opoy ?? '—',
        dpoy: byYear.get(year)?.dpoy ?? '—',
      });
    }

    // Overlay awards. Tolerates both the legacy SeasonAwardWinner shape
    // (mvpName/opoyName/dpoyName) and the Awards V2 awardHistory shape
    // (awards.MVP.playerName, etc.).
    for (const a of awards) {
      const year = num(a.year, 0);
      if (!year) continue;
      const existing = byYear.get(year);
      if (!existing) continue;
      const v2 = (a as { awards?: { MVP?: { playerName?: string }; OPOY?: { playerName?: string }; DPOY?: { playerName?: string } } }).awards;
      const mvpName = a.mvpName ?? v2?.MVP?.playerName;
      const opoyName = a.opoyName ?? v2?.OPOY?.playerName;
      const dpoyName = a.dpoyName ?? v2?.DPOY?.playerName;
      if (mvpName && existing.mvp === '—') existing.mvp = mvpName;
      if (opoyName && existing.opoy === '—') existing.opoy = opoyName;
      if (dpoyName && existing.dpoy === '—') existing.dpoy = dpoyName;
    }

    return [...byYear.values()].sort((a, b) => b.year - a.year);
  }, [seasons, champions, awards]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Champions & Award Archive</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          Season-by-season ledger of every champion, runner-up, and award winner.
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, rgba(255,255,255,0.04))' }}>
              <Th>Year</Th>
              <Th>Champion</Th>
              <Th>Record</Th>
              <Th>Score</Th>
              <Th>Runner-Up</Th>
              <Th>MVP</Th>
              <Th>OPOY</Th>
              <Th>DPOY</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow cols={8} message="Champions will be recorded here after the first season completes." />
            ) : (
              rows.map((r) => (
                <tr key={r.year} style={{ transition: 'background 0.15s' }}>
                  <Td bold>{r.year}</Td>
                  <Td bold>{r.champion}</Td>
                  <Td>{r.record}</Td>
                  <Td>{r.score}</Td>
                  <Td>{r.runnerUp}</Td>
                  <Td>{r.mvp}</Td>
                  <Td>{r.opoy}</Td>
                  <Td>{r.dpoy}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pane 2: Hall of Fame Gallery ──────────────────────────────────────────────

interface HallOfFamePaneProps {
  members: HallOfFameMember[];
  rawPlayers: HallOfFameRawPlayer[];
}

type HallOfFameRawPlayer = {
  id?: string | number;
  name?: string;
  pos?: string;
  inductionYear?: number;
  legacyScore?: number;
  hofScore?: number;
  primaryTeam?: string;
  accoladeSummary?: { superBowls?: number; mvps?: number; proBowls?: number };
  peakOvr?: number;
  ovr?: number;
};

function statLine(stats: HallOfFameMember['careerStats']): string {
  const parts: string[] = [];
  if (stats.passingYards) parts.push(`${stats.passingYards.toLocaleString()} Pass Yds`);
  if (stats.passingTds) parts.push(`${stats.passingTds} Pass TDs`);
  if (stats.rushingYards) parts.push(`${stats.rushingYards.toLocaleString()} Rush Yds`);
  if (stats.rushingTds) parts.push(`${stats.rushingTds} Rush TDs`);
  if (stats.receivingYards) parts.push(`${stats.receivingYards.toLocaleString()} Rec Yds`);
  if (stats.receivingTds) parts.push(`${stats.receivingTds} Rec TDs`);
  if (stats.sacks) parts.push(`${stats.sacks} Sacks`);
  if (stats.interceptions) parts.push(`${stats.interceptions} INTs`);
  if (stats.tackles) parts.push(`${stats.tackles} Tackles`);
  if (stats.gamesPlayed) parts.push(`${stats.gamesPlayed} GP`);
  return parts.slice(0, 4).join(' · ') || '—';
}

function HallOfFamePane({ members, rawPlayers }: HallOfFamePaneProps) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');

  // Merge typed HOF members with raw player data from existing HoF store
  const allMembers = useMemo(() => {
    const fromTyped = members.map((m) => ({
      id: m.id,
      name: m.name,
      pos: m.position,
      inductionYear: m.indictionYear,
      accolades: m.accolades,
      statLine: statLine(m.careerStats),
      legacyScore: 0,
    }));

    const fromRaw = rawPlayers
      .filter((p) => !members.some((m) => String(m.id) === String(p.id)))
      .map((p) => {
        const summary = p.accoladeSummary ?? {};
        const rings = summary.superBowls ?? 0;
        const mvps = summary.mvps ?? 0;
        const pro = summary.proBowls ?? 0;
        const peak = p.peakOvr ?? p.ovr ?? 0;
        const legacyScore = rings * 12 + mvps * 10 + pro * 2 + Math.round(peak / 5);
        const accolades: string[] = [];
        if (rings) accolades.push(`${rings}x Champion`);
        if (mvps) accolades.push(`${mvps}x MVP`);
        if (pro) accolades.push(`${pro}x All-Pro`);
        return {
          id: String(p.id ?? ''),
          name: p.name ?? '—',
          pos: p.pos ?? '??',
          inductionYear: p.inductionYear,
          accolades,
          statLine: p.primaryTeam ?? '—',
          legacyScore,
        };
      });

    return [...fromTyped, ...fromRaw].sort((a, b) => b.legacyScore - a.legacyScore || (a.name ?? '').localeCompare(b.name ?? ''));
  }, [members, rawPlayers]);

  const positions = useMemo(() => {
    const set = new Set(allMembers.map((m) => m.pos).filter(Boolean));
    return ['ALL', ...[...set].sort()];
  }, [allMembers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMembers.filter((m) => {
      if (posFilter !== 'ALL' && m.pos !== posFilter) return false;
      if (!q) return true;
      return [m.name, m.pos, String(m.inductionYear ?? '')].some((v) => v?.toLowerCase().includes(q));
    });
  }, [allMembers, posFilter, search]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Hall of Fame Gallery</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          All-time greats, induction classes, and career legacies.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 160px', minWidth: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', fontSize: 'var(--text-sm)' }}
        />
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', fontSize: 'var(--text-sm)' }}
        >
          {positions.map((pos) => <option key={pos} value={pos}>{pos === 'ALL' ? 'All Positions' : pos}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>
          {allMembers.length === 0
            ? 'The Hall of Fame awaits its first inductee. Retire a player who has won an MVP, a Championship, or maintained elite performance for 5+ seasons.'
            : 'No inductees match your search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m) => (
            <div key={m.id} style={{ background: 'var(--surface-2, rgba(255,255,255,0.04))', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>{m.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.pos}{m.inductionYear ? ` · Class of ${m.inductionYear}` : ''}
                  </div>
                </div>
                {m.legacyScore > 0 && (
                  <span style={{ background: 'rgba(255,215,0,0.12)', color: '#c8991a', border: '1px solid rgba(200,153,26,0.3)', borderRadius: 6, padding: '2px 8px', fontSize: 'var(--text-xs)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Legacy {m.legacyScore}
                  </span>
                )}
              </div>

              {m.accolades.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {m.accolades.map((a, i) => (
                    <span key={i} style={{ background: 'var(--accent-soft, rgba(59,130,246,0.1))', color: 'var(--accent, #3b82f6)', borderRadius: 6, padding: '2px 7px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      {a}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{m.statLine}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

type AlmanacTab = 'champions' | 'hof';

export interface AlmanacViewProps {
  league?: {
    leagueHistory?: LeagueHistorySeason[];
    hallOfFameClasses?: Array<{ year?: number; inductees?: Array<{ playerId?: string | number; name?: string }> }>;
  } | null;
  /** Typed champion records (from src/types/history.ts) */
  champions?: ChampionRecord[];
  /** Typed award history (from src/types/history.ts) */
  awards?: SeasonAwardWinner[];
  /** Typed HOF members (from src/types/history.ts) */
  hallOfFame?: HallOfFameMember[];
  /** Raw HOF player objects from the existing store */
  rawHofPlayers?: HallOfFameRawPlayer[];
  onNavigate?: (route: string) => void;
}

export default function AlmanacView({
  league,
  champions = [],
  awards = [],
  hallOfFame = [],
  rawHofPlayers = [],
  onNavigate,
}: AlmanacViewProps) {
  const [activeTab, setActiveTab] = useState<AlmanacTab>('champions');

  const seasons = (league?.leagueHistory ?? []) as LeagueHistorySeason[];

  const tabStyle = (tab: AlmanacTab): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: activeTab === tab ? 700 : 500,
    fontSize: 'var(--text-sm)',
    background: activeTab === tab ? 'var(--accent, #3b82f6)' : 'transparent',
    color: activeTab === tab ? '#fff' : 'var(--text-muted)',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div className="app-screen-stack" data-testid="almanac-view">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 'var(--text-xl)', letterSpacing: '-0.01em' }}>League Almanac</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
          The permanent historical record of your franchise era.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--surface-2, rgba(255,255,255,0.04))', borderRadius: 10, padding: 4 }}>
        <button style={tabStyle('champions')} onClick={() => setActiveTab('champions')}>
          Champions Archive
        </button>
        <button style={tabStyle('hof')} onClick={() => setActiveTab('hof')}>
          Hall of Fame
        </button>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 12 }}>
        {activeTab === 'champions' && (
          <ChampionsArchivePane seasons={seasons} champions={champions} awards={awards} />
        )}
        {activeTab === 'hof' && (
          <HallOfFamePane members={hallOfFame} rawPlayers={rawHofPlayers} />
        )}
      </div>

      {onNavigate && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            onClick={() => onNavigate('History')}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Full League History →
          </button>
        </div>
      )}
    </div>
  );
}
