import React, { useEffect, useMemo, useState } from "react";
import {
  CompactInsightCard,
  CompactListRow,
  HeroCard,
  ScreenHeader,
  SectionCard,
  SectionHeader,
  StatStrip,
  StatusChip,
  StickySubnav,
  EmptyState,
} from "./ScreenSystem.jsx";
import { CompactGameResultRow, CompletedGameCard, UpcomingGameCard } from "./common/GameResultCards.jsx";
import { getScheduleFiltersState, persistScheduleFiltersState } from "../utils/scheduleFiltersState.js";
import {
  derivePregameAngles,
  derivePostgameStory,
  deriveBoxScoreImmersion,
  deriveWeeklyHonors,
} from "../utils/gamePresentation.js";
import { buildCompletedGamePresentation, openResolvedBoxScore } from "../utils/boxScoreAccess.js";
import { resolveCompletedGameId } from "../utils/gameResultIdentity.js";
import { getGame as getArchivedGame } from "../../core/archive/gameArchive.ts";
import { getScheduleViewModel } from "../../state/selectors.js";

const VIEW_LABELS = {
  my_team: "My Team View",
  selected_team: "Selected Team View",
  all_week: "League View",
};

export function getScheduleBuckets(games = [], statusFilter = "all") {
  const completed = games.filter((game) => Boolean(game?.played));
  const upcoming = games.filter((game) => !Boolean(game?.played));
  if (statusFilter === "completed") {
    return [{ key: "completed", title: "Completed games", games: completed }];
  }
  if (statusFilter === "upcoming") {
    return [{ key: "upcoming", title: "Upcoming games", games: upcoming }];
  }
  return [
    { key: "upcoming", title: "Upcoming games", games: upcoming },
    { key: "completed", title: "Completed games", games: completed },
  ];
}

function resolveTeamGame(game, teamId) {
  const homeId = Number(game?.home?.id ?? game?.home);
  const awayId = Number(game?.away?.id ?? game?.away);
  return homeId === Number(teamId) || awayId === Number(teamId);
}

export function getFilteredScheduleGames({ games = [], viewMode = "my_team", userTeamId, selectedTeamId, scheduleModelGames = [] }) {
  if (viewMode === "my_team") return games.filter((game) => resolveTeamGame(game, userTeamId));
  if (viewMode === "selected_team") return games.filter((game) => resolveTeamGame(game, selectedTeamId));
  return scheduleModelGames;
}

export function getUpcomingGameOpenTarget(game) {
  return game?.id ?? game?.gameId ?? null;
}


