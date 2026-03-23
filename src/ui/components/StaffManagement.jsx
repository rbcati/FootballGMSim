/**
 * StaffManagement.jsx — Unified staff management screen for Coaches, Scouts, and Medical Staff.
 * Extends the existing coaching system with scouting department and physio staff.
 * Generates staff data client-side using a seeded random based on league year.
 *
 * Props:
 *  - league: league view-model from worker
 *  - actions: worker action dispatchers
 */

import React, { useState, useMemo, useCallback } from "react";

// ── Seeded RNG ──────────────────────────────────────────────────────────────

function createRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 0x100000000);
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function randFloat(rng, min, max, decimals = 1) {
  return +(min + rng() * (max - min)).toFixed(decimals);
}

// ── Name pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "James", "Mike", "David", "Chris", "Steve", "Mark", "Tom", "Dan",
  "Rick", "Brian", "Tony", "Bill", "Greg", "Jeff", "Paul", "Scott",
  "Kevin", "Eric", "Jason", "Ryan", "Matt", "John", "Tim", "Rob",
  "Pete", "Frank", "Ray", "Ken", "Joe", "Ed", "Ben", "Sam",
];

const LAST_NAMES = [
  "Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore",
  "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin",
  "Thompson", "Robinson", "Clark", "Lewis", "Lee", "Walker", "Hall",
  "Allen", "Young", "King", "Wright", "Scott", "Green", "Baker",
  "Adams", "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner",
  "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart",
];

// ── Trait definitions ───────────────────────────────────────────────────────

const SCOUT_TRAITS = [
  {
    id: "eye_for_talent",
    name: "Eye for Talent",
    icon: "👁️",
    color: "#a855f7",
    bg: "rgba(168,85,247,0.12)",
    description: "More accurate prospect overall ratings. Draft board grades within ±2 of true value.",
  },
  {
    id: "combine_guru",
    name: "Combine Guru",
    icon: "🏋️",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    description: "Better athletic measurables analysis. Identifies combine risers/fallers earlier.",
  },
  {
    id: "interview_expert",
    name: "Interview Expert",
    icon: "🗣️",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    description: "Reveals character and leadership traits before the draft. Avoids bust personalities.",
  },
  {
    id: "film_junkie",
    name: "Film Junkie",
    icon: "🎬",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    description: "Uncovers hidden potential through game film. Reveals prospect potential earlier.",
  },
  {
    id: "regional_specialist",
    name: "Regional Specialist",
    icon: "🗺️",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    description: "Deep contacts in specific conference. Discovers small-school gems others miss.",
  },
];

const PHYSIO_TRAITS = [
  {
    id: "injury_prevention",
    name: "Injury Prevention",
    icon: "🛡️",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    description: "Reduces team injury rate by up to 15%. Proactive load management protocols.",
  },
  {
    id: "fast_recovery",
    name: "Fast Recovery",
    icon: "⚡",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    description: "Players return from injury 20% faster. Advanced rehabilitation techniques.",
  },
  {
    id: "conditioning_expert",
    name: "Conditioning Expert",
    icon: "💪",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    description: "Improved stamina and durability ratings. Players maintain peak performance longer.",
  },
  {
    id: "sports_science",
    name: "Sports Science",
    icon: "🔬",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    description: "Data-driven training optimization. Slows age-related decline by 1-2 seasons.",
  },
  {
    id: "rehab_specialist",
    name: "Rehab Specialist",
    icon: "🏥",
    color: "#a855f7",
    bg: "rgba(168,85,247,0.12)",
    description: "Players return from major injuries at higher capacity. Reduces re-injury risk.",
  },
];

const COACH_ROLES = ["Head Coach", "Offensive Coordinator", "Defensive Coordinator"];

const SCOUT_ROLES = [
  "Director of Scouting", "National Scout", "Area Scout",
  "Pro Scout", "College Scout",
];

const PHYSIO_ROLES = [
  "Head Athletic Trainer", "Physical Therapist", "Strength & Conditioning Coach",
  "Team Physician", "Recovery Specialist",
];

// ── Staff generator ─────────────────────────────────────────────────────────

