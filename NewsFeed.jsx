import React, { useState, useEffect, useMemo } from "react";
import { News, configureActiveLeague } from "../../db/index.js"; // Direct DB access for read-only view

// ── Clickable-text renderer ───────────────────────────────────────────────────
// Splits a news item's text into inert spans and clickable player/team spans.
// Because news text is plain strings we use the item's embedded id arrays when
// present; otherwise the text is rendered verbatim.
function RichNewsText({ item, onPlayerSelect, onTeamSelect }) {
  // The worker may attach playerRefs / teamRefs arrays to news items:
  //   playerRefs: [{ name, id }]
  //   teamRefs:   [{ name, id }]
  // When those are available we do a greedy token-split and wrap matches.
  const parts = useMemo(() => {
    const text = item.text ?? "";
    const playerRefs = item.playerRefs ?? [];
    const teamRefs   = item.teamRefs   ?? [];

    if (playerRefs.length === 0 && teamRefs.length === 0) {
      return [{ type: "text", value: text }];
    }

    // Build a map of name → { type, id }
    const nameMap = {};
    playerRefs.forEach(r => { nameMap[r.name] = { type: "player", id: r.id }; });
    teamRefs  .forEach(r => { nameMap[r.name] = { type: "team",   id: r.id }; });

    // Sort by descending name length to avoid partial matches
    const names = Object.keys(nameMap).sort((a, b) => b.length - a.length);
    if (names.length === 0) return [{ type: "text", value: text }];

    const pattern = new RegExp(
      "(" + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
      "g"
    );

    const result = [];
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) result.push({ type: "text", value: text.slice(last, match.index) });
      const info = nameMap[match[0]];
      result.push({ type: info.type, id: info.id, value: match[0] });
      last = match.index + match[0].length;
    }
    if (last < text.length) result.push({ type: "text", value: text.slice(last) });
    return result;
  }, [item]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "player" && onPlayerSelect) {
          return (
            <span
              key={i}
              onClick={() => onPlayerSelect(part.id)}
              style={{
                color: "var(--accent)",
                cursor: "pointer",
                textDecoration: "underline dotted",
                textUnderlineOffset: 2,
              }}
              title={`View ${part.value}'s profile`}
            >
              {part.value}
            </span>
          );
        }
        if (part.type === "team" && onTeamSelect) {
          return (
            <span
              key={i}
              onClick={() => onTeamSelect(part.id)}
              style={{
                color: "var(--warning)",
                cursor: "pointer",
                textDecoration: "underline dotted",
                textUnderlineOffset: 2,
              }}
              title={`View ${part.value} roster`}
            >
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

// ── News item row ─────────────────────────────────────────────────────────────

function NewsItem({ item, onPlayerSelect, onTeamSelect }) {
  let icon = "📰";

  if (item.type === "INJURY")          icon = "🚑";
  else if (item.type === "TRADE_PROPOSAL") icon = "🚨";
  else if (item.type === "FEAT" || item.type === "MILESTONE") icon = "⭐";
  else if (item.type === "NARRATIVE")  icon = "🎭";
  else if (item.type === "TRANSACTION") icon = "✍️";
  else if (item.type === "GAME")       icon = "🏈";
  else if (item.type === "AWARD")      icon = "🏆";

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--hairline)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span style={{ fontSize: "1.2em", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--text)" }}>
          <RichNewsText
            item={item}
            onPlayerSelect={onPlayerSelect}
            onTeamSelect={onTeamSelect}
          />
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
          Week {item.week}, {item.year}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewsFeed({ league, onPlayerSelect, onTeamSelect }) {
  const [news, setNews] = useState([]);

  useEffect(() => {
    if (league?.id) {
      configureActiveLeague(league.id);
      News.getRecent(10).then(setNews).catch(console.error);
    }
  }, []);

  // Condense repeated "Free Agency Day X Complete" entries into a single recap
  // row so the feed doesn't fill up with 5 identical-looking messages.
  const displayNews = useMemo(() => {
    const faPattern = /free agency day \d/i;
    const faItems = news.filter(n => faPattern.test(n.text ?? ""));
    if (faItems.length <= 1) return news;

    const firstFaIdx = news.findIndex(n => faPattern.test(n.text ?? ""));
    const condensed = {
      ...faItems[faItems.length - 1],
      text: `Free Agency Recap — ${faItems.length} days processed. ${faItems.length * 4}+ signings across the league.`,
    };
    return [
      ...news.slice(0, firstFaIdx),
      condensed,
      ...news.filter(n => !faPattern.test(n.text ?? "")),
    ];
  }, [news]);

  return (
    <div
      className="card"
      style={{ padding: "var(--space-4)", maxHeight: 300, overflowY: "auto" }}
    >
      <h3
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-muted)",
          marginBottom: "var(--space-3)",
          position: "sticky",
          top: 0,
          background: "var(--surface)",
          paddingBottom: 8,
        }}
      >
        League News
      </h3>
      {displayNews.length === 0 ? (
        <div
          style={{
            color: "var(--text-subtle)",
            fontStyle: "italic",
            textAlign: "center",
          }}
        >
          No recent news.
        </div>
      ) : (
        displayNews.map((item, i) => (
          <NewsItem
            key={i}
            item={item}
            onPlayerSelect={onPlayerSelect}
            onTeamSelect={onTeamSelect}
          />
        ))
      )}
    </div>
  );
}
