import React, { useEffect, useMemo, useState } from "react";
import { HeroCard, ScreenHeader, SectionCard, SectionHeader, StatusChip, EmptyState } from "./ScreenSystem.jsx";
import { formatMoneyM } from "../utils/numberFormatting.js";

const DEFAULT_CONFS = ["AFC", "NFC"];
const DEFAULT_DIVS = ["East", "North", "South", "West"];

function confIdx(conf) {
  if (conf == null) return -1;
  if (typeof conf === "number") return conf;
  const key = String(conf).toUpperCase();
  if (key === "AFC") return 0;
  if (key === "NFC") return 1;
  const num = Number(key);
  return Number.isFinite(num) ? num : -1;
}

function divIdx(div) {
  if (div == null) return -1;
  if (typeof div === "number") return div;
  const key = String(div).toLowerCase();
  if (key.includes("east")) return 0;
  if (key.includes("north")) return 1;
  if (key.includes("south")) return 2;
  if (key.includes("west")) return 3;
  const num = Number(key);
  return Number.isFinite(num) ? num : -1;
}

function winPct(wins = 0, losses = 0, ties = 0) {
  const total = Number(wins) + Number(losses) + Number(ties);
  if (!total) return ".000";
  return ((Number(wins) + Number(ties) * 0.5) / total).toFixed(3);
}

function computeStreak(results = []) {
  if (!Array.isArray(results) || !results.length) return null;
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i] === last) count += 1;
    else break;
  }
  return { type: last, count };
}

function compareStandingRows(a, b) {
  const pa = parseFloat(winPct(a.wins, a.losses, a.ties));
  const pb = parseFloat(winPct(b.wins, b.losses, b.ties));
  if (pb !== pa) return pb - pa;
  const h2hA = Number(a?.tiebreakers?.headToHeadWinPct ?? a?.headToHeadWinPct ?? 0);
  const h2hB = Number(b?.tiebreakers?.headToHeadWinPct ?? b?.headToHeadWinPct ?? 0);
  if (h2hB !== h2hA) return h2hB - h2hA;
  const divA = Number(a?.tiebreakers?.divisionWinPct ?? a?.divisionWinPct ?? 0);
  const divB = Number(b?.tiebreakers?.divisionWinPct ?? b?.divisionWinPct ?? 0);
  if (divB !== divA) return divB - divA;
  return Number(b?.wins ?? 0) - Number(a?.wins ?? 0);
}

export function getConferenceRankings(teams, confVal) {
  const ci = typeof confVal === "string" ? (confVal === "AFC" ? 0 : 1) : confVal;
  const confTeams = teams
    .filter((team) => confIdx(team.conf) === ci)
    .sort(compareStandingRows);

  const divMap = {};
  confTeams.forEach((team) => {
    const division = divIdx(team.div);
    if (!divMap[division] || parseFloat(winPct(team.wins, team.losses, team.ties)) > parseFloat(winPct(divMap[division].wins, divMap[division].losses, divMap[division].ties))) {
      divMap[division] = team;
    }
  });
  const divWinners = new Set(Object.values(divMap).map((team) => team.id));
  const divWinnerList = Object.values(divMap).sort((a, b) => parseFloat(winPct(b.wins, b.losses, b.ties)) - parseFloat(winPct(a.wins, a.losses, a.ties)));
  const wildcards = confTeams.filter((team) => !divWinners.has(team.id));

  return { divWinnerList, wildcards, divWinners };
}

function TeamLogo({ abbr, isUser = false }) {
  return <div className={`team-logo${isUser ? " is-user" : ""}`}>{abbr}</div>;
}

function OvrPill({ ovr }) {
  const n = Number.isFinite(ovr) ? ovr : 50;
  const tone = n >= 85 ? "high" : n >= 75 ? "mid" : "low";
  return <span className={`ovr-pill ovr-pill-${tone}`}>{n}</span>;
}

