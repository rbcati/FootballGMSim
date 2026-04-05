import React, { useMemo, useState, useEffect } from "react";
import { evaluateOwnerMessageContext, ownerToneLabel } from "../utils/ownerMessages.js";

const STORAGE_PREFIX = "fgs.owner-messages.seen";

function toneClassName(tone) {
  switch (tone) {
    case "urgent_demand":
      return "owner-tone-urgent";
    case "disappointment":
      return "owner-tone-disappointment";
    case "warning":
      return "owner-tone-warning";
    case "cautious_encouragement":
      return "owner-tone-encouragement";
    default:
      return "owner-tone-neutral";
  }
}

function parseSeen(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

export default function OwnerMessagesCard({ league, userTeam, currentWeek, currentSeason }) {
  const context = useMemo(
    () => evaluateOwnerMessageContext({ league, userTeam, currentWeek, currentSeason }),
    [league, userTeam, currentWeek, currentSeason],
  );

  const storageKey = `${STORAGE_PREFIX}:${userTeam?.id ?? "unknown"}:${currentSeason ?? league?.year ?? 0}`;
  const [activeMessage, setActiveMessage] = useState(null);

  useEffect(() => {
    if (!context || typeof window === "undefined") {
      setActiveMessage(null);
      return;
    }

    const seen = parseSeen(storageKey);
    const hasSeen = seen.includes(context.key);

    if (!hasSeen) {
      const updated = [...seen, context.key].slice(-20);
      window.localStorage.setItem(storageKey, JSON.stringify(updated));
      setActiveMessage(context);
      return;
    }

    if (context.severity >= 90) {
      setActiveMessage(context);
      return;
    }

    setActiveMessage(null);
  }, [context, storageKey]);

  return (
    <div className="owner-message-card" aria-live="polite">
      <div className="owner-message-header">
        <h3>💼 Owner Message</h3>
        {activeMessage?.tone && (
          <span className={`owner-tone-badge ${toneClassName(activeMessage.tone)}`}>
            {ownerToneLabel(activeMessage.tone)}
          </span>
        )}
      </div>

      {activeMessage ? (
        <p className="owner-message-copy">“{activeMessage.message}”</p>
      ) : (
        <p className="owner-message-idle">No new owner directive this week. Stay on plan and keep results trending up.</p>
      )}
    </div>
  );
}
