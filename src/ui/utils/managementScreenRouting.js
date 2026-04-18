const TRANSACTION_VIEWS = new Set(["Finder", "Builder", "Offers", "Block", "Summary"]);
const ROSTER_VIEWS = new Set(["table", "cards", "depth"]);
const ROSTER_FILTERS = new Set(["ALL", "EXPIRING", "STARTERS", "DEPTH", "INJURED", "DEVELOPMENT"]);
const STAT_FAMILIES = new Set(["passing", "rushing", "receiving", "defense"]);
const LEAGUE_SECTIONS = new Set(["Overview", "Results", "Standings", "News", "Leaders"]);

export function normalizeManagementDestination(tabToken) {
  const normalized = {
    tab: tabToken,
    tradeView: null,
    rosterState: null,
    statsFamily: null,
    leagueSection: null,
  };
  if (typeof tabToken !== "string") return normalized;

  const [tab, rawState = ""] = tabToken.split(":");
  const state = rawState.trim();
  normalized.tab = tab;

  if (tab === "Transactions") {
    normalized.tab = "Transactions";
    const canonicalTradeView = [...TRANSACTION_VIEWS].find((v) => v.toLowerCase() === state.toLowerCase());
    normalized.tradeView = canonicalTradeView ?? "Finder";
    return normalized;
  }

  if (tab === "Roster") {
    normalized.tab = "Roster";
    const [viewTokenRaw, filterTokenRaw] = state.split("|");
    const viewToken = (viewTokenRaw ?? "").toLowerCase();
    const filterToken = (filterTokenRaw ?? "").toUpperCase();
    const view = [...ROSTER_VIEWS].find((v) => v.toLowerCase() === viewToken) ?? null;
    const filterFromView = (viewTokenRaw ?? "").toUpperCase();
    const filter = ROSTER_FILTERS.has(filterToken) ? filterToken : ROSTER_FILTERS.has(filterFromView) ? filterFromView : null;
    normalized.rosterState = { view: view ?? "table", filter: filter ?? "ALL" };
    return normalized;
  }

  if (tab === "Stats") {
    normalized.tab = "Stats";
    const family = [...STAT_FAMILIES].find((v) => v.toLowerCase() === state.toLowerCase());
    normalized.statsFamily = family ?? "passing";
    return normalized;
  }

  if (tab === "League") {
    normalized.tab = "League";
    const canonicalSection = [...LEAGUE_SECTIONS].find((v) => v.toLowerCase() === state.toLowerCase());
    normalized.leagueSection = canonicalSection ?? "Overview";
    return normalized;
  }

  return normalized;
}