function generateStaffPool(leagueYear, teamId) {
  const baseSeed = (leagueYear || 2024) * 10000 + (teamId || 0);

  function buildMember(rng, role, traitPool, idx) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const numTraits = randInt(rng, 1, 3);
    const shuffled = [...traitPool].sort(() => rng() - 0.5);
    const traits = shuffled.slice(0, numTraits);
    const rating = randInt(rng, 1, 5);
    const age = randInt(rng, 32, 65);
    const experience = randInt(rng, 1, Math.min(30, age - 25));
    const salary = randFloat(rng, 0.5, 3.5 + rating * 0.8, 1);
    const contractYears = randInt(rng, 1, 4);

    // Performance metrics seeded from rating + random variance
    const perfBase = rating * 18 + randInt(rng, -8, 8);
    const performance = Math.max(10, Math.min(99, perfBase));

    return {
      id: `staff_${role.replace(/\s+/g, "_").toLowerCase()}_${idx}_${baseSeed}`,
      name: `${firstName} ${lastName}`,
      role,
      age,
      experience,
      salary,
      contractYears,
      traits,
      rating,
      performance,
    };
  }

  // Current staff (hired)
  const rngCurrent = createRng(baseSeed);
  const coaches = COACH_ROLES.map((role, i) => buildMember(rngCurrent, role, [], i));
  const scouts = SCOUT_ROLES.slice(0, 3).map((role, i) => buildMember(rngCurrent, role, SCOUT_TRAITS, i));
  const medStaff = PHYSIO_ROLES.slice(0, 2).map((role, i) => buildMember(rngCurrent, role, PHYSIO_TRAITS, i));

  // Candidate pools
  const rngCand = createRng(baseSeed + 777);
  const scoutCandidates = SCOUT_ROLES.map((role, i) => buildMember(rngCand, role, SCOUT_TRAITS, i + 100));
  const physioCandidates = PHYSIO_ROLES.map((role, i) => buildMember(rngCand, role, PHYSIO_TRAITS, i + 200));

  return { coaches, scouts, medStaff, scoutCandidates, physioCandidates };
}

// ── Budget defaults ─────────────────────────────────────────────────────────

const STAFF_BUDGET_TOTAL = 25.0; // $25M staff budget

// ── Sub-components ──────────────────────────────────────────────────────────

