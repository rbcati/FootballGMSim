import React, { useEffect } from "react";

export function PickGradeModal({ pick, grade, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!pick || !grade) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "pickGradeFadeIn 0.3s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          textAlign: "center",
          minWidth: 280,
          border: `2px solid ${grade.color}`,
          boxShadow: `0 0 40px ${grade.color}44`,
          animation: "pickGradeScale 0.4s ease-out",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: "var(--space-2)" }}>
          {grade.emoji}
        </div>
        <div
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 900,
            color: grade.color,
            marginBottom: "var(--space-2)",
            letterSpacing: "2px",
          }}
        >
          GRADE: {grade.grade}
        </div>
        <div
          style={{
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "var(--space-1)",
          }}
        >
          {pick.playerName}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          {pick.playerPos} · OVR {pick.playerOvr} · Pick #{pick.overall}
        </div>
      </div>
      <style>{`
        @keyframes pickGradeFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pickGradeScale { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
export default PickGradeModal;