function PlayoffPictureView({ teams, activeConf, userTeamId, onTeamSelect }) {
  const ci = activeConf === "AFC" ? 0 : 1;
  const { divWinnerList, wildcards, divWinners } = useMemo(() => getConferenceRankings(teams, ci), [teams, ci]);
  const allRanked = [...divWinnerList, ...wildcards];
  const cutoff = 7;

  return (
    <div className="standings-center-playoff-list">
      {allRanked.map((team, index) => {
        const isIn = index < cutoff;
        const isDivWin = divWinners.has(team.id);
        const isUser = team.id === userTeamId;
        const seed = index + 1;
        return (
          <div
            key={team.id}
            className={`standings-center-playoff-row ${isIn ? "is-in" : "is-out"} ${isUser ? "is-user" : ""}`}
            onClick={() => onTeamSelect?.(team.id)}
          >
            <div className="standings-center-playoff-row__seed">{seed}</div>
            <TeamLogo abbr={team.abbr} isUser={isUser} />
            <strong>{team.abbr}</strong>
            <span>{team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}</span>
            <StatusChip
              label={isIn ? (isDivWin ? "DIV" : "WC") : "OUT"}
              tone={isIn ? (isDivWin ? "warning" : "ok") : "danger"}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function StandingsCenter({ teams = [], userTeamId, onTeamSelect, leagueSettings, standingsContext = null }) {
  const confNames = Array.isArray(leagueSettings?.conferenceNames) && leagueSettings.conferenceNames.length
    ? leagueSettings.conferenceNames
    : DEFAULT_CONFS;
  const divNames = Array.isArray(leagueSettings?.divisionNames) && leagueSettings.divisionNames.length
    ? leagueSettings.divisionNames
    : DEFAULT_DIVS;

  const [activeConf, setActiveConf] = useState(confNames[0] || "AFC");
  const [viewMode, setViewMode] = useState("division");

  useEffect(() => {
    if (!confNames.includes(activeConf)) {
      setActiveConf(confNames[0] || "AFC");
    }
  }, [confNames, activeConf]);

  const activeConfIdx = Math.max(0, confNames.indexOf(activeConf));

  const grouped = useMemo(() => {
    const confTeams = (Array.isArray(teams) ? teams : []).filter((team) => confIdx(team.conf) === activeConfIdx);
    const groups = divNames.map((name, idx) => ({
      div: name,
      teams: confTeams.filter((team) => divIdx(team.div) === idx).sort(compareStandingRows),
    })).filter((group) => group.teams.length > 0);

    if (userTeamId) {
      groups.sort((a, b) => {
        const aHasUser = a.teams.some((team) => team.id === userTeamId);
        const bHasUser = b.teams.some((team) => team.id === userTeamId);
        if (aHasUser && !bHasUser) return -1;
        if (!aHasUser && bHasUser) return 1;
        return 0;
      });
    }

    return groups;
  }, [teams, activeConfIdx, userTeamId, divNames]);

  return (
    <div className="app-screen-stack standings-center-screen">
      <ScreenHeader
        eyebrow="League"
        title="Standings Center"
        subtitle="Conference race tracker with division sorting and playoff-picture context."
        metadata={[
          { label: "Conference", value: activeConf },
          { label: "View", value: viewMode === "playoff" ? "Playoff Picture" : "Divisions" },
        ]}
      />
      {standingsContext?.label ? <StatusChip label={standingsContext.label} tone="info" /> : null}
      <HeroCard
        eyebrow="Race center"
        title={`${activeConf} standings`}
        subtitle="Switch conferences and compare division leaders against the playoff line."
        actions={
          <div className="standings-center-filter-row">
            {confNames.map((conference) => (
              <button
                type="button"
                key={conference}
                className={`btn btn-sm ${conference === activeConf ? "btn-primary" : ""}`}
                onClick={() => setActiveConf(conference)}
              >
                {conference}
              </button>
            ))}
            <button type="button" className={`btn btn-sm ${viewMode === "division" ? "btn-primary" : ""}`} onClick={() => setViewMode("division")}>Divisions</button>
            <button type="button" className={`btn btn-sm ${viewMode === "playoff" ? "btn-primary" : ""}`} onClick={() => setViewMode("playoff")}>Playoff Picture</button>
          </div>
        }
      />

      {viewMode === "playoff" ? (
        <SectionCard title={`${activeConf} playoff picture`} subtitle="Division winners and wild-card chase.">
          <PlayoffPictureView teams={teams} activeConf={activeConf} userTeamId={userTeamId} onTeamSelect={onTeamSelect} />
        </SectionCard>
      ) : (
        <>
          <SectionHeader eyebrow="Divisions" title="Conference table" subtitle="Tiebreakers: head-to-head, division record, then wins." />
          <div className="standings-center-division-grid">
            {grouped.map(({ div, teams: divisionTeams }) => (
              <SectionCard key={div} title={`${activeConf} ${div}`}>
                <div className="standings-center-table" role="table" aria-label={`${activeConf} ${div} standings`}>
                  {divisionTeams.map((team, idx) => {
                    const isUser = team.id === userTeamId;
                    const streak = computeStreak(team.recentResults ?? []);
                    return (
                      <button
                        type="button"
                        key={team.id}
                        className={`standings-center-row ${isUser ? "is-user" : ""}`}
                        onClick={() => onTeamSelect?.(team.id)}
                      >
                        <span>{idx + 1}</span>
                        <TeamLogo abbr={team.abbr} isUser={isUser} />
                        <div className="standings-center-row__team">
                          <strong>{team.name}</strong>
                          <span>{team.abbr}</span>
                        </div>
                        <span>{team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}</span>
                        <span>{winPct(team.wins, team.losses, team.ties)}</span>
                        <span>{team.ptsFor}/{team.ptsAgainst}</span>
                        <span>{streak ? `${streak.type}${streak.count}` : "—"}</span>
                        <OvrPill ovr={team.ovr} />
                        <span>{formatMoneyM(team.capRoom ?? team.capSpace)}</span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            ))}
          </div>
          {grouped.length === 0 ? <EmptyState title="No conference data" body={`No teams found for ${activeConf}.`} /> : null}
        </>
      )}
    </div>
  );
}
