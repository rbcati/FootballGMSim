/**
 * LeagueHistory.jsx
 *
 * Tabbed view combining:
 *  - Super Bowl Champions history table
 *  - Record Book (single-season & all-time career records)
 *
 * Mobile-first Tailwind v4 with dark: mode support.
 */
import React, { useEffect, useState } from "react";
import { useWorker } from "../hooks/useWorker.js";
import ResponsivePlayerAvatar from "./ResponsivePlayerAvatar.jsx";

const RECORD_LABELS = {
  passYd: "Passing Yards",
  rushYd: "Rushing Yards",
  recYd: "Receiving Yards",
  passTD: "Passing TDs",
  sacks: "Sacks",
};

export default function LeagueHistory({ onPlayerSelect }) {
  const { actions } = useWorker();
  const [seasons, setSeasons] = useState(null);
  const [records, setRecords] = useState(null);
  const [activeTab, setActiveTab] = useState("champions");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      actions.getAllSeasons().catch(() => ({ payload: { seasons: [] } })),
      actions.getRecords().catch(() => ({ payload: { records: null } })),
    ]).then(([seasonsRes, recordsRes]) => {
      if (!mounted) return;
      setSeasons(seasonsRes?.payload?.seasons ?? seasonsRes?.seasons ?? []);
      setRecords(recordsRes?.payload?.records ?? null);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [actions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        Loading history...
      </div>
    );
  }

  const hasSeasons = seasons && seasons.length > 0;
  const hasRecords = records && (
    Object.values(records.singleSeason || {}).some(r => r.playerId) ||
    Object.values(records.allTime || {}).some(r => r.playerId)
  );

  if (!hasSeasons && !hasRecords) {
    return (
      <div className="flex items-center justify-center py-16 text-[color:var(--text-muted)]">
        No history available yet. Complete a season to see it here!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex gap-2 px-1">
        <TabButton
          active={activeTab === "champions"}
          onClick={() => setActiveTab("champions")}
          label="Champions"
        />
        <TabButton
          active={activeTab === "records"}
          onClick={() => setActiveTab("records")}
          label="Record Book"
        />
      </div>

      {activeTab === "champions" && (
        <ChampionsTable seasons={seasons} onPlayerSelect={onPlayerSelect} />
      )}

      {activeTab === "records" && (
        <RecordBook records={records} onPlayerSelect={onPlayerSelect} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all min-h-touch
        ${active
          ? "bg-[color:var(--accent)] text-white shadow-md"
          : "bg-[color:var(--surface-strong)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        }`}
    >
      {label}
    </button>
  );
}

/* ── Champions Table ─────────────────────────────────────────────────────── */

function ChampionsTable({ seasons, onPlayerSelect }) {
  if (!seasons || seasons.length === 0) {
    return (
      <div className="py-8 text-center text-[color:var(--text-muted)]">
        No champions yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)]">
      <div className="px-5 py-3 bg-[color:var(--surface-strong)] border-b border-[color:var(--hairline)]">
        <h3 className="text-base font-bold text-[color:var(--text)] m-0">
          Super Bowl Champions
        </h3>
      </div>

      {/* Mobile: card layout, Desktop: table */}
      <div className="hidden md:block">
        <div className="table-wrapper">
          <table className="standings-table w-full">
            <thead>
              <tr>
                <th className="pl-5">Year</th>
                <th>Champion</th>
                <th>Best Record</th>
                <th>MVP</th>
                <th>OPOY</th>
                <th>DPOY</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const bestTeam = s.standings?.sort((a, b) => b.pct - a.pct)[0];
                const bestRecord = bestTeam
                  ? `${bestTeam.wins}-${bestTeam.losses}${bestTeam.ties > 0 ? "-" + bestTeam.ties : ""}`
                  : "-";

                return (
                  <tr key={s.id}>
                    <td className="pl-5 font-bold">{s.year}</td>
                    <td>
                      {s.champion ? (
                        <span className="font-semibold text-[color:var(--text)]">
                          {s.champion.name}{" "}
                          <span className="text-xs text-[color:var(--text-muted)]">
                            ({s.champion.abbr})
                          </span>
                        </span>
                      ) : "N/A"}
                    </td>
                    <td>
                      {bestTeam ? (
                        <span>
                          {bestTeam.abbr}{" "}
                          <span className="text-[color:var(--text-muted)]">{bestRecord}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td>
                      <AwardCell award={s.awards?.mvp} onPlayerSelect={onPlayerSelect} highlight />
                    </td>
                    <td>
                      <AwardCell award={s.awards?.opoy} onPlayerSelect={onPlayerSelect} />
                    </td>
                    <td>
                      <AwardCell award={s.awards?.dpoy} onPlayerSelect={onPlayerSelect} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-[color:var(--hairline)]">
        {seasons.map((s) => {
          const bestTeam = s.standings?.sort((a, b) => b.pct - a.pct)[0];
          const bestRecord = bestTeam
            ? `${bestTeam.wins}-${bestTeam.losses}${bestTeam.ties > 0 ? "-" + bestTeam.ties : ""}`
            : "";
          return (
            <div key={s.id} className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[color:var(--text)]">{s.year}</span>
                {s.champion && (
                  <span className="font-semibold text-sm text-[color:var(--accent)]">
                    {s.champion.abbr}
                  </span>
                )}
              </div>
              {s.champion && (
                <div className="text-sm text-[color:var(--text)]">{s.champion.name}</div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--text-muted)]">
                {bestTeam && <span>Best: {bestTeam.abbr} {bestRecord}</span>}
                {s.awards?.mvp && (
                  <span
                    className="cursor-pointer text-[color:var(--accent)] font-semibold"
                    onClick={() => onPlayerSelect?.(s.awards.mvp.playerId)}
                  >
                    MVP: {s.awards.mvp.name}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AwardCell({ award, onPlayerSelect, highlight }) {
  if (!award) return <span className="text-[color:var(--text-muted)]">-</span>;
  return (
    <span
      className={`cursor-pointer interactive-player-name ${highlight ? "text-[color:var(--accent)] font-semibold" : ""}`}
      onClick={() => onPlayerSelect?.(award.playerId)}
    >
      {award.pos} {award.name}
    </span>
  );
}

/* ── Record Book ─────────────────────────────────────────────────────────── */

function RecordBook({ records, onPlayerSelect }) {
  const [recordTab, setRecordTab] = useState("singleSeason");

  if (!records) {
    return (
      <div className="py-8 text-center text-[color:var(--text-muted)]">
        No records tracked yet. Complete a season to populate the Record Book!
      </div>
    );
  }

  const data = recordTab === "singleSeason" ? records.singleSeason : records.allTime;
  const hasData = data && Object.values(data).some(r => r?.playerId);

  return (
    <div className="space-y-4">
      {/* Record type tabs */}
      <div className="flex gap-2 px-1">
        <TabButton
          active={recordTab === "singleSeason"}
          onClick={() => setRecordTab("singleSeason")}
          label="Single Season"
        />
        <TabButton
          active={recordTab === "allTime"}
          onClick={() => setRecordTab("allTime")}
          label="All-Time Career"
        />
      </div>

      {!hasData ? (
        <div className="py-8 text-center text-[color:var(--text-muted)]">
          No {recordTab === "singleSeason" ? "single-season" : "all-time"} records yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(RECORD_LABELS).map(([key, label]) => {
            const rec = data?.[key];
            if (!rec?.playerId) return null;
            return (
              <RecordCard
                key={key}
                label={label}
                record={rec}
                isCareer={recordTab === "allTime"}
                onPlayerSelect={onPlayerSelect}
              />
            );
          })}
        </div>
      )}

      {/* Record History Log */}
      {records.history && records.history.length > 0 && (
        <div className="rounded-xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)]">
          <div className="px-5 py-3 bg-[color:var(--surface-strong)] border-b border-[color:var(--hairline)]">
            <h4 className="text-sm font-bold text-[color:var(--text)] m-0">
              Record History
            </h4>
          </div>
          <div className="divide-y divide-[color:var(--hairline)] max-h-64 overflow-y-auto">
            {[...records.history].reverse().slice(0, 20).map((entry, i) => (
              <div key={i} className="px-4 py-2 text-sm flex items-center gap-2">
                <span className="text-[color:var(--text-muted)] text-xs font-mono shrink-0">
                  {entry.year}
                </span>
                <span className="text-[color:var(--text)]">
                  <span className="font-semibold">{entry.player}</span>
                  {" "}
                  <span className="text-[color:var(--text-muted)]">({entry.pos}, {entry.team})</span>
                  {" "}set {entry.type === "singleSeason" ? "single-season" : "all-time"}{" "}
                  {entry.label} record:{" "}
                  <span className="font-bold text-[color:var(--accent)]">
                    {entry.newValue.toLocaleString()}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordCard({ label, record, isCareer, onPlayerSelect }) {
  return (
    <div
      className="rounded-xl bg-[color:var(--surface)] border border-[color:var(--hairline)] p-4
                 hover:border-[color:var(--accent)] transition-colors cursor-pointer"
      onClick={() => record.playerId && onPlayerSelect?.(record.playerId)}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-3">
        {label}
      </div>

      <div className="flex items-center gap-3">
        <ResponsivePlayerAvatar
          teamColor="var(--accent)"
          text={record.pos || "?"}
          position={record.pos}
          showPositionBadge
          style={{ width: 48, height: 48, flexShrink: 0 }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[color:var(--text)] truncate">
            {record.name}
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">
            {record.team} &middot; {isCareer ? `Through ${record.lastYear ?? record.year}` : record.year}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-[color:var(--accent)]">
            {record.value?.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
