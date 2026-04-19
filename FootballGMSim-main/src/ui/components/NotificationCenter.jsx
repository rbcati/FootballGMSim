/**
 * NotificationCenter.jsx — Bell-icon notification dropdown
 *
 * Shows in the header as a bell with a count badge.
 * Opens a panel listing all notifications aggregated from:
 *  - Worker NOTIFY messages (via state.notifications)
 *  - League events (injuries, contract offers, hot streaks, big plays)
 *
 * Props:
 *  - notifications: array of { id, message, level?, category?, timestamp? }
 *  - onDismiss(id): dismiss one notification
 *  - onDismissAll(): dismiss all notifications
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

const CATEGORY_META = {
  injury:   { icon: "🏥", color: "#FF453A" },
  trade:    { icon: "🔄", color: "#64D2FF" },
  signing:  { icon: "✍️",  color: "#FF9F0A" },
  draft:    { icon: "📋", color: "#BF5AF2" },
  award:    { icon: "🏆", color: "#FFD60A" },
  bigplay:  { icon: "⚡", color: "#34C759" },
  contract: { icon: "📄", color: "#0A84FF" },
  default:  { icon: "📣", color: "#9FB0C2" },
};

function getCategory(n) {
  if (n.category) return n.category;
  const msg = (n.message || "").toLowerCase();
  if (msg.includes("injur")) return "injury";
  if (msg.includes("trade")) return "trade";
  if (msg.includes("sign") || msg.includes("FA") || msg.includes("free agent")) return "signing";
  if (msg.includes("draft")) return "draft";
  if (msg.includes("award") || msg.includes("mvp")) return "award";
  if (msg.includes("touchdown") || msg.includes("big play")) return "bigplay";
  if (msg.includes("contract")) return "contract";
  return "default";
}

function NotifEntry({ n, onDismiss }) {
  const cat = getCategory(n);
  const meta = CATEGORY_META[cat] || CATEGORY_META.default;
  const levelColor = n.level === "warn" ? "#FF9F0A" : n.level === "error" ? "#FF453A" : meta.color;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: "transparent",
      transition: "background 0.15s",
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: "50%",
        background: `${levelColor}18`,
        border: `1px solid ${levelColor}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.85rem", flexShrink: 0,
      }}>
        {meta.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.4,
        }}>
          {n.message || n.text || "Notification"}
        </div>
        {n.timestamp && (
          <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginTop: 3 }}>
            {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <button
        onClick={() => onDismiss?.(n.id)}
        style={{
          background: "none", border: "none", color: "var(--text-subtle)",
          cursor: "pointer", fontSize: "0.85rem", padding: "0 2px",
          lineHeight: 1, flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function NotificationCenter({ notifications = [], onDismiss, onDismissAll }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const count = notifications.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const handleDismissAll = useCallback(() => {
    onDismissAll?.();
    setOpen(false);
  }, [onDismissAll]);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          position: "relative",
          width: 38, height: 38,
          border: `1px solid ${open ? "var(--accent)" : "var(--hairline)"}`,
          borderRadius: 10,
          background: open ? "var(--accent-muted, rgba(10,132,255,0.12))" : "var(--surface)",
          color: open ? "var(--accent)" : "var(--text-muted)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem",
          transition: "border-color 0.15s, background 0.15s",
        }}
        aria-label={`Notifications${count > 0 ? ` (${count})` : ""}`}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            background: "#FF453A", color: "#fff",
            borderRadius: "50%", minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.6rem", fontWeight: 900,
            padding: "0 3px",
            border: "1.5px solid var(--bg, #111)",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 320, maxWidth: "90vw",
            background: "var(--surface, #1e1e2e)",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 1000,
            overflow: "hidden",
            animation: "notifPanelIn 0.18s ease-out",
          }}
        >
          <style>{`
            @keyframes notifPanelIn {
              from { opacity: 0; transform: translateY(-8px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text)" }}>
              Notifications
              {count > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: "0.65rem", fontWeight: 900,
                  background: "#FF453A", color: "#fff",
                  borderRadius: 10, padding: "1px 6px",
                }}>
                  {count}
                </span>
              )}
            </div>
            {count > 0 && (
              <button
                onClick={handleDismissAll}
                style={{
                  background: "none", border: "none",
                  color: "var(--accent)", cursor: "pointer",
                  fontSize: "0.72rem", fontWeight: 700,
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {count === 0 ? (
              <div style={{
                textAlign: "center", padding: "32px 16px",
                color: "var(--text-muted)", fontSize: "0.82rem",
              }}>
                <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>🔕</div>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <NotifEntry
                  key={n.id}
                  n={n}
                  onDismiss={onDismiss}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
