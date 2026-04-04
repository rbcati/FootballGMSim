import React, { useRef, useState } from "react";

const ADVISOR_TOPICS = [
  { key: "roster", label: "👥 Roster Advice" },
  { key: "trade", label: "🔄 Should I Trade?" },
  { key: "draft", label: "🎓 Draft Strategy" },
  { key: "cap", label: "💰 Cap Space" },
  { key: "gameplan", label: "🏈 This Week Gameplan" },
  { key: "rebuild", label: "🏗️ Rebuild vs Win Now" },
];

export default function GMAdvisor({ league }) {
  const [topic, setTopic] = useState(null);
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const responseRef = useRef(null);

  const userTeam = league?.teams?.find((t) => t.id === league?.userTeamId) ?? null;

  const buildContext = (selectedTopic) => {
    if (!userTeam) return "";

    const roster = Array.isArray(userTeam.roster) ? [...userTeam.roster] : [];
    const topPlayers = roster
      .sort((a, b) => (b?.ovr ?? 0) - (a?.ovr ?? 0))
      .slice(0, 15)
      .map((p) => `${p?.name ?? "Unknown"} (${p?.pos ?? p?.position ?? "?"}, OVR:${p?.ovr ?? 0}, Age:${p?.age ?? "?"})`)
      .join(", ");

    const onBlock = roster
      .filter((p) => p?.onTradeBlock)
      .map((p) => p?.name)
      .join(", ") || "None";

    const draftPicks = (userTeam.draftPicks ?? [])
      .map((p) => `${p?.round ?? "?"} Rd ${p?.season ?? "?"}`)
      .join(", ") || "None listed";

    return `
CURRENT GAME STATE:
- Team: ${userTeam.name ?? "Unknown"}
- Season: ${league?.year ?? "—"} | Week: ${league?.week ?? "—"}
- Record: ${userTeam.wins ?? 0}W - ${userTeam.losses ?? 0}L
- Cap Space: $${(userTeam.capRoom ?? 0).toFixed(1)}M
- Top 15 Roster: ${topPlayers || "Unavailable"}
- Players on Trade Block: ${onBlock}
- Draft Picks Owned: ${draftPicks}

USER QUESTION TOPIC: ${selectedTopic}

Give specific, actionable advice based on THIS team's actual situation.
Reference real player names and numbers from the roster above.
Be direct — this is a GM sim player who wants real strategy.
Keep response under 200 words. Use bullet points where helpful.
    `.trim();
  };

  const handleAsk = async (selectedTopic) => {
    setTopic(selectedTopic);
    setLoading(true);
    setAdvice("");
    setError("");

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY ?? "";

      if (!apiKey) {
        setError("GM Advisor not configured. Add VITE_GROQ_API_KEY to environment.");
        setLoading(false);
        return;
      }

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          max_tokens: 400,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: `You are an expert NFL General Manager advisor
          inside a football simulation game. Give specific,
          actionable advice. Reference real player names and stats
          from the context. Be direct and concise.
          Use bullet points. Max 150 words.`,
            },
            {
              role: "user",
              content: buildContext(selectedTopic),
            },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(`Advisor error: ${data?.error?.message ?? "Unknown error. Try again."}`);
        return;
      }

      const text = data?.choices?.[0]?.message?.content ?? "No advice returned.";
      setAdvice(text);
      requestAnimationFrame(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (_err) {
      setError("Advisor unavailable. Check connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gm-advisor">
      <div className="advisor-header">
        <h2>🤖 GM Advisor</h2>
        <p className="advisor-sub">AI-powered strategy for your franchise</p>
      </div>

      <div className="advisor-topics">
        {ADVISOR_TOPICS.map((t) => (
          <button
            key={t.key}
            className={`topic-btn ${topic === t.key ? "active" : ""}`}
            onClick={() => handleAsk(t.key)}
            disabled={loading || !userTeam}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="advisor-notice">⚡ Powered by Groq (free) · Responses may be rate limited</p>

      <div className="advisor-response" ref={responseRef}>
        {loading && (
          <div className="advisor-loading">
            <span className="pulse">Analyzing your roster...</span>
          </div>
        )}
        {error && <p className="advisor-error">{error}</p>}
        {advice && !loading && (
          <div className="advisor-advice">
            <p className="advice-topic">
              Re: {ADVISOR_TOPICS.find((t) => t.key === topic)?.label}
            </p>
            <div className="advice-body">
              {advice.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
        {!advice && !loading && !error && (
          <p className="advisor-prompt">
            {userTeam
              ? "Select a topic above to get personalized franchise advice."
              : "Load into a league to use GM Advisor."}
          </p>
        )}
      </div>
    </div>
  );
}