export default function ScheduleCenter({
  schedule,
  teams = [],
  currentWeek,
  userTeamId,
  nextGameStakes,
  seasonId,
  onGameSelect,
  playoffSeeds,
  onTeamRoster,
  league,
  onPlayerSelect,
}) {
  const initialFilters = useMemo(() => getScheduleFiltersState({
    selectedWeek: Number(currentWeek ?? 1),
    viewMode: "my_team",
    selectedTeamId: Number(userTeamId ?? 0),
    statusFilter: "all",
  }), [currentWeek, userTeamId]);

  const [selectedWeek, setSelectedWeek] = useState(initialFilters.selectedWeek);
  const [viewMode, setViewMode] = useState(initialFilters.viewMode);
  const [selectedTeamId, setSelectedTeamId] = useState(initialFilters.selectedTeamId);
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);

  useEffect(() => {
    persistScheduleFiltersState({ selectedWeek, viewMode, selectedTeamId, statusFilter });
  }, [selectedWeek, viewMode, selectedTeamId, statusFilter]);

  const teamById = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      map[team.id] = team;
    });
    return map;
  }, [teams]);

  const seedByTeam = useMemo(() => {
    if (!playoffSeeds) return {};
    const map = {};
    for (const confSeeds of Object.values(playoffSeeds)) {
      for (const seed of confSeeds) {
        map[seed.teamId] = seed.seed;
      }
    }
    return map;
  }, [playoffSeeds]);

  if (!schedule?.weeks?.length) {
    return <EmptyState title="Schedule unavailable" body="Schedule data is not available for this save. Advance the season to regenerate." />;
  }

  const totalWeeks = schedule?.weeks?.length ?? 0;
  const weekData = schedule?.weeks?.find((week) => week.week === selectedWeek);
  const games = weekData?.games ?? [];
  const isPlayoffs = selectedWeek >= 19;
  const scheduleModel = getScheduleViewModel({ week: currentWeek, userTeamId, schedule }, {
    week: selectedWeek,
    teamId: selectedTeamId,
    mode: viewMode === "selected_team" || viewMode === "my_team" ? "team" : "league",
    status: statusFilter,
  });

  const filteredGames = getFilteredScheduleGames({
    games,
    viewMode,
    userTeamId,
    selectedTeamId,
    scheduleModelGames: scheduleModel.games,
  });

  const mergedVisibleGames = filteredGames.map((game) => {
    const gameId = resolveCompletedGameId(game, { seasonId, week: selectedWeek });
    const archived = game?.played ? getArchivedGame(gameId) : null;
    if (!archived) return game;
    return {
      ...game,
      gameId,
      homeScore: archived?.score?.home ?? game?.homeScore,
      awayScore: archived?.score?.away ?? game?.awayScore,
      homeAbbr: archived?.homeAbbr,
      awayAbbr: archived?.awayAbbr,
      teamStats: archived?.teamStats ?? game?.teamStats,
      playerStats: archived?.playerStats ?? game?.playerStats,
      scoringSummary: archived?.scoringSummary ?? game?.scoringSummary,
      recap: archived?.recapText ?? game?.recap,
      playLog: archived?.logs ?? game?.playLog,
      summary: archived?.summary ?? game?.summary,
    };
  });

  const weeklyHonors = useMemo(() => deriveWeeklyHonors(league), [league]);

  const weekRecapItems = useMemo(() => (
    games
      .filter((game) => game?.played)
      .map((game) => {
        const gameId = resolveCompletedGameId(game, { seasonId, week: selectedWeek });
        const archived = getArchivedGame(gameId);
        const gameWithArchive = archived ? {
          ...game,
          gameId,
          homeScore: archived?.score?.home ?? game?.homeScore,
          awayScore: archived?.score?.away ?? game?.awayScore,
          recap: archived?.recapText ?? game?.recap,
          teamStats: archived?.teamStats ?? game?.teamStats,
          playerStats: archived?.playerStats ?? game?.playerStats,
          scoringSummary: archived?.scoringSummary ?? game?.scoringSummary,
          playLog: archived?.logs ?? game?.playLog,
          summary: archived?.summary ?? game?.summary,
        } : game;
        const home = teamById[game.home] ?? { abbr: "HOME" };
        const away = teamById[game.away] ?? { abbr: "AWAY" };
        const presentation = buildCompletedGamePresentation(gameWithArchive, { seasonId, week: selectedWeek, teamById, source: "schedule_recap" });
        const story = derivePostgameStory({ league, game: gameWithArchive, week: selectedWeek });
        return { game: gameWithArchive, home, away, presentation, story };
      })
      .slice(0, 8)
  ), [games, league, seasonId, selectedWeek, teamById]);

  const scheduleSummary = {
    total: mergedVisibleGames.length,
    completed: mergedVisibleGames.filter((game) => Boolean(game?.played)).length,
    upcoming: mergedVisibleGames.filter((game) => !Boolean(game?.played)).length,
    myGames: mergedVisibleGames.filter((game) => resolveTeamGame(game, userTeamId)).length,
  };

  const sectionedVisibleGames = getScheduleBuckets(mergedVisibleGames, statusFilter);

  return (
    <div className="app-screen-stack schedule-center-screen">
      <ScreenHeader
        eyebrow="League"
        title="Schedule Center"
        subtitle="Weekly game slate with recap context, honors, and direct game-book access."
        metadata={[
          { label: "Week", value: selectedWeek },
          { label: "View", value: VIEW_LABELS[viewMode] ?? "League View" },
          { label: "Games", value: scheduleSummary.total },
        ]}
      />

      <HeroCard
        eyebrow={selectedWeek >= 19 ? "Postseason slate" : "Regular season slate"}
        title={`Week ${selectedWeek} Game Slate`}
        subtitle="Filter by lens, status, and team while preserving archive-aware results."
        rightMeta={<StatusChip label={VIEW_LABELS[viewMode] ?? "League View"} tone={viewMode === "my_team" ? "team" : "info"} />}
      >
        <StatStrip
          items={[
            { label: "Week slate", value: scheduleSummary.total },
            { label: "My games", value: scheduleSummary.myGames, tone: "info" },
            { label: "Upcoming", value: scheduleSummary.upcoming, tone: "warning" },
            { label: "Completed", value: scheduleSummary.completed, tone: "ok" },
          ]}
        />
      </HeroCard>

      <StickySubnav title="Filters">
        <div className="schedule-center-filter-row">
          <div className="schedule-center-status-row">
            {[
              ["completed", "Completed"],
              ["upcoming", "Upcoming"],
              ["all", "All"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm ${statusFilter === value ? "btn-primary" : ""}`}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)} aria-label="Schedule view mode">
            <option value="my_team">My team schedule</option>
            <option value="selected_team">Team filter</option>
            <option value="all_week">League view (week slate)</option>
          </select>
          <select value={selectedTeamId ?? ""} onChange={(event) => setSelectedTeamId(Number(event.target.value))} aria-label="Schedule team filter">
            {(teams ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className="schedule-center-week-row" role="tablist" aria-label="Week selector">
          {Array.from({ length: totalWeeks }, (_, index) => index + 1).map((week) => (
            <button
              key={week}
              type="button"
              role="tab"
              aria-selected={selectedWeek === week}
              className={`standings-tab${selectedWeek === week ? " active" : ""}`}
              onClick={() => setSelectedWeek(week)}
            >
              {week}
            </button>
          ))}
        </div>
      </StickySubnav>

      {weekRecapItems.length > 0 ? (
        <SectionCard
          title={`Week ${selectedWeek} recap`}
          subtitle="Scores and storylines at a glance"
          actions={<StatusChip label={`${weekRecapItems.length} featured`} tone="info" />}
        >
          {weekRecapItems.map(({ game, away, home, presentation, story }, index) => {
            const canViewResult = Boolean(presentation.resolvedGameId && onGameSelect);
            const recapActionLabel = presentation.canOpen ? "Open box score" : (canViewResult ? "View result" : "Unavailable");
            return (
              <CompactGameResultRow
                key={`${game.home}-${game.away}-${index}`}
                week={selectedWeek}
                away={away}
                home={home}
                game={game}
                actionLabel={recapActionLabel}
                note={`${story?.headline ?? "Final"} · ${presentation.statusLabel}`}
                disabled={!presentation.canOpen && !canViewResult}
                onOpen={() => {
                  if (presentation.canOpen) {
                    openResolvedBoxScore(game, { seasonId, week: selectedWeek, source: "schedule_recap" }, onGameSelect);
                  } else if (canViewResult) {
                    onGameSelect?.(String(presentation.resolvedGameId));
                  }
                }}
              />
            );
          })}
        </SectionCard>
      ) : null}

      {weeklyHonors?.week === selectedWeek ? (
        <SectionCard
          variant="warning"
          title="Week honors"
          subtitle="Broadcast desk notes"
          actions={<StatusChip label="Live context" tone="warning" />}
        >
          {weeklyHonors?.playerOfWeek ? (
            <CompactListRow
              title="Player of the Week"
              subtitle={`${weeklyHonors.playerOfWeek.name} (${weeklyHonors.playerOfWeek.pos ?? "—"})`}
              meta={weeklyHonors.playerOfWeek.line}
            >
              <button type="button" className="btn btn-sm" onClick={() => onPlayerSelect?.(weeklyHonors.playerOfWeek.playerId)}>Open player</button>
            </CompactListRow>
          ) : null}
          {weeklyHonors?.rookieOfWeek ? (
            <CompactListRow
              title="Top Rookie"
              subtitle={`${weeklyHonors.rookieOfWeek.name} (${weeklyHonors.rookieOfWeek.pos ?? "—"})`}
              meta={weeklyHonors.rookieOfWeek.line}
            >
              <button type="button" className="btn btn-sm" onClick={() => onPlayerSelect?.(weeklyHonors.rookieOfWeek.playerId)}>Open player</button>
            </CompactListRow>
          ) : null}
          {weeklyHonors?.statementWin ? (
            <CompactInsightCard title="Statement win" subtitle={weeklyHonors.statementWin.headline} tone="warning" />
          ) : null}
        </SectionCard>
      ) : null}

      <SectionHeader eyebrow="Slate" title="Games" subtitle="Grouped by status with archive-compatible open behavior." />
      <div className="schedule-center-bucket-grid">
        {sectionedVisibleGames.map((bucket) => (
          <SectionCard key={bucket.key} title={bucket.title}>
            {bucket.games.map((game, index) => {
              const home = teamById[game.home] ?? { name: `Team ${game.home}`, abbr: "???", wins: 0, losses: 0, ties: 0 };
              const away = teamById[game.away] ?? { name: `Team ${game.away}`, abbr: "???", wins: 0, losses: 0, ties: 0 };
              const isUserGame = home.id === userTeamId || away.id === userTeamId;
              const showStakes = isUserGame && !game.played && nextGameStakes > 50 && selectedWeek === currentWeek;
              const presentation = game.played ? buildCompletedGamePresentation(game, { seasonId, week: selectedWeek, teamById, source: "schedule_card" }) : null;
              const canOpenBoxScore = Boolean(presentation?.canOpen && onGameSelect);
              const canOpenResultOnly = Boolean(game.played && !presentation?.canOpen && presentation?.resolvedGameId && onGameSelect);
              const isClickable = canOpenBoxScore || canOpenResultOnly;
              const pregameAngles = !game.played ? derivePregameAngles({ league, game, week: selectedWeek }) : [];
              const postgame = game.played ? derivePostgameStory({ league, game, week: selectedWeek }) : null;
              const immersion = game.played ? deriveBoxScoreImmersion({ league, game, week: selectedWeek }) : null;
              const isTopWeekTeam = weeklyHonors?.teamOfWeekId != null
                && selectedWeek === weeklyHonors.week
                && (weeklyHonors.teamOfWeekId === away.id || weeklyHonors.teamOfWeekId === home.id);
              const majorResultTag = (() => {
                if (!postgame) return null;
                if (selectedWeek === 22 && league?.championTeamId != null) return "Super Bowl aftermath";
                if (selectedWeek === 21) return "Conference title clinched";
                if (selectedWeek >= 19 && postgame.tag === "Upset") return "Playoff upset";
                if (selectedWeek >= 17 && postgame.tag === "Upset") return "Playoff race shakeup";
                return null;
              })();
              const handleCardClick = () => {
                if (canOpenBoxScore) {
                  openResolvedBoxScore(game, { seasonId, week: selectedWeek, source: "schedule_card" }, onGameSelect);
                } else if (canOpenResultOnly) {
                  onGameSelect?.(String(presentation?.resolvedGameId));
                }
              };
              const upcomingGameId = getUpcomingGameOpenTarget(game);
              const canOpenGameDetail = !game.played && Boolean(upcomingGameId && onGameSelect);
              const sharedActions = (
                <>
                  <button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); onTeamRoster?.(away.id); }}>Away roster</button>
                  <button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); onTeamRoster?.(home.id); }}>Home roster</button>
                  {showStakes ? <StatusChip label={nextGameStakes > 80 ? "Rivalry" : "Stakes"} tone="warning" /> : null}
                  {isTopWeekTeam ? <StatusChip label="Team of Week" tone="info" /> : null}
                </>
              );

              return game.played ? (
                <CompletedGameCard
                  key={index}
                  week={selectedWeek}
                  away={{ ...away, abbr: `${isPlayoffs && seedByTeam[away.id] ? `(${seedByTeam[away.id]}) ` : ""}${away.abbr}` }}
                  home={{ ...home, abbr: `${home.abbr}${isPlayoffs && seedByTeam[home.id] ? ` (${seedByTeam[home.id]})` : ""}` }}
                  game={game}
                  isUserGame={isUserGame}
                  canOpenBoxScore={canOpenBoxScore}
                  canOpenResult={canOpenResultOnly}
                  statusLabel={presentation?.statusLabel}
                  archiveQuality={presentation?.archiveQuality ?? "missing"}
                  summary={postgame?.headline}
                  recap={postgame?.detail}
                  onOpen={isClickable ? handleCardClick : undefined}
                  secondaryActions={
                    <>
                      {majorResultTag ? <StatusChip label={majorResultTag} tone="warning" /> : null}
                      {immersion?.playerOfGame ? (
                        <StatusChip
                          label={`POG: ${immersion.playerOfGame.name}`}
                          tone="info"
                        />
                      ) : null}
                      {sharedActions}
                    </>
                  }
                />
              ) : (
                <UpcomingGameCard
                  key={index}
                  week={selectedWeek}
                  away={away}
                  home={home}
                  isUserGame={isUserGame}
                  canOpenGame={canOpenGameDetail}
                  onOpenGame={() => canOpenGameDetail && onGameSelect?.(upcomingGameId)}
                  angles={pregameAngles}
                  secondaryActions={sharedActions}
                />
              );
            })}
            {bucket.games.length === 0 ? (
              <EmptyState title="No games in this bucket" body={`No ${bucket.title.toLowerCase()} for week ${selectedWeek}.`} />
            ) : null}
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