function StarRating({ rating }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, fontSize: 14 }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{ color: i <= rating ? "#f59e0b" : "var(--hairline)", transition: "color 0.2s" }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function StaffTraitBadge({ trait }) {
  return (
    <span
      title={`${trait.name}\n${trait.description}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: trait.bg,
        color: trait.color,
        fontSize: "var(--text-xs, 11px)",
        fontWeight: 600,
        cursor: "help",
        whiteSpace: "nowrap",
        border: `1px solid ${trait.color}33`,
        transition: "transform 0.15s",
      }}
    >
      <span>{trait.icon}</span>
      {trait.name}
    </span>
  );
}

function PersonIcon({ name, accentColor }) {
  const initials = (name || "")
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: `${accentColor}18`,
        border: `2px solid ${accentColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 14,
        color: accentColor,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function PerformanceMeter({ value, label }) {
  const color = value >= 75 ? "var(--success, #22c55e)" : value >= 50 ? "var(--warning, #f59e0b)" : "var(--danger, #ef4444)";
  return (
    <div style={{ flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", marginBottom: 3, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        width: "100%",
        height: 6,
        borderRadius: 3,
        background: "var(--hairline, #333)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${value}%`,
          height: "100%",
          borderRadius: 3,
          background: color,
          transition: "width 0.6s ease",
        }} />
      </div>
      <div style={{ fontSize: "var(--text-xs, 11px)", fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function BudgetBar({ used, total }) {
  const pct = Math.min(100, (used / total) * 100);
  const remaining = Math.max(0, total - used);
  const barColor = pct > 90 ? "var(--danger, #ef4444)" : pct > 70 ? "var(--warning, #f59e0b)" : "var(--success, #22c55e)";

  return (
    <div
      className="card fade-in"
      style={{ padding: "var(--space-4, 16px)", marginBottom: "var(--space-4, 16px)" }}
    >
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--space-3, 12px)",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "var(--text-lg, 18px)" }}>Staff Budget</div>
          <div style={{ fontSize: "var(--text-sm, 13px)", color: "var(--text-muted)" }}>
            Separate from salary cap
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-4, 16px)", flexWrap: "wrap" }}>
          <div className="stat-box" style={{
            background: "var(--surface)",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm, 6px)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Used
            </div>
            <div style={{ fontWeight: 800, color: "var(--text)" }}>
              ${used.toFixed(1)}M
            </div>
          </div>
          <div className="stat-box" style={{
            background: "var(--surface)",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm, 6px)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Remaining
            </div>
            <div style={{ fontWeight: 800, color: remaining < 3 ? "var(--danger, #ef4444)" : "var(--success, #22c55e)" }}>
              ${remaining.toFixed(1)}M
            </div>
          </div>
          <div className="stat-box" style={{
            background: "var(--surface)",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm, 6px)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Total
            </div>
            <div style={{ fontWeight: 800, color: "var(--text)" }}>
              ${total.toFixed(1)}M
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: "100%",
        height: 10,
        borderRadius: 5,
        background: "var(--hairline, #333)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 5,
          background: barColor,
          transition: "width 0.6s ease",
        }} />
      </div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "var(--text-xs, 11px)",
        color: "var(--text-muted)",
        marginTop: 4,
      }}>
        <span>{pct.toFixed(0)}% allocated</span>
        <span>${total.toFixed(1)}M cap</span>
      </div>
    </div>
  );
}

function StaffCard({ member, accentColor, onFire, type }) {
  return (
    <div
      className="card fade-in"
      style={{
        padding: "var(--space-4, 16px)",
        borderLeft: `3px solid ${accentColor}`,
        transition: "box-shadow 0.2s",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", gap: "var(--space-3, 12px)", alignItems: "flex-start" }}>
        <PersonIcon name={member.name} accentColor={accentColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 4 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "var(--text-base, 15px)" }}>
                {member.name}
              </div>
              <div style={{ fontSize: "var(--text-sm, 13px)", color: "var(--text-muted)", marginTop: 1 }}>
                {member.role} · Age {member.age} · {member.experience}yr exp
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <StarRating rating={member.rating} />
              <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", marginTop: 1 }}>
                ${member.salary}M / {member.contractYears}yr
              </div>
            </div>
          </div>

          {/* Traits */}
          {member.traits && member.traits.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "var(--space-2, 8px)" }}>
              {member.traits.map(t => (
                <StaffTraitBadge key={t.id} trait={t} />
              ))}
            </div>
          )}

          {/* Performance */}
          <div style={{ display: "flex", gap: "var(--space-3, 12px)", marginTop: "var(--space-3, 12px)", flexWrap: "wrap" }}>
            <PerformanceMeter value={member.performance} label="Performance" />
            {type === "scout" && (
              <>
                <PerformanceMeter value={Math.min(99, member.performance + randInt(createRng(member.id?.length || 5), -10, 15))} label="Accuracy" />
                <PerformanceMeter value={Math.min(99, member.performance + randInt(createRng((member.id?.length || 5) + 1), -12, 10))} label="Network" />
              </>
            )}
            {type === "physio" && (
              <>
                <PerformanceMeter value={Math.min(99, member.performance + randInt(createRng(member.id?.length || 5), -10, 15))} label="Prevention" />
                <PerformanceMeter value={Math.min(99, member.performance + randInt(createRng((member.id?.length || 5) + 1), -12, 10))} label="Recovery" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fire button */}
      {onFire && (
        <div style={{ marginTop: "var(--space-3, 12px)", textAlign: "right" }}>
          <button
            className="btn"
            onClick={() => onFire(member)}
            style={{
              background: "transparent",
              color: "var(--danger, #ef4444)",
              border: "1px solid var(--danger, #ef4444)",
              fontSize: "var(--text-xs, 11px)",
              padding: "4px 12px",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Fire
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateRow({ candidate, accentColor, onHire, budgetRemaining }) {
  const canAfford = candidate.salary <= budgetRemaining;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3, 12px)",
        padding: "var(--space-3, 12px)",
        borderBottom: "1px solid var(--hairline, #333)",
        flexWrap: "wrap",
      }}
    >
      <PersonIcon name={candidate.name} accentColor={accentColor} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm, 13px)" }}>{candidate.name}</div>
        <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)" }}>
          {candidate.role} · Age {candidate.age} · {candidate.experience}yr exp
        </div>
        {candidate.traits && candidate.traits.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
            {candidate.traits.map(t => (
              <StaffTraitBadge key={t.id} trait={t} />
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <StarRating rating={candidate.rating} />
        <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", marginTop: 2 }}>
          ${candidate.salary}M / {candidate.contractYears}yr
        </div>
      </div>
      <button
        className="btn"
        disabled={!canAfford}
        onClick={() => onHire(candidate)}
        style={{
          background: canAfford ? "var(--accent)" : "var(--hairline, #333)",
          color: canAfford ? "#fff" : "var(--text-muted)",
          border: "none",
          fontSize: "var(--text-xs, 11px)",
          padding: "6px 14px",
          borderRadius: "var(--radius-sm, 6px)",
          cursor: canAfford ? "pointer" : "not-allowed",
          fontWeight: 700,
          flexShrink: 0,
          opacity: canAfford ? 1 : 0.5,
        }}
      >
        Hire
      </button>
    </div>
  );
}

function CollapsibleSection({ title, subtitle, count, accentColor, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <div style={{ marginBottom: "var(--space-4, 16px)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3, 12px) var(--space-4, 16px)",
          background: "var(--surface)",
          border: "1px solid var(--hairline, #333)",
          borderRadius: "var(--radius-sm, 6px)",
          cursor: "pointer",
          color: "var(--text)",
          transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3, 12px)" }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accentColor,
            flexShrink: 0,
          }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 800, fontSize: "var(--text-base, 15px)" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", marginTop: 1 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2, 8px)" }}>
          {count !== undefined && (
            <span className="ovr-pill" style={{
              background: `${accentColor}22`,
              color: accentColor,
              fontWeight: 700,
              fontSize: "var(--text-xs, 11px)",
              padding: "2px 8px",
              borderRadius: 999,
            }}>
              {count}
            </span>
          )}
          <span style={{
            fontSize: 16,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            lineHeight: 1,
          }}>
            ▼
          </span>
        </div>
      </button>

      {open && (
        <div className="fade-in" style={{ marginTop: "var(--space-3, 12px)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9200,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4, 16px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card fade-in"
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "var(--space-5, 20px)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: "var(--space-3, 12px)" }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: "var(--text-base, 15px)", marginBottom: "var(--space-4, 16px)" }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3, 12px)", justifyContent: "center" }}>
          <button
            className="btn"
            onClick={onCancel}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--hairline, #333)",
              padding: "8px 20px",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            style={{
              background: "var(--danger, #ef4444)",
              color: "#fff",
              border: "none",
              padding: "8px 20px",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function HiringPanel({ title, candidates, accentColor, onHire, budgetRemaining, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9100,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4, 16px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card fade-in"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div style={{
          padding: "var(--space-4, 16px)",
          borderBottom: "1px solid var(--hairline, #333)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "var(--text-lg, 18px)" }}>{title}</div>
            <div style={{ fontSize: "var(--text-xs, 11px)", color: "var(--text-muted)", marginTop: 2 }}>
              Budget remaining: ${budgetRemaining.toFixed(1)}M
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {candidates.length === 0 ? (
            <div style={{ padding: "var(--space-5, 20px)", textAlign: "center", color: "var(--text-muted)" }}>
              No candidates available.
            </div>
          ) : (
            candidates.map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                accentColor={accentColor}
                onHire={onHire}
                budgetRemaining={budgetRemaining}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function StaffManagement({ league, actions }) {
  const teamId = league?.userTeamId ?? 0;
  const leagueYear = league?.season ?? league?.year ?? 2024;

  const generated = useMemo(
    () => generateStaffPool(leagueYear, teamId),
    [leagueYear, teamId],
  );

  const [scouts, setScouts] = useState(generated.scouts);
  const [medStaff, setMedStaff] = useState(generated.medStaff);
  const [scoutCandidates, setScoutCandidates] = useState(generated.scoutCandidates);
  const [physioCandidates, setPhysioCandidates] = useState(generated.physioCandidates);
  const coaches = generated.coaches;

  const [hiringPanel, setHiringPanel] = useState(null); // "scouts" | "physios" | null
  const [fireTarget, setFireTarget] = useState(null);   // { member, type }

  // Budget calculation
  const totalUsed = useMemo(() => {
    const coachCost = coaches.reduce((s, c) => s + c.salary, 0);
    const scoutCost = scouts.reduce((s, c) => s + c.salary, 0);
    const medCost = medStaff.reduce((s, c) => s + c.salary, 0);
    return +(coachCost + scoutCost + medCost).toFixed(1);
  }, [coaches, scouts, medStaff]);

  const budgetRemaining = +(STAFF_BUDGET_TOTAL - totalUsed).toFixed(1);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleFire = useCallback((member, type) => {
    setFireTarget({ member, type });
  }, []);

  const confirmFire = useCallback(() => {
    if (!fireTarget) return;
    const { member, type } = fireTarget;

    if (type === "scout") {
      setScouts(prev => prev.filter(s => s.id !== member.id));
      setScoutCandidates(prev => [...prev, { ...member, id: member.id + "_rehire" }]);
    } else if (type === "physio") {
      setMedStaff(prev => prev.filter(s => s.id !== member.id));
      setPhysioCandidates(prev => [...prev, { ...member, id: member.id + "_rehire" }]);
    }

    setFireTarget(null);
  }, [fireTarget]);

  const handleHireScout = useCallback((candidate) => {
    if (candidate.salary > budgetRemaining) return;
    setScouts(prev => [...prev, candidate]);
    setScoutCandidates(prev => prev.filter(c => c.id !== candidate.id));
    setHiringPanel(null);
  }, [budgetRemaining]);

  const handleHirePhysio = useCallback((candidate) => {
    if (candidate.salary > budgetRemaining) return;
    setMedStaff(prev => [...prev, candidate]);
    setPhysioCandidates(prev => prev.filter(c => c.id !== candidate.id));
    setHiringPanel(null);
  }, [budgetRemaining]);

  // ── Render ────────────────────────────────────────────────────────────────

  const COLORS = {
    coach: "#f59e0b",
    scout: "#3b82f6",
    physio: "#22c55e",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "var(--space-4, 16px)" }}>Staff Management</h1>

      {/* Budget bar */}
      <BudgetBar used={totalUsed} total={STAFF_BUDGET_TOTAL} />

      {/* ── Coaching Staff ──────────────────────────────────────────── */}
      <CollapsibleSection
        title="Coaching Staff"
        subtitle="Head Coach, Offensive & Defensive Coordinators"
        count={coaches.length}
        accentColor={COLORS.coach}
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "var(--space-3, 12px)" }}>
          {coaches.map(c => (
            <StaffCard
              key={c.id}
              member={c}
              accentColor={COLORS.coach}
              type="coach"
            />
          ))}
          {coaches.length === 0 && (
            <div className="card padding-md text-muted" style={{ textAlign: "center" }}>
              No coaching staff hired.
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Scouting Department ─────────────────────────────────────── */}
      <CollapsibleSection
        title="Scouting Department"
        subtitle="Draft evaluation, prospect analysis, talent identification"
        count={scouts.length}
        accentColor={COLORS.scout}
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "var(--space-3, 12px)" }}>
          {scouts.map(s => (
            <StaffCard
              key={s.id}
              member={s}
              accentColor={COLORS.scout}
              onFire={(m) => handleFire(m, "scout")}
              type="scout"
            />
          ))}
          {scouts.length === 0 && (
            <div className="card padding-md text-muted" style={{ textAlign: "center" }}>
              No scouts on staff. Hire scouts to improve your draft evaluations.
            </div>
          )}
          <button
            className="btn"
            onClick={() => setHiringPanel("scouts")}
            style={{
              width: "100%",
              padding: "var(--space-3, 12px)",
              background: "var(--surface)",
              border: "1px dashed var(--accent)",
              borderRadius: "var(--radius-sm, 6px)",
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: "var(--text-sm, 13px)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Hire Scout
          </button>
        </div>
      </CollapsibleSection>

      {/* ── Medical Staff ──────────────────────────────────────────── */}
      <CollapsibleSection
        title="Medical Staff"
        subtitle="Injury prevention, rehabilitation, conditioning"
        count={medStaff.length}
        accentColor={COLORS.physio}
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "var(--space-3, 12px)" }}>
          {medStaff.map(p => (
            <StaffCard
              key={p.id}
              member={p}
              accentColor={COLORS.physio}
              onFire={(m) => handleFire(m, "physio")}
              type="physio"
            />
          ))}
          {medStaff.length === 0 && (
            <div className="card padding-md text-muted" style={{ textAlign: "center" }}>
              No medical staff on payroll. Hire physios to reduce injuries and speed recovery.
            </div>
          )}
          <button
            className="btn"
            onClick={() => setHiringPanel("physios")}
            style={{
              width: "100%",
              padding: "var(--space-3, 12px)",
              background: "var(--surface)",
              border: "1px dashed var(--accent)",
              borderRadius: "var(--radius-sm, 6px)",
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: "var(--text-sm, 13px)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Hire Medical Staff
          </button>
        </div>
      </CollapsibleSection>

      {/* ── Hiring Panel Modal ─────────────────────────────────────── */}
      {hiringPanel === "scouts" && (
        <HiringPanel
          title="Available Scouts"
          candidates={scoutCandidates}
          accentColor={COLORS.scout}
          onHire={handleHireScout}
          budgetRemaining={budgetRemaining}
          onClose={() => setHiringPanel(null)}
        />
      )}

      {hiringPanel === "physios" && (
        <HiringPanel
          title="Available Medical Staff"
          candidates={physioCandidates}
          accentColor={COLORS.physio}
          onHire={handleHirePhysio}
          budgetRemaining={budgetRemaining}
          onClose={() => setHiringPanel(null)}
        />
      )}

      {/* ── Fire Confirmation Dialog ───────────────────────────────── */}
      {fireTarget && (
        <ConfirmDialog
          message={`Are you sure you want to fire ${fireTarget.member.name} (${fireTarget.member.role})? Their $${fireTarget.member.salary}M salary will be freed up.`}
          onConfirm={confirmFire}
          onCancel={() => setFireTarget(null)}
        />
      )}
    </div>
  );
}
